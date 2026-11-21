// audio/romains-degres.test.ts — Une progression personnalisée se lit en degrés, et ses refus se disent.
//
// LE DÉFAUT G DU CONTRÔLE DES GAMMES, mesuré le 2026-11-21 sur « I-V7-bVII-vii°-V » : le Générateur
// d'accords jouait I, I, I, I, V ; la Groove Box I et V ; et « V7-bVII » seul y devenait le I, sans un
// mot. Décision de Fabien : le degré se lit, le 7 demande la septième de la gamme, une altération est
// refusée par un message qui la nomme.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { lireProgressionRomaine, romainDuDegre } from "./romains-degres";
import { genererAccords } from "./generation-accords";
import { notesDuMidi } from "./midi";
import { registre } from "./adaptateur";
import { lancerFiche, type FicheLancable } from "./lancer-fiche";
import { lireSorties, type PortDeSortie } from "./gamme-banc-hauteurs";

const PROG = "I-V7-bVII-vii°-V";
const classe = (n: number) => ((Math.round(n) % 12) + 12) % 12;

/** Les classes de chaque accord, groupées par attaque à un dixième de seconde près, dans l'ordre. */
function accordsParAttaque(notes: readonly { note: number; debut: number }[]): number[][] {
  const groupes: { t: number; classes: Set<number> }[] = [];
  for (const n of [...notes].sort((a, b) => a.debut - b.debut)) {
    const g = groupes.find((x) => Math.abs(x.t - n.debut) < 0.1);
    if (g) g.classes.add(classe(n.note)); else groupes.push({ t: n.debut, classes: new Set([classe(n.note)]) });
  }
  return groupes.map((g) => [...g.classes].sort((a, b) => a - b));
}

describe("la lecture des chiffres romains", () => {
  it("lit le degré, la septième, et refuse l'altération comme l'inconnu", () => {
    const lu = lireProgressionRomaine(" I - V7 - bVII - vii° - iv - #IV - Vsus4 - viiø7 ");
    expect(lu.degres.map(romainDuDegre)).toEqual(["I", "V7", "VII", "IV", "VII7"]);
    expect(lu.alteres).toEqual(["bVII", "#IV"]);
    expect(lu.inconnus).toEqual(["Vsus4"]);
  });
});

describe("une progression personnalisée, jouée par les nœuds", () => {
  it("le Générateur d'accords joue V7 avec la septième de la gamme, vii° sur le septième degré, et nomme bVII", async () => {
    const { midiBytes, description } = genererAccords("Do", "majeur", "custom", PROG, 120, 1, 4);
    const notes = await notesDuMidi(new File([new Uint8Array(midiBytes)], "a.mid"));
    const accords = accordsParAttaque((notes ?? []).filter((n) => n.canal === undefined || n.canal === 0));
    expect(accords).toEqual([[0, 4, 7], [2, 5, 7, 11], [2, 5, 11], [2, 7, 11]]);
    expect(description).toContain("bVII");
  });

  it("la Groove Box en fait autant, sans septième idiomatique, et nomme bVII", async () => {
    const f = registre.trouverDef("boite-groove") as unknown as FicheLancable & { sorties?: readonly PortDeSortie[] };
    const r = await lancerFiche(f, { Genre: "custom", Progression: PROG, Extension: "aucune", Graine: 1 }, {});
    const { lues } = await lireSorties(f.sorties ?? [], r.valeurs, async () => null);
    const accords = lues.find((s) => s.port === "MIDI accords" || s.port.toLowerCase().includes("accord"));
    expect(accords, lues.map((s) => s.port).join(", ")).toBeDefined();
    expect(accordsParAttaque(accords!.hauteurs).slice(0, 4)).toEqual([[0, 4, 7], [2, 5, 7, 11], [2, 5, 11], [2, 7, 11]]);
    expect(r.message).toContain("I–V7–VII–V");
    expect(r.message).toContain("bVII");
  });
});
