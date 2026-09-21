// audio/correction-hauteur.test.ts — Une note fausse doit ressortir juste, et le reste intact.
//
// LE TEST QUI COMPTE : un la à 452 Hz — un quart de ton trop haut — doit ressortir à 440. Il se
// mesure avec le MÊME suiveur de hauteur que celui qui pilote la correction, ce qui serait une
// circularité s'il s'agissait de vérifier le suiveur ; ici on vérifie que la CORRECTION agit, et
// le suiveur n'est que l'instrument. Un sinus pur ne lui laisse aucune ambiguïté.
//
// LES AUTRES TESTS GARDENT CE QU'IL NE FAUT PAS ABÎMER : la durée, le silence, une note déjà
// juste, et une note dont l'écart est trop grand pour être honnêtement attribué à une fausseté.
import { describe, expect, it } from "vitest";
import { corrigerHauteur, courbeDeCorrection, degrePlusProche, psola } from "./correction-hauteur";
import { suivreHauteur } from "./hauteur";

const SR = 22050;
const DUREE = 1.2;

/** Un sinus, la matière la plus lisible pour un suiveur de hauteur. */
function sinus(hz: number, dureeSec = DUREE, sr = SR): Float32Array {
  const n = Math.floor(sr * dureeSec);
  return Float32Array.from({ length: n }, (_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / sr));
}

/** La hauteur médiane mesurée, en Hz — l'instrument de mesure de ces tests. */
function hauteurMesuree(x: Float32Array, sr = SR): number {
  const s = suivreHauteur(x, sr, { cadence: 100 });
  const retenues = [...s.hauteurs].filter((f, i) => f > 0 && s.confiances[i] > 0.5).sort((a, b) => a - b);
  return retenues.length > 0 ? retenues[Math.floor(retenues.length / 2)] : 0;
}

const CHROMATIQUE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DO_MAJEUR = [0, 2, 4, 5, 7, 9, 11];
const BASE = {
  degres: CHROMATIQUE, force: 1, transitionMs: 0, seuilConfiance: 0.4,
  ecartMaxDemiTons: 1, frequence: SR, cadence: 100,
};

describe("le degré le plus proche", () => {
  it("une note déjà juste ne bouge pas", () => {
    expect(degrePlusProche(69, CHROMATIQUE)).toBe(69);
    expect(degrePlusProche(60, DO_MAJEUR)).toBe(60);
  });

  it("un do dièse en do majeur tombe sur le do ou sur le ré, selon le plus proche", () => {
    expect(degrePlusProche(61.2, DO_MAJEUR)).toBe(62);   // plus près du ré
    expect(degrePlusProche(60.8, DO_MAJEUR)).toBe(60);   // plus près du do
  });

  it("CHERCHE DANS LES OCTAVES VOISINES : un si juste sous un do remonte au do", () => {
    // 71,8 est un si très haut ; en pentatonique sans si, il doit monter au do 72 et non
    // redescendre au sol 67 de son octave.
    expect(degrePlusProche(71.8, [0, 2, 4, 7, 9])).toBe(72);
  });

  it("une liste vide ne corrige rien", () => {
    expect(degrePlusProche(63.4, [])).toBe(63.4);
  });
});

describe("le recollement synchrone des périodes", () => {
  /** Le suivi de périodes d'un son de hauteur connue : ce que PSOLA attend. */
  const periodes = (hz: number, trames = 200) => new Float32Array(trames).fill(SR / hz);

  it("un rapport de un rend le son, sans le déplacer dans le temps", () => {
    const x = sinus(440);
    const y = psola(x, periodes(440), new Float32Array(200).fill(1), 100, SR);
    expect(y.length).toBe(x.length);
    // Le recouvrement de Hann normalisé rend l'original à la précision du rééchantillonnage.
    const milieu = Math.floor(x.length / 2);
    for (let i = milieu; i < milieu + 50; i++) expect(y[i]).toBeCloseTo(x[i], 2);
  });

  it("UN RAPPORT CONSTANT TRANSPOSE BIEN DE CE RAPPORT, sur la plage utile", () => {
    // Deux demi-tons vers le haut, puis vers le bas : l'étendue d'une correction de justesse.
    const haut = psola(sinus(300), periodes(300), new Float32Array(200).fill(1.1225), 100, SR);
    expect(hauteurMesuree(haut)).toBeGreaterThan(325);
    expect(hauteurMesuree(haut)).toBeLessThan(345);
    const bas = psola(sinus(300), periodes(300), new Float32Array(200).fill(0.8909), 100, SR);
    expect(hauteurMesuree(bas)).toBeGreaterThan(258);
    expect(hauteurMesuree(bas)).toBeLessThan(277);
  });

  it("AU-DELÀ DE QUATRE DEMI-TONS, LE RAPPORT EST BORNÉ plutôt que promis", () => {
    // Mesuré avant de poser la borne : à un rapport de 2, deux copies d'un même grain espacées
    // d'une demi-période s'annulent, et la raie dominante tombait à 1 % du niveau d'entrée.
    const borne = psola(sinus(300), periodes(300), new Float32Array(200).fill(1.26), 100, SR);
    const demande = psola(sinus(300), periodes(300), new Float32Array(200).fill(2), 100, SR);
    for (let i = 0; i < borne.length; i += 997) expect(demande[i]).toBeCloseTo(borne[i], 6);
    const rms = (x: Float32Array) => Math.sqrt([...x].reduce((a, v) => a + v * v, 0) / x.length);
    expect(rms(demande)).toBeGreaterThan(0.2 * rms(sinus(300)));
  });

  it("ne fait ni déborder ni lever aux bornes", () => {
    const y = psola(sinus(440, 0.1), periodes(440, 5), new Float32Array(5).fill(1.5), 100, SR);
    expect([...y].every(Number.isFinite)).toBe(true);
  });
});

describe("corriger la hauteur", () => {
  it("UN LA UN QUART DE TON TROP HAUT RESSORT À 440", () => {
    const faux = sinus(452);                       // 452 Hz : 46 cents au-dessus du la
    expect(hauteurMesuree(faux)).toBeGreaterThan(448);
    const r = corrigerHauteur(faux, BASE);
    const apres = hauteurMesuree(r.audio);
    expect(apres).toBeGreaterThan(435);
    expect(apres).toBeLessThan(445);
  });

  it("et le nœud sait dire combien il a corrigé", () => {
    const r = corrigerHauteur(sinus(452), BASE);
    expect(r.centsMoyen).toBeGreaterThan(30);
    expect(r.centsMoyen).toBeLessThan(60);
    expect(r.partCorrigee).toBeGreaterThan(0.8);
  });

  it("UNE NOTE DÉJÀ JUSTE N'EST PAS DÉPLACÉE", () => {
    const r = corrigerHauteur(sinus(440), BASE);
    expect(r.centsMoyen).toBeLessThan(10);
    expect(hauteurMesuree(r.audio)).toBeCloseTo(440, -1);
  });

  it("à force nulle, le son n'est pas corrigé du tout", () => {
    const r = corrigerHauteur(sinus(452), { ...BASE, force: 0 });
    expect(r.centsMoyen).toBe(0);
    expect(hauteurMesuree(r.audio)).toBeGreaterThan(448);
  });

  it("à demi-force, l'écart est réduit de moitié et non annulé", () => {
    const r = corrigerHauteur(sinus(452), { ...BASE, force: 0.5 });
    const apres = hauteurMesuree(r.audio);
    expect(apres).toBeLessThan(450);
    expect(apres).toBeGreaterThan(442);
  });

  it("UN ÉCART TROP GRAND N'EST PAS CORRIGÉ : mieux vaut laisser juste que fabriquer faux", () => {
    // Une octave d'erreur du suiveur déplacerait la note d'une octave. La borne l'interdit.
    const r = corrigerHauteur(sinus(452), { ...BASE, ecartMaxDemiTons: 0.2 });
    expect(r.centsMoyen).toBe(0);
  });

  it("la gamme choisie décide : hors gamme, la note est tirée vers un degré permis", () => {
    // Un do dièse (277 Hz) en do majeur : il n'y est pas, il doit rejoindre le do ou le ré.
    const r = corrigerHauteur(sinus(277.2), { ...BASE, degres: DO_MAJEUR, ecartMaxDemiTons: 2 });
    const apres = hauteurMesuree(r.audio);
    const proche = (f: number) => Math.abs(1200 * Math.log2(apres / f)) < 40;
    expect(proche(261.6) || proche(293.7)).toBe(true);
  });

  it("la durée est conservée", () => {
    const x = sinus(452);
    expect(corrigerHauteur(x, BASE).audio.length).toBe(x.length);
  });

  it("le silence et le bruit ne sont pas corrigés", () => {
    const silence = new Float32Array(SR);
    expect(corrigerHauteur(silence, BASE).centsMoyen).toBe(0);
    const bruit = Float32Array.from({ length: SR }, () => Math.random() * 2 - 1);
    expect(corrigerHauteur(bruit, { ...BASE, seuilConfiance: 0.8 }).centsMoyen).toBe(0);
  });

  it("la courbe de correction place le zéro au milieu", () => {
    const r = corrigerHauteur(sinus(440), BASE);
    const c = courbeDeCorrection(r, 1);
    expect(c.cadence).toBe(r.cadence);
    // Quelques cents subsistent sur un sinus « parfaitement » juste : le suiveur mesure, il ne
    // devine pas. On tolère deux centièmes de l'étendue, soit deux cents de correction résiduelle.
    for (const v of c.valeurs) expect(Math.abs(v - 0.5)).toBeLessThan(0.02);
    const monte = courbeDeCorrection(corrigerHauteur(sinus(428), BASE), 1);
    expect(Math.max(...monte.valeurs)).toBeGreaterThan(0.5);
  });
});
