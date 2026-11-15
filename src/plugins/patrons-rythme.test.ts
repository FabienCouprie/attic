// plugins/patrons-rythme.test.ts — Une seule liste de patrons, et qui sait jouer.
//
// La Groove Box recopiait dix patrons à la main quand la Boîte à rythmes en offrait
// cinquante-cinq, tirés du même PATRONS_RYTHME : deux listes séparées qui avaient
// divergé. Elles viennent maintenant d'ici, et ce test tient les deux promesses —
// rien d'inventé, et rien qui retombe en silence sur un patron de secours.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { PATRONS, optionsPatrons } from "./patrons-rythme";
import { PATRONS_RYTHME } from "../audio/generation-patrons";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { lireMidiEnSequence } from "../audio/midi-lecture-sequence";

describe("liste des patrons", () => {
  it("ne contient que des patrons qui existent, et les contient tous", () => {
    expect(PATRONS.map((p) => p.id).sort()).toEqual(Object.keys(PATRONS_RYTHME).sort());
  });

  it("donne un nom français et un nom anglais à chacun", () => {
    for (const p of PATRONS) {
      expect(p.fr, p.id).toBeTruthy();
      expect(p.en, p.id).toBeTruthy();
    }
  });

  it("filtre sur la métrique : les patrons de 3/4 sortent d'une liste 4/4", () => {
    const quatreQuatre = optionsPatrons("4/4");
    expect(quatreQuatre.optionIds).not.toContain("Valse");
    expect(quatreQuatre.optionIds).not.toContain("Bolero");
    for (const id of quatreQuatre.optionIds) {
      expect(PATRONS_RYTHME[id].signatures, id).toContain("4/4");
    }
    expect(quatreQuatre.optionIds.length).toBeLessThan(optionsPatrons().optionIds.length);
  });

  it("garde les trois listes alignées", () => {
    const o = optionsPatrons("4/4");
    expect(o.options.length).toBe(o.optionIds.length);
    expect(o.optionsEn.length).toBe(o.optionIds.length);
  });
});

describe("nœuds qui s'en servent", () => {
  const optionsDe = (id: string, param: string) =>
    registre.trouverDef(id)!.parametres.find((p) => p.nom === param)!;

  it("la Boîte à rythmes offre tous les patrons", () => {
    expect(optionsDe("boite-rythmes", "Patron").optionIds).toEqual(optionsPatrons().optionIds);
  });

  it("la Groove Box offre ceux qui se jouent en 4/4 — et non plus dix écrits à la main", () => {
    const patron = optionsDe("boite-groove", "Style rythmique");
    expect(patron.optionIds).toEqual(optionsPatrons("4/4").optionIds);
    expect(patron.optionIds!.length).toBeGreaterThan(40);
    expect(patron.optionIds).toContain("Blues shuffle");
    expect(patron.defaut).toBe("Pop dance");
  });
});

describe("chaque style se joue à lui-même", () => {
  // LE DÉFAUT, relevé le 2026-11-14 par la passe de croisement des nomenclatures : dix groupes de
  // patrons étaient identiques à l'octet, vingt-deux noms pour dix grilles, et la Boîte à rythmes
  // jouait la Valse et le Bolero sur son patron de secours en 4/4, si bien qu'ils sonnaient pareil.
  it("deux styles n'ont jamais la même grille dans une même métrique", () => {
    const vus = new Map<string, string>();
    const doublons: string[] = [];
    for (const [nom, p] of Object.entries(PATRONS_RYTHME)) {
      for (const [signature, grille] of Object.entries(p.positions)) {
        const cle = `${signature} ${JSON.stringify(grille)}`;
        if (vus.has(cle)) doublons.push(`${nom} = ${vus.get(cle)}`);
        else vus.set(cle, nom);
      }
    }
    expect(doublons).toEqual([]);
  });

  it("la Boîte à rythmes joue la Valse et le Bolero en 3/4, une mesure de trois temps", async () => {
    const fiche = registre.trouverDef("boite-rythmes") as unknown as FicheLancable;
    const attaquesDuKick = async (patron: string) => {
      const r = await lancerFiche(fiche, { Patron: patron, Tempo: 120, Mesures: 2 });
      const { sequence } = await lireMidiEnSequence(r.valeurs[1] as File);
      const notes = sequence?.notes ?? [];
      const kick = Math.min(...notes.map((n) => n.note));
      return notes.filter((n) => n.note === kick).map((n) => Math.round(n.debut * 100) / 100);
    };
    // À 120 à la noire, une mesure de 3/4 dure 1,5 s : la grosse caisse de la valse tombe sur 1.
    expect(await attaquesDuKick("Valse")).toEqual([0, 1.5]);
    expect(await attaquesDuKick("Bolero")).not.toEqual(await attaquesDuKick("Valse"));
  });
});
