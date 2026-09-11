// electron/chemins-ressources.cjs — Résolution d'un chemin de ressource, en
// développement comme dans l'application empaquetée.
//
// POURQUOI CENTRALISER
//
// Ce bloc était recopié CINQ fois dans main.cjs (dossier:lire, fichier:lire-audio,
// fichier:lire-binaire, et les deux gestionnaires Stable Audio 3) :
//
//     if (!path.isAbsolute(chemin)) {
//       const base = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
//       chemin = path.join(base, chemin);
//     }
//
// Quatre copies s'arrêtaient là. La cinquième — `fichier:lire-binaire` —
// ajoutait un repli vers `public/` en développement. D'où une asymétrie
// silencieuse : un même chemin relatif se résolvait par un gestionnaire et pas
// par un autre, en développement seulement.
//
// C'est exactement la classe de défaut qui a coûté la v3.1.4, où le worker
// Sherpa fonctionnait en développement — Vite servant la racine — et pointait
// vers la racine du disque une fois l'application chargée en `file://`. Ce qui
// diffère entre les deux environnements mérite d'être écrit à un seul endroit,
// et testé.
//
// LE REPLI `public/` EST VOLONTAIREMENT LIMITÉ AU DÉVELOPPEMENT : à la
// construction, le contenu de `public/` est copié à la racine des ressources,
// donc `resources/oonx/...` et non `resources/public/oonx/...`. Chercher
// `public/` dans l'application empaquetée ne trouverait jamais rien et
// masquerait la vraie raison d'un échec.
const fs = require("fs");
const path = require("path");

/**
 * Résout un chemin de ressource.
 *
 * Un chemin absolu est rendu tel quel — c'est un chemin choisi par
 * l'utilisateur, pas une ressource de l'application.
 *
 * @param chemin chemin absolu ou relatif à la racine des ressources
 * @param empaquete `app.isPackaged`
 * @param racineRessources `process.resourcesPath`
 * @param racineProjet racine du dépôt, en développement
 * @param existe injecté pour les tests
 */
function resoudreRessource(chemin, { empaquete, racineRessources, racineProjet, existe = fs.existsSync } = {}) {
  if (typeof chemin !== "string" || chemin === "") return null;
  if (path.isAbsolute(chemin)) return chemin;

  const base = empaquete ? racineRessources : racineProjet;
  if (!base) return null;

  const direct = path.join(base, chemin);
  if (empaquete) return direct;

  // En développement seulement : `public/` n'est pas encore aplati à la racine.
  if (existe(direct)) return direct;
  const dansPublic = path.join(base, "public", chemin);
  return existe(dansPublic) ? dansPublic : direct;
}

module.exports = { resoudreRessource };
