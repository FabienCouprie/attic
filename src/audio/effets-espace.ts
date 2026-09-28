// audio/effets-espace.ts — Le placement dans l'espace, et le panoramique automatique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { CADENCE, valeursParametre } from "./courbe";
import { cyclesAccumules, frequencesModulees, type BornesFrequence } from "./lfo";

export function trajectoirePanoramique(
  courbe: unknown,
  nPoints: number,
  position: number,
  largeur: number,
  plage: { min: number; max: number },
): Float32Array {
  const n = Math.max(2, Math.round(nPoints));
  const positions = valeursParametre(courbe, n, position, plage);
  // × 5 : l'unité du `PannerNode` est une distance, et cinq mètres de part et d'autre placent la
  // source assez loin pour que les deux oreilles entendent vraiment autre chose.
  return Float32Array.from(positions, (p) => p * largeur * 5);
}

export async function spatialiserStereo(
  buffer: AudioBuffer,
  positionX: number,
  largeur: number,
  courbe?: unknown,
  plage: { min: number; max: number } = { min: -1, max: 1 },
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const ctx = new OfflineAudioContext(2, buffer.length, sr);
  const source = ctx.createBufferSource();

  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10000;
  panner.rolloffFactor = 0;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 0;
  panner.coneOuterGain = 0;

  // La trajectoire est échantillonnée à la cadence des courbes d'Attic, et non à celle du son :
  // deux cents points par seconde suffisent largement à un déplacement, et en demander 44 100
  // ferait un tableau de millions d'entrées pour un parcours que l'oreille suit en gros.
  const duree = buffer.length / sr;
  const trajet = trajectoirePanoramique(courbe, duree * CADENCE, positionX, largeur, plage);
  if (panner.positionX) {
    // `setValueCurveAtTime` interpole entre les points sur toute la durée. Sans courbe branchée,
    // le tableau est constant et le résultat est celui d'une position fixe.
    panner.positionX.setValueCurveAtTime(trajet, 0, Math.max(1 / sr, duree));
  } else {
    (panner as any).setPosition?.(trajet[0], 0, -1);
  }
  if (panner.positionZ) {
    panner.positionZ.value = -1;
  }

  // Le panner HRTF est conçu pour une source mono. On mixe donc toute entrée
  // (mono ou stéréo) en mono avant de la spatialiser, sinon un canal silencieux
  // ou un signal exclusivement à droite resterait figé dans son canal d'origine.
  if (buffer.numberOfChannels > 1) {
    const mono = ctx.createBuffer(1, buffer.length, sr);
    const monoData = mono.getChannelData(0);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      for (let i = 0; i < buffer.length; i++) {
        monoData[i] += src[i];
      }
    }
    const inv = 1 / buffer.numberOfChannels;
    for (let i = 0; i < buffer.length; i++) monoData[i] *= inv;
    source.buffer = mono;
  } else {
    source.buffer = buffer;
  }

  source.connect(panner);
  panner.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

// Spatialisation 3D ambisonique / binaurale via Resonance Audio.
// Le signal est mixé en mono avant spatialisation, puis rendu stéréo.
export async function appliquerResonanceAudio(
  buffer: AudioBuffer,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  roomWidth: number,
  roomHeight: number,
  roomDepth: number,
  roomMaterial: string,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const ctx = new OfflineAudioContext(2, buffer.length, sr);

  // Mixage en mono pour la spatialisation.
  const mono = ctx.createBuffer(1, buffer.length, sr);
  const monoData = mono.getChannelData(0);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      monoData[i] += src[i];
    }
  }
  for (let i = 0; i < buffer.length; i++) {
    monoData[i] /= Math.max(1, buffer.numberOfChannels);
  }

  const mod = (await import("resonance-audio")) as any;
  console.log("[resonance] module import:", mod, "keys:", Object.keys(mod || {}));
  const ResonanceAudio = mod?.ResonanceAudio ?? mod?.default?.ResonanceAudio ?? mod?.default;
  console.log("[resonance] ResonanceAudio class:", ResonanceAudio, "typeof:", typeof ResonanceAudio);
  if (typeof ResonanceAudio !== "function") {
    throw new Error("resonance-audio: ResonanceAudio class not found in module export");
  }
  const scene = new ResonanceAudio(ctx);
  console.log("[resonance] scene created:", scene, "listener:", scene?._listener, "renderer:", scene?._listener?._renderer);
  const source = scene.createSource();
  scene.setRoomProperties(
    { width: roomWidth, height: roomHeight, depth: roomDepth },
    { left: roomMaterial, right: roomMaterial, front: roomMaterial, back: roomMaterial, up: roomMaterial, down: roomMaterial },
  );
  source.setPosition(sourceX, sourceY, sourceZ);

  // Resonance Audio charge les HRIR de façon asynchrone (Omnitone) et ne
  // connecte le graphe de sortie qu'après initialisation. Il faut attendre
  // cette initialisation avant de lancer le rendu, sinon le résultat est
  // silencieux.
  const renderer = scene._listener?._renderer;
  console.log("[resonance] renderer ready:", renderer?._isRendererReady, "has initialize:", typeof renderer?.initialize);
  if (renderer && !renderer._isRendererReady && typeof renderer.initialize === "function") {
    console.log("[resonance] awaiting renderer.initialize()");
    await renderer.initialize();
    console.log("[resonance] renderer initialized, ready:", renderer._isRendererReady);
  }

  const src = ctx.createBufferSource();
  src.buffer = mono;
  src.connect(source.input);
  src.start();
  scene.output.connect(ctx.destination);
  console.log("[resonance] graph connected, rendering", buffer.length, "samples");

  const out = await ctx.startRendering();
  const rms = Math.sqrt((out.getChannelData(0).reduce((s, v) => s + v * v, 0) + out.getChannelData(1).reduce((s, v) => s + v * v, 0)) / (out.length * 2));
  console.log("[resonance] rendered", out.numberOfChannels, "channels RMS", rms);
  return out;
}

// Auto-pan : déplacement automatique du son entre gauche et droite.
export async function autoPan(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  courbeFrequence?: unknown,
  bornesFrequence: BornesFrequence = { min: 0.5, max: 8 },
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;
  // Avec une courbe, la phase intégrée ; sans, le calcul direct d'origine, au bit près.
  const f = frequencesModulees(courbeFrequence, buffer.length, frequence, bornesFrequence);
  const u = f ? cyclesAccumules(f, sr) : null;

  for (let c = 0; c < 2; c++) {
    const src = buffer.numberOfChannels > c ? buffer.getChannelData(c) : buffer.getChannelData(0);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const lfo = u ? Math.sin(2 * Math.PI * u[i]) : Math.sin(2 * Math.PI * frequence * t);
      const gain = c === 0
        ? 1 - depth * (lfo + 1) / 2
        : 1 - depth * (1 - lfo) / 2;
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}

// Pan logistique : déplacement mono-directionnel gauche → droite selon une loi logistique.
export function panLogistique(
  buffer: AudioBuffer,
  centre: number,
  pente: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const depth = Math.max(0, Math.min(1, mix / 100));
  const centreRel = Math.max(0, Math.min(1, centre / 100));
  const k = Math.max(0.1, pente);
  const n = buffer.length;

  for (let c = 0; c < 2; c++) {
    const src = buffer.numberOfChannels > c ? buffer.getChannelData(c) : buffer.getChannelData(0);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const p = 1 / (1 + Math.exp(-k * (t - centreRel)));
      const gain = c === 0
        ? 1 - depth * p
        : 1 - depth * (1 - p);
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}

// --- Harmonizer / Octaver : ajoute des voix pitch-shiftées ---------------------
// Crée jusqu'à deux voix décalées en demi-tons et les mixe sous l'original.

