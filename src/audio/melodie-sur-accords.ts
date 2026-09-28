// audio/melodie-sur-accords.ts — Faire émerger une mélodie d'une suite d'accords.
//
// CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS. Ce n'est pas une règle de composition de plus : c'est
// le raccord entre trois pièces qui existaient déjà séparément et ne se parlaient pas. La
// reconnaissance nomme l'accord, la jointure d'`accord-gamme.ts` dit quelles notes il ouvre, et le
// solveur de `contraintes.ts` cherche une ligne qui les emploie sous des règles. Aucune des trois
// n'a été écrite ici.
//
// POURQUOI DES CONTRAINTES PLUTÔT QU'UNE RÈGLE, décidé avec Fabien : « l'entrée est seulement la
// pulsion, puis on pose des contraintes progressives ». Une règle unique rend une seule ligne, et
// l'on ne peut que la prendre ou la laisser. Des contraintes se posent une par une, se relâchent, et
// le solveur dit laquelle a bloqué : c'est ce qui permet de serrer jusqu'à ce que la ligne devienne
// celle qu'on voulait, au lieu de régler des curseurs à l'aveugle.
//
// LE DOMAINE PORTE DÉJÀ LA MOITIÉ DES RÈGLES, et c'est ce qui rend la recherche praticable. Une note
// n'est candidate que si sa classe est dans la gamme de l'accord courant, et sur un appui que si
// elle est dans l'accord lui-même. Poser ces deux-là comme contraintes les ferait éprouver après
// coup, sur un arbre des milliers de fois plus large ; en les mettant dans le domaine, elles ne
// coûtent rien.
//
// LES APPUIS SONT LA RÈGLE A, celle du contrepoint et de la basse chiffrée : note de l'accord sur le
// temps fort, note de passage entre. Elle n'est pas un mode à part, c'est le domaine restreint sur
// les positions d'appui ; tout le reste du jeu de contraintes s'y ajoute sans la connaître.

import { degresDeGamme } from "./gammes";
import { gammeDeQualite } from "./accord-gamme";
import { intervallesDaccord } from "./qualites-accords";
import {
  domaineHauteurs, ecartMaximal, repetitionMaximale, resoudre,
  type Contrainte, type Resolution,
} from "./contraintes";
import type { AccordReconnu } from "./reconnaitre-accord";

/** Un accord posé dans le temps, tel que la reconnaissance le rend. */
export interface AccordDate {
  debut: number;
  fin: number;
  accord: AccordReconnu | undefined;
}

/** Une place où la mélodie pose une note. */
export interface Place {
  debut: number;
  fin: number;
  /** Vrai sur le premier temps de l'accord : c'est là que l'appui se joue. */
  appui: boolean;
  /** L'index de l'accord dont cette place relève. */
  accord: number;
}

export interface OptionsMelodie {
  /** Combien de notes par accord. Une seule ne laisse que des appuis. */
  parAccord: number;
  /** Les bornes du registre, en notes MIDI. */
  grave: number;
  aigu: number;
  /** L'écart maximal entre deux notes voisines, en demi-tons. Zéro ne borne rien. */
  ecartMax: number;
  /** Combien de fois au plus une hauteur se répète de suite. Zéro ne borne rien. */
  repetitionMax: number;
  /** Exiger une note de l'accord sur chaque appui. */
  appuis: boolean;
  /** Exiger que la note la plus aiguë ne paraisse qu'une fois. */
  sommetUnique: boolean;
  /** Après un saut plus grand que cette borne, exiger un mouvement contraire. Zéro n'exige rien. */
  sautCompense: number;
  /** Interdire plus de tant de pas consécutifs dans le même sens. Zéro ne borne rien. */
  memeSensMax: number;
  graine: number;
  budget: number;
}

/**
 * Les places où la mélodie pose ses notes, une grille par accord.
 *
 * LA GRILLE VIENT DES ACCORDS ET NON D'UN TEMPO, et c'est ce qui fait que la mélodie tombe avec
 * l'harmonie. Un tempo réglé à côté produirait une ligne qui glisse contre les accords, ce qui est
 * un autre objet.
 */
export function placesDeLaMelodie(accords: readonly AccordDate[], parAccord: number): Place[] {
  const combien = Math.max(1, Math.round(parAccord));
  const places: Place[] = [];
  accords.forEach((a, index) => {
    const pas = (a.fin - a.debut) / combien;
    for (let k = 0; k < combien; k++) {
      places.push({
        debut: a.debut + k * pas,
        fin: a.debut + (k + 1) * pas,
        appui: k === 0,
        accord: index,
      });
    }
  });
  return places;
}

/**
 * Les hauteurs candidates à chaque place.
 *
 * UN ACCORD NON RECONNU N'INTERDIT PAS DE JOUER. La reconnaissance se tait en dessous de trois
 * classes, et une suite peut porter un intervalle seul : la place reçoit alors la gamme majeure sur
 * la basse entendue plutôt que rien, faute de quoi la recherche échouerait sur une mesure au lieu de
 * la traverser.
 */
export function domainesDeLaMelodie(
  places: readonly Place[], accords: readonly AccordDate[], o: OptionsMelodie,
): number[][] {
  return places.map((p) => {
    const a = accords[p.accord]?.accord;
    if (!a) return domaineHauteurs(o.grave, o.aigu, degresDeGamme("majeur"));
    const gamme = degresDeGamme(gammeDeQualite(a.qualite))
      .map((d) => (d + a.fondamentale) % 12);
    if (!(o.appuis && p.appui)) return domaineHauteurs(o.grave, o.aigu, gamme);
    // SUR UN APPUI, SEULES LES NOTES DE L'ACCORD, et c'est la règle A posée dans le domaine.
    // LES INTERVALLES VIENNENT DE LA TABLE, repli compris : j'avais écrit `?? [0, 4, 7]` ici, et le
    // garde des nomenclatures l'a relevé comme une table d'accord privée. Il a raison, et c'est
    // exactement ce pour quoi il existe : `intervallesDaccord` porte déjà son propre secours.
    const notes = intervallesDaccord(a.qualite).map((i) => (i + a.fondamentale) % 12);
    return domaineHauteurs(o.grave, o.aigu, notes);
  });
}

/** La note la plus aiguë ne paraît qu'une fois : une ligne n'a qu'un sommet. */
export const sommetUnique = (): Contrainte => ({
  nom: "sommet",
  admet: (v, i) => {
    // ON NE JUGE QUE CE QUI EST POSÉ. Un préfixe dont le maximum se répète est déjà perdu, quelle
    // que soit la suite ; un préfixe dont le maximum est unique peut encore être battu plus loin.
    let max = -Infinity;
    let combien = 0;
    for (let k = 0; k <= i; k++) {
      if (v[k] > max) { max = v[k]; combien = 1; } else if (v[k] === max) combien++;
    }
    return combien === 1;
  },
});

/**
 * Après un saut, un mouvement contraire.
 *
 * C'EST LA RÈGLE LA PLUS ANCIENNE DE L'ÉCRITURE MÉLODIQUE, et elle a une raison physique : un saut
 * laisse l'oreille en attente d'un retour, et deux sauts de suite dans le même sens sortent du
 * registre en trois notes.
 */
export const sautCompense = (borne: number): Contrainte => ({
  nom: "saut",
  admet: (v, i) => {
    if (i < 2) return true;
    const saut = v[i - 1] - v[i - 2];
    if (Math.abs(saut) <= borne) return true;
    const suite = v[i] - v[i - 1];
    return saut > 0 ? suite <= 0 : suite >= 0;
  },
});

/** Pas plus de tant de pas consécutifs dans le même sens : une ligne qui monte sans fin n'en est pas une. */
export const memeSensMaximal = (combien: number): Contrainte => ({
  nom: "sens",
  admet: (v, i) => {
    if (i === 0) return true;
    let suite = 0;
    for (let k = i; k > 0; k--) {
      const pas = v[k] - v[k - 1];
      if (pas === 0) break;
      if (k < i && Math.sign(pas) !== Math.sign(v[k + 1] - v[k])) break;
      suite++;
    }
    return suite <= combien;
  },
});

/** Ce que la recherche a rendu, et ce qu'elle a coûté. */
export interface MelodieTrouvee {
  /** Les notes, une par place. Vide quand la recherche n'aboutit pas. */
  notes: { note: number; velocite: number; debut: number; fin: number }[];
  places: Place[];
  resolution: Resolution;
  /** Les contraintes réellement posées, dans l'ordre où le solveur les éprouve. */
  posees: string[];
}

/**
 * Une mélodie sur ces accords, sous ces contraintes.
 *
 * L'ORDRE DES CONTRAINTES EST CELUI DE LEUR COÛT, la moins chère en tête : la première qui refuse
 * arrête l'examen, si bien que cet ordre accélère la recherche sans rien changer à ce qu'elle
 * trouve. L'écart entre deux notes se juge sur deux entiers, le sommet parcourt le préfixe.
 */
export function melodieSurAccords(
  accords: readonly AccordDate[], o: OptionsMelodie,
): MelodieTrouvee {
  const places = placesDeLaMelodie(accords, o.parAccord);
  const domaines = domainesDeLaMelodie(places, accords, o);
  const contraintes: Contrainte[] = [];
  if (o.ecartMax > 0) contraintes.push(ecartMaximal(o.ecartMax));
  if (o.repetitionMax > 0) contraintes.push(repetitionMaximale(o.repetitionMax));
  if (o.sautCompense > 0) contraintes.push(sautCompense(o.sautCompense));
  if (o.memeSensMax > 0) contraintes.push(memeSensMaximal(o.memeSensMax));
  if (o.sommetUnique) contraintes.push(sommetUnique());

  const resolution = resoudre(domaines, contraintes, {
    graine: o.graine, budget: o.budget, combien: 1,
  });
  const trouvee = resolution.solutions[0];
  const notes = (trouvee ?? []).map((hauteur, k) => ({
    note: hauteur,
    // UN APPUI SE JOUE PLUS FORT, et c'est ce qui rend la hiérarchie audible : sans cela, la
    // distinction entre appui et passage ne s'entendrait que par la justesse de l'harmonie.
    velocite: places[k].appui ? 96 : 72,
    debut: places[k].debut,
    fin: places[k].fin,
  }));
  return { notes, places, resolution, posees: contraintes.map((c) => c.nom) };
}
