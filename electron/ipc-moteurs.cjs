// electron/ipc-moteurs.cjs — Les moteurs : ce que le processus principal calcule, sépare, transcrit, génère ou fait dire.
//
// TIRÉ DE `main.cjs` LE 2026-11-08, tel quel, par le lot 5 de la revue d'architecture du
// 2026-10-31. C'est le cinquième des sept modules qui reprennent par famille les canaux de
// `main.cjs`, après `ipc-maj.cjs`, `ipc-scripts.cjs`, `ipc-fichiers.cjs` et `ipc-modeles.cjs`.
// Aucune ligne de calcul n'a été retouchée : les deux blocs sont les mêmes, indentés d'un cran dans
// la fonction qui les installe, et mis bout à bout dans leur ordre d'avant.
//
// LES VINGT CANAUX : les quatre moteurs ONNX du premier bloc (`demucs:`, `stable-audio-3:`,
// `esthetique:`, `sdxs-image:`), puis Ollama et les moteurs du second (`songsee:`, `acestep:`,
// `muscriptor:`, `sdcpp:`, `chatterbox:`, `qwen3asr:`, `parakeet:`, `apollo:`, `parole:`, `ced:`,
// `roformer:`). OLLAMA EN EST, bien qu'il ne tourne ni dans un processus enfant ni par ONNX : c'est
// un modèle de langue servi par un serveur local, et il génère comme les autres.
//
// ILS S'ENREGISTRENT ENSEMBLE, juste après les modèles, et non à la place de leur premier bloc.
// Deux d'entre eux, `stable-audio-3:generer` et `sdcpp:moss`, prennent eux-mêmes leur paquet par
// ce que l'appel d'`ipc-modeles.cjs` rend : posé plus haut, cet appel-ci lirait ces noms avant
// qu'ils existent. Les canaux du premier bloc s'inscrivent donc un peu plus tard qu'avant, ceux du
// second un peu plus tôt, toujours au chargement et avant toute fenêtre ; aucun canal ne dépend de
// l'ordre où les autres s'inscrivent.
//
// IL REÇOIT CE DONT IL A BESOIN, et ne requiert pas `electron` : c'est la forme d'`ipc-maj.cjs`.
// `ipcMain` lui vient déjà emballé ; le contexte des ressources reste dans `main.cjs`, qui retient
// le dossier des modèles ; et les quatre noms du téléchargement lui viennent d'`ipc-modeles.cjs`,
// par `main.cjs`.
"use strict";

const fs = require("fs");
const path = require("path");
const { resoudreRessource } = require("./chemins-ressources.cjs");
const { separerDemucs } = require("./demucs.cjs");
const { generate: genererStableAudio3 } = require("./stable-audio-3.cjs");
const { generate: genererSdxsImage } = require("./sdxs-image.cjs");
const { noterTranche: noterTrancheEsthetique, FICHIER_MODELE: MODELE_ESTHETIQUE } = require("./esthetique.cjs");
const { genererSongsee } = require("./songsee.cjs");
const { inventaire: inventaireModeles } = require("./telechargement-modeles.cjs");

/**
 * Installe les vingt canaux des moteurs.
 *
 * @param ipcMain                le récepteur des IPC, déjà emballé par `main.cjs` ;
 * @param contexteRessources     le contexte de résolution des ressources de `main.cjs` ;
 * @param lireManifesteModeles   le manifeste des modèles, rendu par `ipc-modeles.cjs` ;
 * @param sondesModeles          les sondes de l'inventaire, rendues par `ipc-modeles.cjs` ;
 * @param telechargerModeles     la file des téléchargements, rendue par `ipc-modeles.cjs` ;
 * @param telechargementEnCours  ce qui dit si un téléchargement tourne, rendu par `ipc-modeles.cjs`.
 */
function installerIpcMoteurs({
  ipcMain, contexteRessources,
  lireManifesteModeles, sondesModeles, telechargerModeles, telechargementEnCours,
}) {
  // --- IPC : séparation Demucs en natif (onnxruntime-node) ---
  // onnxruntime-web (WASM) ne peut pas charger ce modèle de 166 Mo ; on l'exécute
  // donc dans le process principal, sans limite mémoire du WASM.
  ipcMain.handle("demucs:separer", async (_event, options) => {
    try {
      const { modelePath: cheminExplicite, canaux, utiliserModeleEmbarque, modele6s } = options;
      let modelePath = cheminExplicite;
      if (utiliserModeleEmbarque || !modelePath) {
        const fichier6s = "htdemucs_6s.onnx";
        const fichier4s = "htdemucs_fp16weights.onnx";
        const cible = modele6s ? fichier6s : fichier4s;
        // `resoudreRessource` PLUTÔT QU'UNE LISTE DE CANDIDATS ÉCRITE ICI, et c'est ce qui rend ces
        // poids atteignables du tout. La liste ne contenait pas le dossier inscriptible où le
        // téléchargeur pose ce qu'il a pris : les poids de Demucs n'ayant pas d'adresse, personne ne
        // pouvait les y déposer et le manque ne se voyait pas. Maintenant qu'ils se téléchargent, un
        // installeur sans modèles les aurait cherchés partout sauf là où ils sont.
        modelePath = resoudreRessource(path.join("oonx", cible), contexteRessources()) || modelePath;
      }
      if (!modelePath || !fs.existsSync(modelePath)) {
        // LE CHEMIN CHERCHÉ EST DIT, et non « undefined » : quand aucun candidat n'existait, la
        // variable était vide et le message affichait le mot. Il ne disait donc ni ce qui manque,
        // ni où l'on avait regardé.
        return { ok: false, erreur: `Modèle de séparation introuvable : ${modelePath || `oonx/${modele6s ? fichier6s : fichier4s}`}` };
      }
      const nbStems = modele6s ? 6 : 4;
      const chans = canaux.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c)));
      const stems = await separerDemucs(modelePath, chans, undefined, options.chevauchement, nbStems);
      return { ok: true, stems };
    } catch (err) {
      return { ok: false, erreur: String(err && err.message ? err.message : err) };
    }
  });

  // --- IPC : Stable Audio 3 text-to-audio (process principal, onnxruntime-node) ---
  ipcMain.handle("stable-audio-3:generer", async (evenement, options) => {
    try {
      const { prompt, seconds, steps, seed, modelPath: cheminExplicite, paquet, calcul } = options;
      // DEUX PAQUETS SOUS LE MÊME MOTEUR. « music » est celui du nœud musical, « sfx » celui du
      // bruitage. Le renderer nomme celui qu'il veut, il n'écrit pas de chemin : les racines
      // possibles ne sont connues que d'ici, et elles changent entre le développement et l'installé.
      const cible = paquet === "sfx" ? "stable-audio-3-small-sfx" : "stable-audio-3-small-music";
      const idModele = paquet === "sfx" ? "stable-audio-3-sfx" : "stable-audio-3";
      // `resoudreRessource` PLUTÔT QU'UNE LISTE DE CANDIDATS ÉCRITE ICI : c'est elle qui connaît le
      // dossier inscriptible où les modèles téléchargés se posent, que la liste précédente ignorait.
      // Un paquet pris par la barre d'outils n'y aurait donc jamais été trouvé.
      let modelDir = resoudreRessource(cheminExplicite || path.join("oonx", cible), contexteRessources());

      // LE PAQUET SE PREND TOUT SEUL À LA PREMIÈRE UTILISATION — demandé par Fabien. La règle écrite
      // en tête de `telechargement-modeles.cjs` était de ne rien prendre sans que l'utilisateur le
      // décide, et elle vaut toujours pour le bouton de la barre d'outils, qui prend tout. Ici le
      // composant vient d'être lancé : l'intention est explicite et porte sur UN paquet, et renvoyer
      // vers un bouton ferait faire deux gestes pour une seule volonté.
      if (!cheminExplicite && (!modelDir || !fs.existsSync(modelDir))) {
        const manifeste = lireManifesteModeles();
        const entree = (manifeste.modeles ?? []).find((m) => m.id === idModele && m.source?.url);
        if (!entree) {
          return { ok: false, erreur: `Paquet « ${cible} » introuvable, et absent du manifeste des modèles.` };
        }
        if (telechargementEnCours()) {
          return { ok: false, erreur: "Un téléchargement de modèle est déjà en cours ; relancez quand il sera fini." };
        }
        const pris = await telechargerModeles([entree], (etat) => evenement.sender.send("modeles:progression", etat));
        if (!pris.ok) {
          return { ok: false, erreur: `Le paquet « ${entree.nom} » n'a pas pu être récupéré : ${pris.erreur ?? "annulé"}` };
        }
        modelDir = resoudreRessource(path.join("oonx", cible), contexteRessources());
      }

      if (!modelDir || !fs.existsSync(modelDir)) {
        // PAS DE REPLI SUR L'AUTRE PAQUET : le bruitage rendu par le modèle musical est précisément
        // le défaut qu'on répare ici. Mieux vaut dire ce qui manque que sonner faux sans prévenir.
        return { ok: false, erreur: `Paquet « ${cible} » introuvable, même après téléchargement.` };
      }
      const result = await genererStableAudio3({ prompt, seconds, steps, seed, modelDir, calcul });
      // LE PAQUET EMPLOYÉ REMONTE AVEC LE SON, et le nœud l'affiche. Fabien a écouté un rendu du
      // modèle musical alors que le réglage annonçait celui de bruitage : le processus principal
      // n'avait pas été relancé, donc il ignorait encore le nom du paquet demandé. L'interface
      // promettait ce que le moteur ne faisait pas, et rien ne le disait. Désormais c'est le moteur
      // qui parle, et un décalage se voit à la première exécution.
      return { ok: true, ...result, paquet: cible };
    } catch (err) {
      console.error("[attic] stable-audio-3:generer erreur:", err);
      return { ok: false, erreur: String(err && err.message ? err.message : err) };
    }
  });

  // --- IPC : Audiobox Aesthetics, une tranche de 10 s (process principal, onnxruntime-node) ---
  // Le rendu prépare les tranches (mono, 16 kHz) et appelle une fois par tranche, ce qui
  // lui laisse afficher la progression. La session est gardée entre les appels.
  ipcMain.handle("esthetique:noter-tranche", async (_event, options) => {
    try {
      const candidats = [
        path.join(__dirname, "..", "public", "oonx", MODELE_ESTHETIQUE),
        path.join(__dirname, "..", "dist", "oonx", MODELE_ESTHETIQUE),
        path.join(process.resourcesPath || "", "oonx", MODELE_ESTHETIQUE),
      ];
      const cheminModele = candidats.find((p) => p && fs.existsSync(p));
      if (!cheminModele) return { ok: false, modeleAbsent: true, erreur: `Modèle introuvable : oonx/${MODELE_ESTHETIQUE}` };
      const signal = options.signal instanceof Float32Array ? options.signal : Float32Array.from(options.signal);
      const scores = await noterTrancheEsthetique(cheminModele, signal, options.utiles);
      return { ok: true, scores };
    } catch (err) {
      return { ok: false, erreur: String(err && err.message ? err.message : err) };
    }
  });

  // --- IPC : SDXS-512 texte->image (process principal, onnxruntime-node) ---
  // Modèle embarqué (~680 Mo quantifié int8) dans resources/oonx/sdxs-512-texte-image
  // via extraResources. L'utilisateur peut aussi fournir un chemin explicite.
  ipcMain.handle("sdxs-image:generer", async (_event, options) => {
    try {
      const { prompt, seed, modelPath: cheminExplicite, calcul } = options;
      let modelDir = cheminExplicite;
      if (!modelDir) {
        const cible = "sdxs-512-texte-image";
        const candidats = [
          path.join(__dirname, "..", "public", "oonx", cible),
          path.join(__dirname, "..", "dist", "oonx", cible),
          path.join(process.resourcesPath || "", "oonx", cible),
        ];
        modelDir = candidats.find((p) => p && fs.existsSync(p)) || null;
      } else {
        modelDir = resoudreRessource(modelDir, contexteRessources());
      }
      if (!modelDir || !fs.existsSync(modelDir)) {
        return { ok: false, erreur: `Bundle SDXS-512 introuvable : ${modelDir}` };
      }
      const result = await genererSdxsImage({ prompt, seed, modelDir, calcul });
      return { ok: true, rgba: result.rgba, width: result.width, height: result.height, seed: result.seed };
    } catch (err) {
      console.error("[attic] sdxs-image:generer erreur:", err);
      return { ok: false, erreur: String(err && err.message ? err.message : err) };
    }
  });

  // --- IPC : Ollama (LLM local) ---
  // Proxy vers le serveur Ollama local (port 11434) depuis le main process : évite
  // la CSP et le CORS du renderer. fetch global (Node 18+ via Electron).
  const OLLAMA_BASE = process.env.ATTIC_OLLAMA_URL || "http://127.0.0.1:11434";
  function erreurOllama(e) {
    const s = String(e?.cause?.code || e?.message || e);
    if (e?.name === "AbortError") return "Délai dépassé — le premier appel doit charger le modèle en mémoire (plusieurs minutes pour un gros modèle). Augmentez « Délai max » sur le nœud.";
    if (/ECONNREFUSED|ENOTFOUND|fetch failed/i.test(s)) return "Serveur Ollama injoignable sur :11434 (lancez « ollama serve »).";
    return s;
  }
  ipcMain.handle("ollama:generer", async (_event, options) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), options?.timeout || 120000);
      // Use /api/chat endpoint (more reliable for newer models like qwen3)
      const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options?.model || "llama3.2",
          messages: [{ role: "user", content: options?.prompt || "" }],
          stream: false,
          think: false,
          options: options?.options || {},
          ...(options?.format ? { format: options.format } : {}),
          // Zéro décharge le modèle aussitôt la réponse rendue : voir `OptsOllama` dans `ollama.ts`.
          ...(typeof options?.keepAlive === "number" ? { keep_alive: options.keepAlive } : {}),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) {
        let detail = "";
        try { const b = await r.json(); if (b && b.error) detail = ` — ${b.error}`; } catch {}
        return { erreur: `Ollama HTTP ${r.status}${detail}` };
      }
      const data = await r.json();
      console.log("[attic] Ollama response:", JSON.stringify(data).slice(0, 500));
      // Qwen3 and similar models put reasoning in message.thinking and answer in message.content
      // If content is empty, use thinking as fallback
      const content = (data && data.message && data.message.content) || "";
      const thinking = (data && data.message && data.message.thinking) || "";
      let reponse = content;
      const thinkEnd = content.indexOf("</think>");
      
      if (options && options.thinking) {
        // Node thinking : retourner le raisonnement
        if (thinkEnd !== -1) {
          reponse = content.slice(0, thinkEnd).replace(/<\/?think>/g, "").trim();
        } else if (thinking && thinking.trim()) {
          reponse = thinking.trim();
        } else {
          // Pas de tag : tout est du thinking
          reponse = content.replace(/<\/?think>/g, "").trim();
        }
      } else {
        // Node normal : retourner la reponse (apres  si present
        if (thinkEnd !== -1) {
          reponse = content.slice(thinkEnd + 8).trim();
        } else {
          reponse = content.replace(/<\/?think>/g, "").trim();
        }
      }
      
      if (!reponse) reponse = content.trim() || (data && data.response) || "";
      return { reponse };
    } catch (e) {
      return { erreur: erreurOllama(e) };
    }
  });
  ipcMain.handle("ollama:modeles", async () => {
    try {
      const r = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (!r.ok) return { erreur: `Ollama HTTP ${r.status}` };
      const data = await r.json();
      return { modeles: (data.models || []).map((m) => m.name) };
    } catch (e) {
      return { erreur: erreurOllama(e) };
    }
  });

  // --- IPC : Générer une visualisation Songsee depuis un fichier audio ---
  ipcMain.handle("songsee:generer", async (_event, { cheminEntree, options }) => {
    try {
      const result = await genererSongsee(cheminEntree, options);
      return { ok: true, ...result };
    } catch (err) {
      console.error("[attic] songsee:generer a échoué :", err);
      return { ok: false, erreur: err?.message || String(err) };
    }
  });

  // --- IPC : la chanson locale, planifiée puis rendue ---
  //
  // L'AVANCEMENT REPART VERS LA FENÊTRE QUI A DEMANDÉ, et non vers toutes : deux nœuds qui
  // travaillent en même temps dans deux fenêtres ne doivent pas se raconter l'avancement l'un de
  // l'autre. `event.sender` est celui qui a appelé.
  const { planifier: acestepPlanifier, rendre: acestepRendre } = require("./acestep.cjs");

  const avancementVers = (event, phase) => (ligne) => {
    if (!event.sender.isDestroyed()) event.sender.send("acestep:progression", { phase, ligne });
  };

  ipcMain.handle("acestep:planifier", async (event, options) => {
    try {
      return await acestepPlanifier(options, avancementVers(event, "planification"), contexteRessources());
    } catch (err) {
      console.error("[attic] acestep:planifier a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  ipcMain.handle("acestep:rendre", async (event, options) => {
    try {
      return await acestepRendre(options, avancementVers(event, "rendu"), contexteRessources());
    } catch (err) {
      console.error("[attic] acestep:rendre a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : la transcription d'un audio en MIDI ───
  const { transcrire: muscriptorTranscrire } = require("./muscriptor.cjs");

  ipcMain.handle("muscriptor:transcrire", async (event, options) => {
    try {
      const sortie = await muscriptorTranscrire(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("muscriptor:progression", { ligne });
      }, contexteRessources());
      return sortie;
    } catch (err) {
      console.error("[attic] muscriptor:transcrire a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── stable-diffusion.cpp : une image tirée d'un texte, par MOSS-Image ───
  //
  // LES FICHIERS SE PRENNENT TOUT SEULS À LA PREMIÈRE UTILISATION, comme le paquet de Stable Audio 3
  // et pour la même raison : le composant vient d'être lancé, l'intention est explicite. Le modèle
  // tient en QUATRE paquets du manifeste, et seuls ceux qui manquent sont pris.
  const { genererMoss, fichiersManquants: fichiersMossManquants } = require("./sdcpp.cjs");

  ipcMain.handle("sdcpp:moss", async (event, options) => {
    try {
      if (fichiersMossManquants(contexteRessources()).length > 0) {
        const manifeste = lireManifesteModeles();
        const aPrendre = inventaireModeles(manifeste, sondesModeles()).modeles
          .filter((m) => m.noeuds.includes("texte-image-moss") && !m.complet).map((m) => m.id);
        const file = (manifeste.modeles ?? []).filter((m) => aPrendre.includes(m.id) && m.source?.url);
        if (file.length < aPrendre.length) return { ok: false, journal: "Un fichier de MOSS-Image est absent du manifeste des modèles." };
        if (telechargementEnCours()) {
          return { ok: false, journal: "Un téléchargement de modèle est déjà en cours ; relancez quand il sera fini." };
        }
        const pris = await telechargerModeles(file, (etat) => event.sender.send("modeles:progression", etat));
        if (!pris.ok) return { ok: false, journal: `MOSS-Image n'a pas pu être récupéré : ${pris.erreur ?? "annulé"}` };
      }
      return await genererMoss(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("sdcpp:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] sdcpp:moss a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : le clonage d'une voix depuis un extrait ───
  //
  // MÊME EXÉCUTABLE, AUTRE FAMILLE, ET DONC AUTRE CANAL D'AVANCEMENT : les deux tâches peuvent
  // tourner en même temps, et mêler leurs lignes de journal dirait n'importe quoi sur les deux.
  // MÊME MODULE, DEUX TÂCHES : le clonage fait dire un texte à une voix, la conversion garde les
  // mots d'un enregistrement et lui donne un autre timbre. Même modèle, donc deux canaux d'avancement
  // distincts, les deux pouvant tourner en même temps.
  const { cloner: chatterboxCloner, convertir: chatterboxConvertir } = require("./chatterbox.cjs");

  ipcMain.handle("chatterbox:convertir", async (event, options) => {
    try {
      return await chatterboxConvertir(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("chatterbox:conversion-progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] chatterbox:convertir a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  ipcMain.handle("chatterbox:cloner", async (event, options) => {
    try {
      return await chatterboxCloner(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("chatterbox:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] chatterbox:cloner a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : transcrire, par un second moteur que le premier ne remplace pas ───
  const { transcrire: qwen3Transcrire } = require("./qwen3-asr.cjs");

  ipcMain.handle("qwen3asr:transcrire", async (event, options) => {
    try {
      return await qwen3Transcrire(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("qwen3asr:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] qwen3asr:transcrire a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : les mots d'un enregistrement, et l'instant de chacun ───
  const { transcrire: parakeetTranscrire } = require("./parakeet.cjs");

  ipcMain.handle("parakeet:transcrire", async (event, options) => {
    try {
      return await parakeetTranscrire(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("parakeet:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] parakeet:transcrire a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : la restauration d'un son abîmé par la compression ───
  const { restaurer: apolloRestaurer } = require("./apollo.cjs");

  ipcMain.handle("apollo:restaurer", async (event, options) => {
    try {
      return await apolloRestaurer(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("apollo:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] apollo:restaurer a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  // ─── audio.cpp : qui parle quand, et où tombe chaque mot ───
  //
  // DEUX CANAUX ET NON UN, pour la raison écrite juste au-dessus : la diarisation d'un entretien et
  // l'alignement d'un texte peuvent tourner côte à côte, et un seul canal d'avancement mêlerait
  // leurs lignes.
  const { diariser: paroleDiariser, aligner: paroleAligner } = require("./parole.cjs");

  ipcMain.handle("parole:diariser", async (event, options) => {
    try {
      return await paroleDiariser(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("parole:diarisation-progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] parole:diariser a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  ipcMain.handle("parole:aligner", async (event, options) => {
    try {
      return await paroleAligner(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("parole:alignement-progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] parole:aligner a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  const { etiqueter: cedEtiqueter } = require("./ced.cjs");

  ipcMain.handle("ced:etiqueter", async (event, options) => {
    try {
      return await cedEtiqueter(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("ced:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] ced:etiqueter a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });

  const { separer: roformerSeparer } = require("./roformer.cjs");

  ipcMain.handle("roformer:separer", async (event, options) => {
    try {
      return await roformerSeparer(options, (ligne) => {
        if (!event.sender.isDestroyed()) event.sender.send("roformer:progression", { ligne });
      }, contexteRessources());
    } catch (err) {
      console.error("[attic] roformer:separer a échoué :", err);
      return { ok: false, journal: err?.message || String(err) };
    }
  });
}

module.exports = { installerIpcMoteurs };
