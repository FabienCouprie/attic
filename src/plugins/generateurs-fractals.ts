// plugins/generateurs-fractals.ts — Generateurs fractals et attracteurs.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { genererMusiqueFractale, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi, rendreAttracteurImageEtAudio, normaliserTypeAttracteur, genererMusiqueMandelbrot, genererArpegeKoch, rendreSpectrogrammeFractal, GAMMES_MELODIE_FR, GAMMES_MELODIE_EN, GAMMES_MELODIE_IDS } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */

export const fiches: FicheAudio[] = ([
  {
    id: "generateur-fractal", nom: "Musique fractale", nomEn: "Fractal Music", univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie fractale depuis un motif répété et une gamme.",
    resumeEn: "Generates a fractal melody from a repeated motif and scale.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom:"Motif", nomEn:"Motif", type:"choix", options:["Triade M","Triade m","Arpège 7","Cantus firmus","Personnalisé"], optionIds: ["Triade M","Triade m","Arpège 7","Cantus firmus","Personnalisé"], optionsEn:["Major triad","Minor triad","7th arpeggio","Cantus firmus","Custom"], defaut:"Triade M", defautEn: "Major triad" },
      { nom:"Intervalles", nomEn:"Intervals", type:"texte", defaut:"0,3,7,10", defautEn: "0,3,7,10" },
      { nom:"Profondeur", nomEn:"Depth", plage:[1,6], pas:1, defaut:3 },
      { nom:"Durée", nomEn:"Duration", plage:[2,60], defaut:8, unite:"s" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:80, unite:"BPM" },
      { nom:"Clé", nomEn:"Key", type:"choix", options:["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], optionIds: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defaut:"Do", optionsEn: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defautEn: "C" },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut:"Majeur", defautEn: "Major" },
      { nom:"Timbre", nomEn:"Timbre", type:"choix", options:["Douce","Brillante","Percutante"], optionIds: ["douce","brillante","percutante"], defaut:"Douce", optionsEn: ["Soft", "Bright", "Percussive"], defautEn: "Soft" },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
      { ...PARAMETRE_SYNTHESE,        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      console.log("[attic] Musique fractale : exécution démarrée");
      const tempo = ctx.paramNombre("Tempo",80);
      const { audio, notes } = await genererMusiqueFractale(ctx.paramTexte("Motif","Triade M"),ctx.paramTexte("Intervalles","0,3,7,10"),ctx.paramNombre("Profondeur",3),ctx.paramNombre("Durée",8),tempo,ctx.paramTexte("Clé","Do"),ctx.paramTexte("Gamme","Majeur"),ctx.paramTexte("Timbre","Douce"));
      const midiFile = notesVersFichierMidi(notes, tempo);
      const volume = ctx.paramNombre("Volume",80);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      console.log(`[attic] Musique fractale : mode=${mode}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, notes=${notes.length}`);
      // Le volume s'appliquait au seul rendu SoundFont : en FM — le rendu par défaut sans banque
      // chargée — le réglage ne faisait rien. Il s'applique désormais aux deux.
      const audioFinal = useSf2
        ? await rendreSequence(notes, "SoundFont", volume, instrument, banque)
        : audio;
      if (!useSf2 && audioFinal) {
        const g = Math.max(0, Math.min(1, volume / 100));
        for (let c = 0; c < audioFinal.numberOfChannels; c++) {
          const d = audioFinal.getChannelData(c);
          for (let i = 0; i < d.length; i++) d[i] *= g;
        }
      }
      const midiFinal = await appliquerInstrumentMidi(midiFile, ctx.paramNombre("Instrument", 0));
      console.log(`[attic] Musique fractale : audioFinal durée=${audioFinal?.duration ?? 0}`);
      return { valeurs: [audioFinal, midiFinal] };
    },
  },
  {
    id: "mappeur-mandelbrot", nom: "Mappeur Mandelbrot", nomEn: "Mandelbrot Mapper", univers: "Entrées", famille: "Génération",
    resume: "Parcourt une vue de l'ensemble de Mandelbrot et fait de chaque point une note : le nombre d'itérations avant divergence donne la hauteur.",
    resumeEn: "Scans a view of the Mandelbrot set and turns each point into a note: the number of iterations before divergence sets the pitch.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Centre X", nomEn: "Center X", type: "nombre", plage: [-2.5, 1], pas: 0.01, defaut: -0.5, doc: "Coordonnée réelle X du centre de la vue dans le plan de Mandelbrot.", docEn: "Real X coordinate of the view center in the Mandelbrot plane." },
      { nom: "Centre Y", nomEn: "Center Y", type: "nombre", plage: [-1.5, 1.5], pas: 0.01, defaut: 0, doc: "Coordonnée imaginaire Y du centre de la vue dans le plan de Mandelbrot.", docEn: "Imaginary Y coordinate of the view center in the Mandelbrot plane." },
      { nom: "Zoom", nomEn: "Zoom", type: "nombre", plage: [0.1, 100], pas: 0.1, defaut: 1, doc: "Facteur de zoom sur la région choisie (plus = plus rapproché).", docEn: "Zoom factor on the selected region (higher = closer)." },
      { nom: "Itérations max", nomEn: "Max iterations", type: "nombre", plage: [50, 2000], pas: 10, defaut: 200, doc: "Nombre maximal d'itérations de z = z² + c avant de considérer le point comme dans l'ensemble.", docEn: "Maximum number of z = z² + c iterations before considering the point in the set." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Escape time", "Dwell", "Octave"], optionsEn: ["Escape time", "Dwell", "Octave"], defaut: "Escape time", defautEn: "Escape time", doc: "Escape time : la hauteur suit le nombre d'itérations, les points proches du bord de l'ensemble sonnent à l'aigu. Dwell : même hauteur, et la durée de chaque note suit aussi les itérations, si bien que les points du bord s'attardent. Octave : l'octave vient de la hauteur du point dans l'image (le haut à l'aigu), le degré des itérations ; les points sont alors parcourus colonne par colonne.", docEn: "Escape time: the pitch follows the number of iterations - points near the edge of the set sound high. Dwell: same pitch, and the length of each note follows the iterations too, so the points of the edge linger. Octave: the octave comes from the point's height in the image (top is high), the degree from the iterations; the points are then scanned column by column." },
      { nom: "Notes", nomEn: "Notes", type: "nombre", plage: [8, 256], pas: 1, defaut: 32, unite: "notes", doc: "Nombre de points échantillonnés dans le plan, donc de notes générées.", docEn: "Number of points sampled in the plane, hence notes generated." },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.5, doc: "Durée de chaque note, en fraction de temps (1 = une noire, 0,5 = une croche). En mode Dwell, c'est la durée moyenne : de la moitié pour les points qui divergent aussitôt au double pour ceux du bord.", docEn: "Length of each note, as a fraction of a beat (1 = a quarter note, 0.5 = an eighth). In Dwell mode it is the average length: from half for points that diverge at once to twice for those of the edge." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 100, unite: "BPM", doc: "Tempo de la mélodie en battements par minute.", docEn: "Tempo of the melody in beats per minute." },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], optionIds: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defaut: "Do", optionsEn: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defautEn: "C", doc: "Note de référence (tonique) de la gamme.", docEn: "Reference note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut: "Majeur", defautEn: "Major", doc: "Gamme utilisée pour quantiser les hauteurs de notes.", docEn: "Scale used to quantize note pitches." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 6], pas: 1, defaut: 4, doc: "Octave de la note la plus grave de la plage. 4 : Do4, la note MIDI 60.", docEn: "Octave of the lowest note of the range. 4: C4, MIDI note 60." },
      { nom: "Sensibilité", nomEn: "Sensitivity", type: "nombre", plage: [0.1, 5], pas: 0.1, defaut: 1, doc: "Largeur de la plage de hauteurs. À 1, deux octaves de la gamme ; à 0,5, une seule ; à 2, quatre. Le nombre d'itérations y est réparti sur une échelle logarithmique, si bien qu'aucune note ne se bloque en haut du clavier.", docEn: "Width of the pitch range. At 1, two octaves of the scale; at 0.5, one; at 2, four. The iteration count is spread over it on a logarithmic scale, so that no note gets stuck at the top of the keyboard." },
      { nom: "Intérieur", nomEn: "Inside", type: "choix", options: ["Silence", "Tonique grave"], optionsEn: ["Silence", "Low tonic"], optionIds: ["silence", "tonique"], defaut: "Silence", defautEn: "Silence", doc: "Ce que deviennent les points de l'ensemble lui-même, qui ne divergent jamais, le noir de l'image. Silence : ils se taisent, et le bord de la fractale fait le rythme. Tonique grave : ils tiennent la tonique une octave sous la plage.", docEn: "What becomes of the points of the set itself, which never diverge - the black of the image. Silence: they fall silent, and the edge of the fractal makes the rhythm. Low tonic: they hold the tonic one octave below the range." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Douce","Brillante","Percutante"], optionIds: ["douce","brillante","percutante"], defaut: "Douce", optionsEn: ["Soft","Bright","Percussive"], defautEn: "Soft", doc: "Caractère de la synthèse FM. Douce : proche d'un sinus, attaque adoucie. Brillante : riche en harmoniques. Percutante : attaque sèche et note qui retombe vite. Sans effet en SoundFont, où l'instrument choisi fait le timbre.", docEn: "Character of the FM synthesis. Soft: close to a sine, softened attack. Bright: rich in harmonics. Percussive: dry attack and a note that falls away fast. No effect with SoundFont, where the chosen instrument sets the timbre." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0,100], defaut: 80, unite: "%", doc: "Volume de sortie de l'audio.", docEn: "Output volume of the audio." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42, doc: "Graine pour la répartition pseudo-aléatoire des points d'échantillonnage.", docEn: "Seed for the pseudo-random distribution of sampling points." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const cx = ctx.paramNombre("Centre X", -0.5);
      const cy = ctx.paramNombre("Centre Y", 0);
      const zoom = ctx.paramNombre("Zoom", 1);
      const width = 3.5 / Math.max(0.1, zoom);
      const height = 2.5 / Math.max(0.1, zoom);
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const { audio, midiFile } = await genererMusiqueMandelbrot({
        xMin: cx - width / 2,
        xMax: cx + width / 2,
        yMin: cy - height / 2,
        yMax: cy + height / 2,
        maxIter: ctx.paramNombre("Itérations max", 200),
        mode: ctx.paramTexte("Mode", "Escape time").toLowerCase().split(" ")[0] as any,
        nbNotes: ctx.paramNombre("Notes", 32),
        dureeNote: ctx.paramNombre("Durée note", 0.5),
        tempo: ctx.paramNombre("Tempo", 100),
        cle: ctx.paramTexte("Clé", "Do"),
        gamme: ctx.paramTexte("Gamme", "Majeur"),
        // Do4 = 60 : la convention des autres nœuds mélodiques. `octave × 12` plaçait tout une octave trop bas.
        octaveBase: (ctx.paramNombre("Octave", 4) + 1) * 12,
        interieur: String(ctx.paramTexte("Intérieur", "silence")) === "tonique" ? "tonique" : "silence",
        sensibilite: ctx.paramNombre("Sensibilité", 1),
        timbre: ctx.paramTexte("Timbre", "Douce") as any,
        volume: ctx.paramNombre("Volume", 80),
        graine: ctx.paramNombre("Graine", 42),
        instrument,
        banque,
      }, normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique")));
      return { valeurs: [audio, midiFile], message: `Mandelbrot · ${ctx.paramTexte("Mode", "Escape time")} · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "arpege-koch", nom: "Arpège flocon de Koch", nomEn: "Koch Snowflake Arpeggiator", univers: "Entrées", famille: "Génération",
    resume: "Trois voix qui jouent trois niveaux du même flocon de Koch, à trois vitesses : le motif et ses réductions entendus ensemble.",
    resumeEn: "Three voices playing three levels of the same Koch snowflake at three speeds: the pattern and its reductions heard together.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], optionIds: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defaut: "Do", optionsEn: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defautEn: "C", doc: "Note de référence (tonique) de l'accord de base.", docEn: "Reference note (tonic) of the base chord." },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut: "Majeur", defautEn: "Major", doc: "Gamme utilisée pour quantiser les notes de l'arpège.", docEn: "Scale used to quantize the arpeggio notes." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 6], pas: 1, defaut: 4, doc: "Octave de base de l'accord.", docEn: "Base octave of the chord." },
      { nom: "Accord", nomEn: "Chord", type: "choix", options: ["Majeur","Mineur","Augmenté","Diminué","Sus4"], optionIds: ["Majeur","Mineur","Augmenté","Diminué","Sus4"], defaut: "Majeur", optionsEn: ["Major","Minor","Augmented","Diminished","Sus4"], defautEn: "Major", doc: "Type de triade formant le triangle de base du flocon.", docEn: "Triad type forming the base triangle of the snowflake." },
      { nom: "Profondeur", nomEn: "Depth", type: "nombre", plage: [1, 5], pas: 1, defaut: 3, doc: "Nombre de subdivisions de la voix la plus rapide ; les deux autres en ont une et deux de moins. Chaque niveau quadruple la longueur du cycle : 4 doubles-croches à 1, 64 à 3, 1 024 à 5.", docEn: "Number of subdivisions of the fastest voice; the other two have one and two fewer. Each level multiplies the cycle length by four: 4 sixteenths at 1, 64 at 3, 1024 at 5." },
      { nom: "Direction", nomEn: "Direction", type: "choix", options: ["alternée","extérieure","intérieure"], optionIds: ["alternée","extérieure","intérieure"], defaut: "alternée", optionsEn: ["alternating","outward","inward"], defautEn: "alternating", doc: "Sens des pics de Koch sur chaque voix.", docEn: "Direction of the Koch peaks on each voice." },
      { nom: "Hauteur", nomEn: "Height", type: "nombre", plage: [1, 24], pas: 1, defaut: 9, unite: "demi-tons", uniteEn: "semitones", doc: "Hauteur du premier pic, en demi-tons ; chaque niveau suivant en pose de trois fois plus petits. Un pic plus petit qu'un degré de la gamme ne s'entend plus : à 9 demi-tons, trois niveaux restent audibles (9, 3 et 1) ; pour une profondeur 4, montez vers 18 ou 24.", docEn: "Height of the first peak, in semitones; each following level sets peaks three times smaller. A peak smaller than one scale step is no longer heard: at 9 semitones, three levels stay audible (9, 3 and 1); for depth 4, go up towards 18 or 24." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 100, unite: "BPM", doc: "Tempo de l'arpège en battements par minute.", docEn: "Tempo of the arpeggio in beats per minute." },
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 16], pas: 1, defaut: 1, doc: "Nombre de cycles complets du flocon. Un cycle dure 4^profondeur doubles-croches au tempo choisi.", docEn: "Number of complete cycles of the snowflake. A cycle lasts 4^depth sixteenths at the chosen tempo." },
      { nom: "Articulation", nomEn: "Articulation", type: "curseur", plage: [10, 100], pas: 1, defaut: 85, unite: "%", doc: "Part du pas de chaque note qui sonne. 100 % : legato ; 30 % : piqué. Elle s'applique à chaque voix selon sa vitesse, si bien que la voix lente tient ses notes quatre et seize fois plus longtemps.", docEn: "Share of each note's step that sounds. 100%: legato; 30%: staccato. It applies to each voice at its own speed, so the slow voice holds its notes four and sixteen times longer." },
      { nom: "Notes répétées", nomEn: "Repeated notes", type: "choix", options: ["Liées", "Rejouées"], optionsEn: ["Tied", "Replayed"], optionIds: ["liees", "rejouees"], defaut: "Liées", defautEn: "Tied", doc: "Ramenées sur la gamme, deux positions voisines tombent parfois sur la même note. Liées : elles n'en font qu'une, plus longue ; rejouées : la note est frappée à nouveau.", docEn: "Once brought onto the scale, two neighbouring positions sometimes land on the same note. Tied: they make a single, longer note; replayed: the note is struck again." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Douce","Brillante","Percutante"], optionIds: ["douce","brillante","percutante"], defaut: "Douce", optionsEn: ["Soft","Bright","Percussive"], defautEn: "Soft", doc: "Caractère de la synthèse FM. Douce : proche d\'un sinus, attaque adoucie. Brillante : riche en harmoniques. Percutante : attaque sèche et note qui retombe vite. Sans effet en SoundFont, où l\'instrument choisi fait le timbre.", docEn: "Character of the FM synthesis. Soft: close to a sine, softened attack. Bright: rich in harmonics. Percussive: dry attack and a note that falls away fast. No effect with SoundFont, where the chosen instrument sets the timbre." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0,100], defaut: 80, unite: "%", doc: "Volume de sortie de l'audio.", docEn: "Output volume of the audio." },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const { audio, midiFile } = await genererArpegeKoch({
        cle: ctx.paramTexte("Clé", "Do"),
        gamme: ctx.paramTexte("Gamme", "Majeur"),
        octave: ctx.paramNombre("Octave", 4),
        accord: ctx.paramTexte("Accord", "Majeur") as any,
        profondeur: ctx.paramNombre("Profondeur", 3),
        direction: ctx.paramTexte("Direction", "alternée") as any,
        hauteur: ctx.paramNombre("Hauteur", 9),
        tempo: ctx.paramNombre("Tempo", 100),
        repetitions: ctx.paramNombre("Répétitions", 1),
        articulation: ctx.paramNombre("Articulation", 85) / 100,
        notesRepetees: String(ctx.paramTexte("Notes répétées", "liees")) === "rejouees" ? "rejouees" : "liees",
        timbre: ctx.paramTexte("Timbre", "Douce") as any,
        volume: ctx.paramNombre("Volume", 80),
        instrument,
        banque,
      }, normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique")));
      return { valeurs: [audio, midiFile], message: `Koch · ${ctx.paramTexte("Accord", "Majeur")} · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "spectrogramme-fractal", nom: "Spectrogramme fractal", nomEn: "Fractal Spectrogram", univers: "Entrées", famille: "Génération",
    resume: "Génère un spectrogramme fractal et son audio associé.",
    resumeEn: "Generates a fractal spectrogram and its associated audio.",
    entrees: [], sorties: [{ nom: "Image", type: "image" }, { nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.5, 30], pas: 0.5, defaut: 4, unite: "s", doc: "Durée totale du son et de l'image générés.", docEn: "Total duration of the generated sound and image." },
      { nom: "FFT", nomEn: "FFT", type: "choix", options: ["512", "1024", "2048", "4096"], defaut: "2048", optionsEn: ["512", "1024", "2048", "4096"], defautEn: "2048", doc: "Taille de la fenêtre FFT : plus grand = meilleure résolution fréquentielle, moins bonne temporelle.", docEn: "FFT window size: larger = finer frequency resolution, coarser time resolution." },
      { nom: "Octaves", nomEn: "Octaves", type: "nombre", plage: [1, 8], pas: 1, defaut: 4, doc: "Nombre d'octaves de bruit fractal.", docEn: "Number of fractal noise octaves." },
      { nom: "Rugosité", nomEn: "Roughness", type: "nombre", plage: [0, 1], pas: 0.05, defaut: 0.5, doc: "Influence des hautes fréquences du bruit (0 = lisse, 1 = rugueux).", docEn: "Influence of high-frequency noise (0 = smooth, 1 = rough)." },
      { nom: "Échelle", nomEn: "Scale", type: "choix", options: ["Logarithmique", "Linéaire"], optionsEn: ["Logarithmic", "Linear"], optionIds: ["logarithmic", "linear"], defaut: "Logarithmique", defautEn: "Logarithmic", doc: "Distribution verticale des fréquences dans l'image.", docEn: "Vertical distribution of frequencies in the image." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42, doc: "Graine pour reproduire la même texture fractale.", docEn: "Seed to reproduce the same fractal texture." },
      { nom: "Format", nomEn: "Format", type: "choix", options: ["PNG", "JPEG"], defaut: "PNG", optionsEn: ["PNG", "JPEG"], defautEn: "PNG", doc: "Format de l'image de sortie.", docEn: "Output image format." },
    ],
    async executer(ctx: any) {
      const fftSize = parseInt(ctx.paramTexte("FFT", "2048"), 10);
      const { audio, image } = await rendreSpectrogrammeFractal({
        duree: ctx.paramNombre("Durée", 4),
        fftSize,
        octaves: ctx.paramNombre("Octaves", 4),
        roughness: ctx.paramNombre("Rugosité", 0.5),
        forme: ctx.paramTexte("Échelle", "logarithmic") as any,
        graine: ctx.paramNombre("Graine", 42),
      });
      const fmt = ctx.paramTexte("Format", "PNG");
      if (image && fmt === "JPEG") {
        // Convert PNG to JPEG by re-encoding via canvas.
        const url = URL.createObjectURL(image);
        const img = new Image();
        img.src = url;
        await new Promise((res) => { img.onload = res; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext("2d");
        c?.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
        URL.revokeObjectURL(url);
        const jpeg = blob ? new File([blob], "spectrogramme-fractal.jpg", { type: "image/jpeg" }) : image;
        return { valeurs: [jpeg, audio], message: `Spectrogramme fractal · ${audio.duration.toFixed(1)} s` };
      }
      return { valeurs: [image ?? null, audio], message: `Spectrogramme fractal · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "attracteur-ifs", nom: "Attracteur / IFS", nomEn: "Attractor / IFS", univers: "Entrées", famille: "Génération",
    resume: "Rend un attracteur chaotique ou un IFS en image + audio.",
    resumeEn: "Renders a chaotic attractor or IFS as image + audio.",
    entrees: [], sorties: [{ nom: "Image", type: "image" }, { nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Attracteur", nomEn: "Attractor", type: "choix", options: ["Lorenz", "Rössler", "Hénon", "Ikeda", "Barnsley", "Sierpiński"], optionIds: ["Lorenz","Rössler","Hénon","Ikeda","Barnsley","Sierpiński"], optionsEn: ["Lorenz", "Rossler", "Henon", "Ikeda", "Barnsley", "Sierpinski"], defaut: "Lorenz", defautEn: "Lorenz", doc: "Système dynamique ou IFS à itérer pour produire la trajectoire.", docEn: "Dynamical system or IFS to iterate to produce the trajectory." },
      { nom: "Itérations", nomEn: "Iterations", type: "nombre", plage: [10000, 1000000], pas: 1000, defaut: 200000, unite: "pts", doc: "Nombre de points calculés pour l'image et la sonification.", docEn: "Number of points computed for the image and sonification." },
      { nom: "Largeur", nomEn: "Width", type: "nombre", plage: [256, 4096], pas: 1, defaut: 1024, unite: "px", doc: "Largeur de l'image rendue en pixels.", docEn: "Width of the rendered image in pixels." },
      { nom: "Hauteur", nomEn: "Height", type: "nombre", plage: [256, 4096], pas: 1, defaut: 1024, unite: "px", doc: "Hauteur de l'image rendue en pixels.", docEn: "Height of the rendered image in pixels." },
      { nom: "Palette", nomEn: "Palette", type: "choix", options: ["classic", "magma", "inferno", "viridis", "gray", "claw"], defaut: "classic", optionsEn: ["classic", "magma", "inferno", "viridis", "gray", "claw"], defautEn: "classic", doc: "Palette de couleurs appliquée à la densité de points.", docEn: "Color palette applied to the point density." },
      { nom: "Projection", nomEn: "Projection", type: "choix", options: ["XY", "XZ", "YZ", "3D shadow"], optionsEn: ["XY", "XZ", "YZ", "3D shadow"], defaut: "XY", defautEn: "XY", doc: "Projection des axes 3D de l'attracteur sur l'image.", docEn: "Projection of the attractor's 3D axes onto the image." },
      { nom: "Exposition", nomEn: "Exposure", type: "nombre", plage: [0.1, 5], pas: 0.1, defaut: 1.5, doc: "Facteur d'exposition pour accentuer ou atténuer la densité de points.", docEn: "Exposure factor to emphasize or attenuate point density." },
      { nom: "Gamma", nomEn: "Gamma", type: "nombre", plage: [0.1, 3], pas: 0.1, defaut: 1, doc: "Correction gamma de l'image.", docEn: "Gamma correction of the image." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42, doc: "Graine pour les conditions initiales aléatoires de l'IFS.", docEn: "Seed for random initial conditions of the IFS." },
      { nom: "Format", nomEn: "Format", type: "choix", options: ["PNG", "JPEG"], optionsEn: ["PNG", "JPEG"], defaut: "PNG", defautEn: "PNG", doc: "Format du fichier image de sortie.", docEn: "Output image file format." },
      { nom: "Durée audio", nomEn: "Audio duration", type: "nombre", plage: [1, 30], pas: 0.5, defaut: 4, unite: "s", doc: "Durée du son généré depuis la trajectoire.", docEn: "Duration of the sound generated from the trajectory." },
      { nom: "Fréquence base", nomEn: "Base frequency", type: "nombre", plage: [20, 2000], pas: 1, defaut: 220, unite: "Hz", doc: "Fréquence de base pour la sonification des coordonnées X/Y.", docEn: "Base frequency for sonifying the X/Y coordinates." },
      { nom: "Plage hauteur", nomEn: "Pitch range", type: "nombre", plage: [0, 48], pas: 1, defaut: 24, unite: "demi-tons", uniteEn: "semitones", doc: "Étendue en demi-tons de la modulation de hauteur audio.", docEn: "Pitch range in semitones of the audio pitch modulation." },
      { nom: "Décimation audio", nomEn: "Audio decimation", type: "nombre", plage: [1, 100], pas: 1, defaut: 1, unite: "pts/éch", uniteEn: "pts/sample", doc: "Un point audio sur N est utilisé pour ralentir la variation de fréquence.", docEn: "One audio point out of N is used to slow down the frequency variation." },
      { nom: "Volume audio", nomEn: "Audio volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%", doc: "Volume du signal audio de sortie.", docEn: "Output audio signal volume." },
    ],
    async executer(ctx: any) {
      const type = ctx.paramTexte("Attracteur", "Lorenz");
      const typeNormalise = normaliserTypeAttracteur(type);
      if (!typeNormalise) {
        return { valeurs: [null, null], message: `${type}: type d'attracteur inconnu` };
      }
      const projection = ctx.paramTexte("Projection", "XY").toLowerCase().replace(/\s+/g, "-");
      const projectionValide = ["xy", "xz", "yz", "3d-shadow"].includes(projection) ? projection as any : "xy";
      const { image, audio } = await rendreAttracteurImageEtAudio(
        {
          type: typeNormalise,
          iterations: ctx.paramNombre("Itérations", 200000),
          width: Math.round(ctx.paramNombre("Largeur", 1024)),
          height: Math.round(ctx.paramNombre("Hauteur", 1024)),
          palette: ctx.paramTexte("Palette", "classic"),
          projection: projectionValide,
          exposure: ctx.paramNombre("Exposition", 1.5),
          gamma: ctx.paramNombre("Gamma", 1),
          graine: ctx.paramNombre("Graine", 42),
        },
        {
          duree: ctx.paramNombre("Durée audio", 4),
          frequenceBase: ctx.paramNombre("Fréquence base", 220),
          plageDemiTons: ctx.paramNombre("Plage hauteur", 24),
          decimation: Math.max(1, Math.round(ctx.paramNombre("Décimation audio", 1))),
          volume: ctx.paramNombre("Volume audio", 80),
        },
        ctx.paramTexte("Format", "PNG").toLowerCase() as any
      );
      return {
        valeurs: [image, audio],
        message: traduire("msg.attracteur.termine", type, `${image.size.toLocaleString()} o · ${audio.duration.toFixed(1)} s`),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
