const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// Extraire l'ID YouTube
function extractVideoId(url) {
    if (!url) return null;
    const match = url.match(
        /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/
    );
    return match ? match[1] : null;
}

// ─── Santé ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY });
});

// ─── Endpoint principal de téléchargement ─────────────────────
app.get('/api/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        const quality  = parseInt(req.query.quality, 10) || 720;

        if (!videoUrl) return res.status(400).json({ error: 'URL manquante' });

        const videoId = extractVideoId(videoUrl);
        if (!videoId) return res.status(400).json({ error: 'URL YouTube invalide' });

        if (!RAPIDAPI_KEY) {
            return res.status(503).json({
                error: 'Clé RapidAPI non configurée. Ajoutez RAPIDAPI_KEY dans Vercel → Settings → Environment Variables.'
            });
        }

        // Appel à YT-API via RapidAPI
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

        if (!apiRes.ok) {
            const errBody = await apiRes.text().catch(() => '');
            console.error('Erreur RapidAPI:', apiRes.status, errBody);
            return res.status(502).json({
                error: `Erreur API (${apiRes.status}). Vérifiez vos crédits RapidAPI.`
            });
        }

        const data = await apiRes.json();

        // Titre propre
        const rawTitle  = data.title || `video_youtube_${videoId}`;
        const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim() || `video_${videoId}`;

        const formats = Array.isArray(data.formats) ? data.formats : [];
        const adaptiveFormats = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];

        // 1. Trouver les formats AVEC SON (muxed)
        const muxedFormats = formats.filter(f => f.url && (f.hasAudio !== false || f.audioQuality));

        // Format 720p avec son
        const f720 = muxedFormats.find(f => String(f.itag) === '22' || (f.qualityLabel && f.qualityLabel.includes('720')))
                  || muxedFormats[0];

        // Format 480p/360p avec son
        const f480 = muxedFormats.find(f => String(f.itag) === '18' || (f.qualityLabel && (f.qualityLabel.includes('480') || f.qualityLabel.includes('360'))))
                  || muxedFormats[muxedFormats.length - 1]
                  || f720;

        // Les flux adaptatifs sont vidéo seule. Quelques réponses de l'API les
        // placent dans `formats` : on accepte uniquement ceux explicitement
        // marqués sans audio afin de ne jamais confondre un flux basse qualité.
        const isVideoFormat = f => f.url && f.mimeType && f.mimeType.startsWith('video/');
        const isVideoOnly = f => isVideoFormat(f) && (
            f.hasAudio === false ||
            f.audioQuality === 'AUDIO_QUALITY_NONE' ||
            Number(f.audioChannels) === 0
        );
        const videoOnly = [
            ...adaptiveFormats.filter(isVideoFormat),
            ...formats.filter(isVideoOnly)
        ];

        // Préférer MP4 lorsque la même résolution est disponible en MP4 et WebM.
        const preferMp4 = candidates => candidates.sort((a, b) => {
            const aMp4 = /video\/mp4/i.test(a.mimeType || '') ? 1 : 0;
            const bMp4 = /video\/mp4/i.test(b.mimeType || '') ? 1 : 0;
            return bMp4 - aMp4;
        })[0];
        const is1080 = f => Number(f.height) === 1080 || /\b1080p?\b/i.test(f.qualityLabel || '');
        const is4k = f => Number(f.height) === 2160 || /\b(2160p?|4k)\b/i.test(f.qualityLabel || '');
        const f1080 = preferMp4(videoOnly.filter(is1080));
        const f4k = preferMp4(videoOnly.filter(is4k));

        // Sélection selon la qualité demandée
        let chosenUrl = null;
        let qualityLabel = '720p HD';

        if (quality === 480 && f480 && f480.url) {
            chosenUrl = f480.url;
            qualityLabel = f480.qualityLabel || '480p';
        } else if (quality === 2160) {
            if (f4k && f4k.url) {
                qualityLabel = f4k.qualityLabel || '4K 2160p';
                return res.json({
                    type: 'hd_stream',
                    quality: '4K',
                    qualityLabel,
                    downloadUrl: f4k.url,
                    directWithSoundUrl: f720 ? f720.url : (data.url || f4k.url),
                    filename: `${safeTitle}_4K_sans_audio.mp4`,
                    withAudioFilename: `${safeTitle}_720p_avec_son.mp4`
                });
            }
            return res.status(422).json({
                error: 'Cette vidéo ne propose pas de flux 4K (2160p). Aucun fichier de qualité inférieure ne sera téléchargé.'
            });
        } else if (quality === 1080) {
            if (f1080 && f1080.url) {
                qualityLabel = f1080.qualityLabel || '1080p Full HD';
                return res.json({
                    type: 'hd_stream',
                    quality: '1080p',
                    qualityLabel,
                    downloadUrl: f1080.url,
                    directWithSoundUrl: f720 ? f720.url : (data.url || f1080.url),
                    filename: `${safeTitle}_1080p_sans_audio.mp4`,
                    withAudioFilename: `${safeTitle}_720p_avec_son.mp4`
                });
            }
            return res.status(422).json({
                error: 'Cette vidéo ne propose pas de flux Full HD (1080p). Aucun fichier de qualité inférieure ne sera téléchargé.'
            });
        } else {
            // 720p par défaut (qualité maximale avec son intégré garanti)
            chosenUrl = (f720 && f720.url) || data.url;
            qualityLabel = (f720 && f720.qualityLabel) || '720p HD';
        }

        // Si aucun format trouvé, utiliser url racine
        if (!chosenUrl && data.url) {
            chosenUrl = data.url;
        }

        if (!chosenUrl) {
            return res.status(503).json({
                error: 'Aucun lien vidéo valide renvoyé par l\'API. Réessayez avec un autre lien.'
            });
        }

        return res.json({
            type: 'direct',
            qualityLabel,
            downloadUrl: chosenUrl,
            filename: `${safeTitle}.mp4`
        });

    } catch (err) {
        console.error('Erreur /api/download:', err);
        return res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
    }
});

// Démarrage local
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`[OK] Serveur démarré sur http://localhost:${PORT}`);
        console.log(`RapidAPI Key: ${RAPIDAPI_KEY ? 'Active ✓' : 'Absente ✗'}`);
    });
}

module.exports = app;
