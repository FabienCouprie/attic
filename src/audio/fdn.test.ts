// audio/fdn.test.ts — La promesse de ce nœud est un TEMPS PAR BANDE, et c'est donc cela qu'on mesure.
//
// Toute la valeur du réseau de Jot et Chaigne tient dans le fait que le RT60 est réglable et
// différent selon la fréquence. Le vérifier demande de mesurer la décroissance BANDE PAR BANDE, par
// l'intégrale de Schroeder sur la réponse obtenue — la mesure de la littérature. Sans cela, on ne
// saurait que constater qu'« il se passe quelque chose ».
import { describe, expect, it } from "vitest";
import {
  coefficientsAbsorption, estPremier, filtrerBande, hadamard, reponseFdn,
  retardsPremiers, rt60Mesure, traiterFdn,
} from "./fdn";

const SR = 16000;

describe("la matrice de rétroaction", () => {
  it("est UNITAIRE : elle conserve l'énergie, sans quoi le réseau ne tiendrait pas", () => {
    for (const n of [4, 8, 16]) {
      const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.7) + 0.3 * i);
      let avant = 0; for (const v of x) avant += v * v;
      hadamard(x);
      let apres = 0; for (const v of x) apres += v * v;
      expect(apres, `n=${n}`).toBeCloseTo(avant, 8);
    }
  });

  it("mélange vraiment : une seule entrée non nulle ressort partout", () => {
    const x = new Float64Array(8);
    x[3] = 1;
    hadamard(x);
    for (const v of x) expect(Math.abs(v)).toBeCloseTo(1 / Math.sqrt(8), 10);
  });
});

describe("les longueurs de retard", () => {
  it("sont premières, donc sans diviseur commun", () => {
    const r = retardsPremiers(8, 200, 1200);
    expect(r.length).toBe(8);
    for (const m of r) expect(estPremier(m)).toBe(true);
    expect(new Set(r).size).toBe(8);
  });

  it("couvrent la plage demandée en montant", () => {
    const r = retardsPremiers(8, 200, 1200);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
    expect(r[0]).toBeGreaterThanOrEqual(200);
    expect(r[r.length - 1]).toBeGreaterThanOrEqual(1100);
  });
});

describe("les coefficients d'absorption", () => {
  /** Module du filtre d'absorption à une fréquence donnée. */
  const moduleAbsorption = (g: number, a: number, f: number, sr: number) => {
    const w = (2 * Math.PI * f) / sr;
    return (g * (1 - a)) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a);
  };

  it("donnent le gain que la dérivation annonce, au continu comme À LA FRÉQUENCE DE RÉFÉRENCE", () => {
    const m = 500, sr = 16000, tBas = 2, tHaut = 0.5, fRef = 6000;
    const { g, a } = coefficientsAbsorption(m, tBas, tHaut, sr, fRef);
    expect(g).toBeCloseTo(Math.pow(10, (-3 * m) / (tBas * sr)), 12);
    // C'est là tout l'intérêt de résoudre l'équation du second degré plutôt qu'à Nyquist : le
    // module tombe JUSTE à la fréquence qu'on a choisie, et non à une fréquence qu'on n'écoute pas.
    expect(moduleAbsorption(g, a, fRef, sr)).toBeCloseTo(Math.pow(10, (-3 * m) / (tHaut * sr)), 10);
  });

  it("tombent juste à n'importe quelle fréquence de référence qu'on leur donne", () => {
    for (const fRef of [1000, 4000, 8000, 15000]) {
      const sr = 44100, m = 1019, tBas = 3, tHaut = 0.8;
      const { g, a } = coefficientsAbsorption(m, tBas, tHaut, sr, fRef);
      expect(moduleAbsorption(g, a, fRef, sr), `à ${fRef} Hz`)
        .toBeCloseTo(Math.pow(10, (-3 * m) / (tHaut * sr)), 9);
    }
  });

  it("ne demandent aucune absorption quand les deux temps sont égaux", () => {
    const { a } = coefficientsAbsorption(500, 1.5, 1.5, SR);
    expect(a).toBe(0);
  });

  it("RETOURNENT le filtre quand on demande un aigu plus long que le grave", () => {
    // Cas qu'aucune salle réelle ne présente, mais qu'on peut vouloir comme effet. Le coefficient
    // devient NÉGATIF — le passe-bas se fait passe-haut — et c'est la seule chose qui rende le
    // réglage effectif. Une première version bornait le calcul et ramenait le filtre à plat : le
    // réglage existait et ne faisait rien, ce qu'aucun test ne voyait.
    const m = 500, tBas = 0.5, tHaut = 3, fRef = 6000;
    const { g, a } = coefficientsAbsorption(m, tBas, tHaut, SR, fRef);
    expect(a).toBeLessThan(0);
    expect(Math.abs(a)).toBeLessThan(1);
    // Le sens est respecté : l'aigu s'atténue MOINS que le grave.
    const aigu = moduleAbsorption(g, a, fRef, SR);
    expect(aigu).toBeGreaterThan(g);
    // Mais la demande n'est pas forcément tenue jusqu'au bout, et c'est voulu : le garde-fou de
    // stabilité borne l'absorption, si bien que le gain visé est une BORNE SUPÉRIEURE et non une
    // promesse. Mesuré ici : 0,912 obtenu pour 0,931 demandé — la différence est le prix de ne pas
    // exploser. Ce qui est garanti, c'est que la boucle reste sous l'unité partout.
    const vise = Math.pow(10, (-3 * m) / (tHaut * SR));
    expect(aigu).toBeLessThanOrEqual(vise + 1e-12);
    expect(moduleAbsorption(g, a, SR / 2 - 1, SR)).toBeLessThan(1);
  });
});

describe("la réverbération", () => {
  it("TIENT LE RT60 DEMANDÉ, et pas le même selon la bande", () => {
    // C'est le test qui compte. On demande deux secondes au grave et une demi-seconde à l'aigu, et
    // on mesure ce qu'on obtient, par l'intégrale de Schroeder, dans une bande grave et une aiguë.
    const { gauche } = reponseFdn({
      sampleRate: SR, lignes: 8, retardMin: 23, retardMax: 79,
      rt60Bas: 2, rt60Haut: 0.5, freqRef: 6000, queue: 3,
    });
    // Les deux réglages portent sur les DEUX BOUTS du spectre : le filtre d'absorption est d'ordre
    // un, donc son module vaut exactement ce qu'on a demandé au continu et à Nyquist, et passe
    // graduellement de l'un à l'autre entre les deux. On mesure donc aux deux bouts, et le milieu
    // du spectre tombe entre les deux — ce qui est le comportement voulu, pas un défaut.
    // La bande de mesure doit être ÉTROITE : un passe-bande large laisse entrer les fréquences
    // voisines, qui décroissent plus lentement, et la queue mesurée est alors celle de la fuite.
    // Mesuré sur la même réponse, à 8 kHz pour un RT60 demandé de 0,50 s : 0,93 s à Q = 2, 0,72 à
    // Q = 6, 0,58 à Q = 20. Ce n'est pas la conception qui dérive, c'est la mesure qui s'élargit.
    const bas = rt60Mesure(filtrerBande(gauche, SR, 150, 8), SR);
    const milieu = rt60Mesure(filtrerBande(gauche, SR, 2000, 8), SR);
    const haut = rt60Mesure(filtrerBande(gauche, SR, 6000, 8), SR);
    const dit = `grave ${bas.toFixed(2)} s (demandé 2,00) · milieu ${milieu.toFixed(2)} · aigu ${haut.toFixed(2)} (demandé 0,50)`;
    expect(bas, dit).toBeGreaterThan(1.4);
    expect(bas, dit).toBeLessThan(2.6);
    expect(haut, dit).toBeGreaterThan(0.3);
    expect(haut, dit).toBeLessThan(0.9);
    // Le milieu est bien entre les deux : la transition est monotone.
    expect(milieu, dit).toBeLessThan(bas);
    expect(milieu, dit).toBeGreaterThan(haut);
    expect(bas / haut, dit).toBeGreaterThan(2.5);
  });

  it("suit le réglage : doubler le temps demandé double le temps mesuré", () => {
    const mesurer = (rt: number) => {
      const { gauche } = reponseFdn({ sampleRate: SR, rt60Bas: rt, rt60Haut: rt, queue: rt * 1.8 });
      return rt60Mesure(filtrerBande(gauche, SR, 500), SR);
    };
    const court = mesurer(0.6), long = mesurer(1.2);
    expect(long / court, `0,6 s → ${court.toFixed(2)} · 1,2 s → ${long.toFixed(2)}`)
      .toBeGreaterThan(1.6);
  });

  it("s'éteint : sans absorption le réseau serait perpétuel, avec elle il décroît", () => {
    const { gauche } = reponseFdn({ sampleRate: SR, rt60Bas: 0.5, rt60Haut: 0.5, queue: 2 });
    const n = gauche.length;
    let debut = 0, fin = 0;
    for (let i = 0; i < n / 8; i++) debut += gauche[i] * gauche[i];
    for (let i = n - Math.floor(n / 8); i < n; i++) fin += gauche[i] * gauche[i];
    expect(fin).toBeLessThan(debut * 1e-4);
    expect([...gauche].every(Number.isFinite)).toBe(true);
  });

  it("rend deux voies différentes, et identiques quand on ferme la largeur", () => {
    const large = reponseFdn({ sampleRate: SR, largeur: 1, queue: 0.5 });
    let ecart = 0;
    for (let i = 0; i < large.gauche.length; i++) ecart += Math.abs(large.gauche[i] - large.droite[i]);
    expect(ecart).toBeGreaterThan(0.01);

    const mono = reponseFdn({ sampleRate: SR, largeur: 0, queue: 0.5 });
    for (let i = 0; i < mono.gauche.length; i += 37) expect(mono.gauche[i]).toBeCloseTo(mono.droite[i], 6);
  });

  it("allonge le son de la queue demandée, sans la couper", () => {
    const x = new Float32Array(Math.round(0.1 * SR)).fill(0.1);
    const { gauche } = traiterFdn(x, { sampleRate: SR, rt60Bas: 1, rt60Haut: 1, queue: 1 });
    expect(gauche.length).toBe(x.length + SR);
    // Et il y a bien du son dans la queue.
    let energieQueue = 0;
    for (let i = x.length; i < gauche.length; i++) energieQueue += gauche[i] * gauche[i];
    expect(energieQueue).toBeGreaterThan(0);
  });

  it("laisse le son intact quand on ne prend que le sec", () => {
    const x = Float32Array.from({ length: 500 }, (_, i) => Math.sin(i / 7));
    const { gauche } = traiterFdn(x, { sampleRate: SR, melange: 0, queue: 0.1 });
    for (let i = 0; i < x.length; i++) expect(gauche[i]).toBeCloseTo(x[i], 6);
  });

  it("RESTE STABLE quand on demande un aigu plus long que le grave", () => {
    // Le cas qui a fait trouver le défaut : la demande peut être physiquement impossible — le
    // module de la boucle dépassait un à Nyquist — et la réponse enflait au lieu de s'éteindre,
    // jusqu'à une crête de 1,2 × 10¹³. Le garde-fou borne l'absorption ; la demande n'est alors
    // pas tenue jusqu'au bout, mais le réseau reste un réseau.
    const { gauche } = reponseFdn({
      sampleRate: SR, rt60Bas: 0.5, rt60Haut: 2, freqRef: 6000, queue: 3,
    });
    let crete = 0;
    for (const v of gauche) crete = Math.max(crete, Math.abs(v));
    expect(crete, `crête ${crete.toExponential(1)}`).toBeLessThan(10);
    // Et l'aigu dure tout de même plus que le grave : le sens du réglage est respecté.
    const bas = rt60Mesure(filtrerBande(gauche, SR, 200, 8), SR);
    const haut = rt60Mesure(filtrerBande(gauche, SR, 6000, 8), SR);
    expect(haut, `grave ${bas.toFixed(2)} s · aigu ${haut.toFixed(2)} s`).toBeGreaterThan(bas);
  });

  it("ne rend ni NaN ni infini avec beaucoup de lignes et un temps très long", () => {
    const { gauche } = reponseFdn({ sampleRate: SR, lignes: 16, rt60Bas: 10, rt60Haut: 8, queue: 1 });
    expect([...gauche].every(Number.isFinite)).toBe(true);
    let crete = 0; for (const v of gauche) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThan(10);
  });
});

describe("la mesure de RT60 elle-même", () => {
  it("retrouve la décroissance d'une exponentielle qu'on lui donne", () => {
    // Un test du testeur : une décroissance exponentielle de RT60 connu doit être mesurée juste.
    const rt = 1.2, n = Math.round(3 * SR);
    const h = new Float32Array(n);
    const tau = Math.pow(10, -3 / (rt * SR)); // −60 dB en rt secondes
    let g = 1;
    let graine = 3;
    for (let i = 0; i < n; i++) {
      graine = (graine * 1103515245 + 12345) & 0x7fffffff;
      h[i] = g * (graine / 0x3fffffff - 1);
      g *= tau;
    }
    expect(rt60Mesure(h, SR)).toBeCloseTo(rt, 1);
  });

  it("rend zéro sur du silence, plutôt qu'un nombre inventé", () => {
    expect(rt60Mesure(new Float32Array(1000), SR)).toBe(0);
  });
});
