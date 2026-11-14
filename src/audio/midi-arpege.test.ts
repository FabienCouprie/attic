// audio/midi-arpege.test.ts — La vitesse de l'arpégiateur, et les deux écritures du triolet.
//
// CE QUE CE FICHIER ARRÊTE. Le réglage « Vitesse » nomme une valeur de note, et le calcul la
// traduit en divisions par temps par une table écrite à côté de lui. Un nom absent de cette table
// retombe sur quatre, c'est-à-dire sur la double croche, SANS QUE RIEN NE LE DISE. Les
// identifiants de ce réglage viennent désormais de `audio/valeurs-note.ts`, où le triolet s'écrit
// `1/8t` et non « 1/8 triplet » : si la table du calcul ne suivait pas, le triolet rendrait des
// doubles croches en silence, et le contrat de composant interdit un réglage qui ne change rien.
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { NOIRES_PAR_PAS, arpegerMidi } from "./midi-arpege";
import { analyserMidi } from "./midi";
import { parseMidi } from "midi-file";

/** Un accord de trois notes tenu une noire, à 480 tics par noire. */
function accordMidi(): File {
  const octets = writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[
      { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 } as any,
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 100 } as any,
      { deltaTime: 1920, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 } as any,
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 } as any,
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 0 } as any,
      { deltaTime: 0, meta: true, type: "endOfTrack" } as any,
    ]],
  });
  return new File([new Uint8Array(octets)], "accord.mid");
}

/**
 * L'écartement des notes arpégées, en secondes.
 *
 * CE N'EST PAS LE COMPTE QUI VARIE, MAIS LE PAS. L'arpégiateur rend un pas par note de l'accord,
 * de sorte que trois notes en donnent trois quelle que soit la vitesse ; ce que la vitesse décide,
 * c'est l'intervalle qui les sépare. Mesurer le compte ne verrait donc rien bouger, et c'est
 * exactement l'erreur qu'un garde doit éviter : croire mesurer un réglage en regardant ailleurs.
 */
const ecartement = async (vitesse: string) => {
  const sortie = await arpegerMidi(accordMidi(), "Droit", "Montant", vitesse, 1, 80);
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await sortie.arrayBuffer())));
  const debuts = notes.map((n) => n.debut).sort((a, b) => a - b);
  expect(debuts.length, `« ${vitesse} » ne rend aucune note`).toBeGreaterThan(1);
  return debuts[1] - debuts[0];
};

describe("la vitesse de l'arpégiateur", () => {
  it("CHAQUE VALEUR CHANGE L'ÉCARTEMENT, sinon le réglage serait inerte", async () => {
    const croche = await ecartement("1/8");
    const doubleCroche = await ecartement("1/16");
    const tripleCroche = await ecartement("1/32");
    expect(doubleCroche, "1/16 doit serrer plus que 1/8").toBeLessThan(croche);
    expect(tripleCroche, "1/32 doit serrer plus que 1/16").toBeLessThan(doubleCroche);
  });

  it("LE TRIOLET EST LU SOUS SON IDENTIFIANT, et non retombé sur la double croche", async () => {
    // TROIS DIVISIONS PAR TEMPS, ET NON QUATRE : l'écartement doit se placer ENTRE celui de la
    // croche et celui de la double croche, ce qu'aucun repli silencieux ne donnerait.
    const croche = await ecartement("1/8");
    const triolet = await ecartement("1/8t");
    const doubleCroche = await ecartement("1/16");
    expect(triolet, "« 1/8t » rend l'écartement de la croche, donc il n'est pas lu").toBeLessThan(croche);
    expect(triolet, "« 1/8t » rend l'écartement de la double croche, donc il est retombé dessus")
      .toBeGreaterThan(doubleCroche);
  });

  it("ET SOUS L'ÉCRITURE QU'UN PROJET ANCIEN PORTE, « 1/8 triplet »", async () => {
    expect(await ecartement("1/8 triplet")).toBe(await ecartement("1/8t"));
    expect(await ecartement("1/16 triplet")).toBe(await ecartement("1/16t"));
  });
});

/**
 * Un accord, ses notes dans l'ordre donné et décalées de deux tics l'une après l'autre (au plus
 * 12,5 ms entre la première et la quatrième à 60 BPM, sous les 30 ms qui font un accord), tenu
 * `temps` noires, au tempo et à la métrique donnés.
 */
function accordDonne(notes: number[], o: { bpm?: number; temps?: number; metrique?: [number, number] } = {}): File {
  const { bpm = 120, temps = 1, metrique } = o;
  const ev: any[] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60e6 / bpm) }];
  if (metrique) ev.push({ deltaTime: 0, meta: true, type: "timeSignature", numerator: metrique[0], denominator: metrique[1], metronome: 24, thirtyseconds: 8 });
  notes.forEach((n, i) => ev.push({ deltaTime: i === 0 ? 0 : 2, type: "noteOn", channel: 0, noteNumber: n, velocity: 100 }));
  notes.forEach((n, i) => ev.push({ deltaTime: i === 0 ? 480 * temps - 2 * (notes.length - 1) : 0, type: "noteOff", channel: 0, noteNumber: n, velocity: 0 }));
  ev.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return new File([new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [ev] }))], "accord.mid");
}

/** Les hauteurs rendues, dans l'ordre où elles sonnent. */
async function suite(f: File, motif: string, direction: string, octaves = 1, hasard?: () => number): Promise<number[]> {
  const sortie = await arpegerMidi(f, motif, direction, "1/16", octaves, 80, hasard);
  const { notes } = analyserMidi(parseMidi(new Uint8Array(await sortie.arrayBuffer())));
  return notes.sort((a, b) => a.debut - b.debut).map((n) => n.note);
}

describe("LE PAS SE COMPTE EN NOIRES DU FICHIER", () => {
  // LE DÉFAUT QUE CE CAS ARRÊTE, mesuré le 2026-11-14 : le pas se calculait par `60 / (divisions *
  // 2)` secondes, « à 120 BPM de référence ». La double croche y valait 7,5 s, soixante fois trop
  // lente, et 60 BPM rendait le même écartement que 120. Les deux cas qui précèdent ne comparaient
  // que des écartements entre eux, et passaient.
  it.each([120, 60, 90])("à %i BPM, chaque valeur offerte espace les notes de sa durée", async (bpm) => {
    const ecarts: string[] = [];
    for (const [valeur, noires] of Object.entries(NOIRES_PAR_PAS)) {
      const sortie = await arpegerMidi(accordDonne([60, 64, 67], { bpm, temps: 8 }), "Droit", "montant", valeur, 1, 80);
      const debuts = analyserMidi(parseMidi(new Uint8Array(await sortie.arrayBuffer()))).notes.map((n) => n.debut).sort((a, b) => a - b);
      const attendu = (noires * 60) / bpm;
      if (Math.abs(debuts[1] - debuts[0] - attendu) > 1e-3) ecarts.push(`${valeur} : ${(debuts[1] - debuts[0]).toFixed(4)} s au lieu de ${attendu.toFixed(4)}`);
    }
    expect(ecarts).toEqual([]);
  });

  it("le fichier rendu garde le tempo et la métrique de l'entrée", async () => {
    const sortie = await arpegerMidi(accordDonne([60, 64, 67], { bpm: 90, metrique: [3, 4] }), "Droit", "montant", "1/16", 1, 80);
    const evts = parseMidi(new Uint8Array(await sortie.arrayBuffer())).tracks[0];
    expect(evts.filter((e) => e.type === "setTempo").map((e) => (e as any).microsecondsPerBeat)).toEqual([666667]);
    const sig = evts.find((e) => e.type === "timeSignature") as any;
    expect([sig.numerator, sig.denominator]).toEqual([3, 4]);
  });

  it("À 60 BPM, UN ACCORD TENU DEUX TEMPS REND DEUX CYCLES, ET LE SUIVANT PART SUR SON TEMPS", async () => {
    // LE CAS QUI MANQUAIT, vu sur une faute plantée : convertir les secondes en noires à 120 BPM
    // fixes laissait verts les cas qui précèdent, un accord seul partant de zéro quel que soit le
    // tempo. Ici, deux accords à 60 BPM : do mi sol tenu deux temps, puis ré fa la au troisième.
    const ev: any[] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 1_000_000 }];
    for (const n of [60, 64, 67]) ev.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n, velocity: 100 });
    [60, 64, 67].forEach((n, i) => ev.push({ deltaTime: i === 0 ? 960 : 0, type: "noteOff", channel: 0, noteNumber: n, velocity: 0 }));
    for (const n of [62, 65, 69]) ev.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n, velocity: 100 });
    [62, 65, 69].forEach((n, i) => ev.push({ deltaTime: i === 0 ? 480 : 0, type: "noteOff", channel: 0, noteNumber: n, velocity: 0 }));
    ev.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
    const f = new File([new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [ev] }))], "deux.mid");
    const sortie = await arpegerMidi(f, "Droit", "montant", "1/16", 1, 80);
    const notes = analyserMidi(parseMidi(new Uint8Array(await sortie.arrayBuffer()))).notes.sort((a, b) => a.debut - b.debut);
    // Huit doubles croches dans les deux temps du premier accord : deux cycles de trois notes.
    expect(notes.filter((n) => [60, 64, 67].includes(n.note)).length).toBe(6);
    expect(notes.find((n) => n.note === 62)!.debut).toBeCloseTo(2, 3);
  });

  it("un accord tenu deux temps en doubles croches rend deux cycles entiers", async () => {
    // Huit pas dans l'accord, trois notes par cycle : deux cycles, six notes.
    expect(await suite(accordDonne([60, 64, 67], { temps: 2 }), "Droit", "montant")).toEqual([60, 64, 67, 60, 64, 67]);
  });
});

describe("la direction déroule l'arpège entier, octaves comprises", () => {
  // Les notes arrivent sol, mi, do : c'est l'ordre de jeu.
  const accord = () => accordDonne([67, 64, 60], { temps: 4 });
  const ATTENDU: Record<string, number[]> = {
    "montant": [60, 64, 67, 72, 76, 79],
    "descendant": [79, 76, 72, 67, 64, 60],
    "aller-retour": [60, 64, 67, 72, 76, 79, 76, 72, 67, 64],
    "retour-aller": [79, 76, 72, 67, 64, 60, 64, 67, 72, 76],
    "ordre-de-jeu": [67, 64, 60, 79, 76, 72],
    "convergent": [60, 79, 64, 76, 67, 72],
    "divergent": [72, 67, 76, 64, 79, 60],
  };
  it.each(Object.keys(ATTENDU))("« %s » sur deux octaves", async (direction) => {
    const rendu = await suite(accord(), "Droit", direction, 2);
    expect(rendu.slice(0, ATTENDU[direction].length)).toEqual(ATTENDU[direction]);
  });

  it("« aleatoire » rend une permutation de l'arpège entier, que le tirage fixe", async () => {
    const tirage = (graine: number) => { let x = graine; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };
    const a = await suite(accord(), "Droit", "aleatoire", 2, tirage(7));
    expect(a.slice(0, 6).sort((x, y) => x - y)).toEqual(ATTENDU.montant);
    expect(await suite(accord(), "Droit", "aleatoire", 2, tirage(7))).toEqual(a);
  });

  it("SUR UNE OCTAVE, LES DIRECTIONS D'AVANT RENDENT LES MÊMES HAUTEURS QU'AVANT", async () => {
    // Les hauteurs que rendait le code d'avant, sous ses identifiants d'alors : Montant, Descendant,
    // UpDown, DownUp, et Aléatoire avec un tirage toujours nul.
    const un = () => accordDonne([60, 64, 67]);
    expect(await suite(un(), "Droit", "montant")).toEqual([60, 64, 67]);
    expect(await suite(un(), "Droit", "descendant")).toEqual([67, 64, 60]);
    expect(await suite(un(), "Droit", "aller-retour")).toEqual([60, 64, 67, 64]);
    expect(await suite(un(), "Droit", "retour-aller")).toEqual([67, 64, 60, 64]);
    expect(await suite(un(), "Droit", "aleatoire", 1, () => 0)).toEqual([64, 67, 60]);
  });
});

describe("LE MOTIF GLISSE SUR L'ARPÈGE", () => {
  it("sur trois notes et une octave, il rend ce qu'il rendait", async () => {
    const un = () => accordDonne([60, 64, 67]);
    expect(await suite(un(), "1232", "montant")).toEqual([60, 64, 67, 64]);
    expect(await suite(un(), "12321", "montant")).toEqual([60, 64, 67, 64, 60]);
    expect(await suite(un(), "1321", "montant")).toEqual([60, 67, 64, 60]);
    expect(await suite(un(), "1213", "montant")).toEqual([60, 64, 60, 67]);
  });

  it("« OCTAVES » AGIT AVEC UN MOTIF : il se rejoue décalé jusqu'au bout de l'arpège", async () => {
    // LE DÉFAUT : le motif ne prenait que les trois premières notes, et une octave ou trois
    // rendaient le même 60 64 67 64, mesuré le 2026-11-14.
    expect(await suite(accordDonne([60, 64, 67]), "1232", "montant", 2)).toEqual([
      60, 64, 67, 64, 64, 67, 72, 67, 67, 72, 76, 72, 72, 76, 79, 76,
    ]);
  });

  it("la quatrième note d'un accord est jouée", async () => {
    expect(await suite(accordDonne([60, 64, 67, 71]), "1232", "montant")).toEqual([60, 64, 67, 64, 64, 67, 71, 67]);
  });

  it("un arpège plus court que le motif n'en garde que les notes qui existent", async () => {
    expect(await suite(accordDonne([60, 64]), "1232", "montant")).toEqual([60, 64, 64]);
  });
});
