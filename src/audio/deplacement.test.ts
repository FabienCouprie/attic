// audio/deplacement.test.ts — Le passage d'une source, et l'usure d'une bande.
//
// CE QUE CES TESTS CHERCHENT À TENIR. Pour le Doppler, que la hauteur entendue soit celle que la
// PHYSIQUE impose, et non une valeur plausible : les deux hauteurs théoriques sont calculées à
// part, et le son rendu est comparé à elles. Pour la bande, que chacun des quatre défauts fasse
// quelque chose, et que le mettre à zéro le fasse taire.
import { describe, expect, it } from "vitest";
import {
  arrivees, bande, distances, doppler, emissions, hauteurApprochee, hauteurEloignee, lateralite, lireAvecRetard,
  retardsBande, saturerBande, type OptionsBande, type OptionsDoppler,
} from "./deplacement";

const SR = 44100;

const DOPPLER: OptionsDoppler = {
  vitesse: 30, distance: 10, celerite: 343, attenuer: true, frequence: SR,
};
const BANDE: OptionsBande = {
  pleurage: 0, pleurageHz: 0.7, scintillement: 0, scintillementHz: 9,
  saturation: 0, decrochages: 0, souffle: 0, graine: 5, frequence: SR,
};

function sinus(freq: number, dureeS: number): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return x;
}

/**
 * La hauteur, par passages par zéro montants — mesurée entre le PREMIER et le DERNIER, et non en
 * divisant un compte par la durée de la fenêtre.
 *
 * La différence n'est pas cosmétique. Compter les passages sur deux dixièmes de seconde donne une
 * résolution d'un passage, soit cinq hertz : le pleurage, qui fait dériver la hauteur de trois
 * hertz, y était invisible — mesuré 0,1 Hz d'écart là où il y en a près de six. Le premier et le
 * dernier passage, interpolés, donnent la période moyenne au millième près.
 */
function hauteur(x: Float32Array, a: number, z: number): number {
  const i0 = Math.max(1, Math.floor(a)), i1 = Math.min(Math.floor(z), x.length);
  let premier = -1, dernier = -1, compte = 0;
  for (let i = i0; i < i1; i++) {
    if (x[i - 1] > 0 || x[i] <= 0) continue;
    // L'instant exact du passage, par interpolation entre les deux échantillons qui l'encadrent.
    const t = i - 1 + x[i - 1] / (x[i - 1] - x[i]);
    if (premier < 0) premier = t;
    dernier = t;
    compte++;
  }
  if (compte < 2) return 0;
  return ((compte - 1) * SR) / (dernier - premier);
}

const rms = (x: Float32Array, a = 0, z = x.length) => {
  let s = 0;
  for (let i = a; i < z; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, z - a));
};

describe("lire à retard variable", () => {
  it("un retard constant décale le signal, sans rien changer d'autre", () => {
    const x = sinus(440, 0.1);
    const y = lireAvecRetard(x, new Float32Array(x.length).fill(100));
    for (let i = 200; i < 3000; i += 37) expect(y[i]).toBeCloseTo(x[i - 100], 5);
  });

  it("un retard fractionnaire interpole, il n'arrondit pas", () => {
    const x = Float32Array.from({ length: 8 }, (_, i) => i);
    const y = lireAvecRetard(x, new Float32Array(8).fill(0.5));
    expect(y[4]).toBeCloseTo(3.5, 6);
  });

  it("un retard qui sort de la source rend du silence, sans lever", () => {
    const y = lireAvecRetard(sinus(440, 0.05), new Float32Array(100).fill(1e9));
    expect([...y].every((v) => v === 0)).toBe(true);
  });
});

describe("le passage d'une source", () => {
  it("la distance est minimale au milieu du parcours", () => {
    const d = distances(SR, DOPPLER);
    expect(d[Math.floor(SR / 2)]).toBeCloseTo(10, 1);
    expect(d[0]).toBeGreaterThan(d[Math.floor(SR / 2)]);
    expect(d[SR - 1]).toBeGreaterThan(d[Math.floor(SR / 2)]);
  });

  it("la source traverse de gauche à droite", () => {
    const lat = lateralite(SR, DOPPLER);
    expect(lat[0]).toBeLessThan(0);
    expect(lat[Math.floor(SR / 2)]).toBeCloseTo(0, 2);
    expect(lat[SR - 1]).toBeGreaterThan(0);
  });

  it("LA HAUTEUR EST CELLE QUE LA PHYSIQUE IMPOSE, avant et après le passage", () => {
    // Un passage large et lointain : la vitesse radiale est alors presque égale à la vitesse.
    const o = { ...DOPPLER, vitesse: 40, distance: 3 };
    const [g, d] = doppler(sinus(440, 4), o);
    const somme = Float32Array.from(g, (v, i) => v + d[i]);
    // LA MESURE COMMENCE APRÈS LE TEMPS DE PROPAGATION. À 74 m de distance, le son met 0,22 s à
    // arriver : le début de la sortie est SILENCIEUX, et compter les passages par zéro sur une
    // fenêtre qui l'englobe fait chuter la moyenne — première mesure, 429 Hz au lieu de 491, pour
    // cette seule raison. La fenêtre de fin s'arrête de même avant que la source ne sorte du son.
    const avant = hauteur(somme, SR * 0.35, SR * 0.8);
    const apres = hauteur(somme, SR * 3.2, SR * 3.65);
    const attenduAvant = hauteurApprochee(440, 40, 343);   // 498,1 Hz
    const attenduApres = hauteurEloignee(440, 40, 343);    // 394,0 Hz
    // UN POUR CENT, ET PAS SEPT. La tolérance large de la première version cachait une faute de
    // physique : le retard était pris à l'instant d'arrivée et non d'émission, ce qui rendait
    // 491,2 Hz au lieu de 498,1 — vingt-quatre centièmes de demi-ton, qui passaient sous les sept
    // pour cent sans être vus. Mesuré après correction : 498,0 et 394,1.
    expect(avant).toBeGreaterThan(attenduAvant * 0.99);
    expect(avant).toBeLessThan(attenduAvant * 1.01);
    expect(apres).toBeGreaterThan(attenduApres * 0.99);
    expect(apres).toBeLessThan(attenduApres * 1.01);
    // Et la hauteur BAISSE en traversant : c'est le sens de l'effet, pas un détail.
    expect(avant).toBeGreaterThan(apres * 1.15);
  });

  it("les formules encadrent la hauteur émise", () => {
    expect(hauteurApprochee(440, 30, 343)).toBeGreaterThan(440);
    expect(hauteurEloignee(440, 30, 343)).toBeLessThan(440);
    expect(hauteurApprochee(440, 0, 343)).toBeCloseTo(440, 6);
    expect(hauteurEloignee(440, 0, 343)).toBeCloseTo(440, 6);
  });

  it("le son est le plus fort au plus près, et faiblit aux deux bouts", () => {
    const [g, d] = doppler(sinus(440, 2), DOPPLER);
    const somme = Float32Array.from(g, (v, i) => v + d[i]);
    const milieu = rms(somme, Math.floor(SR * 0.9), Math.floor(SR * 1.1));
    const bout = rms(somme, Math.floor(SR * 0.05), Math.floor(SR * 0.25));
    expect(milieu).toBeGreaterThan(bout * 1.5);
  });

  it("sans atténuation, les deux bouts pèsent autant que le milieu", () => {
    const [g, d] = doppler(sinus(440, 2), { ...DOPPLER, attenuer: false });
    const somme = Float32Array.from(g, (v, i) => v + d[i]);
    const milieu = rms(somme, Math.floor(SR * 0.9), Math.floor(SR * 1.1));
    const bout = rms(somme, Math.floor(SR * 0.3), Math.floor(SR * 0.5));
    expect(milieu).toBeLessThan(bout * 1.3);
  });

  it("le canal gauche domine avant le passage, le droit après", () => {
    const [g, d] = doppler(sinus(440, 2), { ...DOPPLER, attenuer: false });
    expect(rms(g, 0, Math.floor(SR * 0.4))).toBeGreaterThan(rms(d, 0, Math.floor(SR * 0.4)));
    expect(rms(d, Math.floor(SR * 1.6), SR * 2)).toBeGreaterThan(rms(g, Math.floor(SR * 1.6), SR * 2));
  });

  it("les instants d'arrivée sont croissants : une source plus lente que le son ne se double pas", () => {
    const d = distances(SR * 2, { ...DOPPLER, vitesse: 300 });
    const arr = arrivees(SR * 2, d, { ...DOPPLER, vitesse: 300 });
    for (let i = 1; i < arr.length; i += 97) expect(arr[i]).toBeGreaterThan(arr[i - 1]);
  });

  it("l'inversion retrouve l'instant d'émission", () => {
    const arr = Float32Array.from([0, 10, 20, 30]); // une arrivée tous les dix échantillons
    const emis = emissions(arr, 31);
    expect(emis[0]).toBeCloseTo(0, 6);
    expect(emis[15]).toBeCloseTo(1.5, 6);
    expect(emis[30]).toBeCloseTo(3, 6);
  });

  it("avant la première arrivée, il n'y a rien à entendre", () => {
    const emis = emissions(Float32Array.from([5, 15, 25]), 30);
    expect(emis[0]).toBe(-1);
    expect(emis[3]).toBe(-1);
    expect(emis[10]).toBeGreaterThan(0);
  });

  it("une distance nulle ne divise pas par zéro", () => {
    const [g] = doppler(sinus(440, 0.3), { ...DOPPLER, distance: 0 });
    expect([...g].every(Number.isFinite)).toBe(true);
  });
});

describe("la bande", () => {
  it("au repos, elle ne fait presque rien — seul le retard de base décale le son", () => {
    const x = sinus(440, 0.5);
    const y = bande(x, BANDE);
    const retard = Math.round(0.01 * SR);
    for (let i = SR * 0.1; i < SR * 0.4; i += 311) expect(y[i]).toBeCloseTo(x[i - retard], 3);
  });

  it("le pleurage fait dériver la hauteur, lentement", () => {
    const y = bande(sinus(440, 2), { ...BANDE, pleurage: 30, pleurageHz: 0.5 });
    // ON MESURE LÀ OÙ LE RETARD CHANGE LE PLUS VITE, c'est-à-dire aux quarts de la période, et
    // non à la demie. Le décalage de hauteur suit la DÉRIVÉE du retard : à 0,5 s et 1,5 s d'une
    // oscillation de 2 s, cette dérivée est nulle et les deux mesures tombaient sur la même
    // valeur — 0,05 Hz d'écart, alors que l'effet est bien là.
    const a = hauteur(y, SR * 0.15, SR * 0.35);
    const b = hauteur(y, SR * 1.15, SR * 1.35);
    expect(Math.abs(a - b)).toBeGreaterThan(2);
  });

  it("le scintillement le fait vite : deux tranches proches diffèrent déjà", () => {
    const y = bande(sinus(440, 1), { ...BANDE, scintillement: 20, scintillementHz: 10 });
    const a = hauteur(y, SR * 0.30, SR * 0.34);
    const b = hauteur(y, SR * 0.35, SR * 0.39);
    expect(Math.abs(a - b)).toBeGreaterThan(2);
  });

  it("la saturation écrête les crêtes sans changer le niveau d'ensemble", () => {
    expect(saturerBande(1, 3)).toBeCloseTo(1, 6);     // l'unité reste l'unité
    expect(saturerBande(-1, 3)).toBeCloseTo(-1, 6);
    expect(saturerBande(0.5, 3)).toBeGreaterThan(0.5); // le bas est relevé : c'est la compression
    expect(saturerBande(0.5, 0)).toBe(0.5);            // à zéro, rien
  });

  it("elle ajoute des harmoniques : un sinus pur n'en a pas, un sinus saturé si", () => {
    const y = bande(sinus(440, 0.5), { ...BANDE, saturation: 5 });
    // Un signal saturé a plus de passages par zéro « serrés » : on mesure plutôt l'écart à un
    // sinus pur, qui est la définition d'une distorsion.
    const x = sinus(440, 0.5);
    let ecart = 0;
    const retard = Math.round(0.01 * SR);
    for (let i = SR * 0.1; i < SR * 0.4; i++) ecart = Math.max(ecart, Math.abs(y[i] - x[i - retard]));
    expect(ecart).toBeGreaterThan(0.05);
  });

  it("les décrochages creusent des trous, et zéro n'en creuse aucun", () => {
    const x = sinus(440, 2);
    const avec = bande(x, { ...BANDE, decrochages: 6, graine: 3 });
    const sans = bande(x, { ...BANDE, decrochages: 0 });
    // ON CHERCHE SUR DES TRANCHES DE 20 ms, la longueur d'un décrochage, et l'on écarte le début :
    // le retard de base laisse un dixième de seconde de silence en tête, qui est le creux le plus
    // bas des DEUX sons et masquait donc la différence qu'on cherche.
    const creuxLePlusBas = (y: Float32Array) => {
      const large = Math.round(0.02 * SR);
      let m = Infinity;
      for (let a = Math.round(0.1 * SR); a + large < y.length; a += large) m = Math.min(m, rms(y, a, a + large));
      return m;
    };
    expect(creuxLePlusBas(avec)).toBeLessThan(creuxLePlusBas(sans) * 0.9);
  });

  it("le souffle s'entend sur un silence, et disparaît à zéro", () => {
    const silence = new Float32Array(SR);
    expect(rms(bande(silence, { ...BANDE, souffle: 0.01 }))).toBeGreaterThan(0.002);
    expect(rms(bande(silence, { ...BANDE, souffle: 0 }))).toBe(0);
  });

  it("la même graine rejoue la même bande", () => {
    const x = sinus(440, 0.3);
    const o = { ...BANDE, decrochages: 8, souffle: 0.01, graine: 77 };
    expect([...bande(x, o)]).toEqual([...bande(x, o)]);
  });

  it("le retard reste positif : une modulation ne doit jamais faire lire le futur", () => {
    const r = retardsBande(SR, { ...BANDE, pleurage: 90, scintillement: 90 });
    expect(Math.min(...r)).toBeGreaterThan(0);
  });

  it("aux réglages extrêmes, le son reste fini", () => {
    const y = bande(sinus(440, 0.3), {
      ...BANDE, pleurage: 100, scintillement: 100, saturation: 20, decrochages: 50, souffle: 0.5,
    });
    expect([...y].every(Number.isFinite)).toBe(true);
  });
});
