// plugins/melodie-sur-accords.ts — Une mélodie sur une suite d'accords, sous contraintes.
//
// LE CALCUL EST DANS `audio/melodie-sur-accords.ts`, éprouvé, et l'en-tête de ce fichier-là dit
// pourquoi le raccord est fait de trois pièces qui existaient déjà. Celui-ci n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { melodieSurAccords, type OptionsMelodie } from "../audio/melodie-sur-accords";
import { accordsDeSequence, nomDeLaccord } from "../audio/reconnaitre-accord";
import { gammeDeQualite } from "../audio/accord-gamme";
import { gammeDe } from "../audio/gammes";
import { estSequence, type Sequence } from "../audio/sequence";
import { nomNote } from "../audio/nom-note";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "melodie-sur-accords", nom: "Mélodie sur accords", nomEn: "Melody over Chords",
    univers: "Traitement", famille: "Effets",
    resume: "Cherche une mélodie sur une suite d'accords reçue, sous des contraintes qu'on pose une par une.",
    resumeEn: "Searches for a melody over a received chord progression, under constraints set one at a time.",
    notice: `Écrit une mélodie sur les accords reçus, en cherchant une ligne qui satisfait les règles posées.

Chaque groupe de notes qui commencent ensemble est lu comme un accord, et sa qualité est nommée parmi celles de la nomenclature. La qualité désigne une gamme, et cette gamme donne les notes disponibles : la mélodie n'en emploie pas d'autres. Un groupe de moins de trois hauteurs distinctes ne nomme aucun accord ; la gamme majeure s'applique alors, ce qui permet de traverser la mesure au lieu d'échouer dessus.

« Notes par accord » divise la durée de chaque accord en autant de places. La première place de chaque accord est un appui.

« Notes de l'accord sur les appuis » restreint les appuis aux sons de l'accord, les autres places recevant toute la gamme. C'est la règle du contrepoint et de la basse chiffrée : note de l'accord sur le temps fort, note de passage entre. Un appui se joue à 96 de nuance, un passage à 72.

« Note la plus grave » et « Note la plus aiguë » bornent le registre.

« Écart maximal » borne l'intervalle entre deux notes voisines, en demi-tons. À zéro, aucun écart n'est interdit.

« Répétition maximale » borne le nombre de fois qu'une même hauteur se répète de suite. À zéro, aucune borne.

« Sommet unique » exige que la note la plus aiguë ne paraisse qu'une fois.

« Saut compensé » exige un mouvement contraire après un intervalle plus grand que la borne donnée. À zéro, aucune compensation n'est exigée.

« Même sens au plus » borne le nombre de pas consécutifs dans la même direction. À zéro, aucune borne.

« Graine » fixe l'ordre dans lequel les hauteurs sont essayées : deux graines donnent deux lignes également valides. « Budget » borne le nombre d'affectations essayées avant de renoncer.

La recherche procède par retour sur trace : elle pose les notes de gauche à droite, éprouve les règles à chaque pas, et rebrousse chemin dès qu'un début est déjà fautif.

La sortie « Mélodie » porte la ligne trouvée. La sortie « Rapport » donne les accords reconnus avec leur gamme, la ligne écrite en noms de notes, le nombre d'affectations essayées, et le nom de la règle qui a fait rebrousser chemin le plus souvent.

Quand aucune ligne ne satisfait toutes les règles, la sortie « Mélodie » est vide et le rapport nomme cette règle ainsi que la place la plus lointaine atteinte : c'est ce qui permet de savoir laquelle relâcher.`,
    noticeEn: `Writes a melody over the received chords, searching for a line that satisfies the rules set.

Each group of notes starting together is read as a chord, and its quality named among those of the nomenclature. The quality designates a scale, and that scale gives the available notes: the melody uses no others. A group of fewer than three distinct pitches names no chord; the major scale then applies, which lets the search cross the bar instead of failing on it.

« Notes per chord » divides each chord's duration into that many positions. The first position of each chord is a strong beat.

« Chord tones on strong beats » restricts the strong beats to the sounds of the chord, the other positions receiving the whole scale. This is the rule of counterpoint and figured bass: chord tone on the strong beat, passing note between. A strong beat plays at 96 dynamic, a passing note at 72.

« Lowest note » and « Highest note » bound the register.

« Largest interval » bounds the interval between two neighbouring notes, in semitones. At zero, no interval is forbidden.

« Longest repetition » bounds how many times one pitch repeats in a row. At zero, no bound.

« Single peak » requires that the highest note appear only once.

« Leap answered » requires contrary motion after an interval larger than the bound given. At zero, no answer is required.

« Same direction at most » bounds the number of consecutive steps in the same direction. At zero, no bound.

« Seed » fixes the order in which pitches are tried: two seeds give two equally valid lines. « Budget » bounds the number of assignments tried before giving up.

The search proceeds by backtracking: it lays the notes left to right, tests the rules at each step, and turns back as soon as a beginning is already at fault.

The « Melody » output carries the line found. The « Report » output gives the chords recognised with their scale, the line written in note names, the number of assignments tried, and the name of the rule that most often forced a turn back.

When no line satisfies every rule, the « Melody » output is empty and the report names that rule as well as the furthest position reached: that is what tells which one to loosen.`,
    entrees: [{ nom: "Accords", nomEn: "Chords", type: "sequence" }],
    sorties: [
      { nom: "Mélodie", nomEn: "Melody", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Notes par accord", nomEn: "Notes per chord", type: "curseur", plage: [1, 16], pas: 1, defaut: 4,
        doc: "Divise la durée de chaque accord en autant de places. Une seule ne laisse que des appuis.",
        docEn: "Divides each chord's duration into that many positions. One leaves only strong beats." },
      { nom: "Notes de l'accord sur les appuis", nomEn: "Chord tones on strong beats", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Restreint la première place de chaque accord aux sons de l'accord. Les autres places reçoivent toute la gamme.",
        docEn: "Restricts the first position of each chord to the sounds of the chord. The other positions receive the whole scale." },
      { nom: "Note la plus grave", nomEn: "Lowest note", type: "curseur", plage: [21, 108], pas: 1, defaut: 60,
        doc: "La borne basse du registre, en note MIDI.", docEn: "The lower bound of the register, as a MIDI note." },
      { nom: "Note la plus aiguë", nomEn: "Highest note", type: "curseur", plage: [21, 108], pas: 1, defaut: 84,
        doc: "La borne haute du registre, en note MIDI.", docEn: "The upper bound of the register, as a MIDI note." },
      { nom: "Écart maximal", nomEn: "Largest interval", type: "curseur", plage: [0, 24], pas: 1, defaut: 7, unite: "demi-tons", uniteEn: "semitones",
        doc: "L'intervalle le plus grand permis entre deux notes voisines. À zéro, aucun écart n'est interdit.",
        docEn: "The largest interval allowed between two neighbouring notes. At zero, no interval is forbidden." },
      { nom: "Répétition maximale", nomEn: "Longest repetition", type: "curseur", plage: [0, 8], pas: 1, defaut: 1,
        doc: "Combien de fois au plus une même hauteur se répète de suite. À zéro, aucune borne.",
        docEn: "How many times at most one pitch repeats in a row. At zero, no bound." },
      { nom: "Sommet unique", nomEn: "Single peak", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Exige que la note la plus aiguë ne paraisse qu'une fois.",
        docEn: "Requires that the highest note appear only once." },
      { nom: "Saut compensé", nomEn: "Leap answered", type: "curseur", plage: [0, 12], pas: 1, defaut: 4, unite: "demi-tons", uniteEn: "semitones",
        doc: "Au-delà de cet intervalle, la note suivante doit aller dans l'autre sens. À zéro, rien n'est exigé.",
        docEn: "Beyond this interval, the next note must go the other way. At zero, nothing is required." },
      { nom: "Même sens au plus", nomEn: "Same direction at most", type: "curseur", plage: [0, 12], pas: 1, defaut: 4,
        doc: "Le nombre de pas consécutifs permis dans la même direction. À zéro, aucune borne.",
        docEn: "The number of consecutive steps allowed in the same direction. At zero, no bound." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Fixe l'ordre dans lequel les hauteurs sont essayées. Deux graines donnent deux lignes également valides.",
        docEn: "Fixes the order in which pitches are tried. Two seeds give two equally valid lines." },
      { nom: "Budget", nomEn: "Budget", type: "curseur", plage: [1000, 2000000], pas: 1000, defaut: 200000,
        doc: "Le nombre d'affectations essayées au plus avant de renoncer. Un problème sans solution tournerait sans fin.",
        docEn: "The number of assignments tried at most before giving up. A problem with no solution would run forever." },
    ],
    async executer(ctx: any) {
      const recue = ctx.entree(0);
      if (!estSequence(recue)) {
        return { valeurs: [null, ""], erreur: true,
          message: en() ? "No sequence at the input." : "Aucune séquence à l'entrée." };
      }
      const accords = accordsDeSequence(recue.notes ?? []);
      if (accords.length === 0) {
        return { valeurs: [null, ""], erreur: true,
          message: en() ? "No chord in the sequence." : "Aucun accord dans la séquence." };
      }

      const grave = ctx.paramNombre("Note la plus grave", 60);
      const aigu = ctx.paramNombre("Note la plus aiguë", 84);
      const o: OptionsMelodie = {
        parAccord: Math.round(ctx.paramNombre("Notes par accord", 4)),
        // LES BORNES SE REMETTENT DANS L'ORDRE plutôt que de rendre un registre vide : une personne
        // qui les croise obtiendrait sinon un composant muet sans savoir pourquoi.
        grave: Math.min(grave, aigu),
        aigu: Math.max(grave, aigu),
        ecartMax: Math.round(ctx.paramNombre("Écart maximal", 7)),
        repetitionMax: Math.round(ctx.paramNombre("Répétition maximale", 1)),
        appuis: ctx.paramTexte("Notes de l'accord sur les appuis", "oui") !== "non",
        sommetUnique: ctx.paramTexte("Sommet unique", "oui") !== "non",
        sautCompense: Math.round(ctx.paramNombre("Saut compensé", 4)),
        memeSensMax: Math.round(ctx.paramNombre("Même sens au plus", 4)),
        graine: Math.round(ctx.paramNombre("Graine", 7)),
        budget: Math.round(ctx.paramNombre("Budget", 200000)),
      };

      const r = melodieSurAccords(accords, o);
      const anglais = en();
      const duree = Math.max(recue.duree ?? 0, accords[accords.length - 1].fin);

      const lignes = [
        anglais ? "MELODY OVER CHORDS" : "MÉLODIE SUR ACCORDS",
        "",
        anglais ? "Chords recognised" : "Accords reconnus",
        ...accords.map((a, i) => {
          const nom = a.accord ? nomDeLaccord(a.accord, anglais) : (anglais ? "unnamed" : "sans nom");
          const g = a.accord ? gammeDe(gammeDeQualite(a.accord.qualite)) : undefined;
          const nomGamme = g ? (anglais ? g.en : g.fr) : (anglais ? "major" : "majeur");
          return `  ${String(i + 1).padStart(3)}  ${a.debut.toFixed(2).padStart(7)} s  ${nom.padEnd(14)} ${nomGamme}`;
        }),
        "",
        `  ${(anglais ? "Constraints set" : "Contraintes posées").padEnd(26)}${r.posees.join(", ") || (anglais ? "none" : "aucune")}`,
        `  ${(anglais ? "Assignments tried" : "Affectations essayées").padEnd(26)}${r.resolution.noeuds}`,
        `  ${(anglais ? "Most blocking rule" : "Règle la plus bloquante").padEnd(26)}${r.resolution.regleBloquante || "-"}`,
        `  ${(anglais ? "Gave up on budget" : "Budget épuisé").padEnd(26)}${r.resolution.abandonne ? (anglais ? "yes" : "oui") : (anglais ? "no" : "non")}`,
      ];

      if (r.notes.length === 0) {
        lignes.push("",
          anglais
            ? `No line satisfies every rule. Furthest position reached: ${r.resolution.meilleurPartiel.length} of ${r.places.length}.`
            : `Aucune ligne ne satisfait toutes les règles. Place la plus lointaine atteinte : ${r.resolution.meilleurPartiel.length} sur ${r.places.length}.`);
        return { valeurs: [null, lignes.join("\n")], erreur: true,
          message: `${anglais ? "no line" : "aucune ligne"} · ${anglais ? "blocked by" : "bloqué par"} ${r.resolution.regleBloquante || "?"}` };
      }

      lignes.push("", anglais ? "Line" : "Ligne", "  "
        + r.notes.map((n, k) => `${r.places[k].appui ? "*" : ""}${nomNote(n.note)}`).join(" "));

      const melodie: Sequence = {
        notes: r.notes,
        duree,
        titre: anglais ? "Melody" : "Mélodie",
      };
      return {
        valeurs: [melodie, lignes.join("\n")],
        message: `${r.notes.length} ${anglais ? "notes" : "notes"} · ${accords.length} ${anglais ? "chords" : "accords"} · `
          + `${r.resolution.noeuds} ${anglais ? "assignments" : "affectations"}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
