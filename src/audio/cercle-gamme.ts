// audio/cercle-gamme.ts — Une gamme posée sur un cercle, tempérée ou mesurée en cents.
//
// POURQUOI CE MODULE EXISTE, relevé par Fabien : « on peut faire un cercle qui parcourt les gammes
// par nom. Comme il fonctionne en microton les gammes du monde peuvent y être portées, n'est-ce
// pas ? » Oui, et le tuyau le portait déjà : la valeur d'un sommet est à virgule, et `cercle.ts` le
// dit là où elle est déclarée, « le microton voyage donc gratuitement ». Ce qui manquait n'était
// pas le tuyau mais la PROVENANCE des hauteurs : les trois répartitions du cercle mélodique
// CALCULENT la hauteur depuis la fondamentale et la place, et aucune n'accepte une liste de degrés.
//
// LES DEUX TABLES RÉUNIES SONT DANS `gammes-reunies.ts`, d'où elles servent aussi ailleurs. Ne
// reste ici que ce qui tient du cercle.

import { POSITIONS_MAX, type Cercle } from "./cercle";
import { degresDUneOctave, estTemperee } from "./gammes-reunies";

/** Ce qu'une place du cercle vaut. */
export type PlacesDeGamme = "degre" | "chromatique";

/**
 * Le cercle d'une gamme nommée.
 *
 * DEUX FAÇONS DE PLACER LES DEGRÉS, et elles ne montrent pas la même chose. « Un degré par place »
 * donne une place à chacun : le tour se fait en autant de pas que la gamme a de degrés, chacun dure
 * autant, et c'est la seule façon qui convienne à une gamme mesurée en cents. « Les douze
 * demi-tons » pose douze places et n'allume que les degrés de la gamme : l'angle est alors la
 * hauteur, et le polygone dessine la forme de la gamme, ce qui laisse voir d'un coup ce qui la
 * sépare d'une autre.
 *
 * LA SECONDE NE VAUT QUE POUR UNE GAMME TEMPÉRÉE. Un degré à cent cinquante cents ne tombe sur
 * aucune des douze places, et deux degrés voisins s'y rejoindraient : le cercle dirait alors une
 * gamme que personne n'a écrite. Une gamme mesurée en cents retombe donc sur la première façon, et
 * c'est à l'appelant de le dire, `estTemperee` le lui permettant.
 */
export function cercleDeGamme(
  id: string,
  fondamentale: number,
  places: PlacesDeGamme = "degre",
  octaveDeFermeture = false,
): Cercle | undefined {
  const degres = degresDUneOctave(id, octaveDeFermeture);
  if (!degres || degres.length === 0) return undefined;
  if (places === "chromatique" && estTemperee(id)) {
    return {
      positions: 12,
      sorte: "hauteur",
      sommets: degres.map((d) => ({ position: Math.round(d) % 12, valeur: fondamentale + d })),
    };
  }
  return {
    positions: Math.min(POSITIONS_MAX, degres.length),
    sorte: "hauteur",
    sommets: degres.slice(0, POSITIONS_MAX).map((d, i) => ({ position: i, valeur: fondamentale + d })),
  };
}
