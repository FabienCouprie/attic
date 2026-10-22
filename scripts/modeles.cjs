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
const https = require("https");
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
  // LES DEUX SYNTHÈSES TRANSFORMERS.JS, qui tiraient leurs poids d'un tiers à l'exécution.
  //
  // Elles ne figuraient NULLE PART ici : ni déclarées, ni annoncées, donc hors de portée du garde
  // qui apparie les nœuds du manifeste à ceux qui annoncent leur téléchargement. Une installation
  // hors réseau échouait en silence. Et trois des dix langues offertes étaient DÉJÀ MORTES sans
  // que rien ne le sache : `Xenova/mms-tts-ita`, `-nld` et `-pol` rendent 401. Un dépôt tiers qui
  // disparaît emporte une option de la liste sans prévenir, et c'est la seconde raison de ce
  // miroir, au moins autant que la première.
  //
  // UN PAQUET PAR COMPOSANT. Prendre les sept langues de MMS pour employer SpeechT5 ferait
  // télécharger sept cent soixante mégaoctets pour rien.
  "tts-speecht5": {
    id: "tts-speecht5", nom: "Synthèse vocale SpeechT5", nomEn: "SpeechT5 speech synthesis",
    noeuds: ["tts-speecht5"], archive: true,
    licence: { nom: "MIT", credit: "Microsoft — SpeechT5 (microsoft/speecht5_tts et speecht5_hifigan) ; export ONNX par Xenova ; voix du corpus CMU ARCTIC (Carnegie Mellon University)", rediffusable: true,
      note: "L'EXPORT NE DÉCLARE AUCUNE LICENCE, comme celui de Whisper tiny : les poids dont il dérive sont en MIT, et une conversion de format est une œuvre dérivée des poids, de sorte que le silence de l'exportateur ne retire pas la concession de Microsoft. D'où le double crédit. Le miroir ne prend que les trois graphes fp32 que le chargeur ouvre, l'encodeur, le décodeur fusionné et le postnet : ni `decoder_model.onnx` ni `decoder_with_past_model.onnx`, qui sont les deux moitiés de ce que le fusionné porte seul." },
  },
  "tts-mms": {
    id: "tts-mms", nom: "Synthèse vocale multilingue (MMS)", nomEn: "Multilingual speech synthesis (MMS)",
    noeuds: ["tts-mms"], archive: true,
    licence: { nom: "usage non commercial", credit: "Meta Platforms — MMS-TTS (facebook/mms-tts) ; export ONNX par Xenova", rediffusable: true,
      note: "Les poids amont sont en CC-BY-NC 4.0. La même décision que pour les poids de Demucs et de MuScriptor s'applique : Attic est libre et non commercial, et rediffuse à ce titre ; qui les reprend reste tenu par la même limite. Sept langues, une par dépôt amont, en fp32 : c'est ce que le composant demande, et les variantes quantifiées ne sont jamais chargées." },
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
    noeuds: ["vosk-asr", "parole-vers-sequence", "couper-aux-mots", "sous-titres-srt"],
    licence: { nom: "Apache-2.0", credit: "Alpha Cephei — vosk-model-small-fr-0.22", rediffusable: true },
  },
  "vosk-model-small-en-us-0.15.tar.gz": {
    id: "vosk-en", nom: "Vosk anglais (petit)", nomEn: "Vosk English (small)",
    noeuds: ["vosk-asr", "parole-vers-sequence", "couper-aux-mots", "sous-titres-srt"],
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

  // ── LES POIDS D'ACE-STEP 1.5, sous `public/acestep/` ──
  //
  // QUATRE FICHIERS POUR DEUX NŒUDS, et ils ne sont ni des ONNX ni des points de contrôle Magenta :
  // ce sont des GGUF, lus par les exécutables d'`acestep.cpp` que `scripts/outils-manifest.json`
  // épingle. Le planificateur écrit les paroles et les codes, le reste rend l'audio ; les deux
  // nœuds partagent donc les quatre, et le champ `noeuds` le dit.
  //
  // LE PLANIFICATEUR EST PRIS EN 0,6B ET NON EN 4B, mesuré : le 4B pèse 4,2 Go et ne tient pas à
  // côté du débruiteur dans six gigaoctets de carte, là où ce jeu-ci passe en entier.
  "Qwen3-Embedding-0.6B-Q8_0.gguf": {
    id: "acestep-texte", nom: "Encodeur de texte (ACE-Step)", nomEn: "Text encoder (ACE-Step)",
    racine: "acestep", noeuds: [
      "planifier-chanson", "ecrire-chanson",
      "rendre-chanson", "reprendre-chanson", "retoucher-chanson", "prolonger-chanson",
      "accompagner-voix",
    ],
    licence: { nom: "Apache-2.0", credit: "Alibaba — Qwen3-Embedding-0.6B, converti en GGUF par Serveurperso", rediffusable: true },
  },
  "acestep-5Hz-lm-0.6B-Q8_0.gguf": {
    id: "acestep-planificateur", nom: "Planificateur de chanson (ACE-Step)", nomEn: "Song planner (ACE-Step)",
    racine: "acestep", noeuds: ["planifier-chanson", "ecrire-chanson"],
    licence: { nom: "MIT", credit: "ACE-Step — acestep-5Hz-lm-0.6B, converti en GGUF par Serveurperso", rediffusable: true },
  },
  // LE DÉBRUITEUR EST EN Q6 ET NON EN Q8, ET C'EST GITHUB QUI TRANCHE. Un asset de release est
  // refusé au-delà de deux gibioctets — « size must be less than 2147483648 », relevé en essayant.
  // Le Q8 pèse 2 431 Mo et ne passe pas ; le Q6, 1 879 Mo, passe avec de la marge, et c'est la
  // quantification la plus fidèle qui tienne dans la limite.
  "acestep-v15-turbo-Q6_K.gguf": {
    id: "acestep-debruiteur", nom: "Débruiteur de chanson (ACE-Step)", nomEn: "Song denoiser (ACE-Step)",
    racine: "acestep", noeuds: ["rendre-chanson", "reprendre-chanson", "retoucher-chanson", "prolonger-chanson"],
    licence: { nom: "MIT", credit: "ACE-Step — acestep-v15-turbo, converti en GGUF par Serveurperso", rediffusable: true },
  },
  // LE MODÈLE DE BASE EST UN SECOND DÉBRUITEUR, et il n'est pris que par le nœud qui en a besoin.
  // Le rapide ne sait pas accompagner une voix : le moteur avertit lui-même que sa sortie sur ces
  // tâches est incohérente, et la mesure le confirme. Celui-ci pèse exactement le même poids, à
  // soixante-quatre octets près, pour cinquante pas de débruitage au lieu de huit.
  "acestep-v15-base-Q6_K.gguf": {
    id: "acestep-debruiteur-base", nom: "Débruiteur de base (ACE-Step)", nomEn: "Base denoiser (ACE-Step)",
    racine: "acestep", noeuds: ["accompagner-voix"],
    licence: { nom: "MIT", credit: "ACE-Step — acestep-v15-base, converti en GGUF par Serveurperso", rediffusable: true },
  },
  "vae-BF16.gguf": {
    id: "acestep-decodeur", nom: "Décodeur audio (ACE-Step)", nomEn: "Audio decoder (ACE-Step)",
    racine: "acestep", noeuds: [
      "rendre-chanson", "reprendre-chanson", "retoucher-chanson", "prolonger-chanson",
      "accompagner-voix",
    ],
    licence: { nom: "MIT", credit: "ACE-Step — VAE v1.5, converti en GGUF par Serveurperso", rediffusable: true },
  },

  // ── LE TRANSCRIPTEUR AUDIO VERS MIDI, sous `public/audiocpp/` ──
  //
  // Un seul fichier, lu par `audiocpp_cli` que `scripts/outils-manifest.json` épingle. Il porte sa
  // propre fiche de famille : l'exécutable n'a besoin de rien d'autre que de lui, mesuré en le
  // lançant depuis un dossier qui ne contenait que l'exécutable et ses bibliothèques.
  "muscriptor-small-f32.gguf": {
    id: "muscriptor", nom: "Transcription audio vers MIDI", nomEn: "Audio to MIDI transcription",
    racine: "audiocpp", noeuds: ["transcription-midi"],
    licence: { nom: "usage non commercial", credit: "MuScriptor — muscriptor-small, converti en GGUF par le projet audio.cpp", rediffusable: true,
      note: "Le dépôt de conversion déclare « CC-BY-NC-4.0 » comme licence du modèle d'origine, et dit que l'usage et la rediffusion sont régis par elle. La même décision que pour les poids de Demucs s'applique : Attic est libre et non commercial, et rediffuse à ce titre ; qui les reprend reste tenu par la même limite. Aucune version quantifiée n'est publiée en amont, le F32 est le seul paquet." },
  },

  // LE CLONEUR DE VOIX, sous la même racine et lu par le même exécutable.
  //
  // IL N'A PAS DE VOIX À LUI, et c'est la première chose que la mesure a dite : une synthèse sans
  // référence est refusée, « Chatterbox prepare requires speaker reference audio ». Ce n'est pas
  // un synthétiseur à voix prédéfinies, c'est un cloneur, d'où une entrée audio obligatoire sur
  // son nœud.
  //
  // LE PAQUET Q8 EST LE SEUL PUBLIABLE, et il fallait vérifier qu'il parle. Le f16 pèse
  // 3 744 365 922 octets, soit 1,74 fois le plafond d'un asset de release ; celui-ci en pèse
  // 2 088 399 204 et passe avec 59 084 444 octets de marge. Le paquet q8 d'OmniVoice, lui, rendait
  // un WAV de quarante-quatre octets : la variante se mesure avant de s'épingler.
  "chatterbox-q8_0.gguf": {
    id: "chatterbox", nom: "Clonage de voix (Chatterbox)", nomEn: "Voice cloning (Chatterbox)",
    racine: "audiocpp", noeuds: ["cloner-voix"],
    licence: { nom: "MIT", credit: "Resemble AI — Chatterbox, converti en GGUF par le projet audio.cpp", rediffusable: true,
      note: "La licence vient de la fiche amont `ResembleAI/chatterbox`, qui déclare MIT. Le dépôt de conversion déclare « other » sans préciser : c'est l'amont qui fait foi, comme pour l'export de Whisper tiny, et une conversion de format est une œuvre dérivée des poids. Seul modèle de voix du catalogue qui ne porte aucune réserve non commerciale." },
  },

  // ── LA DIARISATION ET L'ALIGNEMENT FORCÉ, sous la même racine et lus par le même exécutable ──
  //
  // CE QUE LA DIARISATION FAIT, et ce qui la distingue d'une reconnaissance : elle découpe un
  // enregistrement en tours de parole et dit lequel revient au même locuteur. Celle-ci rend AUSSI
  // le texte de chaque tour, ce qui en fait un seul outil là où il en faudrait deux.
  //
  // CELLE DE NVIDIA EST MEILLEURE SUR LES EXTRAITS COURTS ET NE PEUT PAS ÊTRE REDIFFUSÉE. Mesuré
  // le 2026-10-22 sur un témoin de quatre tours dont les bascules sont connues : `sortformer_diar`
  // les trouve toutes à quatre-vingts millisecondes près pour 176 Mo et un facteur de temps réel de
  // 0,018, soit trois fois moins de poids et six fois plus vite que celle-ci. Mais sa fiche dit
  // « governed by the NVIDIA Open Model License and is local-use only until redistribution approval »,
  // et elle plafonne à VINGT SECONDES hors du fil — « request exceeds fixed graph capacity » dès
  // 20,05 s, que ni `graph_arena_mb` ni `--mode streaming` ne relèvent. Celle-ci a tourné sur
  // 178,4 s d'un coup, en rendant quarante-huit segments et EXACTEMENT deux locuteurs.
  //
  // LE PAQUET Q4 ET NON LE Q8, puisque c'est celui qui a été éprouvé : 758 293 216 octets contre
  // 1 132 Mo, et le bf16 est exclu d'office, la carte ne le faisant pas.
  "moss-transcribe-diarize-q4_k.gguf": {
    id: "parole-diarisation", nom: "Qui parle quand (MOSS)", nomEn: "Who speaks when (MOSS)",
    racine: "audiocpp", noeuds: ["qui-parle-quand"],
    licence: { nom: "Apache-2.0", credit: "OpenMOSS — MOSS-Transcribe-Diarize, converti en GGUF par le projet audio.cpp", rediffusable: true,
      note: "La fiche amont `OpenMOSS-Team/MOSS-Transcribe-Diarize` déclare Apache-2.0, et la fiche de famille d'audio.cpp ne porte aucune réserve de rediffusion, contrairement à celles de `sortformer_diar` et de `mms_forced_aligner`." },
  },

  // L'ALIGNEMENT FORCÉ PLACE UN TEXTE QU'ON CONNAÎT, et c'est pour cela qu'il est plus juste qu'une
  // reconnaissance : les mots ne sont pas devinés, seulement datés.
  //
  // CELUI DE META A ÉTÉ ÉCARTÉ SUR SA PROPRE FICHE, qui dit deux choses rédhibitoires : sa
  // normalisation de texte ne couvre que le néerlandais et l'anglais en écriture latine, et
  // « Checkpoint license: CC-BY-NC-4.0 ; no public redistribution is approved ». Celui-ci couvre
  // onze langues dont le français, et porte Apache-2.0.
  //
  // SA RÉSOLUTION EST DE QUATRE-VINGTS MILLISECONDES, mesurée : tous les instants rendus sont des
  // multiples de 0,08 s. C'est la borne de ce qu'on peut en attendre, et la notice du nœud le dit.
  "qwen3-forced-aligner-0.6b-q8_0.gguf": {
    id: "parole-alignement", nom: "Aligner un texte sur la parole (Qwen3)", nomEn: "Align text to speech (Qwen3)",
    racine: "audiocpp", noeuds: ["aligner-texte"],
    licence: { nom: "Apache-2.0", credit: "Qwen — Qwen3-ForcedAligner-0.6B, converti en GGUF par le projet audio.cpp", rediffusable: true,
      note: "La fiche amont `Qwen/Qwen3-ForcedAligner-0.6B` déclare Apache-2.0. Le paquet q8 pèse 1 129 969 856 octets et passe sous le plafond d'un asset de release avec 1 017 513 792 octets de marge." },
  },

  // L'ÉTIQUETEUR DE SONS, troisième modèle sous cette racine et lu par le même exécutable.
  //
  // CHOISI CONTRE AUDIO FLAMINGO, ET LA MESURE EST SANS APPEL. Pour décrire un audio en mots,
  // audio.cpp ne sert que deux familles d'étiquetage, `ced` et `ast_audioset`, et deux familles de
  // compréhension, `audioflamingo3` et `audio-flamingo-next`. Les Flamingo font huit milliards de
  // paramètres : le plus petit paquet utile pèse 5 459 592 448 octets, soit 2,54 fois le plafond
  // d'un asset de release, et 5 206,6 Mio de poids sur une carte de 6 144 Mio. Ils sont de surcroît
  // sous NVIDIA OneWay Noncommercial. Celui-ci pèse 342 964 768 octets, tient dans la mémoire vive
  // et porte Apache-2.0 : aucune réserve, ni commerciale ni scientifique.
  //
  // LE PAQUET « BASE » ET NON « TINY », et c'est un choix de justesse plutôt que de taille. L'amont
  // publie quatre variantes, de 22 130 464 à 342 964 768 octets ; la plus grande a été éprouvée sur
  // quatre témoins dont trois à réponse connue, et c'est elle qui est épinglée. Les trois autres
  // n'ont pas été mesurées, donc rien n'est affirmé d'elles.
  //
  // CE QU'IL SAIT ET CE QU'IL NE SAIT PAS, relevé le 2026-10-21 : les instruments, les sources, le
  // lieu et la présence d'une voix sont justes ; le GENRE ne l'est pas — un morceau de blues est
  // sorti « Ambient music » puis « New-age music ». Le genre reste donc au classeur dédié, et la
  // notice du nœud le dit plutôt que de laisser croire le contraire.
  "ced-base-f32.gguf": {
    id: "ced", nom: "Étiquetage des sons (CED)", nomEn: "Sound tagging (CED)",
    racine: "audiocpp", noeuds: ["decrire-audio"],
    licence: { nom: "Apache-2.0", credit: "CED — Consistent Ensemble Distillation, poids `mispeech`, convertis en GGUF par le projet audio.cpp", rediffusable: true,
      note: "La table de licences d'audio.cpp donne Apache-2.0 pour ces points de contrôle, usage commercial compris, et précise que le DÉPÔT D'ENTRAÎNEMENT amont est en GPL-3.0 : c'est la licence du point de contrôle qui s'applique aux poids, non celle du code qui les a produits. Les cinq cent vingt-sept classes sont celles d'AudioSet, dont l'ontologie est publiée par Google sous CC-BY-4.0 ; seuls les noms de classes en viennent, aucun de ses enregistrements." },
  },

  // LE SÉPARATEUR DE VOIX, quatrième modèle de cette racine.
  //
  // LE PAQUET F16 ET NON LE Q8, et c'est une mesure qui l'impose. Le q8_0 rend deux pistes
  // IDENTIQUES, à −2,22 dB de niveau et 18 Hz de centroïde spectral : du rebut, et silencieusement,
  // puisque l'exécutable sort en zéro. Soupçonné d'abord d'un témoin mono, il rendait le même rebut
  // en stéréo. Le f16 rend deux signaux distincts et plausibles. C'est le second paquet quantifié
  // de cette famille d'outils pris en défaut, après celui d'OmniVoice qui rendait un WAV de
  // quarante-quatre octets : une variante se mesure avant de s'épingler.
  //
  // MESURÉ CONTRE NOTRE SÉPARATEUR, sur un témoin construit dont les deux sources sont connues :
  // vingt secondes d'instrumental à −17,45 dB et une voix parlée à −27, mélangées en stéréo. Contre
  // la voix vraie, rapport signal sur distorsion de 1,24 dB contre 0,30 pour htdemucs à six pistes,
  // là où le seul mélange remis à l'échelle en vaut 0,72 : celui-ci bat le fait de ne rien faire,
  // l'autre tombe en dessous. Quatre fois mieux sur ce seul travail, sept fois plus lent.
  //
  // L'ÉCART DE NIVEAU ENTRE LES DEUX SOURCES EST LE RÉGLAGE DÉCISIF DU BANC. Un premier témoin les
  // posait au MÊME niveau et y plaçait les deux séparateurs sous la ligne du mélange brut, ce qui
  // est impossible pour une séparation qui fonctionne. La cause est arithmétique et non matérielle :
  // deux sources décorrélées mélangées à niveau égal laissent au seul mélange environ trois
  // décibels contre chacune, vérifié sur deux couples indépendants.
  //
  // CE QUE LA PROVENANCE ÉTABLIT, ET CE QU'ELLE N'ÉTABLIT PAS. La table de licences d'audio.cpp
  // donne MIT et l'usage commercial, en nommant pour poids d'origine `mlx-community/mel-roformer-
  // mlx`, qui déclare MIT lui aussi. Les deux maillons concordent donc. Mais la fiche de ce second
  // dépôt est VIDE : aucun point de contrôle d'entraînement n'est nommé, et l'attribution s'arrête
  // là. C'est moins qu'un amont identifié, plus qu'une licence absente.
  "mel-band-roformer-f16.gguf": {
    id: "mel-band-roformer", nom: "Séparation voix et accompagnement (Mel-Band RoFormer)",
    nomEn: "Vocal and backing separation (Mel-Band RoFormer)",
    racine: "audiocpp", noeuds: ["isoler-voix"],
    licence: { nom: "MIT", credit: "Mel-Band RoFormer, poids `mlx-community/mel-roformer-mlx`, convertis en GGUF par le projet audio.cpp", rediffusable: true,
      note: "La table de licences d'audio.cpp donne MIT et l'usage commercial pour cette famille, en désignant `mlx-community/mel-roformer-mlx` comme poids d'origine ; ce dépôt déclare MIT à son tour. Les deux maillons concordent. À noter cependant que la fiche du second est vide : aucun point de contrôle d'entraînement n'est nommé, de sorte que l'attribution s'arrête à ces deux publications et ne remonte pas jusqu'à qui a entraîné le modèle. Le paquet f16 est épinglé plutôt que le q8_0, que la mesure a trouvé cassé." },
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

/**
 * L'empreinte d'un fichier, lu PAR MORCEAUX et non d'un bloc.
 *
 * `readFileSync` refuse au-delà de deux gigaoctets — `ERR_FS_FILE_TOO_LARGE`, relevé sur le
 * débruiteur d'ACE-Step qui en pèse 2,43. Un modèle plus gros que cette limite ne pouvait donc
 * ni entrer au manifeste ni être vérifié, et rien ne l'annonçait avant la première tentative.
 */
const sha256 = (chemin) => {
  const h = crypto.createHash("sha256");
  const MORCEAU = 64 * 1024 * 1024;
  const tampon = Buffer.allocUnsafe(MORCEAU);
  const fd = fs.openSync(chemin, "r");
  try {
    let lus = 0;
    while ((lus = fs.readSync(fd, tampon, 0, MORCEAU, null)) > 0) h.update(tampon.subarray(0, lus));
  } finally {
    fs.closeSync(fd);
  }
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

// « Mo » DÉSIGNE UN MILLION D'OCTETS, et ce diviseur était 1 048 576 : les tailles annoncées
// étaient donc des mébioctets portant le mot mégaoctet, 4,9 % en dessous de la vérité. Le dépôt a
// déjà payé cette confusion deux fois sur la taille de l'installeur. `src/core/octets.ts` porte le
// même calcul pour l'application ; ce script ne peut pas l'importer, étant en CommonJS hors de la
// compilation, d'où le diviseur écrit ici avec sa raison.
const mo = (octets) => (octets / 1000000).toFixed(1);

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

/** Combien d'octets la sonde lit à la fin de l'asset distant. */
const SONDE = 1048576;

/**
 * Que faire d'un téléversement refusé : l'adresse se rattrape, ou le modèle doit changer de nom.
 *
 * ÉCRIT D'UNE PERTE, le 2026-10-21. Le manifeste avait oublié l'adresse de `chatterbox-q8_0.gguf`
 * alors que l'asset était déjà sur la release, et republier était impossible : `gh release upload`
 * refuse un doublon — volontairement, cf. l'absence de `--clobber` plus bas — et `publier()`
 * n'inscrivait l'adresse qu'APRÈS un téléversement réussi. Un envoi réussi dont le manifeste n'a pas
 * gardé la trace ne pouvait donc plus se rattraper, et il a fallu écrire l'adresse à la main. C'est
 * le contraire de ce que cette commande existe pour faire.
 *
 * LE RATTRAPAGE NE SE DÉCIDE PAS SUR LE SEUL MESSAGE. Un asset de même nom et de contenu différent
 * est exactement le cas que l'absence de `--clobber` protège : inscrire son adresse ferait vérifier
 * aux installations une empreinte qui ne correspond pas à ce qu'elles téléchargent. La taille
 * tranche donc avant le nom, et l'appelant sonde encore la fin du fichier.
 */
function rattrapageDUnAssetPresent(journalErreur, octetsLocaux, octetsDistants) {
  if (!/already exists/i.test(journalErreur || "")) {
    return { rattrapable: false, raison: "le téléversement a échoué pour une autre raison." };
  }
  if (!Number.isFinite(octetsDistants)) {
    return { rattrapable: false, raison: "l'asset est annoncé présent, et la release ne le liste pas." };
  }
  if (octetsDistants !== octetsLocaux) {
    return { rattrapable: false,
      raison: `l'asset présent pèse ${octetsDistants} octets et le fichier local ${octetsLocaux} : `
        + "deux contenus sous un même nom. Un modèle dont le contenu change doit changer de nom." };
  }
  return { rattrapable: true };
}

/** La taille de l'asset tel que la release le porte, ou `null` s'il n'y est pas. */
function octetsDeLAsset(nomAsset) {
  const r = spawnSync("gh", ["release", "view", RELEASE, "--json", "assets"],
    { cwd: RACINE, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) return null;
  try {
    const trouve = (JSON.parse(r.stdout).assets || []).find((a) => a.name === nomAsset);
    return trouve ? trouve.size : null;
  } catch { return null; }
}

/**
 * Lit une plage d'octets d'une URL, en refusant un 200.
 *
 * POURQUOI CE N'EST PAS `telechargerFichier`, alors que le dépôt réemploie partout le tuyau de
 * l'application. Ce téléchargeur TOLÈRE qu'une plage revienne en 200 : il tronque et reprend le
 * fichier entier, ce qui est juste pour lui, puisqu'il veut le fichier. Ici on veut une SONDE, et
 * une sonde qui rapatrierait deux gigaoctets pour en vérifier un mébioctet n'en est plus une. Un
 * 200 est donc un échec et non un repli : les deux contrats sont opposés, d'où deux fonctions.
 */
function sonderPlage(url, debut, longueur, profondeur = 0) {
  return new Promise((resoudre) => {
    if (profondeur > 5) return resoudre({ ok: false, erreur: "trop de redirections" });
    let cible;
    try { cible = new URL(url); } catch { return resoudre({ ok: false, erreur: `URL invalide : ${url}` }); }
    const entetes = { "User-Agent": "Attic", Range: `bytes=${debut}-${debut + longueur - 1}` };
    const req = https.get(cible, { headers: entetes }, (res) => {
      // LA PLAGE TRAVERSE LA REDIRECTION, comme pour le téléchargeur : `github.com` rend un 302 sans
      // la regarder, et c'est l'hôte final qui l'honore.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resoudre(sonderPlage(new URL(res.headers.location, cible).href, debut, longueur, profondeur + 1));
      }
      if (res.statusCode !== 206) {
        res.resume();
        return resoudre({ ok: false, erreur: `HTTP ${res.statusCode} : la plage n'a pas été honorée.` });
      }
      const morceaux = [];
      res.on("data", (bloc) => morceaux.push(bloc));
      res.on("error", (e) => resoudre({ ok: false, erreur: e.message }));
      res.on("end", () => resoudre({ ok: true, octets: Buffer.concat(morceaux) }));
    });
    req.on("error", (e) => resoudre({ ok: false, erreur: e.message }));
  });
}

/**
 * La fin de l'asset distant est-elle celle du fichier local ?
 *
 * CE QUE CELA PROUVE, ET CE QUE CELA NE PROUVE PAS. Joint à l'égalité des tailles, cela établit que
 * l'envoi est allé jusqu'au bout : la panne réaliste est une coupure, et le premier envoi de
 * Chatterbox était justement tombé sur un HTTP 408. Cela n'établit PAS l'empreinte complète, qui
 * demanderait de rapatrier le fichier entier — `--telecharger` puis `--verifier` le font, au prix du
 * volume. Le message le dit plutôt que de laisser croire à une vérification totale.
 */
async function memeFin(url, fichier, octets) {
  const longueur = Math.min(SONDE, octets);
  const sonde = await sonderPlage(url, octets - longueur, longueur);
  if (!sonde.ok) return { ok: false, raison: sonde.erreur };
  const local = Buffer.alloc(longueur);
  const fd = fs.openSync(fichier, "r");
  try { fs.readSync(fd, local, 0, longueur, octets - longueur); } finally { fs.closeSync(fd); }
  const empreinte = (b) => crypto.createHash("sha256").update(b).digest("hex");
  return empreinte(sonde.octets) === empreinte(local)
    ? { ok: true, longueur }
    : { ok: false, raison: `les ${longueur} derniers octets diffèrent de ceux du fichier local.` };
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
async function publier(ids = []) {
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
    //
    // L'ERREUR EST CAPTÉE, L'AVANCEMENT NON : `gh` écrit sa barre de progression sur la sortie
    // standard, qu'on laisse passer, et son refus sur la sortie d'erreur, qu'il faut lire pour
    // distinguer « déjà présent » d'un échec réel. Ce qui est capté est réaffiché, sans quoi
    // l'opérateur perdrait le message au moment où il en a le plus besoin.
    const r = spawnSync("gh", ["release", "upload", RELEASE, fichier],
      { cwd: RACINE, stdio: ["inherit", "inherit", "pipe"], encoding: "utf8",
        shell: process.platform === "win32" });
    const url = `${BASE_RELEASE}/${nomAsset}`;
    if (r.status !== 0) {
      const journal = r.stderr || "";
      if (journal.trim()) process.stderr.write(journal.endsWith("\n") ? journal : `${journal}\n`);
      const rattrapage = rattrapageDUnAssetPresent(journal, octets, octetsDeLAsset(nomAsset));
      if (!rattrapage.rattrapable) {
        console.error(`échec du téléversement de ${nomAsset} : ${rattrapage.raison}`);
        process.exit(1);
      }
      const fin = await memeFin(url, fichier, octets);
      if (!fin.ok) {
        console.error(`échec du rattrapage de ${nomAsset} : ${fin.raison}`);
        process.exit(1);
      }
      console.log(`${nomAsset} était déjà sur la release, de même taille et de même fin`
        + ` (${fin.longueur} octets sondés) : son adresse est inscrite sans nouvel envoi.`
        + " L'empreinte complète se vérifie par « --telecharger » puis « --verifier ».");
    }
    m.source = { type: m.source.type, url, octets, sha256: sha256(fichier) };
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
else if (arg === "--publier") {
  publier(process.argv.slice(3)).catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
} else if (arg === "--telecharger") {
  telecharger(process.argv.slice(3)).catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
} else {
  console.log("usage : node scripts/modeles.cjs --generer | --verifier | --publier [id…]"
    + " | --telecharger [id…]");
  process.exitCode = 1;
}

module.exports = { fichiersDe, CONNUS, MANIFESTE, rattrapageDUnAssetPresent };
