// audio/champ-paires.test.ts — Le champ à paires : ses deux lectures s'accordent, et son gradient est juste.
//
// DEUX LECTURES DU MÊME MODÈLE : la conditionnelle d'une note, que l'apprentissage emploie, et le score
// d'une suite par colonnes et passages, que l'harmoniseur emploie. Changer une note doit changer les
// deux de la même quantité ; sinon une matrice est lue à l'envers par l'une d'elles.

import { describe, expect, it } from "vitest";
import { creerAleatoire } from "../core/hasard";
import { disposer, etatsDe, NB_VOIX, pseudoVraisemblance, scoresConditionnels, scoreSuite, type DonneesChamp, type Voisinages } from "./champ-paires";

const TOUS: Voisinages = { vertical: true, horizontal: true, diagonal: true };
const BORNES: [number, number][] = [[70, 73], [64, 66], [58, 61], [50, 52]];

/** Un modèle et des données tirés au hasard, à graine. */
function tirer(graine: number, voisinages = TOUS) {
  const a = creerAleatoire(graine);
  const d = disposer(BORNES, voisinages);
  const theta = Float64Array.from({ length: d.taille }, () => a() * 2 - 1);
  const T = 9;
  const etats = Int16Array.from({ length: T * NB_VOIX }, (_, i) => Math.floor(a() * etatsDe(d, i % NB_VOIX)));
  // Une coupure au milieu : la cinquième colonne ne suit pas la quatrième.
  const suit = Uint8Array.from({ length: T }, (_, t) => (t === 0 || t === 4 ? 0 : 1));
  return { d, theta, donnees: { etats, suit } as DonneesChamp };
}

describe("le champ à paires", () => {
  it("la conditionnelle d'une note et le score de la suite s'accordent, note par note", () => {
    const { d, theta, donnees } = tirer(3);
    for (let t = 0; t < donnees.suit.length; t++) {
      for (let v = 0; v < NB_VOIX; v++) {
        const locaux = scoresConditionnels(d, theta, donnees, t, v);
        const obs = donnees.etats[t * NB_VOIX + v];
        for (let k = 0; k < etatsDe(d, v); k++) {
          const avant = scoreSuite(d, theta, donnees);
          const change = { etats: Int16Array.from(donnees.etats), suit: donnees.suit };
          change.etats[t * NB_VOIX + v] = k;
          expect(scoreSuite(d, theta, change) - avant, `t ${t}, voix ${v}, état ${k}`).toBeCloseTo(locaux[k] - locaux[obs], 9);
        }
      }
    }
  });

  it("le gradient analytique égale celui des différences finies, paramètre par paramètre", () => {
    for (const voisinages of [TOUS, { vertical: true, horizontal: false, diagonal: true }]) {
      const { d, theta, donnees } = tirer(11, voisinages);
      const gradient = new Float64Array(d.taille);
      pseudoVraisemblance(d, theta, donnees, gradient);
      const h = 1e-6;
      for (let i = 0; i < d.taille; i++) {
        const plus = Float64Array.from(theta); plus[i] += h;
        const moins = Float64Array.from(theta); moins[i] -= h;
        const numerique = (pseudoVraisemblance(d, plus, donnees).logPV - pseudoVraisemblance(d, moins, donnees).logPV) / (2 * h);
        expect(gradient[i], `paramètre ${i}`).toBeCloseTo(numerique, 6);
      }
    }
  });

  it("un voisinage écarté n'a aucun paramètre", () => {
    const tous = disposer(BORNES, TOUS).taille;
    const sansDiagonales = disposer(BORNES, { ...TOUS, diagonal: false }).taille;
    const n = BORNES.map((_, v) => etatsDe({ bornes: BORNES }, v));
    const diagonales = n.reduce((s, a, i) => s + n.reduce((t, b, j) => t + (i === j ? 0 : a * b), 0), 0);
    expect(tous - sansDiagonales).toBe(diagonales);
  });
});
