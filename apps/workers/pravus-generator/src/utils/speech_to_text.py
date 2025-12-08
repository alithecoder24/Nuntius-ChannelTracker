import json
from typing import Dict
import torch
import threading
from faster_whisper import WhisperModel
from pycaps import Document, Segment, Line, Word, TimeFragment, Tag
from pycaps.pipeline import CapsPipeline

from src.utils.utils import custom_print, detect_nvidia_gpu

FILE = "speech_to_text"

if detect_nvidia_gpu():
    device = "cuda"
    compute_type = "float16"
    custom_print(FILE, f"🚀 NVIDIA GPU detected - using CUDA with FP16 for Whisper")
elif torch.cuda.is_available():
    device = "cuda"
    compute_type = "float16"
    custom_print(FILE, f"🚀 CUDA available - using GPU with FP16 for Whisper")
else:
    device = "cpu"
    compute_type = "int8"
    custom_print(FILE, f"No GPU detected - using CPU with INT8 for Whisper")

custom_print(FILE, f"Loading Whisper large-v3 model on {device} with {compute_type}...")

model = WhisperModel("large-v3", device=device, compute_type=compute_type)

custom_print(FILE, "Whisper large-v3 model loaded successfully")

from pycaps.transcriber import AudioTranscriber
import re

_transcription_lock = threading.Lock()


def extract_title_duration_from_document(document: Document, title: str) -> float:
    """
    Extract title duration from a Document by finding where the title ends.
    Uses character-level fuzzy matching to handle transcription errors.
    
    Args:
        document: The transcribed Document with word timings
        title: The title text to search for
        
    Returns:
        Duration of the title in seconds (end time of last word in title)
    """
    def normalize_for_matching(text):
        """Normalize text for fuzzy matching - remove punctuation, lowercase, collapse whitespace"""
        text = re.sub(r'[^\w\s]', '', text.lower())
        return ' '.join(text.split())
    
    # Get all words from the document
    all_words = []
    for segment in document.segments:
        for line in segment.lines:
            for word in line.words:
                all_words.append(word)
    
    if not all_words:
        custom_print(FILE, "No words found in document")
        return 0.0
    
    # Normalize title and build character sequence
    normalized_title = normalize_for_matching(title)
    title_chars = list(normalized_title.replace(' ', ''))
    
    if not title_chars:
        custom_print(FILE, "Title is empty after normalization")
        return 0.0
    
    # Build character sequence from transcribed words
    transcribed_chars = []
    word_char_mapping = []  # Maps char index to word object
    
    for word in all_words:
        normalized_word = normalize_for_matching(word.text)
        word_chars = list(normalized_word)
        for char in word_chars:
            transcribed_chars.append(char)
            word_char_mapping.append(word)
    
    if not transcribed_chars:
        custom_print(FILE, "No characters found in transcript")
        return 0.0
    
    custom_print(FILE, f"Title chars: {len(title_chars)}, Transcript chars: {len(transcribed_chars)}")
    custom_print(FILE, f"Title: '{normalized_title[:100]}...'")
    custom_print(FILE, f"Transcript start: '{''.join(transcribed_chars[:100])}...'")
    
    # Use dynamic programming to find best alignment (Levenshtein-like approach)
    # We want to find where the title ends in the transcript
    best_match_end = 0
    best_match_score = 0
    
    # We'll use a sliding window approach with fuzzy matching
    max_search_length = min(len(transcribed_chars), len(title_chars) * 3)
    
    for end_pos in range(len(title_chars) // 2, max_search_length + 1):
        # Compare title with transcript[0:end_pos]
        transcript_segment = transcribed_chars[:end_pos]
        
        # Calculate similarity using character overlap
        # Allow for insertions/deletions in transcript
        matched_chars = 0
        title_idx = 0
        transcript_idx = 0
        
        while title_idx < len(title_chars) and transcript_idx < len(transcript_segment):
            if title_chars[title_idx] == transcript_segment[transcript_idx]:
                matched_chars += 1
                title_idx += 1
                transcript_idx += 1
            else:
                # Try skipping in transcript (insertion in transcript)
                if transcript_idx + 1 < len(transcript_segment) and title_idx < len(title_chars):
                    if title_chars[title_idx] == transcript_segment[transcript_idx + 1]:
                        transcript_idx += 2
                        title_idx += 1
                        matched_chars += 0.5
                        continue
                
                # Try skipping in title (deletion in transcript)
                if title_idx + 1 < len(title_chars):
                    if title_chars[title_idx + 1] == transcript_segment[transcript_idx]:
                        title_idx += 2
                        transcript_idx += 1
                        matched_chars += 0.5
                        continue
                
                # No match, move both forward
                title_idx += 1
                transcript_idx += 1
        
        # Calculate match score (what percentage of title chars were matched)
        match_ratio = matched_chars / len(title_chars)
        coverage_ratio = title_idx / len(title_chars)
        
        # Penalize if we haven't covered enough of the title
        score = match_ratio * 0.7 + coverage_ratio * 0.3
        
        # Prefer matches that cover most/all of the title
        if coverage_ratio >= 0.8 and score > best_match_score:
            best_match_score = score
            best_match_end = end_pos
    
    # If we found a reasonable match, get the end time of the last word
    if best_match_score > 0.5 and best_match_end > 0:
        # Map character position back to word
        last_word = word_char_mapping[min(best_match_end - 1, len(word_char_mapping) - 1)]
        title_duration = last_word.time.end
        
        custom_print(FILE, f"Found title end at char {best_match_end}/{len(transcribed_chars)} "
                          f"(score: {best_match_score:.2f}, duration: {title_duration:.2f}s)")
        custom_print(FILE, f"Last word in title: '{last_word.text}' ending at {title_duration:.2f}s")
        
        return title_duration
    else:
        custom_print(FILE, f"Could not reliably match title (best score: {best_match_score:.2f}). "
                          f"Using fallback estimation.")
        
        # Fallback: estimate based on word count ratio
        title_word_count = len(normalized_title.split())
        if title_word_count > 0 and len(all_words) > 0:
            estimated_word_index = min(title_word_count, len(all_words) - 1)
            fallback_duration = all_words[estimated_word_index].time.end
            custom_print(FILE, f"Fallback: Using word {estimated_word_index} ending at {fallback_duration:.2f}s")
            return fallback_duration
        
        return 0.0
    


RAINBOW_INTRO_COLORS = [
    "#00FF00",
    "#00FFFF",
    "#FF00FF",
    "#FFF000",
]


def apply_rainbow_intro_tags(document: Document, title: str, title_duration: float, max_chars_per_line: int = 9) -> Document:
    """
    Apply rainbow color tags to words within the title duration.
    Only changes color when adding the next word would exceed max_chars_per_line.
    
    Args:
        document: The transcribed Document
        title: The title text
        title_duration: Duration of the title in seconds
        max_chars_per_line: Maximum characters per line (default 9 from config)
        
    Returns:
        Document with rainbow tags applied to title words
    """
    if title_duration <= 0:
        custom_print(FILE, "Title duration is 0, skipping rainbow intro tags")
        return document
    
    # Normalize text for comparison
    def normalize_text(text):
        text = re.sub(r'[^\w\s]', '', text.lower())
        return ' '.join(text.split())
    
    # Get title words
    normalized_title = normalize_text(title)
    title_words = normalized_title.split()
    
    if not title_words:
        custom_print(FILE, "No title words to tag")
        return document
    
    # Collect all words within title duration
    title_time_words = []
    for segment in document.segments:
        for line in segment.lines:
            for word in line.words:
                # Check if word is within title duration
                if word.time.start < title_duration:
                    title_time_words.append(word)
    
    if not title_time_words:
        custom_print(FILE, "No words found within title duration")
        return document
    
    # Add 'in-title' tag to all words within title duration
    for word in title_time_words:
        word.semantic_tags.add(Tag("in-title"))
    
    # Apply rainbow colors based on line grouping (max_chars_per_line)
    color_index = 0
    current_line_length = 0
    
    for i, word in enumerate(title_time_words):
        # Remove quotes and other punctuation for length calculation
        word_text_clean = re.sub(r'[^\w\s]', '', word.text)
        word_length = len(word_text_clean)
        
        # Check if adding this word would exceed the line limit
        if current_line_length > 0 and current_line_length + word_length > max_chars_per_line:
            # Move to next color
            color_index = (color_index + 1) % len(RAINBOW_INTRO_COLORS)
            current_line_length = 0
        
        # Apply the current color tag
        rainbow_tag = f"rainbow-word-{color_index}"
        word.semantic_tags.add(Tag(rainbow_tag))
        custom_print(FILE, f"Tagged '{word.text}' at {word.time.start:.2f}s with {rainbow_tag} (color {RAINBOW_INTRO_COLORS[color_index]}, line_length: {current_line_length})")
        
        # Update current line length
        current_line_length += word_length
    
    custom_print(FILE, f"Applied rainbow intro tags to {len(title_time_words)} words within {title_duration:.2f}s")
    
    return document


def apply_long_word_size_tags(document: Document) -> Document:
    """
    Apply size tags to long words based on character length.
    
    Args:
        document: The transcribed Document with words
        
    Returns:
        Document with size tags applied to long words
    """
    for segment in document.segments:
        for line in segment.lines:
            for word in line.words:
                word_length = len(word.text)
                
                if word_length >= 26:
                    word.semantic_tags.add(Tag("smallest"))
                    custom_print(FILE, f"Tagged '{word.text}' (length: {word_length}) with 'smallest'")
                elif word_length >= 22:
                    word.semantic_tags.add(Tag("smaller"))
                    custom_print(FILE, f"Tagged '{word.text}' (length: {word_length}) with 'smaller'")
                elif word_length >= 18:
                    word.semantic_tags.add(Tag("small"))
                    custom_print(FILE, f"Tagged '{word.text}' (length: {word_length}) with 'small'")
    
    return document


def apply_quotes_from_original_text(document: Document, original_text: str) -> Document:
    """
    Detects quoted sections in the original text and applies the 'quoted' semantic tag
    to corresponding words in the transcribed document. Also adds quote characters to
    the transcribed words if they're missing.
    
    Args:
        document: The transcribed Document with words
        original_text: The original text that was sent to TTS
        
    Returns:
        Document with 'quoted' tags applied to words inside quotes and quote characters added
    """
    # Normalize various quote characters in original text
    quote_chars = {'"', '"', '"', '„'}
    normalized_text = original_text
    for quote_char in quote_chars:
        if quote_char != '"':
            normalized_text = normalized_text.replace(quote_char, '"')
    
    # Find all quoted sections in the original text with their positions
    # Pattern matches text inside quotes, capturing the quotes and content separately
    quote_pattern = r'"([^"]*)"'
    quoted_sections = []
    
    for match in re.finditer(quote_pattern, normalized_text):
        quoted_text = match.group(1).strip()
        if quoted_text:
            quoted_sections.append(quoted_text)
    
    if not quoted_sections:
        custom_print(FILE, "No quoted sections found in original text")
        return document
    
    custom_print(FILE, f"Found {len(quoted_sections)} quoted sections: {quoted_sections}")
    
    # Normalize function for fuzzy matching
    def normalize_for_matching(text):
        # Remove punctuation, lowercase, and collapse whitespace
        text = re.sub(r'[^\w\s]', '', text.lower())
        return ' '.join(text.split())
    
    # Get all words from document
    all_words = []
    for segment in document.segments:
        for line in segment.lines:
            for word in line.words:
                all_words.append(word)
    
    if not all_words:
        return document
    
    # Build normalized version of the entire original text to find quote positions
    normalized_original = normalize_for_matching(original_text)
    original_words = normalized_original.split()
    
    # Build normalized version of transcribed text
    transcribed_words_normalized = [normalize_for_matching(w.text) for w in all_words]
    
    # For each quoted section, find matching words in the document
    for quoted_section in quoted_sections:
        normalized_quote = normalize_for_matching(quoted_section)
        quote_words = normalized_quote.split()
        
        if not quote_words:
            continue
        
        # Find where this quote appears in the original text
        quote_position_in_original = None
        for i in range(len(original_words) - len(quote_words) + 1):
            if original_words[i:i+len(quote_words)] == quote_words:
                quote_position_in_original = i
                break
        
        if quote_position_in_original is None:
            custom_print(FILE, f"Could not find quote position in original text: {quoted_section}")
            continue
        
        # Calculate relative position (where in the text does this quote appear, as a ratio)
        relative_position = quote_position_in_original / max(1, len(original_words))
        
        # Search in the transcribed text around the expected position
        expected_start = int(relative_position * len(all_words))
        
        # Try different starting positions, prioritizing positions near the expected location
        search_positions = []
        search_radius = len(all_words) // 2
        for offset in range(search_radius + 1):
            if expected_start + offset < len(all_words):
                search_positions.append(expected_start + offset)
            if offset > 0 and expected_start - offset >= 0:
                search_positions.append(expected_start - offset)
        
        best_match = None
        best_match_score = 0
        
        # Allow for some mismatches - scale tolerance with quote length
        max_mismatches = max(1, len(quote_words) // 10)
        
        for start_pos in search_positions:
            matched_count = 0
            match_positions = []
            consecutive_mismatches = 0
            
            for j, quote_word in enumerate(quote_words):
                if start_pos + j >= len(all_words):
                    break
                
                transcribed_word = transcribed_words_normalized[start_pos + j]
                
                # Check for match (exact or partial)
                is_match = (quote_word in transcribed_word or transcribed_word in quote_word or
                           (len(quote_word) >= 3 and len(transcribed_word) >= 3 and quote_word[:3] == transcribed_word[:3]))
                
                if is_match:
                    matched_count += 1
                    match_positions.append(start_pos + j)
                    consecutive_mismatches = 0
                else:
                    consecutive_mismatches += 1
                    # Only break if we have too many consecutive mismatches
                    if consecutive_mismatches > max_mismatches:
                        break
            
            # Calculate match score - require higher percentage for shorter quotes
            min_match_ratio = 0.7 if len(quote_words) < 5 else 0.5
            if matched_count >= len(quote_words) * min_match_ratio:
                distance_penalty = abs(start_pos - expected_start) / max(1, len(all_words))
                match_score = matched_count / len(quote_words) - distance_penalty * 0.2
                
                if match_score > best_match_score:
                    best_match_score = match_score
                    best_match = match_positions
        
        # Apply the best match found
        if best_match:
            # Add opening quote to first word if not present
            first_word = all_words[best_match[0]]
            if not first_word.text.startswith('"'):
                first_word.text = '"' + first_word.text
                custom_print(FILE, f"Added opening quote to '{first_word.text}'")
            
            # Add closing quote to last word if not present
            last_word = all_words[best_match[-1]]
            if not last_word.text.endswith('"'):
                last_word.text = last_word.text + '"'
                custom_print(FILE, f"Added closing quote to '{last_word.text}'")
            
            # Tag all matched words as quoted
            for pos in best_match:
                all_words[pos].semantic_tags.add(Tag("quoted"))
                custom_print(FILE, f"Tagged word '{all_words[pos].text}' as quoted")
        else:
            custom_print(FILE, f"Could not find match for quoted section: {quoted_section}")
    
    return document

class CustomTranscriber(AudioTranscriber):
    def __init__(self, saved_transcription: str = None):
        self.saved_transcription = saved_transcription

    def transcribe(self, audio_path: str) -> Document:
        """
        Transcribes the audio file and returns segments with timestamps.
        """
        if self.saved_transcription:
            with open(self.saved_transcription, "r") as f:
                return Document.from_dict(json.load(f))


def transcribe(audio_path: str, original_text: str, title: str = None) -> tuple[Document, float]:
    """
    Transcribes the audio file and returns segments with timestamps.
    
    Args:
        audio_path: Path to the audio file
        original_text: Original text that was sent to TTS
        title: Optional title text to extract duration for
        
    Returns:
        Tuple of (Document, title_duration)
    """
    with _transcription_lock:
        custom_print(FILE, f"Starting transcription for {audio_path} (waiting for lock if another transcription is running)")
        
        segments, info = model.transcribe(audio_path, beam_size=1, word_timestamps=True)
        segments = list(segments)
        custom_print(FILE, segments)
        
        custom_print(FILE, f"Detected language '{info.language}' with probability {info.language_probability}")

        document = Document()
        all_words_list = []
        
        for segment_info in segments:
            segment_start = float(segment_info.start)
            segment_end = float(segment_info.end)
            if segment_start == segment_end:
                segment_end = segment_start + 0.01
            segment_time = TimeFragment(start=segment_start, end=segment_end)
            segment = Segment(time=segment_time)
            line = Line(time=segment_time)
            segment.lines.add(line)

            if not hasattr(segment_info, 'words') or not segment_info.words:
                continue

            for word_entry in segment_info.words:
                word_text = str(word_entry.word).strip()
                if not word_text:
                    continue

                word_start = float(word_entry.start)
                word_end = float(word_entry.end)
                if word_start == word_end:
                    word_end = word_start + 0.01
                word_time = TimeFragment(start=word_start, end=word_end)
                word = Word(text=word_text, time=word_time)
                line.words.add(word)
                all_words_list.append(word)

            document.segments.add(segment)

        # Eliminate gaps between words by extending end times to meet next word's start time
        for i in range(len(all_words_list) - 1):
            current_word = all_words_list[i]
            next_word = all_words_list[i + 1]
            
            # If there's a gap between current word's end and next word's start
            if current_word.time.end < next_word.time.start:
                gap = next_word.time.start - current_word.time.end
                custom_print(FILE, f"Filling {gap:.3f}s gap between '{current_word.text}' and '{next_word.text}'")
                # Extend current word's end time to meet next word's start
                current_word.time.end = next_word.time.start

        # Apply quotes from original text
        document = apply_quotes_from_original_text(document, original_text)

        # Apply size tags to long words
        document = apply_long_word_size_tags(document)

        # Extract title duration if title is provided
        title_duration = 0.0
        if title:
            title_duration = extract_title_duration_from_document(document, title)
            # Apply rainbow intro tags to words within title duration
            document = apply_rainbow_intro_tags(document, title, title_duration)

        with open(audio_path.replace(".mp3", ".json"), "w") as f:
            json.dump(document.to_dict(), f)
        
        custom_print(FILE, f"Completed transcription for {audio_path}")
        return document, title_duration

def parse_elevenlabs_timing_data(original_text: str, audio_path: str, timing_data: Dict, title: str = None) -> tuple[Document, float]:
    """
    Parses ElevenLabs timing data and returns a Document with aligned words.
    
    Args:
        original_text: Original text that was sent to TTS
        audio_path: Path to the audio file
        timing_data: Timing data from ElevenLabs
        title: Optional title text to extract duration for
        
    Returns:
        Tuple of (Document, title_duration)
    """
    document = Document()
    custom_print(FILE, "Parsing ElevenLabs timing data.")
    
    if not timing_data:
        custom_print(FILE, "No timing data provided.")
        return document, 0.0
    
    # Extract alignment data from the timing_data dictionary
    alignment = timing_data.get('alignment')
    
    if not alignment:
        custom_print(FILE, "No alignment data found in timing_data.")
        return document, 0.0
    
    characters = alignment.get('characters', [])
    char_start_times = alignment.get('character_start_times_seconds', [])
    char_end_times = alignment.get('character_end_times_seconds', [])
    
    if not characters or not char_start_times or not char_end_times:
        custom_print(FILE, "Incomplete alignment data found in timing_data.")
        return document, 0.0
    
    # Build words from characters
    words = []
    current_word = ""
    word_start = None
    
    for i, char in enumerate(characters):
        if char.strip():  # Non-whitespace character
            if not current_word:
                word_start = char_start_times[i]
            current_word += char
        else:  # Whitespace - end of word
            if current_word:
                word_end = char_end_times[i - 1]
                if word_start == word_end:
                    word_end = word_start + 0.01
                words.append((current_word, word_start, word_end))
                current_word = ""
                word_start = None
    
    # Don't forget the last word if it doesn't end with whitespace
    if current_word:
        word_end = char_end_times[-1]
        if word_start == word_end:
            word_end = word_start + 0.01
        words.append((current_word, word_start, word_end))
    
    if not words:
        custom_print(FILE, "No words found in alignment data.")
        return document, 0.0
    
    # Create a single segment containing all words in one line
    segment_start = words[0][1]
    segment_end = words[-1][2]
    if segment_start == segment_end:
        segment_end = segment_start + 0.01
    segment_time = TimeFragment(start=segment_start, end=segment_end)
    segment = Segment(time=segment_time)
    line = Line(time=segment_time)
    segment.lines.add(line)
    
    # Add all words to the line
    for word_text, word_start, word_end in words:
        word_time = TimeFragment(start=word_start, end=word_end)
        word = Word(text=word_text, time=word_time)
        line.words.add(word)
    
    document.segments.add(segment)
    
    # Apply quotes from original text using the reusable function
    document = apply_quotes_from_original_text(document, original_text)
    
    # Apply size tags to long words
    document = apply_long_word_size_tags(document)
    
    # Extract title duration if title is provided
    title_duration = 0.0
    if title:
        title_duration = extract_title_duration_from_document(document, title)
        # Apply rainbow intro tags to words within title duration
        document = apply_rainbow_intro_tags(document, title, title_duration)
    
    # Save to JSON file
    custom_print(FILE, "Saving transcription to JSON file.")
    json_path = audio_path.replace(".mp3", ".json")
    with open(json_path, "w") as f:
        json.dump(document.to_dict(), f, indent=2)
    
    custom_print(FILE, f"Transcription saved to {json_path}")
    custom_print(FILE, f"Parsed {len(words)} words into document")
    
    return document, title_duration