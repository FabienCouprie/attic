#!/usr/bin/env node
"use strict";

// scripts/modeles.cjs — Le manifeste des modèles ONNX téléchargeables à la demande.
//
// POURQUOI UN MANIFESTE. L'installeur complet embarque 1,5 Go de modèles ONNX ; l'installeur
// allégé ne les embarque pas et les fait télécharger. Pour que le second sache QUOI télécharger,
// OÙ le prendre et COMMENT vérifier ce qu'il a reçu, il faut une liste — versionnée, lisible, et
// engendrée depuis les fichiers eux-mêmes plutôt que recopiée à la main.
//
// C'est le même procédé que `music-collection.manifest.json`, pour la même raison : une ressource
// absente ou tronquée doit se voir tout de suite, et non se manifester par un nœud qui ne marche
// pas sans dire pourquoi.
//
// TROIS FORMES DE SOURCE, parce que les modèles ne viennent pas tous du même endroit :
//
//   « fichier »  un fichier unique à son adresse amont ou sur la release `assets` ;
//   « archive »  un dossier de modèle, publié en un seul `.zip` — un asset de release ne peut pas
//                porter de sous-dossier dans son nom, et publier six fichiers séparés pour un même
//                modèle multiplierait les occasions d'en oublier un ;
//   « absente »  le modèle n'a pas encore d'adresse : `--publier` la lui donne.
//
// USAGE
//   node scripts/modeles.cjs --generer    engendre le manifeste depuis public/oonx/
//   node scripts/modeles.cjs --verifier   compare public/oonx/ au manifeste
//   node scripts/modeles.cjs --publier    téléverse ce qui n'a pas d'adresse sur la release `assets`

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const SOURCE = path.join(RACINE, "public", "oonx");
const MANIFESTE = path.join(__dirname, "modeles-manifest.json");
const RELEASE = "assets";
const BASE_RELEASE = "https://github.com/FabienCouprie/attic/releases/download/assets";

/**
 * Ce que le manifeste sait avant de regarder les fichiers.
 *
 * `stable-audio-3-small-music` n'y est pas : il n'est embarqué dans AUCUN installeur, il a déjà son
 * propre script de récupération, et l'ajouter ferait passer le téléchargement de 1,5 à 2,2 Go sans
 * que personne l'ait demandé.
 */
const CONNUS = {
  "gtcrn.onnx": {
    id: "gtcrn", nom: "Débruitage IA", nomEn: "AI denoise",
    noeuds: ["debruitage-ia"],
    url: "https://raw.githubusercontent.com/Xiaobin-Rong/gtcrn/main/stream/onnx_models/gtcrn.onnx",
  },
  "audiobox-aesthetics.onnx": {
    id: "audiobox-aesthetics", nom: "Score esthétique", nomEn: "Aesthetic score",
    noeuds: ["score-esthetique", "comparaison-esthetique"],
    url: `${BASE_RELEASE}/audiobox-aesthetics.onnx`,
  },
  "htdemucs_6s.onnx": {
    id: "htdemucs-6s", nom: "Séparation 6 pistes", nomEn: "6-stem separation",
    noeuds: ["separation-demucs"],
  },
  "htdemucs_fp16weights.onnx": {
    id: "htdemucs-fp16", nom: "Séparation (poids fp16)", nomEn: "Separation (fp16 weights)",
    noeuds: ["separation-demucs"],
  },
  "model_genre.onnx": {
    id: "genre", nom: "Classement par genre", nomEn: "Genre classifier",
    noeuds: ["genre-musical"],
  },
  "modele-separation.onnx": {
    id: "separation-mdx", nom: "Séparation voix/instrumental", nomEn: "Vocal/instrumental separation",
    noeuds: ["separation-voix"],
  },
  "sdxs-512-texte-image": {
    id: "sdxs-512", nom: "Texte → image", nomEn: "Text → image",
    noeuds: ["texte-image"], archive: true,
  },
};

const sha256 = (chemin) => {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(chemin));
  return h.digest("hex");
};

/** Les fichiers d'un dossier, récursivement, en chemins relatifs à `racine`. */
function fichiersDe(racine, prefixe = "") {
  const out = [];
  for (const nom of fs.readdirSync(path.join(racine, prefixe)).sort()) {
    if (nom.startsWith(".")) continue;
    const relatif = prefixe ? `${prefixe}/${nom}` : nom;
    const complet = path.join(racine, relatif);
    if (fs.statSync(complet).isDirectory()) out.push(...fichiersDe(racine, relatif));
    else out.push(relatif);
  }
  return out;
}

const mo = (octets) => (octets / 1048576).toFixed(1);

function engendrer() {
  const ancien = fs.existsSync(MANIFESTE) ? JSON.parse(fs.readFileSync(MANIFESTE, "utf8")) : { modeles: [] };
  const adressesConnues = new Map(ancien.modeles.map((m) => [m.id, m.source]));

  const modeles = [];
  for (const [entree, meta] of Object.entries(CONNUS)) {
    const complet = path.join(SOURCE, entree);
    if (!fs.existsSync(complet)) {
      console.log(`  ${entree} : absent de public/oonx/, ignoré`);
      continue;
    }
    const estDossier = fs.statSync(complet).isDirectory();
    const relatifs = estDossier
      ? fichiersDe(SOURCE, entree)
      : [entree];
    const fichiers = relatifs.map((r) => ({
      chemin: `oonx/${r}`,
      octets: fs.statSync(path.join(SOURCE, r)).size,
      sha256: sha256(path.join(SOURCE, r)),
    }));
    const octets = fichiers.reduce((s, f) => s + f.octets, 0);

    // L'adresse déjà publiée est conservée : la regénérer ne doit pas effacer un téléversement.
    const source = meta.url
      ? { type: "fichier", url: meta.url, octets: fichiers[0].octets, sha256: fichiers[0].sha256 }
      : adressesConnues.get(meta.id) ?? { type: meta.archive ? "archive" : "fichier", url: null };

    modeles.push({
      id: meta.id, nom: meta.nom, nomEn: meta.nomEn, noeuds: meta.noeuds,
      octets, source, fichiers,
    });
    console.log(`  ${meta.id.padEnd(22)} ${String(mo(octets)).padStart(8)} Mo · ${fichiers.length} fichier(s)`
      + `${source.url ? "" : " · SANS ADRESSE"}`);
  }

  const total = modeles.reduce((s, m) => s + m.octets, 0);
  fs.writeFileSync(MANIFESTE, JSON.stringify({ version: 1, modeles }, null, 2) + "\n", "utf8");
  console.log(`\n${modeles.length} modèles, ${mo(total)} Mo · manifeste écrit dans ${path.relative(RACINE, MANIFESTE)}`);
  const sansAdresse = modeles.filter((m) => !m.source.url);
  if (sansAdresse.length > 0) {
    console.log(`${sansAdresse.length} sans adresse (${mo(sansAdresse.reduce((s, m) => s + m.octets, 0))} Mo)`
      + " — « node scripts/modeles.cjs --publier » les téléverse.");
  }
}

function verifier() {
  const { modeles } = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  let ecarts = 0;
  for (const m of modeles) {
    for (const f of m.fichiers) {
      const complet = path.join(RACINE, "public", f.chemin);
      if (!fs.existsSync(complet)) { console.log(`  ABSENT   ${f.chemin}`); ecarts++; continue; }
      const taille = fs.statSync(complet).size;
      if (taille !== f.octets) { console.log(`  TAILLE   ${f.chemin} : ${taille} au lieu de ${f.octets}`); ecarts++; continue; }
      if (sha256(complet) !== f.sha256) { console.log(`  EMPREINTE ${f.chemin}`); ecarts++; }
    }
  }
  console.log(ecarts === 0
    ? `${modeles.length} modèles conformes au manifeste.`
    : `${ecarts} écart(s) avec le manifeste.`);
  process.exitCode = ecarts === 0 ? 0 : 1;
}

function publier() {
  const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  const aPublier = manifeste.modeles.filter((m) => !m.source.url);
  if (aPublier.length === 0) { console.log("Tous les modèles ont une adresse."); return; }

  const tmp = path.join(RACINE, "release");
  fs.mkdirSync(tmp, { recursive: true });
  for (const m of aPublier) {
    let fichier, nomAsset;
    if (m.source.type === "archive") {
      // Un asset de release ne porte pas de sous-dossier dans son nom : un dossier de modèle part
      // donc en une seule archive, que le téléchargeur déplie à l'arrivée.
      const AdmZip = require("adm-zip");
      const zip = new AdmZip();
      for (const f of m.fichiers) {
        zip.addLocalFile(path.join(RACINE, "public", f.chemin),
          path.dirname(f.chemin.replace(/^oonx\//, "")).replace(/^\.$/, ""));
      }
      nomAsset = `${m.id}.zip`;
      fichier = path.join(tmp, nomAsset);
      zip.writeZip(fichier);
    } else {
      nomAsset = path.basename(m.fichiers[0].chemin);
      fichier = path.join(RACINE, "public", m.fichiers[0].chemin);
    }
    const octets = fs.statSync(fichier).size;
    console.log(`téléversement de ${nomAsset} (${mo(octets)} Mo)…`);
    const r = spawnSync("gh", ["release", "upload", RELEASE, fichier, "--clobber"],
      { cwd: RACINE, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) { console.error(`échec du téléversement de ${nomAsset}`); process.exit(1); }
    m.source = { type: m.source.type, url: `${BASE_RELEASE}/${nomAsset}`, octets, sha256: sha256(fichier) };
  }
  fs.writeFileSync(MANIFESTE, JSON.stringify(manifeste, null, 2) + "\n", "utf8");
  console.log(`\n${aPublier.length} modèle(s) publié(s), manifeste mis à jour.`);
}

const arg = process.argv[2];
if (arg === "--generer") engendrer();
else if (arg === "--verifier") verifier();
else if (arg === "--publier") publier();
else {
  console.log("usage : node scripts/modeles.cjs --generer | --verifier | --publier");
  process.exitCode = 1;
}

module.exports = { fichiersDe, CONNUS, MANIFESTE };
