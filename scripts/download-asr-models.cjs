#!/usr/bin/env node
"use strict";

// scripts/download-asr-models.cjs — Les deux modèles de reconnaissance vocale, depuis la release.
//
// POURQUOI CE SCRIPT. Les nœuds `whisper-en` et `sherpa-asr` chargeaient leurs modèles depuis
// HuggingFace à l'exécution. Trois conséquences, les mêmes que pour les points de contrôle Magenta :
// une installation SANS RÉSEAU ne pouvait employer ni l'un ni l'autre ; rien ne vérifiait
// l'intégrité de ce qui arrivait, ces modèles étant absents de `modeles-manifest.json` ; et ils
// venaient d'un tiers, contre la règle du dépôt.
//
// TOUS LES ASSETS VIENNENT DE LA RELEASE GITHUB. C'est une adresse que nous maîtrisons, dont
// l'empreinte est versionnée, et qui ne dépend pas de la disponibilité d'un tiers. La liste des
// fichiers attendus est lue DANS LE MANIFESTE et non dans l'index du dépôt amont : interroger
// HuggingFace pour savoir quoi prendre sur GitHub remettrait ce tiers sur le chemin par défaut.
// L'amont ne sert qu'à fabriquer l'archive avant sa première publication, et il faut le demander
// par `--amorcer` : il n'y a aucun repli silencieux.
//
// CE QUI EST MIROITÉ, et rien de plus :
//   sherpa-asr-whisper-tiny — l'encodeur et le décodeur int8 que la configuration du nœud nomme,
//                             et la table de jetons ;
//   whisper-base-en         — les deux ONNX en fp32 que le worker demande explicitement par son
//                             `dtype`, la configuration, le préprocesseur et le tokeniseur.
// Les variantes quantifiées du dépôt amont de Whisper ne sont jamais chargées par l'application :
// les prendre reviendrait à embarquer deux fois le même modèle.
//
// L'EMPREINTE N'EST PAS DÉCORATIVE : on télécharge des poids qui seront exécutés. Chaque fichier
// déplié est pesé contre le manifeste, et une archive de la mauvaise taille est refusée avant
// d'écrire quoi que ce soit — ce qui couvre le téléchargement interrompu, qui laisserait un modèle
// tronqué et un nœud qui échoue sans dire pourquoi.
//
// USAGE
//   node scripts/download-asr-models.cjs              depuis la release, les deux paquets
//   node scripts/download-asr-models.cjs --tolerant   n'échoue pas : pour le postinstall
//   node scripts/download-asr-models.cjs --amorcer    depuis l'amont, avant la première publication

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RACINE = path.resolve(__dirname, "..");
const PUBLIC = path.join(RACINE, "public");
const MANIFESTE = path.join(__dirname, "modeles-manifest.json");

/** Les deux paquets, et où l'amont les tient — pour `--amorcer` seulement. */
const PAQUETS = {
  "sherpa-asr-whisper-tiny": {
    noeud: "sherpa-asr",
    amont: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main",
    // L'amont n'a pas de sous-dossier : le nom du fichier suffit.
    amontDe: (relatif) => relatif.split("/").pop(),
  },
  "whisper-base-en": {
    noeud: "whisper-en",
    amont: "https://huggingface.co/Xenova/whisper-base.en/resolve/main",
    amontDe: (relatif) => relatif,
  },
};

const mo = (octets) => (octets / 1048576).toFixed(1);

/** Le manifeste décide de ce qui est attendu : son empreinte est versionnée, pas celle d'un tiers. */
function entreeDuManifeste(id) {
  const m = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  const e = (m.modeles || []).find((x) => x.id === id);
  if (!e) throw new Error(`${id} est absent de modeles-manifest.json`);
  return e;
}

const sha256 = (octets) => crypto.createHash("sha256").update(octets).digest("hex");

/** Ce qui manque ou ne fait pas la taille annoncée. */
function manquants(entree) {
  return entree.fichiers.filter((f) => {
    const complet = path.join(PUBLIC, ...f.chemin.split("/"));
    return !fs.existsSync(complet) || fs.statSync(complet).size !== f.octets;
  });
}

/** Pose un fichier après l'avoir pesé et empreint. Jamais à la place attendue avant d'être validé. */
function poser(cheminRelatif, donnees, attendu) {
  if (donnees.length !== attendu.octets) {
    throw new Error(`${cheminRelatif} : ${donnees.length} octets au lieu de ${attendu.octets}.`);
  }
  const obtenue = sha256(donnees);
  if (obtenue !== attendu.sha256) {
    throw new Error(`${cheminRelatif} : empreinte ${obtenue}, attendue ${attendu.sha256}.`);
  }
  const complet = path.join(PUBLIC, ...cheminRelatif.split("/"));
  fs.mkdirSync(path.dirname(complet), { recursive: true });
  const partiel = `${complet}.partiel`;
  fs.writeFileSync(partiel, donnees);
  fs.renameSync(partiel, complet);
}

/**
 * Déplie l'archive de la release. Chaque entrée est posée nous-mêmes, jamais `extractAllTo` : une
 * archive décide alors des chemins qu'elle écrit, et une entrée nommée `../` sortirait du dossier.
 */
async function depuisRelease(id, entree) {
  const source = entree.source;
  if (!source || !source.url) {
    throw new Error(`${id} n'a pas encore d'adresse publiée. « node scripts/modeles.cjs --publier ${id} »`);
  }
  console.log(`[asr] ${id} : ${mo(source.octets)} Mo depuis la release « assets »…`);
  const rep = await fetch(source.url, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${source.url}`);
  const octets = Buffer.from(await rep.arrayBuffer());
  if (source.octets && octets.length !== source.octets) {
    throw new Error(`archive de ${octets.length} octets au lieu de ${source.octets}. Rien n'est écrit.`);
  }
  if (source.sha256 && sha256(octets) !== source.sha256) {
    throw new Error("empreinte de l'archive non conforme. Rien n'est écrit.");
  }
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(octets);
  // L'archive est relative à la racine du modèle : ses entrées commencent par le dossier du paquet,
  // et le manifeste porte le chemin complet, racine comprise.
  const attendus = new Map(entree.fichiers.map((f) => [f.chemin.split("/").slice(1).join("/"), f]));
  let poses = 0;
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const nom = e.entryName.replace(/\\/g, "/");
    const attendu = attendus.get(nom);
    if (!attendu) continue;
    const complet = path.join(PUBLIC, ...attendu.chemin.split("/"));
    if (fs.existsSync(complet) && fs.statSync(complet).size === attendu.octets) continue;
    poser(attendu.chemin, e.getData(), attendu);
    poses++;
  }
  const reste = manquants(entree);
  if (reste.length) throw new Error(`toujours incomplet : ${reste.map((f) => f.chemin).join(", ")}`);
  console.log(`[asr] ${id} : ${poses} fichier(s) posé(s), empreintes vérifiées.`);
}

/**
 * L'amorçage, et c'est la SEULE porte vers l'amont.
 *
 * Il sert une fois, pour fabriquer l'archive avant sa première publication. Ensuite la release
 * suffit, et ce chemin ne doit plus être pris : d'où le drapeau explicite, et l'absence de tout
 * repli automatique quand la release échoue.
 */
async function amorcer(id, entree) {
  const paquet = PAQUETS[id];
  console.log(`[asr] ${id} : AMORÇAGE depuis l'amont ${paquet.amont}`);
  for (const f of entree.fichiers) {
    const relatif = f.chemin.split("/").slice(2).join("/");
    const url = `${paquet.amont}/${paquet.amontDe(relatif)}`;
    const rep = await fetch(url, { redirect: "follow" });
    if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${url}`);
    poser(f.chemin, Buffer.from(await rep.arrayBuffer()), f);
    console.log(`[asr]   ${relatif} — ${mo(f.octets)} Mo`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const tolerant = args.includes("--tolerant");
  const amorce = args.includes("--amorcer");
  let echec = null;
  for (const id of Object.keys(PAQUETS)) {
    try {
      const entree = entreeDuManifeste(id);
      if (manquants(entree).length === 0) {
        console.log(`[asr] ${id} : présent et conforme (${mo(entree.octets)} Mo).`);
        continue;
      }
      if (amorce) await amorcer(id, entree);
      else await depuisRelease(id, entree);
    } catch (e) {
      echec = e;
      console.error(`[asr] ${id} ÉCHEC : ${e.message}`);
      console.error(`[asr] Le nœud « ${PAQUETS[id].noeud} » ne fonctionnera pas.`);
    }
  }
  if (echec && !tolerant) process.exit(1);
}

module.exports = { PAQUETS, manquants, entreeDuManifeste };

if (require.main === module) main();
