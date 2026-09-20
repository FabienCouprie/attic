// audio/repartition-midi.test.ts — Découper un arrangement sans en perdre une note.
//
// CE QUI DOIT ÊTRE VRAI, et que le seul œil ne dit pas : la somme des notes des parties égale celle
// du fichier d'origine, chaque partie garde le TEMPO du morceau — sinon les quatre instruments
// jouent à quatre vitesses —, et rien ne disparaît en silence quand il y a plus de canaux que de
// parties. Les tests écrivent donc de vrais fichiers MIDI et les relisent.
import { describe, expect, it } from "vitest";
import { parseMidi, writeMidi } from "midi-file";
import {
  CANAL_BATTERIE, analyserListeCanaux, compterNotes, filtrerPistesMidi, inventaireMidi,
  listeCanauxHumaine, repartirCanaux,
} from "./repartition-midi";
import { filtrerCanauxMidi } from "./midi";

const TPM = 480;

/** Un arrangement : une piste de tempo, puis une piste par partie, chacune sur son canal. */
function arrangement(parties: { canal: number; nom: string; notes: number[] }[], tempoBpm = 96): Uint8Array {
  const tempo: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round((60 / tempoBpm) * 1e6) },
    { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4 },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
  const pistes = parties.map((p) => {
    const evts: any[] = [{ deltaTime: 0, meta: true, type: "trackName", text: p.nom }];
    for (const note of p.notes) {
      evts.push({ deltaTime: 0, type: "noteOn", noteNumber: note, velocity: 90, channel: p.canal });
      evts.push({ deltaTime: TPM, type: "noteOff", noteNumber: note, velocity: 0, channel: p.canal });
    }
    evts.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    return evts;
  });
  return new Uint8Array(writeMidi({
    header: { format: 1, numTracks: pistes.length + 1, ticksPerBeat: TPM },
    tracks: [tempo, ...pistes],
  } as any));
}

const QUATRE_PARTIES = () => arrangement([
  { canal: 0, nom: "Mélodie", notes: [72, 74, 76, 77] },
  { canal: 1, nom: "Accords", notes: [60, 64, 67] },
  { canal: 2, nom: "Basse", notes: [36, 43] },
  { canal: CANAL_BATTERIE, nom: "Batterie", notes: [36, 38, 42, 42, 36, 38] },
]);

describe("l'inventaire d'un fichier MIDI", () => {
  it("compte les notes par canal et nomme les pistes", () => {
    const inv = inventaireMidi(parseMidi(QUATRE_PARTIES()));
    expect(inv.notesTotal).toBe(4 + 3 + 2 + 6);
    expect(inv.parCanal.get(0)).toBe(4);
    expect(inv.parCanal.get(1)).toBe(3);
    expect(inv.parCanal.get(2)).toBe(2);
    expect(inv.parCanal.get(CANAL_BATTERIE)).toBe(6);
    expect(inv.pistes.map((p) => p.nom)).toEqual(["Mélodie", "Accords", "Basse", "Batterie"]);
    // La piste de tempo ne joue rien : elle n'est pas une partie, et ne doit pas en faire une.
    expect(inv.pistes.length).toBe(4);
    expect(inv.pistes[0].numero).toBe(2);
  });

  it("ne compte pas comme jouant un canal qui n'a qu'un changement de programme", () => {
    // Le piège réel : beaucoup d'exportateurs posent un `programChange` sur les seize canaux.
    const bytes = new Uint8Array(writeMidi({
      header: { format: 1, numTracks: 1, ticksPerBeat: TPM },
      tracks: [[
        { deltaTime: 0, type: "programChange", channel: 5, programNumber: 40 },
        { deltaTime: 0, type: "noteOn", noteNumber: 60, velocity: 80, channel: 0 },
        { deltaTime: TPM, type: "noteOff", noteNumber: 60, velocity: 0, channel: 0 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ]],
    } as any));
    const inv = inventaireMidi(parseMidi(bytes));
    expect([...inv.parCanal.keys()]).toEqual([0]);
  });

  it("ne compte pas un noteOn de vélocité nulle, qui est un noteOff déguisé", () => {
    const bytes = new Uint8Array(writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: TPM },
      tracks: [[
        { deltaTime: 0, type: "noteOn", noteNumber: 60, velocity: 80, channel: 0 },
        { deltaTime: TPM, type: "noteOn", noteNumber: 60, velocity: 0, channel: 0 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ]],
    } as any));
    expect(inventaireMidi(parseMidi(bytes)).notesTotal).toBe(1);
  });
});

describe("la répartition automatique", () => {
  it("met la BATTERIE sur la dernière partie, et les autres dans l'ordre des canaux", () => {
    const inv = inventaireMidi(parseMidi(QUATRE_PARTIES()));
    const { parties, reste } = repartirCanaux(inv, 4);
    expect(parties).toEqual([[0], [1], [2], [CANAL_BATTERIE]]);
    expect(reste).toEqual([]);
  });

  it("laisse la dernière partie aux canaux mélodiques quand il n'y a pas de batterie", () => {
    const inv = inventaireMidi(parseMidi(arrangement([
      { canal: 0, nom: "A", notes: [60] }, { canal: 1, nom: "B", notes: [62] },
      { canal: 2, nom: "C", notes: [64] }, { canal: 3, nom: "D", notes: [65] },
    ])));
    expect(repartirCanaux(inv, 4).parties).toEqual([[0], [1], [2], [3]]);
  });

  it("ne PERD rien quand il y a plus de canaux que de parties : le surplus va au reste", () => {
    const inv = inventaireMidi(parseMidi(arrangement([
      { canal: 0, nom: "A", notes: [60] }, { canal: 1, nom: "B", notes: [62] },
      { canal: 2, nom: "C", notes: [64] }, { canal: 3, nom: "D", notes: [65] },
      { canal: 4, nom: "E", notes: [67] },
      { canal: CANAL_BATTERIE, nom: "Bat", notes: [36] },
    ])));
    const { parties, reste } = repartirCanaux(inv, 4);
    expect(parties).toEqual([[0], [1], [2], [CANAL_BATTERIE]]);
    expect(reste).toEqual([3, 4]);
  });

  it("laisse des parties vides plutôt que d'inventer du contenu", () => {
    const inv = inventaireMidi(parseMidi(arrangement([{ canal: 0, nom: "A", notes: [60] }])));
    const { parties } = repartirCanaux(inv, 4);
    expect(parties[0]).toEqual([0]);
    expect(parties.slice(1)).toEqual([[], [], []]);
  });

  it("place la batterie même seule, sur la dernière partie", () => {
    const inv = inventaireMidi(parseMidi(arrangement([{ canal: CANAL_BATTERIE, nom: "Bat", notes: [36, 38] }])));
    expect(repartirCanaux(inv, 4).parties).toEqual([[], [], [], [CANAL_BATTERIE]]);
  });
});

describe("les listes de canaux écrites à la main", () => {
  it("lit les numéros, les plages et les séparateurs, en numérotation humaine", () => {
    expect(analyserListeCanaux("1")).toEqual([0]);
    expect(analyserListeCanaux("1,2")).toEqual([0, 1]);
    expect(analyserListeCanaux("1 3")).toEqual([0, 2]);
    expect(analyserListeCanaux("1-3")).toEqual([0, 1, 2]);
    expect(analyserListeCanaux("3-1")).toEqual([0, 1, 2]);
    expect(analyserListeCanaux("1, 3-5")).toEqual([0, 2, 3, 4]);
    expect(analyserListeCanaux("10")).toEqual([CANAL_BATTERIE]);
  });

  it("écarte ce qui n'est pas un canal, plutôt que de tout filtrer", () => {
    expect(analyserListeCanaux("")).toEqual([]);
    expect(analyserListeCanaux("0")).toEqual([]);        // les canaux commencent à 1
    expect(analyserListeCanaux("17")).toEqual([]);
    expect(analyserListeCanaux("bonjour")).toEqual([]);
    expect(analyserListeCanaux("2,bonjour,4")).toEqual([1, 3]);
  });

  it("se relit : la liste rendue est celle qu'on écrirait", () => {
    expect(listeCanauxHumaine(analyserListeCanaux("1, 3-5"))).toBe("1, 3, 4, 5");
  });
});

describe("le découpage, et ce qu'il préserve", () => {
  const tempoDe = (bytes: Uint8Array): number | null => {
    for (const piste of parseMidi(bytes).tracks) {
      for (const evt of piste as any[]) if (evt.type === "setTempo") return evt.microsecondsPerBeat;
    }
    return null;
  };

  it("la SOMME des notes des parties égale celle du fichier d'origine", () => {
    const bytes = QUATRE_PARTIES();
    const total = compterNotes(bytes);
    const { parties } = repartirCanaux(inventaireMidi(parseMidi(bytes)), 4);
    const somme = parties.reduce((s, canaux) => s + compterNotes(filtrerCanauxMidi(bytes, canaux)), 0);
    expect(somme).toBe(total);
  });

  it("chaque partie garde le TEMPO du morceau — sans quoi les quatre instruments divergent", () => {
    const bytes = QUATRE_PARTIES();
    const attendu = tempoDe(bytes);
    expect(attendu).toBe(Math.round((60 / 96) * 1e6));
    const { parties } = repartirCanaux(inventaireMidi(parseMidi(bytes)), 4);
    for (const canaux of parties) {
      expect(tempoDe(filtrerCanauxMidi(bytes, canaux))).toBe(attendu);
    }
  });

  it("une partie ne contient QUE son canal", () => {
    const bytes = QUATRE_PARTIES();
    const part = filtrerCanauxMidi(bytes, [1]);
    const inv = inventaireMidi(parseMidi(part));
    expect([...inv.parCanal.keys()]).toEqual([1]);
    expect(inv.notesTotal).toBe(3);
  });

  it("découpe aussi PAR PISTE, pour les fichiers dont les voix partagent un canal", () => {
    // Quatre voix sur le même canal, séparées par pistes : un filtrage par canal ne saurait rien
    // en faire, et c'est exactement ce que produit un logiciel de notation.
    const bytes = arrangement([
      { canal: 0, nom: "Soprano", notes: [72, 74] },
      { canal: 0, nom: "Alto", notes: [67, 69] },
      { canal: 0, nom: "Ténor", notes: [60, 62] },
      { canal: 0, nom: "Basse", notes: [48, 50, 52] },
    ]);
    expect(inventaireMidi(parseMidi(bytes)).parCanal.size).toBe(1);
    const alto = filtrerPistesMidi(bytes, [3]); // piste 1 = tempo, piste 3 = Alto
    const inv = inventaireMidi(parseMidi(alto));
    expect(inv.notesTotal).toBe(2);
    expect(inv.pistes[0].nom).toBe("Alto");
  });

  it("garde le tempo dans un découpage par piste, même si la piste de tempo est écartée", () => {
    const bytes = QUATRE_PARTIES();
    const seule = filtrerPistesMidi(bytes, [3]); // ni la piste 1 (tempo) ni les autres
    expect(tempoDe(seule)).toBe(Math.round((60 / 96) * 1e6));
    expect(compterNotes(seule)).toBe(3);
  });

  it("et la somme des pistes découpées fait aussi le total", () => {
    const bytes = QUATRE_PARTIES();
    const somme = [2, 3, 4, 5].reduce((s, p) => s + compterNotes(filtrerPistesMidi(bytes, [p])), 0);
    expect(somme).toBe(compterNotes(bytes));
  });
});
