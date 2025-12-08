import os
import re
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import multiprocessing as mp

from PIL import Image, ImageDraw, ImageFont
from src.utils.models import BaseProcessor, TaskStatusUpdater
from src.utils.card_generator import RedditCardGenerator
from src.utils.utils import custom_print
from src.utils.text_utils import (
    is_rtl_text, process_bidi_text, get_appropriate_font
)
from src.utils.speech_to_text import CustomTranscriber
from pycaps import *
from pycaps.animation import PopIn
from pycaps.common import EventType, ElementType, Document, Segment, Word, Line, TimeFragment


FILE = "captions"


def smart_segment_splitter(document: Document, title_duration: float = None, max_chars_per_segment: int = 9) -> Document:
    """
    Intelligently splits and combines segments based on sentence boundaries and length.
    
    Rules:
    1. Splits at sentence boundaries (., !, ?)
    2. Never splits hyphenated words like "middle-road"
    3. Never includes content after closing quotes in same caption
    4. Combines short segments (< max_chars_per_segment) if they don't cross boundaries
    
    Args:
        document: The Document to process
        title_duration: Optional title duration to avoid crossing title/content boundary
        max_chars_per_segment: Maximum characters for combining segments (default 9)
        
    Returns:
        Modified Document with optimized segments
    """
    sentence_endings = ('.', '!', '?')
    
    all_words = []
    for segment in document.segments:
        for line in segment.lines:
            for word in line.words:
                all_words.append(word)
    
    if not all_words:
        custom_print(FILE, "No words found in document for segment splitting")
        return document
    
    # Step 1: Split into sentences
    sentence_groups = []
    current_sentence = []
    
    for i, word in enumerate(all_words):
        word_text = word.text.strip()
        
        # Check if this word starts with a hyphen (continuation of hyphenated word)
        # If so, merge it with the previous word
        if word_text.startswith('-') and current_sentence:
            prev_word = current_sentence[-1]
            prev_word.text = prev_word.text.rstrip() + word_text
            prev_word.time.end = word.time.end
            continue
        
        current_sentence.append(word)
        
        if not word_text:
            continue
        
        # Check if word ends with sentence punctuation
        # But not if it's part of a hyphenated word or has a quote after it
        ends_with_sentence = word_text.rstrip('"\'').endswith(sentence_endings)
        
        # Special case: if closing quote is present, split after the quote
        has_closing_quote = word_text.endswith(('"', "'"))
        
        if ends_with_sentence:
            # If there's a closing quote, this is the end of the sentence
            sentence_groups.append(current_sentence)
            current_sentence = []
        elif has_closing_quote and len(current_sentence) > 1:
            # Check if previous words had opening quote
            sentence_text = ' '.join([w.text for w in current_sentence])
            opening_quote_count = sentence_text.count('"') + sentence_text.count('"') + sentence_text.count("'")
            closing_quote_count = sentence_text.count('"') + sentence_text.count('"') + sentence_text.count("'")
            
            # If this is a closing quote (more closing than opening before this word)
            if closing_quote_count >= opening_quote_count:
                sentence_groups.append(current_sentence)
                current_sentence = []
    
    # Add any remaining words as final sentence
    if current_sentence:
        sentence_groups.append(current_sentence)
    
    custom_print(FILE, f"Split into {len(sentence_groups)} initial sentence groups")
    
    # Step 2: Combine very short segments
    combined_groups = []
    i = 0
    
    while i < len(sentence_groups):
        current_group = sentence_groups[i]
        current_text = ''.join([w.text for w in current_group]).strip()
        current_text_clean = re.sub(r'[^\w\s]', '', current_text)
        
        if not current_text:
            i += 1
            continue
        
        # Check if we can combine with next group
        if i + 1 < len(sentence_groups):
            next_group = sentence_groups[i + 1]
            next_text = ''.join([w.text for w in next_group]).strip()
            next_text_clean = re.sub(r'[^\w\s]', '', next_text)
            combined_text_clean = current_text_clean + next_text_clean
            
            # Get timing for boundary check
            current_start = current_group[0].time.start
            next_start = next_group[0].time.start
            
            # Don't combine if it would cross title/content boundary
            crosses_boundary = False
            if title_duration is not None:
                current_is_title = current_start < title_duration
                next_is_title = next_start < title_duration
                crosses_boundary = current_is_title != next_is_title
            
            # Don't combine if current text ends with sentence punctuation
            sentence_ending = current_text.rstrip().endswith(sentence_endings)
            
            # Combine if total length is less than max_chars_per_segment, doesn't cross boundary,
            # and not separated by sentence ending
            if len(combined_text_clean) < max_chars_per_segment and next_text and not crosses_boundary and not sentence_ending:
                combined_groups.append(current_group + next_group)
                i += 2
            else:
                combined_groups.append(current_group)
                i += 1
        else:
            combined_groups.append(current_group)
            i += 1
    
    custom_print(FILE, f"Combined into {len(combined_groups)} final groups")
    
    # Step 3: Create new segments from the groups
    new_segments = []
    for group in combined_groups:
        if not group:
            continue
        
        time = TimeFragment(start=group[0].time.start, end=group[-1].time.end)
        new_segment = Segment(time=time)
        new_line = Line(time=time)
        new_line.words.set_all(group)
        new_segment.lines.add(new_line)
        new_segments.append(new_segment)
        custom_print(FILE, f"Created segment: '{' '.join([w.text for w in group])}' [{time.start:.2f}s - {time.end:.2f}s]")
    
    # Replace document segments
    document.segments.set_all(new_segments)
    
    custom_print(FILE, f"Created {len(new_segments)} optimized segments")
    
    return document


class SubtitleProcessor(BaseProcessor):
    """Class to handle all subtitle and caption related operations."""
    
    def __init__(self):
        # Set up required paths
        self.current_dir = os.path.dirname(os.path.abspath(__file__))
        self.assets_dir = os.path.join(os.path.dirname(os.path.dirname(self.current_dir)), "src", "assets")
    
    def create_builder(self):
        template_path = os.path.join(self.current_dir, "pycaps", "pycaps.template.json")
        return JsonConfigLoader(template_path).load(False)

    def create_tagger(self, font_name: str, title_text: str = None) -> SemanticTagger:
        tagger = SemanticTagger()
        
        if font_name.lower() == "fredoka":
            tagger.add_regex_rule(Tag("fredoka"), r'.*')
        elif font_name.lower() == "montserrat":
            tagger.add_regex_rule(Tag("montserrat"), r'.*')
        

        return tagger
    
    def generate_captions(self,
                          video_with_audio_path: str,
                          final_output_temp_path: str,
                          font_name: str,
                          highlight_color: str, 
                          title_text: str, audio_path: str) -> None:
        """Generate captions for the video using PyCaps."""

        custom_print(FILE, f"Generating captions with font: {font_name}, highlight color: {highlight_color}")
        custom_print(FILE, f"Title text: {title_text}")

        builder = self.create_builder()
        tagger = self.create_tagger(font_name, title_text)

        builder = (
            builder
            .with_custom_audio_transcriber(CustomTranscriber(audio_path.replace(".mp3", ".json")))
            .with_input_video(video_with_audio_path)
            .with_output_video(final_output_temp_path)
            .with_semantic_tagger(tagger)
            .add_css_content(
                f"""
                .word.quoted:not(.rainbow-word-0):not(.rainbow-word-1):not(.rainbow-word-2):not(.rainbow-word-3) {{
                    color: {highlight_color};
                }}
                """
            )
        )
        
        pipeline = builder.build()
        pipeline.run()

        # move the generated subtitle data file to test.json
        import shutil 
        shutil.move(final_output_temp_path.replace(".mp4", ".json"), "test.json")
    