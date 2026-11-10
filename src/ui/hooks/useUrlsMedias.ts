// ui/hooks/useUrlsMedias.ts — Ce que l'atelier déclare au registre des URL de médias, et quand il
// balaie.
//
// La règle et ses raisons vivent dans `ui/urls-medias.ts`. Ce crochet ne fait que relier le
// registre à React : chaque détenteur déclare sa racine pour la durée de sa vie, et l'atelier
// balaie après chaque changement des nœuds.
//
// LE BALAYAGE ATTEND QUE LES NŒUDS SE TAISENT. Tirer un nœud change le tableau à chaque image : un
// balayage par image relirait cinquante instantanés soixante fois par seconde pour ne rien révoquer.
// Il part donc un quart de seconde après le dernier changement. Rien n'y perd : une URL lâchée
// attend un peu plus sa révocation, et une URL qui vient de naître attend, de toute façon, d'être
// vue tenue.
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

import { registreUrlsMedias } from "../urls-medias";

/** Le délai entre le dernier changement des nœuds et le balayage. */
export const DELAI_BALAYAGE_MS = 250;

/** Déclare au registre ce qu'un détenteur tient, tant qu'il vit. `lire` est relu à chaque balayage. */
export function useRacineDesUrls(nom: string, lire: () => unknown): void {
  const lireRef = useRef(lire);
  lireRef.current = lire;
  useEffect(() => registreUrlsMedias.declarerRacine(nom, () => lireRef.current()), [nom]);
}

/**
 * Les deux racines de l'atelier lui-même, le canevas et le graphe racine d'un méta ouvert, et le
 * balayage qui suit chaque changement des nœuds.
 *
 * LE CANEVAS SE LIT AU DERNIER RENDU, et non par `noeudsRef`, qu'un effet met à jour après
 * l'affichage. Une création d'URL balaie sur-le-champ, dans le geste qui la demande : lu par
 * `noeudsRef`, le canevas pouvait encore être celui d'avant le rendu, et une URL que l'écran venait de
 * reposer, celle qu'un Ctrl+Z rend, y aurait manqué.
 *
 * LE GRAPHE RACINE NE COMPTE QU'À L'INTÉRIEUR D'UN MÉTA, la règle que `hooks/useFenetresPartagees.ts`
 * a déjà payée. À la racine, `grapheRacineRef` garde la copie que la persistance y pose à chaque
 * passage du journal de session : MESURÉ, elle tenait encore l'adresse d'un fichier remplacé, qui ne
 * partait qu'à l'écriture suivante de l'en-cours.
 */
export function useBalayageDesUrls(
  noeuds: readonly unknown[], grapheRacineRef: MutableRefObject<unknown>, pileRef: MutableRefObject<readonly unknown[]>,
): void {
  const vivants = useRef(noeuds);
  vivants.current = noeuds;
  useRacineDesUrls("canevas", () => vivants.current);
  useRacineDesUrls("graphe racine", () => (pileRef.current.length > 0 ? grapheRacineRef.current : null));
  useEffect(() => {
    const minuteur = setTimeout(() => registreUrlsMedias.balayer(), DELAI_BALAYAGE_MS);
    return () => clearTimeout(minuteur);
  }, [noeuds]);
}
