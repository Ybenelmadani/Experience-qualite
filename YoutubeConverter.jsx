import React, { useState, useEffect } from 'react';

/**
 * Composant React : Convertisseur YouTube vers MP4
 * Extrait l'URL YouTube, charge immédiatement la vidéo comme une image (miniature),
 * et permet de déclencher le téléchargement MP4.
 */
export default function YoutubeConverter() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoAuthor, setVideoAuthor] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // 1. Extraction de l'ID YouTube
  const extractYouTubeId = (inputUrl) => {
    if (!inputUrl) return null;
    const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
    const match = inputUrl.trim().match(regExp);
    return match ? match[1] : null;
  };

  // 2. Détection et chargement de la vidéo comme image à chaque changement d'URL
  useEffect(() => {
    const id = extractYouTubeId(url);
    if (id) {
      setVideoId(id);
      const maxRes = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
      setThumbnailUrl(maxRes);

      // Récupération des informations du titre via l'API oEmbed YouTube
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setVideoTitle(data.title || 'Vidéo YouTube');
            setVideoAuthor(data.author_name || 'YouTube');
          } else {
            setVideoTitle(`Vidéo ID : ${id}`);
          }
        })
        .catch(() => {
          setVideoTitle(`Vidéo YouTube (${id})`);
        });
    } else {
      setVideoId(null);
      setThumbnailUrl('');
      setVideoTitle('');
      setVideoAuthor('');
    }
  }, [url]);

  // Coller depuis le presse-papier
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        showToast("Lien collé !");
      }
    } catch {
      showToast("Appuyez sur Ctrl+V pour coller.");
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Téléchargement MP4
  const handleDownload = async () => {
    if (!videoId) {
      showToast("Veuillez entrer une URL YouTube valide.");
      return;
    }

    setIsDownloading(true);
    setProgress(10);
    setProgressText("Connexion au serveur...");

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) throw new Error("Erreur serveur");
      const data = await res.json();
      const taskId = data.task_id;

      // Suivi de la progression
      const interval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/progress?id=${taskId}`);
          if (!pollRes.ok) return;
          const status = await pollRes.json();

          if (status.status === 'downloading') {
            setProgress(Math.round(status.percent || 0));
            setProgressText(`Téléchargement... ${status.speed || ''}`);
          } else if (status.status === 'finished') {
            clearInterval(interval);
            setProgress(100);
            setProgressText("Téléchargement terminé !");
            setIsDownloading(false);
            showToast("Vidéo MP4 prête !");
          } else if (status.status === 'error') {
            clearInterval(interval);
            setIsDownloading(false);
            showToast(`Erreur : ${status.error}`);
          }
        } catch {
          clearInterval(interval);
          setIsDownloading(false);
        }
      }, 1000);

    } catch {
      setIsDownloading(false);
      showToast("Veuillez démarrer python server.py");
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      
      {/* En-tête */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
          Free YouTube to MP4 Converter
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.05rem' }}>
          Free, fast, and no ads. Paste a YouTube URL to download instantly.
        </p>
      </div>

      {/* Barre d'input */}
      <div style={{ display: 'flex', width: '100%', maxWidth: '780px', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            style={{ width: '100%', height: '56px', padding: '0 80px 0 20px', fontSize: '1rem', border: '2px solid #0066fe', borderRight: 'none', outline: 'none' }}
          />
          <button
            type="button"
            onClick={handlePaste}
            style={{ position: 'absolute', right: '12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Coller
          </button>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          style={{ height: '56px', padding: '0 32px', backgroundColor: '#0066fe', color: '#fff', fontSize: '1rem', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {isDownloading ? 'TÉLÉCHARGEMENT...' : 'DOWNLOAD MP4'}
        </button>
      </div>

      <p style={{ marginTop: '12px', fontSize: '0.84rem', color: '#64748b', textAlign: 'center' }}>
        Make sure you don't violate the rights of others with any files you download.<br />
        Copyrighted music can't be downloaded with this tool. ⓘ
      </p>

      {/* Section Aperçu (charge la vidéo comme image) */}
      {videoId && (
        <div style={{ marginTop: '24px', width: '100%', maxWidth: '780px', background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '260px', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}>
            <img
              src={thumbnailUrl}
              alt="Miniature YouTube"
              onError={(e) => { e.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'red', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '3px' }}>▶</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '4px' }}>HD 1080p MP4</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '8px 0 4px', color: '#0f172a' }}>{videoTitle}</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>{videoAuthor}</p>

            {isDownloading && (
              <div style={{ width: '100%', marginBottom: '12px' }}>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#0066fe', transition: 'width 0.2s' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                  <span>{progressText}</span>
                  <span>{progress}%</span>
                </div>
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              style={{ background: '#0066fe', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
            >
              Télécharger cette vidéo
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}

