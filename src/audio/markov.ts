import { nomNote } from "./nom-note";
import type { Note } from "./note";
// audio/markov.ts — Chaîne de Markov apprise sur un MIDI.
//
// Attic sait déjà continuer une mélodie par réseau de neurones (Magenta). Il lui manquait
// le procédé simple, celui qu'on peut LIRE : compter, dans un morceau, combien de fois
// chaque note en suit une autre, puis rejouer en tirant au sort selon ces comptes. Le
// résultat ressemble à la source sans la copier, et surtout on peut ouvrir la table et
// voir pourquoi.
//
// L'ORDRE est ce qui distingue une imitation plate d'une imitation crédible. À l'ordre 1,
// on ne regarde que la note précédente : un morceau en do majeur ressort en do majeur,
// mais sans phrase. À l'ordre 2 ou 3, on regarde les deux ou trois précédentes, et les
// tournures du morceau réapparaissent — jusqu'à ce que, l'ordre montant encore, la chaîne
// n'ait plus le choix et recopie la source. C'est le compromis à régler, et le nœud le
// montre en affichant combien de contextes n'ont qu'une seule suite possible.

export type NoteMarkov = Note;

/** Une table : pour chaque contexte, les suites observées et leur nombre d'occurrences. */
export type TableMarkov = Map<string, Map<number, number>>;

export const cle = (contexte: number[]): string => contexte.join(",");

/**
 * Compte les enchaînements d'un morceau.
 *
 * Les notes sont prises dans l'ordre de leurs débuts ; deux notes qui commencent ensemble
 * — un accord — sont lues de la plus grave à la plus aiguë, ce qui fait du plaquage un
 * arpège aux yeux de la chaîne. C'est une simplification, et elle est dite.
 */
export function apprendre(notes: NoteMarkov[], ordre: number): TableMarkov {
  const k = Math.max(1, Math.min(4, Math.floor(ordre)));
  const suite = [...notes]
    .sort((a, b) => a.debut - b.debut || a.note - b.note)
    .map((n) => n.note);
  const table: TableMarkov = new Map();
  for (let i = 0; i + k < suite.length; i++) {
    const c = cle(suite.slice(i, i + k));
    const suivante = suite[i + k];
    const compte = table.get(c) ?? new Map<number, number>();
    compte.set(suivante, (compte.get(suivante) ?? 0) + 1);
    table.set(c, compte);
  }
  return table;
}

/** Tire une suite au sort selon les comptes observés. */
function tirer(compte: Map<number, number>, hasard: () => number): number {
  let total = 0;
  for (const n of compte.values()) total += n;
  let seuil = hasard() * total;
  for (const [note, n] of compte) {
    seuil -= n;
    if (seuil < 0) return note;
  }
  return [...compte.keys()][compte.size - 1];
}

/**
 * Engendre une suite de hauteurs.
 *
 * Quand un contexte n'a jamais été vu — cela arrive dès qu'on sort des sentiers du
 * morceau —, la chaîne REPART d'un contexte connu au lieu de s'arrêter. Une chaîne qui
 * s'interrompt au bout de quatre notes ne servirait à rien, et le silence n'expliquerait
 * pas pourquoi.
 */
export function engendrer(
  table: TableMarkov,
  ordre: number,
  longueur: number,
  hasard: () => number,
  depart?: number[],
): number[] {
  const contextes = [...table.keys()];
  if (contextes.length === 0) return [];
  const k = Math.max(1, Math.min(4, Math.floor(ordre)));

  const contexteAuHasard = () => contextes[Math.floor(hasard() * contextes.length)].split(",").map(Number);
  let contexte = depart && depart.length === k ? [...depart] : contexteAuHasard();
  const sortie = [...contexte];

  for (let i = sortie.length; i < Math.max(1, Math.floor(longueur)); i++) {
    const compte = table.get(cle(contexte));
    if (!compte || compte.size === 0) {
      contexte = contexteAuHasard();
      sortie.push(...contexte);
      continue;
    }
    const suivante = tirer(compte, hasard);
    sortie.push(suivante);
    contexte = [...contexte.slice(1), suivante];
  }
  return sortie.slice(0, Math.max(1, Math.floor(longueur)));
}

export interface StatsMarkov {
  contextes: number;
  transitions: number;
  /** Contextes n'ayant qu'une seule suite possible : la chaîne y recopie la source. */
  sansChoix: number;
  /** Part de contextes sans choix, de 0 à 1 — au-delà de 0,8, l'ordre est trop élevé. */
  partSansChoix: number;
}

export function statistiques(table: TableMarkov): StatsMarkov {
  let transitions = 0, sansChoix = 0;
  for (const compte of table.values()) {
    transitions += compte.size;
    if (compte.size === 1) sansChoix++;
  }
  const contextes = table.size;
  return {
    contextes,
    transitions,
    sansChoix,
    partSansChoix: contextes === 0 ? 0 : sansChoix / contextes,
  };
}

// LA TABLE EST FAITE POUR ÊTRE LUE, et une hauteur qui ne tombe pas sur un demi-ton doit s'y lire.
// Le nom était calculé ici, par un modulo douze qui prenait 9,5 pour rang de tableau : la ligne
// affichait `NaN` alors que l'apprentissage, lui, était juste. Le nom commun dit l'écart en cents,
// ce qui garde distinctes deux entrées voisines — sans quoi la table nommerait pareil deux lignes
// qu'elle compte à part.

/** La table, lisible : les contextes les plus fréquents et leurs suites. */
export function tableEnTexte(table: TableMarkov, maxLignes = 20): string {
  const lignes = [...table.entries()]
    .map(([c, compte]) => {
      let total = 0;
      for (const n of compte.values()) total += n;
      const suites = [...compte.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([note, n]) => `${nomNote(note)} ${Math.round((100 * n) / total)}%`)
        .join(", ");
      return { total, texte: `${c.split(",").map(Number).map(nomNote).join(" → ")} ⇒ ${suites}` };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, maxLignes)
    .map((l) => l.texte);
  return lignes.join("\n");
}
