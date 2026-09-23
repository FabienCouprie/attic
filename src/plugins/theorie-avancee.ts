// plugins/theorie-avancee.ts — Cinq outils de théorie, d'analyse et de combinatoire.
//
// Trois d'entre eux viennent de traditions savantes distinctes — le Tonnetz de Riemann, le
// contrepoint de Fux, les canons par pavage de Vuza — et deux de la musique du XXᵉ siècle
// et de l'analyse par ordinateur. Ce qu'ils ont en commun : chacun porte un critère de
// vérité extérieur au code, qu'il s'agisse d'un traité, d'un théorème ou d'une suite
// publiée, et c'est ce qui les rend vérifiables.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  cheminLePlusCourt, lireOperations, nomTriade, notesDe, parcourir, reconnaitre,
  voixParcimonieuses, type Triade,
} from "../audio/tonnetz";
import { bilan, verifier } from "../audio/contrepoint";
import { canonEnNotes, canonEnTexte, chercherMotifs, construire } from "../audio/canon-pavage";
import { serie, statistiques, versHauteurs, voix, type ModeHauteur } from "../audio/norgard";
import {
  courbeNouveaute, frontieres, matriceEnSvg, matriceSimilarite, regrouper, segments,
} from "../audio/auto-similarite";
import { SAUT_TRAME_CHROMAGRAMME, chromagrammeParTrame } from "../audio/analyse";
import { notesDuMidi } from "./instruments-communs";
import { PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2, normaliserModeSynthèse, sf2Chargee } from "./soundfontGlobal";

const NOMS = ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"];
const NOMS_EN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const IDS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

const GAMMES: Record<string, number[]> = {
  majeure: [0, 2, 4, 5, 7, 9, 11],
  mineure: [0, 2, 3, 5, 7, 8, 10],
  pentatonique: [0, 2, 4, 7, 9],
  chromatique: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

interface NoteSimple { note: number; velocite: number; debut: number; fin: number }

/** Rend l'audio et le MIDI d'une suite de notes, avec les réglages de synthèse du nœud. */
async function rendre(ctx: any, notes: NoteSimple[]): Promise<[AudioBuffer, File]> {
  const { notesVersFichierMidi, appliquerInstrumentMidi, rendreSequence } = await import("../audio");
  const instrument = ctx.paramNombre("Instrument", 0);
  const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
  const modeRendu: "FM/Oscillateurs" | "SoundFont" =
    mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
  const { programme, banque } = decoderInstrumentSF2(instrument);
  const midi = notesVersFichierMidi(notes, ctx.paramNombre("Tempo", 120), 0);
  return [
    await rendreSequence(notes, modeRendu, ctx.paramNombre("Volume", 80), programme, banque),
    await appliquerInstrumentMidi(midi, instrument),
  ];
}

const PARAMETRES_RENDU = [
  { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300] as [number, number], pas: 1, defaut: 120, unite: "BPM",
    doc: "Tempo inscrit dans le fichier MIDI produit.", docEn: "Tempo written into the produced MIDI file." },
  { ...PARAMETRE_SYNTHESE,
    doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.",
    docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
  PARAMETRE_INSTRUMENT_SF2,
  { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100] as [number, number], pas: 1, defaut: 80, unite: "%",
    doc: "Volume du rendu audio.", docEn: "Output volume." },
];

/** Lit « Do majeur », « Am », « F# mineur »… en triade. */
function lireTriade(texte: string, defaut: Triade): Triade {
  const t = texte.trim().toLowerCase();
  const m = /^([a-g])([#b]?)\s*(m|min|mineur|minor)?$/.exec(t);
  if (!m) return defaut;
  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const alteration = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return {
    fondamentale: ((base[m[1]] + alteration) % 12 + 12) % 12,
    type: m[3] ? "mineur" : "majeur",
  };
}

export const fiches: FicheAudio[] = ([
  {
    id: "tonnetz", nom: "Tonnetz", nomEn: "Tonnetz",
    univers: "Traitement", famille: "Effets",
    resume: "Enchaîne les accords par les trois transformations néo-riemanniennes P, L et R, qui ne déplacent qu'une voix.",
    resumeEn: "Chains chords through the three neo-Riemannian transformations P, L and R, each moving a single voice.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Chemin", nomEn: "Path", type: "texte" },
    ],
    parametres: [
      { nom: "Accord de départ", nomEn: "Starting chord", type: "texte", defaut: "C", defautEn: "C",
        doc: "L'accord d'où l'on part : « C » pour do majeur, « Am » pour la mineur, « F#m » pour fa dièse mineur. Un MIDI branché en entrée l'emporte, et sa première triade sert de départ.",
        docEn: "The chord to start from: « C » for C major, « Am » for A minor, « F#m » for F sharp minor. A MIDI file on the input wins, and its first triad is used as the start." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Suite d'opérations", "Chemin vers un accord"],
        optionsEn: ["Sequence of operations", "Path to a chord"],
        optionIds: ["suite", "chemin"], defaut: "Suite d'opérations", defautEn: "Sequence of operations",
        doc: "« Suite » applique les opérations qu'on écrit. « Chemin » cherche le plus court trajet vers l'accord d'arrivée : c'est la mesure de distance propre à l'espace de Riemann, et aucune distance tonale ne la donne.",
        docEn: "« Sequence » applies the operations written out. « Path » finds the shortest route to the destination chord: the distance measure proper to Riemann's space, which no tonal distance gives." },
      { nom: "Opérations", nomEn: "Operations", type: "texte", defaut: "PLRLPR", defautEn: "PLRLPR",
        doc: "Les opérations à appliquer, dans l'ordre. P échange majeur et mineur sur la même fondamentale, L et R conduisent vers les accords voisins. « PLPLPL » parcourt le cycle hexatonique et revient au départ.",
        docEn: "The operations to apply, in order. P swaps major and minor on the same root, L and R lead to the neighbouring chords. « PLPLPL » walks the hexatonic cycle and returns to the start." },
      { nom: "Accord d'arrivée", nomEn: "Destination chord", type: "texte", defaut: "G#m", defautEn: "G#m",
        doc: "En mode « Chemin », l'accord à atteindre. Do majeur et sol dièse mineur n'ont aucune note commune et sont pourtant à trois opérations l'un de l'autre : c'est le pôle hexatonique.",
        docEn: "In « Path » mode, the chord to reach. C major and G sharp minor share no note and are yet three operations apart: the hexatonic pole." },
      { nom: "Durée d'un accord", nomEn: "Chord length", type: "nombre", plage: [0.1, 4], pas: 0.1, defaut: 1, unite: "s",
        doc: "Durée de chaque accord.", docEn: "Length of each chord." },
      { nom: "Note de base", nomEn: "Base note", type: "nombre", plage: [36, 84], pas: 1, defaut: 60,
        doc: "Hauteur autour de laquelle les accords sont placés. Les voix suivent ensuite le chemin le plus court, ce qui fait entendre la parcimonie.",
        docEn: "Pitch the chords are placed around. The voices then follow the shortest path, which is what makes the parsimony audible." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const entree = await notesDuMidi(ctx.entree(0));
      let depart = lireTriade(ctx.paramTexte("Accord de départ", "C"), { fondamentale: 0, type: "majeur" });
      if (entree && entree.length >= 3) {
        const reconnu = reconnaitre(entree.slice(0, 3).map((n) => n.note));
        if (reconnu) depart = reconnu;
      }
      const mode = ctx.paramTexte("Mode", "suite");
      let operations = lireOperations(ctx.paramTexte("Opérations", "PLRLPR"));
      let entete = "";
      const en = langueCourante() === "en";
      if (mode === "chemin") {
        const arrivee = lireTriade(ctx.paramTexte("Accord d'arrivée", "G#m"), { fondamentale: 8, type: "mineur" });
        const chemin = cheminLePlusCourt(depart, arrivee);
        if (!chemin) return { valeurs: [null, null, null], message: traduire("msg.tonnetz.sansChemin") };
        operations = chemin;
        entete = `${nomTriade(depart)} → ${nomTriade(arrivee)} : ${chemin.length} ${
          en ? "operations" : "opérations"}`;
      }
      if (operations.length === 0) return { valeurs: [null, null, null], message: traduire("msg.tonnetz.sansOperation") };

      const suite = parcourir(depart, operations);
      const accords = voixParcimonieuses(suite, Math.round(ctx.paramNombre("Note de base", 60)));
      const duree = ctx.paramNombre("Durée d'un accord", 1);
      const notes: NoteSimple[] = [];
      accords.forEach((accord, i) => {
        for (const note of accord) {
          notes.push({ note, velocite: 90, debut: i * duree, fin: i * duree + duree * 0.95 });
        }
      });
      const lignes = suite.map((t, i) => {
        const op = i === 0 ? "  " : ` ${operations[i - 1]}`;
        return `${op} ${nomTriade(t).padEnd(4)} ${accords[i].join(" ")}   [${notesDe(t).join(",")}]`;
      });
      const [audio, midi] = await rendre(ctx, notes);
      return {
        valeurs: [audio, midi, [entete, ...lignes].filter(Boolean).join("\n")],
        message: traduire("msg.tonnetz.resultat", suite.length, operations.join("")),
      };
    },
  },
  {
    id: "contrepoint-especes", nom: "Contrepoint d'espèces", nomEn: "Species Counterpoint",
    univers: "Autres", famille: "Théorie",
    resume: "Vérifie un contrepoint de première espèce contre les règles de Fux et annote chaque infraction.",
    resumeEn: "Checks a first-species counterpoint against Fux's rules and annotates every infringement.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [
      { nom: "Voix grave", nomEn: "Lower voice", type: "texte", defaut: "C4 D4 E4 F4 E4 D4 C4",
        defautEn: "C4 D4 E4 F4 E4 D4 C4",
        doc: "Le cantus firmus, une note par temps. Un MIDI branché en entrée l'emporte : ses notes sont réparties en deux voix par leur hauteur.",
        docEn: "The cantus firmus, one note per beat. A MIDI file on the input wins: its notes are split into two voices by pitch." },
      { nom: "Voix aiguë", nomEn: "Upper voice", type: "texte", defaut: "G4 F4 G4 A4 G4 B4 C5",
        defautEn: "G4 F4 G4 A4 G4 B4 C5",
        doc: "Le contrepoint, une note par temps, autant de notes que la voix grave. La valeur par défaut est un exercice juste : le composant ne doit rien y trouver.",
        docEn: "The counterpoint, one note per beat, as many notes as the lower voice. The default is a correct exercise: the node should find nothing in it." },
      { nom: "Unissons intérieurs", nomEn: "Inner unisons", type: "choix",
        options: ["Interdits", "Permis"], optionsEn: ["Forbidden", "Allowed"],
        optionIds: ["interdits", "permis"], defaut: "Interdits", defautEn: "Forbidden",
        doc: "Fux interdit l'unisson ailleurs qu'au début et à la fin, parce que les deux voix s'y confondent et que l'on n'entend plus qu'une ligne.",
        docEn: "Fux forbids the unison anywhere but at the start and the end, because the two voices merge there and only one line is heard." },
    ],
    async executer(ctx: any) {
      const lire = (texte: string): number[] => {
        const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
        return texte.split(/[\s,]+/).filter(Boolean).map((mot) => {
          const m = /^([a-gA-G])([#b]?)(-?\d+)?$/.exec(mot.trim());
          if (!m) return NaN;
          const alteration = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
          const octave = m[3] === undefined ? 4 : parseInt(m[3], 10);
          return base[m[1].toLowerCase()] + alteration + (octave + 1) * 12;
        }).filter((n) => Number.isFinite(n));
      };
      let basse: number[], haute: number[];
      const entree = await notesDuMidi(ctx.entree(0));
      if (entree && entree.length > 0) {
        // Deux voix dans un même MIDI : à chaque instant, la plus grave et la plus aiguë.
        const parInstant = new Map<number, number[]>();
        for (const n of entree) {
          const cle = Math.round(n.debut * 100);
          parInstant.set(cle, [...(parInstant.get(cle) ?? []), n.note]);
        }
        const instants = [...parInstant.keys()].sort((a, b) => a - b);
        basse = instants.map((i) => Math.min(...parInstant.get(i)!));
        haute = instants.map((i) => Math.max(...parInstant.get(i)!));
      } else {
        basse = lire(ctx.paramTexte("Voix grave", "C4 D4 E4 F4 E4 D4 C4"));
        haute = lire(ctx.paramTexte("Voix aiguë", "G4 F4 G4 A4 G4 B4 C5"));
      }
      if (basse.length === 0 || haute.length === 0) {
        return { valeurs: [null], message: traduire("msg.contrepoint.vide") };
      }
      const infractions = verifier(basse, haute, {
        unissonsInterieurs: ctx.paramTexte("Unissons intérieurs", "interdits") === "permis",
      });
      const b = bilan(infractions);
      const en = langueCourante() === "en";
      const rapport = infractions.length === 0
        ? (en ? "No infringement: the exercise respects the rules of first species."
          : "Aucune infraction : l'exercice respecte les règles de la première espèce.")
        : infractions.map((i) => `${i.gravite === "erreur" ? "✗" : "·"} ${en ? i.en : i.fr}`).join("\n");
      return {
        valeurs: [rapport],
        message: traduire("msg.contrepoint.resultat", b.erreurs, b.avis),
      };
    },
  },
  {
    id: "canon-pavage", nom: "Canon par pavage", nomEn: "Tiling Canon",
    univers: "Entrées", famille: "Génération",
    resume: "Construit un canon rythmique où chaque pulsation est frappée par une voix et une seule.",
    resumeEn: "Builds a rhythmic canon where each pulse is struck by one voice and one only.",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Grille", nomEn: "Grid", type: "texte" },
    ],
    parametres: [
      { nom: "Pulsations", nomEn: "Pulses", type: "nombre", plage: [2, 48], pas: 1, defaut: 12,
        doc: "Longueur du cycle. Le motif et les entrées doivent le paver exactement : leur produit vaut donc toujours ce nombre.",
        docEn: "Cycle length. The motif and the entries must tile it exactly: their product therefore always equals this number." },
      { nom: "Motif", nomEn: "Motif", type: "texte", defaut: "0 1 2", defautEn: "0 1 2",
        doc: "Les positions frappées par une voix, en numéros de pulsation. Laissez vide pour que le composant cherche lui-même un motif qui pave.",
        docEn: "The positions struck by one voice, as pulse numbers. Leave empty for the node to search for a tiling motif itself." },
      { nom: "Taille cherchée", nomEn: "Searched size", type: "nombre", plage: [2, 12], pas: 1, defaut: 3,
        doc: "Nombre de frappes par voix, quand le motif est laissé vide. Il doit diviser le nombre de pulsations.",
        docEn: "Number of onsets per voice, when the motif is left empty. It must divide the number of pulses." },
      { nom: "Durée d'un pas", nomEn: "Step length", type: "nombre", plage: [0.05, 1], pas: 0.05, defaut: 0.2, unite: "s",
        doc: "Durée d'une pulsation.", docEn: "Length of one pulse." },
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 16], pas: 1, defaut: 4,
        doc: "Nombre de tours joués.", docEn: "Number of cycles played." },
      { nom: "Hauteurs", nomEn: "Pitches", type: "texte", defaut: "60 64 67 72", defautEn: "60 64 67 72",
        doc: "Une hauteur MIDI par voix. C'est ce qui rend le pavage audible : à hauteur unique, on n'entendrait qu'une pulsation régulière, ce qu'est justement tout canon par pavage, sans entendre qu'elle est partagée.",
        docEn: "One MIDI pitch per voice. This is what makes the tiling audible: on a single pitch one would hear only a steady pulse, which is exactly what every tiling canon is, without hearing that it is shared." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const n = Math.round(ctx.paramNombre("Pulsations", 12));
      const texte = ctx.paramTexte("Motif", "0 1 2").trim();
      let motif = texte.split(/[\s,]+/).filter(Boolean).map((x: string) => parseInt(x, 10))
        .filter((x: number) => Number.isFinite(x));
      if (motif.length === 0) {
        const trouves = chercherMotifs(n, Math.round(ctx.paramNombre("Taille cherchée", 3)), 1);
        if (trouves.length === 0) return { valeurs: [null, null, null], message: traduire("msg.canon.introuvable") };
        motif = trouves[0];
      }
      const canon = construire(motif, n);
      if (!canon) return { valeurs: [null, null, null], message: traduire("msg.canon.nePavePas", motif.join(" "), n) };
      const hauteurs = ctx.paramTexte("Hauteurs", "60 64 67 72").split(/[\s,]+/).filter(Boolean)
        .map((x: string) => parseInt(x, 10)).filter((x: number) => Number.isFinite(x));
      const notes = canonEnNotes(
        canon, ctx.paramNombre("Durée d'un pas", 0.2),
        hauteurs.length > 0 ? hauteurs : [60], Math.round(ctx.paramNombre("Répétitions", 4)),
      );
      const en = langueCourante() === "en";
      const grille = [
        `${en ? "Motif" : "Motif"} : ${canon.rythme.join(" ")}`,
        `${en ? "Entries" : "Entrées"} : ${canon.entrees.join(" ")}`,
        `${canon.entrees.length} ${en ? "voices" : "voix"} × ${canon.rythme.length} ${en ? "onsets" : "frappes"} = ${canon.n}`,
        canon.vuza
          ? (en ? "Aperiodic motif and entries: a Vuza canon." : "Motif et entrées apériodiques : un canon de Vuza.")
          : (en ? "Periodic motif or entries: an ordinary tiling." : "Motif ou entrées périodiques : un pavage ordinaire."),
        "",
        canonEnTexte(canon),
      ].join("\n");
      const [audio, midi] = await rendre(ctx, notes);
      return {
        valeurs: [audio, midi, grille],
        message: traduire("msg.canon.resultat", canon.entrees.length, canon.rythme.length, canon.n),
      };
    },
  },
  {
    id: "serie-infinie", nom: "Série de l'infini (Nørgård)", nomEn: "Infinity Series (Nørgård)",
    univers: "Entrées", famille: "Génération",
    resume: "Engendre la suite auto-similaire de Per Nørgård, et ses voix plus lentes qui forment un canon exact.",
    resumeEn: "Generates Per Nørgård's self-similar sequence, and its slower voices which form an exact canon.",
    entrees: [],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Suite", nomEn: "Sequence", type: "texte" },
    ],
    parametres: [
      { nom: "Notes", nomEn: "Notes", type: "nombre", plage: [4, 1000], pas: 1, defaut: 64,
        doc: "Nombre de termes engendrés.", docEn: "Number of terms generated." },
      { nom: "Voix", nomEn: "Voices", type: "nombre", plage: [1, 3], pas: 1, defaut: 1,
        doc: "Superpose la suite prise un terme sur un, sur deux et sur quatre. Ce n'est pas un effet : au pas 4, la suite se retrouve identique à elle-même, si bien que la voix lente est la même mélodie et que le contrepoint se tient tout seul. C'est le procédé de la Deuxième Symphonie.",
        docEn: "Superimposes the sequence taken every term, every two and every four. This is not an effect: at stride 4 the sequence comes back identical to itself, so the slow voice is the same melody and the counterpoint holds by itself. It is the procedure of the Second Symphony." },
      { nom: "Tonique", nomEn: "Tonic", type: "choix", options: NOMS, optionsEn: NOMS_EN, optionIds: IDS,
        defaut: "Do", defautEn: "C",
        doc: "La note d'où part la suite, dont le premier terme vaut toujours zéro.",
        docEn: "The note the sequence starts from, its first term always being zero." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de la tonique.", docEn: "Octave of the tonic." },
      { nom: "Lecture", nomEn: "Reading", type: "choix",
        options: ["Demi-tons", "Degrés de la gamme"], optionsEn: ["Semitones", "Scale degrees"],
        optionIds: ["demi-tons", "degres"], defaut: "Demi-tons", defautEn: "Semitones",
        doc: "En demi-tons, la suite se déploie chromatiquement et sort de toute tonalité : c'est la lecture de Nørgård. En degrés, chaque entier compte un degré de la gamme et le résultat reste tonal, même structure, tout autre caractère.",
        docEn: "In semitones the sequence unfolds chromatically and leaves any key behind: that is Nørgård's reading. In degrees each integer counts a scale step and the result stays tonal, same structure, quite another character." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["Majeure", "Mineure", "Pentatonique", "Chromatique"],
        optionsEn: ["Major", "Minor", "Pentatonic", "Chromatic"],
        optionIds: ["majeure", "mineure", "pentatonique", "chromatique"],
        defaut: "Majeure", defautEn: "Major",
        doc: "La gamme employée en lecture par degrés.", docEn: "The scale used when reading by degrees." },
      { nom: "Durée d'une note", nomEn: "Note length", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.25, unite: "s",
        doc: "Durée de chaque note de la voix rapide.", docEn: "Length of each note of the fast voice." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const longueur = Math.round(ctx.paramNombre("Notes", 64));
      const nombreVoix = Math.round(ctx.paramNombre("Voix", 1));
      const tonique = (parseInt(ctx.paramTexte("Tonique", "0"), 10) || 0)
        + (Math.round(ctx.paramNombre("Octave", 4)) + 1) * 12;
      const mode = ctx.paramTexte("Lecture", "demi-tons") as ModeHauteur;
      const gamme = GAMMES[ctx.paramTexte("Gamme", "majeure")] ?? GAMMES.majeure;
      const duree = ctx.paramNombre("Durée d'une note", 0.25);

      const notes: NoteSimple[] = [];
      for (let v = 0; v < nombreVoix; v++) {
        const pas = 2 ** v;
        const combien = Math.max(2, Math.floor(longueur / pas));
        const valeurs = voix(combien, pas);
        // Chaque voix est d'autant plus lente et plus grave qu'elle prend un terme sur plus.
        const hauteurs = versHauteurs(valeurs, tonique - 12 * v, mode, gamme);
        hauteurs.forEach((note, i) => {
          notes.push({
            note, velocite: v === 0 ? 96 : 76,
            debut: i * duree * pas, fin: i * duree * pas + duree * pas * 0.9,
          });
        });
      }
      const valeurs = serie(longueur);
      const s = statistiques(valeurs);
      const en = langueCourante() === "en";
      const texte = [
        valeurs.slice(0, 64).join(" ") + (longueur > 64 ? " …" : ""),
        "",
        `${en ? "Range" : "Étendue"} : ${s.minimum} … ${s.maximum} · ${s.distinctes} ${
          en ? "distinct values" : "valeurs distinctes"}`,
        en
          ? "Every fourth term repeats the sequence identically; every second term gives its inversion."
          : "Un terme sur quatre redonne la suite à l'identique ; un terme sur deux donne son inversion.",
      ].join("\n");
      const [audio, midi] = await rendre(ctx, notes);
      return {
        valeurs: [audio, midi, texte],
        message: traduire("msg.norgard.resultat", notes.length, nombreVoix, s.minimum, s.maximum),
      };
    },
  },
  {
    id: "auto-similarite", nom: "Matrice d'auto-similarité", nomEn: "Self-Similarity Matrix",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dessine la forme d'un morceau et en détecte les articulations, par la méthode de Foote.",
    resumeEn: "Draws a piece's form and detects its boundaries, by Foote's method.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Matrice", nomEn: "Matrix", type: "image" },
      { nom: "Structure", nomEn: "Structure", type: "texte" },
    ],
    parametres: [
      { nom: "Trame", nomEn: "Frame", type: "nombre", plage: [0.1, 2], pas: 0.1, defaut: 0.5, unite: "s",
        doc: "Durée d'une trame d'analyse. Courte, on voit le détail des accords ; longue, on voit les grandes sections. C'est le réglage qui décide de l'échelle à laquelle on regarde la forme.",
        docEn: "Length of one analysis frame. Short, the chord detail shows; long, the large sections do. This setting decides the scale at which the form is looked at." },
      { nom: "Taille du noyau", nomEn: "Kernel size", type: "nombre", plage: [2, 40], pas: 1, defaut: 8, unite: " trames", uniteEn: " frames",
        doc: "Demi-largeur du noyau en damier glissé le long de la diagonale. Il ne s'accorde qu'aux endroits où « avant » et « après » se ressemblent chacun sans se ressembler entre eux ; c'est-à-dire aux frontières.",
        docEn: "Half-width of the checkerboard kernel slid along the diagonal. It only matches where « before » and « after » each resemble themselves without resembling each other; that is, at boundaries." },
      { nom: "Seuil", nomEn: "Threshold", type: "nombre", plage: [1, 99], pas: 1, defaut: 40, unite: "%",
        doc: "Hauteur minimale d'un pic pour être retenu comme frontière. Bas, on découpe finement ; haut, on ne garde que les articulations franches.",
        docEn: "Minimum peak height to count as a boundary. Low, the cut is fine; high, only the clear articulations remain." },
      { nom: "Écart minimal", nomEn: "Minimum gap", type: "nombre", plage: [1, 40], pas: 1, defaut: 6, unite: " trames", uniteEn: " frames",
        doc: "Distance minimale entre deux frontières. Un pic large donne sinon trois ou quatre maxima qui décrivent tous la même articulation.",
        docEn: "Minimum distance between two boundaries. A broad peak otherwise gives three or four maxima all describing the same articulation." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      const dureeTrame = ctx.paramNombre("Trame", 0.5);
      // Le chromagramme avance de 512 échantillons ; on regroupe pour atteindre la durée
      // de trame demandée, seule échelle à laquelle la forme d'un morceau se voit.
      const facteur = Math.max(1, Math.round((dureeTrame * audio.sampleRate) / SAUT_TRAME_CHROMAGRAMME));
      const trames = regrouper(chromagrammeParTrame(audio.getChannelData(0), audio.sampleRate), facteur);
      if (trames.length < 8) return { valeurs: [null, null, null], message: traduire("msg.similarite.tropCourt") };
      const matrice = matriceSimilarite(trames);
      const noyau = Math.min(Math.round(ctx.paramNombre("Taille du noyau", 8)), Math.floor(trames.length / 3));
      const courbe = courbeNouveaute(matrice, Math.max(2, noyau));
      const trouvees = frontieres(
        courbe, ctx.paramNombre("Seuil", 40) / 100, Math.round(ctx.paramNombre("Écart minimal", 6)),
      );
      const parties = segments(trouvees, trames.length);
      const en = langueCourante() === "en";
      const temps = (trame: number) => `${(trame * dureeTrame).toFixed(1)} s`;
      const texte = [
        `${trames.length} ${en ? "frames of" : "trames de"} ${dureeTrame.toFixed(1)} s · ${
          parties.length} ${en ? "sections" : "sections"}`,
        "",
        ...parties.map((p, i) => `${en ? "Section" : "Section"} ${i + 1} : ${temps(p.debut)} → ${temps(p.fin)}`),
        "",
        trouvees.length === 0
          ? (en ? "No boundary found: either the piece is homogeneous, or the threshold is too high."
            : "Aucune frontière trouvée : soit le morceau est homogène, soit le seuil est trop haut.")
          : `${en ? "Boundaries" : "Frontières"} : ${trouvees.map(temps).join(" · ")}`,
      ].join("\n");
      return {
        valeurs: [audio, matriceEnSvg(matrice, 320), texte],
        message: traduire("msg.similarite.resultat", parties.length, trames.length),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
