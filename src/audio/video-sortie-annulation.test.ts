// audio/video-sortie-annulation.test.ts — « Arrêter » arrête l'écriture du MP4, et n'en laisse rien.
//
// ═══ LE DÉFAUT, MESURÉ DANS L'APPLICATION LE 2026-10-31 ═══
//
// `ecrireMp4` recevait le signal d'annulation et ne s'y abonnait pas, quand ses deux voisines le
// font. Sur un film de onze minutes, un arrêt demandé à « copie de l'image » laissait l'encodeur du
// son faire ses 266 appels : 3,07 s de travail après le clic. La copie de l'image, elle, s'arrêtait,
// mais par un détour : le `onProgress` du moteur lève après annulation (`core/annulation.ts`). Un
// appelant qui passe le signal sans ce `onProgress` n'aurait rien arrêté du tout.
//
// ═══ CE QUI EST ÉPROUVÉ ICI, ET AVEC QUOI ═══
//
// LE VRAI `ecrireMp4`, sur la vraie bibliothèque média : son conteneur, sa conversion et son
// encodeur de piste. Seul l'encodeur AAC est remplacé, parce que Node n'en a pas ; il est déclaré à
// la bibliothèque par la voie qu'elle prévoit, et il compte ses appels et sa fermeture.
//
// AUCUNE HORLOGE. L'arrêt se déclenche de l'intérieur, au deuxième appel de l'encodeur ou à la
// première progression de la copie : un délai réel ferait passer ou tomber ce cas selon la charge de
// la machine.
//
// LE TÉMOIN PASSE D'ABORD : un film entier doit s'écrire, sans quoi un arrêt « réussi » pourrait
// n'être qu'une écriture qui échoue toujours.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  BufferTarget, CustomAudioEncoder, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output,
  registerEncoder, type AudioSample,
} from "mediabunny";
import { ecrireMp4, ouvrirVideo, type VideoOuverte } from "./video-sortie";

const SR = 48_000;
/** Deux minutes d'image : 48 appels à l'encodeur en stéréo, cent vingt paquets à recopier. */
const DUREE = 120;

class AudioBufferEssai {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels;
    this.length = o.length;
    this.sampleRate = o.sampleRate;
    this.duration = o.length / o.sampleRate;
    this.canaux = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyFromChannel(dst: Float32Array, c: number, debut = 0): void {
    dst.set(this.canaux[c].subarray(debut, debut + dst.length));
  }
}

/** Ce que l'encodeur a fait, et le crochet par lequel un cas déclenche l'arrêt. */
const journal = { encodes: 0, fermetures: 0, aChaqueAppel: null as ((n: number) => void) | null };

class EncodeurAacEssai extends CustomAudioEncoder {
  static supports(codec: string): boolean { return codec === "aac"; }
  private premier = true;
  init(): void {}
  async encode(s: AudioSample): Promise<void> {
    journal.encodes++;
    journal.aChaqueAppel?.(journal.encodes);
    await Promise.resolve();
    // AAC-LC, 48 kHz, stéréo : la configuration que le conteneur exige du premier paquet.
    const meta = this.premier
      ? { decoderConfig: { codec: "mp4a.40.2", numberOfChannels: s.numberOfChannels, sampleRate: s.sampleRate, description: new Uint8Array([0x11, 0x90]) } }
      : undefined;
    this.premier = false;
    this.onPacket(new EncodedPacket(new Uint8Array(8), "key", s.timestamp, s.duration), meta);
  }
  flush(): void {}
  close(): void { journal.fermetures++; }
}

/** Un film d'une image clé par seconde, écrit en mémoire par la même bibliothèque. */
async function filmEssai(): Promise<ArrayBuffer> {
  const cible = new BufferTarget();
  const sortie = new Output({ format: new Mp4OutputFormat(), target: cible });
  const piste = new EncodedVideoPacketSource("vp9");
  sortie.addVideoTrack(piste, { frameRate: 1 });
  await sortie.start();
  for (let i = 0; i < DUREE; i++) {
    await piste.add(new EncodedPacket(new Uint8Array(64), "key", i, 1),
      i === 0 ? { decoderConfig: { codec: "vp09.00.10.08", codedWidth: 64, codedHeight: 64 } } : undefined);
  }
  await sortie.finalize();
  return cible.buffer!;
}

let film: ArrayBuffer;
let melange: AudioBuffer;

beforeAll(async () => {
  (globalThis as { AudioBuffer?: unknown }).AudioBuffer = AudioBufferEssai;
  registerEncoder(EncodeurAacEssai);
  film = await filmEssai();
  melange = new AudioBufferEssai({ numberOfChannels: 2, length: DUREE * SR, sampleRate: SR }) as unknown as AudioBuffer;
});

beforeEach(() => { journal.encodes = 0; journal.fermetures = 0; journal.aChaqueAppel = null; });

const ouvrir = (): Promise<VideoOuverte> => ouvrirVideo(film.slice(0));

describe("ecrireMp4 et l'arrêt", () => {
  it("TÉMOIN : sans arrêt, le film entier s'écrit et l'encodeur sert d'un bout à l'autre", async () => {
    const fractions: number[] = [];
    const blob = await ecrireMp4(await ouvrir(), melange, { onProgress: (f) => fractions.push(f) });
    expect(blob.size, "le film écrit doit porter l'image et le son").toBeGreaterThan(DUREE * 64);
    expect(journal.encodes, "deux secondes et demie de stéréo par appel").toBe(48);
    expect(Math.max(...fractions), "la copie doit aller à son terme").toBe(1);
  });

  it("UN ARRÊT PENDANT LE SON arrête l'encodeur, le ferme, et ne rend aucun fichier", async () => {
    const arret = new AbortController();
    journal.aChaqueAppel = (n) => { if (n === 2) arret.abort(); };
    await expect(ecrireMp4(await ouvrir(), melange, { signal: arret.signal })).rejects.toThrow();
    // Relevé : deux appels, celui où tombe l'arrêt compris, contre 48 sans abonnement. La borne laisse
    // passer la file de quatre que la bibliothèque s'autorise ; le reste du mélange, non.
    expect(journal.encodes, "l'encodeur a continué après l'arrêt").toBeLessThanOrEqual(6);
    expect(journal.fermetures, "l'encodeur doit être fermé quand la main revient").toBe(1);
  });

  it("UN ARRÊT PENDANT LA COPIE l'arrête par le seul signal, sans `onProgress` qui lève", async () => {
    const arret = new AbortController();
    const fractions: number[] = [];
    const onProgress = (f: number) => { fractions.push(f); if (f > 0) arret.abort(); };
    await expect(ecrireMp4(await ouvrir(), melange, { signal: arret.signal, onProgress })).rejects.toThrow();
    // Relevé : la copie s'arrête au premier des cent vingt paquets.
    expect(Math.max(...fractions), "la copie a continué après l'arrêt").toBeLessThan(0.5);
    expect(journal.fermetures).toBe(1);
  });

  it("UN SIGNAL DÉJÀ ANNULÉ n'encode rien et ne rend aucun fichier", async () => {
    const arret = new AbortController();
    arret.abort();
    await expect(ecrireMp4(await ouvrir(), melange, { signal: arret.signal })).rejects.toThrow();
    expect(journal.encodes).toBe(0);
  });
});
