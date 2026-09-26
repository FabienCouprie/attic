// plugins/maquette-chaine.test.ts — Une boîte posée sur la ligne de temps s'y plie-t-elle ?
//
// CE QUE CE FICHIER ÉPROUVE. Un placement se vérifie sur des instants, qui sont des nombres : la
// boîte commence-t-elle où on l'a posée, dure-t-elle ce qu'on lui a imposé, et son contenu a-t-il
// gardé ses rapports en s'y pliant. Ce dernier point est le seul qui ne se lise pas d'un coup
// d'oeil, et c'est celui qui décide qu'un étirement est musical plutôt qu'un déplacement de notes.
//
// ET CE QU'IL FIXE COMME LIMITE. L'écriture mesurée ne survit ni au déplacement ni à l'étirement.
// C'est une conséquence de ce qu'un arbre rythmique DIT, non un manque du placement, et un test
// vaut mieux qu'une phrase pour que personne n'aille l'y remettre.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesMaquette } from "./maquette";
import { fiches as fichesQuantification } from "./quantification";
import { fiches as fichesAnalyse } from "./analyse";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const maquette = fichesMaquette.find((f) => f.id === "maquette")!;
const quantifier = fichesQuantification.find((f) => f.id === "quantifier-rythme")!;
const musicxml = fichesAnalyse.find((f) => f.id === "musicxml")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const QUATRE_NOIRES = "(4/4 (1 1 1 1))";
const AVEC_TRIOLET = "(4/4 (1 (1 (1 1 1)) 1 1))";

async function jouer(texte: string, hauteurs = "60 62 64 65 67 69"): Promise<Sequence> {
  const res = await rythme.executer(contexte([texte, hauteurs, null], { Tempo: 120 }) as any);
  return res.valeurs[0] as unknown as Sequence;
}

/** La maquette avec deux boîtes, et les réglages qu'on lui donne. */
const poser = async (params: Record<string, string | number>, combien = 2) => {
  const entrees = [await jouer(QUATRE_NOIRES), await jouer(AVEC_TRIOLET)].slice(0, combien);
  const res = await maquette.executer(contexte(entrees, params) as any);
  return { sequence: res.valeurs[0] as unknown as Sequence, res };
};

describe("poser des boîtes sur la ligne de temps", () => {
  it("UNE BOÎTE COMMENCE OÙ ON L'A POSÉE", async () => {
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 5 });
    const voix1 = sequence.notes.filter((n) => n.voix === 1);
    expect(Math.min(...voix1.map((n) => n.debut))).toBeCloseTo(5, 9);
  });

  it("LES BOÎTES SE SUPERPOSENT, elles ne se chassent pas", async () => {
    // Deux boîtes de deux secondes posées toutes deux à zéro : dix notes sonnent ensemble.
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 0 });
    expect(sequence.notes).toHaveLength(10);
    expect(sequence.duree).toBeCloseTo(2, 9);
  });

  it("LA DURÉE VA AU BOUT DE LA DERNIÈRE BOÎTE, non à sa dernière note", async () => {
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 10 });
    expect(sequence.duree).toBeCloseTo(12, 9);
  });
});

describe("l'étirement garde les rapports", () => {
  it("UNE BOÎTE ÉTIRÉE DURE CE QU'ON LUI IMPOSE", async () => {
    const { sequence, res } = await poser({ "Début 1": 0, "Durée 1": 6, "Début 2": 20 }, 1);
    expect(res.valeurs[1]).toContain("×3.000");
    const notes = sequence.notes;
    expect(Math.max(...notes.map((n) => n.fin))).toBeCloseTo(6, 9);
  });

  it("LES RAPPORTS DU RYTHME SONT GARDÉS, c'est la pulsation qui change", async () => {
    // Quatre noires étirées de deux à six secondes : chaque note dure trois fois plus et tombe
    // trois fois plus loin. Un étirement qui déplacerait les notes sans les allonger romprait ce
    // rapport, et le rythme ne serait plus le même.
    const nature = (await poser({ "Début 1": 0, "Durée 1": 0 }, 1)).sequence.notes;
    const etiree = (await poser({ "Début 1": 0, "Durée 1": 6 }, 1)).sequence.notes;
    expect(etiree).toHaveLength(nature.length);
    nature.forEach((n, i) => {
      expect(etiree[i].debut).toBeCloseTo(n.debut * 3, 9);
      expect(etiree[i].fin - etiree[i].debut).toBeCloseTo((n.fin - n.debut) * 3, 9);
    });
  });

  it("UNE DURÉE NULLE LAISSE LA BOÎTE TELLE QUELLE", async () => {
    const { res } = await poser({ "Début 1": 0, "Durée 1": 0 }, 1);
    expect(res.valeurs[1]).toContain("durée propre");
  });
});

describe("la transposition", () => {
  it("DÉPLACE LES HAUTEURS DE LA SEULE BOÎTE, quarts de ton compris", async () => {
    const avant = (await poser({ "Début 1": 0, "Début 2": 5 })).sequence;
    const apres = (await poser({ "Début 1": 0, "Début 2": 5, "Transposition 2": 7.5 })).sequence;
    const premiere = (s: Sequence) => s.notes.filter((n) => n.voix === 0).map((n) => n.note);
    const seconde = (s: Sequence) => s.notes.filter((n) => n.voix === 1).map((n) => n.note);
    expect(premiere(apres)).toEqual(premiere(avant));
    expect(seconde(apres)).toEqual(seconde(avant).map((h) => h + 7.5));
  });
});

describe("les voix et la gravure", () => {
  it("UNE VOIX PAR BOÎTE grave autant de portées, une fois le résultat quantifié", async () => {
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 2 });
    expect(new Set(sequence.notes.map((n) => n.voix))).toEqual(new Set([0, 1]));
    const q = await quantifier.executer(contexte([sequence], { Compromis: 35 }) as any);
    expect(q.valeurs[0]).toBeTruthy();
  });

  it("SANS CE RÉGLAGE, tout se fond en une seule ligne", async () => {
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 2, "Une voix par boîte": "non" });
    expect(sequence.notes.every((n) => n.voix === undefined)).toBe(true);
    expect(sequence.voix).toBeUndefined();
  });
});

describe("ce que la maquette ne garde pas, et qui se retrouve", () => {
  it("L'ÉCRITURE NE SURVIT PAS AU DÉPLACEMENT, un arbre commençant au début", async () => {
    const seule = await jouer(AVEC_TRIOLET);
    expect(seule.arbre).toBe(AVEC_TRIOLET);
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 5 });
    expect(sequence.arbre).toBeUndefined();
    expect(sequence.voix?.every((v) => v.arbre === undefined)).toBe(true);
  });

  it("LA GRAVURE REPART DES DURÉES plutôt que d'écrire un rythme faux", async () => {
    const { sequence } = await poser({ "Début 1": 0, "Début 2": 2 });
    const xml = await musicxml.executer(contexte([null, sequence, null], { Tempo: 120 }) as any);
    expect(xml.valeurs[0]).toBeTruthy();
    expect(xml.message).not.toContain("porté par la séquence");
  });

  it("UNE ÉCRITURE SE RETROUVE EN QUANTIFIANT, et le triolet reparaît", async () => {
    // Une seule boîte, posée à zéro et gardant sa durée : quantifier la rend écrite de nouveau.
    const { sequence } = await poser({ "Début 1": 0, "Durée 1": 0 }, 1);
    const q = await quantifier.executer(contexte([sequence], { Compromis: 35 }) as any);
    expect(q.valeurs[0]).toBe(QUATRE_NOIRES);
  });
});

describe("ce qui ne doit pas casser", () => {
  it("aucune entrée branchée le dit au lieu de rendre une séquence vide", async () => {
    const res = await maquette.executer(contexte([null, null]) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
  });

  it("UNE SEULE BOÎTE SUFFIT, la maquette n'en exige pas deux", async () => {
    const { sequence } = await poser({ "Début 1": 3 }, 1);
    expect(sequence.notes).toHaveLength(4);
    expect(Math.min(...sequence.notes.map((n) => n.debut))).toBeCloseTo(3, 9);
  });
});
