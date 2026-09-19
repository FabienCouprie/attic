// audio/hpss.test.ts — Séparation harmonique / percussive.
//
// Les cas sont fabriqués pour que la bonne réponse soit connue AVANT de lancer : une ligne
// horizontale sur un spectrogramme est une note tenue, une ligne verticale est une percussion.
// Si le filtre médian ne les range pas chacune de son côté, il ne fait pas ce que dit l'article.
import { describe, expect, it } from "vitest";
import {
  impair, mediane, masquesHarmoniquePercussif, medianeFrequentielle, medianeTemporelle,
  separerHarmoniquePercussif,
} from "./hpss";

/** Un spectrogramme vide de `trames` × `bins`. */
const vide = (trames: number, bins: number) =>
  Array.from({ length: trames }, () => new Float32Array(bins));

describe("les outils", () => {
  it("la médiane d'un nombre impair de valeurs est celle du milieu", () => {
    expect(mediane([3, 1, 2])).toBe(2);
  });

  it("la médiane d'un nombre pair est la moyenne des deux du milieu", () => {
    expect(mediane([4, 1, 3, 2])).toBe(2.5);
  });

  it("elle ne trie pas les données de l'appelant", () => {
    const v = [3, 1, 2];
    mediane(v);
    expect(v).toEqual([3, 1, 2]);
  });

  it("une longueur de filtre est ramenée à l'impair : un médian pair n'a pas de centre", () => {
    expect(impair(16)).toBe(17);
    expect(impair(17)).toBe(17);
    expect(impair(0)).toBe(1);
  });
});

describe("les deux filtres, sur des cas dont on connaît la réponse", () => {
  it("le filtre temporel efface ce qui ne dure pas", () => {
    // Une percussion : une seule trame allumée, au milieu.
    const s = vide(21, 4);
    s[10].fill(1);
    const filtre = medianeTemporelle(s, 9);
    expect(filtre[10][0]).toBe(0);
  });

  it("…et garde ce qui dure", () => {
    // Une note tenue : un bin allumé sur toutes les trames.
    const s = vide(21, 4);
    for (const t of s) t[2] = 1;
    expect(medianeTemporelle(s, 9)[10][2]).toBe(1);
  });

  it("le filtre fréquentiel efface une partielle étroite et garde un bruit large", () => {
    const trame = new Float32Array(32);
    trame[8] = 1;                                   // une partielle
    for (let k = 16; k < 32; k++) trame[k] = 0.5;   // une bande large
    const f = medianeFrequentielle([trame], 7)[0];
    expect(f[8]).toBe(0);
    expect(f[24]).toBe(0.5);
  });

  it("les bords sont tenus par répétition, et non tirés vers zéro", () => {
    // Sans cela, le début et la fin du morceau subiraient un fondu qu'on n'a pas demandé.
    const s = vide(11, 2);
    for (const t of s) t[0] = 1;
    expect(medianeTemporelle(s, 9)[0][0]).toBe(1);
    expect(medianeTemporelle(s, 9)[10][0]).toBe(1);
  });
});

describe("les masques", () => {
  it("envoient la ligne horizontale à l'harmonique et la verticale au percussif", () => {
    // Le cas de l'article, en miniature : une tenue et une frappe qui se croisent.
    const s = vide(31, 32);
    for (const t of s) t[5] = 1;        // tenue, bin 5
    s[15].fill(1);                      // frappe, trame 15
    const { harmonique, percussif } = masquesHarmoniquePercussif(s, { medianeTemps: 9, medianeFrequence: 9 });
    // Un point de la tenue, hors de la frappe.
    expect(harmonique[3][5]).toBeGreaterThan(0.9);
    expect(percussif[3][5]).toBeLessThan(0.1);
    // Un point de la frappe, hors de la tenue.
    expect(percussif[15][20]).toBeGreaterThan(0.9);
    expect(harmonique[15][20]).toBeLessThan(0.1);
  });

  it("SONT COMPLÉMENTAIRES : leur somme vaut un partout, silence compris", () => {
    // C'est la propriété qui rend la séparation honnête — rien ne se perd entre les deux
    // sorties, et rien ne s'y invente.
    const s = vide(9, 8);
    for (const t of s) t[3] = 1;
    s[4].fill(0.7);
    const { harmonique, percussif } = masquesHarmoniquePercussif(s, { medianeTemps: 5, medianeFrequence: 5 });
    for (let t = 0; t < 9; t++) {
      for (let k = 0; k < 8; k++) {
        // À la précision du Float32 dans lequel les masques sont rangés — c'est ce qui compte,
        // et la reconstruction de bout en bout plus bas le confirme à l'oreille comme au calcul.
        expect(harmonique[t][k] + percussif[t][k], `trame ${t}, bin ${k}`).toBeCloseTo(1, 6);
      }
    }
  });

  it("se durcissent quand on le demande, jusqu'au tout ou rien", () => {
    const s = vide(9, 8);
    for (const t of s) t[3] = 1;
    s[4].fill(0.7);
    const doux = masquesHarmoniquePercussif(s, { medianeTemps: 5, medianeFrequence: 5, fermete: 2 });
    const binaire = masquesHarmoniquePercussif(s, { medianeTemps: 5, medianeFrequence: 5, fermete: Infinity });
    for (const trame of binaire.harmonique) {
      for (const v of trame) expect([0, 1]).toContain(v);
    }
    // Le doux, lui, partage : au moins une valeur strictement entre les deux.
    expect(doux.harmonique.some((t) => [...t].some((v) => v > 0.01 && v < 0.99))).toBe(true);
  });
});

describe("la chaîne entière, sur un vrai signal", () => {
  const SR = 44100;
  /** Une tenue à 440 Hz, et trois clics secs. */
  const melange = () => {
    const n = SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / SR);
    for (const t of [0.25, 0.5, 0.75]) {
      const d = Math.round(t * SR);
      for (let i = 0; i < 40; i++) x[d + i] += (1 - i / 40) * (i % 2 ? -0.9 : 0.9);
    }
    return x;
  };

  it("met la tenue d'un côté et les clics de l'autre", () => {
    const { harmonique, percussif } = separerHarmoniquePercussif(melange());
    // Énergie autour d'un clic, et loin de tout clic.
    const energie = (x: Float32Array, debut: number, fin: number) => {
      let e = 0;
      for (let i = debut; i < fin; i++) e += x[i] * x[i];
      return e;
    };
    const auClic = [Math.round(0.25 * SR) - 50, Math.round(0.25 * SR) + 150] as const;
    const auCalme = [Math.round(0.9 * SR), Math.round(0.9 * SR) + 200] as const;
    // La comparaison juste est CHAQUE SORTIE À ELLE-MÊME, d'un instant à l'autre. Comparer les
    // deux sorties au même instant ne dit rien : la tenue continue de sonner pendant le clic, et
    // avec les amplitudes choisies ici son énergie y dépasse celle du clic sans qu'aucune
    // séparation ait échoué — c'est l'erreur que ce test a d'abord commise.
    expect(energie(percussif, ...auClic)).toBeGreaterThan(50 * energie(percussif, ...auCalme));
    // La tenue, elle, ne bronche pas : le clic ne l'a pas emportée avec lui.
    const rapportTenue = energie(harmonique, ...auClic) / energie(harmonique, ...auCalme);
    expect(rapportTenue).toBeGreaterThan(0.7);
    expect(rapportTenue).toBeLessThan(1.4);
  });

  it("LES DEUX SORTIES REDONNENT LE SON DE DÉPART, échantillon pour échantillon", () => {
    // La complémentarité des masques, vue à la sortie : c'est ce qui autorise à dire qu'on a
    // séparé et non transformé.
    const x = melange();
    const { harmonique, percussif } = separerHarmoniquePercussif(x);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(x[i] - (harmonique[i] + percussif[i])));
    expect(ecart).toBeLessThan(1e-5);
  });

  it("dit de quoi le son est fait", () => {
    // Une sinusoïde pure est harmonique de part en part ; du bruit blanc, l'inverse.
    const n = SR / 2;
    const pur = Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 440 * i / SR));
    expect(separerHarmoniquePercussif(pur).partPercussive).toBeLessThan(0.1);
    let g = 99;
    const bruit = Float32Array.from({ length: n }, () => {
      g = (g * 1103515245 + 12345) & 0x7fffffff;
      return g / 0x3fffffff - 1;
    });
    expect(separerHarmoniquePercussif(bruit).partPercussive).toBeGreaterThan(0.4);
  });

  it("ne bute pas sur le silence", () => {
    const r = separerHarmoniquePercussif(new Float32Array(2048));
    expect(r.partPercussive).toBe(0);
    expect(Math.max(...r.harmonique)).toBe(0);
  });
});
