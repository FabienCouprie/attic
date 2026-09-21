// audio/ssp.test.ts — La méthode de Koenig, vérifiée à la lettre, et le soupçon qui pèse sur elle.
//
// LE PREMIER TEST EST CELUI DE LA FIDÉLITÉ À LA MÉTHODE. SSP ne connaît ni oscillateur ni forme
// d'onde : il n'y a que des points tirés dans deux ensembles donnés par le compositeur, et le trait
// qui les relie. On l'exige donc au sens strict — la valeur du signal à chaque point appartient
// exactement à l'ensemble d'amplitudes, et l'écart entre deux points appartient exactement à
// l'ensemble de durées. Un nœud qui lisserait, filtrerait ou normaliserait quoi que ce soit ne
// serait plus du SSP, et ce test le dirait aussitôt.
//
// LE SECOND RÉPOND AU SOUPÇON QUI PÈSE SUR CE PROCÉDÉ. SSP a la réputation d'être impossible à
// diriger, et un nœud qui rendrait du bruit quels que soient les réglages serait un générateur de
// bruit affublé d'une bibliographie. On mesure donc ce que les réglages commandent vraiment, et
// l'on vérifie surtout qu'ils commandent des choses DIFFÉRENTES : les durées font l'aigu sans
// toucher à la crête, les amplitudes font la crête sans toucher à l'aigu. Deux axes séparés, et
// non un unique bouton à bruit.
//
// LE TROISIÈME VÉRIFIE LA THÈSE DE KOENIG PLUTÔT QUE DE LA PROCLAMER : les mêmes principes valent
// à toutes les échelles. Une « série » à l'échelle des sections doit vouloir dire exactement ce
// qu'elle veut dire à l'échelle de l'échantillon — chacune une fois avant qu'aucune ne repasse.
import { describe, expect, it } from "vitest";
import {
  AMPLITUDES_DEFAUT, EST_PRINCIPE, PRINCIPES, TEMPS_DEFAUT, alea, centroideHz, composer,
  construireSegment, creteDb, lireEnsemble, longueurMoyenneDesPlages, masqueTendance,
  nomPrincipe, selectionner, type OptionsComposition, type Principe,
} from "./ssp";

const SR = 44100;

const BASE: OptionsComposition = {
  frequence: SR, duree: 2, sections: 4,
  amplitudes: [-1, -0.6, -0.2, 0.2, 0.6, 1],
  temps: [5, 9, 17, 33, 65],
  principeAmplitudes: "alea", principeTemps: "alea", principeForme: "serie",
  interpole: true, graine: 7,
};

describe("la fidélité à la méthode", () => {
  it("LA VALEUR À CHAQUE POINT APPARTIENT À L'ENSEMBLE, et l'écart entre deux points aussi", () => {
    const amplitudes = [-1, -0.6, -0.2, 0.2, 0.6, 1];
    const temps = [5, 9, 17, 33, 65];
    const { son, points } = construireSegment(
      { amplitudes, temps, principeAmplitudes: "alea", principeTemps: "alea", longueur: 20000, interpole: true },
      alea(3),
    );
    expect(points.length).toBeGreaterThan(50);
    for (const p of points) {
      // Rien n'est lissé, normalisé ni filtré : la valeur posée est celle qu'on a donnée.
      expect(amplitudes, `point à ${p.echantillon}`).toContain(p.amplitude);
      expect(temps, `point à ${p.echantillon}`).toContain(p.duree);
      expect(son[p.echantillon]).toBeCloseTo(p.amplitude, 6);
    }
    // Et les points se suivent exactement de la durée annoncée : aucun échantillon en trop.
    for (let i = 1; i < points.length; i++) {
      expect(points[i].echantillon - points[i - 1].echantillon).toBe(points[i - 1].duree);
    }
  });

  it("sans interpolation, le signal ne prend QUE les valeurs de l'ensemble", () => {
    const amplitudes = [-1, -0.25, 0.25, 1];
    const { son } = construireSegment(
      { amplitudes, temps: [17, 33], principeAmplitudes: "serie", principeTemps: "alea", longueur: 8000, interpole: false },
      alea(11),
    );
    const vues = new Set(Array.from(son, (v) => Number(v.toFixed(6))));
    for (const v of vues) expect(amplitudes).toContain(v);
  });

  it("avec interpolation, le trait passe bien entre les deux valeurs", () => {
    const { son, points } = construireSegment(
      { amplitudes: [-1, 1], temps: [100], principeAmplitudes: "sequence", principeTemps: "sequence", longueur: 400, interpole: true },
      alea(1),
    );
    // Séquence sur [-1, 1] : les points alternent, le trait doit monter puis descendre.
    expect(points[0].amplitude).toBe(-1);
    expect(son[50]).toBeGreaterThan(-1);
    expect(son[50]).toBeLessThan(1);
    expect(son[50]).toBeCloseTo(0, 1);
  });
});

describe("ce que les réglages commandent vraiment", () => {
  it("LES DURÉES FONT L'AIGU, ET RIEN D'AUTRE NE LE FAIT", () => {
    const centroide = (temps: number[]) => centroideHz(composer({ ...BASE, temps }).son, SR);
    const suite = [[2, 3], [3, 5, 7], [5, 9, 17, 33, 65], [40, 80, 160], [200, 400, 800]].map(centroide);
    // Monotone décroissant, et sur plus de deux décades.
    for (let i = 1; i < suite.length; i++) expect(suite[i]).toBeLessThan(suite[i - 1]);
    expect(suite[0] / suite[suite.length - 1]).toBeGreaterThan(100);

    // LE TÉMOIN : changer l'ensemble d'amplitudes ne déplace pas l'aigu. Les deux axes sont
    // séparés, ce qui interdit de conclure que le nœud n'a qu'un seul bouton à bruit.
    const a = centroideHz(composer({ ...BASE, amplitudes: [-1, 1] }).son, SR);
    const b = centroideHz(composer({ ...BASE, amplitudes: [-1, -0.9, -0.8, 0.8, 0.9, 1] }).son, SR);
    expect(Math.abs(a - b)).toBeLessThan(a * 0.15);
  });

  it("LES AMPLITUDES FONT LA CRÊTE, ET LES DURÉES N'Y TOUCHENT PAS", () => {
    const crete = (amplitudes: number[]) => creteDb(composer({ ...BASE, amplitudes }).son);
    // Deux valeurs extrêmes : un signal presque carré, donc une crête minime.
    const carre = crete([-1, 1]);
    // Beaucoup de petites valeurs et une grande : une crête bien plus forte.
    const pointu = crete([-0.05, -0.02, 0.02, 0.05, 1]);
    expect(carre).toBeLessThan(3);
    expect(pointu).toBeGreaterThan(carre + 4);

    // Le témoin, dans l'autre sens : l'échelle de temps ne change pas la crête.
    const court = creteDb(composer({ ...BASE, temps: [5, 9] }).son);
    const long = creteDb(composer({ ...BASE, temps: [200, 400] }).son);
    expect(Math.abs(court - long)).toBeLessThan(1);
  });

  it("le trait et les marches ne rendent pas le même son", () => {
    const trait = composer({ ...BASE, temps: [33, 65], interpole: true }).son;
    const marches = composer({ ...BASE, temps: [33, 65], interpole: false }).son;
    // Mêmes points, même aigu — et une crête nettement différente.
    expect(centroideHz(trait, SR)).toBeCloseTo(centroideHz(marches, SR), 0);
    expect(creteDb(trait)).toBeGreaterThan(creteDb(marches) + 1);
  });
});

describe("les principes de sélection", () => {
  it("SÉQUENCE parcourt l'ordre donné, sans jamais s'en écarter", () => {
    expect(selectionner("sequence", 4, 10, alea(1))).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });

  it("SÉRIE épuise l'ensemble avant de le reprendre — c'est ce qui la sépare de l'aléa", () => {
    const n = 6;
    const suite = selectionner("serie", n, n * 20, alea(4));
    for (let tour = 0; tour < 20; tour++) {
      const fenetre = suite.slice(tour * n, (tour + 1) * n);
      expect([...fenetre].sort((a, b) => a - b), `tour ${tour}`).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("ALÉA répète, se sert de tout l'ensemble, et ne fait presque pas de plages", () => {
    const suite = selectionner("alea", 6, 4000, alea(9));
    expect(new Set(suite).size).toBe(6);
    // Une répétition immédiate finit forcément par arriver, ce que la série interdit.
    expect(suite.some((v, i) => i > 0 && v === suite[i - 1])).toBe(true);
    // Sur six valeurs, l'espérance de la longueur des plages vaut 1,2.
    expect(longueurMoyenneDesPlages(suite)).toBeLessThan(1.4);
  });

  it("GROUPE fait des paliers, et c'est mesurable", () => {
    const groupe = longueurMoyenneDesPlages(selectionner("groupe", 6, 4000, alea(9)));
    const aleatoire = longueurMoyenneDesPlages(selectionner("alea", 6, 4000, alea(9)));
    expect(groupe).toBeGreaterThan(2.5);
    expect(groupe).toBeGreaterThan(aleatoire * 2);
  });

  it("TENDANCE reste dans son masque, et le masque dérive d'un bout à l'autre", () => {
    const n = 9, k = 900;
    const suite = selectionner("tendance", n, k, alea(2));
    for (let i = 0; i < k; i++) {
      const [bas, haut] = masqueTendance(n, k, i);
      expect(suite[i], `rang ${i}`).toBeGreaterThanOrEqual(bas);
      expect(suite[i], `rang ${i}`).toBeLessThanOrEqual(haut);
    }
    const moyenne = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
    expect(moyenne(suite.slice(0, k / 3))).toBeLessThan(moyenne(suite.slice(-k / 3)) - 3);
  });

  it("chaque principe se nomme dans les deux langues, et se reconnaît", () => {
    for (const p of PRINCIPES) {
      expect(EST_PRINCIPE(p.id)).toBe(true);
      expect(nomPrincipe(p.id, false).length).toBeGreaterThan(0);
      expect(nomPrincipe(p.id, true)).not.toMatch(/[éèêàçùîôûï]/);
    }
    expect(EST_PRINCIPE("n'importe quoi")).toBe(false);
  });

  it("les cinq principes rendent cinq sons sans rapport entre eux", () => {
    const sons = PRINCIPES.map((p) => composer({ ...BASE, principeAmplitudes: p.id }).son);
    for (let i = 0; i < sons.length; i++) {
      for (let j = i + 1; j < sons.length; j++) {
        let n = 0, da = 0, db = 0;
        for (let k = 0; k < sons[i].length; k++) { n += sons[i][k] * sons[j][k]; da += sons[i][k] ** 2; db += sons[j][k] ** 2; }
        expect(Math.abs(n / Math.sqrt(da * db || 1)), `${PRINCIPES[i].id} / ${PRINCIPES[j].id}`).toBeLessThan(0.35);
      }
    }
  });
});

describe("la thèse de Koenig : les mêmes principes à toutes les échelles", () => {
  it("UNE SÉRIE À L'ÉCHELLE DE LA FORME VEUT DIRE CE QU'ELLE VEUT DIRE À CELLE DE L'ONDE", () => {
    const c = composer({ ...BASE, duree: 4, sections: 5, principeForme: "serie" });
    expect(c.ordre).toHaveLength(5);
    // Chaque section passe une fois avant qu'aucune ne repasse — la définition même de la série.
    expect([...c.ordre].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("et les quatre autres principes ordonnent les sections comme ils ordonnent les points", () => {
    const ordre = (principeForme: Principe) =>
      composer({ ...BASE, duree: 4, sections: 5, principeForme }).ordre;
    expect(ordre("sequence")).toEqual([0, 1, 2, 3, 4]);
    // Groupe : une même section tenue plusieurs fois de suite.
    expect(longueurMoyenneDesPlages(ordre("groupe"))).toBeGreaterThan(1.5);
    // Tendance : la fin puise plus haut que le début.
    const t = ordre("tendance");
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(t[0]);
    // Aléa : rien n'est garanti sauf de rester dans les bornes.
    for (const v of ordre("alea")) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); }
  });

  it("les sections remplissent la durée demandée, sans trou", () => {
    const c = composer({ ...BASE, duree: 3, sections: 7 });
    expect(c.son.length).toBe(3 * SR);
    // Aucun silence involontaire : le dernier dixième porte du signal comme le premier.
    const energie = (a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += c.son[i] * c.son[i];
      return s / (b - a);
    };
    expect(energie(c.son.length - 4410, c.son.length)).toBeGreaterThan(energie(0, 4410) * 0.1);
  });
});

describe("les ensembles écrits à la main", () => {
  it("se lisent avec des virgules, des espaces ou des points-virgules", () => {
    expect(lireEnsemble("-1, -0.5, 0, 0.5, 1", [])).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(lireEnsemble("5 9 17", [])).toEqual([5, 9, 17]);
    expect(lireEnsemble("3;7;11", [])).toEqual([3, 7, 11]);
  });

  it("une saisie vide ou illisible retombe sur l'ensemble par défaut", () => {
    for (const saisie of ["", "   ", "bonjour", ",,,"]) {
      expect(lireEnsemble(saisie, AMPLITUDES_DEFAUT), saisie).toEqual(AMPLITUDES_DEFAUT);
    }
    expect(lireEnsemble("abc 12 def", TEMPS_DEFAUT)).toEqual([12]);
  });
});

describe("les bornes", () => {
  it("le son reste dans le gabarit et se reproduit à graine égale", () => {
    const a = composer({ ...BASE, duree: 1 });
    const b = composer({ ...BASE, duree: 1 });
    expect(Array.from(a.son)).toEqual(Array.from(b.son));
    expect(Math.max(...Array.from(a.son, Math.abs))).toBeLessThanOrEqual(1);
    expect(a.son.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("deux graines donnent deux sons sans rapport", () => {
    const a = composer({ ...BASE, duree: 1 });
    const b = composer({ ...BASE, duree: 1, graine: 99 });
    let n = 0, da = 0, db = 0;
    for (let k = 0; k < a.son.length; k++) { n += a.son[k] * b.son[k]; da += a.son[k] ** 2; db += b.son[k] ** 2; }
    expect(Math.abs(n / Math.sqrt(da * db || 1))).toBeLessThan(0.2);
  });

  it("les cas limites rendent un son plutôt qu'une erreur", () => {
    for (const o of [
      { ...BASE, amplitudes: [] as number[] },
      { ...BASE, temps: [] as number[] },
      { ...BASE, temps: [0, -5] },
      { ...BASE, sections: 0 },
      { ...BASE, duree: 0.001 },
      { ...BASE, amplitudes: [0.5] },
    ]) {
      const c = composer(o);
      expect(c.son.length).toBeGreaterThan(0);
      expect(c.son.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it("une durée nulle ne fait pas boucler la construction à l'infini", () => {
    const { points } = construireSegment(
      { amplitudes: [1], temps: [0], principeAmplitudes: "alea", principeTemps: "alea", longueur: 100, interpole: true },
      alea(1),
    );
    // Une durée de zéro est ramenée à un échantillon : cent points au plus, et non l'infini.
    expect(points.length).toBeLessThanOrEqual(120);
  });
});
