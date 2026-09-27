// audio/reecriture-arbre.test.ts — Simplifier sans rien déplacer.
//
// L'INVARIANT EST LE SUJET, ET IL EST ÉPROUVÉ SUR SIX CENT QUARANTE ARBRES. Une réécriture qui
// déplacerait une attaque ne serait pas une simplification mais une faute silencieuse : le texte
// paraîtrait plus propre et la pièce ne serait plus la même. Le contrôle porte donc sur les notes
// SONNANTES, comparées au milliardième, avant et après.
//
// LES SILENCES SONT LA SEULE LIBERTÉ, et elle est écrite : deux silences côte à côte fondus en un
// laissent le même vide et un événement de moins. Un test qui exigerait l'égalité des événements
// refuserait cette règle ; un test qui ne comparerait que la durée totale laisserait passer bien
// pire. C'est pourquoi la comparaison porte sur les notes et non sur les événements.
import { describe, expect, it } from "vitest";

import { derouler, ecrireArbre, lireArbre, type Mesure } from "./arbre-rythmique";
import { catalogueArbres, engendrerArbre } from "./arbres-catalogue";
import { creerAleatoire } from "../core";
import { reecrireArbre } from "./reecriture-arbre";

const TEMPO = 120;

/** Les notes qui sonnent, à leur instant et de leur durée. Ce qui ne doit jamais bouger. */
const sonnantes = (m: readonly Mesure[]) =>
  derouler(m, TEMPO).filter((e) => !e.silence).map((e) => [e.debut, e.duree] as const);

/** Réécrit un texte et rend le texte obtenu. */
const reduit = (texte: string) => ecrireArbre(reecrireArbre(lireArbre(texte)).mesures);

describe("les règles, une par une", () => {
  it("UNE DIVISION À UN SEUL ÉLÉMENT N'EN EST PAS UNE", () => {
    expect(reduit("(4/4 (1 (1 (1))))")).toBe("(4/4 (1 1))");
  });

  it("UNE NOTE SUIVIE DE SES SEULES LIAISONS EST CETTE NOTE", () => {
    expect(reduit("(4/4 (1 (1 (1 1.0)) 1 1))")).toBe("(4/4 (1 1 1 1))");
    expect(reduit("(4/4 (1 (1 (1 1.0 1.0 1.0)) 1 1))")).toBe("(4/4 (1 1 1 1))");
  });

  it("TOUT EN SILENCE FAIT UN SILENCE", () => {
    expect(reduit("(4/4 ((1 (-1 -1)) 1 1 1))")).toBe("(4/4 (-1 1 1 1))");
  });

  it("DES POIDS TOUS MULTIPLES SE DIVISENT, seul leur rapport comptant", () => {
    expect(reduit("(4/4 (2 2))")).toBe("(4/4 (1 1))");
    expect(reduit("(4/4 (2 2 4))")).toBe("(4/4 (1 1 2))");
  });

  it("CE QUI EST DÉJÀ MINIMAL N'EST PAS TOUCHÉ", () => {
    for (const texte of [
      "(4/4 (1 1 1 1))",
      "(4/4 (1 (1 (1 1)) 1 1))",
      "(4/4 (1 (1 (1 1 1)) 1 1))",
      "(4/4 (1 -1 1 -1))",
      "(3/4 (1 1 2))",
    ]) {
      expect(reduit(texte), texte).toBe(texte);
    }
  });

  it("UNE LIAISON SUIVIE D'AUTRE CHOSE N'EST PAS FONDUE", () => {
    // La seconde moitié réattaque : fondre écraserait une note.
    expect(reduit("(4/4 (1 (1 (1 1.0 1)) 1 1))")).toBe("(4/4 (1 (1 (1 1.0 1)) 1 1))");
  });

  it("UN SILENCE MÊLÉ À UNE NOTE N'EST PAS FONDU", () => {
    expect(reduit("(4/4 ((1 (-1 1)) 1 1 1))")).toBe("(4/4 ((1 (-1 1)) 1 1 1))");
  });

  it("le compte des règles appliquées est rendu", () => {
    const r = reecrireArbre(lireArbre("(4/4 (1 (1 (1 1.0)) (1 (-1 -1)) 1))"));
    expect(r.appliquees["liaisons-fondues"]).toBe(1);
    expect(r.appliquees["silences-fondus"]).toBe(1);
    expect(r.gagne).toBeGreaterThan(0);
  });
});

describe("l'invariant, sur tout ce qu'on sait produire", () => {
  it("AUCUNE NOTE NE BOUGE, sur les trois cent quarante arbres du catalogue", () => {
    const manques: string[] = [];
    for (const m of catalogueArbres({ emplacementsMax: 4, partsMax: 3 })) {
      const avant = sonnantes([m]);
      const apres = sonnantes(reecrireArbre([m]).mesures);
      const juste = avant.length === apres.length
        && avant.every(([d, u], i) => Math.abs(apres[i][0] - d) < 1e-9 && Math.abs(apres[i][1] - u) < 1e-9);
      if (!juste && manques.length < 5) manques.push(ecrireArbre([m]));
    }
    expect(manques.join(" | ")).toBe("");
  });

  it("NI SUR TROIS CENTS ARBRES TIRÉS À DEUX ÉTAGES, silences et liaisons compris", () => {
    const manques: string[] = [];
    let simplifies = 0;
    for (let graine = 1; graine <= 300; graine++) {
      const m = engendrerArbre({
        metrique: [4, 4], mesures: 1, emplacements: 4, profondeur: 2,
        divisions: [2, 3, 4], densite: 0.5, silences: 0.2, liaisons: 0.25,
      }, creerAleatoire(graine));
      const avant = sonnantes(m);
      const r = reecrireArbre(m);
      const apres = sonnantes(r.mesures);
      const juste = avant.length === apres.length
        && avant.every(([d, u], i) => Math.abs(apres[i][0] - d) < 1e-9 && Math.abs(apres[i][1] - u) < 1e-9);
      if (!juste && manques.length < 5) manques.push(`${ecrireArbre(m)} → ${ecrireArbre(r.mesures)}`);
      if (r.gagne > 0) simplifies++;
    }
    expect(manques.join(" | ")).toBe("");
    // ET ELLE SERT : le catalogue est déjà canonique et ne se réduit pas, mais un tirage à deux
    // étages produit des tournures réductibles, sans quoi ce module n'aurait pas lieu d'être.
    expect(simplifies).toBeGreaterThan(50);
  });

  it("RÉÉCRIRE DEUX FOIS NE CHANGE PLUS RIEN", () => {
    for (let graine = 1; graine <= 100; graine++) {
      const m = engendrerArbre({
        metrique: [4, 4], mesures: 1, emplacements: 4, profondeur: 2,
        divisions: [2, 3], densite: 0.5, silences: 0.2, liaisons: 0.3,
      }, creerAleatoire(graine));
      const une = reecrireArbre(m).mesures;
      expect(ecrireArbre(reecrireArbre(une).mesures), `graine ${graine}`).toBe(ecrireArbre(une));
    }
  });

  it("LE TEXTE NE GRANDIT JAMAIS", () => {
    for (let graine = 1; graine <= 100; graine++) {
      const m = engendrerArbre({
        metrique: [4, 4], mesures: 1, emplacements: 3, profondeur: 2,
        divisions: [2, 3, 4], densite: 0.6, silences: 0.2, liaisons: 0.3,
      }, creerAleatoire(graine));
      expect(reecrireArbre(m).gagne, `graine ${graine}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ce qui ne doit pas casser", () => {
  it("un arbre vide rend un arbre vide", () => {
    const r = reecrireArbre([]);
    expect(r.mesures).toEqual([]);
    expect(r.gagne).toBe(0);
  });

  it("une seule note reste une seule note", () => {
    expect(reduit("(4/4 (1))")).toBe("(4/4 (1))");
  });

  it("PLUSIEURS MESURES SONT RÉÉCRITES CHACUNE", () => {
    expect(reduit("((4/4 (2 2)) (4/4 (1 (1 (1 1.0)) 1 1)))"))
      .toBe("((4/4 (1 1)) (4/4 (1 1 1 1)))");
  });

  it("la métrique n'est jamais touchée", () => {
    expect(reduit("(7/8 (2 2))")).toBe("(7/8 (1 1))");
  });
});
