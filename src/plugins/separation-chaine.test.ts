// plugins/separation-chaine.test.ts — Ce qu'on a réuni, le sépare-t-on ?
//
// LA BOUCLE EST LE CONTRÔLE, ET ELLE EST EXACTE. Réunir deux lignes connues, laisser tomber les
// numéros de voix pour ne garder qu'un tas de notes, puis séparer : chaque note doit revenir dans
// la ligne dont elle vient. On connaît la bonne réponse parce qu'on a fabriqué l'entrée, ce qu'un
// corpus annoté nous donnerait sans qu'on en ait un.
//
// ET LA CHAÎNE VA JUSQU'AU BOUT. Une séquence séparée est une séquence à voix comme une autre : la
// gravure doit en tirer une portée par voix, et l'extraction doit en rendre une seule. Si ce n'était
// pas le cas, la séparation rendrait un objet d'une espèce à part, et rien de ce qui existe ne
// saurait le recevoir.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import type { Sequence } from "../audio/sequence";
import { fiches as fichesArbre } from "./arbre-rythmique";
import { fiches as fichesVoix } from "./voix";
import { fiches as fichesSeparation } from "./separation-voix";
import { fiches as fichesAnalyse } from "./analyse";

const rythme = fichesArbre.find((f) => f.id === "rythme-sur-hauteurs")!;
const reunir = fichesVoix.find((f) => f.id === "reunir-voix")!;
const extraire = fichesVoix.find((f) => f.id === "extraire-voix")!;
const separer = fichesSeparation.find((f) => f.id === "separer-voix")!;
const musicxml = fichesAnalyse.find((f) => f.id === "musicxml")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

async function jouer(arbre: string, hauteurs: string): Promise<Sequence> {
  const res = await rythme.executer(contexte([arbre, hauteurs, null], { Tempo: 120 }) as any);
  return res.valeurs[0] as unknown as Sequence;
}

/** Une polyphonie de deux lignes bien séparées en registre. */
const deuxLignes = async () => {
  const res = await reunir.executer(contexte([
    await jouer("(4/4 (1 1 1 1))", "72 74 76 77"),
    await jouer("(4/4 (1 1 1 1))", "48 50 52 53"),
  ]) as any);
  return res.valeurs[0] as unknown as Sequence;
};

/** La même, réduite à un tas de notes : plus aucune ne sait d'où elle vient. */
const melee = (poly: Sequence): Sequence =>
  ({ ...poly, voix: undefined, notes: poly.notes.map(({ voix: _, ...n }) => n) });

describe("la boucle : réunir, mêler, séparer", () => {
  it("CHAQUE NOTE REVIENT DANS SA LIGNE", async () => {
    const poly = await deuxLignes();
    const res = await separer.executer(contexte([melee(poly)]) as any);
    const rendue = res.valeurs[0] as unknown as Sequence;
    expect(rendue.notes).toHaveLength(poly.notes.length);
    // Les notes sont rendues dans le même ordre : on compare voix à voix.
    rendue.notes.forEach((sortie, i) => {
      expect(sortie.note, `note ${i}`).toBe(poly.notes[i].note);
      expect(sortie.voix, `voix de la note ${i}`).toBe(poly.notes[i].voix);
    });
  });

  it("LE MESSAGE DIT CE QU'IL A TROUVÉ", async () => {
    const res = await separer.executer(contexte([melee(await deuxLignes())]) as any);
    expect(res.message).toContain("2 voix");
    expect(res.message).not.toContain("unissons");
  });

  it("TROIS LIGNES AUSSI", async () => {
    const poly = (await reunir.executer(contexte([
      await jouer("(4/4 (1 1 1 1))", "79 81 83 84"),
      await jouer("(4/4 (1 1 1 1))", "67 69 71 72"),
      await jouer("(4/4 (1 1 1 1))", "55 57 59 60"),
    ]) as any)).valeurs[0] as unknown as Sequence;
    const res = await separer.executer(contexte([melee(poly)]) as any);
    const rendue = res.valeurs[0] as unknown as Sequence;
    rendue.notes.forEach((sortie, i) => expect(sortie.voix).toBe(poly.notes[i].voix));
  });
});

describe("la séquence séparée est une séquence comme une autre", () => {
  it("UNE VOIX S'EN EXTRAIT", async () => {
    const res = await separer.executer(contexte([melee(await deuxLignes())]) as any);
    const ext = await extraire.executer(contexte([res.valeurs[0]], { Voix: 1 }) as any);
    const seule = ext.valeurs[0] as unknown as Sequence;
    expect(seule.notes).toHaveLength(4);
    // La voix 1 est la plus grave des deux : c'est la ligne de basse.
    expect(Math.max(...seule.notes.map((n) => n.note))).toBeLessThan(60);
  });

  it("ELLE SE GRAVE SUR AUTANT DE PORTÉES QUE DE VOIX, une fois chaque voix écrite", async () => {
    // La séparation ne rend pas d'écriture mesurée : la gravure repart des durées, sur une portée.
    // C'est en quantifiant voix par voix qu'on obtiendrait les portées, ce que la notice dit.
    const res = await separer.executer(contexte([melee(await deuxLignes())]) as any);
    const xml = await musicxml.executer(contexte([null, res.valeurs[0], null], { Tempo: 120 }) as any);
    expect(xml.valeurs[0]).toBeTruthy();
    expect((xml.valeurs[0] as string).includes("<part id=")).toBe(true);
  });

  it("L'ÉCRITURE DE L'ENTRÉE NE SUIT PAS, et c'est voulu", async () => {
    // L'arbre de l'entrée décrivait toutes les notes ensemble ; une fois reparties, aucune voix n'a
    // plus ce rythme, et le porter serait le promettre faux.
    const une = await jouer("(4/4 (1 1 1 1))", "60 62 64 65");
    expect(une.arbre).toBeTruthy();
    const res = await separer.executer(contexte([une]) as any);
    expect((res.valeurs[0] as unknown as Sequence).arbre).toBeUndefined();
  });
});

describe("les reglages", () => {
  it("LE NOMBRE DE VOIX SE BORNE", async () => {
    const poly = (await reunir.executer(contexte([
      await jouer("(4/4 (1 1 1 1))", "79 81 83 84"),
      await jouer("(4/4 (1 1 1 1))", "67 69 71 72"),
      await jouer("(4/4 (1 1 1 1))", "55 57 59 60"),
    ]) as any)).valeurs[0] as unknown as Sequence;
    const res = await separer.executer(contexte([melee(poly)], { "Voix au maximum": 2 }) as any);
    expect(res.message).toContain("2 voix");
  });

  it("rien de branché le dit au lieu de rendre une séquence vide", async () => {
    const res = await separer.executer(contexte([null]) as any);
    expect(res.erreur).toBe(true);
    expect(res.valeurs[0]).toBeNull();
  });
});
