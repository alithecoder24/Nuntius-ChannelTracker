import json
import os
from typing import List, Dict, Tuple, Optional, Union
import unicodedata

from PIL import Image, ImageDraw, ImageFont
from pilmoji import Pilmoji
from pilmoji.source import AppleEmojiSource
from src.utils.models import Video, Profile
from src.utils.utils import custom_print
from src.utils.text_utils import (
    is_rtl_text, process_bidi_text, can_font_render_text, get_appropriate_font
)

FILE = "card"


class RedditCardGenerator:
    def __init__(self, username: str, selected_profile: Union[str, Profile], current_dir: str):
        """
        Initialize the RedditCardGenerator.
        
        Args:
            username: Username to display on cards
            selected_profile: Profile ID (string) or Profile object
            current_dir: Base directory for the application
        """
        # Get the correct base path whether running as script or frozen exe
        self.base_path = current_dir
        self.results_dir = os.path.join(current_dir, "Introcards")

        # Create results directory
        os.makedirs(self.results_dir, exist_ok=True)

        # Load resources with proper path handling
        try:
            # Load fonts
            self.font_bold = ImageFont.truetype(
                os.path.join(self.base_path, "src", "assets", "Lato-Bold.ttf"), 40
            )
            self.font_regular = ImageFont.truetype(
                os.path.join(self.base_path, "src", "assets", "Lato-Black.ttf"), 64
            )
            
            # Load fallback fonts for better Unicode support
            try:
                # Try to load universal noto first (most common system font)
                self.fallback_font_bold = ImageFont.truetype(
                    os.path.join(self.base_path, "src", "assets", "noto.ttf"), 40
                )
                self.fallback_font_regular = ImageFont.truetype(
                    os.path.join(self.base_path, "src", "assets", "noto.ttf"), 64
                )
            except OSError:
                try:
                    # Try system fonts on different platforms
                    import platform
                    if platform.system() == "Windows":
                        self.fallback_font_bold = ImageFont.truetype(
                            "C:/Windows/Fonts/arial.ttf", 40
                        )
                        self.fallback_font_regular = ImageFont.truetype(
                            "C:/Windows/Fonts/arial.ttf", 64
                        )
                    elif platform.system() == "Darwin":  # macOS
                        self.fallback_font_bold = ImageFont.truetype(
                            "/System/Library/Fonts/Arial.ttf", 40
                        )
                        self.fallback_font_regular = ImageFont.truetype(
                            "/System/Library/Fonts/Arial.ttf", 64
                        )
                    else:  # Linux
                        self.fallback_font_bold = ImageFont.truetype(
                            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40
                        )
                        self.fallback_font_regular = ImageFont.truetype(
                            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 64
                        )
                except OSError:
                    # Last resort: use default font
                    custom_print(FILE, "Warning: Could not load fallback fonts, using default font")
                    self.fallback_font_bold = ImageFont.load_default()
                    self.fallback_font_regular = ImageFont.load_default()

            # Load other assets
            self.like_comment_path = os.path.join(self.base_path, "src", "assets", "like-comment.png")

            # Verify essential resources exist
            if not os.path.exists(self.like_comment_path):
                raise FileNotFoundError(f"Resource not found: {self.like_comment_path}")

        except Exception as e:
            raise Exception(f"Failed to load resources: {str(e)}")

        self.username = username
        self.line_height = 60  # Increased from 50px to 60px for better spacing
        self.profile = None
        
        # Handle different types of profile input
        if isinstance(selected_profile, Profile):
            # Use Profile object directly
            self.selected_profile = selected_profile.channel_name
            self.badge_style = selected_profile.badge_style
            
            # We still need to load the profile pic and badges from the profile directory
            profile_id = None
            # Find the profile directory from the profile name in Profiles
            profile_base = os.path.join(self.base_path, "Assets", "Profiles")
            for profile_dir in os.listdir(profile_base):
                if os.path.isdir(os.path.join(profile_base, profile_dir)):
                    config_path = os.path.join(profile_base, profile_dir, "config.json")
                    if os.path.exists(config_path):
                        with open(config_path, "r") as f:
                            config = json.load(f)
                            if config.get("channel_name") == selected_profile.channel_name:
                                profile_id = profile_dir
                                break
                                
            if profile_id is None:
                # If profile not found, create a fallback profile_id
                profile_id = f"Profile_{selected_profile.channel_name}"
                
            self.selected_profile = profile_id
        else:
            # Traditional string profile_id
            self.selected_profile = selected_profile
            profile_id = selected_profile

        # Load selected profile
        profile_dir = os.path.join(self.base_path, "Assets", "Profiles", profile_id)
        config_path = os.path.join(profile_dir, "config.json")
        pfp_path = os.path.join(profile_dir, "pfp.png")
        
        # Check if profile exists
        if not os.path.exists(profile_dir):
            raise FileNotFoundError(f"Profile directory not found: {profile_dir}")
        
        # Check if profile picture exists
        if not os.path.exists(pfp_path):
            raise FileNotFoundError(f"Profile picture not found: {pfp_path}")
            
        # Load profile configuration
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Profile configuration not found: {config_path}")
            
        with open(config_path, "r") as f:
            profile_config = json.load(f)
            
        # Read badge_style from config (default to "blue") if not already set
        if not hasattr(self, "badge_style"):
            self.badge_style = profile_config.get("badge_style", "blue")
            
        # Get badge paths
        badge_paths = []
        for badge_filename in profile_config.get("selected_badges", []):
            badge_path = os.path.join(self.base_path, "src", "assets", "Badges", badge_filename)
            if not os.path.exists(badge_path):
                raise FileNotFoundError(f"Badge not found: {badge_path}")
            badge_paths.append(badge_path)
            
        # Save profile data
        channel_name = profile_config.get("channel_name", self.username)
        if isinstance(selected_profile, Profile):
            channel_name = selected_profile.channel_name
            
        self.profile = {
            "id": profile_id,
            "pfp": pfp_path,
            "channel_name": channel_name,
            "badges": badge_paths,
        }

    def _get_appropriate_font(self, text: str, is_bold: bool = False) -> ImageFont.ImageFont:
        """
        Get the appropriate font for the given text, falling back if necessary.
        
        Args:
            text: The text to be rendered
            is_bold: Whether to use bold font
            
        Returns:
            The appropriate font (original or fallback)
        """
        primary_font = self.font_bold if is_bold else self.font_regular
        fallback_font = self.fallback_font_bold if is_bold else self.fallback_font_regular
        font_type = "bold" if is_bold else "regular"
        
        # Use the shared font detection function
        return get_appropriate_font(text, primary_font, fallback_font, font_type)

    def create_card_image(self, text: str) -> Tuple[Image.Image, int]:
        """
        Create a card image for the given text.

        Args:
            text: The text to display on the card
            
        Returns:
            Tuple containing:
            - The generated card image
            - The height of the card
        """

        text = text.replace("_", "?")
        # Calculate text height using appropriate font
        text_font = self._get_appropriate_font(text, is_bold=False)
        # Adjusted from 762 to 782 for wider text area
        text_lines = self.wrap_text(text, None, text_font, 782, None).split("\n")
        text_height = len(text_lines) * self.line_height

        # Calculate dimensions and spacing
        top_margin = 15
        profile_height = 100  # Height of profile picture and info section
        profile_section_height = top_margin + profile_height
        button_height = 38  # Height of the like/share buttons
        text_to_button_margin = 30
        button_to_bottom_margin = 15
        side_margin = 12
        
        # Calculate total height needed based on content
        text_section_height = profile_section_height + text_height
        total_height = text_section_height + text_to_button_margin + button_height + button_to_bottom_margin

        # Create card with dynamic height and width (832px)
        card = Image.new("RGBA", (832, total_height), "white")
        draw = ImageDraw.Draw(card)

        # Add profile picture with transparency and make it round using our smooth method
        profile_pic = Image.open(self.profile["pfp"]).resize((100, 100)).convert("RGBA")
        
        # Create a circular mask for the profile picture
        mask = Image.new("L", (100, 100), 0)
        
        # Use the smooth rounded rectangle method with full radius
        self.draw_rounded_rectangle(
            draw=ImageDraw.Draw(mask),
            xy=[(0, 0), (100, 100)],
            fill=255,
            radius=50,  # Full radius for perfect circle
        )
        
        # Apply the circular mask to the profile picture
        circular_profile_pic = Image.new("RGBA", (100, 100))
        circular_profile_pic.paste(profile_pic, (0, 0), mask)
        
        # Paste the circular profile picture onto the card with reduced margin
        card.paste(circular_profile_pic, (side_margin, top_margin), circular_profile_pic)

        # Calculate new username position with reduced margins
        username_x = side_margin + 100 + 10  # profile pic width + small gap
        username_y = 12  # Adjusted to align better with reduced top margin

        # Add username with appropriate font and RTL support
        username_text = unicodedata.normalize("NFC", self.profile.get("channel_name", self.username))
        username_display_text = process_bidi_text(username_text)
        username_font = self._get_appropriate_font(username_display_text, is_bold=True)
        
        # Keep username in same position regardless of text direction, just process RTL text
        draw.text((username_x, username_y), username_display_text, font=username_font, fill="black")

        # Add verified icon next to username based on badge_style
        if self.badge_style != "none":
            verified_file = "gold_verified.png" if self.badge_style == "gold" else "verified.png"
            verified_path = os.path.join(self.base_path, "src", "assets", verified_file)
            if os.path.exists(verified_path):
                verified_icon = Image.open(verified_path).convert("RGBA")
                # Calculate position to the right of the username text (consistent positioning)
                username_width = draw.textlength(username_display_text, font=username_font)
                # Calculate username text height
                _, text_height_val = draw.textbbox((0, 0), username_display_text, font=username_font)[2:4]
                icon_size = int(text_height_val * 0.85)
                verified_icon = verified_icon.resize((icon_size, icon_size), Image.LANCZOS)
                text_center_y = username_y + (self.font_bold.size - text_height_val) / 2
                verified_position = (
                    int(username_x + username_width + 5),
                    int(text_center_y + (text_height_val - icon_size) / 2) + 4,
                )
                card.paste(verified_icon, verified_position, verified_icon)

        # Position for text content
        y = profile_section_height
        
        # Get appropriate font for the main text and process for RTL
        text_font = self._get_appropriate_font(text, is_bold=False)
        wrapped_text = self.wrap_text(text, draw, text_font, 782, card)
        
        for line in wrapped_text.split("\n"):
            # Process each line for bidirectional text
            line_display_text = process_bidi_text(line)
            
            # Keep the same left positioning for all text, just process RTL for proper character order
            x = side_margin  # Always use left alignment
            
            # Check if line contains fully capitalized words (more than 2 letters)
            words = line.split()
            has_caps_word = any(word.isupper() and len(word) >= 2 and word.isalpha() for word in words)
            
            if has_caps_word:
                # Render word by word with different colors
                current_x = x
                for word in words:
                    word_display = process_bidi_text(word)
                    
                    # Check if this word should be highlighted in red
                    if word.isupper() and len(word) >= 2 and word.isalpha():
                        word_color = (255, 0, 0, 255)  # Red color for fully caps words
                    else:
                        word_color = (0, 0, 0, 255)  # Black for normal words
                    
                    with Pilmoji(card, source=AppleEmojiSource) as pilmoji:
                        pilmoji.text(
                            (current_x, y),
                            unicodedata.normalize("NFC", word_display),
                            font=text_font,
                            fill=word_color,
                            node_spacing=-1,
                            emoji_position_offset=(0, 6),
                            spacing=2,
                        )
                        
                        # Calculate width of current word to position next word
                        word_width, _ = pilmoji.getsize(word_display, font=text_font)
                        current_x += word_width + 8  # Add small space between words
            else:
                # Render entire line normally
                with Pilmoji(card, source=AppleEmojiSource) as pilmoji:
                    custom_print(FILE, f"Adding line to card: {line}")
                    pilmoji.text(
                        (x, y),
                        unicodedata.normalize("NFC", line_display_text),
                        font=text_font,
                        fill="black",
                        node_spacing=-1,
                        emoji_position_offset=(0, 6),
                        spacing=2,
                    )
            
            y += self.line_height

        # Calculate badge area size and position
        badge_count = len(self.profile["badges"])
        if badge_count > 0:
            badge_width = 40  # Individual badge width
            badge_spacing = 45  # Distance between badge centers
            total_badge_width = badge_spacing * badge_count - (badge_spacing - badge_width)
            
            # Background padding (4px on each side)
            padding = 4
            background_width = total_badge_width + (padding * 2)
            background_height = 40 + (padding * 2)
            background_x = username_x - padding
            background_y = 70 - padding
            
            # Create a semi-transparent black background for badges with rounded corners
            background = Image.new("RGBA", (background_width, background_height), (0, 0, 0, 0))
            background_draw = ImageDraw.Draw(background)
            background_draw.rounded_rectangle(
                [(0, 0), (background_width, background_height)],
                radius=15,
                fill=(0, 0, 0, 13),  # 5% opacity
            )
            
            # Paste the semi-transparent background
            card.paste(background, (background_x, background_y), background)

        # Add profile-specific badges
        for i, badge_path in enumerate(self.profile["badges"]):
            badge = Image.open(badge_path).convert("RGBA").resize((40, 40), Image.LANCZOS)
            x_pos = username_x + (i * 45)
            y_pos = 70
            card.paste(badge, (x_pos, y_pos), badge)

        # Load like-comment and share icons
        like_comment = Image.open(self.like_comment_path)
        share_path = os.path.join(self.base_path, "src", "assets", "share.png")
        share = Image.open(share_path)
        
        # Resize icons
        icon_height = 38
        like_comment_width = int((like_comment.width / like_comment.height) * icon_height)
        like_comment = like_comment.resize((like_comment_width, icon_height), Image.LANCZOS)
        
        share_width = int((share.width / share.height) * icon_height)
        share = share.resize((share_width, icon_height), Image.LANCZOS)
        
        # Position icons: like-comment on the left, share on the right
        buttons_y = text_section_height + text_to_button_margin
        
        like_comment_position = (side_margin, buttons_y)
        share_position = (832 - side_margin - share_width, buttons_y)
        
        # Paste icons
        card.paste(like_comment, like_comment_position, like_comment)
        card.paste(share, share_position, share)

        # Apply rounded corners for the entire card
        rounded_mask = Image.new("L", (832, total_height), 0)
        self.draw_rounded_rectangle(
            draw=ImageDraw.Draw(rounded_mask),
            xy=[(0, 0), (832, total_height)],
            fill=255,
            radius=30,
        )
        card.putalpha(rounded_mask)

        return card, total_height

    def generate_multiple_cards(
        self,
        texts_or_videos: Union[List[str], List[Video], Dict[str, Video]],
        selected_profile=None,
    ) -> Tuple[str, List[str]]:
        """
        Generate multiple intro cards for a list of titles or Video objects.
        """
        generated_files: List[str] = []

        # Convert input to titles if Video objects exist
        if isinstance(texts_or_videos, dict):
            videos = texts_or_videos
            texts = [video.title for video in videos.values()]
            title_to_key = {video.title: key for key, video in videos.items()}
        elif (
            isinstance(texts_or_videos, list)
            and len(texts_or_videos) > 0
            and isinstance(texts_or_videos[0], Video)
        ):
            texts = [video.title for video in texts_or_videos]
            videos = {video.title: video for video in texts_or_videos}
            title_to_key = {video.title: video.title for video in texts_or_videos}
        else:
            texts = texts_or_videos
            videos = None
            title_to_key = None

        for index, text in enumerate(texts):
            custom_print(FILE, f"Generating card {index + 1} for Profile {self.selected_profile}...")
            card, _ = self.create_card_image(text)

            # Make filename safe
            safe_title = "".join(
                c if c.isalnum() or c in "._- " else "_" for c in text
            )
            safe_title = safe_title.strip().replace(" ", "_").strip("._")

            # Avoid empty names
            if not safe_title:
                safe_title = f"card_{index + 1}"

            # Limit length for Windows path restrictions
            max_len = 80
            if len(safe_title) > max_len:
                safe_title = safe_title[:max_len]

            # Add index to ensure uniqueness
            output_filename = f"{index + 1:03d}_{safe_title}.png"
            output_path = os.path.join(self.results_dir, output_filename)

            # Save image
            card.save(output_path)
            generated_files.append(output_path)

            # Update Video object if available
            if videos is not None and title_to_key is not None and text in title_to_key:
                key = title_to_key[text]
                if key in videos:
                    videos[key].introcard_path = output_path

            custom_print(FILE, f"Card {index + 1} generated successfully!")

        custom_print(FILE, f"All cards have been generated in: {self.results_dir}")
        return self.results_dir, generated_files

    def wrap_text(
        self,
        text: str,
        draw: Optional[ImageDraw.ImageDraw],
        font: ImageFont.ImageFont,
        max_width: int,
        image: Optional[Image.Image],
    ) -> str:
        """
        Wrap text to fit within max_width with RTL support.
        """
        if draw is None:
            # Create temporary image and draw for measurement
            temp_image = Image.new("RGBA", (max_width, 500), "white")
            draw = ImageDraw.Draw(temp_image)
            image = temp_image

        # Check if text is RTL to determine word splitting strategy
        text_is_rtl = is_rtl_text(text)
        
        if text_is_rtl:
            processed_text = process_bidi_text(text)
            words = processed_text.split()
        else:
            words = text.split()
            
        lines: List[str] = []
        current_line: List[str] = []

        def get_text_width(text_to_measure: str) -> int:
            display_text = process_bidi_text(text_to_measure) if text_is_rtl else text_to_measure
            with Pilmoji(image=image, draw=draw, source=AppleEmojiSource) as pilmoji:
                width, _ = pilmoji.getsize(display_text, font=font)
            return width

        for word in words:
            current_line.append(word)
            line_text = " ".join(current_line)
            line_width = get_text_width(line_text)

            if line_width > max_width:
                if len(current_line) > 1:
                    current_line.pop()
                    lines.append(" ".join(current_line))
                    current_line = [word]
                else:
                    lines.append(word)
                    current_line = []

        if current_line:
            lines.append(" ".join(current_line))

        return "\n".join(lines)

    @staticmethod
    def draw_rounded_rectangle(
        draw: ImageDraw.ImageDraw,
        xy: List[Tuple[int, int]],
        fill: Union[str, Tuple[int, int, int], Tuple[int, int, int, int], int],
        radius: int,
    ) -> None:
        """
        Draw a rounded rectangle with smoother corners.
        """
        factor = 4  # The higher the factor, the smoother the corners
        radius *= factor

        bubble_size = (xy[1][0] - xy[0][0], xy[1][1] - xy[0][1])

        rounded_rectangle = Image.new("L", (bubble_size[0] * factor, bubble_size[1] * factor), 0)
        draw_high_res = ImageDraw.Draw(rounded_rectangle)

        draw_high_res.rounded_rectangle(
            xy=[(0, 0), (rounded_rectangle.width, rounded_rectangle.height)],
            fill=255,
            radius=radius,
        )

        rounded_rectangle = rounded_rectangle.resize(bubble_size, Image.Resampling.LANCZOS)

        draw.bitmap(xy[0], rounded_rectangle, fill=fill)
