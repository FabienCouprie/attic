// plugins/boucle-voix.test.ts — Une boucle dont le compte vient d'une valeur.
//
// CE QUI EST NOUVEAU ET CE QUI EST ÉPROUVÉ. Les trois répétitions du projet connaissaient leur
// compte avant d'exécuter quoi que ce soit ; celle-ci le découvre en exécutant. Le test rejoue donc
// ce que le pilote fait : poser l'état ambiant, lancer une passe, lire ce qui a été découvert,
// poursuivre. Ce qui se vérifie est que la découverte a bien lieu à la première passe, qu'elle n'a
// lieu qu'une fois, et que la fin ne réunit qu'à la dernière.
//
// LE PILOTE LUI-MÊME N'EST PAS ICI, étant un hook React que le dépôt n'a pas de quoi rendre. Ce
// qu'il fait tient en quatre gestes, reproduits tels quels ci-dessous ; ce qui reste de lui est la
// plomberie de cache et d'annulation, commune au lot déjà en place.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import {
  boucleCourante, planifierBoucle, publierBoucle, passesRestantes,
  FICHE_BOUCLE_DEBUT, FICHE_BOUCLE_FIN,
} from "./boucleSequencesGlobal";
import { fiches as fichesBoucle } from "./boucle-voix";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesVoix } from "./voix";
import { fiches as fichesFormule } from "./formule-sequence";

const debut = fichesBoucle.find((f) => f.id === FICHE_BOUCLE_DEBUT)!;
const fin = fichesBoucle.find((f) => f.id === FICHE_BOUCLE_FIN)!;
const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const reunir = fichesVoix.find((f) => f.id === "reunir-voix")!;
const formule = fichesFormule.find((f) => f.id === "formule-sequence")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

async function jouer(arbre: string, hauteurs: string): Promise<Sequence> {
  const r = await rythme.executer(contexte([arbre, hauteurs, null], { Tempo: 120 }) as any);
  return r.valeurs[0] as unknown as Sequence;
}

/** Une polyphonie de trois lignes. */
async function troisVoix(): Promise<Sequence> {
  const r = await reunir.executer(contexte([
    await jouer("(4/4 (1 1 1 1))", "72 74 76 77"),
    await jouer("(4/4 (1 1 1 1))", "60 62 64 65"),
    await jouer("(4/4 (1 1 1 1))", "48 50 52 53"),
  ]) as any);
  return r.valeurs[0] as unknown as Sequence;
}

/**
 * Ce que le pilote fait, reproduit : poser l'état, une passe de découverte, puis les suivantes.
 *
 * `corps` est la chaîne posée entre le début et la fin de boucle.
 */
async function mener(
  entree: Sequence, corps: (voix: Sequence, passe: number) => Promise<Sequence> | Sequence,
): Promise<{ sortie: Sequence | null; passes: number; messages: string[] }> {
  const etat = { debutId: "n1", finsIds: ["n1"], index: 0, morceaux: [] as Sequence[], recoltes: [] as Sequence[] };
  publierBoucle(etat);
  const messages: string[] = [];
  let sortie: Sequence | null = null;
  try {
    let passes = 0;
    for (;;) {
      const d = await debut.executer(contexte([entree]) as any);
      messages.push(String(d.message ?? ""));
      const voix = d.valeurs[0] as unknown as Sequence;
      const traitee = await corps(voix, etat.index);
      const f = await fin.executer(contexte([traitee]) as any);
      sortie = f.valeurs[0] as unknown as Sequence | null;
      passes++;
      if (etat.index >= etat.morceaux.length - 1) break;
      etat.index++;
    }
    return { sortie, passes, messages };
  } finally {
    publierBoucle(null);
  }
}

describe("la planification", () => {
  it("TROUVE UN DÉBUT DE BOUCLE, et ne dit PAS combien de passes", () => {
    const plan = planifierBoucle([{ id: "a", data: { ficheId: FICHE_BOUCLE_DEBUT } }]);
    expect(plan).toEqual({ debutId: "a", finsIds: [], plusieursDebuts: false });
    // Le compte n'existe pas encore : c'est toute la différence avec la planification d'un lot.
    expect(Object.keys(plan ?? {})).not.toContain("passes");
  });

  it("sans début de boucle, il n'y a rien à mener", () => {
    expect(planifierBoucle([{ id: "a", data: { ficheId: "autre" } }])).toBeNull();
  });

  it("DEUX DÉBUTS SONT SIGNALÉS, un seul commandant", () => {
    const plan = planifierBoucle([
      { id: "a", data: { ficheId: FICHE_BOUCLE_DEBUT } },
      { id: "b", data: { ficheId: FICHE_BOUCLE_DEBUT } },
    ]);
    expect(plan?.plusieursDebuts).toBe(true);
    expect(plan?.debutId).toBe("a");
  });

  it("les passes restantes se comptent après la découverte", () => {
    expect(passesRestantes(null)).toBe(0);
    expect(passesRestantes({ debutId: "d", finsIds: [], index: 0, morceaux: [], recoltes: [] })).toBe(0);
    const trois = [1, 2, 3].map(() => ({ notes: [] }) as unknown as Sequence);
    expect(passesRestantes({ debutId: "d", finsIds: [], index: 0, morceaux: trois, recoltes: [] })).toBe(2);
  });
});

describe("la découverte", () => {
  it("A LIEU À LA PREMIÈRE PASSE, et le compte en sort", async () => {
    const poly = await troisVoix();
    const etat = { debutId: "n1", finsIds: ["n1"], index: 0, morceaux: [] as Sequence[], recoltes: [] as Sequence[] };
    publierBoucle(etat);
    try {
      expect(etat.morceaux).toHaveLength(0);
      await debut.executer(contexte([poly]) as any);
      expect(etat.morceaux).toHaveLength(3);
    } finally {
      publierBoucle(null);
    }
  });

  it("N'A LIEU QU'UNE FOIS : une entrée qui changerait ne ferait pas varier le compte", async () => {
    const poly = await troisVoix();
    const etat = { debutId: "n1", finsIds: ["n1"], index: 0, morceaux: [] as Sequence[], recoltes: [] as Sequence[] };
    publierBoucle(etat);
    try {
      await debut.executer(contexte([poly]) as any);
      // Une seconde passe sur une séquence à une seule voix : le compte ne doit pas retomber à un.
      await debut.executer(contexte([await jouer("(4/4 (1 1))", "60 62")]) as any);
      expect(etat.morceaux).toHaveLength(3);
    } finally {
      publierBoucle(null);
    }
  });

  it("UNE SÉQUENCE SANS VOIX EN COMPTE UNE, et la boucle fait une passe", async () => {
    const une = await jouer("(4/4 (1 1 1 1))", "60 62 64 65");
    const r = await mener(une, (v) => v);
    expect(r.passes).toBe(1);
    expect(r.sortie?.notes).toHaveLength(4);
  });
});

describe("la boucle menée de bout en bout", () => {
  it("LE GRAPHE TOURNE UNE FOIS PAR VOIX", async () => {
    const vues: number[] = [];
    const r = await mener(await troisVoix(), (voix, passe) => { vues.push(passe); return voix; });
    expect(r.passes).toBe(3);
    expect(vues).toEqual([0, 1, 2]);
  });

  it("CHAQUE PASSE REÇOIT SA VOIX, une seule, sans numéro", async () => {
    const recues: number[][] = [];
    await mener(await troisVoix(), (voix) => {
      recues.push(voix.notes.map((n) => n.note));
      expect(voix.notes.every((n) => n.voix === undefined)).toBe(true);
      return voix;
    });
    expect(recues).toEqual([[72, 74, 76, 77], [60, 62, 64, 65], [48, 50, 52, 53]]);
  });

  it("LA FIN NE RÉUNIT QU'À LA DERNIÈRE PASSE", async () => {
    const tailles: number[] = [];
    const r = await mener(await troisVoix(), (voix) => voix);
    tailles.push(r.sortie?.notes.length ?? 0);
    expect(tailles).toEqual([12]);
    expect(r.sortie?.voix).toHaveLength(3);
  });

  it("CE QUE LA CHAÎNE FAIT À CHAQUE VOIX SE RETROUVE DANS LA RÉUNION", async () => {
    // Chaque voix est montée d'une octave de plus que la précédente.
    const r = await mener(await troisVoix(), async (voix, passe) => {
      const f = await formule.executer(
        contexte([voix], { Hauteur: `note + ${12 * (passe + 1)}` }) as any,
      );
      return f.valeurs[0] as unknown as Sequence;
    });
    const parVoix = (v: number) => r.sortie!.notes.filter((n) => n.voix === v).map((n) => n.note);
    expect(parVoix(0)).toEqual([84, 86, 88, 89]);
    expect(parVoix(1)).toEqual([84, 86, 88, 89]);
    expect(parVoix(2)).toEqual([84, 86, 88, 89]);
  });

  it("UNE CHAÎNE QUI FILTRE PEUT VIDER UNE VOIX, qui disparaît sans faire de portée muette", async () => {
    const r = await mener(await troisVoix(), async (voix, passe) => {
      if (passe !== 1) return voix;
      const f = await formule.executer(contexte([voix], { Condition: "note > 999" }) as any);
      return (f.valeurs[0] as unknown as Sequence) ?? { notes: [], tempo: 120 };
    });
    expect(r.sortie?.voix).toHaveLength(2);
  });
});

describe("hors d'une boucle", () => {
  it("LA FIN LAISSE PASSER CE QU'ELLE REÇOIT, plutôt que de rester muette", async () => {
    publierBoucle(null);
    const une = await jouer("(4/4 (1 1))", "60 62");
    const r = await fin.executer(contexte([une]) as any);
    expect((r.valeurs[0] as unknown as Sequence).notes).toHaveLength(2);
    expect(boucleCourante()).toBeNull();
  });

  it("le début rend la première voix, la boucle n'ayant pas commencé", async () => {
    publierBoucle(null);
    const r = await debut.executer(contexte([await troisVoix()]) as any);
    expect((r.valeurs[0] as unknown as Sequence).notes.map((n) => n.note)).toEqual([72, 74, 76, 77]);
  });

  it("rien de branché le dit au lieu de rendre une séquence vide", async () => {
    expect((await debut.executer(contexte([null]) as any)).erreur).toBe(true);
    expect((await fin.executer(contexte([null]) as any)).erreur).toBe(true);
  });
});
