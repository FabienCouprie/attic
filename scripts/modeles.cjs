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
 * `stable-audio-3-small-music` y figure depuis le 2026-09-22 : 686 Mo qui partaient jusque-là dans
 * l'installeur complet — la configuration d'empaquetage prenait `public/oonx` en entier, quoi qu'en
 * disait ce commentaire. Il est désormais retiré de l'installeur et publié en asset, comme SDXS :
 * c'est ce qui rend la prochaine release possible sous le plafond de 2 Go.
 */
const CONNUS = {
  "gtcrn.onnx": {
    id: "gtcrn", nom: "Débruitage IA", nomEn: "AI denoise",
    noeuds: ["debruitage-ia"],
    url: "https://raw.githubusercontent.com/Xiaobin-Rong/gtcrn/main/stream/onnx_models/gtcrn.onnx",
    licence: { nom: "MIT", credit: "Rong Xiaobin — GTCRN", rediffusable: true },
  },
  "audiobox-aesthetics.onnx": {
    id: "audiobox-aesthetics", nom: "Score esthétique", nomEn: "Aesthetic score",
    noeuds: ["score-esthetique", "comparaison-esthetique"],
    url: `${BASE_RELEASE}/audiobox-aesthetics.onnx`,
    licence: { nom: "CC-BY 4.0", credit: "Meta Platforms — Audiobox Aesthetics (composants WavLM sous MIT, microsoft/unilm)", rediffusable: true },
  },
  "htdemucs_6s.onnx": {
    id: "htdemucs-6s", nom: "Séparation 6 pistes", nomEn: "6-stem separation",
    noeuds: ["separation-demucs"],
    licence: { nom: "usage scientifique / non commercial", credit: "Meta Platforms — Demucs v4 (HT-Demucs) ; citer Rouard, Massa, Défossez, ICASSP 2023, et MUSDB18-HQ", rediffusable: false,
      raison: "Le code de Demucs est sous licence MIT, PAS ses poids : « The model weights are not covered by the MIT license, and are provided only for scientific purposes » (adefossez, auteur de Demucs, facebookresearch/demucs#327) — la restriction vient de MUSDB18-HQ, jeu de données à usage éducatif. Attic, libre et non commercial, les EMPLOIE ; les héberger sur notre propre release serait une publication de plus, et cette décision-là n'est pas prise." },
  },
  "htdemucs_fp16weights.onnx": {
    id: "htdemucs-fp16", nom: "Séparation (poids fp16)", nomEn: "Separation (fp16 weights)",
    noeuds: ["separation-demucs"],
    licence: { nom: "usage scientifique / non commercial", credit: "Meta Platforms — Demucs v4 (HT-Demucs), poids fp16", rediffusable: false,
      raison: "Mêmes poids que htdemucs-6s, même réserve : usage scientifique et non commercial, hébergement par nous non décidé." },
  },
  "model_genre.onnx": {
    id: "genre", nom: "Classement par genre", nomEn: "Genre classifier",
    noeuds: ["genre-musical"],
    licence: { nom: "inconnue", credit: "réglage fin de HuBERT (facebook/hubert-base-ls960, Apache-2.0) sur GTZAN", rediffusable: false,
      raison: "Aucune licence n'a jamais été déclarée pour ce réglage fin, et son dépôt d'origine a disparu (401 depuis le 2026-09-22). La chaîne de droits ne se documente pas : on ne le rediffuse pas." },
  },
  "modele-separation.onnx": {
    id: "separation-mdx", nom: "Séparation voix/instrumental", nomEn: "Vocal/instrumental separation",
    noeuds: ["separation-voix"],
    licence: { nom: "MIT", credit: "Ultimate Vocal Remover — MDX-Net (Kuielab, Woosung Choi)", rediffusable: true },
  },
  "stable-audio-3-small-music": {
    id: "stable-audio-3", nom: "Stable Audio 3 (musique)", nomEn: "Stable Audio 3 (music)",
    noeuds: ["stable-audio-3"], archive: true,
    licence: { nom: "Stability AI Community License", credit: "Stability AI Ltd — Stable Audio 3 small-music ; export ONNX par lsb et bgkb", rediffusable: true,
      note: "La licence impose trois choses à qui rediffuse : joindre une copie de l'accord, garder la mention « This Stability AI Model is licensed under the Stability AI Community License, Copyright (c) Stability AI Ltd. All Rights Reserved » dans un fichier de notices, et afficher « Powered by Stability AI ». Elle réserve l'usage commercial aux organisations sous le million de dollars de revenu annuel — Attic est libre et non commercial." },
  },
  "sdxs-512-texte-image": {
    id: "sdxs-512", nom: "Texte → image", nomEn: "Text → image",
    noeuds: ["texte-image"], archive: true,
    licence: { nom: "OpenRAIL++", credit: "IDKiro — SDXS-512-0.9 ; export ONNX par Attic", rediffusable: true,
      note: "La licence et ses restrictions d'usage voyagent avec le modèle : le README de l'archive les porte." },
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

/**
 * Téléverse sur la release `assets` les modèles nommés en argument — ou tous ceux qui n'ont pas
 * encore d'adresse, si l'on n'en nomme aucun.
 *
 * UN MODÈLE NON REDIFFUSABLE N'EST JAMAIS TÉLÉVERSÉ, même nommé explicitement. Héberger un modèle,
 * c'est le republier : cela demande une licence qui l'autorise. Les poids de Demucs sont donnés
 * « pour un usage scientifique seulement », et le classeur de genre n'a jamais eu de licence du
 * tout — la table `CONNUS` porte la raison, et ce garde-fou la fait respecter plutôt que de
 * compter sur la mémoire de celui qui lance la commande.
 */
function publier(ids = []) {
  const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  const licenceDe = (id) => Object.values(CONNUS).find((c) => c.id === id)?.licence;
  const refuses = [];
  let aPublier = manifeste.modeles.filter((m) => (ids.length ? ids.includes(m.id) : !m.source.url));
  aPublier = aPublier.filter((m) => {
    const l = licenceDe(m.id);
    if (l && l.rediffusable === false) { refuses.push({ id: m.id, raison: l.raison }); return false; }
    return true;
  });
  for (const r of refuses) console.error(`REFUSÉ  ${r.id} : ${r.raison}`);
  const inconnus = ids.filter((id) => !manifeste.modeles.some((m) => m.id === id));
  for (const id of inconnus) console.error(`INCONNU ${id} : absent du manifeste.`);
  if (inconnus.length) process.exit(1);
  if (aPublier.length === 0) { console.log("Rien à publier."); return; }

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
    // SANS `--clobber` : un asset publié ne se remplace pas en douce. Un modèle qui change de
    // contenu change de nom, sans quoi les installations déjà faites vérifieraient une empreinte
    // qui ne correspond plus à ce qu'elles téléchargent.
    const r = spawnSync("gh", ["release", "upload", RELEASE, fichier],
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
else if (arg === "--publier") publier(process.argv.slice(3));
else {
  console.log("usage : node scripts/modeles.cjs --generer | --verifier | --publier [id…]");
  process.exitCode = 1;
}

module.exports = { fichiersDe, CONNUS, MANIFESTE };
