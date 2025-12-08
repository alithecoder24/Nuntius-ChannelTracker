from dataclasses import dataclass


NUMBER_OF_LETTER_VOICES = 10


def split_on_line_separators(script, separator):
    segments = []
    current_segment = ""
    for line in script.splitlines():
        if separator == line.strip():
            segments.append(current_segment)
            current_segment = ""
        else:
            current_segment += line + "\n"
    if current_segment:
        segments.append(current_segment)
    return segments


@dataclass
class Person:
    name: str
    voice: str
    image: str | None


@dataclass
class Data:
    name: str
    script: str
    dark_mode: bool
    images: list
    status: str
    id: str
    language: str
    people: list[Person]

    @property
    def number_of_people(self):
        return len(getattr(self, 'people', []))

    @property
    def to_json(self):
        data_dict = self.__dict__.copy()

        data_dict.pop('people')
        # for the json file, don't have them nested, instead have them as separate keys
        data_dict.update({f'voice_{chr(97 + i)}': self.people[i].voice for i in range(NUMBER_OF_LETTER_VOICES)})
        data_dict.update({f'name_{chr(97 + i)}': self.people[i].name for i in range(NUMBER_OF_LETTER_VOICES)})
        data_dict.update({f'image_{chr(97 + i)}': self.people[i].image for i in range(NUMBER_OF_LETTER_VOICES)})
        return data_dict


@dataclass
class MessageData:
    y_offset: int
    is_sender: bool
    is_image: bool
    is_undelivered: bool
    is_emoji_only: bool
    is_text_only: bool
    text_content: str
    voice: str
    name: str
    image: str | None
    before_sound_effects: list
    after_sound_effects: list
    during_sound_effects: list

    @property
    def person(self):
        return Person(self.name, self.voice, self.image)

