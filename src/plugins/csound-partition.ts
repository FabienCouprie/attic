// plugins/csound-partition.ts — Tout ce qu'Attic sait noter devient une partition Csound.
//
// UN SEUL NŒUD POUR SIX NOTATIONS. ABC, tablature, séquenceur de batterie, de mélodie, d'accords,
// texte vers MIDI : toutes convergent déjà sur le MIDI. Ce nœud traduit le MIDI en partition, donc
// toutes à la fois — et il rend du TEXTE, qui se branche sur l'entrée Partition du nœud Csound.
//
// La logique est dans `audio/csound-partition.ts`, testée : les quatre conventions de hauteur y sont
// éprouvées contre les valeurs de Csound lui-même (`cpspch(8.00)` = 261,63 Hz, `cpsoct(8.75)` = 440).

import { parseMidi } from "midi-file";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { analyserMidi } from "../audio/midi";
import { estCourbe, type Courbe } from "../audio/courbe";
import {
  construirePartition, rapportLisible, type ChampP, type Convention, type NoteAvecCanal,
} from "../audio/csound-partition";

/** Les champs proposés pour chaque p-field, dans l'ordre de la liste déroulante. */
const CHAMPS: { id: ChampP; fr: string; en: string }[] = [
  { id: "hauteur", fr: "Hauteur", en: "Pitch" },
  { id: "amplitude", fr: "Amplitude (vélocité ÷ 127)", en: "Amplitude (velocity ÷ 127)" },
  { id: "velocite", fr: "Vélocité MIDI (0–127)", en: "MIDI velocity (0–127)" },
  { id: "note", fr: "Numéro de note MIDI", en: "MIDI note number" },
  { id: "duree", fr: "Durée", en: "Duration" },
  { id: "canal", fr: "Canal MIDI", en: "MIDI channel" },
  { id: "constante", fr: "Constante", en: "Constant" },
  { id: "courbe", fr: "Courbe", en: "Curve" },
  { id: "rien", fr: "Rien", en: "Nothing" },
];

const champ = (nom: string, nomEn: string, defaut: ChampP, doc: string, docEn: string) => ({
  nom, nomEn, type: "choix" as const,
  options: CHAMPS.map((c) => c.fr), optionsEn: CHAMPS.map((c) => c.en),
  optionIds: CHAMPS.map((c) => c.id),
  defaut: CHAMPS.find((c) => c.id === defaut)!.fr,
  defautEn: CHAMPS.find((c) => c.id === defaut)!.en,
  doc, docEn,
});

export const fiches: FicheAudio[] = ([
  {
    id: "partition-csound", nom: "Partition Csound", nomEn: "Csound Score",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Traduit un MIDI en partition Csound : une note par ligne, avec le choix de la convention de hauteur et des p-fields.",
    resumeEn: "Translates MIDI into a Csound score: one note per line, with a choice of pitch convention and p-fields.",
    entrees: [
      { nom: "MIDI", type: "midi" },
      { nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false },
    ],
    sorties: [
      { nom: "Partition", nomEn: "Score", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Hauteur", nomEn: "Pitch as", type: "choix",
        options: ["cps (hertz)", "pch (8.09)", "oct (8.75)", "midi (69)"],
        optionsEn: ["cps (hertz)", "pch (8.09)", "oct (8.75)", "midi (69)"],
        optionIds: ["cps", "pch", "oct", "midi"], defaut: "cps (hertz)", defautEn: "cps (hertz)",
        doc: "La convention dans laquelle la hauteur est écrite, et c'est le réglage qui décide qu'on entend quelque chose. Csound en a quatre, et un orchestre écrit pour l'une ne fonctionne pas avec une autre. CPS : la fréquence en hertz, 440 pour le la3, ce qu'attendent `oscili` et les modèles physiques de Perry Cook. PCH : octave point classe de hauteur, 8.00 pour le do central et 8.09 pour le la, la notation de music V, que `cpspch()` convertit ; ses centièmes ne vont que jusqu'à 11, 8.11 étant suivi de 9.00. OCT : octave en décimal, 8.0 pour le do central et 8.75 pour le la, que `cpsoct()` convertit, commode pour transposer par simple addition. MIDI : le numéro de note, que `cpsmidinn()` convertit. Nourrir en hertz un orchestre qui attend du pch ne produit ni son ni erreur : c'est le défaut le plus difficile à voir de tout Csound.",
        docEn: "The convention the pitch is written in, and this is the setting that decides whether anything is heard. Csound has four, and an orchestra written for one does not work with another. CPS: frequency in hertz, 440 for A4, what `oscili` and Perry Cook's physical models expect. PCH: octave point pitch-class, 8.00 for middle C and 8.09 for the A above, Music V's notation, converted by `cpspch()`; its hundredths only run to 11, 8.11 being followed by 9.00. OCT: octave in decimal, 8.0 for middle C and 8.75 for the A, converted by `cpsoct()`, handy for transposing by simple addition. MIDI: the note number, converted by `cpsmidinn()`. Feeding hertz to an orchestra that expects pch produces neither sound nor error: it is the hardest fault to spot in all of Csound." },
      { nom: "Instrument", nomEn: "Instrument", type: "nombre", plage: [1, 99], pas: 1, defaut: 1,
        doc: "Numéro du premier instrument, le `1` de `i1`. C'est celui que l'orchestre doit définir par `instr 1`.",
        docEn: "Number of the first instrument, the `1` in `i1`. It is the one the orchestra must define with `instr 1`." },
      { nom: "Un instrument par canal", nomEn: "One instrument per channel", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Oui : chaque canal MIDI présent reçoit son propre numéro d'instrument, à la suite du précédent. Un fichier sur les canaux 1, 2 et 10 donne les instruments 1, 2 et 3, et non 1, 2 et 10, parce qu'un orchestre numérote ses instruments à la suite. C'est ce qui permet de jouer un arrangement complet avec plusieurs instruments Csound, et la sortie Rapport dit la correspondance. Non : tout part sur le même numéro.",
        docEn: "Yes: each MIDI channel present gets its own instrument number, following the previous one. A file on channels 1, 2 and 10 yields instruments 1, 2 and 3, not 1, 2 and 10, because an orchestra numbers its instruments consecutively. This is what lets a whole arrangement be played by several Csound instruments, and the Report output states the mapping. NO: everything goes to the same number." },
      champ("p4", "p4", "hauteur",
        "Ce que porte le quatrième champ de chaque note. La hauteur y est l'usage, et la plupart des orchestres la lisent là.",
        "What the fourth field of each note carries. Pitch is the custom, and most orchestras read it there."),
      champ("p5", "p5", "amplitude",
        "Ce que porte le cinquième champ. L'amplitude, c'est-à-dire la vélocité ramenée entre 0 et 1, y est l'usage, `0dbfs` valant 1 ici.",
        "What the fifth field carries. Amplitude, that is velocity brought to the range 0 to 1, is the custom, `0dbfs` being 1 here."),
      champ("p6", "p6", "note",
        "Ce que porte le sixième champ. Le numéro DE note y est commode même quand p4 porte déjà la hauteur : un orchestre s'en sert pour choisir une table ou un registre.",
        "What the sixth field carries. The note number is handy there even when p4 already carries the pitch: an orchestra uses it to pick a table or a register."),
      champ("p7", "p7", "rien",
        "Ce que porte le septième champ. Rien l'omet, ainsi que tous ceux qui suivraient.",
        "What the seventh field carries. Nothing omits it, and any that would follow."),
      { nom: "Constante", nomEn: "Constant", type: "nombre", plage: [-1000, 1000], pas: 0.01, defaut: 0,
        doc: "Valeur du champ « Constante ». Sert à passer un réglage fixe à l'orchestre, un indice de table, un facteur, une position stéréo.",
        docEn: "Value of the « Constant » field. Used to pass a fixed setting to the orchestra, a table index, a factor, a stereo position." },
      { nom: "Marge finale", nomEn: "Final margin", type: "nombre", plage: [0, 30], pas: 0.1, defaut: 0.5, unite: "s",
        doc: "Secondes ajoutées après la dernière note, écrites en `f0`. Sans elles, Csound s'arrête à la dernière note et coupe les queues de réverbération ou de résonance, ce qui s'entend comme un clic.",
        docEn: "Seconds added after the last note, written as `f0`. Without them, Csound stops at the last note and cuts reverb or resonance tails, which is heard as a click." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null, null], message: traduire("msg.branchez_un_source_midi") };
      }
      const bytes = new Uint8Array(await fichier.arrayBuffer());
      const { notes } = analyserMidi(parseMidi(bytes));
      if (notes.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.aucune_note_dans_le_midi") };
      }
      // `analyserMidi` nomme la vélocité `velocite` — la faute de frappe est ancienne et le champ
      // circule tel quel dans le reste d'Attic. On la traduit ici plutôt que de la propager.
      const avecCanal: NoteAvecCanal[] = notes.map((n: any) => ({
        note: n.note, debut: n.debut, fin: n.fin,
        velocite: n.velocite ?? n.velocite ?? 90,
        canal: n.canal ?? 0,
      }));
      const courbeEntrante = ctx.entree(1);
      const courbe: Courbe | null = estCourbe(courbeEntrante) ? courbeEntrante : null;

      const { texte, rapport } = construirePartition(avecCanal, {
        convention: ctx.paramTexte("Hauteur", "cps") as Convention,
        instrument: Math.round(ctx.paramNombre("Instrument", 1)),
        parCanal: ctx.paramTexte("Un instrument par canal", "non") === "oui",
        // Le repli de chaque champ est CELUI DE LA FICHE, et non « rien » : le moteur retombe bien
        // sur le défaut déclaré, mais un plugin ne doit pas dépendre de cette politesse — sa valeur
        // de repli est ce qu'il obtient quand rien n'est réglé, et elle doit donc dire la même chose.
        champs: (["hauteur", "amplitude", "note", "rien"] as ChampP[])
          .map((defaut, i) => ctx.paramTexte(`p${i + 4}`, defaut) as ChampP),
        constante: ctx.paramNombre("Constante", 0),
        courbe,
        margeFinale: ctx.paramNombre("Marge finale", 0.5),
      });

      // Un champ « Courbe » demandé sans courbe branchée vaudrait zéro partout, en silence : c'est
      // le genre d'oubli qui fait chercher longtemps du côté de l'orchestre.
      const alertes: string[] = [];
      if (!courbe && ["hauteur", "amplitude", "note", "rien"]
        .some((defaut, i) => ctx.paramTexte(`p${i + 4}`, defaut) === "courbe")) {
        alertes.push(traduire("msg.csound.courbeAbsente"));
      }
      return {
        valeurs: [texte, rapportLisible(rapport, langueCourante() === "en")],
        message: traduire("msg.csound.partitionEcrite",
          String(rapport.evenements), String(rapport.instruments.length),
          rapport.convention, rapport.duree.toFixed(2))
          + (alertes.length ? ` · ${alertes.join(" · ")}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
