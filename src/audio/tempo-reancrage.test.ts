// audio/tempo-reancrage.test.ts — Reancrer un tempo sans deplacer les notes, et mesurer l'ecart.
//
// CE QUE CE TEST TIENT, et pourquoi il ne peut pas se contenter d'un type de retour.
//
// 1. UN REANCRAGE NE DEPLACE RIEN. La proposition entiere repose la : les instants en secondes
//    doivent survivre au changement de tempo, a l'arrondi au tic pres. Un test qui verifierait
//    seulement que le tempo ecrit a change laisserait passer exactement la faute que ce module
//    existe pour eviter, celle du changement de vitesse applique par erreur.
// 2. LES PISTES ET LES CANAUX SURVIVENT. Un transcripteur donne une piste par instrument ; les
//    fusionner serait une perte invisible aux yeux d'un test de duree.
// 3. L'INDICE D'ALIGNEMENT EST CALIBRE. Un nombre sans echelle ne dit rien : on lui donne des
//    attaques posees sur la grille, et il doit rendre 0 ; des attaques posees au hasard, et il doit
//    rendre 1. Entre ces deux bornes il devient lisible, et c'est ce qui autorise a l'afficher.
import { parseMidi, writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyserMidi } from "./midi";
import { instantsDesEvenements, mesurerAlignement, reancrerTempo, tempoValide } from "./tempo-reancrage";

/** Un MIDI de quatre notes sur deux pistes, deux canaux, chacun avec son programme. */
function midiTemoin(bpm = 120, tpm = 480) {
  const tic = (sec: number) => Math.round((sec / 60) * bpm * tpm);
  const piste0: any[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / bpm) },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 26 },
  ];
  let courant = 0;
  for (const [debut, fin, note] of [[0.16, 0.4, 39], [1.37, 1.9, 51]] as [number, number, number][]) {
    piste0.push({ deltaTime: tic(debut) - courant, type: "noteOn", channel: 0, noteNumber: note, velocity: 100 });
    piste0.push({ deltaTime: tic(fin) - tic(debut), type: "noteOff", channel: 0, noteNumber: note, velocity: 0 });
    courant = tic(fin);
  }
  piste0.push({ deltaTime: 0, type: "endOfTrack" });

  const piste1: any[] = [{ deltaTime: 0, type: "programChange", channel: 9, programNumber: 0 }];
  courant = 0;
  for (const [debut, fin, note] of [[0.16, 0.17, 36], [0.73, 0.74, 42]] as [number, number, number][]) {
    piste1.push({ deltaTime: tic(debut) - courant, type: "noteOn", channel: 9, noteNumber: note, velocity: 100 });
    piste1.push({ deltaTime: tic(fin) - tic(debut), type: "noteOff", channel: 9, noteNumber: note, velocity: 0 });
    courant = tic(fin);
  }
  piste1.push({ deltaTime: 0, type: "endOfTrack" });

  return { header: { format: 1, numTracks: 2, ticksPerBeat: tpm }, tracks: [piste0, piste1] };
}

/** Les instants des notes d'un MIDI analyse, tries. */
const attaquesDe = (midi: any) => analyserMidi(midi as any).notes.map((n) => n.debut).sort((a, b) => a - b);

describe("reancrer un tempo", () => {
  it("garde chaque note a sa seconde, a l'arrondi du tic pres", () => {
    const avant = midiTemoin(120);
    const attendues = attaquesDe(avant);
    const { midi: apres, ecartMaxMs } = reancrerTempo(avant, 166);
    const obtenues = attaquesDe(apres);

    expect(obtenues.length).toBe(attendues.length);
    // A 480 tics par noire et 166 battements, un demi-tic vaut 0,376 ms : c'est la borne annoncee.
    expect(ecartMaxMs).toBeCloseTo(0.376, 2);
    for (let i = 0; i < attendues.length; i++) {
      expect(Math.abs(obtenues[i] - attendues[i]) * 1000).toBeLessThanOrEqual(ecartMaxMs + 1e-9);
    }
  });

  it("ecrit le tempo demande, et le relit", () => {
    const { midi } = reancrerTempo(midiTemoin(120), 166);
    const tempos = midi.tracks.flat().filter((e: any) => e.type === "setTempo");
    expect(tempos.length).toBe(1);
    expect(60_000_000 / (tempos[0] as any).microsecondsPerBeat).toBeCloseTo(166, 0);
  });

  it("CE N'EST PAS UN CHANGEMENT DE VITESSE : la duree totale ne bouge pas", () => {
    const avant = midiTemoin(120);
    const { midi: apres } = reancrerTempo(avant, 240);
    expect(analyserMidi(apres as any).dureeTotale).toBeCloseTo(analyserMidi(avant as any).dureeTotale, 2);
  });

  it("garde les pistes, les canaux et les programmes", () => {
    const { midi } = reancrerTempo(midiTemoin(120), 166);
    expect(midi.tracks.length).toBe(2);
    const programmes = midi.tracks.flat().filter((e: any) => e.type === "programChange")
      .map((e: any) => `${e.channel}:${e.programNumber}`);
    expect(programmes.sort()).toEqual(["0:26", "9:0"]);
    const canaux = [...new Set(analyserMidi(midi as any).notes.map((n) => n.canal))].sort();
    expect(canaux).toEqual([0, 9]);
  });

  it("ecrase une carte de tempo et dit combien de changements elle portait", () => {
    const avec = midiTemoin(120);
    avec.tracks[0].splice(2, 0, { deltaTime: 240, type: "setTempo", microsecondsPerBeat: 400_000 });
    const { changementsAbsorbes } = reancrerTempo(avec, 166);
    expect(changementsAbsorbes).toBe(2);
  });

  it("suit la carte de tempo pour lire les instants, au lieu de diviser", () => {
    // Un passage a 240 battements au tic 480, pose SANS deplacer les evenements suivants : le
    // delta de l'insertion est retire de celui qui suit. La seconde note arrive alors deux fois
    // plus tot qu'une lecture a tempo constant ne le dirait.
    const midi = midiTemoin(120);
    const rang = midi.tracks[0].findIndex((e: any) => e.type === "noteOn" && e.noteNumber === 51);
    const avance = 480 - 384; // du note-off precedent, au tic 384, jusqu'au tic 480.
    midi.tracks[0][rang].deltaTime -= avance;
    midi.tracks[0].splice(rang, 0, { deltaTime: avance, type: "setTempo", microsecondsPerBeat: 250_000 });

    const dates = instantsDesEvenements(midi);
    const notes = dates[0].filter((d) => d.evt.type === "noteOn");
    expect(notes[0].secondes).toBeCloseTo(0.16, 3);
    // Jusqu'au tic 480 le temps court a 120 ; ensuite deux fois plus vite. La note qui tombait a
    // 1,37 s remonte donc vers 0,935 s, et non 1,37.
    expect(notes[1].secondes).toBeCloseTo(0.935, 2);
  });

  it("traverse l'ecriture et la relecture du format", () => {
    const { midi } = reancrerTempo(midiTemoin(120), 166);
    const relu = parseMidi(new Uint8Array(writeMidi(midi as any)));
    expect(relu.tracks.length).toBe(2);
    expect(analyserMidi(relu).notes.length).toBe(4);
  });

  it("borne le tempo demande plutot que de produire un fichier illisible", () => {
    expect(tempoValide(0)).toBe(120);
    expect(tempoValide(Number.NaN, 90)).toBe(90);
    expect(tempoValide(5)).toBe(20);
    expect(tempoValide(10_000)).toBe(400);
  });
});

describe("mesurer l'alignement", () => {
  it("rend 0 sur des attaques posees exactement sur la grille", () => {
    const pas = 60 / 120 / 4;
    const attaques = Array.from({ length: 64 }, (_, i) => i * pas);
    const a = mesurerAlignement(attaques, 120, 4);
    expect(a.ecartMoyenMs).toBeCloseTo(0, 6);
    expect(a.indice).toBeCloseTo(0, 6);
    expect(a.partProche).toBe(1);
  });

  it("rend 1 sur des attaques reparties au hasard — c'est ce qui donne un sens a l'indice", () => {
    // Un generateur fixe : la calibration doit etre reproductible.
    let graine = 12345;
    const suivant = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const attaques = Array.from({ length: 4000 }, () => suivant() * 30);
    const a = mesurerAlignement(attaques, 120, 4);
    expect(a.indice).toBeGreaterThan(0.95);
    expect(a.indice).toBeLessThan(1.05);
  });

  it("rend 1 sur un reseau de dix millisecondes, qui est ce qu'un transcripteur produit", () => {
    // Le reseau de MuScriptor : des centiemes de seconde, sans rapport avec une subdivision.
    let graine = 999;
    const suivant = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const attaques = Array.from({ length: 2000 }, () => Math.round(suivant() * 3000) / 100);
    const a = mesurerAlignement(attaques, 166, 4);
    expect(a.indice).toBeGreaterThan(0.9);
  });

  it("donne le pas de la grille et compte ce qu'elle a mesure", () => {
    const a = mesurerAlignement([0, 1, 2], 120, 4);
    expect(a.pas).toBeCloseTo(0.125, 6);
    expect(a.attaques).toBe(3);
    const triolets = mesurerAlignement([0], 120, 3);
    expect(triolets.pas).toBeCloseTo(60 / 120 / 3, 6);
  });

  it("ne divise pas par zero sans attaque", () => {
    const a = mesurerAlignement([], 120, 4);
    expect(a.attaques).toBe(0);
    expect(a.indice).toBe(0);
    expect(a.partProche).toBe(1);
  });
});
