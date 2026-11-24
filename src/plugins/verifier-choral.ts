// plugins/verifier-choral.ts — Vérifier un choral à quatre voix, chaque faute nommée à sa place.
//
// LE CALCUL EST DANS `audio/choral-verifier.ts`, ses règles dans `audio/choral-regles.ts` et ses
// tessitures dans `audio/tessitures-satb.ts` ; ce fichier lit les réglages et compose le rapport.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence } from "../audio/sequence";
import { PARAMETRE_TONIQUE } from "../audio/cles";
import { estRefusChoral, REGLES_CHORAL, verifierChoral } from "../audio/choral-verifier";
import { NOMS_SATB } from "../audio/tessitures-satb";
import { MODES_CHORAL, type ModeChoral } from "../audio/choral-regles";
import { estModeleHarmonique } from "../audio/modele-harmonique";
import { passagesLesPlusCouteux } from "../audio/choral-modele";
import { placeDe } from "../audio/choral-tranches";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "verifier-choral",
    nom: "Vérifier un choral", nomEn: "Check a Chorale",
    univers: "Autres", famille: "Harmonisation",
    resume: "Vérifie un choral à quatre voix selon les règles de l'écriture à quatre voix, et nomme chaque faute à sa mesure et à son temps.",
    resumeEn: "Checks a four-voice chorale against the rules of four-part writing, and names every fault at its bar and beat.",
    notice: "Ce composant vérifie un choral à quatre voix, soprano, alto, ténor et basse, selon les règles de l'écriture à quatre voix, et nomme chaque faute à sa mesure, à son temps et sur ses voix.\n\nLe choral arrive par l'entrée « Séquence », ses quatre premières voix étant le soprano, l'alto, le ténor et la basse. Un choral auquel une voix manque, ou qui en a plus de quatre, est refusé, et le message nomme la voix en cause. Le choral se découpe en tranches, une à chaque attaque de quelque voix que ce soit ; les mouvements se jugent d'une tranche à la suivante, les accords sur les seules tranches qui tombent sur un temps de noire.\n\nLes règles sont celles de l'usage scolaire. Sont des erreurs : deux voix qui se croisent ; plus d'une octave entre soprano et alto, ou entre alto et ténor ; les quintes et les octaves parallèles entre deux voix quelconques, douzièmes et unissons compris ; un saut de plus d'une octave, et la seconde augmentée ; la sensible doublée dans l'accord de dominante ; la sensible du soprano ou de la basse qui ne monte pas à la tonique ; la septième d'un accord que la note suivante de sa voix ne fait pas descendre d'un degré, quand l'accord change ; un choral qui ne finit pas sur la tonique à l'état fondamental. Sont des avis : en mineur et en dorien, la fin sur la dominante, la cadence phrygienne des chorals modaux ; plus d'une douzième entre ténor et basse ; une voix qui dépasse la note que sa voisine tenait ; les quintes et octaves par mouvement contraire ; les quintes et octaves directes aux voix extrêmes, le soprano procédant par saut ; les sauts de triton et de septième ; une sensible intérieure ni résolue ni descendue à la quinte ; un temps dont les notes ne forment aucun accord de la tonalité ; un accord sans tierce ; une avant-dernière que le mode ne permet pas. La tierce picarde finale est admise en mineur, en dorien et en phrygien.\n\nLes tessitures sont celles des chorals de Johann Sebastian Bach, dans l'encodage de Craig Sapp : une note hors de l'étendue que Bach a employée dans sa voix est une erreur, une note hors de l'étendue où tombent quatre-vingt-dix-huit centièmes de ses notes est un avis.\n\n« Gamme » et « Tonique » disent la tonalité : majeur, mineur, dorien, phrygien ou mixolydien sur la tonique. Chaque accord est celui de la gamme sur son degré, un degré sur deux. En majeur et en mineur, l'avant-dernier temps est la dominante ou la sous-dominante ; en mineur, la dominante et l'accord de septième sensible sont bâtis sur la sensible, et les autres accords sur le mineur naturel. En dorien et en mixolydien, la dominante et l'accord du septième degré sont des accords du mode sans la sensible et avec elle, bâtis alors sur le mineur mélodique et sur le majeur ; la sensible ne se juge, doublée ou non résolue, que dans ceux qui la portent, et l'avant-dernier temps est la dominante avec sa sensible ou la sous-dominante. Le phrygien n'a pas de sensible : l'accord majeur de la tonique y est un accord du mode, et l'avant-dernier temps est le quatrième, le septième ou le deuxième degré. La seconde augmentée est un saut de trois demi-tons entre deux degrés voisins d'une gamme du mode : la sixte mineure et la sensible en mineur, en dorien et en phrygien, et en phrygien aussi la seconde mineure et la tierce majeure de la tonique ; il n'y en a pas en majeur ni en mixolydien.\n\n« Temps par mesure » et « Anacrouse » ne servent qu'à nommer les places : le premier dit combien de noires compte une mesure, le second combien de noires précèdent la première barre. Le tempo de la séquence donne la durée d'une noire, 120 quand elle n'en porte pas.\n\nUn modèle appris par « Apprendre sur un corpus » peut arriver par l'entrée « Modèle ». Il ne juge pas : il note chaque passage d'une colonne à la suivante sur sa grille, les hauteurs ramenées en do majeur ou en la mineur du plus petit écart, et « Arêtes rapportées » dit combien de passages, parmi ceux qu'il trouve les plus coûteux, le rapport nomme. Sans modèle, ce réglage est sans effet.\n\nLa sortie « Rapport » donne le nombre d'erreurs et d'avis, puis pour chaque règle le nombre de fois où elle a été enfreinte et le nombre de fois où elle a pu être jugée, puis chaque faute, dans l'ordre du temps, et avec un modèle les passages qu'il trouve les plus coûteux, chacun à sa mesure et à son temps, avec son coût et ses quatre notes avant et après.",
    noticeEn: "This component checks a four-voice chorale, soprano, alto, tenor and bass, against the rules of four-part writing, and names every fault at its bar, its beat and on its voices.\n\nThe chorale arrives on the « Sequence » input, its first four voices being the soprano, the alto, the tenor and the bass. A chorale missing a voice, or with more than four, is refused, and the message names the voice at issue. The chorale is cut into slices, one at each attack of any voice; motions are judged from one slice to the next, chords on the slices alone that fall on a quarter-note beat.\n\nThe rules are those of common classroom practice. Errors are: two voices that cross; more than an octave between soprano and alto, or between alto and tenor; parallel fifths and octaves between any two voices, twelfths and unisons included; a leap of more than an octave, and the augmented second; the leading tone doubled in the dominant chord; the leading tone of the soprano or the bass that does not rise to the tonic; a chord's seventh that the next note of its voice does not take down a step, when the chord changes; a chorale that does not end on the root-position tonic. Advisories are: in minor and in Dorian, the ending on the dominant, the Phrygian cadence of modal chorales; more than a twelfth between tenor and bass; a voice that overlaps the note its neighbour held; fifths and octaves by contrary motion; direct fifths and octaves in the outer voices, the soprano moving by leap; tritone and seventh leaps; an inner leading tone neither resolved nor dropped to the fifth; a beat whose notes form no chord of the key; a chord without a third; a penultimate that the mode does not allow. The final Picardy third is admitted in minor, in Dorian and in Phrygian.\n\nThe ranges are those of Johann Sebastian Bach's chorales, in Craig Sapp's encoding: a note outside the range Bach used in its voice is an error, a note outside the range where ninety-eight hundredths of his notes fall is an advisory.\n\n« Scale » and « Tonic » give the key: major, minor, Dorian, Phrygian or Mixolydian on the tonic. Every chord is that of the scale on its degree, one degree in two. In major and in minor, the penultimate beat is the dominant or the subdominant; in minor, the dominant and the leading-tone seventh chord are built on the leading tone, the other chords on the natural minor. In Dorian and in Mixolydian, the dominant and the chord of the seventh degree are chords of the mode without the leading tone and with it, then built on the melodic minor and on the major; the leading tone is judged, doubled or unresolved, only in those that carry it, and the penultimate beat is the dominant with its leading tone or the subdominant. Phrygian has no leading tone: the major chord of the tonic is a chord of the mode there, and the penultimate beat is the fourth, the seventh or the second degree. The augmented second is a leap of three semitones between two neighbouring degrees of a scale of the mode: the minor sixth and the leading tone in minor, in Dorian and in Phrygian, and in Phrygian also the minor second and the major third of the tonic; there is none in major nor in Mixolydian.\n\n« Beats per bar » and « Anacrusis » only serve to name the places: the first says how many quarter notes a bar has, the second how many quarter notes come before the first bar line. The sequence's tempo gives the length of a quarter note, 120 when it carries none.\n\nA model learned by « Learn from a Corpus » may arrive on the « Model » input. It does not judge: it scores every passage from one column to the next on its grid, the pitches brought to C major or A minor by the smallest interval, and « Edges reported » says how many passages, among those it finds the costliest, the report names. Without a model, this setting has no effect.\n\nThe « Report » output gives the number of errors and advisories, then for each rule the number of times it was broken and the number of times it could be judged, then every fault, in time order, and with a model the passages it finds the costliest, each at its bar and beat, with its cost and its four notes before and after.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: true },
      { nom: "Modèle", nomEn: "Model", type: "modele-harmonique", requis: false },
    ],
    sorties: [{ nom: "Rapport", nomEn: "Report", type: "texte" }],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: [...MODES_CHORAL], optionsEn: ["major", "minor", "Dorian", "Phrygian", "Mixolydian"], optionIds: [...MODES_CHORAL],
        defaut: "majeur", defautEn: "major",
        doc: "Le mode de la tonalité. En mineur, la dominante et l'accord de septième sensible prennent la sensible ; en dorien et en mixolydien, ils la prennent ou non ; le phrygien n'en a pas.",
        docEn: "The mode of the key. In minor, the dominant and the leading-tone seventh chord take the leading tone; in Dorian and in Mixolydian, they take it or not; Phrygian has none." },
      { ...PARAMETRE_TONIQUE,
        doc: "La tonique de la tonalité, d'où se lisent les degrés, la sensible et la cadence.",
        docEn: "The tonic of the key, from which the degrees, the leading tone and the cadence are read." },
      { nom: "Temps par mesure", nomEn: "Beats per bar", type: "nombre", plage: [1, 12], pas: 1, defaut: 4,
        doc: "Le nombre de noires d'une mesure. Il ne sert qu'à nommer la mesure et le temps de chaque faute.",
        docEn: "The number of quarter notes in a bar. It only serves to name the bar and beat of every fault." },
      { nom: "Anacrouse", nomEn: "Anacrusis", type: "nombre", plage: [0, 11], pas: 1, defaut: 0,
        doc: "Le nombre de noires avant la première barre, qui forment la mesure zéro. Il ne sert qu'à nommer les places.",
        docEn: "The number of quarter notes before the first bar line, which form bar zero. It only serves to name the places." },
      { nom: "Arêtes rapportées", nomEn: "Edges reported", type: "nombre", plage: [0, 50], pas: 1, defaut: 5,
        doc: "Avec un modèle sur l'entrée « Modèle », le nombre de passages que le rapport nomme parmi ceux que le modèle trouve les plus coûteux. Sans modèle, sans effet.",
        docEn: "With a model on the « Model » input, the number of passages the report names among those the model finds the costliest. Without a model, no effect." },
    ],
    async executer(ctx) {
      const recue = ctx.entree(0);
      if (!estSequence(recue) || recue.notes.length === 0) {
        return { valeurs: [null], erreur: true, message: en() ? "Connect a chorale to the Sequence input." : "Branchez un choral sur l'entrée Séquence." };
      }
      const lue = ctx.paramTexte("Gamme", "majeur");
      const mode: ModeChoral = MODES_CHORAL.find((m) => m === lue) ?? "majeur";
      const tonique = Number(ctx.paramTexte("Tonique", "0")) || 0;
      const verdict = verifierChoral(recue, {
        tonique, mode,
        tempo: recue.tempo && recue.tempo > 0 ? recue.tempo : 120,
        tempsParMesure: Math.round(ctx.paramNombre("Temps par mesure", 4)),
        anacrouse: Math.round(ctx.paramNombre("Anacrouse", 0)),
      });
      if (estRefusChoral(verdict)) {
        const nom = (v: number) => (v < 4 ? NOMS_SATB[v][en() ? "en" : "fr"] : `${en() ? "voice" : "voix"} ${v + 1}`);
        const message = verdict.voixAbsentes.length > 0
          ? `${en() ? "A chorale needs four voices; missing" : "Un choral demande quatre voix ; il manque"} : ${verdict.voixAbsentes.map(nom).join(", ")}`
          : `${en() ? "A chorale has four voices; extra" : "Un choral a quatre voix ; en trop"} : ${verdict.voixEnTrop.map(nom).join(", ")}`;
        return { valeurs: [null], erreur: true, message };
      }
      const erreurs = verdict.infractions.filter((i) => i.gravite === "erreur").length;
      const avis = verdict.infractions.length - erreurs;
      const bilan = en()
        ? `${erreurs} errors · ${avis} advisories · ${verdict.tranches} slices`
        : `${erreurs} erreurs · ${avis} avis · ${verdict.tranches} tranches`;
      const parRegle = REGLES_CHORAL.map((r) => {
        const n = verdict.infractions.filter((i) => i.regle === r.id).length;
        return `${en() ? r.en : r.fr} : ${n} ${en() ? "of" : "sur"} ${verdict.jugees[r.id]}`;
      });
      const detail = verdict.infractions.map((i) =>
        `${en() ? "bar" : "mesure"} ${i.mesure}, ${en() ? "beat" : "temps"} ${i.temps} · ${i.gravite === "erreur" ? (en() ? "error" : "erreur") : (en() ? "advisory" : "avis")} · ${en() ? i.en : i.fr}`);
      // LE MODÈLE NE JUGE PAS, IL CLASSE : il nomme les passages que le corpus appris aurait le moins
      // écrits, sans les dire fautifs.
      const recuModele = ctx.entree(1);
      const aretes = Math.max(0, Math.round(ctx.paramNombre("Arêtes rapportées", 5)));
      const noms = (h: readonly number[]) => h.map((x) => nomNote(x)).join(" ");
      const tempo = recue.tempo && recue.tempo > 0 ? recue.tempo : 120;
      const parModele = estModeleHarmonique(recuModele) && aretes > 0
        ? ["", `${en() ? "costliest passages for the model" : "passages les plus coûteux pour le modèle"} (${en() ? "corpus" : "corpus"} ${recuModele.empreinte}) :`,
          ...passagesLesPlusCouteux(recuModele, recue, tonique, aretes).map((p) => {
            const { mesure, temps } = placeDe(p.debut, 60 / tempo, Math.round(ctx.paramNombre("Temps par mesure", 4)), Math.round(ctx.paramNombre("Anacrouse", 0)));
            return `${en() ? "bar" : "mesure"} ${mesure}, ${en() ? "beat" : "temps"} ${temps} · ${en() ? "cost" : "coût"} ${p.cout.toFixed(2)} · ${noms(p.avant)} → ${noms(p.apres)}`;
          })]
        : [];
      const rapport = [bilan, "", ...parRegle, "", ...detail, ...parModele].join("\n");
      return { valeurs: [rapport], message: bilan };
    },
  }),
] as FicheAudio[]).map(avecDoc);
