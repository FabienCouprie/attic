// audio/choral-tranches.ts — Un choral à quatre voix découpé en tranches verticales.
//
// UNE TRANCHE À CHAQUE ATTAQUE, de quelque voix qu'elle vienne : c'est là que l'harmonie change, et
// c'est entre deux tranches voisines que se jugent les mouvements, quintes parallèles comprises. Une
// voix qui tient sa note d'une tranche à l'autre y garde sa hauteur ; une voix qui se tait y vaut
// `null`.
//
// LES TRANCHES DU TEMPS sont celles qui tombent sur un temps de noire. Les règles d'accord, doublure,
// accord complet, sensible et septième, ne se jugent que sur elles : une note de passage sur la
// croche faible n'est pas un accord, et la compter comme tel ferait de chaque choral de Bach une
// suite de fautes.
//
// LA PLACE D'UNE TRANCHE se dit en mesure et en temps, comptés à partir de un, le tempo donnant la
// durée d'une noire, `tempsParMesure` le nombre de noires d'une mesure, et `anacrouse` le nombre de
// noires avant la première barre, qui forment la mesure zéro. Une séquence ne porte pas sa métrique ;
// ce sont donc des réglages, qui ne changent que la façon de nommer une place.

import type { Note } from "./note";
import type { Sequence } from "./sequence";

export const VOIX_CHORAL = 4;

export interface Tranche {
  /** L'instant, en secondes. */
  debut: number;
  /** La hauteur de chaque voix, soprano d'abord ; `null` quand la voix se tait. */
  hauteurs: (number | null)[];
  /** Les voix qui attaquent une note à cet instant. */
  attaques: boolean[];
  /** La tranche tombe sur un temps de noire. */
  surLeTemps: boolean;
  mesure: number;
  temps: number;
}

export interface ChoralTranche {
  tranches: Tranche[];
  /** Les notes de chaque voix, dans l'ordre du temps, pour juger les mouvements mélodiques. */
  lignes: Note[][];
  /** Les notes qu'une autre note de la même voix recouvrait : la plus aiguë a été gardée. */
  recouvertes: number;
}

/** Les voix au-delà de la quatrième, que le découpage refuse. */
export const voixEnTrop = (seq: Sequence): number[] =>
  [...new Set(seq.notes.map((n) => n.voix ?? 0).filter((v) => v >= VOIX_CHORAL))].sort((a, b) => a - b);

/**
 * Découpe un choral dont les voix 0 à 3 sont le soprano, l'alto, le ténor et la basse.
 *
 * `tempo` est la noire par minute ; `tempsParMesure`, le nombre de noires d'une mesure ; `anacrouse`,
 * celui des noires avant la première barre.
 */
export function tranchesDuChoral(seq: Sequence, tempo: number, tempsParMesure: number, anacrouse = 0): ChoralTranche {
  const noire = 60 / Math.max(1, tempo);
  const lignes: Note[][] = Array.from({ length: VOIX_CHORAL }, (_, v) =>
    seq.notes.filter((n) => (n.voix ?? 0) === v).sort((a, b) => a.debut - b.debut || b.note - a.note));
  // Une note recouverte par une note plus aiguë de la même voix ne compte pas : une voix chante une
  // note à la fois.
  let recouvertes = 0;
  for (let v = 0; v < VOIX_CHORAL; v++) {
    const gardees: Note[] = [];
    for (const n of lignes[v]) {
      const avant = gardees[gardees.length - 1];
      if (avant && Math.abs(avant.debut - n.debut) < 1e-9) { recouvertes++; continue; }
      gardees.push(n);
    }
    lignes[v] = gardees;
  }
  const instants = [...new Set(lignes.flat().map((n) => Math.round(n.debut * 1e9) / 1e9))].sort((a, b) => a - b);
  const tranches = instants.map((t): Tranche => {
    const hauteurs = lignes.map((ligne) => {
      const n = ligne.find((x) => x.debut <= t + 1e-9 && x.fin > t + 1e-9);
      return n ? n.note : null;
    });
    const attaques = lignes.map((ligne) => ligne.some((x) => Math.abs(x.debut - t) < 1e-9));
    const enNoires = t / noire;
    const n = Math.max(1, tempsParMesure);
    const a = Math.max(0, Math.min(anacrouse, n - 1));
    // L'anacrouse occupe la fin d'une mesure zéro : ses noires en sont les derniers temps.
    const compte = Math.floor(enNoires + 1e-9) - a + n;
    return {
      debut: t, hauteurs, attaques,
      surLeTemps: Math.abs(enNoires - Math.round(enNoires)) < 1e-6,
      mesure: Math.floor(compte / n),
      temps: (compte % n) + 1,
    };
  });
  return { tranches, lignes, recouvertes };
}
