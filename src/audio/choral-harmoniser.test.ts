// audio/choral-harmoniser.test.ts — L'harmoniseur par règles, jugé par le vérificateur du lot 2a.
//
// LE JUGE EST LE VÉRIFICATEUR, ET NON UNE ATTENTE ÉCRITE À LA MAIN : à température nulle, sur chaque
// soprano éprouvé, l'harmonisation ne doit lui laisser aucune erreur. C'est ce qui fait de l'énergie
// et du juge deux lectures des mêmes règles, et non deux écritures qui pourraient diverger.

import { describe, expect, it } from "vitest";
import { lireTableDcml } from "./dcml-tsv";
import { TABLE_175 } from "./choral-175-dcml";
import { estRefusHarmonisation, harmoniserChoral, type HarmonisationRendue, type OptionsHarmonisation } from "./choral-harmoniser";
import { estRefusChoral, verifierChoral } from "./choral-verifier";
import { accordsPossibles } from "./choral-candidats";
import type { Sequence } from "./sequence";
import type { Mode } from "./choral-regles";

const DEFAUT: OptionsHarmonisation = { tonique: 0, mode: "majeur", pas: 1, septiemes: "dominante", renversements: true, temperature: 0, graine: 1 };

/** Le soprano du choral 175 de Bach, transposé de `t` demi-tons. */
const soprano175 = (t = 0): Sequence => {
  const s = lireTableDcml(TABLE_175, 60).sequence;
  return { notes: s.notes.filter((n) => n.voix === 0).map((n) => ({ ...n, note: n.note + t })), tempo: 60 };
};
/** Un soprano en noires. */
const enNoires = (hauteurs: (number | null)[]): Sequence => ({
  notes: hauteurs.flatMap((h, k) => (h === null ? [] : [{ note: h, velocite: 80, debut: k, fin: k + 1, voix: 0 }])),
  tempo: 60,
});
const harmoniser = async (s: Sequence, o: Partial<OptionsHarmonisation> = {}): Promise<HarmonisationRendue> => {
  const r = await harmoniserChoral(s, { ...DEFAUT, ...o });
  if (estRefusHarmonisation(r)) throw new Error(`refus : ${JSON.stringify(r)}`);
  return r;
};
const erreurs = (r: HarmonisationRendue, tonique: number, mode: Mode) => {
  const v = verifierChoral({ notes: r.notes, tempo: 60 }, { tonique, mode, tempo: 60, tempsParMesure: 4 });
  if (estRefusChoral(v)) throw new Error("refus du juge");
  return v.infractions.filter((i) => i.gravite === "erreur").map((i) => `${i.mesure}.${i.temps} ${i.fr}`);
};

const LA_MINEUR = [69, 71, 72, 71, 69, 68, 69, 72, 71, 69, 68, 69];

describe("le juge ne relève aucune erreur, à température nulle", () => {
  it("sur le soprano du choral 175 de Bach, en do majeur", async () => {
    expect(erreurs(await harmoniser(soprano175()), 0, "majeur")).toEqual([]);
  });

  it("sur le même soprano monté en ré majeur", async () => {
    // Descendu en sol, son do 4 tombait à sol 3, sous tout alto possible, et l'harmoniseur le refusait.
    expect(erreurs(await harmoniser(soprano175(2), { tonique: 2 }), 2, "majeur")).toEqual([]);
  });

  it("sur un soprano en la mineur, la sensible prise à la dominante", async () => {
    const r = await harmoniser(enNoires(LA_MINEUR), { tonique: 9, mode: "mineur" });
    expect(erreurs(r, 9, "mineur")).toEqual([]);
    expect(r.accords.some((a) => a.accord.nom.startsWith("V"))).toBe(true);
  });

  it("finit sur la tonique à l'état fondamental", async () => {
    const r = await harmoniser(soprano175());
    expect(r.accords[r.accords.length - 1].accord.nom).toBe("I");
    const basse = r.notes.filter((n) => n.voix === 3).at(-1)!;
    expect(basse.note % 12).toBe(0);
  });
});

describe("la température et la graine", () => {
  it("rendent le même choral à graine égale, et deux à graines différentes", async () => {
    const a = await harmoniser(soprano175(), { temperature: 0.8, graine: 4242 });
    const b = await harmoniser(soprano175(), { temperature: 0.8, graine: 4242 });
    const c = await harmoniser(soprano175(), { temperature: 0.8, graine: 17 });
    expect(b.notes).toEqual(a.notes);
    expect(c.notes).not.toEqual(a.notes);
  });

  it("à température nulle, la graine ne change rien", async () => {
    const a = await harmoniser(soprano175(), { graine: 1 });
    const b = await harmoniser(soprano175(), { graine: 999 });
    expect(b.notes).toEqual(a.notes);
  });
});

describe("les réglages", () => {
  it("« Septièmes » à aucune n'écrit aucun accord de septième, à toutes en écrit sur d'autres degrés que V", async () => {
    const sans = await harmoniser(soprano175(), { septiemes: "aucune" });
    expect(sans.accords.filter((a) => a.accord.nom.includes("7"))).toEqual([]);
    const toutes = await harmoniser(soprano175(), { septiemes: "toutes" });
    expect(toutes.notes).not.toEqual((await harmoniser(soprano175(), { septiemes: "dominante" })).notes);
  });

  it("« Septièmes » à aucune ne garde la septième d'un repli que pour la note qu'elle seule porte", () => {
    // Fa dièse en do majeur : V/V la porte sans septième. Si bémol en la mineur : seul V7/VI.
    expect(accordsPossibles(66, 0, "majeur", "aucune").map((a) => a.nom).filter((n) => n.includes("7"))).toEqual([]);
    expect(accordsPossibles(66, 0, "majeur", "dominante").some((a) => a.nom.startsWith("V7/"))).toBe(true);
    expect(accordsPossibles(70, 9, "mineur", "aucune").map((a) => a.nom)).toEqual(["V7/VI"]);
  });

  it("sans « Renversements », la basse porte toujours la fondamentale", async () => {
    const r = await harmoniser(soprano175(), { renversements: false });
    const basses = r.notes.filter((n) => n.voix === 3);
    for (const { debut, accord } of r.accords) {
      const b = basses.find((n) => n.debut <= debut + 1e-9 && n.fin > debut + 1e-9)!;
      expect(((b.note % 12) + 12) % 12, `${debut}`).toBe(accord.racine);
    }
  });

  it("« Pas » à la croche donne une colonne par croche", async () => {
    const noire = await harmoniser(enNoires([72, 71, 72]));
    const croche = await harmoniser(enNoires([72, 71, 72]), { pas: 0.5 });
    expect([noire.colonnes, croche.colonnes]).toEqual([3, 6]);
  });
});

describe("le soprano, les soupirs et les refus", () => {
  it("rend le soprano tel qu'il est reçu", async () => {
    const s = soprano175();
    expect((await harmoniser(s)).notes.filter((n) => n.voix === 0)).toEqual(s.notes);
  });

  it("fait taire les trois autres voix sous un soupir du soprano", async () => {
    const r = await harmoniser(enNoires([72, 71, null, 72]));
    expect(r.notes.filter((n) => n.debut < 3 && n.fin > 2)).toEqual([]);
  });

  it("refuse en la nommant une note que nulle disposition ne porte", async () => {
    const r = await harmoniserChoral(enNoires([72, 48, 72]), DEFAUT);
    expect(r).toEqual({ sansDisposition: [{ note: 48, debut: 1 }] });
  });
});

// La main rendue à l'interface est tenue par `choral-respiration.test.ts`, qui compte le travail
// entre deux respirations au lieu de le chronométrer.
