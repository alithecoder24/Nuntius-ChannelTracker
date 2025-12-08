import json
import os
import subprocess
import sys
from datetime import datetime
from threading import Thread

from elevenlabs.client import ElevenLabs
from flask import Flask, render_template, request, redirect, url_for
from flask_wtf.file import FileField
from werkzeug.utils import secure_filename
from flask_wtf import FlaskForm as Form
from wtforms import StringField, validators
from wtforms.fields.choices import SelectField, RadioField
from wtforms.fields.simple import TextAreaField, MultipleFileField, SubmitField, BooleanField
from dotenv import load_dotenv

from utils import Person, NUMBER_OF_LETTER_VOICES
from video import VideoGenerator, Data, base_output_dir

load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
client = ElevenLabs(
    api_key=os.getenv('ELEVENLABS_API_KEY'),
)

voices = [(None, '')] + [(voice.voice_id, voice.name) for voice in client.voices.get_all(show_legacy=True).voices]


class GenerateVideoForm(Form):
    name = StringField('Project Name', [validators.Length(min=1, max=25)])
    script = TextAreaField('Script', [validators.Length(min=4, max=1000000)])
    dark_mode = BooleanField('Darkmode', default=False)
    language = RadioField('Language', choices=[('en', 'English'), ('de', 'German'), ('es', 'Spanish')], default='en')
    images = MultipleFileField('Chat Images')
    submit_button = SubmitField('Generate Video')
    # eleven labs voices
    voice_a = SelectField('Voice A', choices=voices, validators=[validators.DataRequired()])
    name_a = StringField('Name A', [validators.DataRequired(), validators.Length(min=1, max=25)])
    image_a = FileField('Image A')

    voice_b = SelectField('Voice B', choices=voices, validators=[validators.DataRequired()])
    name_b = StringField('Name B', [validators.DataRequired(), validators.Length(min=1, max=25)])
    image_b = FileField('Image B')

    voice_c = SelectField('Voice C', choices=voices, validate_choice=False)
    name_c = StringField('Name C', [validators.Length(min=0, max=25)])
    image_c = FileField('Image C')

    voice_d = SelectField('Voice D', choices=voices, validate_choice=False)
    name_d = StringField('Name D', [validators.Length(min=0, max=25)])
    image_d = FileField('Image D')

    voice_e = SelectField('Voice E', choices=voices, validate_choice=False)
    name_e = StringField('Name E', [validators.Length(min=0, max=25)])
    image_e = FileField('Image E')

    voice_f = SelectField('Voice F', choices=voices, validate_choice=False)
    name_f = StringField('Name F', [validators.Length(min=0, max=25)])
    image_f = FileField('Image F')

    voice_g = SelectField('Voice G', choices=voices, validate_choice=False)
    name_g = StringField('Name G', [validators.Length(min=0, max=25)])
    image_g = FileField('Image G')

    voice_h = SelectField('Voice H', choices=voices, validate_choice=False)
    name_h = StringField('Name H', [validators.Length(min=0, max=25)])
    image_h = FileField('Image H')

    voice_i = SelectField('Voice I', choices=voices, validate_choice=False)
    name_i = StringField('Name I', [validators.Length(min=0, max=25)])
    image_i = FileField('Image I')

    voice_j = SelectField('Voice J', choices=voices, validate_choice=False)
    name_j = StringField('Name J', [validators.Length(min=0, max=25)])
    image_j = FileField('Image J')


SCRIPTS_PATH = 'scripts'
SOUNDS_PATH = 'resources/sounds'
video_generator: VideoGenerator


@app.route('/', methods=['GET', 'POST'])
def index():
    # get scripts data
    scripts = []
    for script in os.listdir(SCRIPTS_PATH):
        # enter folder
        script_dir = f'{SCRIPTS_PATH}/{script}/{script.split("---")[0]}.json'
        if not os.path.isdir(f'{SCRIPTS_PATH}/{script}'):
            continue
        elif not os.path.exists(script_dir):
            continue
        with open(script_dir, 'r') as f:
            preloaded_data = json.loads(f.read())
            scripts.append(preloaded_data)

    sounds = [sound.replace('.mp3', '') for sound in os.listdir(SOUNDS_PATH) if sound.endswith('.mp3')]
    if request.method == 'POST':
        form = GenerateVideoForm(request.form)
        if form.validate():
            name = form.name.data
            image_filenames = [secure_filename(image.filename) for image in request.files.getlist('images')]
            time_stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            # generate folder for the script
            folder = f'{SCRIPTS_PATH}/{name}---{time_stamp}'
            os.makedirs(folder)
            people = []
            print("Creating Images")
            for i in range(NUMBER_OF_LETTER_VOICES):
                voice = form.__dict__[f'voice_{chr(97 + i)}'].data
                person_name = form.__dict__[f'name_{chr(97 + i)}'].data
                image = request.files.get(f'image_{chr(97 + i)}')
                if image:
                    filename = secure_filename("pfp_" + image.filename)
                    image.save(f'{folder}/{filename}')
                else:
                    filename = None

                people.append(
                    Person(
                        voice=voice if voice else None,
                        name=person_name if person_name else None,
                        image=filename
                    )
                )

            data_dict = {
                'name': name,
                'script': form.script.data,
                'dark_mode': form.dark_mode.data,
                'images': image_filenames,
                'status': 'pending',
                'id': f'{name}---{time_stamp}',
                'language': form.language.data,
                'people': people
            }
            # for the Data object we will have the people as a list of Person objects
            data = Data(**data_dict)

            # create json file containing all the data
            with open(f'{folder}/{name}.json', 'w') as f:
                json_data = json.dumps(data.to_json)
                f.write(json_data)
            #  add images to the folder
            for image in request.files.getlist('images'):
                if not image:
                    continue
                image.save(f'{folder}/{secure_filename(image.filename)}')

            global video_generator
            video_generator = VideoGenerator(data=data, script_path=SCRIPTS_PATH)

            # generate_images(script)
            thread = Thread(target=video_generator.generate_video)
            thread.start()
            return redirect(url_for('success', id=data.id))
        else:
            return render_template('index.html', form=form, scripts=scripts, sounds=sounds)
    else:
        form = GenerateVideoForm()
        # prefill form with default values from scripts
        last_script = scripts[-1] if scripts else None
        if request.args.get('script'):
            preload_script = request.args.get('script')
            found_scripts = [script for script in scripts if script['id'] == preload_script]
            if found_scripts:
                last_script = found_scripts[0]

        if last_script:
            for key, value in last_script.items():
                if key in form.__dict__:
                    form.__dict__[key].data = value
        scripts.reverse()

        return render_template('index.html', form=form, scripts=scripts, sounds=sounds)


@app.route('/success')
def success():
    return render_template('success.html')


@app.route('/get_status/<id>', methods=['GET'])
def get_status(id):
    with open(f'{SCRIPTS_PATH}/{id}/{id.split("---")[0]}.json', 'r') as f:
        data = json.loads(f.read())
    return data


@app.route('/stop', methods=['GET'])
def stop():
    global video_generator
    if video_generator is not None:
        video_generator.stop_process()
    return redirect(url_for('index'))


@app.route('/set_api_key', methods=['POST'])
def set_api_key():
    api_key = request.json.get('api_key')
    client.api_key = api_key
    # save api key to .env
    with open('.env', 'r') as f:
        lines = f.readlines()
    with open('.env', 'w') as f:
        for line in lines:
            if 'ELEVENLABS_API_KEY' in line:
                f.write(f'ELEVENLABS_API_KEY={api_key}\n')
            else:
                f.write(line)

    global voices
    voices = [(voice.voice_id, voice.name) for voice in client.voices.get_all().voices]
    return {"success": True}, 200


@app.route('/open_video/<id>', methods=['GET'])
def open_video(id):
    try:
        fp = os.path.realpath(f'{base_output_dir}/{id.split("---")[1]}/')
        # full fp
        if sys.platform == "win32":
            os.startfile(fp)
        else:
            opener = "open" if sys.platform == "darwin" else "xdg-open"
            subprocess.call([opener, fp])
        return {"success": True}, 200
    except Exception as e:
        print(e)
        return {"success": False, "error": str(e)}, 500


if __name__ == '__main__':
    app.run()
