import json
import re
import shutil
import time
from typing import List

import ffmpeg
from encodings.utf_8 import encode

from dotenv import load_dotenv
from elevenlabs import save, VoiceSettings
from elevenlabs.client import ElevenLabs
from elevenlabs.core import ApiError
from pilmoji.source import AppleEmojiSource
from pilmoji import Pilmoji
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import textwrap
import os
import emoji as emoji_lib

from audio import add_sfx, process_tts
from utils import Data, MessageData, split_on_line_separators

# Set the base directory for outputs here
base_output_dir = 'generated'
load_dotenv()
DEBUG = os.getenv('DEBUG').lower() == 'true'

output_options = {
    "c:v": "prores",  # Video codec with support for alpha channel
    "pix_fmt": "yuva420p",  # Pixel format with alpha channel
    "r": 60,  # Frame rate
}
file_format = "mov"
sounds = [sound.replace('.mp3', '') for sound in os.listdir('resources/sounds/') if sound.endswith('.mp3')]
transparent_image_fp = f"resources/transparent.png"

voice_settings = VoiceSettings(
    stability=0.7,
    similarity_boost=1,
    style=0,
    use_speaker_boost=True,
)

if not os.path.exists(transparent_image_fp):
    transparent_image = Image.new("RGBA", (1080, 1920), (255, 255, 255, 0))
    transparent_image.save(transparent_image_fp)

send_sound_fp = "resources/sounds/send.mp3"
send_duration = round(float(ffmpeg.probe("resources/sounds/send.mp3")["format"]["duration"]), 3)
receive_sound_fp = "resources/sounds/receive.mp3"
receive_duration = round(float(ffmpeg.probe("resources/sounds/receive.mp3")["format"]["duration"]), 3)

small_silence_duration = round(
    float(ffmpeg.probe("resources/sounds/dead-silence-0.1.mp3")["format"]["duration"]), 3)
if DEBUG:
    output_options = {
        "c:v": "libx264",  # Video codec
        "pix_fmt": "yuv420p",  # Pixel format
        "r": 60,  # Frame rate
    }
    file_format = "mp4"

client = ElevenLabs(api_key=os.getenv('ELEVENLABS_API_KEY'))


class VideoGenerator:
    def __init__(self, data, script_path):
        self.data: Data = data
        self.script_path = script_path
        self.stop = False
        self.sender = "x-"
        self.undelivered = "undelivered-"
        self.exclamation_color = "#ff4539"
        self.green = "#36D15C"
        self.blue = '#0074fd'
        self.gray_light = '#e9e9eb'
        self.gray_dark = '#282828'
        self.contact_name = "contact_name:"
        self.group_name = "group_name:"
        self.unread_messages = "unread_messages:"
        self.no_pfp = "no_pfp"
        self.persist_header = "stay"
        self.current_header = None
        self.image = "[!"
        self.image_close = "!]"
        self.censor_tag = "##"
        self.before_sound_effects = "|b|"
        self.after_sound_effects = "|a|"
        self.during_sound_effects = "|ab|"
        self.alternate_text = "|e|"
        self.image_separator = "-$-"
        self.chat_separator = "-chat-"
        self.text_only = "text:"
        self.message_breakpoints = []
        self.acronyms = self.load_acronyms()
        self.message_data = []
        self.images = []

    def stop_process(self):
        self.data.status = "Stopped"
        self.update_data_status()
        self.stop = True

    def update_data_status(self):
        with open(f"{self.script_path}/{self.data.id}/{self.data.name}.json", 'w') as f:
            json.dump(self.data.to_json, f)

    def load_acronyms(self):
        with open("resources/acronyms.json", "r") as f:
            return json.load(f)

    def ensure_dir(self, file_path):
        if not os.path.exists(file_path):
            os.makedirs(file_path)

    def generate_images(self, script, dark_mode,
                        message_font_path="resources/fonts/SFPRODISPLAYREGULAR.OTF",
                        header_font_path="resources/fonts/SFPRODISPLAYREGULAR.OTF",
                        font_size=54, header_font_size=40):

        message_font = ImageFont.truetype(message_font_path, font_size)
        group_chat_user_name_font = ImageFont.truetype("resources/fonts/SFPRODISPLAYREGULAR.OTF", 32)
        header_font = ImageFont.truetype(header_font_path, header_font_size)
        warning_font = ImageFont.truetype("resources/fonts/SFPRODISPLAYBOLD.OTF", 32)
        unread_font = ImageFont.truetype(message_font_path, 35)
        big_emoji_font = ImageFont.truetype("resources/fonts/SFPRODISPLAYREGULAR.OTF", 140)
        contact_image_font = ImageFont.truetype("resources/fonts/SFPROROUNDEDMEDIUM.OTF", 69)
        # separate images, if separator is full line.
        image_texts = split_on_line_separators(script, separator=self.image_separator)

        for i, conv in enumerate(image_texts):
            self.message_data.append([])

            split_script = split_on_line_separators(conv, separator=self.chat_separator)

            if len(split_script) > 1:
                is_header = True
                messages = split_script[1].strip().splitlines()
            else:
                is_header = False
                messages = conv.strip().splitlines()

            width, height = 1170, 1530 + len(messages) * 250
            img = Image.new('RGB', (width, height), color=('#000000' if dark_mode else '#ffffff'))
            header_image_path = 'resources/' + (
                f'white-header.png' if not dark_mode else f'black-header.png')

            receiver_tail_image_light = Image.open('resources/light_mode_tail.png')
            receiver_tail_image_dark = Image.open('resources/dark-mode-tail.png')
            exclamation_mark = Image.open('resources/exclamation.png')
            download_button = Image.open(f"resources/{'dark' if dark_mode else 'light'}_download.png")

            empty_pfp = Image.open("resources/empty_pfp.png")
            chevron = Image.open(f"resources/{'dark' if dark_mode else 'light'}_chevron.png")
            chevron.putalpha(chevron.split()[3].point(lambda i: i * 0.25))
            download_button = download_button.resize((110, 110), Image.Resampling.LANCZOS)
            new_border = round(exclamation_mark.width * 0.9)
            exclamation_mark = exclamation_mark.resize((new_border, new_border), Image.Resampling.LANCZOS)
            header_image = Image.open(header_image_path)

            header_name = None
            unread_messages = "0"

            draw = ImageDraw.Draw(img)

            contact_image_center_coords = (585, 114)
            header_emoji_offset = (2, 4)

            # for group chats
            image_size = 70

            is_group = False

            if is_header or self.current_header:  # Place header on the first image
                if self.current_header and not is_header:
                    header_name = self.current_header["name"]
                    unread_messages = self.current_header["unread"]
                    is_group = self.current_header["is_group"]
                    no_pfp = self.current_header["no_pfp"]
                    is_header = True
                else:
                    no_pfp = False
                    persist_current_header = False
                    for j, line in enumerate(split_script[0].splitlines()):
                        if self.contact_name in line.lower():
                            header_name = line.split(":")[1].strip()
                            continue
                        if self.group_name in line.lower():
                            header_name = line.split(":")[1].strip()
                            is_group = True
                            continue
                        if self.unread_messages in line.lower():
                            unread_messages = line.split(":")[1].strip()
                            continue
                        if self.no_pfp in line.lower():
                            no_pfp = True
                            continue
                        if self.persist_header == line.lower().strip():
                            self.current_header = {"name": header_name, "unread": unread_messages, "no_pfp": no_pfp,
                                                   "is_group": is_group}
                            persist_current_header = True
                            continue

                    if not persist_current_header:
                        self.current_header = None

                img.paste(header_image, (0, 0))
                header_text_color = 'white' if dark_mode else 'black'
                if is_group:
                    group_icon = Image.open("resources/group_icon.png")
                    img.paste(group_icon, (contact_image_center_coords[0] - group_icon.width // 2,
                                           contact_image_center_coords[1] - group_icon.height // 2), group_icon)
                elif no_pfp or not header_name:
                    img.paste(empty_pfp, (contact_image_center_coords[0] - empty_pfp.width // 2,
                                          contact_image_center_coords[1] - empty_pfp.width // 2 + 5), empty_pfp)
                else:
                    draw.text(contact_image_center_coords, header_name[0].capitalize(), fill='white',
                              font=contact_image_font, anchor="mm")
                if header_name:
                    header_text_y_coord = 226
                    with Pilmoji(img, draw=draw, source=AppleEmojiSource) as pilmoji:
                        header_text_size = pilmoji.getsize(text=header_name, font=header_font)
                        pilmoji.text((width // 2 - chevron.width // 2 - 10 - header_text_size[0] // 2,
                                      header_text_y_coord - header_text_size[1] // 2 - 5), header_name,
                                     fill=header_text_color,
                                     font=header_font,
                                     emoji_position_offset=header_emoji_offset)
                    # paste chevron next to the name
                    img.paste(chevron, (
                        width // 2 + header_text_size[0] // 2 + 10 - chevron.width // 2,
                        header_text_y_coord - chevron.height // 2),
                              chevron)

                # unread messages
                if unread_messages and not unread_messages == "0":
                    coords = (105, 91)
                    unread_bbox = draw.textbbox(coords, unread_messages, font=unread_font)
                    # fully rounded if one digit else a rounded rectangle
                    if len(unread_messages) == 1:
                        draw.ellipse([coords[0] - 17, coords[1] - 7,
                                      coords[0] + 37, coords[1] + 47],
                                     fill=self.blue)
                        draw.text(coords, unread_messages, fill='white', font=unread_font)
                    else:
                        self.draw_rounded_rectangle(draw,
                                                    [(unread_bbox[0] - 14, unread_bbox[1] - 12), (unread_bbox[2] + 14,
                                                                                                  unread_bbox[3] + 12)],
                                                    fill=self.blue, radius=28)
                        draw.text(coords, unread_messages, fill='white', font=unread_font)

            if is_header:
                initial_y_offset = 291  # Adjusted y_offset for header
            else:
                initial_y_offset = 20
            y_offset = initial_y_offset

            b_i = 0
            g_i = 0
            for j, line in enumerate(messages):
                # Initialize message data
                message_data = MessageData(y_offset=y_offset, is_sender=False, is_image=False, is_undelivered=False,
                                           is_text_only=False,
                                           is_emoji_only=False, text_content="", voice="", before_sound_effects=[],
                                           after_sound_effects=[], during_sound_effects=[], name="", image="")
                if line.lower().startswith(self.text_only):
                    text_img = line.split(":", 1)[1].strip()

                    message_data.is_text_only = True
                    message_data.text_content = text_img
                    self.message_data[i].append(message_data)
                    continue

                # Get sound effects
                message_data.before_sound_effects = [s.strip() for s in
                                                     line.lower().split(self.before_sound_effects)[1].split("|")[
                                                         0].strip().split(
                                                         ",")] if self.before_sound_effects in line.lower() else []
                message_data.after_sound_effects = [s.strip() for s in
                                                    line.lower().split(self.after_sound_effects)[1].split("|")[
                                                        0].strip().split(
                                                        ",")] if self.after_sound_effects in line.lower() else []
                message_data.during_sound_effects = [s.strip() for s in
                                                     line.lower().split(self.during_sound_effects)[1].split("|")[
                                                         0].strip().split(
                                                         ",")] if self.during_sound_effects in line.lower() else []

                is_sender = line.lower().startswith(self.sender) or line.lower().startswith(self.undelivered)
                message_data.is_sender = is_sender
                sender_tail_image = Image.open(f"resources/blue-tail.png")
                undelivered_image = Image.open(f"resources/green-tail.png")

                if self.image in line and self.image_close in line:
                    image_file_name = line.split(self.image)[1].strip().split(self.image_close)[0].strip()
                    image_path = f"scripts/{self.data.id}/{image_file_name}"
                    message_data.is_image = True
                else:
                    image_file_name = None
                    image_path = None

                # get voice based on name
                name = line.split(":")[0].strip().lower().replace(self.sender, "").replace(self.undelivered, "")
                for person in self.data.people:
                    if person.name and person.name.lower() == name:
                        message_data.voice = person.voice
                        message_data.name = person.name
                        message_data.image = person.image
                        break

                # make each text only message the previous, so it can check next ones
                actual_messages = messages.copy()
                for l, line_ in enumerate(actual_messages):
                    if line_.startswith(self.text_only) and l > 0:
                        if l < len(messages) - 1:
                            actual_messages[l] = actual_messages[l + 1]


                next_message_is_sender = j < len(messages) - 1 and (
                        actual_messages[j + 1].lower().startswith(self.sender) or actual_messages[
                    j + 1].lower().startswith(
                    self.undelivered))
                if j < len(messages) - 1:
                    next_name = actual_messages[j + 1].split(":")[0].strip().lower().replace(self.sender, "").replace(
                        self.undelivered, "")
                else:
                    next_name = ""

                # make each text only message the next, so it can check previous ones
                actual_messages = messages.copy()
                for l, line_ in enumerate(actual_messages):
                    if line_.startswith(self.text_only) and l < len(messages) - 1:
                        actual_messages[l] = actual_messages[l - 1]

                previous_message_is_sender = j > 0 and (
                        actual_messages[j - 1].lower().startswith(self.sender) or actual_messages[
                    j - 1].lower().startswith(
                    self.undelivered))
                if j > 0:
                    previous_name = actual_messages[j - 1].split(":")[0].strip().lower().replace(self.sender, "").replace(
                        self.undelivered, "")
                else:
                    previous_name = ""

                is_undelivered = line.lower().startswith(self.undelivered)


                if not message_data.voice:
                    raise Exception(f"Voice not found for {name}")

                if is_group and not is_sender and (j == len(messages) - 1 or next_message_is_sender or name != next_name):
                    use_image = True
                else:
                    use_image = False

                if (is_group and not is_sender) and (previous_message_is_sender or j == 0 or name != previous_name):
                    use_name = True
                else:
                    use_name = False

                if use_name:
                    # above the pfp
                    name_text_size = draw.textbbox(
                        (0, 0),
                        message_data.name, font=group_chat_user_name_font)
                    name_text_height = name_text_size[3] - name_text_size[1]

                    y_offset += name_text_height + 25
                else:
                    name_text_height = 0

                if image_path:
                    is_undelivered = False
                    is_emoji_only = False
                    download_button_offset = 60
                    try:
                        image = Image.open(image_path)
                        image.thumbnail((870, 1200), Image.Resampling.LANCZOS)
                        image = self.apply_rounded_corners(image, radius=50)
                        if is_sender:
                            bubble_position = (width - image.width - 47, y_offset)
                            download_button_position = (
                                width - 47 - image.width - download_button.width - download_button_offset,
                                y_offset + image.height // 2 - download_button.height // 2)
                        else:
                            bubble_position = (47, y_offset)
                            download_button_position = (47 + image.width + download_button_offset,
                                                        y_offset + image.height // 2 - download_button.height // 2)
                        img.paste(image, (bubble_position[0], bubble_position[1]), image)

                        bubble_size = (image.width, image.height)

                        # paste download button
                        img.paste(download_button, download_button_position, download_button)
                    except Exception as e:
                        print(e)
                        raise IOError(
                            f"Missing image: {image_file_name}")
                    y_offset += image.height
                else:
                    text_content = line.replace(line.split(":")[0] + ":", "").strip().split(self.before_sound_effects)[
                        0].strip().split(
                        self.after_sound_effects)[0].strip().split(self.during_sound_effects)[0].strip().split(
                        self.alternate_text)[0].strip()

                    uncensored_text_content = text_content
                    if self.censor_tag in text_content:
                        # example: bla bla ##censored text## bla bla
                        text_to_censor = text_content.split(self.censor_tag)
                        # pop every second element, as the censored text is always between two tags
                        text_to_censor = text_to_censor[1::2]
                        print("Censoring:", text_to_censor)

                        text_content = text_content.replace(self.censor_tag, "")
                    else:
                        text_to_censor = []

                    voiceover_text = line.split(self.alternate_text)[1].split("|")[
                        0].strip() if self.alternate_text in line else text_content

                    # Compile a regular expression pattern to match whole words, case-insensitive
                    pattern = re.compile(
                        r'\b(?:%s)\b' % '|'.join(re.escape(word.lower()) for word in self.acronyms.keys()),
                        re.IGNORECASE)

                    # Find and replace acronyms in the text
                    voiceover_text = pattern.sub(lambda x: self.acronyms.get(x.group().lower()), voiceover_text)

                    # Set the modified text to your message data
                    message_data.text_content = voiceover_text

                    is_emoji_only = emoji_lib.emoji_count(text_content.strip()) < 4 and emoji_lib.purely_emoji(
                        text_content.strip())
                    text_color = 'white' if (is_sender or dark_mode and not is_sender) else 'black'
                    if not dark_mode:
                        if is_undelivered:
                            g_i += 1
                            bubble_color = self.green
                            tail = undelivered_image
                        elif is_sender:
                            b_i += 1
                            bubble_color = self.blue
                            tail = sender_tail_image
                        else:
                            bubble_color = self.gray_light
                            tail = receiver_tail_image_light
                    else:  # dark
                        if is_undelivered:
                            g_i += 1
                            bubble_color = self.green
                            tail = undelivered_image
                        elif is_sender:
                            b_i += 1
                            bubble_color = self.blue
                            tail = sender_tail_image
                        else:
                            bubble_color = self.gray_dark
                            tail = receiver_tail_image_dark

                    max_char_per_line = 30
                    if is_emoji_only:
                        max_char_per_line = 10

                    wrapped_text = textwrap.wrap(text_content, width=max_char_per_line, break_long_words=True,
                                                 replace_whitespace=False)
                    combined_text = "\n".join(wrapped_text)
                    with Pilmoji(img, draw=draw, source=AppleEmojiSource) as pilmoji:
                        if is_emoji_only:
                            text_width, text_height = pilmoji.getsize(text=combined_text.strip(), font=big_emoji_font)
                        else:
                            text_width, text_height = pilmoji.getsize(text=combined_text.strip(), font=message_font,
                                                                      emoji_scale_factor=1.125)

                    top_padding = 20 if len(wrapped_text) > 1 else 21
                    bottom_padding = 36 if len(wrapped_text) > 1 else 21

                    bubble_size = (text_width + 32 + 47, max(105, text_height + top_padding + bottom_padding))

                    if is_sender:
                        if is_undelivered:
                            bubble_position = (
                                width - bubble_size[0] - 47 - round(1.5 * exclamation_mark.width), y_offset)
                            if is_emoji_only:
                                bubble_position = (
                                    width - bubble_size[0] - 47 - round(0.8 * exclamation_mark.width), y_offset)
                        else:
                            bubble_position = (width - bubble_size[0] - 47, y_offset)
                    else:
                        bubble_position = (42, y_offset)

                        if is_group:
                            bubble_position = (bubble_position[0] + image_size + 16, bubble_position[1])
                            # Add image of the author at the left of the bubble and name above the bubble

                    if not is_emoji_only:
                        self.draw_rounded_rectangle(draw=draw,
                                                    xy=[bubble_position, (
                                                        bubble_position[0] + bubble_size[0],
                                                        bubble_position[1] + bubble_size[1])],
                                                    fill=bubble_color, radius=48)
                        text_position = (bubble_position[0] + 32, bubble_position[1] + top_padding)
                        emoji_y_offset = 4

                        with Pilmoji(img, draw=draw, source=AppleEmojiSource) as pilmoji:
                            pilmoji.text(text_position, combined_text.strip(), fill=text_color, font=message_font,
                                         emoji_position_offset=(0, emoji_y_offset), emoji_scale_factor=1.125,
                                         node_spacing=2)

                        if text_to_censor:
                            # get exact position of the text and then blur it
                            for text in text_to_censor:
                                print("Censoring:", text)
                                # split the text and only get the part before the censored part
                                split_text = uncensored_text_content.split(
                                    self.censor_tag + text + self.censor_tag)[0].replace(self.censor_tag, "")
                                uncensored_wrapped_text = textwrap.wrap(split_text,
                                                                        width=max_char_per_line,
                                                                        break_long_words=True, replace_whitespace=False)
                                uncensored_combined_text = "\n".join(uncensored_wrapped_text)

                                text_including_censor = textwrap.wrap(split_text + text,
                                                                      width=max_char_per_line,
                                                                      break_long_words=True, replace_whitespace=False)

                                # get the text in a single line to later get the width of it.
                                last_line_text_including_censor = text_including_censor[-1]

                                text_including_censor = "\n".join(text_including_censor)

                                # get its height from the multiline text
                                _, text_before_height = pilmoji.getsize(text=text_including_censor, font=message_font,
                                                                        emoji_scale_factor=1.125)

                                # get its width in a single line, so that it doesn't form a multiline block
                                text_before_width, _ = pilmoji.getsize(text=last_line_text_including_censor, font=message_font,
                                                                       emoji_scale_factor=1.125)
                                # get the actual censored text's size
                                censored_text_width, censored_text_height = pilmoji.getsize(text=text,
                                                                                            font=message_font,
                                                                                            emoji_scale_factor=1.125)
                                print("Censored text width:", censored_text_width)

                                # since for height we include the censored text, in case that it wraps, we subtract
                                # the height so that we get the top corner of the text.
                                text_before_height -= censored_text_height

                                text_before_width -= censored_text_width

                                censored_text_position = (text_before_width + 5 + text_position[0],
                                                          text_position[1] + text_before_height)
                                print("Censored text position:", censored_text_position)
                                # blur it
                                # get box of what to cut out
                                censored_bbox = draw.textbbox(censored_text_position, text, font=message_font)
                                censored_bbox = (censored_bbox[0] - 5, censored_bbox[1] - 5, censored_bbox[2] + 5,
                                                 censored_bbox[3] + 5)
                                print("Censored bbox:", censored_bbox)

                                img.paste(img.crop(censored_bbox).filter(ImageFilter.GaussianBlur(10)),
                                          censored_bbox)
                    else:
                        # if emoji only render big emojis and no bubble behind it, like in imessage, textsize doesnt
                        # exist
                        emoji = combined_text.strip()
                        emoji_position = (bubble_position[0] + 32, bubble_position[1])
                        with Pilmoji(img, draw=draw, source=AppleEmojiSource) as pilmoji:
                            emoji_position = (emoji_position[0], emoji_position[1] + 25)
                            pilmoji.text(emoji_position, emoji, fill=text_color, font=big_emoji_font)
                            size = pilmoji.getsize(text=emoji, font=big_emoji_font)

                        bubble_size = (size[0] + 32, size[1] + 50)

                    # add red exclamation if undelivered and small text
                    if is_undelivered:
                        img.paste(exclamation_mark,
                                  (width - 47 - exclamation_mark.width,
                                   y_offset + bubble_size[1] // 2 - exclamation_mark.height // 2),
                                  exclamation_mark)
                        # write "Not delivered" under the bubble, between exclamation mark and bubble, so it's centered
                        # between them
                        not_delivered_text = "Not delivered"
                        if self.data.language == "de":
                            not_delivered_text = "Nicht zugestellt"
                        elif self.data.language == "es":
                            not_delivered_text = "No entregado"
                        elif self.data.language == "fr":
                            not_delivered_text = "Non distribué"
                        draw.text((width - 33 - 3 * exclamation_mark.width, y_offset + bubble_size[1] + 7),
                                  not_delivered_text,
                                  fill=self.exclamation_color, font=warning_font)
                        #     get text height, to add to y offset
                        undelivered_bbox = draw.textbbox(
                            (width - 23 - 3 * exclamation_mark.width, y_offset + bubble_size[1] + 7),
                            "Not delivered", font=warning_font)
                        undelivered_height = (undelivered_bbox[3] - undelivered_bbox[1]) * 2
                        y_offset += undelivered_height

                    if is_sender and (
                            j == len(messages) - 1 or not next_message_is_sender) or is_undelivered:
                        tail_pos = (bubble_position[0] + bubble_size[0] - tail.width // 2 - 2,
                                    bubble_position[1] + bubble_size[1] - tail.height)
                        use_tail = True
                    elif not is_sender and (j == len(messages) - 1 or next_message_is_sender or name != next_name):
                        tail_pos = (bubble_position[0] - tail.width // 2 + 2,
                                    bubble_position[1] + bubble_size[1] - tail.height)
                        use_tail = True
                    else:
                        tail_pos = None
                        use_tail = False
                    if use_tail and not is_emoji_only:
                        img.paste(tail, tail_pos, tail)

                    y_offset += bubble_size[1]

                # Handle group chat
                bubble_offset = 20
                if use_image:
                    if message_data.image:
                        user_pfp = Image.open(f"scripts/{self.data.id}/{message_data.image}").resize(
                            (image_size, image_size),
                            Image.Resampling.LANCZOS)
                    else:
                        empty_pfp_icon = Image.open("resources/empty_pfp.png").resize((44, 50),
                                                                                      Image.Resampling.LANCZOS)
                        # paste it onto a gray circle
                        user_pfp = Image.new("RGBA", (image_size, image_size), (206, 206, 206, 255))
                        user_pfp.paste(empty_pfp_icon, (image_size // 2 - empty_pfp_icon.width // 2,
                                                        image_size // 2 - empty_pfp_icon.height // 2 + 5,),
                                       empty_pfp_icon)
                        #     make it a circle with a smooth border
                    user_pfp = self.apply_rounded_corners(user_pfp, radius=50)

                    img.paste(user_pfp, (bubble_position[0] - image_size - bubble_offset,
                                         bubble_position[1] + bubble_size[1] - image_size - 5),
                              user_pfp)
                if use_name:
                    draw.text(
                        (bubble_position[0] + 32, bubble_position[1] - 15 - name_text_height),
                        message_data.name,
                        fill='#B3B3B5', font=group_chat_user_name_font)

                next_gap = 3 if j < len(
                    messages) - 1 and next_message_is_sender == is_sender and not is_undelivered and self.undelivered not in \
                                messages[
                                    j + 1].lower() and not is_emoji_only else 28
                if j == len(messages) - 1:
                    next_gap = 15
                y_offset += next_gap

                message_data.is_emoji_only = is_emoji_only
                message_data.is_undelivered = is_undelivered
                message_data.y_offset = y_offset
                self.message_data[i].append(message_data)

            # crop white space
            img = img.crop((0, 0, width, y_offset))
            self.images.append(img)

        return self.images

    def create_video(self):
        """Create Video from Images, each cut needs to reveal a new message based on breakpoints,
         then the message will be voiced over and the video will continue to reveal the next message"""
        images = []
        clip_durations = []
        clips = []
        os.makedirs(f"scripts/{self.data.id}/temp", exist_ok=True)

        for i, img in enumerate(self.images):
            self.data.status = f"video: Video {i + 1}/{len(self.images)}"
            self.update_data_status()
            img: Image.Image
            print(f"Image {i}")
            img_data: List[MessageData] = self.message_data[i]
            for j, message_data in enumerate(img_data):
                # Handle stop
                if self.stop:
                    return

                cropped_image = img.crop((0, 0, img.width, message_data.y_offset))
                transparent_background = Image.new("RGBA", (1080, 1920), (255, 255, 255, 0))
                cropped_image_fp = f"scripts/{self.data.id}/temp/{self.data.name}-{i}-{j}.png"
                if message_data.is_text_only:
                    text_font = ImageFont.truetype("resources/fonts/Inter-Bold.OTF", 72)
                    # paste the text in the middle of the image
                    # copy transparent image
                    width = 1080 - 200
                    height = 1920
                    transparent_background_temp = Image.new("RGBA", (width, height), (255, 255, 255, 0))
                    blurred = Image.new('RGBA', (width, height), (255, 255, 255, 0))
                    draw = ImageDraw.Draw(blurred)
                    draw.text((width // 2 + 4, height // 2 + 4), message_data.text_content, fill='black', font=text_font,
                              anchor="mm", stroke_width=1, stroke_fill='black')
                    blurred = blurred.filter(ImageFilter.BoxBlur(7))

                    transparent_background_temp.paste(blurred, (0, 0), blurred)

                    draw = ImageDraw.Draw(transparent_background_temp)
                    draw.text((width // 2, height // 2), message_data.text_content, fill='white', font=text_font,
                              anchor="mm", stroke_width=2, stroke_fill='black')

                    transparent_background.paste(transparent_background_temp, (100, 0), transparent_background_temp)


                else:
                    # paste image onto transparent background
                    cropped_image.thumbnail((round(1080 * 0.8), round(1920 * 0.8)), Image.Resampling.LANCZOS)
                    transparent_background.paste(cropped_image, (round(1080 * 0.1), round(1920 * 0.1)))
                transparent_background.save(cropped_image_fp)
                images.append(cropped_image_fp)
                print(f"Message {j}")

                print(encode(str(message_data.__dict__)))
                # --- Video and Audio Generation ---
                audio_fp = f"scripts/{self.data.id}/temp/{self.data.name}-{i}-{j}.mp3"

                if message_data.is_emoji_only:
                    ffmpeg.input("resources/sounds/dead-silence-0.1.mp3").output(audio_fp).overwrite_output().run()
                elif message_data.is_text_only:
                    ffmpeg.input("resources/sounds/dead-silence-1.mp3").output(audio_fp).overwrite_output().run()
                elif message_data.is_image:
                    sound = send_sound_fp if message_data.is_sender else receive_sound_fp
                    # need to play this sound while the image appears
                    ffmpeg.input(sound).output(audio_fp).overwrite_output().run()
                else:
                    override = True
                    if DEBUG and not override:
                        saved_audio = f"scripts/temp/{self.data.name}-{i}-{j}.mp3"
                        ffmpeg.input(saved_audio).output(audio_fp).overwrite_output().run()
                    else:
                        tts_voice = message_data.voice

                        def generate_tts():
                            return client.generate(text=message_data.text_content, voice=tts_voice,
                                                   voice_settings=voice_settings, model="eleven_multilingual_v2")

                        audio = generate_tts()
                        # handle too busy errors
                        tries = 0
                        while type(audio) is ApiError and tries < 3:
                            print(audio)
                            self.data.status = f"Elevenlabs is too busy, trying again"
                            self.update_data_status()
                            time.sleep(2)
                            audio = generate_tts()
                            tries += 1
                        save(audio, audio_fp)
                        voice_obj = None
                        while not voice_obj and tries < 5:
                            try:
                                tries += 1
                                voice_obj = client.voices.get(voice_id=tts_voice)
                            except Exception as e:
                                print(e)
                                time.sleep(2)

                        if not voice_obj:
                            raise Exception(f"Failed to get voice object for {tts_voice}")
                        if False:
                            silence_len = 120
                        else:
                            silence_len = 50
                        process_tts(audio_fp, voice=voice_obj, min_silence_len=silence_len)

                # --- Sound Effects ---
                if message_data.before_sound_effects:
                    for sound in message_data.before_sound_effects:
                        add_sfx(audio_fp, sound, "before")

                if message_data.after_sound_effects:
                    for sound in message_data.after_sound_effects:
                        add_sfx(audio_fp, sound, "after")

                if message_data.during_sound_effects:
                    for sound in message_data.during_sound_effects:
                        add_sfx(audio_fp, sound, "during")

                merged_audio = ffmpeg.input(audio_fp).audio
                duration = round(float(ffmpeg.probe(audio_fp)["format"]["duration"]), 3)

                clip_fp = f"scripts/{self.data.id}/temp/{self.data.name}-{i}-{j}.{file_format}"
                ffmpeg.output(
                    ffmpeg.input(cropped_image_fp, loop=1, t=duration, pix_fmt=output_options["pix_fmt"]),
                    merged_audio, clip_fp, **output_options).run()

                clip = clip_fp
                last_j = len(self.message_data[i - 1]) - 1
                last_message_text_only = self.message_data[i - 1][last_j].is_text_only if i > 0 and j == 0 else False
                if message_data.is_text_only or img_data[j - 1].is_text_only or last_message_text_only:
                    print("Transitioning")
                    print(i)
                    if j == 0 and i == 0:
                        print("Transition cancelled")
                    else:
                        if j == 0:
                            before_fp = f"scripts/{self.data.id}/temp/{self.data.name}-{i - 1}-{last_j}.{file_format}"
                        else:
                            before_fp = f"scripts/{self.data.id}/temp/{self.data.name}-{i}-{j - 1}.{file_format}"
                        print(before_fp)
                        transition_duration = 0.25
                        previous_duration = self.transition_message(before_fp=before_fp, fp=clip_fp, duration=transition_duration)
                        clip_durations[-1] = previous_duration
                clips.append(clip)
                clip_durations.append(round(float(ffmpeg.probe(clip_fp)["format"]["duration"]), 3))

        self.generate_final_video(clips, sum(clip_durations))

    def generate_final_video(self, clips, length):
        self.data.status = "Generating Final Video"
        self.update_data_status()
        print("Generating Final Video")
        folder = f"{base_output_dir}/{self.data.id.split('---')[1]}"
        video_fp = f"{folder}/{self.data.name}.{file_format}"
        self.ensure_dir(folder)

        subclip_fps = []
        batch_size = 40
        num_clips = len(clips)
        for i in range(0, num_clips, batch_size):
            batch_clips = [ffmpeg.input(c) for c in clips[i:i + batch_size]]
            subclip_fp = f"{folder}/subclip_{i // batch_size}.{file_format}"
            video_and_audio_files = [item for sublist in map(lambda f: [f.video, f.audio], batch_clips)
                                     for item in sublist]

            # Concatenate the batch
            joined = (
                ffmpeg
                .concat(*video_and_audio_files, v=1, a=1)
                .node
            )
            background = ffmpeg.input(transparent_image_fp, loop=1, t=length, pix_fmt=output_options["pix_fmt"])["v"]
            video = ffmpeg.overlay(background, joined[0], eof_action="endall")

            # Merge video and audio
            (
                ffmpeg
                .output(video, joined[1], subclip_fp, **output_options)
                .run()
            )
            subclip_fps.append(subclip_fp)

        # Concatenate all subclips
        subclips = [ffmpeg.input(c) for c in subclip_fps]
        final_video_and_audio_files = [item for sublist in map(lambda f: [f.video, f.audio], subclips) for
                                       item in sublist]
        final_joined = (
            ffmpeg
            .concat(*final_video_and_audio_files, v=1, a=1)
            .node
        )
        final_background = ffmpeg.input(transparent_image_fp, loop=1, t=length, pix_fmt=output_options["pix_fmt"])["v"]
        final_video = ffmpeg.overlay(final_background, final_joined[0], eof_action="endall")

        # Merge final video and audio
        (
            ffmpeg
            .output(final_video, final_joined[1], video_fp, **output_options)
            .run()
        )

        # Clean up subclips
        for subclip in subclip_fps:
            os.remove(subclip)

    def cleanup_files(self):
        shutil.rmtree(f"scripts/{self.data.id}/temp")
        print("Cleaned up temp files")

    def generate_video(self):
        try:
            self.data.status = "Generating Screenshots"
            self.update_data_status()
            imgs = self.generate_images(script=self.data.script, dark_mode=self.data.dark_mode)
            for i in range(len(imgs)):
                image_path = f"{self.script_path}/{self.data.id}/{self.data.name}-{i}.png"
                imgs[i].save(image_path)
            self.data.status = "video Generating Videos"
            self.update_data_status()
            self.create_video()
            if not self.stop:
                self.data.status = "generated"
                self.update_data_status()
            if not DEBUG:
                self.cleanup_files()
        except Exception as e:
            self.data.status = f"Error: {e}"
            self.update_data_status()
            print(e)
            raise e

    @staticmethod
    def draw_rounded_rectangle(draw, xy, fill, radius):
        """
        Draw a rounded rectangle with smoother corners.
        """
        factor = 4  # The higher the factor, the smoother the corners
        radius *= factor

        # Calculate the size of the rectangle
        bubble_size = (xy[1][0] - xy[0][0], xy[1][1] - xy[0][1])

        # Create the rectangle at a higher resolution
        rounded_rectangle = Image.new("L", (bubble_size[0] * factor, bubble_size[1] * factor), 0)
        draw_high_res = ImageDraw.Draw(rounded_rectangle)

        # Draw the rectangle
        draw_high_res.rounded_rectangle(
            xy=[(0, 0), (rounded_rectangle.width, rounded_rectangle.height)],
            fill=255, radius=radius)

        # Scale down the rectangle using a high-quality resampling filter
        rounded_rectangle = rounded_rectangle.resize(bubble_size, Image.Resampling.LANCZOS)

        # Paste the rectangle onto the original image
        draw.bitmap(xy[0], rounded_rectangle, fill=fill)

    def apply_rounded_corners(self, image, radius):
        """
        Apply rounded corners to an image.
        """
        rounded_mask = Image.new("L", image.size, 0)
        width, height = image.size
        draw = ImageDraw.Draw(rounded_mask)
        self.draw_rounded_rectangle(draw, [(0, 0), (width, height)], fill=255, radius=radius)
        image.putalpha(rounded_mask)
        return image

    def transition_message(self, before_fp, fp, duration=0.2):
        """Provide FFmpeg inputs for two video files and apply a transition effect to the previous video file."""
        print("Generating transition")
        before_length = round(float(ffmpeg.probe(before_fp)["format"]["duration"]), 3)
        before_audio = ffmpeg.input(before_fp).audio
        before_temp_audio_fp = 'temp_before_audio.mp3'
        ffmpeg.output(before_audio, before_temp_audio_fp).run(overwrite_output=True)
        offset = round(before_length - duration, 3) if before_length > duration else 0
        temp_before_fp = before_fp.replace(".", "-temp.")
        if offset == 0:
            duration = before_length
        fade_filter = "fade"
        print("Before fp:", before_fp)
        print("temp before fp:", temp_before_fp)
        command = (
            f'ffmpeg -i {before_fp} -i {fp} '
            f'-filter_complex xfade=transition={fade_filter}:offset={offset}:duration={duration} '
            f'-c:v {output_options["c:v"]} -pix_fmt {output_options["pix_fmt"]} -r {output_options["r"]} '
            f'-t {offset + duration} -y {temp_before_fp}'
        )

        print(command)
        os.system(command)
        ffmpeg.output(ffmpeg.input(before_temp_audio_fp).audio, ffmpeg.input(temp_before_fp).video, before_fp, **output_options).run(
            overwrite_output=True)
        # os.remove(before_fp)
        # os.rename(temp_before_fp, before_fp)
        os.remove(before_temp_audio_fp)
        os.remove(temp_before_fp)
        return round(float(ffmpeg.probe(before_fp)["format"]["duration"]), 3)
