import os
import yt_dlp

# ==============================
# 📥 Lien YouTube
# ==============================
url = "https://youtu.be/Wjv9Dn0rTu8"

# ==============================
# 🍪 Cookies (choisis UNE méthode)
# ==============================
# Méthode 1 : fichier cookies.txt à côté du script (la plus fiable sous Windows)
# Méthode 2 : cookies lus depuis le navigateur (fermé avant de lancer)
COOKIE_FILE = "cookies.txt"
BROWSER = "firefox"  # "firefox", "chrome" ou "edge"

# ==============================
# ⚙️ Configuration
# ==============================
os.makedirs("videos", exist_ok=True)

options = {
    "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
    "merge_output_format": "mp4",
    "outtmpl": "videos/%(title)s.%(ext)s",
    "noplaylist": True,
    "retries": 5,
    "fragment_retries": 5,
    "sleep_interval_requests": 1,
}

# Utilise cookies.txt s'il existe, sinon les cookies du navigateur
if os.path.exists(COOKIE_FILE):
    options["cookiefile"] = COOKIE_FILE
    print(f"🍪 Cookies : fichier {COOKIE_FILE}")
else:
    options["cookiesfrombrowser"] = (BROWSER,)
    print(f"🍪 Cookies : navigateur {BROWSER} (ferme-le avant de lancer)")

# ==============================
# 🚀 Téléchargement
# ==============================
try:
    print("⏳ Téléchargement en cours...\n")
    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([url])
    print("\n✅ Téléchargement terminé !")
    print("📁 Vidéo dans le dossier : videos")

except yt_dlp.utils.DownloadError as e:
    print("\n❌ Erreur de téléchargement :")
    print(e)
    print("\n💡 Vérifie : cookies valides, Deno installé, FFmpeg installé, VPN désactivé.")

except Exception as e:
    print("\n❌ Erreur inattendue :")
    print(e)