// plugins/lire-corpus.test.ts — « Lire un corpus », par son exécuteur, sur un faux pont de bureau.
//
// Le dossier mêle ce que la notice promet de lire et ce qu'elle promet d'écarter : deux MIDI à quatre
// voix, une table du DCML, un MIDI à trois voix, un Humdrum illisible et un texte sans extension lue.

import { afterEach, describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { sequenceVersMidiParVoix } from "../audio/corpus-midi";
import { corpusVersJson } from "../audio/corpus-fichier";
import { corpusDEssai } from "../audio/valeurs-essai";
import { TABLE_175 } from "../audio/choral-175-dcml";
import type { Corpus } from "../audio/corpus";
import { FICHIER_CHORALS } from "./lire-corpus";

const fiche = registre.trouverDef("lire-corpus") as unknown as FicheLancable;
const lire = (reglages: Record<string, string | number>) => lancerFiche(fiche, reglages, { entrees: [] });

/** Pose un faux pont : des fichiers par chemin, des binaires rendus comme le fait le processus principal. */
function poserPont(fichiers: Record<string, string | Uint8Array>) {
  (globalThis as any).window = {
    api: {
      lireDossier: async () => Object.keys(fichiers).map((nom) => ({ nom, chemin: `D:/corpus/${nom}` })),
      lireTexte: async (chemin: string) => {
        const v = fichiers[chemin.replace("D:/corpus/", "")];
        return typeof v === "string" ? v : null;
      },
      lireBinaire: async (chemin: string) => {
        const v = fichiers[chemin.replace("D:/corpus/", "")];
        return v instanceof Uint8Array ? { donnees: v, nom: chemin } : null;
      },
    },
  };
}
afterEach(() => { delete (globalThis as any).window; });

describe("Lire un corpus", () => {
  it("lit un dossier par extension, dans l'ordre des noms, et nomme chaque pièce écartée", async () => {
    const [majeur, mineur] = corpusDEssai().pieces;
    const troisVoix = { ...majeur.sequence, notes: majeur.sequence.notes.filter((n) => n.voix !== 3) };
    poserPont({
      "b-mineur.mid": await sequenceVersMidiParVoix(mineur.sequence),
      "a-majeur.mid": await sequenceVersMidiParVoix(majeur.sequence),
      "c-choral-175.notes.tsv": TABLE_175,
      "d-trois.mid": await sequenceVersMidiParVoix(troisVoix),
      "e-casse.krn": "ceci n'est pas du Humdrum",
      "lisez-moi.txt": "rien",
    });
    const r = await lire({ Source: "dossier", Dossier: "D:/corpus" });
    expect(r.levee).toBe(null);
    const c = r.valeurs[0] as Corpus;
    expect(c.pieces.map((p) => p.source)).toEqual(["a-majeur.mid", "b-mineur.mid", "c-choral-175.notes.tsv"]);
    expect(c.pieces.map((p) => p.tonalite && [p.tonalite.tonique, p.tonalite.mode])).toEqual([[0, "majeur"], [9, "mineur"], [0, "majeur"]]);
    expect(r.message).toBe("3 pièces · 2 écartées");
    const rapport = String(r.valeurs[1]);
    expect(rapport).toContain("écartée : d-trois.mid · 3 voix");
    expect(rapport).toMatch(/écartée : e-casse\.krn · /);
    expect(rapport).not.toContain("lisez-moi");
  });

  it("s'arrête à « Limite » pièces gardées", async () => {
    const [majeur, mineur] = corpusDEssai().pieces;
    poserPont({ "a.mid": await sequenceVersMidiParVoix(majeur.sequence), "b.mid": await sequenceVersMidiParVoix(mineur.sequence) });
    const r = await lire({ Source: "dossier", Dossier: "D:/corpus", Limite: 1 });
    expect((r.valeurs[0] as Corpus).pieces.map((p) => p.source)).toEqual(["a.mid"]);
  });

  it("lit le corpus livré, et rend ses corrections et ses pièces non vérifiées au rapport", async () => {
    const texte = corpusVersJson(corpusDEssai(), {
      nom: "Chorals de Bach (DCML corrigé)", source: "DCMLab/bach_chorales v2.0", licence: "CC0-1.0",
      corrections: [["essai-do-majeur", 3, 0, 47, 48]], nonVerifiees: [{ source: "essai-la-mineur", raison: "aucun jumeau" }],
    });
    poserPont({ [FICHIER_CHORALS]: new TextEncoder().encode(texte) });
    (globalThis as any).window.api.lireBinaire = async (chemin: string) =>
      chemin === FICHIER_CHORALS ? { donnees: new TextEncoder().encode(texte), nom: chemin } : null;
    const r = await lire({});
    expect((r.valeurs[0] as Corpus).pieces).toHaveLength(2);
    const rapport = String(r.valeurs[1]);
    expect(rapport).toContain("hauteurs corrigées : 1");
    expect(rapport).toContain("non vérifié : essai-la-mineur · aucun jumeau");
  });

  it("refuse en le disant : corpus livré absent, dossier non choisi, hors de l'application de bureau", async () => {
    poserPont({});
    expect((await lire({})).message).toBe(`corpus livré absent : ${FICHIER_CHORALS}`);
    expect((await lire({ Source: "dossier" })).message).toBe("Aucun dossier choisi.");
    delete (globalThis as any).window;
    expect((await lire({ Source: "dossier", Dossier: "D:/x" })).message).toBe("Lire un dossier demande l'application de bureau.");
  });
});
