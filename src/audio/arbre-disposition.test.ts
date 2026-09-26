// audio/arbre-disposition.test.ts — Où l'on clique, et ce que la retouche produit.
//
// POURQUOI CES CALCULS SONT ÉPROUVÉS HORS DU COMPOSANT. La géométrie décide de ce qu'on clique et
// les retouches de ce qu'on obtient : laissées dans une vue, elles ne se vérifieraient qu'à l'œil.
// C'est ainsi qu'un clavier de ce dépôt a longtemps joué la blanche quand on visait le dièse.
import { describe, expect, it } from "vitest";

import { ecrireArbre, lireArbre } from "./arbre-rythmique";
import {
  ajouterApres, caseALaPosition, changerPoids, disposerArbre, diviser, etatDe, fusionner,
  mettreEtat, retirer,
} from "./arbre-disposition";

const texte = (m: Parameters<typeof ecrireArbre>[0]) => ecrireArbre(m);

describe("disposer un arbre", () => {
  it("quatre temps égaux occupent chacun un quart", () => {
    const d = disposerArbre(lireArbre("(4/4 (1 1 1 1))"));
    expect(d.cases).toHaveLength(4);
    expect(d.cases.map((c) => +c.x.toFixed(6))).toEqual([0, 0.25, 0.5, 0.75]);
    expect(d.cases.every((c) => Math.abs(c.largeur - 0.25) < 1e-9)).toBe(true);
    expect(d.etages).toBe(1);
  });

  it("LA LARGEUR SUIT LA DURÉE, ET NON LE NOMBRE DE PARTS", () => {
    // Un dessin à parts égales mentirait sur ce qu'on entend : ici le dernier temps vaut le double.
    const d = disposerArbre(lireArbre("(4/4 (1 1 2))"));
    expect(d.cases.map((c) => +c.largeur.toFixed(6))).toEqual([0.25, 0.25, 0.5]);
  });

  it("un triolet occupe la largeur du temps qu'il divise", () => {
    const d = disposerArbre(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"));
    expect(d.etages).toBe(2);
    const parent = d.cases.find((c) => c.profondeur === 0 && !c.feuille)!;
    expect(parent.largeur).toBeCloseTo(0.25, 9);
    const enfants = d.cases.filter((c) => c.profondeur === 1);
    expect(enfants).toHaveLength(3);
    for (const e of enfants) expect(e.largeur).toBeCloseTo(0.25 / 3, 9);
    expect(enfants[0].x).toBeCloseTo(0.25, 9);
  });

  it("plusieurs mesures se partagent la largeur au prorata de leur durée", () => {
    const d = disposerArbre(lireArbre("((4/4 (1 1 1 1)) (2/4 (1 1)))"));
    // Quatre noires puis deux : la première mesure prend les deux tiers.
    expect(d.mesures[0].largeur).toBeCloseTo(2 / 3, 9);
    expect(d.mesures[1].x).toBeCloseTo(2 / 3, 9);
  });

  it("les cases ne se chevauchent pas et couvrent tout, à chaque étage", () => {
    const d = disposerArbre(lireArbre("(4/4 (1 (1 (1 1 1)) 2 1))"));
    for (const etage of [0, 1]) {
      const rangee = d.cases.filter((c) => c.profondeur === etage).sort((a, b) => a.x - b.x);
      for (let i = 1; i < rangee.length; i++) {
        expect(rangee[i].x).toBeGreaterThanOrEqual(rangee[i - 1].x + rangee[i - 1].largeur - 1e-9);
      }
    }
  });

  it("trouve la case sous un point, à l'étage demandé", () => {
    const d = disposerArbre(lireArbre("(4/4 (1 (1 (1 1 1)) 1 1))"));
    expect(caseALaPosition(d, 0.1, 0)!.chemin).toEqual([0, 0]);
    expect(caseALaPosition(d, 0.3, 0)!.chemin).toEqual([0, 1]);
    expect(caseALaPosition(d, 0.3, 1)!.chemin).toEqual([0, 1, 0]);
    expect(caseALaPosition(d, 0.9, 1)).toBe(null);
  });

  it("ne bute pas sur un arbre vide", () => {
    expect(disposerArbre([]).cases).toEqual([]);
    expect(disposerArbre([]).etages).toBe(1);
  });
});

describe("retoucher un arbre", () => {
  const base = lireArbre("(4/4 (1 1 1 1))");

  it("DIVISER EN TROIS DONNE UN TRIOLET, le parent gardant son poids", () => {
    // L'intuition contraire — que les enfants doivent totaliser le nombre du parent — interdirait
    // le triolet : un temps vaut un, et trois parts font trois.
    expect(texte(diviser(base, [0, 1], 3))).toBe("(4/4 (1 (1 (1 1 1)) 1 1))");
  });

  it("l'arbre d'origine n'est pas modifié", () => {
    const avant = texte(base);
    diviser(base, [0, 0], 5);
    expect(texte(base)).toBe(avant);
  });

  it("diviser une branche déjà divisée remplace sa division", () => {
    const trois = diviser(base, [0, 0], 3);
    expect(texte(diviser(trois, [0, 0], 2))).toBe("(4/4 ((1 (1 1)) 1 1 1))");
  });

  it("DIVISER UNE BRANCHE LIÉE OU MUETTE EFFACE SON ÉTAT, une division ne sonnant pas", () => {
    // Sans cela, la branche porterait une liaison ou un silence que le déroulement ignore, et le
    // dessin annoncerait ce que l'oreille ne confirmerait pas.
    const liee = mettreEtat(base, [0, 1], "liee");
    expect(texte(diviser(liee, [0, 1], 2))).toBe("(4/4 (1 (1 (1 1)) 1 1))");
    const muette = mettreEtat(base, [0, 1], "silence");
    expect(texte(diviser(muette, [0, 1], 2))).toBe("(4/4 (1 (1 (1 1)) 1 1))");
  });

  it("on peut diviser dans une division", () => {
    const trois = diviser(base, [0, 0], 3);
    expect(texte(diviser(trois, [0, 0, 1], 2))).toBe("(4/4 ((1 (1 (1 (1 1)) 1)) 1 1 1))");
  });

  it("fusionner défait la division et rend une note simple", () => {
    const trois = diviser(base, [0, 2], 3);
    expect(texte(fusionner(trois, [0, 2]))).toBe("(4/4 (1 1 1 1))");
  });

  it("le poids change sans descendre sous un", () => {
    expect(texte(changerPoids(base, [0, 0], 2))).toBe("(4/4 (3 1 1 1))");
    expect(texte(changerPoids(base, [0, 0], -5))).toBe("(4/4 (1 1 1 1))");
  });

  it("les trois états d'une feuille s'écrivent comme il faut", () => {
    expect(texte(mettreEtat(base, [0, 1], "silence"))).toBe("(4/4 (1 -1 1 1))");
    expect(texte(mettreEtat(base, [0, 1], "liee"))).toBe("(4/4 (1 1.0 1 1))");
    const silence = mettreEtat(base, [0, 1], "silence");
    expect(texte(mettreEtat(silence, [0, 1], "note"))).toBe("(4/4 (1 1 1 1))");
  });

  it("UN SILENCE NE GARDE PAS SA DIVISION, qui contiendrait des notes dans un silence", () => {
    const trois = diviser(base, [0, 0], 3);
    expect(texte(mettreEtat(trois, [0, 0], "silence"))).toBe("(4/4 (-1 1 1 1))");
  });

  it("l'état se relit", () => {
    const m = lireArbre("(4/4 (1 -1 1.0 1))");
    expect(m[0].contenu.map((n) => etatDe(n))).toEqual(["note", "silence", "liee", "note"]);
  });

  it("ajouter insère après, et à l'intérieur d'une division", () => {
    expect(texte(ajouterApres(base, [0, 0]))).toBe("(4/4 (1 1 1 1 1))");
    const trois = diviser(base, [0, 0], 3);
    expect(texte(ajouterApres(trois, [0, 0, 0]))).toBe("(4/4 ((1 (1 1 1 1)) 1 1 1))");
  });

  it("retirer enlève la branche", () => {
    expect(texte(retirer(base, [0, 1]))).toBe("(4/4 (1 1 1))");
  });

  it("LA DERNIÈRE BRANCHE NE SE RETIRE PAS, la mesure disparaîtrait du dessin", () => {
    const une = lireArbre("(4/4 (1))");
    expect(texte(retirer(une, [0, 0]))).toBe("(4/4 (1))");
    const trois = diviser(base, [0, 0], 2);
    const reduit = retirer(trois, [0, 0, 0]);
    expect(texte(retirer(reduit, [0, 0, 0]))).toBe(texte(reduit));
  });

  it("un chemin trop court ne casse rien", () => {
    for (const f of [diviser, fusionner, retirer, ajouterApres] as const) {
      expect(texte((f as any)(base, [0], 3))).toBe("(4/4 (1 1 1 1))");
    }
  });

  it("TOUTE RETOUCHE LAISSE UN ARBRE RELISIBLE, ce qui est la seule garantie qui compte", () => {
    // La vue écrit le texte dans un paramètre ; s'il cessait d'être lisible, le nœud échouerait à
    // l'exécution sans qu'on sache quelle retouche l'a cassé.
    let arbre = lireArbre("(4/4 (1 1 1 1))");
    arbre = diviser(arbre, [0, 0], 3);
    arbre = mettreEtat(arbre, [0, 1], "silence");
    arbre = changerPoids(arbre, [0, 2], 2);
    arbre = ajouterApres(arbre, [0, 3]);
    arbre = diviser(arbre, [0, 0, 2], 5);
    arbre = mettreEtat(arbre, [0, 4], "liee");
    const ecrit = texte(arbre);
    expect(() => lireArbre(ecrit)).not.toThrow();
    expect(texte(lireArbre(ecrit))).toBe(ecrit);
  });
});
