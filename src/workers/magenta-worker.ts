// src/workers/magenta-worker.ts — Web Worker pour les nœuds Magenta.
// Exécute les modèles @magenta/music dans un thread séparé pour ne pas bloquer l’UI.

// @magenta/music / tfjs utilisent parfois window/global ; dans un worker on les alias sur self.
(self as any).window = self;
(self as any).global = self;

// @magenta/music/core/audio_utils.js instancie un OfflineAudioContext à l’import
// et détecte un worker via WorkerGlobalScope. Dans un worker Web Audio n’existe
// pas ; on fournit un leurre et on masque WorkerGlobalScope. Pour que tfjs
// s’enregistre quand même en mode browser, on fournit un document factice.
if (typeof self !== "undefined") {
  const s = self as any;
  const DummyOfflineAudioContext = class {
    numberOfChannels = 1;
    length = 16000;
    sampleRate = 16000;
    constructor(numberOfChannels: number, length: number, sampleRate: number) {
      this.numberOfChannels = numberOfChannels;
      this.length = length;
      this.sampleRate = sampleRate;
    }
    decodeAudioData() { return Promise.reject(new Error("OfflineAudioContext non disponible dans le worker")); }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    startRendering() { return Promise.resolve(undefined); }
    oncomplete: any = null;
  };
  s.OfflineAudioContext = DummyOfflineAudioContext;
  s.webkitOfflineAudioContext = DummyOfflineAudioContext;
  s.document = s.document || {};
  delete s.WorkerGlobalScope;
}

import {
  genererBatterie,
  continuerMidi,
  genererMelodie,
  interpolerMidi,
  humaniserGroove,
  improviser,
} from "../plugins/magenta-helpers";

function postProgress(msg: string) {
  (self as any).postMessage({ type: "progress", msg });
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    let result: any;

    switch (type) {
      case "drums": {
        postProgress("Chargement du modèle de batterie…");
        result = await genererBatterie(null, payload.temperature, payload.bars, payload.tempo, 0.5);
        break;
      }
      case "drumsSeed": {
        postProgress("Chargement du modèle de batterie…");
        result = await genererBatterie(payload.file, payload.temperature, payload.bars, payload.tempo, payload.similarity);
        break;
      }
      case "continuation": {
        postProgress("Chargement du modèle de continuation…");
        result = await continuerMidi(payload.file, payload.steps, payload.temperature, payload.spq);
        break;
      }
      case "melody": {
        postProgress("Chargement du modèle de mélodie…");
        result = await genererMelodie(payload.file, payload.steps, payload.temperature, payload.spq);
        break;
      }
      case "interpolation": {
        postProgress("Chargement du modèle d’interpolation…");
        result = await interpolerMidi(payload.file1, payload.file2, payload.numInterps, payload.temperature, payload.position);
        break;
      }
      case "humanize": {
        postProgress("Chargement du modèle GrooVAE…");
        result = await humaniserGroove(payload.file, payload.temperature, payload.spq);
        break;
      }
      case "improvisation": {
        postProgress("Chargement du modèle Piano Genie…");
        result = await improviser(payload.duree, payload.tempo, payload.temperature, payload.mode, payload.seed);
        break;
      }
      default:
        throw new Error(`Opération Magenta inconnue : ${type}`);
    }

    if (result instanceof File) {
      const bytes = new Uint8Array(await result.arrayBuffer());
      (self as any).postMessage(
        { type: "done", payload: { kind: "file", name: result.name, type: result.type, bytes } },
        [bytes.buffer],
      );
    } else if (typeof AudioBuffer !== "undefined" && result instanceof AudioBuffer) {
      const data = result.getChannelData(0);
      (self as any).postMessage(
        { type: "done", payload: { kind: "audio", sampleRate: result.sampleRate, length: result.length, data } },
        [data.buffer],
      );
    } else if (result && typeof result === "object" && result.data instanceof Float32Array) {
      const { sampleRate, data } = result;
      (self as any).postMessage(
        { type: "done", payload: { kind: "audio", sampleRate, length: data.length, data } },
        [data.buffer],
      );
    } else {
      throw new Error(`Résultat Magenta non sérialisable : ${typeof result}`);
    }
  } catch (err: any) {
    const message = err?.stack ? `${err?.message || err}\n${err.stack}` : String(err?.message || err);
    (self as any).postMessage({ type: "error", error: message });
  }
};
