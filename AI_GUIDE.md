---
title: RONIN — Guide IA
type: reference
projet: "[[RONIN Tool]]"
cree: 2026-11-10
tags: [windows, outil, guide, ia]
---

# RONIN — Prompt IA

Prompt à copier-coller pour une IA qui modifie le tool :

---

Tu modifies **RONIN**, une app Windows (pywebview : UI web, backend Python). Code : `Documents\RoninTool` (app) et `Documents\RoninKeygen` (admin). Chaque dossier : `*_app.py`, `ui/` (`index.html`, `style.css`, `app.js`, `fonts/`), `build.bat`.

**Style — obligatoire, ne jamais dévier :**
- Fond encre noire à bords pinceau (filtres SVG `#ink`/`#brush`), **un seul accent : rouge `--red`**. Jamais d'orange, de dégradé, de coins arrondis.
- Police **Cinzel** en capitales. Un **kanji** rouge par écran (police `"Brush"`).
- Apparition = **glitch + texte lettre par lettre** (mettre `data-t`, appeler `typeAll`), jamais un fondu.
- Toujours réutiliser les variables `:root` (`--red`, `--white`, `--grey`…), jamais une couleur en dur. Réutiliser `.ink`, `.row`, `.pill`, `.act`.

**Méthode :**
1. Modifier → lancer `pythonw app.py` (hors bac à sable, sinon pas de fenêtre) → vérifier à l'écran → `build.bat`.
2. Aperçu style sans backend : ouvrir `ui/index.html?mock`.

**Pièges :**
- Raccourcis clavier : lire `e.code` (`Digit1`…), pas `e.key` (clavier AZERTY).
- Méthode Python appelable depuis le JS = sans `_` ; interne = préfixe `_`.
- Nouveau kanji → retélécharger le sous-ensemble de police (`Yuji Boku`, `&text=…`), sinon carré blanc.
- **Vérifier à l'écran qu'aucun texte/icône ne se chevauche.**

**Ne pas toucher :** les `.pem` (clés privées, hors dépôt), le garde `_guard()` sur les actions sensibles. Si tu régénères une clé, mets à jour la publique **des deux côtés**.

---

Détails complets si besoin : [[RONIN Tool]].
