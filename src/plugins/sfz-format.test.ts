// plugins/sfz-format.test.ts — Le SFZ tel que la référence le définit, lu et écrit par les nœuds.
//
// LES CAS VIENNENT DE LA RÉFÉRENCE, sfzformat.com, jamais du code : chaque attendu cite l'opcode et
// ce que sa page en dit. Ils passent tous par `executer`, avec un disque et un décodeur en double qui
// rendent un sinus par fichier, ce qui suffit à savoir quelle région joue sur quelle touche.
//
// Ce fichier est né de la revue des notations en texte (2026-11-22). Il tient ce que le relevé a
// trouvé : une région déclarée sans touche qui jouait sur toutes, une valeur illisible remplacée en
// silence par une plage de 128 touches, une redéfinition de `#define` appliquée à tout le fichier, un
// `#include` signalé dans les données mais tu dans le message, `octave_offset` laissé de côté.
import { describe, expect, it, vi } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { fiches as fichesBanque } from "./banque-sfz";
import { fiches as fichesClavier } from "./clavier-sfz";
import type { Banque } from "../audio/clavier-banque";

const SR = 22050;
const banqueSfz = fichesBanque.find((f) => f.id === "banque-sfz")!;
const clavierSfz = fichesClavier.find((f) => f.id === "clavier-sfz")!;

function sinus(freq: number, secondes = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const a = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = a.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  return a;
}

/** Le disque en double : le `.sfz` à un chemin, et un sinus par échantillon nommé. */
function monde(texte: string, sons: Record<string, AudioBuffer>) {
  const api = {
    lireTexte: vi.fn(async (c: string) => (c === "D:/b/i.sfz" ? texte : null)),
    lireFichierAudio: vi.fn(async (c: string) => ({ url: c })),
  };
  (globalThis as any).window = { api };
  (globalThis as any).fetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  return {
    decodeAudioData: vi.fn(async (ab: ArrayBuffer) => {
      const s = sons[new TextDecoder().decode(ab).replace("D:/b/", "")];
      if (!s) throw new Error("absent");
      return s;
    }),
  };
}

const SONS = { "a.wav": sinus(220.5), "b.wav": sinus(330.75) };

/** Lit un texte SFZ par le nœud Banque SFZ, et rend la banque et le message. */
async function lire(texte: string): Promise<{ banque: Banque | null; message: string }> {
  const runtime = monde(texte, SONS);
  const r: any = await banqueSfz.executer(ctxDEssai([], { Source: "fichier", "Aperçu": "non", "Type de banque": "hauteurs" },
    { runtime, ficheId: "banque-sfz", data: { sfzChemin: "D:/b/i.sfz" } }) as any);
  return { banque: r.valeurs[0] ?? null, message: String(r.message) };
}

/** Les zones d'une banque lue, réduites à ce que les cas comparent. */
const zones = (b: Banque | null) => (b?.zones ?? []).map((z) => [z.basse, z.haute, z.racine]);

/** Joue des notes par Clavier SFZ, et rend l'audio. */
async function jouer(texte: string, notes: { note: number; velocite: number; debut: number; fin: number }[]) {
  const runtime = monde(texte, SONS);
  const r: any = await clavierSfz.executer(ctxDEssai([], { Source: "fichier", "Relâchement": 20 },
    { runtime, ficheId: "clavier-sfz", data: { sfzChemin: "D:/b/i.sfz", sequenceNotes: notes } }) as any);
  return r.valeurs[0] as AudioBuffer;
}

const rms = (a: AudioBuffer, t0: number, t1: number) => {
  const d = a.getChannelData(0);
  const i0 = Math.round(t0 * a.sampleRate), i1 = Math.min(d.length, Math.round(t1 * a.sampleRate));
  let s = 0;
  for (let i = i0; i < i1; i++) s += d[i] * d[i];
  return i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
};

const BONNE = "<region> sample=b.wav lokey=80 hikey=90 pitch_keycenter=85\n";

describe("les touches d'une région, selon la référence", () => {
  it("une région à `lokey=-1 hikey=-1` ne joue sur AUCUNE touche, et le message le dit", async () => {
    // sfzformat.com/opcodes/lokey : « SFZ 2 additionally includes the possibility to set lokey and
    // hikey to -1, to prevent a region from being triggered by any keys ».
    for (const region of ["lokey=-1 hikey=-1", "key=-1"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav ${region}`);
      expect(zones(banque), region).toEqual([[80, 90, 85]]);
      expect(message, region).toContain("#2");
    }
  });

  it("une valeur de touche illisible ou hors de 0 à 127 écarte la région, NOMMÉE", async () => {
    for (const region of ["lokey=foo hikey=72", "lokey=200 hikey=210", "key=h4", "key=g#9"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav ${region}`);
      expect(zones(banque), region).toEqual([[80, 90, 85]]);
      expect(message, region).toContain(`#2 ${region.split(" ")[0]}`);
    }
  });

  it("`lokey` au-dessus de `hikey` écarte la région, nommée, au lieu d'échanger les bornes", async () => {
    const { banque, message } = await lire(`${BONNE}<region> sample=a.wav lokey=72 hikey=60 pitch_keycenter=66`);
    expect(zones(banque)).toEqual([[80, 90, 85]]);
    expect(message).toContain("#2 lokey=72 hikey=60");
  });

  it("garde les noms de notes de la référence : c4 = 60, dièse `#`, bémol `b`, de C-1 à G9", async () => {
    const attendus: [string, number][] = [
      ["c4", 60], ["C#4", 61], ["eb4", 63], ["C-1", 0], ["g9", 127], ["Cb4", 59], ["B#3", 60],
    ];
    for (const [nom, note] of attendus) {
      const { banque } = await lire(`<region> sample=a.wav lokey=${nom} hikey=${nom} pitch_keycenter=${nom}`);
      expect(zones(banque), nom).toEqual([[note, note, note]]);
    }
  });
});

describe("les autres valeurs, selon la référence", () => {
  it("une valeur illisible ou hors plage écarte la région, nommée", async () => {
    // volume : décibels ; tune : cents ; lovel et hivel : 0 (v1) ou 1 (v2) à 127 ; amp_veltrack :
    // −100 à 100 ; loop_mode : no_loop, one_shot, loop_continuous ou loop_sustain.
    for (const opcode of ["volume=fort", "tune=abc", "hivel=200", "lovel=-5", "amp_veltrack=150", "loop_mode=boucle", "transpose=2.5"]) {
      const { banque, message } = await lire(`${BONNE}<region> sample=a.wav lokey=50 hikey=70 ${opcode}`);
      expect(zones(banque), opcode).toEqual([[80, 90, 85]]);
      expect(message, opcode).toContain(`#2 ${opcode}`);
    }
  });

  it("`amp_veltrack` NÉGATIF inverse la vélocité : à −100, la vélocité 127 se tait", async () => {
    // sfzformat.com/opcodes/amp_veltrack : « from -100 (which would make velocity 127 notes
    // silent, and low-velocity notes loud) to 100 ».
    const audio = await jouer("<region> sample=a.wav key=60 amp_veltrack=-100", [
      { note: 60, velocite: 127, debut: 0, fin: 0.3 }, { note: 60, velocite: 20, debut: 0.5, fin: 0.8 },
    ]);
    expect(rms(audio, 0.05, 0.25)).toBeLessThan(1e-6);
    // Volume 80 %, sinus de crête 0,5 : 0,8 × 0,354 = 0,283 à pleine nuance ; la vélocité 20 en
    // garde 1 − 20/127, soit 0,238.
    expect(rms(audio, 0.55, 0.75)).toBeGreaterThan(0.2);
  });

  it("`pitch` se lit comme `tune`, son alias", async () => {
    const { banque } = await lire("<region> sample=a.wav lokey=50 hikey=70 pitch_keycenter=60 pitch=-50");
    expect(banque?.zones[0].accord).toBe(-50);
  });
});

describe("le préprocesseur et l'en-tête <control>", () => {
  it("une redéfinition de `#define` vaut À PARTIR D'ELLE, et non pour tout le fichier", async () => {
    const { banque } = await lire("#define $K 60\n<region> sample=a.wav key=$K\n#define $K 72\n<region> sample=b.wav key=$K");
    expect(zones(banque)).toEqual([[60, 60, 60], [72, 72, 72]]);
  });

  it("un `#include` non suivi est DIT dans le message du nœud", async () => {
    const { message } = await lire('#include "autres.sfz"\n<region> sample=a.wav key=60');
    expect(message).toContain("autres.sfz");
  });

  it("une région sans `sample` est dite, avec son rang", async () => {
    const { banque, message } = await lire("<region> key=61\n<region> sample=a.wav key=60");
    expect(zones(banque)).toEqual([[60, 60, 60]]);
    expect(message).toContain("#1");
  });

  it("un générateur `*sine` est nommé comme générateur, et non compté comme échantillon manquant", async () => {
    const { message } = await lire("<region> sample=*sine key=60\n<region> sample=a.wav key=62");
    expect(message).toContain("*sine");
    expect(message).not.toMatch(/manquant/);
  });

  it("`octave_offset` et `note_offset` décalent les touches et la racine de chaque région", async () => {
    // sfzformat.com/opcodes/octave_offset : « this allows changing IPN notation into MMA, so C4 will
    // be MIDI note 48 instead of MIDI note 60 » pour `octave_offset=-1`.
    const region = "<region> sample=a.wav lokey=50 hikey=70 pitch_keycenter=60";
    expect(zones((await lire(`<control> octave_offset=-1\n${region}`)).banque)).toEqual([[38, 58, 48]]);
    expect(zones((await lire(`<control> octave_offset=1\n${region}`)).banque)).toEqual([[62, 82, 72]]);
    expect(zones((await lire(`<control> note_offset=-3\n${region}`)).banque)).toEqual([[47, 67, 57]]);
    expect(zones((await lire(`<control> octave_offset=1 note_offset=2\n${region}`)).banque)).toEqual([[64, 84, 74]]);
    // Ni l'un ni l'autre ne compte plus parmi les opcodes ignorés.
    expect((await lire(`<control> octave_offset=1\n${region}`)).message).not.toMatch(/ignor/);
  });

  it("une région que le décalage sort du clavier est écartée, nommée", async () => {
    const { banque, message } = await lire(`<control> octave_offset=-2\n${BONNE}<region> sample=a.wav lokey=0 hikey=10 pitch_keycenter=5`);
    expect(zones(banque)).toEqual([[56, 66, 61]]);
    expect(message).toContain("#2");
  });
});
