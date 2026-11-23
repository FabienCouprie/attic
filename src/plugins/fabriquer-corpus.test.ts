// plugins/fabriquer-corpus.test.ts — La paire « Fabriquer un corpus », menée comme le pilote la mène.
//
// Les graines par passe ne s'éprouvent pas ici : elles se résolvent dans la passe du moteur
// (`core/graines-de-passe.test.ts` pour la règle, l'exemple `un-corpus-fabrique.json` dans
// l'application pour le tout). Ce fichier tient ce que les deux nœuds font de leurs passes.

import { afterEach, describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { corpusDEssai } from "../audio/valeurs-essai";
import { sequenceDepuisMidiParPiste } from "../audio/corpus-midi";
import type { Corpus } from "../audio/corpus";
import type { Sequence } from "../audio/sequence";
import { FICHE_CORPUS_DEBUT, FICHE_CORPUS_FIN, publierBoucles } from "./boucleSequencesGlobal";
import { empreinteCorpus } from "./fabriquer-corpus";

const debut = registre.trouverDef(FICHE_CORPUS_DEBUT) as unknown as FicheLancable;
const fin = registre.trouverDef(FICHE_CORPUS_FIN) as unknown as FicheLancable;

/** Une pièce par passe, transposée du numéro de la passe pour que les pièces diffèrent. */
const pieceDeLaPasse = (passe: number): Sequence => {
  const s = corpusDEssai().pieces[0].sequence;
  return { ...s, notes: s.notes.map((n) => ({ ...n, note: n.note + passe })) };
};

/** Ce que le pilote fait : l'état posé, la passe de découverte, puis les suivantes. */
async function mener(pieces: number, reglagesFin: Record<string, string | number> = {}) {
  const etat = { debutId: "essai", finsIds: ["essai"], index: 0, morceaux: [] as unknown[], recoltes: [] as unknown[] };
  publierBoucles([etat]);
  const sorties: { corpus: Corpus | null; journal: string; message: string; rang: string }[] = [];
  try {
    for (;;) {
      const d = await lancerFiche(debut, { "Pièces": pieces }, { entrees: [] });
      const rang = String(d.valeurs[0]);
      const f = await lancerFiche(fin, reglagesFin, { entrees: [pieceDeLaPasse(etat.index), rang] });
      sorties.push({ corpus: f.valeurs[0] as Corpus | null, journal: String(f.valeurs[1]), message: f.message, rang });
      if (etat.index >= etat.morceaux.length - 1) break;
      etat.index++;
    }
    return sorties;
  } finally {
    publierBoucles([]);
  }
}
afterEach(() => { delete (globalThis as any).window; });

describe("Fabriquer un corpus", () => {
  it("rend une pièce par passe, le corpus commencé à chaque passe, et son empreinte à la dernière", async () => {
    const s = await mener(3);
    expect(s.map((x) => x.rang)).toEqual(["1", "2", "3"]);
    expect(s.map((x) => x.corpus?.pieces.length)).toEqual([1, 2, 3]);
    expect(s.map((x) => x.corpus?.enCours ?? null)).toEqual([{ piece: 1, pieces: 3 }, { piece: 2, pieces: 3 }, null]);
    expect(s.map((x) => x.message.replace(/[0-9a-f]{8}$/, "…"))).toEqual(["pièce 1/3", "pièce 2/3", "3 pièces · empreinte …"]);
    const corpus = s[2].corpus!;
    expect(corpus.pieces.map((p) => p.source)).toEqual(["piece-001", "piece-002", "piece-003"]);
    expect(corpus.pieces.map((p) => p.sequence.notes[0].note)).toEqual([72, 73, 74]);
    expect(corpus.pieces[0].tonalite).toMatchObject({ tonique: 0, mode: "majeur" });
    expect(s[2].journal.split("\n")).toHaveLength(3);
    expect(s[2].journal.split("\n")[0]).toBe("piece-001 · 16 notes · 4 voix · Do majeur · aucun fichier");
  });

  it("donne la même empreinte au même corpus, et une autre à un autre", async () => {
    const a = (await mener(3)).at(-1)!.message;
    const b = (await mener(3)).at(-1)!.message;
    expect(a).toBe(b);
    expect((await mener(2)).at(-1)!.message).not.toBe(a);
    expect(empreinteCorpus("a")).not.toBe(empreinteCorpus("b"));
  });

  it("écrit chaque pièce en MIDI, une piste par voix, et refuse sans écraser un fichier qui existe", async () => {
    const ecrits = new Map<string, Uint8Array>();
    (globalThis as any).window = { api: {
      ecrireFichier: async (chemin: string, donnees: Uint8Array) => { ecrits.set(chemin, donnees); return chemin; },
      lireDossier: async () => [{ nom: "piece-002.mid", chemin: "D:/sortie/piece-002.mid" }],
    } };
    const s = await mener(3, { Format: "midi", Dossier: "D:/sortie" });
    expect([...ecrits.keys()]).toEqual(["D:/sortie/piece-001.mid", "D:/sortie/piece-003.mid"]);
    const relue = sequenceDepuisMidiParPiste(ecrits.get("D:/sortie/piece-001.mid")!);
    expect(relue.sequence.voix).toHaveLength(4);
    const lignes = s.at(-1)!.journal.split("\n");
    expect(lignes[1]).toBe("piece-002 · 16 notes · 4 voix · Do♯ majeur · non écrite : existe déjà · piece-002.mid");
    expect(s.at(-1)!.corpus!.pieces.map((p) => p.source)).toEqual(["piece-001.mid", "piece-002", "piece-003.mid"]);
  });

  it("dit une écriture refusée dans le journal, sans perdre la pièce", async () => {
    (globalThis as any).window = { api: { ecrireFichier: async () => false, lireDossier: async () => [] } };
    const s = await mener(1, { Format: "musicxml", Dossier: "D:/sortie" });
    expect(s[0].journal).toMatch(/· non écrite : /);
    expect(s[0].corpus!.pieces).toHaveLength(1);
  });
});
