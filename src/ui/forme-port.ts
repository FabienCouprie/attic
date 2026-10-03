// ui/forme-port.ts — Le dessin d'un point de port, pour le nœud comme pour l'infobulle.
//
// POURQUOI UN SEUL ENDROIT. Deux sites dessinent ce point : la poignée sur le nœud et la pastille
// de l'infobulle du catalogue. Écrits deux fois, ils divergeraient, et l'infobulle annoncerait une
// forme que le nœud ne porte pas. C'est le même motif que les notices, rassemblées pour que personne
// ne les recopie.
//
// LE CONTOUR EST DE LA COULEUR DU NŒUD, et ce n'est pas décoratif : il détache le point du fond sur
// lequel il se pose et sépare deux ports voisins. Le losange ne peut pas l'avoir, un découpage
// emportant le contour avec la forme ; il est donc dessiné plus grand, de sorte que son aire reste
// comparable, un losange inscrit dans un carré n'en couvrant que la moitié.

import type { CSSProperties } from "react";
import type { FormePort } from "../core/typesFlux";

/** Le côté du point, en pixels, tel que les poignées le portaient avant les formes. */
export const TAILLE_PORT = 10;

/**
 * Le style d'un point de port.
 *
 * `taille` est le côté de la forme ronde ou carrée ; le losange prend un peu plus, pour la raison
 * écrite en tête de fichier.
 */
export function stylePort(forme: FormePort, couleur: string, taille = TAILLE_PORT): CSSProperties {
  const commun: CSSProperties = { background: couleur };
  if (forme === "losange") {
    return {
      ...commun,
      width: Math.round(taille * 1.4),
      height: Math.round(taille * 1.4),
      border: "none",
      clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
    };
  }
  return {
    ...commun,
    width: taille,
    height: taille,
    border: "2px solid var(--bg-node)",
    // Deux pixels et non zéro : un carré aux angles vifs paraît sale à cette taille, et deux
    // pixels se distinguent encore franchement d'un disque.
    borderRadius: forme === "carre" ? 2 : "50%",
  };
}
