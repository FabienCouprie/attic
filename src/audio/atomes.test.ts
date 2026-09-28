// audio/atomes.test.ts — L'invariant de Mallat et Zhang, vérifié pas à pas.
//
// LE TEST QUI COMPTE EST CELUI DE LA DÉCROISSANCE. La poursuite adaptative retire à chaque tour la
// projection orthogonale du résidu sur l'atome choisi : l'énergie qui reste ne peut donc que
// décroître, atome après atome. C'est la garantie de la méthode, et c'est aussi le piège de sa
// mise en œuvre — prendre le coefficient de la transformée pour la projection fait REMONTER le
// résidu, parce que les fenêtres se recouvrent et que les atomes ne sont pas orthogonaux entre
// eux. Un test qui ne regarderait que le résultat final ne verrait rien ; celui-ci regarde chaque
// pas.
//
// LE SECOND : CHAQUE SON APPELLE SON ÉCHELLE. Une sinusoïde tenue se décrit d'un atome long, un
// clic d'un atome court. Si la comparaison entre échelles était faussée — et elle l'est
// naturellement, une fenêtre longue accumulant plus d'échantillons —, la plus longue gagnerait
// toujours et le dictionnaire multi-échelle ne servirait à rien.
import { describe, expect, it } from "vitest";
import {
  atomesEnNotes, decomposer, echellesEnEchantillons, repartition, type Atome,
} from "./atomes";

const SR = 44100;
const ECHELLES = [512, 2048, 8192];

const vide = (n: number) => new Float32Array(n);

/** Une sinusoïde tenue sur toute la durée. */
function tenue(n: number, hz: number, amplitude = 0.5): Float32Array {
  const x = vide(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  return x;
}

const energie = (x: Float32Array) => { let s = 0; for (const v of x) s += v * v; return s; };

describe("la poursuite adaptative", () => {
  it("L'ÉNERGIE DU RÉSIDU DÉCROÎT À CHAQUE ATOME — la garantie de la méthode", () => {
    const x = tenue(SR, 440);
    let precedente = Infinity;
    for (const n of [1, 2, 3, 5, 8, 13, 21]) {
      const d = decomposer(x, { frequence: SR, atomes: n, echelles: ECHELLES });
      const reste = energie(d.residu);
      expect(reste, `${n} atomes`).toBeLessThanOrEqual(precedente);
      precedente = reste;
    }
  });

  it("UN SEUL ATOME EXPLIQUE DÉJÀ L'ESSENTIEL D'UNE SINUSOÏDE TENUE", () => {
    const d = decomposer(tenue(SR, 440), { frequence: SR, atomes: 1, echelles: ECHELLES });
    expect(d.atomes).toHaveLength(1);
    // Un atome de 8192 échantillons sur 44100 : il ne peut couvrir qu'un cinquième du son.
    expect(d.partExpliqueePc).toBeGreaterThan(10);
    expect(d.atomes[0].echelle).toBe(8192);
    expect(d.atomes[0].frequenceHz).toBeGreaterThan(420);
    expect(d.atomes[0].frequenceHz).toBeLessThan(460);
  });

  it("assez d'atomes reconstruisent le son : l'esquisse rejoint l'original", () => {
    const x = tenue(SR / 2, 440);
    const d = decomposer(x, { frequence: SR, atomes: 60, echelles: ECHELLES });
    expect(d.partExpliqueePc).toBeGreaterThan(90);
    expect(d.rapportSignalResiduDb).toBeGreaterThan(10);
    // Et l'esquisse plus le résidu redonnent exactement l'entrée.
    for (let i = 0; i < x.length; i += 997) {
      expect(d.esquisse[i] + d.residu[i]).toBeCloseTo(x[i], 5);
    }
  });

  it("CHAQUE SON APPELLE SON ÉCHELLE : un clic prend une fenêtre courte, une tenue une longue", () => {
    const clic = vide(SR);
    // Une impulsion brève, filtrée par une demi-période de sinus : un transitoire, pas une note.
    for (let i = 0; i < 64; i++) clic[SR / 2 + i] = Math.sin((Math.PI * i) / 64) * 0.9;
    const dClic = decomposer(clic, { frequence: SR, atomes: 3, echelles: ECHELLES });
    expect(Math.min(...dClic.atomes.map((a) => a.echelle))).toBe(512);

    const dTenue = decomposer(tenue(SR, 440), { frequence: SR, atomes: 3, echelles: ECHELLES });
    expect(dTenue.atomes.every((a) => a.echelle === 8192)).toBe(true);
  });

  it("deux sinusoïdes éloignées donnent deux familles d'atomes", () => {
    const x = vide(SR);
    for (let i = 0; i < x.length; i++) {
      x[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / SR) + 0.4 * Math.sin((2 * Math.PI * 3000 * i) / SR);
    }
    const d = decomposer(x, { frequence: SR, atomes: 12, echelles: ECHELLES });
    const graves = d.atomes.filter((a) => a.frequenceHz < 1000).length;
    const aigus = d.atomes.filter((a) => a.frequenceHz > 2000).length;
    expect(graves).toBeGreaterThan(0);
    expect(aigus).toBeGreaterThan(0);
  });

  it("l'atome le plus fort vient en premier, et les poids décroissent globalement", () => {
    const d = decomposer(tenue(SR, 440), { frequence: SR, atomes: 20, echelles: ECHELLES });
    const premier = Math.abs(d.atomes[0].poids);
    const dernier = Math.abs(d.atomes[d.atomes.length - 1].poids);
    expect(premier).toBeGreaterThan(dernier);
  });

  it("le silence ne rend aucun atome, et ne divise pas par zéro", () => {
    const d = decomposer(vide(SR), { frequence: SR, atomes: 10, echelles: ECHELLES });
    expect(d.atomes).toEqual([]);
    expect(d.partExpliqueePc).toBe(0);
    expect(Number.isFinite(d.rapportSignalResiduDb)).toBe(true);
  });

  it("les cas limites rendent un résultat vide plutôt qu'une erreur", () => {
    for (const cas of [
      { x: new Float32Array(0), atomes: 5, echelles: ECHELLES },
      { x: tenue(1000, 440), atomes: 5, echelles: [65536] },
      { x: tenue(SR, 440), atomes: 0, echelles: ECHELLES },
    ]) {
      const d = decomposer(cas.x, { frequence: SR, atomes: cas.atomes, echelles: cas.echelles });
      expect(d.atomes).toEqual([]);
      expect(d.esquisse.length).toBe(cas.x.length);
    }
  });

  it("demander plus d'atomes qu'il n'y a de son s'arrête proprement", () => {
    const d = decomposer(tenue(4096, 440), { frequence: SR, atomes: 500, echelles: [2048] });
    expect(d.atomes.length).toBeLessThanOrEqual(500);
    expect(d.rapportSignalResiduDb).toBeGreaterThan(0);
  });
});

describe("les échelles proposées", () => {
  it("se traduisent en puissances de deux, dans l'ordre", () => {
    const trois = echellesEnEchantillons("trois", SR);
    expect(trois).toEqual([256, 2048, 8192]);
    expect(echellesEnEchantillons("courte", SR)).toEqual([256]);
    expect(echellesEnEchantillons("longue", SR)).toEqual([8192]);
  });

  it("un choix inconnu retombe sur les trois échelles", () => {
    expect(echellesEnEchantillons("n'importe quoi" as never, SR)).toEqual([256, 2048, 8192]);
  });

  it("la répartition dit où le son se décrit le mieux", () => {
    const atomes: Atome[] = [
      { echelle: 512, debut: 0, frequenceHz: 100, poids: 1, phase: 0 },
      { echelle: 8192, debut: 0, frequenceHz: 100, poids: 1, phase: 0 },
      { echelle: 8192, debut: 0, frequenceHz: 100, poids: 1, phase: 0 },
    ];
    expect([...repartition(atomes).entries()].sort()).toEqual([[512, 1], [8192, 2]]);
  });
});

describe("les atomes rendus comme des notes", () => {
  // CE PASSAGE EST LE SEUL DU DÉPÔT QUI AILLE D'UN SON VERS UNE SÉQUENCE. Ce qu'il porte doit donc
  // être juste au sens musical, et non seulement bien typé : un instant en secondes, une durée qui
  // est la fenêtre, une hauteur qui garde sa virgule, et une nuance qui veuille dire quelque chose.
  const atome = (o: Partial<Atome>): Atome =>
    ({ echelle: 2048, debut: 0, frequenceHz: 440, poids: 1, phase: 0, ...o });

  it("L'INSTANT ET LA DURÉE VIENNENT DE LA FENÊTRE, en secondes", () => {
    const { notes } = atomesEnNotes([atome({ debut: 44100, echelle: 4410 })], SR);
    expect(notes[0].debut).toBeCloseTo(1, 10);
    expect(notes[0].fin).toBeCloseTo(1.1, 10);
  });

  it("LA HAUTEUR GARDE SA VIRGULE, un atome étant placé en hertz", () => {
    expect(atomesEnNotes([atome({ frequenceHz: 440 })], SR).notes[0].note).toBeCloseTo(69, 10);
    // Un quart de ton au-dessus du la : 440 × 2^(1/24).
    const quart = atomesEnNotes([atome({ frequenceHz: 440 * 2 ** (1 / 24) })], SR).notes[0].note;
    expect(quart).toBeCloseTo(69.5, 6);
    expect(Number.isInteger(quart)).toBe(false);
  });

  it("LA NUANCE EST RELATIVE AU PLUS FORT, le coefficient n'ayant pas d'échelle absolue", () => {
    const { notes } = atomesEnNotes(
      [atome({ poids: 1, debut: 0 }), atome({ poids: 0.5, debut: 100 }), atome({ poids: -1, debut: 200 })], SR,
    );
    expect(notes[0].velocite).toBe(127);
    expect(notes[1].velocite).toBeGreaterThan(50);
    expect(notes[1].velocite).toBeLessThan(90);
    // LE SIGNE DU COEFFICIENT NE DIT RIEN DE LA FORCE : une projection négative est une phase, non
    // une note plus faible.
    expect(notes[2].velocite).toBe(127);
  });

  it("DEUX PRISES DU MÊME CONTENU À DIX DÉCIBELS D'ÉCART DONNENT LES MÊMES NUANCES", () => {
    const suite = [atome({ poids: 1 }), atome({ poids: 0.4, debut: 100 })];
    const forte = suite.map((a) => ({ ...a, poids: a.poids * 3.16 }));
    expect(atomesEnNotes(forte, SR).notes.map((n) => n.velocite))
      .toEqual(atomesEnNotes(suite, SR).notes.map((n) => n.velocite));
  });

  it("CE QUI SORT DES 128 DEMI-TONS EST ÉCARTÉ, et compté", () => {
    // Sous vingt hertz et près de la moitié de la fréquence d'échantillonnage, la poursuite place
    // des atomes qu'aucune hauteur MIDI ne nomme.
    const { notes, ecartees } = atomesEnNotes(
      [atome({ frequenceHz: 2 }), atome({ frequenceHz: 440 }), atome({ frequenceHz: 20000 })], SR,
    );
    expect(notes.length).toBe(1);
    expect(ecartees).toBe(2);
    expect(notes[0].note).toBeCloseTo(69, 10);
  });

  it("LES NOTES SONT RANGÉES DANS LE TEMPS, une séquence se lisant de gauche à droite", () => {
    const { notes } = atomesEnNotes(
      [atome({ debut: 3000 }), atome({ debut: 0 }), atome({ debut: 1500 })], SR,
    );
    expect(notes.map((n) => n.debut)).toEqual([0, 1500 / SR, 3000 / SR]);
  });

  it("aucun atome ne fait aucune note", () => {
    expect(atomesEnNotes([], SR)).toEqual({ notes: [], ecartees: 0 });
  });
});
