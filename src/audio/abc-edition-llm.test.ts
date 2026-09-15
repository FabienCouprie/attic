// audio/abc-edition-llm.test.ts — L'édition par LLM avec un modèle simulé : les
// deux opérations, les relances, les refus. Le vrai modèle est vérifié dans l'app.
import { describe, it, expect } from "vitest";
import { editerAbc, hauteurDepuisNom, cleDepuisNomTonalite, nomNote, type AppelLlm } from "./abc-edition-llm";
import { lireMorceau } from "./abc";
import { verifierContraintes } from "./abc-contraintes";

// Avec reprises, pour vérifier que l'édition travaille sur le jeu déroulé.
const AIR = `X:1
T:Essai
M:4/4
L:1/8
Q:1/4=100
K:G
|:"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BG"D"AF "G"G4:|`;

/** Un modèle simulé qui rend ses réponses dans l'ordre, et garde les prompts reçus. */
function modele(reponses: string[]) {
  const prompts: string[] = [], formats: Record<string, unknown>[] = [];
  const appel: AppelLlm = async (prompt, format) => {
    prompts.push(prompt); formats.push(format);
    return { reponse: reponses.shift() ?? "" };
  };
  return { appel, prompts, formats };
}
const accords8 = (liste: string[][]) => JSON.stringify({ bars: liste });

describe("réharmoniser", () => {
  const nouveaux = [["Em7"], ["Am7", "D7"], ["Bm7", "E7"], ["Am7", "D7"], ["Em7"], ["Am7", "D7"], ["Bm7", "E7"], ["Am7", "D7"]];

  it("pose les accords rendus sur la mélodie intacte, reprises déroulées", async () => {
    const m = modele([accords8(nouveaux)]);
    const r = await editerAbc(AIR, { operation: "reharmoniser", consigne: "richer", essais: 3, tonaliteCible: "garder" }, m.appel);
    expect(r.ok).toBe(true);
    expect(r.essais).toEqual([{ numero: 1, erreurs: [] }]);
    const relu = lireMorceau(r.abc!);
    expect(relu.accords.map((a) => [a.symbole, a.debut])).toEqual([
      ["Em7", 0], ["Am7", 4], ["D7", 6], ["Bm7", 8], ["E7", 10], ["Am7", 12], ["D7", 14],
      ["Em7", 16], ["Am7", 20], ["D7", 22], ["Bm7", 24], ["E7", 26], ["Am7", 28], ["D7", 30],
    ]);
    expect(verifierContraintes(lireMorceau(AIR), relu, ["mesures", "metrique", "tonalite", "melodie"]).ok).toBe(true);
  });

  it("impose au modèle un JSON de 8 mesures, 2 accords au plus", async () => {
    const m = modele([accords8(nouveaux)]);
    await editerAbc(AIR, { operation: "reharmoniser", consigne: "x", essais: 1, tonaliteCible: "garder" }, m.appel);
    expect(m.formats[0]).toMatchObject({ properties: { bars: { minItems: 8, maxItems: 8, items: { maxItems: 2 } } } });
    expect(m.prompts[0]).toMatch(/Bar 4 — melody: B4 \(1\/2\) G4 \(1\/2\) A4 \(1\/2\) F#4 \(1\/2\) G4 \(2\)/);
  });

  it("relance avec l'erreur précise un accord inconnu, puis accepte la correction", async () => {
    const faux = nouveaux.map((b, k) => (k === 2 ? ["Zorglub"] : b));
    const m = modele([accords8(faux), accords8(nouveaux)]);
    const r = await editerAbc(AIR, { operation: "reharmoniser", consigne: "x", essais: 3, tonaliteCible: "garder" }, m.appel);
    expect(r.ok).toBe(true);
    expect(r.essais[0].erreurs).toEqual(['bar 3: unknown chord symbol "Zorglub"']);
    expect(m.prompts[1]).toMatch(/Problems: bar 3: unknown chord symbol "Zorglub"/);
  });

  it("compte comme non faite une copie des accords d'origine", async () => {
    // La première mesure du modèle réel : gemma4:12b recopiait l'original. Air
    // dont les accords tiennent en deux par mesure — dans AIR, la mesure 4 en
    // porte trois, qu'aucune réponse ne pourrait recopier.
    const simple = AIR.replace('"G"BG"D"AF "G"G4', '"G"BGAF "D"G4');
    const copie = [["G"], ["C", "G"], ["D"], ["G", "D"], ["G"], ["C", "G"], ["D"], ["G", "D"]];
    const m = modele([accords8(copie), accords8(copie)]);
    const r = await editerAbc(simple, { operation: "reharmoniser", consigne: "x", essais: 2, tonaliteCible: "garder" }, m.appel);
    expect(r.ok).toBe(false);
    expect(r.essais.map((e) => e.erreurs[0])).toEqual([
      "these are the current chords: the requested change was not made",
      "these are the current chords: the requested change was not made",
    ]);
    expect(r.erreur).toBe("échec après 2 essai(s)");
  });

  it("n'accepte qu'un accord par mesure en 3/4", async () => {
    const valse = "X:1\nM:3/4\nL:1/4\nK:C\nC E G | c2 G | E G c | C3 |]";
    const m = modele([accords8([["C", "G"], ["Am"], ["F"], ["C"]]), accords8([["Am"], ["F"], ["G7"], ["C"]])]);
    const r = await editerAbc(valse, { operation: "reharmoniser", consigne: "x", essais: 2, tonaliteCible: "garder" }, m.appel);
    expect(m.formats[0]).toMatchObject({ properties: { bars: { items: { maxItems: 1 } } } });
    expect(r.essais[0].erreurs).toEqual(["bar 1: give 1 chord"]);
    expect(r.ok).toBe(true);
  });
});

describe("réécrire les hauteurs", () => {
  const melodie = lireMorceau(AIR).voix[0].notes;

  it("pose les hauteurs rendues sur le rythme d'origine, dans la tonalité cible", async () => {
    const noms = melodie.map((n) => nomNote(n.midi - 3));
    const m = modele([JSON.stringify({ notes: noms })]);
    const r = await editerAbc(AIR, { operation: "hauteurs", consigne: "in E minor", essais: 2, tonaliteCible: "Em" }, m.appel);
    expect(r.ok).toBe(true);
    const relu = lireMorceau(r.abc!);
    expect(relu.tonalite.nom).toBe("E minor");
    expect(relu.voix[0].notes.map((n) => [n.debut, n.duree])).toEqual(melodie.map((n) => [n.debut, n.duree]));
    expect(relu.voix[0].notes.map((n) => n.midi)).toEqual(melodie.map((n) => n.midi - 3));
    // Tonalité changée : les accords d'origine ne valent plus, ils sont retirés et c'est dit.
    expect(relu.accords).toEqual([]);
    expect(r.accordsRetires).toBe(true);
  });

  it("impose exactement autant de hauteurs que de notes", async () => {
    const m = modele([JSON.stringify({ notes: melodie.map((n) => nomNote(n.midi + 2)) })]);
    await editerAbc(AIR, { operation: "hauteurs", consigne: "x", essais: 1, tonaliteCible: "garder" }, m.appel);
    expect(m.formats[0]).toMatchObject({ properties: { notes: { minItems: melodie.length, maxItems: melodie.length } } });
  });

  it("garde les accords quand la tonalité ne change pas", async () => {
    const m = modele([JSON.stringify({ notes: melodie.map((n) => nomNote(n.midi + (n.midi % 2 ? 2 : 0))) })]);
    const r = await editerAbc(AIR, { operation: "hauteurs", consigne: "x", essais: 1, tonaliteCible: "garder" }, m.appel);
    expect(r.accordsRetires).toBe(false);
    expect(lireMorceau(r.abc!).accords.length).toBeGreaterThan(0);
  });

  it("relance sur une hauteur illisible ou une copie de l'original", async () => {
    const illisible = melodie.map((n, k) => (k === 5 ? "H4" : nomNote(n.midi)));
    const copie = melodie.map((n) => nomNote(n.midi));
    const m = modele([JSON.stringify({ notes: illisible }), JSON.stringify({ notes: copie })]);
    const r = await editerAbc(AIR, { operation: "hauteurs", consigne: "x", essais: 2, tonaliteCible: "garder" }, m.appel);
    expect(r.ok).toBe(false);
    expect(r.essais[0].erreurs).toEqual(['note 6: "H4" is not a pitch between A0 and C8']);
    expect(r.essais[1].erreurs).toEqual(["these are the original pitches: the requested change was not made"]);
  });
});

describe("refus et utilitaires", () => {
  it("refuse une entrée sans partition, une partition mal lue, une levée", async () => {
    const m = modele([]);
    const o = { operation: "reharmoniser" as const, consigne: "x", essais: 1, tonaliteCible: "garder" };
    expect((await editerAbc("bonjour", o, m.appel)).erreur).toMatch(/aucune partition/);
    expect((await editerAbc("K:C\n{g}CDE", o, m.appel)).erreur).toMatch(/incomplètement lue/);
    expect((await editerAbc("M:4/4\nL:1/4\nK:C\nC | D E F G | c4 |", o, m.appel)).erreur).toMatch(/levée/);
    expect(m.prompts).toEqual([]); // aucun appel au modèle
  });

  it("transmet l'erreur du serveur sans relancer", async () => {
    const appel: AppelLlm = async () => ({ erreur: "Serveur Ollama injoignable" });
    const r = await editerAbc(AIR, { operation: "reharmoniser", consigne: "x", essais: 3, tonaliteCible: "garder" }, appel);
    expect(r.erreur).toBe("Serveur Ollama injoignable");
  });

  it("lit les noms de notes et les tonalités", () => {
    expect(hauteurDepuisNom("F#4")).toBe(66);
    expect(hauteurDepuisNom("Bb3")).toBe(58);
    expect(hauteurDepuisNom("C9")).toBeNull();
    expect(cleDepuisNomTonalite("A dorian")).toBe("Ador");
    expect(cleDepuisNomTonalite("F# minor")).toBe("F#m");
  });
});
