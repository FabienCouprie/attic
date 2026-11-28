// plugins/masque-activite.test.ts — Le nœud « Masque d'activité » applique à un fichier quelconque la
// règle que les voix appliquent à leurs propres notes.
//
// LE CAS QUI TIENT LE RESTE : une voix rendue sans matrice puis masquée égale la même voix rendue
// avec la matrice, note pour note, la règle n'étant écrite qu'une fois pour les deux. S'y ajoutent
// un fichier à une autre résolution, la coupe aux bords, ce que le fichier garde, et les fautes.

import { parseMidi, writeMidi, type MidiData } from "midi-file";
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches as fichesVoix } from "./voix-sur-accord";
import { fiches } from "./masque-activite";

const fiche = fiches.find((f) => f.id === "masque-activite")!;
const ficheVoix = fichesVoix.find((f) => f.id === "voix-sur-accord")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;

/** Quatre sections d'une mesure à 4 tics par temps et 120 BPM : deux secondes par mesure. */
async function harmonie(): Promise<File> {
  const r = await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/4,+F/4,+C/4,+G/4", Mesures: 4, "Tics par temps": "4",
    Tempo: 120 }, { entrees: [] });
  return r.valeurs[0] as File;
}

/** Les départs d'un fichier : [tic, hauteur, durée, canal]. */
function departs(midi: MidiData): number[][] {
  const out: number[][] = [];
  for (const piste of midi.tracks) {
    let tic = 0;
    const ouvertes = new Map<string, number[]>();
    for (const e of piste) {
      tic += e.deltaTime;
      if (e.type === "noteOn") { const n = [tic, e.noteNumber, 0, e.channel]; out.push(n); ouvertes.set(`${e.channel}:${e.noteNumber}`, n); }
      if (e.type === "noteOff") { const n = ouvertes.get(`${e.channel}:${e.noteNumber}`); if (n) n[2] = tic - n[0]; }
    }
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const lu = async (v: unknown) => parseMidi(new Uint8Array(await (v as File).arrayBuffer()));

/**
 * Un fichier à 480 tics par noire, 120 BPM, deux pistes sur deux canaux : une note à chaque noire,
 * seize en tout, chacune d'une hauteur neuve pour que deux notes qui se chevauchent restent deux.
 */
function fichierEtranger(duree = 480): File {
  const piste = (canal: number, base: number) => {
    const poses: { tick: number; evt: MidiData["tracks"][number][number] }[] = [];
    for (let k = 0; k < 16; k++) {
      poses.push({ tick: k * 480, evt: { deltaTime: 0, type: "noteOn", channel: canal, noteNumber: base + k, velocity: 90 } });
      poses.push({ tick: k * 480 + duree, evt: { deltaTime: 0, type: "noteOff", channel: canal, noteNumber: base + k, velocity: 0 } });
    }
    poses.sort((a, b) => a.tick - b.tick || (a.evt.type === "noteOff" ? -1 : 1) - (b.evt.type === "noteOff" ? -1 : 1));
    let avant = 0;
    const evts: MidiData["tracks"][number] = [{ deltaTime: 0, type: "programChange", channel: canal, programNumber: 40 + canal }];
    for (const p of poses) { evts.push({ ...p.evt, deltaTime: p.tick - avant }); avant = p.tick; }
    evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    return evts;
  };
  const tempo: MidiData["tracks"][number] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, meta: true, type: "endOfTrack" }];
  const octets = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 3, ticksPerBeat: 480 }, tracks: [tempo, piste(0, 60), piste(3, 48)] }));
  return new File([octets], "etranger.mid", { type: "audio/midi" });
}

describe("le nœud Masque d'activité", () => {
  it("une voix rendue sans matrice puis masquée égale la même voix rendue avec la matrice", async () => {
    const h = await harmonie();
    const matrice = "accomp  x.xx  debut=-2 fin=3\nautre  ....";
    const motif = "0/3,1/2,-/1,2/3,(0,-)*2,1/5";
    const avec = await lancerFiche(ficheVoix, { Motif: motif, Voix: "accomp" }, { entrees: [h, matrice, null] });
    const sans = await lancerFiche(ficheVoix, { Motif: motif }, { entrees: [h, null, null] });
    const masque = await lancerFiche(fiche, { Voix: "accomp" }, { entrees: [sans.valeurs[0], h, matrice] });
    expect(masque.levee).toBeNull();
    const attendu = departs(await lu(avec.valeurs[0]));
    expect(attendu.length).toBeGreaterThan(10);
    expect(departs(await lu(masque.valeurs[0]))).toEqual(attendu);
    expect(masque.message).toMatch(/notes gardées, \d+ retirées · voix « accomp »/);
  });

  it("masque un fichier écrit à une autre résolution, et garde ses pistes, ses canaux et ses programmes", async () => {
    const r = await lancerFiche(fiche, { Voix: "v" }, { entrees: [fichierEtranger(), await harmonie(), "v  x.x."] });
    const midi = await lu(r.valeurs[0]);
    expect(midi.header.ticksPerBeat).toBe(480);
    expect(midi.tracks.length).toBe(3);
    const d = departs(midi);
    // Une mesure par section, quatre noires par mesure : les mesures 1 et 3 restent, sur les deux canaux.
    expect(d.map((n) => n[0] / 480)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 8, 8, 9, 9, 10, 10, 11, 11]);
    expect(new Set(d.map((n) => n[3]))).toEqual(new Set([0, 3]));
    const programmes = midi.tracks.flatMap((p) => p.filter((e) => e.type === "programChange").map((e) => (e as { programNumber: number }).programNumber));
    expect(programmes).toEqual([40, 43]);
    expect(r.message).toMatch(/16 notes gardées, 16 retirées/);
  });

  it("« Couper aux bords » arrête à la fin de l'activité la note qui la déborde", async () => {
    // Des notes de trois noires, posées à chaque noire. Sous « x... », les quatre de la première
    // mesure restent ; la troisième et la quatrième débordent sur la mesure muette, d'une et de deux
    // noires, et la deuxième finit pile avec l'activité.
    const longues = fichierEtranger(480 * 3);
    const h = await harmonie();
    const sans = departs(await lu((await lancerFiche(fiche, { Voix: "v" }, { entrees: [longues, h, "v  x..."] })).valeurs[0]));
    const coupe = await lancerFiche(fiche, { Voix: "v", "Couper aux bords": 1 }, { entrees: [longues, h, "v  x..."] });
    const avec = departs(await lu(coupe.valeurs[0]));
    expect(sans.map((n) => n[2])).toEqual(new Array(8).fill(1440));
    expect(avec.map((n) => n[2])).toEqual([1440, 1440, 1440, 1440, 960, 960, 480, 480]);
    expect(coupe.message).toMatch(/coupées/);
  });

  it("une faute se dit : une voix absente, une matrice qui ne compte pas les sections de l'harmonie", async () => {
    const h = await harmonie();
    const absente = await lancerFiche(fiche, { Voix: "nappe" }, { entrees: [fichierEtranger(), h, "v  xxxx"] });
    expect(absente.erreurRendue).toBe(true);
    expect(absente.message).toMatch(/pas de voix « nappe »/);
    const courte = await lancerFiche(fiche, { Voix: "v" }, { entrees: [fichierEtranger(), h, "v  xx"] });
    expect(courte.message).toMatch(/2 sections, l'harmonie 4/);
    const illisible = await lancerFiche(fiche, { Voix: "v" }, { entrees: [fichierEtranger(), h, "v  x?x"] });
    expect(illisible.message).toMatch(/illisible/);
  });
});
