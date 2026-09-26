// audio/sequence-formes.ts — Ce qu'on fait subir à une suite de notes : la filtrer, lui donner un profil.
//
// CE QUE CELA AJOUTE. Le flux de séquence avait une entrée, une source et deux sorties, mais un
// seul traitement au milieu. Or ce qui fait l'intérêt d'un graphe est la composition : deux
// fonctions mises à la suite. Ces deux-ci sont les plus élémentaires de la composition assistée,
// celles qu'OpenMusic range sous les filtres de listes et sous sa bibliothèque Profile.
//
// LE PROFIL EST UNE COURBE, ET LA COURBE EXISTE DÉJÀ. Le dépôt a un type de flux `courbe`, avec son
// générateur et ses suiveurs : la hauteur d'une mélodie peut donc être pilotée par la même chose
// qui pilote une fréquence de coupure. C'est la rencontre de deux flux, et non un troisième.
//
// LES HAUTEURS RESTENT FRACTIONNAIRES quand on le demande. Une courbe est continue ; l'imposer à
// des hauteurs produit naturellement des quarts de ton, que le flux sait porter et que la gravure
// sait écrire. L'arrondi au demi-ton est offert, il n'est pas imposé.

import { reechantillonner, type Courbe } from "./courbe";
import type { Note } from "./note";

// ── Filtrer ────────────────────────────────────────────────────────────

export interface CriteresFiltre {
  /** Bornes de hauteur, incluses, en demi-tons. */
  hauteurMin?: number;
  hauteurMax?: number;
  /** Bornes de durée, incluses, en secondes. */
  dureeMin?: number;
  dureeMax?: number;
  /** Bornes de nuance, incluses. */
  nuanceMin?: number;
  nuanceMax?: number;
  /** Canal retenu ; absent ou négatif, tous les canaux. */
  canal?: number;
}

/**
 * Sépare les notes qui satisfont les critères de celles qui ne les satisfont pas.
 *
 * LES DEUX CÔTÉS SORTENT, et ce n'est pas une commodité. Un filtre qui ne rend que ce qu'il garde
 * perd l'autre moitié sans le dire ; en la rendant aussi, on peut traiter les deux différemment et
 * les réunir, ce qui est le procédé ordinaire de la composition assistée. Le compte se vérifie
 * alors : gardées plus écartées font toujours le total.
 *
 * UN CRITÈRE ABSENT NE FILTRE PAS. Une borne laissée vide ne doit pas valoir zéro, sans quoi un
 * réglage qu'on n'a pas touché écarterait tout.
 */
export function filtrerNotes(notes: readonly Note[], c: CriteresFiltre): { gardees: Note[]; ecartees: Note[] } {
  const gardees: Note[] = [];
  const ecartees: Note[] = [];
  for (const n of notes) {
    const duree = n.fin - n.debut;
    const passe =
      (c.hauteurMin === undefined || n.note >= c.hauteurMin)
      && (c.hauteurMax === undefined || n.note <= c.hauteurMax)
      && (c.dureeMin === undefined || duree >= c.dureeMin)
      && (c.dureeMax === undefined || duree <= c.dureeMax)
      && (c.nuanceMin === undefined || n.velocite >= c.nuanceMin)
      && (c.nuanceMax === undefined || n.velocite <= c.nuanceMax)
      && (c.canal === undefined || c.canal < 0 || (n.canal ?? 0) === c.canal);
    (passe ? gardees : ecartees).push(n);
  }
  return { gardees, ecartees };
}

// ── Profil mélodique ───────────────────────────────────────────────────

/** Le profil d'une séquence : sa hauteur au fil du temps, ramenée entre zéro et un. */
export function profilDeSequence(notes: readonly Note[], cadence = 200): Courbe {
  if (notes.length === 0) return { valeurs: new Float32Array(1), cadence };
  const fin = notes.reduce((m, n) => Math.max(m, n.fin), 0);
  const basse = notes.reduce((m, n) => Math.min(m, n.note), Infinity);
  const haute = notes.reduce((m, n) => Math.max(m, n.note), -Infinity);
  const etendue = haute - basse;
  const n = Math.max(1, Math.round(fin * cadence));
  const valeurs = new Float32Array(n);
  // LA HAUTEUR TENUE, ET NON INTERPOLÉE. Une mélodie ne glisse pas d'une note à l'autre : entre
  // deux attaques, la hauteur est celle de la note qui sonne. Interpoler dessinerait un portamento
  // qui n'a pas été joué, et le profil relu ne serait plus celui de la pièce.
  let derniere = 0;
  for (let i = 0; i < n; i++) {
    const t = i / cadence;
    const courante = notes.find((x) => t >= x.debut && t < x.fin) ?? null;
    if (courante) derniere = etendue > 0 ? (courante.note - basse) / etendue : 0.5;
    valeurs[i] = derniere;
  }
  return { valeurs, cadence };
}

export interface OptionsProfil {
  /** Hauteur, en demi-tons, que vaut zéro sur la courbe. */
  grave: number;
  /** Hauteur que vaut un. */
  aigu: number;
  /**
   * De zéro à un : à zéro la séquence ne change pas, à un elle épouse la courbe.
   *
   * ENTRE LES DEUX, LE PROFIL D'ORIGINE SE DÉFORME SANS DISPARAÎTRE. C'est le régime utile : une
   * mélodie qu'on infléchit garde ses intervalles caractéristiques, quand une mélodie remplacée
   * n'est plus qu'une lecture de la courbe.
   */
  force: number;
  /** Arrondir au demi-ton. Faux par défaut : une courbe est continue, et le flux le porte. */
  arrondir?: boolean;
}

/**
 * Donne à une séquence le profil d'une courbe, en gardant ses rythmes.
 *
 * LE TEMPS NE BOUGE PAS. Seules les hauteurs changent ; les débuts, les fins et les nuances sont
 * ceux de la séquence reçue. Un profil qui déplacerait aussi les attaques ne serait plus un profil
 * mais une autre pièce.
 *
 * LA COURBE EST LUE AU MILIEU DE CHAQUE NOTE, ET NON À SON ATTAQUE. La première écriture lisait à
 * l'attaque, ce qui paraissait plus juste et ne l'était pas : l'attaque est exactement l'instant où
 * une courbe en marches d'escalier saute, et une lecture interpolée y tombe entre les deux valeurs.
 * Mesuré sur l'aller-retour, un profil relu puis réimposé rendait 65,59 pour une note à 67. Au
 * milieu de la note, on est à l'intérieur de sa marche : l'aller-retour se referme, et le sens
 * musical ne change pas, la hauteur étant décidée par l'endroit où passe la courbe pendant que la
 * note sonne.
 */
export function imposerProfil(notes: readonly Note[], courbe: Courbe, o: OptionsProfil): Note[] {
  if (notes.length === 0) return [];
  const fin = notes.reduce((m, n) => Math.max(m, n.fin), 0) || 1;
  const force = Math.max(0, Math.min(1, o.force));
  const bas = Math.min(o.grave, o.aigu);
  const haut = Math.max(o.grave, o.aigu);
  // La courbe est rééchantillonnée sur une grille fine du temps de la séquence, ce qui la rend
  // lisible à n'importe quel instant sans se soucier de sa cadence d'origine.
  const points = 2048;
  const y = reechantillonner(courbe, points);
  return notes.map((n) => {
    const x = Math.max(0, Math.min(1, ((n.debut + n.fin) / 2) / fin));
    const v = y[Math.min(points - 1, Math.round(x * (points - 1)))] ?? 0;
    const visee = bas + (haut - bas) * Math.max(0, Math.min(1, v));
    const melangee = n.note * (1 - force) + visee * force;
    return { ...n, note: o.arrondir ? Math.round(melangee) : melangee };
  });
}
