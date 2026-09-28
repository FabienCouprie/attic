// audio/effets-bruit.ts — Le profil d'un bruit, et sa reduction.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { fft } from "./fft";
import { TAILLE_FFT_BRUIT, SAUT_FFT_BRUIT, creerFenetreHann } from "./commun";
import { amplifier } from "./effets-dynamique";

export function calculerProfilBruit(buffer: AudioBuffer): Float32Array {
  const fenetre = creerFenetreHann(TAILLE_FFT_BRUIT);
  const nbBins = TAILLE_FFT_BRUIT / 2 + 1;
  const somme = new Float64Array(nbBins);
  let nbTrames = 0;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    // On pad avec des zéros pour que les très courts extraits de bruit
    // (moins d'une trame FFT) produisent quand même un profil non vide.
    const donnees = canal.length < TAILLE_FFT_BRUIT
      ? (() => {
          const p = new Float32Array(TAILLE_FFT_BRUIT);
          p.set(canal);
          return p;
        })()
      : canal;
    for (let debut = 0; debut + TAILLE_FFT_BRUIT <= donnees.length; debut += SAUT_FFT_BRUIT) {
      const re = new Float64Array(TAILLE_FFT_BRUIT);
      const im = new Float64Array(TAILLE_FFT_BRUIT);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) re[i] = donnees[debut + i] * fenetre[i];
      fft(re, im, false);
      for (let b = 0; b < nbBins; b++) somme[b] += Math.hypot(re[b], im[b]);
      nbTrames++;
    }
  }

  const profil = new Float32Array(nbBins);
  if (nbTrames > 0) for (let b = 0; b < nbBins; b++) profil[b] = somme[b] / nbTrames;
  return profil;
}



export function reduireBruit(buffer: AudioBuffer, profil: Float32Array, force: number, plancherRelatif = 0.01): AudioBuffer {
  const fenetre = creerFenetreHann(TAILLE_FFT_BRUIT);
  const nbBins = TAILLE_FFT_BRUIT / 2 + 1;
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  // Soustraction spectrale en puissance (standard) : on estime le bruit par le
  // profil et on soustrait sa puissance à celle du signal bruité. Le plancher
  // est un pourcentage de la puissance du signal bruité, donc il ne peut pas
  // amplifier quand le profil surestime le bruit local.
  const plancher = Math.max(0, Math.min(1, plancherRelatif));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    // Pour les extraits courts on centre le signal dans une trame FFT :
    // évite l'amplification dangereuse aux bords de la fenêtre Hann
    // (overlap-add) quand le signal ne couvre pas une trame complète.
    const estCourt = canal.length < TAILLE_FFT_BRUIT;
    const entree = estCourt ? new Float32Array(TAILLE_FFT_BRUIT) : canal;
    const offsetCourt = estCourt ? Math.floor((TAILLE_FFT_BRUIT - canal.length) / 2) : 0;
    if (estCourt) entree.set(canal, offsetCourt);

    const sortie = new Float64Array(estCourt ? TAILLE_FFT_BRUIT : buffer.length);
    const enveloppe = new Float64Array(estCourt ? TAILLE_FFT_BRUIT : buffer.length);
    for (let debut = 0; debut + TAILLE_FFT_BRUIT <= entree.length; debut += SAUT_FFT_BRUIT) {
      const re = new Float64Array(TAILLE_FFT_BRUIT);
      const im = new Float64Array(TAILLE_FFT_BRUIT);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) re[i] = entree[debut + i] * fenetre[i];
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);

        const phase = Math.atan2(im[b], re[b]);
        const profilBin = profil[b] ?? 0;
        // On soustrait le bruit de la magnitude de la trame courante, pas de la
        // version lissée, pour un débruitage plus efficace sur le bruit blanc.
        const power = magnitude * magnitude;
        const noisePower = profilBin * profilBin;
        const cleanPower = Math.max(power - noisePower * force, power * plancher);
        const gain = power > 1e-9 ? Math.sqrt(cleanPower / power) : 0;
        const nouvelleMagnitude = magnitude * gain;

        re[b] = nouvelleMagnitude * Math.cos(phase);
        im[b] = nouvelleMagnitude * Math.sin(phase);
        if (b > 0 && b < TAILLE_FFT_BRUIT - b) {
          re[TAILLE_FFT_BRUIT - b] = re[b];
          im[TAILLE_FFT_BRUIT - b] = -im[b];
        }
      }

      fft(re, im, true);
      for (let i = 0; i < TAILLE_FFT_BRUIT; i++) {
        sortie[debut + i] += re[i] * fenetre[i];
        enveloppe[debut + i] += fenetre[i] * fenetre[i];
      }
    }

    const canalSortie = resultat.getChannelData(c);
    if (estCourt) {
      for (let i = 0; i < canal.length; i++) {
        const j = offsetCourt + i;
        canalSortie[i] = enveloppe[j] > 1e-6 ? sortie[j] / enveloppe[j] : 0;
      }
    } else {
      for (let i = 0; i < sortie.length; i++) {
        canalSortie[i] = enveloppe[i] > 1e-6 ? sortie[i] / enveloppe[i] : 0;
      }
    }
  }

  return resultat;
}

function appliquerNotch(signal: Float32Array, sr: number, f: number, Q: number): void {
  const w0 = (2 * Math.PI * f) / sr;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);
  const a0 = 1 + alpha;
  const a1 = (-2 * cosw0) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = 1 / a0;
  const b1 = (-2 * cosw0) / a0;
  const b2 = 1 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    signal[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
}

export function reduireBruitNotches(buffer: AudioBuffer, profil: Float32Array, seuilMult = 2, maxNotches = 50, Q = 10): AudioBuffer {
  const sr = buffer.sampleRate;
  const df = sr / TAILLE_FFT_BRUIT;
  const moy = profil.reduce((a, b) => a + b, 0) / profil.length;
  const seuil = Math.max(1e-9, moy * seuilMult);
  const candidats: { bin: number; f: number; mag: number }[] = [];
  for (let i = 0; i < profil.length; i++) {
    const f = i * df;
    if (f > 50 && f < sr / 2 - 100 && profil[i] > seuil) {
      candidats.push({ bin: i, f, mag: profil[i] });
    }
  }
  candidats.sort((a, b) => b.mag - a.mag);
  const notches = candidats.slice(0, maxNotches).map((c) => c.f);

  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    dst.set(src);
    for (const f of notches) {
      appliquerNotch(dst, sr, f, Q);
    }
  }
  return resultat;
}



// Défauts recalibrés (2026-07-18) : avec memoireSec = 1, la mémoire de crête
// décroissait de 60 dB/s — PLUS VITE qu'une traîne de réverb réelle (20 à
// 50 dB/s selon le RT60). Le rapport magnitude/crête restait donc ≈ 1 et le
// gain valait 1 partout : l'effet était un passe-plat exact (mesuré :
// réduction de traîne = 1,00). À 3 s (20 dB/s), une traîne typique passe
// sous la crête mémorisée et se fait atténuer ; un son tenu (orgue) garde
// sa crête et reste intact. Seuil relevé à 50 % (−6 dB) en cohérence.
// Ajustement 2026-07-19 : mémoire portée à 5 s pour rester au-dessus des
// réverbérations longues (RT60 jusqu'à ~3 s). Ainsi le rapport magnitude/crête
// descend suffisamment pour que la traîne soit atténuée, sans toucher aux
// notes tenues proches de la crête.
