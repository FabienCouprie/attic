// audio/effets-mastering.ts — Limiteur, transitoires, largeur stereo, multibande, exciteur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { poserParam } from "./automation";
import { coefficientSuiveur, valeurA, valeurTransformee } from "./courbe";
import { compresser } from "./effets-dynamique";

export function limiter(
  buffer: AudioBuffer,
  seuilDb: number | Float32Array,
  relachementMs: number | Float32Array,
  plafondDb: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  // `valeurTransformee` ne calcule qu'une fois ce qui ne bouge pas : deux valeurs fixes gardent
  // leurs deux `pow` uniques, exactement comme avant que ces réglages s'ouvrent.
  const seuilA = valeurTransformee(seuilDb, (v) => Math.pow(10, v / 20));
  const plafondA = valeurTransformee(plafondDb, (v) => Math.pow(10, v / 20));
  // Un scalaire garde son exponentielle unique ; une courbe en paie une par échantillon.
  const relachementCoeff = coefficientSuiveur(relachementMs, sr);
  const nch = buffer.numberOfChannels;

  const resultat = new AudioBuffer({ numberOfChannels: nch, length: buffer.length, sampleRate: sr });
  const src: Float32Array[] = [];
  const dst: Float32Array[] = [];
  for (let c = 0; c < nch; c++) {
    src.push(buffer.getChannelData(c));
    dst.push(resultat.getChannelData(c));
  }

  let gain = 1;
  for (let i = 0; i < buffer.length; i++) {
    const seuil = seuilA(i);
    // LE RATTRAPAGE SUIT LES DEUX RÉGLAGES, donc il se recalcule avec eux : c'est le rapport du
    // plafond au seuil, et le laisser hors de la boucle figerait la sortie sur leurs valeurs de
    // départ pendant que la courbe commande.
    const makeup = seuil > 0 ? plafondA(i) / seuil : 1;
    let pic = 0;
    for (let c = 0; c < nch; c++) {
      const a = Math.abs(src[c][i]);
      if (a > pic) pic = a;
    }
    const gainCible = pic > seuil ? seuil / pic : 1;
    if (gainCible < gain) {
      gain = gainCible; // attaque instantanée
    } else {
      const k = relachementCoeff(i);
      gain = k * gain + (1 - k) * gainCible;
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
  tempsAttaqueMs: number | Float32Array,
  tempsSustainMs: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  // Les deux constantes de temps acceptent une courbe. `coefficientSuiveur` est déjà l'aide du
  // limiteur, plus haut dans ce fichier : un nombre y garde son exponentielle unique.
  const coeffAttaque = coefficientSuiveur(tempsAttaqueMs, sr);
  const coeffSustain = coefficientSuiveur(tempsSustainMs, sr);
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
    const cA = coeffAttaque(i);
    const cS = coeffSustain(i);
    envAttaque = cA * envAttaque + (1 - cA) * pic;
    envSustain = cS * envSustain + (1 - cS) * pic;

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
  // LA FRÉQUENCE DE COUPURE EST UN `AudioParam`, et c'est tout ce qu'il faut : `poserParam` pose un
  // nombre comme avant, au bit près, et une courbe comme une automation. Le filtre lui-même ne
  // change pas d'un cas à l'autre.
  frequency: number | Float32Array,
  Q = 0.707,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  poserParam(filter.frequency, frequency, buffer.length / buffer.sampleRate);
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
  // LES HUIT PASSENT AUX TROIS COMPRESSEURS SANS RIEN DE PLUS. Ce composant n'a pas de boucle à
  // lui : il découpe en trois bandes, appelle `compresser` sur chacune et additionne. Ouvrir ses
  // huit réglages ne demande donc que de laisser passer ce que `compresser` accepte déjà, et la
  // paire attaque / relâchement est commune aux trois bandes, comme sa documentation le dit.
  seuilLow: number | Float32Array,
  ratioLow: number | Float32Array,
  seuilMid: number | Float32Array,
  ratioMid: number | Float32Array,
  seuilHigh: number | Float32Array,
  ratioHigh: number | Float32Array,
  attaqueMs: number | Float32Array,
  relachementMs: number | Float32Array,
  freqLow: number | Float32Array,
  freqHigh: number | Float32Array,
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
  frequency: number | Float32Array,
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



