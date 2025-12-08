"""
Text utilities for RTL support and font handling.
Shared functions for both captions and card generation.
"""

import os
import unicodedata
from typing import Dict, Set, Optional, List
from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display
import docx

from src.utils.utils import custom_print

FILE = "text-utils"

# Unicode script ranges for non-Latin scripts that typically need fallback fonts
NON_LATIN_SCRIPT_RANGES = {
    # RTL Scripts
    'Arabic': [(0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), 
               (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    'Hebrew': [(0x0590, 0x05FF), (0xFB1D, 0xFB4F)],
    
    # CJK Scripts
    'Chinese': [(0x4E00, 0x9FFF), (0x3400, 0x4DBF), (0x20000, 0x2A6DF)],
    'Japanese_Hiragana': [(0x3040, 0x309F)],
    'Japanese_Katakana': [(0x30A0, 0x30FF)],
    'Korean': [(0xAC00, 0xD7AF), (0x1100, 0x11FF), (0x3130, 0x318F)],
    
    # Other Scripts
    'Cyrillic': [(0x0400, 0x04FF), (0x0500, 0x052F)],
    'Thai': [(0x0E00, 0x0E7F)],
    'Devanagari': [(0x0900, 0x097F)],
    'Bengali': [(0x0980, 0x09FF)],
    'Tamil': [(0x0B80, 0x0BFF)],
    'Telugu': [(0x0C00, 0x0C7F)],
    'Kannada': [(0x0C80, 0x0CFF)],
    'Malayalam': [(0x0D00, 0x0D7F)],
    'Gujarati': [(0x0A80, 0x0AFF)],
    'Punjabi': [(0x0A00, 0x0A7F)],
    'Myanmar': [(0x1000, 0x109F)],
    'Khmer': [(0x1780, 0x17FF)],
    'Lao': [(0x0E80, 0x0EFF)],
    'Georgian': [(0x10A0, 0x10FF)],
    'Armenian': [(0x0530, 0x058F)],
    'Ethiopic': [(0x1200, 0x137F), (0x1380, 0x139F)],
    'Syriac': [(0x0700, 0x074F)],
    'Tibetan': [(0x0F00, 0x0FFF)],
    'Sinhala': [(0x0D80, 0x0DFF)],
}

# RTL script ranges for directional detection
RTL_SCRIPT_RANGES = {
    'Arabic': [(0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), 
               (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    'Hebrew': [(0x0590, 0x05FF), (0xFB1D, 0xFB4F)],
}


def get_char_script_info(char: str) -> Dict[str, any]:
    """
    Get comprehensive script information for a character using Unicode categories.
    
    Args:
        char: Single character to analyze
        
    Returns:
        Dictionary with script information
    """
    char_code = ord(char)
    
    # Check against our known script ranges
    for script_name, ranges in NON_LATIN_SCRIPT_RANGES.items():
        for start, end in ranges:
            if start <= char_code <= end:
                return {
                    'script': script_name,
                    'needs_fallback': True,
                    'is_rtl': script_name in ['Arabic', 'Hebrew'],
                    'unicode_category': unicodedata.category(char),
                    'unicode_name': unicodedata.name(char, 'UNKNOWN')
                }
    
    # For Latin and other common scripts
    return {
        'script': 'Latin_or_Common',
        'needs_fallback': False,
        'is_rtl': False,
        'unicode_category': unicodedata.category(char),
        'unicode_name': unicodedata.name(char, 'UNKNOWN')
    }


def needs_fallback_font(text: str) -> bool:
    """
    Determine if text needs fallback font based on Unicode script analysis.
    
    Args:
        text: Text to analyze
        
    Returns:
        True if fallback font is needed, False otherwise
    """
    if not text:
        return False
        
    # Count characters that need fallback fonts
    total_chars = 0
    fallback_chars = 0
    
    for char in text:
        if char.isalpha():  # Only count alphabetic characters
            total_chars += 1
            char_info = get_char_script_info(char)
            if char_info['needs_fallback']:
                fallback_chars += 1
    
    # Use fallback if any non-Latin script characters are present
    return fallback_chars > 0


def is_rtl_text(text: str) -> bool:
    """
    Determine if text contains RTL characters and should be rendered right-to-left.
    
    Args:
        text: Text to analyze
        
    Returns:
        True if text is predominantly RTL, False otherwise
    """
    if not text:
        return False
        
    rtl_chars = 0
    total_chars = 0
    
    for char in text:
        if char.isalpha():  # Only count alphabetic characters
            total_chars += 1
            char_info = get_char_script_info(char)
            if char_info['is_rtl']:
                rtl_chars += 1
    
    # Consider text RTL if more than 50% of alphabetic characters are RTL
    return total_chars > 0 and (rtl_chars / total_chars) > 0.5


def process_bidi_text(text: str) -> str:
    """
    Process bidirectional text using the Unicode Bidirectional Algorithm with Arabic shaping.
    
    Args:
        text: Text that may contain mixed LTR and RTL content
        
    Returns:
        Text with proper bidirectional ordering and Arabic letter shaping for display
    """
    if not text:
        return text
        
    try:
        # Use python-bidi to process the text with Arabic reshaping enabled
        # The arabic_reshaper parameter ensures Arabic letters connect properly
        from bidi.algorithm import get_display
        import arabic_reshaper
        
        # First reshape Arabic text to connect letters properly
        reshaped_text = arabic_reshaper.reshape(text)
        
        # Then apply bidirectional algorithm for proper ordering
        return get_display(reshaped_text)
    except ImportError:
        # If arabic_reshaper is not available, fall back to basic bidi processing
        try:
            return get_display(text)
        except Exception:
            return text
    except Exception:
        # Fallback to original text if processing fails
        return text


def can_font_render_text(font: ImageFont.ImageFont, text: str) -> bool:
    """
    Check if a font can render all characters in the given text.
    Uses Unicode script analysis for more accurate detection.
    
    Args:
        font: The font to test
        text: The text to check
        
    Returns:
        True if font can render all characters, False otherwise
    """
    if not text:
        return True
        
    try:
        # Create a temporary image to test text rendering
        temp_img = Image.new('RGB', (100, 100), 'white')
        temp_draw = ImageDraw.Draw(temp_img)
        
        # Try to get text dimensions - this will fail or return weird values
        # if the font doesn't support the characters
        bbox = temp_draw.textbbox((0, 0), text, font=font)
        
        # Check if any characters need fallback font support
        if needs_fallback_font(text):
            return False
            
        # Additional validation: check if bbox is reasonable
        if bbox and len(bbox) >= 4:
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            # If dimensions are unreasonably small for the text length, font might not support it
            if len(text) > 5 and (width < 10 or height < 10):
                return False
        
        return True
        
    except Exception:
        return False


def get_appropriate_font(text: str, primary_font: ImageFont.ImageFont, 
                        fallback_font: ImageFont.ImageFont, font_type: str = "unknown") -> ImageFont.ImageFont:
    """
    Get the appropriate font for the given text, falling back if necessary.
    
    Args:
        text: The text to be rendered
        primary_font: Primary font to try first
        fallback_font: Fallback font to use if primary can't render text
        font_type: Description of font type for logging (e.g., "bold", "regular")
        
    Returns:
        The appropriate font (primary or fallback)
    """
    if can_font_render_text(primary_font, text):
        return primary_font
    else:
        # Could add logging here if needed
        # print(f"Using fallback font for {font_type} text with special characters: {text[:50]}...")
        return fallback_font


def analyze_text_properties(text: str) -> Dict[str, any]:
    """
    Comprehensive text analysis for debugging and optimization.
    
    Args:
        text: Text to analyze
        
    Returns:
        Dictionary with detailed text properties
    """
    if not text:
        return {'empty': True}
        
    # Count different character types
    script_counts = {}
    total_chars = len(text)
    alphabetic_chars = 0
    rtl_chars = 0
    
    for char in text:
        char_info = get_char_script_info(char)
        script = char_info['script']
        
        if script not in script_counts:
            script_counts[script] = 0
        script_counts[script] += 1
        
        if char.isalpha():
            alphabetic_chars += 1
            if char_info['is_rtl']:
                rtl_chars += 1
    
    return {
        'text': text,
        'total_length': total_chars,
        'alphabetic_chars': alphabetic_chars,
        'rtl_chars': rtl_chars,
        'script_distribution': script_counts,
        'is_rtl': is_rtl_text(text),
        'needs_fallback': needs_fallback_font(text),
        'processed_text': process_bidi_text(text),
        'dominant_script': max(script_counts.items(), key=lambda x: x[1])[0] if script_counts else 'None'
    }


def extract_text_from_file(file_path: str) -> str:
        """Extract text from a file based on its extension."""
        _, ext = os.path.splitext(file_path)
        ext = ext.lower()
        
        if ext == '.txt':
            return _extract_text_from_txt(file_path)
        elif ext == '.docx':
            return _extract_text_from_docx(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
        

def _extract_text_from_docx(file_path: str) -> str:
        """Extract text from a .docx file."""
        doc = docx.Document(file_path)
        return '\n'.join(paragraph.text for paragraph in doc.paragraphs)


def _extract_text_from_txt(file_path: str) -> str:
        """Extract text from a plain text file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                return file.read()
        except UnicodeDecodeError:
            # Try with a different encoding if UTF-8 fails
            with open(file_path, 'r', encoding='latin-1') as file:
                return file.read()


def process_text_files(specific_files: Optional[List[str]] = None,
                       filename_mapping: Optional[Dict[str, str]] = None) -> Dict[str, Dict[str, str]]:
    """
    Process text files and return a dictionary mapping filenames to their content.

    Args:
        specific_files: Optional list of specific file paths to process
        filename_mapping: Optional mapping of file paths to original filenames

    Returns:
        Dictionary mapping filenames to text content and original filenames
    """
    results = {}
    # If directory is None, we'll only process specific_files if provided
    if not specific_files:
        return results

    if specific_files:
        # Process only specific files
        for file_path in specific_files:
            if os.path.isfile(file_path):
                try:
                    # Get base_name from the filepath for dictionary key
                    full_filename = os.path.basename(file_path)
                    base_name = os.path.splitext(full_filename)[0]
                    text_content = extract_text_from_file(file_path)

                    # Try to get the original filename from mapping if available
                    if filename_mapping and file_path in filename_mapping:
                        true_original_filename = filename_mapping[file_path]
                    else:
                        # Fall back to parsing from the filename if no mapping
                        # Extract the actual original filename by parsing the unique filename
                        # Format is: original_name_timestamp_index.ext
                        # We need to extract just the original_name part
                        parts = base_name.split('_')
                        if len(parts) >= 3:
                            # The last two segments are timestamp and index
                            # Everything before that is the original name
                            timestamp_parts = parts[-2:]
                            if timestamp_parts[0].isdigit() and timestamp_parts[1].isdigit():
                                # Join all parts except the last two (timestamp and index)
                                original_name = '_'.join(parts[:-2])
                                # Add the extension back
                                _, ext = os.path.splitext(full_filename)
                                true_original_filename = original_name + ext
                            else:
                                # If we can't parse it correctly, use the full filename
                                true_original_filename = full_filename
                        else:
                            # If filename doesn't match our expected format, use the full filename
                            true_original_filename = full_filename

                    # if text content starts with the original filename, remove it
                    if text_content.strip().startswith(os.path.splitext(true_original_filename)[0]):
                        text_content = text_content[len(true_original_filename):].strip()

                    # Store both content and original filename
                    results[base_name] = {
                        "content": text_content,
                        "original_filename": true_original_filename
                    }
                except Exception as e:
                    custom_print(FILE, f"Error processing {file_path}: {str(e)}", error=True)

    custom_print(FILE, f"Processed {len(results)} files.")
    return results