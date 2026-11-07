/**
 * YouTube MP4 Converter - Client Script
 * Compatible Mobile Android, iPhone, Windows, Mac
 */

// Éléments du DOM
const videoUrlInput    = document.getElementById('videoUrl');
const urlForm          = document.getElementById('urlForm');
const pasteBtn         = document.getElementById('pasteBtn');
const clearBtn         = document.getElementById('clearBtn');

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
let isDownloadRequest   = false;
let selectedQuality     = 720; // 720p HD par défaut

// ==========================================
// 1. Sélecteur de qualité
// ==========================================
const qualityPills = document.querySelectorAll('.quality-pill');
const qualityNote  = document.getElementById('qualityNote');

const qualityNotes = {
    480:  'Petite taille · Téléchargement ultra rapide avec son',
    720:  'Qualité HD recommandée · Son 100% garanti',
    1080: 'Full HD 1080p · Flux vidéo sans audio',
    2160: '4K Ultra HD · Flux vidéo sans audio'
};

const qualityBadgeLabels = {
    480:  '480p SD / MP4',
    720:  'HD 720p / MP4',
    1080: 'Full HD 1080p / MP4',
    2160: '4K 2160p / MP4'
};

qualityPills.forEach(pill => {
    pill.addEventListener('click', () => {
        if (isDownloadRequest) return;
        qualityPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedQuality = parseInt(pill.dataset.quality, 10);
        if (qualityNote)  qualityNote.textContent  = qualityNotes[selectedQuality] || '';
        if (qualityBadge) qualityBadge.textContent = qualityBadgeLabels[selectedQuality] || '';

        if (extractYouTubeId(videoUrlInput.value.trim())) {
            triggerDownload();
        } else {
            showToast('Collez d’abord une URL YouTube, puis choisissez une qualité.');
            videoUrlInput.focus();
        }
    });
});

// ==========================================
// 2. Extraction de l'ID YouTube
// ==========================================
function extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
    const match = cleanUrl.match(regExp);
    return match ? match[1] : null;
}

// ==========================================
// 3. Aperçu miniature et titre instantané
// ==========================================
function loadVideoPreview(videoId, rawUrl) {
    if (!videoId) {
        hidePreview();
        return;
    }

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
    videoTitle.textContent  = "Chargement des détails de la vidéo...";
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
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

    try {
        const response = await fetch(endpoint);
        if (response.ok) {
            const data = await response.json();
            videoTitle.textContent  = data.title || "Vidéo YouTube";
            videoAuthor.textContent = data.author_name ? `Chaîne : ${data.author_name}` : "YouTube";
        } else {
            videoTitle.textContent = `Vidéo YouTube (${videoId})`;
        }
    } catch {
        videoTitle.textContent = `Vidéo YouTube (${videoId})`;
    }
}

// ==========================================
// 4. Événements Saisie & Boutons
// ==========================================
videoUrlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) {
        clearBtn.classList.remove('hidden');
        const videoId = extractYouTubeId(val);
        if (videoId) loadVideoPreview(videoId, val);
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
            const videoId = extractYouTubeId(text);
            if (videoId) {
                loadVideoPreview(videoId, text.trim());
                showToast("Lien collé avec succès !");
            } else {
                showToast("Le lien collé n'est pas une URL YouTube valide.");
            }
        }
    } catch {
        videoUrlInput.focus();
        showToast("Veuillez coller avec Ctrl+V ou appuyer longuement.");
    }
});

copyImageBtn.addEventListener('click', async () => {
    if (!currentThumbnailUrl) return;
    try {
        await navigator.clipboard.writeText(currentThumbnailUrl);
        showToast("Lien de la miniature copié !");
    } catch {
        showToast(currentThumbnailUrl);
    }
});

// ==========================================
// 5. Téléchargement direct MP4 avec son
// ==========================================
function startDownloadFromUrl(downloadUrl, filename) {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'video.mp4';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
    }, 1000);
}

async function triggerDownload() {
    const url = videoUrlInput.value.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
        showToast("Veuillez coller un lien YouTube valide !");
        videoUrlInput.focus();
        return;
    }

    isDownloadRequest = true;
    qualityPills.forEach(pill => { pill.disabled = true; });
    hideProgress();
    hideStatus();

    try {
        const endpoint = `/api/download?url=${encodeURIComponent(url)}&quality=${selectedQuality}`;
        const res = await fetch(endpoint);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Erreur lors de la préparation du téléchargement');
        }

        startDownloadFromUrl(data.downloadUrl, data.filename || `youtube_${videoId}.mp4`);
        showToast(`Téléchargement ${data.qualityLabel || selectedQuality + 'p'} lancé.`);
    } catch (err) {
        showStatus(`❌ <strong>Erreur :</strong> ${err.message}`, 'error');
        showToast('Erreur : ' + err.message);
    } finally {
        isDownloadRequest = false;
        qualityPills.forEach(pill => { pill.disabled = false; });
    }

    return;

    downloadBtn.classList.add('loading');
    actionDownloadBtn.disabled = true;
    showProgress("🔍 Génération du lien MP4 sécurisé...", 35);
    hideStatus();

    try {
        const endpoint = `/api/download?url=${encodeURIComponent(url)}&quality=${selectedQuality}`;
        const res = await fetch(endpoint);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Erreur lors de la génération du lien");
        }

        showProgress("⚡ Téléchargement en cours...", 80);

        const filename = data.filename || `youtube_${videoId}.mp4`;

        // Les flux YouTube 1080p/4K sont séparés de l'audio. On ne lance donc
        // pas automatiquement le 720p : l'utilisateur choisit explicitement
        // entre la vidéo HD sans audio et le 720p avec son.
        if (data.type === 'hd_stream') {
            setTimeout(() => {
                showProgress("✅ Liens de téléchargement prêts !", 100);
                downloadBtn.classList.remove('loading');
                actionDownloadBtn.disabled = false;

                let html = `
                    ✅ <strong>Choisissez votre téléchargement :</strong><br>
                    Les formats 1080p et 4K proposés ici sont des flux vidéo <strong>sans audio</strong>.<br>
                    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                        <a href="${data.downloadUrl}" download="${filename}" class="btn-action btn-action-primary" target="_blank" title="Flux vidéo sans audio">
                            🎬 Télécharger ${data.qualityLabel} (sans audio)
                        </a>`;

                if (data.directWithSoundUrl) {
                    html += `
                        <a href="${data.directWithSoundUrl}" download="${data.withAudioFilename || 'video_720p.mp4'}" class="btn-action btn-action-secondary" target="_blank" title="Vidéo 720p avec audio intégré">
                            📥 Télécharger 720p HD avec son
                        </a>`;
                }

                html += `</div>`;
                showStatus(html, "success");
                showToast("✅ Choisissez la qualité à télécharger.");
            }, 800);

        } else {
            // Téléchargement direct standard 720p / 480p avec son garanti
            startDownloadFromUrl(data.downloadUrl, filename);

            setTimeout(() => {
                showProgress("✅ Téléchargement prêt !", 100);
                downloadBtn.classList.remove('loading');
                actionDownloadBtn.disabled = false;

                showStatus(`
                    ✅ <strong>Téléchargement lancé !</strong><br>
                    Fichier : <strong>${filename}</strong> (${data.qualityLabel || selectedQuality + 'p'})<br>
                    Le fichier s'enregistre directement dans le dossier <strong>Téléchargements</strong> de votre appareil.<br>
                    <a href="${data.downloadUrl}" download="${filename}" class="btn-action btn-action-primary" style="margin-top:10px; display:inline-block;" target="_blank">
                        📥 Relancer le téléchargement
                    </a>
                `, "success");
                showToast("✅ Vidéo MP4 avec son prête !");
            }, 800);
        }

    } catch (err) {
        downloadBtn.classList.remove('loading');
        actionDownloadBtn.disabled = false;
        hideProgress();
        showStatus(`❌ <strong>Erreur :</strong> ${err.message}<br><small>Vérifiez que votre clé RapidAPI est bien configurée ou réessayez avec un autre lien.</small>`, "error");
        showToast("Erreur : " + err.message);
    }
}

// Formulaire & Boutons
urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerDownload();
});
actionDownloadBtn.addEventListener('click', triggerDownload);

// ==========================================
// 6. Utilitaires UI
// ==========================================
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
    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 3500);
}

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
    if (videoUrlInput.value.trim()) {
        const id = extractYouTubeId(videoUrlInput.value);
        if (id) loadVideoPreview(id, videoUrlInput.value);
    }
});
