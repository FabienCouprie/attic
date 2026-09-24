#!/usr/bin/env node
"use strict";

// scripts/download-kokoro.cjs — Le miroir local du modèle Kokoro 82M.
//
// POURQUOI CE SCRIPT. Deux composants de synthèse vocale, l'anglais `tts-kokoro` et le français
// `tts-francais`, reposent sur le même modèle, tiré de HuggingFace au premier usage. Tant qu'il
// n'est nulle part en local, chaque exécution et chaque test dépendent du réseau : un chargement à
// froid coûte une trentaine de secondes, et une panne d'accès ressemble à une panne du composant.
// Ce script pose le dépôt dans `public/oonx/`, d'où la machinerie commune le prend en charge :
// `modeles.cjs --generer` l'inscrit au manifeste avec l'empreinte de chaque fichier, `--publier`
// l'envoie sur la release `assets`, et l'application sait dès lors le retélécharger et le vérifier.
//
// TOUS LES ASSETS VIENNENT DE LA RELEASE GITHUB. C'est une adresse que nous maîtrisons, dont
// l'empreinte est versionnée, et qui ne dépend pas de la disponibilité d'un tiers. La liste des
// fichiers attendus est lue dans le manifeste et non dans l'index du dépôt amont : interroger
// HuggingFace pour savoir quoi prendre sur GitHub remettrait ce tiers sur le chemin par défaut.
// L'amont ne sert qu'à fabriquer l'archive avant sa première publication, et il faut le demander
// par `--amorcer` : il n'y a aucun repli silencieux.
//
// CE QUI EST MIROITÉ, et rien de plus :
//   le modèle quantifié `onnx/model_quantized.onnx`, seul poids que demande `dtype: "q8"` ;
//   la configuration et le tokeniseur, quelques centaines d'octets ;
//   les voix, toutes, parce qu'ouvrir une langue de plus ne doit pas demander un nouveau
//   téléversement.
// Les autres exports du dépôt, fp32, fp16, q4 et leurs variantes, ne sont jamais chargés par
// l'application : les prendre reviendrait à embarquer plusieurs fois le même modèle.
//
// CE SCRIPT NE TOUCHE PAS À L'INSTALLEUR. Le dossier est exclu de l'empaquetage, comme SDXS et
// Stable Audio 3 : l'installeur reste sous son plafond et l'application installée continue de
// prendre le modèle sur le réseau, ou de le télécharger depuis le manifeste.
//
// USAGE
//   node scripts/download-kokoro.cjs              récupère ce qui manque, depuis la release
//   node scripts/download-kokoro.cjs --tolerant   idem, mais une panne réseau n'échoue pas
//   node scripts/download-kokoro.cjs --verifier   dit ce qui manque, sans rien télécharger
//   node scripts/download-kokoro.cjs --amorcer    (mainteneur) fabrique le miroir depuis l'amont,
//                                                 avant la première publication

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DOSSIER = path.join(RACINE, "public", "oonx", "kokoro-82m", ...MODEL_ID.split("/"));
const API = `https://huggingface.co/api/models/${MODEL_ID}?blobs=true`;
const BRUT = `https://huggingface.co/${MODEL_ID}/resolve/main`;

/** Le seul poids que l'application charge, plus ce qu'il faut pour tokeniser, plus les voix. */
const POIDS = "onnx/model_quantized.onnx";
const retenu = (nom) => nom === POIDS || nom.startsWith("voices/") || /^[a-z_]+\.json$/.test(nom);

const mo = (octets) => (octets / 1048576).toFixed(1);

/** La liste amont, avec la taille de chaque fichier : c'est elle qui dit ce qui est complet. */
async function listeAmont() {
  const rep = await fetch(API, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur l'index du dépôt`);
  const json = await rep.json();
  const fichiers = (json.siblings || [])
    .filter((s) => typeof s.size === "number" && retenu(s.rfilename))
    .map((s) => ({ nom: s.rfilename, octets: s.size }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  if (!fichiers.some((f) => f.nom === POIDS)) {
    throw new Error(`Le dépôt ne porte plus « ${POIDS} » : la liste amont a changé de forme.`);
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
function manquants(fichiers) {
  return fichiers.filter((f) => {
    const complet = path.join(DOSSIER, ...f.nom.split("/"));
    if (!fs.existsSync(complet)) return true;
    return fs.statSync(complet).size !== f.octets;
  });
}

async function recuperer(fichiers, aPrendre) {
  for (const [i, f] of aPrendre.entries()) {
    const complet = path.join(DOSSIER, ...f.nom.split("/"));
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    const rep = await fetch(`${BRUT}/${f.nom}`, { redirect: "follow" });
    if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${f.nom}`);
    const octets = Buffer.from(await rep.arrayBuffer());
    if (octets.length !== f.octets) {
      throw new Error(`${f.nom} : ${octets.length} octets reçus au lieu de ${f.octets}. Rien n'est écrit.`);
    }
    // Écrit à côté puis renommé : un fichier partiel ne doit jamais porter le nom définitif, sinon
    // la reprise le prendrait pour un fichier complet.
    const provisoire = `${complet}.partiel`;
    fs.writeFileSync(provisoire, octets);
    fs.renameSync(provisoire, complet);
    console.log(`[kokoro] ${String(i + 1).padStart(2)}/${aPrendre.length} ${f.nom} (${mo(f.octets)} Mo)`);
  }
  const reste = manquants(fichiers);
  if (reste.length) throw new Error(`Toujours incomplet : ${reste.map((f) => f.nom).join(", ")}`);
}

/**
 * L'adresse publiée du modèle, si le manifeste en porte une.
 *
 * GITHUB EST LE POINT DE TÉLÉCHARGEMENT dès que l'archive y est : c'est une adresse que nous
 * maîtrisons, dont l'empreinte est versionnée, et qui ne dépend pas de la disponibilité d'un tiers.
 * L'amont HuggingFace ne sert qu'au premier amorçage, quand il n'y a encore rien à télécharger
 * depuis la release.
 */
function adressePubliee() {
  try {
    const m = require("./modeles-manifest.json");
    const entree = (m.modeles || []).find((x) => x.id === "kokoro-82m");
    return entree && entree.source && entree.source.url ? entree.source : null;
  } catch {
    return null;
  }
}

/** Déplie l'archive de la release. Chaque entrée est posée nous-mêmes, jamais `extractAllTo`. */
async function depuisArchive(source, fichiers, dossier = DOSSIER, chercher = fetch) {
  const rep = await chercher(source.url, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${source.url}`);
  const octets = Buffer.from(await rep.arrayBuffer());
  if (source.octets && octets.length !== source.octets) {
    throw new Error(`archive de ${octets.length} octets au lieu de ${source.octets}. Rien n'est écrit.`);
  }
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(octets);
  const attendus = new Map(fichiers.map((f) => [f.nom, f.octets]));
  // Ce que l'archive porte, distinct de ce qu'il a fallu écrire : une archive qui porte tout alors
  // que tout est déjà en place est un succès, pas une archive vide.
  const vus = new Set();
  let poses = 0;
  for (const entree of zip.getEntries()) {
    if (entree.isDirectory) continue;
    // Le nom porté par l'archive est relatif au dossier du modèle.
    const nom = entree.entryName.replace(/^.*Kokoro-82M-v1\.0-ONNX\//, "").replace(/\\/g, "/");
    if (!attendus.has(nom)) continue;
    vus.add(nom);
    const complet = path.join(dossier, ...nom.split("/"));
    // Déjà là et de la bonne taille : on ne réécrit pas cent mégaoctets pour rien.
    if (fs.existsSync(complet) && fs.statSync(complet).size === attendus.get(nom)) continue;
    const donnees = entree.getData();
    if (donnees.length !== attendus.get(nom)) {
      throw new Error(`${nom} : ${donnees.length} octets dans l'archive au lieu de ${attendus.get(nom)}.`);
    }
    fs.mkdirSync(path.dirname(complet), { recursive: true });
    fs.writeFileSync(complet, donnees);
    poses++;
  }
  if (vus.size === 0) throw new Error("l'archive ne portait aucun des fichiers attendus.");
  console.log(`[kokoro] ${poses} fichier(s) dépliés depuis la release, ${vus.size} portés par l'archive.`);
}

/**
 * La liste attendue, lue dans le manifeste.
 *
 * C'EST ELLE QUI FAIT AUTORITÉ, et non l'index du dépôt amont : elle est versionnée, elle porte
 * l'empreinte de chaque fichier, et la consulter ne demande aucun réseau. Interroger HuggingFace
 * pour savoir ce qu'il faut télécharger depuis GitHub remettrait un tiers sur le chemin par défaut.
 */
function listeManifeste() {
  const m = require("./modeles-manifest.json");
  const entree = (m.modeles || []).find((x) => x.id === "kokoro-82m");
  if (!entree) return null;
  const prefixe = `oonx/kokoro-82m/${MODEL_ID}/`;
  const fichiers = entree.fichiers
    .filter((f) => f.chemin.startsWith(prefixe))
    .map((f) => ({ nom: f.chemin.slice(prefixe.length), octets: f.octets }));
  return fichiers.length ? fichiers : null;
}

async function principal() {
  const tolerant = process.argv.includes("--tolerant");
  const seulementVerifier = process.argv.includes("--verifier");
  const amorcer = process.argv.includes("--amorcer");

  // TOUS LES ASSETS VIENNENT DE LA RELEASE. L'amont HuggingFace ne sert qu'à fabriquer l'archive
  // avant sa première publication, et il faut le demander : aucun repli silencieux vers un tiers.
  const publiee = amorcer ? null : adressePubliee();
  if (!amorcer && !publiee) {
    throw new Error("kokoro-82m n'a pas d'adresse dans le manifeste. Amorcez-le avec « --amorcer », "
      + "puis « node scripts/modeles.cjs --generer » et « --publier kokoro-82m ».");
  }

  let fichiers;
  try {
    fichiers = amorcer ? await listeAmont() : listeManifeste();
  } catch (e) {
    if (tolerant) {
      console.warn(`[kokoro] index inaccessible (${e.message}) ; le modèle sera pris au premier usage.`);
      return;
    }
    throw e;
  }
  if (!fichiers) throw new Error("le manifeste ne décrit aucun fichier pour kokoro-82m.");

  const total = fichiers.reduce((s, f) => s + f.octets, 0);
  const aPrendre = manquants(fichiers);
  if (aPrendre.length === 0) {
    console.log(`[kokoro] ${fichiers.length} fichiers présents (${mo(total)} Mo).`);
    return;
  }
  const poidsManquant = aPrendre.reduce((s, f) => s + f.octets, 0);
  if (seulementVerifier) {
    console.log(`[kokoro] ${aPrendre.length} fichier(s) manquant(s) sur ${fichiers.length} (${mo(poidsManquant)} Mo).`);
    process.exitCode = 1;
    return;
  }

  console.log(`[kokoro] ${aPrendre.length} fichier(s) à prendre (${mo(poidsManquant)} Mo) → ${path.relative(RACINE, DOSSIER)}`);
  console.log(publiee ? `[kokoro] depuis la release : ${publiee.url}` : "[kokoro] amorçage depuis le dépôt amont.");
  try {
    if (publiee) {
      await depuisArchive(publiee, fichiers);
      const reste = manquants(fichiers);
      if (reste.length) throw new Error(`Toujours incomplet : ${reste.map((f) => f.nom).join(", ")}`);
    } else {
      await recuperer(fichiers, aPrendre);
    }
  } catch (e) {
    if (tolerant) {
      console.warn(`[kokoro] téléchargement incomplet (${e.message}) ; le modèle sera pris au premier usage.`);
      return;
    }
    throw e;
  }
  console.log(`[kokoro] ${fichiers.length} fichiers présents (${mo(total)} Mo).`);
  if (amorcer) console.log("[kokoro] Inscrivez-le au manifeste : node scripts/modeles.cjs --generer");
}

module.exports = { MODEL_ID, DOSSIER, POIDS, retenu, manquants, depuisArchive, adressePubliee };

if (require.main === module) {
  principal().catch((e) => {
    console.error(`[kokoro] ÉCHEC : ${e.message}`);
    process.exit(1);
  });
}
