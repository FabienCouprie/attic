// audio/fm-operateurs.test.ts — Les six opérateurs, leurs branchements et leur repliement.
//
// CE QUE CE FICHIER TIENT EN PREMIER. Un branchement est une donnée, et une donnée fausse ne
// se voit pas : six opérateurs mal reliés rendent un son, simplement pas celui qu'on croit.
// Les deux premiers cas tiennent donc la FORME des branchements eux-mêmes, avant tout son :
// l'ordre de calcul, qui dépend des indices, et le fait qu'aucun branchement ne soit muet.
import { describe, expect, it } from "vitest";
import { fft } from "./fft";
import {
  ALGORITHMES, INDICE_MAX, MONTEE, OPERATEURS, SUR_ECHANTILLONNAGE_FM, enveloppe, ondeFm,
  synthetiserFm, type Operateur, type ReglagesFm,
} from "./fm-operateurs";

const FS = 44100;
const FENETRE = 16384;
const CYCLES = 743;
const F0 = (FS * CYCLES) / FENETRE;

const ops = (p: Partial<Operateur>[] = []): Operateur[] =>
  Array.from({ length: OPERATEURS }, (_, i) =>
    ({ rapport: 1, niveau: i === 0 ? 1 : 0, declin: 100, ...(p[i] ?? {}) }));

const reglages = (p: Partial<ReglagesFm> = {}): ReglagesFm => ({
  frequence: F0, duree: 1, algorithme: "pile", operateurs: ops(), retroaction: 0, ...p,
});

function spectre(x: Float32Array, debut: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[debut + i] ?? 0;
  fft(re, im, false);
  const m = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = Math.hypot(re[k], im[k]);
  return m;
}

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

/** Le nombre de partiels au-dessus d'un millième de la plus forte raie. */
const partiels = (x: Float32Array): number => {
  const m = spectre(x, 4096, FENETRE);
  let crete = 0;
  for (let h = 1; h * CYCLES < m.length; h++) crete = Math.max(crete, m[h * CYCLES]);
  let n = 0;
  for (let h = 1; h * CYCLES < m.length; h++) if (m[h * CYCLES] > crete / 1000) n++;
  return n;
};

describe("les branchements, avant tout son", () => {
  it("UN MODULATEUR A TOUJOURS UN INDICE PLUS GRAND QUE CELUI QU'IL MODULE", () => {
    // C'est ce qui permet de calculer de six à un en une seule passe. Un branchement ajouté
    // qui l'enfreindrait ferait lire à un opérateur la valeur de l'échantillon précédent, et
    // le son serait retardé d'un échantillon par étage sans que rien ne le dise.
    for (const a of ALGORITHMES) {
      a.modulateurs.forEach((liste, modulé) => {
        for (const m of liste) {
          expect(m, `${a.id} : l'opérateur ${m + 1} module ${modulé + 1}`).toBeGreaterThan(modulé);
          expect(m).toBeLessThan(OPERATEURS);
        }
      });
    }
  });

  it("et aucun branchement n'est muet ni ne déclare un opérateur absent", () => {
    for (const a of ALGORITHMES) {
      expect(a.modulateurs.length, a.id).toBe(OPERATEURS);
      expect(a.porteuses.length, a.id).toBeGreaterThan(0);
      for (const c of a.porteuses) expect(c).toBeLessThan(OPERATEURS);
      expect(new Set(a.porteuses).size, a.id).toBe(a.porteuses.length);
    }
  });

  it("LES HUIT BRANCHEMENTS SONT DISTINCTS, et pas seulement par leur nom", () => {
    const formes = new Set(ALGORITHMES.map((a) =>
      JSON.stringify([a.modulateurs, a.porteuses])));
    expect(formes.size).toBe(ALGORITHMES.length);
  });
});

describe("ce que chaque branchement fait du son", () => {
  it("SIX PORTEUSES NE MODULENT RIEN : c'est une somme, et le spectre le montre", () => {
    const x = synthetiserFm(reglages({
      algorithme: "additif",
      operateurs: ops([{ rapport: 1, niveau: 1 }, { rapport: 2, niveau: 1 }, { rapport: 3, niveau: 1 },
        { rapport: 4, niveau: 1 }, { rapport: 5, niveau: 1 }, { rapport: 6, niveau: 1 }]),
    }), FS);
    const m = spectre(x, 4096, FENETRE);
    for (let h = 1; h <= 6; h++) expect(m[h * CYCLES]).toBeGreaterThan(m[7 * CYCLES] * 50);
  });

  it("UNE PILE FABRIQUE DES PARTIELS QU'AUCUN OPÉRATEUR NE PORTE, et c'est la modulation", () => {
    const seule = synthetiserFm(reglages({ algorithme: "additif" }), FS);
    const modulee = synthetiserFm(reglages({
      operateurs: ops([{ niveau: 1 }, { rapport: 1, niveau: 0.5 }]),
    }), FS);
    expect(partiels(seule)).toBe(1);
    expect(partiels(modulee)).toBeGreaterThan(5);
  });

  it("et l'indice élargit la bande : plus de niveau, plus de partiels", () => {
    const doux = synthetiserFm(reglages({
      operateurs: ops([{ niveau: 1 }, { niveau: 0.15 }]) }), FS);
    const fort = synthetiserFm(reglages({
      operateurs: ops([{ niveau: 1 }, { niveau: 0.6 }]) }), FS);
    expect(partiels(fort)).toBeGreaterThan(partiels(doux) + 3);
  });

  it("LE RAPPORT D'UN MODULATEUR DÉPLACE LES PARTIELS, sans toucher à la fondamentale", () => {
    const m = (rapport: number) => spectre(synthetiserFm(reglages({
      operateurs: ops([{ niveau: 1 }, { rapport, niveau: 0.4 }]) }), FS), 4096, FENETRE);
    const a = m(1);
    const b = m(3);
    // LES RANGS ABSENTS SONT CEUX QUE LA THÉORIE DIT ABSENTS. Pour un modulateur de rapport
    // N, les partiels se posent aux rangs « un plus ou moins k fois N » : à N valant trois,
    // ce sont les rangs congrus à un ou à deux modulo trois, et les multiples de trois
    // n'existent pas. À N valant un, tous les rangs sont là.
    for (const rang of [3, 6]) {
      expect(b[rang * CYCLES] / b[CYCLES]).toBeLessThan(0.02);
      expect(a[rang * CYCLES] / a[CYCLES]).toBeGreaterThan(0.05);
    }
  });

  it("LE SON RENDU EST CELUI DE LA FORMULE, ce qui tient l'ORDRE DE CALCUL", () => {
    // UN PLANTAGE A MONTRÉ QUE RIEN NE TENAIT L'ORDRE. Calculer les opérateurs du premier au
    // sixième au lieu de l'inverse fait lire à chaque modulé la valeur de l'échantillon
    // PRÉCÉDENT de son modulateur : le son change à peine, et aucun cas de spectre ne le
    // voyait. La modulation de fréquence à deux opérateurs ayant une formule fermée, c'est
    // elle qui en décide, et un échantillon de retard l'en écarte aussitôt.
    const f0 = 1000;
    const f1 = 3000;
    const niveau0 = 0.8;
    const niveau1 = 0.5;
    const declin = 100;
    const x = ondeFm({
      frequence: f0, duree: 0.02, algorithme: "pile", retroaction: 0,
      operateurs: ops([{ rapport: 1, niveau: niveau0, declin },
        { rapport: f1 / f0, niveau: niveau1, declin }]),
    }, FS);
    for (let i = 100; i < 800; i += 37) {
      const t = i / FS;
      const indice = niveau1 * INDICE_MAX * enveloppe(t, declin);
      const attendu = Math.sin(2 * Math.PI * f0 * t + indice * Math.sin(2 * Math.PI * f1 * t))
        * niveau0 * enveloppe(t, declin);
      expect(x[i]).toBeCloseTo(attendu, 5);
    }
  });

  it("un opérateur à niveau nul ne s'entend ni ne module, et son rapport reste sans effet", () => {
    const a = synthetiserFm(reglages({ operateurs: ops([{ niveau: 1 }, { rapport: 2, niveau: 0 }]) }), FS);
    const b = synthetiserFm(reglages({ operateurs: ops([{ niveau: 1 }, { rapport: 7, niveau: 0 }]) }), FS);
    expect([...a.slice(0, 2000)]).toEqual([...b.slice(0, 2000)]);
  });
});

describe("la rétroaction du sixième", () => {
  // LA PILE DOIT CONDUIRE JUSQU'À LA PORTEUSE, et un premier jet de ce cas ne le faisait pas :
  // les quatre opérateurs intermédiaires étaient à niveau nul, donc muets, et ce que le
  // sixième faisait ne remontait nulle part. Un opérateur à niveau nul coupe la pile sous lui.
  const avecRetour = (retroaction: number) => synthetiserFm(reglages({
    algorithme: "pile",
    operateurs: ops([{ niveau: 1 }, { niveau: 0.4 }, { niveau: 0.4 }, { niveau: 0.4 },
      { niveau: 0.4 }, { niveau: 0.3 }]),
    retroaction,
  }), FS);

  it("À ZÉRO ELLE NE FAIT RIEN, et au-delà elle enrichit le sixième", () => {
    const sans = avecRetour(0);
    const avec = avecRetour(1);
    let ecart = 0;
    for (let i = 2000; i < 8000; i++) ecart = Math.max(ecart, Math.abs(sans[i] - avec[i]));
    expect(ecart).toBeGreaterThan(0.01);
  });

  it("ELLE APPARTIENT AU SIXIÈME OPÉRATEUR, et à aucun autre", () => {
    // UN PLANTAGE A MONTRÉ QUE RIEN NE DÉSIGNAIT L'OPÉRATEUR. Le cas précédent compare zéro à
    // un et les trouve différents, ce qui reste vrai si la rétroaction est posée sur le
    // premier. Ici, seul le PREMIER opérateur a un niveau et le branchement ne module rien :
    // la rétroaction ne doit alors rien pouvoir changer, puisque le sixième est muet.
    const seul = (indice: number, retroaction: number) => {
      const p: Partial<Operateur>[] = [];
      p[indice] = { niveau: 1 };
      return synthetiserFm(reglages({
        algorithme: "additif", retroaction,
        operateurs: Array.from({ length: OPERATEURS }, (_, i) =>
          ({ rapport: 1, niveau: i === indice ? 1 : 0, declin: 100 })),
      }), FS);
    };
    // SEUL LE SIXIÈME A UN NIVEAU : la rétroaction doit s'entendre, puisque c'est lui qui
    // s'entend. Posée sur un autre opérateur, elle n'aurait rien changé, cet autre étant muet.
    let ecart = 0;
    const a = seul(5, 0);
    const b = seul(5, 1);
    for (let i = 2000; i < 8000; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeGreaterThan(0.1);
    // ET SEUL LE PREMIER A UN NIVEAU : elle ne doit alors rien pouvoir changer.
    expect([...seul(0, 0).slice(0, 2000)]).toEqual([...seul(0, 1).slice(0, 2000)]);
  });

  it("ET UN OPÉRATEUR À NIVEAU NUL COUPE LA PILE SOUS LUI, ce qui s'éprouve des deux côtés", () => {
    const coupee = (niveau: number) => synthetiserFm(reglages({
      algorithme: "pile",
      operateurs: ops([{ niveau: 1 }, { niveau }, { niveau: 0.5 }, { niveau: 0.5 },
        { niveau: 0.5 }, { niveau: 0.5 }]),
    }), FS);
    // Le deuxième opérateur muet, tout ce qui est au-dessus de lui devient inaudible : la
    // porteuse rend alors une sinusoïde pure.
    const m = spectre(coupee(0), 4096, FENETRE);
    expect(m[2 * CYCLES] / m[CYCLES]).toBeLessThan(0.001);
    const n = spectre(coupee(0.5), 4096, FENETRE);
    expect(n[2 * CYCLES] / n[CYCLES]).toBeGreaterThan(0.05);
  });
});

describe("l'enveloppe", () => {
  it("LA MONTÉE N'EST PAS INSTANTANÉE, sans quoi chaque note serait une rupture franche", () => {
    expect(enveloppe(0, 1)).toBe(0);
    expect(enveloppe(MONTEE, 1)).toBeGreaterThan(0.5);
    expect(enveloppe(MONTEE * 5, 1)).toBeGreaterThan(0.9);
  });

  it("et le déclin commande la décroissance", () => {
    expect(enveloppe(1, 1)).toBeCloseTo(Math.exp(-1), 2);
    expect(enveloppe(1, 0.25)).toBeLessThan(enveloppe(1, 1) / 10);
  });

  it("le déclin d'un opérateur agit sur le son rendu", () => {
    const niveauVers = (declin: number) => {
      const x = synthetiserFm(reglages({ algorithme: "additif", duree: 1,
        operateurs: ops([{ niveau: 1, declin }]) }), FS);
      let c = 0;
      for (let i = 30000; i < 35000; i++) c = Math.max(c, Math.abs(x[i]));
      return c;
    };
    expect(niveauVers(0.2)).toBeLessThan(niveauVers(2) / 10);
  });
});

describe("le repliement", () => {
  const dur = () => reglages({
    algorithme: "pile", duree: 1,
    operateurs: ops([{ niveau: 1 }, { rapport: 3, niveau: 1 }]),
  });

  it("LE SURÉCHANTILLONNAGE VAUT PLUSIEURS DIZAINES DE DÉCIBELS sur un indice fort", () => {
    const direct = partHorsHarmonique(spectre(synthetiserFm(dur(), FS, 1), 4096, FENETRE), CYCLES);
    const haut = partHorsHarmonique(
      spectre(synthetiserFm(dur(), FS, SUR_ECHANTILLONNAGE_FM), 4096, FENETRE), CYCLES);
    expect(direct).toBeGreaterThan(-45);
    expect(haut).toBeLessThan(direct - 20);
  });

  it("et un indice faible replie beaucoup moins, la bande étant plus étroite", () => {
    const doux = reglages({ operateurs: ops([{ niveau: 1 }, { rapport: 3, niveau: 0.1 }]) });
    expect(partHorsHarmonique(spectre(synthetiserFm(doux, FS, 1), 4096, FENETRE), CYCLES))
      .toBeLessThan(partHorsHarmonique(spectre(synthetiserFm(dur(), FS, 1), 4096, FENETRE), CYCLES) - 20);
  });
});

describe("le son rendu", () => {
  it("LES PORTEUSES SONT MOYENNÉES, de sorte que six ne sortent pas six fois plus fort", () => {
    const six = synthetiserFm(reglages({
      algorithme: "additif",
      operateurs: ops([{ niveau: 1 }, { niveau: 1 }, { niveau: 1 }, { niveau: 1 },
        { niveau: 1 }, { niveau: 1 }]),
    }), FS);
    let c = 0;
    for (let i = 0; i < six.length; i++) c = Math.max(c, Math.abs(six[i]));
    expect(c).toBeLessThan(1.05);
  });

  it("deux appels aux mêmes réglages rendent le même son", () => {
    const r = reglages({ operateurs: ops([{ niveau: 1 }, { niveau: 0.5 }]), retroaction: 0.4 });
    expect([...synthetiserFm(r, FS).slice(0, 2000)])
      .toEqual([...synthetiserFm(r, FS).slice(0, 2000)]);
  });

  it("la durée commande la longueur", () => {
    expect(ondeFm(reglages({ duree: 0.5 }), FS).length).toBe(FS / 2);
  });

  it("et l'indice maximal est celui qui est déclaré, non un nombre écrit deux fois", () => {
    expect(INDICE_MAX).toBeGreaterThan(1);
  });
});
