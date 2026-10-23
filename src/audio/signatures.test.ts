// audio/signatures.test.ts — La table des signatures, le groupement des temps, et l'unicité de la
// table.
//
// LE DERNIER CAS EST CELUI QUI MANQUAIT. Six composants portaient chacun leur liste de signatures
// écrite à la main, et les six divergeaient sans que rien ne le dise. Le garde cherche LA FORME
// d'une table de signatures — un tableau de chaînes dont trois au moins s'écrivent « nombre sur
// puissance de deux » — et non un nom de fichier, parce qu'un garde qui connaît les noms laisse
// passer la table suivante.
//
// IL EN EXISTE UN AUTRE, ET LES DEUX NE SE RECOUVRENT PAS. Le registre des nomenclatures compte
// les formes DISTINCTES que le concept « métrique » prend dans les fiches, et il chiffrait cette
// dette à quatre. Il ne verrait pas une liste recopiée à l'identique, puisqu'elle ne fait pas une
// forme de plus ; celui-ci la voit, parce qu'il lit la source. L'inverse est vrai aussi : une liste
// bâtie par calcul lui échappe et le registre la compte.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import {
  SIGNATURES, clicsDeMesure, dureeUnite, groupesDe, lireSignature, tempsParMesure,
} from "./signatures";

describe("lire une signature", () => {
  it("accepte ce qui a la forme, espaces compris", () => {
    expect(lireSignature("9/8")).toEqual({ num: 9, den: 8 });
    expect(lireSignature(" 12 / 16 ")).toEqual({ num: 12, den: 16 });
    expect(lireSignature("1/4")).toEqual({ num: 1, den: 4 });
  });

  it("refuse ce qui n'a pas de sens, et sans jeter", () => {
    // UN DÉNOMINATEUR QUI N'EST PAS UNE DIVISION BINAIRE DE LA RONDE n'existe pas : 9/5 ne se note
    // pas. Le refus est rendu, jamais lancé, parce qu'un exécuteur de composant lit un texte libre.
    expect(lireSignature("9/5")).toBe(null);
    expect(lireSignature("0/4")).toBe(null);
    expect(lireSignature("4")).toBe(null);
    expect(lireSignature("")).toBe(null);
    expect(lireSignature("C")).toBe(null);
    expect(lireSignature("quatre/quatre")).toBe(null);
    expect(lireSignature(undefined as unknown as string)).toBe(null);
  });

  it("TOUTE SIGNATURE OFFERTE EST LISIBLE PAR SON PROPRE LECTEUR", () => {
    // La table et son lecteur sont dans le même module : s'ils divergeaient, une signature offerte
    // retomberait silencieusement sur le défaut.
    for (const texte of SIGNATURES) {
      expect(lireSignature(texte), texte).not.toBe(null);
    }
  });
});

describe("la durée d'une unité", () => {
  it("vaut quatre sur le dénominateur, battement de noire", () => {
    expect(dureeUnite(120, 4)).toBeCloseTo(0.5, 12);
    expect(dureeUnite(120, 8)).toBeCloseTo(0.25, 12);
  });

  it("LA BLANCHE ET LA DOUBLE CROCHE NE TOMBENT PAS SUR LE CAS DE LA NOIRE", () => {
    // C'est le défaut que la formule générale remplace : écrit `den === 8 ? moitié : entier`, le
    // calcul rendait 0,5 s pour une blanche comme pour une noire — faux du simple au double — et
    // autant pour une double croche.
    expect(dureeUnite(120, 2)).toBeCloseTo(1, 12);
    expect(dureeUnite(120, 16)).toBeCloseTo(0.125, 12);
  });

  it("se tait sur un tempo ou un dénominateur illisible", () => {
    expect(dureeUnite(0, 4)).toBe(null);
    expect(dureeUnite(NaN, 4)).toBe(null);
    expect(dureeUnite(-120, 4)).toBe(null);
    expect(dureeUnite(120, 5)).toBe(null);
  });
});

describe("grouper les temps d'une mesure", () => {
  it("les mesures composées se battent en trois, pas en une", () => {
    expect(groupesDe(6, 8)).toEqual([3, 3]);
    expect(groupesDe(9, 8)).toEqual([3, 3, 3]);
    expect(groupesDe(12, 8)).toEqual([3, 3, 3, 3]);
    expect(groupesDe(9, 16)).toEqual([3, 3, 3]);
  });

  it("les dénominateurs longs portent un temps par unité", () => {
    expect(groupesDe(4, 4)).toEqual([1, 1, 1, 1]);
    expect(groupesDe(3, 2)).toEqual([1, 1, 1]);
    expect(groupesDe(1, 4)).toEqual([1]);
    // SOUS CINQ UNITÉS LA MESURE RESTE SIMPLE : 3/8 est trois temps de croche, pas un temps.
    expect(groupesDe(3, 8)).toEqual([1, 1, 1]);
    expect(groupesDe(4, 8)).toEqual([1, 1, 1, 1]);
  });

  it("les irrégulières mettent les trois en tête", () => {
    expect(groupesDe(5, 8)).toEqual([3, 2]);
    expect(groupesDe(7, 8)).toEqual([3, 2, 2]);
    expect(groupesDe(8, 8)).toEqual([3, 3, 2]);
    expect(groupesDe(11, 8)).toEqual([3, 3, 3, 2]);
  });

  it("AUCUN TEMPS D'UNE SEULE UNITÉ DANS UNE MESURE GROUPÉE", () => {
    // C'est le piège du reste de un : sept croches donneraient 3+3+1, dont le dernier temps d'une
    // croche seule n'est pas un temps. Rendre un trois pour en faire deux deux est la réparation,
    // et ce cas la tient sur toute la table.
    for (const texte of SIGNATURES) {
      const { num, den } = lireSignature(texte)!;
      const groupes = groupesDe(num, den);
      if (den <= 4 || num < 5) continue;
      expect(groupes.includes(1), `${texte} → ${groupes.join("+")}`).toBe(false);
    }
  });

  it("LE GROUPEMENT COUVRE LA MESURE, EXACTEMENT", () => {
    // La propriété qui tient tout le reste : si la somme des groupes n'était pas le numérateur, un
    // clic tomberait hors de sa mesure et l'accent dériverait de mesure en mesure.
    for (const texte of SIGNATURES) {
      const { num, den } = lireSignature(texte)!;
      const somme = groupesDe(num, den).reduce((a, b) => a + b, 0);
      expect(somme, `${texte} → ${groupesDe(num, den).join("+")}`).toBe(num);
    }
  });

  it("se tait sur un numérateur illisible", () => {
    expect(groupesDe(0, 4)).toEqual([]);
    expect(groupesDe(-3, 4)).toEqual([]);
    expect(groupesDe(2.5, 4)).toEqual([]);
  });
});

describe("les clics d'une mesure", () => {
  it("il y en a un par unité, et le premier est le temps fort", () => {
    for (const texte of SIGNATURES) {
      const { num, den } = lireSignature(texte)!;
      const clics = clicsDeMesure(num, den);
      expect(clics.length, texte).toBe(num);
      expect(clics[0].niveau, texte).toBe(0);
      expect(clics.map((c) => c.unite), texte).toEqual(clics.map((_, i) => i));
    }
  });

  it("neuf croches font trois temps et six subdivisions", () => {
    expect(clicsDeMesure(9, 8).map((c) => c.niveau)).toEqual([0, 2, 2, 1, 2, 2, 1, 2, 2]);
  });

  it("UNE MESURE SIMPLE N'A PAS DE SUBDIVISION, donc son clic ne change pas", () => {
    // Ce qui était livré avait deux rangs ; le troisième n'apparaît que là où il manquait.
    expect(clicsDeMesure(4, 4).map((c) => c.niveau)).toEqual([0, 1, 1, 1]);
    expect(clicsDeMesure(3, 4).map((c) => c.niveau)).toEqual([0, 1, 1]);
    expect(clicsDeMesure(7, 4).map((c) => c.niveau).includes(2)).toBe(false);
  });

  it("le nombre de temps est celui que battrait un chef", () => {
    expect(tempsParMesure(4, 4)).toBe(4);
    expect(tempsParMesure(6, 8)).toBe(2);
    expect(tempsParMesure(9, 8)).toBe(3);
    expect(tempsParMesure(12, 8)).toBe(4);
    expect(tempsParMesure(7, 8)).toBe(3);
  });
});

describe("la table est à un seul endroit", () => {
  const RACINE = resolve(__dirname, "..");
  const MOI = join("audio", "signatures.ts");

  /** Les fichiers de source du domaine et des composants, cas exclus. */
  function sources(dossier: string, trouves: string[] = []): string[] {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) { sources(chemin, trouves); continue; }
      if (!nom.endsWith(".ts") && !nom.endsWith(".tsx")) continue;
      if (nom.includes(".test.")) continue;
      trouves.push(chemin);
    }
    return trouves;
  }

  /**
   * Les tableaux de ce texte qui ont LA FORME d'une table de signatures.
   *
   * Un tableau sans tableau imbriqué, dont tous les éléments sont des chaînes littérales, dont
   * trois au moins s'écrivent « nombre sur puissance de deux », et dont UN AU MOINS porte un
   * numérateur autre que un.
   *
   * LES DEUX CONDITIONS DE FIN SONT CE QUI REND LE GARDE UTILISABLE, et chacune a été ajoutée
   * contre un faux positif réel du dépôt. « Que des chaînes » écarte les tables de rapports
   * d'intervalles, où « 9/8 » voisine avec les deux nombres du rapport : `[9, 8, "9/8"]`. « Un
   * numérateur autre que un » écarte les listes de VALEURS DE NOTE — `["1/32", "1/16", "1/8"]` —
   * qui ont exactement la forme d'une signature sans en être une : une ronde divisée n'est pas une
   * mesure, et six composants en portent une.
   */
  function tablesDeSignatures(texte: string): string[] {
    const trouvees: string[] = [];
    for (const [, dedans] of texte.matchAll(/\[([^[\]]*)\]/g)) {
      const elements = dedans.split(",").map((e) => e.trim()).filter(Boolean);
      if (elements.length < 3) continue;
      if (!elements.every((e) => /^"[^"]*"$/.test(e) || /^'[^']*'$/.test(e))) continue;
      const signatures = elements.filter((e) => /^["']\d{1,2}\/(?:1|2|4|8|16|32)["']$/.test(e));
      if (signatures.length < 3) continue;
      if (!signatures.some((e) => !/^["']1\//.test(e))) continue;
      trouvees.push(`[${elements.join(", ")}]`);
    }
    return trouvees;
  }

  it("LE GARDE RECONNAÎT UNE TABLE DE SIGNATURES, ET SEULEMENT ELLE", () => {
    // Éprouvé des deux côtés, sans quoi il pourrait être aveugle : il voit les cinq listes telles
    // qu'elles étaient écrites, et il ne voit pas une table de rapports ni une liste de libellés.
    expect(tablesDeSignatures('const M = ["2/4", "3/4", "4/4", "5/4", "6/8"];')).toHaveLength(1);
    expect(tablesDeSignatures('options: ["4/4","3/4","6/8"]')).toHaveLength(1);
    expect(tablesDeSignatures('[1, 1, "1/1"], [16, 15, "16/15"], [9, 8, "9/8"], [5, 4, "5/4"]'))
      .toEqual([]);
    expect(tablesDeSignatures('["Croches (1/8)", "Doubles (1/16)", "Triples (1/32)"]')).toEqual([]);
    expect(tablesDeSignatures('["1/32", "1/16", "1/8", "1/4", "1/2"]'), "des valeurs de note")
      .toEqual([]);
  });

  it("AUCUN AUTRE FICHIER NE RÉÉCRIT LA TABLE", () => {
    const fautifs: string[] = [];
    for (const chemin of sources(RACINE)) {
      if (chemin.endsWith(MOI)) continue;
      for (const table of tablesDeSignatures(readFileSync(chemin, "utf8"))) {
        fautifs.push(`${chemin.slice(RACINE.length + 1)} : ${table.slice(0, 120)}`);
      }
    }
    expect(fautifs, "ces tables doivent venir de `audio/signatures.ts`").toEqual([]);
  });
});
