// audio/effets-reverbe.ts — Reverberation, fondu, flanger, chorus.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { poserParam } from "./automation";

export async function appliquerReverberation(
  entree: AudioBuffer,
  taille: number,
  decaySec: number,
  mix: number | Float32Array,
  hasard: () => number = Math.random,
): Promise<AudioBuffer> {
  const dureeImpulsion = 0.2 + (Math.max(0, Math.min(100, taille)) / 100) * 6;
  const facteurDecay = Math.max(0.5, Math.min(8, decaySec));
  const coda = dureeImpulsion + 1;
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(
    entree.numberOfChannels,
    Math.ceil(duree * entree.sampleRate),
    entree.sampleRate
  );

  const impulsion = offline.createBuffer(
    entree.numberOfChannels,
    Math.ceil(dureeImpulsion * entree.sampleRate),
    entree.sampleRate
  );
  for (let c = 0; c < impulsion.numberOfChannels; c++) {
    const donnees = impulsion.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const t = i / donnees.length;
      donnees[i] = (hasard() * 2 - 1) * Math.pow(1 - t, facteurDecay);
    }
  }

  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = impulsion;
  convolueur.normalize = true;

  // Le mélange accepte une courbe. Sans elle, un nombre est posé comme avant, au bit près : c'est
  // `poserParam` qui tient cette règle, et les empreintes enregistrées avant l'ajout la vérifient.
  const borne = (x: number) => Math.max(0, Math.min(100, x)) / 100;
  const gainSec = offline.createGain();
  poserParam(gainSec.gain, mix, duree, (x) => 1 - borne(x));
  const gainHumide = offline.createGain();
  poserParam(gainHumide.gain, mix, duree, borne);

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}



export function appliquerFondu(buffer: AudioBuffer, type: string, dureeSec: number): AudioBuffer {
  const dureeEch = Math.max(1, Math.min(buffer.length, Math.round(dureeSec * buffer.sampleRate)));
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    dst.set(src);

    if (type === "Fermeture") {
      const debut = buffer.length - dureeEch;
      for (let i = 0; i < dureeEch; i++) {
        const t = i / Math.max(1, dureeEch - 1);
        const gain = 0.5 * (1 + Math.cos(Math.PI * t));
        dst[debut + i] *= gain;
      }
    } else {
      for (let i = 0; i < dureeEch; i++) {
        const t = i / Math.max(1, dureeEch - 1);
        const gain = 0.5 * (1 - Math.cos(Math.PI * t));
        dst[i] *= gain;
      }
    }
  }

  return resultat;
}

// Amplificateur : gain fixe en dB appliqué uniformément. Les valeurs qui
// dépassent ±1 seront écrêtées à la lecture/export (comme un ampli qui sature).


export async function appliquerFlanger(
  entree: AudioBuffer,
  vitesse: number,
  profondeur: number | Float32Array,
  mixPct: number | Float32Array
): Promise<AudioBuffer> {
  // Le mélange accepte une courbe ; `poserParam` pose un nombre comme avant, au bit près.
  const versGain = (x: number) => Math.max(0, Math.min(1, x / 100));
  const coda = 0.1;
  const duree = entree.duration + coda;
  const ctx = new OfflineAudioContext(entree.numberOfChannels, Math.ceil(duree * entree.sampleRate), entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const sec = ctx.createGain();
  poserParam(sec.gain, mixPct, duree, (x) => 1 - versGain(x));
  const humide = ctx.createGain();
  poserParam(humide.gain, mixPct, duree, versGain);
  const delai = ctx.createDelay(0.02);
  delai.delayTime.setValueAtTime(0.002, 0);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = vitesse;
  const lfoGain = ctx.createGain();
  // La profondeur accepte une courbe : c'est un `AudioParam`, et `poserParam` pose un nombre comme
  // avant, au bit près. Le plancher évite un gain nul, que le balayage ne distinguerait pas d'un
  // effet débranché.
  poserParam(lfoGain.gain, profondeur, duree, (x) => Math.max(0.0001, x / 1000));
  lfo.connect(lfoGain);
  lfoGain.connect(delai.delayTime);
  source.connect(sec);
  sec.connect(ctx.destination);
  source.connect(delai);
  delai.connect(humide);
  humide.connect(ctx.destination);
  source.start();
  lfo.start();
  return ctx.startRendering();
}



export async function appliquerChorus(
  entree: AudioBuffer,
  vitesse: number,
  profondeur: number | Float32Array,
  mixPct: number | Float32Array,
): Promise<AudioBuffer> {
  // Le mélange accepte une courbe ; `poserParam` pose un nombre comme avant, au bit près.
  const versGain = (x: number) => Math.max(0, Math.min(1, x / 100));
  const sr = entree.sampleRate;
  const nCh = Math.min(entree.numberOfChannels, 2);
  const duree = entree.duration + 0.2;
  const ctx = new OfflineAudioContext(nCh, Math.ceil(duree * sr), sr);
  const source = ctx.createBufferSource();
  source.buffer = entree;

  const secGain = ctx.createGain();
  poserParam(secGain.gain, mixPct, duree, (x) => 1 - versGain(x));
  source.connect(secGain);
  secGain.connect(ctx.destination);

  const baseDelay = 0.025;

  for (let ch = 0; ch < nCh; ch++) {
    const delai = ctx.createDelay(0.05);
    delai.delayTime.value = baseDelay + ch * 0.004;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vitesse * (1 + ch * 0.15);
    const lfoGain = ctx.createGain();
    // La profondeur accepte une courbe : un `AudioParam` par voie, la même courbe sur les deux.
    poserParam(lfoGain.gain, profondeur, duree, (x) => x / 1000);
    lfo.connect(lfoGain);
    lfoGain.connect(delai.delayTime);
    const wetGain = ctx.createGain();
    poserParam(wetGain.gain, mixPct, duree, (x) => versGain(x) * 0.4);
    source.connect(delai);
    delai.connect(wetGain);
    wetGain.connect(ctx.destination);
    lfo.start();
  }

  source.start();
  return ctx.startRendering();
}



