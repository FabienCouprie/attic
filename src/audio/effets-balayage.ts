// audio/effets-balayage.ts — Les filtres balayes : wah-wah et phaseur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { estCourbe, progressionPour, valeursParametre } from "./courbe";
import { cyclesAccumules, frequencesModulees, type BornesFrequence } from "./lfo";
import { vibrato } from "./effets-modulation";

export function wahwah(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  q: number,
  mix: number,
  courbe?: unknown,
  bornes?: { min: number; max: number },
  courbeFrequence?: unknown,
  bornesFrequence: BornesFrequence = { min: 0.5, max: 8 },
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;
  const mixVal = mix / 100;
  const freqMin = bornes?.min ?? 200;
  const freqMax = bornes?.max ?? 2500;

  // La fréquence centrale, échantillon par échantillon — une seule fois, et non par canal : elle ne
  // dépend pas du canal, et la recalculer deux fois coûterait deux fois pour le même résultat.
  const centres = new Float32Array(buffer.length);
  if (estCourbe(courbe)) {
    centres.set(valeursParametre(courbe, buffer.length, freqMin, {
      min: freqMin, max: freqMax, ...progressionPour({ unite: "Hz" }),
    }));
  } else if (estCourbe(courbeFrequence)) {
    // La vitesse du balayage suit une courbe. La courbe de position, si elle est branchée, garde
    // la priorité : elle remplace le LFO, et il n'y a plus alors de vitesse à régler.
    const u = cyclesAccumules(frequencesModulees(courbeFrequence, buffer.length, frequence, bornesFrequence)!, sr);
    for (let i = 0; i < buffer.length; i++) {
      const lfo = Math.sin(2 * Math.PI * u[i]);
      centres[i] = freqMin + (freqMax - freqMin) * ((1 + lfo * depth) / 2);
    }
  } else {
    for (let i = 0; i < buffer.length; i++) {
      const lfo = Math.sin((2 * Math.PI * frequence * i) / sr);
      centres[i] = freqMin + (freqMax - freqMin) * ((1 + lfo * depth) / 2);
    }
  }

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    // État du biquad passe-bande (cookbook RBJ)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < buffer.length; i++) {
      const fc = centres[i];
      const w0 = 2 * Math.PI * fc / sr;
      const cosW0 = Math.cos(w0);
      const sinW0 = Math.sin(w0);
      const alpha = sinW0 / (2 * q);

      // Coefficients passe-bande (constant 0 dB peak gain)
      const b0 = alpha;
      const b1 = 0;
      const b2 = -alpha;
      const a0 = 1 + alpha;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha;

      // Normaliser
      const nb0 = b0 / a0;
      const nb1 = b1 / a0;
      const nb2 = b2 / a0;
      const na1 = a1 / a0;
      const na2 = a2 / a0;

      // Appliquer le filtre
      const x0 = src[i];
      const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;

      // Mix entre signal filtré et signal original
      dst[i] = src[i] * (1 - mixVal) + y0 * mixVal;
    }
  }
  return resultat;
}

// Phaser : filtres passe-tout en cascade avec déphasage modulé par LFO.
export function phaser(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  etages: number,
  mix: number,
  courbeFrequence?: unknown,
  bornesFrequence: BornesFrequence = { min: 0.1, max: 4 },
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;
  const mixVal = mix / 100;
  const nbEtages = Math.max(1, Math.min(8, Math.round(etages)));
  const f = frequencesModulees(courbeFrequence, buffer.length, frequence, bornesFrequence);
  const u = f ? cyclesAccumules(f, sr) : null;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const apStates: { x1: number; y1: number }[] = Array.from({ length: nbEtages }, () => ({ x1: 0, y1: 0 }));

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const lfo = u ? Math.sin(2 * Math.PI * u[i]) : Math.sin(2 * Math.PI * frequence * t);
      const fc = 200 + 1800 * (1 + lfo * depth) / 2;
      const w0 = 2 * Math.PI * fc / sr;
      const tanW0 = Math.tan(w0 / 2);
      // Coefficient passe-tout du 1er ordre dont la transition de phase (90°)
      // est à fc : a = (tan−1)/(tan+1), NÉGATIF pour fc ≪ Nyquist. Le signe
      // inverse (1−tan)/(1+tan) place la transition près de Nyquist — le
      // balayage du LFO devenait inaudible (sortie ≈ entrée, mesuré à 1,6 %).
      const a = (tanW0 - 1) / (tanW0 + 1);

      let signal = src[i];
      for (let s = 0; s < nbEtages; s++) {
        const st = apStates[s];
        const y = a * signal + st.x1 - a * st.y1;
        st.x1 = signal;
        st.y1 = y;
        signal = y;
      }
      dst[i] = src[i] * (1 - mixVal) + (src[i] + signal) * mixVal * 0.5;
    }
  }
  return resultat;
}

// Vibrato : modulation de hauteur par LFO (delay modulé).
//
// LA COURBE DESSINE LE VIBRATO, ELLE NE LE REMPLACE PAS. Ce qu'elle pilote est la POSITION dans la
// plage que « Profondeur » fixe déjà : zéro tient le bas de la plage, un le haut, et l'on obtient
// ainsi le geste qu'on veut — une montée lente, un tremblement irrégulier, une hauteur suivie d'un
// autre son — au lieu de la seule oscillation sinusoïdale. Aucun réglage nouveau n'est donc
// nécessaire : la profondeur garde exactement le sens qu'elle avait.
/**
 * L'amplitude du décalage de lecture, en échantillons, qui donne à un vibrato de fréquence `f` un
 * écart de hauteur de `cents` au sommet.
 *
 * POURQUOI ELLE DÉPEND DE LA FRÉQUENCE. Lire le son avec un décalage D(t) = A · sin(2π f t) le
 * transpose du rapport 1 − D′(t) : la hauteur ne dépend pas du décalage, mais de sa VITESSE, soit
 * A · 2π f. À amplitude fixe — ce que faisait le vibrato —, doubler la vitesse doublait l'ampleur : à
 * 50 % et 5 Hz on entendait ±2,6 demi-tons au lieu du ±1 annoncé, et à 100 % au-delà de 16 Hz le
 * rapport devenait négatif, la lecture repartait à l'envers. L'amplitude est donc divisée par la
 * fréquence, et la profondeur dit enfin ce qu'elle promet, à toute vitesse.
 *
 * Une lecture décalée monte un peu moins qu'elle ne descend (1 + k contre 1 − k, en rapport) ; k est
 * choisi pour que la MOYENNE des deux crêtes, en cents, soit la profondeur : +189 et −213 cents pour
 * ±2 demi-tons.
 */
