// audio/reetirage-dtw.ts — Réétire une piste le long d'un chemin d'alignement
// DTW (nœud Similarité audio), pour la faire suivre le tempo/timing d'une piste
// étalon SANS avoir besoin de l'audio de cette dernière — seul le chemin
// (une correspondance de trames) et son nombre de trames suffisent.
//
// Rééchantillonnage simple (interpolation linéaire) : la hauteur dérive
// localement partout où le débit change (comme une lecture à vitesse
// variable) — limite connue et documentée, pas un bug. Une version qui
// préserverait la hauteur demanderait un vocodeur de phase à taux variable
// dans le temps, un morceau à part entière (voir la doc du nœud).

import type { PointAlignement } from "./algebre";

/**
 * Pour chaque trame j de la piste étalon (0..nbFramesB-1), la position
 * (fractionnaire) correspondante en trames de la Piste A, dérivée du chemin
 * DTW. La formulation stricte de calculerDTW (chaque pas avance i et/ou j
 * d'exactement 0 ou 1, jamais de saut) garantit que le chemin couvre TOUJOURS
 * chaque j : jamais de trou. Si plusieurs i sont associés au même j (un
 * segment où B est "en attente" d'un passage plus rapide de A), on prend leur
 * moyenne plutôt que le premier ou le dernier — lisse la transition.
 */
export function correspondanceIPourJ(chemin: PointAlignement[], nbFramesB: number): Float64Array {
  const sommeI = new Float64Array(nbFramesB);
  const compte = new Float64Array(nbFramesB);
  for (const { i, j } of chemin) {
    if (j < 0 || j >= nbFramesB) continue;
    sommeI[j] += i;
    compte[j]++;
  }
  const iPourJ = new Float64Array(nbFramesB);
  let dernier = 0;
  for (let j = 0; j < nbFramesB; j++) {
    iPourJ[j] = compte[j] > 0 ? sommeI[j] / compte[j] : dernier;
    dernier = iPourJ[j];
  }
  return iPourJ;
}

/**
 * Réétire `audioA` le long de `chemin` : chaque échantillon de sortie est lu
 * (interpolation linéaire) à la position de `audioA` que le chemin associe à
 * cet instant de la piste étalon. `decalageEchantillonsA` replace le chemin
 * (calculé sur un extrait éventuellement recentré, voir `decalageExtraitCentre`)
 * dans le référentiel du buffer complet — lit directement dans `audioA`
 * d'origine, jamais besoin de reconstruire l'extrait analysé par Similarité audio.
 *
 * Durée de sortie ≈ nbFramesB × saut échantillons, AU DÉBIT DE `audioA` : ce
 * nœud n'a jamais accès à l'audio de la piste étalon (seulement son nombre de
 * trames, via le chemin), donc la sortie ne peut prendre que le débit de la
 * Piste A.
 */
// Limite connue : dans la toute dernière trame de sortie (< saut échantillons,
// ~12 ms à 44,1 kHz), il n'existe pas de trame "suivante" vers laquelle
// interpoler — la position lue se fige à celle de la dernière trame plutôt
// que de continuer la trajectoire. Artefact borné à la fin du signal, pas un
// bug ; négligeable en pratique (une poignée de ms sur une piste de plusieurs
// minutes).
export function reetirerParChemin(
  audioA: AudioBuffer,
  chemin: PointAlignement[],
  saut: number,
  decalageEchantillonsA = 0,
): AudioBuffer {
  if (chemin.length === 0) throw new Error("reetirerParChemin : chemin d'alignement vide");
  const nbFramesB = chemin[chemin.length - 1].j + 1;
  const iPourJ = correspondanceIPourJ(chemin, nbFramesB);
  const dernierFrame = iPourJ.length - 1;

  const longueurSortie = Math.max(1, Math.round(nbFramesB * saut));
  const sortie = new AudioBuffer({
    numberOfChannels: audioA.numberOfChannels,
    length: longueurSortie,
    sampleRate: audioA.sampleRate,
  });

  for (let c = 0; c < audioA.numberOfChannels; c++) {
    const src = audioA.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let n = 0; n < longueurSortie; n++) {
      const jFrac = n / saut;
      const j0 = Math.min(dernierFrame, Math.floor(jFrac));
      const j1 = Math.min(dernierFrame, j0 + 1);
      const fracJ = jFrac - j0;
      const iInterp = iPourJ[j0] * (1 - fracJ) + iPourJ[j1] * fracJ;

      const posEch = decalageEchantillonsA + iInterp * saut;
      const idx0 = Math.max(0, Math.min(src.length - 1, Math.floor(posEch)));
      const idx1 = Math.max(0, Math.min(src.length - 1, idx0 + 1));
      const fracEch = posEch - idx0;
      dst[n] = src[idx0] * (1 - fracEch) + src[idx1] * fracEch;
    }
  }
  return sortie;
}
