// plugins/analyse.ts — Nœuds d'analyse
import { enregistrer } from "../core";
import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { analyserAudio, classerGenre, transcrireMono, transcrirePolyphonique, notesVersFichierMidi, detecterAccords, accordsVersTexte } from "../audio";
import { langueCourante } from "../i18n";

for (const def of [
  {
    id: "analyse-audio", nom: "Analyse audio", univers: "Visualisation", famille: "Analyse",
    resume: "Analyse tempo, tonalité, type chanson/instrumental.",
    entrees: [{ nom: "Piste", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Analyse", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: "Aucune entrée." };
      const resultat = analyserAudio(audio);
      return { valeurs: [audio, resultat.description] };
    },
  },
  {
    id: "lecteur-analyse", nom: "Lecteur d'analyse", univers: "Visualisation", famille: "Analyse",
    resume: "Affiche le résultat d'une analyse et permet l'écoute.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Analyse", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audioIn = ctx.entree(0);
      const texte = ctx.entree(1);
      if (typeof texte !== "string") return { valeurs: [null], message: "Branchez la sortie Analyse." };
      return { valeurs: [audioIn instanceof AudioBuffer ? audioIn : null], message: texte };
    },
  },
  {
    id: "classificateur-genre", nom: "Classificateur de genre", univers: "Visualisation", famille: "Analyse",
    resume: "Identifie le genre musical d'un morceau via IA ou heuristiques.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Genres", type: "texte" }],
    parametres: [
      { nom: "Mode", type: "choix", options: ["IA (ONNX)","Heuristique"], defaut: "IA (ONNX)" },
      { nom: "Durée", plage: [5,120], defaut: 30, unite: "s" },
    ],
    async executer(ctx: any) {
      ctx.onProgress("Extraction des caractéristiques…");
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: "Aucune entrée." };
      const duree = ctx.paramNombre("Durée", 30);
      const mode = ctx.paramTexte("Mode", "IA (ONNX)");
      const buf = mode === "IA (ONNX)" && ctx.noeud.data.modeleFichier
        ? await (ctx.noeud.data.modeleFichier as File).arrayBuffer() : undefined;
      ctx.onProgress("Classification…");
      const genres = await classerGenre(audio, duree, buf);
      if (!genres.length) return { valeurs: [audio, null], message: "Classification non disponible." };
      const descr = genres[0].description || genres.map((g: any) => `${g.genre} (${Math.round(g.confiance*100)}%)`).join(" · ");
      const source = genres[0].description?.includes("modèle ONNX") ? "ONNX" : "heuristique";
      return { valeurs: [audio, descr], message: `${genres[0].genre} ${Math.round(genres[0].confiance*100)}% · ${source}` };
    },
  },
  {
    id: "transcripteur-midi", nom: "Transcripteur MIDI", nomEn: "MIDI Transcriber", univers: "Sorties", famille: "Écoute",
    resume: "Transcrit un signal audio en notes MIDI.",
    resumeEn: "Transcribes an audio signal into MIDI notes.",
    noticeEn: "Transcribes an audio signal into MIDI notes. FFT mono or Basic Pitch ONNX polyphonic.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Méthode", nomEn: "Method", type: "choix", options: ["Monophonique (FFT)","Polyphonique (Basic Pitch ONNX)"], defaut: "Monophonique (FFT)", docEn: "Transcription algorithm." },
      { nom: "Seuil onset", nomEn: "Onset threshold", plage: [1,50], defaut: 10, unite: "%", docEn: "Note attack detection sensitivity." },
      { nom: "Note minimale", nomEn: "Min note", plage: [21,120], defaut: 36, docEn: "Lowest MIDI note to detect." },
      { nom: "Note maximale", nomEn: "Max note", plage: [21,127], defaut: 96, docEn: "Highest MIDI note to detect." },
      { nom: "Tempo du fichier MIDI", nomEn: "MIDI tempo", plage: [40,240], defaut: 120, unite: "BPM", docEn: "Tempo of the generated MIDI file." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée audio." };
      const methode = ctx.paramTexte("Méthode", "Monophonique (FFT)");
      const seuil = ctx.paramNombre("Seuil onset", 10);
      const noteMin = ctx.paramNombre("Note minimale", 36);
      const noteMax = ctx.paramNombre("Note maximale", 96);
      let tempo = ctx.paramNombre("Tempo du fichier MIDI", 120);
      // Auto-détection du tempo si le paramètre n'a pas été changé manuellement
      if (tempo === 120) {
        try {
          const { tempo: tDetecte } = analyserAudio(audio);
          if (tDetecte > 0) tempo = tDetecte;
        } catch {}
      }
      const notes = methode === "Polyphonique (Basic Pitch ONNX)"
        ? await transcrirePolyphonique(audio, seuil, noteMin, noteMax)
        : transcrireMono(audio, seuil, noteMin, noteMax);
      if (!notes.length) return { valeurs: [null], message: "Aucune note détectée." };
      const fichier = notesVersFichierMidi(notes, tempo);
      return { valeurs: [fichier], message: `MIDI — ${notes.length} notes transcrites` };
    },
  },
  {
    id: "detecteur-accords", nom: "Détecteur d'accords", nomEn: "Chord Detector", univers: "Visualisation", famille: "Analyse",
    resume: "Détecte la progression d'accords dans le signal audio.",
    resumeEn: "Detects the chord progression in the audio signal.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fenêtre d'analyse", nomEn: "Analysis window", plage: [0.1, 5], pas: 0.1, defaut: 0.5, unite: "s",
        doc: "Durée de chaque fenêtre d'analyse. Plus courte = plus précis temporellement mais moins stable ; plus longue = plus stable mais moins détaillé.",
        docEn: "Duration of each analysis window. Shorter = more time-precise but less stable; longer = more stable but less detailed." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée audio." };
      const langue = langueCourante();
      const fenetre = ctx.paramNombre("Fenêtre d'analyse", 0.5);
      ctx.onProgress("Analyse harmonique…");
      const accords = detecterAccords(audio, fenetre, (p) => ctx.onProgress(`Analyse ${p}%`));
      if (accords.length === 0) return { valeurs: [audio], message: langue === "en" ? "No chords detected." : "Aucun accord détecté." };
      const texte = accordsVersTexte(accords, langue);
      const fr = langue === "fr";
      const resume = `${accords.length} ${fr ? "accords" : "chords"} · ${accords.map((a: any) => a.nomEn.split(" ").pop()).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i).slice(0, 5).join(" → ")}`;
      return { valeurs: [audio], message: `${texte}\n\n${resume}` };
    },
  },
] as PluginDef[]) enregistrer(avecDoc(def));
