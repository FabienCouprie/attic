// ui/reponse-filtre-calcul.ts — La réponse en fréquence d'un filtre biquadratique, et son enveloppe
// quand un réglage est modulé.
//
// POURQUOI CE MODULE EXISTE. Le calcul vivait dans `ReponseFiltre.tsx`, donc hors de portée de tout
// test : `vite.config.ts` ne ramasse que les fichiers `.test.ts`, et un test en `.test.tsx` ne
// serait jamais exécuté. C'est la même raison qui a sorti l'arithmétique de la ligne de temps.
//
// ET CE QUI A ÉTÉ TROUVÉ EN L'EN SORTANT, relevé par Fabien : la vue lisait les RÉGLAGES seuls.
// Quand une courbe pilote la coupure, le filtre balaie de « Modulation min » à « Modulation max »,
// et la courbe dessinée montrait pourtant la coupure fixe. Mesuré : deux filtres identiques, l'un
// modulé par une rampe, ouvraient de 44,5 dB à 3300 Hz entre le début et la fin du son, et leurs
// deux tracés étaient identiques AU PIXEL PRÈS, zéro différent sur 4251 comparés. La vue montrait
// donc une réponse que le filtre n'avait jamais.
//
// CE QU'ON MONTRE À LA PLACE EST UNE ENVELOPPE. Un filtre qui balaie n'a pas UNE réponse : il en a
// une par instant. Dessiner celle du milieu serait aussi faux que celle du repos ; dessiner les
// bornes de ce qu'il traverse dit la vérité de ce qu'on entend, et se lit d'un coup d'œil.

/** La fréquence d'échantillonnage sur laquelle la réponse est calculée. */
export const SR = 44100;

/** Les quatre types, tels que le réglage « Type » les nomme. */
export type TypeFiltre = "Passe-bas" | "Passe-haut" | "Passe-bande" | "Coupe-bande";

/**
 * Gain, en décibels, d'un biquad RBJ à la fréquence `f`.
 *
 * Formules de Robert Bristow-Johnson, « Cookbook formulae for audio EQ biquad filter
 * coefficients ». `a0` est normalisé à un, et la réponse se lit sur le cercle unité.
 */
export function reponseDb(type: string, f0: number, Q: number, f: number): number {
  const w0 = (2 * Math.PI * f0) / SR, cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * Q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "Passe-haut") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === "Passe-bande") { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else if (type === "Coupe-bande") { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; } // Passe-bas
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const w = (2 * Math.PI * f) / SR, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nRe = b0 + b1 * c1 + b2 * c2, nIm = -(b1 * s1 + b2 * s2);
  const dRe = 1 + a1 * c1 + a2 * c2, dIm = -(a1 * s1 + a2 * s2);
  return 20 * Math.log10(Math.hypot(nRe, nIm) / Math.hypot(dRe, dIm) + 1e-9);
}

/** Une grandeur du filtre : fixe quand rien ne la module, bornée quand une courbe la pilote. */
export interface Plage {
  min: number;
  max: number;
}

/** La plage d'un réglage : les deux bornes si une courbe le pilote, la valeur seule sinon. */
export function plageDe(valeur: number, module: boolean, min: number, max: number): Plage {
  return module ? { min: Math.min(min, max), max: Math.max(min, max) } : { min: valeur, max: valeur };
}

/** Vrai si cette plage ne couvre qu'une valeur : rien ne la module. */
export const plageFixe = (p: Plage): boolean => p.min === p.max;

/**
 * Ce que le filtre peut faire à la fréquence `f`, du plus bas au plus haut.
 *
 * ON PARCOURT LES QUATRE COINS, et non la seule diagonale : quand la coupure ET la résonance sont
 * modulées, rien ne dit qu'elles bougent ensemble, et deux courbes indépendantes atteignent les
 * combinaisons croisées. Les coins bornent donc ce qui est atteignable, et l'enveloppe ne promet
 * jamais moins que ce qu'on entendra.
 *
 * Quand les deux plages sont fixes, les quatre coins se confondent et l'enveloppe se referme sur la
 * réponse unique : le tracé d'un filtre non modulé ne change donc pas d'un pixel.
 */
export function enveloppeReponse(type: string, coupure: Plage, q: Plage, f: number): Plage {
  let min = Infinity, max = -Infinity;
  for (const f0 of coupure.min === coupure.max ? [coupure.min] : [coupure.min, coupure.max]) {
    for (const qq of q.min === q.max ? [q.min] : [q.min, q.max]) {
      const db = reponseDb(type, f0, qq, f);
      if (db < min) min = db;
      if (db > max) max = db;
    }
  }
  return { min, max };
}

/** Une fréquence écrite court : 400, ou 6k, ou 1.5k. */
export function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f % 1000 === 0 ? 0 : 1)}k` : `${Math.round(f)}`;
}

/** Ce que la légende écrit d'une plage : une valeur, ou les deux bornes qu'elle traverse. */
export function legendePlage(p: Plage, unite: (v: number) => string): string {
  return plageFixe(p) ? unite(p.min) : `${unite(p.min)}→${unite(p.max)}`;
}
