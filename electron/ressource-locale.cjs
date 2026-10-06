"use strict";

// electron/ressource-locale.cjs — Le schéma qui sert une ressource livrée à un worker.
//
// POURQUOI UN SCHÉMA, ET NON UN `fetch` DE FICHIER.
//
// Les sept nœuds Magenta chargent leurs modèles dans un Web Worker, et la bibliothèque n'accepte
// qu'une URL : `new MusicRNN(url)` va chercher `url/config.json`, puis `url/weights_manifest.json`,
// puis les fragments de poids. On ne peut donc pas lui passer des octets.
//
// Or un worker n'a pas de preload, donc pas d'`api.lireBinaire` — le chemin par lequel tout le
// reste du dépôt lit une ressource livrée. Et dans l'application empaquetée la page vient de
// `file://`, où un `fetch` est refusé. Il faut donc une ORIGINE que le worker puisse interroger, et
// que le processus principal résolve : c'est exactement ce que fait déjà le schéma des films.
//
// `standard` et `secure` le font traiter comme une origine ordinaire ; `supportFetchAPI` autorise
// `fetch` ; `bypassCSP` reste faux, le schéma étant déclaré dans `connect-src`.

const fs = require("fs");
const path = require("path");

const SCHEMA = "attic-res";

/**
 * LES SEULS DOSSIERS QUE CE SCHÉMA SERT, et cette liste est ce qui le rend sûr.
 *
 * Sans elle, `attic-res://package.json` résolvait et rendait le fichier : le schéma donnait accès à
 * TOUT ce que le résolveur sait atteindre — la racine du projet en développement, `resources/` dans
 * l'application installée. Trouvé en vérifiant le chemin empaqueté, et non en le cherchant.
 *
 * Qui pourrait s'en servir ? Aucune page du dehors — un schéma propre n'est pas joignable depuis le
 * web. Mais Attic installe des nœuds à chaud, livrés en `.zip` : du code tiers tourne dans la page.
 * Un schéma qui lit n'importe quel fichier livré lui ouvrirait tout. Il n'ouvre que ceci.
 *
 * `oonx` S'Y EST AJOUTÉ POUR LES DEUX MODÈLES DE RECONNAISSANCE VOCALE, qui venaient d'un tiers à
 * l'exécution. Ils sont désormais livrés comme les points de contrôle Magenta, et leurs workers les
 * lisent par le même chemin. La liste s'allonge d'un dossier de MODÈLES, pas d'un dossier
 * quelconque : c'est la même nature de contenu, lue par les mêmes workers, et les deux contrôles
 * qui suivent — pas de remontée, pas de racine seule — s'y appliquent à l'identique.
 */
const DOSSIERS_SERVIS = new Set(["magenta", "oonx"]);

/**
 * Le chemin relatif demandé par une URL du schéma, ou `null` si elle sort des ressources.
 *
 * LE CONTRÔLE DE REMONTÉE N'EST PAS DÉCORATIF : cette fonction transforme une chaîne venue de la
 * page en chemin de fichier. Un segment `..` permettrait de lire n'importe quoi sur le disque, et
 * un chemin absolu de même. Les deux sont refusés avant toute résolution.
 */
function cheminRelatifDepuisUrl(url) {
  if (typeof url !== "string") return null;

  // LA CHAÎNE BRUTE D'ABORD, ET C'EST L'ORDRE QUI FAIT TOUT. `new URL()` NORMALISE les segments
  // `..` : `attic-res://magenta/../../etc/passwd` devient `magenta/etc/passwd`, et un contrôle
  // posé après le découpage ne voit donc jamais rien — il passe au vert en ne cherchant rien.
  // Trouvé en écrivant le cas, et c'est pourquoi la tentative est refusée ICI, sur ce que
  // l'appelant a réellement envoyé, plutôt que réécrite en silence. Aucun chemin de modèle
  // légitime ne contient `..` ni un point échappé.
  // Un segment `.` est inoffensif — il ne sort de rien — mais il est refusé comme son voisin :
  // une règle qui souffre une exception est une règle qu'on relit mal. Le motif ne vise que des
  // SEGMENTS, de sorte qu'un nom de dossier qui contient un point, `model.v1`, passe.
  if (/\.\.(?:[\\/]|$)/.test(url) || /%2e/i.test(url) || /(?:^|[\\/])\.[\\/]/.test(url)) return null;

  let analysee;
  try {
    analysee = new URL(url);
  } catch {
    return null;
  }
  // `attic-res://magenta/melody_rnn/config.json` : l'hôte porte le premier segment.
  const relatif = `${analysee.hostname}${decodeURIComponent(analysee.pathname)}`.replace(/^\/+/, "");
  if (relatif === "") return null;
  if (path.isAbsolute(relatif)) return null;
  // Seconde ligne, pour ce qu'un décodage ferait apparaître après coup.
  // Les segments vides sont retirés : `magenta/` en laisse un, et le compte ci-dessous le prendrait
  // pour un nom de fichier.
  const segments = relatif.split(/[\\/]+/).filter((s) => s !== "");
  if (segments.some((s) => s === ".." || s === ".")) return null;
  // Et le dossier demandé est l'un de ceux que ce schéma sert, sinon rien.
  if (segments.length < 2 || !DOSSIERS_SERVIS.has(segments[0])) return null;
  return segments.join("/");
}

/** Le type de contenu, déduit de l'extension. Les fragments de poids n'en ont pas. */
function typeDeContenu(relatif) {
  if (relatif.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * Sert une requête du schéma depuis le disque.
 *
 * @param requete la requête du protocole.
 * @param resoudre une fonction `(cheminRelatif) => cheminAbsolu | null`, celle du dépôt.
 */
async function servir(requete, resoudre) {
  const relatif = cheminRelatifDepuisUrl(requete.url);
  if (!relatif) return new Response("chemin refusé", { status: 400 });
  const absolu = resoudre(relatif);
  if (!absolu) return new Response("ressource introuvable", { status: 404 });
  let octets;
  try {
    octets = await fs.promises.readFile(absolu);
  } catch {
    return new Response("ressource introuvable", { status: 404 });
  }
  return new Response(octets, {
    status: 200,
    headers: {
      "Content-Type": typeDeContenu(relatif),
      "Content-Length": String(octets.length),
      // La ressource est livrée avec l'application : elle ne change pas sans réinstallation.
      "Cache-Control": "public, max-age=31536000, immutable",
      // LA PAGE VIENT DE `file://`, DONC D'UNE AUTRE ORIGINE. Sans cet en-tête, un `fetch` vers ce
      // schéma est refusé comme requête croisée. Le schéma ne sert que des ressources livrées avec
      // l'application, et aucune page du dehors ne peut l'atteindre : il n'y a rien à restreindre.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

module.exports = { SCHEMA, cheminRelatifDepuisUrl, typeDeContenu, servir };
