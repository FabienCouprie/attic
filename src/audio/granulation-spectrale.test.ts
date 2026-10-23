// audio/granulation-spectrale.test.ts — Le grain dans le domaine des fréquences.
//
// D'après Fasciani, ICMC 2018. Ce qui est tenu ici, c'est ce qui SÉPARE cette méthode d'une
// granulation ordinaire, et non le fait qu'elle rende du son : un nœud qui rend du bruit quels que
// soient les réglages serait un générateur de bruit avec une bibliographie.
import { describe, expect, it } from "vitest";
import {
  fenetreDeGrain, granulerSpectre, redimensionnerSpectre, tournerSpectre,
  type OptionsGranulationSpectrale,
} from "./granulation-spectrale";

const SR = 16000;

/** Un témoin à spectre connu : trois partiels, donc trois raies à retrouver. */
function temoin(dureeS = 1, f0 = 250): Float32Array {
  const n = Math.round(dureeS * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = 0.5 * Math.sin(2 * Math.PI * f0 * t)
      + 0.3 * Math.sin(2 * Math.PI * 2 * f0 * t)
      + 0.2 * Math.sin(2 * Math.PI * 3 * f0 * t);
  }
  return x;
}

const BASE: OptionsGranulationSpectrale = {
  dureeS: 0.5, tailleLue: 1024, tailleEcrite: 1024, recouvrement: 0.75,
  fenetre: "hann", extraction: "fixe", position: 0.5, vitesse: 1, dispersion: 0,
  decalage: 0, phase: "pghi", iterations: 8, graine: 1, sampleRate: SR,
};

const crete = (x: Float32Array) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };

/** La fréquence du plus fort partiel, par une transformée grossière sur tout le son. */
function hauteurDominante(x: Float32Array): number {
  const n = 4096;
  let meilleur = 0, rang = 0;
  for (let k = 1; k < n / 2; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < Math.min(n, x.length); i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += x[i] * Math.cos(a); im += x[i] * Math.sin(a);
    }
    const m = Math.hypot(re, im);
    if (m > meilleur) { meilleur = m; rang = k; }
  }
  return (rang * SR) / n;
}

describe("les pièces du procédé", () => {
  it("les trois fenêtres valent zéro aux bords et un au centre, sauf celle qui ne descend pas à zéro", () => {
    for (const type of ["hann", "hamming", "blackman"] as const) {
      const f = fenetreDeGrain(type, 64);
      expect(f[32], type).toBeGreaterThan(0.9);
      // Hamming s'arrête à 0,08 : c'est sa définition, et c'est ce qui la distingue de Hann.
      expect(f[0], type).toBeLessThan(type === "hamming" ? 0.09 : 0.01);
    }
  });

  it("LE SPECTRE SE REDIMENSIONNE EN GARDANT SA FORME, ce qui est tout le procédé", () => {
    // Une rampe reste une rampe : c'est la propriété qui permet de resynthétiser un grain à une
    // autre taille sans transposer ni étirer l'onde.
    const source = new Float32Array(9);
    for (let k = 0; k < 9; k++) source[k] = k / 8;
    const grand = redimensionnerSpectre(source, 17);
    expect(grand[0]).toBeCloseTo(0, 6);
    expect(grand[16]).toBeCloseTo(1, 6);
    expect(grand[8]).toBeCloseTo(0.5, 6);
    const petit = redimensionnerSpectre(source, 5);
    expect(petit[0]).toBeCloseTo(0, 6);
    expect(petit[4]).toBeCloseTo(1, 6);
    expect(petit[2]).toBeCloseTo(0.5, 6);
  });

  it("LA ROTATION DU SPECTRE GARDE TOUTE L'ÉNERGIE, là où un glissement en perdrait", () => {
    const m = Float32Array.from([1, 2, 3, 4, 5]);
    const tourne = tournerSpectre(m, 2);
    expect([...tourne]).toEqual([4, 5, 1, 2, 3]);
    const somme = (x: Float32Array) => [...x].reduce((a, b) => a + b, 0);
    expect(somme(tourne)).toBe(somme(m));
    // Un décalage d'un tour entier ne change rien, et un décalage négatif tourne dans l'autre sens.
    expect([...tournerSpectre(m, 5)]).toEqual([...m]);
    expect([...tournerSpectre(m, -1)]).toEqual([2, 3, 4, 5, 1]);
  });

  it("une taille qui n'est pas une puissance de deux est refusée, plutôt que rendue de travers", () => {
    expect(() => granulerSpectre(temoin(), { ...BASE, tailleLue: 1000 })).toThrow(/1000/);
    expect(() => granulerSpectre(temoin(), { ...BASE, tailleEcrite: 3 })).toThrow();
  });
});

describe("la granulation spectrale", () => {
  it("rend un son de la durée demandée, et qui n'est pas vide", () => {
    const { son, trames } = granulerSpectre(temoin(), BASE);
    expect(son.length).toBe(Math.round(BASE.dureeS * SR));
    expect(trames).toBeGreaterThan(1);
    expect(crete(son)).toBeGreaterThan(0.01);
    for (const v of son) expect(Number.isFinite(v)).toBe(true);
  });

  it("GARDE LA HAUTEUR DU SON LU, ce qui prouve que c'est bien son spectre qui est posé", () => {
    // SANS CE CAS, LE NŒUD POURRAIT RENDRE DU BRUIT. Le témoin porte trois partiels sur 250 Hz ;
    // le son rendu doit porter le même fondamental, à la résolution de la mesure près.
    const { son } = granulerSpectre(temoin(1, 250), BASE);
    expect(hauteurDominante(son)).toBeCloseTo(250, -1);
  });

  it("LA TAILLE ÉCRITE SE SÉPARE DE LA TAILLE LUE, et c'est ce qu'une granulation ordinaire ne sait pas faire", () => {
    // LE GRAIN LU RESTE LE MÊME, seule la taille à laquelle on le réécrit change. Le son reste du
    // son, et sa hauteur ne suit PAS la taille écrite : un étirement d'onde, lui, transposerait.
    const lu = temoin(1, 250);
    for (const tailleEcrite of [512, 2048]) {
      const { son } = granulerSpectre(lu, { ...BASE, tailleEcrite });
      expect(crete(son), `taille écrite ${tailleEcrite}`).toBeGreaterThan(0.01);
      expect(hauteurDominante(son), `taille écrite ${tailleEcrite}`).toBeCloseTo(250, -1);
    }
  });

  it("ET CHAQUE TAILLE ÉCRITE DONNE UN AUTRE SON, sinon le réglage serait inerte", () => {
    const lu = temoin(1, 250);
    const a = granulerSpectre(lu, { ...BASE, tailleEcrite: 512 }).son;
    const b = granulerSpectre(lu, { ...BASE, tailleEcrite: 2048 }).son;
    let ecart = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeGreaterThan(0.01);
  });

  it("LA ROTATION DU SPECTRE DÉPLACE LA HAUTEUR, et c'est à cela qu'on l'entend", () => {
    const lu = temoin(1, 250);
    const sans = hauteurDominante(granulerSpectre(lu, BASE).son);
    const avec = hauteurDominante(granulerSpectre(lu, { ...BASE, decalage: 0.1 }).son);
    expect(Math.abs(avec - sans), "le décalage doit s'entendre").toBeGreaterThan(50);
  });

  it("les trois reconstructions de phase rendent du son, et PGHI intègre une part réelle", () => {
    const lu = temoin();
    for (const phase of ["pghi", "griffin", "nulle"] as const) {
      expect(crete(granulerSpectre(lu, { ...BASE, phase }).son), phase).toBeGreaterThan(0.001);
    }
    // MESURÉ : 0,144 SUR CE TÉMOIN, ET C'EST BEAUCOUP PLUS BAS QUE JE NE L'ATTENDAIS. J'avais
    // écrit « la plus grande part » avant de mesurer, et c'était faux. La raison tient au son :
    // le spectre d'un grain tonal est presque VIDE entre ses partiels, et PGHI ne propage pas un
    // point dont le module est sous sa tolérance, précisément pour que le bruit numérique d'une
    // zone creuse ne contamine pas le reste. Une part basse sur un son tonal est donc le signe
    // que la tolérance fait son travail, non qu'elle échoue.
    const { partIntegree } = granulerSpectre(lu, BASE);
    expect(partIntegree, "PGHI n'intègre rien du tout").toBeGreaterThan(0.05);
  });

  it("ET LES TROIS NE RENDENT PAS LE MÊME SON : la phase n'est pas un détail", () => {
    const lu = temoin();
    const a = granulerSpectre(lu, { ...BASE, phase: "pghi" }).son;
    const b = granulerSpectre(lu, { ...BASE, phase: "nulle" }).son;
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeGreaterThan(0.01);
  });

  it("L'EXTRACTION SÉQUENTIELLE PARCOURT LE SON, là où la fixe reste au même endroit", () => {
    // DEUX SONS COLLÉS, l'un grave et l'autre aigu : un parcours doit passer de l'un à l'autre, un
    // point fixe ne doit entendre que celui où il est posé.
    const n = SR;
    const double = new Float32Array(2 * n);
    const bas = temoin(1, 200), haut = temoin(1, 800);
    double.set(bas, 0); double.set(haut, n);

    const fixe = granulerSpectre(double, { ...BASE, extraction: "fixe", position: 0 });
    expect(hauteurDominante(fixe.son), "posé au début, on entend le grave").toBeCloseTo(200, -1.5);

    const parcours = granulerSpectre(double, { ...BASE, extraction: "sequentielle", position: 0, vitesse: 2, dureeS: 1 });
    let ecart = 0;
    for (let i = 0; i < Math.min(fixe.son.length, parcours.son.length); i++) {
      ecart = Math.max(ecart, Math.abs(fixe.son[i] - parcours.son[i]));
    }
    expect(ecart, "le parcours doit rendre autre chose que le point fixe").toBeGreaterThan(0.01);
  });

  it("LA VITESSE NE DÉPEND PAS DU RECOUVREMENT, parce qu'elle se compte en secondes de sortie", () => {
    // CE CAS ARRÊTE UNE FAUTE FACILE : compter l'avance en TRAMES ferait que changer le
    // recouvrement changerait la vitesse de lecture, donc deux réglages liés sans le dire.
    const n = SR;
    const double = new Float32Array(2 * n);
    double.set(temoin(1, 200), 0); double.set(temoin(1, 800), n);
    const ou = (recouvrement: number) => {
      const r = granulerSpectre(double, { ...BASE, extraction: "sequentielle", position: 0, vitesse: 1, recouvrement, dureeS: 0.5 });
      return hauteurDominante(r.son);
    };
    expect(Math.abs(ou(0.5) - ou(0.875)), "la hauteur atteinte doit être la même").toBeLessThan(120);
  });

  it("LA MÊME GRAINE REND LE MÊME SON, et deux graines en rendent deux", () => {
    const lu = temoin();
    const o = { ...BASE, extraction: "aleatoire" as const };
    const a = granulerSpectre(lu, { ...o, graine: 7 }).son;
    const b = granulerSpectre(lu, { ...o, graine: 7 }).son;
    const c = granulerSpectre(lu, { ...o, graine: 8 }).son;
    expect([...a]).toEqual([...b]);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - c[i]));
    expect(ecart, "deux graines doivent rendre deux sons").toBeGreaterThan(0.001);
  });

  it("un son plus court qu'un grain se lit quand même, plutôt que de rendre un trou", () => {
    const court = temoin(0.01);
    const { son } = granulerSpectre(court, { ...BASE, tailleLue: 2048 });
    expect(crete(son)).toBeGreaterThan(0);
    for (const v of son) expect(Number.isFinite(v)).toBe(true);
  });
});
