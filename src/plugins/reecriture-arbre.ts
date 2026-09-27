// plugins/reecriture-arbre.ts — Simplifier un arbre rythmique sans toucher à ce qu'on entend.
//
// LE TEXTE ENTRE ET LE TEXTE SORT, comme pour tout ce qui touche aux arbres : la notation en listes
// est la source de vérité, et un arbre simplifié doit pouvoir être relu, retouché et renvoyé.
//
// LE CALCUL EST DANS `audio/reecriture-arbre.ts`, éprouvé sur six cent quarante arbres ; ce fichier
// n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { derouler, dureeArbre, ecrireArbre, lireArbre } from "../audio/arbre-rythmique";
import { reecrireArbre } from "../audio/reecriture-arbre";

const en = () => langueCourante() === "en";

const ARBRE_DEFAUT = "(4/4 (1 (1 (1 1.0)) (1 (-1 -1)) 1))";

/** Ce que chaque règle a fait, dit en clair. */
const LIBELLES: Record<string, { fr: string; en: string }> = {
  "division-unique": { fr: "division à un seul élément", en: "division with a single element" },
  "liaisons-fondues": { fr: "note suivie de ses seules liaisons", en: "note followed by its ties alone" },
  "silences-fondus": { fr: "division tout en silence", en: "division all in rests" },
  "poids-reduits": { fr: "poids tous multiples", en: "weights all multiples" },
};

export const fiches: FicheAudio[] = ([
  {
    id: "reecrire-arbre",
    nom: "Simplifier un arbre", nomEn: "Simplify a Tree",
    univers: "Traitement", famille: "Conversion",
    resume: "Réduit un arbre rythmique à sa forme la plus courte, sans déplacer une seule note.",
    resumeEn: "Reduces a rhythm tree to its shortest form, without moving a single note.",
    notice: "Réduit un arbre rythmique à sa forme la plus courte et rend la notation obtenue.\n\nUn arbre engendré, tiré ou écrit à la main porte des tournures que personne n'écrirait : une division à un seul élément, un temps divisé dont la seconde moitié n'est qu'une liaison, plusieurs silences là où un seul suffit, des poids tous multiples d'un même nombre. Chacune se lit plus mal que sa forme réduite, et aucune ne change le son.\n\nQuatre règles s'appliquent, tant qu'elles s'appliquent. Une division à un seul élément est remplacée par cet élément, qui occupait déjà toute la place. Une note suivie de ses seules liaisons devient cette note, une liaison ne réattaquant pas. Une division dont tous les éléments sont des silences devient un silence. Des poids tous multiples d'un même nombre sont divisés par lui, seul leur rapport décidant des durées.\n\nLes notes qui sonnent ne bougent jamais, ni d'instant ni de durée. Les silences, eux, peuvent fondre : deux silences côte à côte et un silence deux fois plus long laissent le même vide, et le second s'écrit mieux.\n\nL'aplatissement d'une division dans une autre n'est pas fait. Il serait juste quand tous les comptes sont des puissances de deux, et faux sinon : une division en trois portant des divisions en deux donne six parts, et six n'étant pas une puissance de deux, l'aplatissement écrirait un sextolet là où la pièce a des triolets de croches.\n\n« Arbre » reçoit la notation en listes, employée quand l'entrée du même nom n'est pas branchée.\n\nLa sortie « Arbre » rend la notation réduite. La sortie « Analyse » liste les règles appliquées avec leur nombre, et compare le nombre de signes avant et après.\n\nLe message donne le nombre de règles appliquées et les signes gagnés.",
    noticeEn: "Reduces a rhythm tree to its shortest form and returns the notation obtained.\n\nA tree generated, drawn or written by hand carries turns of phrase nobody would write: a division with a single element, a beat divided whose second half is only a tie, several rests where one would do, weights all multiples of one same number. Each reads worse than its reduced form, and none changes the sound.\n\nFour rules apply, as long as they apply. A division with a single element is replaced by that element, which already occupied the whole place. A note followed by its ties alone becomes that note, a tie not re-attacking. A division all of whose elements are rests becomes a rest. Weights all multiples of one same number are divided by it, only their ratio deciding the durations.\n\nThe notes that sound never move, neither in instant nor in length. The rests may merge: two rests side by side and one rest twice as long leave the same emptiness, and the second is better written.\n\nFlattening one division into another is not done. It would be right when all the counts are powers of two, and wrong otherwise: a division in three carrying divisions in two gives six parts, and six not being a power of two, flattening would write a sextuplet where the piece has triplets of eighth notes.\n\n« Tree » receives the list notation, used when the input of the same name is not connected.\n\nThe « Tree » output returns the reduced notation. The « Analysis » output lists the rules applied with their count, and compares the number of signs before and after.\n\nThe message gives the number of rules applied and the signs saved.",
    entrees: [{ nom: "Arbre", nomEn: "Tree", type: "texte", requis: false }],
    sorties: [
      { nom: "Arbre", nomEn: "Tree", type: "texte" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Arbre", nomEn: "Tree", type: "texte", defaut: ARBRE_DEFAUT, defautEn: ARBRE_DEFAUT,
        doc: "La notation en listes, employée quand l'entrée du même nom n'est pas branchée.",
        docEn: "The list notation, used when the input of the same name is not connected." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = typeof entree === "string" && entree.trim().length > 0
        ? entree
        : ctx.paramTexte("Arbre", ARBRE_DEFAUT);
      let mesures;
      try {
        mesures = lireArbre(texte);
      } catch (err: any) {
        return { valeurs: [null, null], erreur: true, message: String(err?.message ?? err) };
      }
      if (mesures.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "The tree is empty." : "L'arbre est vide.",
        };
      }

      const avant = ecrireArbre(mesures);
      const r = reecrireArbre(mesures);
      const apres = ecrireArbre(r.mesures);
      const combien = Object.values(r.appliquees).reduce((s, v) => s + v, 0);

      // LES NOTES SONNANTES SONT COMPTÉES DES DEUX CÔTÉS, et le nombre est rendu. L'invariant est
      // éprouvé par les tests ; le montrer ici permet de le constater sur son propre arbre plutôt
      // que d'avoir à le croire.
      const notes = (m: typeof mesures) => derouler(m, 120).filter((e) => !e.silence).length;
      const evenements = (m: typeof mesures) => derouler(m, 120).length;

      const lignes = Object.entries(r.appliquees)
        .sort((a, b) => b[1] - a[1])
        .map(([regle, fois]) => {
          const l = LIBELLES[regle];
          return `  ${fois} ×  ${l ? (en() ? l.en : l.fr) : regle}`;
        });
      const analyse = [
        `${en() ? "before" : "avant"}  ${avant}`,
        `${en() ? "after " : "après"}  ${apres}`,
        "",
        combien > 0
          ? `${en() ? "rules applied" : "règles appliquées"} :\n${lignes.join("\n")}`
          : (en() ? "nothing to reduce" : "rien à réduire"),
        "",
        `${notes(mesures)} ${en() ? "sounding notes before" : "notes sonnantes avant"}, `
          + `${notes(r.mesures)} ${en() ? "after" : "après"}`,
        `${evenements(mesures)} ${en() ? "events before" : "événements avant"}, `
          + `${evenements(r.mesures)} ${en() ? "after" : "après"}`,
        `${dureeArbre(mesures, 120).toFixed(3)} s ${en() ? "before" : "avant"}, `
          + `${dureeArbre(r.mesures, 120).toFixed(3)} s ${en() ? "after" : "après"}`,
      ].join("\n");

      return {
        valeurs: [apres, analyse],
        message: combien > 0
          ? `${combien} ${en() ? "rules applied" : "règles appliquées"} · ${r.gagne} ${en() ? "signs saved" : "signes gagnés"}`
          : (en() ? "nothing to reduce" : "rien à réduire"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
