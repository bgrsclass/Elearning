from flask import Flask, render_template_string, request, send_file
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from urllib.parse import urlparse, parse_qs
from googletrans import Translator, LANGUAGES
import os
from flask import redirect
from flask import url_for

app = Flask(__name__)
translator = Translator()

# Ensure the downloads directory exists
os.makedirs("downloads", exist_ok=True)

def get_available_languages(video_id):
    try:
        languages = YouTubeTranscriptApi.list_transcripts(video_id)
        return [language.language_code for language in languages]
    except Exception as e:
        return []

def get_transcript(video_id, preferred_language):
    try:
        available_languages = get_available_languages(video_id)
        if preferred_language not in available_languages:
            raise ValueError("Transcript not available in the selected language.")
        
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[preferred_language])
        transcript_text = ". ".join(item['text'] for item in transcript)
        return transcript_text
    except TranscriptsDisabled:
        return "Transcripts are disabled for this video."
    except NoTranscriptFound:
        return "No transcript found for this video in the selected language."
    except Exception as e:
        return f"An error occurred: {e}"

def translate_transcript(content, target_language):
    try:
        translated = translator.translate(content, dest=target_language)
        return translated.text
    except Exception as e:
        return f"An error occurred during translation: {e}"

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        video_url = request.form.get("url")
        preferred_language = request.form.get("language").strip().lower()
        target_language = request.form.get("target_language").strip().lower()

        # Extract video ID
        parsed_url = urlparse(video_url)
        if "youtu.be" in parsed_url.netloc:
            video_id = parsed_url.path.lstrip("/")
        elif "youtube.com" in parsed_url.netloc:
            video_id = parse_qs(parsed_url.query).get('v', [None])[0]
        else:
            return render_template_string(html_template, error="Invalid YouTube URL format")

        # Fetch Transcript
        transcript = get_transcript(video_id, preferred_language)

        # Translate Transcript
        translated_transcript = translate_transcript(transcript, target_language)

        # Provide options for download
        return render_template_string(html_template, transcript=transcript, translated_transcript=translated_transcript,
                                      languages=LANGUAGES, video_url=video_url, target_language=target_language)

    return render_template_string(html_template, languages=LANGUAGES)

@app.route("/download", methods=["POST"])
def download():
    content = request.form.get("content")
    file_name = request.form.get("file_name")
    if content:
        file_path = os.path.join("downloads", f"{file_name}.txt")
        with open(file_path, "w", encoding="utf-8") as file:
            file.write(content)
        return send_file(file_path, as_attachment=True)
    return redirect(url_for("index"))

html_template = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube Transcript Fetcher</title>
</head>
<body>
    <h1>YouTube Transcript Fetcher</h1>
    <form action="/" method="POST">
        <label for="url">Enter YouTube URL:</label>
        <input type="text" id="url" name="url" value="{{ video_url or '' }}" required><br><br>

        <label for="language">Select Preferred Language:</label>
        <select id="language" name="language" required>
            {% for lang in languages %}
            <option value="{{ lang }}" {% if lang == 'en' %}selected{% endif %}>{{ lang }}</option>
            {% endfor %}
        </select><br><br>

        <label for="target_language">Select Target Language for Translation:</label>
        <select id="target_language" name="target_language" required>
            {% for code, lang in languages.items() %}
            <option value="{{ code }}" {% if code == 'en' %}selected{% endif %}>{{ lang }}</option>
            {% endfor %}
        </select><br><br>

        <button type="submit">Fetch Transcript</button>
    </form>

    {% if transcript %}
    <h2>Transcript:</h2>
    <textarea rows="10" cols="100" readonly>{{ transcript }}</textarea><br><br>
    <form action="/download" method="POST">
        <input type="hidden" name="content" value="{{ transcript }}">
        <input type="hidden" name="file_name" value="Transcript">
        <button type="submit">Download Transcript</button>
    </form>
    {% endif %}

    {% if translated_transcript %}
    <h2>Translated Transcript:</h2>
    <textarea rows="10" cols="100" readonly>{{ translated_transcript }}</textarea><br><br>
    <form action="/download" method="POST">
        <input type="hidden" name="content" value="{{ translated_transcript }}">
        <input type="hidden" name="file_name" value="Translated_Transcript">
        <button type="submit">Download Translated Transcript</button>
    </form>
    {% endif %}

    {% if error %}
    <p style="color:red">{{ error }}</p>
    {% endif %}
</body>
</html>
"""

if __name__ == "__main__":
    app.run(debug=True)
