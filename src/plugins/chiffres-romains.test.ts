// plugins/chiffres-romains.test.ts — Les chiffres romains se lisent selon l'usage, par la casse.
//
// LA REVUE DES NOTATIONS EN TEXTE, sixième format, 2026-11-22. La table vient de l'analyse en degrés
// telle que l'usage l'écrit, et non du code : la casse dit la qualité, ° le diminué, ø le
// demi-diminué, + l'augmenté ; les chiffres 6, 64, 7, 65, 43, 42 disent le renversement.
//
// CE QUI SE PASSAIT, mesuré par `executer` :
//   - « ii7 » rendait D7, une septième de dominante, au lieu de Dm7 ;
//   - en mineur, « vii° » descendait avec VII, G° au lieu de G#° en la ;
//   - « I6 » rendait la sixte ajoutée C6, « I64 » et « V65 » des symboles illisibles ;
//   - « V/V » était refusé.
// DÉCISIONS DE FABIEN DU 2026-11-22 : la sensible en mineur, les renversements classiques (la sixte
// ajoutée s'écrit « Iadd6 »), les dominantes secondaires lues. La minuscule suivie de 7 est une
// mineure septième : l'usage ne s'y divise pas.
//
// CHAQUE CHIFFRE PASSE PAR TROIS NŒUDS, qui doivent rendre les mêmes classes et la même basse : la
// Progression, la Grille d'accords et la source « Progression » d'« Accords → Notation ».
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { Note } from "tonal";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { accordDuSymbole } from "../audio/symboles-accords";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const PC = (m: number) => ((m % 12) + 12) % 12;
const C = (...noms: string[]) => [...new Set(noms.map((n) => Note.chroma(n)!))].sort((a, b) => a - b);

/** Les classes et la basse d'un symbole rendu, par le lecteur des symboles. */
function lu(symbole: string) {
  const c = accordDuSymbole(symbole);
  expect(c, `« ${symbole} » ne se relit pas`).not.toBeNull();
  const notes = c!.notes;
  const basse = symbole.includes("/") ? Note.chroma(symbole.split("/")[1])! : Note.chroma(c!.tonic!)!;
  return { classes: [...new Set(notes.map((n) => Note.chroma(n)!))].sort((a, b) => a - b), basse };
}
const luLigne = (ligne: string) => {
  const h = ligne.split(/\s+/)[0].split("+").map((n) => Note.midi(n)!);
  return { classes: [...new Set(h.map(PC))].sort((a, b) => a - b), basse: PC(Math.min(...h)) };
};

async function parLesTrois(romain: string, tonique: string, gamme: string) {
  const p = await lancerFiche(F("tonal-progression"), { "Tonalité": tonique, Gamme: gamme, Progression: romain }, { entrees: [null] });
  expect(p.erreurRendue, p.message).toBe(false);
  const g = await lancerFiche(F("tonal-grille"), { "Tonalité": tonique, Gamme: gamme, Progression: romain, Mode: "plaque" }, { entrees: [null] });
  expect(g.erreurRendue, g.message).toBe(false);
  const a = await lancerFiche(F("accords-vers-notation"), { Source: "progression", Gamme: gamme }, { entrees: [tonique, romain, null] });
  expect(a.valeurs[0], a.message).toBeTruthy();
  return {
    progression: lu(String(p.valeurs[0])),
    grille: luLigne(String(g.valeurs[0]).split("\n")[1]),
    notation: luLigne(String(a.valeurs[0]).split("\n")[1]),
  };
}

const CAS_MAJEUR: [string, string[], string][] = [
  ["I", ["C", "E", "G"], "C"], ["ii", ["D", "F", "A"], "D"], ["iii", ["E", "G", "B"], "E"], ["IV", ["F", "A", "C"], "F"],
  ["V", ["G", "B", "D"], "G"], ["vi", ["A", "C", "E"], "A"], ["vii°", ["B", "D", "F"], "B"],
  ["viiø7", ["B", "D", "F", "A"], "B"], ["vii°7", ["B", "D", "F", "Ab"], "B"], ["V7", ["G", "B", "D", "F"], "G"],
  ["ii7", ["D", "F", "A", "C"], "D"], ["iii7", ["E", "G", "B", "D"], "E"], ["vi7", ["A", "C", "E", "G"], "A"],
  ["IVmaj7", ["F", "A", "C", "E"], "F"], ["I7", ["C", "E", "G", "Bb"], "C"], ["V9", ["G", "B", "D", "F", "A"], "G"],
  ["Vsus4", ["G", "C", "D"], "G"], ["bVII", ["Bb", "D", "F"], "Bb"], ["bII", ["Db", "F", "Ab"], "Db"],
  ["#iv°", ["F#", "A", "C"], "F#"], ["iv", ["F", "Ab", "C"], "F"], ["V+", ["G", "B", "D#"], "G"],
  ["I6", ["C", "E", "G"], "E"], ["I64", ["C", "E", "G"], "G"], ["IV6", ["F", "A", "C"], "A"], ["ii6", ["D", "F", "A"], "F"],
  ["V65", ["G", "B", "D", "F"], "B"], ["V43", ["G", "B", "D", "F"], "D"], ["V42", ["G", "B", "D", "F"], "F"],
  ["ii65", ["D", "F", "A", "C"], "F"], ["vii°6", ["B", "D", "F"], "D"], ["Iadd6", ["C", "E", "G", "A"], "C"],
  ["V/V", ["D", "F#", "A"], "D"], ["V7/V", ["D", "F#", "A", "C"], "D"], ["V7/IV", ["C", "E", "G", "Bb"], "C"],
  ["vii°/V", ["F#", "A", "C"], "F#"], ["vii°7/V", ["F#", "A", "C", "Eb"], "F#"], ["V/ii", ["A", "C#", "E"], "A"],
  ["V/vi", ["E", "G#", "B"], "E"], ["IV/IV", ["Bb", "D", "F"], "Bb"],
];
const CAS_MINEUR: [string, string[], string][] = [
  ["i", ["A", "C", "E"], "A"], ["ii°", ["B", "D", "F"], "B"], ["iiø7", ["B", "D", "F", "A"], "B"], ["III", ["C", "E", "G"], "C"],
  ["iv", ["D", "F", "A"], "D"], ["v", ["E", "G", "B"], "E"], ["V", ["E", "G#", "B"], "E"], ["V7", ["E", "G#", "B", "D"], "E"],
  ["VI", ["F", "A", "C"], "F"], ["VII", ["G", "B", "D"], "G"], ["III+", ["C", "E", "G#"], "C"],
  ["vii°", ["G#", "B", "D"], "G#"], ["vii°7", ["G#", "B", "D", "F"], "G#"], ["viiø7", ["G#", "B", "D", "F#"], "G#"],
  ["i6", ["A", "C", "E"], "C"], ["V65", ["E", "G#", "B", "D"], "G#"], ["bVI", ["F", "A", "C"], "F"],
];

// DÉCISION DE FABIEN DU 2026-11-22, « iiø7 V7 i ». Mesuré avant : le style Jazz en mineur suggérait
// « ii V i », lu Bm E Am en la mineur, et le si mineur portait un fa♯ que la gamme n'a pas.
describe("L'ANALYSE HARMONIQUE NE SUGGÈRE QUE DES ACCORDS DE SA TONALITÉ", () => {
  /** Trois secondes d'un accord tenu, en sinusoïdes. */
  function accordTenu(notes: number[]): AudioBuffer {
    const SR = 44100, n = SR * 3;
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) for (const m of notes) x[i] += 0.06 * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * (i / SR));
    b.copyToChannel(x, 0);
    return b;
  }
  // La gamme de do majeur, et celle de la mineur, harmonique comprise : la sensible sol♯ est de l'usage.
  const GAMMES = { majeur: C("C", "D", "E", "F", "G", "A", "B"), mineur: C("A", "B", "C", "D", "E", "F", "G", "G#") };
  it.each([["Pop"], ["Jazz"], ["Blues"]].flatMap(([s]) => [[s, "majeur"], [s, "mineur"]]))("le style %s, en %s", async (style, mode) => {
    const t = await lancerFiche(F("tonal-analyse"), { Style: style }, { entrees: [accordTenu(mode === "mineur" ? [57, 60, 64] : [60, 64, 67])] });
    const p = await lancerFiche(F("tonal-progression"), { Progression: String(t.valeurs[1]) }, { entrees: [String(t.valeurs[0])] });
    expect(p.erreurRendue, p.message).toBe(false);
    for (const symbole of String(p.valeurs[0]).split(" ")) {
      const hors = lu(symbole).classes.filter((k) => !GAMMES[mode as "majeur" | "mineur"].includes(k));
      expect(hors, `« ${symbole} » dans « ${t.valeurs[1]} »`).toEqual([]);
    }
  });

  it("le style Jazz suggère la cadence de l'usage, avec ses septièmes", async () => {
    const majeur = await lancerFiche(F("tonal-analyse"), { Style: "Jazz" }, { entrees: [accordTenu([60, 64, 67])] });
    const mineur = await lancerFiche(F("tonal-analyse"), { Style: "Jazz" }, { entrees: [accordTenu([57, 60, 64])] });
    expect(majeur.valeurs[1]).toBe("ii7 V7 Imaj7");
    expect(mineur.valeurs[1]).toBe("iiø7 V7 i");
  });
});

describe("LES CHIFFRES ROMAINS SE LISENT SELON L'USAGE, en do majeur", () => {
  it.each(CAS_MAJEUR)("« %s »", async (romain, notes, basse) => {
    const attendu = { classes: C(...notes), basse: Note.chroma(basse)! };
    const r = await parLesTrois(romain, "C", "majeur");
    expect(r.progression, "Progression").toEqual(attendu);
    expect(r.grille, "Grille").toEqual(attendu);
    expect(r.notation, "Accords → Notation").toEqual(attendu);
  });
});

describe("LES CHIFFRES ROMAINS SE LISENT SELON L'USAGE, en la mineur", () => {
  it.each(CAS_MINEUR)("« %s »", async (romain, notes, basse) => {
    const attendu = { classes: C(...notes), basse: Note.chroma(basse)! };
    const r = await parLesTrois(romain, "A", "mineur");
    expect(r.progression, "Progression").toEqual(attendu);
    expect(r.grille, "Grille").toEqual(attendu);
    expect(r.notation, "Accords → Notation").toEqual(attendu);
  });
});
