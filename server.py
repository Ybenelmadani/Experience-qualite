#!/usr/bin/env python3
"""
YouTube to MP4 - Serveur Web Local
Fournit l'API pour télécharger les vidéos avec yt-dlp et sert le front-end HTML/CSS/JS.
"""

import os
import sys
import re
import json
import uuid
import shutil
import mimetypes
import threading
from urllib.parse import urlparse, parse_qs, unquote, quote
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Forcer l'encodage UTF-8 sous Windows pour éviter les crashs sur les titres en arabe ou émojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import yt_dlp
except ImportError:
    print("[!] yt-dlp n'est pas installe dans cet environnement.")
    print("--> Executez : pip install yt-dlp")
    sys.exit(1)

# Configuration des dossiers
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEOS_DIR = os.path.join(BASE_DIR, "videos")
COOKIE_FILE = os.path.join(BASE_DIR, "cookies.txt")
BROWSER = "firefox"  # Navigateur par défaut si cookies.txt n'existe pas

os.makedirs(VIDEOS_DIR, exist_ok=True)

# Détection de FFmpeg
FFMPEG_PATH = shutil.which("ffmpeg")
if not FFMPEG_PATH:
    winget_candidate = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.EXE")
    if os.path.exists(winget_candidate):
        FFMPEG_PATH = winget_candidate

# Dictionnaire en mémoire pour suivre la progression des téléchargements
# Format : { task_id: { "status": "downloading"|"finished"|"error", "percent": 50, ... } }
TASKS = {}

# Formats yt-dlp selon la qualité demandée
QUALITY_FORMATS = {
    480:  "bestvideo[vcodec^=avc1][height<=480]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best",
    720:  "bestvideo[vcodec^=avc1][height<=720]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
    1080: "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best",
    # 4K : d'abord H.264 si dispo, sinon meilleure qualité (AV1/VP9 → utiliser VLC pour lire)
    2160: "bestvideo[vcodec^=avc1][height<=2160]+bestaudio[acodec^=mp4a]/bestvideo[height<=2160]+bestaudio/best[height<=2160]/best",
}


def format_bytes(bytes_count):
    if not bytes_count:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_count < 1024.0:
            return f"{bytes_count:.1f} {unit}"
        bytes_count /= 1024.0
    return f"{bytes_count:.1f} TB"


def run_yt_dlp_download(task_id, url, quality=1080):
    """Exécute yt-dlp dans un thread séparé avec rapport de progression."""
    task = TASKS[task_id]

    def progress_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            percent = (downloaded / total * 100) if total > 0 else 0
            speed = d.get('speed') or 0
            eta = d.get('eta') or 0

            speed_str = f"{format_bytes(speed)}/s" if speed else ""
            task.update({
                "status": "downloading",
                "percent": round(percent, 1),
                "downloaded": format_bytes(downloaded),
                "total": format_bytes(total),
                "speed": speed_str,
                "eta": eta
            })
        elif d['status'] == 'finished':
            filename = os.path.basename(d.get('filename', ''))
            task.update({
                "status": "downloading",
                "percent": 99,
                "substatus": "Finalisation du fichier MP4..."
            })

    # Choix du format selon la qualité demandée (par défaut 1080p)
    fmt = QUALITY_FORMATS.get(quality, QUALITY_FORMATS[1080])

    options = {
        "format": fmt,
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(VIDEOS_DIR, "%(title)s.%(ext)s"),
        "noplaylist": True,
        "nopart": True,  # Évite WinError 32 (verrouillage Windows / antivirus sur les fichiers .part)
        "windowsfilenames": True,  # Nom de fichier compatible avec le système Windows
        "retries": 10,
        "fragment_retries": 10,
        "sleep_interval_requests": 1,
        "progress_hooks": [progress_hook],
        "quiet": True,
        "no_warnings": True,
    }

    # Configuration de FFmpeg si disponible
    if FFMPEG_PATH:
        options["ffmpeg_location"] = os.path.dirname(FFMPEG_PATH)

    # Configuration des cookies
    if os.path.exists(COOKIE_FILE):
        options["cookiefile"] = COOKIE_FILE
    elif BROWSER:
        try:
            options["cookiesfrombrowser"] = (BROWSER,)
        except Exception:
            pass

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            # Récupération des informations sans bloquer
            info = ydl.extract_info(url, download=True)
            saved_filename = ydl.prepare_filename(info)
            # En cas de conversion en mp4
            base, _ = os.path.splitext(saved_filename)
            mp4_filename = os.path.basename(f"{base}.mp4")

            task.update({
                "status": "finished",
                "percent": 100,
                "filename": mp4_filename,
                "title": info.get("title", "Vidéo")
            })

    except yt_dlp.utils.DownloadError as e:
        # Nettoyer les codes ANSI (ex: [0;31mERROR:[0m) pour un affichage propre
        clean_err = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', str(e))
        task.update({
            "status": "error",
            "error": clean_err
        })
    except Exception as e:
        task.update({
            "status": "error",
            "error": f"Erreur inattendue : {str(e)}"
        })


class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API : Progression d'un téléchargement
        if path == "/api/progress":
            params = parse_qs(parsed.query)
            task_id = params.get("id", [None])[0]
            if task_id and task_id in TASKS:
                self.send_json_response(TASKS[task_id])
            else:
                self.send_json_response({"status": "not_found"}, status=404)
            return

        # API : Liste des fichiers vidéo téléchargés
        if path == "/api/videos":
            files = []
            if os.path.exists(VIDEOS_DIR):
                for f in os.listdir(VIDEOS_DIR):
                    if f.lower().endswith(('.mp4', '.mkv', '.webm')):
                        full_path = os.path.join(VIDEOS_DIR, f)
                        size = os.path.getsize(full_path)
                        files.append({"name": f, "size": format_bytes(size)})
            self.send_json_response({"videos": files})
            return

        # Fichiers vidéo dans /videos/...
        if path.startswith("/videos/"):
            filename = unquote(path[len("/videos/"):])
            filepath = os.path.join(VIDEOS_DIR, filename)
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.serve_file(filepath)
                return

        # Par défaut : servir les fichiers statiques (index.html, style.css, script.js)
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/download":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode("utf-8"))
                url = data.get("url", "").strip()
                quality = int(data.get("quality", 1080))
                if quality not in (480, 720, 1080, 2160):
                    quality = 1080
            except Exception:
                url = ""
                quality = 1080

            if not url:
                self.send_json_response({"error": "URL manquante"}, status=400)
                return

            task_id = str(uuid.uuid4())
            TASKS[task_id] = {
                "status": "starting",
                "percent": 0,
                "url": url,
                "quality": quality
            }

            # Démarrage du téléchargement en tâche de fond
            thread = threading.Thread(target=run_yt_dlp_download, args=(task_id, url, quality), daemon=True)
            thread.start()

            self.send_json_response({"task_id": task_id, "status": "started", "quality": quality})
            return

        self.send_json_response({"error": "Endpoint non trouvé"}, status=404)

    def do_OPTIONS(self):
        """Gestion des requêtes CORS pré-vol pour Live Server ou clients distants."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def serve_file(self, filepath):
        """Sert un fichier avec le type MIME approprié pour le téléchargement direct."""
        try:
            with open(filepath, 'rb') as f:
                content = f.read()

            mime_type, _ = mimetypes.guess_type(filepath)
            if not mime_type:
                mime_type = "application/octet-stream"

            filename = os.path.basename(filepath)
            safe_filename = quote(filename)
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{safe_filename}")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Erreur lecture fichier : {str(e)}")

    def send_json_response(self, data, status=200):
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(response_bytes)


def start_server(port=5000):
    server_address = ('', port)
    try:
        httpd = ThreadingHTTPServer(server_address, CustomHTTPRequestHandler)
        print("=" * 60)
        print("[OK] SERVEUR YOUTUBE TO MP4 DEMARRE AVEC SUCCES !")
        print(f"--> Ouvrez dans votre navigateur : http://localhost:{port}")
        print("=" * 60)
        print("[i] Appuyez sur Ctrl+C pour arreter le serveur.")
        httpd.serve_forever()
    except OSError as e:
        if port < 5010:
            print(f"Port {port} occupe, tentative sur {port + 1}...")
            start_server(port + 1)
        else:
            print(f"Erreur demarrage : {e}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    start_server(port)
