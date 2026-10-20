// electron/muscriptor.cjs — Appel d'audio.cpp pour transcrire un audio en MIDI.
//
// UN SEUL EXÉCUTABLE ET UN SEUL MODÈLE. `audiocpp_cli` porte cent vingt-cinq familles de modèles ;
// celle qui sert ici est `muscriptor`, et le GGUF embarque sa propre fiche de famille. Mesuré en
// le lançant depuis un dossier qui ne contenait que l'exécutable et ses bibliothèques : rien
// d'autre n'est nécessaire, et c'est pourquoi `scripts/outils-manifest.json` n'embarque pas les
// fiches.
//
// LE DOS DE CALCUL SE NOMME EN DEUX MORCEAUX, là où `acestep.cpp` n'en demandait qu'un :
// `--backend vulkan --device 1` et non `--device Vulkan1`. La traduction se fait ici, de sorte que
// le nœud garde les mêmes identifiants de réglage que les autres nœuds à périphérique.
//
// L'AVANCEMENT REMONTE LIGNE À LIGNE. Une minute de musique prend une dizaine de secondes sur une
// carte et près d'une minute sur un processeur ; un nœud muet pendant ce temps passe pour un gel.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const { resoudreRessource } = require("./chemins-ressources.cjs");

const MODELE = "muscriptor-small-f32.gguf";

/** Le nom du dos et l'index de carte, depuis l'identifiant de réglage du nœud. */
function dosEtCarte(calcul) {
  if (!calcul) return { backend: "best" };
  const m = /^([A-Za-z]+)(\d*)$/.exec(calcul);
  if (!m) return { backend: "best" };
  return { backend: m[1].toLowerCase(), device: m[2] === "" ? undefined : m[2] };
}

function cheminBinaire(contexte) {
  const nom = "audiocpp_cli" + (process.platform === "win32" ? ".exe" : "");
  const trouve = resoudreRessource(path.join("bin", "audiocpp", nom), contexte);
  return trouve && fs.existsSync(trouve) ? trouve : nom;
}

/** Le GGUF, téléchargé à la demande ou livré : `resoudreRessource` sait les deux. */
// LE FICHIER EST DEMANDÉ, ET NON SON DOSSIER. Demander « audiocpp » rend le PREMIER dossier de ce
// nom qui existe, et celui de l'utilisateur passe devant par construction : un dossier qui porte
// l'un des deux modèles de cette racine faisait désigner l'autre là où il n'est pas. Ce module n'en
// a jamais souffert, le sien y étant toujours arrivé le premier ; le cloneur de voix, si, et le
// défaut est le même ici.
function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/** Lance l'exécutable et rend sa sortie, en versant l'avancement au fur et à mesure. */
function lancer(binaire, args, surLigne) {
  return new Promise((resoudre) => {
    const enfant = spawn(binaire, args, { windowsHide: true });
    let journal = "";
    let reste = "";
    const avaler = (donnees) => {
      journal += donnees;
      reste += donnees;
      const lignes = reste.split(/\r?\n/);
      reste = lignes.pop() ?? "";
      for (const l of lignes) if (l.trim() && surLigne) surLigne(l.trim());
    };
    enfant.stdout.setEncoding("utf8");
    enfant.stderr.setEncoding("utf8");
    enfant.stdout.on("data", avaler);
    enfant.stderr.on("data", avaler);
    enfant.on("error", (e) => resoudre({ code: -1, journal: `${journal}\n${e.message}` }));
    enfant.on("close", (code) => resoudre({ code, journal }));
  });
}

/** Le facteur de temps réel que le moteur a mesuré lui-même, lu dans son journal. */
function relevesDuJournal(journal) {
  const nombre = (cle) => {
    const m = new RegExp(`metrics\\.${cle}=([0-9.]+)`).exec(journal);
    return m ? Number(m[1]) : null;
  };
  return { murMs: nombre("wall_ms"), rtf: nombre("rtf"), residentMo: nombre("memory\\.peak_rss_mb") };
}

/**
 * Transcrit un WAV en MIDI.
 *
 * `options.audio` est un WAV complet, en octets. `options.instruments` est la liste de groupes
 * d'instruments que le moteur accepte, séparés par des virgules ; vide, il les cherche tous.
 */
async function transcrire(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-muscriptor-"));
  try {
    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    const midi = path.join(travail, "sortie.mid");
    const evenements = path.join(travail, "sortie.json");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "midi", "--family", "muscriptor", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--out", midi, "--text-out", evenements, "--metrics",
    ];
    if (options.instruments) args.push("--request-option", `instruments=${options.instruments}`);
    if (options.maxJetons) args.push("--max-tokens", String(options.maxJetons));

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0 || !fs.existsSync(midi)) return { ok: false, journal };
    return {
      ok: true,
      midi: fs.readFileSync(midi),
      evenements: fs.existsSync(evenements) ? fs.readFileSync(evenements, "utf8") : "",
      releves: relevesDuJournal(journal),
      journal,
    };
  } finally {
    nettoyer(travail);
  }
}

// `lancer` SORT D'ICI POUR `chatterbox.cjs`, qui emploie le même exécutable sur une autre famille.
// Deux copies de la lecture ligne à ligne du journal auraient fini par diverger.
module.exports = { transcrire, cheminBinaire, cheminModele, dosEtCarte, lancer, relevesDuJournal };
