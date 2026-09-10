# Prompteur Créateurs

**▶ Utiliser l'application en ligne : https://ferrusdantioch.github.io/prompteur-createurs/**

**Le télé-prompteur des créateurs de contenu.** Votre texte défile à l'écran pendant
que vous filmez ou enregistrez votre voix, sans jamais quitter l'application.

Prompteur Créateurs est une application web installable (PWA) : elle s'installe sur
un téléphone ou un ordinateur comme une application classique, fonctionne
**entièrement hors connexion** après la première visite et **n'envoie aucune donnée
sur Internet**.

---

## Fonctionnalités

### Deux modes

| | Mode Vidéaste | Mode Podcast |
|---|---|---|
| Source | Caméra avant ou arrière + micro | Micro seul |
| Affichage | Texte en surimpression sur l'aperçu caméra | Texte sur fond sombre, vumètre |
| Enregistrement | Vidéo (WebM) | Audio (WebM, conversion .wav possible) |
| Particularités | Bouton pour masquer le texte pendant le cadrage, aperçu miroir, cadrage exact | Défilement synchronisé avec l'enregistrement |

Dans les deux modes :

- démarrage, pause, reprise et arrêt de l'enregistrement **sans quitter le prompteur** ;
- décompte réglable avant l'enregistrement (3, 5 ou 10 secondes) ;
- le texte démarre, s'arrête et reprend en même temps que l'enregistrement (réglable) ;
- **le texte n'apparaît jamais dans le fichier enregistré** : seul le flux brut de la
  caméra et du micro est capté ;
- l'écran reste allumé pendant la lecture.

### Bibliothèque de scripts

- Saisie ou collage de texte, avec **sauvegarde automatique**.
- Import de fichiers **.txt** (encodages UTF-8, UTF-16 et ancien Windows détectés) et
  **.pdf** (extraction du texte, recomposition des paragraphes).
- Recherche, modification, suppression, sélection rapide depuis l'accueil.
- Nombre de mots et durée de lecture estimée.
- Les passages entre crochets, `[comme ceci]`, s'affichent en couleur atténuée : idéal
  pour les indications de jeu (`[pause]`, `[sourire]`…).

### Réglages d'affichage

Vitesse en mots par minute (modifiable pendant la lecture), taille, police (6 choix
dont deux conçues pour la lisibilité et une pour la dyslexie), gras, couleur du texte,
couleur et opacité du fond, alignement, largeur de la zone de texte, repère de lecture
et sa hauteur, texte en miroir (pour prompteur à vitre réfléchissante). Un aperçu en
direct montre le résultat.

### Mes enregistrements

Liste des vidéos et des fichiers audio, avec relecture, renommage, téléchargement,
partage direct vers une autre application (sur téléphone), conversion en .wav pour
l'audio et suppression. Un enregistrement interrompu brutalement (batterie vide,
application fermée) est **récupéré au démarrage suivant**.

---

## Confidentialité

- Aucun serveur, aucun compte, aucune statistique, aucune publicité.
- Scripts, réglages et enregistrements sont stockés **dans le navigateur de
  l'appareil** (IndexedDB et localStorage).
- Une politique de sécurité du contenu (CSP, dans `index.html`) interdit
  techniquement au navigateur de contacter toute autre adresse que le site lui-même.
- Aucune bibliothèque n'est chargée depuis un CDN : tout est inclus dans le projet.

---

## Essayer l'application sur son ordinateur

Les navigateurs n'autorisent la caméra, le micro et le mode hors ligne que sur une
adresse sécurisée (`https://`) ou sur `http://localhost`, jamais sur un fichier ouvert
par double-clic. Un petit serveur sans dépendance est fourni (Node.js requis) :

```bash
node serveur-local.js
```

Puis ouvrir **http://localhost:5190**. N'importe quel autre serveur de fichiers
statiques convient aussi.

---

## Mise en ligne

L'application est publiée avec GitHub Pages, depuis la branche `main` (dossier
racine) : **https://ferrusdantioch.github.io/prompteur-createurs/**.
Chaque envoi sur `main` met le site à jour en moins d'une minute.

Tous les chemins sont relatifs : l'application fonctionne aussi bien dans un
sous-dossier qu'à la racine d'un domaine, sans rien modifier.

> Comme toute application web, les fichiers servis (HTML, CSS, JavaScript) sont
> lisibles par les personnes qui ouvrent l'application. Leur réutilisation reste
> interdite : voir la section [Licence](#licence).

---

## Installer l'application

- **Android (Chrome)** : bouton « Installer l'application » sur l'accueil, ou menu ⋮ →
  « Installer l'application ».
- **iPhone / iPad (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

---

## Utilisation

1. **Préparer un script** : Bibliothèque → « Nouveau script » ou « Importer ». Vérifier
   le texte importé (un PDF peut demander quelques retouches), puis « Utiliser ce
   script ».
2. **Choisir un mode** sur l'accueil : Vidéaste ou Podcast. Autoriser la caméra et/ou
   le micro quand le navigateur le demande.
3. **Régler** : bouton « curseurs » en haut à droite pour la vitesse, la taille, les
   couleurs… En mode Vidéaste, le bouton « œil » masque le texte pour vérifier le
   cadrage.
4. **Enregistrer** : bouton rouge. Après le décompte, l'enregistrement démarre et le
   texte défile. « Pause » et « Arrêter » restent accessibles à tout moment.
5. **Récupérer le fichier** : à l'arrêt, une fiche s'ouvre avec « Télécharger » et
   « Partager ». Tous les enregistrements restent ensuite dans « Mes enregistrements ».

### Gestes et raccourcis

| Action | Tactile | Clavier / télécommande |
|---|---|---|
| Lecture / pause du texte | Toucher le texte | Espace ou K |
| Avancer / reculer | Glisser le texte du doigt, boutons ⌄ ⌃ | ↓ ↑ (une ligne), Page suivante / Page précédente ou → ← (trois lignes) |
| Retour au début | Bouton ⏮ | Début |
| Vitesse | Boutons + et − | + et − |
| Masquer le texte (Vidéaste) | Bouton œil | M |
| Plein écran | Bouton plein écran | F |
| Quitter | Bouton ← | Échap |

Les télécommandes Bluetooth de présentation, qui envoient les touches « page » ou les
flèches, fonctionnent directement.

---

## Formats d'enregistrement

| Navigateur | Vidéo | Audio |
|---|---|---|
| Chrome, Edge, Android | WebM (VP8 + Opus) | WebM (Opus), conversion .wav proposée |
| Firefox | WebM | WebM |
| Safari (si WebM indisponible) | MP4 (H.264 + AAC) | MP4 (AAC) |

- Qualité Standard (720p) ≈ 3 Mbit/s, soit environ 25 Mo par minute ; Haute (1080p)
  ≈ 6 Mbit/s, soit environ 45 Mo par minute. La résolution réellement obtenue dépend
  de la caméra et s'affiche en haut de l'écran.
- Les WebM produits par les navigateurs ne contiennent pas leur durée : l'application
  l'ajoute dans l'en-tête du fichier pour qu'il soit lisible et navigable dans tous les
  lecteurs.
- La conversion en .wav (16 bits, non compressé) décode le fichier en mémoire : elle est
  déconseillée au-delà de 45 minutes sur téléphone.

---

## Données : ce qu'il faut savoir

- Les données sont liées au navigateur et à l'adresse du site. **Effacer les données du
  site, désinstaller l'application sur certains appareils ou changer d'adresse de
  publication efface scripts et enregistrements.** Téléchargez les enregistrements
  importants.
- L'application demande au navigateur un stockage « persistant », qui n'est pas effacé
  automatiquement quand l'appareil manque de place.
- L'espace utilisé et l'espace disponible sont indiqués dans « Mes enregistrements ».

---

## Pour le développeur

### Structure des fichiers

```
index.html          structure des écrans, icônes (SVG) et boîtes de dialogue
styles.css          présentation : couleurs, mise en page, prompteur, adaptations mobiles
app.js              tout le fonctionnement, en 17 sections commentées
sw.js               service worker : copie hors ligne et mises à jour
manifest.json       fiche d'identité de l'application (nom, icônes, couleurs)
icons/              icônes (icon.svg est la source des PNG)
fonts/              polices intégrées (.woff2) et leurs licences
libs/pdfjs/         pdf.js (lecture des PDF) et sa licence
serveur-local.js    petit serveur de test, facultatif (non utilisé en ligne)
.claude/launch.json configuration du serveur de test pour Claude Code
LICENSE             licence : tous droits réservés, réutilisation interdite
```

Aucune dépendance à installer, aucune étape de compilation.

### Publier une modification

⚠️ Après toute modification d'un fichier mis en cache (`index.html`, `styles.css`,
`app.js`, `manifest.json`, `icons/`, `fonts/`, `libs/`), **incrémenter la version**
en haut de `sw.js` :

```js
const VERSION = 'prompteur-createurs-v1';   // → v2, v3…
```

Sans cela, les personnes ayant déjà ouvert l'application continuent de voir
l'ancienne version. Un fichier ajouté doit aussi être inscrit dans la liste `FICHIERS`
du même fichier. Côté utilisateur, un bandeau « Une nouvelle version est disponible »
apparaît alors, et la mise à jour s'applique quand il le décide (jamais pendant un
enregistrement).

### Mettre à jour pdf.js

```bash
npm pack pdfjs-dist@<version>
```

Extraire l'archive, puis copier `legacy/build/pdf.min.mjs` et
`legacy/build/pdf.worker.min.mjs` dans `libs/pdfjs/` (sans oublier d'incrémenter la
version du service worker). La version « legacy » est utilisée pour sa compatibilité
avec davantage de navigateurs.

---

## Compatibilité

Conçue en priorité pour **Chrome sur Android**, et testée pour fonctionner sur les
navigateurs récents d'ordinateur (Chrome, Edge, Firefox, Safari). Les fonctions
suivantes dépendent du navigateur et se désactivent proprement si elles manquent :
partage de fichiers, maintien de l'écran allumé, verrouillage de l'orientation, plein
écran (non disponible sur iPhone), installation.

---

## Bibliothèques et polices tierces

Toutes sont sous licence permissive, compatible avec un usage commercial.

| Élément | Version | Licence | Emplacement |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla) | 6.3.289, build « legacy » | Apache 2.0 | `libs/pdfjs/` (licence : `LICENSE`) |
| Atkinson Hyperlegible Next (Braille Institute) | Fontsource 5.3.0 | SIL OFL 1.1 | `fonts/` |
| Lexend | Fontsource 5.3.0 | SIL OFL 1.1 | `fonts/` |
| Literata | Fontsource 5.3.0 | SIL OFL 1.1 | `fonts/` |
| Roboto Mono | Fontsource 5.3.0 | SIL OFL 1.1 | `fonts/` |
| OpenDyslexic | Fontsource 5.3.0 | SIL OFL 1.1 | `fonts/` |

Les textes complets des licences des polices sont dans `fonts/licences/`. La licence
OFL autorise l'intégration des polices dans une application commerciale ; elle interdit
seulement de vendre les polices seules.

Les icônes et l'interface ont été créées spécifiquement pour ce projet.

---

## Licence

© 2026 FerrusDantioch — **tous droits réservés.** Le code est consultable, mais sa
réutilisation est interdite : copie, modification, redistribution, hébergement ou
exploitation commerciale nécessitent une autorisation écrite préalable. Les
conditions complètes figurent dans le fichier [LICENSE](LICENSE).

L'application en ligne reste libre d'utilisation. Les composants tiers (pdf.js et
les polices) conservent leur propre licence, indiquée plus haut.
