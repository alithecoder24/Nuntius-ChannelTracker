from flask_wtf import FlaskForm
from wtforms import SelectField, SubmitField, RadioField, MultipleFileField
from wtforms.validators import DataRequired, Optional

class VideoGenerationForm(FlaskForm):
    """Form for video generation with voice, profile and optional files"""
    # Radio button for profile selection
    # Voice field - made optional since it will come from profile config
    voice = SelectField('Voice', 
                      validators=[Optional()],
                      render_kw={"placeholder": "Select voice"})
    
    voice_model = SelectField('Voice Model',
                          validators=[Optional()],
                          choices=[])
    
    
    profile = RadioField('Profile', 
                       validators=[DataRequired()])
    
    # Background video - made optional since it will come from profile config
    background_video = RadioField('Background Video', choices=[],
                                validators=[Optional()])
    
    # File upload field for text files
    text_files = MultipleFileField('Text Files',
                                validators=[Optional()],
                                render_kw={"accept": ".txt,.docx"})
    
    submit = SubmitField('Generate Video')

    def __init__(self, *args, voice_choices=None, profile_choices=None, background_video_choices=None, voice_model_choices=None, **kwargs):
        super(VideoGenerationForm, self).__init__(*args, **kwargs)
        if voice_choices:
            self.voice.choices = voice_choices
        if profile_choices:
            self.profile.choices = profile_choices
        if background_video_choices:
            self.background_video.choices = background_video_choices
        if voice_model_choices:
            self.voice_model.choices = voice_model_choices