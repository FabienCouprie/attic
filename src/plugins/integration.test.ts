// plugins/integration.test.ts — Tests de chaînes critiques entre plugins.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect, vi } from "vitest";
import { writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { bufferVersWavBlob } from "../audio/io";
import { valeurCanoniqueChoix } from "../i18n";

function makeBuffer(len: number, sampleRate = len) {
  const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate });
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = 1;
  return b;
}

function createMidiFile(notes: { note: number; velocity: number; start: number; end: number }[]) {
  const midi: any = {
    header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[]],
  };
  let tick = 0;
  for (const n of notes) {
    const startTick = Math.round(n.start * 480 * 2); // assume quarter = half? keep simple
    const endTick = Math.round(n.end * 480 * 2);
    midi.tracks[0].push({ deltaTime: startTick - tick, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity });
    tick = startTick;
    midi.tracks[0].push({ deltaTime: endTick - startTick, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 });
    tick = endTick;
  }
  midi.tracks[0].push({ deltaTime: 0, type: "endOfTrack" });
  const bytes = new Uint8Array(writeMidi(midi));
  return new File([bytes], "test.mid", { type: "audio/midi" });
}

async function lirePcmWav(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const view = new DataView(buf);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataOffset = 44;
  const dataLen = view.getUint32(40, true);
  const interleaved = new Int16Array(buf, dataOffset, dataLen / 2);
  const samples: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(interleaved.length / channels);
    for (let i = 0, j = c; i < ch.length; i++, j += channels) {
      const v = interleaved[j];
      ch[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
    }
    samples.push(ch);
  }
  return { samples, channels, sampleRate };
}

function ctx(params: Record<string, string | number>, entrees: unknown[], noeudData: Record<string, unknown> = {}, onProgress: (msg: string) => void = () => {}) {
  return {
    entree: (idx: number) => entrees[idx],
    entrees: () => entrees,
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress,
    noeud: { data: noeudData },
    runtime: null,
  };
}

describe("chaînes critiques", () => {
  it("sélecteur → masque : Supprimer les zones fonctionne avec ids canoniques", async () => {
    const selecteur = registre.trouverDef("selecteur-multi-zones")!;
    const audio = makeBuffer(3000, 3000);
    const zones = [{ debut: 0.2, duree: 0.1 }];
    const resSelector = await selecteur.executer(ctx({ Action: "mute" }, [audio], { zonesSelectionnees: zones }) as any);
    expect(resSelector.valeurs[1]).toEqual(zones);

    const masque = registre.trouverDef("masque-zones")!;
    const resMask = await masque.executer(ctx({ Action: "mute", Fondu: 0 }, [audio, zones]) as any);
    const out = resMask.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 600; i < 900; i++) expect(d[i]).toBe(0);
    for (let i = 900; i < 3000; i++) expect(d[i]).toBe(1);
  });

  it("sélecteur → masque : Conserver les zones fonctionne avec ids canoniques", async () => {
    const selecteur = registre.trouverDef("selecteur-multi-zones")!;
    const audio = makeBuffer(3000, 3000);
    const zones = [{ debut: 0.2, duree: 0.1 }];
    const resSelector = await selecteur.executer(ctx({ Action: "keep" }, [audio], { zonesSelectionnees: zones }) as any);
    expect(resSelector.valeurs[1]).toEqual(zones);

    const masque = registre.trouverDef("masque-zones")!;
    const resMask = await masque.executer(ctx({ Action: "keep", Fondu: 0 }, [audio, zones]) as any);
    const out = resMask.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 600; i < 900; i++) expect(d[i]).toBe(1);
    for (let i = 900; i < 3000; i++) expect(d[i]).toBe(0);
  });

  it("masque : anciennes valeurs localisées sont toujours reconnues", async () => {
    const masque = registre.trouverDef("masque-zones")!;
    const audio = makeBuffer(3000, 3000);
    const zones = [{ debut: 0.2, duree: 0.1 }];
    // Simulation d'un projet sauvegardé avec les libellés français.
    const res = await masque.executer(ctx({ Action: "Supprimer les zones", Fondu: 0 }, [audio, zones]) as any);
    const out = res.valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    for (let i = 600; i < 900; i++) expect(d[i]).toBe(0);
  });

  it("Gate/Expandeur : mode expandeur activé par id canonique", async () => {
    const def = registre.trouverDef("gate-expandeur")!;
    const audio = makeBuffer(1000, 48000);
    const params = { Mode: "expander", Seuil: -40, Ratio: 4, Attaque: 1, Relâchement: 100, Atténuation: 40 };
    const res = await def.executer(ctx(params as any, [audio]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.message).toContain("Expandeur");
  });

  it("Aligneur de piste : position avant activée par id canonique", async () => {
    const def = registre.trouverDef("aligneur-piste")!;
    const ref = makeBuffer(1000, 48000);
    const piste = makeBuffer(2000, 48000);
    const params = { Position: "before" };
    const res = await def.executer(ctx(params as any, [ref, piste]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.message).toContain("ouverture");
  });

  it("Comparateur A/B : alignement activé par id canonique", async () => {
    const def = registre.trouverDef("comparateur-ab")!;
    const a = makeBuffer(1000, 48000);
    const b = makeBuffer(1000, 48000);
    const params = { "Aligner les niveaux": "yes", Écoute: "A" };
    const res = await def.executer(ctx(params as any, [a, b]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("normalisation : valeur anglaise d'ancien projet est convertie en id canonique", () => {
    const p = { options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["yes", "no"] };
    expect(valeurCanoniqueChoix(p, "Yes")).toBe("yes");
    expect(valeurCanoniqueChoix(p, "Oui")).toBe("yes");
    expect(valeurCanoniqueChoix(p, "yes")).toBe("yes");
  });

  it("Analyse audio : mode heuristique activé par id canonique", async () => {
    const def = registre.trouverDef("analyse-audio")!;
    const audio = makeBuffer(4800, 4800);
    const res = await def.executer(ctx({ Mode: "heuristic", Durée: 5 }, [audio]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("Tonal Grille : mode arpège activé par id canonique", async () => {
    const def = registre.trouverDef("tonal-grille")!;
    const res = await def.executer(ctx({ Progression: "C Am F G", Mode: "arpeggio" }, []) as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("TEMPO 120");
    expect(notation).toMatch(/\.5/); // arpeggio notes are shorter
  });

  it("Quantisation MIDI : grille triplet activée par id canonique", async () => {
    const def = registre.trouverDef("transposeur-quantiseur-midi")!;
    const midi = createMidiFile([{ note: 60, velocity: 100, start: 0, end: 0.5 }]);
    const res = await def.executer(ctx({ Transposition: 0, Quantisation: "1/8t", "Quantifier fins": "no" }, [midi]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(File);
  });

  it("Rythme de Cantor : partie et instrument activés par ids canoniques", async () => {
    const def = registre.trouverDef("rythme-cantor")!;
    const res = await def.executer(ctx({ "Partie retirée": "left", Instrument: "snare", Mesures: 1 }, []) as any);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("Spectrogramme fractal : échelle linéaire activée par id canonique", async () => {
    const def = registre.trouverDef("spectrogramme-fractal")!;
    const res = await def.executer(ctx({ Durée: 1, FFT: "512", Échelle: "linear" }, []) as any);
    expect(res.valeurs[1]).toBeInstanceOf(AudioBuffer);
  });

  it("Magenta Improvisation : le paramètre Mode expose les ids canoniques", () => {
    const def = registre.trouverDef("magenta-improvisation")!;
    const param = def.parametres.find((p) => p.nom === "Mode")!;
    expect(param.optionIds).toEqual(["random", "walk", "up", "down", "arpeggio"]);
  });

  it("Transcripteur MIDI : méthode mono activée par id canonique", async () => {
    const def = registre.trouverDef("transcripteur-midi")!;
    const audio = new AudioBuffer({ numberOfChannels: 1, length: 44100, sampleRate: 44100 });
    const d = audio.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    const res = await def.executer(ctx({ Méthode: "mono", "Seuil onset": 5, "Note minimale": 21, "Note maximale": 127, "Tempo du fichier MIDI": 120 }, [audio]) as any);
    expect(res.valeurs[0]).toBeInstanceOf(File);
  });

  it("Griffin-Lim : reconstruit un signal depuis le spectrogramme de magnitude", async () => {
    const def = registre.trouverDef("griffin-lim")!;
    const audio = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 44100 });
    const d = audio.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    const progress = vi.fn();
    const res = await def.executer(ctx({ Itérations: 30, "Phase initiale": "aleatoire", FFT: 2048, Recouvrement: "75", Mix: 100 }, [audio], {}, progress) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out).toBeInstanceOf(AudioBuffer);
    expect(out.length).toBe(audio.length);
    expect(Math.max(...out.getChannelData(0).map(Math.abs))).toBeGreaterThan(0.01);
    expect(progress).toHaveBeenCalled();
  });

  it("Griffin-Lim : reconstruit un signal stéréo de 2 s", async () => {
    const def = registre.trouverDef("griffin-lim")!;
    const sr = 48000;
    const len = 2 * sr;
    const audio = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
    for (let c = 0; c < 2; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = Math.sin((2 * Math.PI * 440 * i) / sr) + (Math.random() - 0.5) * 0.1;
      }
    }
    const res = await def.executer(ctx({ Itérations: 37, "Phase initiale": "aleatoire", FFT: 2048, Recouvrement: "75", Mix: 100 }, [audio]) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out).toBeInstanceOf(AudioBuffer);
    expect(out.numberOfChannels).toBe(2);
    const peakL = Math.max(...out.getChannelData(0).map(Math.abs));
    const peakR = Math.max(...out.getChannelData(1).map(Math.abs));
    expect(Math.max(peakL, peakR)).toBeGreaterThan(0.01);
  });

  it("Griffin-Lim : le WAV de prévisualisation contient du signal", async () => {
    const def = registre.trouverDef("griffin-lim")!;
    const audio = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 44100 });
    const d = audio.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    const res = await def.executer(ctx({ Itérations: 30, "Phase initiale": "aleatoire", FFT: 2048, Recouvrement: "75", Mix: 100 }, [audio]) as any);
    const out = res.valeurs[0] as AudioBuffer;
    const blob = bufferVersWavBlob(out);
    const { samples } = await lirePcmWav(blob);
    expect(Math.max(...samples[0].map(Math.abs))).toBeGreaterThan(0.01);
  });

  it("Griffin-Lim : reste audible avec le générateur audio mathématique par défaut", async () => {
    const gen = registre.trouverDef("generateur-audio-mathematique")!;
    const genRes = await gen.executer(ctx({ Formule: "sin(t * 2 * pi * 440)", Durée: 2, Canaux: "stereo", Volume: 30 }, []) as any);
    const audio = genRes.valeurs[0] as AudioBuffer;
    expect(audio).toBeInstanceOf(AudioBuffer);
    expect(Math.max(...audio.getChannelData(0).map(Math.abs))).toBeGreaterThan(0.001);

    const def = registre.trouverDef("griffin-lim")!;
    const res = await def.executer(ctx({ Itérations: 60, "Phase initiale": "aleatoire", FFT: 2048, Recouvrement: "75", Mix: 100 }, [audio]) as any);
    const out = res.valeurs[0] as AudioBuffer;
    expect(Math.max(...out.getChannelData(0).map(Math.abs))).toBeGreaterThan(0.001);
    const blob = bufferVersWavBlob(out);
    const { samples } = await lirePcmWav(blob);
    expect(Math.max(...samples[0].map(Math.abs))).toBeGreaterThan(0.001);
  });
});
