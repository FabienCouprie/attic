// audio/arbres-catalogue.ts — Feuilleter les rythmes simples, ou en tirer un sous surveillance.
//
// POURQUOI UN CATALOGUE ET UN TIRAGE, ET NON L'UN OU L'AUTRE. Le dénombrement tranche : à un seul
// étage de division et jusqu'à quatre parts, une mesure admet **340** arbres, ce qui se feuillette ;
// à deux étages, elle en admet douze milliards, et à trois, davantage qu'il n'y a d'atomes dans ce
// qu'on voit du ciel. Le premier étage se recense donc, et au-delà il faut tirer.
//
// CE QUE LE RECENSEMENT COUVRE. Le binaire, le triolet, le quintolet sur un temps, et toutes leurs
// combinaisons avec des silences : l'essentiel de ce qu'on écrit sans y penser. Le feuilleter donne
// une idée des formes disponibles que dix réglages ne donneraient pas.
//
// LE TIRAGE EST SUPERVISÉ PAR DES RÉGLAGES MUSICAUX, et non par une profondeur et une graine seules.
// Quelles divisions sont permises, combien de silences, combien de liaisons : ce sont les questions
// qu'un compositeur se pose, et elles suffisent à cadrer le hasard sans le supprimer.

import type { Mesure, NoeudRythme } from "./arbre-rythmique";

/** Ce qu'un emplacement peut être, au premier étage : une note, un silence, ou une division. */
export interface OptionsCatalogue {
  /** Nombre maximal d'emplacements au sommet de la mesure. */
  emplacementsMax?: number;
  /** Nombre maximal de parts dans une division. Une division a au moins deux parts. */
  partsMax?: number;
  /** Autoriser les silences. */
  silences?: boolean;
  metrique?: [number, number];
}

/**
 * Tous les arbres à un seul étage de division, dans un ordre stable.
 *
 * L'ORDRE NE DOIT PAS BOUGER D'UNE VERSION À L'AUTRE : un numéro d'arbre est enregistré dans un
 * graphe, et le retrouver plus tard ne doit pas donner un autre rythme. Les emplacements sont donc
 * énumérés du plus simple au plus complexe, dans un ordre imposé par la construction et non par un
 * tri.
 *
 * AVEC LES RÉGLAGES DE DÉPART — quatre emplacements, quatre parts, silences compris — le compte est
 * de 340, et c'est le chiffre que le dénombrement prévoit : quatre formes possibles par emplacement
 * sans silence, plus les silences, élevé au nombre d'emplacements.
 */
export function catalogueArbres(o: OptionsCatalogue = {}): Mesure[] {
  const emplacementsMax = Math.max(1, o.emplacementsMax ?? 4);
  const partsMax = Math.max(2, o.partsMax ?? 4);
  const silences = o.silences ?? true;
  const metrique = o.metrique ?? [4, 4];

  // Les formes qu'un emplacement peut prendre : une note, un silence, puis les divisions.
  const formes: NoeudRythme[] = [{ valeur: 1 }];
  if (silences) formes.push({ valeur: 1, silence: true });
  for (let parts = 2; parts <= partsMax; parts++) {
    formes.push({ valeur: 1, enfants: Array.from({ length: parts }, () => ({ valeur: 1 })) });
  }

  const out: Mesure[] = [];
  for (let n = 1; n <= emplacementsMax; n++) {
    const indices = Array.from({ length: n }, () => 0);
    for (;;) {
      out.push({ metrique, contenu: indices.map((k) => copier(formes[k])) });
      let i = n - 1;
      while (i >= 0 && ++indices[i] >= formes.length) { indices[i] = 0; i--; }
      if (i < 0) break;
    }
  }
  return out;
}

function copier(n: NoeudRythme): NoeudRythme {
  return n.enfants ? { ...n, enfants: n.enfants.map(copier) } : { ...n };
}

export interface OptionsTirage {
  metrique?: [number, number];
  /** Emplacements au sommet de la mesure. */
  emplacements?: number;
  /** Nombre de mesures engendrées. */
  mesures?: number;
  /** Étages de division permis. Zéro donne une mesure sans aucune division. */
  profondeur?: number;
  /** Les nombres de parts autorisés dans une division, par exemple [2, 3, 4]. */
  divisions?: number[];
  /** Part des emplacements qui deviennent des silences, de zéro à un. */
  silences?: number;
  /** Part des notes qui sont liées à la précédente, de zéro à un. */
  liaisons?: number;
  /**
   * Chance qu'un emplacement se divise plutôt que de rester une note, de zéro à un.
   *
   * SANS CE RÉGLAGE, LA PROFONDEUR SEULE DIVISE TOUT, et l'on obtient une mesure uniformément
   * hachée qui ne ressemble à aucune musique. Ce qui fait un rythme est l'inégalité entre ce qui se
   * divise et ce qui ne se divise pas.
   */
  densite?: number;
}

/**
 * Tire un arbre au hasard, dans les limites données.
 *
 * LE HASARD EST FOURNI PAR L'APPELANT, ce qui rend le tirage reproductible : la même graine rend
 * le même rythme, et un graphe rouvert donne ce qu'il donnait.
 */
export function engendrerArbre(o: OptionsTirage, hasard: () => number): Mesure[] {
  const metrique = o.metrique ?? [4, 4];
  const emplacements = Math.max(1, Math.round(o.emplacements ?? metrique[0]));
  const nbMesures = Math.max(1, Math.round(o.mesures ?? 1));
  const profondeur = Math.max(0, Math.round(o.profondeur ?? 1));
  const divisions = (o.divisions ?? [2, 3, 4]).filter((d) => d >= 2);
  const partSilences = Math.max(0, Math.min(1, o.silences ?? 0.15));
  const partLiaisons = Math.max(0, Math.min(1, o.liaisons ?? 0));
  const densite = Math.max(0, Math.min(1, o.densite ?? 0.35));

  const unEmplacement = (reste: number): NoeudRythme => {
    if (reste > 0 && divisions.length > 0 && hasard() < densite) {
      const parts = divisions[Math.floor(hasard() * divisions.length) % divisions.length];
      return { valeur: 1, enfants: Array.from({ length: parts }, () => unEmplacement(reste - 1)) };
    }
    if (hasard() < partSilences) return { valeur: 1, silence: true };
    if (hasard() < partLiaisons) return { valeur: 1, liee: true };
    return { valeur: 1 };
  };

  const mesures: Mesure[] = [];
  for (let m = 0; m < nbMesures; m++) {
    mesures.push({
      metrique,
      contenu: Array.from({ length: emplacements }, () => unEmplacement(profondeur)),
    });
  }
  return mesures;
}

// ── Hauteurs ───────────────────────────────────────────────────────────

export interface OptionsHauteurs {
  /** Combien de hauteurs engendrer. */
  combien: number;
  /** Bornes, en demi-tons. */
  basse?: number;
  haute?: number;
  /** Les classes de hauteurs permises ; vide pour le chromatique. */
  degres?: readonly number[];
  /**
   * Intervalle maximal entre deux notes consécutives, en demi-tons. Zéro pour ne pas contraindre.
   *
   * SANS CETTE BRIDE, UN TIRAGE UNIFORME SAUTE DE DEUX OCTAVES À CHAQUE NOTE et ne s'entend pas
   * comme une ligne mais comme un semis de points. La brider ne rend pas la mélodie bonne, elle la
   * rend écoutable, ce qui est le minimum attendu d'un point de départ.
   */
  ecartMax?: number;
}

/** Une suite de hauteurs tirées dans une étendue et, s'il y a lieu, dans une gamme. */
export function engendrerHauteurs(o: OptionsHauteurs, hasard: () => number): number[] {
  const combien = Math.max(0, Math.round(o.combien));
  const basse = Math.max(0, Math.min(127, Math.round(o.basse ?? 48)));
  const haute = Math.max(basse, Math.min(127, Math.round(o.haute ?? 72)));
  const degres = o.degres && o.degres.length > 0 ? o.degres : null;
  const ecartMax = Math.max(0, Math.round(o.ecartMax ?? 0));

  const permises: number[] = [];
  for (let n = basse; n <= haute; n++) {
    if (!degres || degres.some((d) => ((d % 12) + 12) % 12 === ((n % 12) + 12) % 12)) permises.push(n);
  }
  if (permises.length === 0) return [];

  const out: number[] = [];
  let precedente: number | null = null;
  for (let i = 0; i < combien; i++) {
    const ancre = precedente;
    const candidates: number[] = ancre !== null && ecartMax > 0
      ? permises.filter((n) => Math.abs(n - ancre) <= ecartMax)
      : permises;
    const parmi: number[] = candidates.length > 0 ? candidates : permises;
    const choisie: number = parmi[Math.min(parmi.length - 1, Math.floor(hasard() * parmi.length))];
    out.push(choisie);
    precedente = choisie;
  }
  return out;
}
