// electron/parakeet.cjs — Les mots d'un enregistrement, et l'instant de chacun.
//
// MÊME EXÉCUTABLE QUE LES AUTRES FAMILLES D'`audio.cpp`, dont ce module reprend la résolution du
// binaire, la traduction du dos de calcul et la lecture du journal.
//
// CE QU'IL APPORTE QUE LE DÉPÔT N'AVAIT PAS : des instants PAR MOT sans qu'on donne le texte.
// L'aligneur Qwen3 exige la transcription — c'est sa nature, il place des mots qu'on lui donne —
// et la diarisation MOSS ne rend que des instants par segment.
//
// MESURÉ LE 2026-10-23 CONTRE UN SECOND MOTEUR, ce qui vaut mieux qu'un seuil choisi par moi : sur
// un témoin dont j'avais écrit le texte, ses quinze mots et ceux de l'aligneur Qwen3 s'accordent
// quinze sur quinze, dans le même ordre, avec un écart de début moyen de 0,075 s. Et TOUS les
// écarts sont des multiples de 0,080 s : les deux moteurs quantifient sur la même horloge de
// quatre-vingts millisecondes, donc ils ne divergent jamais de plus de deux tics de leur propre
// résolution. Sur 178,4 s il a rendu 480 mots, exactement le compte que la construction du témoin
// prévoit, le dernier à 177,68 s.
//
// IL DÉTECTE LA LANGUE SEUL, ET NE PERMET PAS DE LA DIRE : « unknown Parakeet TDT request option:
// language », comme la diarisation. Vérifié sur un témoin anglais dont je connaissais le texte,
// transcrit mot pour mot sans qu'on lui dise la langue.
//
// IL ACCEPTE N'IMPORTE QUELLE CADENCE, contrairement à la diarisation et à la restauration qui
// exigent l'une seize et l'autre quarante-quatre mille cent hertz : le 24 kHz passe et transcrit
// juste. Ce pont n'a donc rien à rééchantillonner.
//
// DEUX OPTIONS DE SA FICHE SONT INATTEIGNABLES, et il a fallu les essayer pour le savoir :
// `hotwords` répond « hotwords currently require a Phonon-2 package », qu'aucun paquet de cette
// famille ne fournit, et `audio_chunk_mode=vad` répond « Silero VAD model path does not exist ».
// `keep_language_tags` ne change rien à la sortie. Aucune n'est donc offerte.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE = "parakeet-tdt-0.6b-v3-q8_0.gguf";

/** La cadence dans laquelle le moteur rend ses indices d'échantillon, mesurée et non supposée. */
const CADENCE_MOTEUR = 16000;

function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/** Les secondes d'un indice d'échantillon rendu par le moteur. */
function secondes(indice) {
  return Number(indice) / CADENCE_MOTEUR;
}

/**
 * Transcrit un enregistrement et date chacun de ses mots.
 *
 * `options.audio` est un WAV complet, en octets, à n'importe quelle cadence. Rend le texte et la
 * liste des mots, chacun avec son début et sa fin EN SECONDES : la conversion depuis les indices
 * du moteur est faite ici, une fois, de sorte que le composant n'ait pas à la connaître.
 */
async function transcrire(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-parakeet-"));
  try {
    // CE QUI NE DEMANDE RIEN SE VÉRIFIE D'ABORD : un refus d'entrée doit se prononcer que les neuf
    // cents mégaoctets de poids soient sur le disque ou non. L'ordre inverse a fait tomber
    // l'intégration continue sur le pont d'Apollo, où aucun modèle n'est présent.
    if (!options.audio || options.audio.length === 0) {
      return { ok: false, journal: "Brancher un son sur l'entrée « Audio »." };
    }
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    const mots = path.join(travail, "mots.json");
    const texte = path.join(travail, "texte.txt");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "asr", "--family", "parakeet_tdt", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--words-out", mots, "--text-out", texte, "--metrics",
    ];

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0) return { ok: false, journal };

    let liste = [];
    try {
      const lu = JSON.parse(fs.readFileSync(mots, "utf8"));
      if (Array.isArray(lu)) {
        liste = lu.map((m) => ({
          mot: String(m.word ?? ""),
          debut: secondes(m.start_sample),
          fin: secondes(m.end_sample),
        }));
      }
    } catch { /* pas de mots lisibles : le texte reste, et le composant le dira */ }

    return {
      ok: true,
      texte: fs.existsSync(texte) ? fs.readFileSync(texte, "utf8").trim() : "",
      mots: liste,
      releves: relevesDuJournal(journal),
      journal,
    };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { transcrire, cheminModele, secondes, CADENCE_MOTEUR };
