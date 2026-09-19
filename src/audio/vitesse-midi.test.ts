// audio/vitesse-midi.test.ts — Ralentir et accélérer un MIDI.
//
// Le test qui compte n'est pas que les instants soient divisés — c'est une multiplication — mais
// que le TEMPO ÉCRIT compense exactement l'étirement, de sorte que le fichier garde sa notation
// et ne change que de vitesse. C'est la propriété qui distingue un ralenti musical d'un fichier
// qui sonne juste et se note faux, et elle se vérifie en refaisant le calcul de tics.
import { describe, expect, it } from "vitest";
import {
  DUREE_MIN_DEFAUT, FACTEUR_MAX, FACTEUR_MIN,
  etirerNotes, facteurDepuisTempo, facteurValide, reglerTempoMidi, tempoDuMidi, tempoEtire,
} from "./vitesse-midi";

const n = (debut: number, fin: number, note = 60) => ({ note, velocite: 90, debut, fin });

describe("le facteur", () => {
  it("est une VITESSE : deux fois plus vite, donc deux fois plus court", () => {
    const { notes } = etirerNotes([n(0, 1), n(2, 3)], 2);
    expect(notes.map((x) => [x.debut, x.fin])).toEqual([[0, 0.5], [1, 1.5]]);
  });

  it("ralentit quand il est inférieur à un", () => {
    const { notes } = etirerNotes([n(0, 1), n(1, 2)], 0.5);
    expect(notes.map((x) => [x.debut, x.fin])).toEqual([[0, 2], [2, 4]]);
  });

  it("laisse tout en place à un", () => {
    const depart = [n(0.25, 0.75), n(1, 3)];
    expect(etirerNotes(depart, 1).notes).toEqual(depart);
  });

  it("garde le silence initial, proportionnellement", () => {
    // Un fichier qui commence après deux secondes de silence n'est pas recalé sur zéro : le
    // silence fait partie de la musique, et le nœud qui voudrait l'ôter le fera lui-même.
    expect(etirerNotes([n(2, 3)], 2).notes[0].debut).toBe(1);
  });

  it("conserve les champs qu'il ne comprend pas", () => {
    const { notes } = etirerNotes([{ debut: 0, fin: 1, note: 64, velocite: 42, canal: 3 }], 2);
    expect(notes[0]).toMatchObject({ note: 64, velocite: 42, canal: 3 });
  });

  it("se borne, et refuse ce qui n'est pas un facteur", () => {
    expect(facteurValide(0)).toBe(1);
    expect(facteurValide(-3)).toBe(1);
    expect(facteurValide(NaN)).toBe(1);
    expect(facteurValide(100)).toBe(FACTEUR_MAX);
    expect(facteurValide(0.001)).toBe(FACTEUR_MIN);
  });
});

describe("le plancher de durée", () => {
  it("empêche une note de devenir un clic, et le compte", () => {
    // Une double croche à 120 BPM dure 125 ms ; à huit fois plus vite, 15,6 ms.
    const { notes, ecourtees } = etirerNotes([n(0, 0.125)], 8);
    expect(notes[0].fin - notes[0].debut).toBe(DUREE_MIN_DEFAUT);
    expect(ecourtees).toBe(1);
  });

  it("ne compte pas celles qui restent au-dessus", () => {
    expect(etirerNotes([n(0, 1)], 2).ecourtees).toBe(0);
  });

  it("se règle, jusqu'à être levé", () => {
    const { notes, ecourtees } = etirerNotes([n(0, 0.125)], 8, { dureeMin: 0 });
    expect(notes[0].fin - notes[0].debut).toBeCloseTo(0.015625, 6);
    expect(ecourtees).toBe(0);
  });

  it("laisse tranquille une note de durée nulle, qui n'est pas une note écourtée", () => {
    expect(etirerNotes([n(1, 1)], 4).ecourtees).toBe(0);
  });
});

describe("le tempo cible", () => {
  it("donne le facteur qui mène d'un tempo à l'autre", () => {
    expect(facteurDepuisTempo(120, 90)).toBe(0.75);
    expect(facteurDepuisTempo(90, 180)).toBe(2);
  });

  it("ne se laisse pas piéger par un tempo absurde", () => {
    expect(facteurDepuisTempo(0, 120)).toBe(1);
    expect(facteurDepuisTempo(120, 0)).toBe(1);
    expect(facteurDepuisTempo(120, NaN)).toBe(1);
  });
});

describe("le tempo écrit dans le fichier étiré", () => {
  it("suit la vitesse", () => {
    expect(tempoEtire(120, 2)).toBe(240);
    expect(tempoEtire(120, 0.5)).toBe(60);
  });

  it("COMPENSE EXACTEMENT l'étirement : la notation est intacte, seul le tempo change", () => {
    // C'est LE test du module. On refait le calcul de tics d'Attic — tics = s × tpm × tempo/60 —
    // sur les notes d'origine et sur les notes étirées écrites au tempo étiré. Les deux doivent
    // tomber sur les mêmes tics : une noire reste une noire, et le fichier ne change que de
    // tempo. Sans cette compensation, un ralenti de moitié doublerait toutes les valeurs de
    // note, et la partition deviendrait illisible.
    const tpm = 480, tempoSource = 120;
    const origine = [n(0, 0.5), n(0.5, 1), n(1, 2)];
    const tics = (s: number, tempo: number) => Math.round(s * tpm * tempo / 60);
    for (const facteur of [0.5, 0.75, 1, 1.5, 2, 4]) {
      const { notes } = etirerNotes(origine, facteur, { dureeMin: 0 });
      const tempo = tempoEtire(tempoSource, facteur);
      for (let i = 0; i < origine.length; i++) {
        expect(tics(notes[i].debut, tempo), `facteur ${facteur}, note ${i} : début`)
          .toBe(tics(origine[i].debut, tempoSource));
        expect(tics(notes[i].fin, tempo), `facteur ${facteur}, note ${i} : fin`)
          .toBe(tics(origine[i].fin, tempoSource));
      }
    }
  });

  it("retombe sur 120 quand la source n'en déclare pas", () => {
    expect(tempoEtire(0, 1)).toBe(120);
  });
});

describe("le tempo lu dans le fichier", () => {
  const evt = (us: number) => ({ type: "setTempo", microsecondsPerBeat: us });

  it("lit le premier setTempo", () => {
    // 500 000 µs par noire = 120 BPM, la valeur par défaut du MIDI.
    expect(tempoDuMidi([[evt(500_000)]]).tempo).toBe(120);
    expect(tempoDuMidi([[evt(1_000_000)]]).tempo).toBe(60);
  });

  it("retombe sur le défaut quand le fichier n'en déclare aucun", () => {
    expect(tempoDuMidi([[{ type: "noteOn" }]])).toEqual({ tempo: 120, changements: 0 });
  });

  it("compte les changements, pour que le nœud puisse dire que la notation sera aplatie", () => {
    const r = tempoDuMidi([[evt(500_000)], [{ type: "noteOn" }, evt(400_000), evt(300_000)]]);
    expect(r.tempo).toBe(120);
    expect(r.changements).toBe(3);
  });

  it("cherche dans toutes les pistes, le tempo vivant souvent seul dans la première", () => {
    expect(tempoDuMidi([[{ type: "trackName" }], [evt(250_000)]]).tempo).toBe(240);
  });
});

describe("l'étirement par le tempo seul", () => {
  const evt = (us: number, deltaTime = 0) => ({ type: "setTempo", microsecondsPerBeat: us, deltaTime });
  const note = (deltaTime: number, canal: number) => ({ type: "noteOn", deltaTime, channel: canal, noteNumber: 60 });

  it("divise les microsecondes par battement : deux fois plus vite, moitié moins", () => {
    const { midi } = reglerTempoMidi({ header: {}, tracks: [[evt(500_000)]] }, 2);
    expect(midi.tracks[0][0].microsecondsPerBeat).toBe(250_000);
  });

  it("étire TOUS les changements de tempo, pas seulement le premier", () => {
    const { midi } = reglerTempoMidi({ header: {}, tracks: [[evt(500_000), evt(400_000)]] }, 0.5);
    expect(midi.tracks[0].map((e) => e.microsecondsPerBeat)).toEqual([1_000_000, 800_000]);
  });

  it("ne touche à RIEN d'autre : c'est tout l'intérêt", () => {
    // Un fichier à deux canaux ressort à deux canaux, positions en tics inchangées. Réencodé
    // depuis les seules hauteurs, il serait aplati sur un canal et perdrait ses contrôleurs.
    const depart = {
      header: { format: 1, ticksPerBeat: 480 },
      tracks: [[evt(500_000), note(0, 0), note(240, 1), { type: "controller", deltaTime: 10, channel: 1 }]],
    };
    const { midi } = reglerTempoMidi(depart as never, 4);
    expect(midi.header).toEqual(depart.header);
    expect(midi.tracks[0].slice(1)).toEqual(depart.tracks[0].slice(1));
  });

  it("n'abîme pas le fichier d'origine", () => {
    const depart = { header: {}, tracks: [[evt(500_000)]] };
    reglerTempoMidi(depart, 8);
    expect(depart.tracks[0][0].microsecondsPerBeat).toBe(500_000);
  });

  it("écrit un tempo quand le fichier n'en déclare aucun, au lieu de laisser supposer 120", () => {
    const { midi, ajoute } = reglerTempoMidi({ header: {}, tracks: [[note(0, 0)]] }, 2);
    expect(ajoute).toBe(true);
    expect(midi.tracks[0][0]).toMatchObject({ type: "setTempo", microsecondsPerBeat: 250_000 });
    // La note d'origine suit, intacte.
    expect(midi.tracks[0][1]).toMatchObject({ type: "noteOn" });
  });

  it("ne descend jamais sous une microseconde par battement", () => {
    const { midi } = reglerTempoMidi({ header: {}, tracks: [[evt(2)]] }, FACTEUR_MAX);
    expect(midi.tracks[0][0].microsecondsPerBeat).toBeGreaterThanOrEqual(1);
  });
});

// L'aller-retour complet, celui que fait le nœud : un vrai fichier MIDI est écrit, relu, étiré,
// réécrit, relu. C'est la seule façon de prouver ce que le nœud promet — que le fichier ressort
// avec ses canaux, ses positions et ses contrôleurs, et que SEUL son tempo a changé.
describe("un vrai fichier, écrit puis relu", () => {
  const fabriquer = async () => {
    const { writeMidi } = await import("midi-file");
    // Deux canaux, comme une main gauche et une main droite, plus une pédale.
    const midi = {
      header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { type: "setTempo", microsecondsPerBeat: 500_000, deltaTime: 0, meta: true },
        { type: "programChange", channel: 1, programNumber: 24, deltaTime: 0 },
        { type: "noteOn", channel: 0, noteNumber: 48, velocity: 80, deltaTime: 0 },
        { type: "noteOn", channel: 1, noteNumber: 72, velocity: 100, deltaTime: 0 },
        { type: "controller", channel: 0, controllerType: 64, value: 127, deltaTime: 120 },
        { type: "noteOff", channel: 0, noteNumber: 48, velocity: 0, deltaTime: 360 },
        { type: "noteOff", channel: 1, noteNumber: 72, velocity: 0, deltaTime: 0 },
        { type: "endOfTrack", deltaTime: 0, meta: true },
      ]],
    };
    return new Uint8Array(writeMidi(midi as never));
  };

  /** Ce qu'on compare : les canaux, les positions absolues en tics, et le tempo. */
  const releve = (m: { header: { ticksPerBeat?: number }; tracks: Record<string, number>[][] }) => {
    const canaux = new Set<number>();
    const positions: number[] = [];
    let tempo: number | null = null;
    for (const piste of m.tracks) {
      let t = 0;
      for (const e of piste as unknown as { type: string; deltaTime: number; channel?: number; microsecondsPerBeat?: number }[]) {
        t += e.deltaTime;
        if (e.channel !== undefined) canaux.add(e.channel);
        if (e.type === "setTempo" && tempo === null) tempo = 60_000_000 / (e.microsecondsPerBeat ?? 1);
        positions.push(t);
      }
    }
    return { canaux: [...canaux].sort(), positions, tempo, tpm: m.header.ticksPerBeat };
  };

  it("ressort avec ses canaux, ses positions et ses contrôleurs — seul le tempo a changé", async () => {
    const { parseMidi, writeMidi } = await import("midi-file");
    const depart = parseMidi(await fabriquer());
    const { midi } = reglerTempoMidi(depart as never, 0.5);
    const relu = parseMidi(new Uint8Array(writeMidi(midi as never)));

    const avant = releve(depart as never), apres = releve(relu as never);
    expect(apres.canaux, "les canaux").toEqual(avant.canaux);
    expect(apres.positions, "les positions en tics").toEqual(avant.positions);
    expect(apres.tpm, "la résolution").toBe(avant.tpm);
    // Deux fois plus lent : 120 devient 60. C'est le SEUL écart.
    expect(avant.tempo).toBe(120);
    expect(apres.tempo).toBe(60);
    // Et le changement de programme du second canal a traversé.
    const programme = relu.tracks.flat().find((e) => e.type === "programChange") as { programNumber?: number };
    expect(programme?.programNumber).toBe(24);
  });

  it("garde la pédale, qu'un réencodage depuis les hauteurs perdrait", async () => {
    const { parseMidi, writeMidi } = await import("midi-file");
    const { midi } = reglerTempoMidi(parseMidi(await fabriquer()) as never, 4);
    const relu = parseMidi(new Uint8Array(writeMidi(midi as never)));
    const pedale = relu.tracks.flat().find((e) => e.type === "controller") as { controllerType?: number; value?: number };
    expect(pedale).toMatchObject({ controllerType: 64, value: 127 });
  });
});
