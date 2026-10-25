// docs/comparaison-familles.test.ts — Un axe ne separe que s'il depasse son seuil.
//
// CE QUE CES CAS TIENNENT. La couche comparative porte un JUGEMENT — « ceci sepa­re, cela non » —, et
// c'est la seule part du verbe `comparer` qui ne soit pas une mesure. Une mesure fausse se voit en
// la rejouant ; un jugement faux, non : il sort un tableau bien forme, avec des chiffres justes, et
// une conclusion qui ne tient pas. C'est exactement la forme de faute que ce depot paie le plus
// cher, et c'est pourquoi cette part vit ici, hors du navigateur, tenable par des cas.
//
// LA FAUTE QUE LE SEUIL EMPECHE : annoncer comme une difference un ecart que personne n'entend.
// Huit reverberations a 0,4 dB les unes des autres rendent le MEME niveau ; les classer par sonie
// produirait un palmares exact et sans aucun sens. Le seuil est donc declare par axe, et c'est lui
// qu'on eprouve ici.
import { describe, expect, it } from "vitest";

import {
  ecartsChiffres, neSeparentPas, partageEspece, rapport, separent, tableau,
  type AxeChiffre, type Colonne, type LigneMesure,
} from "./comparaison-familles";

const SONIE: AxeChiffre = { cle: "sonieLufs", libelle: "sonie", unite: "LUFS", seuil: 3 };
const DUREE: AxeChiffre = { cle: "rapportDuree", libelle: "duree rendue", unite: "x", seuil: 0.1, decimales: 2 };

const ligne = (id: string, valeurs: Record<string, number | null>, especes?: Record<string, string>): LigneMesure =>
  ({ id, valeurs, especes });

describe("un axe ne separe que s'il depasse son seuil", () => {
  it("QUATRE COMPOSANTS A MOINS D'UN DECIBEL ne se separent pas par la sonie", () => {
    const lignes = [
      ligne("a", { sonieLufs: -21.1 }), ligne("b", { sonieLufs: -21.4 }),
      ligne("c", { sonieLufs: -20.9 }), ligne("d", { sonieLufs: -21.3 }),
    ];
    const e = ecartsChiffres(lignes, [SONIE]);
    expect(e).toHaveLength(1);
    expect(e[0].etendue).toBeCloseTo(0.5, 6);
    expect(e[0].force).toBeLessThan(1);
    expect(separent(e)).toEqual([]);
    expect(neSeparentPas(e)).toHaveLength(1);
  });

  it("ET DIX DECIBELS LES SEPARENT, avec les deux bouts nommes", () => {
    const lignes = [
      ligne("doux", { sonieLufs: -28 }), ligne("moyen", { sonieLufs: -23 }),
      ligne("fort", { sonieLufs: -18 }),
    ];
    const [e] = ecartsChiffres(lignes, [SONIE]);
    expect(e.force).toBeCloseTo(10 / 3, 6);
    expect(e.bas.id).toBe("doux");
    expect(e.haut.id).toBe("fort");
    expect(separent([e])).toHaveLength(1);
  });

  it("LE CLASSEMENT MET EN TETE L'AXE LE PLUS FRANC, rapporte a son propre seuil", () => {
    // La sonie varie de 6 LUFS, soit deux fois son seuil ; la duree de 1,0, soit DIX fois le sien.
    // Un classement sur l'etendue brute mettrait la sonie devant, et dirait le contraire du vrai.
    const lignes = [
      ligne("court", { sonieLufs: -24, rapportDuree: 1.0 }),
      ligne("long", { sonieLufs: -18, rapportDuree: 2.0 }),
    ];
    const e = ecartsChiffres(lignes, [SONIE, DUREE]);
    expect(e.map((x) => x.axe.cle)).toEqual(["rapportDuree", "sonieLufs"]);
  });

  it("UN AXE MESURE SUR UN SEUL COMPOSANT N'EST PAS RENDU, et ne passe donc pas pour uniforme", () => {
    // LE PIEGE : une etendue nulle veut dire « ils se ressemblent ». Sur un seul point, elle veut
    // dire « on n'en sait rien », et les deux ne doivent pas s'ecrire pareil.
    const lignes = [
      ligne("a", { sonieLufs: -21, rapportDuree: 1.5 }),
      ligne("b", { sonieLufs: null, rapportDuree: 1.5 }),
      ligne("c", { sonieLufs: Number.NaN, rapportDuree: 1.5 }),
    ];
    const e = ecartsChiffres(lignes, [SONIE, DUREE]);
    expect(e.map((x) => x.axe.cle), "la sonie n'a qu'un point : elle sort du classement")
      .toEqual(["rapportDuree"]);
    expect(e[0].etendue, "la duree, elle, a trois points egaux : elle ne separe pas").toBe(0);
  });

  it("UNE LIGNE EN ERREUR NE PESE SUR AUCUN AXE", () => {
    const lignes = [
      ligne("a", { sonieLufs: -21 }), ligne("b", { sonieLufs: -20 }),
      { ...ligne("casse", { sonieLufs: -90 }), erreur: "le composant a leve" },
    ];
    const [e] = ecartsChiffres(lignes, [SONIE]);
    expect(e.mesures).toBe(2);
    expect(e.bas.id).not.toBe("casse");
  });
});

describe("le partage par espece", () => {
  it("LE GROUPE LE PLUS NOMBREUX VIENT EN PREMIER, et les listes sont stables", () => {
    const lignes = [
      ligne("c", {}, { masse: "groupe" }), ligne("a", {}, { masse: "tonique" }),
      ligne("b", {}, { masse: "groupe" }), ligne("d", {}, { masse: "groupe" }),
    ];
    const p = partageEspece(lignes, "masse", "masse")!;
    expect(p.groupes[0].espece).toBe("groupe");
    expect(p.groupes[0].ids).toEqual(["b", "c", "d"]);
    expect(p.groupes[1].espece).toBe("tonique");
  });

  it("AUCUNE ESPECE RELEVEE rend null, et non un partage vide", () => {
    expect(partageEspece([ligne("a", {})], "masse", "masse")).toBeNull();
    expect(partageEspece([ligne("a", {}, { masse: "" })], "masse", "masse")).toBeNull();
  });
});

describe("le tableau", () => {
  it("LES COLONNES S'ALIGNENT SUR LE CONTENU, titres compris", () => {
    const colonnes: Colonne[] = [
      { titre: "composant", lire: (l) => l.id },
      { titre: "sonie", lire: (l) => String(l.valeurs.sonieLufs) },
    ];
    const l = tableau([ligne("reverberation-velours", { sonieLufs: -21 })], colonnes);
    // Le titre le plus court est « sonie » ; la colonne prend la largeur de sa valeur, et non
    // l'inverse. Un identifiant de ce depot va de six a vingt-huit caracteres.
    expect(l[0].startsWith("composant            ")).toBe(true);
    expect(l[1].startsWith("reverberation-velours")).toBe(true);
    expect(l[0].length).toBe(l[1].length);
  });
});

describe("le rapport entier", () => {
  const colonnes: Colonne[] = [{ titre: "composant", lire: (l) => l.id }];

  it("DIT CE QUI SEPARE, PUIS CE QUI EST COMMUN, PUIS CE QUI N'A PAS ETE MESURE", () => {
    const lignes = [
      ligne("court", { sonieLufs: -21.0, rapportDuree: 1.0 }, { masse: "groupe" }),
      ligne("long", { sonieLufs: -21.2, rapportDuree: 3.0 }, { masse: "groupe" }),
      { ...ligne("casse", {}), erreur: "entree manquante" },
    ];
    const t = rapport({
      titre: "Essai", entete: "meme son", lignes, axes: [SONIE, DUREE], colonnes,
      especes: [{ cle: "masse", libelle: "masse" }],
    });
    expect(t).toContain("CE QUI LES SEPARE");
    expect(t).toContain("duree rendue");
    expect(t).toContain("le plus bas : court");
    expect(t).toContain("CE QU'ILS ONT EN COMMUN");
    expect(t).toContain("sonie");
    expect(t).toContain("masse : groupe (court, long)");
    expect(t).toContain("NON MESURES");
    expect(t).toContain("casse : entree manquante");
    // L'ordre porte le propos : ce qui separe d'abord, puisque c'est la question posee.
    expect(t.indexOf("CE QUI LES SEPARE")).toBeLessThan(t.indexOf("CE QU'ILS ONT EN COMMUN"));
  });

  it("ET QUAND RIEN NE SEPARE, IL LE DIT, plutot que de laisser la section vide", () => {
    const lignes = [ligne("a", { sonieLufs: -21.0 }), ligne("b", { sonieLufs: -21.1 })];
    const t = rapport({ titre: "Essai", entete: "", lignes, axes: [SONIE], colonnes, especes: [] });
    expect(t).toContain("RIEN NE LES SEPARE");
    expect(t).not.toContain("CE QUI LES SEPARE");
  });
});
