// plugins/analyse.ts — Nœuds d'analyse

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { analyserAudio, classerGenre, transcrireMono, transcrirePolyphonique, notesVersFichierMidi, detecterAccords, accordsVersTexte, calculerCentroidSpectralMeyda, calculerRMS_Meyda, calculerZCR_Meyda, calculerRolloffSpectralMeyda, appliquerInstrumentMidi, analyserEmotion, type OptionsCentroidSpectral, type ResultatCentroidSpectral } from "../audio";
import { langueCourante, traduire } from "../i18n";;
import { PARAMETRE_INSTRUMENT_SF2 } from "./soundfontGlobal";
import { genererSvgGoniometre, mesurerStereo, pointsGoniometre, verdictStereo } from "../audio/stereo-correlation";
import { candidatsOctave, fiabiliteTempo, ramenerDansPlage } from "../audio/tempo-octave";
import { notesVersMusicXML } from "../audio/musicxml";

function noeudMeyda(
  id: string,
  nom: string,
  nomEn: string,
  resume: string,
  resumeEn: string,
  nomSortie: string,
  nomSortieEn: string,
  fn: (audio: AudioBuffer, options: OptionsCentroidSpectral) => ResultatCentroidSpectral,
): FicheAudio {
  return {
    id, nom, nomEn, univers: "Visualisation", famille: "Analyse",
    resume, resumeEn,
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: nomSortie, nomEn: nomSortieEn, type: "texte" }],
    parametres: [
      { nom: "Fenêtre", nomEn: "Window", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.", uniteEn: "samples",
        doc: "Taille de la fenêtre d'analyse (arrondie à la puissance de 2 supérieure).", docEn: "Analysis window size (rounded up to the next power of 2)." },
      { nom: "Pas", nomEn: "Hop", type: "nombre", plage: [64, 4096], pas: 64, defaut: 1024, unite: "éch.", uniteEn: "samples",
        doc: "Décalage entre deux fenêtres d'analyse.", docEn: "Hop size between analysis frames." },
      { nom: "Agrégation", nomEn: "Aggregation", type: "choix", options: ["Moyenne", "Médiane", "Maximum"], optionIds: ["moyenne","mediane","maximum"], defaut: "Moyenne",
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
    id: "musicxml", nom: "MusicXML", nomEn: "MusicXML", univers: "Visualisation", famille: "Analyse",
    resume: "Convertit un MIDI en partition MusicXML, le format que lisent MuseScore, Finale et Sibelius.",
    resumeEn: "Converts MIDI into a MusicXML score, the format MuseScore, Finale and Sibelius read.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MusicXML", nomEn: "MusicXML", type: "texte" }, { nom: "Fichier", nomEn: "File", type: "fichier" }],
    parametres: [
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Attic", defautEn: "Attic",
        doc: "Titre inscrit dans la partition.", docEn: "Title written into the score." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo servant à convertir les secondes en valeurs de note. Un tempo faux ne change pas les hauteurs, mais donne des durées fausses.",
        docEn: "Tempo used to turn seconds into note values. A wrong tempo does not change the pitches, but gives wrong durations." },
      { nom: "Métrique", nomEn: "Time signature", type: "choix",
        options: ["4/4", "3/4", "2/4", "6/8"], optionsEn: ["4/4", "3/4", "2/4", "6/8"],
        optionIds: ["4/4", "3/4", "2/4", "6/8"], defaut: "4/4", defautEn: "4/4",
        doc: "Métrique de la partition. Elle décide du découpage en mesures.",
        docEn: "Time signature of the score. It decides how bars are cut." },
      { nom: "Quantification", nomEn: "Quantization", type: "choix",
        options: ["Double-croche", "Croche", "Noire"], optionsEn: ["Sixteenth", "Eighth", "Quarter"],
        optionIds: ["16", "8", "4"], defaut: "Double-croche", defautEn: "Sixteenth",
        doc: "Plus petite valeur écrite. Une note jouée entre deux cases est ramenée sur la grille : c'est ce qui rend la partition lisible, et ce qui lui fait perdre le détail de l'interprétation.",
        docEn: "Smallest value written. A note played between two slots is snapped to the grid: that is what makes the score readable, and what loses the detail of the performance." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const { analyserMidi } = await import("../audio");
      const { parseMidi } = await import("midi-file");
      const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const [num, den] = ctx.paramTexte("Métrique", "4/4").split("/").map((v: string) => parseInt(v, 10));
      const xml = notesVersMusicXML(
        notes.map((n: any) => ({ note: n.note, debut: n.debut, fin: n.fin, velocite: n.velociete })),
        {
          titre: ctx.paramTexte("Titre", "Attic"),
          tempo: ctx.paramNombre("Tempo", 120),
          metrique: [num || 4, den || 4],
          quantification: parseInt(ctx.paramTexte("Quantification", "16"), 10) || 16,
        },
      );
      const nom = `${(ctx.paramTexte("Titre", "Attic") || "attic").replace(/[^\w-]+/g, "-")}.musicxml`;
      const sortie = new File([xml], nom, { type: "application/vnd.recordare.musicxml+xml" });
      const mesures = (xml.match(/<measure /g) ?? []).length;
      return { valeurs: [xml, sortie], message: `${notes.length} notes · ${mesures} mesures` };
    },
  },
  {
    id: "detecteur-tempo", nom: "Détecteur de tempo", nomEn: "Tempo Detector", univers: "Visualisation", famille: "Analyse",
    resume: "Estime le tempo d'un audio et le rend comme valeur réutilisable.",
    resumeEn: "Estimates an audio track's tempo and outputs it as a reusable value.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Tempo", nomEn: "Tempo", type: "controle" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Correction d'octave", nomEn: "Octave correction", type: "choix",
        options: ["Ramener dans la plage", "Aucune"],
        optionsEn: ["Fold into range", "None"],
        optionIds: ["plage", "aucune"],
        defaut: "Ramener dans la plage", defautEn: "Fold into range",
        doc: "Une détection de tempo ne distingue pas 70 BPM d'un 140 BPM compté un temps sur deux : les deux expliquent le signal, et aucune règle ne tranche à tous les coups. Mesuré sur des motifs de boîte à rythmes, la détection brute divise volontiers par deux : 100 ressort à 50, 140 à 70 — mais un vrai 75 ressort bien à 75. Replier dans 80–160 redresse les deux premiers et double le troisième. Le repli est donc actif par défaut, parce que c'est le cas le plus fréquent quand on veut alimenter un paramètre Tempo, mais rien n'est caché : le rapport donne toujours la valeur brute et les lectures également plausibles. Mettez « Aucune » pour un morceau que vous savez lent.",
        docEn: "Tempo detection cannot tell 70 BPM from a 140 BPM counted every other beat: both explain the signal, and NO rule settles it every time. Measured on drum-machine patterns, raw detection readily halves: 100 comes out as 50, 140 as 70 — but a genuine 75 does come out as 75. Folding into 80-160 fixes the first two and doubles the third. Folding is therefore on by default, because that is the common case when feeding a Tempo parameter, but nothing is hidden: the report always gives the raw value and the equally plausible readings. Settings: « None » for a track you know to be slow." },
      { nom: "Plage basse", nomEn: "Range low", type: "nombre", plage: [40, 140], pas: 1, defaut: 80,
        doc: "Borne basse de la plage de repli.", docEn: "Lower bound of the folding range." },
      { nom: "Plage haute", nomEn: "Range high", type: "nombre", plage: [80, 240], pas: 1, defaut: 160,
        doc: "Borne haute de la plage de repli. La plage doit couvrir au moins une octave (le double de la borne basse) : plus étroite, aucun tempo n'a toujours un double ou une moitié dedans, et le repli est abandonné.", docEn: "Upper bound of the folding range. The range must span at least an octave (twice the lower bound): narrower, no tempo is sure to have its double or half inside, and folding is dropped." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      const brut = analyserAudio(audio);
      const correction = ctx.paramTexte("Correction d'octave", "plage");
      const bas = ctx.paramNombre("Plage basse", 80), haut = ctx.paramNombre("Plage haute", 160);
      const bpm = correction === "aucune" ? Math.round(brut.tempo) : ramenerDansPlage(brut.tempo, bas, haut);
      const fiabilite = traduire(`msg.tempo.${fiabiliteTempo(brut.tempoConfiance, brut.tempo)}`);
      const autres = candidatsOctave(bpm).filter((v) => v !== bpm);
      const rapport = [
        `${bpm} BPM — ${fiabilite}`,
        `${traduire("msg.tempo.brut")} ${Math.round(brut.tempo)} BPM`,
        `${traduire("msg.tempo.autres")} ${autres.join(", ")} BPM`,
      ].join("\n");
      return { valeurs: [audio, bpm, rapport], message: `${bpm} BPM · ${fiabilite}` };
    },
  },
  {
    id: "goniometre", nom: "Goniomètre", nomEn: "Goniometer", univers: "Visualisation", famille: "Analyse",
    resume: "Mesure la largeur stéréo, la corrélation de phase et ce que le mix perdrait en mono.",
    resumeEn: "Measures stereo width, phase correlation and what the mix would lose in mono.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Goniomètre", nomEn: "Goniometer", type: "image" },
      { nom: "Mesures", nomEn: "Measurements", type: "texte" },
    ],
    parametres: [
      { nom: "Points", nomEn: "Points", type: "nombre", plage: [200, 20000], pas: 100, defaut: 3000,
        doc: "Nombre de points dessinés dans la figure. Plus il y en a, plus le nuage est dense — et plus le SVG est lourd.",
        docEn: "Number of points drawn in the figure. More points means a denser cloud — and a heavier SVG." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      const gauche = audio.getChannelData(0);
      // Un fichier mono n'a qu'un canal : c'est alors le même des deux côtés, et la
      // mesure dira « mono » — ce qui est la vérité, et non une erreur.
      const droite = audio.numberOfChannels > 1 ? audio.getChannelData(1) : gauche;
      const mesure = mesurerStereo(gauche, droite);
      const points = pointsGoniometre(gauche, droite, ctx.paramNombre("Points", 3000));
      const svg = new File([genererSvgGoniometre(mesure, points)], "goniometre.svg", { type: "image/svg+xml" });
      const verdict = traduire(`msg.stereo.${verdictStereo(mesure.correlation)}`);
      const rapport = [
        `${traduire("msg.stereo.correlation")} ${mesure.correlation.toFixed(3)} — ${verdict}`,
        `L ${mesure.rmsGauche.toFixed(1)} dB · R ${mesure.rmsDroite.toFixed(1)} dB · mono ${mesure.rmsMono.toFixed(1)} dB`,
        `${traduire("msg.stereo.perteMono")} ${mesure.perteMono.toFixed(1)} dB`,
      ].join("\n");
      return {
        valeurs: [audio, svg, rapport],
        message: `r = ${mesure.correlation.toFixed(2)} · ${verdict}`,
      };
    },
  },
  {
    id: "analyse-emotionnelle", nom: "Analyse émotionnelle", nomEn: "Emotional Analysis", univers: "Visualisation", famille: "Analyse",
    resume: "Associe une émotion à un morceau à partir de sa musique seule (tempo, mode, énergie, timbre) — aucun texte ni parole analysés.",
    resumeEn: "Associates an emotion with a track from its music alone (tempo, mode, energy, timbre) — no text or lyrics analyzed.",
    notice: "Estimation heuristique combinant le tempo, le mode majeur/mineur, l'intensité sonore et la brillance spectrale en un score valence/arousal (modèle circomplex de Russell), reprojeté ensuite sur une émotion nommée. Purement acoustique — ne lit ni paroles ni métadonnées.",
    noticeEn: "Heuristic estimate combining tempo, major/minor mode, loudness and spectral brightness into a valence/arousal score (Russell's circumplex model), then mapped to a named emotion. Purely acoustic — does not read lyrics or metadata.",
    entrees: [{ nom: "Piste", nomEn: "Track", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const resultat = analyserEmotion(audio);
      return { valeurs: [audio, resultat.description], message: traduire("emotion.verdict", resultat.emotion, Math.round(resultat.confiance * 100)) };
   },
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
      { nom: "Mode", type: "choix", options: ["IA (ONNX)","Heuristique"], optionsEn: ["AI (ONNX)", "Heuristic"], optionIds: ["ai", "heuristic"], defaut: "IA (ONNX)", defautEn: "AI (ONNX)", nomEn: "Mode" },
      { nom: "Durée", plage: [5,120], defaut: 30, unite: "s", nomEn: "Duration" },
    ],
    async executer(ctx: any) {
      ctx.onProgress(traduire("progress.extraction_des_caract_ristiques"));
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const duree = ctx.paramNombre("Durée", 30);
      const mode = ctx.paramTexte("Mode", "ai");
      let buf: ArrayBuffer | undefined;
      if (mode === "ai") {
        if (ctx.noeud.data.modeleFichier) {
          buf = await (ctx.noeud.data.modeleFichier as File).arrayBuffer();
        } else if (typeof window !== "undefined" && (window as any).api?.lireBinaire) {
          const rep = await (window as any).api.lireBinaire("oonx/model_genre.onnx");
          if (rep?.donnees) {
            const b = rep.donnees as Buffer;
            buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
          }
        }
      }
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
    "Centroïde", "Centroid", calculerCentroidSpectralMeyda),
  noeudMeyda(
    "rms-meyda", "RMS (Meyda)", "RMS (Meyda)",
    "Calcule le niveau RMS moyen du signal en dBFS avec Meyda.",
    "Computes the average RMS level of the signal in dBFS using Meyda.",
    "RMS", "RMS", calculerRMS_Meyda),
  noeudMeyda(
    "zcr-meyda", "ZCR (Meyda)", "ZCR (Meyda)",
    "Compte les passages par zéro par fenêtre avec Meyda.",
    "Counts zero crossings per frame using Meyda.",
    "ZCR", "ZCR", calculerZCR_Meyda),
  noeudMeyda(
    "rolloff-spectral-meyda", "Rolloff spectral (Meyda)", "Spectral Rolloff (Meyda)",
    "Calcule la fréquence de rolloff spectral avec Meyda.",
    "Computes the spectral rolloff frequency using Meyda.",
    "Rolloff", "Rolloff", calculerRolloffSpectralMeyda),
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
      { nom: "Méthode", nomEn: "Method", type: "choix", options: ["Monophonique (FFT)","Polyphonique (Basic Pitch ONNX)"], optionsEn: ["Monophonic (FFT)", "Polyphonic (Basic Pitch ONNX)"], optionIds: ["mono", "poly"], defaut: "Monophonique (FFT)", docEn: "Transcription algorithm.", defautEn: "Monophonic (FFT)" },
      { nom: "Seuil onset", nomEn: "Onset threshold", plage: [1,50], defaut: 10, unite: "%", docEn: "Note attack detection sensitivity." },
      { nom: "Note minimale", nomEn: "Min note", plage: [21,120], defaut: 36, docEn: "Lowest MIDI note to detect." },
      { nom: "Note maximale", nomEn: "Max note", plage: [21,127], defaut: 96, docEn: "Highest MIDI note to detect." },
      { nom: "Tempo du fichier MIDI", nomEn: "MIDI tempo", plage: [40,240], defaut: 120, unite: "BPM", docEn: "Tempo of the generated MIDI file." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const methode = ctx.paramTexte("Méthode", "mono");
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
      let notes;
      if (methode === "poly") {
        try {
          notes = await transcrirePolyphonique(audio, seuil, noteMin, noteMax, (p) =>
            ctx.onProgress(traduire("progress.transcription_pourcent_var_0", p)));
        } catch (e: any) {
          // NE PAS retomber silencieusement sur le FFT monophonique : c'est ce
          // que faisait l'ancien code, si bien qu'un modèle indisponible donnait
          // un résultat mono (inadapté à un mix) présenté comme polyphonique,
          // sans le moindre signe pour l'utilisateur.
          console.error("[transcripteur-midi] Basic Pitch", e);
          return { valeurs: [null], erreur: true,
            message: traduire("msg.transcription_poly_indisponible_var_0", e?.message ?? String(e)) };
        }
      } else {
        notes = transcrireMono(audio, seuil, noteMin, noteMax);
      }
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
