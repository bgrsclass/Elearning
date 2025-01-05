import streamlit as st
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from urllib.parse import urlparse, parse_qs
from googletrans import Translator, LANGUAGES  # Google Translate API
from io import StringIO

# Initialize Google Translator
translator = Translator()

def get_available_languages(video_id):
    try:
        languages = YouTubeTranscriptApi.list_transcripts(video_id)
        return [language.language_code for language in languages]
    except Exception as e:
        st.error(f"An error occurred while fetching available languages: {e}")
        return []

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
        paragraph = ". ".join(item['text'] for item in transcript)
        return paragraph
    except TranscriptsDisabled:
        st.error("Transcripts are disabled for this video.")
    except NoTranscriptFound:
        st.error("No transcript found for this video in the selected language.")
    except Exception as e:
        st.error(f"An error occurred: {e}")

def translate_transcript(transcript_content, target_language_name):
    target_language_code = None
    for code, name in LANGUAGES.items():
        if name.lower() == target_language_name.lower():
            target_language_code = code
            break

    if not target_language_code:
        st.error("Invalid target language selected")
        return ""

    try:
        translated = translator.translate(transcript_content, dest=target_language_code)
        return translated.text
    except Exception as e:
        st.error(f"An error occurred during translation: {e}")
        return ""

# Streamlit application UI
st.title("YouTube Transcript Fetcher")

# URL Input
url = st.text_input("Enter YouTube URL:")
if url:
    # Fetch available languages
    parsed_url = urlparse(url)
    if "youtu.be" in parsed_url.netloc:
        video_id = parsed_url.path.lstrip("/")
    elif "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v', [None])[0]
    else:
        st.error("Invalid YouTube URL format")
        video_id = None

    if video_id:
        available_languages = get_available_languages(video_id)
        selected_language = st.selectbox("Select Preferred Language", available_languages)

        # Fetch Transcript
        if st.button("Fetch Transcript"):
            transcript = get_transcript(url, selected_language)
            if transcript:
                st.text_area("Transcript", transcript, height=300)
                # Download Button
                st.download_button("Download Transcript", transcript, file_name="transcript.txt", mime="text/plain")

                # Translate Section
                target_language = st.selectbox("Select Target Language for Translation", list(LANGUAGES.values()))
                if st.button("Translate Transcript"):
                    translated_text = translate_transcript(transcript, target_language)
                    if translated_text:
                        st.text_area("Translated Transcript", translated_text, height=300)
                        # Download Translated Text Button
                        st.download_button("Download Translated Transcript", translated_text, file_name="translated_transcript.txt", mime="text/plain")
