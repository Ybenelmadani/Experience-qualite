const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Servir le front-end statique (index.html, style.css, script.js)
app.use(express.static(__dirname));

// ─────────────────────────────────────────────────────────────
// Clé RapidAPI (définie dans Vercel → Settings → Env Variables)
// ─────────────────────────────────────────────────────────────
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// ─────────────────────────────────────────────────────────────
// Utilitaire : extraire l'ID YouTube depuis une URL
// ─────────────────────────────────────────────────────────────
function extractVideoId(url) {
    const match = url.match(
        /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/
    );
    return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────
// Endpoint santé
// ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'express', rapidapi: !!RAPIDAPI_KEY });
});

// ─────────────────────────────────────────────────────────────
// Endpoint principal : obtenir un lien de téléchargement direct
// via RapidAPI (yt-api ou youtube-mp36)
// Le navigateur télécharge DIRECTEMENT depuis le CDN → pas de
// limite de taille Vercel, pas de timeout, son inclus.
// ─────────────────────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        const quality  = req.query.quality || '720';

        if (!videoUrl) {
            return res.status(400).json({ error: 'URL manquante' });
        }

        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            return res.status(400).json({ error: 'URL YouTube invalide' });
        }

        if (!RAPIDAPI_KEY) {
            return res.status(503).json({
                error: 'Clé RapidAPI non configurée. Ajoutez RAPIDAPI_KEY dans Vercel → Settings → Environment Variables.'
            });
        }

        // ── Appel API 1 : yt-api (qualité configurable) ──────────────────
        // Docs: https://rapidapi.com/ytjar/api/yt-api
        let downloadUrl = null;
        let filename    = `video_youtube_${videoId}.mp4`;

        try {
            const qualityParam = quality === '2160' ? '2160' :
                                 quality === '1080' ? '1080' :
                                 quality === '480'  ? '480'  : '720';

            const apiRes = await fetch(
                `https://yt-api.p.rapidapi.com/dl?id=${videoId}&cgeo=US`,
                {
                    method: 'GET',
                    headers: {
                        'x-rapidapi-key':  RAPIDAPI_KEY,
                        'x-rapidapi-host': 'yt-api.p.rapidapi.com'
                    }
                }
            );

            if (apiRes.ok) {
                const data = await apiRes.json();

                // yt-api renvoie { title, formats: [{url, qualityLabel, ...}] }
                if (data.title) {
                    filename = data.title.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp4';
                }

                // Trouver le format avec son le plus proche de la qualité demandée
                if (data.formats && data.formats.length > 0) {
                    // Préférer les formats avec audio+video (mimeType video/mp4)
                    const avFormats = data.formats.filter(f =>
                        f.mimeType && f.mimeType.startsWith('video/mp4') &&
                        f.url && f.hasAudio !== false
                    );

                    // Chercher la qualité demandée en priorité
                    const targetHeight = parseInt(qualityParam, 10);
                    const best = avFormats.find(f => f.qualityLabel && f.qualityLabel.startsWith(qualityParam)) ||
                                 avFormats.sort((a, b) => {
                                     const ha = parseInt(a.qualityLabel || '0', 10);
                                     const hb = parseInt(b.qualityLabel || '0', 10);
                                     return Math.abs(ha - targetHeight) - Math.abs(hb - targetHeight);
                                 })[0];

                    if (best && best.url) {
                        downloadUrl = best.url;
                    }
                }

                // Fallback : lien direct si l'API renvoie un url racine
                if (!downloadUrl && data.url) {
                    downloadUrl = data.url;
                }
            }
        } catch (e) {
            console.error('yt-api erreur:', e.message);
        }

        // ── Appel API 2 (fallback) : youtube-mp36 (MP3 → on renvoie l'URL brute) ──
        if (!downloadUrl) {
            try {
                const mp4Res = await fetch(
                    `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
                    {
                        method: 'GET',
                        headers: {
                            'x-rapidapi-key':  RAPIDAPI_KEY,
                            'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
                        }
                    }
                );
                if (mp4Res.ok) {
                    const mp4Data = await mp4Res.json();
                    if (mp4Data.link) {
                        downloadUrl = mp4Data.link;
                        if (mp4Data.title) {
                            filename = mp4Data.title.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp4';
                        }
                    }
                }
            } catch (e) {
                console.error('youtube-mp36 erreur:', e.message);
            }
        }

        if (!downloadUrl) {
            return res.status(503).json({
                error: 'Impossible d\'obtenir le lien de téléchargement. Réessayez dans quelques secondes.'
            });
        }

        // ── Retourner l'URL CDN au navigateur ────────────────────────────
        // Le navigateur télécharge DIRECTEMENT (pas via Vercel) → pas de timeout
        res.json({ downloadUrl, filename });

    } catch (err) {
        console.error('Erreur route /api/download:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// Démarrage local
// ─────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`[OK] SERVEUR EXPRESS DEMARRE`);
        console.log(`--> http://localhost:${PORT}`);
        console.log(`--> RapidAPI Key: ${RAPIDAPI_KEY ? 'CONFIGUREE ✓' : 'MANQUANTE ✗'}`);
        console.log('='.repeat(60));
    });
}

module.exports = app;
