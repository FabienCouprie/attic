// plugins/corpus-dossier.test.ts — La boucle qui fabrique un corpus, menée sur un dossier de fichiers MIDI.
//
// Le pont de l'application de bureau est simulé : un dossier de six fichiers, dont trois que la
// lecture doit écarter et un qui n'est pas du MIDI. Les deux nœuds sont menés comme le pilote les
// mène, passe par passe, l'état de la boucle posé avant chaque passe.

import { afterEach, describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable, type Lancer } from "../audio/lancer-fiche";
import { sequenceVersMidiParVoix } from "../audio/corpus-midi";
import type { Corpus } from "../audio/corpus";
import type { Note } from "../audio/note";
import type { Sequence } from "../audio/sequence";
import { francais } from "../docs/detecteur-francais";
import { FICHE_CORPUS_DEBUT, FICHE_CORPUS_FIN, publierBoucles } from "./boucleSequencesGlobal";
import { fichiersMidi, memeDossier } from "./corpus-dossier";

/** La langue de l'interface, lue par `langueCourante` dans le stockage local. */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

const debut = registre.trouverDef(FICHE_CORPUS_DEBUT) as unknown as FicheLancable;
const fin = registre.trouverDef(FICHE_CORPUS_FIN) as unknown as FicheLancable;
const separer = registre.trouverDef("separer-voix") as unknown as FicheLancable;

/** Des accords de deux notes, un par demi-seconde, sur une voix. */
const accords = (voix: number, hauteurs: [number, number][]): Note[] =>
  hauteurs.flatMap(([a, b], i) => [a, b].map((note) => ({ note, velocite: 80, debut: i * 0.5, fin: (i + 1) * 0.5, voix })));

/** Une pièce de piano à deux pistes, chaque main jouant des accords : quatre lignes en tout. */
const PIANO: Sequence = {
  tempo: 120,
  notes: [
    ...accords(0, [[72, 76], [74, 77], [76, 79], [77, 81]]),
    ...accords(1, [[48, 55], [50, 57], [52, 59], [53, 60]]),
  ],
};
const MELODIE: Sequence = {
  tempo: 120,
  notes: [60, 62, 64].map((note, i) => ({ note, velocite: 80, debut: i * 0.5, fin: (i + 1) * 0.5, voix: 0 })),
};

/** Un fichier MIDI valide qui ne porte aucune note. */
const SANS_NOTE = new Uint8Array(writeMidi({
  header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
  tracks: [[{ deltaTime: 0, meta: true, type: "endOfTrack" }]],
} as never));

/** Le dossier simulé : ce que `lireDossier` rend, et ce que `lireBinaire` rend de chaque fichier. */
async function dossierSatie(): Promise<{ liste: { nom: string; chemin: string }[]; octets: Map<string, Uint8Array | null> }> {
  const fichiers: [string, Uint8Array | null][] = [
    ["b.MIDI", await sequenceVersMidiParVoix(MELODIE)],
    ["vide.mid", SANS_NOTE],
    ["a.mid", await sequenceVersMidiParVoix(PIANO)],
    ["notes.txt", new Uint8Array([1])],
    ["casse.mid", new Uint8Array([1, 2, 3, 4])],
    ["absent.mid", null],
  ];
  return {
    liste: fichiers.map(([nom]) => ({ nom, chemin: `D:/satie/${nom}` })),
    octets: new Map(fichiers.map(([nom, o]) => [`D:/satie/${nom}`, o])),
  };
}

/** Un pont qui lit le dossier simulé et garde ce qu'on lui fait écrire. */
async function pont(): Promise<{ api: Record<string, unknown>; ecrits: Map<string, Uint8Array> }> {
  const { liste, octets } = await dossierSatie();
  const ecrits = new Map<string, Uint8Array>();
  return {
    ecrits,
    api: {
      lireDossier: async (d: string) => (d === "D:/satie" ? liste : []),
      lireBinaire: async (chemin: string) => {
        const o = octets.get(chemin);
        return o ? { donnees: o, nom: chemin.split("/").pop() } : null;
      },
      ecrireFichier: async (chemin: string, donnees: Uint8Array) => { ecrits.set(chemin, donnees); return chemin; },
    },
  };
}

/** Ce que le pilote fait : l'état posé, la passe de découverte, puis les suivantes. */
async function mener(
  api: Record<string, unknown>, reglagesFin: Record<string, string | number> = {},
  corps: (s: Sequence) => Promise<unknown> = async (s) => s,
): Promise<{ debut: Lancer; fin: Lancer }[]> {
  (globalThis as any).window = { api };
  const etat = { debutId: "essai", finsIds: ["essai"], index: 0, morceaux: [] as unknown[], recoltes: [] as unknown[] };
  publierBoucles([etat]);
  const passes: { debut: Lancer; fin: Lancer }[] = [];
  try {
    for (;;) {
      const d = await lancerFiche(debut, { Source: "dossier", Dossier: "D:/satie" }, { entrees: [] });
      const sequence = d.valeurs[1] as Sequence | null;
      const f = await lancerFiche(fin, reglagesFin, { entrees: [sequence ? await corps(sequence) : null, d.valeurs[0]] });
      passes.push({ debut: d, fin: f });
      if (etat.index >= etat.morceaux.length - 1) break;
      etat.index++;
    }
    return passes;
  } finally {
    publierBoucles([]);
  }
}

const corpusDe = (passes: { fin: Lancer }[]) => passes.at(-1)!.fin.valeurs[0] as Corpus;
const journalDe = (passes: { fin: Lancer }[]) => String(passes.at(-1)!.fin.valeurs[1]).split("\n");

afterEach(() => { delete (globalThis as any).window; });

describe("Fabriquer un corpus sur un dossier de fichiers MIDI", () => {
  it("garde les fichiers .mid et .midi, dans l'ordre alphabétique français", () => {
    const liste = ["Zeta.mid", "notes.txt", "élan.MIDI", "alpha.mid", "sans-extension"].map((nom) => ({ nom, chemin: `D:/x/${nom}` }));
    expect(fichiersMidi(liste).map((f) => f.nom)).toEqual(["alpha.mid", "élan.MIDI", "Zeta.mid"]);
    expect(fichiersMidi(null)).toEqual([]);
  });

  it("fait une passe par fichier lisible, rend sa séquence et son nom, et nomme les fichiers écartés", async () => {
    const { api } = await pont();
    const passes = await mener(api);
    expect(passes).toHaveLength(2);
    expect(passes.map((p) => p.debut.valeurs[0])).toEqual(["1", "2"]);
    expect(passes.map((p) => p.debut.valeurs[2])).toEqual(["a.mid", "b.MIDI"]);
    const [a, b] = passes.map((p) => p.debut.valeurs[1] as Sequence);
    // UNE VOIX PAR PISTE : la pièce de piano en a deux, chacune avec ses accords.
    expect(a.notes).toHaveLength(16);
    expect(new Set(a.notes.map((n) => n.voix)).size).toBe(2);
    expect(a.titre).toBe("a.mid");
    expect(b.notes.map((n) => n.note)).toEqual([60, 62, 64]);
    for (const p of passes) {
      const [premiere, ecartes] = p.debut.message.split("\n");
      expect(premiere).toMatch(/^pièce [12]\/2 · (a\.mid|b\.MIDI)$/);
      expect(ecartes).toMatch(/^3 fichiers écartés : absent\.mid · illisible, casse\.mid · illisible : .+, vide\.mid · aucune note$/);
    }
    expect(passes.every((p) => !p.debut.erreurRendue && !p.fin.erreurRendue)).toBe(true);
  });

  it("donne à chaque pièce du corpus le nom de son fichier, après le préfixe, ou seul sous un préfixe vide", async () => {
    const { api } = await pont();
    expect(corpusDe(await mener(api)).pieces.map((p) => p.source)).toEqual(["piece-a", "piece-b"]);
    expect(corpusDe(await mener(api, { "Préfixe": "" })).pieces.map((p) => p.source)).toEqual(["a", "b"]);
    expect(corpusDe(await mener(api, { "Préfixe": "satie" })).pieces.map((p) => p.source)).toEqual(["satie-a", "satie-b"]);
  });

  it("rend un corpus à quatre voix d'une pièce à deux pistes d'accords, passée par « Séparer les voix »", async () => {
    const { api } = await pont();
    const passes = await mener(api, {}, async (s) => (await lancerFiche(separer, { "Voix au maximum": 4 }, { entrees: [s] })).valeurs[0]);
    const corpus = corpusDe(passes);
    expect(corpus.enCours).toBeUndefined();
    expect(corpus.pieces.map((p) => new Set(p.sequence.notes.map((n) => n.voix)).size)).toEqual([4, 1]);
    expect(journalDe(passes)[0]).toMatch(/^piece-a · 16 notes · 4 voix · .+ · aucun fichier$/);
  });

  it("écrit chaque pièce sous le nom de son fichier, et jamais dans le dossier des fichiers lus", async () => {
    const ailleurs = await pont();
    const passes = await mener(ailleurs.api, { Format: "midi", Dossier: "D:/sortie", "Préfixe": "" });
    expect([...ailleurs.ecrits.keys()]).toEqual(["D:/sortie/a.mid", "D:/sortie/b.mid"]);
    expect(corpusDe(passes).pieces.map((p) => p.source)).toEqual(["a.mid", "b.mid"]);

    // LE DOSSIER LU, écrit autrement : casse, sens des séparateurs, séparateur final.
    const meme = await pont();
    const refusees = await mener(meme.api, { Format: "midi", Dossier: "d:\\Satie\\", "Préfixe": "", "Si le fichier existe": "ecraser" });
    expect(meme.ecrits.size).toBe(0);
    expect(journalDe(refusees).map((l) => l.split(" · ").at(-1))).toEqual([
      "non écrite : c'est le dossier des fichiers lus", "non écrite : c'est le dossier des fichiers lus",
    ]);
    expect(corpusDe(refusees).pieces).toHaveLength(2);
  });

  it("refuse sans dossier, sans application de bureau, sur un dossier illisible ou sans fichier lisible", async () => {
    const message = async (reglages: Record<string, string>, api?: Record<string, unknown>) => {
      if (api) (globalThis as any).window = { api };
      const r = await lancerFiche(debut, { Source: "dossier", ...reglages }, { entrees: [] });
      expect(r.erreurRendue).toBe(true);
      // « Audio » en dernier : la sortie que tout composant à séquence reçoit (`sortie-audio.ts`).
      expect(r.valeurs).toEqual([null, null, null, null]);
      return r.message;
    };
    expect(await message({})).toBe("Aucun dossier choisi.");
    expect(await message({ Dossier: "D:/satie" })).toBe("Lire un dossier demande l'application de bureau.");
    const lire = { lireBinaire: async () => null };
    expect(await message({ Dossier: "D:/rien" }, { ...lire, lireDossier: async () => null })).toBe("Dossier illisible : D:/rien");
    expect(await message({ Dossier: "D:/x" }, { ...lire, lireDossier: async () => [{ nom: "seul.mid", chemin: "D:/x/seul.mid" }] }))
      .toBe("Aucun fichier MIDI lisible dans ce dossier.\n1 fichier écarté : seul.mid · illisible");
  });

  it("garde le nombre de pièces sous « Nombre de pièces », ses deux sorties neuves vides", async () => {
    const r = await lancerFiche(debut, { "Pièces": 3 }, { entrees: [] });
    expect(r.valeurs).toEqual(["1", null, null, null]);
    expect(r.message).toBe("pièce 1/3");
  });

  it("parle anglais dans l'interface anglaise, messages, journal et refus", async () => {
    const { api } = await pont();
    const passes = await avecLangue("en", () => mener(api, { Format: "midi", Dossier: "d:\\Satie\\" }));
    expect(passes[0].debut.message.split("\n")).toEqual([
      "piece 1/2 · a.mid",
      expect.stringMatching(/^3 files left out : absent\.mid · unreadable, casse\.mid · unreadable : .+, vide\.mid · no note$/),
    ]);
    expect(journalDe(passes).at(-1)).toMatch(/· not written: this is the folder being read$/);
    const refus = await avecLangue("en", async () => {
      delete (globalThis as any).window;
      return (await lancerFiche(debut, { Source: "dossier", Dossier: "D:/satie" }, { entrees: [] })).message;
    });
    expect(refus).toBe("Reading a folder requires the desktop application.");
    const lignes = [...passes.flatMap((p) => [p.debut.message, p.fin.message]), ...journalDe(passes), refus]
      .flatMap((m) => m.split("\n"));
    expect(lignes.filter((l) => francais(l))).toEqual([]);
  });

  it("tient deux dossiers pour le même quels que soient la casse et les séparateurs, et pas un sous-dossier", () => {
    expect(memeDossier("D:\\corpus satie\\", "d:/Corpus Satie")).toBe(true);
    expect(memeDossier("D:/corpus satie/sortie", "D:/corpus satie")).toBe(false);
  });
});
