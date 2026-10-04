// ui/rouleau-calcul.test.ts — Un quart de ton se voit-il sur le rouleau ?
//
// CE QUE CES TESTS CONTRÔLENT. Un rouleau ne se vérifie pas à l'œil : une barre décalée d'une rangée
// reste un dessin plausible, et un axe dont l'aigu serait en bas se lit encore comme de la musique.
// Sont donc éprouvés ici les points où une faute passerait inaperçue : le sens de l'axe des
// hauteurs, le chevauchement d'un microton, la barre d'une attaque brève qui ne doit pas s'annuler,
// et ce qui arrive à une séquence vide ou trop grosse.
import { describe, expect, it } from "vitest";

import type { Note } from "../audio/note";
import type { Sequence } from "../audio/sequence";

import {
  BARRES_MAX, bandeDeNuance, bornesDeHauteur, disposerRouleau, graduationsDuTemps,
  LARGEUR_MIN, NUANCES,
} from "./rouleau-calcul";

const note = (n: number, debut: number, fin: number, reste: Partial<Note> = {}): Note =>
  ({ note: n, velocite: 100, debut, fin, ...reste });

const seq = (notes: Note[], reste: Partial<Sequence> = {}): Sequence => ({ notes, ...reste });

describe("les bornes de hauteur", () => {
  it("SONT ENTIÈRES MÊME SUR DES MICROTONS, faute de quoi le damier se décale", () => {
    const b = bornesDeHauteur([note(60.4, 0, 1), note(67.8, 1, 2)]);
    expect(Number.isInteger(b.basse)).toBe(true);
    expect(Number.isInteger(b.aigue)).toBe(true);
    // 60,4 arrondi vers le bas moins la marge, 67,8 arrondi vers le haut plus la marge.
    expect(b).toEqual({ basse: 58, aigue: 70 });
  });

  it("OUVRENT AU MOINS UNE OCTAVE : une note seule ne remplit pas le nœud d'une barre", () => {
    const b = bornesDeHauteur([note(60, 0, 1)]);
    expect(b.aigue - b.basse).toBeGreaterThanOrEqual(12);
    expect(b.basse).toBeLessThan(60);
    expect(b.aigue).toBeGreaterThan(60);
  });

  it("montrent l'octave du do central quand il n'y a aucune note", () => {
    expect(bornesDeHauteur([])).toEqual({ basse: 60, aigue: 72 });
  });

  it("encadrent toutes les notes, jusqu'aux extrêmes du clavier", () => {
    const b = bornesDeHauteur([note(21, 0, 1), note(108, 0, 1)]);
    expect(b.basse).toBeLessThanOrEqual(21);
    expect(b.aigue).toBeGreaterThanOrEqual(108);
  });
});

describe("le sens de l'axe des hauteurs", () => {
  it("L'AIGU EST EN HAUT : une note plus haute a une ordonnée plus petite", () => {
    const r = disposerRouleau(seq([note(60, 0, 1), note(72, 0, 1)]));
    const grave = r.barres.find((b) => b.note === 60)!;
    const aigue = r.barres.find((b) => b.note === 72)!;
    expect(aigue.y).toBeLessThan(grave.y);
  });

  it("une barre tient dans le dessin, bord bas compris", () => {
    const r = disposerRouleau(seq([note(40, 0, 1), note(60.5, 0, 1), note(100, 0, 1)]));
    for (const b of r.barres) {
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + r.epaisseur).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("une barre occupe exactement une rangée, et se pose dessus", () => {
    const r = disposerRouleau(seq([note(64, 0, 1)]));
    const rangee = r.rangees.find((x) => x.note === 64)!;
    expect(r.barres[0].y).toBeCloseTo(rangee.y, 12);
  });
});

describe("le microton, qui est la raison du rouleau", () => {
  it("UN QUART DE TON CHEVAUCHE DEUX RANGÉES au lieu de se poser sur l'une", () => {
    const r = disposerRouleau(seq([note(60.5, 0, 1)]));
    const barre = r.barres[0];
    const soixante = r.rangees.find((x) => x.note === 60)!;
    const soixanteUn = r.rangees.find((x) => x.note === 61)!;
    // La barre commence entre les deux rangées : elle n'est alignée sur ni l'une ni l'autre.
    expect(barre.y).toBeLessThan(soixante.y);
    expect(barre.y).toBeGreaterThan(soixanteUn.y);
    // Et elle mord sur les deux, ce qui est ce qu'on vient voir.
    expect(barre.y + r.epaisseur).toBeGreaterThan(soixante.y);
  });

  it("le décalage est proportionnel à l'écart, et non arrondi", () => {
    const r = disposerRouleau(seq([note(60, 0, 1), note(60.25, 0, 1), note(60.75, 0, 1)]));
    const y = (n: number) => r.barres.find((b) => b.note === n)!.y;
    expect(y(60) - y(60.25)).toBeCloseTo(0.25 * r.epaisseur, 12);
    expect(y(60) - y(60.75)).toBeCloseTo(0.75 * r.epaisseur, 12);
  });

  it("dit son écart en cents dans son nom, et se compte", () => {
    const r = disposerRouleau(seq([note(60, 0, 1), note(69.4, 1, 2)]));
    expect(r.barres.find((b) => b.note === 60)!.nom).toBe("C4");
    expect(r.barres.find((b) => b.note === 69.4)!.nom).toBe("A4+40");
    expect(r.microtons).toBe(1);
    expect(r.barres.find((b) => b.note === 69.4)!.microton).toBe(true);
    expect(r.barres.find((b) => b.note === 60)!.microton).toBe(false);
  });
});

describe("l'axe du temps", () => {
  it("UNE ATTAQUE BRÈVE RESTE VISIBLE : une barre ne s'annule pas", () => {
    // Une note de longueur nulle existe — une attaque de percussion en est une —, et une largeur
    // nulle la ferait disparaître du dessin sans rien dire.
    const r = disposerRouleau(seq([note(60, 0, 0), note(62, 1, 1.0005)], { duree: 4 }));
    for (const b of r.barres) expect(b.largeur).toBeGreaterThanOrEqual(LARGEUR_MIN);
  });

  it("LE SILENCE FINAL SE VOIT : l'axe va jusqu'à la durée voulue, non jusqu'à la dernière note", () => {
    const r = disposerRouleau(seq([note(60, 0, 1.5)], { duree: 2 }));
    expect(r.duree).toBe(2);
    expect(r.finNotes).toBe(1.5);
    expect(r.xFinNotes).toBeCloseTo(0.75, 12);
  });

  it("sans durée voulue, l'axe s'arrête sur la dernière note", () => {
    const r = disposerRouleau(seq([note(60, 0, 3)]));
    expect(r.duree).toBe(3);
    expect(r.xFinNotes).toBe(1);
  });

  it("les graduations vont d'un bout à l'autre, et la dernière n'est pas perdue", () => {
    const g = graduationsDuTemps(2, 1000);
    expect(g[0].secondes).toBe(0);
    expect(g[g.length - 1].secondes).toBeCloseTo(2, 9);
    for (const x of g) expect(x.x).toBeGreaterThanOrEqual(0), expect(x.x).toBeLessThanOrEqual(1);
  });

  it("les étiquettes gagnent des décimales quand le pas se resserre", () => {
    expect(graduationsDuTemps(20, 1000)[1].etiquette).toBe("2");
    expect(graduationsDuTemps(0.5, 1000).some((x) => x.etiquette.includes("."))).toBe(true);
  });
});

describe("les rangées, qui font le damier", () => {
  it("il y a une rangée par demi-ton, sans trou ni doublon", () => {
    const r = disposerRouleau(seq([note(60, 0, 1), note(84, 0, 1)]));
    expect(r.rangees).toHaveLength(r.aigue - r.basse);
    expect(new Set(r.rangees.map((x) => x.note)).size).toBe(r.rangees.length);
  });

  it("LES TOUCHES NOIRES SONT AUX BONNES PLACES, sans quoi le rouleau ne se lit pas", () => {
    const r = disposerRouleau(seq([note(60, 0, 1), note(72, 0, 1)]));
    const noire = (n: number) => r.rangees.find((x) => x.note === n)!.noire;
    expect([60, 62, 64, 65, 67, 69, 71].map(noire)).toEqual([false, false, false, false, false, false, false]);
    expect([61, 63, 66, 68, 70].map(noire)).toEqual([true, true, true, true, true]);
  });

  it("seuls les do portent une étiquette", () => {
    const r = disposerRouleau(seq([note(55, 0, 1), note(80, 0, 1)]));
    const nommees = r.rangees.filter((x) => x.etiquette);
    expect(nommees.map((x) => x.note % 12)).toEqual(nommees.map(() => 0));
    expect(nommees.map((x) => x.etiquette)).toContain("C4");
  });
});

describe("les voix", () => {
  it("se comptent, et prennent le nom que la séquence leur donne", () => {
    const r = disposerRouleau(seq(
      [note(72, 0, 1, { voix: 0 }), note(74, 1, 2, { voix: 0 }), note(48, 0, 2, { voix: 1 })],
      { voix: [{ numero: 0, nom: "Dessus" }, { numero: 1, nom: "Basse" }] },
    ));
    expect(r.voix).toEqual([
      { numero: 0, nom: "Dessus", notes: 2 },
      { numero: 1, nom: "Basse", notes: 1 },
    ]);
  });

  it("une note sans voix appartient à la première", () => {
    const r = disposerRouleau(seq([note(60, 0, 1)]));
    expect(r.barres[0].voix).toBe(0);
    expect(r.voix).toEqual([{ numero: 0, nom: undefined, notes: 1 }]);
  });
});

describe("la nuance", () => {
  it("se range en quatre bandes, des plus faibles aux plus fortes", () => {
    expect(bandeDeNuance(0)).toBe(0);
    expect(bandeDeNuance(127)).toBe(NUANCES - 1);
    expect(bandeDeNuance(64)).toBe(2);
    // Une vélocité hors bornes ne doit pas sortir des bandes : elle serait dessinée sans classe.
    expect(bandeDeNuance(-5)).toBe(0);
    expect(bandeDeNuance(999)).toBe(NUANCES - 1);
    expect(bandeDeNuance(NaN)).toBe(NUANCES - 1);
  });
});

describe("ce qui ne tient pas dans le dessin", () => {
  it("GARDE LE DÉBUT DE TOUT, ET NON UNE SEULE VOIX : les notes sont prises dans l'ordre du temps", () => {
    // Une séquence rangée par voix : la basse d'abord, tout entière, puis le dessus. Garder les
    // premières du tableau montrerait la basse seule.
    const notes: Note[] = [];
    for (let i = 0; i < BARRES_MAX; i++) notes.push(note(48, i, i + 1, { voix: 1 }));
    for (let i = 0; i < 10; i++) notes.push(note(72, i, i + 1, { voix: 0 }));
    const r = disposerRouleau(seq(notes));
    expect(r.barres).toHaveLength(BARRES_MAX);
    expect(r.laissees).toBe(10);
    expect(r.barres.some((b) => b.voix === 0)).toBe(true);
  });

  it("nomme quand même une voix entièrement laissée de côté", () => {
    const notes: Note[] = [];
    for (let i = 0; i < BARRES_MAX + 5; i++) notes.push(note(48, i, i + 1, { voix: 0 }));
    notes.push(note(72, BARRES_MAX + 100, BARRES_MAX + 101, { voix: 1 }));
    const r = disposerRouleau(seq(notes));
    expect(r.barres.some((b) => b.voix === 1)).toBe(false);
    expect(r.voix.map((v) => v.numero)).toEqual([0, 1]);
  });
});

describe("les cas où un dessin se casse sans le dire", () => {
  it("UNE SÉQUENCE VIDE NE PRODUIT AUCUN NOMBRE INVALIDE", () => {
    const r = disposerRouleau(seq([]));
    expect(r.barres).toHaveLength(0);
    expect(r.rangees.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.duree)).toBe(true);
    expect(r.duree).toBeGreaterThan(0);
    for (const g of r.graduations) expect(Number.isFinite(g.x)).toBe(true);
    expect(Number.isFinite(r.epaisseur)).toBe(true);
    expect(r.voix).toEqual([]);
  });

  it("des notes toutes au temps zéro et de longueur nulle donnent encore un axe", () => {
    const r = disposerRouleau(seq([note(60, 0, 0), note(64, 0, 0)]));
    expect(Number.isFinite(r.duree)).toBe(true);
    expect(r.duree).toBeGreaterThan(0);
    for (const b of r.barres) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.largeur)).toBe(true);
    }
  });

  it("une note à l'infini ou sans nombre est écartée, et ne casse pas les bornes", () => {
    const r = disposerRouleau(seq([
      note(60, 0, 1), { note: NaN, velocite: 100, debut: 0, fin: 1 },
      { note: 64, velocite: 100, debut: 0, fin: Infinity },
    ]));
    expect(r.barres).toHaveLength(1);
    expect(Number.isFinite(r.basse)).toBe(true);
    expect(Number.isFinite(r.aigue)).toBe(true);
  });
});
