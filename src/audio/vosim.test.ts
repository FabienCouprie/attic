// audio/vosim.test.ts — Ce qu'un formant sans filtre doit faire, et ce qu'un filtre ne peut pas.
import { describe, expect, it } from "vitest";
import { impulsion, impulsionsQuiTiennent, vosim } from "./vosim";
import { fft } from "./fft";

const SR = 44100;

const BASE = { sampleRate: SR, dureeSec: 0.5, fondamentale: 100, formant: 1200, impulsions: 5 };

/** Le spectre d'amplitude, sur une puissance de deux prise au milieu du rendu. */
function spectre(x: Float32Array, taille = 8192): { bins: Float64Array; parBin: number } {
  const de = Math.max(0, Math.floor((x.length - taille) / 2));
  const re = new Float64Array(taille);
  const im = new Float64Array(taille);
  for (let i = 0; i < taille; i++) {
    // Fenêtre de Hann, sans quoi les bords de la tranche étaleraient tout le spectre.
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / taille);
    re[i] = (x[de + i] ?? 0) * w;
  }
  fft(re, im, false);
  const bins = new Float64Array(taille / 2);
  for (let k = 0; k < bins.length; k++) bins[k] = Math.hypot(re[k], im[k]);
  return { bins, parBin: SR / taille };
}

/** La fréquence du pic le plus haut au-dessus de `plancher`. */
function pic(x: Float32Array, plancher: number): number {
  const { bins, parBin } = spectre(x);
  let meilleur = 0;
  let rang = 0;
  for (let k = Math.ceil(plancher / parBin); k < bins.length; k++) {
    if (bins[k] > meilleur) { meilleur = bins[k]; rang = k; }
  }
  return rang * parBin;
}

/** Le centre de gravité du spectre au-dessus de `plancher`, en hertz. */
function centroide(x: Float32Array, plancher: number): number {
  const { bins, parBin } = spectre(x);
  let haut = 0;
  let bas = 0;
  for (let k = Math.ceil(plancher / parBin); k < bins.length; k++) {
    haut += k * parBin * bins[k];
    bas += bins[k];
  }
  return bas === 0 ? 0 : haut / bas;
}

/**
 * La largeur du formant, en hertz, mesurée sur L'ENVELOPPE DU PEIGNE et non sur une raie.
 *
 * UNE PREMIÈRE VERSION MESURAIT LA RAIE, et rendait seize hertz quel que soit le nombre
 * d'impulsions. C'est juste et sans rapport avec la question : le spectre est un peigne aux
 * multiples de la fondamentale, et la largeur d'une de ses raies ne tient qu'à la fenêtre
 * d'analyse. Ce qui se resserre quand la salve s'allonge est l'ENVELOPPE qui coiffe ces raies.
 * La fonction relève donc la hauteur du peigne harmonique par harmonique, puis l'étendue où cette
 * hauteur reste au-dessus de la mi-hauteur de son sommet.
 */
function largeurDuFormant(x: Float32Array, fondamentale: number): number {
  const { bins, parBin } = spectre(x);
  const hauteurs: { hz: number; a: number }[] = [];
  for (let m = 1; m * fondamentale < SR / 2 - fondamentale; m++) {
    const hz = m * fondamentale;
    const k = Math.round(hz / parBin);
    // Le sommet de la raie, cherché à un bin près : la fondamentale ne tombe pas sur un bin pile.
    let a = 0;
    for (let j = Math.max(0, k - 1); j <= Math.min(bins.length - 1, k + 1); j++) a = Math.max(a, bins[j]);
    hauteurs.push({ hz, a });
  }
  let rang = 0;
  for (let m = 1; m < hauteurs.length; m++) if (hauteurs[m].a > hauteurs[rang].a) rang = m;
  const moitie = hauteurs[rang].a / 2;
  let bas = rang;
  while (bas > 0 && hauteurs[bas].a > moitie) bas--;
  let haut = rang;
  while (haut < hauteurs.length - 1 && hauteurs[haut].a > moitie) haut++;
  return hauteurs[haut].hz - hauteurs[bas].hz;
}

describe("VOSIM", () => {
  it("L'IMPULSION EST UNE DEMI-PÉRIODE DE SINUS ÉLEVÉE AU CARRÉ, et elle ne passe jamais sous zéro", () => {
    expect(impulsion(0)).toBe(0);
    expect(impulsion(0.5)).toBeCloseTo(1, 12);
    expect(impulsion(1)).toBe(0);
    expect(impulsion(-0.1)).toBe(0);
    expect(impulsion(1.5)).toBe(0);
    for (let u = 0; u <= 1; u += 0.01) expect(impulsion(u)).toBeGreaterThanOrEqual(0);
    // Symétrique autour de son sommet, ce qui est la condition pour qu'elle n'ajoute pas de phase.
    for (const u of [0.1, 0.25, 0.4]) expect(impulsion(u)).toBeCloseTo(impulsion(1 - u), 12);
  });

  it("LE PLAFOND DU MODÈLE EST LE RAPPORT DU FORMANT À LA FONDAMENTALE", () => {
    expect(impulsionsQuiTiennent(100, 1200)).toBe(12);
    expect(impulsionsQuiTiennent(100, 1250)).toBe(12);
    expect(impulsionsQuiTiennent(200, 1200)).toBe(6);
    // Un formant sous la fondamentale n'en laisse tenir aucune.
    expect(impulsionsQuiTiennent(1200, 100)).toBe(0);
  });

  it("ET CE QUI DÉPASSE N'EST PAS ÉCRIT, le rapport le disant plutôt que de le taire", () => {
    const tiennent = vosim({ ...BASE, impulsions: 12 });
    expect(tiennent.rapport.jetees).toBe(0);
    const debordent = vosim({ ...BASE, impulsions: 20 });
    expect(debordent.rapport.jetees).toBeGreaterThan(0);
    // Douze tiennent par événement, donc huit sont jetées à chacun des cinquante.
    expect(debordent.rapport.impulsions).toBe(tiennent.rapport.impulsions);
    expect(debordent.rapport.jetees).toBe(8 * debordent.rapport.evenements);
  });

  it("LE TÉMOIN : HORS DES IMPULSIONS, LA SORTIE EST EXACTEMENT NULLE", () => {
    // C'est ce qu'aucun filtre ne peut produire : un résonateur excité par une impulsion continue
    // de sonner, et ne redescend jamais à zéro exact. Ici le silence est le silence.
    const { sortie, rapport } = vosim({ ...BASE, fondamentale: 100, formant: 1000, impulsions: 5 });
    // Cinq impulsions d'un millième de seconde dans une période d'un centième : la salve occupe la
    // moitié de l'événement, donc la moitié du rendu est exactement nulle.
    expect(rapport.partSilence, `${(rapport.partSilence * 100).toFixed(1)} % de zéros exacts`)
      .toBeCloseTo(0.5, 2);
    // Et le silence est contigu : le dernier dixième de chaque période ne porte aucun échantillon
    // non nul, ce qu'une résonance ne permettrait pas.
    const periode = SR / 100;
    for (let e = 1; e < 40; e++) {
      const fin = Math.round(e * periode);
      for (let k = fin - Math.round(periode / 10); k < fin; k++) {
        expect(sortie[k], `événement ${e}, échantillon ${k}`).toBe(0);
      }
    }
  });

  it("LE TÉMOIN : LE FORMANT SUIT L'INVERSE DE LA DURÉE D'UNE IMPULSION", () => {
    for (const formant of [800, 1200, 1600, 2400]) {
      const { sortie } = vosim({ ...BASE, formant, impulsions: 6, decroissance: 1 });
      const trouve = pic(sortie, 300);
      expect(Math.abs(trouve - formant) / formant,
        `formant demandé ${formant} Hz, pic trouvé ${trouve.toFixed(0)} Hz`).toBeLessThan(0.05);
    }
  });

  it("ET LA FONDAMENTALE NE LE DÉPLACE PAS : les deux axes se règlent séparément", () => {
    // Tant que la salve tient dans l'événement, changer la fondamentale ne change que le silence.
    for (const fondamentale of [80, 100, 150]) {
      const { sortie } = vosim({ ...BASE, fondamentale, formant: 1200, impulsions: 5, decroissance: 1 });
      const trouve = pic(sortie, 300);
      expect(Math.abs(trouve - 1200) / 1200,
        `fondamentale ${fondamentale} Hz, pic trouvé ${trouve.toFixed(0)} Hz`).toBeLessThan(0.05);
    }
  });

  it("LE TÉMOIN : PLUS LA SALVE PORTE D'IMPULSIONS, PLUS LE FORMANT EST ÉTROIT", () => {
    // C'est ce que le nombre d'impulsions donne et qu'un seul motif par période ne donnerait pas.
    // LA FONDAMENTALE EST BASSE POUR CE RELEVÉ, et c'est une contrainte de la mesure et non du
    // modèle : l'enveloppe se lit sur les raies du peigne, donc on ne peut pas résoudre une largeur
    // plus fine que deux espacements. À cent hertz, la largeur attendue pour huit impulsions vaut
    // 150 Hz et le relevé butait sur 200. À vingt-cinq, six raies la couvrent.
    const largeurs = [2, 4, 8].map((impulsions) =>
      largeurDuFormant(
        vosim({ ...BASE, fondamentale: 25, formant: 1200, impulsions, decroissance: 1 }).sortie, 25));
    const dit = largeurs.map((l, k) => `${[2, 4, 8][k]} impulsions : ${l.toFixed(0)} Hz`).join(" · ");
    expect(largeurs[1], dit).toBeLessThan(largeurs[0]);
    expect(largeurs[2], dit).toBeLessThan(largeurs[1]);
  });

  it("LA DÉCROISSANCE EST UN FACTEUR D'UNE IMPULSION À LA SUIVANTE", () => {
    const { sortie } = vosim({
      ...BASE, dureeSec: 0.02, fondamentale: 100, formant: 1000, impulsions: 5, decroissance: 0.5,
    });
    // Le sommet de l'impulsion p vaut le facteur à la puissance p.
    const T = SR / 1000;
    for (let p = 0; p < 5; p++) {
      const sommet = sortie[Math.round(p * T + T / 2)];
      expect(sommet, `impulsion ${p}`).toBeCloseTo(Math.pow(0.5, p), 2);
    }
  });

  it("LE FACTEUR D'IMPULSION RACCOURCIT LES IMPULSIONS AU FIL DE LA SALVE", () => {
    const egales = vosim({ ...BASE, impulsions: 6, facteur: 1, decroissance: 1 });
    const montantes = vosim({ ...BASE, impulsions: 6, facteur: 1.2, decroissance: 1 });
    expect(Array.from(montantes.sortie)).not.toEqual(Array.from(egales.sortie));
    // Les impulsions raccourcissant, la salve occupe moins de place et le silence grandit.
    expect(montantes.rapport.partSilence).toBeGreaterThan(egales.rapport.partSilence);
    // Et le formant monte, la durée moyenne d'une impulsion ayant baissé.
    expect(pic(montantes.sortie, 300)).toBeGreaterThan(pic(egales.sortie, 300));
  });

  it("LA SALVE EST UNIPOLAIRE, et le rapport donne la composante continue plutôt que de la taire", () => {
    const { sortie, rapport } = vosim({ ...BASE, formant: 1000, impulsions: 5, decroissance: 1 });
    for (let k = 0; k < sortie.length; k++) expect(sortie[k]).toBeGreaterThanOrEqual(0);
    // Cinq impulsions sur la moitié de la période, de moyenne un demi : le continu vaut un quart.
    expect(rapport.continu, `continu ${rapport.continu.toFixed(4)}`).toBeCloseTo(0.25, 2);
  });

  it("UNE COURBE PLATE REND EXACTEMENT CE QUE REND LE RÉGLAGE, au bit près", () => {
    const o = { ...BASE, fondamentale: 100, formant: 1250, impulsions: 5, decroissance: 0.5, amplitude: 0.5 };
    const n = Math.round(o.dureeSec * SR);
    const fixe = vosim(o);
    const plate = vosim({
      ...o,
      fondamentale: new Float32Array(n).fill(100),
      formant: new Float32Array(n).fill(1250),
      decroissance: new Float32Array(n).fill(0.5),
      amplitude: new Float32Array(n).fill(0.5),
    });
    expect(Array.from(plate.sortie)).toEqual(Array.from(fixe.sortie));
    expect(plate.rapport.evenements).toBe(fixe.rapport.evenements);
  });

  it("UNE COURBE QUI VARIE NE REND PAS CE QUE REND SA PREMIÈRE VALEUR", () => {
    const o = { ...BASE, fondamentale: 100, formant: 1200, impulsions: 4, decroissance: 1 };
    const n = Math.round(o.dureeSec * SR);
    const montante = new Float32Array(n);
    for (let i = 0; i < n; i++) montante[i] = 100 + (300 * i) / n;
    const tenue = vosim({ ...o, fondamentale: new Float32Array(n).fill(100) });
    const variee = vosim({ ...o, fondamentale: montante });
    // La fondamentale montant, les événements raccourcissent : il y en a plus dans la même durée.
    expect(variee.rapport.evenements).toBeGreaterThan(tenue.rapport.evenements);

    const formantMontant = new Float32Array(n);
    for (let i = 0; i < n; i++) formantMontant[i] = 800 + (2400 * i) / n;
    const fixe = vosim({ ...o, formant: 800 });
    const balaye = vosim({ ...o, formant: formantMontant });
    // LE PIC NE SERT PAS SUR UN FORMANT QUI BALAIE, et deux relevés l'ont montré. Un balayage de
    // 800 à 3200 hertz étale la bosse du formant sur toute cette étendue, de sorte que la raie la
    // plus haute redevient celle du bas du peigne : le relevé rendait 301 Hz, sur tout le rendu
    // comme sur son dernier tiers. Le CENTROÏDE, lui, monte avec le formant même étalé.
    const balayeC = centroide(balaye.sortie, 300);
    const fixeC = centroide(fixe.sortie, 300);
    expect(balayeC, `balayé ${balayeC.toFixed(0)} Hz, fixe ${fixeC.toFixed(0)} Hz`)
      .toBeGreaterThan(fixeC * 1.3);
  });
});
