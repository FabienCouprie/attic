// audio/fondamentale-manquante.test.ts — La hauteur est-elle vraiment absente du signal ?
//
// CE QUE CE FICHIER DOIT PROUVER. Tout le sujet tient en une phrase : le signal ne contient PAS la
// fréquence qu'on entend. Un stimulus qui la laisserait passer, par une sinusoïde oubliée ou par un
// repli de calcul, ne serait plus une illusion mais un son ordinaire, et personne ne s'en
// apercevrait à l'oreille — la hauteur serait la bonne.
//
// LE SECOND CAS EST CELUI QUI TRANCHE ENTRE DEUX EXPLICATIONS, et c'est pourquoi il est ici. Un
// décalage ajouté à tous les partiels laisse leurs ÉCARTS inchangés : une oreille qui ne lirait que
// la période de l'enveloppe entendrait la même hauteur. La mesure de Schouten dit le contraire, et
// la prédiction du composant doit suivre cette mesure, non l'écart des partiels.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  echantillonsDuComplexe, echantillonsDuSinus, hauteurPrediteDuResidu, partielsDuComplexe,
} from "./fondamentale-manquante";

const BASE = { fondamentale: 220, premierRang: 3, harmoniques: 6, decroissance: 50, decalage: 0 };

/** L'énergie du signal à une fréquence donnée, par Goertzel. */
function energieA(x: Float32Array, hz: number, sr: number): number {
  const w = (2 * Math.PI * hz) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

const rendu = (o: typeof BASE, masque = 0) => echantillonsDuComplexe(partielsDuComplexe(o), {
  duree: 0.5, niveau: 1, masque, coupure: Math.max(20, partielsDuComplexe(o)[0].frequence * 0.8),
  sampleRate: 16000, graine: 1,
});

describe("le complexe sans son fondamental", () => {
  it("COMMENCE AU RANG DEMANDÉ, et la fondamentale n'y est pas", () => {
    const p = partielsDuComplexe(BASE);
    expect(p.map((x) => x.rang)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(p.map((x) => x.frequence)).toEqual([660, 880, 1100, 1320, 1540, 1760]);
    expect(p.some((x) => Math.abs(x.frequence - 220) < 1)).toBe(false);
  });

  it("ET LE SIGNAL NE PORTE AUCUNE ÉNERGIE À CETTE HAUTEUR", () => {
    // LA PREUVE QUI COMPTE, et elle se prend sur le signal et non sur la liste des partiels : c'est
    // la seule façon de voir qu'aucun calcul n'a laissé filtrer la fréquence qu'on prétend absente.
    const x = rendu(BASE);
    const aLaFondamentale = energieA(x, 220, 16000);
    const auPremierPartiel = energieA(x, 660, 16000);
    expect(aLaFondamentale).toBeLessThan(auPremierPartiel / 1000);
  });

  it("AU PREMIER RANG, ELLE EST LÀ : il n'y a plus d'illusion, et c'est la comparaison", () => {
    const x = rendu({ ...BASE, premierRang: 1 });
    expect(energieA(x, 220, 16000)).toBeGreaterThan(energieA(x, 660, 16000));
  });

  it("LE MASQUE COUVRE LE GRAVE SANS NOYER LES PARTIELS, ce qui est la preuve de Licklider", () => {
    // Le bruit doit remplir la région du fondamental absent, et laisser les partiels porteurs du
    // résidu au-dessus de lui : sans cela l'épreuve ne prouverait rien, elle masquerait tout.
    const sans = rendu(BASE, 0);
    const avec = rendu(BASE, 0.6);
    expect(energieA(avec, 220, 16000)).toBeGreaterThan(energieA(sans, 220, 16000) * 100);
    // Le premier partiel, lui, n'a presque pas bougé.
    const ecart = energieA(avec, 660, 16000) / energieA(sans, 660, 16000);
    expect(ecart).toBeGreaterThan(0.5);
    expect(ecart).toBeLessThan(2);
  });
});

describe("le décalage de Schouten", () => {
  it("LAISSE LES ÉCARTS INCHANGÉS, et c'est ce qui rend l'épreuve concluante", () => {
    const sans = partielsDuComplexe(BASE);
    const avec = partielsDuComplexe({ ...BASE, decalage: 60 });
    const ecarts = (p: { frequence: number }[]) =>
      p.slice(1).map((x, i) => Math.round(x.frequence - p[i].frequence));
    expect(ecarts(avec)).toEqual(ecarts(sans));
    // Et pourtant chaque partiel a bougé du même nombre de hertz.
    for (let i = 0; i < sans.length; i++) expect(avec[i].frequence - sans[i].frequence).toBeCloseTo(60, 6);
  });

  it("ET DÉPLACE POURTANT LA HAUTEUR PRÉDITE, d'environ le décalage sur le rang moyen", () => {
    // Rangs 3 à 8 : le rang moyen vaut 5,5, donc soixante hertz de décalage déplacent la hauteur
    // d'environ onze hertz. Une prédiction qui suivrait l'écart des partiels ne bougerait pas.
    expect(hauteurPrediteDuResidu(BASE)).toBeCloseTo(220, 6);
    expect(hauteurPrediteDuResidu({ ...BASE, decalage: 60 })).toBeCloseTo(220 + 60 / 5.5, 4);
    expect(hauteurPrediteDuResidu({ ...BASE, decalage: -60 })).toBeCloseTo(220 - 60 / 5.5, 4);
  });

  it("ET LE DÉPLACEMENT EST D'AUTANT PLUS PETIT QUE LES RANGS SONT HAUTS", () => {
    // La pente est en un sur le rang moyen : c'est la forme de la mesure de Schouten, Ritsma et
    // Cardozo, et elle distingue le résidu d'une simple lecture de période.
    const bas = hauteurPrediteDuResidu({ ...BASE, premierRang: 2, decalage: 60 }) - 220;
    const haut = hauteurPrediteDuResidu({ ...BASE, premierRang: 10, decalage: 60 }) - 220;
    expect(haut).toBeLessThan(bas / 2);
  });
});

describe("la sinusoïde de comparaison", () => {
  it("PORTE LA FONDAMENTALE, celle-là même que le complexe ne joue pas", () => {
    const x = echantillonsDuSinus(220, 0.5, 1, 16000);
    expect(energieA(x, 220, 16000)).toBeGreaterThan(energieA(x, 660, 16000) * 1000);
  });
});
