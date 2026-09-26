// plugins/quantification.ts — Des durées jouées vers un rythme écrit.
//
// UN SEUL NŒUD, ET NON DEUX. Le couple constructeur/consommateur de l'arbre rythmique existe pour
// qu'on retouche les hauteurs tirées entre les deux ; ici il n'y a rien à retoucher entre le calcul
// et son résultat, la séquence entrant déjà avec ses hauteurs. La sortie « Arbre » suffit à rendre
// la main : elle se relit par le consommateur d'arbre, ce qui rouvre la chaîne d'édition sans
// dupliquer le calcul.
//
// CE QUE LE NŒUD EXPOSE, ET POURQUOI. Les nombres du compromis sont des réglages et non des
// constantes cachées : la littérature dit ce qu'il faut peser, jamais combien. Voir
// `QUANTIFICATION-RYTHMIQUE.md` pour l'état de l'art et `src/audio/quantification.ts` pour le calcul.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { derouler, dureeArbre, ecrireArbre } from "../audio/arbre-rythmique";
import { quantifier } from "../audio/quantification";
import { dureeSequence, estSequence, type Sequence } from "../audio/sequence";
import { poserArbre } from "../audio/voix";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

const METRIQUES = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8"];
const DIVISIONS_DEFAUT = "2 3 4 5 6 7";
/** Combien d'écritures sont classées, donc parmi combien « Solution » choisit. */
const COMBIEN = 5;

function lireMetrique(texte: string): [number, number] {
  const m = /^(\d+)\/(\d+)$/.exec(texte.trim());
  return m ? [Number(m[1]), Number(m[2])] : [4, 4];
}

export const fiches: FicheAudio[] = ([
  {
    id: "quantifier-rythme",
    nom: "Quantifier", nomEn: "Quantize",
    univers: "Traitement", famille: "Conversion",
    resume: "Écrit en rythme mesuré une séquence dont les durées sont quelconques.",
    resumeEn: "Writes a sequence of arbitrary durations as a measured rhythm.",
    notice: "Écrit en rythme mesuré une séquence dont les durées sont quelconques, et rend l'arbre obtenu, la séquence réécrite sur ce rythme, et les écritures examinées.\n\nUne suite de durées jouées n'a pas une seule écriture juste. Une note tombée un centième de seconde après la croche s'écrit sur la croche, ce qui est simple et faux d'un centième, ou sur un triolet de doubles, ce qui est exact et long à lire. Les écritures possibles sont donc classées selon deux nombres, l'écart aux instants joués et la complexité de la notation, et « Compromis » décide du poids de chacun.\n\n« Métrique » fixe la mesure dans laquelle le résultat est écrit.\n\n« Tempo » fixe la durée d'une noire. Quand la séquence reçue porte un tempo, c'est celui-là qui sert, et le message le dit.\n\n« Compromis » va de la fidélité à la lisibilité. À zéro, les instants joués sont suivis au plus près et la notation se complique. À cent, la notation reste simple et les instants sont déplacés.\n\n« Profondeur » est le nombre d'étages de division permis sous le premier découpage de la mesure. À un étage, la mesure se divise en temps et les temps ne se divisent pas. Chaque étage ajouté affine la grille atteignable et multiplie le nombre d'écritures examinées.\n\n« Divisions » énumère les nombres de parts autorisés, séparés par des espaces. La liste 2 3 4 admet le binaire, le triolet et la division en quatre ; en l'absence de 5 et de 7, aucun quintolet ni septolet n'apparaît.\n\n« Seuil de silence » est la part de l'intervalle entre deux attaques qu'un vide doit occuper pour s'écrire en silence. Une noire jouée aux quatre cinquièmes de sa valeur est détachée et reste une noire ; jouée à la moitié, elle devient une croche suivie d'un soupir. À cent pour cent, aucun vide ne devient un silence.\n\n« Solution » désigne l'écriture rendue parmi celles qui sont classées. Zéro est la mieux classée. Les solutions se distinguent par le découpage du premier étage de la mesure.\n\nLa sortie « Arbre » rend la notation en listes de l'écriture retenue. La sortie « Séquence » porte les hauteurs reçues, placées sur le rythme écrit. La sortie « Analyse » liste les écritures classées avec leur écart, leur complexité et leur coût, puis les événements de celle qui est retenue.\n\nLe message donne le nombre de mesures, l'écart moyen par attaque, le nombre de notes reçues et le nombre d'attaques écrites. Quand ces deux derniers diffèrent, la profondeur permise n'a pas suffi à séparer deux attaques trop proches, et l'écart chiffre ce qui a été perdu.",
    noticeEn: "Writes a sequence of arbitrary durations as a measured rhythm, and returns the tree obtained, the sequence rewritten on that rhythm, and the writings examined.\n\nA series of played durations has no single correct writing. A note falling a hundredth of a second after the eighth note is written on the eighth note, which is simple and wrong by a hundredth, or on a triplet of sixteenths, which is exact and slow to read. The possible writings are therefore ranked by two numbers, the gap to the played instants and the complexity of the notation, and « Trade-off » decides the weight of each.\n\n« Time signature » sets the measure the result is written in.\n\n« Tempo » sets the length of a quarter note. When the received sequence carries a tempo, that one serves, and the message states it.\n\n« Trade-off » runs from fidelity to readability. At zero, the played instants are followed as closely as possible and the notation grows complicated. At one hundred, the notation stays simple and the instants are moved.\n\n« Depth » is the number of division levels allowed below the first split of the measure. At one level, the measure divides into beats and the beats do not divide. Each added level refines the grid that can be reached and multiplies the number of writings examined.\n\n« Divisions » lists the numbers of parts allowed, separated by spaces. The list 2 3 4 admits binary, triplet and division in four; without 5 and 7, no quintuplet or septuplet appears.\n\n« Rest threshold » is the share of the interval between two onsets that a gap must occupy to be written as a rest. A quarter note played at four fifths of its value is detached and stays a quarter note; played at half, it becomes an eighth note followed by an eighth rest. At one hundred percent, no gap becomes a rest.\n\n« Solution » designates the writing returned among those ranked. Zero is the best ranked. The solutions differ by the split of the first level of the measure.\n\nThe « Tree » output returns the list notation of the writing retained. The « Sequence » output carries the received pitches, placed on the written rhythm. The « Analysis » output lists the ranked writings with their gap, their complexity and their cost, then the events of the one retained.\n\nThe message gives the number of measures, the mean gap per onset, the number of notes received and the number of onsets written. When the last two differ, the allowed depth was not enough to separate two onsets too close together, and the gap quantifies what was lost.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
    ],
    sorties: [
      { nom: "Arbre", nomEn: "Tree", type: "texte" },
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Métrique", nomEn: "Time signature", type: "choix",
        options: METRIQUES, optionsEn: METRIQUES, optionIds: METRIQUES, defaut: "4/4", defautEn: "4/4",
        doc: "La mesure dans laquelle le résultat est écrit.",
        docEn: "The measure the result is written in." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une noire. Le tempo porté par la séquence reçue passe devant.",
        docEn: "The length of a quarter note. A tempo carried by the received sequence takes precedence." },
      { nom: "Compromis", nomEn: "Trade-off", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La part donnée à la lisibilité contre la fidélité. À zéro, l'écriture est exacte et chargée ; à cent, simple et approchée.",
        docEn: "The share given to readability against fidelity. At zero the writing is exact and busy; at one hundred, simple and approximate." },
      { nom: "Profondeur", nomEn: "Depth", plage: [1, 3], pas: 1, defaut: 2,
        doc: "Les étages de division permis sous le premier découpage de la mesure.",
        docEn: "The division levels allowed below the first split of the measure." },
      { nom: "Divisions", nomEn: "Divisions", type: "texte",
        defaut: DIVISIONS_DEFAUT, defautEn: DIVISIONS_DEFAUT,
        doc: "Les nombres de parts autorisés, séparés par des espaces.",
        docEn: "The numbers of parts allowed, separated by spaces." },
      { nom: "Seuil de silence", nomEn: "Rest threshold", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La part de l'intervalle entre deux attaques qu'un vide doit occuper pour s'écrire en silence plutôt qu'en détaché.",
        docEn: "The share of the interval between two onsets that a gap must occupy to be written as a rest rather than as detachment." },
      { nom: "Solution", nomEn: "Solution", plage: [0, COMBIEN - 1], pas: 1, defaut: 0,
        doc: "L'écriture rendue parmi celles qui sont classées. Zéro est la mieux classée.",
        docEn: "The writing returned among those ranked. Zero is the best ranked." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return {
          valeurs: [null, null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }

      // LE TEMPO DE LA SÉQUENCE PASSE DEVANT LE RÉGLAGE, ET LE MESSAGE LE DIT. Deux sources qui se
      // recouvrent sans que rien à l'écran ne dise laquelle a servi, c'est la confusion qui a coûté
      // deux écoutes ailleurs.
      const porte = typeof entree.tempo === "number" && entree.tempo > 0;
      const tempo = porte ? entree.tempo : ctx.paramNombre("Tempo", 120);
      const provenance = porte
        ? (en() ? "sequence tempo" : "tempo de la séquence")
        : (en() ? "tempo setting" : "réglage de tempo");

      const divisions = ctx.paramTexte("Divisions", DIVISIONS_DEFAUT).split(/[\s,;]+/)
        .map(Number).filter((n: number) => Number.isFinite(n) && n >= 2 && n <= 16);
      const metrique = lireMetrique(ctx.paramTexte("Métrique", "4/4"));
      const solutions = quantifier(entree.notes, {
        metrique, tempo,
        // LA DURÉE DÉCLARÉE PAR LA SÉQUENCE FAIT LOI. Une séquence qui se termine par un silence
        // dure plus longtemps que sa dernière note, et ce silence s'écrit.
        duree: dureeSequence(entree),
        compromis: ctx.paramNombre("Compromis", 50) / 100,
        profondeur: Math.round(ctx.paramNombre("Profondeur", 2)),
        divisions: divisions.length > 0 ? divisions : undefined,
        seuilSilence: ctx.paramNombre("Seuil de silence", 50) / 100,
        combien: COMBIEN,
      });
      if (solutions.length === 0) {
        return {
          valeurs: [null, null, null], erreur: true,
          message: en() ? "No writing found." : "Aucune écriture trouvée.",
        };
      }

      const rang = Math.min(solutions.length - 1,
        Math.max(0, Math.round(ctx.paramNombre("Solution", 0))));
      const retenue = solutions[rang];
      const arbre = ecrireArbre(retenue.mesures);

      // LES HAUTEURS REÇUES SONT REPORTÉES DANS L'ORDRE sur les attaques écrites. Elles sont lues en
      // boucle au cas où la profondeur permise aurait fondu deux attaques trop proches en une, ce
      // que le message chiffre.
      const evenements = derouler(retenue.mesures, tempo);
      const notes: Sequence["notes"] = [];
      const lignes: string[] = [];
      let rangNote = 0;
      for (const e of evenements) {
        if (e.silence) {
          lignes.push(`${e.debut.toFixed(3)}  ${e.duree.toFixed(3)}  ${en() ? "rest" : "silence"}`);
          continue;
        }
        const source = entree.notes[rangNote % entree.notes.length];
        rangNote++;
        notes.push({
          note: source.note, velocite: source.velocite,
          debut: e.debut, fin: e.debut + e.duree,
        });
        const division = e.nolet > 0 ? `  ${en() ? "tuplet" : "n-olet"} ${e.nolet}` : "";
        lignes.push(`${e.debut.toFixed(3)}  ${e.duree.toFixed(3)}  ${nomNote(source.note)}${division}`);
      }

      const duree = dureeArbre(retenue.mesures, tempo);
      // LA SÉQUENCE REND L'ÉCRITURE QUI VIENT D'ÊTRE TROUVÉE, et non seulement ses secondes : c'est
      // tout le produit de ce nœud, et le laisser sur le seul port de texte obligeait à tirer deux
      // câbles jusqu'à la gravure et à les garder en phase à la main.
      const sequence: Sequence = poserArbre({ notes, tempo, duree }, arbre);
      const classement = solutions.map((s, i) => {
        const marque = i === rang ? ">" : " ";
        const chiffres = `${en() ? "gap" : "écart"} ${(s.distance * 1000).toFixed(1)} ms · `
          + `${en() ? "complexity" : "complexité"} ${s.complexite.toFixed(2)} · `
          + `${en() ? "cost" : "coût"} ${s.cout.toFixed(2)}`;
        return `${marque} ${i}  ${ecrireArbre(s.mesures)}\n     ${chiffres}`;
      });
      const entete = `${retenue.mesures.length} ${en() ? "measures" : "mesures"} · `
        + `${metrique[0]}/${metrique[1]} · ${tempo} BPM · ${provenance}`;

      return {
        valeurs: [arbre, sequence, [entete, "", ...classement, "", ...lignes].join("\n")],
        message: `${retenue.mesures.length} ${en() ? "measures" : "mesures"} · `
          + `${en() ? "gap" : "écart"} ${(retenue.distance * 1000).toFixed(1)} ms · `
          + `${entree.notes.length} ${en() ? "notes in" : "notes reçues"}, `
          + `${notes.length} ${en() ? "onsets written" : "attaques écrites"} · ${provenance}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
