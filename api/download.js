/**
 * Vercel Serverless Function : /api/download
 * Exécuté directement sur les serveurs de Vercel.
 * Récupère le lien direct MP4 avec son et déclenche le téléchargement
 * automatique dans les fichiers du smartphone / PC.
 */

export default async function handler(req, res) {
    // En-têtes CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let url = '';
    let quality = '720';

    if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }
        url = body?.url || '';
        quality = String(body?.quality || '720');
    } else {
        url = req.query?.url || '';
        quality = String(req.query?.quality || '720');
    }

    url = url.trim();

    if (!url) {
        return res.status(400).json({ error: 'URL YouTube manquante' });
    }

    // 1. Tenter les instances Cobalt (côté serveur, aucun blocage CORS de navigateur)
    const cobaltInstances = [
        'https://api.cobalt.tools',
        'https://cobalt-api.kwiatekm.tokyo',
        'https://cobalt.canine.tools'
    ];

    const qualityMap = { '480': '480', '720': '720', '1080': '1080', '2160': '2160' };
    const targetQuality = qualityMap[quality] || '720';

    for (const instance of cobaltInstances) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 9000);

            const cobaltRes = await fetch(instance, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                body: JSON.stringify({
                    url: url,
                    videoQuality: targetQuality,
                    downloadMode: 'auto',
                    filenameStyle: 'basic'
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (cobaltRes.ok) {
                const data = await cobaltRes.json();
                if (data.url) {
                    return res.status(200).json({
                        success: true,
                        downloadUrl: data.url,
                        filename: data.filename || 'video_youtube.mp4'
                    });
                }
            }
        } catch (e) {
            // Continuer vers l'instance suivante
        }
    }

    // 2. Repli : Invidious API (flux direct MP4 avec audio combiné)
    const videoIdMatch = url.match(/(?:watch\?(?:.*&)?v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    if (videoIdMatch) {
        const videoId = videoIdMatch[1];
        const invidiousInstances = [
            'https://inv.nadeko.net',
            'https://invidious.nerdvpn.de',
            'https://inv.tux.pizza'
        ];

        for (const invHost of invidiousInstances) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);

                const invRes = await fetch(`${invHost}/api/v1/videos/${videoId}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (invRes.ok) {
                    const invData = await invRes.json();
                    const streams = invData.formatStreams || [];
                    
                    // Trouver le meilleur format MP4 ayant à la fois vidéo et audio (ex: format 22 = 720p avec son)
                    const format22 = streams.find(s => s.itag === '22');
                    const format18 = streams.find(s => s.itag === '18');
                    const bestStream = format22 || format18 || streams[0];

                    if (bestStream && bestStream.url) {
                        return res.status(200).json({
                            success: true,
                            downloadUrl: bestStream.url,
                            filename: `${invData.title || 'video'}.mp4`
                        });
                    }
                }
            } catch (err) {
                // Essayer l'instance suivante
            }
        }
    }

    return res.status(502).json({
        error: 'Toutes les passerelles sont momentanément occupées. Réessayez dans un instant.'
    });
}
