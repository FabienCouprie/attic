// audio/normalisation-sonie.test.ts — Ce qu'une normalisation de sonie doit tenir.
//
// LE TEST QUI JUSTIFIE LE NŒUD est le premier : deux sons de MÊME CRÊTE et de sonies très
// différentes doivent ressortir à la même sonie. C'est exactement ce que la normalisation à la
// crête ne sait pas faire, et c'est pour cela que les plateformes de diffusion l'ont abandonnée.
//
// LE SECOND est celui du plafond : quand la cible demanderait de dépasser le vrai pic autorisé, le
// module préfère ne pas l'atteindre et le DIRE, plutôt qu'écrêter en silence ou glisser un
// limiteur derrière un bouton qui promet seulement de normaliser.
import { beforeAll, describe, expect, it } from "vitest";
import { normaliserSonie } from "./normalisation-sonie";
import { mesurerNiveau } from "./vumetre";

class AudioBufferPolyfill {
  numberOfChannels: number; length: number; sampleRate: number; duration: number;
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
const N = SR * 3;

function depuis(f: (i: number) => number, canaux = 1): AudioBuffer {
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: canaux, length: N, sampleRate: SR }) as AudioBuffer;
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < N; i++) d[i] = f(i);
  }
  return b;
}

/** Un son tenu : forte sonie pour une crête donnée. */
const tenu = (amplitude: number) => depuis((i) => amplitude * Math.sin((2 * Math.PI * 440 * i) / SR));

/**
 * Le même son, mais entrecoupé de silences : MÊME CRÊTE, sonie bien plus faible.
 * C'est la paire qui montre ce que la crête ne voit pas.
 */
const troue = (amplitude: number) =>
  depuis((i) => (Math.floor(i / 4410) % 4 === 0 ? amplitude * Math.sin((2 * Math.PI * 440 * i) / SR) : 0));

describe("normaliser à la sonie", () => {
  it("DEUX SONS DE MÊME CRÊTE ET DE SONIES DIFFÉRENTES RESSORTENT À LA MÊME SONIE", () => {
    const plein = tenu(0.5), creux = troue(0.5);
    // Même crête au départ, sonies éloignées : c'est là que la normalisation à la crête échoue.
    expect(mesurerNiveau(plein).peakDb).toBeCloseTo(mesurerNiveau(creux).peakDb, 1);
    expect(Math.abs(mesurerNiveau(plein).lufs - mesurerNiveau(creux).lufs)).toBeGreaterThan(3);

    const a = normaliserSonie(plein, -20), b = normaliserSonie(creux, -20);
    expect(Math.abs(a.lufsApres - b.lufsApres)).toBeLessThan(0.5);
  });

  it("LA SONIE OBTENUE EST CELLE DEMANDÉE — remesurée, et non prédite", () => {
    for (const cible of [-30, -23, -16, -14]) {
      const r = normaliserSonie(tenu(0.2), cible, { plafondDb: 0 });
      expect(r.lufsApres).toBeCloseTo(cible, 1);
    }
  });

  it("monter ou descendre, le gain va dans le bon sens", () => {
    expect(normaliserSonie(tenu(0.05), -14, { plafondDb: 0 }).gainDb).toBeGreaterThan(0);
    expect(normaliserSonie(tenu(0.9), -30).gainDb).toBeLessThan(0);
  });

  it("LE PLAFOND PRIME SUR LA CIBLE, et le résultat le dit", () => {
    // LE CAS RÉEL : un son dynamique — crête haute, sonie basse — qu'on ne peut pas monter à la
    // cible sans dépasser le plafond. C'est le premier essai de ce test qui l'a appris : parti
    // d'un son TENU à 0,9, la cible était déjà sous sa sonie, et aucun plafond n'était en cause.
    const r = normaliserSonie(troue(0.9), -6, { plafondDb: -1 });
    expect(r.plafonne).toBe(true);
    expect(r.vraiPicDb).toBeLessThanOrEqual(-1 + 0.2);
    expect(r.lufsApres).toBeGreaterThan(-6 - 20);
    expect(r.lufsApres).toBeLessThan(-6);      // la cible n'est pas atteinte, et c'est annoncé
  });

  it("quand le plafond ne gêne pas, il ne se signale pas", () => {
    expect(normaliserSonie(tenu(0.5), -24).plafonne).toBe(false);
  });

  it("un silence est rendu tel quel, sans gain infini", () => {
    const r = normaliserSonie(depuis(() => 0), -14);
    expect(r.gainDb).toBe(0);
    expect(r.plafonne).toBe(false);
    expect([...r.audio.getChannelData(0)].every((v) => v === 0)).toBe(true);
  });

  it("ne touche ni à la forme du tampon ni à l'équilibre des canaux", () => {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR }) as AudioBuffer;
    const g = b.getChannelData(0), d = b.getChannelData(1);
    for (let i = 0; i < N; i++) {
      g[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / SR);
      d[i] = 0.1 * Math.sin((2 * Math.PI * 440 * i) / SR);
    }
    const r = normaliserSonie(b, -20, { plafondDb: 0 });
    expect(r.audio.numberOfChannels).toBe(2);
    expect(r.audio.length).toBe(N);
    const rapport = (x: AudioBuffer) => {
      const rms = (c: number) => {
        const v = x.getChannelData(c);
        let s = 0;
        for (let i = 0; i < v.length; i++) s += v[i] * v[i];
        return Math.sqrt(s / v.length);
      };
      return rms(0) / rms(1);
    };
    expect(rapport(r.audio)).toBeCloseTo(rapport(b), 6);
  });

  it("normaliser deux fois à la même cible ne change plus rien la seconde fois", () => {
    const une = normaliserSonie(tenu(0.3), -20, { plafondDb: 0 });
    const deux = normaliserSonie(une.audio, -20, { plafondDb: 0 });
    expect(Math.abs(deux.gainDb)).toBeLessThan(0.2);
  });
});
