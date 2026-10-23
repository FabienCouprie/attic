// electron/qwen3-asr.cjs — Transcrire, par un second moteur que le premier ne remplace pas.
//
// MÊME EXÉCUTABLE QUE LES AUTRES FAMILLES D'`audio.cpp`, dont ce module reprend la résolution du
// binaire, la traduction du dos de calcul et la lecture du journal.
//
// POURQUOI UN SECOND MOTEUR DE TRANSCRIPTION, mesuré le 2026-10-23 contre le premier, sur des
// témoins dont j'avais écrit le texte. Sur une phrase française courte et nette, celui-ci rend le
// texte EXACTEMENT tel que je l'avais écrit, là où Parakeet ajoute une virgule ; sur l'anglais il
// garde « river bank » en deux mots quand Parakeet les soude. Son empreinte est moitié moindre —
// 2 821 Mo contre 6 434 sur un extrait court, 3 946 contre 8 335 sur 178 s.
//
// ET CE QU'IL FAUT METTRE EN FACE. Il est TROIS FOIS PLUS LENT : facteur de temps réel 0,059 contre
// 0,018 sur 178 s. Et sur ce même long témoin il laisse tomber une occurrence de phrase sur
// soixante-quatre — trente et un « salle vide » au lieu de trente-deux — là où Parakeet est exact.
// Aucun des deux ne domine : le court et net pour celui-ci, le long et le rapide pour l'autre.
//
// IL NE REND PAS D'INSTANTS PAR MOT, ET C'EST UN CHOIX MESURÉ. Sa fiche annonce la capacité, mais
// elle passe par l'ALIGNEUR QWEN3 lancé après la transcription — celui que le dépôt livre déjà pour
// « Aligner un texte sur la parole ». Mesuré : ses instants et ceux de l'aligneur sont identiques À
// L'ÉCHANTILLON, écart exactement nul sur quinze mots. Les demander coûterait donc un second modèle
// de 1 129 969 856 octets pour un résultat que le dépôt sait déjà composer, en branchant la sortie
// de ce composant sur l'entrée de l'aligneur. De surcroît l'horodatage impose
// `audio_chunk_mode=none`, qui bute sur « Qwen3 audio encoder token count exceeds
// max_source_positions » dès qu'un fichier est long.
//
// DEUX NOMS D'OPTION NE S'ACCORDENT PAS ENTRE LA FICHE ET LE BINAIRE : la fiche annonce
// `forced_aligner_path`, le binaire exige `qwen3_asr.forced_aligner_model_path`. Noté ici pour qui
// voudrait ajouter l'horodatage un jour.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE = "qwen3-asr-0.6b-q8_0.gguf";

function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Transcrit un enregistrement.
 *
 * `options.audio` est un WAV complet, en octets, à n'importe quelle cadence. Rend le texte seul :
 * les instants par mot sont le travail de « Dater les mots », pour la raison écrite en tête.
 */
async function transcrire(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-qwen3asr-"));
  try {
    // CE QUI NE DEMANDE RIEN SE VÉRIFIE D'ABORD : un refus d'entrée doit se prononcer que le
    // giga-octet de poids soit sur le disque ou non. L'ordre inverse a fait tomber l'intégration
    // continue sur le pont d'Apollo, où aucun modèle n'est présent.
    if (!options.audio || options.audio.length === 0) {
      return { ok: false, journal: "Brancher un son sur l'entrée « Audio »." };
    }
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    const texte = path.join(travail, "texte.txt");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "asr", "--family", "qwen3_asr", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--text-out", texte, "--metrics",
    ];
    // LE DÉCOUPAGE RESTE CELUI DU MOTEUR, et ce n'est pas un oubli : `auto` et `fixed` rendent le
    // même texte au jeton près sur le témoin de 178 s, et `none` bute sur la limite d'encodeur dès
    // qu'un fichier est long. Il n'y a donc rien à offrir qui change quelque chose.

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0) return { ok: false, journal };

    return {
      ok: true,
      texte: fs.existsSync(texte) ? fs.readFileSync(texte, "utf8").trim() : "",
      releves: relevesDuJournal(journal),
      journal,
    };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { transcrire, cheminModele };
