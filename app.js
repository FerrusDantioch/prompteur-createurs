/* =========================================================================
   Prompteur Créateurs — app.js
   -------------------------------------------------------------------------
   Tout le fonctionnement de l'application, en JavaScript « pur » : aucun
   framework, aucune étape de compilation. La seule bibliothèque utilisée est
   pdf.js (dossier libs/), chargée uniquement au moment d'importer un PDF.

   Sommaire
     1.  Outils généraux
     2.  Base de données locale (IndexedDB)
     3.  Réglages d'affichage (localStorage)
     4.  Navigation entre les écrans
     5.  Notifications et boîtes de dialogue
     6.  Bibliothèque de scripts
     7.  Éditeur de script
     8.  Import de fichiers .txt et .pdf
     9.  Moteur de défilement du texte
    10.  Écran du prompteur : ouverture, commandes, clavier
    11.  Caméra et micro
    12.  Enregistrement et sauvegarde au fil de l'eau
    13.  Fichiers WebM (durée) et conversion en WAV
    14.  Mes enregistrements
    15.  Écran allumé, plein écran, orientation
    16.  Installation et mises à jour de l'application
    17.  Démarrage

   Conseil de lecture : les sections 1 à 5 sont des « briques » réutilisées
   partout. Le cœur du prompteur se trouve dans les sections 9 à 13.
   ========================================================================= */


/* =========================================================================
   1. OUTILS GÉNÉRAUX
   ========================================================================= */

/** Raccourci : renvoie l'élément de la page qui porte cet identifiant. */
const $ = (identifiant) => document.getElementById(identifiant);

/**
 * Crée un élément HTML.
 * Sécurité : le texte est toujours inséré avec textContent, jamais avec
 * innerHTML. Ainsi, même si un script importé contient du code HTML ou
 * JavaScript, il s'affiche comme du simple texte et ne s'exécute jamais.
 *
 * @param {string} balise    - ex. 'li', 'button'
 * @param {object} options   - { classe, texte, ...autres propriétés }
 * @param {Array}  enfants   - éléments ou textes à placer à l'intérieur
 */
function creerElement(balise, options = {}, enfants = []) {
  const element = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(options)) {
    if (cle === 'classe') element.className = valeur;
    else if (cle === 'texte') element.textContent = valeur;
    else if (cle.startsWith('data-') || cle.startsWith('aria-')) element.setAttribute(cle, valeur);
    else element[cle] = valeur;
  }
  for (const enfant of [].concat(enfants)) {
    if (enfant !== null && enfant !== undefined && enfant !== false) element.append(enfant);
  }
  return element;
}

/** Crée une icône qui pointe vers la bibliothèque d'icônes de index.html. */
function creerIcone(nom) {
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('aria-hidden', 'true');
  const utilisation = document.createElementNS(SVG, 'use');
  utilisation.setAttribute('href', '#i-' + nom);
  svg.append(utilisation);
  return svg;
}

/** Remplace l'icône d'un bouton existant (ex. : lecture ↔ pause). */
function changerIcone(bouton, nom) {
  const utilisation = bouton.querySelector('use');
  if (utilisation) utilisation.setAttribute('href', '#i-' + nom);
}

/** Crée un bouton avec une icône et/ou un texte, et son action au clic. */
function creerBouton({ texte, icone, classe = 'bouton bouton-secondaire bouton-petit', titre, action }) {
  const bouton = creerElement('button', { type: 'button', classe });
  if (icone) bouton.append(creerIcone(icone));
  if (texte) bouton.append(creerElement('span', { texte }));
  if (titre) {
    bouton.title = titre;
    bouton.setAttribute('aria-label', titre);
  }
  if (action) bouton.addEventListener('click', action);
  return bouton;
}

/** Fabrique un identifiant unique (pour un script ou un enregistrement). */
function nouvelIdentifiant() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  /* Solution de repli pour les navigateurs plus anciens. */
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Petite pause utilisable avec await : await attendre(1000) = 1 seconde. */
const attendre = (millisecondes) => new Promise((resoudre) => setTimeout(resoudre, millisecondes));

/** Limite un nombre entre un minimum et un maximum. */
const borner = (valeur, minimum, maximum) => Math.min(maximum, Math.max(minimum, valeur));

/** 83 500 ms → « 1:23 » ; 3 723 000 ms → « 1:02:03 ». */
function formaterDuree(millisecondes) {
  const totalSecondes = Math.max(0, Math.round((millisecondes || 0) / 1000));
  const heures = Math.floor(totalSecondes / 3600);
  const minutes = Math.floor((totalSecondes % 3600) / 60);
  const secondes = String(totalSecondes % 60).padStart(2, '0');
  return heures > 0
    ? `${heures}:${String(minutes).padStart(2, '0')}:${secondes}`
    : `${minutes}:${secondes}`;
}

/** 1 536 000 octets → « 1,5 Mo ». */
function formaterTaille(octets) {
  const unites = ['octets', 'Ko', 'Mo', 'Go'];
  let valeur = octets || 0;
  let rang = 0;
  while (valeur >= 1024 && rang < unites.length - 1) {
    valeur /= 1024;
    rang += 1;
  }
  const chiffres = rang === 0 ? 0 : 1;
  return `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })} ${unites[rang]}`;
}

/** Horodatage → « 10 sept. 2026 à 14:32 ». */
function formaterDate(horodatage) {
  const date = new Date(horodatage);
  const jour = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

/**
 * Compte les mots réellement prononcés : les [indications] entre crochets
 * sont ignorées. « aujourd'hui » ou « peut-être » comptent pour un seul mot.
 * \p{L} signifie « n'importe quelle lettre » (accents compris), \p{N} « chiffre ».
 */
function compterMots(texte) {
  const sansIndications = (texte || '').replace(/\[[^\]]*\]/g, ' ');
  const mots = sansIndications.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return mots ? mots.length : 0;
}

/** Durée de lecture estimée, ex. « ≈ 2 min 30 s ». */
function formaterDureeLecture(nombreDeMots, motsParMinute) {
  const secondes = Math.round((nombreDeMots / motsParMinute) * 60);
  if (secondes < 60) return `≈ ${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return reste ? `≈ ${minutes} min ${reste} s` : `≈ ${minutes} min`;
}

/** Pour la recherche : « Été » et « ete » doivent se correspondre. */
function normaliserPourRecherche(texte) {
  return (texte || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Transforme un nom libre en nom de fichier accepté par tous les systèmes. */
function nettoyerNomFichier(nom) {
  const propre = (nom || '')
    .replace(/[\\/:*?"<>|]/g, ' ') // caractères interdits sous Windows
    .replace(/\p{Cc}/gu, ' ') // caractères de contrôle invisibles
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return propre || 'enregistrement';
}

/** Transforme un code couleur « #rrggbb » + une opacité en « rgba(r, g, b, a) ». */
function couleurAvecOpacite(hexadecimal, opacite) {
  const r = parseInt(hexadecimal.slice(1, 3), 16);
  const g = parseInt(hexadecimal.slice(3, 5), 16);
  const b = parseInt(hexadecimal.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacite})`;
}

/** Luminosité perçue d'une couleur, de 0 (noir) à 1 (blanc). */
function luminosite(hexadecimal) {
  const r = parseInt(hexadecimal.slice(1, 3), 16);
  const g = parseInt(hexadecimal.slice(3, 5), 16);
  const b = parseInt(hexadecimal.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}


/* =========================================================================
   2. BASE DE DONNÉES LOCALE (IndexedDB)
   -------------------------------------------------------------------------
   IndexedDB est une vraie base de données intégrée au navigateur. On la
   préfère à localStorage pour les scripts et surtout pour les vidéos :
   localStorage ne stocke que du texte et plafonne vers 5 Mo, alors
   qu'IndexedDB accepte des fichiers de plusieurs centaines de Mo.

   Nos quatre « magasins » (l'équivalent de tables) :
     - scripts         : { id, titre, texte, creeLe, modifieLe }
     - enregistrements : les FICHES des enregistrements (nom, durée, taille…),
                         légères, pour afficher la liste rapidement
     - fichiers        : { id, blob } le fichier audio/vidéo complet
     - morceaux        : les morceaux d'un enregistrement EN COURS, écrits
                         chaque seconde. Si le téléphone s'éteint ou si
                         l'application est fermée brutalement, on peut
                         reconstituer l'enregistrement au prochain démarrage.
   ========================================================================= */

const BD_NOM = 'prompteur-createurs';
const BD_VERSION = 1;
let promesseBase = null;

/** Ouvre la base (une seule fois) et crée les magasins au tout premier lancement. */
function ouvrirBase() {
  if (!promesseBase) {
    promesseBase = new Promise((resoudre, rejeter) => {
      if (!('indexedDB' in window)) {
        rejeter(new Error('IndexedDB indisponible dans ce navigateur.'));
        return;
      }
      const demande = indexedDB.open(BD_NOM, BD_VERSION);

      /* « upgradeneeded » ne se déclenche qu'à la création de la base ou
         quand BD_VERSION augmente : c'est le seul moment où l'on peut créer
         des magasins. */
      demande.onupgradeneeded = () => {
        const base = demande.result;
        if (!base.objectStoreNames.contains('scripts')) {
          base.createObjectStore('scripts', { keyPath: 'id' });
        }
        if (!base.objectStoreNames.contains('enregistrements')) {
          base.createObjectStore('enregistrements', { keyPath: 'id' });
        }
        if (!base.objectStoreNames.contains('fichiers')) {
          base.createObjectStore('fichiers', { keyPath: 'id' });
        }
        if (!base.objectStoreNames.contains('morceaux')) {
          /* Clé composée [identifiant, numéro] : les morceaux d'un même
             enregistrement sont automatiquement rangés dans l'ordre. */
          base.createObjectStore('morceaux', { keyPath: ['enregistrementId', 'index'] });
        }
      };
      demande.onsuccess = () => resoudre(demande.result);
      demande.onerror = () => rejeter(demande.error);
    });
  }
  return promesseBase;
}

/**
 * Exécute une opération sur un magasin et attend la FIN de la transaction
 * (« oncomplete ») : à ce moment-là seulement, les données sont réellement
 * écrites sur le disque.
 */
async function executerDansMagasin(nomMagasin, mode, operation) {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const transaction = base.transaction(nomMagasin, mode);
    const requete = operation(transaction.objectStore(nomMagasin));
    transaction.oncomplete = () => resoudre(requete ? requete.result : undefined);
    transaction.onerror = () => rejeter(transaction.error);
    transaction.onabort = () => rejeter(transaction.error || new Error('Opération annulée'));
  });
}

/** Les opérations dont l'application a besoin, avec des noms parlants. */
const bd = {
  lire: (magasin, cle) => executerDansMagasin(magasin, 'readonly', (m) => m.get(cle)),
  lireTout: (magasin, intervalle) => executerDansMagasin(magasin, 'readonly', (m) => m.getAll(intervalle)),
  ecrire: (magasin, objet) => executerDansMagasin(magasin, 'readwrite', (m) => m.put(objet)),
  supprimer: (magasin, cleOuIntervalle) => executerDansMagasin(magasin, 'readwrite', (m) => m.delete(cleOuIntervalle)),

  /** Tous les morceaux d'un enregistrement (du numéro 0 à l'infini). */
  intervalleMorceaux: (enregistrementId) => IDBKeyRange.bound([enregistrementId, 0], [enregistrementId, Infinity]),

  /** Écrit plusieurs objets dans plusieurs magasins en une seule transaction :
      soit tout est écrit, soit rien (jamais de fiche sans son fichier). */
  async ecrireEnsemble(ecritures) {
    const base = await ouvrirBase();
    const magasins = [...new Set(ecritures.map((e) => e.magasin))];
    return new Promise((resoudre, rejeter) => {
      const transaction = base.transaction(magasins, 'readwrite');
      for (const { magasin, objet } of ecritures) transaction.objectStore(magasin).put(objet);
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error);
      transaction.onabort = () => rejeter(transaction.error || new Error('Opération annulée'));
    });
  },

  /** Supprime une fiche d'enregistrement, son fichier et ses morceaux éventuels. */
  async supprimerEnregistrement(id) {
    const base = await ouvrirBase();
    return new Promise((resoudre, rejeter) => {
      const transaction = base.transaction(['enregistrements', 'fichiers', 'morceaux'], 'readwrite');
      transaction.objectStore('enregistrements').delete(id);
      transaction.objectStore('fichiers').delete(id);
      transaction.objectStore('morceaux').delete(bd.intervalleMorceaux(id));
      transaction.oncomplete = () => resoudre();
      transaction.onerror = () => rejeter(transaction.error);
      transaction.onabort = () => rejeter(transaction.error || new Error('Opération annulée'));
    });
  }
};


/* =========================================================================
   3. RÉGLAGES D'AFFICHAGE (localStorage)
   -------------------------------------------------------------------------
   Les réglages sont petits : localStorage suffit et se lit instantanément
   au démarrage (pas d'attente, pas de « clignotement » de l'affichage).

   Principe de la liaison automatique : dans index.html, chaque champ porte
   data-reglage="nomDuReglage". Une seule fonction relie TOUS ces champs,
   dans l'écran Réglages comme dans le panneau rapide du prompteur. Modifier
   la vitesse à un endroit met donc à jour l'autre instantanément.
   ========================================================================= */

const CLE_REGLAGES = 'prompteur-createurs.reglages';
const CLE_SCRIPT_ACTIF = 'prompteur-createurs.script-actif';
const CLE_PREMIER_LANCEMENT = 'prompteur-createurs.premier-lancement-fait';
const CLE_CAMERA = 'prompteur-createurs.camera';

/** Valeurs de départ. Object.freeze empêche de les modifier par erreur. */
const REGLAGES_PAR_DEFAUT = Object.freeze({
  vitesse: 140,              // mots par minute
  taillePolice: 44,          // pixels
  police: 'atkinson',
  gras: false,
  alignement: 'gauche',      // 'gauche' ou 'centre'
  largeurTexte: 92,          // % de la largeur de l'écran
  couleurTexte: '#ffffff',
  couleurFond: '#000000',
  opaciteFond: 55,           // %
  repereLecture: true,
  positionLecture: 30,       // % de la hauteur, depuis le haut
  miroirTexte: false,
  lancerAvecEnregistrement: true,
  decompte: 3,               // secondes
  qualiteVideo: '1080',      // '720' ou '1080'
  miroirApercu: true,
  apercuRemplir: false,
  traitementAudio: true
});

/** Bornes des réglages numériques (protège contre des valeurs farfelues). */
const LIMITES_REGLAGES = {
  vitesse: [40, 300],
  taillePolice: [16, 140],
  largeurTexte: [40, 100],
  opaciteFond: [0, 100],
  positionLecture: [10, 70]
};

/** Chaque police proposée, avec ses polices de secours. */
const POLICES = {
  atkinson: '"Atkinson Hyperlegible Next", system-ui, sans-serif',
  lexend: '"Lexend", system-ui, sans-serif',
  literata: '"Literata", Georgia, "Times New Roman", serif',
  robotomono: '"Roboto Mono", ui-monospace, Consolas, monospace',
  opendyslexic: '"OpenDyslexic", system-ui, sans-serif',
  systeme: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
};

/** Combinaisons de couleurs toutes prêtes (boutons de l'écran Réglages). */
const COMBINAISONS_COULEURS = {
  'blanc-noir': { couleurTexte: '#ffffff', couleurFond: '#000000', opaciteFond: 100 },
  'jaune-noir': { couleurTexte: '#ffe066', couleurFond: '#000000', opaciteFond: 100 },
  'noir-blanc': { couleurTexte: '#111111', couleurFond: '#ffffff', opaciteFond: 100 },
  transparent: { couleurTexte: '#ffffff', couleurFond: '#000000', opaciteFond: 0 }
};

let reglages = chargerReglages();
let minuteurSauvegardeReglages = null;

/** Lit les réglages enregistrés, en complétant par les valeurs de départ. */
function chargerReglages() {
  let enregistres = {};
  try {
    enregistres = JSON.parse(localStorage.getItem(CLE_REGLAGES)) || {};
  } catch {
    enregistres = {}; // données illisibles : on repart des valeurs de départ
  }
  return validerReglages({ ...REGLAGES_PAR_DEFAUT, ...enregistres });
}

/**
 * Vérifie et corrige chaque réglage : bon type (nombre, vrai/faux, texte),
 * valeur dans les bornes, choix existant. Les champs de formulaire renvoient
 * toujours du texte (« 140 ») : on le convertit ici selon le type attendu.
 */
function validerReglages(brut) {
  const propre = {};
  for (const [cle, parDefaut] of Object.entries(REGLAGES_PAR_DEFAUT)) {
    let valeur = brut[cle];
    if (typeof parDefaut === 'number') {
      valeur = Number(valeur);
      if (!Number.isFinite(valeur)) valeur = parDefaut;
      if (LIMITES_REGLAGES[cle]) valeur = borner(valeur, ...LIMITES_REGLAGES[cle]);
    } else if (typeof parDefaut === 'boolean') {
      valeur = typeof valeur === 'boolean' ? valeur : parDefaut;
    } else {
      valeur = typeof valeur === 'string' ? valeur : parDefaut;
    }
    propre[cle] = valeur;
  }
  if (!POLICES[propre.police]) propre.police = REGLAGES_PAR_DEFAUT.police;
  if (!['gauche', 'centre'].includes(propre.alignement)) propre.alignement = 'gauche';
  if (![0, 3, 5, 10].includes(propre.decompte)) propre.decompte = REGLAGES_PAR_DEFAUT.decompte;
  if (!['720', '1080'].includes(propre.qualiteVideo)) propre.qualiteVideo = REGLAGES_PAR_DEFAUT.qualiteVideo;
  for (const cle of ['couleurTexte', 'couleurFond']) {
    if (!/^#[0-9a-f]{6}$/i.test(propre[cle])) propre[cle] = REGLAGES_PAR_DEFAUT[cle];
  }
  return propre;
}

/** Modifie un ou plusieurs réglages, met l'affichage à jour et sauvegarde. */
function modifierReglages(modifications) {
  reglages = validerReglages({ ...reglages, ...modifications });
  appliquerReglages();
  synchroniserChampsReglages();
  /* On attend 300 ms sans nouveau changement avant d'écrire : pendant qu'on
     fait glisser un curseur, inutile d'écrire 60 fois par seconde. */
  clearTimeout(minuteurSauvegardeReglages);
  minuteurSauvegardeReglages = setTimeout(sauvegarderReglages, 300);
}

function sauvegarderReglages() {
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages));
  } catch (erreur) {
    console.warn('Réglages non sauvegardés :', erreur);
  }
}

/**
 * Traduit les réglages en variables CSS (voir la section 2 de styles.css).
 * Changer une variable sur <html> met à jour instantanément tous les
 * éléments qui l'utilisent : l'aperçu ET le prompteur.
 */
function appliquerReglages() {
  const style = document.documentElement.style;
  style.setProperty('--prompteur-police', POLICES[reglages.police]);
  style.setProperty('--prompteur-taille', reglages.taillePolice + 'px');
  style.setProperty('--prompteur-graisse', reglages.gras ? '700' : '400');
  style.setProperty('--prompteur-couleur', reglages.couleurTexte);
  style.setProperty('--prompteur-fond', couleurAvecOpacite(reglages.couleurFond, reglages.opaciteFond / 100));
  style.setProperty('--prompteur-alignement', reglages.alignement === 'centre' ? 'center' : 'left');
  style.setProperty('--prompteur-largeur', reglages.largeurTexte + '%');
  style.setProperty('--position-lecture', reglages.positionLecture + '%');

  /* Ombre autour des lettres : utile si le fond est très transparent et le
     texte clair (il faut qu'il se détache de l'image de la caméra). */
  const ombre = reglages.opaciteFond < 60 && luminosite(reglages.couleurTexte) > 0.5;

  for (const zone of document.querySelectorAll('.zone-prompteur')) {
    zone.dataset.miroirTexte = reglages.miroirTexte ? 'oui' : 'non';
    zone.dataset.repere = reglages.repereLecture ? 'oui' : 'non';
    zone.dataset.ombreTexte = ombre ? 'oui' : 'non';
    zone.dataset.apercuRemplir = reglages.apercuRemplir ? 'oui' : 'non';
  }

  appliquerMiroirCamera();
  /* La taille ou la largeur du texte ont pu changer : le moteur de
     défilement doit reprendre ses mesures. */
  demanderNouvellesMesures();
}

/** Texte affiché à côté d'un curseur, ex. « 140 mots/min ». */
function formaterValeurReglage(cle, versionCourte) {
  const valeur = reglages[cle];
  switch (cle) {
    case 'vitesse': return versionCourte ? String(valeur) : `${valeur} mots/min`;
    case 'taillePolice': return `${valeur} px`;
    default: return `${valeur} %`;
  }
}

/** Recopie les réglages actuels dans tous les champs et affichages de valeur. */
function synchroniserChampsReglages() {
  for (const champ of document.querySelectorAll('[data-reglage]')) {
    const valeur = reglages[champ.dataset.reglage];
    if (champ.type === 'checkbox') champ.checked = Boolean(valeur);
    else if (champ.type === 'radio') champ.checked = champ.value === String(valeur);
    else champ.value = String(valeur);
  }
  for (const sortie of document.querySelectorAll('[data-valeur-reglage]')) {
    sortie.textContent = formaterValeurReglage(sortie.dataset.valeurReglage, sortie.classList.contains('valeur-vitesse'));
  }
}

/** Relie une fois pour toutes chaque champ data-reglage à son réglage. */
function lierChampsReglages() {
  for (const champ of document.querySelectorAll('[data-reglage]')) {
    /* Curseurs et couleurs : « input » réagit PENDANT le glissement.
       Cases, listes, boutons radio : « change » suffit. */
    const typeEvenement = champ.type === 'range' || champ.type === 'color' ? 'input' : 'change';
    champ.addEventListener(typeEvenement, () => {
      if (champ.type === 'radio' && !champ.checked) return;
      const valeur = champ.type === 'checkbox' ? champ.checked : champ.value;
      modifierReglages({ [champ.dataset.reglage]: valeur });
    });
  }

  for (const bouton of document.querySelectorAll('[data-preset]')) {
    bouton.addEventListener('click', () => modifierReglages(COMBINAISONS_COULEURS[bouton.dataset.preset]));
  }

  $('bouton-reinitialiser-reglages').addEventListener('click', async () => {
    const accord = await demanderConfirmation({
      titre: 'Rétablir les réglages ?',
      message: 'Tous les réglages d\'affichage reprendront leur valeur de départ. Vos scripts et enregistrements ne sont pas concernés.',
      bouton: 'Rétablir',
      danger: false
    });
    if (accord) {
      modifierReglages({ ...REGLAGES_PAR_DEFAUT });
      notifier('Réglages rétablis.', 'succes');
    }
  });
}

/* =========================================================================
   4. NAVIGATION ENTRE LES ÉCRANS
   -------------------------------------------------------------------------
   L'application n'a qu'une seule page HTML. « Changer d'écran » consiste à
   masquer l'écran actuel et à afficher le suivant.

   Pour que le bouton « retour » d'Android (ou du navigateur) fonctionne, on
   inscrit chaque changement d'écran dans l'historique avec history.pushState.
   Appuyer sur « retour » déclenche alors l'événement « popstate » et l'on
   réaffiche l'écran précédent, au lieu de quitter l'application.
   ========================================================================= */

const ECRANS = ['accueil', 'bibliotheque', 'editeur', 'reglages', 'enregistrements', 'prompteur'];
let ecranActuel = 'accueil';
/* Nombre d'écrans empilés au-dessus de l'accueil dans l'historique. */
let profondeurHistorique = 0;

/** Ce qu'il faut faire en arrivant sur un écran, ou en le quittant. */
const actionsEcrans = {
  accueil: { arrivee: () => afficherAccueil() },
  bibliotheque: { arrivee: () => afficherBibliotheque() },
  editeur: { depart: () => quitterEditeur() },
  reglages: { arrivee: () => synchroniserChampsReglages() },
  enregistrements: { arrivee: () => afficherEnregistrements() },
  prompteur: { arrivee: () => demarrerPrompteur(), depart: () => fermerPrompteur() }
};

/** Affiche un écran et masque tous les autres (sans toucher à l'historique). */
function afficherEcran(nom) {
  if (!ECRANS.includes(nom)) nom = 'accueil';
  const precedent = ecranActuel;
  if (precedent === nom) return;

  actionsEcrans[precedent]?.depart?.();
  for (const ecran of document.querySelectorAll('[data-ecran]')) {
    ecran.hidden = ecran.dataset.ecran !== nom;
  }
  ecranActuel = nom;
  document.body.classList.toggle('prompteur-actif', nom === 'prompteur');
  window.scrollTo(0, 0);
  actionsEcrans[nom]?.arrivee?.();
}

/** Va vers un écran en l'ajoutant à l'historique (ou en remplaçant l'actuel). */
function allerVers(nom, { remplacer = false } = {}) {
  if (nom === ecranActuel) return;
  if (!remplacer) profondeurHistorique += 1;
  const etat = { ecran: nom, profondeur: profondeurHistorique };
  if (remplacer) history.replaceState(etat, '', '#' + nom);
  else history.pushState(etat, '', '#' + nom);
  afficherEcran(nom);
}

/** Écran précédent (comme le bouton retour du téléphone). */
function revenir() {
  if (profondeurHistorique > 0) history.back();
  else allerVers('accueil', { remplacer: true });
}

/** Retour direct à l'accueil, en « dépilant » tout l'historique de l'appli. */
function revenirAccueil() {
  if (profondeurHistorique > 0) history.go(-profondeurHistorique);
  else afficherEcran('accueil');
}

function initialiserNavigation() {
  /* Au démarrage, on part toujours de l'accueil (même après un rechargement
     de page sur un autre écran). */
  history.replaceState({ ecran: 'accueil', profondeur: 0 }, '', '#accueil');

  window.addEventListener('popstate', (evenement) => {
    const etat = evenement.state || { ecran: 'accueil', profondeur: 0 };
    profondeurHistorique = etat.profondeur || 0;
    afficherEcran(etat.ecran);
  });

  /* Un seul écouteur pour tous les boutons data-aller et data-action :
     c'est la « délégation d'événements ». */
  document.addEventListener('click', (evenement) => {
    const lien = evenement.target.closest('[data-aller]');
    if (lien) allerVers(lien.dataset.aller);
    if (evenement.target.closest('[data-action="retour"]')) revenir();
    const annulation = evenement.target.closest('[data-action="annuler-dialogue"]');
    if (annulation) annulation.closest('dialog').close('annuler');
  });
}


/* =========================================================================
   5. NOTIFICATIONS ET BOÎTES DE DIALOGUE
   ========================================================================= */

/**
 * Affiche un petit message temporaire en bas de l'écran.
 * @param {string} message
 * @param {'info'|'succes'|'erreur'} type
 */
function notifier(message, type = 'info', duree = 4000) {
  const zone = $('zone-notifications');
  const element = creerElement('div', { classe: `notification notification-${type}`, texte: message });
  zone.append(element);
  /* Jamais plus de trois messages empilés. */
  while (zone.children.length > 3) zone.firstElementChild.remove();
  setTimeout(() => {
    element.classList.add('disparait');
    setTimeout(() => element.remove(), 300);
  }, type === 'erreur' ? Math.max(duree, 7000) : duree);
}

/**
 * Ouvre une boîte <dialog> et renvoie une promesse résolue à sa fermeture,
 * avec la valeur du bouton utilisé (« ok », « annuler »…).
 * Le mot-clé await permet ensuite d'écrire : const choix = await ouvrirDialogue(…)
 */
function ouvrirDialogue(dialogue) {
  return new Promise((resoudre) => {
    dialogue.returnValue = '';
    dialogue.addEventListener('close', () => resoudre(dialogue.returnValue), { once: true });
    dialogue.showModal();
  });
}

/** Demande une confirmation (« Supprimer ce script ? »). Renvoie true ou false. */
async function demanderConfirmation({ titre, message, bouton = 'Confirmer', danger = true }) {
  $('confirmation-titre').textContent = titre;
  $('confirmation-message').textContent = message;
  const boutonOk = $('confirmation-ok');
  boutonOk.textContent = bouton;
  boutonOk.className = danger ? 'bouton bouton-danger' : 'bouton bouton-primaire';
  return (await ouvrirDialogue($('dialogue-confirmation'))) === 'ok';
}

/** Demande un texte (ex. : nouveau nom). Renvoie le texte, ou null si annulé. */
async function demanderTexte({ titre, etiquette, valeur = '' }) {
  $('saisie-titre').textContent = titre;
  $('saisie-etiquette').textContent = etiquette;
  const champ = $('saisie-champ');
  champ.value = valeur;
  const promesse = ouvrirDialogue($('dialogue-saisie'));
  champ.select();
  return (await promesse) === 'ok' ? champ.value.trim() : null;
}


/* =========================================================================
   6. BIBLIOTHÈQUE DE SCRIPTS
   ========================================================================= */

/** Copie de la liste des scripts, du plus récemment modifié au plus ancien. */
let scriptsEnMemoire = [];

async function chargerScripts() {
  const scripts = await bd.lireTout('scripts');
  scriptsEnMemoire = scripts.sort((a, b) => b.modifieLe - a.modifieLe);
  return scriptsEnMemoire;
}

/* Le script « sélectionné » est mémorisé par son identifiant. */
function lireIdScriptActif() {
  try {
    return localStorage.getItem(CLE_SCRIPT_ACTIF);
  } catch {
    return null;
  }
}

function definirScriptActif(id) {
  try {
    if (id) localStorage.setItem(CLE_SCRIPT_ACTIF, id);
    else localStorage.removeItem(CLE_SCRIPT_ACTIF);
  } catch {
    /* stockage indisponible : la sélection ne sera simplement pas retenue */
  }
}

async function lireScriptActif() {
  const id = lireIdScriptActif();
  if (!id) return null;
  return (await bd.lire('scripts', id)) || null;
}

/** Enregistre un nouveau script et le renvoie. */
async function creerScript({ titre = '', texte = '' } = {}) {
  const maintenant = Date.now();
  const script = { id: nouvelIdentifiant(), titre, texte, creeLe: maintenant, modifieLe: maintenant };
  await bd.ecrire('scripts', script);
  return script;
}

/** Remplit la carte « Script sélectionné » de l'accueil. */
async function afficherAccueil() {
  let script = null;
  try {
    script = await lireScriptActif();
  } catch (erreur) {
    console.error(erreur);
  }
  $('script-actif-titre').textContent = script ? script.titre || 'Sans titre' : 'Aucun script sélectionné';
  if (script) {
    const mots = compterMots(script.texte);
    $('script-actif-details').textContent =
      `${mots} mots · ${formaterDureeLecture(mots, reglages.vitesse)} à ${reglages.vitesse} mots/min`;
  } else {
    $('script-actif-details').textContent = 'Choisissez un script dans la bibliothèque, ou créez-en un.';
  }
  $('bouton-modifier-script-actif').hidden = !script;
}

async function afficherBibliotheque() {
  try {
    await chargerScripts();
  } catch (erreur) {
    notifier('Impossible de lire la bibliothèque : ' + erreur.message, 'erreur');
  }
  dessinerListeScripts();
}

/** (Re)construit la liste visible, en tenant compte de la recherche. */
function dessinerListeScripts() {
  const recherche = normaliserPourRecherche($('recherche-scripts').value.trim());
  const idActif = lireIdScriptActif();
  const scripts = recherche
    ? scriptsEnMemoire.filter((s) => normaliserPourRecherche(`${s.titre} ${s.texte}`).includes(recherche))
    : scriptsEnMemoire;

  $('liste-scripts').replaceChildren(...scripts.map((s) => creerElementScript(s, s.id === idActif)));

  const messageVide = $('bibliotheque-vide');
  messageVide.hidden = scripts.length > 0;
  messageVide.textContent = scriptsEnMemoire.length === 0
    ? 'Aucun script pour l\'instant. Créez-en un ou importez un fichier texte ou PDF.'
    : 'Aucun script ne correspond à cette recherche.';
}

/** Fabrique la « carte » d'un script dans la liste. */
function creerElementScript(script, estActif) {
  const mots = compterMots(script.texte);
  const extrait = script.texte.replace(/\s+/g, ' ').trim().slice(0, 180);

  return creerElement('li', { classe: 'element-liste' + (estActif ? ' est-actif' : '') }, [
    creerElement('h2', { classe: 'element-titre' }, [
      script.titre || 'Sans titre',
      estActif ? creerElement('span', { classe: 'badge', texte: 'Sélectionné' }) : null
    ]),
    extrait ? creerElement('p', { classe: 'element-extrait', texte: extrait }) : null,
    creerElement('p', {
      classe: 'element-meta',
      texte: `${mots} mots · ${formaterDureeLecture(mots, reglages.vitesse)} · modifié le ${formaterDate(script.modifieLe)}`
    }),
    creerElement('div', { classe: 'element-actions' }, [
      creerBouton({
        texte: 'Utiliser',
        icone: 'coche',
        classe: 'bouton bouton-primaire bouton-petit',
        action: () => utiliserScript(script.id)
      }),
      creerBouton({ texte: 'Modifier', icone: 'crayon', action: () => ouvrirEditeur(script.id) }),
      creerBouton({
        texte: 'Supprimer',
        icone: 'corbeille',
        classe: 'bouton bouton-danger bouton-petit',
        action: async () => {
          if (await supprimerScript(script.id)) afficherBibliotheque();
        }
      })
    ])
  ]);
}

/** Sélectionne un script pour la lecture et revient à l'accueil. */
async function utiliserScript(id) {
  const script = await bd.lire('scripts', id);
  if (!script) return;
  definirScriptActif(id);
  notifier(`« ${script.titre || 'Sans titre'} » est prêt à être lu.`, 'succes');
  revenirAccueil();
}

/** Supprime un script après confirmation. Renvoie true si c'est fait. */
async function supprimerScript(id) {
  const script = await bd.lire('scripts', id);
  if (!script) return false;
  const accord = await demanderConfirmation({
    titre: 'Supprimer ce script ?',
    message: `« ${script.titre || 'Sans titre'} » sera définitivement effacé de cet appareil.`,
    bouton: 'Supprimer'
  });
  if (!accord) return false;
  await bd.supprimer('scripts', id);
  if (lireIdScriptActif() === id) definirScriptActif(null);
  notifier('Script supprimé.');
  return true;
}

function initialiserBibliotheque() {
  $('bouton-nouveau-script').addEventListener('click', () => ouvrirEditeur(null));
  $('recherche-scripts').addEventListener('input', dessinerListeScripts);
  $('champ-import').addEventListener('change', importerFichiersChoisis);
  $('bouton-modifier-script-actif').addEventListener('click', () => {
    const id = lireIdScriptActif();
    if (id) ouvrirEditeur(id);
  });
  $('bouton-mode-videaste').addEventListener('click', () => lancerMode('videaste'));
  $('bouton-mode-podcast').addEventListener('click', () => lancerMode('podcast'));
}

/**
 * Au tout premier lancement, on crée un script d'exemple qui explique
 * l'application. S'il est supprimé ensuite, il ne revient pas.
 */
async function creerScriptDeBienvenue() {
  try {
    if (localStorage.getItem(CLE_PREMIER_LANCEMENT)) return;
    localStorage.setItem(CLE_PREMIER_LANCEMENT, 'oui');
  } catch {
    return;
  }
  const script = await creerScript({
    titre: 'Bienvenue dans Prompteur Créateurs',
    texte: [
      'Bonjour et bienvenue ! Ce texte d\'exemple défile pour vous montrer comment fonctionne le prompteur.',
      'Touchez le texte pour mettre en pause, puis touchez-le de nouveau pour reprendre. Vous pouvez aussi le faire glisser du doigt pour avancer ou revenir en arrière.',
      '[Petite pause] Les passages entre crochets comme celui-ci sont des indications : ils s\'affichent en plus petit et ne sont pas comptés dans la durée de lecture.',
      'Les boutons + et − règlent la vitesse en direct, en mots par minute. Le petit triangle orange marque la ligne à lire : placez-le près du haut de l\'écran, proche de l\'objectif, pour que votre regard reste naturel.',
      'En mode Vidéaste, le bouton en forme d\'œil masque le texte pendant que vous réglez votre cadrage. Et rassurez-vous : le texte n\'apparaît jamais dans la vidéo enregistrée.',
      'Pour commencer, créez votre propre script ou importez un fichier texte ou PDF depuis la bibliothèque. Bon tournage !'
    ].join('\n\n')
  });
  definirScriptActif(script.id);
}


/* =========================================================================
   7. ÉDITEUR DE SCRIPT
   -------------------------------------------------------------------------
   Sauvegarde automatique : pas de bouton « Enregistrer ». Chaque frappe
   relance un petit minuteur ; quand on arrête de taper pendant 0,7 seconde,
   le script est écrit dans la base. En quittant l'écran, tout ce qui reste
   est enregistré immédiatement. Impossible de perdre son texte.
   ========================================================================= */

const editeur = {
  script: null,       // le script en cours de modification
  estNouveau: false,  // pas encore écrit dans la base
  modifie: false,     // des changements attendent d'être enregistrés
  minuteur: null
};

/** Ouvre l'éditeur sur un script existant (id) ou sur un nouveau (null). */
async function ouvrirEditeur(id) {
  const existant = id ? await bd.lire('scripts', id) : null;
  const maintenant = Date.now();
  editeur.script = existant || { id: nouvelIdentifiant(), titre: '', texte: '', creeLe: maintenant, modifieLe: maintenant };
  editeur.estNouveau = !existant;
  editeur.modifie = false;

  $('champ-titre').value = editeur.script.titre;
  $('champ-texte').value = editeur.script.texte;
  $('etat-sauvegarde').textContent = existant ? 'Enregistré ✓' : '';
  $('bouton-supprimer-script').hidden = !existant;
  mettreAJourStatistiquesEditeur();

  allerVers('editeur');
  if (!existant) $('champ-titre').focus();
}

function mettreAJourStatistiquesEditeur() {
  const texte = $('champ-texte').value;
  const mots = compterMots(texte);
  $('statistiques-texte').textContent =
    `${mots} mots · ${texte.length} caractères · lecture ${formaterDureeLecture(mots, reglages.vitesse)} à ${reglages.vitesse} mots/min`;
}

function surModificationEditeur() {
  if (!editeur.script) return;
  editeur.script.titre = $('champ-titre').value;
  editeur.script.texte = $('champ-texte').value;
  editeur.modifie = true;
  $('etat-sauvegarde').textContent = 'Modification…';
  mettreAJourStatistiquesEditeur();
  clearTimeout(editeur.minuteur);
  editeur.minuteur = setTimeout(sauvegarderEditeur, 700);
}

/** Écrit le script dans la base (si nécessaire). */
function sauvegarderEditeur() {
  clearTimeout(editeur.minuteur);
  const script = editeur.script;
  if (!script || !editeur.modifie) return Promise.resolve();
  if (!script.titre.trim() && !script.texte.trim()) return Promise.resolve(); // rien à garder

  editeur.modifie = false;
  script.modifieLe = Date.now();
  /* On écrit une COPIE : si l'utilisateur continue de taper pendant
     l'écriture, l'objet d'origine peut changer sans risque. */
  const copie = { id: script.id, titre: script.titre.trim(), texte: script.texte, creeLe: script.creeLe, modifieLe: script.modifieLe };

  return bd.ecrire('scripts', copie)
    .then(() => {
      editeur.estNouveau = false;
      if (editeur.script === script) {
        $('bouton-supprimer-script').hidden = false;
        if (!editeur.modifie) $('etat-sauvegarde').textContent = 'Enregistré ✓';
      }
    })
    .catch((erreur) => {
      if (editeur.script === script) {
        editeur.modifie = true;
        $('etat-sauvegarde').textContent = 'Non enregistré';
      }
      notifier('Le script n\'a pas pu être enregistré : ' + erreur.message, 'erreur');
    });
}

/** Appelée automatiquement quand on quitte l'écran de l'éditeur. */
function quitterEditeur() {
  const script = editeur.script;
  if (!script) return;
  clearTimeout(editeur.minuteur);

  if (!script.titre.trim() && !script.texte.trim()) {
    /* Script entièrement vidé : on ne garde pas une fiche vide. */
    if (!editeur.estNouveau) {
      bd.supprimer('scripts', script.id).catch(console.error);
      if (lireIdScriptActif() === script.id) definirScriptActif(null);
    }
  } else if (editeur.modifie) {
    sauvegarderEditeur();
  }
  editeur.script = null;
}

function initialiserEditeur() {
  $('champ-titre').addEventListener('input', surModificationEditeur);
  $('champ-texte').addEventListener('input', surModificationEditeur);

  $('bouton-utiliser-script').addEventListener('click', async () => {
    const script = editeur.script;
    if (!script) return;
    if (!script.texte.trim()) {
      notifier('Le texte est vide : écrivez ou collez quelque chose d\'abord.');
      return;
    }
    editeur.modifie = true; // force l'écriture, même pour un script tout juste importé
    await sauvegarderEditeur();
    utiliserScript(script.id);
  });

  $('bouton-supprimer-script').addEventListener('click', async () => {
    const script = editeur.script;
    if (!script) return;
    clearTimeout(editeur.minuteur);
    await sauvegarderEditeur(); // le script doit exister pour être supprimé proprement
    if (await supprimerScript(script.id)) {
      editeur.script = null; // plus rien à enregistrer en quittant
      revenir();
    }
  });
}

/* =========================================================================
   8. IMPORT DE FICHIERS .TXT ET .PDF
   -------------------------------------------------------------------------
   Les fichiers sont lus directement dans le navigateur : ils ne quittent
   jamais l'appareil. Pour les PDF, on utilise pdf.js, la bibliothèque de
   Mozilla (celle du lecteur PDF de Firefox), rangée dans libs/pdfjs/.
   ========================================================================= */

const TAILLE_MAX_TEXTE = 10 * 1024 * 1024;  // 10 Mo : bien plus qu'un script réel
const TAILLE_MAX_PDF = 150 * 1024 * 1024;   // 150 Mo

/** Réagit au choix d'un ou plusieurs fichiers dans le champ d'import. */
async function importerFichiersChoisis(evenement) {
  const champ = evenement.target;
  const fichiers = [...champ.files];
  champ.value = ''; // permet de réimporter plus tard le même fichier
  if (!fichiers.length) return;

  const etat = $('etat-import');
  const crees = [];

  for (const fichier of fichiers) {
    try {
      etat.hidden = false;
      etat.textContent = `Lecture de « ${fichier.name} »…`;
      const texte = await lireTexteDuFichier(fichier, (message) => { etat.textContent = message; });
      if (!texte.trim()) throw new Error('aucun texte trouvé dans ce fichier.');
      const titre = fichier.name.replace(/\.(txt|pdf)$/i, '').replace(/_+/g, ' ').trim() || 'Script importé';
      crees.push(await creerScript({ titre, texte }));
    } catch (erreur) {
      console.error(erreur);
      notifier(`« ${fichier.name} » : ${erreur.message}`, 'erreur');
    }
  }
  etat.hidden = true;

  if (crees.length === 1) {
    /* Un seul fichier : on l'ouvre dans l'éditeur pour vérifier le texte
       (un PDF demande parfois quelques retouches). */
    notifier('Fichier importé et enregistré. Vérifiez le texte si besoin.', 'succes');
    ouvrirEditeur(crees[0].id);
  } else if (crees.length > 1) {
    notifier(`${crees.length} scripts importés.`, 'succes');
    afficherBibliotheque();
  }
}

/** Choisit la bonne méthode de lecture selon le type de fichier. */
async function lireTexteDuFichier(fichier, signalerProgression) {
  const nom = fichier.name.toLowerCase();
  if (fichier.type === 'application/pdf' || nom.endsWith('.pdf')) {
    return extraireTexteDuPdf(fichier, signalerProgression);
  }
  if (fichier.type.startsWith('text/') || nom.endsWith('.txt')) {
    return lireFichierTexte(fichier);
  }
  throw new Error('format non pris en charge. Seuls les fichiers .txt et .pdf sont acceptés.');
}

/**
 * Lit un fichier .txt en devinant son encodage.
 * Un fichier texte n'est qu'une suite d'octets : pour retrouver les lettres
 * accentuées, il faut savoir quelle « table de correspondance » a servi à
 * l'écrire. On essaie les cas les plus courants :
 *   - UTF-16 (repérable par ses deux premiers octets, la « marque d'ordre ») ;
 *   - UTF-8, la norme actuelle ;
 *   - windows-1252, l'ancien « ANSI » du Bloc-notes de Windows.
 */
async function lireFichierTexte(fichier) {
  if (fichier.size > TAILLE_MAX_TEXTE) throw new Error('fichier trop volumineux (plus de 10 Mo).');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let texte;

  if (octets[0] === 0xff && octets[1] === 0xfe) {
    texte = new TextDecoder('utf-16le').decode(octets);
  } else if (octets[0] === 0xfe && octets[1] === 0xff) {
    texte = new TextDecoder('utf-16be').decode(octets);
  } else {
    try {
      /* fatal: true = lever une erreur si les octets ne sont pas de l'UTF-8 valide. */
      texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
    } catch {
      texte = new TextDecoder('windows-1252').decode(octets);
    }
  }
  return nettoyerTexteImporte(texte);
}

/** Uniformise un texte importé : fins de ligne, caractères invisibles, lignes vides. */
function nettoyerTexteImporte(texte) {
  return texte
    .replace(/\r\n?/g, '\n')                                        // fins de ligne Windows et anciens Mac
    .replace(/\p{Cc}/gu, (car) => (car === '\n' || car === '\t' ? car : '')) // caractères de contrôle parasites
    .replace(/[ \t]+$/gm, '')                                       // espaces en fin de ligne
    .replace(/\n{3,}/g, '\n\n')                                     // au plus une ligne vide d'affilée
    .trim();
}

/* --- PDF --- */

let promessePdfJs = null;

/**
 * Charge pdf.js seulement quand on en a besoin (environ 1,8 Mo) : le
 * démarrage de l'application reste ainsi rapide. import() est la version
 * « à la demande » de l'instruction import.
 */
function chargerPdfJs() {
  if (!promessePdfJs) {
    promessePdfJs = import('./libs/pdfjs/pdf.min.mjs')
      .then((pdfjs) => {
        /* Le gros du travail se fait dans un « worker » : un script qui tourne
           en parallèle, pour que l'interface ne se fige pas pendant la lecture. */
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('./libs/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
        return pdfjs;
      })
      .catch((erreur) => {
        promessePdfJs = null; // on pourra réessayer
        throw erreur;
      });
  }
  return promessePdfJs;
}

/** Extrait le texte de toutes les pages d'un PDF. */
async function extraireTexteDuPdf(fichier, signalerProgression) {
  if (fichier.size > TAILLE_MAX_PDF) throw new Error('fichier trop volumineux (plus de 150 Mo).');

  let pdfjs;
  try {
    pdfjs = await chargerPdfJs();
  } catch (erreur) {
    console.error(erreur);
    throw new Error('le lecteur de PDF n\'a pas pu démarrer.');
  }

  const donnees = new Uint8Array(await fichier.arrayBuffer());
  /* getDocument() renvoie une « tâche de chargement » : sa propriété promise
     fournit le document, et sa méthode destroy() libère tout à la fin. */
  const tache = pdfjs.getDocument({
    data: donnees,
    /* Sécurité : pdf.js n'a jamais le droit de fabriquer et d'exécuter du
       code à partir du contenu du PDF. */
    isEvalSupported: false,
    enableXfa: false
  });
  let documentPdf;
  try {
    documentPdf = await tache.promise;
  } catch (erreur) {
    tache.destroy().catch(() => {});
    if (erreur && erreur.name === 'PasswordException') throw new Error('ce PDF est protégé par un mot de passe.');
    if (erreur && erreur.name === 'InvalidPDFException') throw new Error('ce fichier PDF est invalide ou endommagé.');
    throw new Error('ce PDF n\'a pas pu être ouvert.');
  }

  try {
    const pages = [];
    for (let numero = 1; numero <= documentPdf.numPages; numero += 1) {
      if (signalerProgression) signalerProgression(`Extraction du texte : page ${numero} sur ${documentPdf.numPages}…`);
      const page = await documentPdf.getPage(numero);
      const contenu = await page.getTextContent();
      pages.push(reconstituerLignes(contenu.items));
      page.cleanup();
    }
    const texte = assemblerParagraphes(pages);
    if (!texte.trim()) {
      throw new Error('ce PDF ne contient pas de texte sélectionnable (document scanné ?). Seul un texte « numérique » peut être extrait.');
    }
    return nettoyerTexteImporte(texte);
  } finally {
    tache.destroy().catch(() => {}); // libère la mémoire et arrête le worker
  }
}

/**
 * pdf.js ne renvoie pas des lignes, mais des petits morceaux de texte avec
 * leur position sur la page. On les regroupe en lignes : deux morceaux à la
 * même hauteur appartiennent à la même ligne.
 *
 * Rappel : dans un PDF, la position verticale (y) part du BAS de la page.
 * Une ligne plus bas sur la page a donc un y plus petit.
 *
 * @returns {Array<{texte: string, x: number, y: number, fin: number, hauteur: number}>}
 */
function reconstituerLignes(elements) {
  const lignes = [];
  let ligne = null;

  const terminerLigne = () => {
    if (ligne && ligne.texte.trim()) {
      ligne.texte = ligne.texte.replace(/\s+/g, ' ').trim();
      lignes.push(ligne);
    }
    ligne = null;
  };

  for (const element of elements) {
    if (typeof element.str !== 'string') continue;
    const x = element.transform[4];
    const y = element.transform[5];
    const hauteur = Math.abs(element.transform[3]) || element.height || 10;

    /* Changement net de hauteur : c'est une nouvelle ligne. */
    if (ligne && element.str.trim() && Math.abs(y - ligne.y) > hauteur * 0.5) terminerLigne();

    if (element.str) {
      if (!ligne) {
        ligne = { texte: '', x, y, fin: x, hauteur };
      } else if (x - ligne.fin > hauteur * 0.15 && !/\s$/.test(ligne.texte) && !/^\s/.test(element.str)) {
        ligne.texte += ' '; // espace visuel entre deux morceaux, sans caractère espace
      }
      if (!ligne.texte.trim()) ligne.x = x;
      ligne.texte += element.str;
      ligne.fin = Math.max(ligne.fin, x + (element.width || 0));
      ligne.hauteur = Math.max(ligne.hauteur, hauteur);
    }
    if (element.hasEOL) terminerLigne(); // pdf.js signale lui-même certaines fins de ligne
  }
  terminerLigne();
  return lignes;
}

/**
 * Recolle les lignes en paragraphes.
 * Dans un PDF, chaque ligne s'arrête au bord de la page. Sur le prompteur,
 * dont la largeur est différente, ces retours à la ligne forcés donneraient
 * un texte haché. On rejoint donc les lignes d'un même paragraphe, et on ne
 * garde une séparation que là où un nouveau paragraphe commence vraiment.
 */
function assemblerParagraphes(pages) {
  const paragraphes = [];
  let courant = '';

  const terminerParagraphe = () => {
    if (courant.trim()) paragraphes.push(courant.trim());
    courant = '';
  };

  for (const lignesDeLaPage of pages) {
    const lignes = lignesDeLaPage.filter((ligne) => !estNumeroDePage(ligne.texte));
    if (!lignes.length) continue;

    /* Écart « habituel » entre deux lignes de cette page : la médiane,
       c'est-à-dire la valeur du milieu, insensible aux quelques grands
       sauts entre paragraphes. */
    const ecarts = [];
    for (let i = 1; i < lignes.length; i += 1) {
      const ecart = lignes[i - 1].y - lignes[i].y;
      if (ecart > 0) ecarts.push(ecart);
    }
    const ecartHabituel = mediane(ecarts) || lignes[0].hauteur * 1.2;
    const bordGauche = Math.min(...lignes.map((l) => l.x));
    const bordDroit = Math.max(...lignes.map((l) => l.fin));
    const largeurColonne = bordDroit - bordGauche;

    lignes.forEach((ligne, i) => {
      if (i > 0) {
        const precedente = lignes[i - 1];
        const ecart = precedente.y - ligne.y;
        /* Indices d'un nouveau paragraphe : */
        const grandEcart = ecart > ecartHabituel * 1.45;                      // une ligne vide
        const changementDeTaille =
          Math.abs(ligne.hauteur - precedente.hauteur) > Math.min(ligne.hauteur, precedente.hauteur) * 0.25; // un titre
        const ligneCourteTerminee =
          precedente.fin < bordGauche + largeurColonne * 0.8 && /[.!?:…»"”)]$/.test(precedente.texte); // fin de phrase avant le bord
        const elementDeListe = /^([•◦▪‣·*–—-]|\d{1,2}[.)])\s/.test(ligne.texte); // puce ou numéro
        if (grandEcart || changementDeTaille || ligneCourteTerminee || elementDeListe) terminerParagraphe();
      }
      courant = recollerLigne(courant, ligne.texte);
    });

    /* Fin de page : on ne coupe que si la phrase est terminée (sinon le
       paragraphe continue sur la page suivante). */
    if (/[.!?:…»"”]$/.test(courant.trim())) terminerParagraphe();
  }
  terminerParagraphe();
  return paragraphes.join('\n\n');
}

/** Ajoute une ligne à la fin d'un paragraphe en cours. */
function recollerLigne(courant, texte) {
  if (!courant) return texte;
  /* Mot coupé en fin de ligne (« porte-» + « monnaie ») : pas d'espace. */
  if (/\p{L}-$/u.test(courant) && /^\p{Ll}/u.test(texte)) return courant + texte;
  return `${courant} ${texte}`;
}

/** Repère les numéros de page (« 3 », « - 3 - », « Page 3 / 10 ») pour les ignorer. */
function estNumeroDePage(texte) {
  return /^[\s–—-]*(page\s*)?\d{1,4}(\s*(\/|sur|of)\s*\d{1,4})?[\s–—-]*$/i.test(texte);
}

function mediane(nombres) {
  if (!nombres.length) return 0;
  const tries = [...nombres].sort((a, b) => a - b);
  const milieu = Math.floor(tries.length / 2);
  return tries.length % 2 ? tries[milieu] : (tries[milieu - 1] + tries[milieu]) / 2;
}

/* =========================================================================
   9. MOTEUR DE DÉFILEMENT DU TEXTE
   -------------------------------------------------------------------------
   Principe : le texte est posé dans une « fenêtre » qui cache ce qui dépasse.
   Pour le faire défiler, on le décale vers le haut avec la propriété CSS
   transform (translate3d), recalculée à chaque image affichée par l'écran
   (environ 60 fois par seconde) grâce à requestAnimationFrame.
   transform est la méthode la plus fluide : le navigateur déplace une image
   déjà dessinée, sans recalculer la mise en page.

   La vitesse est exprimée en MOTS PAR MINUTE, comme un débit de parole.
   On mesure la hauteur totale du texte et on la divise par le nombre de mots :
   on obtient la hauteur moyenne occupée par un mot. La vitesse reste ainsi
   juste quelle que soit la taille du texte, la largeur ou l'orientation de
   l'écran.
   ========================================================================= */

const defilement = {
  enLecture: false,
  position: 0,           // nombre de pixels déjà défilés
  positionMax: 0,        // position à laquelle tout le texte a été lu
  pixelsParMot: 0,
  hauteurLigne: 60,
  nombreDeMots: 0,
  cible: null,           // position visée par un saut animé (avancer / reculer)
  dernierInstant: null,  // horodatage de l'image précédente
  idAnimation: null,
  mesuresValides: false,
  glissement: null,      // informations sur le doigt (ou la souris) qui fait glisser le texte
  dernierAffichage: { position: null, ratio: null, restant: null }
};

/** Transforme le texte brut en paragraphes affichables. */
function preparerTexte(texte) {
  const paragraphes = texte.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  $('texte-defilant').replaceChildren(...paragraphes.map(creerParagraphePrompteur));
  defilement.nombreDeMots = compterMots(texte);
  defilement.position = 0;
  defilement.positionMax = 0;
  defilement.cible = null;
  defilement.dernierAffichage = { position: null, ratio: null, restant: null };
  demanderNouvellesMesures();
}

/** Un paragraphe : les retours à la ligne simples deviennent des <br>, les [indications] des <span>. */
function creerParagraphePrompteur(paragraphe) {
  const element = document.createElement('p');
  paragraphe.split('\n').forEach((ligne, numero) => {
    if (numero > 0) element.append(document.createElement('br'));
    /* Les parenthèses dans l'expression font que split() GARDE les morceaux
       entre crochets dans le résultat, au lieu de les supprimer. */
    for (const morceau of ligne.split(/(\[[^\]]*\])/)) {
      if (!morceau) continue;
      if (morceau.startsWith('[') && morceau.endsWith(']')) {
        element.append(creerElement('span', { classe: 'indication', texte: morceau }));
      } else {
        element.append(morceau);
      }
    }
  });
  return element;
}

/** Signale que les dimensions ont pu changer : on remesurera à la prochaine image. */
function demanderNouvellesMesures() {
  defilement.mesuresValides = false;
}

/**
 * Mesure la fenêtre et le texte, puis règle les marges pour que :
 *   - au départ, la première ligne soit sur le repère de lecture ;
 *   - à la fin, la dernière ligne puisse remonter jusqu'au repère.
 * Renvoie false si l'écran n'est pas visible (rien à mesurer).
 */
function mesurer() {
  const fenetre = $('fenetre-texte');
  const texte = $('texte-defilant');
  const hauteurFenetre = fenetre.clientHeight;
  if (!hauteurFenetre) return false;

  /* On retient où l'on en était (en proportion) pour ne pas perdre sa
     place quand on change la taille du texte ou qu'on tourne le téléphone. */
  const proportionLue = defilement.positionMax > 0 ? defilement.position / defilement.positionMax : 0;

  const hauteurRepere = Math.round(hauteurFenetre * reglages.positionLecture / 100);
  texte.style.paddingTop = hauteurRepere + 'px';
  texte.style.paddingBottom = (hauteurFenetre - hauteurRepere) + 'px';

  const hauteurDuContenu = Math.max(0, texte.offsetHeight - hauteurFenetre);
  defilement.positionMax = hauteurDuContenu;
  defilement.hauteurLigne = reglages.taillePolice * 1.4;
  defilement.pixelsParMot = defilement.nombreDeMots > 0
    ? hauteurDuContenu / defilement.nombreDeMots
    : defilement.hauteurLigne / 6;
  defilement.position = borner(proportionLue * hauteurDuContenu, 0, hauteurDuContenu);
  defilement.cible = null;
  defilement.mesuresValides = true;
  return true;
}

/** Vitesse actuelle convertie en pixels par seconde. */
function vitesseEnPixels() {
  return (reglages.vitesse / 60) * defilement.pixelsParMot;
}

/** La boucle d'animation, appelée avant chaque nouvelle image de l'écran. */
function boucleDefilement(instant) {
  defilement.idAnimation = requestAnimationFrame(boucleDefilement);
  mettreAJourNiveauMicro(); // le vumètre profite de la même boucle (section 11)
  if (!defilement.mesuresValides && !mesurer()) return;

  /* Temps écoulé depuis l'image précédente, en secondes. On le plafonne à
     0,1 s : après une interruption (onglet en arrière-plan), le texte ne doit
     pas faire un bond. */
  const ecoule = defilement.dernierInstant === null ? 0 : Math.min((instant - defilement.dernierInstant) / 1000, 0.1);
  defilement.dernierInstant = instant;

  if (defilement.glissement) {
    /* Le doigt pilote le texte : la position est fixée par les gestes. */
  } else if (defilement.cible !== null) {
    /* Saut animé : à chaque image, on parcourt une part de la distance qui
       reste. Le mouvement ralentit en approchant, ce qui paraît naturel.
       La formule 1 - 0,001^temps donne la même vitesse sur tous les écrans,
       qu'ils affichent 30, 60 ou 120 images par seconde. */
    const part = 1 - Math.pow(0.001, ecoule);
    defilement.position += (defilement.cible - defilement.position) * part;
    if (Math.abs(defilement.cible - defilement.position) < 0.5) {
      defilement.position = defilement.cible;
      defilement.cible = null;
    }
  } else if (defilement.enLecture) {
    defilement.position += vitesseEnPixels() * ecoule;
  }

  if (defilement.position >= defilement.positionMax) {
    defilement.position = defilement.positionMax;
    if (defilement.enLecture && defilement.cible === null) {
      mettreEnPause();
      notifier('Fin du texte.');
    }
  }
  if (defilement.position < 0) defilement.position = 0;

  afficherPosition();
}

/** Applique la position au texte et met à jour la barre de progression. */
function afficherPosition() {
  const memoire = defilement.dernierAffichage;

  /* Arrondi au pixel physique de l'écran : le texte reste net. */
  const densite = window.devicePixelRatio || 1;
  const position = Math.round(defilement.position * densite) / densite;
  if (position !== memoire.position) {
    $('texte-defilant').style.transform = `translate3d(0, ${-position}px, 0)`;
    memoire.position = position;
  }

  const ratio = defilement.positionMax > 0 ? Math.round((defilement.position / defilement.positionMax) * 1000) / 1000 : 0;
  if (ratio !== memoire.ratio) {
    $('barre-progression').style.transform = `scaleX(${ratio})`;
    memoire.ratio = ratio;
  }

  let restant = '';
  if (defilement.nombreDeMots > 0 && defilement.pixelsParMot > 0) {
    const motsRestants = (defilement.positionMax - defilement.position) / defilement.pixelsParMot;
    restant = '−' + formaterDuree((motsRestants / reglages.vitesse) * 60000);
  }
  if (restant !== memoire.restant) {
    $('temps-restant').textContent = restant;
    memoire.restant = restant;
  }
}

function demarrerBoucleDefilement() {
  if (defilement.idAnimation === null) {
    defilement.dernierInstant = null;
    defilement.idAnimation = requestAnimationFrame(boucleDefilement);
  }
}

function arreterBoucleDefilement() {
  if (defilement.idAnimation !== null) cancelAnimationFrame(defilement.idAnimation);
  defilement.idAnimation = null;
}

/* --- Commandes de lecture --- */

function lancerLecture() {
  if (!defilement.mesuresValides) mesurer();
  /* Arrivé à la fin, « lecture » repart du début. */
  if (defilement.positionMax > 0 && defilement.position >= defilement.positionMax - 1) defilement.position = 0;
  defilement.enLecture = true;
  mettreAJourBoutonLecture();
}

function mettreEnPause() {
  defilement.enLecture = false;
  mettreAJourBoutonLecture();
}

function basculerLecture() {
  if (defilement.enLecture) mettreEnPause();
  else lancerLecture();
}

function mettreAJourBoutonLecture() {
  const bouton = $('bouton-lecture');
  changerIcone(bouton, defilement.enLecture ? 'pause' : 'lecture');
  bouton.setAttribute('aria-label', defilement.enLecture ? 'Mettre le défilement en pause' : 'Lancer le défilement');
}

/** Déplacement animé, relatif à la position (ou à la cible déjà visée). */
function sauterDe(pixels) {
  const depart = defilement.cible !== null ? defilement.cible : defilement.position;
  defilement.cible = borner(depart + pixels, 0, defilement.positionMax);
}

const reculer = () => sauterDe(-defilement.hauteurLigne * 3);
const avancer = () => sauterDe(defilement.hauteurLigne * 3);

function revenirAuDebut() {
  defilement.cible = 0;
}

function changerVitesse(ecart) {
  modifierReglages({ vitesse: reglages.vitesse + ecart });
}

/* --- Gestes : glisser le doigt, toucher, molette --- */

function initialiserGestesTexte() {
  const fenetre = $('fenetre-texte');

  /* Les « pointer events » réunissent souris, doigt et stylet en une seule API. */
  fenetre.addEventListener('pointerdown', (evenement) => {
    if (evenement.button !== 0) return; // uniquement le bouton principal / le doigt
    fenetre.setPointerCapture(evenement.pointerId); // on suit le doigt même s'il sort de la zone
    defilement.cible = null;
    defilement.glissement = {
      id: evenement.pointerId,
      yDepart: evenement.clientY,
      positionDepart: defilement.position,
      instantDepart: performance.now(),
      aBouge: false
    };
  });

  fenetre.addEventListener('pointermove', (evenement) => {
    const glissement = defilement.glissement;
    if (!glissement || glissement.id !== evenement.pointerId) return;
    const deplacement = evenement.clientY - glissement.yDepart;
    /* En dessous de 8 pixels, on considère que le doigt n'a pas vraiment bougé. */
    if (Math.abs(deplacement) > 8) glissement.aBouge = true;
    if (glissement.aBouge) {
      /* Doigt vers le haut = le texte monte = on avance dans le texte. */
      defilement.position = borner(glissement.positionDepart - deplacement, 0, defilement.positionMax);
      fenetre.classList.add('en-glissement');
    }
  });

  const finDuGeste = (evenement) => {
    const glissement = defilement.glissement;
    if (!glissement || glissement.id !== evenement.pointerId) return;
    defilement.glissement = null;
    fenetre.classList.remove('en-glissement');
    /* Un toucher bref, sans glisser : lecture / pause. */
    const bref = performance.now() - glissement.instantDepart < 400;
    if (evenement.type === 'pointerup' && !glissement.aBouge && bref) basculerLecture();
  };
  fenetre.addEventListener('pointerup', finDuGeste);
  fenetre.addEventListener('pointercancel', finDuGeste);

  /* Molette de la souris (ordinateur). passive: false permet d'empêcher la
     page de défiler en même temps. */
  fenetre.addEventListener('wheel', (evenement) => {
    evenement.preventDefault();
    const unite = evenement.deltaMode === 1 ? defilement.hauteurLigne : evenement.deltaMode === 2 ? fenetre.clientHeight : 1;
    defilement.cible = null;
    defilement.position = borner(defilement.position + evenement.deltaY * unite, 0, defilement.positionMax);
  }, { passive: false });

  /* Toute variation de taille (rotation, chargement d'une police, texte
     modifié) oblige à remesurer. ResizeObserver nous prévient. */
  const observateur = new ResizeObserver(demanderNouvellesMesures);
  observateur.observe(fenetre);
  observateur.observe($('texte-defilant'));
}


/* =========================================================================
   10. ÉCRAN DU PROMPTEUR : OUVERTURE, COMMANDES, CLAVIER
   ========================================================================= */

const prompteur = {
  mode: 'videaste', // ou 'podcast'
  script: null
};

/** Boutons « Vidéaste » et « Podcast » de l'accueil. */
async function lancerMode(mode) {
  let script = null;
  try {
    script = await lireScriptActif();
  } catch (erreur) {
    console.error(erreur);
  }
  if (!script) {
    notifier('Choisissez d\'abord un script, ou créez-en un.');
    allerVers('bibliotheque');
    return;
  }
  if (!script.texte.trim()) {
    notifier('Le script sélectionné est vide : ajoutez-y du texte.');
    ouvrirEditeur(script.id);
    return;
  }
  prompteur.mode = mode;
  prompteur.script = script;
  /* Sur téléphone, on passe en plein écran. Les navigateurs ne l'acceptent
     que juste après un geste de l'utilisateur : c'est le cas ici (le toucher
     du bouton). Sur ordinateur, on laisse le choix (bouton ou touche F). */
  if (window.matchMedia('(pointer: coarse)').matches) demanderPleinEcran();
  allerVers('prompteur');
}

/** Appelée à l'arrivée sur l'écran du prompteur (voir la section 4). */
function demarrerPrompteur() {
  if (!prompteur.script) {
    /* Cas rare : retour sur cet écran par l'historique sans script chargé. */
    setTimeout(revenirAccueil, 0);
    return;
  }
  const ecran = $('ecran-prompteur');
  ecran.dataset.mode = prompteur.mode;
  ecran.dataset.micro = 'non';
  definirTexteMasque(false);
  basculerPanneauRapide(false);
  $('message-media').hidden = true;
  $('info-resolution').textContent = '';

  appliquerReglages();
  preparerTexte(prompteur.script.texte);
  mettreEnPause();
  mettreAJourCommandesEnregistrement();
  demarrerBoucleDefilement();
  activerEcranAllume();
  demarrerFluxMedia();
}

/** Appelée quand on quitte l'écran du prompteur, quelle qu'en soit la raison. */
function fermerPrompteur() {
  annulerDecompte();
  mettreEnPause();
  arreterBoucleDefilement();
  basculerPanneauRapide(false);
  desactiverEcranAllume();
  quitterPleinEcran();

  /* Un enregistrement en cours est arrêté ET sauvegardé : on ne perd rien,
     même si l'on a quitté l'écran avec le bouton retour du téléphone. */
  const flux = media.flux;
  media.flux = null;
  arreterEnregistrement().finally(() => arreterPistes(flux)); // déjà résolue s'il n'y a rien à arrêter
  arreterAnalyseMicro();
  $('video-camera').srcObject = null;
}

function definirTexteMasque(masque) {
  $('ecran-prompteur').dataset.texteMasque = masque ? 'oui' : 'non';
  const bouton = $('bouton-masquer-texte');
  bouton.setAttribute('aria-pressed', String(masque));
  bouton.setAttribute('aria-label', masque ? 'Afficher le texte' : 'Masquer le texte');
  changerIcone(bouton, masque ? 'oeil-barre' : 'oeil');
}

/** Bouton « œil » : masque le texte (et met le défilement en pause) pour régler le cadrage. */
function basculerTexteMasque() {
  const masquer = $('ecran-prompteur').dataset.texteMasque !== 'oui';
  definirTexteMasque(masquer);
  if (masquer) mettreEnPause();
}

function basculerPanneauRapide(forcer) {
  const panneau = $('panneau-reglages-rapides');
  const ouvrir = typeof forcer === 'boolean' ? forcer : panneau.hidden;
  panneau.hidden = !ouvrir;
  $('bouton-reglages-rapides').setAttribute('aria-expanded', String(ouvrir));
}

/** Quitter le prompteur : on demande confirmation si un enregistrement tourne. */
async function quitterPrompteurAvecConfirmation(destination) {
  if (enregistrementEnCours()) {
    const accord = await demanderConfirmation({
      titre: 'Arrêter l\'enregistrement ?',
      message: 'L\'enregistrement en cours sera arrêté et sauvegardé sur l\'appareil.',
      bouton: 'Arrêter et quitter'
    });
    if (!accord) return;
  }
  if (destination) allerVers(destination);
  else revenir();
}

/**
 * Raccourcis clavier (ordinateur, clavier Bluetooth, télécommande de
 * présentation : ces télécommandes envoient en général les touches
 * Page précédente / Page suivante ou les flèches).
 */
function gererClavierPrompteur(evenement) {
  if (ecranActuel !== 'prompteur' || evenement.ctrlKey || evenement.metaKey || evenement.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const cible = evenement.target;
  /* Dans un curseur ou une liste, les flèches servent au champ lui-même. */
  if (cible.closest && cible.closest('input, select, textarea')) return;
  /* Espace ou Entrée sur un bouton : c'est le bouton qui réagit. */
  if ((evenement.key === ' ' || evenement.key === 'Enter') && cible.closest && cible.closest('button')) return;

  switch (evenement.key) {
    case ' ':
    case 'k':
    case 'K':
      basculerLecture();
      break;
    case 'ArrowUp':
      sauterDe(-defilement.hauteurLigne);
      break;
    case 'ArrowDown':
      sauterDe(defilement.hauteurLigne);
      break;
    case 'PageUp':
    case 'ArrowLeft':
      reculer();
      break;
    case 'PageDown':
    case 'ArrowRight':
      avancer();
      break;
    case 'Home':
      revenirAuDebut();
      break;
    case '+':
    case '=':
      changerVitesse(10);
      break;
    case '-':
    case '_':
      changerVitesse(-10);
      break;
    case 'm':
    case 'M':
      if (prompteur.mode === 'videaste') basculerTexteMasque();
      break;
    case 'f':
    case 'F':
      basculerPleinEcran();
      break;
    case 'Escape':
      if (!$('panneau-reglages-rapides').hidden) basculerPanneauRapide(false);
      else quitterPrompteurAvecConfirmation();
      break;
    default:
      return; // touche sans rôle : on ne bloque pas son comportement normal
  }
  evenement.preventDefault();
}

function initialiserPrompteur() {
  $('bouton-quitter-prompteur').addEventListener('click', () => quitterPrompteurAvecConfirmation());
  $('bouton-voir-enregistrements').addEventListener('click', () => {
    filtreEnregistrements = prompteur.mode === 'podcast' ? 'audio' : 'video';
    quitterPrompteurAvecConfirmation('enregistrements');
  });

  $('bouton-lecture').addEventListener('click', basculerLecture);
  $('bouton-debut').addEventListener('click', revenirAuDebut);
  $('bouton-reculer').addEventListener('click', reculer);
  $('bouton-avancer').addEventListener('click', avancer);
  $('bouton-vitesse-moins').addEventListener('click', () => changerVitesse(-10));
  $('bouton-vitesse-plus').addEventListener('click', () => changerVitesse(10));

  $('bouton-masquer-texte').addEventListener('click', basculerTexteMasque);
  $('bouton-changer-camera').addEventListener('click', changerDeCamera);
  $('bouton-reglages-rapides').addEventListener('click', basculerPanneauRapide);
  $('bouton-plein-ecran').addEventListener('click', basculerPleinEcran);

  $('bouton-enregistrer').addEventListener('click', demanderEnregistrement);
  $('bouton-pause-enregistrement').addEventListener('click', basculerPauseEnregistrement);
  $('bouton-arreter-enregistrement').addEventListener('click', () => arreterEnregistrement());

  $('bouton-reessayer-media').addEventListener('click', () => demarrerFluxMedia());
  $('bouton-fermer-message-media').addEventListener('click', () => { $('message-media').hidden = true; });
  $('decompte').addEventListener('click', annulerDecompte);

  initialiserGestesTexte();
  document.addEventListener('keydown', gererClavierPrompteur);
}

/* =========================================================================
   11. CAMÉRA ET MICRO
   -------------------------------------------------------------------------
   navigator.mediaDevices.getUserMedia() demande l'accès à la caméra et/ou au
   micro. Le navigateur affiche alors sa propre fenêtre d'autorisation.
   Le résultat est un « flux » (MediaStream) composé de « pistes » : une piste
   vidéo, une piste audio. On l'affiche dans la balise <video> et c'est ce
   même flux, et lui seul, que l'on enregistre (section 12).
   ========================================================================= */

const media = {
  flux: null,              // le MediaStream en cours d'utilisation
  jeton: null,             // identifie le dernier démarrage demandé
  facingMode: 'user',      // caméra 'user' (avant) ou 'environment' (arrière)
  cameraAvant: true,
  contexteAudio: null,     // pour le vumètre
  source: null,
  analyseur: null,
  echantillons: null,
  niveauLisse: 0
};

/** Réglages demandés pour le micro. */
function contraintesAudio() {
  return {
    /* Rien n'est diffusé par le haut-parleur pendant l'enregistrement :
       l'annulation d'écho est inutile et peut abîmer la voix. */
    echoCancellation: false,
    noiseSuppression: reglages.traitementAudio,
    autoGainControl: reglages.traitementAudio
  };
}

/** Réglages demandés pour la caméra. « ideal » = « si possible » : le
    navigateur choisit la valeur la plus proche que l'appareil sait fournir. */
function contraintesVideo() {
  const haute = reglages.qualiteVideo === '1080';
  return {
    facingMode: { ideal: media.facingMode },
    width: { ideal: haute ? 1920 : 1280 },
    height: { ideal: haute ? 1080 : 720 },
    frameRate: { ideal: 30 }
  };
}

function arreterPistes(flux) {
  if (flux) for (const piste of flux.getTracks()) piste.stop();
}

/** Démarre (ou redémarre) la caméra et/ou le micro selon le mode. */
async function demarrerFluxMedia() {
  const jeton = {};
  media.jeton = jeton;
  $('message-media').hidden = true;

  /* On libère d'abord l'appareil déjà ouvert : beaucoup de téléphones ne
     savent pas ouvrir deux caméras en même temps. */
  const ancien = media.flux;
  media.flux = null;
  arreterPistes(ancien);
  arreterAnalyseMicro();
  $('video-camera').srcObject = null;
  $('info-resolution').textContent = '';
  mettreAJourCommandesEnregistrement();

  const videaste = prompteur.mode === 'videaste';

  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    afficherMessageMedia(
      'Caméra et micro indisponibles',
      'Le navigateur n\'autorise la caméra et le micro que sur une adresse sécurisée (https://…) ou sur http://localhost.\n\nLe texte défilant reste utilisable, mais pas l\'enregistrement.',
      { reessayer: false }
    );
    return;
  }

  let flux = null;
  let erreurRetenue = null;
  let avertissement = '';

  try {
    flux = await navigator.mediaDevices.getUserMedia(
      videaste ? { video: contraintesVideo(), audio: contraintesAudio() } : { audio: contraintesAudio() }
    );
  } catch (erreur) {
    erreurRetenue = erreur;
    if (videaste) {
      /* Deuxième essai sans le micro (absent, occupé ou refusé) : on pourra
         au moins filmer. */
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: contraintesVideo() });
        avertissement = 'Micro indisponible : la vidéo sera enregistrée sans le son.';
      } catch {
        flux = null;
      }
    }
  }

  /* Pendant l'attente, l'utilisateur a pu quitter l'écran ou relancer la
     caméra : ce flux ne sert plus, on le referme aussitôt. */
  if (media.jeton !== jeton || ecranActuel !== 'prompteur') {
    arreterPistes(flux);
    return;
  }

  if (!flux) {
    const { titre, texte } = expliquerErreurMedia(erreurRetenue, videaste);
    afficherMessageMedia(titre, texte);
    return;
  }

  media.flux = flux;
  const pisteVideo = flux.getVideoTracks()[0];
  const pisteAudio = flux.getAudioTracks()[0];
  $('ecran-prompteur').dataset.micro = pisteAudio ? 'oui' : 'non';

  if (pisteVideo) {
    const video = $('video-camera');
    video.srcObject = flux; // la balise <video> est « muted » : pas de larsen
    video.play().catch(() => { /* la lecture démarrera au prochain geste */ });
    /* Caméra avant ou arrière ? Une webcam d'ordinateur ne le précise pas :
       elle filme l'utilisateur, on la traite comme une caméra avant. */
    media.cameraAvant = (pisteVideo.getSettings().facingMode || 'user') === 'user';
    appliquerMiroirCamera();
    pisteVideo.addEventListener('ended', surFinDePiste);
    compterCameras();
  }
  if (pisteAudio) {
    demarrerAnalyseMicro(flux);
    pisteAudio.addEventListener('ended', surFinDePiste);
  }
  if (avertissement) notifier(avertissement, 'erreur');
  mettreAJourCommandesEnregistrement();
}

/** Traduit une erreur de getUserMedia en message compréhensible. */
function expliquerErreurMedia(erreur, videaste) {
  const nom = erreur ? erreur.name : '';
  const appareil = videaste ? 'la caméra' : 'le micro';

  if (nom === 'NotAllowedError' || nom === 'SecurityError') {
    return {
      titre: videaste ? 'Accès à la caméra refusé' : 'Accès au micro refusé',
      texte: `L'application n'a pas l'autorisation d'utiliser ${appareil}.\n\n`
        + 'Pour l\'autoriser : dans le navigateur, touchez l\'icône située à gauche de l\'adresse, puis « Autorisations ». '
        + 'Application installée sur Android : appui long sur son icône → Infos sur l\'appli → Autorisations.\n\n'
        + 'En attendant, le texte défilant reste utilisable.'
    };
  }
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError') {
    return {
      titre: videaste ? 'Aucune caméra détectée' : 'Aucun micro détecté',
      texte: videaste
        ? 'Aucune caméra utilisable n\'a été trouvée sur cet appareil. Vérifiez qu\'elle est bien branchée, puis touchez « Réessayer ».'
        : 'Aucun micro utilisable n\'a été trouvé sur cet appareil. Vérifiez qu\'il est bien branché, puis touchez « Réessayer ».'
    };
  }
  if (nom === 'NotReadableError' || nom === 'AbortError') {
    return {
      titre: videaste ? 'Caméra occupée' : 'Micro occupé',
      texte: `${videaste ? 'La caméra est' : 'Le micro est'} peut-être déjà utilisé${videaste ? 'e' : ''} par une autre application `
        + '(appel en cours, autre application de caméra…). Fermez-la, puis touchez « Réessayer ».'
    };
  }
  return {
    titre: videaste ? 'Impossible de démarrer la caméra' : 'Impossible de démarrer le micro',
    texte: `Erreur signalée par le navigateur : ${erreur ? erreur.message || nom : 'inconnue'}.`
  };
}

/** Message non bloquant par-dessus le prompteur (on peut le fermer et continuer). */
function afficherMessageMedia(titre, texte, { reessayer = true } = {}) {
  $('bouton-changer-camera').hidden = true; // aucune caméra utilisable : rien à changer
  $('message-media-titre').textContent = titre;
  $('message-media-texte').textContent = texte;
  $('bouton-reessayer-media').hidden = !reessayer;
  $('message-media').hidden = false;
  mettreAJourCommandesEnregistrement();
}

/** Une piste s'arrête d'elle-même : appareil débranché, autorisation retirée… */
function surFinDePiste() {
  if (ecranActuel !== 'prompteur') return;
  arreterEnregistrement(); // ce qui a été enregistré est sauvegardé
  const videaste = prompteur.mode === 'videaste';
  afficherMessageMedia(
    videaste ? 'La caméra s\'est arrêtée' : 'Le micro s\'est arrêté',
    'L\'appareil a été déconnecté ou réquisitionné par une autre application. Touchez « Réessayer » pour le relancer.'
  );
}

/** Le bouton « changer de caméra » n'apparaît que s'il y a au moins deux caméras. */
async function compterCameras() {
  let nombre = 0;
  try {
    const appareils = await navigator.mediaDevices.enumerateDevices();
    nombre = appareils.filter((appareil) => appareil.kind === 'videoinput').length;
  } catch {
    nombre = 0;
  }
  $('bouton-changer-camera').hidden = nombre < 2;
}

async function changerDeCamera() {
  if (enregistrement.etat !== 'inactif') {
    notifier('Impossible de changer de caméra pendant un enregistrement.');
    return;
  }
  media.facingMode = media.facingMode === 'user' ? 'environment' : 'user';
  try {
    localStorage.setItem(CLE_CAMERA, media.facingMode);
  } catch {
    /* sans importance */
  }
  await demarrerFluxMedia();
}

/** Effet miroir de l'aperçu, pour la caméra avant uniquement. */
function appliquerMiroirCamera() {
  $('video-camera').classList.toggle('miroir', Boolean(media.flux && media.cameraAvant && reglages.miroirApercu));
}

/** Affiche la définition réelle de l'image filmée (ex. 1080×1920). */
function afficherResolution() {
  const video = $('video-camera');
  $('info-resolution').textContent = video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '';
}

/* --- Vumètre : le niveau sonore du micro --- */

/**
 * La Web Audio API permet d'analyser le son en direct. Un « AnalyserNode »
 * nous donne les échantillons sonores ; on en déduit un volume moyen.
 * Le son n'est relié à aucun haut-parleur : on l'écoute sans le diffuser.
 */
function demarrerAnalyseMicro(flux) {
  try {
    const ContexteAudio = window.AudioContext || window.webkitAudioContext;
    if (!ContexteAudio) return;
    media.contexteAudio = new ContexteAudio();
    media.source = media.contexteAudio.createMediaStreamSource(flux);
    media.analyseur = media.contexteAudio.createAnalyser();
    media.analyseur.fftSize = 1024;
    media.echantillons = new Float32Array(media.analyseur.fftSize);
    media.source.connect(media.analyseur);
    media.contexteAudio.resume().catch(() => {});
  } catch (erreur) {
    console.warn('Vumètre indisponible :', erreur);
    arreterAnalyseMicro();
  }
}

function arreterAnalyseMicro() {
  try {
    if (media.source) media.source.disconnect();
    if (media.contexteAudio) media.contexteAudio.close().catch(() => {});
  } catch {
    /* déjà fermé */
  }
  media.contexteAudio = null;
  media.source = null;
  media.analyseur = null;
  media.echantillons = null;
  media.niveauLisse = 0;
  $('niveau-micro-barre').style.setProperty('--niveau', '0');
}

/** Appelée à chaque image par la boucle de défilement (section 9). */
function mettreAJourNiveauMicro() {
  if (!media.analyseur) return;
  media.analyseur.getFloatTimeDomainData(media.echantillons);

  /* Volume « efficace » (moyenne quadratique) des échantillons, entre 0 et 1. */
  let somme = 0;
  for (const echantillon of media.echantillons) somme += echantillon * echantillon;
  const efficace = Math.sqrt(somme / media.echantillons.length);

  /* Nos oreilles perçoivent le volume de façon logarithmique : on passe en
     décibels, de −60 dB (quasi-silence) à 0 dB (maximum). */
  const decibels = 20 * Math.log10(Math.max(efficace, 1e-6));
  const niveau = borner((decibels + 60) / 60, 0, 1);

  /* Lissage : la barre monte instantanément et redescend en douceur. */
  media.niveauLisse = niveau > media.niveauLisse ? niveau : media.niveauLisse * 0.9 + niveau * 0.1;
  $('niveau-micro-barre').style.setProperty('--niveau', media.niveauLisse.toFixed(3));
}


/* =========================================================================
   12. ENREGISTREMENT ET SAUVEGARDE AU FIL DE L'EAU
   -------------------------------------------------------------------------
   MediaRecorder encode le flux de la caméra et/ou du micro en fichier.
   IMPORTANT : on lui donne le flux de la caméra, pas l'écran. Le texte du
   prompteur, simple élément de la page posé par-dessus la vidéo, ne peut
   donc JAMAIS se retrouver dans le fichier.

   Sécurité des données : on demande à MediaRecorder un morceau de fichier
   chaque seconde, et chaque morceau est aussitôt écrit dans IndexedDB.
   Si l'application est fermée brutalement (batterie vide, appel, plantage),
   les morceaux déjà écrits sont réassemblés au démarrage suivant.
   ========================================================================= */

const enregistrement = {
  etat: 'inactif',              // 'inactif' | 'decompte' | 'enregistrement' | 'pause' | 'finalisation'
  enregistreur: null,           // l'objet MediaRecorder
  fiche: null,                  // la fiche de l'enregistrement dans la base
  indexMorceau: 0,
  ecritures: Promise.resolve(), // file d'attente des écritures de morceaux
  erreurEcriture: null,
  promesseArret: null,          // résolue quand MediaRecorder a vraiment fini
  promesseFinalisation: null,
  debutSegment: 0,              // instant du dernier démarrage ou de la dernière reprise
  dureeCumulee: 0,              // durée enregistrée avant la dernière reprise (ms)
  pauseAutomatique: false,
  minuteurChrono: null,
  minuteurDecompte: null,
  finDecompte: null,
  libererVerrou: null
};

/* Formats essayés dans l'ordre de préférence. WebM (VP8 + Opus) est le format
   natif de Chrome sur Android et le plus sûr pour enregistrer en direct sur
   téléphone. Safari (iPhone, Mac) ne sait produire que du MP4 : dans ce cas,
   le fichier sera un .mp4. */
const FORMATS_VIDEO = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
const FORMATS_AUDIO = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];

function choisirFormat(type) {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const candidats = type === 'video' ? FORMATS_VIDEO : FORMATS_AUDIO;
  return candidats.find((format) => MediaRecorder.isTypeSupported(format)) || '';
}

/** « video/webm;codecs=vp8,opus » → « webm ». */
function extensionDuFormat(typeMime) {
  if (/mp4/i.test(typeMime)) return 'mp4';
  if (/ogg/i.test(typeMime)) return 'ogg';
  return 'webm';
}

function enregistrementEnCours() {
  return enregistrement.etat === 'enregistrement' || enregistrement.etat === 'pause';
}

/** Durée réellement enregistrée, pauses exclues (ms). */
function dureeEnregistree() {
  const segmentEnCours = enregistrement.etat === 'enregistrement' ? performance.now() - enregistrement.debutSegment : 0;
  return enregistrement.dureeCumulee + segmentEnCours;
}

/** Met les boutons d'enregistrement en accord avec l'état actuel. */
function mettreAJourCommandesEnregistrement() {
  const etat = enregistrement.etat;
  const actif = enregistrementEnCours();
  const possible = Boolean(media.flux) && 'MediaRecorder' in window;

  const boutonEnregistrer = $('bouton-enregistrer');
  boutonEnregistrer.hidden = actif || etat === 'finalisation';
  boutonEnregistrer.disabled = !possible || etat === 'decompte';
  boutonEnregistrer.title = possible ? 'Démarrer l\'enregistrement' : 'Caméra ou micro indisponible';

  const boutonPause = $('bouton-pause-enregistrement');
  boutonPause.hidden = !actif;
  changerIcone(boutonPause, etat === 'pause' ? 'rec' : 'pause');
  boutonPause.querySelector('span').textContent = etat === 'pause' ? 'Reprendre' : 'Pause';

  const boutonArreter = $('bouton-arreter-enregistrement');
  boutonArreter.hidden = !(actif || etat === 'finalisation');
  boutonArreter.disabled = etat === 'finalisation';
  boutonArreter.querySelector('span').textContent = etat === 'finalisation' ? 'Sauvegarde…' : 'Arrêter';

  const indicateur = $('indicateur-enregistrement');
  indicateur.hidden = !(actif || etat === 'finalisation');
  indicateur.classList.toggle('en-pause', etat !== 'enregistrement');

  $('bouton-changer-camera').disabled = etat !== 'inactif';
}

function mettreAJourChrono() {
  $('chrono').textContent = formaterDuree(dureeEnregistree());
}

/** Bouton « Enregistrer » : décompte éventuel, puis démarrage. */
async function demanderEnregistrement() {
  if (enregistrement.etat !== 'inactif') return;
  if (!('MediaRecorder' in window)) {
    notifier('Ce navigateur ne sait pas enregistrer (fonction MediaRecorder absente).', 'erreur');
    return;
  }
  if (!media.flux) {
    notifier(prompteur.mode === 'videaste' ? 'La caméra n\'est pas disponible.' : 'Le micro n\'est pas disponible.', 'erreur');
    return;
  }
  basculerPanneauRapide(false);

  if (reglages.decompte > 0) {
    enregistrement.etat = 'decompte';
    mettreAJourCommandesEnregistrement();
    const aboutiAuBout = await lancerDecompte(reglages.decompte);
    enregistrement.etat = 'inactif';
    if (!aboutiAuBout) {
      mettreAJourCommandesEnregistrement();
      return;
    }
  }
  await demarrerEnregistrement();
}

/** Affiche 3… 2… 1… Renvoie true si le décompte va au bout, false s'il est annulé. */
function lancerDecompte(secondes) {
  return new Promise((resoudre) => {
    const zone = $('decompte');
    const chiffre = $('decompte-chiffre');
    let reste = secondes;

    const afficher = () => {
      chiffre.textContent = String(reste);
      /* Astuce pour rejouer l'animation CSS : retirer la classe, forcer le
         navigateur à recalculer (lecture de offsetWidth), remettre la classe. */
      chiffre.classList.remove('anime');
      void chiffre.offsetWidth;
      chiffre.classList.add('anime');
    };

    enregistrement.finDecompte = (aboutiAuBout) => {
      clearInterval(enregistrement.minuteurDecompte);
      enregistrement.minuteurDecompte = null;
      enregistrement.finDecompte = null;
      zone.hidden = true;
      resoudre(aboutiAuBout);
    };

    zone.hidden = false;
    afficher();
    enregistrement.minuteurDecompte = setInterval(() => {
      reste -= 1;
      if (reste <= 0) enregistrement.finDecompte(true);
      else afficher();
    }, 1000);
  });
}

function annulerDecompte() {
  if (enregistrement.finDecompte) enregistrement.finDecompte(false);
}

async function demarrerEnregistrement() {
  const flux = media.flux;
  if (!flux || ecranActuel !== 'prompteur') {
    mettreAJourCommandesEnregistrement();
    return;
  }
  const type = prompteur.mode === 'videaste' ? 'video' : 'audio';
  const format = choisirFormat(type);

  /* Débits : nombre de bits encodés par seconde. Plus il est élevé, meilleure
     est la qualité… et plus le fichier est lourd. */
  const options = { audioBitsPerSecond: 128_000 };
  if (format) options.mimeType = format;
  if (type === 'video') options.videoBitsPerSecond = reglages.qualiteVideo === '1080' ? 6_000_000 : 3_000_000;

  let enregistreur;
  try {
    enregistreur = new MediaRecorder(flux, options);
  } catch {
    try {
      enregistreur = new MediaRecorder(flux); // réglages par défaut du navigateur
    } catch (erreur) {
      notifier('L\'enregistrement n\'a pas pu démarrer : ' + erreur.message, 'erreur');
      mettreAJourCommandesEnregistrement();
      return;
    }
  }

  const maintenant = Date.now();
  const fiche = {
    id: nouvelIdentifiant(),
    type,
    nom: `${prompteur.script.titre || 'Enregistrement'} – ${formaterDate(maintenant)}`,
    mimeType: enregistreur.mimeType || format || `${type}/webm`,
    creeLe: maintenant,
    duree: 0,
    taille: 0,
    scriptTitre: prompteur.script.titre || '',
    statut: 'en-cours' // devient 'termine' une fois le fichier assemblé
  };

  try {
    await bd.ecrire('enregistrements', fiche);
  } catch (erreur) {
    notifier('Stockage indisponible, enregistrement impossible : ' + erreur.message, 'erreur');
    mettreAJourCommandesEnregistrement();
    return;
  }

  Object.assign(enregistrement, {
    enregistreur,
    fiche,
    indexMorceau: 0,
    ecritures: Promise.resolve(),
    erreurEcriture: null,
    dureeCumulee: 0,
    pauseAutomatique: false,
    promesseArret: new Promise((resoudre) => enregistreur.addEventListener('stop', resoudre, { once: true }))
  });
  prendreVerrou(fiche.id);

  /* Chaque seconde, MediaRecorder fournit un morceau : on l'ajoute à la file
     d'écriture. Les écritures s'enchaînent dans l'ordre, sans se chevaucher. */
  enregistreur.addEventListener('dataavailable', (evenement) => {
    if (!evenement.data || evenement.data.size === 0) return;
    const morceau = { enregistrementId: fiche.id, index: enregistrement.indexMorceau, blob: evenement.data };
    enregistrement.indexMorceau += 1;
    enregistrement.ecritures = enregistrement.ecritures
      .then(() => bd.ecrire('morceaux', morceau))
      .catch((erreur) => {
        if (!enregistrement.erreurEcriture) {
          enregistrement.erreurEcriture = erreur;
          surErreurEcriture(erreur);
        }
      });
  });

  enregistreur.addEventListener('error', (evenement) => {
    console.error('MediaRecorder :', evenement.error);
    notifier('Problème pendant l\'enregistrement. Ce qui a déjà été enregistré est conservé.', 'erreur');
    arreterEnregistrement();
  });

  try {
    enregistreur.start(1000); // un morceau par seconde
  } catch (erreur) {
    libererVerrou();
    bd.supprimerEnregistrement(fiche.id).catch(console.error);
    notifier('L\'enregistrement n\'a pas pu démarrer : ' + erreur.message, 'erreur');
    mettreAJourCommandesEnregistrement();
    return;
  }

  enregistrement.etat = 'enregistrement';
  enregistrement.debutSegment = performance.now();
  enregistrement.minuteurChrono = setInterval(mettreAJourChrono, 250);
  mettreAJourChrono();
  mettreAJourCommandesEnregistrement();
  verrouillerOrientation();
  demanderStockagePersistant();
  if (reglages.lancerAvecEnregistrement) lancerLecture();
}

/** Pause ou reprise de l'enregistrement (le texte suit le même rythme). */
function basculerPauseEnregistrement() {
  const enregistreur = enregistrement.enregistreur;
  if (!enregistreur) return;

  if (enregistrement.etat === 'enregistrement') {
    enregistreur.pause();
    enregistrement.dureeCumulee += performance.now() - enregistrement.debutSegment;
    enregistrement.etat = 'pause';
    mettreEnPause();
  } else if (enregistrement.etat === 'pause') {
    enregistreur.resume();
    enregistrement.debutSegment = performance.now();
    enregistrement.etat = 'enregistrement';
    enregistrement.pauseAutomatique = false;
    if (reglages.lancerAvecEnregistrement) lancerLecture();
  }
  mettreAJourChrono();
  mettreAJourCommandesEnregistrement();
}

/**
 * Arrête l'enregistrement, assemble le fichier et le sauvegarde.
 * Renvoie une promesse résolue quand tout est terminé (ou tout de suite s'il
 * n'y avait rien à arrêter).
 */
function arreterEnregistrement() {
  if (!enregistrementEnCours()) return enregistrement.promesseFinalisation || Promise.resolve();

  const { enregistreur, fiche } = enregistrement;
  if (enregistrement.etat === 'enregistrement') {
    enregistrement.dureeCumulee += performance.now() - enregistrement.debutSegment;
  }
  enregistrement.etat = 'finalisation';
  clearInterval(enregistrement.minuteurChrono);
  mettreEnPause();
  deverrouillerOrientation();
  mettreAJourCommandesEnregistrement();

  /* stop() est appelé tout de suite (avant tout « await ») : même si
     l'utilisateur quitte l'écran à l'instant, les dernières images sont
     bien remises à MediaRecorder. */
  if (enregistreur.state !== 'inactive') enregistreur.stop();

  enregistrement.promesseFinalisation = (async () => {
    try {
      await enregistrement.promesseArret; // dernier morceau fourni
      await enregistrement.ecritures;     // tous les morceaux écrits
      const ficheFinale = await finaliserEnregistrement(fiche.id, enregistrement.dureeCumulee);
      if (ficheFinale) ouvrirFicheMedia(ficheFinale, { nouveau: true });
      else notifier('L\'enregistrement était vide : rien n\'a été sauvegardé.');
    } catch (erreur) {
      console.error(erreur);
      notifier('La sauvegarde a échoué (' + erreur.message + '). Une récupération sera tentée au prochain démarrage.', 'erreur');
    } finally {
      libererVerrou();
      Object.assign(enregistrement, { etat: 'inactif', enregistreur: null, fiche: null, promesseFinalisation: null, promesseArret: null });
      if (ecranActuel === 'prompteur') mettreAJourCommandesEnregistrement();
    }
  })();
  return enregistrement.promesseFinalisation;
}

/** Écriture impossible (souvent : stockage plein) → on arrête proprement. */
function surErreurEcriture(erreur) {
  const plein = erreur && (erreur.name === 'QuotaExceededError' || /quota/i.test(erreur.message || ''));
  notifier(
    plein
      ? 'Espace de stockage plein : l\'enregistrement a été arrêté. Supprimez d\'anciens enregistrements pour libérer de la place.'
      : 'Écriture impossible, l\'enregistrement a été arrêté : ' + erreur.message,
    'erreur'
  );
  arreterEnregistrement();
}

/**
 * Réassemble les morceaux d'un enregistrement en un seul fichier, corrige sa
 * durée si c'est un WebM, puis range le fichier et sa fiche dans la base.
 * @param {number} dureeConnue - durée en ms (0 si inconnue : on la mesure)
 */
async function finaliserEnregistrement(id, dureeConnue, { recupere = false } = {}) {
  const fiche = await bd.lire('enregistrements', id);
  if (!fiche) return null;
  const morceaux = await bd.lireTout('morceaux', bd.intervalleMorceaux(id));
  if (!morceaux.length) {
    await bd.supprimerEnregistrement(id);
    return null;
  }

  /* new Blob([...]) met les morceaux bout à bout, sans les recopier en mémoire. */
  const typeMime = morceaux[0].blob.type || fiche.mimeType;
  let fichier = new Blob(morceaux.map((morceau) => morceau.blob), { type: typeMime });

  const duree = dureeConnue > 0 ? Math.round(dureeConnue) : await mesurerDureeMedia(fichier, fiche.type);
  if (/webm/i.test(typeMime) && duree > 0) fichier = await corrigerDureeWebm(fichier, duree);

  const ficheFinale = {
    ...fiche,
    nom: recupere ? `${fiche.nom} (récupéré)` : fiche.nom,
    mimeType: typeMime,
    duree,
    taille: fichier.size,
    statut: 'termine'
  };
  /* Fichier et fiche écrits ensemble : jamais l'un sans l'autre. */
  await bd.ecrireEnsemble([
    { magasin: 'fichiers', objet: { id, blob: fichier } },
    { magasin: 'enregistrements', objet: ficheFinale }
  ]);
  await bd.supprimer('morceaux', bd.intervalleMorceaux(id)); // les morceaux ne servent plus
  return ficheFinale;
}

/* --- Verrou : « cet enregistrement est vivant » ---
   Si l'application est ouverte dans deux onglets, le second ne doit pas
   « récupérer » l'enregistrement que le premier est en train de faire.
   L'API Web Locks permet de tenir un verrou nommé tant que l'enregistrement
   dure ; il disparaît de lui-même si l'onglet est fermé. */

const PREFIXE_VERROU = 'prompteur-createurs-enregistrement-';

function prendreVerrou(id) {
  if (!navigator.locks) return;
  navigator.locks
    .request(PREFIXE_VERROU + id, () => new Promise((liberer) => { enregistrement.libererVerrou = liberer; }))
    .catch(() => {});
}

function libererVerrou() {
  if (enregistrement.libererVerrou) enregistrement.libererVerrou();
  enregistrement.libererVerrou = null;
}

async function verrouEstTenu(id) {
  if (!navigator.locks || !navigator.locks.query) return false;
  try {
    const etat = await navigator.locks.query();
    return etat.held.some((verrou) => verrou.name === PREFIXE_VERROU + id);
  } catch {
    return false;
  }
}

/** Au démarrage : réassemble les enregistrements interrompus et fait le ménage. */
async function recupererEnregistrementsInterrompus() {
  let fiches;
  let clesMorceaux;
  try {
    fiches = await bd.lireTout('enregistrements');
    clesMorceaux = await executerDansMagasin('morceaux', 'readonly', (magasin) => magasin.getAllKeys());
  } catch (erreur) {
    console.error(erreur);
    return;
  }

  let recuperes = 0;
  for (const fiche of fiches.filter((f) => f.statut === 'en-cours')) {
    if (await verrouEstTenu(fiche.id)) continue; // un autre onglet enregistre en ce moment
    try {
      if (await finaliserEnregistrement(fiche.id, 0, { recupere: true })) recuperes += 1;
    } catch (erreur) {
      console.error('Récupération impossible :', erreur);
    }
  }

  /* Morceaux orphelins (sans fiche en cours) : place perdue, on les supprime. */
  const enCours = new Set(fiches.filter((f) => f.statut === 'en-cours').map((f) => f.id));
  const orphelins = new Set(clesMorceaux.map((cle) => cle[0]).filter((id) => !enCours.has(id)));
  for (const id of orphelins) bd.supprimer('morceaux', bd.intervalleMorceaux(id)).catch(console.error);

  if (recuperes > 0) {
    notifier(
      recuperes > 1
        ? `${recuperes} enregistrements interrompus ont été récupérés : retrouvez-les dans « Mes enregistrements ».`
        : 'Un enregistrement interrompu a été récupéré : retrouvez-le dans « Mes enregistrements ».',
      'succes',
      9000
    );
  }
}

/** Demande au navigateur de ne jamais effacer nos données pour faire de la place. */
function demanderStockagePersistant() {
  if (!navigator.storage || !navigator.storage.persist) return;
  navigator.storage.persisted()
    .then((dejaAccorde) => dejaAccorde || navigator.storage.persist())
    .catch(() => {});
}

/* =========================================================================
   13. FICHIERS WEBM (DURÉE) ET CONVERSION EN WAV
   ========================================================================= */

/**
 * Mesure la durée d'un fichier audio ou vidéo en le chargeant dans une
 * balise média invisible. Sert pour les enregistrements récupérés, dont la
 * durée n'a pas pu être chronométrée. Renvoie des millisecondes (0 si échec).
 */
function mesurerDureeMedia(blob, type) {
  return new Promise((resoudre) => {
    const element = document.createElement(type === 'video' ? 'video' : 'audio');
    const adresse = URL.createObjectURL(blob);
    let termine = false;
    let minuteur = null;

    const terminer = (secondes) => {
      if (termine) return;
      termine = true;
      clearTimeout(minuteur);
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(adresse);
      resoudre(Number.isFinite(secondes) && secondes > 0 ? Math.round(secondes * 1000) : 0);
    };

    minuteur = setTimeout(() => terminer(element.duration), 20000);
    element.preload = 'metadata';
    element.muted = true;
    element.addEventListener('error', () => terminer(0));
    element.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(element.duration)) {
        terminer(element.duration);
        return;
      }
      /* Durée inconnue (cas des WebM de MediaRecorder) : on demande d'aller
         très loin dans le fichier ; le navigateur le parcourt jusqu'au bout
         et découvre ainsi la durée réelle. */
      element.addEventListener('durationchange', () => {
        if (Number.isFinite(element.duration)) terminer(element.duration);
      });
      element.currentTime = 1e101;
    });
    element.src = adresse;
  });
}

/* --- Correction de la durée d'un WebM ---
   Un fichier WebM est une suite d'« éléments » imbriqués (format EBML) :
   chaque élément = un identifiant + une taille + un contenu.

     [En-tête EBML] [Segment ─ taille inconnue ────────────────────────────]
                              [Info: échelle, logiciel…] [Tracks] [Cluster]…

   Comme MediaRecorder écrit le fichier « en direct », il ne connaît pas
   encore la durée au moment d'écrire l'en-tête : l'élément Info n'a pas de
   Duration. Résultat : beaucoup de lecteurs affichent une durée nulle et ne
   permettent pas d'avancer dans la vidéo. On ajoute donc une Duration dans
   Info, sans toucher au reste du fichier. */

const EBML = {
  ENTETE: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEKHEAD: 0x114d9b74,
  INFO: 0x1549a966,
  ECHELLE_TEMPS: 0x2ad7b1, // TimecodeScale
  DUREE: 0x4489,           // Duration
  CLUSTER: 0x1f43b675
};

/**
 * Lit un nombre EBML de longueur variable. Le nombre de zéros en tête du
 * premier octet indique la longueur totale (1 à 8 octets).
 * - Pour un identifiant, on garde tous les bits (marqueur compris).
 * - Pour une taille, on retire le bit marqueur ; si tous les bits restants
 *   valent 1, la taille est « inconnue ».
 */
function lireNombreEbml(octets, position, estIdentifiant) {
  const premier = octets[position];
  if (premier === undefined || premier === 0) return null;
  let longueur = 1;
  let masque = 0x80;
  while (!(premier & masque)) {
    masque >>= 1;
    longueur += 1;
  }
  if (position + longueur > octets.length || (estIdentifiant && longueur > 4)) return null;

  let valeur = estIdentifiant ? premier : premier & (masque - 1);
  let tousLesBitsAUn = valeur === masque - 1;
  for (let i = 1; i < longueur; i += 1) {
    const octet = octets[position + i];
    valeur = valeur * 256 + octet;
    if (octet !== 0xff) tousLesBitsAUn = false;
  }
  return { valeur, longueur, inconnue: !estIdentifiant && tousLesBitsAUn };
}

/** Lit l'en-tête (identifiant + taille) de l'élément situé à cette position. */
function lireElementEbml(octets, position) {
  const id = lireNombreEbml(octets, position, true);
  if (!id) return null;
  const taille = lireNombreEbml(octets, position + id.longueur, false);
  if (!taille) return null;
  const debutContenu = position + id.longueur + taille.longueur;
  return { id: id.valeur, debut: position, debutContenu, fin: debutContenu + taille.valeur, tailleInconnue: taille.inconnue };
}

/**
 * Renvoie une copie du WebM avec la bonne durée. En cas de doute sur la
 * structure, le fichier est renvoyé tel quel : mieux vaut une durée absente
 * qu'un fichier abîmé.
 */
async function corrigerDureeWebm(blob, dureeMs) {
  try {
    /* L'en-tête ne pèse que quelques Ko : inutile de lire tout le fichier. */
    const octets = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1024 * 1024)).arrayBuffer());

    const entete = lireElementEbml(octets, 0);
    if (!entete || entete.id !== EBML.ENTETE || entete.tailleInconnue) return blob;

    const segment = lireElementEbml(octets, entete.fin);
    /* Taille de Segment connue = fichier déjà finalisé par un logiciel : on n'y touche pas. */
    if (!segment || segment.id !== EBML.SEGMENT || !segment.tailleInconnue) return blob;

    let position = segment.debutContenu;
    while (position < octets.length) {
      const element = lireElementEbml(octets, position);
      if (!element || element.tailleInconnue) return blob;
      /* Un SeekHead contient des positions dans le fichier, que notre ajout
         décalerait. Un Cluster atteint sans Info : structure inattendue. */
      if (element.id === EBML.SEEKHEAD || element.id === EBML.CLUSTER) return blob;
      if (element.id === EBML.INFO) {
        return element.fin <= octets.length ? ajouterDureeDansInfo(blob, octets, element, dureeMs) : blob;
      }
      position = element.fin;
    }
    return blob;
  } catch (erreur) {
    console.warn('Durée WebM non corrigée :', erreur);
    return blob;
  }
}

function ajouterDureeDansInfo(blob, octets, info, dureeMs) {
  const enfantsConserves = [];
  let echelle = 1000000; // valeur par défaut : 1 ms, exprimée en nanosecondes

  for (let position = info.debutContenu; position < info.fin;) {
    const enfant = lireElementEbml(octets, position);
    if (!enfant || enfant.tailleInconnue || enfant.fin > info.fin) return blob;

    if (enfant.id === EBML.ECHELLE_TEMPS) {
      let valeur = 0;
      for (let i = enfant.debutContenu; i < enfant.fin; i += 1) valeur = valeur * 256 + octets[i];
      if (valeur > 0) echelle = valeur;
    }
    if (enfant.id === EBML.DUREE) {
      const longueur = enfant.fin - enfant.debutContenu;
      const vue = new DataView(octets.buffer, octets.byteOffset + enfant.debutContenu, longueur);
      const existante = longueur === 8 ? vue.getFloat64(0) : longueur === 4 ? vue.getFloat32(0) : 0;
      if (existante > 0) return blob; // une durée valable existe déjà
    } else {
      enfantsConserves.push(octets.subarray(enfant.debut, enfant.fin));
    }
    position = enfant.fin;
  }

  /* Nouvel élément Duration : identifiant 44 89, taille 88 (= 8 octets),
     puis un nombre à virgule exprimé en unités de l'échelle de temps. */
  const duree = new Uint8Array(11);
  duree.set([0x44, 0x89, 0x88]);
  new DataView(duree.buffer).setFloat64(3, (dureeMs * 1000000) / echelle);

  /* Nouvel en-tête de Info : identifiant sur 4 octets, puis taille sur
     8 octets (01 suivi de 7 octets de valeur). */
  const tailleContenu = enfantsConserves.reduce((total, enfant) => total + enfant.length, 0) + duree.length;
  const enteteInfo = new Uint8Array(12);
  enteteInfo.set([0x15, 0x49, 0xa9, 0x66, 0x01]);
  let reste = tailleContenu;
  for (let i = 11; i >= 5; i -= 1) {
    enteteInfo[i] = reste % 256;
    reste = Math.floor(reste / 256);
  }

  /* Le nouveau fichier : ce qui précède Info, le nouvel Info, puis tout le
     reste du fichier d'origine (Blob.slice ne recopie rien en mémoire). */
  return new Blob(
    [octets.subarray(0, info.debut), enteteInfo, ...enfantsConserves, duree, blob.slice(info.fin)],
    { type: blob.type }
  );
}

/**
 * Convertit un enregistrement audio en WAV (PCM 16 bits), le format le plus
 * universel, accepté par tous les logiciels de montage audio. Un WAV n'est
 * pas compressé : il pèse environ dix fois plus que le WebM d'origine.
 */
async function convertirEnWav(blob) {
  const ContexteAudio = window.AudioContext || window.webkitAudioContext;
  const contexte = new ContexteAudio();
  let audio;
  try {
    /* decodeAudioData transforme le fichier compressé en échantillons bruts. */
    audio = await contexte.decodeAudioData(await blob.arrayBuffer());
  } finally {
    contexte.close().catch(() => {});
  }

  const canaux = Math.min(audio.numberOfChannels, 2);
  const frequence = audio.sampleRate;
  const tailleDonnees = audio.length * canaux * 2; // 2 octets par échantillon

  /* En-tête WAV standard de 44 octets. */
  const entete = new DataView(new ArrayBuffer(44));
  const ecrireTexte = (position, texte) => {
    for (let i = 0; i < texte.length; i += 1) entete.setUint8(position + i, texte.charCodeAt(i));
  };
  ecrireTexte(0, 'RIFF');
  entete.setUint32(4, 36 + tailleDonnees, true);
  ecrireTexte(8, 'WAVE');
  ecrireTexte(12, 'fmt ');
  entete.setUint32(16, 16, true);                      // taille du bloc « fmt »
  entete.setUint16(20, 1, true);                       // 1 = PCM non compressé
  entete.setUint16(22, canaux, true);
  entete.setUint32(24, frequence, true);
  entete.setUint32(28, frequence * canaux * 2, true);  // octets par seconde
  entete.setUint16(32, canaux * 2, true);              // octets par « image »
  entete.setUint16(34, 16, true);                      // bits par échantillon
  ecrireTexte(36, 'data');
  entete.setUint32(40, tailleDonnees, true);

  /* Les échantillons, par paquets d'une seconde, pour ne pas créer un seul
     tableau géant. Toutes les 30 secondes d'audio, on laisse souffler
     l'interface (attendre(0)) pour qu'elle ne paraisse pas figée. */
  const donnees = Array.from({ length: canaux }, (_, canal) => audio.getChannelData(canal));
  const parties = [entete.buffer];
  for (let debut = 0, paquet = 0; debut < audio.length; debut += frequence, paquet += 1) {
    const fin = Math.min(debut + frequence, audio.length);
    const vue = new DataView(new ArrayBuffer((fin - debut) * canaux * 2));
    let position = 0;
    for (let i = debut; i < fin; i += 1) {
      for (let canal = 0; canal < canaux; canal += 1) {
        const valeur = borner(donnees[canal][i], -1, 1);
        vue.setInt16(position, valeur < 0 ? valeur * 0x8000 : valeur * 0x7fff, true);
        position += 2;
      }
    }
    parties.push(vue.buffer);
    if (paquet % 30 === 29) await attendre(0);
  }
  return new Blob(parties, { type: 'audio/wav' });
}


/* =========================================================================
   14. MES ENREGISTREMENTS
   ========================================================================= */

let filtreEnregistrements = 'video';

/** L'enregistrement affiché dans la boîte « fiche » (lecteur, nom, boutons). */
const ficheMedia = { fiche: null, blob: null, adresse: null };

async function afficherEnregistrements() {
  for (const onglet of document.querySelectorAll('.onglet')) {
    onglet.setAttribute('aria-selected', String(onglet.dataset.filtre === filtreEnregistrements));
  }

  let fiches = [];
  try {
    fiches = await bd.lireTout('enregistrements');
  } catch (erreur) {
    notifier('Impossible de lire vos enregistrements : ' + erreur.message, 'erreur');
  }
  const terminees = fiches.filter((fiche) => fiche.statut === 'termine');
  const visibles = terminees
    .filter((fiche) => fiche.type === filtreEnregistrements)
    .sort((a, b) => b.creeLe - a.creeLe);

  $('liste-enregistrements').replaceChildren(...visibles.map(creerElementEnregistrement));

  const messageVide = $('enregistrements-vide');
  messageVide.hidden = visibles.length > 0;
  messageVide.textContent = filtreEnregistrements === 'video'
    ? 'Aucune vidéo pour l\'instant. Lancez le mode Vidéaste, puis touchez « Enregistrer ».'
    : 'Aucun enregistrement audio pour l\'instant. Lancez le mode Podcast, puis touchez « Enregistrer ».';

  afficherEspaceStockage(terminees);
}

function creerElementEnregistrement(fiche) {
  const extension = extensionDuFormat(fiche.mimeType);
  return creerElement('li', { classe: 'element-liste' }, [
    creerElement('h2', { classe: 'element-titre' }, [creerIcone(fiche.type === 'video' ? 'camera' : 'micro'), fiche.nom]),
    creerElement('p', {
      classe: 'element-meta',
      texte: `${formaterDate(fiche.creeLe)} · ${formaterDuree(fiche.duree)} · ${formaterTaille(fiche.taille)} · .${extension}`
    }),
    creerElement('div', { classe: 'element-actions' }, [
      creerBouton({
        texte: fiche.type === 'video' ? 'Regarder' : 'Écouter',
        icone: 'lecture',
        classe: 'bouton bouton-primaire bouton-petit',
        action: () => ouvrirFicheMedia(fiche)
      }),
      creerBouton({ texte: 'Renommer', icone: 'crayon', action: () => renommerEnregistrement(fiche) }),
      creerBouton({ texte: 'Télécharger', icone: 'telecharger', action: () => telechargerEnregistrement(fiche) }),
      creerBouton({
        texte: 'Supprimer',
        icone: 'corbeille',
        classe: 'bouton bouton-danger bouton-petit',
        action: () => supprimerEnregistrement(fiche)
      })
    ])
  ]);
}

/** Place occupée par les enregistrements et place encore disponible. */
async function afficherEspaceStockage(fiches) {
  const total = fiches.reduce((somme, fiche) => somme + (fiche.taille || 0), 0);
  let texte = `Vos enregistrements occupent ${formaterTaille(total)} sur cet appareil.`;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      if (quota) texte += ` Espace encore disponible pour l'application : environ ${formaterTaille(Math.max(0, quota - usage))}.`;
    } catch {
      /* estimation indisponible */
    }
  }
  $('espace-stockage').textContent = texte;
}

/** Ouvre la fiche d'un enregistrement : lecteur, nom modifiable, actions. */
async function ouvrirFicheMedia(fiche, { nouveau = false } = {}) {
  let rangement = null;
  try {
    rangement = await bd.lire('fichiers', fiche.id);
  } catch (erreur) {
    console.error(erreur);
  }
  if (!rangement) {
    notifier('Fichier introuvable sur cet appareil.', 'erreur');
    return;
  }

  libererLecteurMedia();
  ficheMedia.fiche = fiche;
  ficheMedia.blob = rangement.blob;
  /* Une adresse « blob: » permet à la balise <video> ou <audio> de lire le
     fichier directement depuis la mémoire de l'appareil. */
  ficheMedia.adresse = URL.createObjectURL(rangement.blob);

  const lecteur = document.createElement(fiche.type === 'video' ? 'video' : 'audio');
  lecteur.controls = true;
  lecteur.preload = 'metadata';
  lecteur.playsInline = true;
  lecteur.src = ficheMedia.adresse;
  $('media-lecteur').replaceChildren(lecteur);

  const extension = extensionDuFormat(fiche.mimeType);
  $('media-titre').textContent = nouveau ? 'Enregistrement terminé ✓' : fiche.type === 'video' ? 'Vidéo' : 'Audio';
  $('media-nom').value = fiche.nom;
  $('media-infos').textContent =
    `${formaterDate(fiche.creeLe)} · ${formaterDuree(fiche.duree)} · ${formaterTaille(fiche.taille)} · format .${extension}`
    + (nouveau ? '\nSauvegardé sur cet appareil. Téléchargez-le pour le conserver ailleurs.' : '');
  $('media-telecharger-texte').textContent = `Télécharger (.${extension})`;
  $('media-wav').hidden = fiche.type !== 'audio';
  $('media-partager').hidden = !partagePossible(fiche, rangement.blob);

  const dialogue = $('dialogue-media');
  if (!dialogue.open) dialogue.showModal();
}

/** Arrête la lecture et libère la mémoire occupée par le lecteur. */
function libererLecteurMedia() {
  const lecteur = $('media-lecteur').firstElementChild;
  if (lecteur) {
    lecteur.pause();
    lecteur.removeAttribute('src');
    lecteur.load();
  }
  $('media-lecteur').replaceChildren();
  if (ficheMedia.adresse) URL.revokeObjectURL(ficheMedia.adresse);
  ficheMedia.adresse = null;
  ficheMedia.blob = null;
}

/** Enregistre le nom tapé dans la fiche, s'il a changé. */
function enregistrerNomDepuisFiche() {
  const fiche = ficheMedia.fiche;
  const nom = $('media-nom').value.trim();
  if (!fiche) return;
  if (!nom) {
    $('media-nom').value = fiche.nom;
    return;
  }
  if (nom !== fiche.nom) modifierNomEnregistrement(fiche, nom);
}

async function modifierNomEnregistrement(fiche, nom) {
  try {
    const actuelle = await bd.lire('enregistrements', fiche.id);
    if (!actuelle) return;
    actuelle.nom = nom.slice(0, 120);
    await bd.ecrire('enregistrements', actuelle);
    fiche.nom = actuelle.nom;
    if (ecranActuel === 'enregistrements') afficherEnregistrements();
  } catch (erreur) {
    notifier('Le nouveau nom n\'a pas pu être enregistré : ' + erreur.message, 'erreur');
  }
}

async function renommerEnregistrement(fiche) {
  const nom = await demanderTexte({ titre: 'Renommer l\'enregistrement', etiquette: 'Nouveau nom', valeur: fiche.nom });
  if (!nom || nom === fiche.nom) return;
  await modifierNomEnregistrement(fiche, nom);
  notifier('Enregistrement renommé.', 'succes');
}

/** Déclenche le téléchargement d'un fichier présent en mémoire. */
function telechargerFichier(blob, nomFichier) {
  const adresse = URL.createObjectURL(blob);
  const lien = creerElement('a', { href: adresse, download: nomFichier });
  document.body.append(lien);
  lien.click();
  lien.remove();
  /* On laisse une minute au navigateur pour commencer la copie avant de libérer l'adresse. */
  setTimeout(() => URL.revokeObjectURL(adresse), 60000);
}

async function telechargerEnregistrement(fiche, blobDejaCharge) {
  let blob = blobDejaCharge;
  if (!blob) {
    const rangement = await bd.lire('fichiers', fiche.id).catch(() => null);
    blob = rangement && rangement.blob;
  }
  if (!blob) {
    notifier('Fichier introuvable sur cet appareil.', 'erreur');
    return;
  }
  telechargerFichier(blob, `${nettoyerNomFichier(fiche.nom)}.${extensionDuFormat(fiche.mimeType)}`);
}

/* --- Partage (Android, iPhone…) : envoyer directement la vidéo vers une
   autre application (galerie, messagerie, YouTube…), sans passer par un
   dossier de téléchargement. --- */

function fichierAPartager(fiche, blob) {
  const typeSimple = (blob.type || fiche.mimeType || '').split(';')[0]; // « video/webm;codecs=… » → « video/webm »
  return new File([blob], `${nettoyerNomFichier(fiche.nom)}.${extensionDuFormat(fiche.mimeType)}`, { type: typeSimple });
}

function partagePossible(fiche, blob) {
  try {
    return Boolean(navigator.canShare && navigator.canShare({ files: [fichierAPartager(fiche, blob)] }));
  } catch {
    return false;
  }
}

async function partagerEnregistrement() {
  const { fiche, blob } = ficheMedia;
  if (!fiche || !blob) return;
  try {
    await navigator.share({ files: [fichierAPartager(fiche, blob)], title: fiche.nom });
  } catch (erreur) {
    if (erreur.name !== 'AbortError') notifier('Partage impossible : ' + erreur.message, 'erreur');
  }
}

async function telechargerEnWav() {
  const { fiche, blob } = ficheMedia;
  if (!fiche || !blob) return;
  if (fiche.duree > 45 * 60 * 1000) {
    const accord = await demanderConfirmation({
      titre: 'Conversion d\'un long enregistrement',
      message: 'Cet enregistrement dépasse 45 minutes : sa conversion en .wav demande beaucoup de mémoire et peut échouer sur un téléphone.',
      bouton: 'Convertir quand même',
      danger: false
    });
    if (!accord) return;
  }
  const bouton = $('media-wav');
  bouton.disabled = true;
  notifier('Conversion en .wav en cours…');
  try {
    const wav = await convertirEnWav(blob);
    telechargerFichier(wav, `${nettoyerNomFichier(fiche.nom)}.wav`);
  } catch (erreur) {
    console.error(erreur);
    notifier('La conversion en .wav a échoué : ' + erreur.message, 'erreur');
  } finally {
    bouton.disabled = false;
  }
}

async function supprimerEnregistrement(fiche) {
  const accord = await demanderConfirmation({
    titre: 'Supprimer cet enregistrement ?',
    message: `« ${fiche.nom} » sera définitivement effacé de cet appareil. Téléchargez-le d'abord si vous souhaitez le garder.`,
    bouton: 'Supprimer'
  });
  if (!accord) return false;
  try {
    await bd.supprimerEnregistrement(fiche.id);
  } catch (erreur) {
    notifier('Suppression impossible : ' + erreur.message, 'erreur');
    return false;
  }
  notifier('Enregistrement supprimé.');
  if (ecranActuel === 'enregistrements') afficherEnregistrements();
  return true;
}

function initialiserEnregistrements() {
  for (const onglet of document.querySelectorAll('.onglet')) {
    onglet.addEventListener('click', () => {
      filtreEnregistrements = onglet.dataset.filtre;
      afficherEnregistrements();
    });
  }

  const dialogue = $('dialogue-media');
  $('media-fermer').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('close', () => {
    enregistrerNomDepuisFiche(); // un nom modifié juste avant de fermer n'est pas perdu
    libererLecteurMedia();
    ficheMedia.fiche = null;
  });
  $('media-nom').addEventListener('change', enregistrerNomDepuisFiche);
  $('media-telecharger').addEventListener('click', () => {
    if (ficheMedia.fiche) telechargerEnregistrement(ficheMedia.fiche, ficheMedia.blob);
  });
  $('media-partager').addEventListener('click', partagerEnregistrement);
  $('media-wav').addEventListener('click', telechargerEnWav);
  $('media-supprimer').addEventListener('click', async () => {
    const fiche = ficheMedia.fiche;
    if (fiche && (await supprimerEnregistrement(fiche))) {
      ficheMedia.fiche = null;
      dialogue.close();
    }
  });
}


/* =========================================================================
   15. ÉCRAN ALLUMÉ, PLEIN ÉCRAN, ORIENTATION
   ========================================================================= */

/* Wake Lock : empêche l'écran de s'éteindre pendant la lecture. Indispensable
   pour un prompteur : sans lui, le téléphone se met en veille au bout de
   30 secondes sans toucher l'écran. */
let verrouEcran = null;

async function activerEcranAllume() {
  if (!('wakeLock' in navigator) || document.hidden || ecranActuel !== 'prompteur') return;
  if (verrouEcran && !verrouEcran.released) return;
  try {
    verrouEcran = await navigator.wakeLock.request('screen');
    /* Le prompteur a pu être quitté pendant la demande. */
    if (ecranActuel !== 'prompteur') desactiverEcranAllume();
  } catch (erreur) {
    console.info('Maintien de l\'écran allumé refusé :', erreur.message);
  }
}

function desactiverEcranAllume() {
  if (verrouEcran) verrouEcran.release().catch(() => {});
  verrouEcran = null;
}

/* Plein écran. Les préfixes « webkit » servent aux anciens Safari. */

function elementEnPleinEcran() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function demanderPleinEcran() {
  const racine = document.documentElement;
  const demande = racine.requestFullscreen || racine.webkitRequestFullscreen;
  if (!demande || elementEnPleinEcran()) return;
  try {
    const resultat = demande.call(racine, { navigationUI: 'hide' });
    if (resultat && resultat.catch) resultat.catch(() => { /* refus : on reste en fenêtre */ });
  } catch {
    /* navigateur sans plein écran */
  }
}

function quitterPleinEcran() {
  if (!elementEnPleinEcran()) return;
  const sortie = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    const resultat = sortie.call(document);
    if (resultat && resultat.catch) resultat.catch(() => {});
  } catch {
    /* rien à faire */
  }
}

function basculerPleinEcran() {
  if (elementEnPleinEcran()) quitterPleinEcran();
  else demanderPleinEcran();
}

function mettreAJourBoutonPleinEcran() {
  const bouton = $('bouton-plein-ecran');
  const actif = Boolean(elementEnPleinEcran());
  changerIcone(bouton, actif ? 'quitter-plein-ecran' : 'plein-ecran');
  bouton.setAttribute('aria-label', actif ? 'Quitter le plein écran' : 'Plein écran');
  bouton.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

/* Orientation : pendant un enregistrement, on fige l'orientation actuelle.
   Tourner le téléphone en pleine prise changerait le format de la vidéo en
   cours de route. (Refusé par certains navigateurs hors plein écran : sans
   conséquence.) */

function verrouillerOrientation() {
  const orientation = screen.orientation;
  if (!orientation || typeof orientation.lock !== 'function') return;
  orientation.lock(orientation.type).catch(() => {});
}

function deverrouillerOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch {
    /* pas de verrou en place */
  }
}

/** L'application passe en arrière-plan (autre appli, écran verrouillé…) ou revient. */
function surChangementVisibilite() {
  if (document.hidden) {
    /* Sur téléphone, la caméra est coupée en arrière-plan : on met
       l'enregistrement en pause plutôt que d'enregistrer une image figée. */
    if (enregistrement.etat === 'enregistrement') {
      basculerPauseEnregistrement();
      enregistrement.pauseAutomatique = true;
    }
    return;
  }
  if (ecranActuel === 'prompteur') activerEcranAllume(); // le verrou saute en arrière-plan
  if (enregistrement.pauseAutomatique && enregistrement.etat === 'pause') {
    notifier('Enregistrement en pause : l\'application est passée en arrière-plan. Touchez « Reprendre » pour continuer.', 'info', 9000);
  }
}


/* =========================================================================
   16. INSTALLATION ET MISES À JOUR DE L'APPLICATION
   ========================================================================= */

/* Chrome et Edge proposent l'installation via l'événement
   « beforeinstallprompt » : on le met de côté pour l'offrir avec notre
   propre bouton, plus visible que le menu du navigateur. */
let invitationInstallation = null;

function initialiserInstallation() {
  window.addEventListener('beforeinstallprompt', (evenement) => {
    evenement.preventDefault();
    invitationInstallation = evenement;
    $('bouton-installer').hidden = false;
  });

  $('bouton-installer').addEventListener('click', async () => {
    if (!invitationInstallation) return;
    invitationInstallation.prompt();
    await invitationInstallation.userChoice.catch(() => null);
    invitationInstallation = null;
    $('bouton-installer').hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    $('bouton-installer').hidden = true;
    notifier('Application installée !', 'succes');
  });
}

/* Mises à jour : quand une nouvelle version du service worker est prête
   (voir sw.js), un bandeau le signale. On ne recharge la page que si
   l'utilisateur le demande, et jamais pendant un enregistrement. */
let miseAJourDemandee = false;

function initialiserServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    /* Ce changement a aussi lieu à la toute première installation : on ne
       recharge que si c'est une mise à jour acceptée. */
    if (miseAJourDemandee) window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js')
    .then((inscription) => {
      const surveiller = (travailleur) => {
        travailleur.addEventListener('statechange', () => {
          if (travailleur.state === 'installed' && navigator.serviceWorker.controller) proposerMiseAJour(inscription);
        });
      };
      if (inscription.waiting && navigator.serviceWorker.controller) proposerMiseAJour(inscription);
      if (inscription.installing) surveiller(inscription.installing);
      inscription.addEventListener('updatefound', () => {
        if (inscription.installing) surveiller(inscription.installing);
      });
      /* À chaque retour dans l'application, on vérifie s'il existe une nouvelle version. */
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) inscription.update().catch(() => {});
      });
    })
    .catch((erreur) => console.warn('Mode hors ligne indisponible :', erreur));
}

function proposerMiseAJour(inscription) {
  $('bandeau-mise-a-jour').hidden = false;
  /* « onclick = » (et non addEventListener) : si le bandeau est proposé deux
     fois, l'action n'est pas empilée en double. */
  $('bouton-mettre-a-jour').onclick = () => {
    if (enregistrement.etat !== 'inactif') {
      notifier('Terminez d\'abord l\'enregistrement en cours.');
      return;
    }
    miseAJourDemandee = true;
    $('bandeau-mise-a-jour').hidden = true;
    if (inscription.waiting) inscription.waiting.postMessage({ type: 'ACTIVER_NOUVELLE_VERSION' });
    else window.location.reload();
  };
}


/* =========================================================================
   17. DÉMARRAGE
   ========================================================================= */

async function demarrer() {
  try {
    media.facingMode = localStorage.getItem(CLE_CAMERA) === 'environment' ? 'environment' : 'user';
  } catch {
    /* on garde la caméra avant */
  }

  appliquerReglages();
  synchroniserChampsReglages();
  lierChampsReglages();
  initialiserNavigation();
  initialiserBibliotheque();
  initialiserEditeur();
  initialiserPrompteur();
  initialiserEnregistrements();
  initialiserInstallation();

  mettreAJourBoutonPleinEcran();
  document.addEventListener('fullscreenchange', mettreAJourBoutonPleinEcran);
  document.addEventListener('webkitfullscreenchange', mettreAJourBoutonPleinEcran);
  document.addEventListener('visibilitychange', surChangementVisibilite);
  $('video-camera').addEventListener('loadedmetadata', afficherResolution);
  $('video-camera').addEventListener('resize', afficherResolution); // l'image change de format (rotation)
  if (document.fonts) document.fonts.ready.then(demanderNouvellesMesures);

  initialiserServiceWorker();

  try {
    await ouvrirBase();
    await creerScriptDeBienvenue();
    await recupererEnregistrementsInterrompus();
  } catch (erreur) {
    console.error(erreur);
    notifier('Le stockage local est indisponible (navigation privée ?) : scripts et enregistrements ne pourront pas être conservés.', 'erreur');
  }
  afficherAccueil();
}

demarrer();
