/**
 * YouTube MP4 Converter – script.js (module)
 * Supporte 480p/720p (direct) et 1080p/4K (merge FFmpeg.wasm côté navigateur)
 */

// ── Import FFmpeg.wasm depuis CDN ───────────────────────────────────────────
import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/esm/index.js';
import { fetchFile, toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';

// ── Éléments du DOM ─────────────────────────────────────────────────────────
const videoUrlInput    = document.getElementById('videoUrl');
const urlForm          = document.getElementById('urlForm');
const pasteBtn         = document.getElementById('pasteBtn');
const clearBtn         = document.getElementById('clearBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const previewSection   = document.getElementById('previewSection');
const videoThumbnail   = document.getElementById('videoThumbnail');
const videoTitle       = document.getElementById('videoTitle');
const videoAuthor      = document.getElementById('videoAuthor');
const actionDownloadBtn= document.getElementById('actionDownloadBtn');
const openYoutubeLink  = document.getElementById('openYoutubeLink');
const copyImageBtn     = document.getElementById('copyImageBtn');
const qualityBadge     = document.getElementById('qualityBadge');
const progressContainer= document.getElementById('progressContainer');
const progressBar      = document.getElementById('progressBar');
const progressText     = document.getElementById('progressText');
const progressPercent  = document.getElementById('progressPercent');
const statusMessage    = document.getElementById('statusMessage');
const toastEl          = document.getElementById('toast');

let currentVideoId      = null;
let currentThumbnailUrl = null;
let selectedQuality     = 720;
let ffmpegInstance      = null;

// ── Sélecteur de qualité ─────────────────────────────────────────────────────
const qualityPills = document.querySelectorAll('.quality-pill');
const qualityNote  = document.getElementById('qualityNote');

const qualityNotes = {
    480:  'Petite taille · Lecture rapide sur mobile',
    720:  'Meilleure compatibilité · Son inclus',
    1080: 'Full HD · Merge automatique dans votre navigateur',
    2160: '4K Ultra HD · Merge automatique (peut prendre 1-2 min)'
};

const qualityBadgeLabels = {
    480:  '480p SD / MP4',
    720:  'HD 720p / MP4',
    1080: 'Full HD 1080p / MP4',
    2160: '4K 2160p / MP4'
};

qualityPills.forEach(pill => {
    pill.addEventListener('click', () => {
        qualityPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedQuality = parseInt(pill.dataset.quality, 10);
        if (qualityNote)  qualityNote.textContent  = qualityNotes[selectedQuality] || '';
        if (qualityBadge) qualityBadge.textContent = qualityBadgeLabels[selectedQuality] || '';
    });
});

// ── Extraction ID YouTube ────────────────────────────────────────────────────
function extractYouTubeId(url) {
    if (!url) return null;
    const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
    const match = url.trim().match(regExp);
    return match ? match[1] : null;
}

// ── Chargement aperçu vidéo ──────────────────────────────────────────────────
function loadVideoPreview(videoId, rawUrl) {
    if (!videoId) { hidePreview(); return; }

    currentVideoId = videoId;
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const hqResUrl  = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    videoThumbnail.src = maxResUrl;
    currentThumbnailUrl = maxResUrl;

    videoThumbnail.onload = function () {
        if (videoThumbnail.naturalWidth === 120) {
            videoThumbnail.src = hqResUrl;
            currentThumbnailUrl = hqResUrl;
        }
    };
    videoThumbnail.onerror = function () {
        videoThumbnail.src = hqResUrl;
        currentThumbnailUrl = hqResUrl;
    };

    openYoutubeLink.href = `https://www.youtube.com/watch?v=${videoId}`;
    videoTitle.textContent  = "Chargement des informations...";
    videoAuthor.textContent = "YouTube Video";
    previewSection.classList.remove('hidden');

    fetchOEmbedData(videoId, rawUrl);
}

function hidePreview() {
    currentVideoId = null;
    previewSection.classList.add('hidden');
    hideProgress();
    hideStatus();
}

async function fetchOEmbedData(videoId, rawUrl) {
    const targetUrl = rawUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
    try {
        const res = await fetch(oembedUrl);
        if (res.ok) {
            const data = await res.json();
            videoTitle.textContent  = data.title        || "Vidéo YouTube";
            videoAuthor.textContent = data.author_name ? `Chaîne : ${data.author_name}` : "YouTube";
        } else {
            videoTitle.textContent = `Vidéo ID : ${videoId}`;
        }
    } catch {
        videoTitle.textContent = `Vidéo YouTube (${videoId})`;
    }
}

// ── Événements Input ─────────────────────────────────────────────────────────
videoUrlInput.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val.length > 0) {
        clearBtn.classList.remove('hidden');
        const id = extractYouTubeId(val);
        if (id) loadVideoPreview(id, val);
        else hidePreview();
    } else {
        clearBtn.classList.add('hidden');
        hidePreview();
    }
});

clearBtn.addEventListener('click', () => {
    videoUrlInput.value = '';
    clearBtn.classList.add('hidden');
    hidePreview();
    videoUrlInput.focus();
});

pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            videoUrlInput.value = text.trim();
            clearBtn.classList.remove('hidden');
            const id = extractYouTubeId(text);
            if (id) { loadVideoPreview(id, text.trim()); showToast("Lien collé !"); }
            else showToast("Ce lien n'est pas une URL YouTube valide.");
        }
    } catch {
        videoUrlInput.focus();
        showToast("Utilisez Ctrl+V pour coller.");
    }
});

copyImageBtn.addEventListener('click', async () => {
    if (!currentThumbnailUrl) return;
    try {
        await navigator.clipboard.writeText(currentThumbnailUrl);
        showToast("Lien miniature copié !");
    } catch {
        showToast(currentThumbnailUrl);
    }
});

// ── Chargement FFmpeg.wasm (lazy) ────────────────────────────────────────────
async function loadFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;

    showProgress("⏳ Chargement FFmpeg WebAssembly (première fois ~30 sec)...", 10);

    const ffmpeg = new FFmpeg();

    // Afficher la progression de l'encodage
    ffmpeg.on('progress', ({ progress }) => {
        const pct = Math.round(progress * 100);
        showProgress(`🔧 Fusion vidéo+audio en cours... ${pct}%`, 60 + Math.round(progress * 35));
    });

    // Charger le core depuis CDN jsDelivr (supporte crossOriginIsolated)
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
        coreURL:   await toBlobURL(`${baseURL}/ffmpeg-core.js`,    'text/javascript'),
        wasmURL:   await toBlobURL(`${baseURL}/ffmpeg-core.wasm`,  'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
}

// ── Fusion vidéo + audio (1080p / 4K) ───────────────────────────────────────
async function mergeVideoAudio(videoUrl, audioUrl, filename) {
    try {
        const ffmpeg = await loadFFmpeg();
        showProgress("📥 Téléchargement du flux vidéo HD...", 25);

        const videoData = await fetchFile(videoUrl);
        showProgress("📥 Téléchargement du flux audio...", 45);

        const audioData = await fetchFile(audioUrl);
        showProgress("🔧 Fusion vidéo + audio (FFmpeg)...", 60);

        // Écrire les fichiers dans le système de fichiers virtuel de FFmpeg
        ffmpeg.writeFile('video_in.mp4',  videoData);
        ffmpeg.writeFile('audio_in.webm', audioData);

        // Merger : copie sans ré-encodage (très rapide)
        await ffmpeg.exec([
            '-i', 'video_in.mp4',
            '-i', 'audio_in.webm',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
            'output.mp4'
        ]);

        showProgress("💾 Préparation du fichier final...", 98);

        const data = await ffmpeg.readFile('output.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        // Téléchargement automatique
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Nettoyage mémoire
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

        // Nettoyer les fichiers virtuels
        try {
            ffmpeg.deleteFile('video_in.mp4');
            ffmpeg.deleteFile('audio_in.webm');
            ffmpeg.deleteFile('output.mp4');
        } catch {}

        return true;

    } catch (err) {
        console.error('Erreur FFmpeg merge:', err);
        throw err;
    }
}

// ── Fonction principale de téléchargement ───────────────────────────────────
async function triggerDownload() {
    const url     = videoUrlInput.value.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
        showToast("Veuillez saisir un lien YouTube valide !");
        videoUrlInput.focus();
        return;
    }

    downloadBtn.classList.add('loading');
    actionDownloadBtn.disabled = true;
    showProgress(`⏳ Préparation MP4 (${selectedQuality === 2160 ? '4K' : selectedQuality + 'p'})...`, 10);
    hideStatus();

    try {
        // ─── Étape 1 : Demander les URLs au backend ─────────────────────
        showProgress("🔍 Récupération des liens de téléchargement...", 20);
        const apiEndpoint = `/api/download?url=${encodeURIComponent(url)}&quality=${selectedQuality}`;
        const response = await fetch(apiEndpoint);
        const data     = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur serveur");
        }

        const filename = data.filename || `video_youtube_${videoId}.mp4`;

        // ─── Cas 1 : Format direct (480p / 720p) ───────────────────────
        if (data.type === 'direct') {
            showProgress("⬇️ Téléchargement direct en cours...", 70);

            const a = document.createElement('a');
            a.href = data.downloadUrl;
            a.setAttribute('download', filename);
            a.setAttribute('target', '_blank');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => {
                showProgress("✅ Téléchargement lancé !", 100);
                downloadBtn.classList.remove('loading');
                actionDownloadBtn.disabled = false;
                showStatus(
                    `✅ <strong>Téléchargement lancé !</strong><br>` +
                    `Fichier : <strong>${filename}</strong><br>` +
                    `Le fichier MP4 avec son s'enregistre dans votre dossier <strong>Téléchargements</strong>.<br>` +
                    `<a href="${data.downloadUrl}" download="${filename}" class="btn-action btn-action-primary" style="margin-top:10px; display:inline-block;">📥 Retélécharger</a>`,
                    'success'
                );
                showToast("✅ Téléchargement MP4 lancé !");
            }, 800);

        // ─── Cas 2 : Merge nécessaire (1080p / 4K) ─────────────────────
        } else if (data.type === 'merge') {
            showProgress(`🔧 FFmpeg : Merge ${data.videoLabel || selectedQuality + 'p'} + Audio...`, 25);
            showToast(`🔧 Fusion en cours (${data.videoLabel || selectedQuality + 'p'})...`);

            await mergeVideoAudio(data.videoUrl, data.audioUrl, filename);

            showProgress("✅ Merge terminé – Fichier téléchargé !", 100);
            downloadBtn.classList.remove('loading');
            actionDownloadBtn.disabled = false;
            showStatus(
                `✅ <strong>Vidéo ${data.videoLabel || selectedQuality + 'p'} avec son téléchargée !</strong><br>` +
                `Fichier : <strong>${filename}</strong><br>` +
                `Vérifiez votre dossier <strong>Téléchargements</strong>.`,
                'success'
            );
            showToast(`✅ ${data.videoLabel || selectedQuality + 'p'} MP4 avec son téléchargé !`);

        } else {
            throw new Error("Réponse inattendue du serveur");
        }

    } catch (err) {
        downloadBtn.classList.remove('loading');
        actionDownloadBtn.disabled = false;
        hideProgress();
        const userMsg = err.message.includes('SharedArrayBuffer')
            ? '⚠️ Votre navigateur ne supporte pas le merge local. Essayez Chrome ou Firefox, ou choisissez 720p.'
            : err.message;
        showStatus(`❌ <strong>Erreur :</strong> ${userMsg}`, 'error');
        showToast("Erreur : " + err.message.substring(0, 60));
    }
}

// ── Gestionnaires de formulaire ──────────────────────────────────────────────
urlForm.addEventListener('submit', e => { e.preventDefault(); triggerDownload(); });
downloadBtn.addEventListener('click', triggerDownload);
actionDownloadBtn.addEventListener('click', triggerDownload);

// ── Utilitaires UI ───────────────────────────────────────────────────────────
function showProgress(text, percent) {
    progressContainer.classList.remove('hidden');
    progressBar.style.width = `${percent}%`;
    progressText.textContent = text;
    progressPercent.textContent = `${percent}%`;
}
function hideProgress() {
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
}
function showStatus(html, type = 'success') {
    statusMessage.innerHTML = html;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
}
function hideStatus() {
    statusMessage.classList.add('hidden');
}
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 4000);
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    if (videoUrlInput.value.trim()) {
        const id = extractYouTubeId(videoUrlInput.value);
        if (id) loadVideoPreview(id, videoUrlInput.value);
    }
});
