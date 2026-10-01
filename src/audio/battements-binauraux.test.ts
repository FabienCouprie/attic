// audio/battements-binauraux.test.ts — Le battement est-il vraiment absent des deux signaux ?
//
// CE QUE CE FICHIER DOIT PROUVER. Tout le sujet tient dans une distinction que l'oreille ne fait pas
// d'elle-même : deux sons voisins MÉLANGÉS battent parce que leur somme est une modulation
// d'amplitude, inscrite dans le signal ; deux sons voisins SÉPARÉS ne battent ni l'un ni l'autre, et
// la pulsation entendue n'est nulle part dans ce qui a été envoyé. Un stimulus qui laisserait passer
// la moindre modulation dans un canal ne serait plus qu'un battement acoustique déguisé, et personne
// ne s'en apercevrait : la pulsation serait la bonne.
//
// LE TROISIÈME CAS EST CELUI QU'IL FAUT GARDER. Une mise en œuvre fautive pourrait fabriquer la
// pulsation en ajoutant un son très grave à la bonne vitesse : l'enveloppe serait juste, et tout le
// reste tomberait. Le spectre le dit, et rien d'autre ne le dirait.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  echantillonsBinauraux, enveloppeParDemodulation, frequencesDuCouple, profondeurDeModulation,
} from "./battements-binauraux";

const SR = 8000;
const BASE = {
  porteuse: 220, battement: 6, parOreille: true, aiguADroite: true,
  duree: 3, fondu: 0.05, niveau: 1, sampleRate: SR,
};
const MESURE = (x: Float32Array) => profondeurDeModulation(x, BASE.porteuse, BASE.battement, SR);

/** L'énergie d'un signal à une fréquence donnée, par Goertzel. */
function energieA(x: Float32Array, hz: number, sr: number): number {
  const w = (2 * Math.PI * hz) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

const somme = (a: Float32Array, b: Float32Array) => {
  const x = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) x[i] = a[i] + b[i];
  return x;
};

describe("le couple de fréquences", () => {
  it("ENCADRE LA PORTEUSE, et leur écart est la vitesse du battement", () => {
    const c = frequencesDuCouple(220, 6);
    expect(c.basse).toBeCloseTo(217, 9);
    expect(c.haute).toBeCloseTo(223, 9);
    expect(c.haute - c.basse).toBeCloseTo(6, 9);
    expect((c.basse + c.haute) / 2).toBeCloseTo(220, 9);
  });
});

describe("une fréquence par oreille", () => {
  it("AUCUN DES DEUX CANAUX NE BAT : chacun est un son pur d'amplitude constante", () => {
    // LA PROPRIÉTÉ QUI FAIT LE PHÉNOMÈNE. Si un canal battait, la pulsation serait déjà dans le
    // signal et s'entendrait sur un seul écouteur, ce que personne ne rapporte.
    // MESURÉ : 0,020 % de profondeur à gauche et 0,019 % à droite, ce qui est le résidu du filtre
    // et non une variation du son. Le seuil laisse dix fois ce résidu.
    const { gauche, droite } = echantillonsBinauraux(BASE);
    expect(MESURE(gauche)).toBeLessThan(0.002);
    expect(MESURE(droite)).toBeLessThan(0.002);
  });

  it("ET LEUR SOMME BAT, elle, ce qui est le battement acoustique", () => {
    // C'est ce qui arrive sur des haut-parleurs, où les deux canaux se mélangent dans l'air.
    const { gauche, droite } = echantillonsBinauraux(BASE);
    // MESURÉ : 99,98 % de profondeur, soit un battement qui descend jusqu'au silence.
    expect(MESURE(somme(gauche, droite))).toBeGreaterThan(0.99);
  });

  it("À LA VITESSE DEMANDÉE, que l'enveloppe dit mieux qu'un comptage de creux", () => {
    const { gauche, droite } = echantillonsBinauraux(BASE);
    // Les bords sont écartés : les fondus et l'établissement du filtre ne sont pas le battement.
    const env = enveloppeParDemodulation(somme(gauche, droite), BASE.porteuse, BASE.battement, SR)
      .slice(Math.round(SR * 0.5), Math.round(SR * 2.5));
    const au = (hz: number) => energieA(env, hz, SR);
    expect(au(6)).toBeGreaterThan(au(3) * 10);
    expect(au(6)).toBeGreaterThan(au(9) * 10);
  });

  it("MAIS RIEN NE PORTE D'ÉNERGIE À CETTE VITESSE : le battement n'est pas une composante", () => {
    // LE CAS QUI SÉPARE UNE ENVELOPPE D'UN SON. Une mise en œuvre qui fabriquerait la pulsation en
    // ajoutant un son de six hertz passerait les trois cas précédents et échouerait ici. Le spectre
    // ne contient que les deux fréquences envoyées, ni leur différence ni leur somme.
    const { gauche, droite } = echantillonsBinauraux(BASE);
    for (const [nom, x] of [["gauche", gauche], ["droite", droite],
      ["somme", somme(gauche, droite)]] as const) {
      const aLaVitesse = energieA(x, 6, SR);
      const aLaPorteuse = energieA(x, 220, SR);
      expect(aLaVitesse, nom).toBeLessThan(aLaPorteuse / 1000);
    }
  });

  it("CHAQUE CANAL PORTE SA PROPRE FRÉQUENCE, et pas celle de l'autre", () => {
    const { gauche, droite } = echantillonsBinauraux(BASE);
    expect(energieA(droite, 223, SR)).toBeGreaterThan(energieA(droite, 217, SR) * 100);
    expect(energieA(gauche, 217, SR)).toBeGreaterThan(energieA(gauche, 223, SR) * 100);
  });

  it("ET ÉCHANGER L'OREILLE AIGUË ÉCHANGE EXACTEMENT LES DEUX CANAUX", () => {
    const droit = echantillonsBinauraux(BASE);
    const inverse = echantillonsBinauraux({ ...BASE, aiguADroite: false });
    for (let i = 0; i < droit.gauche.length; i += 7) {
      expect(inverse.gauche[i]).toBeCloseTo(droit.droite[i], 6);
      expect(inverse.droite[i]).toBeCloseTo(droit.gauche[i], 6);
    }
  });
});

describe("les deux fréquences dans les deux oreilles", () => {
  it("MET LE BATTEMENT DANS CHAQUE CANAL, et c'est l'autre phénomène", () => {
    // Le réglage a donc un effet, et la notice le dit : ici la modulation est dans le signal, elle
    // s'entend sur n'importe quoi, et un seul écouteur suffit.
    const { gauche, droite } = echantillonsBinauraux({ ...BASE, parOreille: false });
    expect(MESURE(gauche)).toBeGreaterThan(0.99);
    expect(MESURE(droite)).toBeGreaterThan(0.99);
  });

  it("ET LES DEUX CANAUX SONT ALORS LE MÊME SIGNAL", () => {
    const { gauche, droite } = echantillonsBinauraux({ ...BASE, parOreille: false });
    for (let i = 0; i < gauche.length; i += 7) expect(gauche[i]).toBeCloseTo(droite[i], 9);
  });

  it("SANS QUE LE MODE CHANGE LE NIVEAU DE SORTIE", () => {
    // Deux sons additionnés sans précaution sortiraient deux fois plus fort, et l'on croirait
    // entendre un effet là où il n'y aurait qu'un gain.
    const crete = (x: Float32Array) => Math.max(...Array.from(x, Math.abs));
    const par = echantillonsBinauraux(BASE);
    const les = echantillonsBinauraux({ ...BASE, parOreille: false });
    expect(crete(les.gauche)).toBeLessThanOrEqual(crete(par.gauche) * 1.05);
  });
});

describe("les bords", () => {
  it("OUVRENT ET FERMENT À ZÉRO, sans quoi le premier échantillon est un clic", () => {
    const { gauche, droite } = echantillonsBinauraux(BASE);
    for (const x of [gauche, droite]) {
      expect(Math.abs(x[0])).toBeLessThan(1e-6);
      expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
    }
  });

  it("ET LE FONDU NE SE FAIT PAS PASSER POUR UN BATTEMENT", () => {
    // La mesure de profondeur écarte les bords : sans cela, un son parfaitement constant muni d'un
    // fondu d'une seconde serait annoncé comme battant de fond en comble.
    const long = echantillonsBinauraux({ ...BASE, fondu: 0.5 });
    expect(MESURE(long.gauche)).toBeLessThan(0.1);
  });
});
