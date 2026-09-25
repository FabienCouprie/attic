// electron/plage-media.cjs — De quoi servir un film du disque à un élément vidéo, par morceaux.
//
// POURQUOI UN PROTOCOLE ET NON UNE ADRESSE `file://`. La page est servie en `http://localhost` en
// développement et en `file://` en production ; une adresse `file://` posée dans un élément vidéo
// est refusée dans le premier cas. Un schéma à nous répond dans les deux, et il reste sous notre
// contrôle : il ne sert que les conteneurs vidéo que le composant accepte.
//
// POURQUOI LES PLAGES SONT OBLIGATOIRES. Sans elles, un lecteur ne peut pas se déplacer dans un
// film : il faudrait lui livrer les soixante-dix mégaoctets d'un coup, c'est-à-dire tenir en mémoire
// ce que la lecture par plages du composant évite précisément. Avec elles, il demande ce dont il a
// besoin, quand il en a besoin, et se déplace instantanément.
//
// CE FICHIER NE CONNAÎT PAS ELECTRON : il n'en manipule que des chaînes et des nombres, et c'est ce
// qui le rend vérifiable sans lancer l'application.

const path = require("path");

const SCHEMA = "attic-fichier";

/** Les conteneurs servis, avec le type que le lecteur attend. */
const TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

/** L'adresse d'un fichier du disque dans notre schéma. */
function urlDeFichier(chemin) {
  // Le chemin entier devient le pointeur de l'adresse, encodé : un espace, un accent ou un dièse
  // dans un nom de film casserait l'analyse sans cela. Les séparateurs de Windows sont retournés,
  // une adresse n'en connaissant qu'un.
  return `${SCHEMA}://f/${encodeURI(chemin.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** Le chemin du disque que porte une adresse de notre schéma, ou null. */
function cheminDepuisUrl(url) {
  const texte = String(url ?? "");
  if (!texte.startsWith(`${SCHEMA}://`)) return null;
  const apres = texte.slice(`${SCHEMA}://`.length);
  const barre = apres.indexOf("/");
  if (barre < 0) return null;
  let chemin;
  try {
    chemin = decodeURIComponent(apres.slice(barre + 1).split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (!chemin) return null;
  // UN CHEMIN RELATIF EST REFUSÉ, et « .. » avec lui : ce protocole ne sert que ce qu'on lui
  // désigne en entier, jamais ce qu'un chemin bricolé irait chercher ailleurs.
  if (chemin.split("/").includes("..")) return null;
  const natif = path.normalize(chemin);
  return path.isAbsolute(natif) ? natif : null;
}

/** Le type d'un fichier servi, ou null si ce n'est pas un conteneur que nous servons. */
function typeMedia(chemin) {
  return TYPES[path.extname(String(chemin ?? "")).toLowerCase()] ?? null;
}

/**
 * La plage demandée par l'en-tête `Range`, rapportée à la taille du fichier.
 *
 * Rend `null` quand il n'y a pas d'en-tête (le fichier entier), et `{ invalide: true }` quand la
 * demande sort du fichier, ce à quoi un serveur répond 416 plutôt que d'inventer des octets.
 */
function analyserPlage(entete, taille) {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(entete).trim());
  if (!m) return { invalide: true };
  const [, a, b] = m;
  if (a === "" && b === "") return { invalide: true };
  let debut;
  let fin;
  if (a === "") {
    // « bytes=-500 » : les cinq cents derniers octets, ce qu'un lecteur demande pour l'index d'un
    // MP4 dont les métadonnées sont à la fin.
    const derniers = Number(b);
    if (derniers <= 0) return { invalide: true };
    debut = Math.max(0, taille - derniers);
    fin = taille - 1;
  } else {
    debut = Number(a);
    fin = b === "" ? taille - 1 : Math.min(Number(b), taille - 1);
  }
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || debut > fin || debut >= taille) {
    return { invalide: true };
  }
  return { debut, fin, longueur: fin - debut + 1 };
}

module.exports = { SCHEMA, TYPES, urlDeFichier, cheminDepuisUrl, typeMedia, analyserPlage };
