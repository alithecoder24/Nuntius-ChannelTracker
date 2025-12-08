import os
import json
from typing import List, Dict, Optional
from src.utils.models import Profile


def get_profiles(base_path: str) -> List[Dict]:
    """
    Get all profiles from the profiles directory.
    
    Args:
        base_path: Base path to the profiles directory
        
    Returns:
        List of profile dictionaries
    """
    profiles = []
    
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)
        return profiles
    
    profile_dirs = [d for d in os.listdir(base_path) 
                   if os.path.isdir(os.path.join(base_path, d)) and d.startswith('Profile_')]
    
    for profile_dir in profile_dirs:
        profile_path = os.path.join(base_path, profile_dir)
        config_path = os.path.join(profile_path, 'config.json')
        
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    profile_data = json.load(f)
                    profile = Profile.from_dict(profile_data)
                    
                    profiles.append({
                        'id': profile_dir,
                        'channel_name': profile.channel_name,
                        'selected_badges': profile.selected_badges,
                        'badge_style': profile.badge_style,
                        'voice': profile.voice,
                        'background_video': profile.background_video,
                        'music': profile.music,
                        'highlight_color': profile.highlight_color,
                        'animations_enabled': profile.animations_enabled,
                        'font': profile.font,
                        'video_length': profile.video_length,
                        'voice_model': profile.voice_model,
                        'profile_pic': f'/profiles/{profile_dir}/pfp.png'
                    })
            except Exception as e:
                print(f"Error loading profile {profile_dir}: {e}")
                continue
    
    profiles.sort(key=lambda p: int(p['id'].split('_')[1]))
    return profiles


def get_profile_by_id(base_path: str, profile_id: str) -> Optional[Dict]:
    """
    Get a single profile by ID.
    
    Args:
        base_path: Base path to the profiles directory
        profile_id: ID of the profile to retrieve
        
    Returns:
        Profile dictionary or None if not found
    """
    profile_path = os.path.join(base_path, profile_id)
    config_path = os.path.join(profile_path, 'config.json')
    
    if not os.path.exists(config_path):
        return None
    
    try:
        with open(config_path, 'r') as f:
            profile_data = json.load(f)
            profile = Profile.from_dict(profile_data)
            
            return {
                'id': profile_id,
                'channel_name': profile.channel_name,
                'selected_badges': profile.selected_badges,
                'badge_style': profile.badge_style,
                'voice': profile.voice,
                'background_video': profile.background_video,
                'music': profile.music,
                'highlight_color': profile.highlight_color,
                'animations_enabled': profile.animations_enabled,
                'font': profile.font,
                'video_length': profile.video_length,
                'voice_model': profile.voice_model
            }
    except Exception as e:
        print(f"Error loading profile {profile_id}: {e}")
        return None


def create_profile(base_path: str, profile_data: Dict) -> tuple[str, Dict]:
    """
    Create a new profile.
    
    Args:
        base_path: Base path to the profiles directory
        profile_data: Dictionary with profile information
        
    Returns:
        Tuple of (profile_id, profile_dict)
    """
    # Get next profile ID
    existing_profiles = [d for d in os.listdir(base_path) 
                        if os.path.isdir(os.path.join(base_path, d)) and d.startswith('Profile_')]
    
    next_id = 1
    if existing_profiles:
        profile_nums = [int(p.split('_')[1]) for p in existing_profiles if len(p.split('_')) > 1 and p.split('_')[1].isdigit()]
        if profile_nums:
            next_id = max(profile_nums) + 1
    
    profile_id = f"Profile_{next_id}"
    profile_path = os.path.join(base_path, profile_id)
    os.makedirs(profile_path, exist_ok=True)
    
    # Create Profile model
    profile = Profile(
        channel_name=profile_data.get('channel_name', ''),
        badge_style=profile_data.get('badge_style', 'blue'),
        voice=profile_data.get('voice', ''),
        background_video=profile_data.get('background_video', ''),
        selected_badges=profile_data.get('selected_badges', []),
        music=profile_data.get('music', 'none'),
        highlight_color=profile_data.get('highlight_color', '#ffffff'),
        animations_enabled=profile_data.get('animations_enabled', True),
        font=profile_data.get('font', 'montserrat'),
        video_length=int(profile_data.get('video_length', 0)),
        voice_model=profile_data.get('voice_model', 'default')
    )
    
    # Save to JSON
    config_data = {
        "channel_name": profile.channel_name,
        "selected_badges": profile.selected_badges,
        "badge_style": profile.badge_style,
        "font": profile.font,
        "music": profile.music,
        "highlight_color": profile.highlight_color,
        "animations_enabled": profile.animations_enabled,
        "video_length": profile.video_length,
        "voice_model": profile.voice_model
    }
    
    if profile.voice:
        config_data["voice"] = profile.voice
    if profile.background_video:
        config_data["background_video"] = profile.background_video
    
    with open(os.path.join(profile_path, 'config.json'), 'w') as f:
        json.dump(config_data, f, indent=2)
    
    return profile_id, config_data


def update_profile(base_path: str, profile_id: str, updates: Dict) -> Optional[Dict]:
    """
    Update an existing profile.
    
    Args:
        base_path: Base path to the profiles directory
        profile_id: ID of the profile to update
        updates: Dictionary with fields to update
        
    Returns:
        Updated profile dictionary or None if not found
    """
    profile_path = os.path.join(base_path, profile_id)
    config_path = os.path.join(profile_path, 'config.json')
    
    if not os.path.exists(config_path):
        return None
    
    try:
        with open(config_path, 'r') as f:
            profile_data = json.load(f)
        
        profile = Profile.from_dict(profile_data)
        
        # Update fields
        if 'channel_name' in updates:
            profile.channel_name = updates['channel_name']
        if 'selected_badges' in updates:
            profile.selected_badges = updates['selected_badges']
        if 'badge_style' in updates:
            profile.badge_style = updates['badge_style']
        if 'font' in updates:
            profile.font = updates['font']
        if 'voice' in updates:
            profile.voice = updates['voice']
        if 'background_video' in updates:
            profile.background_video = updates['background_video']
        if 'music' in updates:
            profile.music = updates['music']
        if 'highlight_color' in updates:
            profile.highlight_color = updates['highlight_color']
        if 'video_length' in updates:
            profile.video_length = int(updates['video_length'])
        if 'voice_model' in updates:
            profile.voice_model = updates['voice_model']
        if 'animations_enabled' in updates:
            profile.animations_enabled = updates['animations_enabled']
        
        # Save updated profile
        config_data = {
            "channel_name": profile.channel_name,
            "selected_badges": profile.selected_badges,
            "badge_style": profile.badge_style,
            "font": profile.font,
            "music": profile.music,
            "highlight_color": profile.highlight_color,
            "animations_enabled": profile.animations_enabled,
            "video_length": profile.video_length,
            "voice_model": profile.voice_model
        }
        
        if profile.voice:
            config_data["voice"] = profile.voice
        if profile.background_video:
            config_data["background_video"] = profile.background_video
        
        with open(config_path, 'w') as f:
            json.dump(config_data, f, indent=2)
        
        return config_data
        
    except Exception as e:
        print(f"Error updating profile {profile_id}: {e}")
        return None


def delete_profile(base_path: str, profile_id: str) -> bool:
    """
    Delete a profile.
    
    Args:
        base_path: Base path to the profiles directory
        profile_id: ID of the profile to delete
        
    Returns:
        True if deleted successfully, False otherwise
    """
    import shutil
    
    profile_path = os.path.join(base_path, profile_id)
    
    if not os.path.exists(profile_path):
        return False
    
    try:
        shutil.rmtree(profile_path)
        return True
    except Exception as e:
        print(f"Error deleting profile {profile_id}: {e}")
        return False
