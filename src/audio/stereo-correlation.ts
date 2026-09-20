// audio/stereo-correlation.ts — Goniomètre : ce que deux canaux font l'un de l'autre.
//
// Attic transforme beaucoup l'image stéréo — spatialisation, anneau de Möbius, binaural
// Resonance Audio, réverbérations — sans offrir aucun moyen de la contrôler. Or un mix
// peut se défaire à l'écoute mono : deux canaux en opposition de phase s'annulent, et
// l'on ne s'en aperçoit qu'en l'écoutant ailleurs.
//
// Deux mesures, toutes deux classiques en studio :
//
//   — la CORRÉLATION de Pearson entre L et R, de −1 à +1. +1 : les canaux sont le même
//     signal (mono). 0 : ils sont indépendants (stéréo large). −1 : ils sont opposés, et
//     la somme mono les annule.
//   — la figure de LISSAJOUS, ou goniomètre : chaque échantillon devient un point dont
//     l'abscisse est (R−L) et l'ordonnée (R+L), tourné de 45°. Un trait vertical est du
//     mono, un nuage rond une stéréo large, un trait horizontal une opposition de phase.

export interface MesureStereo {
  /** Corrélation de Pearson entre les deux canaux, de −1 à +1. */
  correlation: number;
  /** Niveau RMS de chaque canal, en dB. */
  rmsGauche: number;
  rmsDroite: number;
  /** Niveau RMS de la somme mono, en dB : ce qu'il resterait en mono. */
  rmsMono: number;
  /** Ce que la somme mono perd par rapport à la stéréo, en dB (positif = perte). */
  perteMono: number;
  /** Largeur : 0 = mono, 1 = canaux indépendants, au-delà = opposition de phase. */
  largeur: number;
}

const dB = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
const rms = (d: Float32Array | number[]) => {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, d.length));
};

/**
 * Mesure un couple de canaux.
 *
 * La corrélation vaut 1 par convention quand un canal est silencieux : deux signaux dont
 * l'un est nul ne « se contredisent » pas, et afficher 0 — donc « stéréo large » — pour
 * un mix muet à droite serait trompeur.
 */
export function mesurerStereo(gauche: Float32Array | number[], droite: Float32Array | number[]): MesureStereo {
  const n = Math.min(gauche.length, droite.length);
  let sommeLR = 0, sommeLL = 0, sommeRR = 0;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = gauche[i], r = droite[i];
    sommeLR += l * r;
    sommeLL += l * l;
    sommeRR += r * r;
    mono[i] = (l + r) / 2;
  }
  const denom = Math.sqrt(sommeLL * sommeRR);
  const correlation = denom < 1e-12 ? 1 : Math.max(-1, Math.min(1, sommeLR / denom));
  const rG = rms(gauche.slice(0, n) as Float32Array), rD = rms(droite.slice(0, n) as Float32Array);
  const rM = rms(mono);
  const stereo = Math.sqrt((rG * rG + rD * rD) / 2);
  return {
    correlation,
    rmsGauche: dB(rG),
    rmsDroite: dB(rD),
    rmsMono: dB(rM),
    perteMono: dB(stereo) - dB(rM),
    largeur: 1 - correlation,
  };
}

/** Ce que la mesure dit à l'utilisateur, en une phrase. */
export type VerdictStereo = "mono" | "etroit" | "large" | "opposition";

export function verdictStereo(correlation: number): VerdictStereo {
  if (correlation >= 0.95) return "mono";
  if (correlation >= 0.5) return "etroit";
  if (correlation > -0.2) return "large";
  return "opposition";
}

/**
 * Les points du goniomètre, sous-échantillonnés à `nbPoints` au plus.
 *
 * L'axe vertical porte la somme (ce qui survit en mono), l'horizontal la différence (ce
 * qui disparaît) : c'est l'orientation d'usage, celle où le mono est un trait vertical.
 * Les valeurs sont bornées à [−1, 1] pour rester dans le cadre.
 */
export function pointsGoniometre(
  gauche: Float32Array | number[],
  droite: Float32Array | number[],
  nbPoints = 2000,
): { x: number; y: number }[] {
  const n = Math.min(gauche.length, droite.length);
  if (n === 0) return [];
  const saut = Math.max(1, Math.floor(n / Math.max(1, nbPoints)));
  const points: { x: number; y: number }[] = [];
  const borne = (v: number) => Math.max(-1, Math.min(1, v));
  for (let i = 0; i < n; i += saut) {
    points.push({
      x: borne((droite[i] - gauche[i]) / Math.SQRT2),
      y: borne((droite[i] + gauche[i]) / Math.SQRT2),
    });
  }
  return points;
}

/**
 * Le goniomètre dessiné : nuage de Lissajous, axes, et la corrélation en clair.
 *
 * Un SVG et non un canevas : c'est ce que les autres nœuds d'analyse produisent, et il
 * se branche tel quel sur « Export SVG ».
 */
export function genererSvgGoniometre(
  mesure: MesureStereo,
  points: { x: number; y: number }[],
  taille = 320,
): string {
  const c = taille / 2;
  const rayon = c - 26;
  const couleur = mesure.correlation < -0.2 ? "#e76f51" : mesure.correlation > 0.95 ? "#e9c46a" : "#2a9d8f";
  const pts = points
    .map((p) => `${(c + p.x * rayon).toFixed(1)},${(c - p.y * rayon).toFixed(1)}`)
    .join(" ");
  // L'aiguille de corrélation, en bas : de −1 à gauche à +1 à droite.
  const xCorr = 30 + ((mesure.correlation + 1) / 2) * (taille - 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille + 54}" viewBox="0 0 ${taille} ${taille + 54}">
  <rect width="${taille}" height="${taille + 54}" fill="#12121a"/>
  <circle cx="${c}" cy="${c}" r="${rayon}" fill="none" stroke="#2e2e3a" stroke-width="1"/>
  <line x1="${c}" y1="${c - rayon}" x2="${c}" y2="${c + rayon}" stroke="#2e2e3a" stroke-width="1"/>
  <line x1="${c - rayon}" y1="${c}" x2="${c + rayon}" y2="${c}" stroke="#2e2e3a" stroke-width="1"/>
  <text x="${c}" y="16" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="middle">M</text>
  <text x="${taille - 8}" y="${c + 4}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">S</text>
  <polyline points="${pts}" fill="none" stroke="${couleur}" stroke-width="0.7" stroke-opacity="0.55"/>
  <line x1="30" y1="${taille + 20}" x2="${taille - 30}" y2="${taille + 20}" stroke="#2e2e3a" stroke-width="2"/>
  <circle cx="${xCorr.toFixed(1)}" cy="${taille + 20}" r="5" fill="${couleur}"/>
  <text x="30" y="${taille + 40}" fill="#6b6b7b" font-family="system-ui" font-size="10">-1</text>
  <text x="${c}" y="${taille + 40}" fill="#9a9aae" font-family="system-ui" font-size="11" text-anchor="middle">r = ${mesure.correlation.toFixed(2)}</text>
  <text x="${taille - 30}" y="${taille + 40}" fill="#6b6b7b" font-family="system-ui" font-size="10" text-anchor="end">+1</text>
</svg>`;
}
