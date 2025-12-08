import json
import os
import time
import uuid
import threading
import psutil
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from concurrent.futures import ThreadPoolExecutor, Future
from src.utils.utils import custom_print

FILE = "task"


class TaskStatus:
    """Constants for task status values"""
    INITIALIZING = "initializing"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETE = "complete"
    ERROR = "error"
    CANCELLED = "cancelled"


@dataclass
class TaskModel:
    """Data model for a task"""
    id: str
    status: str
    message: Optional[str] = None
    timestamp: Optional[str] = None
    profile: Optional[str] = None
    profile_id: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[int] = 0
    files: Optional[List[str]] = None
    output_folder: Optional[str] = None
    end_time: Optional[str] = None
    error_details: Optional[str] = None
    form_data_for_processing: Optional[Dict[str, Any]] = None
    queue_position: Optional[int] = None

memory_coefficient = 0.375  # Memory coefficient in GB per thread for subtitle generation


class TaskManager:
    """
    Manager for task creation, storage, and retrieval with proper queue management.
    Each task is stored in its own JSON file inside its output folder.
    Uses ThreadPoolExecutor for controlled concurrency.
    """
    def __init__(self, output_dir: str, max_concurrent_tasks: int = None):
        """
        Initialize the task manager.
        
        Args:
            output_dir: Base directory for outputs
            max_concurrent_tasks: Maximum number of tasks that can run simultaneously.
                                If None, will auto-detect based on system resources.
        """
        self.tasks: Dict[str, Dict] = {}
        self.output_dir = output_dir
        self.max_concurrent_tasks = max_concurrent_tasks or self._auto_detect_max_tasks()
        
        # Thread pool for task execution
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent_tasks, thread_name_prefix="TaskWorker")
        
        # Track running futures and their task IDs
        self.running_futures: Dict[str, Future] = {}
        self.lock = threading.Lock()
        
        # Create output_dir if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Load all tasks from output directories
        self._load_tasks()
        
        custom_print(FILE, f"TaskManager initialized with max {max_concurrent_tasks} concurrent tasks")
    
    def get_queue_stats(self) -> Dict[str, Any]:
        """Get current queue statistics including memory information"""
        with self.lock:
            queued_count = sum(1 for task in self.tasks.values() if task.get("status") == TaskStatus.QUEUED)
            processing_count = sum(1 for task in self.tasks.values() if task.get("status") == TaskStatus.PROCESSING)
            
            # Calculate current memory usage
            current_threads = self._get_current_thread_load()
            
            # Get system memory info
            try:
                total_memory_gb = psutil.virtual_memory().total / (1024**3)
                available_memory_gb = psutil.virtual_memory().available / (1024**3)
                max_threads_by_memory = total_memory_gb / memory_coefficient
                memory_utilization = (current_threads / max_threads_by_memory) * 100 if max_threads_by_memory > 0 else 0
            except Exception:
                total_memory_gb = 0
                available_memory_gb = 0
                max_threads_by_memory = 0
                memory_utilization = 0
            
            return {
                "queued": queued_count,
                "processing": processing_count,
                "max_concurrent": self.max_concurrent_tasks,
                "available_slots": self.max_concurrent_tasks - processing_count,
                "current_threads": current_threads,
                "max_threads_by_memory": int(max_threads_by_memory),
                "memory_utilization_percent": round(memory_utilization, 1),
                "total_memory_gb": round(total_memory_gb, 1),
                "available_memory_gb": round(available_memory_gb, 1)
            }
    
    def _update_queue_positions(self):
        """Update queue positions for queued tasks"""
        queued_tasks = [
            (task_id, task) for task_id, task in self.tasks.items()
            if task.get("status") == TaskStatus.QUEUED
        ]
        
        # Sort by timestamp to maintain FIFO order
        queued_tasks.sort(key=lambda x: x[1].get("timestamp", ""))
        
        # Get current processing count for better queue messages
        processing_count = len(self.running_futures)
        available_slots = self.max_concurrent_tasks - processing_count
        
        for position, (task_id, task) in enumerate(queued_tasks, 1):
            if task.get("queue_position") != position:
                task["queue_position"] = position
                
                # Check if this task is blocked by memory constraints
                memory_available = self._check_memory_availability(task_id)
                
                # Create informative queue message based on position, slots, and memory
                if not memory_available:
                    req = self._calculate_memory_requirements(task_id)
                    # Check if this is a "too large" task (no other tasks running)
                    if processing_count == 0:
                        queue_message = f"Task too large for system memory - requires {req['threads']} threads for {req['files']} files. Consider reducing the number of files."
                        task["stage"] = f"Task too large for system memory - requires {req['threads']} threads for {req['files']} files"
                    else:
                        queue_message = f"Position {position} in queue (waiting for memory - needs {req['threads']} threads for {req['files']} files)"
                elif position == 1 and available_slots == 0:
                    queue_message = "Next in queue - will start when a slot becomes available"
                elif position <= available_slots:
                    queue_message = f"Starting soon (position {position} in queue)"
                else:
                    estimated_wait = position - available_slots
                    if estimated_wait == 1:
                        queue_message = f"Position {position} in queue (1 task ahead)"
                    else:
                        queue_message = f"Position {position} in queue ({estimated_wait} tasks ahead)"
                
                task["message"] = queue_message
                self._save_task(task_id)
    
    def _calculate_memory_requirements(self, task_id: str) -> Dict[str, float]:
        """
        Calculate memory requirements for a task based on the number of files.
        Each file creates 8 threads for subtitle generation.
        
        Args:
            task_id: ID of the task to calculate requirements for
            
        Returns:
            Dictionary with thread count and memory requirements in GB
        """
        task = self.tasks.get(task_id)
        if not task:
            return {"threads": 0, "memory_gb": 0}
            
        files = task.get("files", [])
        num_files = len(files) if files else 1  # At least 1 file assumed
        
        # Each file creates 8 threads for subtitle generation
        threads_per_file = 8
        total_threads = num_files * threads_per_file
        
        # Memory coefficient: 0.375 GB per thread
        
        required_memory_gb = total_threads * memory_coefficient
        
        return {
            "threads": total_threads,
            "memory_gb": required_memory_gb,
            "files": num_files
        }
    
    def _get_current_thread_load(self) -> int:
        """
        Calculate the current thread load from all processing tasks.
        
        Returns:
            Total number of threads currently being used
        """
        total_threads = 0
        
        for task_id, task in self.tasks.items():
            if task.get("status") == TaskStatus.PROCESSING:
                req = self._calculate_memory_requirements(task_id)
                total_threads += req["threads"]
        
        return total_threads
    
    def _check_memory_availability(self, task_id: str) -> bool:
        """
        Check if there's enough memory to process the task.
        
        Args:
            task_id: ID of the task to check
            
        Returns:
            True if task can be processed, False if insufficient memory
        """
        try:
            # Get system memory in GB
            available_memory_gb = psutil.virtual_memory().available / (1024**3)
            total_memory_gb = psutil.virtual_memory().total / (1024**3)
            
            # Calculate current thread load from processing tasks
            current_threads = self._get_current_thread_load()
            
            # Calculate requirements for the new task
            new_task_req = self._calculate_memory_requirements(task_id)
            new_threads = new_task_req["threads"]
            
            # Total threads if we add this task
            total_threads = current_threads + new_threads
            
            max_threads_by_memory = total_memory_gb / memory_coefficient
            
            custom_print(FILE, f"Memory check for task {task_id}:")
            custom_print(FILE, f"  Current threads: {current_threads}")
            custom_print(FILE, f"  New task threads: {new_threads} (files: {new_task_req['files']})")
            custom_print(FILE, f"  Total threads would be: {total_threads}")
            custom_print(FILE, f"  Max threads by memory: {max_threads_by_memory:.1f}")
            custom_print(FILE, f"  Available memory: {available_memory_gb:.2f} GB")
            custom_print(FILE, f"  Total memory: {total_memory_gb:.2f} GB")
            
            # Check if we can handle the additional load
            can_process = total_threads <= max_threads_by_memory
            
            if not can_process:
                custom_print(FILE, f"Task {task_id} rejected due to memory constraints")
                if current_threads > 0:
                    self.tasks[task_id]["stage"] = "Queued task"
                else:
                    self.tasks[task_id]["stage"] = f"Task too large"
                self.tasks[task_id]["message"] = f"Queued (insufficient memory - requires {new_threads} threads for {new_task_req['files']} files)"
                
            return can_process
            
        except Exception as e:
            custom_print(FILE, f"Error checking memory availability: {e}")
            # If we can't check memory, allow the task (fail-safe)
            return True
    
    def submit_task_for_execution(self, task_id: str, task_function, *args, **kwargs) -> bool:
        """
        Submit a task for execution through the thread pool with memory-aware queuing.
        
        Args:
            task_id: ID of the task
            task_function: Function to execute
            *args, **kwargs: Arguments for the task function
            
        Returns:
            True if submitted successfully, False if queue is full or task not found
        """
        with self.lock:
            if task_id not in self.tasks:
                return False
                
            # Check if we have available slots first
            processing_count = len(self.running_futures)
            
            # Check memory availability
            if not self._check_memory_availability(task_id):
                # Not enough memory - queue the task
                self.tasks[task_id]["status"] = TaskStatus.QUEUED
                
                # If no tasks are currently running, this means the single task is too large
                if processing_count == 0:
                    req = self._calculate_memory_requirements(task_id)
                    self.tasks[task_id]["message"] = f"Task too large for system memory - requires {req['threads']} threads for {req['files']} files. Consider reducing the number of files."
                    self.tasks[task_id]["stage"] = "Task too large for system memory"
                else:
                    self.tasks[task_id]["message"] = "Queued (insufficient memory for immediate processing)"
                    self.tasks[task_id]["stage"] = "Too many tasks in memory"
                
                self._update_queue_positions()
                self._save_task(task_id)
                return True
            
            if processing_count >= self.max_concurrent_tasks:
                # Set task to queued status
                self.tasks[task_id]["status"] = TaskStatus.QUEUED
                self.tasks[task_id]["message"] = f"Queued (position will be updated)"
                self._update_queue_positions()
                self._save_task(task_id)
                return True
            
            # Submit task immediately
            try:
                # Update task status to processing
                self.tasks[task_id]["status"] = TaskStatus.PROCESSING
                self.tasks[task_id]["message"] = "Starting processing..."
                if "queue_position" in self.tasks[task_id]:
                    del self.tasks[task_id]["queue_position"]
                self._save_task(task_id)
                
                # Submit to executor
                future = self.executor.submit(self._wrapped_task_execution, task_id, task_function, *args, **kwargs)
                self.running_futures[task_id] = future
                
                return True
            except Exception as e:
                custom_print(FILE, f"Error submitting task {task_id}: {e}")
                self.tasks[task_id]["status"] = TaskStatus.ERROR
                self.tasks[task_id]["message"] = f"Failed to start: {str(e)}"
                self._save_task(task_id)
                return False
    
    def _wrapped_task_execution(self, task_id: str, task_function, *args, **kwargs):
        """Wrapper for task execution that handles cleanup"""
        try:
            # Execute the actual task
            task_function(task_id, *args, **kwargs)
        finally:
            # Clean up and process queue
            with self.lock:
                if task_id in self.running_futures:
                    del self.running_futures[task_id]
                
                custom_print(FILE, f"Task {task_id} completed, checking queue for memory-constrained tasks...")
                
                # Check if we can start queued tasks (especially those waiting for memory)
                self._process_queue()
                
                # Also update queue positions to refresh memory availability messages
                self._update_queue_positions()
    
    def _process_queue(self):
        """Process queued tasks if slots are available and memory allows (must be called with lock held)"""
        available_slots = self.max_concurrent_tasks - len(self.running_futures)
        
        if available_slots <= 0:
            return
            
        # Get queued tasks sorted by timestamp
        queued_tasks = [
            (task_id, task) for task_id, task in self.tasks.items()
            if task.get("status") == TaskStatus.QUEUED
        ]
        
        if not queued_tasks:
            return
            
        queued_tasks.sort(key=lambda x: x[1].get("timestamp", ""))
        
        # Start tasks that fit both slot and memory constraints
        tasks_started = 0
        for i in range(min(available_slots, len(queued_tasks))):
            task_id, task = queued_tasks[i]
            
            # Check memory availability before starting this task
            if not self._check_memory_availability(task_id):
                custom_print(FILE, f"Task {task_id} cannot start yet due to memory constraints")
                # Update the task message to indicate memory constraint
                task["message"] = "Queued (waiting for sufficient memory)"
                self._save_task(task_id)
                continue
            
            try:
                # Import the task function (this is a bit hacky, but works for our use case)
                from main import _actual_process_task_logic
                
                # Update status to processing
                task["status"] = TaskStatus.PROCESSING
                task["message"] = "Starting processing..."
                if "queue_position" in task:
                    del task["queue_position"]
                self._save_task(task_id)
                
                # Submit to executor
                future = self.executor.submit(self._wrapped_task_execution, task_id, _actual_process_task_logic)
                self.running_futures[task_id] = future
                
                custom_print(FILE, f"Started queued task {task_id}")
                tasks_started += 1
                
                # Update available slots for next iteration
                available_slots -= 1
                if available_slots <= 0:
                    break
                
            except Exception as e:
                custom_print(FILE, f"Error starting queued task {task_id}: {e}")
                task["status"] = TaskStatus.ERROR
                task["message"] = f"Failed to start from queue: {str(e)}"
                self._save_task(task_id)
        
        # Update remaining queue positions
        self._update_queue_positions()
        
        if tasks_started > 0:
            custom_print(FILE, f"Started {tasks_started} queued tasks from memory-aware queue processing")
        elif queued_tasks:
            # Log why queued tasks couldn't start
            memory_blocked_count = 0
            for task_id, task in queued_tasks:
                if not self._check_memory_availability(task_id):
                    memory_blocked_count += 1
            
            if memory_blocked_count > 0:
                custom_print(FILE, f"{memory_blocked_count} queued tasks are waiting for memory to become available")
    
    def check_and_start_queued_tasks(self):
        """Public method to check and start queued tasks - can be called externally"""
        with self.lock:
            self._process_queue()

    def _load_tasks(self) -> None:
        """Discover and load tasks by scanning output folders"""
        self.tasks = {}
        
        # Skip if output directory doesn't exist
        if not os.path.exists(self.output_dir):
            return
            
        # Look through all folders in the output directory
        for folder_name in os.listdir(self.output_dir):
            folder_path = os.path.join(self.output_dir, folder_name)
            
            # Skip if not a directory
            if not os.path.isdir(folder_path):
                continue
                
            # Check for task_data.json in each folder
            task_file = os.path.join(folder_path, "task_data.json")
            if os.path.exists(task_file):
                try:
                    with open(task_file, 'r') as f:
                        task_data = json.load(f)
                        # Only add if it has an ID
                        if "id" in task_data:
                            task_id = task_data["id"]
                            self.tasks[task_id] = task_data
                except (json.JSONDecodeError, IOError) as e:
                    custom_print(FILE, f"Error loading task from {task_file}: {e}")
    
    def _save_task(self, task_id: str) -> None:
        """Save a task to its own file in its output folder"""
        if task_id not in self.tasks:
            return
            
        task_data = self.tasks[task_id]
        
        # Get the output folder for this task
        output_folder = task_data.get("output_folder")
        if not output_folder:
            # If the task doesn't have an output folder yet, we can't save it
            custom_print(FILE, f"Warning: Task {task_id} doesn't have an output_folder, can't save to file")
            return
            
        # Ensure the output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Create a clean version without large form data for saving
        task_copy = task_data.copy()
        if "form_data_for_processing" in task_copy:
            del task_copy["form_data_for_processing"]
            
        task_file = os.path.join(output_folder, "task_data.json")
        
        try:
            with open(task_file, 'w') as f:
                json.dump(task_copy, f, indent=2)
        except IOError as e:
            custom_print(FILE, f"Error saving task {task_id} to {task_file}: {e}")
            
    def _save_tasks(self) -> None:
        """Save all tasks to their individual files"""
        # Save each task to its own file
        for task_id in list(self.tasks.keys()):
            self._save_task(task_id)
    
    def create_task(
        self, 
        profile_id: str, 
        profile_name: str,
        task_id: str,
        files: List[str] = None, 
        form_data: dict = None,
        output_folder: str = None
    ) -> dict:
        """
        Create a new task with the given parameters.
        
        Args:
            profile_id: ID of the profile used for the task
            profile_name: Name of the profile for display
            files: List of files being processed
            form_data: Additional form data for processing
            task_id: Optional task ID (will be generated if not provided)
        
        Returns:
            Dictionary with the created task data
        """
        # Get current timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Create the task
        task_data = {
            "id": task_id,
            "status": TaskStatus.INITIALIZING,
            "message": "Initializing task...",
            "timestamp": timestamp,
            "profile": profile_name,
            "profile_id": profile_id,
            "files": files or [],
            "progress": 0,
            "stage": "Initializing",
            "output_folder": output_folder
        }
        
        # Add form_data if provided
        if form_data:
            task_data["form_data_for_processing"] = form_data
            
        # Store the task
        self.tasks[task_id] = task_data
        self._save_tasks()
        
        return task_data
    
    def get_task(self, task_id: str) -> Optional[Dict]:
        """
        Get a task by ID.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Task data dictionary or None if not found
        """
        if not self.tasks.get(task_id):
            # check files for task
            self._load_tasks()
            if not self.tasks.get(task_id):
                custom_print(FILE, f"Task {task_id} not found", error=True)
                custom_print(FILE, f"Available tasks: {list(self.tasks.keys())}", error=True)
                return None
        return self.tasks.get(task_id)
    
    def get_all_tasks(self) -> Dict[str, Dict]:
        """
        Get all tasks.
        
        Returns:
            Dictionary of task ID to task data
        """
        return self.tasks
    
    def update_task(self, task_id: str, update_data: Dict) -> Optional[Dict]:
        """
        Update a task with new data.
        
        Args:
            task_id: ID of the task
            update_data: Dictionary of fields to update
            
        Returns:
            Updated task data or None if not found
        """
        if task_id in self.tasks:
            # Update task data with new values
            self.tasks[task_id].update(update_data)
            
            # If status changing to complete, add end_time if not present
            if update_data.get("status") == TaskStatus.COMPLETE and "end_time" not in update_data:
                self.tasks[task_id]["end_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
            # Add task ID to updates for convenience
            self.tasks[task_id]["id"] = task_id
            
            # Save after update
            self._save_tasks()
            
            return self.tasks[task_id]
        return None
    def delete_task(self, task_id: str) -> bool:
        """
        Delete a task by ID and remove its JSON file.
        
        Args:
            task_id: ID of the task
            
        Returns:
            True if deleted, False if not found
        """
        if task_id in self.tasks:
            # Get output folder before deleting from memory
            output_folder = self.tasks[task_id].get("output_folder")
            
            # Delete from memory
            del self.tasks[task_id]
            
            # Delete the JSON file if it exists
            if output_folder and os.path.exists(output_folder):
                task_file = os.path.join(output_folder, "task_data.json")
                if os.path.exists(task_file):
                    try:
                        os.remove(task_file)
                        custom_print(FILE, f"Deleted task file: {task_file}")
                    except OSError as e:
                        custom_print(FILE, f"Error deleting task file {task_file}: {e}")
                        
            return True
        return False
    def cancel_task(self, task_id: str) -> Optional[Dict]:
        """
        Cancel a task by ID. Only active or queued tasks can be cancelled.
        For cancelled tasks, we delete them from the system entirely.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Updated task data or None if not found/not active
        """
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                
                # Only cancel if task is active or queued
                if task.get("status") in [TaskStatus.INITIALIZING, TaskStatus.PROCESSING, TaskStatus.QUEUED]:
                    # Cancel future if it's running
                    if task_id in self.running_futures:
                        future = self.running_futures[task_id]
                        future.cancel()  # This may not work if task is already running
                        del self.running_futures[task_id]
                    
                    # Instead of keeping cancelled tasks, delete them entirely
                    output_folder = task.get("output_folder")
                    
                    # Delete from memory first
                    del self.tasks[task_id]
                    
                    # Delete the JSON file if it exists
                    if output_folder and os.path.exists(output_folder):
                        task_file = os.path.join(output_folder, "task_data.json")
                        if os.path.exists(task_file):
                            try:
                                os.remove(task_file)
                                custom_print(FILE, f"Deleted cancelled task file: {task_file}")
                            except OSError as e:
                                custom_print(FILE, f"Error deleting cancelled task file {task_file}: {e}")
                    
                    # Process queue to start next task if needed
                    self._process_queue()
                    
                    # Return a dummy task object to indicate success
                    return {"id": task_id, "status": TaskStatus.CANCELLED, "message": "Cancelled and deleted"}
            return None
    def shutdown(self):
        """Shutdown the task manager and thread pool"""
        custom_print(FILE, "Shutting down TaskManager...")
        self.executor.shutdown(wait=True)
        custom_print(FILE, "TaskManager shutdown complete")

    def _auto_detect_max_tasks(self) -> int:
        """
        Auto-detect optimal number of concurrent tasks based on system resources.
        
        Returns:
            Optimal number of concurrent tasks
        """
        import psutil
        
        # Get system resources
        cpu_count = psutil.cpu_count(logical=True)
        memory_gb = psutil.virtual_memory().total / (1024**3)
        
        # Image generation
        # Each task typically uses:
        # - 1 CPU core for processing
        # - 1-2 GB RAM for image generation
        # - Moderate disk I/O
        
        # Adjusted estimation based on resources for image generation
        if memory_gb >= 32:
            # High-end system: can handle more tasks
            max_tasks = min(cpu_count, 12)
        elif memory_gb >= 16:
            # Mid-range system: higher concurrency
            max_tasks = min(cpu_count, 4)
        elif memory_gb >= 8:
            # Lower-end system: moderate concurrency
            max_tasks = min(cpu_count, 4)
        else:
            # Very limited system: minimal concurrency
            max_tasks = 2
        
        # Ensure at least 1 task can run
        max_tasks = max(1, max_tasks)
        
        return max_tasks
    
    def update_file_progress(self, task_id: str, file_name: str, status: str, progress: int = 0) -> Optional[Dict]:
        """
        Update progress for a specific file within a task.
        
        Args:
            task_id: ID of the task
            file_name: Name of the file being processed
            status: Status of the file processing
            progress: Progress percentage for this file
            
        Returns:
            Updated task data or None if not found
        """
        if task_id in self.tasks:
            # Initialize file_progress dict if it doesn't exist
            if "file_progress" not in self.tasks[task_id]:
                self.tasks[task_id]["file_progress"] = {}
            
            # Update file progress
            self.tasks[task_id]["file_progress"][file_name] = {
                "status": status,
                "progress": progress,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            # Calculate overall progress based on individual file progress
            file_progress_data = self.tasks[task_id]["file_progress"]
            if file_progress_data:
                total_files = len(file_progress_data)
                completed_files = sum(1 for fp in file_progress_data.values() if fp["status"] == "complete")
                overall_progress = (completed_files / total_files) * 100
                
                # Update overall task progress
                self.tasks[task_id]["progress"] = int(overall_progress)
            
            # Save after update
            self._save_task(task_id)
            
            return self.tasks[task_id]
        return None

    def get_file_progress(self, task_id: str) -> Dict[str, Dict]:
        """
        Get file progress for a specific task.
        
        Args:
            task_id: ID of the task
            
        Returns:
            Dictionary mapping file names to their progress data
        """
        if task_id in self.tasks:
            return self.tasks[task_id].get("file_progress", {})
        return {}