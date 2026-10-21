// electron/ced.cjs — Appel d'audio.cpp pour étiqueter ce qu'on entend dans un audio.
//
// LE MÊME EXÉCUTABLE QUE LA TRANSCRIPTION MIDI ET LE CLONEUR, une troisième famille. `audiocpp_cli`
// la sert sous `--family ced --task cls`, et le dos de calcul se nomme en deux morceaux,
// `--backend vulkan --device 1` ; la traduction vient de `muscriptor.cjs`, comme pour le cloneur.
//
// CHOISI CONTRE AUDIO FLAMINGO, et c'est la mesure qui a tranché. Pour décrire un audio en mots,
// cette version d'audio.cpp n'offre que deux familles d'étiquetage, `ced` et `ast_audioset`, et
// deux de compréhension, `audioflamingo3` et `audio-flamingo-next`. Les Flamingo font huit
// milliards de paramètres : 5 459 592 448 octets pour le plus petit paquet utile, soit 2,54 fois le
// plafond d'un asset de release, 5 206,6 Mio de poids sur une carte de 6 144 Mio, et une licence
// NVIDIA OneWay Noncommercial. Celui-ci pèse 342 964 768 octets, tourne en mémoire vive et porte
// Apache-2.0.
//
// ET CLAP N'ÉTAIT PAS UNE ROUTE, contrairement à ce que le binaire laissait croire : `clap` y
// figure comme ENCODEUR INTERNE de `controlfoley`, dans la même liste que `cav_mae`, `synchformer`
// et `mert`, et aucune famille ne l'expose. Une chaîne qui apparaît dans un binaire n'est pas une
// fonction qu'on peut appeler.
//
// CINQ CENT VINGT-SEPT CLASSES, CELLES D'AUDIOSET, et le nombre rendu se règle :
// `--request-option top_k=N` est honoré, vérifié à vingt. La sortie est un JSON de schéma
// `ced.classification.v1`, étiquette + score + logit, trié par score décroissant.
//
// LE WAV EST EXIGÉ, le MP3 refusé en clair par l'exécutable — « input is MP3, not WAV ». Sans
// conséquence ici : l'appelant envoie les octets d'un WAV, que ce module pose sur disque.
//
// MESURÉ SUR UNE RTX 2060, paquet « base », sur quatre témoins dont trois à réponse connue :
// facteur de temps réel de 0,0057 à 0,0196, soit cinquante et un à cent soixante-quatorze fois le
// temps réel, et un pic de 398 Mo de mémoire vive. Les instruments, les sources, le lieu et la
// présence d'une voix sont justes ; le genre ne l'est pas, et c'est écrit dans la notice du nœud.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE = "ced-base-f32.gguf";

/**
 * Le GGUF, téléchargé à la demande ou livré.
 *
 * LE FICHIER EST DEMANDÉ, ET NON SON DOSSIER : demander « audiocpp » rend le PREMIER dossier de ce
 * nom qui existe, et celui de l'utilisateur passe devant par construction, de sorte qu'un dossier
 * portant l'un des trois modèles de cette racine ferait désigner les autres là où ils ne sont pas.
 * C'est ce qui faisait répondre « Modèle absent » au cloneur alors que son fichier était livré.
 */
function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Les étiquettes lues dans le journal de l'exécutable.
 *
 * LA LIGNE EST CHERCHÉE SUR SON SCHÉMA, non sur sa position : `custom_schema_output=` est suivi
 * d'un JSON qui se nomme lui-même, `ced.classification.v1`. Exiger le nom du schéma plutôt que la
 * seule présence de la ligne évite de lire pour des étiquettes ce qu'une autre famille y écrirait.
 */
function etiquettesDuJournal(journal) {
  const m = /custom_schema_output=(\{.*\})/.exec(journal || "");
  if (!m) return null;
  let charge;
  try { charge = JSON.parse(m[1]); } catch { return null; }
  if (charge?.schema !== "ced.classification.v1") return null;
  const scores = charge?.data?.scores;
  if (!Array.isArray(scores)) return null;
  return scores
    .filter((s) => typeof s?.label === "string" && Number.isFinite(s?.score))
    .map((s) => ({ etiquette: s.label, score: s.score }));
}

/**
 * Étiquette un audio.
 *
 * `options.audio` est un WAV complet, en octets. `options.nombre` est le nombre d'étiquettes
 * demandé ; absent, l'exécutable en rend dix.
 */
async function etiqueter(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-ced-"));
  try {
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };
    if (!options.audio) return { ok: false, journal: "Brancher un audio sur l'entrée « Audio »." };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "cls", "--family", "ced", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--metrics",
    ];
    if (Number.isFinite(options.nombre) && options.nombre > 0) {
      args.push("--request-option", `top_k=${Math.round(options.nombre)}`);
    }

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0) return { ok: false, journal };
    const etiquettes = etiquettesDuJournal(journal);
    // UN CODE DE RETOUR NUL NE SUFFIT PAS : l'exécutable écrit ses étiquettes dans son journal et
    // non dans un fichier, donc un journal sans la ligne de schéma est un échec silencieux.
    if (!etiquettes) return { ok: false, journal };
    return { ok: true, etiquettes, releves: relevesDuJournal(journal), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { etiqueter, etiquettesDuJournal, cheminModele };
