// electron/sdcpp.cjs — Appel de stable-diffusion.cpp pour tirer une image d'un texte, par MOSS-Image.
//
// UN SEUL EXÉCUTABLE, QUATRE FICHIERS DE MODÈLE. `sd-cli` porte toutes les familles d'images que
// stable-diffusion.cpp connaît ; celle qui sert ici est MOSS-Image d'OpenMOSS, dans sa version SFT :
// un transformeur de diffusion de cinq milliards de paramètres, l'encodeur de texte Qwen3.5 9B, le
// VAE de FLUX.2, et le tokeniseur d'OpenMOSS, que le moteur exige à part (`--tokenizer`) parce que
// le vocabulaire de Qwen3.5 n'est pas celui qu'il embarque.
//
// MESURÉ LE 2026-10-28 sur une RTX 2060 par Vulkan, 20 étapes, guidage 3 : 156 s en 512 × 512,
// 720 s en 1024 × 1024. Le temps est celui du calcul : poser le transformeur sur la carte et
// l'encodeur au processeur ne gagne rien sur l'échantillonnage.
//
// LE PROMPT PASSE PAR UN FICHIER, et c'est ce qui lui permet d'être un JSON de mise en page portant
// des accents. Écrit sur la ligne de commande, il traverserait l'encodage de Windows.
//
// « AUTOMATIQUE » NE PASSE RIEN : sd.cpp place lui-même les poids, et prend la carte discrète. Les
// autres choix se passent tels quels à `--backend`, sous les noms de `sd-cli --list-devices`.
//
// L'AVANCEMENT REMONTE ÉTAPE PAR ÉTAPE. La barre de sd.cpp avance par retour chariot seul, d'où le
// séparateur donné à `lancerTravail`, et seules les étapes de l'échantillonnage sont relayées.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { lancerTravail } = require("./travaux.cjs");

/** Les quatre fichiers, sous la racine `sdcpp`, chacun résolu pour lui-même. */
const FICHIERS = {
  diffusion: "moss-image-sft-q4_k.gguf",
  llm: "qwen3.5-9b-q4_k_m.gguf",
  vae: "flux2-vae.safetensors",
  tokenizer: "moss-image-tokenizer.json",
};

function cheminBinaire(contexte) {
  const nom = "sd-cli" + (process.platform === "win32" ? ".exe" : "");
  const trouve = resoudreRessource(path.join("bin", "sdcpp", nom), contexte);
  return trouve && fs.existsSync(trouve) ? trouve : nom;
}

/** Le chemin de chacun des quatre fichiers, téléchargés à la demande ou posés à la main. */
function cheminsModele(contexte) {
  const chemins = {};
  for (const [role, nom] of Object.entries(FICHIERS)) {
    chemins[role] = resoudreRessource(path.join("sdcpp", nom), contexte)
      ?? path.resolve(__dirname, "..", "public", "sdcpp", nom);
  }
  return chemins;
}

/** Les fichiers qui manquent, par leur nom : vide quand tout est là. */
function fichiersManquants(contexte) {
  const chemins = cheminsModele(contexte);
  return Object.entries(chemins).filter(([, c]) => !fs.existsSync(c)).map(([role]) => FICHIERS[role]);
}

/** Les arguments de `sd-cli`. Purs, pour être éprouvés sans lancer le moteur. */
function argumentsMoss({ modele, prompt, negatif, sortie, graine, etapes, guidage, largeur, hauteur, calcul }) {
  return [
    "--diffusion-model", modele.diffusion, "--llm", modele.llm,
    "--vae", modele.vae, "--tokenizer", modele.tokenizer,
    "--prompt-file", prompt,
    ...(negatif ? ["--negative-prompt-file", negatif] : []),
    "--steps", String(etapes), "--cfg-scale", String(guidage), "-s", String(graine),
    "-W", String(largeur), "-H", String(hauteur),
    ...(calcul ? ["--backend", calcul] : []),
    "-o", sortie,
  ];
}

/** L'étape d'échantillonnage qu'une ligne de la barre annonce, ou `null` pour toute autre ligne. */
function etapeDeLigne(ligne) {
  const m = /\|\s*(\d+)\/(\d+)\s*-\s*[\d.]+\s*(?:s\/it|it\/s)/.exec(ligne);
  return m ? { faite: Number(m[1]), total: Number(m[2]) } : null;
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Tire une image d'un texte, en PNG.
 *
 * `surAvancement` reçoit « 12/20 » à chaque étape. Rend `{ ok, png, journal }`.
 */
async function genererMoss(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-moss-"));
  try {
    const manquants = fichiersManquants(contexte);
    if (manquants.length > 0) return { ok: false, modeleAbsent: true, journal: `Modèle absent : ${manquants.join(", ")}` };
    const prompt = path.join(travail, "prompt.txt");
    fs.writeFileSync(prompt, String(options.prompt ?? ""), "utf8");
    let negatif = null;
    if (options.negatif) {
      negatif = path.join(travail, "negatif.txt");
      fs.writeFileSync(negatif, String(options.negatif), "utf8");
    }
    const sortie = path.join(travail, "image.png");
    const args = argumentsMoss({ ...options, modele: cheminsModele(contexte), prompt, negatif, sortie });
    const relayer = (ligne) => {
      const e = etapeDeLigne(ligne);
      if (e && surAvancement) surAvancement(`${e.faite}/${e.total}`);
    };
    const { code, journal } = await lancerTravail(cheminBinaire(contexte), args, relayer, { separateur: /\r\n|\r|\n/ });
    if (code !== 0 || !fs.existsSync(sortie)) return { ok: false, journal };
    return { ok: true, png: fs.readFileSync(sortie), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { genererMoss, argumentsMoss, etapeDeLigne, cheminBinaire, cheminsModele, fichiersManquants, FICHIERS };
