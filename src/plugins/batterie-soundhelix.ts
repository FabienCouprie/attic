// plugins/batterie-soundhelix.ts — Les fiches de « Batterie à motifs », « Motif conditionnel » et
// « Groove », les trois nœuds du lot 7 du chantier SoundHelix.
//
// ELLES REPRENNENT `DrumSequenceEngine`, ses `conditionalPattern` et le groove du `MidiPlayer` de
// SoundHelix 0.9. Le calcul est dans `audio/soundhelix-batterie.ts`, comparé note pour note au
// programme sur l'essai de batterie, et la lecture et l'écriture des fichiers dans
// `audio/soundhelix-batterie-midi.ts`. CHOIX PRIS DANS LE LOT, sur la consigne de Fabien d'avancer
// seul : une ligne de batterie s'écrit `hauteur voix motif` ; un motif conditionnel est un nœud,
// enchaîné après la batterie, comme le plan le prévoyait ; le groove est un nœud à part, qui
// s'applique à tout fichier MIDI.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { hasardDuNoeud } from "../core";
import { FauteMotif, lireMotif } from "../audio/soundhelix-motifs";
import { FauteActivite, lireActivite, segmentsDeVoix } from "../audio/soundhelix-activite";
import { VELOCITE_MAX, lireHarmonie } from "../audio/soundhelix-midi";
import { appliquerConditionnel, lireConditions, rendreBatterie, type LigneBatterie } from "../audio/soundhelix-batterie";
import { batterieEnMidi, grooverMidi, lireGroove, notesDuFichierBatterie } from "../audio/soundhelix-batterie-midi";

const TICS_PAR_TEMPS = ["2", "3", "4", "6", "8", "12"];
const ENTREE_HARMONIE = { nom: "Harmonie", nomEn: "Harmony", type: "midi", sousType: "harmonie" } as const;

/** Cinq lignes écrites pour Attic : grosse caisse, caisse claire, deux charlestons, une cymbale muette. */
export const LIGNES_PAR_DEFAUT = [
  "36  v1  0,-,-,-,-,-,0,-,0,-,-,-,-,-,-,-",
  "38  v1  -/4,0/4:900,-/4,0/4:900",
  "42  v1  E(5,8,0:600,-)",
  "46  v1  -/6,0/2:700",
  "49  v1  -",
].join("\n");

const enFaute = (e: unknown, en: boolean) => {
  if (e instanceof FauteMotif || e instanceof FauteActivite) return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
  throw e;
};

const liste = (t: string) => t.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);

const MODELE = "Le modèle est celui du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).";
const MODELE_EN = "The model is that of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).";
const MOTIF = "Une entrée de motif s'écrit décalage, /durée en tics, :vélocité de 1 à 1000 ; - est un silence ; E(), (x)*n et (x)+d s'y emploient.";
const MOTIF_EN = "A pattern entry is written offset, /length in ticks, :velocity from 1 to 1000; - is a rest; E(), (x)*n and (x)+d may be used.";
const MATRICE = "une ligne par voix, son nom, puis un signe par section d'accords, x quand la voix joue, . quand elle se tait";
const MATRICE_EN = "one line per voice, its name, then one sign per chord section, x when the voice plays, . when it is silent";

const NOTICE_BATTERIE = `Pose une ligne de batterie par percussion sur la grille de l'harmonie reçue, chacune gouvernée par sa voix de la matrice d'activité. ${MODELE}\n\n« Lignes » donne une ligne par percussion : sa hauteur MIDI, le nom de sa voix, puis son motif, séparés par des espaces, 36 v1 0,-,-,-,0,-,-,- par exemple. Le motif se pose depuis le début du morceau, en boucle ; un décalage s'ajoute à la hauteur, 0 la joue telle quelle. ${MOTIF} Les entrées « Motif 1 » à « Motif 4 », branchées, remplacent le motif des quatre premières lignes. « Tics par temps » est la résolution dans laquelle les motifs sont écrits, ramenée à la grille de l'harmonie.\n\nL'entrée « Activité » porte une matrice d'activité, ${MATRICE}. Une note ne part qu'à un tic où la voix de sa ligne joue. Sans matrice branchée, chaque ligne joue tout le morceau.\n\n« Vélocité » met à l'échelle la vélocité de chaque note.\n\nLa sortie « MIDI » porte les notes sur le canal 10, à la grille et au tempo de l'harmonie.\n\nLe message donne le nombre de notes et de lignes.`;
const NOTICE_BATTERIE_EN = `Lays one drum line per percussion on the grid of the received harmony, each governed by its voice of the activity matrix. ${MODELE_EN}\n\n« Lines » gives one line per percussion: its MIDI pitch, the name of its voice, then its pattern, separated by spaces, 36 v1 0,-,-,-,0,-,-,- for instance. The pattern is laid from the start of the piece, in a loop; an offset is added to the pitch, 0 plays it as it is. ${MOTIF_EN} The « Pattern 1 » to « Pattern 4 » inputs, when connected, replace the pattern of the first four lines. « Ticks per beat » is the resolution the patterns are written in, brought to the grid of the harmony.\n\nThe « Activity » input carries an activity matrix, ${MATRICE_EN}. A note only starts on a tick where the voice of its line plays. Without a matrix connected, each line plays the whole piece.\n\n« Velocity » scales the velocity of each note.\n\nThe « MIDI » output carries the notes on channel 10, at the grid and tempo of the harmony.\n\nThe message gives the number of notes and lines.`;

const NOTICE_CONDITIONNEL = `Écrit un motif dans une batterie juste avant les frontières de section où la matrice d'activité tient ses conditions : le roulement avant l'entrée de la grosse caisse, la cymbale sur le premier temps. ${MODELE}\n\nLe motif s'écrit dans les tics qui précèdent la frontière, autant que sa longueur. « Avant » se juge sur chaque section que ces tics couvrent, « Après » sur la section qui commence : des voix séparées par des virgules, +voix quand elle doit jouer, -voix quand elle doit se taire ; une condition vide est toujours tenue. L'activité des percussions visées n'est pas consultée. « Probabilité » donne la chance d'écrire le motif à chaque frontière tenue ; « Graine » fixe ce tirage, 0 en tirant une à chaque exécution.\n\n« Motif » donne le motif ; l'entrée « Motif », branchée, le remplace. ${MOTIF} « Percussions visées » donne des hauteurs MIDI séparées par des virgules : les notes du motif se posent sur la première, un décalage s'y ajoutant. Sous « Mode » à « Remplacer », les notes des percussions visées qui partent dans ces tics sont retirées, et celles qui y entrent raccourcies ; à « Ajouter », elles restent. « Tics par temps » est la résolution dans laquelle le motif est écrit.\n\nL'entrée « MIDI » porte la batterie, dont chaque note est lue comme une percussion ; l'entrée « Harmonie » donne les sections et la grille, l'entrée « Activité » la matrice, ${MATRICE}.\n\nLa sortie « MIDI » porte la batterie sur le canal 10, à la grille et au tempo de l'harmonie.\n\nLe message donne le nombre de frontières où le motif s'est écrit, le nombre de notes et la graine.`;
const NOTICE_CONDITIONNEL_EN = `Writes a pattern into a drum part just before the section boundaries where the activity matrix holds its conditions: the roll before the bass drum comes in, the cymbal on the first beat. ${MODELE_EN}\n\nThe pattern is written in the ticks before the boundary, as many as its length. « Before » is judged on each section these ticks cover, « After » on the section that starts: voices separated by commas, +voice when it must play, -voice when it must be silent; an empty condition always holds. The activity of the targeted percussions is not consulted. « Probability » gives the chance of writing the pattern at each boundary that holds; « Seed » fixes this draw, 0 drawing one at every run.\n\n« Pattern » gives the pattern; the « Pattern » input, when connected, replaces it. ${MOTIF_EN} « Targeted percussions » gives MIDI pitches separated by commas: the notes of the pattern are laid on the first one, an offset being added to it. With « Mode » on « Replace », the notes of the targeted percussions that start in these ticks are removed, and those that enter them are shortened; on « Add », they stay. « Ticks per beat » is the resolution the pattern is written in.\n\nThe « MIDI » input carries the drum part, each note of which is read as a percussion; the « Harmony » input gives the sections and the grid, the « Activity » input the matrix, ${MATRICE_EN}.\n\nThe « MIDI » output carries the drum part on channel 10, at the grid and tempo of the harmony.\n\nThe message gives the number of boundaries where the pattern was written, the number of notes and the seed.`;

const NOTICE_GROOVE = `Déplace chaque événement d'un fichier MIDI selon un groove : la durée relative de chaque pas de la grille, en boucle. ${MODELE}\n\n« Groove » donne les durées relatives, séparées par des virgules : à 110,90, un pas sur deux s'allonge d'un dixième et l'autre se raccourcit d'autant, le balancement d'un swing léger. Les durées se ramènent à leur moyenne, si bien qu'un tour du groove garde sa longueur, et la mesure aussi. « Tics par temps » donne la grille des pas, en pas par temps : à 4, chaque double croche est un pas. Un événement entre deux pas prend sa part du pas où il tombe.\n\nLa sortie « MIDI » porte le fichier reçu sur l'entrée « MIDI », ses pistes, ses canaux, ses programmes et ses tempos gardés ; seuls les instants de ses événements changent. Un fichier de moins de 480 tics par noire y passe, ses tics multipliés, pour que le déplacement d'une fraction de pas ne se perde pas à l'arrondi.\n\nLe message donne le nombre de notes déplacées et le groove.`;
const NOTICE_GROOVE_EN = `Moves each event of a MIDI file according to a groove: the relative length of each step of the grid, in a loop. ${MODELE_EN}\n\n« Groove » gives the relative lengths, separated by commas: at 110,90, one step in two is lengthened by a tenth and the other shortened as much, the sway of a light swing. The lengths are brought to their mean, so one turn of the groove keeps its length, and so does the bar. « Ticks per beat » gives the grid of the steps, in steps per beat: at 4, each sixteenth note is a step. An event between two steps takes its share of the step it falls in.\n\nThe « MIDI » output carries the file received on the « MIDI » input, its tracks, channels, programs and tempos kept; only the instants of its events change. A file of fewer than 480 ticks per quarter note is brought to it, its ticks multiplied, so that a shift of a fraction of a step is not lost to rounding.\n\nThe message gives the number of moved notes and the groove.`;

const TPB = (doc: string, docEn: string) => ({ nom: "Tics par temps" as const, nomEn: "Ticks per beat", type: "choix" as const,
  options: TICS_PAR_TEMPS, optionIds: TICS_PAR_TEMPS, optionsEn: TICS_PAR_TEMPS, defaut: "4", doc, docEn });

export const fiches: FicheAudio[] = ([
  fiche({
    id: "batterie-motifs", nom: "Batterie à motifs", nomEn: "Pattern Drums",
    univers: "Entrées", famille: "Génération",
    resume: "Pose une ligne de batterie par percussion, chacune sous sa voix de la matrice d'activité.",
    resumeEn: "Lays one drum line per percussion, each under its voice of the activity matrix.",
    notice: NOTICE_BATTERIE, noticeEn: NOTICE_BATTERIE_EN,
    entrees: [
      ENTREE_HARMONIE,
      { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite", requis: false },
      ...[1, 2, 3, 4].map((k) => ({ nom: `Motif ${k}`, nomEn: `Pattern ${k}`, type: "texte" as const, requis: false })),
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Lignes", nomEn: "Lines", type: "texte", defaut: LIGNES_PAR_DEFAUT, defautEn: LIGNES_PAR_DEFAUT,
        doc: "Une ligne par percussion : sa hauteur MIDI, le nom de sa voix et son motif, séparés par des espaces.",
        docEn: "One line per percussion: its MIDI pitch, the name of its voice and its pattern, separated by spaces." },
      TPB("La résolution dans laquelle les motifs sont écrits, en tics par temps, ramenée à la grille de l'harmonie.",
        "The resolution the patterns are written in, in ticks per beat, brought to the grid of the harmony."),
      { nom: "Vélocité", nomEn: "Velocity", plage: [1, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La vélocité de chaque note, mise à l'échelle.", docEn: "The velocity of each note, scaled." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const brute = ctx.entree(0);
      if (!(brute instanceof File)) return { valeurs: [null], erreur: true, message: en ? "no harmony on the input" : "aucune harmonie en entrée" };
      try {
        const h = lireHarmonie(new Uint8Array(await brute.arrayBuffer()));
        const activite = ctx.entree(1);
        const matrice = typeof activite === "string" ? lireActivite(activite) : null;
        const options = { velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps, ticsParTempsMotif: Number(ctx.paramTexte("Tics par temps", "4")) || 4 };
        const textes = ctx.paramTexte("Lignes", LIGNES_PAR_DEFAUT).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
        const lignes: LigneBatterie[] = textes.map((texte, k) => {
          const m = /^(\d+)\s+(\S+)\s+(\S.*)$/.exec(texte);
          if (!m) throw new FauteMotif(`ligne de batterie illisible : « ${texte} »`, `unreadable drum line: « ${texte} »`);
          const branche = k < 4 ? ctx.entree(2 + k) : null;
          let segments: number[] | null = null;
          if (matrice) {
            const v = matrice.find((x) => x.nom === m[2]);
            if (!v) throw new FauteActivite(`la matrice n'a pas de voix « ${m[2]} »`, `the matrix has no voice « ${m[2]} »`);
            segments = segmentsDeVoix(v, h.sections, h.tics);
          }
          return { hauteur: Number(m[1]), motif: lireMotif(typeof branche === "string" ? branche : m[3], options), segments };
        });
        const echelle = Math.round(ctx.paramNombre("Vélocité", 100) * 10) / VELOCITE_MAX;
        const notes = rendreBatterie(lignes, h.tics).map((n) => ({ ...n, velocite: Math.max(1, Math.floor(n.velocite * echelle)) }));
        const octets = batterieEnMidi(notes, h);
        const message = en ? `${notes.length} notes · ${lignes.length} lines` : `${notes.length} notes · ${lignes.length} lignes`;
        return { valeurs: [new File([octets], "batterie.mid", { type: "audio/midi" })], message };
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
  fiche({
    id: "motif-conditionnel", nom: "Motif conditionnel", nomEn: "Conditional Pattern",
    univers: "Entrées", famille: "Génération",
    resume: "Écrit un motif dans une batterie avant les frontières de section où la matrice tient ses conditions.",
    resumeEn: "Writes a pattern into a drum part before the section boundaries where the matrix holds its conditions.",
    notice: NOTICE_CONDITIONNEL, noticeEn: NOTICE_CONDITIONNEL_EN,
    entrees: [
      { nom: "MIDI", type: "midi" },
      ENTREE_HARMONIE,
      { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite" },
      { nom: "Motif", nomEn: "Pattern", type: "texte", sousType: "motif", requis: false },
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: "(0/1)*16", defautEn: "(0/1)*16",
        doc: "Le motif écrit avant la frontière. Sans effet quand l'entrée « Motif » est branchée.",
        docEn: "The pattern written before the boundary. No effect when the « Pattern » input is connected." },
      { nom: "Percussions visées", nomEn: "Targeted percussions", type: "texte", defaut: "38", defautEn: "38",
        doc: "Des hauteurs MIDI séparées par des virgules : le motif se pose sur la première, et « Remplacer » les vide toutes.",
        docEn: "MIDI pitches separated by commas: the pattern is laid on the first one, and « Replace » empties them all." },
      { nom: "Avant", nomEn: "Before", type: "texte", defaut: "-v1", defautEn: "-v1",
        doc: "Les conditions des sections que le motif couvre, +voix ou -voix séparés par des virgules ; vide, toujours tenue.",
        docEn: "The conditions of the sections the pattern covers, +voice or -voice separated by commas; empty, always held." },
      { nom: "Après", nomEn: "After", type: "texte", defaut: "+v1", defautEn: "+v1",
        doc: "Les conditions de la section qui commence, +voix ou -voix séparés par des virgules ; vide, toujours tenue.",
        docEn: "The conditions of the section that starts, +voice or -voice separated by commas; empty, always held." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Remplacer", "Ajouter"], optionsEn: ["Replace", "Add"],
        optionIds: ["remplacer", "ajouter"], defaut: "Remplacer", defautEn: "Replace",
        doc: "Remplacer : les notes des percussions visées dans ces tics sont retirées. Ajouter : elles restent, et le motif s'y ajoute.",
        docEn: "Replace: the notes of the targeted percussions in these ticks are removed. Add: they stay, and the pattern is added to them." },
      { nom: "Probabilité", nomEn: "Probability", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La chance d'écrire le motif à chaque frontière tenue.", docEn: "The chance of writing the pattern at each boundary that holds." },
      TPB("La résolution dans laquelle le motif est écrit, en tics par temps, ramenée à la grille de l'harmonie.",
        "The resolution the pattern is written in, in ticks per beat, brought to the grid of the harmony."),
      { nom: "Graine", nomEn: "Seed", graine: true, plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du tirage de la probabilité. 0 = tirée à chaque exécution ; sans effet à 100 %.",
        docEn: "Seed for the draw of the probability. 0 = drawn at every run; no effect at 100 %." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const fichier = ctx.entree(0);
      const harmonie = ctx.entree(1);
      const activite = ctx.entree(2);
      if (!(fichier instanceof File) || !(harmonie instanceof File) || typeof activite !== "string") {
        return { valeurs: [null], erreur: true,
          message: en ? "a drum MIDI, a harmony and a matrix are needed" : "il faut une batterie, une harmonie et une matrice" };
      }
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        const h = lireHarmonie(new Uint8Array(await harmonie.arrayBuffer()));
        const matrice = lireActivite(activite);
        for (const v of matrice) segmentsDeVoix(v, h.sections, h.tics);
        const entree = ctx.entree(3);
        const motif = lireMotif(typeof entree === "string" ? entree : ctx.paramTexte("Motif", "(0/1)*16"), {
          velociteMax: VELOCITE_MAX, ticsParTemps: h.ticsParTemps, ticsParTempsMotif: Number(ctx.paramTexte("Tics par temps", "4")) || 4 });
        const cibles = liste(ctx.paramTexte("Percussions visées", "38"));
        if (cibles.length === 0 || cibles.some((c) => !Number.isInteger(c) || c < 0 || c > 127)) {
          return { valeurs: [null], erreur: true, message: en ? "unreadable targeted percussions" : "percussions visées illisibles" };
        }
        const r = appliquerConditionnel({
          notes: notesDuFichierBatterie(new Uint8Array(await fichier.arrayBuffer()), h.ticsParTemps), sections: h.sections, tics: h.tics,
          matrice, motif, cibles, avant: lireConditions(ctx.paramTexte("Avant", "-v1")), apres: lireConditions(ctx.paramTexte("Après", "+v1")),
          remplacer: ctx.paramTexte("Mode", "remplacer") !== "ajouter", probabilite: ctx.paramNombre("Probabilité", 100), aleatoire,
        });
        const message = en
          ? `pattern written at ${r.poses} boundar${r.poses > 1 ? "ies" : "y"} · ${r.notes.length} notes · seed ${graine}`
          : `motif écrit à ${r.poses} frontière${r.poses > 1 ? "s" : ""} · ${r.notes.length} notes · graine ${graine}`;
        return { valeurs: [new File([batterieEnMidi(r.notes, h)], fichier.name, { type: "audio/midi" })], message };
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
  fiche({
    id: "groove-midi", nom: "Groove", nomEn: "Groove",
    univers: "Traitement", famille: "Effets",
    resume: "Déplace chaque événement d'un fichier MIDI selon la durée relative de chaque pas de la grille.",
    resumeEn: "Moves each event of a MIDI file according to the relative length of each step of the grid.",
    notice: NOTICE_GROOVE, noticeEn: NOTICE_GROOVE_EN,
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Groove", nomEn: "Groove", type: "texte", defaut: "110,90", defautEn: "110,90",
        doc: "Les durées relatives des pas, séparées par des virgules, reprises en boucle et ramenées à leur moyenne.",
        docEn: "The relative lengths of the steps, separated by commas, looped and brought to their mean." },
      TPB("La grille des pas, en pas par temps : à 4, chaque double croche est un pas. Un événement qui tombe à la fin d'un tour entier du groove ne bouge pas : sous un groove de deux pas et une grille paire, les notes posées sur les temps restent où elles sont.",
        "The grid of the steps, in steps per beat: at 4, each sixteenth note is a step. An event falling at the end of a whole turn of the groove does not move: under a two-step groove and an even grid, notes laid on the beats stay where they are."),
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], erreur: true, message: en ? "no MIDI on the input" : "aucun MIDI en entrée" };
      const texte = ctx.paramTexte("Groove", "110,90");
      const groove = lireGroove(texte);
      if (!groove) return { valeurs: [null], erreur: true, message: en ? `unreadable groove « ${texte} »` : `groove illisible « ${texte} »` };
      const r = grooverMidi(new Uint8Array(await fichier.arrayBuffer()), groove, Number(ctx.paramTexte("Tics par temps", "4")) || 4);
      // « 110, 90 » et non « 110,90 », qu'une lecture anglaise prend pour un nombre à virgule décimale.
      const message = en ? `${r.deplaces} notes moved · groove ${groove.join(", ")}` : `${r.deplaces} notes déplacées · groove ${groove.join(", ")}`;
      return { valeurs: [new File([r.octets], fichier.name, { type: "audio/midi" })], message };
    },
  }),
] as FicheAudio[]).map(avecDoc);
