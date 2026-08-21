// audio/pulsars.ts — Synthèse par pulsars, d'après Curtis Roads
// (« Microsound », 2001).
//
// Un pulsar est une brève forme d'onde — le PULSARET — suivie de silence, le
// tout répété. Deux durées le décrivent, et c'est là tout son intérêt :
//
//   - la PÉRIODE de répétition, dont l'inverse donne la fondamentale entendue ;
//   - la durée du pulsaret, dont l'inverse donne la position du FORMANT, c'est-à-dire
//     la région du spectre où l'énergie se concentre.
//
// Ces deux grandeurs sont indépendantes. On peut faire descendre la fondamentale
// d'une octave sans déplacer le formant, ou déplacer le formant sans changer la
// note — ce qu'aucun instrument acoustique ne permet, et ce qu'une granulation
// classique ne permet pas non plus, puisque sa grille temporelle et le contenu
// de ses grains restent liés.
//
// Quand la durée du pulsaret dépasse la période, les pulsars se chevauchent et
// le procédé cesse d'en être un : on retombe sur une simple forme d'onde
// continue. Le rapport des deux — le « cycle de service » — est donc borné, et
// c'est une contrainte du modèle, pas une limitation d'implémentation.

export interface OptionsPulsars {
  dureeSec: number;
  sampleRate: number;
  /** Fondamentale entendue, en Hz : le nombre de pulsars par seconde. */
  fondamentaleHz: number;
  /** Position du formant, en Hz : l'inverse de la durée du pulsaret. */
  formantHz: number;
  /** Forme du pulsaret. */
  forme?: "sinus" | "carre" | "dents-de-scie";
  /** Amplitude, de 0 à 1. */
  amplitude?: number;
}

/**
 * Durée du pulsaret, en secondes, pour un formant donné.
 *
 * Le pulsaret contient UNE période de la forme d'onde : sa durée est donc
 * l'inverse de la fréquence de formant. C'est cette relation qui rend le
 * procédé mesurable — on prédit où sera le pic spectral.
 */
export function dureePulsaret(formantHz: number): number {
  return 1 / Math.max(1e-6, formantHz);
}

/**
 * Cycle de service : part de la période occupée par le pulsaret.
 *
 * Au-delà de 1, les pulsars se chevaucheraient et le procédé se dissoudrait en
 * une forme d'onde continue. `pulsars` plafonne donc la durée du pulsaret à une
 * période — ce qui revient à dire que le formant ne peut pas descendre sous la
 * fondamentale.
 */
export function cycleDeService(fondamentaleHz: number, formantHz: number): number {
  const periode = 1 / Math.max(1e-6, fondamentaleHz);
  return Math.min(1, dureePulsaret(formantHz) / periode);
}

function echantillonPulsaret(phase: number, forme: string): number {
  switch (forme) {
    case "carre": return phase < 0.5 ? 1 : -1;
    case "dents-de-scie": return 2 * phase - 1;
    default: return Math.sin(2 * Math.PI * phase);
  }
}

export function pulsars(options: OptionsPulsars): AudioBuffer {
  const sr = options.sampleRate;
  const n = Math.max(1, Math.round(options.dureeSec * sr));
  const fondamentale = Math.max(0.1, options.fondamentaleHz);
  const formant = Math.max(fondamentale, options.formantHz);
  const amplitude = Math.max(0, Math.min(1, options.amplitude ?? 0.8));
  const forme = options.forme ?? "sinus";

  const periode = sr / fondamentale;
  // Plafonné à la période : au-delà, les pulsars se chevaucheraient (voir
  // `cycleDeService`). C'est aussi pourquoi `formant` est borné par la
  // fondamentale ci-dessus.
  const largeur = Math.min(periode, Math.max(2, sr * dureePulsaret(formant)));

  const out = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = out.getChannelData(0);

  for (let i = 0; i < n; i++) {
    const positionDansPeriode = i % periode;
    if (positionDansPeriode >= largeur) continue;   // le silence entre deux pulsars
    const phase = positionDansPeriode / largeur;
    // Fenêtre en cloche sur le pulsaret : sans elle, ses bords francs
    // produiraient un clic à chaque répétition, et le spectre serait dominé par
    // ces discontinuités plutôt que par le formant.
    const fenetre = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
    d[i] = amplitude * fenetre * echantillonPulsaret(phase, forme);
  }
  return out;
}
