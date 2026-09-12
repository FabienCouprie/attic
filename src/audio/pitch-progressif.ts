// audio/pitch-progressif.ts — Montage d'une descente (ou montée) par paliers.
//
// Le son est répété n+1 fois, séparé par des silences, chaque reprise étant
// transposée d'un cran de plus que la précédente :
//
//     original ─ pause ─ −5 st ─ pause ─ −10 st ─ pause ─ −15 st
//
// Avec 3 boucles, 10 s de pause et −5 demi-tons, la sortie dure donc
// 4 × la durée d'origine + 30 s. Le pitch-shift de SoundTouch préservant la
// durée, chaque reprise fait exactement la longueur de la source.
//
// CHAQUE REPRISE EST CALCULÉE DEPUIS L'ORIGINAL, avec k fois le pas — jamais
// en ré-appliquant le décalage au résultat précédent. Les deux donnent la même
// hauteur, mais un pitch-shift est une opération avec pertes : l'enchaîner
// quatre fois accumulerait ses artefacts, et la dernière reprise sonnerait
// nettement moins bien que la première sans que le réglage l'explique.

/** Un palier du montage : où il commence, et de combien il est transposé. */
export interface Palier {
  /** Index du palier : 0 = l'original, non transposé. */
  index: number;
  /** Transposition totale par rapport à l'original, en demi-tons. */
  demiTons: number;
  /** Position de début dans la sortie, en secondes. */
  debutSec: number;
}

export interface OptionsProgression {
  /** Nombre de reprises APRÈS l'original. 3 boucles = 4 passages en tout. */
  boucles: number;
  /** Silence entre deux passages, en secondes. */
  pauseSec: number;
  /** Pas de transposition, en demi-tons. Négatif pour descendre. */
  progression: number;
  /** Durée de la source, en secondes. */
  dureeSourceSec: number;
}

/**
 * Calcule le plan du montage : un palier par passage, silence compris.
 *
 * Séparé du rendu pour être vérifiable sans lancer de pitch-shift — c'est
 * l'arithmétique des positions qui se trompe, pas le traitement du signal.
 */
export function planProgression(o: OptionsProgression): Palier[] {
  const boucles = Math.max(0, Math.floor(o.boucles));
  const pause = Math.max(0, o.pauseSec);
  const paliers: Palier[] = [];
  for (let k = 0; k <= boucles; k++) {
    paliers.push({
      index: k,
      // `k === 0` explicite : `0 * -5` vaut -0 en JavaScript, et un -0 qui
      // traîne dans une structure de données finit par surprendre.
      demiTons: k === 0 ? 0 : k * o.progression,
      // k passages et k pauses précèdent le palier k.
      debutSec: k * (o.dureeSourceSec + pause),
    });
  }
  return paliers;
}

/** Durée totale de la sortie, en secondes. */
export function dureeProgression(o: OptionsProgression): number {
  const boucles = Math.max(0, Math.floor(o.boucles));
  const pause = Math.max(0, o.pauseSec);
  // (n+1) passages, mais seulement n pauses : aucun silence après le dernier.
  return (boucles + 1) * o.dureeSourceSec + boucles * pause;
}

/**
 * Assemble le montage.
 *
 * @param source buffer d'origine
 * @param transposer (buffer, demiTons) => buffer transposé. Injecté pour que
 *        le montage soit testable sans SoundTouch, et appelé UNE SEULE FOIS
 *        par palier — jamais en chaîne.
 */
export function rendreProgression(
  source: AudioBuffer,
  o: Omit<OptionsProgression, "dureeSourceSec">,
  transposer: (buffer: AudioBuffer, demiTons: number) => AudioBuffer,
): AudioBuffer {
  const sr = source.sampleRate;
  const canaux = source.numberOfChannels;
  const plan = planProgression({ ...o, dureeSourceSec: source.duration });
  const total = Math.max(1, Math.round(dureeProgression({ ...o, dureeSourceSec: source.duration }) * sr));

  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: total, sampleRate: sr });

  for (const palier of plan) {
    // Le palier 0 est l'original : on ne le fait pas passer par le
    // transposeur, qui dégraderait le signal pour un décalage nul.
    const morceau = palier.demiTons === 0 ? source : transposer(source, palier.demiTons);
    const depart = Math.round(palier.debutSec * sr);

    for (let ch = 0; ch < canaux; ch++) {
      const dst = sortie.getChannelData(ch);
      // Une source mono alimente tous les canaux : sans cela, un son mono
      // transposé ne sortirait que sur la gauche.
      const src = morceau.getChannelData(Math.min(ch, morceau.numberOfChannels - 1));
      const n = Math.min(src.length, total - depart);
      for (let i = 0; i < n; i++) dst[depart + i] = src[i];
    }
  }

  return sortie;
}
