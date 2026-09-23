// plugins/theorie-rythme-voix.ts — Analyser un rythme, mesurer une conduite de voix.
//
// D'après Godfried Toussaint, « The Geometry of Musical Rhythm » (2013), et Dmitri Tymoczko,
// « The Geometry of Musical Chords », Science 313, 2006. La logique est dans
// `audio/rythme-analyse.ts` et `audio/conduite-voix.ts`, testées ; ce fichier n'est que la prise.

import { parseMidi } from "midi-file";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  analyserRythme, enCases, rythme, type Rythme,
} from "../audio/rythme-analyse";
import { motifEuclidien } from "../audio/euclidien";
import { analyserConduite } from "../audio/conduite-voix";

interface NoteSimple { note: number; debut: number; fin: number }

async function notesDuMidi(fichier: unknown): Promise<NoteSimple[] | null> {
  if (!(fichier instanceof File)) return null;
  const { analyserMidi } = await import("../audio");
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({ note: n.note, debut: n.debut, fin: n.fin }));
}

/** Lit un motif écrit à la main : « x..x..x. » ou « 1001001 0 » ou « 0 3 6 ». */
export function lireMotif(texte: string, pasDemandes: number): Rythme {
  const nettoye = texte.trim();
  if (/^[\sx.\-_01]+$/i.test(nettoye) && /[x.\-_01]/i.test(nettoye)) {
    const cases = nettoye.replace(/\s+/g, "");
    const positions = [...cases].map((c, i) => (/[x1]/i.test(c) ? i : -1)).filter((i) => i >= 0);
    if (cases.length > 1) return rythme(positions, cases.length);
  }
  // `Number("")` vaut ZÉRO et non NaN : sans écarter les morceaux vides, une espace en tête
  // ajouterait une frappe sur le premier temps que personne n'a écrite.
  const nombres = nettoye.split(/[\s,;]+/).filter((t) => t !== "").map(Number).filter(Number.isFinite);
  return rythme(nombres, Math.max(1, pasDemandes));
}

/** Quantifie les attaques d'un MIDI sur une grille de `pas` cases. */
export function motifDepuisNotes(notes: NoteSimple[], pas: number, cycleSec: number): Rythme {
  const positions = notes.map((n) => Math.round((n.debut / cycleSec) * pas) % pas);
  return rythme(positions, pas);
}

/** Les accords successifs d'un MIDI : les notes qui commencent ensemble, à une tolérance près. */
export function accordsSuccessifs(notes: NoteSimple[], tolerance = 0.05): number[][] {
  const tries = [...notes].sort((a, b) => a.debut - b.debut);
  const groupes: number[][] = [];
  let courant: NoteSimple[] = [];
  for (const n of tries) {
    if (courant.length > 0 && n.debut - courant[0].debut > tolerance) {
      groupes.push(courant.map((x) => x.note));
      courant = [];
    }
    courant.push(n);
  }
  if (courant.length > 0) groupes.push(courant.map((x) => x.note));
  return groupes;
}

/** Lit une suite d'accords écrite « 0 4 7 | 0 3 7 | 9 0 4 ». */
export function lireAccords(texte: string): number[][] {
  // LES MORCEAUX VIDES SONT ÉCARTÉS AVANT LA CONVERSION, parce que `Number("")` vaut zéro. Sans
  // cela, l'espace qui suit une barre verticale ajoutait un do à chaque accord : « 6 10 1 » était
  // lu à quatre notes, ne pouvait plus être apparié à un accord de trois, et la progression
  // rendait zéro demi-ton. Mesuré dans l'application avant correction.
  return texte.split(/[|\n;]+/)
    .map((bloc) => bloc.split(/[\s,]+/).filter((t) => t !== "").map(Number).filter(Number.isFinite))
    .filter((a) => a.length > 0);
}

export const fiches: FicheAudio[] = ([
  {
    id: "analyse-rythme", nom: "Analyse rythmique", nomEn: "Rhythm Analysis",
    univers: "Autres", famille: "Théorie",
    resume: "Décrit un rythme comme « Classes de hauteurs » décrit un accord : intervalles, régularité, contretemps, collier.",
    resumeEn: "Describes a rhythm the way « Pitch-Class Sets » describes a chord: intervals, evenness, offbeats, necklace.",
    notice: "Analyse un rythme par sa géométrie sur le cercle. D'après Godfried Toussaint, « The Geometry of Musical Rhythm: What Makes a \"Good\" Rhythm Good? » (2013).\n\nUn rythme se décrit comme un ensemble de points sur un cercle : ses distances, ses symétries, sa régularité.\n\nToutes les mesures comptent sur le cercle, parce qu'un rythme se répète : sa fin touche son début. C'est ce qui fait qu'un rythme et ses rotations sont le même objet : la clave son et la rumba ne diffèrent que par l'endroit où l'on commence à compter, et leur collier le dit.\n\nCe que chaque mesure apprend. Les intervalles successifs sont la façon dont les percussionnistes nomment leurs rythmes : la clave son est le 3-3-4-2-4. L'histogramme des distances est le vecteur d'intervalles du rythme, et deux rythmes qui le partagent se ressemblent indépendamment de leur rotation. Un rythme profond donne à chaque écart sa propre rareté, si bien qu'aucune paire de frappes n'y est interchangeable. L'uniformité dit à quel point les frappes sont écartées, un valant la régularité parfaite. Les contretemps sont les frappes qui ne tombent sur aucune subdivision régulière, la mesure qui, selon Toussaint, sépare les rythmes africains et afro-cubains des rythmes de danse européens bien mieux que les mesures de syncope usuelles.",
    noticeEn: "Analyses a rhythm by its geometry on the circle. After Godfried Toussaint, « The Geometry of Musical Rhythm: What Makes a \"Good\" Rhythm Good? » (2013).\n\nA rhythm is described as a set of points on a circle: its distances, its symmetries, its evenness.\n\nEvery measure counts on the circle, because a rhythm repeats: its end touches its beginning. That is what makes a rhythm and its rotations the same object: the son clave and the rumba differ only in where one starts counting, and their necklace says so.\n\nWhat each measure teaches. The successive intervals are how percussionists name their rhythms: the son clave is the 3-3-4-2-4. The distance histogram is the rhythm's interval vector, and two rhythms sharing it resemble each other regardless of rotation. A deep rhythm gives each gap its own rarity, so that no pair of onsets in it is interchangeable. Evenness says how far apart the onsets are, one being perfect regularity. Offbeats are the onsets falling on no regular subdivision, the measure that, according to Toussaint, separates African and Afro-Cuban rhythms from European dance rhythms far better than the usual syncopation measures.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: "x..x..x...x.x...", defautEn: "x..x..x...x.x...",
        doc: "Le rythme à analyser, en cases pleines et vides, « x..x..x. », ou en positions, « 0 3 6 ». Le motif par défaut est la clave son, le rythme le plus répandu du monde. Un MIDI branché en entrée l'emporte.",
        docEn: "The rhythm to analyse, as filled and empty cells, « x..x..x. », or as positions, « 0 3 6 ». The default is the son clave, the most widespread rhythm in the world. A MIDI file on the input wins." },
      { nom: "Pas", nomEn: "Steps", type: "curseur", plage: [2, 64], pas: 1, defaut: 16,
        doc: "Nombre de cases du cycle. Sert quand le motif est donné en positions, et pour quantifier un MIDI. Un motif écrit en cases impose sa propre longueur.",
        docEn: "Number of cells in the cycle. Used when the pattern is given as positions, and to quantise a MIDI file. A pattern written as cells imposes its own length." },
      { nom: "Cycle", nomEn: "Cycle", type: "curseur", plage: [0.25, 16], pas: 0.25, defaut: 2, unite: "s",
        doc: "Durée d'un tour, pour quantifier un MIDI. Sans MIDI branché, ce réglage ne sert pas.",
        docEn: "Length of one turn, to quantise a MIDI file. With no MIDI connected, this setting does nothing." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const pas = Math.round(ctx.paramNombre("Pas", 16));
      const notes = await notesDuMidi(ctx.entree(0));
      const r = notes && notes.length > 0
        ? motifDepuisNotes(notes, pas, ctx.paramNombre("Cycle", 2))
        : lireMotif(ctx.paramTexte("Motif", "x..x..x...x.x..."), pas);
      if (r.positions.length === 0) return { valeurs: [null], message: traduire("msg.serie.vide") };

      const a = analyserRythme(r, motifEuclidien(r.pas, r.positions.length));
      const oui = en ? "yes" : "oui";
      const non = en ? "no" : "non";
      const lignes = [
        `${en ? "Rhythm" : "Rythme"} : ${a.cases}   (${r.positions.length}/${r.pas})`,
        `${en ? "Intervals" : "Intervalles"} : ${a.intervalles.join("-")}`,
        `${en ? "Distance histogram" : "Histogramme des distances"} : [${a.histogramme.join(" ")}]`,
        `${en ? "Evenness" : "Uniformité"} : ${(a.uniformite * 100).toFixed(1)} %`,
        `${en ? "Deep" : "Profond"} : ${a.profond ? oui : non}`,
        `${en ? "Offbeats" : "Contretemps"} : ${a.contretemps.length > 0 ? a.contretemps.join(", ") : (en ? "none" : "aucun")}`,
        `${en ? "Necklace" : "Collier"} : ${a.collier}`,
        `${en ? "Bracelet" : "Bracelet"} : ${a.bracelet}`,
        "",
        `${en ? "Euclidean rhythm of the same counts" : "Rythme euclidien de mêmes effectifs"} : ${a.euclidien}`,
        a.estEuclidien
          ? (en ? "This rhythm IS that Euclidean rhythm, up to rotation." : "Ce rythme EST ce rythme euclidien, à une rotation près.")
          : `${en ? "Swap distance to it" : "Distance d'échange qui l'en sépare"} : ${a.distanceEuclidien}`,
      ];
      return {
        valeurs: [lignes.join("\n")],
        message: traduire("msg.analyseRythme.resume",
          a.intervalles.join("-"), (a.uniformite * 100).toFixed(0), String(a.contretemps.length)),
      };
    },
  },
  {
    id: "distance-conduite-voix", nom: "Distance de conduite de voix", nomEn: "Voice-Leading Distance",
    univers: "Autres", famille: "Théorie",
    resume: "Mesure en demi-tons ce que coûte chaque enchaînement d'accords, et dit lequel coule et lequel se tend.",
    resumeEn: "Measures in semitones what each chord change costs, and says which one flows and which one strains.",
    notice: "Mesure la distance de conduite des voix entre deux accords, en demi-tons. D'après Dmitri Tymoczko, « The Geometry of Musical Chords », Science 313(5783), 2006, et « A Geometry of Music » (2011).\n\nCette distance est la somme des déplacements de chaque voix, pour l'appariement qui la minimise. Elle rend un nombre, ce qui permet de comparer deux harmonisations et de repérer l'endroit d'une pièce où le mouvement se tend.\n\nLe théorème qui rend le calcul court. On croit devoir essayer toutes les façons d'apparier les voix, six notes en font sept cent vingt. Tymoczko démontre qu'il n'en est rien : la conduite minimale entre deux accords de même taille est toujours réalisable sans croisement de voix. Il suffit donc de trier les deux accords et d'essayer les rotations de l'un contre l'autre, et le résultat est le minimum exact et non une approximation.\n\nCe que les chiffres disent. Les transformations néo-riemanniennes P, L et R coûtent un, un et deux demi-tons ; ce sont les enchaînements les plus lisses qui existent entre accords parfaits. Six demi-tons est le maximum entre deux accords parfaits, atteint par deux accords diamétralement opposés comme do et fa dièse. Entre les deux, on lit la tension d'une progression.",
    noticeEn: "Measures the voice-leading distance between two chords, in semitones. After Dmitri Tymoczko, « The Geometry of Musical Chords », Science 313(5783), 2006, and « A Geometry of Music » (2011).\n\nThat distance is the sum of each voice's displacement, for the pairing that minimises it. It returns a number, which allows two harmonisations to be compared and the place in a piece where the movement strains to be found.\n\nThe theorem that makes the computation short. One believes one must try every way of pairing the voices, six notes make seven hundred and twenty. Tymoczko proves otherwise: the minimal voice leading between two chords of the same size is always achievable without voice crossings. It therefore suffices to sort both chords and try the rotations of one against the other, and the result is the exact minimum, not an approximation.\n\nWhat the numbers say. The neo-Riemannian transformations P, L and R cost one, one and two semitones, the smoothest chord changes that exist between triads. Six semitones is the maximum between two triads, reached by diametrically opposed chords such as C and F sharp. Between the two, one reads a progression's tension.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    parametres: [
      { nom: "Accords", nomEn: "Chords", type: "texte", defaut: "0 4 7 | 9 0 4 | 5 9 0 | 7 11 2 | 0 4 7",
        defautEn: "0 4 7 | 9 0 4 | 5 9 0 | 7 11 2 | 0 4 7",
        doc: "Les accords, séparés par des barres verticales, chacun en classes de hauteurs de 0 à 11. Le défaut est la progression do, la mineur, fa, sol, do. Un MIDI branché en entrée l'emporte.",
        docEn: "The chords, separated by vertical bars, each as pitch classes from 0 to 11. The default is the progression C, A minor, F, G, C. A MIDI file on the input wins." },
      { nom: "Tolérance", nomEn: "Tolerance", type: "curseur", plage: [0.01, 0.5], pas: 0.01, defaut: 0.05, unite: "s",
        doc: "Écart en deçà duquel deux notes d'un MIDI sont tenues pour simultanées, donc membres du même accord. Sans MIDI branché, ce réglage ne sert pas.",
        docEn: "Gap below which two notes of a MIDI file are taken as simultaneous, hence members of the same chord. With no MIDI connected, this setting does nothing." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const notes = await notesDuMidi(ctx.entree(0));
      const accords = notes && notes.length > 0
        ? accordsSuccessifs(notes, ctx.paramNombre("Tolérance", 0.05))
        : lireAccords(ctx.paramTexte("Accords", "0 4 7 | 9 0 4 | 5 9 0 | 7 11 2 | 0 4 7"));
      if (accords.length < 2) return { valeurs: [null], message: traduire("msg.conduiteVoix.troisPeu") };

      const a = analyserConduite(accords);
      const nom = (c: number[]) => `[${[...new Set(c.map((n) => ((n % 12) + 12) % 12))].sort((x, y) => x - y).join(" ")}]`;
      const lignes = a.etapes.map((e, i) => {
        const tete = `${String(i + 1).padStart(2)}. ${nom(e.depart)} → ${nom(e.arrivee)}`;
        if (!e.conduite) return `${tete}   ${en ? "not measurable (different sizes)" : "non mesurable (tailles différentes)"}`;
        const voix = e.conduite.affectation
          .map(([d, f], k) => `${d}→${f}${e.conduite!.deplacements[k] > 0 ? ` (${e.conduite!.deplacements[k]})` : ""}`)
          .join("  ");
        return `${tete}   ${e.conduite.distance} ${en ? "semitones" : "demi-tons"}   ${voix}`;
      });
      const resume = [
        "",
        `${en ? "Total" : "Total"} : ${a.total} ${en ? "semitones" : "demi-tons"}`,
        `${en ? "Average per change" : "Moyenne par enchaînement"} : ${a.moyenne.toFixed(2)}`,
        a.plusLisse >= 0 ? `${en ? "Smoothest" : "Le plus lisse"} : ${en ? "change" : "enchaînement"} ${a.plusLisse + 1}` : "",
        a.plusTendue >= 0 ? `${en ? "Most strained" : "Le plus tendu"} : ${en ? "change" : "enchaînement"} ${a.plusTendue + 1}` : "",
        a.uneSeuleVoix.length > 0
          ? `${en ? "Moving one voice only" : "Ne bougeant qu'une voix"} : ${a.uneSeuleVoix.map((i) => i + 1).join(", ")}`
          : "",
        a.ignorees > 0 ? `${en ? "Not measured" : "Non mesurés"} : ${a.ignorees}` : "",
      ].filter((l) => l !== "");
      return {
        valeurs: [[...lignes, ...resume].join("\n")],
        message: traduire("msg.conduiteVoix.resume", String(a.total), a.moyenne.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
