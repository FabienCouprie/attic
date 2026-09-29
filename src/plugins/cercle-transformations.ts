// plugins/cercle-transformations.ts — Ce qu'on fait subir à un cercle, d'un tour à l'autre.
//
// LE CALCUL EST DANS `audio/cercle.ts`, ÉPROUVÉ. Ce fichier n'est que la prise, et une seule chose
// lui appartient en propre : la façon dont la quantité change d'une passe à l'autre.
//
// POURQUOI UNE QUANTITÉ QUI CHANGE. Sans elle, une chaîne posée dans une boucle rendrait la même
// chose à chaque passe : le corps est bien rejoué, mais un nœud aux réglages fixes donne un
// résultat fixe. C'est ce qui sépare une répétition d'une variation. La quantité s'écrit donc comme
// les départs et les durées d'une boucle par créneau : un nombre seul vaut pour toutes les passes,
// une suite donne les premières et répète la dernière, et « de:à » fait une rampe droite.
//
// LA MODULATION PAR COURBE NE CONVENAIT PAS, et `MODULABLES.md` le dit avant nous : une courbe
// pilote une grandeur continue et audible, non « un nombre d'itérations, une graine ». Un pas de
// rotation est un entier de places, une graine un numéro de tirage : ni l'un ni l'autre ne se lit
// sur une courbe.

import type { FicheAudio } from "../audio/types-domaine";
import { PERCUSSIONS_CHOIX } from "../audio/batterie-midi";
import {
  complementaire, enSuite, inverserIntervalles, inverserOrdre, permuterEtiquettes, reflechir,
  tourner, type Cercle,
} from "../audio/cercle";
import { deployer, lireChamp } from "../audio/matrice-parametres";
import { langueCourante } from "../i18n";
import { boucleCourante } from "./boucleSequencesGlobal";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/**
 * La quantité de la passe en cours, lue dans un champ déployé sur les passes.
 *
 * HORS D'UNE BOUCLE, C'EST LA PREMIÈRE VALEUR DU CHAMP, et le composant se règle comme n'importe
 * quel autre. Dans une boucle, le champ est étalé sur le nombre de passes et l'on prend celle du
 * rang courant : « 0:3 » sur quatre passes donne 0, 1, 2, 3.
 *
 * LA BOUCLE LA PLUS INTÉRIEURE EST CELLE QUI COMPTE, comme pour tout ce qui lit une passe dans ce
 * dépôt. Deux boucles emboîtées font varier la quantité au rythme de la seconde.
 */
export function quantiteDeLaPasse(texte: string, defaut: number): number {
  const champ = lireChamp(texte);
  if (!champ) return defaut;
  const b = boucleCourante();
  const passes = Math.max(1, b?.morceaux.length ?? 1);
  const rang = Math.min(passes - 1, Math.max(0, b?.index ?? 0));
  return deployer(champ, passes)[rang] ?? defaut;
}

/** Le rang de la passe et leur nombre, pour que le message le dise. */
function rangDeLaPasse(): string {
  const b = boucleCourante();
  if (!b || b.morceaux.length <= 1) return "";
  return ` · ${en() ? "pass" : "passe"} ${b.index + 1}/${b.morceaux.length}`;
}

/**
 * La suite reçue, vide quand ce n'est pas un cercle.
 *
 * UNE TRANSFORMATION S'APPLIQUE À CHAQUE CERCLE D'UNE SUITE, et rend une suite de même longueur. Un
 * cercle seul est une suite d'un : le cas ordinaire ne change pas, et une boucle de variation peut
 * traverser une transformation sans que ses cercles se perdent.
 */
function suiteRecue(ctx: any): Cercle[] {
  return enSuite(ctx.entree(0));
}

/** Ce qu'un composant rend : une suite, ramenée au cercle seul quand elle n'en porte qu'un. */
function rendre(suite: readonly Cercle[]): Cercle | Cercle[] {
  return suite.length === 1 ? suite[0] : [...suite];
}

const RIEN = () => ({
  valeurs: [null], erreur: true,
  message: en() ? "No circle at the input." : "Aucun cercle à l'entrée.",
});

const ENTREE_CERCLE = [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }];
const SORTIE_CERCLE = [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }];

/** La phrase qui explique la syntaxe d'un champ, la même partout. */
const CHAMP_FR = "Un nombre seul vaut pour toutes les passes ; une suite de nombres donne les premières et répète la dernière ; deux nombres séparés par deux points font une rampe droite étalée sur les passes.";
const CHAMP_EN = "A single number holds for every pass; a series of numbers gives the first ones and repeats the last; two numbers separated by a colon make a straight ramp spread over the passes.";

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-tourner",
    nom: "Tourner un cercle", nomEn: "Rotate Circle",
    univers: "Autres", famille: "Circle",
    resume: "Décale toutes les attaques d'un même nombre de places, le son suivant son point.",
    resumeEn: "Shifts every onset by the same number of positions, the sound following its point.",
    notice: `Fait tourner le cercle reçu d'un nombre de places, et rend le cercle tourné. Chaque sommet emporte son son là où il va.\n\nLa rotation ne change ni la régularité, ni l'équilibre, ni l'aire, ni l'imparité du rythme : elle ne fait que changer l'endroit où le cycle commence. Les contretemps, eux, en dépendent, puisqu'ils se comptent sur les places premières avec le nombre de places.\n\n« Pas » donne le nombre de places dont le cercle tourne, vers l'avant si le nombre est positif. ${CHAMP_FR}\n\nDans une boucle, c'est ce champ qui fait la variation : « 0:3 » sur quatre passes rend le cercle intact, puis tourné d'une place, de deux, de trois.\n\nLa sortie « Cercle » porte le cercle tourné. Le message donne le pas appliqué et, dans une boucle, le rang de la passe.`,
    noticeEn: `Turns the received circle by a number of positions, and returns the turned circle. Each vertex carries its sound along with it.\n\nRotation changes neither the evenness, nor the balance, nor the area, nor the oddity of the rhythm: it only changes where the cycle begins. Off-beatness does depend on it, since it is counted on the positions coprime with the number of positions.\n\n« Step » gives the number of positions the circle turns by, forward when the number is positive. ${CHAMP_EN}\n\nInside a loop, it is this field that makes the variation: « 0:3 » over four passes returns the circle untouched, then turned by one position, by two, by three.\n\nThe « Circle » output carries the turned circle. The message gives the step applied and, inside a loop, the rank of the pass.`,
    entrees: ENTREE_CERCLE,
    sorties: SORTIE_CERCLE,
    parametres: [
      { nom: "Pas", nomEn: "Step", type: "texte", defaut: "1", defautEn: "1",
        doc: `Le nombre de places dont le cercle tourne. ${CHAMP_FR}`,
        docEn: `The number of positions the circle turns by. ${CHAMP_EN}` },
    ],
    async executer(ctx: any) {
      const suite = suiteRecue(ctx);
      if (suite.length === 0) return RIEN();
      const pas = Math.round(quantiteDeLaPasse(ctx.paramTexte("Pas", "1"), 0));
      return {
        valeurs: [rendre(suite.map((c) => tourner(c, pas)))],
        message: `${en() ? "step" : "pas"} ${pas}${rangDeLaPasse()}`,
      };
    },
  },
  {
    id: "cercle-miroir",
    nom: "Miroir d'un cercle", nomEn: "Mirror Circle",
    univers: "Autres", famille: "Circle",
    resume: "Réfléchit les attaques autour d'un axe, la place de l'axe restant en place.",
    resumeEn: "Reflects the onsets about an axis, the position of the axis staying put.",
    notice: `Réfléchit le cercle reçu autour d'un axe et rend le cercle réfléchi. La place de l'axe reste où elle est, et la place suivante prend la place de la précédente.\n\nAvec la rotation, la réflexion engendre le groupe des symétries du cercle : deux motifs qui s'en déduisent l'un l'autre sont le même collier, et portent les mêmes scores. C'est ce qui permet d'entendre une variation sans que les mesures bougent.\n\n« Axe » est donné en places et non en degrés : la réflexion qui fixe la place a envoie la place p sur a moins p. Un axe nul est le miroir autour de la place zéro. ${CHAMP_FR}\n\nLa sortie « Cercle » porte le cercle réfléchi. Le message donne l'axe appliqué et, dans une boucle, le rang de la passe.`,
    noticeEn: `Reflects the received circle about an axis and returns the reflected circle. The position of the axis stays where it is, and the following position takes the place of the preceding one.\n\nTogether with rotation, reflection generates the symmetry group of the circle: two patterns that follow from one another are the same necklace, and carry the same scores. That is what allows a variation to be heard without the measurements moving.\n\n« Axis » is given in positions and not in degrees: the reflection that fixes position a sends position p to a minus p. A null axis is the mirror about position zero. ${CHAMP_EN}\n\nThe « Circle » output carries the reflected circle. The message gives the axis applied and, inside a loop, the rank of the pass.`,
    entrees: ENTREE_CERCLE,
    sorties: SORTIE_CERCLE,
    parametres: [
      { nom: "Axe", nomEn: "Axis", type: "texte", defaut: "0", defautEn: "0",
        doc: `La place que la réflexion laisse en place. ${CHAMP_FR}`,
        docEn: `The position the reflection leaves in place. ${CHAMP_EN}` },
    ],
    async executer(ctx: any) {
      const suite = suiteRecue(ctx);
      if (suite.length === 0) return RIEN();
      const axe = Math.round(quantiteDeLaPasse(ctx.paramTexte("Axe", "0"), 0));
      return {
        valeurs: [rendre(suite.map((c) => reflechir(c, axe)))],
        message: `${en() ? "axis" : "axe"} ${axe}${rangDeLaPasse()}`,
      };
    },
  },
  {
    id: "cercle-inverser",
    nom: "Inverser une mélodie", nomEn: "Invert Melody",
    univers: "Autres", famille: "Circle",
    resume: "Renverse l'ordre des notes ou leurs intervalles, les places ne bougeant pas.",
    resumeEn: "Reverses the order of the notes or their intervals, the positions staying put.",
    notice: `Renverse les notes du cercle reçu sans toucher à ses places, et rend le cercle renversé. Le rythme est donc intact, et aucune mesure ne change.\n\nDeux opérations portent le nom d'inversion en musique, et elles ne font pas la même chose. « L'ordre des notes » lit les sons à rebours le long du cercle : la première note va à la dernière place qui sonne, et réciproquement. « Les intervalles » agit sur les hauteurs elles-mêmes : la note v devient deux fois l'axe moins v, ce qui retourne la mélodie autour d'un pivot et change une montée en descente.\n\n« Axe » ne sert qu'aux intervalles, et se donne en demi-tons. Laissé vide, c'est la note la plus grave du cercle qui sert de pivot : la mélodie se déplie alors vers l'aigu à partir de son propre pied. ${CHAMP_FR}\n\nUn cercle de percussion traverse ce composant sans changer : tous ses sommets portent le même son, et les renverser ne donnerait rien d'autre.\n\nLa sortie « Cercle » porte le cercle renversé. Le message dit l'opération et, dans une boucle, le rang de la passe.`,
    noticeEn: `Reverses the notes of the received circle without touching its positions, and returns the reversed circle. The rhythm is therefore intact, and no measurement changes.\n\nTwo operations bear the name inversion in music, and they do not do the same thing. « The order of the notes » reads the sounds backwards along the circle: the first note goes to the last sounding position, and the other way round. « The intervals » acts on the pitches themselves: note v becomes twice the axis minus v, which turns the melody over about a pivot and changes a rise into a fall.\n\n« Axis » serves the intervals only, and is given in semitones. Left empty, the lowest note of the circle serves as the pivot: the melody then unfolds upwards from its own foot. ${CHAMP_EN}\n\nA percussion circle passes through this node unchanged: all its vertices carry the same sound, and reversing them would give nothing else.\n\nThe « Circle » output carries the reversed circle. The message states the operation and, inside a loop, the rank of the pass.`,
    entrees: ENTREE_CERCLE,
    sorties: SORTIE_CERCLE,
    parametres: [
      { nom: "Inversion", nomEn: "Inversion", type: "choix",
        options: ["L'ordre des notes", "Les intervalles"],
        optionsEn: ["The order of the notes", "The intervals"],
        optionIds: ["ordre", "intervalles"],
        defaut: "L'ordre des notes", defautEn: "The order of the notes",
        doc: "L'ordre lit les sons à rebours le long du cercle ; les intervalles retournent les hauteurs autour d'un pivot.",
        docEn: "The order reads the sounds backwards along the circle; the intervals turn the pitches over about a pivot." },
      { nom: "Axe", nomEn: "Axis", type: "texte", defaut: "", defautEn: "",
        doc: `Le pivot du renversement des intervalles, en demi-tons. Vide, c'est la note la plus grave du cercle. ${CHAMP_FR}`,
        docEn: `The pivot of the interval inversion, in semitones. Empty, it is the lowest note of the circle. ${CHAMP_EN}` },
    ],
    async executer(ctx: any) {
      const suite = suiteRecue(ctx);
      if (suite.length === 0) return RIEN();
      const quoi = ctx.paramTexte("Inversion", "ordre");
      if (quoi === "ordre") {
        return {
          valeurs: [rendre(suite.map(inverserOrdre))],
          message: `${en() ? "order" : "ordre"}${rangDeLaPasse()}`,
        };
      }
      const texte = String(ctx.paramTexte("Axe", "")).trim();
      const axe = texte === "" ? undefined : quantiteDeLaPasse(texte, 60);
      return {
        valeurs: [rendre(suite.map((c) => inverserIntervalles(c, axe)))],
        message: `${en() ? "intervals" : "intervalles"}`
          + `${axe === undefined ? ` · ${en() ? "lowest note" : "note la plus grave"}` : ` · ${en() ? "axis" : "axe"} ${axe}`}`
          + rangDeLaPasse(),
      };
    },
  },
  {
    id: "cercle-permuter",
    nom: "Permuter les notes", nomEn: "Permute Notes",
    univers: "Autres", famille: "Circle",
    resume: "Mélange les notes entre les places du cercle, le rythme ne bougeant pas.",
    resumeEn: "Shuffles the notes between the positions of the circle, the rhythm staying put.",
    notice: `Mélange les notes du cercle reçu entre ses places et rend le cercle permuté. Les places ne bougent pas : le rythme est intact, et aucune mesure ne change.\n\nC'est un axe de composition que les scores ne voient pas. Deux cercles qui ne diffèrent que par leurs étiquettes portent la même régularité, le même équilibre, la même aire et la même imparité, alors qu'ils ne s'entendent pas pareil.\n\nUne permutation demandée est une permutation tirée, et non énumérée : les permutations de sept notes sont cinq mille et quarante, celles de dix plus de trois millions, très au-delà de ce qu'un parcours donnerait. « Graine » est le numéro du tirage, et la même graine rend toujours la même permutation. ${CHAMP_FR}\n\nDans une boucle, une graine écrite « 1:8 » donne une permutation différente à chaque passe, toutes reproductibles.\n\nUn cercle de percussion traverse ce composant sans changer : tous ses sommets portent le même son.\n\nLa sortie « Cercle » porte le cercle permuté. Le message donne la graine employée et, dans une boucle, le rang de la passe.`,
    noticeEn: `Shuffles the notes of the received circle between its positions and returns the permuted circle. The positions do not move: the rhythm is intact, and no measurement changes.\n\nThis is an axis of composition that the scores do not see. Two circles that differ only by their labels carry the same evenness, the same balance, the same area and the same oddity, although they do not sound alike.\n\nA permutation asked for is a permutation drawn, not enumerated: the permutations of seven notes number five thousand and forty, those of ten more than three million, far beyond what a traversal would give. « Seed » is the number of the draw, and the same seed always gives the same permutation. ${CHAMP_EN}\n\nInside a loop, a seed written « 1:8 » gives a different permutation at each pass, all reproducible.\n\nA percussion circle passes through this node unchanged: all its vertices carry the same sound.\n\nThe « Circle » output carries the permuted circle. The message gives the seed used and, inside a loop, the rank of the pass.`,
    entrees: ENTREE_CERCLE,
    sorties: SORTIE_CERCLE,
    parametres: [
      // CE RÉGLAGE NE PORTE PAS LE RÔLE DE GRAINE, et c'est délibéré : il n'en contient pas une mais
      // une SUITE, un nombre par passe, ou une rampe étalée sur les passes. Le moteur résout une
      // graine, pas une suite ; lui donner ce rôle remplacerait la suite par un nombre tiré au sort.
      { nom: "Graine", nomEn: "Seed", type: "texte", defaut: "1", defautEn: "1",
        doc: `Le numéro du tirage. La même graine rend la même permutation. ${CHAMP_FR}`,
        docEn: `The number of the draw. The same seed gives the same permutation. ${CHAMP_EN}` },
    ],
    async executer(ctx: any) {
      const suite = suiteRecue(ctx);
      if (suite.length === 0) return RIEN();
      const graine = Math.round(quantiteDeLaPasse(ctx.paramTexte("Graine", "1"), 1));
      return {
        valeurs: [rendre(suite.map((c) => permuterEtiquettes(c, graine)))],
        message: `${en() ? "seed" : "graine"} ${graine}${rangDeLaPasse()}`,
      };
    },
  },
  {
    id: "cercle-complementaire",
    nom: "Complémentaire d'un cercle", nomEn: "Circle Complement",
    univers: "Autres", famille: "Circle",
    resume: "Rend le cercle des places que le motif laisse libres, et ce qu'elles jouent.",
    resumeEn: "Returns the circle of the positions the pattern leaves free, and what they play.",
    notice: `Rend le cercle des places que le motif reçu laisse libres. Le complémentaire se prend dans le temps : ce sont les places inoccupées du cycle, et non des hauteurs.\n\nCe que ces places jouent dépend de la sorte du cercle.\n\nSur une percussion, tous les sommets portent le même son et le complémentaire en reçoit un à lui, réglé par « Percussion ». C'est le hoquet, où un second instrument remplit les silences du premier.\n\nSur une mélodie, les notes viennent d'une chaîne de quintes justes repliée dans l'octave de la fondamentale, la fondamentale étant la note la plus grave du cercle reçu. Aucune note du cercle d'origine n'est reprise, à vingt cents près. La fondamentale ne dépendant ni du rang ni de la place, le complémentaire ne change ni sous rotation ni sous permutation des étiquettes.\n\nUn cercle mélodique vide n'a pas de fondamentale, et son complémentaire est refusé plutôt que rempli d'une note arbitraire.\n\nLa sortie « Cercle » porte le complémentaire. Le message donne le nombre de places libres.`,
    noticeEn: `Returns the circle of the positions the received pattern leaves free. The complement is taken in time: these are the unoccupied positions of the cycle, and not pitches.\n\nWhat those positions play depends on the kind of circle.\n\nOn a percussion, every vertex carries the same sound and the complement receives one of its own, set by « Drum ». This is hocket, where a second instrument fills the silences of the first.\n\nOn a melody, the notes come from a chain of just fifths folded into the octave of the fundamental, the fundamental being the lowest note of the received circle. No note of the original circle is reused, to within twenty cents. Since the fundamental depends on neither the rank nor the position, the complement changes under neither rotation nor permutation of the labels.\n\nAn empty melodic circle has no fundamental, and its complement is refused rather than filled with an arbitrary note.\n\nThe « Circle » output carries the complement. The message gives the number of free positions.`,
    entrees: ENTREE_CERCLE,
    sorties: SORTIE_CERCLE,
    parametres: [
      { nom: "Percussion", nomEn: "Drum", type: "choix",
        options: PERCUSSIONS_CHOIX.map((p) => p.fr), optionsEn: PERCUSSIONS_CHOIX.map((p) => p.en),
        optionIds: PERCUSSIONS_CHOIX.map((p) => String(p.note)),
        defaut: "Caisse claire", defautEn: "Snare",
        doc: "Le son du complémentaire d'un cercle de percussion. Sans effet sur une mélodie, dont les notes se déduisent de la fondamentale.",
        docEn: "The sound of the complement of a percussion circle. No effect on a melody, whose notes follow from the fundamental." },
    ],
    async executer(ctx: any) {
      const suite = suiteRecue(ctx);
      if (suite.length === 0) return RIEN();
      const son = parseInt(ctx.paramTexte("Percussion", "38"), 10) || 38;
      const pris = suite.map((c) => complementaire(c, { son }));
      // UN SEUL CERCLE SANS COMPLÉMENTAIRE REFUSE TOUTE LA SUITE, plutôt que d'en rendre une plus
      // courte : une voix à qui il manquerait une variation ne serait plus celle qu'on a écrite.
      if (pris.some((x) => x === null)) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "An empty melodic circle has no fundamental." : "Un cercle mélodique vide n'a pas de fondamentale.",
        };
      }
      const sortie = pris as Cercle[];
      return {
        valeurs: [rendre(sortie)],
        message: `${sortie[0].sommets.length} ${en() ? "free positions" : "places libres"} ${en() ? "of" : "sur"} ${sortie[0].positions}`
          + rangDeLaPasse(),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
