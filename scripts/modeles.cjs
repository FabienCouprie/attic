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
//   node scripts/modeles.cjs --generer      engendre le manifeste depuis public/oonx/
//   node scripts/modeles.cjs --verifier     compare public/oonx/ au manifeste
//   node scripts/modeles.cjs --publier      téléverse ce qui n'a pas d'adresse sur la release
//   node scripts/modeles.cjs --telecharger  récupère depuis la release ce qui manque dans public/

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
// LE TUYAU DE L'APPLICATION, réemployé plutôt que récrit : il ne dépend que de modules natifs.
const { inventaire, telechargerFichier, poser } = require("../electron/telechargement-modeles.cjs");

const RACINE = path.resolve(__dirname, "..");
const SOURCE = path.join(RACINE, "public", "oonx");

// LA RACINE PAR DÉFAUT EST `oonx`, ET CE N'EST PLUS LA SEULE. Les points de contrôle Magenta ne
// sont pas des ONNX et vivent dans `public/magenta/` ; ils entrent au manifeste par le même chemin,
// avec la même empreinte et la même adresse de publication, en déclarant leur racine.
const racineDe = (meta) => meta.racine ?? "oonx";
const dossierDe = (meta) => path.join(RACINE, "public", racineDe(meta));
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
    // L'ADRESSE AMONT A ÉTÉ RETIRÉE LE 2026-10-08 : ce modèle était le dernier des vingt à venir
    // d'ailleurs que de la release. Un tiers déplace, renomme ou retire ce qu'il héberge — c'est
    // arrivé au classeur de genre, dont le dépôt rend 401 depuis le 2026-09-22 — et une
    // installation qui n'embarque plus aucun modèle ne peut pas dépendre de cela. Sa licence MIT
    // autorise la rediffusion, et `--publier gtcrn` l'a posé sur la release comme les autres.
    licence: { nom: "MIT", credit: "Rong Xiaobin — GTCRN", rediffusable: true },
  },
  "audiobox-aesthetics.onnx": {
    id: "audiobox-aesthetics", nom: "Score esthétique", nomEn: "Aesthetic score",
    noeuds: ["score-esthetique", "comparaison-esthetique"],
    url: `${BASE_RELEASE}/audiobox-aesthetics.onnx`,
    licence: { nom: "CC-BY 4.0", credit: "Meta Platforms — Audiobox Aesthetics (composants WavLM sous MIT, microsoft/unilm)", rediffusable: true },
  },
  "basic-pitch.onnx": {
    id: "basic-pitch", nom: "Transcription polyphonique", nomEn: "Polyphonic transcription",
    noeuds: ["transcripteur-midi"],
    // IL N'ÉTAIT NI EMBARQUÉ NI AU MANIFESTE : le nœud allait le chercher chez un tiers par un
    // `fetch` à chaque première transcription, de sorte qu'il ne marchait qu'en ligne et qu'aucun
    // inventaire ne le voyait. Le fichier est repris tel quel, son empreinte vérifiée contre celle
    // que la fiche amont publie, et il passe par le même chemin que les autres.
    licence: { nom: "Apache-2.0", credit: "Spotify — Basic Pitch (Bittner, Bosch, Rubinstein, Meseguer-Brocal, Ewert, ICASSP 2022) ; fichier repris octet pour octet du paquet amont, réhébergé par daserge", rediffusable: true },
  },
  "htdemucs_6s.onnx": {
    id: "htdemucs-6s", nom: "Séparation 6 pistes", nomEn: "6-stem separation",
    noeuds: ["separateur-ia"],
    // PAS D'`url` ÉCRITE ICI : `--generer` la recopierait telle quelle dans le manifeste, avec la
    // taille et l'empreinte du fichier local, SANS vérifier que quoi que ce soit est publié à cette
    // adresse. L'application téléchargerait alors un 404. C'est `--publier` qui donne l'adresse,
    // après le téléversement, et c'est la seule qui soit vraie.
    licence: { nom: "usage non commercial", credit: "Meta Platforms — Demucs v4 (HT-Demucs) ; citer Rouard, Massa, Défossez, ICASSP 2023, et MUSDB18-HQ", rediffusable: true,
      note: "Le code de Demucs est sous licence MIT, PAS ses poids : « The model weights are not covered by the MIT license, and are provided only for scientific purposes » (adefossez, auteur de Demucs, facebookresearch/demucs#327), la réserve venant de MUSDB18-HQ, jeu de données à usage éducatif. DÉCISION DU PROPRIÉTAIRE D'ATTIC, prise le 2026-10-08 : cette réserve scientifique n'est pas tenue pour déterminante, et seul l'usage commercial est récusé. Attic est libre et non commercial, et rediffuse ces poids à ce titre. Qui les reprend reste tenu par la même limite." },
  },
  "htdemucs_fp16weights.onnx": {
    id: "htdemucs-fp16", nom: "Séparation (poids fp16)", nomEn: "Separation (fp16 weights)",
    noeuds: ["separateur-ia"],
    licence: { nom: "usage non commercial", credit: "Meta Platforms — Demucs v4 (HT-Demucs), poids fp16", rediffusable: true,
      note: "Mêmes poids que htdemucs-6s, même décision : la réserve scientifique n'est pas tenue pour déterminante, seul l'usage commercial est récusé." },
  },
  "model_genre.onnx": {
    id: "genre", nom: "Classement par genre", nomEn: "Genre classifier",
    noeuds: ["classificateur-genre"],
    // LA SEULE ENTRÉE DE CETTE TABLE QUI SOIT REDIFFUSÉE SANS RIEN POUVOIR CITER. Sa licence
    // reste « inconnue » parce qu'elle l'est : la changer en autre chose serait inventer une
    // autorisation. Ce qui a changé n'est pas le droit, c'est la décision.
    licence: { nom: "inconnue", credit: "réglage fin de HuBERT (facebook/hubert-base-ls960, Apache-2.0) sur GTZAN", rediffusable: true,
      note: "Aucune licence n'a jamais été déclarée pour ce réglage fin, et son dépôt d'origine a disparu (401 depuis le 2026-09-22) : la chaîne de droits ne se documente pas, et AUCUNE AUTORISATION NE PEUT ÊTRE CITÉE. DÉCISION DU PROPRIÉTAIRE D'ATTIC, prise le 2026-10-08 : le modèle est rediffusé tout de même, aux mêmes conditions non commerciales que le reste. La réserve n'est pas celle de Demucs, dont la licence est connue et dont seul le commercial est exclu ; ici c'est un risque assumé, et il est écrit ici pour qu'il ne se perde pas." },
  },
  "modele-separation.onnx": {
    id: "separation-mdx", nom: "Séparation voix/instrumental", nomEn: "Vocal/instrumental separation",
    noeuds: ["separateur-ia"],
    licence: { nom: "MIT", credit: "Ultimate Vocal Remover — MDX-Net (Kuielab, Woosung Choi)", rediffusable: true },
  },
  "stable-audio-3-small-music": {
    id: "stable-audio-3", nom: "Stable Audio 3 (musique)", nomEn: "Stable Audio 3 (music)",
    // Deux nœuds partagent ce paquet : la génération et la continuation, qui résout le même
    // `stable-audio-3-small-music`. La continuation y manquait.
    noeuds: ["stable-audio-3", "continuation-stable-audio-3"], archive: true,
    licence: { nom: "Stability AI Community License", credit: "Stability AI Ltd — Stable Audio 3 small-music ; export ONNX par lsb et bgkb", rediffusable: true,
      note: "La licence impose trois choses à qui rediffuse : joindre une copie de l'accord, garder la mention « This Stability AI Model is licensed under the Stability AI Community License, Copyright (c) Stability AI Ltd. All Rights Reserved » dans un fichier de notices, et afficher « Powered by Stability AI ». Elle réserve l'usage commercial aux organisations sous le million de dollars de revenu annuel — Attic est libre et non commercial." },
  },
  // LE PAQUET DE BRUITAGE MANQUAIT ICI, relevé par Fabien. Il était au manifeste, publié, avec son
  // empreinte et son adresse — 1,49 Go, sept fichiers, attribué à « bruitage-ia » — mais absent de
  // cette table. Or `engendrer()` ne parcourt QUE cette table : une régénération du manifeste
  // l'aurait effacé, avec son empreinte et son adresse de publication, sans rien dire. C'est le plus
  // silencieux des défauts relevés, puisqu'il ne se serait vu qu'au téléchargement suivant.
  "stable-audio-3-small-sfx": {
    id: "stable-audio-3-sfx", nom: "Stable Audio 3 (bruitage)", nomEn: "Stable Audio 3 (sound effects)",
    noeuds: ["bruitage-ia"], archive: true,
    licence: { nom: "Stability AI Community License", credit: "Stability AI Ltd — Stable Audio 3 small-sfx ; export ONNX par lsb et bgkb", rediffusable: true,
      note: "La licence impose trois choses à qui rediffuse : joindre une copie de l'accord, garder la mention « This Stability AI Model is licensed under the Stability AI Community License, Copyright (c) Stability AI Ltd. All Rights Reserved » dans un fichier de notices, et afficher « Powered by Stability AI ». Elle réserve l'usage commercial aux organisations sous le million de dollars de revenu annuel — Attic est libre et non commercial." },
  },
  "kokoro-82m": {
    id: "kokoro-82m", nom: "Synthèse vocale Kokoro", nomEn: "Kokoro speech synthesis",
    noeuds: ["tts-kokoro", "tts-francais"], archive: true,
    licence: { nom: "Apache-2.0", credit: "hexgrad — Kokoro-82M ; export ONNX par onnx-community", rediffusable: true,
      note: "Le miroir ne prend que le poids quantifié q8, la configuration, le tokeniseur et les 55 voix : les exports fp32, fp16 et q4 du dépôt amont ne sont jamais chargés par l'application. Les deux composants, anglais et français, partagent ce seul dépôt." },
  },
  "sdxs-512-texte-image": {
    id: "sdxs-512", nom: "Texte → image", nomEn: "Text → image",
    noeuds: ["texte-image"], archive: true,
    licence: { nom: "OpenRAIL++", credit: "IDKiro — SDXS-512-0.9 ; export ONNX par Attic", rediffusable: true,
      note: "La licence et ses restrictions d'usage voyagent avec le modèle : le README de l'archive les porte." },
  },

  // ── LES DEUX MODÈLES VOSK ──
  //
  // Vosk est un troisième moteur de reconnaissance vocale, et non un doublon : il rend les mots
  // HORODATÉS un à un, avec leur confiance, là où les deux Whisper ne rendent qu'un bloc de texte ;
  // il accepte un vocabulaire contraint ; et il tient en quarante mégaoctets par langue, contre 99
  // et 281 pour les deux autres. Deux moteurs qui se trompent différemment valent mieux qu'un seul.
  //
  // CES ARCHIVES SONT CONVERTIES, et c'est la seule du dépôt dans ce cas : `vosk-browser` ne déplie
  // que du `.tar.gz`, alphacephei ne publie que du `.zip`. La conversion a lieu à l'amorçage, et
  // c'est l'archive convertie qui part sur la release. D'où le type « fichier » et non « archive » :
  // ce qui est livré est un fichier unique que la bibliothèque déplie elle-même en mémoire, et non
  // un dossier que notre téléchargeur aurait à déplier.
  "vosk-model-small-fr-0.22.tar.gz": {
    id: "vosk-fr", nom: "Vosk français (petit)", nomEn: "Vosk French (small)",
    noeuds: ["vosk-asr", "parole-vers-sequence", "couper-aux-mots"],
    licence: { nom: "Apache-2.0", credit: "Alpha Cephei — vosk-model-small-fr-0.22", rediffusable: true },
  },
  "vosk-model-small-en-us-0.15.tar.gz": {
    id: "vosk-en", nom: "Vosk anglais (petit)", nomEn: "Vosk English (small)",
    noeuds: ["vosk-asr", "parole-vers-sequence", "couper-aux-mots"],
    licence: { nom: "Apache-2.0", credit: "Alpha Cephei — vosk-model-small-en-us-0.15", rediffusable: true },
  },

  // ── LES DEUX MODÈLES DE RECONNAISSANCE VOCALE ──
  //
  // Ils venaient de HuggingFace à l'exécution, et c'est le même triple reproche que les points de
  // contrôle Magenta : une installation SANS RÉSEAU ne pouvait employer ni l'un ni l'autre ; rien
  // ne vérifiait l'intégrité de ce qui arrivait, puisqu'ils étaient absents de ce manifeste ; et ils
  // venaient d'un tiers, contre la règle du dépôt.
  "sherpa-asr-whisper-tiny": {
    id: "sherpa-asr-whisper-tiny", nom: "Reconnaissance vocale (Sherpa)", nomEn: "Speech recognition (Sherpa)",
    noeuds: ["sherpa-asr"], archive: true,
    licence: { nom: "Apache-2.0", credit: "OpenAI — Whisper tiny ; export sherpa-onnx par csukuangfj", rediffusable: true,
      note: "L'EXPORT NE DÉCLARE AUCUNE LICENCE, ni celui-ci ni les seize autres du même auteur ; les poids dont il dérive, `openai/whisper-tiny`, sont en Apache-2.0. Une conversion de format est une œuvre dérivée des poids : le silence de l'exportateur ne retire pas la concession d'OpenAI, qui autorise la rediffusion avec attribution. D'où le double crédit. Ce n'est pas la situation de `model_genre.onnx`, dont la chaîne amont elle-même avait disparu." },
  },
  "whisper-base-en": {
    id: "whisper-base-en", nom: "Whisper (anglais)", nomEn: "Whisper (English)",
    noeuds: ["whisper-en"], archive: true,
    licence: { nom: "Apache-2.0", credit: "OpenAI — Whisper base.en ; export ONNX par Xenova", rediffusable: true,
      note: "Le paquet porte ce que Transformers.js charge et rien de plus : les deux ONNX en fp32 que le worker demande explicitement, la configuration, le préprocesseur et le tokeniseur. Les variantes quantifiées du dépôt amont ne sont jamais chargées par l'application." },
  },

  // ── LES POINTS DE CONTRÔLE MAGENTA, sous `public/magenta/` et non `public/oonx/` ──
  //
  // Ils ne sont pas des ONNX, et c'est pourquoi ils ont leur racine. Ils entrent ici pour trois
  // raisons, toutes vérifiées : sans eux, une installation SANS RÉSEAU ne pouvait employer aucun
  // des sept nœuds Magenta, là où tous les autres nœuds à modèle fonctionnent hors ligne ; rien ne
  // vérifiait l'intégrité de ce qui arrivait ; et ils venaient d'un tiers, contre la règle du dépôt.
  //
  // CINQ POUR SEPT NŒUDS : deux paires partagent leur modèle, et le champ `noeuds` le dit.
  "drums_2bar_nade_9_q2": {
    id: "magenta-drums-vae", nom: "Batterie neuronale (MusicVAE)", nomEn: "Neural drums (MusicVAE)",
    racine: "magenta", noeuds: ["magenta-drums", "magenta-generer-batterie"], archive: true,
    licence: { nom: "Apache-2.0", credit: "Google Magenta — MusicVAE drums_2bar_nade_9_q2", rediffusable: true },
  },
  "melody_rnn": {
    id: "magenta-melody-rnn", nom: "Continuation de mélodie (MusicRNN)", nomEn: "Melody continuation (MusicRNN)",
    racine: "magenta", noeuds: ["magenta-continuation", "magenta-generer-melodie"], archive: true,
    licence: { nom: "Apache-2.0", credit: "Google Magenta — MusicRNN melody_rnn", rediffusable: true },
  },
  "mel_2bar_small": {
    id: "magenta-mel-2bar", nom: "Interpolation de mélodies (MusicVAE)", nomEn: "Melody interpolation (MusicVAE)",
    racine: "magenta", noeuds: ["magenta-interpoler-midi"], archive: true,
    licence: { nom: "Apache-2.0", credit: "Google Magenta — MusicVAE mel_2bar_small", rediffusable: true },
  },
  "groovae_2bar_humanize": {
    id: "magenta-groovae", nom: "Humanisation de groove (GrooVAE)", nomEn: "Groove humanization (GrooVAE)",
    racine: "magenta", noeuds: ["magenta-humaniser-groove"], archive: true,
    licence: { nom: "Apache-2.0", credit: "Google Magenta — GrooVAE groovae_2bar_humanize", rediffusable: true },
  },
  "piano_genie": {
    id: "magenta-piano-genie", nom: "Improvisation au piano (Piano Genie)", nomEn: "Piano improvisation (Piano Genie)",
    racine: "magenta", noeuds: ["magenta-improvisation"], archive: true,
    licence: { nom: "Apache-2.0", credit: "Google Magenta — Piano Genie, modèle epiano", rediffusable: true },
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
  const entreesConnues = new Map(ancien.modeles.map((m) => [m.id, m]));

  const modeles = [];
  for (const [entree, meta] of Object.entries(CONNUS)) {
    const racine = racineDe(meta);
    const dossier = dossierDe(meta);
    const complet = path.join(dossier, entree);
    if (!fs.existsSync(complet)) {
      // UN PAQUET ABSENT DU DISQUE EST REPORTÉ, ET NON JETÉ. Relevé par Fabien sur le paquet de
      // bruitage, qui manquait à `CONNUS` ; mais le défaut est plus large que ce paquet-là. Cette
      // table décrit ce qui EXISTE, et `public/oonx/` ne contient que ce que CETTE machine a
      // téléchargé : régénérer depuis un poste qui n'a pas tout aurait effacé du manifeste les
      // empreintes et les adresses de publication des paquets manquants, sans rien dire. Un
      // manifeste est un registre de ce qui est publié, pas un inventaire du disque local.
      const reporte = entreesConnues.get(meta.id);
      if (reporte) {
        modeles.push(reporte);
        console.log(`  ${meta.id.padEnd(22)} absent du disque · REPORTÉ du manifeste (${mo(reporte.octets)} Mo)`);
      } else {
        console.log(`  ${entree} : absent de public/oonx/ et du manifeste, ignoré`);
      }
      continue;
    }
    const estDossier = fs.statSync(complet).isDirectory();
    const relatifs = estDossier
      ? fichiersDe(dossier, entree)
      : [entree];
    const fichiers = relatifs.map((r) => ({
      chemin: `${racine}/${r}`,
      octets: fs.statSync(path.join(dossier, r)).size,
      sha256: sha256(path.join(dossier, r)),
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
 * c'est le republier, et ce garde-fou fait respecter la table `CONNUS` plutôt que de compter sur
 * la mémoire de celui qui lance la commande.
 *
 * LA LISTE QU'IL PROTÈGE EST AUJOURD'HUI VIDE, et le garde reste. Les trois modèles qu'il refusait
 * — les deux Demucs et le classeur de genre — sont passés rediffusables le 2026-10-08, par décision
 * écrite dans leur entrée de `CONNUS`. Retirer le garde pour autant serait confondre « personne
 * n'est refusé aujourd'hui » avec « personne ne peut l'être » : le prochain modèle ajouté au
 * catalogue arrivera avec sa propre licence, et c'est à ce moment-là qu'il servira.
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
        // L'ARCHIVE EST RELATIVE À LA RACINE DU MODÈLE, quelle qu'elle soit. Le premier segment —
        // `oonx/` hier, `magenta/` aussi aujourd'hui — est retiré, et le dépliage le remet depuis
        // le manifeste. Le coder en dur ici aurait déplié les points de contrôle Magenta sous
        // `oonx/magenta/`, où rien ne les cherche.
        zip.addLocalFile(path.join(RACINE, "public", f.chemin),
          path.dirname(f.chemin.split("/").slice(1).join("/")).replace(/^\.$/, ""));
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

/**
 * Récupère depuis la release ce qui manque dans `public/`, et le vérifie.
 *
 * POURQUOI CETTE COMMANDE EXISTE. Un `git clone` ne rapporte aucun modèle : ils sont exclus de git
 * et vivent sur la release `assets`. La suite d'instructions qui reconstitue une installation
 * complète n'existait nulle part ailleurs que dans le YAML de la CI, où personne ne va la lire et
 * où rien ne l'éprouve. Elle tient maintenant en un mot.
 *
 * LE TUYAU EST CELUI DE L'APPLICATION, et non un second écrit ici : `electron/telechargement-
 * modeles.cjs` ne dépend que de modules natifs, et c'est lui qui sait suivre une redirection,
 * calculer l'empreinte au fil de l'eau et ne poser le fichier qu'une fois entier. En écrire un
 * autre aurait fait deux chemins à éprouver, dont un seul le serait.
 */
async function telecharger(ids = []) {
  const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, "utf8"));
  const racinePublic = path.join(RACINE, "public");
  const absolu = (relatif) => path.join(racinePublic, relatif);
  const inv = inventaire(manifeste, {
    existe: (r) => fs.existsSync(absolu(r)),
    taille: (r) => { try { return fs.statSync(absolu(r)).size; } catch { return null; } },
  });

  const inconnus = ids.filter((id) => !manifeste.modeles.some((m) => m.id === id));
  for (const id of inconnus) console.error(`INCONNU ${id} : absent du manifeste.`);
  if (inconnus.length) process.exit(1);

  const voulus = ids.length ? ids : inv.manquants;
  const file = manifeste.modeles.filter((m) => voulus.includes(m.id) && m.source?.url);
  if (file.length === 0) {
    console.log(`Rien à prendre : ${inv.complets}/${inv.total} modèles déjà là.`);
    return;
  }

  const tmp = path.join(RACINE, "release");
  fs.mkdirSync(tmp, { recursive: true });
  let pris = 0;
  for (const m of file) {
    const archive = m.source.type === "archive";
    const destination = archive ? path.join(tmp, `${m.id}.zip`) : absolu(m.fichiers[0].chemin);
    process.stdout.write(`  ${m.id} (${mo(m.source.octets ?? m.octets)} Mo)… `);
    const res = await telechargerFichier(m.source.url, destination);
    if (!res.ok) { console.error(`ÉCHEC : ${res.erreur}`); process.exit(1); }

    // L'EMPREINTE DÉCIDE D'INSTALLER OU DE JETER, avant que le fichier n'atteigne sa place.
    if (m.source.sha256 && res.sha256 !== m.source.sha256) {
      try { fs.unlinkSync(res.temporaire); } catch { /* déjà parti */ }
      console.error(`EMPREINTE INCORRECTE pour ${m.id} : reçu ${res.sha256}`);
      process.exit(1);
    }

    if (archive) {
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(res.temporaire);
      // LA RACINE VIENT DU MANIFESTE : les points de contrôle Magenta vivent sous `magenta/`, et
      // une archive dépliée au mauvais endroit donnerait un modèle introuvable sans rien dire.
      const dossier = absolu((m.fichiers?.[0]?.chemin ?? "oonx/").split("/")[0]);
      fs.mkdirSync(dossier, { recursive: true });
      // Chaque entrée est posée à la main, jamais `extractAllTo`, et le chemin RÉSOLU est comparé
      // au dossier : un nom encodé ou mixte ne sort pas de là. Même précaution qu'au déplieur du
      // processus principal et qu'à celui de l'amorçage.
      for (const entree of zip.getEntries()) {
        if (entree.isDirectory) continue;
        const cible = path.resolve(dossier, entree.entryName);
        if (!cible.startsWith(path.resolve(dossier) + path.sep)) {
          throw new Error(`Chemin hors du dossier : ${entree.entryName}`);
        }
        fs.mkdirSync(path.dirname(cible), { recursive: true });
        fs.writeFileSync(cible, entree.getData());
      }
      fs.unlinkSync(res.temporaire);
    } else {
      poser(res.temporaire, destination);
    }
    pris++;
    console.log("pris.");
  }
  console.log(`\n${pris} modèle(s) récupéré(s) dans public/. « npm run modeles:verifier » les relit.`);
}

const arg = process.argv[2];
if (arg === "--generer") engendrer();
else if (arg === "--verifier") verifier();
else if (arg === "--publier") publier(process.argv.slice(3));
else if (arg === "--telecharger") {
  telecharger(process.argv.slice(3)).catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
} else {
  console.log("usage : node scripts/modeles.cjs --generer | --verifier | --publier [id…]"
    + " | --telecharger [id…]");
  process.exitCode = 1;
}

module.exports = { fichiersDe, CONNUS, MANIFESTE };
