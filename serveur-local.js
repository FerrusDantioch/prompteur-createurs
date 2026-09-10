/* =========================================================================
   Petit serveur local pour tester l'application (facultatif).
   -------------------------------------------------------------------------
   L'application elle-même n'a besoin d'AUCUN outil : ce sont de simples
   fichiers HTML/CSS/JS. Mais les navigateurs n'autorisent la caméra, le
   micro et le mode hors ligne (service worker) que sur une adresse sécurisée :
   « https:// » ou « http://localhost ». Jamais sur un fichier ouvert par
   double-clic (« file:// »). Ce fichier sert juste à ça.

   Utilisation :   node serveur-local.js
   Puis ouvrir :   http://localhost:5190
   ========================================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5190;
const RACINE = __dirname;

/* À chaque extension de fichier correspond un « type de contenu ».
   Détail important : les modules JavaScript (.mjs, utilisés par pdf.js)
   DOIVENT être annoncés comme du JavaScript, sinon le navigateur les refuse. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

http.createServer((requete, reponse) => {
  let demande;
  try {
    /* On retire les paramètres éventuels (?…) et on décode les accents. */
    demande = decodeURIComponent(requete.url.split('?')[0]);
  } catch {
    reponse.writeHead(400).end('Adresse invalide');
    return;
  }

  const chemin = demande.endsWith('/') ? demande + 'index.html' : demande;
  const fichier = path.join(RACINE, chemin);

  /* Sécurité : le fichier demandé doit rester à l'intérieur du dossier de
     l'application (on refuse les astuces du type « ../../ »). */
  const relatif = path.relative(RACINE, fichier);
  if (relatif.startsWith('..') || path.isAbsolute(relatif)) {
    reponse.writeHead(403).end('Accès refusé');
    return;
  }

  fs.readFile(fichier, (erreur, contenu) => {
    if (erreur) {
      reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      reponse.end('Fichier introuvable : ' + chemin);
      return;
    }
    reponse.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
      /* Pendant les tests, on évite que le navigateur garde d'anciennes
         versions des fichiers dans son cache ordinaire. */
      'Cache-Control': 'no-cache'
    });
    reponse.end(contenu);
  });
}).listen(PORT, () => {
  console.log('Prompteur Créateurs : http://localhost:' + PORT);
});
