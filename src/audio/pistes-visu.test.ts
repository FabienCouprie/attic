// audio/pistes-visu.test.ts — L'enveloppe d'une piste ne doit rien perdre de ce qu'on vient voir.
// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import {
  COLONNES_FINES, COLONNES_PISTE, creteDenveloppe, creteDeColonnes, enveloppeDeTampon,
  enveloppeFine, plageDenveloppe,
} from "./pistes-visu";
import { enveloppeDeValeurs } from "./courbe-trace";

const tampon = (canaux: number[][], sampleRate = 48000): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate });
  canaux.forEach((c, i) => b.getChannelData(i).set(Float32Array.from(c)));
  return b;
};

describe("l'enveloppe d'une piste", () => {
  // Les valeurs sont choisies exactement représentables en virgule flottante simple : un tampon audio
  // est un `Float32Array`, et 0,1 y devient 0,10000000149. Comparer à 0,1 ferait échouer un test
  // juste, ce qui apprendrait à s'en méfier.
  it("elle garde le plus bas et le plus haut de chaque colonne", () => {
    // Quatre échantillons, deux colonnes : chaque colonne en couvre deux.
    const e = enveloppeDeTampon(tampon([[0.125, -0.75, 0.5, 0.25]]), 2);
    expect(e).toEqual([{ min: -0.75, max: 0.125 }, { min: 0.25, max: 0.5 }]);
  });

  it("UNE POINTE BRÈVE SURVIT À LA RÉDUCTION : c'est la raison du minimum et du maximum", () => {
    const n = 100000;
    const v = new Array(n).fill(0);
    v[54321] = 0.97;
    const e = enveloppeDeTampon(tampon([v]), 256);
    expect(creteDeColonnes(e)).toBeCloseTo(0.97, 5);
  });

  it("LES CANAUX SONT CONFONDUS : ce qui n'arrive qu'à droite se voit quand même", () => {
    const e = enveloppeDeTampon(tampon([[0, 0, 0, 0], [0, 0.75, 0, -0.5]]), 2);
    expect(e).toEqual([{ min: 0, max: 0.75 }, { min: -0.5, max: 0 }]);
  });

  it("un mono passe par la même réduction que n'importe quelle suite de valeurs", () => {
    const v = Array.from({ length: 999 }, (_, i) => Math.sin(i / 7));
    expect(enveloppeDeTampon(tampon([v]), 64)).toEqual(enveloppeDeValeurs(Float32Array.from(v), 64));
  });

  it("moins d'échantillons que de colonnes : une colonne par échantillon, sans invention", () => {
    const e = enveloppeDeTampon(tampon([[0.3, -0.2]]), 64);
    expect(e).toHaveLength(2);
  });

  it("zéro colonne demandée ne rend rien, plutôt qu'une colonne vide", () => {
    expect(enveloppeDeTampon(tampon([[0.5, -0.5]]), 0)).toEqual([]);
  });

  it("la finesse par défaut est celle que l'en-tête annonce", () => {
    const v = Array.from({ length: 10000 }, () => 0);
    expect(enveloppeDeTampon(tampon([v]))).toHaveLength(COLONNES_PISTE);
  });
});

describe("l'enveloppe fine", () => {
  it("elle donne la même chose que la grossière, à sa propre finesse", () => {
    const v = Array.from({ length: 999 }, (_, i) => Math.sin(i / 7));
    const fine = enveloppeFine(tampon([v]), 64);
    const grossiere = enveloppeDeValeurs(Float32Array.from(v), 64);
    expect([...fine.min]).toEqual(grossiere.map((c) => c.min));
    expect([...fine.max]).toEqual(grossiere.map((c) => c.max));
  });

  it("LES CANAUX SONT CONFONDUS, comme dans la grossière", () => {
    const e = enveloppeFine(tampon([[0, 0, 0, 0], [0, 0.75, 0, -0.5]]), 2);
    expect([...e.min]).toEqual([0, -0.5]);
    expect([...e.max]).toEqual([0.75, 0]);
  });

  it("elle ne dépasse jamais le nombre d'échantillons, et ne rend rien d'un tampon vide", () => {
    expect(enveloppeFine(tampon([[0.3, -0.2]]), 64).min).toHaveLength(2);
    // UN TAMPON DE LONGUEUR NULLE NE SE CONSTRUIT PAS — le constructeur le refuse —, d'où ce
    // faux-semblant : la garde existe pour un tampon venu d'ailleurs, et se vérifie donc ainsi.
    const vide = { length: 0, numberOfChannels: 1, getChannelData: () => new Float32Array(0) };
    expect(enveloppeFine(vide as unknown as AudioBuffer).min).toHaveLength(0);
  });

  it("la finesse par défaut est celle que l'en-tête annonce", () => {
    const v = Array.from({ length: 200000 }, () => 0);
    expect(enveloppeFine(tampon([v])).min).toHaveLength(COLONNES_FINES);
  });

  it("la crête est celle du son, pas celle d'une colonne", () => {
    const v = new Array(100000).fill(0);
    v[54321] = 0.97;
    v[54322] = -0.5;
    expect(creteDenveloppe(enveloppeFine(tampon([v]), 1024))).toBeCloseTo(0.97, 5);
  });
});

describe("la portion d'enveloppe que la vue dessine", () => {
  // C'EST LE TEST QUI JUSTIFIE TOUT LE RESTE. Une impulsion de deux millièmes de seconde au milieu
  // d'une minute : à deux mille colonnes, elle est quelque part dans une colonne large de vingt-neuf
  // millièmes, et zoomer n'y change rien. L'enveloppe fine la situe à la milliseconde.
  it("UNE POINTE BRÈVE SE SITUE, LÀ OÙ LA GROSSIÈRE NE SAIT QUE DIRE QU'ELLE EXISTE", () => {
    const sr = 48000;
    const duree = 60;
    const v = new Float32Array(sr * duree);
    const instant = 30;
    for (let i = 0; i < Math.round(0.002 * sr); i++) v[Math.round(instant * sr) + i] = 0.8;
    const b = new AudioBuffer({ numberOfChannels: 1, length: v.length, sampleRate: sr });
    b.getChannelData(0).set(v);

    const situer = (colonnes: { min: number; max: number }[], a: number, largeur: number) => {
      const i = colonnes.findIndex((c) => c.max > 0.5);
      return i < 0 ? null : a + ((i + 0.5) / colonnes.length) * largeur;
    };

    // La grossière, sur la fenêtre entière : la pointe est vue, mais à quinze millièmes près.
    const grossiere = enveloppeDeTampon(b, COLONNES_PISTE);
    const vuGrossier = situer(grossiere, 0, duree);
    expect(vuGrossier).not.toBeNull();
    expect(Math.abs(vuGrossier! - instant)).toBeLessThan(0.02);

    // La fine, resserrée sur une demi-seconde autour d'elle : à la milliseconde.
    const fine = enveloppeFine(b);
    const a = instant - 0.25, z = instant + 0.25;
    const portion = plageDenveloppe(fine, a / duree, z / duree, 500);
    const vuFin = situer(portion, a, z - a);
    expect(vuFin).not.toBeNull();
    expect(Math.abs(vuFin! - instant), `vu à ${vuFin} s`).toBeLessThan(0.002);
  });

  it("la portion entière est l'enveloppe entière, ramenée à la largeur demandée", () => {
    const v = Array.from({ length: 4096 }, (_, i) => Math.sin(i / 13));
    const fine = enveloppeFine(tampon([v]), 4096);
    expect(plageDenveloppe(fine, 0, 1, 64)).toEqual(enveloppeDeValeurs(Float32Array.from(v), 64));
  });

  it("ON NE MOYENNE JAMAIS : une pointe survit à toutes les réductions", () => {
    const v = new Array(8192).fill(0);
    v[4100] = 0.9;
    const fine = enveloppeFine(tampon([v]), 8192);
    for (const largeur of [8, 64, 512]) {
      const p = plageDenveloppe(fine, 0, 1, largeur);
      expect(Math.max(...p.map((c) => c.max)), `largeur ${largeur}`).toBeCloseTo(0.9, 5);
    }
  });

  it("plus étroit qu'une colonne fine : la même valeur ressort, et c'est la borne de la méthode", () => {
    const fine = enveloppeFine(tampon([[0.5, -0.25, 0.75, 0]]), 4);
    // Le quart de piste [0,25 ; 0,5[ est la deuxième colonne, et elle seule.
    const p = plageDenveloppe(fine, 0.25, 0.5, 8);
    expect(p).toHaveLength(8);
    expect(p.every((c) => c.min === -0.25 && c.max === -0.25)).toBe(true);
  });

  it("une portion vide ou une largeur nulle ne rendent rien, plutôt qu'une colonne inventée", () => {
    const fine = enveloppeFine(tampon([[0.5, -0.5]]), 2);
    expect(plageDenveloppe(fine, 0.5, 0.5, 8)).toEqual([]);
    expect(plageDenveloppe(fine, 0, 1, 0)).toEqual([]);
  });
});
