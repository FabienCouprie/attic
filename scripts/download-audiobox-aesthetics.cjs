// scripts/download-audiobox-aesthetics.cjs — Récupère le modèle Audiobox Aesthetics dans public/oonx/.
//
// Modèle des nœuds « Score esthétique » et « Comparaison esthétique » : WavLM Base et quatre
// têtes (Meta, poids CC-BY 4.0, noté dans THIRD_PARTY.md), exporté en ONNX FP32 par
// scripts/export-audiobox-aesthetics.py, 420 Mo. Il n'est pas dans git ; il est publié sur la
// release `assets` et embarqué dans l'installeur depuis public/oonx (extraResources).
//
// Pas dans le postinstall : 420 Mo à chaque `npm install` pour deux nœuds, c'est trop. Le
// workflow de release le lance explicitement, en bloquant ; en développement, la commande est
// rappelée par le message d'erreur du nœud.
//
// L'EMPREINTE N'EST PAS DÉCORATIVE : on télécharge un modèle qui sera exécuté. Le fichier est
// écrit à côté, vérifié, puis seulement renommé : un téléchargement interrompu ou un fichier
// remplacé sur la release ne laisse jamais un modèle faux à la place attendue.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const DEST_DIR = path.join(__dirname, "..", "public", "oonx");
const NOM = "audiobox-aesthetics.onnx";
const URL_MODELE = `https://github.com/FabienCouprie/attic/releases/download/assets/${NOM}`;
const SHA256 = "29ccb5c46b7805abdc80a329442fa65048f8b9ef0c4d334e2ff9415d4d4c33af";
const OCTETS = 420187384;

async function empreinteFichier(chemin) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(chemin), hash);
  return hash.digest("hex");
}

async function conforme(chemin) {
  if (!fs.existsSync(chemin) || fs.statSync(chemin).size !== OCTETS) return false;
  return (await empreinteFichier(chemin)) === SHA256;
}

async function main() {
  const cible = path.join(DEST_DIR, NOM);
  if (await conforme(cible)) {
    console.log("[audiobox-aesthetics] modèle présent et conforme.");
    return;
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const partiel = `${cible}.partiel`;
  console.log(`[audiobox-aesthetics] téléchargement de ${(OCTETS / 1e6).toFixed(0)} Mo depuis la release « assets »…`);
  const res = await fetch(URL_MODELE, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} sur ${URL_MODELE}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(partiel));
  const taille = fs.statSync(partiel).size;
  const obtenue = await empreinteFichier(partiel);
  if (taille !== OCTETS || obtenue !== SHA256) {
    fs.rmSync(partiel, { force: true });
    throw new Error(
      `Fichier refusé : ${taille} octets, empreinte ${obtenue}\n` +
      `  attendu : ${OCTETS} octets, empreinte ${SHA256}\nLe modèle n'a PAS été installé.`,
    );
  }
  fs.renameSync(partiel, cible);
  console.log("[audiobox-aesthetics] modèle installé, empreinte vérifiée.");
}

module.exports = { SHA256, OCTETS, NOM };

if (require.main === module) {
  main().catch((e) => {
    console.error(`[audiobox-aesthetics] ÉCHEC : ${e.message}`);
    console.error("[audiobox-aesthetics] Les nœuds « Score esthétique » et « Comparaison esthétique » ne fonctionneront pas.");
    process.exit(1);
  });
}
