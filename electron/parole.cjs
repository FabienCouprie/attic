// electron/parole.cjs — Qui parle quand, et où tombe chaque mot.
//
// DEUX TÂCHES, DEUX MODÈLES, UN SEUL EXÉCUTABLE : `audiocpp_cli`, celui que `muscriptor.cjs`
// lance déjà. Ce module en reprend la lecture de journal, la traduction du dos de calcul et la
// résolution du binaire plutôt que d'en écrire une seconde fois.
//
// LES DEUX MOTEURS COMPTENT LEURS ÉCHANTILLONS À SEIZE KILOHERTZ, QUOI QU'ON LEUR DONNE, et c'est
// le piège qui coûtait le plus cher à ne pas voir. Mesuré le 2026-10-22 sur un témoin fabriqué
// exprès — une phrase, deux secondes de silence, la même phrase — donné à 24 kHz : l'aligneur a
// rendu un dernier échantillon à 180 480, soit 7,520 s si on le divise par 24 000, pour un son qui
// dure 11,760 s. Divisé par 16 000 il donne 11,280 s, et le décalage entre les deux copies tombe
// alors sur 6,880 s, c'est-à-dire exactement la phrase plus le trou. La conversion est donc faite
// ICI, une fois, et les nœuds ne reçoivent que des secondes.
//
// LA DIARISATION N'ACCEPTE QUE DU SEIZE KILOHERTZ, et elle le dit elle-même : « MOSS-Transcribe-
// Diarize requires SOXR for non-16-kHz audio ». Le binaire publié n'embarque pas SOXR. L'aligneur,
// lui, rééchantillonne seul — vérifié sur le même témoin à 24 kHz, dont il a rendu les instants
// justes. D'où le garde sur l'en-tête du WAV plus bas : il refuse avant de lancer, avec une phrase
// qui dit quoi faire, là où le moteur refuserait avec la sienne après avoir chargé un giga-octet.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE_DIAR = "moss-transcribe-diarize-q4_k.gguf";
const MODELE_ALIGN = "qwen3-forced-aligner-0.6b-q8_0.gguf";

/** La cadence dans laquelle les deux moteurs rendent leurs indices d'échantillon. */
const CADENCE_MOTEUR = 16000;

/** La cadence que la diarisation exige en entrée, faute de SOXR dans le binaire publié. */
const CADENCE_EXIGEE = 16000;

/**
 * Le GGUF demandé, par son nom de fichier.
 *
 * LE FICHIER EST DEMANDÉ, ET NON SON DOSSIER, pour la raison écrite dans `muscriptor.cjs` : une
 * racine qui porte plusieurs modèles ferait désigner le premier trouvé là où il n'est pas.
 */
function cheminModele(nom, contexte) {
  return resoudreRessource(path.join("audiocpp", nom), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", nom);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * La cadence écrite dans l'en-tête d'un WAV, ou `null` si ces octets n'en sont pas un.
 *
 * LA FORME EST CHERCHÉE, NON UN NOM : « RIFF » en tête, « WAVE » au rang huit, puis le premier
 * morceau nommé « fmt », dont les octets 12 à 15 portent la cadence en petit-boutien. Un WAV dont
 * les morceaux arrivent dans un autre ordre est donc lu tout de même.
 */
function cadenceWav(octets) {
  const b = Buffer.from(octets);
  if (b.length < 44) return null;
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") return null;
  let position = 12;
  while (position + 8 <= b.length) {
    const nom = b.toString("ascii", position, position + 4);
    const taille = b.readUInt32LE(position + 4);
    if (nom === "fmt ") {
      return position + 12 <= b.length ? b.readUInt32LE(position + 12) : null;
    }
    position += 8 + taille + (taille % 2);
  }
  return null;
}

/** Les secondes d'un indice d'échantillon rendu par le moteur. */
function secondes(indice) {
  return Number(indice) / CADENCE_MOTEUR;
}

/** Un JSON de sortie, ou une liste vide : un moteur qui n'a rien trouvé n'écrit pas le fichier. */
function lireJson(chemin) {
  try {
    if (!fs.existsSync(chemin)) return [];
    const lu = JSON.parse(fs.readFileSync(chemin, "utf8"));
    return Array.isArray(lu) ? lu : [];
  } catch {
    return [];
  }
}

/** Le squelette commun aux deux tâches : un dossier de travail, le WAV, l'appel, le ménage. */
async function surUnWav(options, contexte, construire) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-parole-"));
  try {
    const { modele, args, apres, exigeCadence } = construire(travail);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const cadence = cadenceWav(options.audio);
    if (exigeCadence && cadence !== CADENCE_EXIGEE) {
      return {
        ok: false,
        journal: `Ce moteur n'accepte que du ${CADENCE_EXIGEE} Hz ; le son reçu est à `
          + `${cadence === null ? "une cadence illisible" : `${cadence} Hz`}.`,
      };
    }

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));

    const { backend, device } = dosEtCarte(options.calcul);
    const complets = [
      "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree,
      ...args,
      "--metrics",
    ];
    const { code, journal } = await lancer(cheminBinaire(contexte), complets, options.surAvancement);
    if (code !== 0) return { ok: false, journal };
    return { ok: true, ...apres(), releves: relevesDuJournal(journal), journal };
  } finally {
    nettoyer(travail);
  }
}

/**
 * Qui parle quand, et ce qui est dit.
 *
 * `options.audio` est un WAV mono à seize kilohertz, en octets. Le moteur rend des tours de
 * parole : un intervalle, un identifiant de locuteur, et le texte prononcé pendant ce tour.
 */
async function diariser(options = {}, surAvancement, contexte) {
  return surUnWav({ ...options, surAvancement }, contexte, (travail) => {
    const tours = path.join(travail, "tours.json");
    const args = [
      "--task", "asr", "--family", "moss_transcribe_diarize",
      "--turns-out", tours,
    ];
    // « --language » EST REFUSÉ PAR CE MOTEUR, qui n'accepte que `max_tokens` et `instruct` :
    // « unknown MOSS-Transcribe-Diarize request option: language ». Il reconnaît la langue seul,
    // sur plus de cinquante, et une option inconnue fait échouer l'appel entier.
    if (options.maxJetons) args.push("--max-tokens", String(options.maxJetons));
    if (options.consigne) args.push("--instruct", String(options.consigne));
    return {
      modele: cheminModele(MODELE_DIAR, contexte),
      args,
      exigeCadence: true,
      apres: () => ({
        tours: lireJson(tours).map((t) => ({
          debut: secondes(t.start_sample),
          fin: secondes(t.end_sample),
          locuteur: String(t.speaker_id ?? ""),
          texte: String(t.texte ?? t.text ?? ""),
        })),
      }),
    };
  });
}

/**
 * Où tombe chaque mot d'un texte qu'on sait prononcé.
 *
 * `options.texte` est la transcription, `options.langue` son code à deux lettres. Le moteur ne
 * reconnaît rien : il place un texte donné sur la parole, ce qui est plus juste qu'une
 * reconnaissance quand on connaît déjà les mots.
 */
async function aligner(options = {}, surAvancement, contexte) {
  const texte = String(options.texte ?? "").trim();
  if (!texte) return { ok: false, journal: "Aucun texte à aligner." };
  return surUnWav({ ...options, surAvancement }, contexte, (travail) => {
    const mots = path.join(travail, "mots.json");
    const args = [
      "--task", "align", "--family", "qwen3_forced_aligner",
      "--text", texte,
      "--words-out", mots,
    ];
    if (options.langue) args.push("--language", String(options.langue));
    return {
      modele: cheminModele(MODELE_ALIGN, contexte),
      args,
      exigeCadence: false,
      apres: () => ({
        mots: lireJson(mots).map((m) => ({
          debut: secondes(m.start_sample),
          fin: secondes(m.end_sample),
          mot: String(m.word ?? ""),
        })),
      }),
    };
  });
}

module.exports = { diariser, aligner, cadenceWav, secondes, CADENCE_MOTEUR, CADENCE_EXIGEE };
