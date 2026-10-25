// core/format-projet.test.ts — Le numéro de format, et le rapport de chargement.
//
// ═══ POURQUOI CES CAS ═══
//
// RELEVÉ LE 2026-10-25 par une revue critique du dépôt : « Le format de projet n'a ni version, ni
// migration, ni rapport de chargement. » Vérifié, et vrai : un fichier portait `nodes`, `edges`,
// `metas`, `viewport`, et rien d'autre.
//
// Les deux manques qui se paient tout de suite sont tenus ici : un fichier venu d'une version plus
// récente s'ouvrait sans un mot en perdant ce que la version qui le lit ne connaît pas, et une perte
// au chargement ne laissait qu'une ligne de console que personne ne lit.
import { describe, expect, it } from "vitest";
import {
  FORMAT_PROJET, versionDuProjet, venuDuFutur,
  perteAuChargementVide, rienDePerduAuChargement, rapportDuChargement,
} from "./format-projet";

const LIBELLES = {
  format: (v: number) => `format ${v}`,
  fiches: (n: number) => `fiches ${n}`,
  reglages: (n: number) => `reglages ${n}`,
  aretes: (n: number) => `aretes ${n}`,
};

describe("la version du format de projet", () => {
  it("UN FICHIER SANS NUMÉRO EST DU FORMAT 1, parce que tous ceux écrits jusqu'ici le sont", () => {
    // Les deviner sur le contenu serait une heuristique qui vieillirait mal : un fichier antérieur
    // au numéro n'en portera jamais.
    expect(versionDuProjet({ nodes: [], edges: [] })).toBe(1);
    expect(versionDuProjet({})).toBe(1);
    expect(versionDuProjet(null)).toBe(1);
  });

  it("et un numéro abîmé ne vaut pas mieux qu'une absence", () => {
    for (const v of ["2", {}, [], NaN, Infinity, 0, -3, true]) {
      expect(versionDuProjet({ formatVersion: v }), `formatVersion=${String(v)}`).toBe(1);
    }
    expect(versionDuProjet({ formatVersion: 3.7 }), "un numéro n'a pas de décimales").toBe(3);
  });

  it("UN FICHIER VENU DU FUTUR SE RECONNAÎT, et c'est tout l'intérêt immédiat du numéro", () => {
    expect(venuDuFutur({ formatVersion: FORMAT_PROJET + 1 })).toBe(true);
    expect(venuDuFutur({ formatVersion: FORMAT_PROJET })).toBe(false);
    expect(venuDuFutur({}), "un fichier sans numéro vient du passé, jamais du futur").toBe(false);
  });

  it("ET LE NUMÉRO COURANT RESTE 1 TANT QUE LA FORME NE CHANGE PAS", () => {
    // CE CAS EST UN RAPPEL, ET NON UNE RÈGLE. Monter ce nombre sans écrire la migration qui va avec
    // rendrait tous les fichiers précédents « venus du passé » sans que rien ne les reprenne. Qui le
    // monte doit faire tomber ce cas exprès, et dire dans le même geste ce qui migre.
    expect(FORMAT_PROJET).toBe(1);
  });
});

describe("le rapport de chargement", () => {
  it("un chargement sans perte ne dit rien", () => {
    const p = perteAuChargementVide();
    expect(rienDePerduAuChargement(p)).toBe(true);
    expect(rapportDuChargement(p, LIBELLES)).toBe("");
  });

  it("chaque nature compte, et une seule suffit à faire parler le rapport", () => {
    for (const remplir of [
      (p: ReturnType<typeof perteAuChargementVide>) => p.aretes.push("e-1"),
      (p: ReturnType<typeof perteAuChargementVide>) => p.fiches.push("n-1 (parti)"),
      (p: ReturnType<typeof perteAuChargementVide>) => p.reglages.push("n-1 · Fréquence"),
      (p: ReturnType<typeof perteAuChargementVide>) => { p.formatFutur = 9; },
    ]) {
      const p = perteAuChargementVide();
      remplir(p);
      expect(rienDePerduAuChargement(p)).toBe(false);
      expect(rapportDuChargement(p, LIBELLES).length).toBeGreaterThan(0);
    }
  });

  it("LE PLUS GRAVE EST EN TÊTE : le format, puis les fiches, puis les réglages, puis les câbles", () => {
    const p = perteAuChargementVide();
    p.formatFutur = 9;
    p.fiches.push("n-1 (parti)");
    p.reglages.push("n-2 · Fréquence");
    p.aretes.push("e-1");
    const lignes = rapportDuChargement(p, LIBELLES).split("\n").filter((l) => !l.startsWith("  "));
    expect(lignes).toEqual(["format 9", "fiches 1", "reglages 1", "aretes 1"]);
  });

  it("ET LA BORNE EST PAR NATURE, sans quoi la perte la plus grave disparaît sous la plus nombreuse", () => {
    // C'est le piège de ce rapport : quarante câbles cassés ne doivent pas faire disparaître la
    // seule fiche inconnue, qui est l'information qu'on cherche.
    const p = perteAuChargementVide();
    for (let i = 0; i < 40; i++) p.aretes.push(`e-${i}`);
    p.fiches.push("n-1 (parti)");
    const texte = rapportDuChargement(p, LIBELLES, 3);
    expect(texte).toContain("n-1 (parti)");
    expect(texte).toContain("e-0");
    expect(texte, "ce qui dépasse la borne est compté, non tu").toContain("… 37");
    expect(texte.split("\n").filter((l) => /^ {2}• e-/.test(l)).length,
      "trois câbles montrés, pas quarante").toBe(3);
  });

  it("et le compte annoncé est celui de TOUT ce qui est perdu, non de ce qui est montré", () => {
    const p = perteAuChargementVide();
    for (let i = 0; i < 12; i++) p.reglages.push(`n-${i} · R`);
    expect(rapportDuChargement(p, LIBELLES, 2)).toContain("reglages 12");
  });
});
