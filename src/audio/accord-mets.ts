// audio/accord-mets.ts — D'un profil de dégustation vers un point de l'espace des goûts.
//
// C'est le bout appliqué de la série : ce qu'un sommelier ou un chef commande vraiment, non pas
// « quel goût a ce son » mais « que faire entendre pendant qu'on goûte ceci ». La littérature de
// l'assaisonnement sonore montre que la musique DÉPLACE les jugements de dégustation — un caramel
// jugé plus sucré et moins amer sous une bande aiguë, un chocolat jugé plus sucré sous une musique
// positive, avec des tailles d'effet moyennes (d de Cohen de 0,54 à 0,66) et non davantage ; sur le
// vin, la dominance de l'amertume change de durée avec la musique (Crisinel et al., Food Quality and
// Preference 24, 2012 ; Wang, Mesz et Spence).
//
// LE CALCUL EST UN BARYCENTRE, et il faut savoir ce que cela implique. Un profil qui n'a qu'un goût
// tombe exactement sur sa région ; un profil qui les mélange tombe ENTRE les régions, donc au milieu,
// donc nulle part en particulier. Ce n'est pas un défaut du calcul mais ce que dit le matériau : la
// littérature donne quatre régions, pas une carte continue des dégustations. Un profil équilibré rend
// donc une musique neutre, et le nœud le dit au lieu de faire semblant.

import { REGIONS, type DimensionsGout, type Gout } from "./gout";

export type ProfilDegustation = Record<Gout, number>;

const GOUTS: Gout[] = ["sucré", "acide", "amer", "salé"];
const DIMENSIONS: (keyof DimensionsGout)[] = ["hauteur", "articulation", "vitesse", "consonance", "intensite"];

/**
 * Le point visé : les quatre régions pondérées par les intensités de la dégustation.
 *
 * Rend `null` quand tout est à zéro — il n'y a alors rien à accorder, et viser le centre par défaut
 * laisserait croire à un résultat.
 */
export function pointDepuisDegustation(profil: ProfilDegustation): DimensionsGout | null {
  const total = GOUTS.reduce((s, g) => s + Math.max(0, profil[g]), 0);
  if (total <= 0) return null;
  const point = {} as DimensionsGout;
  for (const dim of DIMENSIONS) {
    point[dim] = GOUTS.reduce((s, g) => s + (Math.max(0, profil[g]) / total) * REGIONS[g][dim], 0);
  }
  return point;
}

/** Le goût qui l'emporte, et sa part du profil. */
export function goutDominant(profil: ProfilDegustation): { gout: Gout; part: number } | null {
  const total = GOUTS.reduce((s, g) => s + Math.max(0, profil[g]), 0);
  if (total <= 0) return null;
  const gout = GOUTS.reduce((m, g) => (Math.max(0, profil[g]) > Math.max(0, profil[m]) ? g : m), GOUTS[0]);
  return { gout, part: Math.max(0, profil[gout]) / total };
}

/**
 * L'instrument que la littérature associe au goût dominant.
 *
 * Crisinel et Spence (2010) donnent le piano pour le sucré, le trombone pour l'amer et l'acide. Ils
 * ne donnent RIEN pour le salé : `publie` vaut alors faux, le piano sert de défaut, et le nœud le
 * signale plutôt que de faire passer un choix par défaut pour un résultat d'étude.
 */
export function instrumentPublie(gout: Gout): { programme: number; nom: string; nomEn: string; publie: boolean } {
  switch (gout) {
    case "sucré": return { programme: 0, nom: "piano", nomEn: "piano", publie: true };
    case "acide": return { programme: 57, nom: "trombone", nomEn: "trombone", publie: true };
    case "amer": return { programme: 57, nom: "trombone", nomEn: "trombone", publie: true };
    default: return { programme: 0, nom: "piano", nomEn: "piano", publie: false };
  }
}
