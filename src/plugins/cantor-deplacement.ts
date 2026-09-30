// plugins/cantor-deplacement.ts — La poussière de Cantor qui déplace au lieu de retirer.
//
// LE CALCUL EST DANS `audio/cantor-deplacement.ts`, éprouvé, et l'en-tête de ce fichier-là dit
// pourquoi le compte est conservé. Celui-ci n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { deplacerSurCantor, type OuPoser } from "../audio/cantor-deplacement";
import { estSequence, type Sequence } from "../audio/sequence";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "cantor-deplacement", nom: "Déplacement de Cantor", nomEn: "Cantor Displacement",
    univers: "Traitement", famille: "Effets",
    resume: "Porte les événements tombés dans les trous d'une poussière de Cantor vers ce qui en reste, sans en perdre aucun.",
    resumeEn: "Carries the events that fell in the holes of a Cantor dust into what remains of it, losing none.",
    notice: `Déplace les événements d'une séquence selon une poussière de Cantor, en conservant leur nombre.

La construction de Cantor divise la durée en parts égales, en ôte une, puis recommence sur chaque part restante. Ce qui survit est la poussière ; le reste forme les trous. La poussière est auto-similaire : elle présente les mêmes grappes et les mêmes silences à toutes les échelles.

Un événement qui tombe dans la poussière n'est pas touché. Un événement qui tombe dans un trou est porté dans la poussière. Aucun n'est retiré : la séquence rendue compte exactement autant d'événements que celle reçue.

« Parts » et « Part ôtée » décrivent la construction. Trois parts dont on ôte le centre donnent l'ensemble classique, dont la poussière couvre les deux tiers de la durée à chaque niveau.

« Profondeur » donne le nombre de récursions. La poussière se réduit à chaque niveau, donc les événements se resserrent davantage. La récursion s'arrête d'elle-même avant de produire des segments plus courts qu'une milliseconde.

« Part déplacée » donne la proportion des événements des trous qui bougent effectivement. À zéro, la séquence ressort telle quelle. À cent pour cent, plus aucun événement ne reste dans un trou.

« Où poser » décide de l'arrivée. « Au plus proche » porte l'événement au point de poussière le plus proche, ce qui resserre la séquence sans en défaire la forme. « Au hasard » le tire dans la poussière, à densité uniforme sur sa longueur, ce qui la refait entièrement.

« Graine » fixe le tirage. Une même graine rend la même séquence.

La durée d'un événement le suit sans changer : la poussière décrit des instants d'attaque et non des enveloppes.

La sortie « Séquence » porte les événements déplacés, triés dans le temps. La sortie « Rapport » donne le compte reçu, combien tombaient dans un trou, combien ont bougé, leur déplacement moyen, et ce que la poussière couvre de la durée.

D'après Georg Cantor, « Über unendliche, lineare Punktmannigfaltigkeiten », Mathematische Annalen 21, 1883.`,
    noticeEn: `Displaces the events of a sequence according to a Cantor dust, keeping their number.

The Cantor construction divides the duration into equal parts, removes one, then starts again on each remaining part. What survives is the dust; the rest forms the holes. The dust is self-similar: it shows the same clusters and the same silences at every scale.

An event that falls in the dust is left alone. An event that falls in a hole is carried into the dust. None is removed: the sequence returned holds exactly as many events as the one received.

« Parts » and « Part removed » describe the construction. Three parts with the centre removed give the classical set, whose dust covers two thirds of the duration at each level.

« Depth » gives the number of recursions. The dust shrinks at each level, so the events cluster more tightly. The recursion stops by itself before producing segments shorter than a millisecond.

« Share displaced » gives the proportion of the events in the holes that actually move. At zero, the sequence comes out unchanged. At one hundred per cent, no event remains in a hole.

« Where to place » decides the arrival. « Nearest » carries the event to the closest point of dust, which tightens the sequence without undoing its shape. « At random » draws it within the dust, at uniform density over its length, which remakes the shape entirely.

« Seed » fixes the draw. The same seed returns the same sequence.

An event's duration follows it unchanged: the dust describes attack instants and not envelopes.

The « Sequence » output carries the displaced events, sorted in time. The « Report » output gives the count received, how many fell in a hole, how many moved, their average displacement, and what share of the duration the dust covers.

After Georg Cantor, « Über unendliche, lineare Punktmannigfaltigkeiten », Mathematische Annalen 21, 1883.`,
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Parts", nomEn: "Parts", type: "curseur", plage: [2, 9], pas: 1, defaut: 3,
        doc: "Le nombre de parts égales à chaque niveau. Trois donne l'ensemble classique.",
        docEn: "The number of equal parts at each level. Three gives the classical set." },
      { nom: "Part ôtée", nomEn: "Part removed", type: "choix",
        options: ["Centre", "Gauche", "Droite"], optionsEn: ["Centre", "Left", "Right"],
        optionIds: ["centre", "gauche", "droite"], defaut: "Centre", defautEn: "Centre",
        doc: "La part retirée à chaque niveau. Avec un nombre pair de parts, « Centre » ôte celle qui suit immédiatement le milieu.",
        docEn: "The part removed at each level. With an even number of parts, « Centre » removes the one just after the middle." },
      { nom: "Profondeur", nomEn: "Depth", type: "curseur", plage: [0, 8], pas: 1, defaut: 3,
        doc: "Le nombre de récursions. À zéro, la durée entière est poussière et rien ne bouge.",
        docEn: "The number of recursions. At zero, the whole duration is dust and nothing moves." },
      { nom: "Part déplacée", nomEn: "Share displaced", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La proportion des événements des trous qui bougent. À cent, plus aucun ne reste dans un trou.",
        docEn: "The proportion of the events in the holes that move. At one hundred, none remains in a hole." },
      { nom: "Où poser", nomEn: "Where to place", type: "choix",
        options: ["Au plus proche", "Au hasard"], optionsEn: ["Nearest", "At random"],
        optionIds: ["proche", "hasard"], defaut: "Au plus proche", defautEn: "Nearest",
        doc: "Au plus proche, la séquence se resserre sans se défaire. Au hasard, elle est refaite entièrement.",
        docEn: "Nearest tightens the sequence without undoing it. At random remakes it entirely." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Fixe le tirage. Une même graine rend la même séquence.",
        docEn: "Fixes the draw. The same seed returns the same sequence." },
    ],
    async executer(ctx: any) {
      const recue = ctx.entree(0);
      if (!estSequence(recue)) {
        return { valeurs: [null, ""], erreur: true,
          message: en() ? "No sequence at the input." : "Aucune séquence à l'entrée." };
      }
      const notes = recue.notes ?? [];
      const duree = Math.max(
        recue.duree ?? 0,
        notes.reduce((m: number, n: { fin: number }) => Math.max(m, n.fin), 0),
      );

      const { evenements, rapport } = deplacerSurCantor(notes, duree, {
        parts: Math.round(ctx.paramNombre("Parts", 3)),
        otee: ctx.paramTexte("Part ôtée", "centre") as "centre" | "gauche" | "droite",
        profondeur: Math.round(ctx.paramNombre("Profondeur", 3)),
        part: ctx.paramNombre("Part déplacée", 100) / 100,
        ou: ctx.paramTexte("Où poser", "proche") as OuPoser,
        graine: Math.round(ctx.paramNombre("Graine", 7)),
      });

      const sortie: Sequence = {
        ...recue,
        notes: evenements,
        // LA DURÉE NE SE RACCOURCIT PAS. Un déplacement peut vider la fin de la séquence, et la
        // rendre plus courte effacerait le silence que l'opération vient de créer.
        duree,
      };
      const lignes = [
        en() ? "CANTOR DISPLACEMENT" : "DÉPLACEMENT DE CANTOR",
        "",
        `  ${(en() ? "Events received" : "Événements reçus").padEnd(26)}${rapport.total}`,
        `  ${(en() ? "In the holes" : "Dans les trous").padEnd(26)}${rapport.dansLesTrous}`,
        `  ${(en() ? "Displaced" : "Déplacés").padEnd(26)}${rapport.deplaces}`,
        `  ${(en() ? "Average displacement" : "Déplacement moyen").padEnd(26)}${(rapport.ecartMoyen * 1000).toFixed(0)} ms`,
        `  ${(en() ? "Dust segments" : "Segments de poussière").padEnd(26)}${rapport.segments}`,
        `  ${(en() ? "Share of the duration" : "Part de la durée").padEnd(26)}${(rapport.partDeLaDuree * 100).toFixed(1)} %`,
        `  ${(en() ? "Events returned" : "Événements rendus").padEnd(26)}${evenements.length}`,
      ];

      return {
        valeurs: [sortie, lignes.join("\n")],
        message: `${rapport.deplaces} ${en() ? "displaced of" : "déplacés sur"} ${rapport.total} · `
          + `${en() ? "dust" : "poussière"} ${(rapport.partDeLaDuree * 100).toFixed(0)} % · `
          + `${(rapport.ecartMoyen * 1000).toFixed(0)} ms`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
