// scripts/verify-bundled-resources.cjs — Vérifie les ressources embarquées dans l'installeur.
//
// electron-builder ne fait qu'AVERTIR quand la source d'un `extraResources` n'existe
// pas, et construit quand même. C'est ainsi que « music collection » a disparu des
// installeurs sans qu'aucun job n'échoue. Ce script transforme cet avertissement en
// échec, à deux moments :
//
//   node scripts/verify-bundled-resources.cjs
//        AVANT le packaging : chaque source existe et a un contenu utile. Un dossier ne
//        contenant qu'un `.gitkeep` ou un `README.md` compte comme vide — c'est l'état de
//        bin/songsee dans un checkout où le binaire n'a pas été récupéré.
//   node scripts/verify-bundled-resources.cjs --paquet release/win-unpacked/resources
//        APRÈS le packaging : chaque ressource est dans l'application construite, avec
//        autant de fichiers et d'octets que sa source.
//
// La liste vient de package.json : une ressource ajoutée à `build.extraResources` est
// couverte sans toucher à ce script.
"use strict";

const fs = require("fs");
const path = require("path");

const SANS_CONTENU = new Set([".gitkeep", "README.md"]);

/**
 * Fichiers d'un chemin (fichier ou dossier, récursif) : [{ relatif, octets }].
 * Les fichiers cachés sont ignorés : electron-builder ne les copie pas (le `.gitkeep`
 * de bin/songsee reste dans la source), et les compter ferait échouer une copie complète.
 */
function inventaire(chemin) {
  const st = fs.statSync(chemin);
  if (st.isFile()) return [{ relatif: path.basename(chemin), octets: st.size }];
  const liste = [];
  const parcourir = (dossier, prefixe) => {
    for (const nom of fs.readdirSync(dossier)) {
      if (nom.startsWith(".")) continue;
      const complet = path.join(dossier, nom);
      const s = fs.statSync(complet);
      if (s.isDirectory()) parcourir(complet, path.join(prefixe, nom));
      else liste.push({ relatif: path.join(prefixe, nom), octets: s.size });
    }
  };
  parcourir(chemin, "");
  return liste;
}

const total = (liste) => liste.reduce((s, f) => s + f.octets, 0);

/**
 * Le tri qu'electron-builder applique à une ressource, appliqué ici de même.
 *
 * POURQUOI LE RELIRE. Une ressource peut être embarquée SAUF un dossier — SDXS, 649 Mo, se
 * télécharge depuis la release au lieu de gonfler l'installeur. Sans cette lecture, la
 * vérification comparerait la source entière au paquet allégé et déclarerait manquant ce qu'on
 * vient de décider de ne pas embarquer.
 *
 * On ne lit que la forme employée ici — « **\/* » et des exclusions « !dossier/** » —, et l'on
 * refuse tout motif qu'on ne sait pas interpréter plutôt que de l'ignorer en silence.
 */
function retenu(relatif, filtre) {
  if (!Array.isArray(filtre)) return true;
  const chemin = relatif.split(path.sep).join("/");
  for (const motif of filtre) {
    if (motif === "**/*") continue;
    if (!motif.startsWith("!") || !motif.endsWith("/**")) {
      throw new Error(`Motif de filtre non pris en charge : ${motif}`);
    }
    const prefixe = motif.slice(1, -3) + "/";
    if (chemin.startsWith(prefixe)) return false;
  }
  return true;
}

function verifierSources(racine, extraResources) {
  const problemes = [];
  for (const { from, filter: filtre } of extraResources) {
    const source = path.join(racine, from);
    if (!fs.existsSync(source)) { problemes.push(`${from} : source absente`); continue; }
    const utiles = inventaire(source)
      .filter((f) => retenu(f.relatif, filtre))
      .filter((f) => !SANS_CONTENU.has(path.basename(f.relatif)) && f.octets > 0);
    if (utiles.length === 0) problemes.push(`${from} : source vide`);
  }
  return problemes;
}

function verifierPaquet(racine, extraResources, dossierRessources) {
  const problemes = [];
  for (const { from, to, filter: filtre } of extraResources) {
    const source = path.join(racine, from);
    const cible = path.join(dossierRessources, to || from);
    if (!fs.existsSync(cible)) { problemes.push(`${to || from} : absent de l'application construite`); continue; }
    if (!fs.existsSync(source)) { problemes.push(`${from} : source absente, impossible de comparer`); continue; }
    const s = inventaire(source).filter((f) => retenu(f.relatif, filtre)), c = inventaire(cible);
    if (s.length !== c.length || total(s) !== total(c)) {
      problemes.push(`${to || from} : ${c.length} fichier(s) / ${total(c)} octets dans l'application, ${s.length} / ${total(s)} dans la source`);
    }
  }
  return problemes;
}

module.exports = { verifierSources, verifierPaquet };

if (require.main === module) {
  const racine = path.join(__dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(racine, "package.json"), "utf8"));
  const ressources = pkg.build?.extraResources ?? [];
  const i = process.argv.indexOf("--paquet");
  const apres = i >= 0;
  const problemes = apres
    ? verifierPaquet(racine, ressources, path.resolve(racine, process.argv[i + 1] || "release/win-unpacked/resources"))
    : verifierSources(racine, ressources);
  const moment = apres ? "dans l'application construite" : "avant packaging";
  if (problemes.length) {
    console.error(`[ressources] ${problemes.length} problème(s) ${moment} :`);
    for (const p of problemes) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[ressources] ${ressources.length} ressource(s) embarquée(s) vérifiée(s) ${moment}.`);
}
