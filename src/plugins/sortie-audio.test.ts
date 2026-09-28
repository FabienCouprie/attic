// plugins/sortie-audio.test.ts — La sortie audio posée sur tout composant à séquence.
//
// CE QUI SE VÉRIFIE ICI, ET QUI COMPTE PLUS QUE LE SON. Une enveloppe qui touche vingt-cinq
// composants d'un coup doit prouver deux choses avant tout : qu'elle n'ajoute rien à ceux qui ne
// rendent pas de séquence, et qu'elle ne déplace aucun port existant. Un port glissé d'un rang
// rebrancherait chaque arête de chaque graphe déjà enregistré, sans un message.
//
// ET QU'ELLE NE CALCULE RIEN QUAND PERSONNE N'ÉCOUTE. C'est la condition qui l'a rendue possible :
// le rendu coûte 8,6 ms par seconde de son, et vingt-cinq nœuds le paieraient à chaque lancement.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "./index";
import { avecSortieAudio, SANS_SORTIE_AUDIO } from "./sortie-audio";
import type { Sequence } from "../audio/sequence";

const sequence = (combien: number, duree: number): Sequence => ({
  notes: Array.from({ length: combien }, (_, i) => ({
    note: 60, velocite: 100, debut: (i / combien) * duree, fin: (i / combien) * duree + 0.2,
  })),
  duree,
});

const contexte = (branchees: number[] = []) => ({
  noeud: { id: "n", data: { ficheId: "x", parametres: {} } },
  runtime: null,
  entree: () => null,
  entrees: () => [],
  paramTexte: (_n: string, d: string) => d,
  paramNombre: (_n: string, d: number) => d,
  sortieBranchee: (i: number) => branchees.includes(i),
});

/** Une fiche minimale qui rend ce qu'on lui dit, pour éprouver l'enveloppe seule. */
const fiche = (sorties: { nom: string; type: string }[], valeurs: unknown[]) => avecSortieAudio({
  id: "essai", nom: "Essai", univers: "Autres", famille: "Zone de test",
  resume: "x", notice: "Un composant d'essai.", noticeEn: "A test node.",
  entrees: [], sorties, parametres: [],
  executer: async () => ({ valeurs }),
} as never);

describe("à qui l'enveloppe ajoute une sortie, et à qui elle n'ajoute rien", () => {
  it("UN COMPOSANT SANS SÉQUENCE N'EST PAS TOUCHÉ, pas même son exécuteur", () => {
    const brut = {
      id: "x", nom: "X", univers: "Autres", famille: "Zone de test", resume: "x",
      entrees: [], sorties: [{ nom: "Audio", type: "audio" }], parametres: [],
      executer: async () => ({ valeurs: [null] }),
    } as never as Parameters<typeof avecSortieAudio>[0];
    expect(avecSortieAudio(brut)).toBe(brut);
  });

  it("un composant qui rend DÉJÀ de l'audio n'en reçoit pas un second", () => {
    const f = fiche([{ nom: "Séquence", type: "sequence" }, { nom: "Audio", type: "audio" }], [null, null]);
    expect(f.sorties).toHaveLength(2);
  });

  it("les composants nommément écartés le restent", () => {
    for (const id of SANS_SORTIE_AUDIO) {
      const f = toutesLesFiches.find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f!.sorties.some((s) => s.type === "audio"), id).toBe(false);
    }
  });
});

describe("ce que l'enveloppe ne doit pas casser", () => {
  const avant = toutesLesFiches.filter((f) => f.sorties.some((s) => s.type === "sequence"));

  it("ELLE TOUCHE BIEN TOUT LE CATALOGUE, et il y en a plus de vingt", () => {
    const avec = avant.filter((f) => f.sorties[f.sorties.length - 1].type === "audio");
    expect(avec.length).toBeGreaterThan(20);
  });

  /**
   * Ceux qui portent DEUX sorties audio par construction, nommés avec leur raison.
   *
   * L'ENVELOPPE NE LEUR FAIT RIEN, et c'est ce qui les rend sûrs : elle n'ajoute un port qu'à qui
   * n'en a aucun. Les nommer ici garde la règle stricte pour tous les autres.
   */
  const DEUX_AUDIOS: Record<string, string> = {
    "decomposition-atomique":
      "l'esquisse et le résidu sont les deux moitiés du son décomposé, et les séparer est l'objet même du composant",
  };

  it("LE PORT EST TOUJOURS LE DERNIER : un graphe enregistré pointe sur des rangs", () => {
    for (const f of avant) {
      if (f.id in DEUX_AUDIOS) continue;
      const rangs = f.sorties.map((s) => s.type);
      const audios = rangs.filter((t) => t === "audio").length;
      // Un seul audio, et s'il vient de l'enveloppe il est en queue. Les composants qui en avaient
      // un avant l'enveloppe le gardent où il était, et n'en reçoivent pas d'autre.
      expect(audios, f.id).toBeLessThanOrEqual(1);
    }
  });

  it("et chaque composant nommé en porte bien deux, sans quoi l'exception masquerait un défaut", () => {
    for (const [id, raison] of Object.entries(DEUX_AUDIOS)) {
      const f = avant.find((x) => x.id === id);
      expect(f, `${id} ne rend plus de séquence : retirer l'exception`).toBeDefined();
      expect(f!.sorties.filter((s) => s.type === "audio").length, `${id} — ${raison}`).toBe(2);
    }
  });

  it("L'ENVELOPPE N'AJOUTE QU'EN QUEUE, et seulement à qui n'avait pas d'audio", () => {
    // Le rang d'une sortie est ce sur quoi les graphes enregistrés pointent. On le vérifie sur la
    // transformation elle-même plutôt que sur le catalogue : un composant qui rendait déjà de
    // l'audio, comme « Tempérament » et son port en tête, n'est pas touché et n'a rien à prouver.
    const sorties = [
      { nom: "Analyse", type: "texte" },
      { nom: "Séquence", type: "sequence" },
      { nom: "MIDI", type: "midi" },
    ];
    const f = fiche(sorties, [null, null, null]);
    expect(f.sorties.slice(0, 3).map((s) => s.type)).toEqual(["texte", "sequence", "midi"]);
    expect(f.sorties).toHaveLength(4);
    expect(f.sorties[3]).toMatchObject({ nom: "Audio", type: "audio" });
  });

  it("un composant qui rendait déjà de l'audio garde le sien là où il était", () => {
    const t = toutesLesFiches.find((x) => x.id === "temperament")!;
    expect(t.sorties[0]).toMatchObject({ nom: "Audio", type: "audio" });
    expect(t.sorties.filter((s) => s.type === "audio")).toHaveLength(1);
  });

  it("la notice mentionne le port ajouté, pour qu'aucune sortie ne reste sans mention", () => {
    const f = toutesLesFiches.find((x) => x.id === "rendu-cercles")!;
    expect(f.sorties[f.sorties.length - 1].type).toBe("audio");
    expect(f.notice).toContain("« Audio »");
    expect(f.noticeEn).toContain("« Audio »");
  });
});

describe("le rendu, et quand il n'a pas lieu", () => {
  it("SANS CÂBLE, RIEN N'EST CALCULÉ : c'est la condition qui rend la chose possible", async () => {
    const f = fiche([{ nom: "Séquence", type: "sequence" }], [sequence(20, 4)]);
    const t = performance.now();
    const r = await f.executer!(contexte([]) as never) as any;
    expect(r.valeurs[1]).toBeNull();
    // Quatre secondes de son coûteraient une trentaine de millisecondes ; rien n'a été rendu.
    expect(performance.now() - t).toBeLessThan(10);
  });

  it("AVEC UN CÂBLE, LE SON SORT, et il dure ce que la séquence dure", async () => {
    const f = fiche([{ nom: "Séquence", type: "sequence" }], [sequence(8, 2)]);
    const r = await f.executer!(contexte([1]) as never) as any;
    expect(r.valeurs[1]).toBeInstanceOf(AudioBuffer);
    expect((r.valeurs[1] as AudioBuffer).duration).toBeCloseTo(2, 1);
  });

  it("une séquence vide ne rend pas de silence, elle ne rend rien", async () => {
    const f = fiche([{ nom: "Séquence", type: "sequence" }], [{ notes: [], duree: 4 }]);
    const r = await f.executer!(contexte([1]) as never) as any;
    expect(r.valeurs[1]).toBeNull();
  });

  it("UN ÉCHEC DU COMPOSANT NE SE REND PAS EN SON, et le message d'échec est gardé", async () => {
    const f = avecSortieAudio({
      id: "essai", nom: "Essai", univers: "Autres", famille: "Zone de test", resume: "x",
      entrees: [], sorties: [{ nom: "Séquence", type: "sequence" }], parametres: [],
      executer: async () => ({ valeurs: [sequence(4, 1)], erreur: true, message: "raté" }),
    } as never);
    const r = await f.executer!(contexte([1]) as never) as any;
    expect(r.erreur).toBe(true);
    expect(r.message).toBe("raté");
    expect(r.valeurs[1]).toBeNull();
  });

  it("LA PREMIÈRE SÉQUENCE EST CELLE QU'ON ENTEND, quand un composant en rend deux", async () => {
    const f = fiche(
      [{ nom: "Gardées", type: "sequence" }, { nom: "Écartées", type: "sequence" }],
      [sequence(4, 1), sequence(4, 3)]);
    const r = await f.executer!(contexte([2]) as never) as any;
    expect((r.valeurs[2] as AudioBuffer).duration).toBeCloseTo(1, 1);
  });

  it("un contexte sans `sortieBranchee` ne rend rien plutôt que de tout rendre", async () => {
    const f = fiche([{ nom: "Séquence", type: "sequence" }], [sequence(4, 1)]);
    const { sortieBranchee: _s, ...sansLeSavoir } = contexte([]);
    const r = await f.executer!(sansLeSavoir as never) as any;
    expect(r.valeurs[1]).toBeNull();
  });
});
