// audio/effets-decoupe.ts — Octaveur et hacheur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { valeurA } from "./courbe";
import { cyclesAccumules, frequencesModulees, type BornesFrequence } from "./lfo";

export function octaver(
  buffer: AudioBuffer,
  octaveSup: number,
  octaveInf: number,
  mix: number | Float32Array,
): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  const nivSup = Math.max(0, Math.min(100, octaveSup)) / 100;
  const nivInf = Math.max(0, Math.min(100, octaveInf)) / 100;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let rectPrec = 0;   // bloqueur DC de la voix haute
    let dcEtat = 0;
    let polarite = 1;   // voix basse : ±1, bascule une période sur deux
    let prec = 0;

    for (let i = 0; i < buffer.length; i++) {
      const x = src[i];

      // Voix haute : |x| → bloqueur DC (y = x − x₁ + R·y₁). ×2 compense la
      // perte d'amplitude du redressement (composante 2f d'un |sin| ≈ 0,42).
      const rect = Math.abs(x);
      const hp = rect - rectPrec + 0.995 * dcEtat;
      rectPrec = rect;
      dcEtat = hp;

      // Voix basse : bascule de polarité à chaque passage à zéro montant.
      if (prec <= 0 && x > 0) polarite = -polarite;
      prec = x;

      const voix = hp * 2 * nivSup + x * polarite * nivInf;
      const mixVal = Math.max(0, Math.min(100, valeurA(mix, i))) / 100;
      dst[i] = x * (1 - mixVal) + voix * mixVal;
    }
  }
  return resultat;
}

// Chopper : gate rythmique qui coupe le son périodiquement.
export function chopper(
  buffer: AudioBuffer,
  frequence: number,
  duree: number,
  type: number,
  courbeFrequence?: unknown,
  bornesFrequence: BornesFrequence = { min: 1, max: 16 },
  /**
   * La part du signal que la coupe emporte, de 0 à 100. Le défaut vaut cent, c'est-à-dire la coupe
   * entière : c'est ce que le composant faisait avant que ce réglage existe, et tout graphe
   * enregistré sans lui doit sonner comme avant.
   */
  profondeur: number | Float32Array = 100,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const ratioOn = Math.max(1, Math.min(99, duree)) / 100;
  const fadeSamples = type === 1 ? Math.min(256, Math.floor(sr / frequence / 8)) : 1;
  // Avec une courbe, la position dans le cycle est intégrée, et le fondu suit la fréquence du
  // moment : un huitième de période, comme à fréquence fixe, plafonné à 256 échantillons.
  const f = frequencesModulees(courbeFrequence, buffer.length, frequence, bornesFrequence);
  const u = f ? cyclesAccumules(f, sr) : null;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const cyclePos = u ? u[i] : (t * frequence) % 1;
      const fadeRatio = !f ? fadeSamples / (sr / frequence)
        : (type === 1 ? Math.min(256, Math.floor(sr / f[i] / 8)) : 1) / (sr / f[i]);
      let gain: number;
      if (cyclePos < ratioOn) {
        gain = 1;
        if (type === 1) {
          const fadePos = cyclePos / ratioOn;
          if (fadePos < fadeRatio) gain = fadePos / fadeRatio;
        }
      } else {
        gain = 0;
        if (type === 1) {
          const offPos = (cyclePos - ratioOn) / (1 - ratioOn);
          if (offPos < fadeRatio) gain = 1 - offPos / fadeRatio;
        }
      }
      // LA FORME EST CHOISIE POUR RENDRE LE GAIN INTACT À PROFONDEUR PLEINE : à d valant un, elle
      // se réduit au gain lui-même, au bit près, là où « 1 − d(1 − gain) » y ajouterait l'erreur
      // de deux soustractions. À d nul elle vaut un, et le son passe sans être touché.
      const d = valeurA(profondeur, i) / 100;
      dst[i] = src[i] * (gain * d + (1 - d));
    }
  }
  return resultat;
}