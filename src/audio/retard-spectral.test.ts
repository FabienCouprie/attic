// audio/retard-spectral.test.ts — Le grave doit vraiment sortir après l'aigu.
//
// La promesse de cet effet est une promesse de TEMPS, et elle se mesure : on envoie une bouffée
// grave, puis une bouffée aiguë, et on regarde quand chacune ressort. La théorie donne le nombre
// attendu — `sections × τ(ω)` — et le test le compare à ce qui sort, plutôt que de se contenter
// de constater que « ça change quelque chose ».
import { describe, expect, it } from "vitest";
import { longueurTraine, retardDeGroupe, retardSpectral } from "./retard-spectral";
import { constante } from "./courbe";

const SR = 8000;

/** Une bouffée sinusoïdale fenêtrée : assez étroite en fréquence pour qu'un retard ait un sens. */
function bouffee(hertz: number, dureeSec: number, longueurSec: number, debutSec = 0.05): Float32Array {
  const n = Math.round(longueurSec * SR);
  const x = new Float32Array(n);
  const debut = Math.round(debutSec * SR), duree = Math.round(dureeSec * SR);
  for (let i = 0; i < duree; i++) {
    const fenetre = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / duree);
    x[debut + i] = 0.8 * fenetre * Math.sin((2 * Math.PI * hertz * (debut + i)) / SR);
  }
  return x;
}

/** Centre de gravité de l'énergie dans le temps, en échantillons. */
function centreTemporel(x: Float32Array): number {
  let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) { const e = x[i] * x[i]; num += i * e; den += e; }
  return den > 1e-20 ? num / den : 0;
}

/**
 * Instant du sommet de l'enveloppe, en échantillons.
 *
 * Le centre de gravité ne convient pas pour mesurer un retard : une bouffée fenêtrée garde des
 * jupes très faibles à l'autre bout du spectre, et ces jupes-là, retardées de neuf cents
 * échantillons, tirent le centre de gravité loin du retard réel. Le sommet de l'enveloppe, lui,
 * ne bouge que si la bouffée bouge — c'est ce qu'on veut mesurer.
 */
function instantDuSommet(x: Float32Array): number {
  const L = 64;
  let somme = 0, meilleur = 0, iMeilleur = 0;
  for (let i = 0; i < x.length; i++) {
    somme += x[i] * x[i];
    if (i >= L) somme -= x[i - L] * x[i - L];
    if (somme > meilleur) { meilleur = somme; iMeilleur = i; }
  }
  return iMeilleur;
}

const energie = (x: Float32Array) => { let e = 0; for (const v of x) e += v * v; return e; };

describe("le retard de groupe d'une section", () => {
  it("vaut ce que dit la formule aux deux bouts du spectre", () => {
    const a = 0.8;
    expect(retardDeGroupe(a, 0)).toBeCloseTo((1 - a) / (1 + a), 10);
    expect(retardDeGroupe(a, Math.PI)).toBeCloseTo((1 + a) / (1 - a), 10);
  });

  it("change de bout quand le coefficient change de signe", () => {
    expect(retardDeGroupe(-0.8, 0)).toBeCloseTo(retardDeGroupe(0.8, Math.PI), 10);
    expect(retardDeGroupe(-0.8, Math.PI)).toBeCloseTo(retardDeGroupe(0.8, 0), 10);
  });

  it("vaut un partout quand il n'y a pas de dispersion : la section est un simple retard", () => {
    for (const w of [0, 0.5, 1.5, Math.PI]) expect(retardDeGroupe(0, w)).toBeCloseTo(1, 10);
  });
});

describe("la cascade", () => {
  it("devient un retard pur, exact à l'échantillon, quand la dispersion est nulle", () => {
    const x = bouffee(500, 0.02, 0.2);
    const M = 40;
    const y = retardSpectral(x, { sections: M, dispersion: 0, versLeGrave: true });
    for (let i = 0; i < x.length - M; i++) expect(y[i + M]).toBeCloseTo(x[i], 5);
  });

  it("RETARDE LE GRAVE PLUS QUE L'AIGU, et du nombre d'échantillons prévu", () => {
    const M = 100, a = 0.8;
    const o = { sections: M, dispersion: a, versLeGrave: true };
    const attendu = (hz: number) => M * retardDeGroupe(-a, (2 * Math.PI * hz) / SR);

    const grave = bouffee(200, 0.04, 0.4), aigu = bouffee(2000, 0.04, 0.4);
    const retardGrave = instantDuSommet(retardSpectral(grave, o)) - instantDuSommet(grave);
    const retardAigu = instantDuSommet(retardSpectral(aigu, o)) - instantDuSommet(aigu);

    // Le contraste est l'effet lui-même : plus de six cents échantillons contre une vingtaine.
    expect(retardGrave, `grave ${retardGrave.toFixed(0)} éch. (théorie ${attendu(200).toFixed(0)})`)
      .toBeGreaterThan(retardAigu * 5);
    // Et chacun tombe sur ce que la formule annonce, à 20 % près — une bouffée n'est pas une
    // fréquence pure, et le retard de groupe varie sur la largeur de sa bande.
    expect(Math.abs(retardGrave / attendu(200) - 1),
      `mesuré ${retardGrave}, théorie ${attendu(200).toFixed(0)}`).toBeLessThan(0.2);
    expect(Math.abs(retardAigu / attendu(2000) - 1),
      `mesuré ${retardAigu}, théorie ${attendu(2000).toFixed(0)}`).toBeLessThan(0.3);
  });

  it("INVERSE les deux bouts quand le coefficient change de signe", () => {
    // Le bon test est l'ORDRE, et non un rapport : le retard de groupe est très pointu près du
    // bout retardé et plat ailleurs, si bien que 2000 Hz — le milieu du spectre à 8 kHz — n'est
    // pas assez près de Nyquist pour que le contraste y soit du même ordre. Ce qui doit tenir,
    // c'est que le sens s'inverse, et il s'inverse aux MÊMES deux fréquences.
    const grave = bouffee(200, 0.04, 0.4), aigu = bouffee(3500, 0.04, 0.4);
    const retard = (x: Float32Array, versLeGrave: boolean) =>
      instantDuSommet(retardSpectral(x, { sections: 100, dispersion: 0.8, versLeGrave }))
      - instantDuSommet(x);
    expect(retard(grave, true)).toBeGreaterThan(retard(aigu, true) * 3);
    expect(retard(aigu, false)).toBeGreaterThan(retard(grave, false) * 3);
  });

  it("ne change aucune amplitude : l'énergie qui sort est celle qui entre", () => {
    // C'est la définition même d'un passe-tout, et c'est ce qui distingue cet effet d'un filtre :
    // rien n'est coupé, tout est déplacé dans le temps.
    const x = bouffee(600, 0.05, 0.5);
    const y = retardSpectral(x, { sections: 150, dispersion: 0.7, versLeGrave: true });
    expect(energie(y) / energie(x)).toBeCloseTo(1, 1);
  });

  it("laisse le son intact quand on ne prend que le sec", () => {
    const x = bouffee(400, 0.03, 0.3);
    const y = retardSpectral(x, { sections: 200, dispersion: 0.9, versLeGrave: true, melange: 0 });
    // Égalité numérique et non identité : le zéro négatif de l'entrée ressort en zéro positif
    // après `0 × v + 1 × sec`, ce qui ne fait aucune différence pour un son.
    for (let i = 0; i < x.length; i++) expect(y[i] === x[i]).toBe(true);
  });

  it("rend une traîne plus longue que le son, puisque le bout lent sort après la fin", () => {
    // Le son doit être COURT devant le retard, sinon la traîne tombe encore dedans et le test ne
    // mesure rien : ici la bouffée est retardée de six cents échantillons pour un son de sept
    // cent vingt.
    const x = bouffee(300, 0.02, 0.09);
    const M = 200, a = 0.9;
    const y = retardSpectral(x, { sections: M, dispersion: a, versLeGrave: true });
    expect(y.length).toBe(x.length + longueurTraine(M, a));
    // Et il y a bien quelque chose dedans : la traîne n'est pas du silence ajouté pour la forme.
    const apres = y.subarray(x.length);
    expect(energie(apres) / energie(y), `${(100 * energie(apres) / energie(y)).toFixed(0)} % dans la traîne`)
      .toBeGreaterThan(0.3);
  });

  it("répète la traîne quand on la reboucle, chaque tour arrivant plus tard", () => {
    const x = bouffee(400, 0.02, 0.15);
    const sans = retardSpectral(x, { sections: 60, dispersion: 0.8, versLeGrave: true });
    const avec = retardSpectral(x, { sections: 60, dispersion: 0.8, versLeGrave: true, reaction: 0.7 });
    expect(avec.length).toBeGreaterThan(sans.length);
    // Le centre de gravité recule : l'énergie est répartie sur les échos successifs.
    expect(centreTemporel(avec)).toBeGreaterThan(centreTemporel(sans));
    expect([...avec].every(Number.isFinite)).toBe(true);
  });

  it("BORNE SA TRAÎNE aux réglages extrêmes, au lieu de calculer pendant des heures", () => {
    // Sans borne, ce réglage demandait douze milliards d'opérations : la traîne croît comme
    // (1+a)/(1−a), soit huit cent mille échantillons à 0,999 et quatre cents sections, et le
    // rebouclage la répète quarante fois. C'est la borne qui rend le réglage utilisable.
    const x = bouffee(500, 0.02, 0.15);
    const t0 = Date.now();
    const y = retardSpectral(x, {
      sections: 400, dispersion: 0.999, versLeGrave: true, reaction: 0.99, traineMax: 4 * x.length,
    });
    expect(y.length).toBe(5 * x.length);
    expect(Date.now() - t0, "le rendu doit rester rapide même ainsi réglé").toBeLessThan(10000);
    expect([...y].every(Number.isFinite)).toBe(true);
    let crete = 0; for (const v of y) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThan(100);
  });

  it("borne la traîne à huit fois le son quand on ne dit rien", () => {
    const x = bouffee(500, 0.02, 0.1);
    const y = retardSpectral(x, { sections: 400, dispersion: 0.999, versLeGrave: true });
    expect(y.length).toBe(9 * x.length);
  });
});

describe("la dispersion modulée", () => {
  it("TIENT L'INVARIANT : une courbe plate rend exactement l'effet ordinaire", () => {
    // Le même invariant que les effets adaptatifs, et pour la même raison : il n'y a qu'un seul
    // chemin de calcul, l'absence de courbe étant une courbe constante à la valeur du réglage.
    const x = bouffee(500, 0.03, 0.3);
    const d = 0.75;
    const ordinaire = retardSpectral(x, { sections: 80, dispersion: d, versLeGrave: true });
    const module = retardSpectral(x, {
      sections: 80, dispersion: 0, versLeGrave: true,
      courbe: constante(0.5, 2), plage: { min: d, max: d },
    });
    // La courbe est rangée en Float32 : on compare donc au scalaire arrondi de la même façon.
    expect(module.length).toBe(ordinaire.length);
    for (let i = 0; i < ordinaire.length; i += 7) expect(module[i]).toBeCloseTo(ordinaire[i], 6);
  });

  it("fait varier le retard quand la courbe varie", () => {
    const x = bouffee(300, 0.04, 0.4);
    const fixe = retardSpectral(x, { sections: 100, dispersion: 0.5, versLeGrave: true });
    const monte = retardSpectral(x, {
      sections: 100, dispersion: 0.5, versLeGrave: true,
      courbe: { valeurs: Float32Array.from({ length: 200 }, (_, i) => i / 199), cadence: 200 },
      plage: { min: 0.2, max: 0.95 },
    });
    expect(centreTemporel(monte)).not.toBeCloseTo(centreTemporel(fixe), 0);
    expect([...monte].every(Number.isFinite)).toBe(true);
  });
});
