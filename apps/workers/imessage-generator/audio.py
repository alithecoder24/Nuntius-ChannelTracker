import json
import os

from elevenlabs import Voice
from pydub import AudioSegment, silence

with open("resources/volumes.json", "r") as f:
    volume_offsets = json.load(f)


def trim_silence(audio_segment, silence_threshold=-20.0, chunk_size=10):
    """Trim silence from the start and end of the audio."""
    assert chunk_size > 0  # to avoid infinite loop
    while len(audio_segment) > chunk_size and audio_segment[:chunk_size].dBFS < silence_threshold:
        audio_segment = audio_segment[chunk_size:]
    while len(audio_segment) > chunk_size and audio_segment[-chunk_size:].dBFS < silence_threshold:
        audio_segment = audio_segment[:-chunk_size]
    return audio_segment


def process_tts(audio_path,voice: Voice, min_silence_len=50, silence_thresh=-50, ):
    """ Remove silence from an audio file and save the output and add 6db to the audio."""
    print(f"Loading {audio_path}")
    sound = AudioSegment.from_file(audio_path)
    print(f"Loaded successfully: Duration {sound.duration_seconds} seconds")
    if sound.duration_seconds < 0.1:
        print(f"Audio duration is too short: {sound.duration_seconds} seconds. Skipping export.")
        return

    # Trim silence from the start and end
    print("Trimming silence from the start and end...")
    sound = trim_silence(sound, silence_threshold=silence_thresh)

    print(f"Total duration before: {sound.duration_seconds} seconds")
    chunks = silence.split_on_silence(sound, min_silence_len=min_silence_len, silence_thresh=silence_thresh,
                                      keep_silence=30)

    # Check if chunks is empty
    if not chunks:
        print("No audio detected after silence removal. Skipping export.")
        return

    processed_sound = sum(chunks)
    processed_sound = processed_sound
    if voice.name.lower() in volume_offsets:
        processed_sound = processed_sound + volume_offsets[voice.name.lower()]

    output_path = audio_path
    processed_sound.export(output_path, format="mp3")
    print(f"Saved to {output_path}")

    try:
        reloaded_sound = AudioSegment.from_file(output_path)
        print(f"Reloaded successfully: Duration {reloaded_sound.duration_seconds} seconds")
        return round(reloaded_sound.duration_seconds, 3)
    except Exception as e:
        print(f"Failed to reload: {str(e)}")


def add_sfx(audio_fp, sound, type):
    temp_audio_fp = audio_fp.replace(".mp3", "-temp.mp3")
    sfx_fp = f"resources/sounds/{sound}.mp3"
    # pydub append audio
    base_audio = AudioSegment.from_file(audio_fp)
    sfx_audio = AudioSegment.from_file(sfx_fp)
    sfx_audio = sfx_audio - 2
    if type == "before":
        temp_audio = sfx_audio + base_audio
    elif type == "during":
        delay = base_audio.duration_seconds - sfx_audio.duration_seconds
        if delay < 0:
            temp_audio = sfx_audio.overlay(base_audio, position=0)
        else:
            temp_audio = base_audio.overlay(sfx_audio, position=delay * 1000)
    else:
        temp_audio = base_audio + sfx_audio
    temp_audio.export(temp_audio_fp, format="mp3")
    # delete old one and rename new one
    os.remove(audio_fp)
    os.rename(temp_audio_fp, audio_fp)
