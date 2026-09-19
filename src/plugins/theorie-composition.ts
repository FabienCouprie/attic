// plugins/theorie-composition.ts — Quatre nœuds de composition assistée.
//
// La famille « Théorie » d'Attic savait nommer un accord, lister une gamme, transposer une
// note et développer une progression en chiffres romains — tout le nécessaire pour la
// musique tonale, et rien pour le reste. Ces quatre nœuds couvrent ce qui manquait : les
// opérations sérielles, l'analyse par ensembles de classes de hauteurs, l'harmonie
// négative, et la mise en voix des accords.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { parseMidi } from "midi-file";
import {
  PARAMETRE_INSTRUMENT_SF2, PARAMETRE_SYNTHESE, decoderInstrumentSF2,
  normaliserModeSynthèse, sf2Chargee,
} from "./soundfontGlobal";
import {
  estSerieComplete, forme, lireSuite, matriceEnTexte, nomClasse, placerDansRegistre,
  transposer, type FormeSerielle,
} from "../audio/theorie-serielle";
import {
  analyser, enCrochets, nomClasse as nomClasseEns, type Analyse,
} from "../audio/classes-hauteurs";
import { refleterNotes, tableReflets, type ModeReflet } from "../audio/harmonie-negative";
import {
  accords, conduireVoix, remplacerHauteurs, renverser, voicing, type TypeVoicing,
} from "../audio/voicings";

interface NoteSimple { note: number; velocite: number; debut: number; fin: number; canal?: number }

/** Lit un MIDI d'entrée, ou rend null si rien n'est branché. */
async function notesDuMidi(fichier: unknown): Promise<NoteSimple[] | null> {
  if (!(fichier instanceof File)) return null;
  const { analyserMidi } = await import("../audio");
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await fichier.arrayBuffer())));
  return notes.map((n) => ({
    note: n.note, velocite: n.velociete ?? 90, debut: n.debut, fin: n.fin, canal: n.canal,
  }));
}

/**
 * Rend les notes en AUDIO et en MIDI.
 *
 * L'audio n'est pas un supplément : sans lui, le nœud n'a pas de lecteur et l'on ne peut
 * pas entendre ce qu'on vient de régler sans lui brancher un point d'écoute. Un nœud de
 * théorie a d'autant plus besoin de s'entendre que son intérêt est de comparer — une série
 * et son rétrograde, un accord et son image négative.
 */
async function rendreEtEcrire(ctx: any, notes: NoteSimple[]): Promise<[AudioBuffer, File]> {
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

/** Les réglages de rendu communs : écouter d'abord, exporter ensuite. */
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

const TONIQUES = {
  options: ["Do", "Do#", "Ré", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"],
  optionsEn: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
  optionIds: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
};

/** Le rapport d'analyse d'un ensemble, dans la langue courante. */
function rapportAnalyse(a: Analyse, titre: string): string {
  const en = langueCourante() === "en";
  const nom = a.nom ? `${a.nom.forte} · ${en ? a.nom.en : a.nom.fr}` : (en ? "not catalogued" : "hors catalogue");
  const sym = a.symetries.transpositions.length > 0
    ? a.symetries.transpositions.join(", ")
    : (en ? "none" : "aucune");
  const lignes = [
    `${titre} : ${a.classes.map(nomClasseEns).join(" ")}`,
    `  ${en ? "normal form" : "forme normale"}   ${enCrochets(a.normale)}`,
    `  ${en ? "prime form" : "forme première"}  ${enCrochets(a.premiere)}  ${nom}`,
    `  ${en ? "interval vector" : "vecteur d'intervalles"}  <${a.vecteur.join(" ")}>`,
    `  ${en ? "complement" : "complément"}  ${enCrochets(a.complementaire)}`,
    `  ${en ? "transpositional symmetry" : "symétrie par transposition"}  ${sym}`,
  ];
  return lignes.join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "serie-dodecaphonique", nom: "Opérations sérielles", nomEn: "Serial Operations",
    univers: "Traitement", famille: "Effets",
    resume: "Joue les quatre formes d'une série — originale, rétrograde, inversion, rétrograde de l'inversion — et écrit sa matrice.",
    resumeEn: "Plays a row's four forms — original, retrograde, inversion, retrograde inversion — and writes its matrix.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Matrice", nomEn: "Matrix", type: "texte" },
    ],
    parametres: [
      { nom: "Série", nomEn: "Row", type: "texte", defaut: "G Bb D F# A C E G# B C# D# F",
        defautEn: "G Bb D F# A C E G# B C# D# F",
        doc: "La série, en noms de notes ou en chiffres de 0 à 11, séparés par des espaces. La valeur par défaut est celle du Concerto pour violon de Berg. Un MIDI branché en entrée l'emporte : ses hauteurs sont lues dans l'ordre.",
        docEn: "The row, as note names or numbers from 0 to 11, separated by spaces. The default is the row of Berg's Violin Concerto. A MIDI file on the input wins: its pitches are read in order." },
      { nom: "Forme", nomEn: "Form", type: "choix",
        options: ["Originale", "Rétrograde", "Inversion", "Rétrograde de l'inversion", "Les quatre à la suite"],
        optionsEn: ["Original", "Retrograde", "Inversion", "Retrograde inversion", "All four in turn"],
        optionIds: ["originale", "retrograde", "inversion", "retrograde-inversion", "quatre"],
        defaut: "Originale", defautEn: "Original",
        doc: "La transformation jouée. « Les quatre à la suite » enchaîne les quatre formes, ce qui fait entendre d'un coup ce que la matrice montre.",
        docEn: "The transformation played. « All four in turn » chains the four forms, which makes audible at once what the matrix shows." },
      { nom: "Transposition", nomEn: "Transposition", type: "nombre", plage: [0, 11], pas: 1, defaut: 0,
        doc: "Niveau de transposition de la forme jouée, en demi-tons. Avec les quarante-huit combinaisons de forme et de niveau, on a tout ce qu'une série permet.",
        docEn: "Transposition level of the played form, in semitones. With the forty-eight combinations of form and level, one has everything a row allows." },
      { nom: "Registre", nomEn: "Register", type: "choix",
        options: ["Serré", "Une octave"], optionsEn: ["Closest", "One octave"],
        optionIds: ["serre", "octave"], defaut: "Serré", defautEn: "Closest",
        doc: "« Serré » choisit à chaque note l'octave la plus proche de la précédente, ce qui fait entendre une ligne ; « Une octave » range tout au-dessus de la note de départ, ce qui fait entendre l'ordre des classes.",
        docEn: "« Closest » picks, for each note, the octave nearest the previous one, which makes a line audible; « One octave » stacks everything above the starting note, which makes the order of the classes audible." },
      { nom: "Note de départ", nomEn: "Starting note", type: "nombre", plage: [24, 96], pas: 1, defaut: 60,
        doc: "Hauteur MIDI autour de laquelle la série est placée.", docEn: "MIDI pitch the row is placed around." },
      { nom: "Durée d'une note", nomEn: "Note length", type: "nombre", plage: [0.05, 2], pas: 0.05, defaut: 0.3, unite: "s",
        doc: "Durée de chaque note de la série.", docEn: "Length of each note of the row." },
      { nom: "Vélocité", nomEn: "Velocity", type: "nombre", plage: [1, 127], pas: 1, defaut: 90,
        doc: "Force des notes.", docEn: "Note strength." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const entree = await notesDuMidi(ctx.entree(0));
      const serie = entree && entree.length > 0
        ? [...entree].sort((a, b) => a.debut - b.debut || a.note - b.note).map((n) => ((n.note % 12) + 12) % 12)
        : lireSuite(ctx.paramTexte("Série", "G Bb D F# A C E G# B C# D# F"));
      if (serie.length === 0) return { valeurs: [null, null, null], message: traduire("msg.serie.vide") };

      const choix = ctx.paramTexte("Forme", "originale");
      const niveau = Math.round(ctx.paramNombre("Transposition", 0));
      const formes: FormeSerielle[] = choix === "quatre"
        ? ["originale", "retrograde", "inversion", "retrograde-inversion"]
        : [choix as FormeSerielle];
      const classes = formes.flatMap((f) => transposer(forme(serie, f), niveau));

      const serre = ctx.paramTexte("Registre", "serre") === "serre";
      const hauteurs = placerDansRegistre(classes, Math.round(ctx.paramNombre("Note de départ", 60)), serre);
      const duree = ctx.paramNombre("Durée d'une note", 0.3);
      const velocite = Math.round(ctx.paramNombre("Vélocité", 90));
      const notes = hauteurs.map((note, i) => ({
        note, velocite, debut: i * duree, fin: i * duree + duree * 0.9,
      }));

      const complete = estSerieComplete(serie);
      const rapport = [
        `${serie.map(nomClasse).join(" ")} — ${serie.length} ${
          langueCourante() === "en" ? "classes" : "classes"}${
          complete ? "" : (langueCourante() === "en" ? " (not a complete row)" : " (série incomplète)")}`,
        "",
        matriceEnTexte(serie),
      ].join("\n");
      const [audio, midi] = await rendreEtEcrire(ctx, notes);
      return {
        valeurs: [audio, midi, rapport],
        message: traduire("msg.serie.resultat", notes.length, formes.length, niveau),
      };
    },
  },
  {
    id: "classes-hauteurs", nom: "Classes de hauteurs", nomEn: "Pitch-Class Sets",
    univers: "Autres", famille: "Théorie",
    resume: "Analyse un accord ou un passage en ensemble de classes de hauteurs : forme normale, forme première, vecteur d'intervalles.",
    resumeEn: "Analyses a chord or passage as a pitch-class set: normal form, prime form, interval vector.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Analyse", nomEn: "Analysis", type: "texte" }],
    parametres: [
      { nom: "Notes", nomEn: "Notes", type: "texte", defaut: "C E G B",
        defautEn: "C E G B",
        doc: "Les notes à analyser, en noms ou en chiffres de 0 à 11. Un MIDI branché en entrée l'emporte.",
        docEn: "The notes to analyse, as names or numbers from 0 to 11. A MIDI file on the input wins." },
      { nom: "Découpage", nomEn: "Grouping", type: "choix",
        options: ["Tout l'extrait", "Accord par accord"], optionsEn: ["Whole excerpt", "Chord by chord"],
        optionIds: ["tout", "accords"], defaut: "Tout l'extrait", defautEn: "Whole excerpt",
        doc: "« Accord par accord » analyse chaque groupe de notes simultanées séparément, puis relève les formes premières qui revenaient — c'est ce qui permet de dire que deux passages emploient le même matériau.",
        docEn: "« Chord by chord » analyses each group of simultaneous notes separately, then lists the prime forms that recurred — which is what allows saying that two passages use the same material." },
    ],
    async executer(ctx: any) {
      const entree = await notesDuMidi(ctx.entree(0));
      const en = langueCourante() === "en";
      if (!entree || entree.length === 0) {
        const notes = lireSuite(ctx.paramTexte("Notes", "C E G B"));
        if (notes.length === 0) return { valeurs: [null], message: traduire("msg.serie.vide") };
        const a = analyser(notes);
        return {
          valeurs: [rapportAnalyse(a, en ? "Set" : "Ensemble")],
          message: `${enCrochets(a.premiere)}${a.nom ? ` · ${a.nom.forte}` : ""}`,
        };
      }
      if (ctx.paramTexte("Découpage", "tout") === "tout") {
        const a = analyser(entree.map((n) => n.note));
        return {
          valeurs: [rapportAnalyse(a, en ? "Excerpt" : "Extrait")],
          message: `${enCrochets(a.premiere)}${a.nom ? ` · ${a.nom.forte}` : ""}`,
        };
      }
      const groupes = accords(entree);
      const analyses = groupes.map((g) => analyser(g.map((n) => n.note)));
      // Les formes premières qui reviennent : le matériau partagé, qui est ce qu'on cherche.
      const comptes = new Map<string, number>();
      for (const a of analyses) {
        const c = enCrochets(a.premiere);
        comptes.set(c, (comptes.get(c) ?? 0) + 1);
      }
      const recurrentes = [...comptes.entries()]
        .filter(([, n]) => n > 1)
        .sort((x, y) => y[1] - x[1])
        .map(([c, n]) => `${c} ×${n}`);
      const rapport = [
        ...analyses.slice(0, 40).map((a, i) => rapportAnalyse(a, `${en ? "Chord" : "Accord"} ${i + 1}`)),
        analyses.length > 40 ? `… ${analyses.length - 40} ${en ? "more" : "de plus"}` : "",
        "",
        recurrentes.length > 0
          ? `${en ? "Recurring prime forms" : "Formes premières récurrentes"} : ${recurrentes.join(" · ")}`
          : (en ? "No prime form recurs." : "Aucune forme première ne revient."),
      ].filter((l) => l !== "").join("\n\n");
      return {
        valeurs: [rapport],
        message: traduire("msg.ensembles.resultat", groupes.length, comptes.size),
      };
    },
  },
  {
    id: "harmonie-negative", nom: "Harmonie négative", nomEn: "Negative Harmony",
    univers: "Traitement", famille: "Effets",
    resume: "Réfléchit les hauteurs autour de l'axe tonique-dominante : do majeur devient do mineur, sol septième devient fa mineur sixte.",
    resumeEn: "Reflects pitches around the tonic-dominant axis: C major becomes C minor, G7 becomes F minor 6.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "MIDI", type: "midi" },
      { nom: "Table", nomEn: "Table", type: "texte" },
    ],
    parametres: [
      { nom: "Tonique", nomEn: "Tonic", type: "choix", ...TONIQUES,
        defaut: "Do", defautEn: "C",
        doc: "La tonalité dont on prend l'axe. C'est le seul réglage qui compte : l'axe passe à mi-chemin de cette note et de sa quinte, et tout le reste en découle.",
        docEn: "The key whose axis is taken. It is the only setting that matters: the axis lies halfway between this note and its fifth, and everything else follows." },
      { nom: "Réflexion", nomEn: "Reflection", type: "choix",
        options: ["Classes, registre gardé", "Miroir vrai"],
        optionsEn: ["Classes, register kept", "True mirror"],
        optionIds: ["registre", "miroir"], defaut: "Classes, registre gardé", defautEn: "Classes, register kept",
        doc: "« Classes » réfléchit chaque note dans son octave : l'harmonie change, la ligne garde son contour — c'est ce qu'on veut pour substituer un accord. « Miroir vrai » réfléchit tout autour d'un seul axe : les intervalles changent de sens et la mélodie se retourne.",
        docEn: "« Classes » reflects each note within its octave: the harmony changes, the line keeps its contour — this is what one wants to substitute a chord. « True mirror » reflects everything around a single axis: intervals change direction and the melody turns over." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null, null], message: traduire("msg.aucune_note") };
      const tonique = parseInt(ctx.paramTexte("Tonique", "0"), 10) || 0;
      const mode = ctx.paramTexte("Réflexion", "registre") as ModeReflet;
      const reflete = refleterNotes(notes, tonique, mode);
      const en = langueCourante() === "en";
      const table = [
        `${en ? "Axis in" : "Axe en"} ${nomClasse(tonique)} : ${nomClasse(tonique + 3)} / ${nomClasse(tonique + 4)}`,
        tableReflets(tonique),
      ].join("\n");
      const [audio, midi] = await rendreEtEcrire(ctx, reflete);
      return {
        valeurs: [audio, midi, table],
        message: traduire("msg.negative.resultat", nomClasse(tonique), reflete.length),
      };
    },
  },
  {
    id: "voicings-accords", nom: "Renversements et voicings", nomEn: "Inversions and Voicings",
    univers: "Traitement", famille: "Effets",
    resume: "Renverse, écarte et enchaîne les accords d'un MIDI en bougeant le moins de voix possible.",
    resumeEn: "Inverts, spreads and chains a MIDI file's chords while moving as few voices as possible.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Renversement", nomEn: "Inversion", type: "nombre", plage: [0, 5], pas: 1, defaut: 0,
        doc: "Nombre de notes basses qui montent d'une octave. 0 = position fondamentale. Un renversement égal au nombre de notes de l'accord le rend inchangé, plutôt que de le faire monter.",
        docEn: "How many bottom notes move up an octave. 0 = root position. An inversion equal to the chord's note count leaves it unchanged, rather than pushing it upwards." },
      { nom: "Disposition", nomEn: "Voicing", type: "choix",
        options: ["Serré", "Ouvert", "Drop 2", "Drop 3", "Drop 2 et 4"],
        optionsEn: ["Close", "Open", "Drop 2", "Drop 3", "Drop 2 and 4"],
        optionIds: ["serre", "ouvert", "drop2", "drop3", "drop24"],
        defaut: "Serré", defautEn: "Close",
        doc: "La répartition des voix. « Ouvert » monte une note sur deux d'une octave. Les « drop » descendent d'une octave la deuxième ou la troisième voix en partant du haut : c'est l'écriture de la guitare jazz et des quatre cuivres, et elle demande au moins quatre notes.",
        docEn: "How the voices are spread. « Open » raises every other note by an octave. The « drop » voicings lower the second or third voice from the top by an octave: this is the writing of jazz guitar and four-part brass, and it needs at least four notes." },
      { nom: "Conduite des voix", nomEn: "Voice leading", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Cherche pour chaque accord le registre qui bouge le moins de voix depuis le précédent. La disposition choisie plus haut est gardée telle quelle : la conduite ne déplace les accords que par octaves entières.",
        docEn: "Finds, for each chord, the register that moves the fewest voices from the previous one. The voicing chosen above is kept as is: the leading only shifts chords by whole octaves." },
      { nom: "Grave minimum", nomEn: "Lowest note", type: "nombre", plage: [21, 60], pas: 1, defaut: 40,
        doc: "Note la plus basse que la conduite des voix s'autorise.", docEn: "Lowest note the voice leading allows itself." },
      { nom: "Aigu maximum", nomEn: "Highest note", type: "nombre", plage: [60, 108], pas: 1, defaut: 88,
        doc: "Note la plus haute que la conduite des voix s'autorise.", docEn: "Highest note the voice leading allows itself." },
      ...PARAMETRES_RENDU,
    ],
    async executer(ctx: any) {
      const notes = await notesDuMidi(ctx.entree(0));
      if (!notes) return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      if (notes.length === 0) return { valeurs: [null, null], message: traduire("msg.aucune_note") };
      const groupes = accords(notes);
      const renversement = Math.round(ctx.paramNombre("Renversement", 0));
      const type = ctx.paramTexte("Disposition", "serre") as TypeVoicing;
      // Renversement, puis disposition : la forme de chaque accord est fixée ici.
      const formes = groupes.map((g) => voicing(renverser(g.map((n) => n.note), renversement), type));
      // Puis, s'il y a lieu, le registre — par octaves entières, pour ne pas défaire la forme.
      const places = ctx.paramTexte("Conduite des voix", "oui") === "oui"
        ? conduireVoix(formes, ctx.paramNombre("Grave minimum", 40), ctx.paramNombre("Aigu maximum", 88), false)
        : formes;
      const sortie = groupes.flatMap((g, i) => remplacerHauteurs(g, places[i]));
      const accordsMultiples = groupes.filter((g) => g.length > 1).length;
      const [audio, midi] = await rendreEtEcrire(ctx, sortie);
      return {
        valeurs: [audio, midi],
        message: traduire("msg.voicings.resultat", groupes.length, accordsMultiples),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
