// electron/chatterbox.cjs — Appel d'audio.cpp pour cloner une voix depuis un extrait.
//
// LE MÊME EXÉCUTABLE QUE LA TRANSCRIPTION MIDI, une autre famille. `audiocpp_cli` porte cent
// vingt-cinq familles ; celle-ci est `chatterbox`, et la tâche est `clon`. Le dos de calcul se
// nomme en deux morceaux, `--backend vulkan --device 1`, et la traduction se fait dans
// `muscriptor.cjs`, dont ce module reprend `dosEtCarte` plutôt que de l'écrire deux fois.
//
// IL N'A PAS DE VOIX À LUI, et c'est la première chose que la mesure a dite : une synthèse sans
// référence est refusée par « Chatterbox prepare requires speaker reference audio ». Ce n'est pas
// un synthétiseur à voix prédéfinies mais un cloneur, d'où une référence toujours exigée.
//
// LE BON DRAPEAU EST `--voice-ref`, ET IL A FALLU LE TROUVER. `--target-voice`, `--style-ref` et
// `--audio` existent tous les trois et sont tous les trois refusés par cette famille, avec le
// même message. Un drapeau qui existe n'est pas un drapeau qui sert.
//
// LA TRANSCRIPTION DE L'EXTRAIT EST FACULTATIVE, ce qui n'allait pas de soi : l'autre cloneur du
// même moteur, `omnivoice`, la REFUSE absente, contrairement à sa documentation. Ici le rendu sort
// sans elle ; `--reference-text` reste offert parce que le moteur l'accepte.
//
// MESURÉ SUR UNE RTX 2060, paquet q8 : facteur de temps réel 1,29 à 1,90 selon la longueur, pic de
// 3 668 MiB de mémoire de carte sur les 6 144 disponibles, sortie en 24 kHz mono.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE = "chatterbox-q8_0.gguf";

/**
 * Le GGUF, téléchargé à la demande ou livré : `resoudreRessource` sait les deux.
 *
 * LE FICHIER EST DEMANDÉ, ET NON SON DOSSIER, et c'est tout le sujet. Demander « audiocpp » rend
 * le PREMIER dossier de ce nom qui existe, et le dossier inscriptible de l'utilisateur passe
 * devant par construction : celui de Fabien ne contenait que le transcripteur MIDI, de sorte que
 * le chemin composé désignait un modèle qui n'y était pas, et le nœud répondait « Modèle absent »
 * alors que le fichier était bien livré sous `public/`. Un dossier qui existe n'est pas un
 * fichier qui existe.
 */
function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Clone une voix : dit `options.texte` avec le timbre de `options.voix`.
 *
 * `options.voix` est un WAV complet, en octets. `options.langue` est un code que le moteur reçoit
 * tel quel ; vide, il décide seul. `options.transcription` est le texte de l'extrait, facultatif.
 */
async function cloner(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-chatterbox-"));
  try {
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };
    if (!options.voix) return { ok: false, journal: "Brancher un audio de référence sur l'entrée « Voix »." };
    const texte = typeof options.texte === "string" ? options.texte.trim() : "";
    if (!texte) return { ok: false, journal: "Donner le texte à dire." };

    // LA RÉFÉRENCE VA DANS UN SOUS-DOSSIER, pour la même raison que l'audio source d'ACE-Step :
    // la sortie est cherchée par son nom dans le dossier de travail, et une entrée posée à côté
    // pourrait être prise pour elle.
    const entrees = path.join(travail, "entrees");
    fs.mkdirSync(entrees, { recursive: true });
    const reference = path.join(entrees, "voix.wav");
    fs.writeFileSync(reference, Buffer.from(options.voix));
    const sortie = path.join(travail, "clone.wav");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "clon", "--family", "chatterbox", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--voice-ref", reference, "--text", texte, "--out", sortie, "--metrics",
    ];
    if (options.langue) args.push("--language", options.langue);
    if (options.transcription) args.push("--reference-text", options.transcription);

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0 || !fs.existsSync(sortie)) return { ok: false, journal };
    return { ok: true, donnees: fs.readFileSync(sortie), releves: relevesDuJournal(journal), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { cloner, cheminModele };
