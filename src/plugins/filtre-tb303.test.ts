// plugins/filtre-tb303.test.ts — La prise : chaque réglage agit, chaque entrée aussi, et la forme du son reste.
//
// Le calcul est tenu par `audio/filtre-tb303.test.ts` et `audio/enveloppe-tb303.test.ts`. Ici, ce que la
// fiche en fait : les réglages lus sous leurs noms, les deux courbes, les notes, un tampon de la forme
// de l'entrée, et le message.
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { ctxDEssai } from "../core/contexte-essai";
import { constante, type Courbe } from "../audio/courbe";
import { fiches } from "./filtre-tb303";

const fiche = fiches.find((f) => f.id === "filtre-tb303")!;
const FE = 48000;

/** Une dent de scie de 110 Hz à gauche, de 165 Hz à droite, une demi-seconde, crête 0,25. */
function stereo(): AudioBuffer {
  const a = new AudioBuffer({ numberOfChannels: 2, length: FE / 2, sampleRate: FE });
  const g = a.getChannelData(0), d = a.getChannelData(1);
  for (let i = 0; i < a.length; i++) {
    g[i] = 0.5 * (((i * 110) / FE) % 1) - 0.25;
    d[i] = 0.5 * (((i * 165) / FE) % 1) - 0.25;
  }
  return a;
}

/**
 * Quatre notes de 62,5 ms, une tous les huitièmes de seconde, à 120 noires par minute. La deuxième et
 * la quatrième sont accentuées (vélocité 127) ; les deux autres non (vélocité 80).
 */
function midi(): File {
  const trk: any[] = [{ deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 }];
  for (const [k, v] of [80, 127, 80, 127].entries()) {
    trk.push({ deltaTime: k === 0 ? 0 : 60, type: "noteOn", channel: 0, noteNumber: 36, velocity: v });
    trk.push({ deltaTime: 60, type: "noteOff", channel: 0, noteNumber: 36, velocity: 0 });
  }
  trk.push({ deltaTime: 0, type: "endOfTrack" });
  const octets = writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [trk] } as any);
  return new File([new Uint8Array(octets)], "notes.mid", { type: "audio/midi" });
}

/** Une rampe de 0 à 1 sur la durée du son : la courbe la plus simple qui ne soit pas constante. */
function rampe(): Courbe {
  const c = constante(0, 0.5);
  for (let i = 0; i < c.valeurs.length; i++) c.valeurs[i] = i / (c.valeurs.length - 1);
  return c;
}

const lancer = (reglages: Record<string, string | number> = {}, entrees: unknown[] = [stereo()]) =>
  fiche.executer(ctxDEssai(entrees as never[], reglages, { ficheId: fiche.id }) as never);

const efficace = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const sortie = async (reglages: Record<string, string | number> = {}, entrees?: unknown[]) =>
  (await lancer(reglages, entrees)).valeurs[0] as AudioBuffer;
/** L'écart efficace entre deux sons, sur le canal gauche. */
const ecart = (a: AudioBuffer, b: AudioBuffer) => {
  const x = a.getChannelData(0), y = b.getChannelData(0);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  return Math.sqrt(s / x.length);
};

const REGLAGES_ENVELOPPE = { "Modulation d'enveloppe": [0, 100], "Déclin": [200, 2000], "Accent": [0, 100], "Vélocité d'accent": [127, 80] } as const;

describe("le Filtre TB-303", () => {
  it("sans entrée, rend une valeur nulle et se déclare en erreur", async () => {
    const r = await lancer({}, []);
    expect(r.valeurs).toEqual([null]);
    expect(r.erreur).toBe(true);
  });

  it("rend un tampon de la forme de l'entrée, chaque canal filtré pour lui-même", async () => {
    const r = await lancer();
    const s = r.valeurs[0] as AudioBuffer;
    expect([s.numberOfChannels, s.length, s.sampleRate]).toEqual([2, FE / 2, FE]);
    expect(ecart(s, stereo())).toBeGreaterThan(0.01);
    expect(efficace(s.getChannelData(0))).not.toBeCloseTo(efficace(s.getChannelData(1)), 4);
    expect(r.message).toBe("Sans notes : coupure et résonance seules");
  });

  it("« Coupure » et « Résonance » agissent", async () => {
    expect(ecart(await sortie({ "Coupure": 300 }), await sortie({ "Coupure": 3000 }))).toBeGreaterThan(0.005);
    expect(ecart(await sortie({ "Résonance": 0 }), await sortie({ "Résonance": 100 }))).toBeGreaterThan(0.005);
  });

  it("une courbe sur « Modulation coupure » agit, et ses deux bornes avec elle", async () => {
    const avec = await sortie({}, [stereo(), null, rampe()]);
    expect(ecart(await sortie(), avec)).toBeGreaterThan(0.005);
    expect(ecart(avec, await sortie({ "Modulation min": 1000 }, [stereo(), null, rampe()]))).toBeGreaterThan(0.001);
    expect(ecart(avec, await sortie({ "Modulation max": 10000 }, [stereo(), null, rampe()]))).toBeGreaterThan(0.001);
  });

  it("une courbe sur « Modulation résonance » agit, et ses deux bornes avec elle", async () => {
    const avec = await sortie({}, [stereo(), null, null, rampe()]);
    expect(ecart(await sortie(), avec)).toBeGreaterThan(0.001);
    expect(ecart(avec, await sortie({ "Résonance min": 80 }, [stereo(), null, null, rampe()]))).toBeGreaterThan(0.001);
    expect(ecart(avec, await sortie({ "Résonance max": 20 }, [stereo(), null, null, rampe()]))).toBeGreaterThan(0.001);
  });

  it("les notes relancent l'enveloppe, et le message les compte", async () => {
    const r = await lancer({}, [stereo(), midi()]);
    expect(ecart(r.valeurs[0] as AudioBuffer, await sortie())).toBeGreaterThan(0.005);
    expect(r.message).toBe("4 note(s) jouée(s) · 2 accentuée(s) · 0 liée(s)");
  });

  it("AVEC DES NOTES, CHACUN DES QUATRE RÉGLAGES DE L'ENVELOPPE AGIT", async () => {
    for (const [nom, [a, b]] of Object.entries(REGLAGES_ENVELOPPE)) {
      const x = await sortie({ [nom]: a }, [stereo(), midi()]);
      const y = await sortie({ [nom]: b }, [stereo(), midi()]);
      expect(ecart(x, y), nom).toBeGreaterThan(0.001);
    }
  });

  it("SANS NOTES, LES QUATRE RÉGLAGES DE L'ENVELOPPE ET LES QUATRE BORNES SONT INERTES, au bit près", async () => {
    const s = await sortie();
    const autres = await sortie({
      "Modulation d'enveloppe": 100, "Déclin": 2000, "Accent": 100, "Vélocité d'accent": 1,
      "Modulation min": 5000, "Modulation max": 6000, "Résonance min": 90, "Résonance max": 95,
    });
    expect(autres.getChannelData(0)).toEqual(s.getChannelData(0));
  });
});
