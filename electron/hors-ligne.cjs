"use strict";

// electron/hors-ligne.cjs — Le mode hors ligne strict : rien ne sort de la machine.
//
// POURQUOI CE MODULE. Pièce C7 du plan du fichier de configuration (2026-11-19) : la clé `horsLigne`
// de `config.json`, ou `ATTIC_HORS_LIGNE` qui l'emporte. Le plan dit : « les requêtes du navigateur
// qui ne visent pas la machine sont coupées, et nommées ». Le banc avait déjà ce tri
// (`HORS_LIGNE=1`, `tests-e2e/mesurer.spec.ts`) : il a trouvé « Débruitage IA », qui tirait le wasm
// d'onnxruntime de jsdelivr pendant qu'on le croyait local.
//
// ═══ LE NAVIGATEUR NE SUFFIT PAS, ET C'EST POURQUOI LE MODE COUPE AUSSI LE PROCESSUS PRINCIPAL ═══
//
// Les requêtes de la session passent par `onBeforeRequest` : la page, ses workers, ses cadres. Mais
// le processus principal sort aussi par lui-même, sans passer par elle :
//   — les téléchargements de modèles, par `http` et `https` de Node (`telechargement-modeles.cjs`,
//     le canal `telecharger:url` d'`ipc-modeles.cjs`) ;
//   — Ollama, par le `fetch` de Node (`ipc-moteurs.cjs`), quand son adresse vise une autre machine ;
//   — la recherche de mise à jour, qu'`main.cjs` n'installe pas en mode hors ligne.
// Un mode « strict » qui les laisserait sortir mentirait. Chacun demande donc `refusHorsLigne`.
//
// CE QUI EST LOCAL : `localhost`, `127.0.0.1` et `[::1]`, en HTTP comme en WebSocket (le serveur de
// développement et son rechargement), et les adresses qui ne quittent pas le processus : `file:`,
// `data:`, `blob:`, `about:`, les outils de développement, et les deux protocoles de l'application.

const SCHEMAS_LOCAUX = new Set([
  "file:", "data:", "blob:", "about:", "devtools:", "chrome:", "chrome-extension:", "attic-res:", "attic-fichier:",
]);
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

let actif = false;
const coupees = new Set();

/** Arme ou désarme le mode. Les origines déjà nommées s'oublient. */
function poserHorsLigne(valeur) {
  actif = valeur === true;
  coupees.clear();
}

const horsLigneActif = () => actif;

/** L'adresse vise-t-elle la machine elle-même ? Une adresse illisible n'est pas locale. */
function adresseLocale(adresse) {
  let u;
  try { u = adresse instanceof URL ? adresse : new URL(String(adresse)); } catch { return false; }
  if (SCHEMAS_LOCAUX.has(u.protocol)) return true;
  return ["http:", "https:", "ws:", "wss:"].includes(u.protocol) && (HOTES_LOCAUX.has(u.hostname) || u.hostname.endsWith(".localhost"));
}

/** L'origine d'une adresse, pour la nommer sans ses paramètres. */
function origineDe(adresse) {
  try { const u = adresse instanceof URL ? adresse : new URL(String(adresse)); return `${u.protocol}//${u.host}`; } catch { return String(adresse).slice(0, 80); }
}

/**
 * Nomme une sortie coupée dans le journal, une fois par origine : une page qui réessaie toutes les
 * secondes ne doit pas noyer le journal.
 */
function nommer(adresse, qui, journal) {
  const o = origineDe(adresse);
  if (coupees.has(o)) return;
  coupees.add(o);
  journal(`[attic] hors ligne strict : ${qui} vers ${o} coupée`);
}

/**
 * Pour une sortie du processus principal : `null` si elle peut partir, le message du refus sinon.
 * `qui` dit ce qui voulait sortir (« téléchargement », « Ollama »).
 */
function refusHorsLigne(adresse, qui = "requête", journal = console.log) {
  if (!actif || adresseLocale(adresse)) return null;
  nommer(adresse, qui, journal);
  return `Hors ligne strict (clé horsLigne de config.json, ou ATTIC_HORS_LIGNE) : ${qui} vers ${origineDe(adresse)} refusé.`;
}

/**
 * Coupe, dans cette session, toute requête qui ne vise pas la machine, et la nomme. N'arme rien si
 * le mode est éteint : `onBeforeRequest` ne garde qu'un écouteur par session, et il ne faut pas
 * prendre la place d'un autre pour rien.
 */
function armerHorsLigne(session, journal = console.log) {
  if (!actif) return false;
  session.webRequest.onBeforeRequest((details, rappel) => {
    if (adresseLocale(details.url)) return rappel({});
    nommer(details.url, "requête", journal);
    rappel({ cancel: true });
  });
  return true;
}

module.exports = { poserHorsLigne, horsLigneActif, adresseLocale, refusHorsLigne, armerHorsLigne };
