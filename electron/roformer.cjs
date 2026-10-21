// electron/roformer.cjs — Appel d'audio.cpp pour séparer une voix de son accompagnement.
//
// LE MÊME EXÉCUTABLE QUE LES TROIS AUTRES, une quatrième famille : `mel_band_roformer`, tâche
// `sep`. Le dos de calcul se nomme en deux morceaux, et la traduction vient de `muscriptor.cjs`.
//
// IL REND PLUSIEURS FICHIERS, ET C'EST CE QUI LE DISTINGUE DES TROIS AUTRES. `--out` est refusé
// en clair, « --out requires exactly one audio output » : il faut `--out-dir`, où l'exécutable
// dépose une piste par source, nommée d'après elle. On lit donc un DOSSIER au retour, et non un
// fichier annoncé.
//
// QUARANTE-QUATRE MILLE CENT HERTZ SONT EXIGÉS, et c'est refusé net sinon : « RoFormer prepare()
// sample rate mismatch: expected 44100, got 48000 ». Les modèles musicaux de cette famille d'outils
// sont bâtis pour 44,1 quand le reste du dépôt travaille en 48. Le rééchantillonnage se fait dans
// le nœud, qui dispose du rééchantillonneur de la plateforme, et non ici où il faudrait l'écrire.
//
// LE PAQUET F16 ET NON LE Q8. Mesuré : le q8_0 rend deux pistes identiques, à −2,22 dB et 18 Hz de
// centroïde, c'est-à-dire du rebut, et l'exécutable sort pourtant en zéro. Le f16 rend deux
// signaux distincts. C'est pourquoi le nom du fichier est écrit ici plutôt que deviné.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");

const MODELE = "mel-band-roformer-f16.gguf";

/** Les deux pistes attendues, dans l'ordre où le nœud les rend. */
const PISTES = ["vocals", "instrumental"];

/** Le GGUF, téléchargé à la demande ou livré. Le FICHIER est demandé, jamais son dossier. */
function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Sépare un audio en voix et accompagnement.
 *
 * `options.audio` est un WAV complet, en octets, DÉJÀ À 44 100 HERTZ : ce module ne rééchantillonne
 * pas, il refuserait plutôt que de rendre un son faux sans le dire.
 */
async function separer(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-roformer-"));
  try {
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };
    if (!options.audio) return { ok: false, journal: "Brancher un audio sur l'entrée « Audio »." };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    // LES SORTIES VONT DANS UN SOUS-DOSSIER, pour la même raison que partout ailleurs ici : une
    // entrée posée à côté des sorties pourrait être prise pour l'une d'elles au retour.
    const sorties = path.join(travail, "sorties");
    fs.mkdirSync(sorties, { recursive: true });

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "sep", "--family", "mel_band_roformer", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--out-dir", sorties, "--metrics",
    ];

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0) return { ok: false, journal };

    const pistes = {};
    for (const nom of PISTES) {
      const chemin = path.join(sorties, `${nom}.wav`);
      if (!fs.existsSync(chemin)) return { ok: false, journal: `Piste « ${nom} » absente.\n${journal}` };
      pistes[nom] = fs.readFileSync(chemin);
    }
    return { ok: true, pistes, releves: relevesDuJournal(journal), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { separer, cheminModele, PISTES };
