// plugins/pluck-synth.test.ts — La graine de la corde pincée.
//
// LA CORDE EST PINCÉE PAR UN BREF BRUIT, tiré du générateur commun (`core/hasard.ts`). Sans graine,
// deux rendus des mêmes réglages différaient, et une corde qui plaisait ne se retrouvait pas.
// Demandé par Fabien le 2026-11-15 : la graine suit la convention du dépôt, zéro tire au sort et
// l'annonce dans le message, toute autre valeur rejoue la même corde, échantillon par échantillon.
import { describe, expect, it } from "vitest";
import { fiches } from "./tone-synths-fm";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const fiche = fiches.find((f) => f.id === "pluck-synth") as unknown as FicheLancable;

async function corde(graine: number) {
  const r = await lancerFiche(fiche, { Note: "A3", Durée: 0.5, Graine: graine }, { entrees: [] });
  expect(r.levee, "le nœud a levé").toBeNull();
  const b = r.valeurs[0] as AudioBuffer;
  return { canal: Array.from(b.getChannelData(0)), message: r.message };
}

describe("la graine de la corde pincée", () => {
  it("elle est déclarée comme une graine, à zéro par défaut", () => {
    const p = (fiche.parametres as readonly { nom: string; graine?: boolean; defaut?: unknown }[]).find((x) => x.nom === "Graine");
    expect(p?.graine).toBe(true);
    expect(p?.defaut).toBe(0);
  });

  it("LA MÊME GRAINE REJOUE LA MÊME CORDE, échantillon par échantillon", async () => {
    const [a, b] = [await corde(42), await corde(42)];
    expect(b.canal).toEqual(a.canal);
  });

  it("une autre graine pince autrement", async () => {
    const [a, b] = [await corde(42), await corde(43)];
    expect(b.canal).not.toEqual(a.canal);
  });

  it("le message annonce la graine, pour qu'on puisse la recopier", async () => {
    expect((await corde(4711)).message).toContain("4711");
  });
});
