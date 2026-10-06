#!/usr/bin/env node
"use strict";

// scripts/download-vosk-models.cjs — Les modèles Vosk, depuis la release.
//
// POURQUOI UNE CONVERSION. `vosk-browser` ne sait déplier qu'une archive `.tar.gz`, là où
// alphacephei publie des `.zip`. La conversion a donc lieu UNE FOIS, à l'amorçage, et c'est
// l'archive convertie qui part sur la release : le nœud n'a jamais à connaître ni l'un ni l'autre
// format amont, et l'application ne dépend que d'une adresse que nous maîtrisons.
//
// TOUS LES ASSETS VIENNENT DE LA RELEASE GITHUB, comme pour les deux autres reconnaissances
// vocales. L'amont ne sert qu'à fabriquer l'archive avant sa première publication, et il faut le
// demander par `--amorcer` : il n'y a aucun repli silencieux. La règle est tenue par
// `src/plugins/provenance-modeles.test.ts`, qui refuse qu'une source de composant nomme un tiers.
//
// DEUX PETITS MODÈLES, ET C'EST UN CHOIX. Vosk en publie de grands — 1,45 Go pour le français,
// 1,82 Go pour l'anglais — qui ne sont pas embarquables. Les petits pèsent quarante mégaoctets
// chacun, soit moins que l'un des deux modèles Whisper déjà livrés, et c'est précisément ce qui
// rend Vosk intéressant à côté d'eux.
//
// USAGE
//   node scripts/download-vosk-models.cjs              depuis la release
//   node scripts/download-vosk-models.cjs --tolerant   n'échoue pas : pour le postinstall
//   node scripts/download-vosk-models.cjs --amorcer    depuis l'amont, et convertit

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const RACINE = path.resolve(__dirname, "..");
const DOSSIER = path.join(RACINE, "public", "oonx");
const MANIFESTE = path.join(__dirname, "modeles-manifest.json");

/** Les modèles, leur fichier livré, et où l'amont les tient — pour `--amorcer` seulement. */
const MODELES = {
  "vosk-fr": {
    nom: "vosk-model-small-fr-0.22",
    noeud: "vosk-asr",
    amont: "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip",
  },
  "vosk-en": {
    nom: "vosk-model-small-en-us-0.15",
    noeud: "vosk-asr",
    amont: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
  },
};

const mo = (octets) => (octets / 1048576).toFixed(1);
const fichierDe = (m) => path.join(DOSSIER, `${m.nom}.tar.gz`);
const sha256 = (octets) => crypto.createHash("sha256").update(octets).digest("hex");

/** L'entrée du manifeste, qui décide de ce qui est attendu. */
function entreeDuManifeste(id) {
  const m = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  return (m.modeles || []).find((x) => x.id === id) ?? null;
}

/** Présent veut dire : le fichier existe et fait exactement la taille annoncée. */
function present(id, modele) {
  const cible = fichierDe(modele);
  if (!fs.existsSync(cible)) return false;
  const entree = entreeDuManifeste(id);
  if (!entree) return true; // pas encore au manifeste : l'amorçage a suffi
  return fs.statSync(cible).size === entree.octets;
}

async function depuisRelease(id, modele) {
  const entree = entreeDuManifeste(id);
  if (!entree || !entree.source || !entree.source.url) {
    throw new Error(`pas encore d'adresse publiée. « node scripts/modeles.cjs --publier ${id} »`);
  }
  const source = entree.source;
  console.log(`[vosk] ${modele.nom} : ${mo(source.octets)} Mo depuis la release « assets »…`);
  const rep = await fetch(source.url, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${source.url}`);
  const octets = Buffer.from(await rep.arrayBuffer());
  if (octets.length !== source.octets) {
    throw new Error(`${octets.length} octets au lieu de ${source.octets}. Rien n'est écrit.`);
  }
  if (sha256(octets) !== source.sha256) throw new Error("empreinte non conforme. Rien n'est écrit.");
  fs.mkdirSync(DOSSIER, { recursive: true });
  const cible = fichierDe(modele);
  const partiel = `${cible}.partiel`;
  fs.writeFileSync(partiel, octets);
  fs.renameSync(partiel, cible);
  console.log(`[vosk] ${modele.nom} : posé, empreinte vérifiée.`);
}

/**
 * L'amorçage, et c'est la SEULE porte vers l'amont.
 *
 * Il prend le `.zip` d'alphacephei et le réécrit en `.tar.gz`, seul format que la bibliothèque sait
 * déplier. L'archive porte le dossier du modèle à sa racine, comme l'amont le fait.
 */
async function amorcer(modele) {
  const tar = require("tar");
  const AdmZip = require("adm-zip");
  console.log(`[vosk] ${modele.nom} : AMORÇAGE depuis ${modele.amont}`);
  const rep = await fetch(modele.amont, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${modele.amont}`);
  const octets = Buffer.from(await rep.arrayBuffer());
  console.log(`[vosk]   reçu ${mo(octets.length)} Mo`);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "vosk-"));
  try {
    const zip = new AdmZip(octets);
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      // Une entrée d'archive ne décide pas des chemins qu'on écrit : pas de remontée.
      if (/(^|[\\/])\.\.([\\/]|$)/.test(e.entryName) || path.isAbsolute(e.entryName)) {
        throw new Error(`entrée refusée dans l'archive amont : ${e.entryName}`);
      }
      const cible = path.join(travail, ...e.entryName.split("/"));
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.writeFileSync(cible, e.getData());
    }
    fs.mkdirSync(DOSSIER, { recursive: true });
    await tar.create({ gzip: true, cwd: travail, file: fichierDe(modele) }, [modele.nom]);
    console.log(`[vosk]   écrit ${modele.nom}.tar.gz — ${mo(fs.statSync(fichierDe(modele)).size)} Mo`);
  } finally {
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const tolerant = args.includes("--tolerant");
  const amorce = args.includes("--amorcer");
  let echec = null;
  for (const [id, modele] of Object.entries(MODELES)) {
    try {
      if (present(id, modele)) {
        console.log(`[vosk] ${modele.nom} : présent et conforme.`);
        continue;
      }
      if (amorce) await amorcer(modele);
      else await depuisRelease(id, modele);
    } catch (e) {
      echec = e;
      console.error(`[vosk] ${modele.nom} ÉCHEC : ${e.message}`);
      console.error(`[vosk] Le nœud « ${modele.noeud} » ne disposera pas de ce modèle.`);
    }
  }
  if (echec && !tolerant) process.exit(1);
}

module.exports = { MODELES, fichierDe, present };

if (require.main === module) main();
