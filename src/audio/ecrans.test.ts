// audio/ecrans.test.ts — Ce qu'un tirage stochastique doit garantir, et qu'aucune écoute ne dirait.
//
// LE TEST QUI COMPTE EST CELUI DE LA MOYENNE. Une densité de 2,5 grains par écran ne peut pas
// rendre deux grains et demi : si l'on arrondit, la densité cesse d'être réglable en dessous du
// grain par écran, et tout le procédé de Xenakis — une densité de probabilité, et non un compte —
// s'effondre. La partie fractionnaire décide donc d'un grain de plus, au hasard, et c'est la
// MOYENNE sur beaucoup d'écrans qui doit tomber juste. Un test le vérifie à un pour-cent près.
//
// LE SECOND : LES DEUX RÉGIMES DE LA CHAÎNE. Une tenue forte doit donner des nappes stables, une
// tenue faible un bouillonnement. Ce sont les deux extrêmes que Xenakis cherchait, et ils se
// mesurent — la part de cases qui changent d'un écran au suivant.
//
// LE TROISIÈME : LE PREMIER ÉCRAN. Tiré à pile ou face, il ferait commencer toute pièce par un
// écran à moitié plein, quels que soient les réglages : une texture creuse mettrait des secondes à
// se vider, et l'on entendrait un transitoire que personne n'a demandé. Il est donc tiré à la
// probabilité d'équilibre de la chaîne.
import { describe, expect, it } from "vitest";
import {
  grainsDuLivre, hasardEcrans, livreEcrans, rapportLivre, rendreGrains, texteLivre, type Ecran,
} from "./ecrans";

const SR = 44100;

const tirage = (graine = 7) => hasardEcrans(graine);

const LIVRE = {
  bandes: 6, niveaux: 3, dureeEcranSec: 0.1, dureeSec: 2,
  tenuePc: 80, apparitionPc: 20, aleatoire: tirage(),
};

const TIRAGE = {
  frequenceMinHz: 100, frequenceMaxHz: 6400, densite: 20, pasNiveauDb: 6,
  dureeEcranSec: 0.1, aleatoire: tirage(),
};

describe("le livre d'écrans", () => {
  it("compte autant d'écrans que la durée en demande", () => {
    expect(livreEcrans({ ...LIVRE, aleatoire: tirage() })).toHaveLength(20);
    expect(livreEcrans({ ...LIVRE, dureeSec: 5, aleatoire: tirage() })).toHaveLength(50);
  });

  it("LES DEUX RÉGIMES DE XENAKIS SE MESURENT : la nappe et le bouillonnement", () => {
    const nappe = rapportLivre(livreEcrans({ ...LIVRE, dureeSec: 20, tenuePc: 98, apparitionPc: 2, aleatoire: tirage() }));
    const bouillon = rapportLivre(livreEcrans({ ...LIVRE, dureeSec: 20, tenuePc: 30, apparitionPc: 60, aleatoire: tirage() }));
    expect(nappe.agitationPc).toBeLessThan(6);
    expect(bouillon.agitationPc).toBeGreaterThan(30);
  });

  it("LE PREMIER ÉCRAN EST DÉJÀ À L'ÉQUILIBRE, et non à moitié plein", () => {
    // Tenue 90 %, apparition 5 % : l'équilibre vaut 5 / (5 + 10), soit un tiers. Le premier écran
    // doit s'en approcher, et non valoir un demi.
    const premiers: number[] = [];
    for (let g = 1; g <= 60; g++) {
      const livre = livreEcrans({ ...LIVRE, bandes: 8, niveaux: 4, tenuePc: 90, apparitionPc: 5, aleatoire: tirage(g) });
      const allumees = livre[0].flat().filter(Boolean).length;
      premiers.push(allumees / 32);
    }
    const moyenne = premiers.reduce((s, v) => s + v, 0) / premiers.length;
    expect(moyenne).toBeGreaterThan(0.25);
    expect(moyenne).toBeLessThan(0.42);
  });

  it("une tenue de cent pour cent et aucune apparition fige le livre", () => {
    const livre = livreEcrans({ ...LIVRE, tenuePc: 100, apparitionPc: 0, aleatoire: tirage() });
    expect(rapportLivre(livre).agitationPc).toBe(0);
    expect(JSON.stringify(livre[0])).toBe(JSON.stringify(livre[livre.length - 1]));
  });

  it("aucune apparition et aucune tenue vide le livre dès le second écran", () => {
    const livre = livreEcrans({ ...LIVRE, tenuePc: 0, apparitionPc: 0, aleatoire: tirage() });
    expect(livre[0].flat().some(Boolean)).toBe(false);
    expect(livre[5].flat().some(Boolean)).toBe(false);
  });

  it("LA MÊME GRAINE REJOUE LE MÊME LIVRE", () => {
    const a = livreEcrans({ ...LIVRE, aleatoire: tirage(42) });
    const b = livreEcrans({ ...LIVRE, aleatoire: tirage(42) });
    const c = livreEcrans({ ...LIVRE, aleatoire: tirage(43) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("les réglages absurdes sont bornés plutôt que transmis", () => {
    const livre = livreEcrans({ ...LIVRE, bandes: -3, niveaux: 99, dureeSec: 0, dureeEcranSec: 1e6, aleatoire: tirage() });
    expect(livre.length).toBeGreaterThanOrEqual(1);
    expect(livre[0]).toHaveLength(1);
    expect(livre[0][0]).toHaveLength(8);
  });
});

describe("les grains tirés dans les cases", () => {
  it("LA DENSITÉ TOMBE JUSTE EN MOYENNE, même en dessous du grain par écran", () => {
    // Une case allumée en permanence, 0,25 grain par écran, deux mille écrans : cinq cents grains.
    const uneCase: Ecran[] = Array.from({ length: 2000 }, () => [[true]]);
    const grains = grainsDuLivre(uneCase, { ...TIRAGE, densite: 2.5, dureeEcranSec: 0.1, aleatoire: tirage(3) });
    expect(grains.length).toBeGreaterThan(470);
    expect(grains.length).toBeLessThan(530);
  });

  it("une case éteinte ne produit rien", () => {
    expect(grainsDuLivre([[[false]]], { ...TIRAGE, aleatoire: tirage() })).toEqual([]);
    expect(grainsDuLivre([], { ...TIRAGE, aleatoire: tirage() })).toEqual([]);
  });

  it("CHAQUE GRAIN TOMBE DANS SA BANDE, et les bandes sont logarithmiques", () => {
    // Deux bandes entre 100 et 6400 Hz : la coupure est à 800 Hz, moyenne géométrique et non
    // arithmétique — c'est ce que l'oreille entend comme le milieu.
    const bas: Ecran[] = [[[true], [false]]];
    const haut: Ecran[] = [[[false], [true]]];
    const o = { ...TIRAGE, densite: 200, aleatoire: tirage(5) };
    for (const g of grainsDuLivre(bas, { ...o, aleatoire: tirage(5) })) {
      expect(g.frequenceHz).toBeGreaterThanOrEqual(100);
      expect(g.frequenceHz).toBeLessThanOrEqual(800.1);
    }
    for (const g of grainsDuLivre(haut, { ...o, aleatoire: tirage(6) })) {
      expect(g.frequenceHz).toBeGreaterThanOrEqual(799.9);
      expect(g.frequenceHz).toBeLessThanOrEqual(6400);
    }
  });

  it("les niveaux descendent par pas de décibels, le plus haut à pleine amplitude", () => {
    const trois: Ecran[] = [[[true, true, true]]];
    const grains = grainsDuLivre(trois, { ...TIRAGE, densite: 100, pasNiveauDb: 6, aleatoire: tirage(9) });
    const amplitudes = [...new Set(grains.map((g) => Math.round(g.amplitude * 1000) / 1000))].sort((a, b) => a - b);
    expect(amplitudes).toHaveLength(3);
    expect(amplitudes[2]).toBeCloseTo(1, 3);
    expect(amplitudes[1]).toBeCloseTo(0.501, 2);
    expect(amplitudes[0]).toBeCloseTo(0.251, 2);
  });

  it("les grains restent dans le temps de leur écran", () => {
    const livre: Ecran[] = [[[true]], [[true]], [[true]]];
    for (const g of grainsDuLivre(livre, { ...TIRAGE, densite: 50, aleatoire: tirage(11) })) {
      expect(g.instant).toBeGreaterThanOrEqual(0);
      expect(g.instant).toBeLessThan(0.3);
    }
  });
});

describe("le rendu", () => {
  it("LE GRAIN PORTE SA FENÊTRE : ni le premier ni le dernier échantillon ne fait de marche", () => {
    const y = rendreGrains([{ instant: 0, frequenceHz: 440, amplitude: 1 }], SR, SR, 0.05);
    expect(Math.abs(y[0])).toBeLessThan(1e-6);
    expect(Math.abs(y[Math.round(0.05 * SR) - 1])).toBeLessThan(1e-3);
    expect(Math.max(...y)).toBeGreaterThan(0.9);
  });

  it("les grains s'additionnent, et rien ne sort du tampon", () => {
    const y = rendreGrains(
      [{ instant: 0, frequenceHz: 200, amplitude: 0.5 }, { instant: 0, frequenceHz: 200, amplitude: 0.5 }],
      SR, SR, 0.05);
    expect(Math.max(...y)).toBeGreaterThan(0.9);
    expect(y).toHaveLength(SR);
  });

  it("un grain au-delà de la fin ne fait pas lever", () => {
    expect(() => rendreGrains([{ instant: 10, frequenceHz: 440, amplitude: 1 }], SR, 100, 0.05)).not.toThrow();
    expect(rendreGrains([], SR, 100, 0.05)).toHaveLength(100);
  });
});

describe("le livre écrit", () => {
  it("montre une colonne par écran et une ligne par case", () => {
    const texte = texteLivre(livreEcrans({ ...LIVRE, dureeSec: 1, aleatoire: tirage() }), { frequenceMinHz: 100, frequenceMaxHz: 6400 }, false);
    const trame = texte.split("\n").filter((l) => /[█·]/.test(l));
    expect(trame).toHaveLength(18);
    expect(trame[0]).toContain("Hz");
    expect(texte).toContain("écrans");
  });

  it("annonce combien d'écrans il a montrés quand le livre est plus long", () => {
    const texte = texteLivre(livreEcrans({ ...LIVRE, dureeSec: 20, aleatoire: tirage() }), { frequenceMinHz: 100, frequenceMaxHz: 6400 }, false);
    expect(texte).toContain("64 premiers écrans");
  });

  it("un livre vide le dit plutôt que de rendre une trame vide", () => {
    expect(texteLivre([], { frequenceMinHz: 100, frequenceMaxHz: 6400 }, false)).toContain("vide");
  });
});
