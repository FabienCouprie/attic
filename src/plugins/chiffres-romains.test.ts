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
