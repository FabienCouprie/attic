// src/workers/tts-local.js — Le miroir local des deux synthèses vocales Transformers.js.
//
// MÊME MÉCANIQUE QUE `kokoro-local.js`, ÉTENDUE À PLUSIEURS DÉPÔTS. Celui de Kokoro ne connaît
// qu'une adresse amont ; ici il y en a neuf, deux pour SpeechT5 et sept pour les langues de MMS,
// plus le dépôt de jeu de données qui porte les voix. Le relais ne pouvait donc pas être recopié :
// il devait apprendre à reconnaître une famille d'adresses au lieu d'une seule.
//
// POURQUOI UN RELAIS SUR `fetch`, ET NON `localModelPath`. Transformers.js sait chercher en local,
// mais deux choses y échappent : l'adresse des voix de SpeechT5, écrite en dur dans le composant
// et non résolue par la bibliothèque ; et le fait qu'une configuration ratée se voit à l'exécution
// par un téléchargement silencieux, non par une erreur. Un relais échoue de façon visible et sert
// les deux moitiés du même modèle par le même chemin.
//
// LE RÉSEAU RESTE AUTORISÉ. Un fichier absent du miroir repart vers l'amont : le relais préfère le
// local, il ne l'impose pas. Une application installée sans le miroir continue de fonctionner,
// exactement comme avant, et c'est ce qui rend ce changement sans risque pour l'existant.

/** Les racines de `public/oonx/` et les dépôts que chacune miroite. */
export const PAQUETS = [
  { racine: "tts-speecht5", depots: ["Xenova/speecht5_tts", "Xenova/speecht5_hifigan"] },
  { racine: "tts-speecht5", depots: ["Xenova/cmu-arctic-xvectors-extracted"], jeuDeDonnees: true },
  {
    racine: "tts-mms",
    depots: ["eng", "fra", "spa", "deu", "por", "ron", "rus"].map((l) => `Xenova/mms-tts-${l}`),
  },
];

const AMONT_MODELE = "https://huggingface.co/";
const AMONT_DONNEES = "https://huggingface.co/datasets/";

/** L'adresse amont d'un dépôt, telle que la bibliothèque ou le composant la construit. */
function amontDe(nom, jeuDeDonnees) {
  return `${jeuDeDonnees ? AMONT_DONNEES : AMONT_MODELE}${nom}/resolve/main/`;
}

/**
 * La base d'où lire le miroir. Elle vient de la PAGE, et c'est ce qui rend ce module juste dans
 * l'application empaquetée.
 *
 * DANS UN WORKER, `self.location` EST L'URL DU SCRIPT, et non celle de la page : une adresse
 * enracinée calculée ici ne désignerait pas ce qu'on croit. Et dans l'application empaquetée la
 * page vient de `file://`, où un chemin enraciné ne résout rien du tout ; il faut alors le schéma
 * `attic-res:`, que le processus principal sert. `plugins/base-modeles.ts` porte le calcul et son
 * pourquoi ; la page le fait et nous le passe. Sans cela le miroir n'aurait valu qu'en
 * développement, et les deux paquets du manifeste n'auraient jamais servi là où ils comptent.
 */
let base = "/oonx";

/** Pose la base transmise par la page. À appeler avant le premier chargement. */
export function reglerBase(nouvelle) {
  if (typeof nouvelle === "string" && nouvelle) base = nouvelle.replace(/\/+$/, "");
  miroirConnu = null;
}

/** La table des correspondances : à chaque adresse amont, sa base locale. */
const correspondances = () => PAQUETS.flatMap((p) =>
  p.depots.map((nom) => ({
    amont: amontDe(nom, p.jeuDeDonnees),
    local: `${base}/${p.racine}/${nom}/`,
  })),
);

let miroirConnu = null;

/**
 * Une réponse est-elle le fichier demandé, ou la page de repli du serveur ?
 *
 * Le test porte sur le type déclaré et non sur la taille : un serveur de développement répond 200
 * et sa page d'accueil pour tout chemin inconnu, et se fier au code de retour ferait recevoir deux
 * kilo-octets de HTML comme un modèle ONNX. L'erreur parlerait alors d'analyse ONNX sans dire sa
 * cause.
 */
function estVraiFichier(reponse) {
  if (!reponse || !reponse.ok) return false;
  const type = reponse.headers.get("content-type") || "";
  return !type.includes("text/html");
}

/**
 * Le miroir est-il réellement en place ? Sondé une seule fois, sur la configuration de SpeechT5,
 * qui pèse quelques centaines d'octets : la question ne mérite pas de télécharger davantage.
 */
export async function miroirPresent(chercher = fetch) {
  if (miroirConnu !== null) return miroirConnu;
  try {
    const rep = await chercher(`${base}/tts-speecht5/Xenova/speecht5_tts/config.json`, { cache: "no-store" });
    if (!estVraiFichier(rep)) { miroirConnu = false; return false; }
    await rep.json();
    miroirConnu = true;
  } catch {
    miroirConnu = false;
  }
  return miroirConnu;
}

/** La base locale qui sert une adresse amont, ou néant si aucune ne la sert. */
export function localePour(url) {
  if (typeof url !== "string") return null;
  for (const c of correspondances()) {
    if (url.startsWith(c.amont)) return { base: c.local, reste: url.slice(c.amont.length).split("?")[0] };
  }
  return null;
}

/**
 * Pose le relais sur le `fetch` du worker : tout ce qui vise l'un des dépôts amont est servi par
 * le miroir.
 *
 * Toute autre requête passe inchangée, et un fichier absent du miroir repart vers l'amont.
 */
export function poserRelais(cible = self) {
  if (cible.__ttsRelais) return cible.fetch;
  const original = cible.fetch.bind(cible);
  cible.fetch = async (entree, options) => {
    const url = typeof entree === "string" ? entree : entree?.url ?? "";
    const vers = localePour(url);
    if (vers) {
      try {
        const local = await original(`${vers.base}${vers.reste}`, { cache: "force-cache" });
        if (estVraiFichier(local)) return local;
      } catch { /* le miroir est muet sur ce fichier : l'amont répondra */ }
    }
    return original(entree, options);
  };
  cible.__ttsRelais = true;
  return cible.fetch;
}

/**
 * Branche le miroir, si et seulement si le miroir est là. Rend vrai si le local a été retenu.
 *
 * `baseTransmise` vient de la page, par le message du composant : voir `reglerBase`.
 */
export async function installerMiroirTts(baseTransmise) {
  if (baseTransmise) reglerBase(baseTransmise);
  if (!(await miroirPresent())) return false;
  poserRelais();
  return true;
}

/** Remet le module à son état de départ. Réservé aux tests. */
export function oublierMiroir() {
  miroirConnu = null;
}
