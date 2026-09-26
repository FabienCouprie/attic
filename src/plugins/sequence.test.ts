// plugins/sequence.test.ts — Le rendu d'une séquence, et les deux réglages qui décident de ce qu'on entend.
//
// POURQUOI CES TESTS EXISTENT. Fabien a écouté ce nœud deux fois et entendu « une explosion » les
// deux fois. Le calcul était juste, et rien ne saturait : la crête tenait à 0,445. Ce sont les
// DÉFAUTS DU RENDU qui trahissaient l'agrégat, et il a fallu deux diagnostics parce que ma première
// mesure appelait le moteur directement au lieu de suivre le chemin du nœud.
//
// PREMIER DÉFAUT, le timbre : chaque note passait par une modulation d'indice trois, qui lui ajoute
// une huitaine de bandes latérales. SECOND DÉFAUT, et celui que la première correction masquait : le
// réglage de synthèse valait « Automatique », donc la SoundFont dès qu'un fichier SF2 est chargé, et
// la SoundFont ignore le timbre. Un échantillon de piano apporte à chaque partiel un spectre entier.
//
// Ces deux valeurs par défaut sont donc du domaine de la justesse et non du goût, et c'est pour cela
// qu'un test les tient. La mesure du son lui-même vit dans `audio/harmonie-spectrale.test.ts`.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { fiches } from "./sequence";

const fiche = fiches.find((f) => f.id === "rendu-sequence")!;
const reglage = (nom: string) => fiche.parametres.find((p) => p.nom === nom)!;

describe("les réglages qui décident de ce qu'on entend", () => {
  it("LA SYNTHÈSE LOCALE EST LE DÉFAUT, et non « Automatique » comme ailleurs", () => {
    // « Automatique » prend la SoundFont dès qu'un SF2 est chargé, et le réglage de timbre n'a
    // alors plus aucun effet : douze partiels deviennent douze instruments échantillonnés.
    expect(reglage("Synthèse").defaut).toBe("FM/Oscillateurs");
    expect(reglage("Synthèse").defaut).not.toBe("Automatique");
  });

  it("LE TIMBRE PAR DÉFAUT EST LA SINUSOÏDE, seule à ne rien ajouter à la hauteur", () => {
    expect(reglage("Timbre").defaut).toBe("Sinus");
    expect(reglage("Timbre").optionIds?.[0]).toBe("pur");
  });

  it("les quatre timbres restent offerts, l'agrégat n'étant pas le seul usage", () => {
    expect(reglage("Timbre").optionIds).toEqual(["pur", "douce", "brillante", "percutante"]);
  });
});

describe("le message du nœud", () => {
  const sequence = {
    notes: [
      { note: 69, velocite: 100, debut: 0, fin: 1 },
      { note: 69.5, velocite: 80, debut: 0, fin: 1 },
    ],
    tempo: 120,
  };
  const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
    noeud: { id: "n1", data: { ficheId: "rendu-sequence", parametres: params } },
    runtime: null,
    entree: (i: number) => entrees[i] ?? null,
    entrees: () => entrees,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  });

  it("NOMME LE MOTEUR QUI A RENDU, et non le réglage", async () => {
    // « Automatique » ne dit pas lequel a servi, et deux écoutes ont été perdues à chercher dans le
    // calcul un défaut qui venait de là.
    const res = await fiche.executer(contexte([sequence]) as any);
    expect(res.message).toContain("Sinus");
  });

  it("DIT COMBIEN DE HAUTEURS LA SORTIE MIDI ARRONDIT, au lieu de le taire", async () => {
    const res = await fiche.executer(contexte([sequence]) as any);
    expect(res.message).toContain("1 hauteurs arrondies");
    const entier = { notes: [{ note: 69, velocite: 100, debut: 0, fin: 1 }] };
    const sansPerte = await fiche.executer(contexte([entier]) as any);
    expect(sansPerte.message).toContain("aucune hauteur arrondie");
  });

  it("refuse ce qui n'est pas une séquence, sans faire semblant", async () => {
    const res = await fiche.executer(contexte([{ pasDesNotes: true }]) as any);
    expect(res.valeurs[0]).toBe(null);
  });
});
