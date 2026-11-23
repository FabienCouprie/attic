// audio/modele-harmonique.ts — Un modèle harmonique appris : le champ à paires, sa grille, ses bornes, sa
// tonalité de référence et l'empreinte du corpus dont il vient.
//
// CE MODULE EST PUR. Le modèle se lit par `scoreColonne` et `scorePassage` (`audio/champ-paires.ts`),
// sur des hauteurs ramenées à sa tonalité de référence par `decalageVers` (`audio/champ-corpus.ts`).

import { disposer, NB_VOIX, type Disposition, type Voisinages } from "./champ-paires";
import type { ModeChamp } from "./champ-corpus";

export interface ModeleHarmonique {
  format: "attic-modele-harmonique";
  version: 1;
  /** Le mode appris, et la tonique de référence où ses pièces ont été ramenées. */
  mode: ModeChamp;
  tonique: number;
  /** La grille, en noires : 1 la noire, 0,5 la croche. */
  pas: number;
  bornes: [number, number][];
  voisinages: Voisinages;
  /** Les paramètres, dans l'ordre de `disposer(bornes, voisinages)`. */
  theta: Float64Array;
  /** L'empreinte du corpus appris, et ce qu'il en a gardé. */
  empreinte: string;
  pieces: number;
  colonnes: number;
}

export function estModeleHarmonique(v: unknown): v is ModeleHarmonique {
  if (!v || typeof v !== "object") return false;
  const m = v as ModeleHarmonique;
  return m.format === "attic-modele-harmonique" && m.version === 1 && Array.isArray(m.bornes) && m.bornes.length === NB_VOIX
    && m.theta instanceof Float64Array && m.theta.length === disposer(m.bornes, m.voisinages).taille;
}

/** La disposition des paramètres d'un modèle. */
export const dispositionDuModele = (m: ModeleHarmonique): Disposition => disposer(m.bornes, m.voisinages);
