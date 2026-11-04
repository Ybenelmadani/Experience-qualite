const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Servir les fichiers statiques avec les bons headers COOP/COEP (obligatoires pour ffmpeg.wasm)
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

app.use(express.static(__dirname));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// Extraire l'ID YouTube
function extractVideoId(url) {
    const match = url.match(
        /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/
    );
    return match ? match[1] : null;
}

// ─── Santé ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY });
});

// ─── Download principal ───────────────────────────────────────
// Pour 480p/720p  → retourne { type:'direct', downloadUrl, filename }
// Pour 1080p/4K   → retourne { type:'merge', videoUrl, audioUrl, filename }
app.get('/api/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        const quality  = parseInt(req.query.quality, 10) || 720;

        if (!videoUrl) return res.status(400).json({ error: 'URL manquante' });

        const videoId = extractVideoId(videoUrl);
        if (!videoId) return res.status(400).json({ error: 'URL YouTube invalide' });

        if (!RAPIDAPI_KEY) {
            return res.status(503).json({
                error: 'Clé RapidAPI manquante. Configurez RAPIDAPI_KEY dans Vercel → Settings → Environment Variables.'
            });
        }

        // ── Appel yt-api ──────────────────────────────────────
        const apiRes = await fetch(
            `https://yt-api.p.rapidapi.com/dl?id=${videoId}&cgeo=US`,
            {
                headers: {
                    'x-rapidapi-key':  RAPIDAPI_KEY,
                    'x-rapidapi-host': 'yt-api.p.rapidapi.com'
                }
            }
        );

        if (!apiRes.ok) {
            return res.status(502).json({ error: `yt-api a répondu avec le code ${apiRes.status}` });
        }

        const data = await apiRes.json();

        // Nom de fichier propre
        const rawTitle  = data.title || `video_youtube_${videoId}`;
        const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim();

        // Tous les formats disponibles
        const formats = data.formats || data.adaptiveFormats || [];

        // ── Cas 480p / 720p → format muxé (vidéo + son dans un seul fichier) ──
        if (quality <= 720) {
            // itag 22 = 720p MP4 muxé | itag 18 = 360p MP4 muxé
            const targetItag = quality === 480 ? '18' : '22';

            // Chercher d'abord le bon itag
            let best = formats.find(f => String(f.itag) === targetItag && f.url);

            // Fallback : premier format muxé disponible
            if (!best) {
                best = formats.find(f =>
                    f.url &&
                    f.mimeType && f.mimeType.startsWith('video/') &&
                    f.audioQuality  // indique que le son est inclus
                );
            }

            // Fallback final : lien direct de l'API
            const downloadUrl = (best && best.url) || data.url;
            if (!downloadUrl) {
                return res.status(503).json({ error: 'Aucun lien de téléchargement disponible. Réessayez.' });
            }

            return res.json({ type: 'direct', downloadUrl, filename: `${safeTitle}.mp4` });
        }

        // ── Cas 1080p / 4K → formats adaptatifs séparés + merge côté client ──
        const targetHeight = quality; // 1080 ou 2160

        // Formats vidéo uniquement (sans audio), triés par qualité
        const videoFormats = formats.filter(f =>
            f.url &&
            f.mimeType && f.mimeType.startsWith('video/') &&
            (!f.audioQuality || f.audioQuality === 'AUDIO_QUALITY_NONE' || f.audioChannels === 0)
        );

        // Formats audio uniquement
        const audioFormats = formats.filter(f =>
            f.url &&
            f.mimeType && (f.mimeType.startsWith('audio/') ||
            (f.mimeType.startsWith('video/') && !f.qualityLabel))
        );

        // Choisir la meilleure vidéo au plus proche de la qualité demandée
        let bestVideo = videoFormats
            .filter(f => f.qualityLabel)
            .sort((a, b) => {
                const ha = parseInt(a.qualityLabel, 10) || 0;
                const hb = parseInt(b.qualityLabel, 10) || 0;
                return Math.abs(ha - targetHeight) - Math.abs(hb - targetHeight);
            })[0];

        // Choisir la meilleure piste audio (qualité max)
        let bestAudio = audioFormats
            .sort((a, b) => (parseInt(b.bitrate, 10) || 0) - (parseInt(a.bitrate, 10) || 0))[0];

        // Si pas de format adaptatif → tenter le format muxé le plus proche
        if (!bestVideo || !bestAudio) {
            const muxed = formats.find(f => f.url && f.mimeType && f.mimeType.startsWith('video/') && f.audioQuality);
            if (muxed) {
                return res.json({ type: 'direct', downloadUrl: muxed.url, filename: `${safeTitle}.mp4` });
            }
            if (data.url) {
                return res.json({ type: 'direct', downloadUrl: data.url, filename: `${safeTitle}.mp4` });
            }
            return res.status(503).json({ error: 'Formats 1080p/4K non disponibles pour cette vidéo. Essayez 720p.' });
        }

        return res.json({
            type:      'merge',
            videoUrl:  bestVideo.url,
            audioUrl:  bestAudio.url,
            videoLabel: bestVideo.qualityLabel || `${targetHeight}p`,
            filename:  `${safeTitle}.mp4`
        });

    } catch (err) {
        console.error('Erreur /api/download:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Démarrage local ──────────────────────────────────────────
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`[OK] SERVEUR DEMARRE → http://localhost:${PORT}`);
        console.log(`RapidAPI Key: ${RAPIDAPI_KEY ? 'OK ✓' : 'MANQUANTE ✗'}`);
        console.log('='.repeat(60));
    });
}

module.exports = app;
