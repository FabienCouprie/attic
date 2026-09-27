// audio/passage-zero.ts — Caler une coupe là où l'onde passe par zéro.
//
// POURQUOI UNE COUPE CLAQUE. Couper une onde ailleurs qu'à zéro laisse une marche : l'échantillon
// vaut 0,7 puis, d'un coup, plus rien. Une marche est une discontinuité, et une discontinuité
// contient toutes les fréquences : c'est le clic. Le geste du monteur est donc de déplacer la coupe
// de quelques échantillons, jusqu'au passage par zéro le plus proche, où il n'y a pas de marche à
// faire disparaître.
//
// ET POURQUOI LE SENS DE LA PENTE COMPTE AUTANT QUE LE ZÉRO. Poser les deux bouts d'un raccord sur
// un zéro supprime la marche mais pas le coin : une onde qui montait et qui se met à descendre fait
// un angle, et un angle s'entend encore. Si TOUTES les frontières sont calées sur un zéro
// MONTANT, alors n'importe quel bout se raccorde proprement à n'importe quel autre, sans qu'on ait
// à se demander lesquels vont ensemble. C'est ce qui en fait un réglage par défaut et non une
// option parmi d'autres.
//
// LE STÉRÉO N'A PAS DE ZÉRO COMMUN, et c'est une limite du procédé, non de cette écriture. Deux
// voies décorrélées ne passent pas par zéro au même instant ; on cherche donc sur leur somme, et
// l'on rend ce qui reste sur chaque voie, pour que la mesure le dise au lieu de le taire.

/** Le sens dans lequel l'onde traverse zéro. */
export type Pente = "montante" | "descendante" | "indifferente";

/** Une zone, telle que les composants de montage se la passent. */
export interface Zone { debut: number; duree: number }

/** Ce qu'une frontière est devenue. */
export interface Deplacement {
  /** L'indice demandé, en échantillons. */
  voulu: number;
  /** Celui retenu, ou le même quand aucun passage n'a été trouvé. */
  retenu: number;
  /** La valeur de l'échantillon retenu, par voie : ce qui reste de la marche. */
  residus: number[];
  trouve: boolean;
}

/** Le passage par zéro traverse-t-il dans le sens voulu, entre `i` et `i + 1` ? */
function traverse(x: Float32Array, i: number, pente: Pente): boolean {
  const a = x[i], b = x[i + 1];
  if (pente === "montante") return a <= 0 && b > 0;
  if (pente === "descendante") return a >= 0 && b < 0;
  return (a <= 0 && b > 0) || (a >= 0 && b < 0);
}

/**
 * L'indice du passage par zéro le plus proche de `index`, ou `null` si aucun dans le rayon.
 *
 * ON REND L'ÉCHANTILLON LE PLUS PRÈS DE ZÉRO, non le premier des deux qui encadrent le passage :
 * entre 0,001 et −0,4, c'est le premier qu'il faut couper, et l'écart entre les deux fait toute la
 * hauteur de la marche qu'on cherche à supprimer.
 *
 * LA RECHERCHE VA DES DEUX CÔTÉS, en s'éloignant : la coupe bouge le moins possible, puisque
 * déplacer une frontière est déjà une entorse à ce que l'utilisateur a demandé.
 *
 * À ÉGALE DISTANCE, LE PASSAGE ANTÉRIEUR L'EMPORTE. Il faut bien trancher, et une règle fixe vaut
 * mieux qu'un hasard d'écriture : deux appels sur la même onde rendent ainsi toujours le même
 * indice, ce qu'un montage rejoué exige.
 */
export function passageLePlusProche(
  x: Float32Array, index: number, rayon: number, pente: Pente = "montante",
): number | null {
  const n = x.length;
  const borne = Math.max(0, Math.round(rayon));
  const candidat = (i: number): number | null => {
    if (i < 0 || i + 1 >= n) return null;
    if (!traverse(x, i, pente)) return null;
    return Math.abs(x[i]) <= Math.abs(x[i + 1]) ? i : i + 1;
  };
  const depart = Math.min(Math.max(0, Math.round(index)), Math.max(0, n - 1));
  for (let d = 0; d <= borne; d++) {
    const avant = candidat(depart - d);
    if (avant !== null) return avant;
    if (d === 0) continue;
    const apres = candidat(depart + d);
    if (apres !== null) return apres;
  }
  return null;
}

/** Ce que le calage a fait, de quoi le juger avant d'écouter. */
export interface RapportCalage {
  frontieres: number;
  calees: number;
  /** Frontières pour lesquelles aucun passage n'a été trouvé dans le rayon. */
  sansPassage: number;
  deplacementMoyenMs: number;
  deplacementMaxMs: number;
  /** La plus grande marche restante, toutes voies confondues, avant et après. */
  residuAvant: number;
  residuApres: number;
}

/**
 * Les zones dont chaque frontière est calée sur un passage par zéro.
 *
 * LES ZONES SONT RENDUES TRIÉES ET NON VIDES. Caler peut renverser une zone très courte, dont le
 * début passerait après la fin ; une telle zone est écartée plutôt que rendue à l'envers, et le
 * rapport la compte parmi celles qui n'ont pas trouvé de passage.
 */
export function calerZones(
  canaux: readonly Float32Array[],
  zones: readonly Zone[],
  o: { sampleRate: number; rayonMs: number; pente: Pente },
): { zones: Zone[]; deplacements: Deplacement[]; rapport: RapportCalage } {
  const sr = o.sampleRate;
  const rayon = Math.max(0, Math.round((o.rayonMs / 1000) * sr));
  const n = canaux[0]?.length ?? 0;
  // LA RECHERCHE SE FAIT SUR LA SOMME DES VOIES, faute de zéro commun à toutes. La somme est le
  // signal mono qu'on entendrait, et son passage par zéro est le meilleur compromis disponible.
  const somme = canaux.length === 1 ? canaux[0] : (() => {
    const s = new Float32Array(n);
    for (const c of canaux) for (let i = 0; i < n; i++) s[i] += c[i];
    return s;
  })();

  const deplacements: Deplacement[] = [];
  const sorties: Zone[] = [];
  let residuAvant = 0, residuApres = 0;

  const caler = (secondes: number): Deplacement => {
    const voulu = Math.min(Math.max(0, Math.round(secondes * sr)), Math.max(0, n - 1));
    const trouve = passageLePlusProche(somme, voulu, rayon, o.pente);
    const retenu = trouve ?? voulu;
    const residus = canaux.map((c) => c[retenu] ?? 0);
    for (const c of canaux) residuAvant = Math.max(residuAvant, Math.abs(c[voulu] ?? 0));
    for (const v of residus) residuApres = Math.max(residuApres, Math.abs(v));
    return { voulu, retenu, residus, trouve: trouve !== null };
  };

  let sansPassage = 0;
  let sommeEcarts = 0, pireEcart = 0, calees = 0;
  for (const z of zones) {
    const d1 = caler(z.debut);
    const d2 = caler(z.debut + z.duree);
    deplacements.push(d1, d2);
    for (const d of [d1, d2]) {
      if (!d.trouve) { sansPassage++; continue; }
      calees++;
      const ecart = Math.abs(d.retenu - d.voulu) / sr * 1000;
      sommeEcarts += ecart;
      pireEcart = Math.max(pireEcart, ecart);
    }
    const debut = d1.retenu / sr;
    const fin = d2.retenu / sr;
    if (fin > debut) sorties.push({ debut, duree: fin - debut });
    else sansPassage++;
  }

  return {
    zones: sorties,
    deplacements,
    rapport: {
      frontieres: zones.length * 2,
      calees,
      sansPassage,
      deplacementMoyenMs: calees > 0 ? sommeEcarts / calees : 0,
      deplacementMaxMs: pireEcart,
      residuAvant,
      residuApres,
    },
  };
}
