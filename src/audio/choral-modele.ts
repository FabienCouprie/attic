// audio/choral-modele.ts — Un modèle harmonique appris, appliqué à un choral : le coût qu'il donne à une
// colonne et à un passage, dans la tonalité du choral.
//
// LE MODÈLE NOTE, LES RÈGLES PROPOSENT. Les colonnes candidates restent celles que les règles
// construisent (`audio/choral-candidats.ts`) : des accords de la tonalité, disposés dans les
// tessitures. Le modèle leur donne un coût, l'opposé de son score, et ce coût se mêle à celui des
// règles dans la part que l'harmoniseur règle.
//
// LES HAUTEURS SONT RAMENÉES À LA TONALITÉ DE RÉFÉRENCE DU MODÈLE, do ou la, du plus petit écart,
// comme les pièces du corpus l'ont été à l'apprentissage. Une hauteur qui en sort alors des bornes du
// modèle reçoit un coût que rien d'autre n'atteint.

import { scoreColonne, scorePassage } from "./champ-paires";
import { colonnesDeLaSequence, decalageVers } from "./champ-corpus";
import type { Sequence } from "./sequence";
import { dispositionDuModele, type ModeleHarmonique } from "./modele-harmonique";

/** Le coût d'une colonne ou d'un passage hors des bornes du modèle. */
export const COUT_HORS_BORNES = 50;

/** Un modèle prêt à noter les colonnes d'un choral en `tonique`. */
export interface ModeleApplique {
  decalage: number;
  colonne: (hauteurs: readonly number[]) => number;
  passage: (avant: readonly number[], apres: readonly number[]) => number;
}

export function appliquerModele(m: ModeleHarmonique, tonique: number): ModeleApplique {
  const d = dispositionDuModele(m);
  const decalage = decalageVers(tonique, m.tonique);
  const ramener = (h: readonly number[]) => h.map((x) => x + decalage);
  const cout = (s: number) => (Number.isFinite(s) ? -s : COUT_HORS_BORNES);
  return {
    decalage,
    colonne: (h) => cout(scoreColonne(d, m.theta, ramener(h))),
    passage: (a, b) => cout(scorePassage(d, m.theta, ramener(a), ramener(b))),
  };
}

/** Un passage d'une colonne à la suivante, avec le coût que le modèle lui donne. */
export interface PassageNote { debut: number; avant: number[]; apres: number[]; cout: number }

/**
 * Les `combien` passages d'un choral que le modèle trouve les plus coûteux, sur sa grille : ce qu'il
 * aurait le moins écrit. Les hauteurs rendues sont celles du choral, non ramenées.
 */
export function passagesLesPlusCouteux(m: ModeleHarmonique, s: Sequence, tonique: number, combien: number): PassageNote[] {
  const applique = appliquerModele(m, tonique);
  const colonnes = colonnesDeLaSequence(s, m.pas, 0, ELARGIES);
  const passages: PassageNote[] = [];
  for (let k = 1; k < colonnes.length; k++) {
    const avant = colonnes[k - 1].hauteurs, apres = colonnes[k].hauteurs;
    if (!avant || !apres) continue;
    passages.push({ debut: colonnes[k - 1].debut, avant, apres, cout: applique.passage(avant, apres) });
  }
  return passages.sort((a, b) => b.cout - a.cout || a.debut - b.debut).slice(0, Math.max(0, combien));
}

/** Des bornes qui ne refusent aucune hauteur : c'est le modèle, et non la lecture, qui dit hors bornes. */
const ELARGIES: readonly (readonly [number, number])[] = Array.from({ length: 4 }, () => [0, 127] as const);

/** Les rangs des `faisceau` colonnes de moindre coût, dans leur ordre d'origine ; tous à zéro. */
export function rangsDuFaisceau(couts: readonly number[], faisceau: number): number[] {
  const rangs = couts.map((_, i) => i);
  if (!(faisceau > 0) || couts.length <= faisceau) return rangs;
  return rangs.sort((a, b) => couts[a] - couts[b] || a - b).slice(0, faisceau).sort((a, b) => a - b);
}
