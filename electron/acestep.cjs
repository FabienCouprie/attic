// electron/acestep.cjs — Appel des exécutables d'acestep.cpp : la chanson se planifie, puis se rend.
//
// DEUX EXÉCUTABLES, DEUX TEMPS, ET C'EST POURQUOI IL Y A DEUX NŒUDS. `ace-lm` écrit les paroles,
// les métadonnées et les codes audio dans une requête enrichie ; `ace-synth` rend l'audio depuis
// cette requête. Les séparer laisse corriger les paroles entre les deux, et rendre plusieurs fois
// le même plan sans le replanifier.
//
// LA REQUÊTE S'ÉCRIT SANS MARQUE D'ORDRE D'OCTETS. Le lecteur JSON du moteur refuse un fichier qui
// en porte une, et ne dit que « malformed JSON ». Relevé en mesurant, et c'est pourquoi l'écriture
// passe par un tampon explicite plutôt que par un encodage nommé.
const path = require("path");
const fs = require("fs");
const os = require("os");

const EXECUTABLES = { planifier: "ace-lm", rendre: "ace-synth" };

// LA RÉSOLUTION EST CELLE DU DÉPÔT, et non une recherche écrite ici. `resoudreRessource` regarde
// le dossier de l'utilisateur AVANT les ressources livrées : une application installée ne peut pas
// écrire dans « Program Files », donc les modèles téléchargés à la demande n'y sont jamais. Une
// seconde version de cette recherche aurait cherché les GGUF là où ils ne sont plus.
const { resoudreRessource } = require("./chemins-ressources.cjs");

// CE QUE CHAQUE TÂCHE RÉCLAME EST RELEVÉ À PART, et éprouvé à part : `acestep-plan.test.ts` tient
// la table des sept tâches du moteur et le calcul des plages, sans avoir besoin du binaire.
const { appliquerTache, requetePlanification } = require("./acestep-plan.cjs");
const { lancerTravail } = require("./travaux.cjs");

function cheminBinaire(quoi, contexte) {
  const nom = EXECUTABLES[quoi] + (process.platform === "win32" ? ".exe" : "");
  const trouve = resoudreRessource(path.join("bin", "acestep", nom), contexte);
  return trouve && fs.existsSync(trouve) ? trouve : nom;
}

/** Les GGUF, téléchargés à la demande ou livrés : `resoudreRessource` sait les deux. */
function dossierModeles(contexte) {
  return resoudreRessource("acestep", contexte) ?? path.resolve(__dirname, "..", "public", "acestep");
}

function dossierTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "attic-acestep-"));
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

const ecrireJson = (chemin, objet) =>
  fs.writeFileSync(chemin, Buffer.from(JSON.stringify(objet, null, 2), "utf8"));

/**
 * Lance un exécutable et rend sa sortie, en versant l'avancement au fur et à mesure.
 *
 * LE JOURNAL EST LU LIGNE À LIGNE, et non à la fin : un rendu de cinq minutes de musique dure deux
 * minutes, et un nœud muet pendant ce temps-là passe pour un gel. Le moteur écrit « [DiT] Step 3/8 »
 * et « [VAE] Tiled decode », ce qui suffit à dire où l'on en est.
 */
function lancer(binaire, args, surLigne) {
  // LE LANCEUR VIT DANS `travaux.cjs`, QUI INSCRIT L'ENFANT AU REGISTRE. Ce corps était recopié
  // ici et dans l'autre module, mot pour mot ; deux copies auraient divergé sur l'inscription, et
  // un travail non inscrit est un travail qu'« Arrêter » ne peut pas tuer.
  return lancerTravail(binaire, args, surLigne);
}

/**
 * Le premier fichier produit par le rendu, quel que soit son suffixe.
 *
 * LES AUDIO REÇUS SONT ÉCRITS DANS UN SOUS-DOSSIER, et c'est ce qui rend cette recherche sûre.
 * Une reprise et une retouche reçoivent un audio source ; posé à côté du rendu, il serait trouvé
 * ici — et le nœud aurait rendu son entrée inchangée, ce qui ressemble exactement à un modèle qui
 * n'a rien fait. Le filtre ne retient que des noms de fichier audio, donc `entrees/` est exclu.
 */
function sortieAudio(dossier) {
  const audio = fs.readdirSync(dossier).filter((f) => /\.(wav|mp3)$/i.test(f)).sort();
  return audio.length > 0 ? path.join(dossier, audio[0]) : null;
}

/** Les deux audio que le moteur ne lit qu'en ligne de commande, jamais dans la requête. */
const FICHIERS_AUDIO = [
  ["audioSource", "source.wav", "--src-audio"],
  ["audioTimbre", "timbre.wav", "--ref-audio"],
];

/** Écrit les audio reçus dans `entrees/` et rend les drapeaux qui les désignent. */
function drapeauxAudio(options, travail) {
  const presents = FICHIERS_AUDIO.filter(([champ]) => options[champ]);
  if (presents.length === 0) return [];
  const entrees = path.join(travail, "entrees");
  fs.mkdirSync(entrees, { recursive: true });
  const args = [];
  for (const [champ, nom, drapeau] of presents) {
    const chemin = path.join(entrees, nom);
    fs.writeFileSync(chemin, Buffer.from(options[champ]));
    args.push(drapeau, chemin);
  }
  return args;
}

async function planifier(options = {}, surAvancement, contexte) {
  const travail = dossierTemp();
  try {
    const requete = path.join(travail, "requete.json");
    ecrireJson(requete, requetePlanification(options));
    const args = ["--models", dossierModeles(contexte), "--request", requete];
    if (options.peripherique) args.push("--device", options.peripherique);
    const { code, journal } = await lancer(cheminBinaire("planifier", contexte), args, surAvancement);
    const plan = path.join(travail, "requete0.json");
    if (code !== 0 || !fs.existsSync(plan)) return { ok: false, journal };
    return { ok: true, plan: fs.readFileSync(plan, "utf8"), journal };
  } finally {
    nettoyer(travail);
  }
}

async function rendre(options = {}, surAvancement, contexte) {
  const travail = dossierTemp();
  try {
    const requete = path.join(travail, "plan0.json");
    let plan;
    try {
      plan = JSON.parse(options.plan);
    } catch {
      return { ok: false, journal: "Le plan reçu n'est pas un JSON lisible." };
    }
    if (options.pas) plan.inference_steps = options.pas;
    if (options.shift) plan.shift = options.shift;
    // LES PAROLES REÇUES REMPLACENT CELLES DU PLAN, et rien d'autre n'est touché : le reste du
    // plan — forme, tempo, tonalité, codes — est ce que le planificateur a décidé, et on ne
    // corrige ici que le texte chanté.
    if (typeof options.paroles === "string" && options.paroles.trim()) plan.lyrics = options.paroles;

    // CE QUE LA TÂCHE RÉCLAME SE REFUSE AVANT DE CHARGER LE MODÈLE. Mesuré : le moteur ne
    // s'aperçoit qu'il manque un audio source qu'après avoir chargé deux gigaoctets de poids, et
    // refuse alors en anglais. `acestep-plan.cjs` porte le relevé de ses exigences et refuse en
    // français ce qui se sait d'avance.
    const prepare = appliquerTache(plan, options);
    if (!prepare.ok) return { ok: false, journal: prepare.erreur };
    ecrireJson(requete, prepare.plan);

    const args = ["--models", dossierModeles(contexte), "--request", requete];
    if (options.peripherique) args.push("--device", options.peripherique);
    if (options.tuile) args.push("--vae-chunk", String(options.tuile));
    if (options.recouvrement) args.push("--vae-overlap", String(options.recouvrement));
    args.push(...drapeauxAudio(options, travail));
    const { code, journal } = await lancer(cheminBinaire("rendre", contexte), args, surAvancement);
    const audio = sortieAudio(travail);
    if (code !== 0 || !audio) return { ok: false, journal };
    return { ok: true, donnees: fs.readFileSync(audio), nom: path.basename(audio), journal };
  } finally {
    nettoyer(travail);
  }
}

module.exports = { planifier, rendre, cheminBinaire, dossierModeles, sortieAudio, drapeauxAudio };
