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
import { describe, expect, it } from "vitest";
import { fiches } from "./sequence";
import { ctxDEssai } from "../core/contexte-essai";
import { parseMidi } from "midi-file";
import { notesVersFichierMidi } from "../audio";

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
  const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) =>
    ctxDEssai(entrees, params, { ficheId: "rendu-sequence" });

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

describe("le fichier MIDI d'une séquence à plusieurs voix", () => {
  // POURQUOI CE CAS EXISTE. Les quatre voix d'un choral partaient sur une seule piste et un seul
  // canal : fondues dans un séquenceur, et l'alto et le ténor à l'unisson n'y faisaient plus qu'une
  // note, un canal ne tenant qu'une note par hauteur. Relevé par Fabien le 2026-11-23, sur la sortie
  // de « Harmoniser à quatre voix ».
  // DÉFAUT REPLANTÉ en rendant le chemin d'une seule piste à toute séquence : les trois premiers cas
  // tombent.
  const choral = {
    notes: [
      { note: 72, velocite: 90, debut: 0, fin: 1, voix: 0 }, { note: 71, velocite: 90, debut: 1, fin: 2, voix: 0 },
      { note: 60, velocite: 90, debut: 0, fin: 1, voix: 1 }, { note: 62, velocite: 90, debut: 1, fin: 2, voix: 1 },
      { note: 60, velocite: 90, debut: 0, fin: 1, voix: 2 }, { note: 55, velocite: 90, debut: 1, fin: 2, voix: 2 },
      { note: 48, velocite: 90, debut: 0, fin: 1, voix: 3 }, { note: 43, velocite: 90, debut: 1, fin: 2, voix: 3 },
    ],
    tempo: 60,
  };
  const contexte = (entrees: unknown[]) => ctxDEssai(entrees, {}, { ficheId: "rendu-sequence" });
  const lire = async (f: unknown) => parseMidi(new Uint8Array(await (f as File).arrayBuffer()));
  const notesDe = (piste: any[]) => piste.filter((e) => e.type === "noteOn" && e.velocity > 0);

  it("CHAQUE VOIX A SA PISTE ET SON CANAL", async () => {
    const res = await fiche.executer(contexte([choral]) as any);
    const pistes = (await lire(res.valeurs[1])).tracks.map(notesDe).filter((p) => p.length > 0);
    expect(pistes.map((p) => p.map((e: any) => e.noteNumber))).toEqual([[72, 71], [60, 62], [60, 55], [48, 43]]);
    expect(pistes.map((p) => new Set(p.map((e: any) => e.channel)).size)).toEqual([1, 1, 1, 1]);
    expect(new Set(pistes.map((p) => p[0].channel)).size).toBe(4);
  });

  it("L'UNISSON DE L'ALTO ET DU TÉNOR GARDE SES DEUX NOTES", async () => {
    const res = await fiche.executer(contexte([choral]) as any);
    const attaques = (await lire(res.valeurs[1])).tracks.flatMap(notesDe);
    expect(attaques.filter((e: any) => e.noteNumber === 60 && e.deltaTime === 0)).toHaveLength(2);
    expect(attaques).toHaveLength(8);
  });

  it("LE MESSAGE DIT LE NOMBRE DE PISTES", async () => {
    const res = await fiche.executer(contexte([choral]) as any);
    expect(res.message).toContain("4 pistes MIDI");
  });

  it("UNE SÉQUENCE D'UNE SEULE VOIX GARDE LE FICHIER D'AVANT, À L'OCTET", async () => {
    const seule = { notes: choral.notes.filter((n) => n.voix === 0).map(({ voix: _, ...n }) => n), tempo: 60 };
    const res = await fiche.executer(contexte([seule]) as any);
    const avant = notesVersFichierMidi(seule.notes, 60);
    expect(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer())).toEqual(new Uint8Array(await avant.arrayBuffer()));
    expect(res.message).not.toContain("pistes");
  });
});
