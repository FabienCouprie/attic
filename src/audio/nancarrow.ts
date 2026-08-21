// audio/nancarrow.ts — Canons de tempo, d'après les « Studies for Player Piano »
// de Conlon Nancarrow (à partir des années 1940).
//
// Nancarrow écrivait pour piano mécanique parce qu'aucun interprète ne pouvait
// jouer ce qu'il voulait entendre : le même motif superposé à lui-même à des
// tempos dans un rapport fixe — 3:4, 5:7, puis, dans les études les plus
// tardives, des rapports IRRATIONNELS comme √2:1 ou e:π.
//
// La différence avec le déphasage de Reich n'est pas de degré mais de nature, et
// elle est arithmétique :
//
//   - Reich fait dériver deux copies à des vitesses très légèrement différentes ;
//     l'écart croît lentement et les voix se retrouvent périodiquement.
//   - Nancarrow fixe un rapport franc, qui s'entend d'emblée comme deux tempos
//     distincts. Si ce rapport est RATIONNEL (p/q), les voix se retrouvent
//     régulièrement, au bout de q boucles pour l'une et p pour l'autre. S'il est
//     IRRATIONNEL, elles ne coïncident JAMAIS exactement — le canon ne se referme
//     pas, et c'est précisément ce que Nancarrow cherchait.
//
// Cette propriété n'est pas une figure de style : elle se calcule, donc elle se
// teste. Voir `periodeCanon`.

import { boucleSansCouture } from "./risset";

export interface OptionsCanon {
  dureeSec: number;
  /** Rapports de tempo, un par voix. La première vaut normalement 1. */
  rapports: number[];
  /** Étalement des voix dans l'image stéréo, de 0 à 1. */
  stereo?: number;
  fonduBoucleSec?: number;
}

/**
 * Approximation rationnelle d'un rapport, par fractions continues.
 *
 * Sert à décider si un canon se referme : tout nombre machine est rationnel, on
 * ne peut donc pas tester l'irrationalité en soi. Ce qu'on peut faire — et qui
 * correspond à ce que l'oreille perçoit — c'est chercher si le rapport s'écrit
 * avec un dénominateur PETIT. Un canon en 3:2 se referme en deux boucles ; un
 * canon en √2 ne se referme qu'au bout de 8119 boucles, autant dire jamais à
 * l'échelle d'une pièce.
 */
export function approximationRationnelle(x: number, denominateurMax = 10000): { p: number; q: number; erreur: number } {
  let meilleurP = Math.round(x), meilleurQ = 1;
  let meilleureErreur = Math.abs(x - meilleurP);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > denominateurMax) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const erreur = Math.abs(x - h1 / k1);
    if (erreur < meilleureErreur) { meilleurP = h1; meilleurQ = k1; meilleureErreur = erreur; }
    if (erreur === 0) break;
    const reste = b - a;
    if (reste < 1e-12) break;
    b = 1 / reste;
  }
  return { p: meilleurP, q: meilleurQ, erreur: meilleureErreur };
}

/**
 * Durée au bout de laquelle deux voix de rapport `rapport` se retrouvent
 * exactement en phase, pour une boucle de `boucleSec`.
 *
 * Pour un rapport p/q réduit, la coïncidence a lieu toutes les q boucles de la
 * voix lente. Le dénominateur est donc la grandeur qui décide de tout : petit,
 * le canon se referme et s'entend comme un motif ; grand, il ne se referme pas à
 * l'échelle humaine.
 */
export function periodeCanon(rapport: number, boucleSec: number, denominateurMax = 10000): number {
  if (rapport <= 0 || boucleSec <= 0) return Infinity;
  const { q, erreur } = approximationRationnelle(rapport, denominateurMax);
  // Un rapport qu'on ne sait approcher qu'imparfaitement même avec un grand
  // dénominateur ne se referme pas : on le déclare tel quel plutôt que de rendre
  // une période fantaisiste.
  if (erreur > 1e-9) return Infinity;
  return q * boucleSec;
}

function lire(canal: Float32Array, pos: number): number {
  const len = canal.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = canal[((i % len) + len) % len];
  const b = canal[(((i + 1) % len) + len) % len];
  return a * (1 - f) + b * f;
}

export function canonDeTempo(buffer: AudioBuffer, options: OptionsCanon): AudioBuffer {
  const sr = buffer.sampleRate;
  const nSorties = Math.max(1, Math.round(options.dureeSec * sr));
  const rapports = options.rapports.length ? options.rapports : [1];
  const stereo = Math.max(0, Math.min(1, options.stereo ?? 0.8));

  const src = boucleSansCouture(buffer, options.fonduBoucleSec ?? 0.05);
  const canalSrc = src.getChannelData(0);

  const out = new AudioBuffer({ numberOfChannels: 2, length: nSorties, sampleRate: sr });
  const gauche = out.getChannelData(0);
  const droite = out.getChannelData(1);

  for (let k = 0; k < rapports.length; k++) {
    // Rapport FIXE, contrairement au déphasage où l'écart est infime : ici les
    // deux tempos s'entendent d'emblée comme distincts, et c'est voulu.
    const vitesse = Math.max(1e-6, rapports[k]);
    const position = rapports.length === 1 ? 0.5 : k / (rapports.length - 1);
    const pan = 0.5 + (position - 0.5) * stereo;
    const gG = Math.cos((pan * Math.PI) / 2);
    const gD = Math.sin((pan * Math.PI) / 2);
    let pos = 0;
    for (let i = 0; i < nSorties; i++) {
      const v = lire(canalSrc, pos) / rapports.length;
      gauche[i] += v * gG;
      droite[i] += v * gD;
      pos += vitesse;
      if (pos >= canalSrc.length) pos -= canalSrc.length;
    }
  }
  return out;
}
