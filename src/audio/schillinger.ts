// audio/schillinger.ts — Le rythme comme interférence de deux pulsations.
//
// D'après Joseph Schillinger, « The Schillinger System of Musical Composition », Carl Fischer,
// 1946, livre I : « Theory of Rhythm ». Schillinger appelle « résultante » le rythme qu'on obtient
// en superposant deux pulsations régulières et en relevant les instants où l'une ou l'autre frappe.
//
// CE QUI MANQUAIT, ET CE QUE CE N'EST PAS. Attic engendre déjà du rythme de six façons : euclidien
// (Bjorklund), Cantor, automate cellulaire, L-système, cribles de Xenakis, pulsars de Roads. La
// résultante n'est aucune d'elles, et le contraste avec l'euclidien est net : celui-ci RÉPARTIT
// des frappes le plus également possible sur un cycle, celle-là SUPERPOSE deux périodes et laisse
// le motif tomber où il tombe. L'un cherche la régularité, l'autre la produit par accident — et
// c'est de ce hasard réglé que sortent les figures que Schillinger poursuivait.
//
// LE MOTIF DE BASE. Deux pulsations de 3 et 2 sur un cycle de 6 frappent aux instants 0, 2, 3, 4
// pour l'une et l'autre réunies ; les écarts entre frappes successives donnent **2-1-1-2**, la
// figure la plus reconnaissable du système. Elle est PALINDROMIQUE, et ce n'est pas un hasard :
// la résultante de deux entiers premiers entre eux l'est toujours, par symétrie du cycle autour de
// son milieu.
//
// POURQUOI LE PLUS GRAND COMMUN DIVISEUR DÉCIDE DE TOUT. Le cycle dure `a·b` battements, mais si
// `a` et `b` partagent un facteur, les deux pulsations retombent ensemble avant la fin et le motif
// se répète à l'intérieur de lui-même. La résultante de 4 et 2 n'est donc pas plus riche que celle
// de 2 et 1 : c'est la même, jouée deux fois plus lentement. Le nœud le dit plutôt que de laisser
// croire à un réglage sans effet.

/**
 * La résultante de deux pulsations.
 *
 * Rend les instants d'attaque sur un cycle de `a · b` battements, chacune des deux pulsations
 * frappant à ses propres multiples. L'instant zéro appartient aux deux : c'est le seul où elles
 * coïncident, et il ouvre le cycle.
 */
export function resultante(a: number, b: number): number[] {
  const pa = Math.max(1, Math.round(a));
  const pb = Math.max(1, Math.round(b));
  const cycle = pa * pb;
  const instants = new Set<number>();
  for (let t = 0; t < cycle; t += pa) instants.add(t);
  for (let t = 0; t < cycle; t += pb) instants.add(t);
  return [...instants].sort((x, y) => x - y);
}

/** La durée du cycle d'une résultante. */
export const cycleResultante = (a: number, b: number) =>
  Math.max(1, Math.round(a)) * Math.max(1, Math.round(b));

/** Les écarts entre frappes successives, le cycle bouclé : la façon dont Schillinger l'écrit. */
export function ecarts(instants: readonly number[], cycle: number): number[] {
  if (instants.length === 0) return [];
  return instants.map((t, i) => (i + 1 < instants.length ? instants[i + 1] - t : cycle - t + instants[0]));
}

/** Le plus grand commun diviseur, qui décide si le motif se répète à l'intérieur de lui-même. */
export function pgcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a)), y = Math.abs(Math.round(b));
  while (y !== 0) { const t = y; y = x % y; x = t; }
  return x || 1;
}

// CE QUE CE MODULE NE FAIT PAS, ET POURQUOI. Schillinger ne s'arrête pas aux résultantes : il les
// enrichit par FRACTIONNEMENT, en faisant sonner une pulsation contre ses propres décalages, ce
// qui donne les structures auto-similaires pour lesquelles on rapproche son système des fractales.
// Ce procédé n'est pas ici. Une première version en a été écrite, puis retirée : elle rendait
// MOINS de frappes que la résultante dont elle partait, ce qu'un fractionnement ne peut pas faire.
// Les deux sources consultées — l'article encyclopédique et le guide de Frans Absil — nomment la
// technique sans en donner la règle, et le traité de 1946 n'était pas à portée. Livrer une
// opération portant le nom de Schillinger sans pouvoir la confronter à une figure publiée aurait
// été livrer une invention sous une autorité empruntée.

export interface AnalyseResultante {
  a: number;
  b: number;
  cycle: number;
  instants: number[];
  ecarts: number[];
  /** Vrai si les deux pulsations sont premières entre elles. */
  premieresEntreElles: boolean;
  /** Combien de fois le motif se répète à l'intérieur du cycle. */
  repetitions: number;
  /** Vrai si la suite des écarts se lit pareil dans les deux sens. */
  palindrome: boolean;
}

export function analyserResultante(a: number, b: number): AnalyseResultante {
  const pa = Math.max(1, Math.round(a));
  const pb = Math.max(1, Math.round(b));
  const cycle = cycleResultante(pa, pb);
  const instants = resultante(pa, pb);
  const e = ecarts(instants, cycle);
  const d = pgcd(pa, pb);
  return {
    a: pa, b: pb, cycle, instants, ecarts: e,
    premieresEntreElles: d === 1,
    repetitions: d,
    palindrome: e.join() === [...e].reverse().join(),
  };
}
