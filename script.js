/**
 * YouTube MP4 Converter - Client Script
 * Détection automatique du lien, affichage instantané de la miniature (image),
 * et interaction avec le serveur de téléchargement Python.
 */

// Éléments du DOM
const videoUrlInput = document.getElementById('videoUrl');
const urlForm = document.getElementById('urlForm');
const pasteBtn = document.getElementById('pasteBtn');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

const previewSection = document.getElementById('previewSection');
const videoThumbnail = document.getElementById('videoThumbnail');
const videoTitle = document.getElementById('videoTitle');
const videoAuthor = document.getElementById('videoAuthor');
const actionDownloadBtn = document.getElementById('actionDownloadBtn');
const openYoutubeLink = document.getElementById('openYoutubeLink');
const copyImageBtn = document.getElementById('copyImageBtn');
const qualityBadge = document.getElementById('qualityBadge');

const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const statusMessage = document.getElementById('statusMessage');
const toastEl = document.getElementById('toast');

let currentVideoId = null;
let currentThumbnailUrl = null;
let downloadPollInterval = null;
let selectedQuality = 720; // Qualité par défaut

// ==========================================
// 0. Sélecteur de qualité
// ==========================================
const qualityPills = document.querySelectorAll('.quality-pill');
const qualityNote = document.getElementById('qualityNote');

const qualityNotes = {
    480:  'Petite taille · Lecture rapide sur mobile',
    720:  'Meilleure compatibilité Windows',
    1080: 'Full HD · Recommandé pour PC',
    2160: '4K Ultra HD · Gros fichier · Lecteur VLC conseillé'
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
        if (qualityNote) qualityNote.textContent = qualityNotes[selectedQuality] || '';
        if (qualityBadge) qualityBadge.textContent = qualityBadgeLabels[selectedQuality] || '';
    });
});

// ==========================================
// 1. Extraction de l'ID YouTube
// ==========================================
function extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();

    // Supporte : youtube.com/watch?v=..., youtu.be/..., shorts/..., embed/..., etc.
    const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
    const match = cleanUrl.match(regExp);
    return match ? match[1] : null;
}

// ==========================================
// 2. Chargement de la vidéo en tant qu'image
// ==========================================
function loadVideoPreview(videoId, rawUrl) {
    if (!videoId) {
        hidePreview();
        return;
    }

    currentVideoId = videoId;
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const hqResUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    // Chargement de l'image miniature avec fallback intelligent
    videoThumbnail.src = maxResUrl;
    currentThumbnailUrl = maxResUrl;

    videoThumbnail.onload = function() {
        // YouTube renvoie parfois un placeholder 120x90 si maxresdefault n'existe pas
        if (videoThumbnail.naturalWidth === 120) {
            videoThumbnail.src = hqResUrl;
            currentThumbnailUrl = hqResUrl;
        }
    };

    videoThumbnail.onerror = function() {
        videoThumbnail.src = hqResUrl;
        currentThumbnailUrl = hqResUrl;
    };

    // Liens et états par défaut
    openYoutubeLink.href = `https://www.youtube.com/watch?v=${videoId}`;
    videoTitle.textContent = "Chargement des informations...";
    videoAuthor.textContent = "YouTube Video";

    // Afficher la section d'aperçu
    previewSection.classList.remove('hidden');

    // Charger le widget de téléchargement direct avec son (pour mobile et Vercel)
    const downloadFrame = document.getElementById('downloadFrame');
    const directDownloadBox = document.getElementById('directDownloadBox');
    if (downloadFrame && directDownloadBox) {
        const fullUrl = rawUrl || `https://www.youtube.com/watch?v=${videoId}`;
        downloadFrame.src = `https://api.vevioz.com/api/button/mp4?url=${encodeURIComponent(fullUrl)}`;
        directDownloadBox.classList.remove('hidden');
    }

    // Récupérer le titre et l'auteur via l'API oEmbed de YouTube (sans clé d'API requise)
    fetchOEmbedData(videoId, rawUrl);
}

function hidePreview() {
    currentVideoId = null;
    previewSection.classList.add('hidden');
    const downloadFrame = document.getElementById('downloadFrame');
    const directDownloadBox = document.getElementById('directDownloadBox');
    if (downloadFrame) downloadFrame.src = '';
    if (directDownloadBox) directDownloadBox.classList.add('hidden');
    hideProgress();
    hideStatus();
}

// Récupération des métadonnées (titre, créateur) via YouTube oEmbed
async function fetchOEmbedData(videoId, rawUrl) {
    const targetUrl = rawUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const oembedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

    try {
        const response = await fetch(oembedEndpoint);
        if (response.ok) {
            const data = await response.json();
            videoTitle.textContent = data.title || "Vidéo YouTube";
            videoAuthor.textContent = data.author_name ? `Chaîne : ${data.author_name}` : "YouTube";
        } else {
            videoTitle.textContent = `Vidéo ID : ${videoId}`;
        }
    } catch (err) {
        // En cas d'échec réseau ou CORS (si ouvert localement en file://), on affiche l'ID
        videoTitle.textContent = `Vidéo YouTube (${videoId})`;
    }
}

// ==========================================
// 3. Gestionnaires d'événements Input
// ==========================================

// Détection en direct lors de la saisie ou collage
videoUrlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.length > 0) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
        hidePreview();
        return;
    }

    const videoId = extractYouTubeId(val);
    if (videoId) {
        loadVideoPreview(videoId, val);
    } else {
        hidePreview();
    }
});

// Bouton Effacer
clearBtn.addEventListener('click', () => {
    videoUrlInput.value = '';
    clearBtn.classList.add('hidden');
    hidePreview();
    videoUrlInput.focus();
});

// Bouton Coller depuis le presse-papier
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
    } catch (err) {
        videoUrlInput.focus();
        showToast("Veuillez coller le lien avec Ctrl+V.");
    }
});

// Copier le lien de la miniature
copyImageBtn.addEventListener('click', async () => {
    if (!currentThumbnailUrl) return;
    try {
        await navigator.clipboard.writeText(currentThumbnailUrl);
        showToast("Lien de l'image (miniature) copié !");
    } catch (e) {
        showToast(currentThumbnailUrl);
    }
});

// ==========================================
// 4. Téléchargement via backend Vercel (RapidAPI)
// ==========================================

async function triggerDownload() {
    const url = videoUrlInput.value.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
        showToast("Veuillez saisir un lien YouTube valide !");
        videoUrlInput.focus();
        return;
    }

    // Afficher l'état de chargement
    downloadBtn.classList.add('loading');
    actionDownloadBtn.disabled = true;
    showProgress(`⏳ Préparation du fichier MP4 (${selectedQuality === 2160 ? '4K' : selectedQuality + 'p'})...`, 20);
    hideStatus();

    try {
        // ─── Étape 1 : Demander l'URL CDN au backend ───────────────────
        showProgress("🔍 Récupération du lien de téléchargement...", 40);

        const apiEndpoint = `/api/download?url=${encodeURIComponent(url)}&quality=${selectedQuality}`;
        const response = await fetch(apiEndpoint);
        const data = await response.json();

        if (!response.ok || !data.downloadUrl) {
            const errMsg = data.error || "Impossible d'obtenir le lien vidéo.";
            downloadBtn.classList.remove('loading');
            actionDownloadBtn.disabled = false;
            hideProgress();
            showStatus(`❌ <strong>Erreur :</strong> ${errMsg}<br><small>Réessayez dans quelques secondes.</small>`, "error");
            showToast("Erreur : " + errMsg);
            return;
        }

        // ─── Étape 2 : Déclencher le téléchargement direct depuis le CDN ──
        showProgress("⬇️ Téléchargement en cours depuis le serveur...", 70);

        const filename = data.filename || `video_youtube_${videoId}.mp4`;
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.setAttribute('download', filename);
        a.setAttribute('target', '_blank');  // fallback mobile
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // ─── Étape 3 : Confirmer à l'utilisateur ────────────────────────
        setTimeout(() => {
            showProgress("✅ Téléchargement lancé !", 100);
            downloadBtn.classList.remove('loading');
            actionDownloadBtn.disabled = false;
            showStatus(
                `✅ <strong>Téléchargement lancé avec succès !</strong><br>` +
                `Le fichier <strong>${filename}</strong> (MP4 avec son) est en cours d'enregistrement dans votre dossier <strong>Téléchargements</strong>.<br>` +
                `<a href="${data.downloadUrl}" download="${filename}" class="btn-action btn-action-primary" style="margin-top:10px; display:inline-block;">📥 Retélécharger si nécessaire</a>`,
                "success"
            );
            showToast("✅ Téléchargement MP4 lancé !");
        }, 800);

    } catch (err) {
        downloadBtn.classList.remove('loading');
        actionDownloadBtn.disabled = false;
        hideProgress();
        showStatus(`❌ <strong>Erreur réseau :</strong> ${err.message}<br><small>Vérifiez votre connexion et réessayez.</small>`, "error");
        showToast("Erreur réseau : " + err.message);
    }
}

// Suivi de la progression via l'API
function pollDownloadProgress(taskId, origin = '') {
    if (downloadPollInterval) clearInterval(downloadPollInterval);

    downloadPollInterval = setInterval(async () => {
        try {
            const endpoint = origin ? `${origin}/api/progress?id=${encodeURIComponent(taskId)}` : `/api/progress?id=${encodeURIComponent(taskId)}`;
            const res = await fetch(endpoint);
            if (!res.ok) return;

            const info = await res.json();

            if (info.status === 'downloading') {
                const percent = Math.round(info.percent || 0);
                const speed = info.speed || '';
                const eta = info.eta ? `(ETA: ${info.eta}s)` : '';
                showProgress(`Téléchargement... ${speed} ${eta}`, percent);
            } else if (info.status === 'finished') {
                clearInterval(downloadPollInterval);
                downloadBtn.classList.remove('loading');
                actionDownloadBtn.disabled = false;
                showProgress("Téléchargement terminé !", 100);

                const downloadUrl = origin ? `${origin}/videos/${encodeURIComponent(info.filename)}` : `/videos/${encodeURIComponent(info.filename)}`;
                showStatus(`✅ <strong>Téléchargement réussi !</strong><br>Fichier : <code>${info.filename}</code><br><a href="${downloadUrl}" download class="btn-action btn-action-primary" style="margin-top:10px; display:inline-block;">Enregistrer sur votre PC</a>`, "success");
                showToast("Téléchargement MP4 terminé !");
                refreshDownloadsList();
            } else if (info.status === 'error') {
                clearInterval(downloadPollInterval);
                downloadBtn.classList.remove('loading');
                actionDownloadBtn.disabled = false;
                hideProgress();
                showStatus(`❌ Erreur de téléchargement : ${info.error || "Impossible de télécharger la vidéo"}`, "error");
            }
        } catch (e) {
            clearInterval(downloadPollInterval);
            downloadBtn.classList.remove('loading');
            actionDownloadBtn.disabled = false;
        }
    }, 1000);
}

// Rafraîchir l'historique des vidéos téléchargées
async function refreshDownloadsList() {
    try {
        const origin = await getApiOrigin();
        const endpoint = origin ? `${origin}/api/videos` : '/api/videos';
        const res = await fetch(endpoint);
        if (res.ok) {
            const data = await res.json();
            const listEl = document.getElementById('downloadedFilesList');
            const historySec = document.getElementById('downloadsHistory');
            
            if (data.videos && data.videos.length > 0) {
                historySec.classList.remove('hidden');
                listEl.innerHTML = data.videos.map(v => {
                    const fileUrl = origin ? `${origin}/videos/${encodeURIComponent(v.name)}` : `/videos/${encodeURIComponent(v.name)}`;
                    return `
                    <li>
                        <span>🎬 ${v.name} (${v.size})</span>
                        <a href="${fileUrl}" download class="btn-action btn-action-secondary" style="padding: 4px 10px; font-size: 0.78rem;">Télécharger</a>
                    </li>
                `;
                }).join('');
            }
        }
    } catch (e) {
        // En mode statique
    }
}

// Gestion des formulaires et clics boutons
urlForm.addEventListener('submit', triggerDownload);
downloadBtn.addEventListener('click', triggerDownload);
actionDownloadBtn.addEventListener('click', triggerDownload);

// ==========================================
// 5. Fonctions d'interface utilitaires
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

// Initialisation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    refreshDownloadsList();

    // Si l'input contient déjà un lien (ex: auto-complété)
    if (videoUrlInput.value.trim()) {
        const id = extractYouTubeId(videoUrlInput.value);
        if (id) loadVideoPreview(id, videoUrlInput.value);
    }
});

