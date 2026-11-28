// plugins/motifs-generes.ts — Les fiches des trois générateurs de motifs du chantier SoundHelix :
// « Motif au hasard », « Motif par fragments » et « Motif en crescendo ». Chacun rend un motif en
// texte, contenu `motif`, que « Voix sur l'accord » et « Arpège par durée d'accord » reçoivent.
//
// ILS REPRENNENT `RandomPatternEngine`, `RandomFragmentPatternEngine` et `CrescendoPatternEngine` de
// SoundHelix 0.9. Le calcul est dans `audio/soundhelix-generateurs.ts` ; le crescendo y est comparé au
// programme note pour note, le hasard et les fragments par la loi. Les notices partagent leurs
// paragraphes communs, écrits une fois ici.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { hasardDuNoeud } from "../core";
import { FauteMotif, lireMotif } from "../audio/soundhelix-motifs";
import { lireFragments, motifAuHasard, motifEnCrescendo, motifParFragments } from "../audio/soundhelix-generateurs";

const SORTIE_MOTIF = { nom: "Motif", nomEn: "Pattern", type: "texte", sousType: "motif" } as const;

const liste = (t: string) => t.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);

/** Le nombre de notes d'un motif rendu. */
const nombreDeNotes = (texte: string) => lireMotif(texte, { jokers: "+#*", velociteMax: 1000, ticsParTemps: 4 })
  .filter((e) => e.decalage !== null || (e.joker !== null && !e.silence)).length;

const enFaute = (e: unknown, en: boolean) => {
  if (e instanceof FauteMotif) return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
  throw e;
};

/** Des fragments de batterie écrits pour Attic, deux groupes. */
export const FRAGMENTS_PAR_DEFAUT = "A : 0,-,-,- | 0,-,0,- | 0/2,-/2 | -/2,0/2\nB : 0/3,0/1 | -,0,-,0 | 0/4";

const PLAN = (doc: string, docEn: string) => ({ nom: "Plan", nomEn: "Plan", type: "texte", defaut: "A1,A2,A1,B1", defautEn: "A1,A2,A1,B1", doc, docEn } as const);
const TICS = { nom: "Tics" as const, nomEn: "Ticks", plage: [1, 256] as [number, number], pas: 1, defaut: 16,
  doc: "La longueur de chaque partie, en tics.", docEn: "The length of each part, in ticks." };
const GRAINE = { nom: "Graine" as const, nomEn: "Seed", graine: true as const, plage: [0, 999999] as [number, number], pas: 1, defaut: 0,
  doc: "Graine du tirage. 0 = tirée à chaque exécution, et donnée dans le message pour être recopiée ici.",
  docEn: "Seed for the draw. 0 = drawn at every run, and given in the message so it can be copied back here." };
const DISTINCTES = { nom: "Parties distinctes", nomEn: "Distinct parts", type: "case", defaut: 1,
  doc: "Coché, deux parties nommées différemment ne sont jamais identiques, quand les tirages le permettent.",
  docEn: "Checked, two parts with different names are never identical, when the draws allow it." } as const;

const SORTIE = "La sortie « Motif » porte le motif en texte, une entrée par note ou par silence, séparées par des virgules : décalage, ~ quand la note est liée à la suivante, /durée en tics, :vélocité sur 1000 ; - est un silence.";
const SORTIE_EN = "The « Pattern » output carries the pattern as text, one entry per note or rest, separated by commas: offset, ~ when the note is tied to the next one, /length in ticks, :velocity out of 1000; - is a rest.";
const PLAN_NOTICE = "« Plan » donne les parties du motif, séparées par des virgules, chacune une lettre et un chiffre, A1,A2,A1,B1 par exemple. Une lettre neuve tire une partie neuve ; un chiffre neuf de la même lettre tire une variante ; une partie déjà nommée se répète telle quelle. « Tics » est la longueur de chaque partie. « Parties distinctes » coché, deux parties nommées différemment ne sont jamais identiques, quand les tirages le permettent.";
const PLAN_NOTICE_EN = "« Plan » gives the parts of the pattern, separated by commas, each a letter and a digit, A1,A2,A1,B1 for instance. A new letter draws a new part; a new digit of the same letter draws a variation; a part already named repeats as it is. « Ticks » is the length of each part. « Distinct parts » checked, two parts with different names are never identical, when the draws allow it.";
const GRAINE_NOTICE = "« Graine » fixe le tirage ; 0 tire une graine à chaque exécution, et le message la donne.";
const GRAINE_NOTICE_EN = "« Seed » fixes the draw; 0 draws a seed at every run, and the message gives it.";
const MODELE = (moteur: string) => `Le modèle est celui du ${moteur} du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).`;
const MODELE_EN = (moteur: string) => `The model is that of the ${moteur} of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).`;

const NOTICE_HASARD = `Tire un motif de notes et de silences, partie par partie, avec ses variantes. ${MODELE("générateur de motifs au hasard")}\n\n${PLAN_NOTICE} Une variante est sa partie de base, deux paires de ses événements échangées.\n\nChaque partie se tire pas à pas : une note avec la « Probabilité de note », un silence sinon ; la note dure l'une des « Longueurs de note », le silence l'une des « Longueurs de silence », en tics, séparées par des virgules ; la note prend l'un des « Décalages ». Une partie dont le total des notes ne tombe pas entre « Tics joués min » et « Tics joués max » est tirée à nouveau ; après mille tirages, le composant le dit. Une note suivie d'une note s'y lie avec la « Probabilité de liaison ».\n\nLa vélocité de chaque note tombe entre « Vélocité min » et « Vélocité max », sur 1000. « Corrélation hauteur et vélocité » y mêle la hauteur au hasard : à 100 %, la note la plus haute des « Décalages » joue le plus fort ; à 0 %, la hauteur n'y est pour rien. « Exposant de vélocité » courbe ce mélange : au-dessus de 1, les notes faibles sont plus nombreuses.\n\n${GRAINE_NOTICE}\n\n${SORTIE}\n\nLe message donne le nombre de parties, de tics et de notes, et la graine.`;
const NOTICE_HASARD_EN = `Draws a pattern of notes and rests, part by part, with its variations. ${MODELE_EN("random pattern engine")}\n\n${PLAN_NOTICE_EN} A variation is its base part, two pairs of its events swapped.\n\nEach part is drawn step by step: a note with the « Note probability », a rest otherwise; the note lasts one of the « Note lengths », the rest one of the « Rest lengths », in ticks, separated by commas; the note takes one of the « Offsets ». A part whose total of notes does not fall between « Played ticks min » and « Played ticks max » is drawn again; after a thousand draws, the node says so. A note followed by a note is tied to it with the « Tie probability ».\n\nThe velocity of each note falls between « Velocity min » and « Velocity max », out of 1000. « Pitch and velocity correlation » mixes pitch into chance: at 100 %, the highest note of the « Offsets » plays loudest; at 0 %, pitch has no part in it. « Velocity exponent » bends this mix: above 1, soft notes are more numerous.\n\n${GRAINE_NOTICE_EN}\n\n${SORTIE_EN}\n\nThe message gives the number of parts, ticks and notes, and the seed.`;

const NOTICE_FRAGMENTS = `Assemble un motif de fragments écrits, tirés au hasard jusqu'à la longueur exacte de chaque partie. ${MODELE("générateur de motifs par fragments")}\n\n« Fragments » donne un groupe par ligne : une lettre, deux points, puis des fragments séparés par une barre verticale, chacun un motif court, A : 0,-,-,- | 0,-,0,- par exemple. Une ligne qui commence par # est un commentaire.\n\n${PLAN_NOTICE} La lettre d'une partie désigne son groupe : la partie se fait de fragments de ce groupe, tirés un à un parmi ceux qui tiennent dans la place qui reste, jusqu'à la longueur exacte. Une variante est un tirage neuf dans le même groupe. Quand aucun tirage n'atteint la longueur en mille essais, le composant le dit.\n\n${GRAINE_NOTICE}\n\n${SORTIE}\n\nLe message donne le nombre de parties, de tics et de notes, et la graine.`;
const NOTICE_FRAGMENTS_EN = `Assembles a pattern from written fragments, drawn at random up to the exact length of each part. ${MODELE_EN("fragment pattern engine")}\n\n« Fragments » gives one group per line: a letter, a colon, then fragments separated by a vertical bar, each a short pattern, A : 0,-,-,- | 0,-,0,- for instance. A line starting with # is a comment.\n\n${PLAN_NOTICE_EN} The letter of a part names its group: the part is made of fragments of that group, drawn one by one among those that fit the remaining room, up to the exact length. A variation is a new draw from the same group. When no draw reaches the length in a thousand tries, the node says so.\n\n${GRAINE_NOTICE_EN}\n\n${SORTIE_EN}\n\nThe message gives the number of parts, ticks and notes, and the seed.`;

const NOTICE_CRESCENDO = `Répète un motif entre un préfixe et un suffixe, la vélocité montant d'un bout à l'autre. ${MODELE("générateur de motifs en crescendo")}\n\n« Préfixe », « Motif » et « Suffixe » sont des motifs : le composant pose le préfixe, répète le motif jusqu'à la place du suffixe, le coupe au besoin, puis pose le suffixe ; « Tics » est la longueur totale. Le préfixe et le suffixe peuvent être vides.\n\nChaque note prend la vélocité « Vélocité min » + (« Vélocité max » − « Vélocité min ») × (t / (« Tics » − 1)) à la puissance « Exposant », t étant le tic où elle part, tronquée à l'entier, puis mise à l'échelle de la vélocité que le motif lui écrit, sur 1000. À 1, la vélocité monte en ligne droite ; au-dessus, elle monte d'abord lentement.\n\n${SORTIE}\n\nLe message donne le nombre de tics et de notes.`;
const NOTICE_CRESCENDO_EN = `Repeats a pattern between a prefix and a suffix, the velocity rising from one end to the other. ${MODELE_EN("crescendo pattern engine")}\n\n« Prefix », « Pattern » and « Suffix » are patterns: the node lays the prefix, repeats the pattern up to the room of the suffix, cuts it when needed, then lays the suffix; « Ticks » is the total length. The prefix and the suffix may be empty.\n\nEach note takes the velocity « Velocity min » + (« Velocity max » − « Velocity min ») × (t / (« Ticks » − 1)) to the power « Exponent », t being the tick where it starts, truncated to an integer, then scaled by the velocity the pattern writes for it, out of 1000. At 1, the velocity rises in a straight line; above, it first rises slowly.\n\n${SORTIE_EN}\n\nThe message gives the number of ticks and notes.`;

export const fiches: FicheAudio[] = ([
  fiche({
    id: "motif-au-hasard", nom: "Motif au hasard", nomEn: "Random Pattern",
    univers: "Entrées", famille: "Génération",
    resume: "Tire un motif de notes et de silences, partie par partie, avec ses variantes.",
    resumeEn: "Draws a pattern of notes and rests, part by part, with its variations.",
    notice: NOTICE_HASARD, noticeEn: NOTICE_HASARD_EN,
    entrees: [],
    sorties: [SORTIE_MOTIF],
    parametres: [
      PLAN("Les parties du motif, séparées par des virgules, chacune une lettre et un chiffre : une lettre neuve tire une partie, un chiffre neuf de la même lettre une variante, une partie déjà nommée se répète.",
        "The parts of the pattern, separated by commas, each a letter and a digit: a new letter draws a part, a new digit of the same letter a variation, a part already named repeats."),
      TICS,
      { nom: "Probabilité de note", nomEn: "Note probability", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "La chance qu'un pas de la partie soit une note plutôt qu'un silence.", docEn: "The chance that a step of the part is a note rather than a rest." },
      { nom: "Probabilité de liaison", nomEn: "Tie probability", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "La chance qu'une note suivie d'une note s'y lie.", docEn: "The chance that a note followed by a note is tied to it." },
      { nom: "Vélocité min", nomEn: "Velocity min", plage: [1, 1000], pas: 1, defaut: 500,
        doc: "La vélocité la plus faible d'une note, sur 1000.", docEn: "The softest velocity of a note, out of 1000." },
      { nom: "Vélocité max", nomEn: "Velocity max", plage: [1, 1000], pas: 1, defaut: 1000,
        doc: "La vélocité la plus forte d'une note, sur 1000.", docEn: "The loudest velocity of a note, out of 1000." },
      { nom: "Tics joués min", nomEn: "Played ticks min", plage: [0, 256], pas: 1, defaut: 6,
        doc: "Le total le plus court des notes d'une partie, en tics ; une partie plus creuse est tirée à nouveau.",
        docEn: "The shortest total of the notes of a part, in ticks; a sparser part is drawn again." },
      { nom: "Tics joués max", nomEn: "Played ticks max", plage: [0, 256], pas: 1, defaut: 12,
        doc: "Le total le plus long des notes d'une partie, en tics ; une partie plus pleine est tirée à nouveau.",
        docEn: "The longest total of the notes of a part, in ticks; a fuller part is drawn again." },
      { nom: "Décalages", nomEn: "Offsets", type: "texte", defaut: "0,1,2,3,4", defautEn: "0,1,2,3,4",
        doc: "Les décalages qu'une note peut prendre, séparés par des virgules ; sur l'accord, 0 est la basse.",
        docEn: "The offsets a note may take, separated by commas; on the chord, 0 is the bass." },
      { nom: "Longueurs de note", nomEn: "Note lengths", type: "texte", defaut: "1,2", defautEn: "1,2",
        doc: "Les durées qu'une note peut prendre, en tics, séparées par des virgules.", docEn: "The lengths a note may take, in ticks, separated by commas." },
      { nom: "Longueurs de silence", nomEn: "Rest lengths", type: "texte", defaut: "1,2", defautEn: "1,2",
        doc: "Les durées qu'un silence peut prendre, en tics, séparées par des virgules.", docEn: "The lengths a rest may take, in ticks, separated by commas." },
      { nom: "Corrélation hauteur et vélocité", nomEn: "Pitch and velocity correlation", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La part de la hauteur dans la vélocité : à 100 %, la note la plus haute joue le plus fort ; à 0 %, la vélocité est tirée au hasard.",
        docEn: "The share of pitch in velocity: at 100 %, the highest note plays loudest; at 0 %, the velocity is drawn at random." },
      { nom: "Exposant de vélocité", nomEn: "Velocity exponent", plage: [0.1, 5], pas: 0.1, defaut: 1,
        doc: "La courbe de la vélocité entre ses bornes : à 1, droite ; au-dessus, les notes faibles sont plus nombreuses.",
        docEn: "The curve of the velocity between its bounds: at 1, straight; above, soft notes are more numerous." },
      DISTINCTES,
      GRAINE,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        const plan = ctx.paramTexte("Plan", "A1,A2,A1,B1");
        const tics = Math.round(ctx.paramNombre("Tics", 16));
        const texte = motifAuHasard({
          plan, tics, probabiliteNote: ctx.paramNombre("Probabilité de note", 60), probabiliteLiaison: ctx.paramNombre("Probabilité de liaison", 0),
          velocite: { min: Math.round(ctx.paramNombre("Vélocité min", 500)), max: Math.round(ctx.paramNombre("Vélocité max", 1000)) },
          ticsJoues: { min: Math.round(ctx.paramNombre("Tics joués min", 6)), max: Math.round(ctx.paramNombre("Tics joués max", 12)) },
          decalages: liste(ctx.paramTexte("Décalages", "0,1,2,3,4")), longueursNote: liste(ctx.paramTexte("Longueurs de note", "1,2")),
          longueursSilence: liste(ctx.paramTexte("Longueurs de silence", "1,2")),
          correlation: ctx.paramNombre("Corrélation hauteur et vélocité", 50) / 100, exposant: ctx.paramNombre("Exposant de vélocité", 1),
          partiesDistinctes: ctx.paramNombre("Parties distinctes", 1) >= 0.5, aleatoire,
        });
        const parts = plan.split(",").filter((p) => p.trim() !== "").length;
        const message = en
          ? `${parts} parts · ${parts * tics} ticks · ${nombreDeNotes(texte)} notes · seed ${graine}`
          : `${parts} parties · ${parts * tics} tics · ${nombreDeNotes(texte)} notes · graine ${graine}`;
        return { valeurs: [texte], message };
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
  fiche({
    id: "motif-par-fragments", nom: "Motif par fragments", nomEn: "Pattern from Fragments",
    univers: "Entrées", famille: "Génération",
    resume: "Assemble un motif de fragments écrits, tirés au hasard jusqu'à la longueur de chaque partie.",
    resumeEn: "Assembles a pattern from written fragments, drawn at random up to the length of each part.",
    notice: NOTICE_FRAGMENTS, noticeEn: NOTICE_FRAGMENTS_EN,
    entrees: [],
    sorties: [SORTIE_MOTIF],
    parametres: [
      PLAN("Les parties du motif, chacune une lettre et un chiffre : la lettre désigne le groupe de fragments, un chiffre neuf tire une partie neuve dans le même groupe, une partie déjà nommée se répète.",
        "The parts of the pattern, each a letter and a digit: the letter names the group of fragments, a new digit draws a new part from the same group, a part already named repeats."),
      TICS,
      { nom: "Fragments", nomEn: "Fragments", type: "texte", defaut: FRAGMENTS_PAR_DEFAUT, defautEn: FRAGMENTS_PAR_DEFAUT,
        doc: "Un groupe par ligne : une lettre, deux points, puis des motifs courts séparés par une barre verticale.",
        docEn: "One group per line: a letter, a colon, then short patterns separated by a vertical bar." },
      DISTINCTES,
      GRAINE,
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        const plan = ctx.paramTexte("Plan", "A1,A2,A1,B1");
        const tics = Math.round(ctx.paramNombre("Tics", 16));
        const texte = motifParFragments({ plan, tics, fragments: lireFragments(ctx.paramTexte("Fragments", FRAGMENTS_PAR_DEFAUT)),
          partiesDistinctes: ctx.paramNombre("Parties distinctes", 1) >= 0.5, aleatoire });
        const parts = plan.split(",").filter((p) => p.trim() !== "").length;
        const message = en
          ? `${parts} parts · ${parts * tics} ticks · ${nombreDeNotes(texte)} notes · seed ${graine}`
          : `${parts} parties · ${parts * tics} tics · ${nombreDeNotes(texte)} notes · graine ${graine}`;
        return { valeurs: [texte], message };
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
  fiche({
    id: "motif-crescendo", nom: "Motif en crescendo", nomEn: "Crescendo Pattern",
    univers: "Entrées", famille: "Génération",
    resume: "Répète un motif entre un préfixe et un suffixe, la vélocité montant d'un bout à l'autre.",
    resumeEn: "Repeats a pattern between a prefix and a suffix, the velocity rising from one end to the other.",
    notice: NOTICE_CRESCENDO, noticeEn: NOTICE_CRESCENDO_EN,
    entrees: [],
    sorties: [SORTIE_MOTIF],
    parametres: [
      { ...TICS, doc: "La longueur totale du motif, en tics, préfixe et suffixe compris.", docEn: "The total length of the pattern, in ticks, prefix and suffix included." },
      { nom: "Vélocité min", nomEn: "Velocity min", plage: [1, 1000], pas: 1, defaut: 100,
        doc: "La vélocité au premier tic, sur 1000.", docEn: "The velocity at the first tick, out of 1000." },
      { nom: "Vélocité max", nomEn: "Velocity max", plage: [1, 1000], pas: 1, defaut: 1000,
        doc: "La vélocité au dernier tic, sur 1000.", docEn: "The velocity at the last tick, out of 1000." },
      { nom: "Exposant", nomEn: "Exponent", plage: [0.1, 5], pas: 0.1, defaut: 2,
        doc: "La courbe de la montée : à 1, droite ; au-dessus, lente d'abord.", docEn: "The curve of the rise: at 1, straight; above, slow at first." },
      { nom: "Préfixe", nomEn: "Prefix", type: "texte", defaut: "", defautEn: "",
        doc: "Le motif posé au début, une fois ; vide, rien.", docEn: "The pattern laid at the start, once; empty, nothing." },
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: "0/1", defautEn: "0/1",
        doc: "Le motif répété entre le préfixe et le suffixe, coupé au besoin.", docEn: "The pattern repeated between the prefix and the suffix, cut when needed." },
      { nom: "Suffixe", nomEn: "Suffix", type: "texte", defaut: "", defautEn: "",
        doc: "Le motif posé à la fin, une fois ; vide, rien.", docEn: "The pattern laid at the end, once; empty, nothing." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      try {
        const tics = Math.round(ctx.paramNombre("Tics", 16));
        const texte = motifEnCrescendo({ tics,
          velocite: { min: Math.round(ctx.paramNombre("Vélocité min", 100)), max: Math.round(ctx.paramNombre("Vélocité max", 1000)) },
          exposant: ctx.paramNombre("Exposant", 2), prefixe: ctx.paramTexte("Préfixe", ""), motif: ctx.paramTexte("Motif", "0/1"),
          suffixe: ctx.paramTexte("Suffixe", "") });
        const message = en ? `${tics} ticks · ${nombreDeNotes(texte)} notes` : `${tics} tics · ${nombreDeNotes(texte)} notes`;
        return { valeurs: [texte], message };
      } catch (e) {
        return enFaute(e, en);
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
