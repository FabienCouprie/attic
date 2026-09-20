// scripts/download-music-collection.cjs — Récupère la collection musicale de démonstration.
//
// POURQUOI CE SCRIPT
//
// Le dossier « music collection » est embarqué dans l'installeur (extraResources de
// package.json) : c'est lui qu'ouvrent par défaut le Lecteur de musique, la Carte
// sonore, l'Explorateur de musique et les exercices de formation. Mais il est ignoré
// par git — 75 Mo d'audio n'ont pas leur place dans l'historique. Depuis que les
// releases sont construites par le workflow à partir d'un checkout propre, le dossier
// n'existait donc plus au moment du packaging, et electron-builder s'est contenté d'un
// avertissement (« file source doesn't exist ») : les installeurs 3.x sont partis sans
// lui, avec un job vert.
//
// Il est désormais publié comme `music-collection.zip` sur la release `assets`, et le
// MANIFESTE versionné à côté de ce script (nom, taille, SHA-256 de chaque fichier) dit
// ce qu'il doit contenir. Le manifeste est la référence : une archive périmée ou
// tronquée est refusée, comme un fichier manquant.
//
// USAGE
//   node scripts/download-music-collection.cjs          récupère ce qui manque, vérifie tout
//   node scripts/download-music-collection.cjs --pack <archive.zip>
//        (mainteneur) regénère le manifeste depuis le dossier local et produit
//        l'archive à téléverser sur la release `assets`.
//
// Un fichier local qui DIFFÈRE du manifeste n'est jamais écrasé : c'est peut-être une
// modification voulue de la collection. Le script échoue et dit quoi faire.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, "music collection");
const MANIFESTE = path.join(__dirname, "music-collection.manifest.json");
const URL_ARCHIVE = "https://github.com/FabienCouprie/attic/releases/download/assets/music-collection.zip";

const sha256 = (octets) => crypto.createHash("sha256").update(octets).digest("hex");

function lireManifeste(chemin = MANIFESTE) {
  const m = JSON.parse(fs.readFileSync(chemin, "utf8"));
  if (!Array.isArray(m.fichiers) || m.fichiers.length === 0) {
    throw new Error(`Manifeste vide ou illisible : ${chemin}`);
  }
  return m;
}

/** Compare un dossier au manifeste. Les fichiers en trop sont signalés, pas considérés comme une faute. */
function comparerAuManifeste(dossier, manifeste) {
  const manquants = [], differents = [];
  for (const f of manifeste.fichiers) {
    const chemin = path.join(dossier, f.nom);
    if (!fs.existsSync(chemin)) { manquants.push(f.nom); continue; }
    const taille = fs.statSync(chemin).size;
    if (taille !== f.octets || sha256(fs.readFileSync(chemin)) !== f.sha256) differents.push(f.nom);
  }
  const attendus = new Set(manifeste.fichiers.map((f) => f.nom));
  const enTrop = fs.existsSync(dossier)
    ? fs.readdirSync(dossier).filter((n) => fs.statSync(path.join(dossier, n)).isFile() && !attendus.has(n))
    : [];
  return { manquants, differents, enTrop };
}

/** Écrit, depuis l'archive, les fichiers manquants — chacun vérifié contre le manifeste AVANT écriture. */
function extraireManquants(archiveOctets, dossier, manifeste, manquants) {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(archiveOctets);
  const parNom = new Map(manifeste.fichiers.map((f) => [f.nom, f]));
  fs.mkdirSync(dossier, { recursive: true });
  for (const nom of manquants) {
    const entree = zip.getEntry(nom);
    if (!entree) throw new Error(`L'archive ne contient pas « ${nom} » : elle est plus ancienne que le manifeste.`);
    const octets = entree.getData();
    const attendu = parNom.get(nom);
    if (octets.length !== attendu.octets || sha256(octets) !== attendu.sha256) {
      throw new Error(`« ${nom} » dans l'archive ne correspond pas au manifeste (archive périmée ou corrompue). Rien n'a été écrit pour ce fichier.`);
    }
    fs.writeFileSync(path.join(dossier, nom), octets);
  }
}

function empaqueter(cheminArchive) {
  const AdmZip = require("adm-zip");
  const noms = fs.readdirSync(DOSSIER)
    .filter((n) => fs.statSync(path.join(DOSSIER, n)).isFile())
    .sort((a, b) => a.localeCompare(b));
  if (noms.length === 0) throw new Error(`Aucun fichier dans ${DOSSIER}`);
  const zip = new AdmZip();
  const fichiers = noms.map((nom) => {
    const octets = fs.readFileSync(path.join(DOSSIER, nom));
    zip.addFile(nom, octets);
    return { nom, octets: octets.length, sha256: sha256(octets) };
  });
  zip.writeZip(cheminArchive);
  fs.writeFileSync(MANIFESTE, JSON.stringify({ archive: URL_ARCHIVE, fichiers }, null, 2) + "\n", "utf8");
  const mo = (fichiers.reduce((s, f) => s + f.octets, 0) / 1e6).toFixed(1);
  console.log(`[music-collection] ${fichiers.length} fichiers (${mo} Mo) → ${cheminArchive}`);
  console.log("[music-collection] Manifeste regénéré. Téléversez l'archive sur la release `assets`, puis versionnez le manifeste :");
  console.log(`  gh release upload assets "${cheminArchive}" --clobber`);
}

async function recuperer() {
  const manifeste = lireManifeste();
  const avant = comparerAuManifeste(DOSSIER, manifeste);
  if (avant.differents.length) {
    throw new Error(
      `Fichier(s) local(aux) différent(s) du manifeste : ${avant.differents.join(", ")}.\n` +
      "Ils ne sont pas écrasés. Si la collection a été modifiée volontairement, lancez « --pack » " +
      "pour regénérer le manifeste et l'archive, puis téléversez l'archive.",
    );
  }
  if (avant.enTrop.length) {
    console.warn(`[music-collection] Hors manifeste, non embarqué par la release : ${avant.enTrop.join(", ")}`);
  }
  if (avant.manquants.length === 0) {
    console.log(`[music-collection] ${manifeste.fichiers.length} fichiers présents et conformes.`);
    return;
  }
  console.log(`[music-collection] ${avant.manquants.length} fichier(s) manquant(s), téléchargement de l'archive…`);
  const res = await fetch(manifeste.archive || URL_ARCHIVE, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${manifeste.archive || URL_ARCHIVE}`);
  extraireManquants(Buffer.from(await res.arrayBuffer()), DOSSIER, manifeste, avant.manquants);
  const apres = comparerAuManifeste(DOSSIER, manifeste);
  if (apres.manquants.length || apres.differents.length) {
    throw new Error(`Collection toujours incomplète : ${[...apres.manquants, ...apres.differents].join(", ")}`);
  }
  console.log(`[music-collection] ${manifeste.fichiers.length} fichiers présents et conformes.`);
}

module.exports = { lireManifeste, comparerAuManifeste, extraireManquants };

if (require.main === module) {
  const i = process.argv.indexOf("--pack");
  const tache = i >= 0
    ? Promise.resolve().then(() => {
        const cible = process.argv[i + 1];
        if (!cible) throw new Error("--pack attend le chemin de l'archive à produire.");
        empaqueter(path.resolve(cible));
      })
    : recuperer();
  tache.catch((e) => {
    console.error(`[music-collection] ÉCHEC : ${e.message}`);
    process.exit(1);
  });
}
