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
import { accordsPossibles, type Septiemes } from "./choral-candidats";
import type { Sequence } from "./sequence";
import { MODES_CHORAL, type ModeChoral } from "./choral-regles";
import { SOPRANOS_MODAUX, tableDuSoprano, type SopranoModal } from "./sopranos-modaux-dcml";

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
const erreurs = (r: HarmonisationRendue, tonique: number, mode: ModeChoral) => {
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

  it("sous « Toutes », sur le choral 175 et les trois sopranos modaux : aucune septième tenue ne reste sans résolution", async () => {
    // Avant que la septième tenue coûte (décision D15 du 2026-11-25), le juge y relevait 2, 3, 3 et 1
    // septièmes non résolues : la septième tenue dans l'accord suivant, qu'il lit sur la note d'après.
    expect(erreurs(await harmoniser(soprano175(), { septiemes: "toutes" }), 0, "majeur")).toEqual([]);
    for (const s of SOPRANOS_MODAUX) {
      const r = await harmoniser(sopranoModal(s), { tonique: s.tonique, mode: s.mode, septiemes: "toutes" });
      expect(erreurs(r, s.tonique, s.mode), `${s.numero}, ${s.mode}`).toEqual([]);
    }
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

// LES TROIS MODES DES CHORALS DE BACH, décisions de Fabien du 2026-11-24. Chaque soprano s'harmonise
// dans son mode et dans la tonalité que le juge lisait avant les modes, le majeur ou le mineur de même
// tierce, et le phrygien sur la mineur, où Sapp écrit « Aus tiefer Not ».
const sopranoModal = (s: SopranoModal): Sequence => ({ notes: lireTableDcml(tableDuSoprano(s), 60).sequence.notes, tempo: 60 });
const RAMENE: Record<string, { mode: ModeChoral; tonique: number }> = {
  "127": { mode: "majeur", tonique: 7 }, "015": { mode: "mineur", tonique: 2 }, "010": { mode: "mineur", tonique: 9 },
};
const noms = (r: HarmonisationRendue) => r.accords.map((a) => a.accord.nom);

describe("les trois modes des chorals de Bach", () => {
  for (const s of SOPRANOS_MODAUX) {
    it(`${s.titre}, en ${s.mode} : aucune erreur au juge du même mode, et pas plus de replis que dans la tonalité ramenée`, async () => {
      const dans = await harmoniser(sopranoModal(s), { tonique: s.tonique, mode: s.mode });
      const ramene = await harmoniser(sopranoModal(s), RAMENE[s.numero]);
      expect(erreurs(dans, s.tonique, s.mode)).toEqual([]);
      expect(dans.replis).toBeLessThanOrEqual(ramene.replis);
    });
  }

  it("le mixolydien écrit le v sans sensible et la sous-dominante, que le majeur ramené remplace par des emprunts", async () => {
    const [mixo] = SOPRANOS_MODAUX;
    const dans = noms(await harmoniser(sopranoModal(mixo), { tonique: 7, mode: "mixolydien" }));
    const ramene = noms(await harmoniser(sopranoModal(mixo), RAMENE["127"]));
    expect(dans.filter((n) => n === "v").length).toBeGreaterThan(0);
    expect(ramene.filter((n) => n === "v")).toEqual([]);
    expect(ramene.some((n) => n.includes("emprunté") || n.includes("/"))).toBe(true);
  });

  it("le phrygien finit sur sa tonique, précédée de ce que le mode permet, et le iv y passe avant le V", async () => {
    const phry = SOPRANOS_MODAUX.find((s) => s.mode === "phrygien")!;
    const r = await harmoniser(sopranoModal(phry), { tonique: 4, mode: "phrygien" });
    const n = noms(r);
    expect(["i", "I"]).toContain(n.at(-1));
    expect(r.accords.at(-2)!.accord.repli).toBe(false);
    expect([1, 3, 4, 6]).toContain(r.accords.at(-2)!.accord.degre);
    expect(n.filter((x) => x === "iv").length).toBeGreaterThan(n.filter((x) => x.startsWith("V")).length);
  });

  it("sous « Dominante », seule la dominante à sensible porte sa septième : le V7 du dorien, et non son v7", () => {
    // Sol en ré dorien : septième de la, du v comme du V.
    const septiemes = accordsPossibles(67, 2, "dorien", "dominante").filter((a) => a.septieme !== null).map((a) => a.nom);
    expect(septiemes).toEqual(["V7"]);
    expect(accordsPossibles(67, 2, "dorien", "toutes").map((a) => a.nom)).toContain("v7");
  });

  it("les emprunts viennent du mode parallèle de même tierce, l'éolien pour le phrygien", () => {
    // Fa dièse en mi phrygien : aucun accord du mode ; l'éolien de mi le porte dans ii°, v et VII.
    const empruntes = accordsPossibles(66, 4, "phrygien", "aucune").filter((a) => a.nom.endsWith("emprunté")).map((a) => a.nom);
    expect(empruntes).toEqual(["ii° emprunté", "v emprunté", "VII emprunté"]);
  });

  it("la tonique du phrygien a sa dominante à sensible en repli, et seul ce mode, faute de sensible", () => {
    expect(accordsPossibles(63, 4, "phrygien", "aucune").map((a) => a.nom)).toContain("V/i");
    for (const mode of MODES_CHORAL.filter((m) => m !== "phrygien")) {
      expect(accordsPossibles(63, 4, mode, "aucune").map((a) => a.nom), mode).not.toContain("V/i");
    }
  });

  it("toute note du soprano reçoit un accord, sous chaque mode, chaque tonique et chaque réglage des septièmes", () => {
    const vides: string[] = [];
    for (const mode of MODES_CHORAL) {
      for (let tonique = 0; tonique < 12; tonique++) {
        for (const septiemes of ["aucune", "dominante", "toutes"] as Septiemes[]) {
          for (let note = 60; note < 72; note++) if (accordsPossibles(note, tonique, mode, septiemes).length === 0) vides.push(`${mode} ${tonique} ${septiemes} ${note}`);
        }
      }
    }
    expect(vides).toEqual([]);
  });
});

// La main rendue à l'interface est tenue par `choral-respiration.test.ts`, qui compte le travail
// entre deux respirations au lieu de le chronométrer.
