// ui/ordre-palette.ts — Le classement de la palette, extrait pour être éprouvé.
//
// LE DÉFAUT QUI A FAIT NAÎTRE CE FICHIER : chercher dans la palette changeait l'ordre des
// rubriques. Les Entrées, premières sans recherche, se retrouvaient au milieu dès qu'on tapait
// trois lettres. La cause tenait en une ligne — les univers étaient rangés dans l'ordre où les
// fiches RETENUES se présentaient, c'est-à-dire l'ordre du registre sans recherche, et l'ordre
// des correspondances avec. Rien ne le signalait, parce que l'ordre sans recherche, lui, était le
// bon.
//
// La règle est désormais : l'ordre des rubriques ne dépend PAS de ce qu'on cherche. Il vient de
// `audio/ordre-catalogue.ts`, que le générateur de COMPONENTS.md lit aussi — un seul endroit pour
// une seule question. Les familles et les nœuds, eux, sont rangés par leur nom affiché, donc dans
// la langue de l'interface : c'est ce qui les rend retrouvables à l'œil.

import { comparerUnivers } from "../audio/ordre-catalogue";
import type { FicheAudio } from "../audio/types-domaine";

export interface GroupeFamille {
  famille: string;
  defs: FicheAudio[];
}

export interface GroupeUnivers {
  univers: string;
  familles: GroupeFamille[];
}

/**
 * Range les fiches par univers puis par famille.
 *
 * @param nomAffiche le nom du nœud tel qu'il est montré — c'est lui qui trie, et non l'identifiant.
 * @param familleAffichee le libellé de la famille tel qu'il est montré.
 */
export function grouperFiches(
  fiches: readonly FicheAudio[],
  nomAffiche: (f: FicheAudio) => string,
  familleAffichee: (famille: string) => string,
): GroupeUnivers[] {
  const map = new Map<string, Map<string, FicheAudio[]>>();
  for (const f of fiches) {
    if (!map.has(f.univers)) map.set(f.univers, new Map());
    const familles = map.get(f.univers)!;
    if (!familles.has(f.famille)) familles.set(f.famille, []);
    familles.get(f.famille)!.push(f);
  }
  return [...map.keys()]
    .sort(comparerUnivers)
    .map((univers) => ({
      univers,
      familles: [...map.get(univers)!.keys()]
        .sort((a, b) => familleAffichee(a).localeCompare(familleAffichee(b)))
        .map((famille) => ({
          famille,
          defs: [...map.get(univers)!.get(famille)!].sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b))),
        })),
    }));
}
