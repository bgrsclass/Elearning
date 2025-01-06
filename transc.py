import cherrypy
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from urllib.parse import urlparse, parse_qs
from googletrans import Translator, LANGUAGES
from cherrypy.lib import static
import os

# Initialize Google Translator
translator = Translator()

# Utility function to get available languages for a given video
def get_available_languages(video_id):
    try:
        languages = YouTubeTranscriptApi.list_transcripts(video_id)
        return [language.language_code for language in languages]
    except Exception as e:
        raise Exception(f"Error fetching available languages: {e}")

# Fetch transcript logic
def get_transcript(video_url, preferred_language):
    try:
        parsed_url = urlparse(video_url)
        if "youtu.be" in parsed_url.netloc:
            video_id = parsed_url.path.lstrip("/")
        elif "youtube.com" in parsed_url.netloc:
            video_id = parse_qs(parsed_url.query).get('v', [None])[0]
        else:
            raise ValueError("Invalid YouTube URL format")
        if not video_id:
            raise ValueError("Video ID could not be extracted from the URL")

        available_languages = get_available_languages(video_id)
        if not available_languages:
            raise ValueError("No available languages for the transcript")
        if preferred_language not in available_languages:
            raise ValueError(f"Transcript not available in the selected language: {preferred_language}")

        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[preferred_language])
        transcript_text = ". ".join(item['text'] for item in transcript)
        return transcript_text
    except TranscriptsDisabled:
        raise Exception("Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise Exception("No transcript found for this video in the selected language.")
    except Exception as e:
        raise Exception(f"An error occurred: {e}")

# Translate transcript logic
def translate_transcript(transcript_content, target_language_name):
    target_language_code = None
    for code, name in LANGUAGES.items():
        if name.lower() == target_language_name:
            target_language_code = code
            break

    if not target_language_code:
        raise ValueError("Invalid target language selected")

    try:
        translated = translator.translate(transcript_content, dest=target_language_code)
        return translated.text
    except Exception as e:
        raise Exception(f"An error occurred during translation: {e}")

# CherryPy Web Application Class
class TranscriptFetcherApp:
    @cherrypy.expose
    def index(self):
        return '''
            <html>
                <head><title>YouTube Transcript Fetcher</title></head>
                <body>
                    <h2>Enter YouTube URL:</h2>
                    <form method="get" action="fetch_transcript">
                        <input type="text" name="video_url" placeholder="Enter URL here" required>
                        <br><br>
                        <label for="language">Select Preferred Language:</label>
                        <select name="preferred_language" required>
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                            <option value="fr">French</option>
                            <!-- Add more languages as needed -->
                        </select>
                        <br><br>
                        <input type="submit" value="Fetch Transcript">
                    </form>
                </body>
            </html>
        '''
    
    @cherrypy.expose
    def fetch_transcript(self, video_url, preferred_language):
        try:
            transcript = get_transcript(video_url, preferred_language)
            return f'''
                <html>
                    <head><title>Transcript</title></head>
                    <body>
                        <h2>Transcript:</h2>
                        <p>{transcript}</p>
                        <form method="get" action="translate_transcript">
                            <textarea name="transcript" style="width:100%; height:200px;">{transcript}</textarea>
                            <br><br>
                            <label for="target_language">Select Target Language for Translation:</label>
                            <select name="target_language" required>
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <!-- Add more languages as needed -->
                            </select>
                            <br><br>
                            <input type="submit" value="Translate">
                        </form>
                    </body>
                </html>
            '''
        except Exception as e:
            return f'<h2>Error: {e}</h2>'
    
    @cherrypy.expose
    def translate_transcript(self, transcript, target_language):
        try:
            translated_text = translate_transcript(transcript, target_language)
            return f'''
                <html>
                    <head><title>Translated Transcript</title></head>
                    <body>
                        <h2>Translated Transcript:</h2>
                        <p>{translated_text}</p>
                        <form method="get" action="download">
                            <textarea name="file_content" style="width:100%; height:200px;">{translated_text}</textarea>
                            <br><br>
                            <input type="submit" value="Download Translated Text">
                        </form>
                    </body>
                </html>
            '''
        except Exception as e:
            return f'<h2>Error: {e}</h2>'
    
    @cherrypy.expose
    def download(self, file_content):
        try:
            file_path = '/tmp/transcript.txt'  # Temporary file path
            with open(file_path, 'w', encoding='utf-8') as file:
                file.write(file_content)
            cherrypy.response.headers['Content-Type'] = 'text/plain'
            cherrypy.response.headers['Content-Disposition'] = f'attachment; filename="translated_transcript.txt"'
            return open(file_path, 'r')
        except Exception as e:
            return f'<h2>Error: {e}</h2>'

if __name__ == '__main__':
    cherrypy.quickstart(TranscriptFetcherApp())
