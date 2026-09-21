// audio/polarite.test.ts — L'inversion de polarité, et la seule chose qu'elle doit garantir.
//
// LE TEST QUI COMPTE EST CELUI DE L'ANNULATION. Une inversion de polarité ne s'entend pas seule ;
// tout son intérêt est qu'ajoutée à l'original elle ne laisse RIEN. C'est ce silence qui fait le
// test d'annulation — la preuve la plus sûre que deux fichiers sont identiques — et c'est donc lui
// qu'il faut vérifier, plutôt que de constater que les signes ont changé.
import { beforeAll, describe, expect, it } from "vitest";
import { inverserAudio, inverserPolarite } from "./effets-montage";

// Meme polyfill que `effets-montage.test.ts` : hors navigateur, `AudioBuffer` n'existe pas.
class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
}

beforeAll(() => { (globalThis as any).AudioBuffer = AudioBufferPolyfill; });

const SR = 44100;

function tampon(valeurs: number[][]): AudioBuffer {
  const b = new (globalThis as any).AudioBuffer({
    numberOfChannels: valeurs.length, length: valeurs[0].length, sampleRate: SR,
  }) as AudioBuffer;
  valeurs.forEach((canal, c) => b.getChannelData(c).set(Float32Array.from(canal)));
  return b;
}

const musique = (n = 512, phase = 0) =>
  Array.from({ length: n }, (_, i) => 0.7 * Math.sin((2 * Math.PI * i) / 37 + phase) + 0.2 * Math.sin((2 * Math.PI * i) / 11));

describe("l'inversion de polarité", () => {
  it("ADDITIONNÉE À L'ORIGINAL, ELLE NE LAISSE RIEN — c'est le test d'annulation", () => {
    const x = tampon([musique(), musique(512, 1.3)]);
    const y = inverserPolarite(x);
    for (let c = 0; c < 2; c++) {
      const a = x.getChannelData(c), b = y.getChannelData(c);
      for (let i = 0; i < x.length; i++) expect(a[i] + b[i]).toBeCloseTo(0, 7);
    }
  });

  it("deux inversions rendent exactement le son de départ", () => {
    const x = tampon([musique()]);
    const retour = inverserPolarite(inverserPolarite(x));
    for (let i = 0; i < x.length; i++) {
      expect(retour.getChannelData(0)[i]).toBe(x.getChannelData(0)[i]);
    }
  });

  it("le niveau ne bouge pas : ce n'est pas un traitement, c'est un signe", () => {
    const x = tampon([musique()]);
    const rms = (b: AudioBuffer) => {
      const d = b.getChannelData(0);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      return Math.sqrt(s / d.length);
    };
    expect(rms(inverserPolarite(x))).toBeCloseTo(rms(x), 12);
  });

  it("ELLE NE TOUCHE PAS AU TEMPS, et c'est ce qui la distingue de la lecture inversée", () => {
    // La confusion que le catalogue entretenait : un nœud nommé « Inverseur audio » qui inversait
    // le temps, et un résumé — « inverse le signal » — qui désigne la polarité partout ailleurs.
    const x = tampon([[1, 2, 3, 4]]);
    expect([...inverserPolarite(x).getChannelData(0)]).toEqual([-1, -2, -3, -4]);
    expect([...inverserAudio(x).getChannelData(0)]).toEqual([4, 3, 2, 1]);
  });

  it("garde la forme du tampon : canaux, longueur, fréquence", () => {
    const x = tampon([musique(256), musique(256), musique(256)]);
    const y = inverserPolarite(x);
    expect(y.numberOfChannels).toBe(3);
    expect(y.length).toBe(256);
    expect(y.sampleRate).toBe(SR);
  });

  it("le silence reste le silence, et zéro n'a pas de signe", () => {
    const y = inverserPolarite(tampon([[0, 0, 0]]));
    for (const v of y.getChannelData(0)) expect(Math.abs(v)).toBe(0);
  });
});
