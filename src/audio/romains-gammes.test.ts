// audio/romains-gammes.test.ts — Les chiffres romains lus dans les gammes de la table.
//
// DÉCISION DE FABIEN DU 2026-11-23 : la casse dit la qualité, la gamme place les fondamentales, et les
// nœuds qui lisent des chiffres offrent les gammes dont chaque degré porte un accord que la casse sait
// écrire. La progression par défaut suit la gamme.
import { describe, expect, it } from "vitest";
import { Chord, Note } from "tonal";
import { lireChiffreRomain } from "./lecture-romains";
import { GAMMES_DES_ROMAINS, PROGRESSIONS_PAR_GAMME, degresHorsGamme, gammeDesRomains, progressionParDefaut } from "./theorie-romains";
import { degresSansPassage } from "./gammes";
import { triadeDuDegre } from "./triades-gamme";
import { accordDuSymbole } from "./symboles-accords";

describe("les chiffres romains dans les gammes de la table", () => {
  it("dix-sept gammes portent un accord nommé sur chacun de leurs degrés, et huit n'en portent pas", () => {
    expect(GAMMES_DES_ROMAINS.map((g) => g.id)).toEqual([
      "majeur", "mineur", "dorien", "phrygien", "lydien", "mixolydien", "locrien", "mineur-harmonique", "mineur-melodique",
      "alteree", "lydien-dominant", "phrygien-dominant", "bebop-dominant", "ton-entier", "diminuee-ton-demi",
      "diminuee-demi-ton", "augmentee",
    ]);
  });

  it("la fondamentale vient de la gamme, la qualité de la casse", () => {
    expect(lireChiffreRomain("vi°", "D", "dorien")).toBe("B°");
    expect(lireChiffreRomain("IV", "D", "dorien")).toBe("G");
    expect(lireChiffreRomain("II", "E", "phrygien")).toBe("F");
    expect(lireChiffreRomain("iv°", "C", "lydien")).toBe("F#°");
    expect(lireChiffreRomain("VII", "C", "bebop-dominant")).toBe("Bb");
    // La casse décide, même hors de la gamme : « V » en ré dorien est la majeur.
    expect(lireChiffreRomain("V", "D", "dorien")).toBe("A");
    // Une altération se prend sur la gamme majeure, quelle que soit la gamme.
    expect(lireChiffreRomain("bVII", "D", "dorien")).toBe("C");
  });

  it("le majeur et le mineur se lisent comme avant", () => {
    expect(lireChiffreRomain("vi", "C", "majeur")).toBe("Am");
    expect(lireChiffreRomain("VII", "A", "mineur")).toBe("G");
    expect(lireChiffreRomain("vii°", "A", "mineur")).toBe("G#°");
    expect(lireChiffreRomain("V7/IV", "C", "majeur")).toBe("C7");
  });

  it("un degré que la gamme n'a pas est refusé et nommé", () => {
    expect(degresHorsGamme(["I+", "VII+", "V+"], "ton-entier")).toEqual(["VII+"]);
    expect(degresHorsGamme(["I", "VII"], "majeur")).toEqual([]);
  });

  it("la gamme nommée par la tonalité l'emporte, une gamme que les chiffres ne lisent pas retombe au majeur", () => {
    expect(gammeDesRomains("A minor (90%)", "dorien")).toBe("mineur");
    expect(gammeDesRomains("A", "dorien")).toBe("dorien");
    expect(gammeDesRomains("A", "pentatonique-majeure")).toBe("majeur");
  });

  it("la progression par défaut de chaque gamme bâtit sur chaque degré l'accord de la gamme, sous les douze toniques", () => {
    expect(progressionParDefaut("majeur")).toBe("I V vi IV");
    expect(progressionParDefaut("dorien")).toBe("i v vi° IV");
    expect(PROGRESSIONS_PAR_GAMME.mineur).toBe("i VI III VII");
    const fautes: string[] = [];
    for (const g of GAMMES_DES_ROMAINS) {
      const d = degresSansPassage(g.id);
      const chiffres = progressionParDefaut(g.id).split(" ");
      for (const tonique of ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]) {
        const t = Note.chroma(tonique)!;
        for (const c of chiffres) {
          const symbole = lireChiffreRomain(c, tonique, g.id);
          const notes = symbole ? (accordDuSymbole(symbole)?.notes ?? []) : [];
          const lues = notes.map((n) => Note.chroma(n)).sort((a, b) => a - b);
          const racine = symbole ? Note.chroma(Chord.get(symbole).tonic ?? "")! - t : NaN;
          const pc = ((racine % 12) + 12) % 12;
          const attendues = d.includes(pc) ? triadeDuDegre(d, pc).map((x) => (x + pc + t) % 12).sort((a, b) => a - b) : [];
          if (JSON.stringify(lues) !== JSON.stringify(attendues)) fautes.push(`${tonique} ${g.id} ${c} : ${symbole}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
