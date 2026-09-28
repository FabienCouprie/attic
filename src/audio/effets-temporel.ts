// audio/effets-temporel.ts — Boucler, et retarder.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { poserParam } from "./automation";

const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

export function tailleFenetreSuivante(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

export function bouclerAudio(
  entree: AudioBuffer,
  dureeSec: number,
  repetitions: number,
  fonduMs: number
): AudioBuffer {
  const sampleRate = entree.sampleRate;
  const longueurSegment = Math.max(1, Math.round(dureeSec * sampleRate));
  const nbRepetitions = Math.max(1, Math.round(repetitions));
  const fonduEch = Math.min(
    Math.floor(longueurSegment / 2),
    Math.max(0, Math.round((fonduMs / 1000) * sampleRate))
  );

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: longueurSegment * nbRepetitions,
    sampleRate,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const segment = new Float32Array(longueurSegment);
    for (let i = 0; i < longueurSegment; i++) segment[i] = i < src.length ? src[i] : 0;

    const dst = resultat.getChannelData(c);
    for (let r = 0; r < nbRepetitions; r++) {
      const offset = r * longueurSegment;
      for (let i = 0; i < longueurSegment; i++) {
        let echantillon = segment[i];
        if (r > 0 && fonduEch > 0 && i < fonduEch) {
          const poids = i / fonduEch;
          const echantillonPrecedent = segment[longueurSegment - fonduEch + i];
          echantillon = echantillonPrecedent * (1 - poids) + segment[i] * poids;
        }
        dst[offset + i] = echantillon;
      }
    }
  }

  return resultat;
}



export async function appliquerDelay(
  entree: AudioBuffer,
  tempsGaucheMs: number,
  tempsDroitMs: number,
  feedbackPct: number,
  mixPct: number | Float32Array
): Promise<AudioBuffer> {
  const tl = Math.max(0.001, tempsGaucheMs) / 1000;
  const tr = Math.max(0.001, tempsDroitMs) / 1000;
  const feedback = Math.max(0, feedbackPct / 100);
  // Le mélange accepte une courbe ; `poserParam` pose un nombre comme avant, au bit près.
  const versGain = (x: number) => Math.max(0, Math.min(1, x / 100));
  const dMax = Math.max(tl, tr);
  const rep = feedback > 0.001 && feedback < 0.999 ? Math.ceil(Math.log(1e-4) / Math.log(feedback)) : feedback >= 0.999 ? 40 : 0;
  const coda = Math.max(3, dMax * Math.min(rep, 40));
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * entree.sampleRate), entree.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = entree;

  const dryG = offline.createGain();
  poserParam(dryG.gain, mixPct, duree, (x) => 1 - versGain(x));
  source.connect(dryG).connect(offline.destination);

  const splitter = offline.createChannelSplitter(2);
  const merger = offline.createChannelMerger(2);
  source.connect(splitter);

  function faireCanal(chan: number, dt: number) {
    const delai = offline.createDelay(dMax + 1);
    delai.delayTime.value = dt;
    const fb = offline.createGain(); fb.gain.value = feedback;
    const flt = offline.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 8000;
    const wet = offline.createGain(); poserParam(wet.gain, mixPct, duree, versGain);
    splitter.connect(delai, chan, 0);
    delai.connect(flt).connect(fb).connect(delai);
    flt.connect(wet).connect(merger, 0, chan);
  }

  faireCanal(0, tl);
  faireCanal(1, tr);

  merger.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}



/** Ce qu'une courbe peut piloter sur l'écho : le temps de retard et la réinjection. */
