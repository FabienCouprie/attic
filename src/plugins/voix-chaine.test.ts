// plugins/voix-chaine.test.ts — Le triolet traverse-t-il la chaîne sur un seul câble ?
//
// CE QUE CETTE CHAÎNE PROUVE. Une suite de durées ne dit pas qu'un tiers de temps est un triolet :
// la gravure qui n'a que des secondes ramène tout sur une grille binaire et écrit trois durées
// approchées. L'arbre le dit, et il voyageait sur un port séparé qu'il fallait brancher en plus.
// Le contrôle porte donc sur le n-olet gravé, qui est présent ou absent, et non sur une durée qu'il
// faudrait interpréter.
//
// ET CE QU'ELLE PROUVE SURTOUT. Qu'une écriture qui ne décrit plus les notes est ÉCARTÉE. Un arbre
// périmé gravé tel quel donne une partition fausse qui paraît juste, ce qui est pire que pas de
// partition du tout.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesQuantification } from "./quantification";
import { fiches as fichesTheorie } from "./theorie-composition";
import { fiches as fichesFormes } from "./sequence-formes";
import { fiches as fichesAnalyse } from "./analyse";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const quantifier = fichesQuantification.find((f) => f.id === "quantifier-rythme")!;
const voicings = fichesTheorie.find((f) => f.id === "voicings-accords")!;
const filtre = fichesFormes.find((f) => f.id === "filtre-sequence")!;
const musicxml = fichesAnalyse.find((f) => f.id === "musicxml")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const AVEC_TRIOLET = "(4/4 (1 (1 (1 1 1)) 1 1))";

/** La séquence que le nœud de rythme produit pour un arbre donné. */
async function jouer(texte: string): Promise<Sequence> {
  const res = await rythme.executer(
    contexte([texte, "60 62 64 65 67 69", null], { Tempo: 120 }) as any,
  );
  return res.valeurs[0] as unknown as Sequence;
}

/** Grave une séquence SANS brancher le port Arbre : tout doit passer par la séquence. */
const graver = (sequence: Sequence) =>
  musicxml.executer(contexte([null, sequence, null], { Tempo: 120 }) as any);

const compterNolets = (xml: string) => [...xml.matchAll(/<tuplet type="start"/g)].length;

describe("l'écriture voyage avec les notes", () => {
  it("LA SÉQUENCE PORTE SON ARBRE dès le nœud qui la produit", async () => {
    const s = await jouer(AVEC_TRIOLET);
    expect(s.arbre).toBe(AVEC_TRIOLET);
  });

  it("LE TRIOLET EST GRAVÉ SANS BRANCHER LE PORT ARBRE", async () => {
    const res = await graver(await jouer(AVEC_TRIOLET));
    expect(compterNolets(res.valeurs[0] as string)).toBe(1);
    expect(res.message).toContain("porté par la séquence");
  });

  it("SANS L'ARBRE, LE MÊME PASSAGE PERD SON TRIOLET : c'est ce que l'arbre apporte", async () => {
    const s = await jouer(AVEC_TRIOLET);
    const res = await graver({ ...s, arbre: undefined });
    expect(compterNolets(res.valeurs[0] as string)).toBe(0);
  });

  it("LE PORT ARBRE RESTE PRIORITAIRE quand on le branche exprès", async () => {
    const s = await jouer(AVEC_TRIOLET);
    const res = await musicxml.executer(
      contexte([null, s, "(4/4 (1 1 1 1))"], { Tempo: 120 }) as any,
    );
    expect(compterNolets(res.valeurs[0] as string)).toBe(0);
    expect(res.message).toContain("entrée Arbre");
  });

  it("LE QUANTIFICATEUR REND AUSSI UNE SÉQUENCE ÉCRITE, gravable d'un seul câble", async () => {
    const jouee = await jouer(AVEC_TRIOLET);
    const q = await quantifier.executer(contexte([jouee], { Compromis: 35 }) as any);
    const requantifiee = q.valeurs[1] as unknown as Sequence;
    expect(requantifiee.arbre).toBe(AVEC_TRIOLET);
    expect(compterNolets((await graver(requantifiee)).valeurs[0] as string)).toBe(1);
  });
});

describe("ce qui garde l'écriture et ce qui la perd", () => {
  it("UNE TRANSFORMATION DE HAUTEURS LA GARDE : les attaques n'ont pas bougé", async () => {
    const s = await jouer(AVEC_TRIOLET);
    const res = await voicings.executer(contexte([null, s], { Renversement: 1 }) as any);
    const apres = res.valeurs[2] as unknown as Sequence;
    expect(apres.arbre).toBe(AVEC_TRIOLET);
    expect(compterNolets((await graver(apres)).valeurs[0] as string)).toBe(1);
  });

  it("UN FILTRE QUI RETIRE DES NOTES NE LA TRANSMET PAS", async () => {
    const s = await jouer(AVEC_TRIOLET);
    const res = await filtre.executer(
      contexte([s], { "Hauteur minimale": 64 }) as any,
    );
    const gardees = res.valeurs[0] as unknown as Sequence;
    expect(gardees.notes.length).toBeLessThan(s.notes.length);
    expect(gardees.arbre).toBeUndefined();
  });

  it("UNE ÉCRITURE PÉRIMÉE POSÉE DE FORCE EST REFUSÉE À LA GRAVURE", async () => {
    // Le cas qu'aucun nœud ne produit, et contre lequel la gravure doit tenir seule : un champ
    // rempli à la main avec l'arbre d'avant une transformation.
    const s = await jouer(AVEC_TRIOLET);
    const truquee: Sequence = {
      ...s, arbre: AVEC_TRIOLET,
      notes: s.notes.map((n, i) => (i === 2 ? { ...n, debut: n.debut + 0.07 } : n)),
    };
    const res = await graver(truquee);
    expect(compterNolets(res.valeurs[0] as string)).toBe(0);
    expect(res.message).not.toContain("porté par la séquence");
  });
});
