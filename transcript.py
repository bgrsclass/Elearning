import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from urllib.parse import urlparse, parse_qs
from googletrans import Translator, LANGUAGES  # Google Translate API

# Initialize Google Translator
translator = Translator()

def get_available_languages(video_id):
    try:
        languages = YouTubeTranscriptApi.list_transcripts(video_id)
        return [language.language_code for language in languages]
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred while fetching available languages: {e}")
        return []

def get_transcript():
    video_url = url_entry.get()
    preferred_language = language_combobox.get().strip().lower()
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
        transcript_text.delete("1.0", tk.END)
        paragraph = ". ".join(item['text'] for item in transcript)
        transcript_text.insert(tk.END, paragraph)

        download_button_before.config(command=lambda: download_text(paragraph, "Transcript"))
    except TranscriptsDisabled:
        messagebox.showerror("Error", "Transcripts are disabled for this video.")
    except NoTranscriptFound:
        messagebox.showerror("Error", "No transcript found for this video in the selected language.")
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred: {e}")

def fetch_available_languages():
    video_url = url_entry.get()
    parsed_url = urlparse(video_url)
    if "youtu.be" in parsed_url.netloc:
        video_id = parsed_url.path.lstrip("/")
    elif "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v', [None])[0]
    else:
        messagebox.showerror("Error", "Invalid YouTube URL format")
        return

    available_languages = get_available_languages(video_id)
    if available_languages:
        language_combobox['values'] = list(set(available_languages))
        language_combobox.set(available_languages[0])

def download_text(content, file_label):
    if not content:
        messagebox.showerror("Error", "No text to download")
        return

    file_path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")])
    if not file_path:
        return

    try:
        with open(file_path, "w", encoding="utf-8") as file:
            file.write(content)
        messagebox.showinfo("Success", f"{file_label} downloaded successfully: {file_path}")
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred while saving the file: {e}")

def translate_transcript():
    transcript_content = transcript_text.get("1.0", tk.END).strip()
    if not transcript_content:
        messagebox.showerror("Error", "No transcript content to translate")
        return

    target_language_name = target_language_combobox.get().strip().lower()
    target_language_code = None
    for code, name in LANGUAGES.items():
        if name.lower() == target_language_name:
            target_language_code = code
            break

    if not target_language_code:
        messagebox.showerror("Error", "Invalid target language selected")
        return

    try:
        translated = translator.translate(transcript_content, dest=target_language_code)
        if not translated.text:
            messagebox.showerror("Error", "Translation failed: No translated text received")
            return

        translated_text = translated.text
        translated_text_display.delete("1.0", tk.END)
        translated_text_display.insert(tk.END, translated_text)

        download_button_after.config(command=lambda: download_text(translated_text, "Translated Transcript"))
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred during translation: {e}")

# Main application window
root = tk.Tk()
root.title("YouTube Transcript Fetcher")
root.geometry("900x800")

# URL Input
url_label = ttk.Label(root, text="Enter YouTube URL:")
url_label.pack(pady=5)
url_entry = ttk.Entry(root, width=50)
url_entry.pack(pady=5)

# Language Selection
language_label = ttk.Label(root, text="Select Preferred Language:")
language_label.pack(pady=5)
language_combobox = ttk.Combobox(root, width=20)
language_combobox.pack(pady=5)

# Fetch Button
fetch_button = ttk.Button(root, text="Fetch Transcript", command=get_transcript)
fetch_button.pack(pady=10)

# Transcript Display
transcript_text = tk.Text(root, wrap=tk.WORD, height=10, width=100)
transcript_text.pack(pady=10)

# Download Before Translation Button
download_button_before = ttk.Button(root, text="Download Transcript")
download_button_before.pack(pady=5)

# Translation Section
target_language_label = ttk.Label(root, text="Select Target Language for Translation:")
target_language_label.pack(pady=5)
target_language_combobox = ttk.Combobox(root, width=20)
target_language_combobox['values'] = list(LANGUAGES.values())
target_language_combobox.set("English")
target_language_combobox.pack(pady=5)

# Translate Button
translate_button = ttk.Button(root, text="Translate Transcript", command=translate_transcript)
translate_button.pack(pady=10)

# Translated Text Display
translated_text_display = tk.Text(root, wrap=tk.WORD, height=10, width=100)
translated_text_display.pack(pady=10)

# Download After Translation Button
download_button_after = ttk.Button(root, text="Download Translated Text")
download_button_after.pack(pady=5)

# URL Entry Listener
url_entry.bind("<FocusOut>", lambda event: fetch_available_languages())

# Run application
root.mainloop()
