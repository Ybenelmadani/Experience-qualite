const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Servir le front-end statique (index.html, style.css, script.js)
app.use(express.static(__dirname));

// Endpoint pour vérifier l'état de l'API
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'express' });
});

// Endpoint pour obtenir les informations de la vidéo
app.get('/api/info', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl || !ytdl.validateURL(videoUrl)) {
            return res.status(400).json({ error: "URL YouTube invalide" });
        }
        const info = await ytdl.getInfo(videoUrl);
        const details = info.videoDetails;
        res.json({
            title: details.title,
            author: details.author ? details.author.name : 'YouTube',
            thumbnail: details.thumbnails && details.thumbnails.length ? details.thumbnails[details.thumbnails.length - 1].url : null,
            lengthSeconds: details.lengthSeconds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint principal : Téléchargement en streaming direct avec SON garanti
app.get('/api/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        const quality = req.query.quality || '720';

        if (!videoUrl || !ytdl.validateURL(videoUrl)) {
            return res.status(400).json({ error: "URL YouTube invalide" });
        }

        const info = await ytdl.getInfo(videoUrl);
        const rawTitle = info.videoDetails.title || 'video_youtube';
        // Nettoyer le titre pour le nom de fichier
        const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim();

        // En-têtes pour enregistrement direct dans les fichiers du navigateur
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"; filename*=UTF-8''${encodeURIComponent(safeTitle)}.mp4`);
        res.setHeader('Content-Type', 'video/mp4');

        // itag 22 = 720p HD avec son (audioandvideo), itag 18 = 360p avec son
        const itag = (quality === '480' || quality === '360') ? 18 : 22;

        const stream = ytdl(videoUrl, {
            quality: itag,
            filter: 'audioandvideo'
        });

        stream.on('error', (err) => {
            console.error('Erreur stream ytdl:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Erreur pendant le téléchargement de la vidéo" });
            }
        });

        stream.pipe(res);
    } catch (err) {
        console.error('Erreur route download:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`[OK] BACKEND EXPRESS DEMARRE AVEC SUCCES !`);
        console.log(`--> Adresse locale : http://localhost:${PORT}`);
        console.log('='.repeat(60));
    });
}

module.exports = app;
