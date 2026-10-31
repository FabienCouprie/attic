// audio/correction-pleurage.test.ts — La vitesse retrouvée dans un ton de référence, et annulée.
//
// LES TÉMOINS SONT CALCULÉS ET NON LUS : la source est une somme de sinus, déformée par le retard
// exact du modèle de bande de `deplacement.ts`, évalué analytiquement en chaque instant. Le son
// corrigé se compare donc à la source elle-même, sans qu'aucun interpolateur ne s'interpose.
//
// LA HAUTEUR SE MESURE PAR LES PASSAGES PAR ZÉRO D'UN TON D'ESSAI À 1 kHz, loin de la référence :
// un instrument indépendant de la démodulation que le module emploie.
import { describe, expect, it } from "vitest";

import {
  centresDeGrille, corrigerPleurage, instantsEnregistres, lisserVitesse, suiviPour, vitessesDeReference,
  type DemandePleurage, type ReglagesPleurage,
} from "./correction-pleurage";
import { retardsBande, type OptionsBande } from "./deplacement";

const SR = 48000;
const DUREE = 3;
const N = SR * DUREE;
const REGLAGES: ReglagesPleurage = { referenceHz: 50, ecartMax: 0.03, rythmeMaxHz: 20, vitesseMoyenne: "corriger" };

/** La source : un ton d'essai, un second plus aigu, et le ronflement qui sert de référence. */
const source = (t: number, ronflement = 0.01, f0 = 50) =>
  0.3 * Math.sin(2 * Math.PI * 1000 * t) + 0.1 * Math.sin(2 * Math.PI * 3150 * t + 0.4)
  + ronflement * Math.sin(2 * Math.PI * f0 * t + 1.1);

/**
 * Le ton d'essai seul, sur un second canal : c'est sur lui que la hauteur se mesure.
 *
 * LA SOURCE ENTIÈRE NE SE MESURE PAS PAR SES PASSAGES PAR ZÉRO. Le ton à 3 150 Hz y en ajoute, et le
 * ronflement les déplace de 5 µs d'une période à l'autre : 0,17 % de faux écart, plus que ce que la
 * correction doit laisser. Le module relit tous les canaux à la même horloge, donc ce canal dit
 * exactement ce que l'autre a subi.
 */
const ton = (t: number) => 0.3 * Math.sin(2 * Math.PI * 1000 * t);

/** Le modèle de bande à ses réglages d'ouverture : ±0,30 % de pleurage à 0,6 Hz, ±1,70 % de scintillement à 9 Hz. */
const BANDE: OptionsBande = {
  pleurage: 0.3, pleurageHz: 0.6, scintillement: 1.7, scintillementHz: 9,
  saturation: 0, decrochages: 0, souffle: 0, graine: 1, frequence: SR,
};

/** La source lue à travers le retard de la bande, évaluée exactement en chaque instant. */
function deformee(retards: Float32Array, s = source): Float32Array {
  return Float32Array.from(retards, (r, i) => s((i - r) / SR));
}

/** La fréquence instantanée d'un ton, période par période, entre deux instants. */
function frequences(x: Float32Array, debut: number, fin: number): number[] {
  const passages: number[] = [];
  for (let i = Math.floor(debut * SR); i < Math.min(x.length - 1, fin * SR); i++) {
    if (x[i] < 0 && x[i + 1] >= 0) passages.push(i + x[i] / (x[i] - x[i + 1]));
  }
  return passages.slice(1).map((p, k) => SR / (p - passages[k]));
}

/** Le plus grand écart relatif d'une fréquence à 1 kHz. */
const ecartA1k = (f: number[]) => Math.max(...f.map((v) => Math.abs(v / 1000 - 1)));

/** Le rapport, en décibels, d'un son à son écart à un témoin, sur une plage d'échantillons. */
function rapportDb(x: Float32Array, temoin: (k: number) => number, debut: number, fin: number): number {
  let s = 0, e = 0;
  for (let k = debut; k < fin; k++) {
    const t = temoin(k);
    s += t * t;
    e += (x[k] - t) ** 2;
  }
  return 10 * Math.log10(s / e);
}

/**
 * Le retard constant qui aligne le mieux un son sur un témoin, en échantillons, cherché au centième.
 *
 * L'HORLOGE RETROUVÉE N'A PAS D'ORIGINE CONNUE : ses bords, où la fenêtre de démodulation sort du son,
 * sont tenus à la vitesse moyenne, et le décalage qu'ils prennent est celui du pleurage pendant ce
 * temps. Un retard constant ne fait rien trembler ; c'est ce qui reste après lui qui se juge.
 */
function meilleurRetard(x: Float32Array, temoin: (t: number) => number, debut: number, fin: number, autour: number): number {
  const rapport = (dk: number, a: number, b: number) => rapportDb(x, (k) => temoin((k - dk) / SR), a, b);
  let meilleur = autour;
  for (let dk = autour - 400; dk <= autour + 400; dk++) {
    if (rapport(dk, debut, debut + 4800) > rapport(meilleur, debut, debut + 4800)) meilleur = dk;
  }
  for (let dk = meilleur - 1; dk <= meilleur + 1; dk += 0.01) if (rapport(dk, debut, fin) > rapport(meilleur, debut, fin)) meilleur = dk;
  return meilleur;
}

const demande = (canaux: Float32Array[], r: Partial<ReglagesPleurage> = {}): DemandePleurage =>
  ({ ...REGLAGES, ...r, canaux, sr: SR });

describe("correction du pleurage et du scintillement", () => {
  it("L'INSTRUMENT voit la hauteur d'un ton pur au millionième, et l'écart planté par la bande", () => {
    const pur = Float32Array.from({ length: N }, (_, i) => ton((i * 1.003) / SR));
    for (const f of frequences(pur, 0.5, 2.5)) expect(Math.abs(f / 1003 - 1)).toBeLessThan(1e-5);
    // 0,30 % de pleurage et 1,70 % de scintillement, qui s'ajoutent quand leurs crêtes se rencontrent.
    const ecart = ecartA1k(frequences(deformee(retardsBande(N, BANDE), ton), 0.5, 2.5));
    expect(ecart).toBeGreaterThan(0.017);
    expect(ecart).toBeLessThan(0.0201);
  });

  it("SANS ÉCART, LE SON RESSORT TEL QU'IL EST ENTRÉ, à la même longueur", () => {
    // La vitesse moyenne GARDÉE : corrigée, elle dépendrait du bruit de mesure, 2·10⁻⁶ sur un
    // ronflement à 0,01 quantifié en flottant 32 bits, et la longueur pourrait perdre un échantillon.
    const x = Float32Array.from({ length: N }, (_, i) => source(i / SR));
    const r = corrigerPleurage(demande([x, x.slice()], { vitesseMoyenne: "garder" }));
    expect(r.raison).toBe("corrige");
    expect(r.canaux[0].length).toBe(N);
    expect(r.creteEcart).toBeLessThan(1e-5);
    let pire = 0;
    for (let i = 0; i < N; i++) pire = Math.max(pire, Math.abs(r.canaux[0][i] - x[i]));
    expect(pire).toBeLessThan(1e-4);
  });

  it("LE PLEURAGE ET LE SCINTILLEMENT DU MODÈLE DE BANDE SONT ANNULÉS, et le son revient sur la source", () => {
    const retards = retardsBande(N, BANDE);
    const y = deformee(retards);
    const temoin = deformee(retards, ton);
    const avant = ecartA1k(frequences(temoin, 0.5, 2.5));
    const r = corrigerPleurage(demande([y, temoin]));
    const apres = ecartA1k(frequences(r.canaux[1], 0.5, 2.5));
    // Relevé : 2,0 % d'écart avant, 1,2·10⁻⁵ après, soit 1 600 fois moins. Une pente aux centres prise
    // comme la moyenne de ses deux pas en laissait 2,3·10⁻⁴, et c'est elle que la borne refuse.
    expect(avant).toBeGreaterThan(0.017);
    expect(apres).toBeLessThan(avant / 500);
    // Le son corrigé est la source à un retard constant, proche du retard initial de la bande : ce
    // qui reste après lui se mesure sur tout le spectre, aigu compris.
    const retard = meilleurRetard(r.canaux[0], source, 0.5 * SR, 2.5 * SR, retards[0]);
    // Relevé : 76 dB, aigu compris.
    expect(Math.abs(retard - retards[0]) / SR).toBeLessThan(0.002);
    expect(rapportDb(r.canaux[0], (k) => source((k - retard) / SR), 0.5 * SR, 2.5 * SR)).toBeGreaterThan(65);
    expect(r.creteEcart).toBeGreaterThan(0.015);
    expect(r.creteEcart).toBeLessThan(0.025);
  });

  it("LA VITESSE MOYENNE GARDÉE laisse la durée, et corrigée ramène la référence à sa fréquence", () => {
    // Une bande relue 1 % trop vite : tout monte d'un centième, et dure un centième de moins.
    const vite = [source, ton].map((s) => Float32Array.from({ length: N }, (_, i) => s((i * 1.01) / SR)));
    const gardee = corrigerPleurage(demande(vite, { vitesseMoyenne: "garder" }));
    expect(gardee.canaux[0].length).toBe(N);
    expect(gardee.vitesseMoyenne).toBeCloseTo(0.01, 4);
    const fGardee = frequences(gardee.canaux[1], 0.5, 2.5);
    expect(fGardee.reduce((a, b) => a + b) / fGardee.length).toBeCloseTo(1010, 0);
    const corrigee = corrigerPleurage(demande(vite));
    expect(corrigee.canaux[0].length).toBe(Math.floor((N - 1) * 1.01) + 1);
    expect(ecartA1k(frequences(corrigee.canaux[1], 0.5, 2.5))).toBeLessThan(1e-4);
  });

  it("UN RONFLEMENT EN OPPOSITION DE PHASE SUR DEUX CANAUX reste une référence", () => {
    const retards = retardsBande(N, BANDE);
    const gauche = deformee(retards, (t) => source(t, 0.01));
    const droite = deformee(retards, (t) => source(t, -0.01));
    const r = corrigerPleurage(demande([gauche, droite, deformee(retards, ton)]));
    expect(r.raison).toBe("corrige");
    // Relevé : 1,2·10⁻⁵, autant qu'un ronflement sur un seul canal.
    expect(ecartA1k(frequences(r.canaux[2], 0.5, 2.5))).toBeLessThan(4e-5);
  });

  it("UN PASSAGE SANS RÉFÉRENCE est comblé sans faire sauter l'horloge d'un tour", () => {
    const retards = retardsBande(N, BANDE);
    const trou = (t: number) => (t > 1.2 && t < 1.5 ? 0 : 0.01);
    const y = deformee(retards, (t) => source(t, trou(t)));
    const r = corrigerPleurage(demande([y, deformee(retards, ton)]));
    expect(r.partIncertaine).toBeGreaterThan(0.05);
    expect(r.partIncertaine).toBeLessThan(0.3);
    // CE QUE LE TROU COÛTE, ET CE QU'IL NE DOIT PAS COÛTER. Tant que la fenêtre de démodulation touche
    // le trou, soit une demi-seconde, l'écart n'est plus vu : l'horloge garde le décalage que pleurage
    // et scintillement ont pris pendant ce temps, moins d'une milliseconde. Un tour sauté en vaudrait
    // vingt. Après le trou, le son corrigé doit donc être la source à un retard constant, proche de
    // celui d'avant le trou, et sa hauteur corrigée.
    const avant = meilleurRetard(r.canaux[0], source, 0.4 * SR, 1.0 * SR, retards[0]);
    const apres = meilleurRetard(r.canaux[0], source, 1.8 * SR, 2.5 * SR, avant);
    // Relevé : 0,26 ms de décalage, 64 dB et 1,2·10⁻⁵ d'écart après le trou.
    expect(Math.abs(apres - avant) / SR).toBeLessThan(0.003);
    expect(rapportDb(r.canaux[0], (k) => source((k - apres) / SR), 1.8 * SR, 2.5 * SR)).toBeGreaterThan(55);
    expect(ecartA1k(frequences(r.canaux[1], 1.8, 2.5))).toBeLessThan(4e-5);
  });

  it("SANS RÉFÉRENCE, LE SON RESSORT INTACT et la raison le dit", () => {
    const x = Float32Array.from({ length: N }, (_, i) => source(i / SR, 0));
    const r = corrigerPleurage(demande([x]));
    expect(r.raison).toBe("introuvable");
    expect(Array.from(r.canaux[0])).toEqual(Array.from(x));
    expect(Array.from(r.ecart).every((v) => v === 0.5)).toBe(true);
  });

  it("UNE RÉFÉRENCE TROP AIGUË ET UN SON TROP COURT sont refusés", () => {
    const x = Float32Array.from({ length: N }, (_, i) => source(i / SR));
    expect(corrigerPleurage(demande([x], { referenceHz: 22000 })).raison).toBe("hors-bande");
    expect(corrigerPleurage(demande([x.subarray(0, 4000)])).raison).toBe("trop-court");
  });

  it("LA COURBE D'ÉCART suit la durée reçue, entre zéro et un, centrée sans écart", () => {
    const retards = retardsBande(N, BANDE);
    const r = corrigerPleurage(demande([deformee(retards)]));
    expect(r.ecart.length).toBe(DUREE * 200);
    const milieu = Array.from(r.ecart.subarray(100, 500));
    expect(Math.min(...milieu)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...milieu)).toBeLessThanOrEqual(1);
    // 1,7 % de scintillement sur 3 % d'écart admis : la courbe va au moins à 0,5 ± 0,25.
    expect(Math.max(...milieu) - 0.5).toBeGreaterThan(0.25);
    expect(0.5 - Math.min(...milieu)).toBeGreaterThan(0.25);
  });

  it("LE RYTHME SUIVI EST BORNÉ par la bande, qui reste sous les six dixièmes de la référence", () => {
    const s = suiviPour(SR, { ...REGLAGES, referenceHz: 25, rythmeMaxHz: 100 });
    expect(s.rythmeHz).toBeCloseTo(0.6 * 25 - 0.03 * 25, 9);
    expect(s.bandeHz).toBeCloseTo(15, 9);
  });

  it.each([
    // Relevé : 0,01 % de l'écart de temps à 9 Hz, rythme courant d'un cabestan, et 0,13 % au rythme
    // maximum, que le lissage ampute de 1/(1 + (tan(π·20/172) / tan(π·40/172))⁸).
    [9, 0.001], [20, 0.003],
  ])("L'HORLOGE RETROUVÉE suit un écart de vitesse planté à %d Hz, à %f près de son amplitude", (hz, tolerance) => {
    // La référence seule, modulée en fréquence : son instant d'enregistrement vaut t + (a/w) sin(wt).
    const w = (2 * Math.PI * hz) / SR, a = 0.01;
    const tauVrai = (t: number) => t + (a / w) * Math.sin(w * t);
    const x = Float32Array.from({ length: N }, (_, i) => 0.01 * Math.sin((2 * Math.PI * 50 * tauVrai(i)) / SR));
    const s = suiviPour(SR, REGLAGES);
    const centres = centresDeGrille(N, s.pas);
    const v = lisserVitesse(vitessesDeReference([x], SR, REGLAGES, s, centres).v, s.rythmeHz, SR / s.pas);
    const tau = instantsEnregistres(v, centres);
    // UN DÉCALAGE CONSTANT NE COMPTE PAS : il retarde tout le son d'autant, sans rien faire trembler.
    // Les bords, où la fenêtre de démodulation sort du son, sont comblés par la vitesse moyenne ; le
    // lissage étale la marche entre elle et le scintillement réel sur une dizaine de centres de plus.
    const garde = Math.ceil(s.demi / s.pas) + 12;
    const ecarts = Array.from(centres, (c, m) => tau[m] - tauVrai(c)).slice(garde, -garde);
    const decalage = ecarts.reduce((somme, e) => somme + e, 0) / ecarts.length;
    const pire = Math.max(...ecarts.map((e) => Math.abs(e - decalage)));
    expect(pire).toBeLessThan(tolerance * (a / w));
  });

  it("LA VITESSE MESURÉE suit le sens de l'écart : une référence plus haute dit une bande plus rapide", () => {
    const x = Float32Array.from({ length: N }, (_, i) => source(i / SR, 0.01, 50.5));
    const s = suiviPour(SR, REGLAGES);
    const centres = centresDeGrille(N, s.pas);
    const { v } = vitessesDeReference([x], SR, REGLAGES, s, centres);
    expect(v[Math.floor(v.length / 2)]).toBeCloseTo(1.01, 5);
  });
});
