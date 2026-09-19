// audio/terrain-onde.test.ts — L'orbite fait la hauteur, le terrain fait le timbre.
//
// Ces deux indépendances sont la raison d'être du procédé, et elles se vérifient : le signal
// se répète à la période de l'orbite quel que soit le terrain, et changer le rayon change la
// forme d'onde sans toucher à la période. Un test tient en plus le fait le plus
// contre-intuitif : sur un terrain symétrique, un tour d'orbite passe DEUX fois par le même
// relief, et l'on entend donc l'octave au-dessus de la vitesse de rotation.
import { describe, expect, it } from "vitest";
import { altitude, positionOrbite, synthetiserTerrain, type ConfigTerrain } from "./terrain-onde";

const FS = 44100;

const base: ConfigTerrain = {
  terrain: "classique", orbite: "cercle", frequence: 220, duree: 1, frequenceEch: FS,
  rayon: 0.8, aplatissement: 0.5, rapportX: 1, rapportY: 1, derive: 0, centreX: 0, centreY: 0,
};

const jouer = (o: Partial<ConfigTerrain> = {}, evaluer?: (x: number, y: number) => number) =>
  synthetiserTerrain({ ...base, ...o }, evaluer);

/** Autocorrélation normalisée à un décalage donné. */
function correlation(signal: Float32Array, depart: number, lag: number): number {
  const debut = Math.floor(depart * FS);
  const termes = 6000;
  let produit = 0, energie = 0;
  for (let i = 0; i < termes; i++) {
    produit += signal[debut + i] * signal[debut + i + lag];
    energie += signal[debut + i] * signal[debut + i];
  }
  return produit / Math.max(1e-12, energie);
}

function forme(signal: Float32Array, depart: number, periode: number): number[] {
  const debut = Math.floor(depart * FS);
  const p: number[] = [];
  for (let i = 0; i < periode; i++) p.push(signal[debut + i]);
  const norme = Math.sqrt(p.reduce((s, x) => s + x * x, 0));
  return p.map((x) => x / Math.max(1e-12, norme));
}

const produitScalaire = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

describe("terrains", () => {
  it("donne le terrain de la littérature, creusé sur les droites x = ±1 et y = ±1", () => {
    // Le produit s'annule dès qu'un facteur s'annule : ce sont les vallées.
    expect(altitude("classique", 1, 0.3)).toBeCloseTo(0, 10);
    expect(altitude("classique", 0.3, -1)).toBeCloseTo(0, 10);
    // Le facteur (x − y) creuse aussi toute la diagonale, origine comprise : il faut donc
    // sortir de la diagonale pour trouver du relief.
    expect(altitude("classique", 0.5, 0.5)).toBeCloseTo(0, 10);
    expect(altitude("classique", 0.5, 0)).toBeCloseTo(0.375, 10);
  });

  it("donne une selle symétrique par rotation d'un quart de tour", () => {
    // z(x, y) = −z(y, x) : c'est la symétrie qui doublera la fréquence.
    expect(altitude("selle", 0.7, 0.2)).toBeCloseTo(-altitude("selle", 0.2, 0.7), 10);
  });

  it("borne les terminaux périodiques entre −1 et 1", () => {
    for (const t of ["produit", "ondes"] as const) {
      for (let i = 0; i < 50; i++) {
        const z = altitude(t, i / 7 - 3, i / 11 - 2);
        expect(Math.abs(z), t).toBeLessThanOrEqual(1.000001);
      }
    }
  });
});

describe("orbites", () => {
  it("revient au point de départ après un tour", () => {
    for (const orbite of ["cercle", "ellipse"] as const) {
      const a = positionOrbite({ ...base, orbite }, 0, 0.8);
      const b = positionOrbite({ ...base, orbite }, 1, 0.8);
      expect(a.x, orbite).toBeCloseTo(b.x, 10);
      expect(a.y, orbite).toBeCloseTo(b.y, 10);
    }
  });

  it("aplatit l'ellipse sur l'axe des y", () => {
    const p = positionOrbite({ ...base, orbite: "ellipse", aplatissement: 0.25 }, 0.25, 1);
    expect(Math.abs(p.y)).toBeCloseTo(0.25, 6);
  });

  it("décale le centre quand on le lui demande", () => {
    const p = positionOrbite({ ...base, centreX: 0.5, centreY: -0.5 }, 0, 0.2);
    expect(p.x).toBeCloseTo(0.7, 6);
    expect(p.y).toBeCloseTo(-0.5, 6);
  });

  it("boucle en trois tours pour un Lissajous de rapport 3 contre 1", () => {
    const config = { ...base, orbite: "lissajous" as const, rapportX: 3, rapportY: 1 };
    const a = positionOrbite(config, 0, 1);
    expect(positionOrbite(config, 1, 1).x).toBeCloseTo(a.x, 6);
    expect(positionOrbite(config, 1, 1).y).toBeCloseTo(a.y, 6);
  });
});

describe("hauteur et timbre séparés", () => {
  it("se répète à la période de l'orbite, sur tous les terrains", () => {
    const periode = Math.round(FS / 220);
    for (const terrain of ["classique", "selle", "produit", "ondes"] as const) {
      // Le terrain « ondes » est fait de cercles concentriques : il est CONSTANT le long
      // d'un cercle centré, et ne donne donc rien du tout sur cette orbite-là. Il demande
      // un centre décalé, et c'est une propriété de sa géométrie, pas un défaut.
      const centreX = terrain === "ondes" ? 0.6 : 0;
      expect(correlation(jouer({ terrain, centreX }).signal, 0.2, periode), terrain)
        .toBeGreaterThan(0.8);
    }
  });

  it("ne rend rien du terrain concentrique sur une orbite centrée — et c'est géométrique", () => {
    const { signal } = jouer({ terrain: "ondes", centreX: 0, centreY: 0 });
    expect([...signal].every((x) => Math.abs(x) < 1e-6)).toBe(true);
    // Décentré, il parle.
    const decale = jouer({ terrain: "ondes", centreX: 0.6 }).signal;
    expect([...decale].some((x) => Math.abs(x) > 0.5)).toBe(true);
  });

  it("sonne à l'octave au-dessus sur un terrain symétrique", () => {
    // Selle : le tour d'orbite passe deux fois par le même relief, donc la vraie période
    // est la moitié de celle de l'orbite. Sur le terrain classique, non symétrique, la
    // demi-période ne se répète pas.
    const periode = Math.round(FS / 220);
    const demi = Math.round(periode / 2);
    expect(correlation(jouer({ terrain: "selle" }).signal, 0.2, demi)).toBeGreaterThan(0.8);
    expect(correlation(jouer({ terrain: "classique" }).signal, 0.2, demi)).toBeLessThan(0.5);
  });

  it("change la forme d'onde quand on change le rayon, sans toucher à la période", () => {
    const periode = Math.round(FS / 220);
    const petite = forme(jouer({ rayon: 0.3 }).signal, 0.2, periode);
    const grande = forme(jouer({ rayon: 1.4 }).signal, 0.2, periode);
    expect(Math.abs(produitScalaire(petite, grande))).toBeLessThan(0.95);
    expect(correlation(jouer({ rayon: 1.4 }).signal, 0.2, periode)).toBeGreaterThan(0.8);
  });

  it("fait évoluer le timbre quand le rayon dérive", () => {
    const periode = Math.round(FS / 220);
    const { signal } = jouer({ duree: 2, derive: 0.9 });
    const debut = forme(signal, 0.1, periode), fin = forme(signal, 1.8, periode);
    expect(Math.abs(produitScalaire(debut, fin))).toBeLessThan(0.98);
    // Et la période n'a pas bougé pour autant.
    expect(correlation(signal, 1.8, periode)).toBeGreaterThan(0.8);
  });

  it("explore d'autant plus de relief que le rayon est grand", () => {
    const etendue = (rayon: number) => {
      const r = jouer({ rayon });
      return r.maximum - r.minimum;
    };
    expect(etendue(1.2)).toBeGreaterThan(etendue(0.3));
  });
});

describe("terrain personnalisé", () => {
  it("emploie la fonction fournie", () => {
    const periode = Math.round(FS / 220);
    const { signal } = jouer({ terrain: "personnalise" }, (x) => x);
    // z = x sur un cercle : une sinusoïde pure à la fréquence de l'orbite.
    expect(correlation(signal, 0.2, periode)).toBeGreaterThan(0.95);
    expect(correlation(signal, 0.5, periode)).toBeGreaterThan(0.95);
    // Une sinusoïde est en OPPOSITION de phase avec elle-même à la demi-période.
    expect(correlation(signal, 0.2, Math.round(periode / 2))).toBeLessThan(-0.9);
  });

  it("remplace par le silence une formule qui ne rend pas un nombre", () => {
    const { signal } = jouer({ terrain: "personnalise" }, () => NaN);
    expect([...signal].every((x) => x === 0)).toBe(true);
  });

  it("retombe sur le terrain classique quand aucune fonction n'est fournie", () => {
    expect(jouer({ terrain: "personnalise" }).signal)
      .toEqual(jouer({ terrain: "classique" }).signal);
  });
});

describe("robustesse", () => {
  it("rend la longueur demandée, centrée et sans saturer", () => {
    const { signal } = jouer({ duree: 0.5 });
    expect(signal.length).toBe(Math.ceil(0.5 * FS));
    let crete = 0, somme = 0;
    for (const x of signal) { crete = Math.max(crete, Math.abs(x)); somme += x; }
    expect(crete).toBeCloseTo(0.9, 6);
    expect(Math.abs(somme / signal.length)).toBeLessThan(0.01);
  });

  it("supporte un rayon nul : l'orbite reste sur place et le son est silencieux", () => {
    const { signal } = jouer({ rayon: 0, duree: 0.2 });
    expect([...signal].every((x) => Math.abs(x) < 1e-6)).toBe(true);
  });

  it("tient les fréquences extrêmes", () => {
    for (const frequence of [0.1, 20, 10000]) {
      const { signal } = jouer({ frequence, duree: 0.2 });
      for (const x of signal) expect(Number.isFinite(x), `${frequence} Hz`).toBe(true);
    }
  });

  it("rend le même signal deux fois : rien n'est aléatoire", () => {
    expect(jouer({ duree: 0.3 }).signal).toEqual(jouer({ duree: 0.3 }).signal);
  });
});
