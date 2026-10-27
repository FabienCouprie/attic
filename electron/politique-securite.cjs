// electron/politique-securite.cjs — La politique de sécurité de contenu, par destination.
//
// ═══ POURQUOI CE MODULE, ET POURQUOI DEUX POLITIQUES ═══
//
// UNE SEULE CONSTANTE S'APPLIQUAIT À TOUTES LES RÉPONSES, et elle portait `'unsafe-eval'` pour une
// seule raison : le code d'un nœud installé s'évalue par `new Function`. Or ce code ne s'évalue
// plus dans le document depuis le 2026-10-27, mais dans un CADRE ISOLÉ — et un cadre créé par
// `srcdoc` HÉRITE de la politique de son parent. Ôter `'unsafe-eval'` au document l'aurait ôté au
// cadre, et cassé tous les nœuds installés.
//
// LA PAGE DU CADRE A DONC SA PROPRE ADRESSE (`cadre-noeud.html`) ET SA PROPRE POLITIQUE. Elle seule
// garde `'unsafe-eval'` ; elle n'a ni pont, ni origine — `sandbox="allow-scripts"` la rend opaque —,
// et ce qu'elle évalue est le code qu'on a autorisé à l'installation.
//
// LE DOCUMENT PERD `'unsafe-eval'` ET GAGNE `'wasm-unsafe-eval'`. Le second est le seul dont il ait
// besoin : compiler du WebAssembly — Csound, Verovio, onnxruntime, Pure Data. Mesuré le 2026-10-27 :
// au démarrage, aucun appel à `Function` ; et le seul code du document qui en fabriquait, `ndarray`
// sous Magenta, n'est plus construit (voir `src/audio/ndarray-inerte.ts`).
//
// CE MODULE EST PUR, sans Electron, pour qu'un cas sous Node le charge et qu'une épreuve applique
// la MÊME politique que l'application — une seconde écriture divergerait.
const { SCHEMA: SCHEMA_MEDIA } = require("./plage-media.cjs");
const { SCHEMA: SCHEMA_RESSOURCE } = require("./ressource-locale.cjs");

/** Les adresses qu'une page peut joindre. Les mêmes pour le document et pour le cadre. */
const CONNECT = `connect-src 'self' ${SCHEMA_RESSOURCE}: https://huggingface.co https://cdn.jsdelivr.net https://*.hf.co `
  + "https://*.xet-bridge-us.hf.co https://tfhub.dev https://*.tfhub.dev https://storage.googleapis.com "
  + "https://*.kaggle.com https://*.googleusercontent.com http://127.0.0.1:11434 http://localhost:11434 blob: data:";

/** La politique du document. `unsafe-inline` reste pour les vues qui posent du style et du script en ligne. */
const CSP_DOCUMENT = [
  "default-src 'self' display-capture",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' blob: https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  `media-src 'self' blob: data: stream: ${SCHEMA_MEDIA}:`,
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  CONNECT,
].join("; ");

/**
 * La politique de la page du cadre isolé : la seule qui permette `eval`.
 *
 * ELLE NE CHARGE RIEN DE L'APPLICATION — `default-src 'none'` — : son script est en ligne, et le
 * code du nœud lui arrive par message. Elle garde l'audio et les adresses que le document peut
 * joindre, et rien d'autre.
 */
const CSP_CADRE = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "worker-src blob:",
  "media-src blob: data:",
  "img-src blob: data:",
  CONNECT,
].join("; ");

/**
 * La politique du worker de Vosk : la seconde, et la dernière, qui permette `eval`.
 *
 * RELEVÉ LE 2026-10-27 en passant tout le catalogue sous la politique stricte : le code Emscripten
 * de Vosk construit des fonctions (embind, `createNamedFunction` et `craftInvokerFunction`), et son
 * worker naissait d'un blob, qui hérite la politique du document. Il est désormais servi par son
 * propre fichier (`src/audio/vosk-travailleur.ts`). Un worker n'a ni DOM ni pont : ce qu'il évalue
 * ne sort pas de lui.
 *
 * CETTE POLITIQUE NE S'APPLIQUE QU'EN DÉVELOPPEMENT, et c'est mesuré, non supposé. Dans
 * l'application livrée, un worker chargé depuis `file://` ne reçoit AUCUNE politique : avec
 * `connect-src 'none'` posé ici, le worker de Vosk a tout de même joint le réseau et reçu un 404.
 * C'est vrai de tous les workers livrés, et c'était vrai avant ce module. Ce qui fait marcher Vosk
 * dans l'application livrée, c'est d'être sorti du blob — qui, lui, hérite la politique du document.
 */
const CSP_TRAVAILLEUR_VOSK = [
  "default-src 'none'",
  "script-src 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  CONNECT,
].join("; ");

/** Le nom de la page du cadre, servi à côté de `index.html`. */
const PAGE_CADRE = "cadre-noeud.html";

/** Le nom du worker de Vosk, servi à côté de `index.html`. Le même que `FICHIER_TRAVAILLEUR_VOSK`. */
const FICHIER_VOSK = "vosk-worker.js";

/** La politique que mérite la réponse à cette adresse. */
function politiquePour(url) {
  let chemin = "";
  try { chemin = new URL(String(url)).pathname; } catch { chemin = String(url ?? ""); }
  if (chemin.endsWith(`/${PAGE_CADRE}`)) return CSP_CADRE;
  if (chemin.endsWith(`/${FICHIER_VOSK}`)) return CSP_TRAVAILLEUR_VOSK;
  return CSP_DOCUMENT;
}

module.exports = { CSP_DOCUMENT, CSP_CADRE, CSP_TRAVAILLEUR_VOSK, PAGE_CADRE, FICHIER_VOSK, politiquePour };
