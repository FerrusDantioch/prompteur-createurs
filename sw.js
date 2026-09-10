/* =========================================================================
   Service worker de Prompteur Créateurs
   -------------------------------------------------------------------------
   Un « service worker » est un petit script que le navigateur installe à
   côté de la page. Il s'intercale entre l'application et le réseau : ici,
   il range une copie de TOUS les fichiers de l'application sur l'appareil,
   pour qu'elle démarre et fonctionne ensuite sans aucune connexion.

   ⚠️ RÈGLE D'OR : après toute modification d'un fichier listé dans FICHIERS,
   incrémenter VERSION ci-dessous (v1 → v2 → v3…). Sans ce changement, le
   navigateur ne détecte aucune nouveauté et continue de servir l'ancienne
   copie indéfiniment, même si le dépôt GitHub est à jour.
   Un fichier AJOUTÉ doit aussi être inscrit dans FICHIERS, sinon il
   manquera hors ligne.
   ========================================================================= */

const VERSION = 'prompteur-createurs-v1';

/* Début commun à tous nos caches. Il permet de reconnaître (et de supprimer)
   les caches de nos anciennes versions sans toucher à rien d'autre. */
const PREFIXE_CACHE = 'prompteur-createurs-';

/* La liste complète des fichiers nécessaires au fonctionnement hors ligne. */
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/atkinson-hyperlegible-next.woff2',
  './fonts/lexend.woff2',
  './fonts/literata.woff2',
  './fonts/roboto-mono.woff2',
  './fonts/opendyslexic-400.woff2',
  './fonts/opendyslexic-700.woff2',
  './libs/pdfjs/pdf.min.mjs',
  './libs/pdfjs/pdf.worker.min.mjs'
];

/* 1. INSTALLATION : on télécharge et on range tous les fichiers. ---------- */
self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(VERSION).then((cache) =>
      /* { cache: 'reload' } force un vrai téléchargement. Sans cette option,
         le navigateur pourrait reprendre une copie encore présente dans son
         cache HTTP ordinaire (GitHub Pages l'autorise pendant 10 minutes) :
         on rangerait alors un ANCIEN fichier sous l'étiquette de la NOUVELLE
         version, et l'erreur serait très difficile à comprendre. */
      cache.addAll(FICHIERS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  /* Volontairement, PAS de self.skipWaiting() ici. Une nouvelle version
     attend sagement que l'utilisateur accepte la mise à jour (voir l'étape 3) :
     remplacer l'application en plein enregistrement serait une très mauvaise
     surprise. */
});

/* 2. ACTIVATION : on supprime les caches des versions précédentes. -------- */
self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms
          .filter((nom) => nom.startsWith(PREFIXE_CACHE) && nom !== VERSION)
          .map((nom) => caches.delete(nom))
      ))
      /* clients.claim() : le service worker prend immédiatement le contrôle
         des pages déjà ouvertes, sans attendre qu'elles soient rechargées. */
      .then(() => self.clients.claim())
  );
});

/* 3. MESSAGE DE LA PAGE : l'utilisateur a touché « Mettre à jour ». ------- */
self.addEventListener('message', (evenement) => {
  if (evenement.data && evenement.data.type === 'ACTIVER_NOUVELLE_VERSION') {
    /* skipWaiting() met cette version en service ; la page le remarque
       (événement « controllerchange ») et se recharge d'elle-même. */
    self.skipWaiting();
  }
});

/* 4. REQUÊTES : on sert d'abord la copie rangée sur l'appareil. ----------- */
self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;

  /* On ne s'occupe que des lectures (GET) adressées à notre propre site.
     L'application ne contacte jamais d'autre adresse, mais par prudence on
     laisse passer tout le reste sans y toucher. */
  if (requete.method !== 'GET') return;
  if (new URL(requete.url).origin !== self.location.origin) return;

  evenement.respondWith((async () => {
    /* On cherche dans le cache de CETTE version précisément (et non dans
       tous les caches à la fois), pour ne jamais mélanger deux versions. */
    const cache = await caches.open(VERSION);
    const copie = await cache.match(requete, { ignoreSearch: true });
    if (copie) return copie;

    try {
      /* Fichier absent du cache : on tente le réseau. */
      return await fetch(requete);
    } catch (erreur) {
      /* Hors ligne : pour l'ouverture d'une page, on renvoie l'accueil. */
      if (requete.mode === 'navigate') {
        const accueil = await cache.match('./index.html');
        if (accueil) return accueil;
      }
      throw erreur;
    }
  })());
});
