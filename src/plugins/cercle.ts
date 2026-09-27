// plugins/cercle.ts — Poser un rythme ou une mélodie sur un cercle, et l'entendre.
//
// Le calcul vit dans `audio/cercle.ts` et `audio/cercle-rendu.ts`, éprouvés ; la géométrie du
// dessin dans `ui/cercle-disposition.ts`, éprouvée aussi. Ce fichier n'est que la prise.
//
// POURQUOI DEUX ÉDITEURS ET NON UN SEUL À DEUX MODES. L'étiquette ne vit pas au même étage. Une
// percussion en porte une pour tout le cercle : tous ses sommets sonnent le même tambour, et
// permuter leurs sons ne changerait rien. Une mélodie en porte une par sommet. Un seul composant à
// bascule offrirait donc, dans un de ses deux états, des réglages sans effet.

import type { FicheAudio } from "../audio/types-domaine";
import { PERCUSSIONS_CHOIX } from "../audio/batterie-midi";
import {
  FONDAMENTALES, POSITIONS_MAX, enSuite, hauteursDuCercle, type Cercle, type Repartition,
} from "../audio/cercle";
import { rendreCercles, type BaseDeTemps } from "../audio/cercle-rendu";
import { lireMotif, nettoyerMotif } from "../ui/cercle-disposition";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/**
 * La citation que les auteurs du cercle rythmique en ligne demandent eux-mêmes, dans leur forme.
 *
 * ELLE EST PORTÉE PAR CE QUI VIENT D'EUX, et non par tout le chantier : la représentation
 * circulaire à plusieurs anneaux, la percussion par anneau, et la liste des rythmes traditionnels
 * que ce fichier reprend. Les mesures, le complémentaire et les transformations viennent d'ailleurs
 * et portent leurs propres sources.
 */
const REFERENCE = "Paul Lascabettes, Corentin Guichaoua & Moreno Andreatta (2025). The Rhythm Circle: An Interactive Open-Source Web Environment Based on the Circular Representation, International Computer Music Conference, Boston (MA), United States.";
const CITATION = `D'après : ${REFERENCE}`;
/** La même, dans la forme qu'ont les autres notices anglaises du dépôt : « After ». */
const CITATION_EN = `After: ${REFERENCE}`;

const MOTIF_DEFAUT = "1001001000101000";

/**
 * Combien de cercles le rendu peut faire tourner ensemble.
 *
 * HUIT, ET NON TROIS : c'est le nombre de pistes que les autres composants à entrées extensibles du
 * dépôt offrent déjà, et il laisse la place à une suite de variations posées à la main.
 */
const ANNEAUX = 8;

/** Les fondamentales telles qu'un réglage à choix les offre : « C4 · 261,63 Hz ». */
const libelleFondamentale = (f: typeof FONDAMENTALES[number], virgule: boolean) =>
  `${f.nom} · ${f.hertz.toFixed(2).replace(".", virgule ? "," : ".")} Hz`;

/** Le cercle de percussion que décrivent les réglages d'un nœud : un seul son pour tous ses sommets. */
function cercleRythmique(motifBrut: string, son: number): Cercle {
  const motif = nettoyerMotif(motifBrut) || MOTIF_DEFAUT;
  return {
    positions: motif.length,
    sorte: "percussion",
    sommets: lireMotif(motif).map((position) => ({ position, valeur: son })),
  };
}

/** Le cercle mélodique : les hauteurs se déduisent de la fondamentale et de la place. */
function cercleMelodique(motifBrut: string, fondamentale: number, repartition: Repartition): Cercle {
  const motif = nettoyerMotif(motifBrut) || MOTIF_DEFAUT;
  const places = lireMotif(motif);
  const hauteurs = hauteursDuCercle(motif.length, places, fondamentale, repartition);
  return {
    positions: motif.length,
    sorte: "hauteur",
    sommets: places.map((position, i) => ({ position, valeur: hauteurs[i] })),
  };
}

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-rythmique",
    nom: "Cercle rythmique", nomEn: "Rhythm Circle",
    univers: "Autres", famille: "Circle",
    resume: "Pose un rythme sur un cercle de places égales, et en trace le polygone inscrit.",
    resumeEn: "Places a rhythm on a circle of equal positions, and draws its inscribed polygon.",
    notice: `Pose les attaques d'un rythme sur un cercle dont les places sont également réparties, et relie celles qui sonnent par un polygone inscrit. La place zéro est en haut, et le tour se fait dans le sens des aiguilles.\n\nLe polygone n'est pas un ornement : son aire est maximale quand les attaques se répartissent également, et c'est sur ses cordes que la régularité du rythme se calcule.\n\nUn clic sur une place l'allume ou l'éteint. Les boutons « plus » et « moins » changent le nombre de places, jusqu'à ${POSITIONS_MAX} ; le motif déjà posé est gardé, complété de silences ou coupé à la fin.\n\n« Motif » porte le rythme sous la forme d'une suite de zéros et de uns, un par place, et le nombre de places est sa longueur. Il se recopie d'un composant à l'autre, et se colle tel quel depuis l'adresse d'un cercle rythmique en ligne.\n\n« Percussion » choisit le son, le même pour toutes les attaques du cercle.\n\nLa sortie « Cercle » porte les places et leur son, sans aucune durée : le temps est fourni par le composant qui le rend.\n\n${CITATION}`,
    noticeEn: `Places the onsets of a rhythm on a circle whose positions are evenly spread, and joins those that sound with an inscribed polygon. Position zero is at the top, and the turn goes clockwise.\n\nThe polygon is not an ornament: its area is greatest when the onsets are evenly spread, and it is on its chords that the evenness of the rhythm is computed.\n\nA click on a position turns it on or off. The « plus » and « minus » buttons change the number of positions, up to ${POSITIONS_MAX}; the pattern already laid is kept, padded with rests or cut at the end.\n\n« Pattern » carries the rhythm as a string of zeros and ones, one per position, and the number of positions is its length. It copies from one node to another, and pastes as it stands from the address of an online rhythm circle.\n\n« Drum » selects the sound, the same for every onset of the circle.\n\nThe « Circle » output carries the positions and their sound, with no duration at all: time is supplied by the node that renders it.\n\n${CITATION_EN}`,
    entrees: [],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: MOTIF_DEFAUT, defautEn: MOTIF_DEFAUT,
        doc: "Une suite de zéros et de uns, un par place du cercle. Sa longueur donne le nombre de places. Le dessin l'écrit à chaque clic, et il se saisit aussi à la main.",
        docEn: "A string of zeros and ones, one per position of the circle. Its length gives the number of positions. The drawing writes it at every click, and it can also be typed." },
      { nom: "Percussion", nomEn: "Drum", type: "choix",
        options: PERCUSSIONS_CHOIX.map((p) => p.fr), optionsEn: PERCUSSIONS_CHOIX.map((p) => p.en),
        optionIds: PERCUSSIONS_CHOIX.map((p) => String(p.note)),
        defaut: "Grosse caisse", defautEn: "Kick",
        doc: "Le son de toutes les attaques du cercle. Un cercle rythmique n'en porte qu'un ; pour en mêler plusieurs, poser plusieurs cercles.",
        docEn: "The sound of every onset of the circle. A rhythm circle carries only one; to mix several, place several circles." },
    ],
    async executer(ctx: any) {
      const motif = nettoyerMotif(ctx.paramTexte("Motif", MOTIF_DEFAUT)) || MOTIF_DEFAUT;
      const son = parseInt(ctx.paramTexte("Percussion", "36"), 10) || 36;
      const cercle = cercleRythmique(motif, son);
      return {
        valeurs: [cercle],
        message: `${cercle.sommets.length} ${en() ? "onsets" : "attaques"} · ${cercle.positions} ${en() ? "positions" : "places"}`,
      };
    },
  },
  {
    id: "cercle-melodique",
    nom: "Cercle mélodique", nomEn: "Melodic Circle",
    univers: "Autres", famille: "Circle",
    resume: "Pose une mélodie sur un cercle de places égales, une note par sommet du polygone.",
    resumeEn: "Places a melody on a circle of equal positions, one note per vertex of the polygon.",
    notice: `Pose les notes d'une mélodie sur un cercle dont les places sont également réparties, et relie celles qui sonnent par un polygone inscrit. La place zéro est en haut, et le tour se fait dans le sens des aiguilles.\n\nChaque sommet porte sa propre note, à la différence d'un cercle rythmique où un seul son vaut pour tout le cercle. C'est ce qui permet d'en permuter les notes ou d'en inverser l'ordre sans toucher au rythme.\n\nLes notes ne se saisissent pas une à une : elles se déduisent de la fondamentale et de la place. Allumer une place donne donc la note de cette place, et il n'y a rien à tenir à jour à côté du dessin.\n\nUn clic sur une place l'allume ou l'éteint. Les boutons « plus » et « moins » changent le nombre de places, jusqu'à ${POSITIONS_MAX}.\n\n« Motif » porte le rythme sous la forme d'une suite de zéros et de uns, un par place, et le nombre de places est sa longueur.\n\n« Fondamentale » est la note de la place zéro, donnée avec sa fréquence, de do 1 à do 6.\n\n« Répartition » décide de ce que valent les autres places, et les trois façons ne font pas la même musique.\n• « Le cercle est l'octave » fait valoir une octave au tour entier, quel que soit le nombre de places : douze places rendent la gamme chromatique, seize en rendent seize divisions égales. L'angle est alors la hauteur, et tourner le motif le transpose.\n• « Douze demi-tons » donne un demi-ton tempéré par place : le tour couvre plus ou moins d'une octave selon le nombre de places, et rien ne tombe entre deux touches. Sur un grand cercle parti d'une fondamentale aiguë, le haut du tour bute contre la note la plus haute et plusieurs places s'y rejoignent.\n• « Chaîne de quintes » fait décider le rang de l'attaque et non sa place : le premier sommet qui sonne prend la fondamentale, le deuxième la quinte juste repliée dans son octave, et ainsi de suite. Deux motifs de même nombre d'attaques donnent les mêmes notes.\n\nLe nom d'une note s'écrit dans sa pastille tant qu'il y tient. Au-delà, et dès qu'un écart en cents allonge les noms, il se lit en survolant le sommet. Le nom paraît sur tous les sommets ou sur aucun : à moitié, l'œil prendrait les sommets sans nom pour des sommets d'une autre sorte.\n\nLa sortie « Cercle » porte les places et leurs notes, sans aucune durée : le temps est fourni par le composant qui le rend.\n\n${CITATION}`,
    noticeEn: `Places the notes of a melody on a circle whose positions are evenly spread, and joins those that sound with an inscribed polygon. Position zero is at the top, and the turn goes clockwise.\n\nEach vertex carries its own note, unlike a rhythm circle where a single sound stands for the whole circle. That is what allows its notes to be permuted or their order reversed without touching the rhythm.\n\nThe notes are not typed one by one: they follow from the fundamental and the position. Turning a position on therefore gives the note of that position, and there is nothing to keep up to date beside the drawing.\n\nA click on a position turns it on or off. The « plus » and « minus » buttons change the number of positions, up to ${POSITIONS_MAX}.\n\n« Pattern » carries the rhythm as a string of zeros and ones, one per position, and the number of positions is its length.\n\n« Fundamental » is the note of position zero, given with its frequency, from C1 to C6.\n\n« Layout » decides what the other positions are worth, and the three ways do not make the same music.\n• « The circle is the octave » makes the whole turn worth one octave, whatever the number of positions: twelve positions give the chromatic scale, sixteen give sixteen equal divisions. The angle is then the pitch, and turning the pattern transposes it.\n• « Twelve semitones » gives one tempered semitone per position: the turn covers more or less than an octave depending on the number of positions, and nothing falls between two keys. On a large circle started from a high fundamental, the top of the turn stops at the highest note and several positions meet there.\n• « Chain of fifths » lets the rank of the onset decide rather than its position: the first sounding vertex takes the fundamental, the second the just fifth folded into its octave, and so on. Two patterns with the same number of onsets give the same notes.\n\nA note's name is written in its dot as long as it fits there. Beyond that, and as soon as an offset in cents lengthens the names, it is read by hovering over the vertex. The name appears on every vertex or on none: half-way, the eye would take the unnamed vertices for vertices of another kind.\n\nThe « Circle » output carries the positions and their notes, with no duration at all: time is supplied by the node that renders it.\n\n${CITATION_EN}`,
    entrees: [],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Motif", nomEn: "Pattern", type: "texte", defaut: "101010010100", defautEn: "101010010100",
        doc: "Une suite de zéros et de uns, un par place du cercle. Sa longueur donne le nombre de places.",
        docEn: "A string of zeros and ones, one per position of the circle. Its length gives the number of positions." },
      { nom: "Fondamentale", nomEn: "Fundamental", type: "choix",
        options: FONDAMENTALES.map((f) => libelleFondamentale(f, true)),
        optionsEn: FONDAMENTALES.map((f) => libelleFondamentale(f, false)),
        optionIds: FONDAMENTALES.map((f) => String(f.note)),
        defaut: libelleFondamentale(FONDAMENTALES[36], true),
        defautEn: libelleFondamentale(FONDAMENTALES[36], false),
        doc: "La note de la place zéro, donnée avec sa fréquence. Toutes les autres s'en déduisent.",
        docEn: "The note of position zero, given with its frequency. Every other one follows from it." },
      { nom: "Répartition", nomEn: "Layout", type: "choix",
        options: ["Le cercle est l'octave", "Douze demi-tons", "Chaîne de quintes"],
        optionsEn: ["The circle is the octave", "Twelve semitones", "Chain of fifths"],
        optionIds: ["octave", "demi-tons", "quintes"],
        defaut: "Le cercle est l'octave", defautEn: "The circle is the octave",
        doc: "Ce que valent les places autres que zéro. L'octave divisée par le cercle, le demi-ton tempéré, ou la chaîne de quintes justes prise dans l'ordre des attaques.",
        docEn: "What the positions other than zero are worth. The octave divided by the circle, the tempered semitone, or the chain of just fifths taken in the order of the onsets." },
    ],
    async executer(ctx: any) {
      const motif = nettoyerMotif(ctx.paramTexte("Motif", "101010010100")) || "101010010100";
      const fondamentale = parseInt(ctx.paramTexte("Fondamentale", "60"), 10) || 60;
      const repartition = ctx.paramTexte("Répartition", "octave") as Repartition;
      const cercle = cercleMelodique(motif, fondamentale, repartition);
      const nom = FONDAMENTALES.find((f) => f.note === fondamentale)?.nom ?? String(fondamentale);
      return {
        valeurs: [cercle],
        message: `${cercle.sommets.length} notes · ${cercle.positions} ${en() ? "positions" : "places"} · ${nom}`,
      };
    },
  },
  {
    id: "rendu-cercles",
    nom: "Rendu de cercles", nomEn: "Circle Renderer",
    univers: "Autres", famille: "Circle",
    resume: "Fait tourner jusqu'à huit cercles ensemble et en rend une séquence de notes.",
    resumeEn: "Turns up to eight circles together and returns a sequence of notes.",
    notice: `Fait tourner les cercles branchés sur ses entrées et rend leurs attaques en notes datées. C'est le seul endroit de la chaîne où le temps entre : un cercle ne porte ni tempo, ni durée, ni nuance.\n\nLes boutons « + » et « − » sous les entrées allongent ou raccourcissent le composant, jusqu'à ${ANNEAUX} cercles. Une entrée branchée ne se cache pas.\n\n« Base de temps » décide de ce que les cercles partagent, et les deux ne font pas la même musique. « Même cycle » leur fait faire un tour dans le même temps : seize places et douze places se retrouvent à chaque tour, et c'est la polyrythmie. « Même pulsation » donne à la place la même durée partout : le cercle de seize met alors plus longtemps que celui de douze, ils se décalent, et c'est le déphasage. Le plus grand cercle garde le tour nominal, les autres se décalent contre lui.\n\n« Tempo » est la vitesse de l'aiguille, en tours par minute, et non celle d'une noire.\n\n« Tours » donne le nombre de fois que le plus long des cercles fait son tour. Un cercle plus court coupé en chemin garde ses attaques jusqu'à la fin du rendu, et pas au-delà.\n\n« Nuance » est celle de toutes les notes, un cercle n'en portant pas.\n\nChaque cercle devient une voix, ce qui permet de les distinguer par leur couleur sur un rouleau, et de leur donner une portée chacun à la gravure. Une attaque dure une place et ne tient pas jusqu'à la suivante.\n\nLes attaques d'un cercle rythmique sont écrites sur le canal de batterie du General MIDI, le dixième, où leur numéro désigne un tambour : elles s'entendent en percussion à l'écoute, et se relisent sur le kit dans un séquenceur. Celles d'un cercle mélodique portent leur hauteur et aucun canal. Le message dit combien de cercles vont à la batterie.\n\nLa sortie « Séquence » porte les notes avec leurs instants en secondes, silence final compris.\n\n${CITATION}`,
    noticeEn: `Turns the circles connected to its inputs and returns their onsets as dated notes. This is the only place in the chain where time enters: a circle carries neither tempo, nor duration, nor dynamics.\n\nThe « + » and « - » buttons under the inputs make the node longer or shorter, up to ${ANNEAUX} circles. A connected input is never hidden.\n\n« Time base » decides what the circles share, and the two do not make the same music. « Same cycle » has them complete a turn in the same time: sixteen positions and twelve positions meet again at every turn, and that is polyrhythm. « Same pulse » gives the position the same duration everywhere: the circle of sixteen then takes longer than the one of twelve, they drift apart, and that is phasing. The largest circle keeps the nominal turn, the others drift against it.\n\n« Tempo » is the speed of the hand, in turns per minute, and not that of a quarter note.\n\n« Turns » gives the number of times the longest circle completes its turn. A shorter circle cut on the way keeps its onsets until the end of the rendering, and no further.\n\n« Dynamics » is that of every note, a circle carrying none.\n\nEach circle becomes a voice, which allows them to be told apart by colour on a roll, and to be given a stave each when engraved. An onset lasts one position and does not hold until the next.\n\nThe onsets of a rhythm circle are written on the General MIDI drum channel, the tenth, where their number names a drum: they are heard as percussion, and read back on the kit in a sequencer. Those of a melodic circle carry their pitch and no channel. The message states how many circles go to the drum channel.\n\nThe « Sequence » output carries the notes with their instants in seconds, trailing silence included.\n\n${CITATION_EN}`,
    entrees: Array.from({ length: ANNEAUX }, (_, k) => ({
      nom: `Cercle ${k + 1}`, nomEn: `Circle ${k + 1}`, type: "cercle", requis: false,
    })),
    // Les boutons « + » et « − » sous les entrées : le nœud naît avec deux anneaux et s'allonge à la
    // demande, plutôt que de poser huit ports dont six resteraient vides sur un cercle seul.
    entreesExtensibles: { min: 1, defaut: 2 },
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [5, 240], pas: 1, defaut: 30, unite: "tours/min", uniteEn: "turns/min",
        doc: "La vitesse de l'aiguille, en tours par minute. Ce n'est pas un tempo de noire : un tour est un cycle entier.",
        docEn: "The speed of the hand, in turns per minute. This is not a quarter-note tempo: one turn is a whole cycle." },
      { nom: "Base de temps", nomEn: "Time base", type: "choix",
        options: ["Même cycle", "Même pulsation"], optionsEn: ["Same cycle", "Same pulse"],
        optionIds: ["cycle", "pulsation"], defaut: "Même cycle", defautEn: "Same cycle",
        doc: "Ce que les cercles partagent quand ils sont plusieurs. Le cycle les fait se retrouver à chaque tour ; la pulsation les fait se décaler.",
        docEn: "What the circles share when there are several. The cycle has them meet at every turn; the pulse has them drift apart." },
      { nom: "Tours", nomEn: "Turns", type: "curseur", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Combien de fois le plus long des cercles fait son tour.",
        docEn: "How many times the longest circle completes its turn." },
      { nom: "Nuance", nomEn: "Dynamics", type: "curseur", plage: [1, 127], pas: 1, defaut: 100,
        doc: "La nuance de toutes les notes rendues, un cercle n'en portant pas.",
        docEn: "The dynamics of every rendered note, a circle carrying none." },
    ],
    async executer(ctx: any) {
      // UNE ENTRÉE PORTE UNE SUITE, et une suite d'un cercle est le cas ordinaire. C'est ce qui
      // permet à une boucle de variation de brancher ses quatre cercles sur une seule entrée.
      const voies: Cercle[][] = [];
      for (let i = 0; i < ANNEAUX; i++) {
        const suite = enSuite(ctx.entree(i));
        if (suite.length > 0) voies.push(suite);
      }
      if (voies.length === 0) {
        return { valeurs: [null], message: en() ? "No circle at the inputs." : "Aucun cercle à l'entrée." };
      }
      const sequence = rendreCercles(voies, {
        tempo: ctx.paramNombre("Tempo", 30),
        base: ctx.paramTexte("Base de temps", "cycle") as BaseDeTemps,
        tours: ctx.paramNombre("Tours", 4),
        velocite: ctx.paramNombre("Nuance", 100),
      });
      const tailles = voies.map((s) => [...new Set(s.map((c) => c.positions))].join("-")).join(" / ");
      const pluriel = voies.length > 1 ? "s" : "";
      const frappes = voies.filter((s) => s[0].sorte === "percussion").length;
      const varie = voies.reduce((m, s) => Math.max(m, s.length), 1);
      return {
        valeurs: [sequence],
        message: `${voies.length} ${en() ? "circle" : "cercle"}${pluriel} ${tailles}`
          + (varie > 1 ? ` · ${varie} ${en() ? "variations" : "variations"}` : "")
          + `${frappes > 0 ? ` · ${frappes} ${en() ? "on the drum channel" : "au canal de batterie"}` : ""}`
          + ` · ${sequence.notes.length} notes · ${(sequence.duree ?? 0).toFixed(2)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
