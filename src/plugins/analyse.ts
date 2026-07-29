// plugins/analyse.ts — Nœuds d'analyse

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { analyserAudio, classerGenre, transcrireMono, transcrirePolyphonique, notesVersFichierMidi, detecterAccords, accordsVersTexte, calculerCentroidSpectralMeyda, calculerRMS_Meyda, calculerZCR_Meyda, calculerRolloffSpectralMeyda, appliquerInstrumentMidi, type OptionsCentroidSpectral, type ResultatCentroidSpectral } from "../audio";
import { langueCourante, traduire } from "../i18n";;
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";

function noeudMeyda(
  id: string,
  nom: string,
  nomEn: string,
  resume: string,
  resumeEn: string,
  nomSortie: string,
  fn: (audio: AudioBuffer, options: OptionsCentroidSpectral) => ResultatCentroidSpectral,
): FicheAudio {
  return {
    id, nom, nomEn, univers: "Visualisation", famille: "Analyse",
    resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: nomSortie, type: "texte" }],
    parametres: [
      { nom: "Fenêtre", nomEn: "Window", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.",
        doc: "Taille de la fenêtre d'analyse (arrondie à la puissance de 2 supérieure).", docEn: "Analysis window size (rounded up to the next power of 2)." },
      { nom: "Pas", nomEn: "Hop", type: "nombre", plage: [64, 4096], pas: 64, defaut: 1024, unite: "éch.",
        doc: "Décalage entre deux fenêtres d'analyse.", docEn: "Hop size between analysis frames." },
      { nom: "Agrégation", nomEn: "Aggregation", type: "choix", options: ["Moyenne", "Médiane", "Maximum"], defaut: "Moyenne",
        doc: "Méthode de combinaison des valeurs par trame.", docEn: "Aggregation method for the per-frame values.", optionsEn: ["Average", "Median", "Maximum"], defautEn: "Average" },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e_audio") };
      const fenetre = ctx.paramNombre("Fenêtre", 2048);
      const pas = ctx.paramNombre("Pas", 1024);
      const aggregation = ctx.paramTexte("Agrégation", "Moyenne") as OptionsCentroidSpectral["aggregation"];
      const resultat = fn(audio, { fenetre, pas, aggregation });
      return { valeurs: [audio, resultat.texte], message: resultat.texte };
   },
  };
}

export const fiches: FicheAudio[] = ([
  {
    id: "analyse-audio", nom: "Analyse audio", univers: "Visualisation", famille: "Analyse",
    resume: "Analyse tempo, tonalité, type chanson/instrumental.",
    entrees: [{ nom: "Piste", nomEn: "Track", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const resultat = analyserAudio(audio);
      return { valeurs: [audio, resultat.description] };
   }, nomEn: "Audio Analysis", resumeEn: "Analyse tempo, key, song/instrumental type.",
 },
  {
    id: "lecteur-analyse", nom: "Lecteur d'analyse", univers: "Visualisation", famille: "Analyse",
    resume: "Affiche le résultat d'une analyse et permet l'écoute.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const audioIn = ctx.entree(0);
      const texte = ctx.entree(1);
      if (typeof texte !== "string") return { valeurs: [null], message: traduire("msg.branchez_la_sortie_analyse") };
      return { valeurs: [audioIn instanceof AudioBuffer ? audioIn : null], message: texte };
   }, nomEn: "Analysis Player", resumeEn: "Displays an analysis result and allows listening.",
 },
  {
    id: "classificateur-genre", nom: "Classificateur de genre", univers: "Visualisation", famille: "Analyse",
    resume: "Identifie le genre musical d'un morceau via IA ou heuristiques.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Genres", type: "texte" }],
    parametres: [
      { nom: "Mode", type: "choix", options: ["IA (ONNX)","Heuristique"], defaut: "IA (ONNX)", optionsEn: ["AI (ONNX)", "Heuristic"], defautEn: "AI (ONNX)", nomEn: "Mode" },
      { nom: "Durée", plage: [5,120], defaut: 30, unite: "s", nomEn: "Duration" },
    ],
    async executer(ctx: any) {
      ctx.onProgress(traduire("progress.extraction_des_caract_ristiques"));
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const duree = ctx.paramNombre("Durée", 30);
      const mode = ctx.paramTexte("Mode", "IA (ONNX)");
      const buf = mode === "IA (ONNX)" && ctx.noeud.data.modeleFichier
        ? await (ctx.noeud.data.modeleFichier as File).arrayBuffer() : undefined;
      ctx.onProgress(traduire("progress.classification"));
      const genres = await classerGenre(audio, duree, buf);
      if (!genres.length) return { valeurs: [audio, null], message: traduire("msg.classification_non_disponible") };
      const descr = genres[0].description || genres.map((g: any) => `${g.genre} (${Math.round(g.confiance*100)}%)`).join(" · ");
      const source = genres[0].description?.includes("modèle ONNX") ? "ONNX" : "heuristique";
      return { valeurs: [audio, descr], message: traduire("msg.var_0_var_1_var_2", genres[0].genre, Math.round(genres[0].confiance*100), source) };
   }, nomEn: "Genre Classifier", resumeEn: "Identifies the musical genre of a song via AI or heuristics.",
 },
  noeudMeyda(
    "centroide-spectral", "Centroïde spectral (Meyda)", "Spectral Centroid (Meyda)",
    "Calcule le centroïde spectral du signal avec la bibliothèque Meyda.",
    "Computes the spectral centroid of the signal using the Meyda library.",
    "Centroïde", calculerCentroidSpectralMeyda),
  noeudMeyda(
    "rms-meyda", "RMS (Meyda)", "RMS (Meyda)",
    "Calcule le niveau RMS moyen du signal en dBFS avec Meyda.",
    "Computes the average RMS level of the signal in dBFS using Meyda.",
    "RMS", calculerRMS_Meyda),
  noeudMeyda(
    "zcr-meyda", "ZCR (Meyda)", "ZCR (Meyda)",
    "Compte les passages par zéro par fenêtre avec Meyda.",
    "Counts zero crossings per frame using Meyda.",
    "ZCR", calculerZCR_Meyda),
  noeudMeyda(
    "rolloff-spectral-meyda", "Rolloff spectral (Meyda)", "Spectral Rolloff (Meyda)",
    "Calcule la fréquence de rolloff spectral avec Meyda.",
    "Computes the spectral rolloff frequency using Meyda.",
    "Rolloff", calculerRolloffSpectralMeyda),
  {
    id: "transcripteur-midi", nom: "Transcripteur MIDI", nomEn: "MIDI Transcriber", univers: "Traitement", famille: "Conversion",
    resume: "Transcrit un signal audio en notes MIDI.",
    resumeEn: "Transcribes an audio signal into MIDI notes.",
    noticeEn: "Transcribes an audio signal into MIDI notes. FFT mono or Basic Pitch ONNX polyphonic.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    // « Aucune note détectée » est un résultat valide (le nœud a bien tourné) :
    // ne pas le convertir en échec via le filet « tout-null ».
    sortieNullePermise: true,
    parametres: [
      { nom: "Méthode", nomEn: "Method", type: "choix", options: ["Monophonique (FFT)","Polyphonique (Basic Pitch ONNX)"], defaut: "Monophonique (FFT)", docEn: "Transcription algorithm.", optionsEn: ["Monophonic (FFT)", "Polyphonic (Basic Pitch ONNX)"], defautEn: "Monophonic (FFT)" },
      { nom: "Seuil onset", nomEn: "Onset threshold", plage: [1,50], defaut: 10, unite: "%", docEn: "Note attack detection sensitivity." },
      { nom: "Note minimale", nomEn: "Min note", plage: [21,120], defaut: 36, docEn: "Lowest MIDI note to detect." },
      { nom: "Note maximale", nomEn: "Max note", plage: [21,127], defaut: 96, docEn: "Highest MIDI note to detect." },
      { nom: "Tempo du fichier MIDI", nomEn: "MIDI tempo", plage: [40,240], defaut: 120, unite: "BPM", docEn: "Tempo of the generated MIDI file." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
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
      if (!notes.length) return { valeurs: [null], message: traduire("msg.aucune_note_d_tect_e") };
      const fichier = await appliquerInstrumentMidi(notesVersFichierMidi(notes, tempo), ctx.paramNombre("Instrument", 0));
      return { valeurs: [fichier], message: traduire("msg.midi_var_0_notes_transcrites", notes.length) };
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
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const langue = langueCourante();
      const fenetre = ctx.paramNombre("Fenêtre d'analyse", 0.5);
      ctx.onProgress(traduire("progress.analyse_harmonique"));
      const accords = detecterAccords(audio, fenetre, (p) => ctx.onProgress(traduire("progress.analyse_var_0", p)));
      if (accords.length === 0) return { valeurs: [audio], message: langue === "en" ? "No chords detected." : "Aucun accord détecté." };
      const texte = accordsVersTexte(accords, langue);
      const fr = langue === "fr";
      const resume = `${accords.length} ${fr ? "accords" : "chords"} · ${accords.map((a: any) => a.nomEn.split(" ").pop()).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i).slice(0, 5).join(" → ")}`;
      return { valeurs: [audio], message: traduire("msg.var_0_var_1", texte, resume) };
   },
 },
] as FicheAudio[]).map(avecDoc);
