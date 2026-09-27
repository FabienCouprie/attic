// plugins/formule-sequence.ts — Une règle écrite, appliquée à chaque note.
//
// CE QUE CE NŒUD EST, ET CE QU'IL N'EST PAS : voir `audio/formule-sequence.ts`. En deux mots, il
// donne l'usage courant des fonctions d'ordre supérieur, appliquer une même règle à chaque élément
// d'une suite et n'en garder qu'une partie, sans en donner la forme générale : la fonction est
// écrite et non câblée.
//
// LE CALCUL EST DANS `audio/formule-sequence.ts`, éprouvé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type Sequence } from "../audio/sequence";
import { appliquerFormules, CHAMPS, type ChampFormule } from "../audio/formule-sequence";
import { poserArbre } from "../audio/voix";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "formule-sequence",
    nom: "Formule sur séquence", nomEn: "Formula on Sequence",
    univers: "Traitement", famille: "Conversion",
    resume: "Applique une règle écrite à chaque note, et ne garde que celles qui répondent à une condition.",
    resumeEn: "Applies a written rule to each note, and keeps only those meeting a condition.",
    notice: "Applique une règle écrite à chaque note de la séquence reçue, et rend la séquence obtenue.\n\nUne formule par champ réécrit ce champ, note par note. « Hauteur » est en demi-tons et accepte les fractions, « Début » et « Durée » sont en secondes, « Nuance » va de zéro à cent vingt-sept et y est ramenée. Un champ laissé vide n'est pas touché.\n\nLes variables lisibles sont « note », « debut », « fin », « duree », « velocite », « canal », « voix », « i » le rang de la note à partir de zéro, « n » leur nombre, « t » la place dans la pièce de zéro à un, et « total » la durée de la pièce. Les noms anglais « pitch », « onset », « offset », « length », « velocity », « channel » et « voice » sont acceptés aussi, les deux jeux étant toujours disponibles. Les fonctions usuelles sont disponibles : sin, cos, abs, round, floor, min, max, mod, random, pow, sqrt, log.\n\nToutes les formules lisent la note d'origine et non le résultat des précédentes. Sans cette règle, l'ordre des champs déciderait du résultat dès que l'une lit l'autre, et rien à l'écran ne dirait dans quel ordre elles sont prises.\n\n« Condition » écarte les notes qui n'y répondent pas. Elle est éprouvée sur la note reçue, avant les formules.\n\n« Trier » remet les notes dans l'ordre des départs, qu'une formule sur le début a pu défaire.\n\nUne formule illisible ou qui ne rend pas un nombre laisse la note telle quelle, et le message le dit une fois par formule et non une fois par note.\n\nLa sortie « Séquence » porte les notes obtenues. La sortie « Analyse » liste les premières notes avant et après, et les erreurs rencontrées.\n\nLe message donne le nombre de notes gardées, le nombre d'écartées et les erreurs.",
    noticeEn: "Applies a written rule to each note of the received sequence, and returns the sequence obtained.\n\nOne formula per field rewrites that field, note by note. « Pitch » is in semitones and accepts fractions, « Onset » and « Length » are in seconds, « Velocity » runs from zero to one hundred and twenty-seven and is brought back into it. A field left empty is not touched.\n\nThe readable variables are « pitch », « onset », « end », « length », « velocity », « channel », « voice », « i » the rank of the note from zero, « n » their count, « t » the place in the piece from zero to one, and « total » the length of the piece. Their French names are accepted as well, both sets being always available; the French notice lists them. The usual functions are available: sin, cos, abs, round, floor, min, max, mod, random, pow, sqrt, log.\n\nEvery formula reads the original note and not the result of the previous ones. Without that rule, the order of the fields would decide the result as soon as one reads another, and nothing on screen would say in which order they are taken.\n\n« Condition » sets aside the notes that do not meet it. It is tested on the received note, before the formulas.\n\n« Sort » puts the notes back in order of onset, which a formula on the onset may have undone.\n\nA formula that cannot be read or does not return a number leaves the note as it is, and the message says so once per formula and not once per note.\n\nThe « Sequence » output carries the notes obtained. The « Analysis » output lists the first notes before and after, and the errors met.\n\nThe message gives the number of notes kept, the number set aside and the errors.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Hauteur", nomEn: "Pitch", type: "texte", defaut: "", defautEn: "",
        doc: "La formule qui réécrit la hauteur, en demi-tons, fractions comprises. Vide, elle n'est pas touchée.",
        docEn: "The formula that rewrites the pitch, in semitones, fractions included. Empty, it is not touched." },
      { nom: "Début", nomEn: "Onset", type: "texte", defaut: "", defautEn: "",
        doc: "La formule qui réécrit l'instant de départ, en secondes. La durée ne change pas.",
        docEn: "The formula that rewrites the start instant, in seconds. The length does not change." },
      { nom: "Durée", nomEn: "Length", type: "texte", defaut: "", defautEn: "",
        doc: "La formule qui réécrit la durée, en secondes. Le début ne change pas.",
        docEn: "The formula that rewrites the length, in seconds. The onset does not change." },
      { nom: "Nuance", nomEn: "Velocity", type: "texte", defaut: "", defautEn: "",
        doc: "La formule qui réécrit la nuance, ramenée entre zéro et cent vingt-sept.",
        docEn: "The formula that rewrites the velocity, brought back between zero and one hundred and twenty-seven." },
      { nom: "Condition", nomEn: "Condition", type: "texte", defaut: "", defautEn: "",
        doc: "La note n'est gardée que si cette expression est vraie. Éprouvée sur la note reçue, avant les formules.",
        docEn: "The note is kept only if this expression is true. Tested on the received note, before the formulas." },
      { nom: "Trier", nomEn: "Sort", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Remet les notes dans l'ordre des départs, qu'une formule sur le début a pu défaire.",
        docEn: "Puts the notes back in order of onset, which a formula on the onset may have undone." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }

      const nomsDeChamp: Record<ChampFormule, string> = {
        note: "Hauteur", debut: "Début", duree: "Durée", velocite: "Nuance",
      };
      const formules: Partial<Record<ChampFormule, string>> = {};
      for (const champ of CHAMPS) formules[champ] = ctx.paramTexte(nomsDeChamp[champ], "");

      const r = appliquerFormules(entree.notes, {
        formules,
        condition: ctx.paramTexte("Condition", ""),
        trier: ctx.paramTexte("Trier", "oui") !== "non",
      });

      // L'ÉCRITURE MESURÉE NE SUIT QUE SI ELLE DÉCRIT ENCORE LES NOTES. Une formule sur le début ou
      // la durée la rend caduque, et `poserArbre` l'écarte de lui-même plutôt que de la promettre.
      const sortie: Sequence = poserArbre(
        { notes: r.notes, tempo: entree.tempo, duree: entree.duree, voix: entree.voix },
        entree.arbre,
      );

      const apercu = (notes: readonly typeof r.notes[number][]) => notes.slice(0, 6)
        .map((x) => `${nomNote(x.note)} ${x.debut.toFixed(2)}s ${(x.fin - x.debut).toFixed(2)}s v${Math.round(x.velocite)}`)
        .join("\n  ");
      const analyse = [
        `${entree.notes.length} ${en() ? "notes in" : "notes reçues"} · ${r.notes.length} ${en() ? "kept" : "gardées"}`
          + (r.ecartees > 0 ? ` · ${r.ecartees} ${en() ? "set aside" : "écartées"}` : "")
          + ` · ${dureeSequence(sortie).toFixed(2)} s`,
        "",
        `${en() ? "before" : "avant"} :`,
        `  ${apercu(entree.notes)}`,
        "",
        `${en() ? "after" : "après"} :`,
        `  ${apercu(r.notes)}`,
        ...(r.erreurs.length > 0
          ? ["", `${en() ? "errors" : "erreurs"} :`, ...r.erreurs.map((e) => `  ${e}`)]
          : []),
      ].join("\n");

      return {
        valeurs: [sortie, analyse],
        message: `${r.notes.length} notes`
          + (r.ecartees > 0 ? ` · ${r.ecartees} ${en() ? "set aside" : "écartées"}` : "")
          + (r.erreurs.length > 0
            ? ` · ${r.erreurs.length} ${en() ? "errors" : "erreurs"} : ${r.erreurs[0]}`
            : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
