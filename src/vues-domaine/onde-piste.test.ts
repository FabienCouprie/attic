// ui/onde-piste.test.ts — L'enveloppe et son tracé.
//
// CE QUE CES CAS ATTRAPENT. Une moyenne d'échantillons signés aurait dessiné un trait plat sur une
// sinusoïde pleine échelle, et le défaut aurait été pris pour un choix de dessin. Un silence dessiné
// comme un trait au milieu, un son plein comme une barre entière : ce sont ces deux extrêmes qui
// disent si la lecture de l'enveloppe est juste.
import { describe, expect, it } from "vitest";
import { cheminOnde, enveloppe } from "./onde-piste";

/** Un tampon minimal, sans passer par le Web Audio : seules les données comptent ici. */
function tampon(canaux: Float32Array[]): AudioBuffer {
  return {
    length: canaux[0].length,
    numberOfChannels: canaux.length,
    sampleRate: 44100,
    duration: canaux[0].length / 44100,
    getChannelData: (c: number) => canaux[c],
  } as unknown as AudioBuffer;
}

const sinus = (n: number, crete = 1) =>
  Float32Array.from({ length: n }, (_, i) => crete * Math.sin((2 * Math.PI * i * 40) / n));

describe("l'enveloppe", () => {
  it("d'un silence est nulle partout", () => {
    const env = enveloppe(tampon([new Float32Array(4096)]));
    expect(env.every((v) => v === 0)).toBe(true);
  });

  it("d'une sinusoide pleine echelle atteint un, et sa moyenne n'est pas nulle", () => {
    // LE CAS QUI COMPTE : une moyenne d'échantillons SIGNÉS rendrait zéro partout, et l'onde serait un
    // trait plat. Ce n'est pas le minimum des tranches qu'il faut regarder : à cette résolution,
    // certaines tranches tombent près d'un passage par zéro et valent peu, ce qui est juste. Ce sont
    // la crête atteinte et la moyenne de l'enveloppe qui distinguent une crête d'une moyenne signée.
    const env = enveloppe(tampon([sinus(44100)]));
    expect(Math.max(...env)).toBeGreaterThan(0.9);
    expect(Math.max(...env)).toBeLessThanOrEqual(1);
    const moyenne = env.reduce((s, v) => s + v, 0) / env.length;
    expect(moyenne).toBeGreaterThan(0.2);
  });

  it("suit une rampe de niveau", () => {
    // Comparée par quarts, et non tranche par tranche : la phase à l'intérieur d'une tranche décide
    // de sa valeur, et deux tranches voisines peuvent donc être très différentes.
    const n = 44100;
    const x = Float32Array.from({ length: n }, (_, i) => (i / n) * Math.sin((2 * Math.PI * i * 40) / n));
    const env = enveloppe(tampon([x]));
    const q = env.length / 4;
    const cretePart = (de: number, a: number) => Math.max(...env.slice(Math.round(de), Math.round(a)));
    expect(cretePart(0, q)).toBeLessThan(0.3);
    expect(cretePart(3 * q, env.length)).toBeGreaterThan(0.85);
  });

  it("prend le plus fort des deux canaux", () => {
    const fort = sinus(8192, 1), faible = sinus(8192, 0.1);
    const env = enveloppe(tampon([faible, fort]));
    expect(Math.max(...env)).toBeGreaterThan(0.9);
  });

  it("se garde en cache, le meme tampon rendant la meme table", () => {
    const b = tampon([sinus(8192)]);
    expect(enveloppe(b)).toBe(enveloppe(b));
  });
});

describe("le trace", () => {
  it("est vide quand la barre n'a pas de place", () => {
    const env = enveloppe(tampon([sinus(4096)]));
    expect(cheminOnde(env, 0, 0, 0, 20)).toBe("");
    expect(cheminOnde(env, 0, 100, 0, 0)).toBe("");
  });

  it("reste dans la barre, et se ferme", () => {
    const env = enveloppe(tampon([sinus(8192)]));
    const d = cheminOnde(env, 10, 120, 40, 20);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const ys = [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...ys)).toBeLessThanOrEqual(60);
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs)).toBeLessThanOrEqual(130);
  });

  it("d'un silence est un trait au milieu de la barre", () => {
    const env = enveloppe(tampon([new Float32Array(4096)]));
    const ys = [...cheminOnde(env, 0, 60, 10, 20).matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(new Set(ys)).toEqual(new Set([20]));
  });

  it("ne montre que la part demandee du son", () => {
    // Une rampe montante : la seconde moitie doit etre plus haute que la premiere.
    const n = 44100;
    const x = Float32Array.from({ length: n }, (_, i) => (i / n) * Math.sin((2 * Math.PI * i * 40) / n));
    const env = enveloppe(tampon([x]));
    const amplitude = (part: { de: number; a: number }) => {
      const ys = [...cheminOnde(env, 0, 100, 0, 40, part).matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(amplitude({ de: 0.5, a: 1 })).toBeGreaterThan(amplitude({ de: 0, a: 0.5 }));
  });
});
