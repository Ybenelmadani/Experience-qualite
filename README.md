# 🎬 Convertisseur YouTube vers MP4 (Web Front-End)

Interface web moderne inspirée du design demandé (fond strié subtil, icônes, champ URL avec bouton « Coller » et prévisualisation instantanée de la vidéo en tant qu'image).

---

## 🚀 Démarrage Rapide

### Option 1 : Double-cliquer (le plus simple sous Windows)
Double-cliquez simplement sur **`run_app.bat`** :
1. Le navigateur s'ouvre automatiquement sur `http://localhost:5000`.
2. Le serveur Python démarre en arrière-plan avec votre environnement `.venv`.

### Option 2 : En ligne de commande
Dans votre terminal :
```bash
.\.venv\Scripts\python.exe server.py
# ou simplement :
python server.py
```
Puis rendez-vous sur : [http://localhost:5000](http://localhost:5000)

### Option 3 : Test visuel sans serveur (Statique)
Vous pouvez ouvrir directement [index.html](file:///c:/Users/pc/Desktop/Youtube_MP4/index.html) dans n'importe quel navigateur.
- La détection du lien et l'affichage de l'image miniature fonctionnent immédiatement !

---

## 🌟 Fonctionnalités

1. **Chargement de la vidéo comme image** :
   - Dès que vous collez ou tapez une URL YouTube (`watch?v=...`, `youtu.be/...`, `shorts/...`), la **miniature haute définition (maxres / hq)** s'affiche instantanément.
   - Les informations (titre, nom de la chaîne) sont récupérées automatiquement.
2. **Bouton « Coller » en 1 clic** :
   - Lit directement le lien YouTube depuis votre presse-papier sans avoir besoin de faire Ctrl+V.
3. **Téléchargement MP4 réel** :
   - Le bouton **DOWNLOAD MP4** appelle le backend Python qui utilise `yt-dlp` (avec support de vos cookies et haute qualité 1080p).
   - Suivi en temps réel de la barre de progression, vitesse et statut.
   - Le fichier MP4 est enregistré dans le dossier `videos/` et téléchargeable directement.
4. **Composant React disponible** :
   - Si vous préférez intégrer cela dans un projet React (Vite / Next.js), le fichier **`YoutubeConverter.jsx`** est également inclus et prêt à l'emploi.

---

## 📁 Structure du Projet

- `index.html` : Structure de la page web.
- `style.css` : Design moderne fidèle à la capture d'écran.
- `script.js` : Détection d'URL, extraction de l'image (miniature), gestion des événements.
- `server.py` : Serveur Python (sans dépendance externe ajoutée, utilise la bibliothèque standard + `yt-dlp`).
- `run_app.bat` : Lanceur 1-clic pour Windows.
- `YoutubeConverter.jsx` : Version composant React.

