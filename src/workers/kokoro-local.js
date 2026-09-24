// src/workers/kokoro-local.js — Le miroir local du modèle Kokoro, pour les deux workers.
//
// POURQUOI UN MODULE PARTAGÉ. Deux composants reposent sur le même modèle : la synthèse anglaise
// (`tts-kokoro`) et la française (`tts-francais`). Ils ont chacun leur worker, leur phonémiseur et
// leur voix, mais un seul modèle, un seul `dtype`, donc un seul miroir. Si chaque worker portait sa
// propre résolution, l'un pourrait passer en local sans l'autre : c'est la migration à moitié qu'il
// faut rendre impossible, pas seulement éviter. Le test de parité vérifie que les deux passent ici.
//
// POURQUOI UN RELAIS SUR `fetch`, ET NON LA CONFIGURATION DE LA BIBLIOTHÈQUE. Transformers.js sait
// chercher un modèle en local : il suffit de lui donner `localModelPath`. Mais `kokoro-js` embarque
// sa propre copie de Transformers.js, et l'`env` qu'il exporte ne gouverne pas cette copie : le
// mesurer a montré le dépôt encore tiré du réseau alors que `localModelPath` était posé. Les voix,
// elles, ne passent de toute façon par aucune configuration, leur adresse étant écrite en dur.
//
// Deux mécanismes pour deux moitiés du même modèle, c'était l'occasion qu'une seule des deux
// fonctionne, ce qui est arrivé. Il n'y en a donc plus qu'un : tout ce qui part vers le dépôt amont
// est détourné vers le miroir, poids, configuration, tokeniseur et voix. Une seule adresse à
// connaître, et le test la compare à celle qu'écrit la bibliothèque.
//
// POURQUOI SONDER LE MIROIR AU LIEU DE LE DÉCLARER. Un serveur de développement répond 200 et sa
// page d'accueil pour tout chemin inconnu. Se fier au code de retour ferait donc recevoir deux
// kilo-octets de HTML comme un modèle ONNX, et l'erreur parlerait d'analyse ONNX sans dire sa
// cause. Chaque réponse du miroir est donc vérifiée sur son type déclaré, et le réseau reste
// autorisé : l'application installée n'a pas le miroir et doit continuer de fonctionner.

export const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Racine du miroir, servie depuis `public/oonx/kokoro-82m/`. */
export const MIROIR = "/oonx/kokoro-82m/";

/** Le dépôt amont, tel que le construisent la bibliothèque et son `remotePathTemplate`. */
export const AMONT = `https://huggingface.co/${MODEL_ID}/resolve/main/`;

/** L'adresse des voix, écrite en dur dans `kokoro-js`. Un cas particulier de la précédente. */
export const AMONT_VOIX = `${AMONT}voices/`;

const BASE_LOCALE = `${MIROIR}${MODEL_ID}/`;

/**
 * Une réponse est-elle le fichier demandé, ou la page de repli du serveur ?
 *
 * Le test porte sur le type déclaré et non sur la taille : un `.bin` de voix pèse un demi-mégaoctet
 * et une page d'accueil deux kilo-octets, mais se fier à un seuil serait se fier à un hasard.
 */
function estVraiFichier(reponse) {
  if (!reponse || !reponse.ok) return false;
  const type = reponse.headers.get("content-type") || "";
  return !type.includes("text/html");
}

let miroirConnu = null;

/**
 * Le miroir est-il réellement en place ? Sondé une seule fois, sur `config.json`, qui pèse
 * quarante-quatre octets : la question ne mérite pas de télécharger davantage.
 */
export async function miroirPresent(chercher = fetch) {
  if (miroirConnu !== null) return miroirConnu;
  try {
    const rep = await chercher(`${BASE_LOCALE}config.json`, { cache: "no-store" });
    if (!estVraiFichier(rep)) { miroirConnu = false; return false; }
    await rep.json();
    miroirConnu = true;
  } catch {
    miroirConnu = false;
  }
  return miroirConnu;
}

/**
 * Pose le relais sur le `fetch` du worker : tout ce qui vise le dépôt amont est servi par le
 * miroir.
 *
 * Toute autre requête passe inchangée, et un fichier absent du miroir repart vers l'amont : le
 * relais préfère le local, il ne l'impose pas.
 */
/** @param {{ fetch: typeof fetch, __kokoroRelais?: boolean }} [cible] */
export function poserRelais(cible = /** @type {any} */ (self)) {
  if (cible.__kokoroRelais) return cible.fetch;
  const original = cible.fetch.bind(cible);
  cible.fetch = async (entree, options) => {
    const url = typeof entree === "string" ? entree : entree?.url ?? "";
    if (typeof url === "string" && url.startsWith(AMONT)) {
      const reste = url.slice(AMONT.length).split("?")[0];
      try {
        const local = await original(`${BASE_LOCALE}${reste}`, { cache: "force-cache" });
        if (estVraiFichier(local)) return local;
      } catch { /* le miroir est muet sur ce fichier : l'amont répondra */ }
    }
    return original(entree, options);
  };
  cible.__kokoroRelais = true;
  return cible.fetch;
}

/**
 * Branche le miroir, si et seulement si le miroir est là. Rend vrai si le local a été retenu.
 *
 * Rien n'est imposé à la bibliothèque : elle construit ses adresses comme d'habitude, et c'est le
 * relais qui les sert. Un miroir absent laisse donc le comportement d'origine, intact.
 */
export async function installerMiroirKokoro() {
  if (!(await miroirPresent())) return false;
  poserRelais();
  return true;
}

/** Remet le module à son état de départ. Réservé aux tests. */
export function oublierMiroir() {
  miroirConnu = null;
}
