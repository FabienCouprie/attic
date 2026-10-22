// electron/apollo.cjs — La restauration d'un son abîmé par la compression.
//
// MÊME EXÉCUTABLE QUE LES AUTRES FAMILLES D'`audio.cpp`, et ce module reprend de `muscriptor.cjs`
// la résolution du binaire, la traduction du dos de calcul et la lecture du journal.
//
// QUARANTE-QUATRE MILLE CENT HERTZ, ET RIEN D'AUTRE. Le moteur refuse net toute autre cadence —
// « Apollo requires 44.1 kHz input audio » — et c'est la même exigence que le séparateur de voix
// de cette famille d'outils, qui travaille lui aussi en 44,1 kHz quand le reste du dépôt est en
// 48 000. Le composant descend donc le son avant de le passer et le ramène après ; le garde
// ci-dessous refuse avant de lancer, sur l'en-tête du WAV, plutôt que de laisser le moteur charger
// ses poids pour rien.
//
// CE QU'IL FAIT ET CE QU'IL NE FAIT PAS, mesuré le 2026-10-22 et écrit ici parce que la notice du
// composant en dépend. Sur un dommage de codec fabriqué — magnitudes quantifiées bande par bande,
// budget resserré vers l'aigu —, la distance log-spectrale à l'original passe de 0,4329 à 0,3389.
// Le témoin de contrôle est ce qui rend ce chiffre lisible : passer l'ORIGINAL par Apollo donne
// 0,3233, c'est-à-dire qu'il imprime sa propre couleur à n'importe quel signal. Du dommage au-dessus
// de ce plancher, il efface donc 86 %. En revanche IL N'ÉTEND PAS LA BANDE : sur une coupe franche
// à 8 kHz, il remet 0,0092 % de l'énergie là où 1,0837 % manquent. Ce n'est pas un extenseur de
// bande, c'est un réparateur d'artefacts.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");
const { cadenceWav } = require("./parole.cjs");

const MODELE = "apollo-orig.gguf";

/** La seule cadence que le moteur accepte. */
const CADENCE_EXIGEE = 44100;

function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Restaure un son abîmé par la compression.
 *
 * `options.audio` est un WAV à 44 100 Hz, en octets. `options.tranche` découpe les longs fichiers :
 * à zéro, le moteur traite le fichier entier d'un coup, ce que l'amont fait par défaut.
 */
async function restaurer(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-apollo-"));
  try {
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const cadence = cadenceWav(options.audio);
    if (cadence !== CADENCE_EXIGEE) {
      return {
        ok: false,
        journal: `Ce moteur n'accepte que du ${CADENCE_EXIGEE} Hz ; le son reçu est à `
          + `${cadence === null ? "une cadence illisible" : `${cadence} Hz`}.`,
      };
    }

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    const sortie = path.join(travail, "sortie.wav");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "s2s", "--family", "apollo", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--out", sortie, "--metrics",
    ];
    // LA TRANCHE SERT LES LONGS FICHIERS, et le recouvrement est son fondu : le moteur le plafonne
    // lui-même à la moitié de la tranche, donc le donner plus long ne ferait rien de plus.
    if (options.tranche > 0) {
      args.push("--request-option", `audio_chunk_duration_sec=${options.tranche}`);
      args.push("--request-option", `audio_chunk_overlap_sec=${Math.min(options.recouvrement ?? 1, options.tranche / 2)}`);
    }

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0 || !fs.existsSync(sortie)) return { ok: false, journal };
    return { ok: true, audio: fs.readFileSync(sortie), releves: relevesDuJournal(journal), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { restaurer, cheminModele, CADENCE_EXIGEE };
