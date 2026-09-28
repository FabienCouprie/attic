// audio/effets-mastering.ts — Limiteur, transitoires, largeur stereo, multibande, exciteur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { valeurA } from "./courbe";
import { compresser } from "./effets-dynamique";
import { bitcrusher } from "./effets-sibilance";

export function limiter(
  buffer: AudioBuffer,
  seuilDb: number,
  relachementMs: number,
  plafondDb: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const seuil = Math.pow(10, seuilDb / 20);
  const plafond = Math.pow(10, plafondDb / 20);
  const relachementCoeff = Math.exp(-1 / (Math.max(0.01, relachementMs) / 1000 * sr));
  const nch = buffer.numberOfChannels;

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let gain = 1;
  const makeup = seuil > 0 ? plafond / seuil : 1;
  for (let i = 0; i < buffer.length; i++) {
    let pic = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > pic) pic = a;
    }
    const gainCible = pic > seuil ? seuil / pic : 1;
    if (gainCible < gain) {
      gain = gainCible; // attaque instantanée
    } else {
      gain = relachementCoeff * gain + (1 - relachementCoeff) * gainCible;
    }
    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain * makeup;
  }

  return resultat;
}

// --- Transient shaper : contrôle indépendant de l'attaque et du sustain ------
// Deux détecteurs d'enveloppe (rapide pour les attaques, lent pour le corps) sont
// comparés. Leur différence donne une mesure « attaque / sustain » ; un gain en
// dB est appliqué selon la force de cette composante.

/**
 * LE GAIN D'ATTAQUE ACCEPTE UNE COURBE, lu par `valeurA` dans la boucle où il l'était déjà : il y
 * était converti en gain à chaque échantillon, si bien que le chemin ne change pas et que sans
 * courbe branchée la sortie est celle d'avant, au bit près.
 */
export function transientShaper(
  buffer: AudioBuffer,
  attaqueDb: number | Float32Array,
  sustainDb: number,
  tempsAttaqueMs: number,
  tempsSustainMs: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const coeffAttaque = Math.exp(-1 / (Math.max(0.01, tempsAttaqueMs) / 1000 * sr));
  const coeffSustain = Math.exp(-1 / (Math.max(0.01, tempsSustainMs) / 1000 * sr));
  const nch = buffer.numberOfChannels;

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let envAttaque = 0;
  let envSustain = 0;
  for (let i = 0; i < buffer.length; i++) {
    let pic = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > pic) pic = a;
    }
    envAttaque = coeffAttaque * envAttaque + (1 - coeffAttaque) * pic;
    envSustain = coeffSustain * envSustain + (1 - coeffSustain) * pic;

    const maxEnv = Math.max(envAttaque, envSustain, 1e-9);
    const force = (envAttaque - envSustain) / maxEnv;
    const attaqueGain = Math.pow(10, valeurA(attaqueDb, i) / 20);
    const sustainGain = Math.pow(10, sustainDb / 20);
    const gain = force > 0
      ? attaqueGain * force + sustainGain * (1 - force)
      : sustainGain;

    for (let c = 0; c < nch; c++) dst[c][i] = src[c][i] * gain;
  }

  return resultat;
}

// --- Largeur stéréo / Mid-Side : contrôle du champ stéréo ------------------
// Décode le signal en Mid/Side (centre = (L+R)/2, côtés = (L-R)/2), ajuste
// le gain de chaque composante, puis recode en L/R. Permet de passer au mono
// (Largeur=0), de conserver l'image stéréo d'origine (Largeur=100) ou de
// l'élargir (Largeur>100). Le gain Mid agit sur le centre indépendamment.

/**
 * LA LARGEUR ACCEPTE UNE COURBE : l'image se resserre et s'ouvre au fil du son, au lieu d'être posée
 * une fois. Le gain du centre n'est pas touché, de sorte que le niveau ne suit pas l'ouverture.
 */
export function ajusterLargeurStereo(
  buffer: AudioBuffer,
  largeurPct: number | Float32Array,
  midPct: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const dstL = resultat.getChannelData(0);
  const dstR = resultat.getChannelData(1);
  const srcL = buffer.getChannelData(0);
  const srcR = nch > 1 ? buffer.getChannelData(1) : srcL;

  const midGain = midPct / 100;

  for (let i = 0; i < buffer.length; i++) {
    const width = valeurA(largeurPct, i) / 100;
    const l = srcL[i];
    const r = srcR[i];
    const mid = (l + r) * 0.5 * midGain;
    const side = (l - r) * 0.5 * width;
    dstL[i] = mid + side;
    dstR[i] = mid - side;
  }

  return resultat;
}

// Helper : filtre Biquad via OfflineAudioContext.
async function filtreBiquadDynamique(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  frequency: number,
  Q = 0.707,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

function soustraireBuffers(a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: a.numberOfChannels, length: a.length, sampleRate: a.sampleRate });
  for (let c = 0; c < a.numberOfChannels; c++) {
    const srcA = a.getChannelData(c);
    const srcB = b.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < a.length; i++) dst[i] = srcA[i] - srcB[i];
  }
  return resultat;
}

// --- Compresseur multibande : 3 bandes (low / mid / high) ----------------------
// Split par crossover lowpass / highpass, mid = original - low - high, puis
// compression indépendante de chaque bande avec ses seuil/ratio propres.

export async function compresserMultiBande(
  buffer: AudioBuffer,
  seuilLow: number,
  ratioLow: number,
  seuilMid: number,
  ratioMid: number,
  seuilHigh: number,
  ratioHigh: number,
  attaqueMs: number,
  relachementMs: number,
  freqLow: number,
  freqHigh: number,
): Promise<AudioBuffer> {
  const low = await filtreBiquadDynamique(buffer, "lowpass", freqLow);
  const high = await filtreBiquadDynamique(buffer, "highpass", freqHigh);
  const mid = soustraireBuffers(soustraireBuffers(buffer, low), high);

  const lowComp = compresser(low, seuilLow, ratioLow, attaqueMs, relachementMs, 0);
  const midComp = compresser(mid, seuilMid, ratioMid, attaqueMs, relachementMs, 0);
  const highComp = compresser(high, seuilHigh, ratioHigh, attaqueMs, relachementMs, 0);

  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const dst = resultat.getChannelData(c);
    const l = lowComp.getChannelData(c);
    const m = midComp.getChannelData(c);
    const h = highComp.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) dst[i] = l[i] + m[i] + h[i];
  }
  return resultat;
}

// --- Exciter / Aural enhancer : distorsion asymétrique + passe-haut -----------
// Génère des harmoniques par saturation douce, ne garde que les hautes
// fréquences, puis mixe avec le signal original pour ajouter de la présence.

/**
 * LE MÉLANGE ACCEPTE UNE COURBE, et le scalaire en est le cas dégénéré, comme pour le bitcrusher :
 * `valeurA` lit la valeur de l'échantillon quelle que soit sa forme, et sans courbe branchée la
 * sortie est celle d'avant, au bit près.
 */
export async function exciter(
  buffer: AudioBuffer,
  amount: number,
  frequency: number,
  mix: number | Float32Array,
): Promise<AudioBuffer> {
  const dist = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = dist.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const x = src[i];
      dst[i] = x > 0 ? Math.tanh(amount * x) : Math.tanh(x);
    }
  }
  const wet = await filtreBiquadDynamique(dist, "highpass", frequency);
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const wetCh = wet.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const mixVal = Math.max(0, Math.min(100, valeurA(mix, i))) / 100;
      dst[i] = src[i] * (1 - mixVal) + wetCh[i] * mixVal;
    }
  }
  return resultat;
}



