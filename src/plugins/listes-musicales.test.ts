// plugins/listes-musicales.test.ts — Une liste de nombres se lit d'une seule façon, et ce qui ne se lit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, huitième format, 2026-11-22. Neuf nœuds lisaient une liste de
// hauteurs, de classes, d'intervalles ou de rangs, par quatre lecteurs aux règles différentes. Tout
// passe ici par `executer`, et une liste juste écrite autrement doit rendre exactement la même chose.
// Les cas viennent des documentations des réglages et de l'usage, et non du code.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : les noms de notes se lisent (« Read them ») ; le Canon garde la
// décimale dans son son (« Keep it in the sound ») ; hors des bornes, refusé et nommé (« Refuse them,
// named ») ; une liste vide que sa documentation ne définit pas est refusée (« Refuse it, said »).
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { entreesDEssai, lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";
import { estSequence } from "../audio/sequence";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

/** Les hauteurs d'une séquence, d'un fichier MIDI, ou rien. */
async function hauteurs(v: unknown): Promise<number[] | null> {
  if (estSequence(v)) return v.notes.map((n) => n.note);
  if (v instanceof File) return ((await notesDuMidi(v)) ?? []).map((n) => n.note);
  return null;
}

/** Ce qu'un lancer rend, en hauteurs, sortie par sortie, et son refus. */
async function lancer(id: string, reglages: Record<string, string | number>, entrees: unknown[]) {
  const r = await lancerFiche(F(id), reglages, { entrees });
  return { r, sorties: await Promise.all(r.valeurs.map(hauteurs)) };
}

/** La hauteur entendue, en demi-tons MIDI : celle dont la période se répète le mieux, à six demi-tons de l'attendue. */
function entendue(b: AudioBuffer, attendue: number, de: number, a: number): number {
  const x = b.getChannelData(0).subarray(Math.floor(de * b.sampleRate), Math.floor(a * b.sampleRate));
  const correlation = (tau: number) => {
    const i = Math.floor(tau), f = tau - i;
    let xy = 0, xx = 0, yy = 0;
    for (let n = 0; n + i + 1 < x.length; n++) {
      const y = x[n + i] * (1 - f) + x[n + i + 1] * f;
      xy += x[n] * y; xx += x[n] * x[n]; yy += y * y;
    }
    return xy / Math.sqrt(xx * yy || 1);
  };
  let meilleure = attendue, rMax = -Infinity;
  for (let m = attendue - 6; m <= attendue + 6; m += 0.02) {
    const r = correlation(b.sampleRate / (440 * 2 ** ((m - 69) / 12)));
    if (r > rMax) { rMax = r; meilleure = m; }
  }
  return meilleure;
}

describe("UNE LISTE DE HAUTEURS SE LIT D'UNE SEULE FAÇON", () => {
  const RYTHME = (hauteursReglage: string | null, hauteursEntree: string | null) =>
    lancer("rythme-sur-hauteurs", hauteursReglage === null ? {} : { Hauteurs: hauteursReglage }, [null, hauteursEntree, null]);

  it.each([
    ["avec un retour à la ligne final", "60 62 64\n"],
    ["avec une espace en tête", " 60 62 64"],
    ["avec des points-virgules", "60;62;64"],
    ["en noms de notes", "C4 D4 E4"],
    ["en noms français", "Do4 Ré4 Mi4"],
  ])("le Rythme sur hauteurs, réglage et entrée : %s, comme « 60 62 64 »", async (_titre, texte) => {
    const juste = await RYTHME("60 62 64", null);
    for (const r of [await RYTHME(texte, null), await RYTHME(null, texte)]) {
      expect(r.r.erreurRendue, r.r.message).toBe(false);
      expect(r.sorties[0]).toEqual(juste.sorties[0]);
    }
  }, 60_000);

  it.each([["60 62 x", "« x »"], ["60 200 62", "« 200 »"], ["60 C 62", "« C »"]])(
    "le Rythme sur hauteurs refuse « %s », par son réglage comme par son entrée, et nomme %s", async (texte, cite) => {
      for (const r of [await RYTHME(texte, null), await RYTHME(null, texte)]) {
        expect(r.r.erreurRendue, r.r.message).toBe(true);
        expect(r.r.message).toContain(cite);
        expect(r.r.valeurs.every((v) => v === null)).toBe(true);
      }
    }, 60_000);

  it("le Rythme sur hauteurs refuse un réglage vide, que sa documentation ne définit pas", async () => {
    const r = await RYTHME("", null);
    expect(r.r.erreurRendue).toBe(true);
    expect(r.r.message).toMatch(/est vide|is empty/);
  }, 60_000);

  const CANON = (texte: string) => lancer("canon-pavage", { Hauteurs: texte }, []);
  it.each([["60;64;67;72"], ["C4 E4 G4 C5"], [" 60 64 67 72\n"]])("le Canon : « %s » comme « 60 64 67 72 »", async (texte) => {
    const juste = await CANON("60 64 67 72");
    const r = await CANON(texte);
    expect(r.r.erreurRendue, r.r.message).toBe(false);
    expect(r.sorties[1]).toEqual(juste.sorties[1]);
  }, 60_000);

  it.each([["x 64 67 72", "« x »"], ["200 64 67 72", "« 200 »"], ["", "vide|empty"]])("le Canon refuse « %s »", async (texte, cite) => {
    const r = await CANON(texte);
    expect(r.r.erreurRendue, r.r.message).toBe(true);
    expect(r.r.message).toMatch(new RegExp(cite));
  }, 60_000);

  // « Keep it in the sound » : la première voix joue seule les trois premiers pas, 0,6 s au pas de 0,2 s.
  it("le Canon joue 60,5 dans son son, et son fichier MIDI, qui ne porte que des entiers, l'arrondit en le disant", async () => {
    const r = await CANON("60.5 64 67 72");
    expect(r.r.erreurRendue, r.r.message).toBe(false);
    expect(Math.abs(entendue(r.r.valeurs[0] as AudioBuffer, 60.5, 0.05, 0.55) - 60.5)).toBeLessThan(0.15);
    expect(new Set(r.sorties[1])).toEqual(new Set([61, 64, 67, 72]));
    expect(r.r.message).toContain("60.5");
  }, 60_000);

  const CANTUS = (texte: string) => lancer("contrepoint-solveur", { "Cantus firmus": texte, Graine: 1 }, [null]);
  it("le Contrepoint lit un cantus en noms de notes comme en numéros", async () => {
    const [noms, numeros] = [await CANTUS("C4 D4 E4 F4 E4 D4 C4"), await CANTUS("60 62 64 65 64 62 60")];
    expect(noms.r.erreurRendue, noms.r.message).toBe(false);
    expect(noms.sorties[0]).toEqual(numeros.sorties[0]);
  }, 60_000);

  it.each([["60 62 x 65 64 62 60", "« x »"], ["60 200 62 64", "« 200 »"], ["x y", "« x », « y »"]])(
    "le Contrepoint refuse un cantus écrit « %s », au lieu de le raccourcir ou d'en engendrer un", async (texte, cite) => {
      const r = await CANTUS(texte);
      expect(r.r.erreurRendue, r.r.message).toBe(true);
      expect(r.r.message).toContain(cite);
    }, 60_000);

  it("le Contrepoint engendre son cantus quand le réglage est vide, comme sa documentation le dit", async () => {
    const r = await CANTUS("");
    expect(r.r.erreurRendue, r.r.message).toBe(false);
    expect(r.r.message).toMatch(/engendré|generated/);
  }, 60_000);
});

/** L'empreinte d'un son : deux lancers qui rendent le même son rendent la même empreinte. */
function empreinte(v: unknown): string {
  const x = (v as AudioBuffer).getChannelData(0);
  let h = 0;
  for (let i = 0; i < x.length; i += 7) h = (h * 31 + Math.round(x[i] * 1e5)) | 0;
  return `${x.length}:${h}`;
}

// « Refuse them, named » : au-delà de ±96 demi-tons, l'intervalle est refusé, et la borne est écrite.
describe("UNE LISTE D'INTERVALLES SE LIT D'UNE SEULE FAÇON", () => {
  const SON = async (id: string, reglages: Record<string, string | number>) => {
    const r = await lancerFiche(F(id), reglages, { entrees: entreesDEssai(F(id)) });
    return { r, son: r.valeurs[0] ? empreinte(r.valeurs[0]) : null };
  };
  const NOEUDS: [string, string, Record<string, string>][] = [
    ["peignes-accordes", "Accord", {}],
    ["resonateurs", "Intervalles", { Structure: "accord" }],
  ];

  for (const [id, reglage, base] of NOEUDS) {
    it.each([[" 0 4 7\n"], ["0;4;7"], ["0, 4, 7"]])(`${id} : « %s » comme « 0 4 7 »`, async (texte) => {
      const [juste, autre] = [await SON(id, { ...base, [reglage]: "0 4 7" }), await SON(id, { ...base, [reglage]: texte })];
      expect(autre.r.erreurRendue, autre.r.message).toBe(false);
      expect(autre.son).toBe(juste.son);
    }, 60_000);

    it.each([["0 4 x", "« x »"], ["0 4 100", "« 100 »"], ["0 -97", "« -97 »"], ["C4", "« C4 »"], ["", "vide|empty"]])(
      `${id} refuse « %s »`, async (texte, cite) => {
        const r = await SON(id, { ...base, [reglage]: texte });
        expect(r.r.erreurRendue, r.r.message).toBe(true);
        expect(r.r.message).toMatch(new RegExp(cite));
        expect(r.son).toBe(null);
      }, 60_000);
  }

  it("les Résonateurs ne lisent leurs intervalles que pour la structure accord", async () => {
    const r = await SON("resonateurs", { Structure: "harmonique", Intervalles: "x" });
    expect(r.r.erreurRendue, r.r.message).toBe(false);
  }, 60_000);

  const FRACTALE = async (reglages: Record<string, string | number>) => {
    const r = await lancerFiche(F("generateur-fractal"), { Motif: "Personnalisé", ...reglages }, { entrees: [] });
    return { r, notes: await hauteurs(r.valeurs[1]) };
  };
  it.each([["0 3 7 10"], ["0;3;7;10"], [" 0, 3, 7, 10 "]])("la Musique fractale : « %s » comme « 0,3,7,10 »", async (texte) => {
    const [juste, autre] = [await FRACTALE({ Intervalles: "0,3,7,10" }), await FRACTALE({ Intervalles: texte })];
    expect(autre.r.erreurRendue, autre.r.message).toBe(false);
    expect(autre.notes).toEqual(juste.notes);
    expect(juste.notes!.length).toBe(64);
  }, 60_000);

  it.each([["0,3,x", "« x »"], ["0,200", "« 200 »"], ["", "vide|empty"]])("la Musique fractale refuse « %s »", async (texte, cite) => {
    const r = await FRACTALE({ Intervalles: texte });
    expect(r.r.erreurRendue, r.r.message).toBe(true);
    expect(r.r.message).toMatch(new RegExp(cite));
  }, 60_000);

  it("la Musique fractale refuse un motif dont le dépliage sort de 0 à 127, en nommant la hauteur atteinte", async () => {
    const r = await FRACTALE({ Intervalles: "0,48", Profondeur: 3 });
    expect(r.r.erreurRendue, r.r.message).toBe(true);
    expect(r.r.message).toMatch(/0 à 127|0 to 127/);
    expect(r.r.valeurs.every((v) => v === null)).toBe(true);
  }, 60_000);

  it("la Musique fractale ne lit ses intervalles que pour le motif personnalisé, sans rien changer à son motif", async () => {
    const r = await FRACTALE({ Motif: "Triade M", Intervalles: "x" });
    expect(r.r.erreurRendue, r.r.message).toBe(false);
  }, 60_000);
});

// UN RANG EST UN ENTIER. Ceux d'un accordage ont tout signe et franchissent la période ; ceux d'une série
// harmonique partent de 1, sans autre borne que Nyquist.
describe("UNE LISTE DE RANGS SE LIT D'UNE SEULE FAÇON", () => {
  const ACCORDAGE = async (degres: string) => {
    const r = await lancerFiche(F("accordage-notes"), { "Degrés": degres }, { entrees: entreesDEssai(F("accordage-notes")) });
    return { r, notes: await hauteurs(r.valeurs[0]) };
  };
  it.each([["0, 4; 7"], [" 0 4 7\n"]])("l'Accordage : « %s » comme « 0 4 7 »", async (texte) => {
    const [juste, autre] = [await ACCORDAGE("0 4 7"), await ACCORDAGE(texte)];
    expect(autre.r.erreurRendue, autre.r.message).toBe(false);
    expect(autre.notes).toEqual(juste.notes);
  }, 60_000);

  it("l'Accordage joue un tour complet quand « Degrés » est vide, comme sa documentation le dit, et franchit la période", async () => {
    expect((await ACCORDAGE("")).notes).toHaveLength(12);
    expect((await ACCORDAGE("0 12 -1")).notes).toEqual([60, 72, 59]);
  }, 60_000);

  it.each([["1.5", "« 1.5 »"], ["C4", "« C4 »"], ["x", "« x »"], ["0 - 4", "« - »"], ["0 200", "« 200 »"]])(
    "l'Accordage refuse « %s », et nomme %s", async (texte, cite) => {
      const r = await ACCORDAGE(texte);
      expect(r.r.erreurRendue, r.r.message).toBe(true);
      expect(r.r.message).toContain(cite);
      expect(r.r.valeurs.every((v) => v === null)).toBe(true);
    }, 60_000);

  const CRIBLE = async (rangs: string, mode = "garder") => {
    const r = await lancerFiche(F("crible-harmonique"), { Rangs: "liste", "Liste des rangs": rangs, Mode: mode }, { entrees: entreesDEssai(F("crible-harmonique")) });
    return { r, son: r.valeurs[0] ? empreinte(r.valeurs[0]) : null };
  };
  it("le Crible garde un rang au-delà de 96 : le rang 100 de 110 Hz, 11 kHz, est sous Nyquist", async () => {
    const [sans, avec] = [await CRIBLE("1 2 3"), await CRIBLE("1 2 3 100")];
    expect(avec.r.erreurRendue, avec.r.message).toBe(false);
    expect(avec.son).not.toBe(sans.son);
  }, 60_000);

  it.each([["2.5", "« 2.5 »"], ["0", "« 0 »"], ["x", "« x »"], ["1 2 x", "« x »"], ["", "vide|empty"]])(
    "le Crible refuse « %s »", async (texte, cite) => {
      const r = await CRIBLE(texte);
      expect(r.r.erreurRendue, r.r.message).toBe(true);
      expect(r.r.message).toMatch(new RegExp(cite));
      expect(r.son).toBe(null);
    }, 60_000);
});
