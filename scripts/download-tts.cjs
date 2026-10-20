#!/usr/bin/env node
"use strict";

// scripts/download-tts.cjs — Le miroir local des deux synthèses vocales Transformers.js.
//
// POURQUOI CE SCRIPT. « Synthèse vocale (SpeechT5) » et « Synthèse vocale multilingue (MMS) »
// tiraient leurs poids de HuggingFace à CHAQUE première exécution, et ne figuraient nulle part au
// manifeste : ni déclarés, ni annoncés. Une installation hors réseau échouait en silence, et la
// règle du dépôt, que tout modèle vienne de la release `assets` sans repli sur un tiers, était
// contournée sans que rien ne le dise. Le garde qui apparie les nœuds du manifeste à ceux qui
// annoncent leur téléchargement ne pouvait pas l'attraper : ils n'étaient dans aucune des deux
// listes.
//
// TROIS LANGUES ÉTAIENT DÉJÀ MORTES quand ce miroir a été fait, et personne ne pouvait le savoir :
// `Xenova/mms-tts-ita`, `-nld` et `-pol` répondent 401 là où les sept autres répondent 200. Un
// dépôt tiers qui disparaît emporte une option de la liste déroulante sans prévenir. C'est la
// seconde raison d'être de ce miroir, au moins autant que la première.
//
// CE QUI EST MIROITÉ, et rien de plus. Transformers.js demande du `fp32`, donc seuls les graphes
// non suffixés sont pris : les variantes `fp16`, `quantized`, `q4f16` et leurs parentes ne sont
// jamais chargées par l'application, et les prendre reviendrait à embarquer plusieurs fois le même
// modèle. Le chargeur de SpeechT5 prend l'encodeur, le décodeur FUSIONNÉ et le postnet ; ni
// `decoder_model.onnx` ni `decoder_with_past_model.onnx`, qui sont les deux moitiés de ce que le
// fusionné porte seul.
//
// LES VOIX VIENNENT D'UN DÉPÔT DE JEU DE DONNÉES, et non d'un dépôt de modèle : leur point d'accès
// est `api/datasets/…` et non `api/models/…`. Sept vecteurs de 512 flottants, deux kilo-octets
// chacun, qui ne pèsent rien et sans lesquels SpeechT5 n'a aucune voix.
//
// TOUS LES ASSETS VIENNENT DE LA RELEASE GITHUB une fois la première publication faite. L'amont ne
// sert qu'à fabriquer le miroir, et il faut le demander par `--amorcer` : il n'y a aucun repli
// silencieux.
//
// USAGE
//   node scripts/download-tts.cjs              récupère ce qui manque, depuis la release
//   node scripts/download-tts.cjs --tolerant   idem, mais une panne réseau n'échoue pas
//   node scripts/download-tts.cjs --verifier   dit ce qui manque, sans rien télécharger
//   node scripts/download-tts.cjs --amorcer    (mainteneur) fabrique le miroir depuis l'amont,
//                                              avant la première publication

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");

/** Les graphes que le chargeur de SpeechT5 ouvre réellement, en `dtype: "fp32"`. */
const GRAPHES_SPEECHT5 = [
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged.onnx",
  "onnx/decoder_postnet_and_vocoder.onnx",
];

/** Les sept locuteurs de CMU Arctic, tels que le composant les nomme. */
const VOIX = ["bdl", "slt", "clb", "rms", "jmk", "awb", "ksp"]
  .map((v) => `cmu_us_${v}_arctic-wav-arctic_a0001.bin`);

/** Les sept langues dont le dépôt amont répond encore. Trois autres ont disparu, voir l'en-tête. */
const LANGUES_MMS = ["eng", "fra", "spa", "deu", "por", "ron", "rus"];

const estConfig = (nom) => /^[a-z_]+\.json$/.test(nom);

/**
 * Les deux paquets, chacun une racine de `public/oonx/` et une liste de dépôts amont.
 *
 * Un paquet par composant : prendre les sept langues de MMS pour employer SpeechT5 ferait
 * télécharger sept cent soixante mégaoctets pour rien.
 */
const PAQUETS = {
  "tts-speecht5": {
    id: "tts-speecht5",
    depots: [
      { sorte: "models", nom: "Xenova/speecht5_tts", retenu: (f) => GRAPHES_SPEECHT5.includes(f) || estConfig(f) },
      { sorte: "models", nom: "Xenova/speecht5_hifigan", retenu: (f) => f === "onnx/model.onnx" || estConfig(f) },
      { sorte: "datasets", nom: "Xenova/cmu-arctic-xvectors-extracted", retenu: (f) => VOIX.includes(f) },
    ],
  },
  "tts-mms": {
    id: "tts-mms",
    depots: LANGUES_MMS.map((l) => ({
      sorte: "models",
      nom: `Xenova/mms-tts-${l}`,
      retenu: (f) => f === "onnx/model.onnx" || estConfig(f),
    })),
  },
};

const mo = (octets) => (octets / 1048576).toFixed(1);

/**
 * Un `fetch` qui abandonne plutôt que de rester suspendu.
 *
 * SANS CELA, UNE REQUÊTE QUI NE RÉPOND PLUS BLOQUE POUR TOUJOURS, sans un mot. Vu en fabriquant ce
 * miroir : la septième langue n'a jamais commencé, le processus restait vivant, et rien ne disait
 * s'il travaillait ou s'il attendait. Un téléchargement qui échoue est réparable ; un qui se tait
 * ne l'est pas.
 */
async function chercher(url, secondes = 120) {
  const minuteur = AbortSignal.timeout(secondes * 1000);
  return fetch(url, { redirect: "follow", signal: minuteur });
}
const dossierDe = (racine, depot) => path.join(RACINE, "public", "oonx", racine, ...depot.nom.split("/"));

/** La liste amont d'un dépôt, avec la taille de chaque fichier retenu. */
async function listeAmont(depot) {
  const api = `https://huggingface.co/api/${depot.sorte}/${depot.nom}?blobs=true`;
  const rep = await chercher(api, 60);
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur l'index de ${depot.nom}`);
  const json = await rep.json();
  const fichiers = (json.siblings || [])
    .filter((s) => typeof s.size === "number" && depot.retenu(s.rfilename))
    .map((s) => ({ nom: s.rfilename, octets: s.size }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  if (fichiers.length === 0) {
    throw new Error(`${depot.nom} ne porte plus rien de ce qu'on lui demande : sa forme a changé.`);
  }
  return fichiers;
}

/**
 * Ce qui manque, à la taille près.
 *
 * Un fichier présent mais de taille inattendue est repris : c'est le symptôme d'un téléchargement
 * interrompu, et un poids tronqué ne se voit qu'à l'exécution, sous la forme d'une erreur d'analyse
 * ONNX qui ne dit pas sa cause.
 */
function manquants(racine, depot, fichiers) {
  const base = dossierDe(racine, depot);
  return fichiers.filter((f) => {
    const complet = path.join(base, ...f.nom.split("/"));
    if (!fs.existsSync(complet)) return true;
    return fs.statSync(complet).size !== f.octets;
  });
}

async function recuperer(racine, depot, aPrendre) {
  const base = dossierDe(racine, depot);
  const brut = depot.sorte === "datasets"
    ? `https://huggingface.co/datasets/${depot.nom}/resolve/main`
    : `https://huggingface.co/${depot.nom}/resolve/main`;
  for (const [i, f] of aPrendre.entries()) {
    const complet = path.join(base, ...f.nom.split("/"));
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    const rep = await chercher(`${brut}/${f.nom}`, 300);
    if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${depot.nom}/${f.nom}`);
    const octets = Buffer.from(await rep.arrayBuffer());
    if (octets.length !== f.octets) {
      throw new Error(`${f.nom} : ${octets.length} octets reçus au lieu de ${f.octets}. Rien n'est écrit.`);
    }
    // Écrit à côté puis renommé : un fichier partiel ne doit jamais porter le nom définitif, sinon
    // la reprise le prendrait pour un fichier complet.
    const provisoire = `${complet}.partiel`;
    fs.writeFileSync(provisoire, octets);
    fs.renameSync(provisoire, complet);
    console.log(`[tts] ${String(i + 1).padStart(2)}/${aPrendre.length} ${depot.nom}/${f.nom} (${mo(f.octets)} Mo)`);
  }
}

async function amorcer(racines) {
  for (const racine of racines) {
    const paquet = PAQUETS[racine];
    let total = 0;
    for (const depot of paquet.depots) {
      const fichiers = await listeAmont(depot);
      const aPrendre = manquants(racine, depot, fichiers);
      total += fichiers.reduce((s, f) => s + f.octets, 0);
      if (aPrendre.length === 0) { console.log(`[tts] ${depot.nom} : déjà complet`); continue; }
      await recuperer(racine, depot, aPrendre);
      const reste = manquants(racine, depot, fichiers);
      if (reste.length) throw new Error(`${depot.nom} toujours incomplet : ${reste.map((f) => f.nom).join(", ")}`);
    }
    console.log(`[tts] ${racine} : miroir complet, ${mo(total)} Mo`);
  }
}

function verifier(racines) {
  let ecarts = 0;
  for (const racine of racines) {
    for (const depot of PAQUETS[racine].depots) {
      const base = dossierDe(racine, depot);
      if (!fs.existsSync(base)) { console.log(`  ABSENT  ${racine}/${depot.nom}`); ecarts++; continue; }
      console.log(`  présent ${racine}/${depot.nom}`);
    }
  }
  return ecarts;
}

async function principal() {
  const args = process.argv.slice(2);
  const racines = Object.keys(PAQUETS);
  if (args.includes("--verifier")) {
    process.exit(verifier(racines) === 0 ? 0 : 1);
  }
  if (args.includes("--amorcer")) {
    await amorcer(racines);
    return;
  }
  // Sans drapeau, le miroir se prend depuis la release par la machinerie commune du manifeste.
  console.log("[tts] Rien à faire ici : `node scripts/modeles.cjs --telecharger` prend les paquets");
  console.log("[tts] publiés depuis la release. `--amorcer` ne sert qu'avant la première publication.");
}

principal().catch((e) => {
  const tolerant = process.argv.includes("--tolerant");
  console.error(`[tts] ${e.message}`);
  process.exit(tolerant ? 0 : 1);
});
