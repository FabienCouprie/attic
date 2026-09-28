// plugins/vexflow.ts — Les cinq nœuds de gravure.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Chord } from "tonal";
import { parseMidi } from "midi-file";
import { analyserMidi } from "../audio/midi";
import { GRILLES_NOTATION, accordsPourPartition, genererGrille, genererPartition, genererPortee, genererTab, midiVersNotationEasyScore } from "./vexflow-notation";

export const fiches: FicheAudio[] = ([
  {
    id: "vexflow-portee", nom: "Portée VexFlow", nomEn: "VexFlow Staff",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'une notation texte.",
    resumeEn: "Displays a musical staff from a text notation.",
    entrees: [{ nom: "Notation", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: "C4/q D4/8 E4/8 F4/q G4/q",
        doc: "Notes à afficher. Format : note/octave/durée (ex : C4/q, D4/8, F#4/q, C4+E4+G4/q).",
        docEn: "Notes to display. Format: note/octave/duration (e.g. C4/q, D4/8, F#4/q, C4+E4+G4/q).", defautEn: "C4/q D4/8 E4/8 F4/q G4/q" },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const notation = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Notation", "C4/q D4/8 E4/8 F4/q G4/q");
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererPortee(notation, clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg], message: svg };
   },
 },
  {
    id: "vexflow-tab", nom: "Tablature VexFlow", nomEn: "VexFlow Tab",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une tablature à partir d'une notation texte.",
    resumeEn: "Displays a tablature from a text notation.",
    entrees: [{ nom: "Tablature", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Tablature", nomEn: "Tablature", type: "texte", defaut: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q",
        doc: "Tablature à afficher. Format : corde-fret/durée (ex : 6-3/q = corde 6, fret 3, noire).",
        docEn: "Tablature to display. Format: string-fret/duration (e.g. 6-3/q = 6th string, 3rd fret, quarter note).", defautEn: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q" },
      { nom: "Accordage", nomEn: "Tuning", type: "choix", options: ["Guitare standard", "Ukulélé", "Basse"], optionIds: ["Guitare standard","Ukulélé","Basse"], optionsEn: ["Standard guitar", "Ukulele", "Bass"], defaut: "Guitare standard",
        doc: "Accordage affiché en titre (la notation reste en corde-fret).", docEn: "Tuning displayed in title (notation remains string-fret).", defautEn: "Standard guitar" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const tabText = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tablature", "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererTab(tabText, ctx.paramTexte("Accordage", "Guitare standard"), w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg], message: svg };
   },
 },
  {
    id: "vexflow-grille", nom: "Grille d'accords VexFlow", nomEn: "VexFlow Chord Chart",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une grille d'accords à partir d'une liste de symboles.",
    resumeEn: "Displays a chord chart from a list of symbols.",
    entrees: [{ nom: "Accords", nomEn: "Chords", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Accords", nomEn: "Chords", type: "texte", defaut: "C Am F G",
        doc: "Accords à afficher, séparés par des espaces. Accepte aussi une progression en chiffres romains si une tonalité est renseignée.",
        docEn: "Chords to display, separated by spaces. Also accepts a roman numeral progression if a key is set.", defautEn: "C Am F G" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité pour interpréter une progression en chiffres romains. Accepte une tonique seule (« A ») ou un libellé complet (« A minor »), tel que l'émet « Analyse harmonique », dans ce cas le mode nommé l'emporte sur « Gamme ».",
        docEn: "Key used to interpret a roman numeral progression. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis », the named mode then wins over « Scale ».", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"],
        optionIds: ["majeur", "mineur"], defaut: "majeur", defautEn: "major",
        doc: "Gamme dans laquelle lire les degrés, quand la tonalité ne nomme pas de mode. En mineur, III, VI et VII descendent d'un demi-ton : « i VI III VII » donne Am F C G en la.",
        docEn: "Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone: « i VI III VII » gives Am F C G in A." },
      { nom: "Mesures par ligne", nomEn: "Measures per line", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Nombre de mesures par ligne.", docEn: "Number of measures per line." },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 600], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Accords", "C Am F G");
      const tokens = texte.split(/\s+/).filter(Boolean);
      const romains = /^[IViv]+$/.test(tokens[0] ?? "");
      const tonic = ctx.paramTexte("Tonalité", "C");
      // Même correction que `genererPartition` : voir le commentaire là-bas.
      const accords = romains
        ? accordsPourPartition(tonic, ctx.paramTexte("Gamme", "majeur"), tokens)
        : tokens;
      const mpl = Math.round(ctx.paramNombre("Mesures par ligne", 4));
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererGrille(accords, mpl, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_accord_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg], message: svg };
   },
 },
  {
    id: "vexflow-partition", nom: "Partition VexFlow", nomEn: "VexFlow Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une partition simple à partir d'une progression d'accords.",
    resumeEn: "Displays a simple score from a chord progression.",
    entrees: [{ nom: "Progression", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        doc: "Progression en chiffres romains ou en symboles d'accords (ex : C Am F G).",
        docEn: "Roman numeral progression or chord symbols (e.g. C Am F G).", defautEn: "I V vi IV" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité de la progression. Accepte une tonique seule (« A ») ou un libellé complet (« A minor »), tel que l'émet « Analyse harmonique », dans ce cas le mode nommé l'emporte sur « Gamme ».",
        docEn: "Progression key. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis », the named mode then wins over « Scale ».", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"],
        optionIds: ["majeur", "mineur"], defaut: "majeur", defautEn: "major",
        doc: "Gamme dans laquelle lire les degrés, quand la tonalité ne nomme pas de mode. En mineur, III, VI et VII descendent d'un demi-ton.",
        docEn: "Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone." },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const progression = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Progression", "I V vi IV");
      const tonic = ctx.paramTexte("Tonalité", "C");
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererPartition(progression, tonic, ctx.paramTexte("Gamme", "majeur"), clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_progression_valide") };
      // Le SVG part AUSSI sur la sortie declaree, pas seulement dans le message.
      // La vue lit le message (VueVexFlow) ; le port, lui, n'emettait rien : la
      // sortie SVG etait donc inexploitable en aval, et le moteur marquait le
      // noeud « Erreur » alors que la portee s'affichait correctement.
      return { valeurs: [svg], message: svg };
    },
  },
  {
    id: "vexflow-midi", nom: "Partition MIDI", nomEn: "MIDI Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'un fichier MIDI.",
    resumeEn: "Displays a musical staff from a MIDI file.",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "SVG", type: "image" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 300], pas: 1, defaut: 0, unite: "BPM",
        doc: "Tempo utilisé pour convertir les durées MIDI en notation. 0 = détecter depuis le fichier MIDI.", docEn: "Tempo used to convert MIDI durations to notation. 0 = detect from MIDI file." },
      { nom: "Canal", nomEn: "Channel", type: "nombre", plage: [-1, 15], pas: 1, defaut: -1, unite: "-1 = tous", uniteEn: "-1 = all",
        doc: "Canal MIDI à afficher (-1 pour tous les canaux).", docEn: "MIDI channel to display (-1 for all channels)." },
      { nom: "Quantification", nomEn: "Quantization", type: "choix", options: ["1/4", "1/8", "1/16", "1/32"], defaut: "1/16",
        doc: "Résolution de la grille de quantification.", docEn: "Quantization grid resolution.", optionsEn: ["1/4", "1/8", "1/16", "1/32"], defautEn: "1/16" },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 2000], pas: 10, defaut: 800, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 800], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const midi = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      let bpm = ctx.paramNombre("Tempo", 0);
      if (bpm <= 0) {
        bpm = 120;
        for (const piste of midi.tracks) {
          for (const evt of piste) {
            if (evt.type === "setTempo") {
              bpm = Math.round(60 / (evt.microsecondsPerBeat / 1_000_000));
              break;
            }
          }
          if (bpm !== 120) break;
        }
      }
      const canal = ctx.paramNombre("Canal", -1);
      const grilleNom = ctx.paramTexte("Quantification", "1/16");
      const grille = GRILLES_NOTATION[grilleNom] ?? 0.25;
      const { notes } = analyserMidi(midi);
      const notesFiltrees = canal >= 0 ? notes.filter((n) => n.canal === canal) : notes;
      const notation = midiVersNotationEasyScore(notesFiltrees, bpm, grille);
      if (!notation) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 800);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererPortee(notation, clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      const svgFile = new File([svg], "partition.svg", { type: "image/svg+xml" });
      return { valeurs: [svgFile], message: svg };
    },
  },
] as FicheAudio[]).map(avecDoc);

