// audio/table-onde.test.ts — Ce qu'une banque de cycles doit tenir.
//
// LES DEUX PROPRIÉTÉS QUI COMPTENT. La première est que la table rendue porte EXACTEMENT les
// harmoniques demandées, à l'amplitude demandée : tout le traitement du repliement de ce
// fichier tient dans le rang qu'on refuse d'écrire, et une convention de transformée inverse
// mal posée rendrait des amplitudes fausses sans rien faire échouer par ailleurs. La seconde
// est que la lecture entre deux points de la table n'ajoute pas sa propre distorsion, ce qui
// ne se voit qu'aux fréquences graves, là où la table porte le plus d'harmoniques.
import { describe, expect, it } from "vitest";
import { fft } from "./fft";
import {
  CASES, RANGS, TAILLE_TABLE, analyserCycle, banqueDepuisSon, banqueEngendree, cycleBorne,
  lireTable, synthetiserTable, type Cycle,
} from "./table-onde";

const FS = 44100;
const FENETRE = 16384;
const CYCLES = 743;
const F0 = (FS * CYCLES) / FENETRE;

const unCycle = (harmoniques: [number, number][], phases: [number, number][] = []): Cycle => {
  const c = { amplitudes: new Float64Array(RANGS + 1), phases: new Float64Array(RANGS + 1) };
  for (const [h, a] of harmoniques) c.amplitudes[h] = a;
  for (const [h, p] of phases) c.phases[h] = p;
  return c;
};

function spectre(x: Float32Array, debut: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[debut + i] ?? 0;
  fft(re, im, false);
  const m = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]);
  return m;
}

/** La part d'énergie posée ailleurs que sur les multiples de `bin`, en décibels. */
function partHorsHarmonique(module: Float64Array, bin: number): number {
  let total = 0;
  let harmonique = 0;
  for (let k = 1; k < module.length; k++) {
    const e = module[k] * module[k];
    total += e;
    if (k % bin === 0) harmonique += e;
  }
  return 10 * Math.log10(Math.max(1e-20, (total - harmonique) / Math.max(1e-20, total)));
}

const reglages = (p: Partial<Parameters<typeof synthetiserTable>[1]> = {}) => ({
  frequence: F0, duree: 1, position: 1, modulationPosition: 0, vitesseModulation: 1, ...p,
});

const crete = (x: Float32Array, debut = 0): number => {
  let c = 0;
  for (let i = debut; i < x.length; i++) c = Math.max(c, Math.abs(x[i]));
  return c;
};

describe("la table rendue depuis des harmoniques", () => {
  it("UNE SEULE HARMONIQUE REND UN SINUS DE L'AMPLITUDE DEMANDÉE, ce qui tient la convention", () => {
    // Sans ce cas, une transformée inverse mal normalisée rendrait des tables d'amplitude
    // fausse, et rien d'autre ne le dirait : le son sortirait simplement trop fort ou trop bas.
    const t = cycleBorne(unCycle([[1, 0.5]]), 100, FS);
    expect(crete(t)).toBeCloseTo(0.5, 4);
    for (let i = 0; i < TAILLE_TABLE; i += 64) {
      expect(t[i]).toBeCloseTo(0.5 * Math.sin((2 * Math.PI * i) / TAILLE_TABLE), 5);
    }
  });

  it("et la phase demandée est celle qu'on retrouve", () => {
    const t = cycleBorne(unCycle([[1, 1]], [[1, Math.PI / 2]]), 100, FS);
    expect(t[0]).toBeCloseTo(Math.sin(Math.PI / 2), 5);
  });

  it("LES HARMONIQUES AU-DESSUS DE NYQUIST NE SONT PAS ÉCRITES, et c'est tout le remède", () => {
    // À onze mille hertz, seule la fondamentale tient sous Nyquist : les rangs deux et trois
    // sont au-dessus et doivent disparaître, non se replier.
    const c = unCycle([[1, 1], [2, 1], [3, 1]]);
    const haute = cycleBorne(c, 11025, FS);
    expect(crete(haute)).toBeCloseTo(1, 3);
    const basse = cycleBorne(c, 100, FS);
    expect(crete(basse)).toBeGreaterThan(1.5);
  });

  it("l'analyse d'un cycle rend les harmoniques qui l'ont fabriqué", () => {
    const c = analyserCycle(cycleBorne(unCycle([[1, 0.7], [4, 0.3]]), 100, FS));
    expect(c.amplitudes[1]).toBeCloseTo(0.7, 4);
    expect(c.amplitudes[4]).toBeCloseTo(0.3, 4);
    expect(c.amplitudes[2]).toBeCloseTo(0, 5);
  });

  it("ET LES PHASES AUSSI, sans quoi un cycle tiré d'un son ressortirait retourné", () => {
    // Un plantage a montré que rien ne tenait le SIGNE de la phase rendue par l'analyse :
    // les amplitudes seules passaient, et un cycle analysé puis refait aurait eu ses
    // harmoniques déphasées, donc une forme d'onde différente pour un spectre identique.
    const avant = unCycle([[1, 1], [3, 0.5]], [[1, 0.8], [3, -2]]);
    const apres = analyserCycle(cycleBorne(avant, 100, FS));
    for (const h of [1, 3]) {
      expect(Math.cos(apres.phases[h])).toBeCloseTo(Math.cos(avant.phases[h]), 4);
      expect(Math.sin(apres.phases[h])).toBeCloseTo(Math.sin(avant.phases[h]), 4);
    }
  });
});

describe("les banques livrées", () => {
  it("LA PREMIÈRE CASE DE DEUX FAMILLES EST UN SINUS, et la dernière ne l'est pas", () => {
    for (const f of ["sinus-scie", "sinus-carre"] as const) {
      const b = banqueEngendree(f);
      expect(b[0].amplitudes[1]).toBe(1);
      for (let h = 2; h <= 64; h++) expect(b[0].amplitudes[h]).toBe(0);
      let autres = 0;
      for (let h = 2; h <= 64; h++) autres += b[CASES - 1].amplitudes[h];
      expect(autres).toBeGreaterThan(0.5);
    }
  });

  it("« du sinus au carré » ne porte que des rangs impairs, à toutes les cases", () => {
    for (const c of banqueEngendree("sinus-carre")) {
      for (let h = 2; h <= 64; h += 2) expect(c.amplitudes[h]).toBe(0);
    }
  });

  it("« harmonique glissante » ne porte qu'un rang par case, et il monte", () => {
    const b = banqueEngendree("harmonique-glissante");
    const rangDe = (c: Cycle) => {
      let n = 0;
      let rang = 0;
      for (let h = 1; h <= RANGS; h++) if (c.amplitudes[h] !== 0) { n++; rang = h; }
      expect(n).toBe(1);
      return rang;
    };
    expect(rangDe(b[0])).toBe(1);
    expect(rangDe(b[CASES - 1])).toBeGreaterThan(rangDe(b[0]));
  });

  it("« des impaires aux paires » amène les rangs pairs de zéro à leur pleine part", () => {
    const b = banqueEngendree("impair-vers-pair");
    expect(b[0].amplitudes[2]).toBe(0);
    expect(b[CASES - 1].amplitudes[2]).toBeCloseTo(1 / 2, 6);
    expect(b[0].amplitudes[3]).toBeCloseTo(1 / 3, 6);
  });
});

describe("le balayage de la banque", () => {
  const banque = banqueEngendree("sinus-scie");

  /**
   * Le repliement, mesuré sur un bin ENTIER ET IMPAIR.
   *
   * Sans cette précaution la mesure ne veut rien dire : un signal qui n'est pas exactement
   * périodique dans la fenêtre y fuit, et la fuite se compte alors comme du repliement. À
   * mille hertz ronds, la même table rend moins d'un décibel et demi pour un son parfait.
   */
  const repliement = (k: number) =>
    partHorsHarmonique(
      spectre(synthetiserTable(banque, reglages({ frequence: (FS * k) / FENETRE }), FS), 8192, FENETRE), k);

  it("BORNER LA TABLE D'AVANCE SUFFIT, sans un seul échantillon de suréchantillonnage", () => {
    // Ce qui ne peut pas être représenté n'est pas écrit : il ne reste donc à replier que ce
    // que la lecture entre deux points invente, et c'est très peu.
    for (const k of [21, 93, 371, CYCLES]) expect(repliement(k)).toBeLessThan(-100);
  });

  it("et c'est aux fréquences GRAVES que la lecture coûte le plus, la table y portant le plus de rangs", () => {
    expect(repliement(21)).toBeGreaterThan(repliement(CYCLES) + 20);
  });

  it("CATMULL-ROM VAUT VINGT DÉCIBELS SUR UNE DROITE, et le témoin est bâti ici", () => {
    const k = 21;
    const f = (FS * k) / FENETRE;
    const table = cycleBorne(banque[CASES - 1], f, FS);
    const n = Math.floor(FS);
    const x = new Float32Array(n);
    const pas = (TAILLE_TABLE * f) / FS;
    let p = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(p);
      const fr = p - j;
      x[i] = table[j % TAILLE_TABLE] * (1 - fr) + table[(j + 1) % TAILLE_TABLE] * fr;
      p += pas;
      if (p >= TAILLE_TABLE) p -= TAILLE_TABLE;
    }
    expect(partHorsHarmonique(spectre(x, 8192, FENETRE), k)).toBeGreaterThan(repliement(k) + 20);
  });

  it("ET LA MESURE NE VAUT QUE SUR UN BIN ENTIER, ce qu'il faut dire pour ne pas lire son chiffre", () => {
    // Mille hertz ronds ne tombent pas sur un bin de cette fenêtre : le son est le même, et
    // la mesure rend pourtant un chiffre qui ferait croire à un défaut énorme.
    const x = synthetiserTable(banque, reglages({ frequence: 1000 }), FS);
    expect(partHorsHarmonique(spectre(x, 8192, FENETRE), Math.round((1000 * FENETRE) / FS)))
      .toBeGreaterThan(-10);
  });

  it("la position déplace le timbre sans déplacer la hauteur", () => {
    const douce = synthetiserTable(banque, reglages({ position: 0 }), FS);
    const dure = synthetiserTable(banque, reglages({ position: 1 }), FS);
    const haut = (x: Float32Array) => {
      const m = spectre(x, 8192, FENETRE);
      let s = 0;
      for (let h = 2; h * CYCLES < m.length; h++) s += m[h * CYCLES] * m[h * CYCLES];
      return s / Math.max(1e-20, m[CYCLES] * m[CYCLES]);
    };
    expect(haut(douce)).toBeLessThan(1e-4);
    expect(haut(dure)).toBeGreaterThan(0.1);
  });

  it("et le balayage la fait voyager, la profondeur nulle la laissant en place", () => {
    const fixe = synthetiserTable(banque, reglages({ position: 0.5, modulationPosition: 0 }), FS);
    const mobile = synthetiserTable(banque,
      reglages({ position: 0.5, modulationPosition: 1, vitesseModulation: 4 }), FS);
    const relief = (x: Float32Array) => {
      const tranche = 2048;
      const parts: number[] = [];
      // AU-DESSUS DE LA FONDAMENTALE ET NON AU-DESSUS DE RIEN : c'est le nombre
      // d'harmoniques que la position commande, et compter la fondamentale avec elles
      // noierait ce qui bouge sous ce qui ne bouge pas.
      const premier = Math.ceil((2 * F0 * tranche) / FS);
      for (let t = 2; (t + 1) * tranche < x.length; t++) {
        const m = spectre(x, t * tranche, tranche);
        let s = 0;
        for (let k = premier; k < m.length; k++) s += m[k] * m[k];
        parts.push(s);
      }
      return (Math.max(...parts) - Math.min(...parts)) / Math.max(1e-20, Math.max(...parts));
    };
    expect(relief(fixe)).toBeLessThan(0.1);
    expect(relief(mobile)).toBeGreaterThan(0.5);
  });

  it("LA FRÉQUENCE COMMANDE LA HAUTEUR, ce qu'aucune empreinte ne peut dire non plus", () => {
    // Même raison que pour la durée : d'une onde périodique normalisée, la valeur efficace
    // et la crête ne bougent pas avec la hauteur. Le pic du spectre, lui, se déplace.
    const pic = (f: number) => {
      const m = spectre(synthetiserTable(banque, reglages({ frequence: f }), FS), 8192, FENETRE);
      let k = 1;
      for (let i = 2; i < m.length; i++) if (m[i] > m[k]) k = i;
      return k;
    };
    expect(pic(F0)).toBe(CYCLES);
    expect(pic(2 * F0)).toBe(2 * CYCLES);
  });

  it("LA DURÉE COMMANDE LA LONGUEUR, ce qu'aucune empreinte ne peut dire", () => {
    // Une empreinte est une valeur efficace et une crête : d'un son périodique elles ne
    // bougent pas avec la longueur, et le balayage dans l'application ne pouvait donc pas
    // distinguer une demi-seconde d'une seconde. C'est ici que ce réglage se tient.
    expect(synthetiserTable(banque, reglages({ duree: 0.5 }), FS).length).toBe(FS / 2);
    expect(synthetiserTable(banque, reglages({ duree: 1 }), FS).length).toBe(FS);
  });

  it("LE NOMBRE DE CASES AGIT AU MILIEU DE LA BANQUE, et ne peut rien à ses deux bouts", () => {
    // Les deux bouts d'une banque engendrée ne dépendent pas du nombre de cases : la
    // première est toujours la même, la dernière aussi. C'est une inertie réelle, écrite
    // dans la documentation du réglage, et ce cas en tient les deux côtés.
    // LA MESURE SE FAIT AU GRAVE, et c'est un échec de ce cas qui l'a imposé. À deux mille
    // hertz, onze harmoniques seulement passent sous Nyquist : toutes les cases qui en
    // portent davantage se confondent une fois bornées, et le nombre de cases ne peut plus
    // rien y changer. À cinquante-six hertz, les soixante-quatre rangs survivent.
    const au = (cases: number, position: number) =>
      synthetiserTable(banqueEngendree("sinus-scie", cases),
        reglages({ position, frequence: (FS * 21) / FENETRE }), FS);
    const ecart = (a: Float32Array, b: Float32Array) => {
      let e = 0;
      for (let i = 2000; i < 8000; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
      return e;
    };
    expect(ecart(au(4, 0), au(16, 0))).toBe(0);
    expect(ecart(au(4, 1), au(16, 1))).toBe(0);
    expect(ecart(au(4, 0.5), au(16, 0.5))).toBeGreaterThan(0.05);
  });

  it("et deux familles se confondent à la dernière case, sans se confondre au milieu", () => {
    const au = (f: Parameters<typeof banqueEngendree>[0], position: number) =>
      synthetiserTable(banqueEngendree(f), reglages({ position }), FS);
    const ecart = (a: Float32Array, b: Float32Array) => {
      let e = 0;
      for (let i = 2000; i < 8000; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
      return e;
    };
    expect(ecart(au("sinus-scie", 1), au("impair-vers-pair", 1))).toBe(0);
    expect(ecart(au("sinus-scie", 0.5), au("impair-vers-pair", 0.5))).toBeGreaterThan(0.05);
  });

  it("ENTRE DEUX CASES, LES DEUX SONT MÉLANGÉES, et non la plus basse seule", () => {
    // Un plantage a montré que rien ne tenait le fondu : avec une banque de DEUX cases, une
    // position au milieu tombe sur la case zéro, et ne lire que celle-là rendrait exactement
    // le son de la position zéro. Une banque de deux cases est le seul témoin qui le montre.
    const deux = banqueEngendree("sinus-scie", 2);
    const au = (position: number) => synthetiserTable(deux, reglages({ position }), FS);
    const ecart = (a: Float32Array, b: Float32Array) => {
      let e = 0;
      for (let i = 2000; i < 8000; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
      return e;
    };
    expect(ecart(au(0.5), au(0))).toBeGreaterThan(0.05);
    expect(ecart(au(0.5), au(1))).toBeGreaterThan(0.05);
  });

  it("deux appels aux mêmes réglages rendent le même son", () => {
    const a = synthetiserTable(banque, reglages({ modulationPosition: 1 }), FS);
    const b = synthetiserTable(banque, reglages({ modulationPosition: 1 }), FS);
    expect([...a.slice(0, 2000)]).toEqual([...b.slice(0, 2000)]);
  });
});

describe("la lecture entre deux points", () => {
  it("CATMULL-ROM PASSE PAR LES POINTS, ce qu'une interpolation doit faire", () => {
    const t = new Float32Array([0, 1, 0, -1]);
    expect(lireTable(t, 1)).toBeCloseTo(1, 10);
    expect(lireTable(t, 2)).toBeCloseTo(0, 10);
  });

  it("et la table boucle, le dernier point précédant le premier", () => {
    const t = new Float32Array([0, 1, 0, -1]);
    expect(lireTable(t, 3.5)).toBeCloseTo(lireTable(t, -0.5), 10);
  });
});

describe("une banque tirée d'un son", () => {
  const scie = (f: number, n: number): Float32Array => {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 2 * ((i * f / FS) % 1) - 1;
    return x;
  };

  it("LA PÉRIODE EST CELLE DU SON, et c'est elle qui découpe les cycles", () => {
    const r = banqueDepuisSon(scie(220, FS), FS, 4);
    expect(r).not.toBeNull();
    expect(r!.frequence).toBeGreaterThan(215);
    expect(r!.frequence).toBeLessThan(225);
    expect(r!.banque.length).toBe(4);
  });

  it("et les cycles tirés portent les harmoniques du son", () => {
    const r = banqueDepuisSon(scie(220, FS), FS, 4)!;
    const c = r.banque[1];
    // Une scie porte toutes les harmoniques, en un sur le rang.
    expect(c.amplitudes[2] / c.amplitudes[1]).toBeGreaterThan(0.3);
    expect(c.amplitudes[2] / c.amplitudes[1]).toBeLessThan(0.8);
  });

  it("LA FRÉQUENCE EST LA MÉDIANE DES TRAMES, et non leur moyenne", () => {
    // Un plantage a montré que rien ne distinguait les deux : sur une scie de hauteur fixe,
    // moyenne et médiane se confondent. Il faut un son dont la hauteur CHANGE sur une part
    // de sa durée, et la médiane doit alors rester sur la hauteur dominante.
    const n = FS;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = i < n * 0.8 ? 220 : 440;
      x[i] = 2 * (((i * f) / FS) % 1) - 1;
    }
    const r = banqueDepuisSon(x, FS, 4)!;
    expect(r.frequence).toBeLessThan(240);
  });

  it("ET LES CYCLES SONT PRIS SUR TOUTE LA DURÉE, non tous au même endroit", () => {
    // Un plantage a montré que rien ne le tenait : d'une scie de timbre constant, tous les
    // cycles sont les mêmes et les prendre au même endroit ne se voit pas. Il faut un son
    // dont le timbre ÉVOLUE, et les cases doivent alors différer entre elles.
    const n = FS;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = ((i * 220) / FS) % 1;
      x[i] = Math.sin(2 * Math.PI * p) + t * 0.8 * Math.sin(4 * Math.PI * p);
    }
    const r = banqueDepuisSon(x, FS, 4)!;
    const part = (k: number) => r.banque[k].amplitudes[2] / Math.max(1e-9, r.banque[k].amplitudes[1]);
    expect(part(3)).toBeGreaterThan(part(0) + 0.2);
  });

  it("un son sans hauteur ne rend pas de banque, plutôt qu'une banque de bruit", () => {
    const bruit = new Float32Array(FS);
    let graine = 12345;
    for (let i = 0; i < bruit.length; i++) {
      graine = (graine * 1103515245 + 12345) & 0x7fffffff;
      bruit[i] = graine / 0x7fffffff - 0.5;
    }
    expect(banqueDepuisSon(bruit, FS, 4)).toBeNull();
  });
});
