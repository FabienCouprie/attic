// plugins/harmoniser-choral.ts — Harmoniser un soprano à quatre voix par des règles écrites.
//
// LE CALCUL EST DANS `audio/choral-harmoniser.ts`, qui assemble les candidats (`choral-candidats.ts`),
// l'énergie (`choral-energie.ts`) et la chaîne exacte (`choral-chaine.ts`) ; ce fichier lit les
// réglages, nomme les voix, et fait juger le résultat par le vérificateur pour le rapport.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence, type InfoVoix } from "../audio/sequence";
import { nomNote } from "../audio/nom-note";
import { hasardDuNoeud } from "../core";
import { PARAMETRE_TONIQUE } from "../audio/cles";
import { estRefusHarmonisation, harmoniserChoral } from "../audio/choral-harmoniser";
import { estRefusChoral, verifierChoral } from "../audio/choral-verifier";
import { NOMS_SATB } from "../audio/tessitures-satb";
import type { Mode } from "../audio/choral-regles";
import type { Septiemes } from "../audio/choral-candidats";

const en = () => langueCourante() === "en";

const SEPTIEMES = [
  { id: "aucune", nom: "Aucune", nomEn: "None" },
  { id: "dominante", nom: "Dominante", nomEn: "Dominant" },
  { id: "toutes", nom: "Toutes", nomEn: "All" },
];

export const fiches: FicheAudio[] = ([
  fiche({
    id: "harmoniser-choral",
    nom: "Harmoniser à quatre voix", nomEn: "Harmonize in Four Parts",
    univers: "Autres", famille: "Harmonisation",
    resume: "Écrit l'alto, le ténor et la basse sous un soprano, selon les règles de l'écriture à quatre voix.",
    resumeEn: "Writes the alto, tenor and bass under a soprano, following the rules of four-part writing.",
    notice: "Ce composant écrit l'alto, le ténor et la basse sous la mélodie reçue, qui devient le soprano d'un choral à quatre voix, selon les règles de l'écriture à quatre voix.\n\nLa mélodie arrive par l'entrée « Séquence » ; seule sa première voix est lue, et elle ressort telle qu'elle est reçue. Le choral se construit sur une grille, une colonne par pas où le soprano sonne. Pour chaque colonne, les accords proposés sont ceux de la tonalité qui contiennent la note du soprano, et les dispositions celles qui tiennent les règles d'une colonne seule : chaque voix dans l'étendue où tombent quatre-vingt-dix-huit centièmes des notes de Johann Sebastian Bach dans ses chorals, aucun croisement, soprano et alto, alto et ténor dans l'octave, ténor et basse dans la douzième, l'accord pourvu de sa fondamentale et de sa tierce. Une note du soprano qu'aucun accord de la tonalité ne contient reçoit une dominante secondaire ou un accord emprunté au mode parallèle.\n\nChaque colonne et chaque passage d'une colonne à la suivante ont un coût. Coûtent le plus les quintes et les octaves parallèles, les sauts de plus d'une octave et la seconde augmentée, la sensible doublée, la septième non résolue, et une fin qui n'est pas la tonique à l'état fondamental ; coûtent moins les quintes et octaves directes, les dépassements, les sauts difficiles, la quarte et sixte, les replis chromatiques ; chaque demi-ton parcouru par une voix coûte un peu. Chaque degré coûte l'opposé du logarithme de sa fréquence dans les chorals de Bach, la tonique et la dominante le moins, le septième degré le plus. La suite de colonnes de moindre coût se trouve exactement, par l'algorithme de Viterbi (1967), sur la chaîne que forment les colonnes, à la manière de Moray Allan et Christopher Williams, « Harmonising Chorales by Probabilistic Inference », NIPS 2004.\n\n« Gamme » et « Tonique » disent la tonalité. En mineur, la dominante et l'accord de septième sensible sont bâtis sur la sensible, et les autres accords sur le mineur naturel.\n\n« Pas » règle la grille : une colonne par noire, ou par croche. Une note du soprano plus courte qu'un pas passe sur l'accord du pas où elle tombe.\n\n« Septièmes » dit quels accords peuvent porter leur septième : aucun, la seule dominante, ou tous les degrés. Sous « Aucune », une note du soprano que seule la septième d'une dominante secondaire contient, comme le si bémol en la mineur, la reçoit quand même : une colonne n'est jamais laissée sans accord.\n\n« Renversements » permet à la basse de porter la tierce, la quinte ou la septième ; décochée, la basse porte toujours la fondamentale.\n\n« Température » règle le choix. À zéro, le choral est celui de moindre coût. Au-dessus, chaque choral possible est tiré avec une probabilité proportionnelle à l'exponentielle de l'opposé de son coût divisé par la température : à basse température les meilleurs dominent, à haute température tous se valent.\n\n« Graine » fixe le tirage quand la température est au-dessus de zéro ; à zéro, elle est sans effet.\n\nUn soupir du soprano fait taire les trois autres voix. Une note répétée d'une colonne à la suivante dans l'alto, le ténor ou la basse est tenue. Une note du soprano trop grave pour qu'un alto tienne sous elle fait refuser la mélodie, et le message la nomme avec son instant.\n\nLa sortie « Séquence » rend le choral, ses quatre voix nommées. La sortie « Rapport » donne le nombre de colonnes, le coût du choral, les accords choisis en chiffres romains, le nombre de replis chromatiques, et le jugement du choral selon les mêmes règles : ses erreurs et ses avis, chacun à sa mesure et à son temps.",
    noticeEn: "This component writes the alto, tenor and bass under the received melody, which becomes the soprano of a four-voice chorale, following the rules of four-part writing.\n\nThe melody arrives on the « Sequence » input; only its first voice is read, and it comes out as received. The chorale is built on a grid, one column per step where the soprano sounds. For each column, the chords offered are those of the key that contain the soprano note, and the voicings those that keep the rules of a single column: each voice within the range where ninety-eight hundredths of Johann Sebastian Bach's notes fall in his chorales, no crossing, soprano and alto, alto and tenor within an octave, tenor and bass within a twelfth, the chord provided with its root and its third. A soprano note that no chord of the key contains receives a secondary dominant or a chord borrowed from the parallel mode.\n\nEvery column and every passage from one column to the next has a cost. Costing most are parallel fifths and octaves, leaps of more than an octave and the augmented second, the doubled leading tone, the unresolved seventh, and an ending that is not the root-position tonic; costing less are direct fifths and octaves, overlaps, awkward leaps, the six-four chord, chromatic fallbacks; every semitone a voice travels costs a little. Every degree costs the negative logarithm of its frequency in Bach's chorales, the tonic and the dominant least, the seventh degree most. The cheapest succession of columns is found exactly, by the Viterbi algorithm (1967), on the chain the columns form, after Moray Allan and Christopher Williams, « Harmonising Chorales by Probabilistic Inference », NIPS 2004.\n\n« Scale » and « Tonic » give the key. In minor, the dominant and the leading-tone seventh chord are built on the leading tone, the other chords on the natural minor.\n\n« Step » sets the grid: one column per quarter note, or per eighth note. A soprano note shorter than a step passes over the chord of the step where it falls.\n\n« Sevenths » says which chords may carry their seventh: none, the dominant alone, or every degree. Under « None », a soprano note that only the seventh of a secondary dominant contains, such as B flat in A minor, still receives it: a column is never left without a chord.\n\n« Inversions » lets the bass carry the third, the fifth or the seventh; unchecked, the bass always carries the root.\n\n« Temperature » sets the choice. At zero, the chorale is the cheapest one. Above it, every possible chorale is drawn with a probability proportional to the exponential of minus its cost divided by the temperature: at low temperature the best dominate, at high temperature all are alike.\n\n« Seed » fixes the draw when the temperature is above zero; at zero, it has no effect.\n\nA soprano rest silences the other three voices. A note repeated from one column to the next in the alto, tenor or bass is held. A soprano note too low for an alto to sit under it makes the melody refused, and the message names it with its instant.\n\nThe « Sequence » output returns the chorale, its four voices named. The « Report » output gives the number of columns, the cost of the chorale, the chords chosen in roman numerals, the number of chromatic fallbacks, and the judgement of the chorale against the same rules: its errors and advisories, each at its bar and beat.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: true }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: ["majeur", "mineur"], optionsEn: ["major", "minor"], optionIds: ["majeur", "mineur"],
        defaut: "majeur", defautEn: "major",
        doc: "Le mode de la tonalité. En mineur, la dominante et l'accord de septième sensible prennent la sensible.",
        docEn: "The mode of the key. In minor, the dominant and the leading-tone seventh chord take the leading tone." },
      { ...PARAMETRE_TONIQUE,
        doc: "La tonique de la tonalité, d'où se lisent les degrés, la sensible et la cadence.",
        docEn: "The tonic of the key, from which the degrees, the leading tone and the cadence are read." },
      { nom: "Pas", nomEn: "Step", type: "choix",
        options: ["noire", "croche"], optionsEn: ["quarter note", "eighth note"], optionIds: ["noire", "croche"],
        defaut: "noire", defautEn: "quarter note",
        doc: "Une colonne par noire, ou par croche. Une note du soprano plus courte qu'un pas passe sur l'accord du pas où elle tombe.",
        docEn: "One column per quarter note, or per eighth note. A soprano note shorter than a step passes over the chord of the step where it falls." },
      { nom: "Septièmes", nomEn: "Sevenths", type: "choix",
        options: SEPTIEMES.map((s) => s.nom), optionsEn: SEPTIEMES.map((s) => s.nomEn), optionIds: SEPTIEMES.map((s) => s.id),
        defaut: "Dominante", defautEn: "Dominant",
        doc: "Les accords qui peuvent porter leur septième : aucun, la seule dominante, ou tous les degrés. Sous « Aucune », une note que seule la septième d'une dominante secondaire contient la reçoit quand même.",
        docEn: "The chords that may carry their seventh: none, the dominant alone, or every degree. Under « None », a note that only the seventh of a secondary dominant contains still receives it." },
      { nom: "Renversements", nomEn: "Inversions", type: "case", plage: [0, 1], pas: 1, defaut: 1,
        doc: "Cochée, la basse peut porter la tierce, la quinte ou la septième. Décochée, elle porte toujours la fondamentale.",
        docEn: "Checked, the bass may carry the third, the fifth or the seventh. Unchecked, it always carries the root." },
      { nom: "Température", nomEn: "Temperature", type: "curseur", plage: [0, 2], pas: 0.05, defaut: 0,
        doc: "À zéro, le choral de moindre coût. Au-dessus, chaque choral est tiré selon l'exponentielle de l'opposé de son coût divisé par la température.",
        docEn: "At zero, the cheapest chorale. Above it, every chorale is drawn according to the exponential of minus its cost divided by the temperature." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Fixe le tirage quand « Température » est au-dessus de zéro. À zéro, la graine est sans effet.",
        docEn: "Fixes the draw when « Temperature » is above zero. At zero, the seed has no effect." },
    ],
    async executer(ctx) {
      const recue = ctx.entree(0);
      if (!estSequence(recue) || recue.notes.length === 0) {
        return { valeurs: [null, null], erreur: true, message: en() ? "Connect a melody to the Sequence input." : "Branchez une mélodie sur l'entrée Séquence." };
      }
      const mode: Mode = ctx.paramTexte("Gamme", "majeur") === "mineur" ? "mineur" : "majeur";
      const tonique = Number(ctx.paramTexte("Tonique", "0")) || 0;
      const temperature = ctx.paramNombre("Température", 0);
      // LA GRAINE NE SE LIT QU'AU-DESSUS DE ZÉRO : lue à zéro, une graine nulle serait tirée au sort, et
      // le moteur, qui rend toute graine tirée (`ui/moteur/menage-apres-passe.ts`), l'afficherait au
      // message d'un choral qu'elle ne change pas.
      const graine = temperature > 0 ? hasardDuNoeud(ctx.paramNombre("Graine", 0)).graine : 0;
      const id = ctx.paramTexte("Septièmes", "dominante");
      const septiemes = (SEPTIEMES.some((s) => s.id === id) ? id : "dominante") as Septiemes;
      const tempo = recue.tempo && recue.tempo > 0 ? recue.tempo : 120;
      const r = await harmoniserChoral(recue, {
        tonique, mode, septiemes, temperature, graine,
        pas: ctx.paramTexte("Pas", "noire") === "croche" ? 0.5 : 1,
        renversements: (ctx.paramNombre("Renversements", 1) || 0) !== 0,
      });
      if (estRefusHarmonisation(r)) {
        const noms = r.sansDisposition.map((x) => `${nomNote(x.note)} (${(x.debut * tempo / 60 + 1).toFixed(1)})`);
        return { valeurs: [null, null], erreur: true, message: `${en() ? "soprano too low for any alto under it" : "soprano trop grave pour qu'un alto tienne sous lui"} : ${noms.join(", ")}` };
      }
      const voix: InfoVoix[] = NOMS_SATB.map((n, numero) => ({ numero, nom: en() ? n.en : n.fr }));
      const duree = Math.max(...r.notes.map((n) => n.fin));
      const sequence = { notes: r.notes, tempo, duree, voix, titre: recue.titre };
      const jugement = verifierChoral(sequence, { tonique, mode, tempo, tempsParMesure: 4 });
      const fautes = estRefusChoral(jugement) ? [] : jugement.infractions;
      const nErreurs = fautes.filter((f) => f.gravite === "erreur").length;
      const rapport = [
        `${r.colonnes} ${en() ? "columns" : "colonnes"} · ${en() ? "cost" : "coût"} ${r.energie.toFixed(2)} · ${r.replis} ${en() ? "chromatic fallbacks" : "replis chromatiques"}`,
        "",
        `${en() ? "chords" : "accords"} : ${r.accords.map((a) => a.accord.nom).join(" ")}`,
        "",
        `${en() ? "judgement" : "jugement"} : ${nErreurs} ${en() ? "errors" : "erreurs"} · ${fautes.length - nErreurs} ${en() ? "advisories" : "avis"}`,
        ...fautes.map((f) => `${en() ? "bar" : "mesure"} ${f.mesure}, ${en() ? "beat" : "temps"} ${f.temps} · ${en() ? f.en : f.fr}`),
      ].join("\n");
      const base = en()
        ? `${r.colonnes} columns · ${nErreurs} errors in the judgement`
        : `${r.colonnes} colonnes · ${nErreurs} erreurs au jugement`;
      return { valeurs: [sequence, rapport], message: temperature > 0 ? `${base} · ${en() ? "seed" : "graine"} ${graine}` : base };
    },
  }),
] as FicheAudio[]).map(avecDoc);
