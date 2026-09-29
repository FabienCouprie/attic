// plugins/evolution.ts — Faire évoluer une mélodie vers ce qu'on lui demande.
//
// POURQUOI CE NŒUD EXISTE À CÔTÉ DU SOLVEUR. Le solveur cherche une suite qui satisfait TOUTES les
// règles, et quand il n'en existe aucune il le prouve et rend les mains vides. Devant cette réponse,
// on veut souvent la ligne la MOINS MAUVAISE plutôt qu'une démonstration d'impossibilité. Une
// population qui évolue ne connaît pas l'interdit, seulement le coût : elle rend toujours quelque
// chose, et dit ce que cela coûte.
//
// LE CALCUL EST DANS `audio/evolution.ts`, éprouvé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { PARAMETRE_CLE, demiTonDeCle } from "../audio/cles";
import { avecDoc } from "./notices";
import { estSequence, type Sequence } from "../audio/sequence";
import { domaineHauteurs } from "../audio/contraintes";
import {
  evoluer, objectifAmpleur, objectifProfil, objectifRessemblance, sautMoyen,
  type Objectif,
} from "../audio/evolution";
import { distanceEdition, profilPrimaire } from "../audio/morphologie";
import { GAMMES_CORRECTION, degresDe } from "../audio/correction-hauteur";
import { estCourbe, reechantillonner } from "../audio/courbe";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "evolution-melodie",
    nom: "Faire évoluer une mélodie", nomEn: "Evolve a Melody",
    univers: "Entrées", famille: "Génération",
    resume: "Fait évoluer une population de mélodies vers le geste d'une séquence reçue et l'ampleur voulue.",
    resumeEn: "Evolves a population of melodies toward a received sequence's gesture and the wanted span.",
    notice: "Fait évoluer une population de mélodies vers ce qu'on lui demande, et rend la meilleure. Le procédé est celui d'un algorithme génétique.\n\nÀ chaque génération, les mélodies les moins coûteuses sont tirées au sort par petits groupes pour devenir parents, deux parents donnent une mélodie qui prend le début de l'un et la fin de l'autre, et quelques notes changent au hasard. Les meilleures passent intactes à la génération suivante, faute de quoi ce qui a été trouvé pourrait se perdre.\n\nLe procédé ne démontre rien et ne rend pas le meilleur absolu : c'est ce qui le distingue d'une recherche exacte. Il rend en revanche toujours une mélodie, y compris là où aucune ne satisferait tout ce qu'on demande, et il dit ce qu'elle coûte.\n\n« Séquence » reçoit la mélodie dont le geste doit être repris, et lui seul : seuls les signes des mouvements sont comparés, de sorte qu'une transposition de cette mélodie a le même geste qu'elle. Sans elle, cet objectif ne pèse pas.\n\n« Courbe » reçoit une ligne que les hauteurs doivent suivre. Elle est lue à la place proportionnelle, la courbe ne connaissant pas le nombre de notes demandées.\n\n« Ampleur » vise un saut moyen, en demi-tons. À zéro, celui de la séquence reçue est repris. Viser une taille n'est pas la même chose que réduire les sauts : réduire a son optimum à plat, et ramène toute mélodie à une oscillation dès que les autres objectifs sont satisfaits.\n\n« Poids du geste », « Poids de la courbe » et « Poids de l'ampleur » décident de ce qui l'emporte quand les objectifs se contredisent.\n\n« Gamme » et « Tonique » restreignent les hauteurs, « Grave » et « Aigu » bornent l'étendue, et « Notes » fixe la longueur. Sans séquence reçue, la longueur vient de ce réglage.\n\n« Population », « Générations » et « Mutation » règlent la recherche. Une mutation forte explore et retient mal ; faible, elle s'installe vite dans ce qu'elle a trouvé.\n\n« Graine » fixe le tirage : la même graine rend la même mélodie.\n\nLa sortie « Séquence » porte la mélodie trouvée. La sortie « Analyse » donne son coût objectif par objectif, et la courbe de convergence, qui dit à quelle génération la recherche a cessé de progresser.\n\nLe message donne le coût atteint, le nombre de générations parcourues, et si la cible a été atteinte.",
    noticeEn: "Evolves a population of melodies toward what is asked of them, and returns the best. The procedure is that of a genetic algorithm.\n\nAt each generation, the least costly melodies are drawn at random in small groups to become parents, two parents give a melody that takes the beginning of one and the end of the other, and a few notes change at random. The best pass intact to the next generation, failing which what has been found could be lost.\n\nThe procedure proves nothing and does not return the absolute best: that is what distinguishes it from an exact search. It does always return a melody, including where none would satisfy everything asked, and it says what that melody costs.\n\n« Sequence » receives the melody whose gesture alone is to be taken up: only the signs of the movements are compared, so that a transposition of that melody has the same gesture as it. Without it, this objective does not weigh.\n\n« Curve » receives a line the pitches must follow. It is read at the proportional place, the curve not knowing the number of notes that will be asked of it.\n\n« Span » aims at a mean leap, in semitones. At zero, the received sequence's is taken up. Aiming at a size is not the same as reducing the leaps: reducing has its optimum flat, and brings any melody back to an oscillation as soon as the other objectives are satisfied.\n\n« Gesture weight », « Curve weight » and « Span weight » decide what prevails when the objectives contradict one another.\n\n« Scale » and « Tonic » restrict the pitches, « Low » and « High » bound the range, and « Notes » sets the length. Without a received sequence, the length comes from that setting.\n\n« Population », « Generations » and « Mutation » set the search. A strong mutation explores and retains poorly; a weak one settles quickly into what it has found.\n\n« Seed » fixes the draw: the same seed gives the same melody.\n\nThe « Sequence » output carries the melody found. The « Analysis » output gives its cost objective by objective, and the convergence curve, which says at which generation the search stopped progressing.\n\nThe message gives the cost reached, the number of generations run, and whether the target was reached.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: false },
      { nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false },
    ],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Notes", nomEn: "Notes", plage: [2, 64], pas: 1, defaut: 12,
        doc: "La longueur de la mélodie, quand aucune séquence reçue n'en décide.",
        docEn: "The length of the melody, when no received sequence decides it." },
      { nom: "Poids du geste", nomEn: "Gesture weight", plage: [0, 20], pas: 0.5, defaut: 10,
        doc: "Ce que pèse la ressemblance au geste de la séquence reçue. À zéro, elle n'est pas suivie.",
        docEn: "What the resemblance to the received sequence's gesture weighs. At zero, it is not followed." },
      { nom: "Poids de la courbe", nomEn: "Curve weight", plage: [0, 20], pas: 0.5, defaut: 1,
        doc: "Ce que pèse le suivi de la courbe reçue.",
        docEn: "What following the received curve weighs." },
      { nom: "Ampleur", nomEn: "Span", plage: [0, 12], pas: 0.5, defaut: 0,
        doc: "Le saut moyen visé. À zéro, celui de la séquence reçue est repris ; sans elle, l'objectif ne pèse pas.",
        docEn: "The mean leap aimed at. At zero, the received sequence's is taken up; without it, the objective does not weigh." },
      { nom: "Poids de l'ampleur", nomEn: "Span weight", plage: [0, 20], pas: 0.5, defaut: 1,
        doc: "Ce que pèse l'ampleur visée.",
        docEn: "What the aimed span weighs." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_CORRECTION.map((g) => g.fr), optionsEn: GAMMES_CORRECTION.map((g) => g.en),
        optionIds: GAMMES_CORRECTION.map((g) => g.id), defaut: "Majeure", defautEn: "Major",
        doc: "Les degrés auxquels les hauteurs sont restreintes.",
        docEn: "The degrees the pitches are restricted to." },
      { ...PARAMETRE_CLE, nom: "Tonique", nomEn: "Tonic",
        doc: "La tonique de la gamme.", docEn: "The tonic of the scale." },
      { nom: "Grave", nomEn: "Low", plage: [0, 127], pas: 1, defaut: 55,
        doc: "La hauteur la plus basse permise.", docEn: "The lowest pitch allowed." },
      { nom: "Aigu", nomEn: "High", plage: [0, 127], pas: 1, defaut: 79,
        doc: "La hauteur la plus haute permise.", docEn: "The highest pitch allowed." },
      { nom: "Population", nomEn: "Population", plage: [10, 500], pas: 10, defaut: 100,
        doc: "Combien de mélodies vivent à chaque génération.",
        docEn: "How many melodies live at each generation." },
      { nom: "Générations", nomEn: "Generations", plage: [10, 2000], pas: 10, defaut: 300,
        doc: "Combien de générations au plus.", docEn: "How many generations at most." },
      { nom: "Mutation", nomEn: "Mutation", plage: [0, 100], pas: 1, defaut: 12, unite: "%",
        doc: "La chance qu'une note change à chaque naissance. Forte, la recherche explore et retient mal.",
        docEn: "The chance a note changes at each birth. Strong, the search explores and retains poorly." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une note, chacune valant une noire.",
        docEn: "The length of a note, each being a quarter note." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 9999], pas: 1, defaut: 1,
        doc: "Fixe le tirage. La même graine rend la même mélodie.",
        docEn: "Fixes the draw. The same seed gives the same melody." },
    ],
    async executer(ctx: any) {
      const recu = ctx.entree(0);
      const modele = estSequence(recu) && recu.notes.length > 1
        ? [...recu.notes].sort((a, b) => a.debut - b.debut).map((n) => n.note)
        : null;
      const combien = modele ? modele.length : Math.round(ctx.paramNombre("Notes", 12));

      const domaine = domaineHauteurs(
        ctx.paramNombre("Grave", 55), ctx.paramNombre("Aigu", 79),
        degresDe(ctx.paramTexte("Gamme", "majeure"), demiTonDeCle(ctx.paramTexte("Tonique", "C")) ?? 0),
      );
      if (domaine.length === 0 || combien < 2) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No pitch available in this range." : "Aucune hauteur disponible dans cette étendue.",
        };
      }

      const objectifs: Objectif[] = [];
      const poidsGeste = ctx.paramNombre("Poids du geste", 10);
      if (modele && poidsGeste > 0) {
        objectifs.push(objectifRessemblance(modele, poidsGeste, {
          profil: (v) => profilPrimaire(v), distance: distanceEdition,
        }));
      }
      const courbe = ctx.entree(1);
      const poidsCourbe = ctx.paramNombre("Poids de la courbe", 1);
      if (estCourbe(courbe) && poidsCourbe > 0) {
        // La courbe donne une ligne dans l'étendue permise : ses valeurs, normalisées, y sont
        // étalées. Sans cela une courbe de zéro à un viserait les notes les plus graves du clavier.
        const points = Array.from(reechantillonner(courbe, combien));
        const bas = Math.min(...points), haut = Math.max(...points);
        const grave = domaine[0], aigu = domaine[domaine.length - 1];
        const vise = points.map((p) =>
          haut - bas < 1e-9 ? (grave + aigu) / 2 : grave + ((p - bas) / (haut - bas)) * (aigu - grave));
        objectifs.push(objectifProfil(vise, poidsCourbe));
      }
      const poidsAmpleur = ctx.paramNombre("Poids de l'ampleur", 1);
      const ampleurReglee = ctx.paramNombre("Ampleur", 0);
      const ampleur = ampleurReglee > 0 ? ampleurReglee : (modele ? sautMoyen(modele) : 0);
      if (poidsAmpleur > 0 && ampleur > 0) objectifs.push(objectifAmpleur(ampleur, poidsAmpleur));

      const ev = evoluer(new Array(combien).fill(domaine), objectifs, {
        population: Math.round(ctx.paramNombre("Population", 100)),
        generations: Math.round(ctx.paramNombre("Générations", 300)),
        mutation: ctx.paramNombre("Mutation", 12) / 100,
        graine: Math.round(ctx.paramNombre("Graine", 1)),
        cible: 0,
      });

      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = 60 / Math.max(1, tempo);
      const sequence: Sequence = {
        notes: ev.meilleur.map((h, i) => ({
          note: h, velocite: 90, debut: i * duree, fin: (i + 1) * duree,
        })),
        tempo, duree: combien * duree,
      };

      // LA COURBE DE CONVERGENCE EST RENDUE EN CLAIR, parce qu'elle dit ce que le seul coût final ne
      // dit pas : une recherche qui a cessé de progresser à la dixième génération sur trois cents
      // n'a pas besoin de plus de générations, mais d'autres poids ou d'une autre mutation.
      const jalons = ev.histoire.length <= 12
        ? ev.histoire
        : Array.from({ length: 12 }, (_, k) =>
          ev.histoire[Math.round((k * (ev.histoire.length - 1)) / 11)]);
      const derniereAmelioration = ev.histoire.reduce(
        (marque, c, i) => (i > 0 && c < ev.histoire[i - 1] ? i : marque), 0);
      const analyse = [
        `${combien} notes · ${ev.generations} ${en() ? "generations" : "générations"} · `
          + `${en() ? "cost" : "coût"} ${ev.cout.toFixed(4)}${ev.atteinte ? ` · ${en() ? "target reached" : "cible atteinte"}` : ""}`,
        "",
        ...ev.parObjectif.map((ob) => `  ${ob.nom} ${ob.cout.toFixed(4)}`),
        "",
        `${en() ? "melody" : "mélodie"}  ${ev.meilleur.map((n) => nomNote(n)).join(" ")}`,
        `${en() ? "mean leap" : "saut moyen"}  ${sautMoyen(ev.meilleur).toFixed(2)}`
          + (ampleur > 0 ? ` (${en() ? "aimed" : "visé"} ${ampleur.toFixed(2)})` : ""),
        "",
        `${en() ? "convergence" : "convergence"} : ${jalons.map((x) => x.toFixed(2)).join(" → ")}`,
        `${en() ? "last improvement at generation" : "dernière amélioration à la génération"} ${derniereAmelioration}`,
      ].join("\n");

      return {
        valeurs: [sequence, analyse],
        message: `${en() ? "cost" : "coût"} ${ev.cout.toFixed(3)} · ${ev.generations} ${en() ? "generations" : "générations"}`
          + ` · ${objectifs.length} ${en() ? "objectives" : "objectifs"}`
          + (ev.atteinte ? ` · ${en() ? "target reached" : "cible atteinte"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
