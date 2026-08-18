// plugins/accords-vers-notation.test.ts
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

const fiche = registre.trouverDef("accords-vers-notation")!;

function ctxDe(entrees: (string | null)[], params: Record<string, string | number> = {}) {
  return {
    entree: (i: number) => entrees[i] ?? null,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
  } as any;
}

// Les lignes utilisent le format RÉEL observé en bout de chaîne, horodatage
// compris : « 0:00 Csus2 (4.0s) ». `detecterAccords` préfixe lui-même `nomEn`
// avec le temps. Une première version de ces tests utilisait le format supposé
// (sans horodatage) : ils passaient tous alors que la chaîne complète échouait.
describe("accords-vers-notation", () => {
  it("convertit les accords détectés en notation Texte → MIDI", async () => {
    const res = await fiche.executer(ctxDe(["Cmaj (1.0s)\nAmin (2.0s)"], { Tempo: 120, Octave: 3 }));
    const lignes = String(res.valeurs[0]).split("\n");
    expect(lignes[0]).toBe("TEMPO 120");
    // À 120 BPM, 1 s = 2 temps et 2 s = 4 temps.
    expect(lignes[1]).toBe("C3+E3+G3 2");
    expect(lignes[2]).toBe("A3+C4+E4 4");
  });

  // Le format attendu par Texte → MIDI : « notes séparées par + » puis la durée.
  it("produit des lignes que Texte → MIDI sait relire", async () => {
    const res = await fiche.executer(ctxDe(["0:00 Cmaj (1.0s)"], { Tempo: 120 }));
    for (const ligne of String(res.valeurs[0]).split("\n").slice(1)) {
      expect(ligne).toMatch(/^([A-G][#b]?\d(\+[A-G][#b]?\d)*)\s[\d.]+$/);
    }
  });

  // Régression : `detecterAccords` nomme le demi-diminué « min7b5 », que Tonal
  // ne connaît pas (il l'écrit « m7b5 »). Sans normalisation, l'accord donnait
  // une liste de notes vide et la ligne disparaissait sans avertissement.
  it("gère le demi-diminué « min7b5 », inconnu de Tonal sous ce nom", async () => {
    const res = await fiche.executer(ctxDe(["0:00 Cmin7b5 (1.0s)"], { Tempo: 120, Octave: 3 }));
    expect(res.valeurs[0]).toContain("C3+");
    expect(String(res.valeurs[0]).split("\n")).toHaveLength(2); // TEMPO + 1 accord
  });

  it("les notes d'un accord sont ascendantes (pas de renversement descendant)", async () => {
    const res = await fiche.executer(ctxDe(["0:00 Amin (1.0s)"], { Tempo: 120, Octave: 3 }));
    const notes = String(res.valeurs[0]).split("\n")[1].split(" ")[0].split("+");
    const octaves = notes.map((n) => parseInt(n.slice(-1), 10));
    for (let i = 1; i < octaves.length; i++) expect(octaves[i]).toBeGreaterThanOrEqual(octaves[i - 1]);
  });

  it("développe une progression en chiffres romains avec la tonalité", async () => {
    const res = await fiche.executer(ctxDe([null, "I V vi IV", "C major (87%)"],
      { Source: "progression", Tempo: 100, Octave: 3, "Durée par accord": 2 }));
    const lignes = String(res.valeurs[0]).split("\n");
    expect(lignes[0]).toBe("TEMPO 100");
    expect(lignes).toHaveLength(5);              // TEMPO + 4 accords
    expect(lignes[1]).toBe("C3+E3+G3 2");        // I en do majeur
    expect(lignes[2]).toBe("G3+B3+D4 2");        // V
    // vi = relatif MINEUR : La-Do-Mi. Tonal lit la casse du chiffre romain mais
    // ne la reporte pas sur le type d'accord, et produisait La MAJEUR (A C# E).
    expect(lignes[3]).toBe("A3+C4+E4 2");
    expect(lignes[4]).toBe("F3+A3+C4 2");        // IV
  });

  it("les degrés en minuscules donnent bien des accords mineurs", async () => {
    const res = await fiche.executer(ctxDe([null, "i iv v", "A minor"],
      { Source: "progression", Tempo: 120, Octave: 3, "Durée par accord": 1 }) as any);
    const lignes = String(res.valeurs[0]).split("\n");
    expect(lignes[1]).toBe("A3+C4+E4 1");        // i  = La mineur
    expect(lignes[2]).toBe("D3+F3+A3 1");        // iv = Ré mineur (fondamentale à l'octave demandée)
  });

  it("un type explicite sur le chiffre romain est conservé (vi7 reste dominante)", async () => {
    const res = await fiche.executer(ctxDe([null, "vi7", "C major"],
      { Source: "progression", Octave: 3 }) as any);
    expect(String(res.valeurs[0]).split("\n")[1]).toContain("Db4");   // Tonal rend l'altération en bémol
  });

  it("refuse la source Progression sans tonalité, plutôt que d'inventer une tonique", async () => {
    const res = await fiche.executer(ctxDe([null, "I V vi IV", null], { Source: "progression" }));
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toBeTruthy();
  });

  it("message clair quand aucune entrée n'est connectée", async () => {
    const res = await fiche.executer(ctxDe([null]));
    expect(res.valeurs[0]).toBeNull();
    expect(res.message).toBeTruthy();
  });

  it("signale les accords ignorés au lieu de les taire", async () => {
    const res = await fiche.executer(ctxDe(["Cmaj (1.0s)\nZzz (1.0s)"], { Tempo: 120 }));
    expect(String(res.valeurs[0]).split("\n")).toHaveLength(2);
    expect(res.message).toMatch(/1/);
  });
});

describe("accords-vers-notation — tolérance de format", () => {
  it("accepte aussi une ligne sans horodatage", async () => {
    const res = await fiche.executer(ctxDe(["Cmaj (1.0s)"], { Tempo: 120, Octave: 3 }) as any);
    expect(String(res.valeurs[0]).split("\n")[1]).toBe("C3+E3+G3 2");
  });
});
