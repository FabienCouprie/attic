// audio/effets-modulation.ts — Vibrato, tremolo, echo : les modulations lentes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { estCourbe, progressionPour, valeursParametre } from "./courbe";
import { cyclesAccumules, formeLfo, frequencesModulees } from "./lfo";

export function amplitudeVibrato(cents: number, frequence: number, sr: number): number {
  const k = Math.sinh((Math.max(0, cents) * Math.LN2) / 1200);
  return (sr * k) / (2 * Math.PI * Math.max(1e-3, frequence));
}

/**
 * Lit la source avec un décalage variable, par interpolation linéaire. Sans ligne à retard : le rendu
 * est hors ligne, la source entière est là, et lire un peu en avant ne coûte rien. D'où ni latence —
 * l'ancienne ligne retardait tout de 10 ms — ni plafond — elle bornait l'amplitude à 10 ms, trop peu
 * pour un vibrato lent. Hors du son, on lit du silence.
 */
function lireDecale(src: Float32Array, decalages: Float64Array, dst: Float32Array): void {
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const pos = i - decalages[i];
    const i0 = Math.floor(pos), fr = pos - i0;
    const s0 = i0 >= 0 && i0 < n ? src[i0] : 0;
    const s1 = i0 + 1 >= 0 && i0 + 1 < n ? src[i0 + 1] : 0;
    dst[i] = s0 + (s1 - s0) * fr;
  }
}

export function vibrato(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  courbe?: unknown,
  courbeFrequence?: unknown,
  bornesFrequence: { min: number; max: number } = { min: 1, max: 10 },
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const maxCents = profondeur * 2;

  if (estCourbe(courbe)) {
    // LA COURBE DE POSITION DESSINE LE GESTE : elle remplace le LFO, et c'est sa pente qui fait la
    // hauteur. Ce chemin n'a pas de fréquence dont diviser l'amplitude ; il garde donc sa ligne à
    // retard et sa plage d'origine, au bit près.
    const delayMax = Math.ceil(sr * 0.02);
    const etendue = delayMax / 2;
    const retards = valeursParametre(courbe, buffer.length, etendue, {
      min: etendue * (1 - maxCents / 200), max: etendue * (1 + maxCents / 200),
    });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = resultat.getChannelData(c);
      const delayLine = new Float64Array(delayMax);
      let dlyPos = 0;
      for (let i = 0; i < buffer.length; i++) {
        const readPos = dlyPos - retards[i];
        const idx0 = Math.floor(readPos);
        const frac = readPos - idx0;
        const s0 = delayLine[((idx0 % delayMax) + delayMax) % delayMax];
        const s1 = delayLine[(((idx0 + 1) % delayMax) + delayMax) % delayMax];
        dst[i] = s0 + (s1 - s0) * frac;
        delayLine[dlyPos] = src[i];
        dlyPos = (dlyPos + 1) % delayMax;
      }
    }
    return resultat;
  }

  // Le décalage, échantillon par échantillon : un LFO dont l'amplitude suit la fréquence du moment.
  // Avec une courbe de fréquence, la phase est intégrée (`audio/lfo.ts`) — le vibrato qui s'accélère
  // garde alors la même largeur, ce qu'un chanteur fait naturellement.
  const decalages = new Float64Array(buffer.length);
  const f = frequencesModulees(courbeFrequence, buffer.length, frequence, bornesFrequence);
  if (f) {
    const u = cyclesAccumules(f, sr);
    for (let i = 0; i < buffer.length; i++) decalages[i] = amplitudeVibrato(maxCents, f[i], sr) * Math.sin(2 * Math.PI * u[i]);
  } else {
    const a = amplitudeVibrato(maxCents, frequence, sr);
    for (let i = 0; i < buffer.length; i++) decalages[i] = a * Math.sin((2 * Math.PI * frequence * i) / sr);
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) lireDecale(buffer.getChannelData(c), decalages, resultat.getChannelData(c));
  return resultat;
}

/**
 * Trémolo : modulation d'amplitude par un LFO.
 *
 * `profondeurs` est déjà rendu échantillon par échantillon (constant sans courbe). La fréquence, elle,
 * a deux chemins : sans courbe, le calcul direct d'origine, recopié tel quel pour ne pas changer un
 * bit ; avec une courbe, la phase intégrée d'`audio/lfo.ts`.
 */
export function tremolo(
  a: AudioBuffer,
  freq: number,
  profondeurs: Float32Array,
  forme: string,
  courbeFrequence?: unknown,
  bornesFrequence: { min: number; max: number } = { min: 1, max: 10 },
): AudioBuffer {
  const sr = a.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: a.length, sampleRate: sr });
  if (estCourbe(courbeFrequence)) {
    const u = cyclesAccumules(valeursParametre(courbeFrequence, a.length, freq, {
      min: bornesFrequence.min, max: bornesFrequence.max, ...progressionPour({ unite: "Hz" }),
    }), sr);
    const lfo = Float64Array.from(u, (x) => formeLfo(forme, x));
    for (let c = 0; c < a.numberOfChannels; c++) {
      const src = a.getChannelData(c);
      const dst = resultat.getChannelData(c);
      for (let i = 0; i < a.length; i++) dst[i] = src[i] * (1 - profondeurs[i] * (1 - lfo[i]) / 2);
    }
    return resultat;
  }
  for (let c = 0; c < a.numberOfChannels; c++) {
    const src = a.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < a.length; i++) {
      const t = i / sr;
      const phase = 2 * Math.PI * freq * t;
      let lfo: number;
      if (forme === "Carré" || forme === "Square") lfo = Math.sin(phase) >= 0 ? 1 : -1;
      else if (forme === "Triangle") lfo = 2 * Math.abs(2 * (freq * t - Math.floor(freq * t + 0.5))) - 1;
      else if (forme === "Sawtooth") lfo = 2 * (freq * t - Math.floor(freq * t)) - 1;
      else lfo = Math.sin(phase);
      const gain = 1 - profondeurs[i] * (1 - lfo) / 2;
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}

// Octaver : ajoute une voix à l'octave supérieure et/ou inférieure.
// Techniques monophoniques classiques des pédales analogiques :
//  - octave SUP : redressement double alternance (|x| double la fréquence),
//    débarrassé de sa composante continue par un bloqueur DC à un pôle ;
//  - octave INF : polarité inversée une période sur deux (compteur de passages
//    à zéro montants) — le produit x·(±1) contient la fondamentale f/2.
// L'ancienne version était inopérante : la « phase locale » du haut valait
// constamment 0,5 (jamais de retournement) et le bas ajoutait le signal un
// échantillon sur deux — une modulation à Nyquist, pas une octave grave.
/**
 * LE MÉLANGE ACCEPTE UNE COURBE : les octaves ajoutées entrent et sortent au fil du son. Les deux
 * voix sont calculées comme avant, seul leur dosage varie, si bien que sans courbe branchée la sortie
 * est celle d'avant, au bit près.
 */
