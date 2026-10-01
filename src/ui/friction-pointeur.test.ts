// ui/friction-pointeur.test.ts — Le bruit est-il vraiment rose, et la loi tient-elle ?
//
// CE QUE CE FICHIER DOIT PROUVER. Deux choses, et elles se trompent toutes les deux en silence.
//
//   — LE BRUIT EST ROSE. Un bruit blanc marcherait : il sortirait un son, on l'entendrait suivre la
//     main, et personne n'irait vérifier. Il sifflerait simplement, au lieu de frotter. La
//     différence se voit en énergie par octave, et c'est le seul endroit où elle se voit.
//   — LA VITESSE EST PAR SECONDE. Compter les pixels par ÉVÉNEMENT donnerait exactement le même son
//     sur la machine où l'on écrit le code, et un son deux fois plus doux sur celle qui rapporte
//     les déplacements deux fois plus souvent. C'est le genre de faute qu'on ne trouve jamais en
//     se relisant.
import { describe, expect, it } from "vitest";

import {
  commandeDepuisVitesse, DELAI_SILENCE, echantillonsDeBruitRose, FREQUENCE_BASSE, FREQUENCE_HAUTE,
  NIVEAU_MAX, RAMPE_NIVEAU, SEUIL, VITESSE_PLEINE, vitesseDuPointeur,
} from "./friction-pointeur";

const SR = 44100;
const N = 8192;

/** Un tirage reproductible : deux mesures de la même chose doivent donner le même chiffre. */
function tirageSeme(graine: number): () => number {
  let g = graine >>> 0;
  return () => {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/** La puissance d'un signal à une fréquence, par Goertzel. */
function puissanceA(x: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

/**
 * L'énergie d'une bande : la puissance moyenne par hertz, multipliée par la largeur de la bande.
 *
 * C'EST CE PRODUIT QUI SÉPARE LES DEUX BRUITS. Un bruit blanc porte la même puissance par hertz,
 * donc une énergie qui DOUBLE à chaque octave, la bande étant deux fois plus large. Un bruit rose
 * porte une puissance en un sur f, et son énergie par octave ne bouge pas.
 */
function energieDeBande(x: Float32Array, bas: number, haut: number): number {
  const combien = 24;
  let somme = 0;
  for (let k = 0; k < combien; k++) {
    somme += puissanceA(x, bas + ((k + 0.5) * (haut - bas)) / combien);
  }
  return (somme / combien) * (haut - bas);
}

/** Les cinq octaves de 100 à 3200 hertz, où la couleur d'un bruit se juge. */
const OCTAVES: [number, number][] = [[100, 200], [200, 400], [400, 800], [800, 1600], [1600, 3200]];

describe("la couleur du bruit", () => {
  it("EST ROSE : son énergie par octave ne bouge pas", () => {
    // LA PREUVE QUI COMPTE. Elle se prend sur le signal, parce que la recette elle-même n'a l'air
    // de rien : sept lignes de filtres dont aucune ne dit sa pente.
    const x = echantillonsDeBruitRose(N, tirageSeme(7));
    const energies = OCTAVES.map(([a, b]) => energieDeBande(x, a, b));
    const ecart = Math.max(...energies) / Math.min(...energies);
    // MESURÉ : 1,678 entre la plus forte et la plus faible des cinq octaves, là où le même tirage
    // rendu blanc donne 19,714. Le seuil est posé entre les deux, assez large pour le hasard.
    expect(ecart, `énergies : ${energies.map((e) => e.toExponential(2)).join(", ")}`).toBeLessThan(3);
  });

  it("ET L'INSTRUMENT SAIT LE DISTINGUER D'UN BRUIT BLANC, sans quoi le cas ne prouverait rien", () => {
    // LE TÉMOIN. Une mesure qui ne saurait pas voir la différence déclarerait rose n'importe quoi.
    const tirage = tirageSeme(7);
    const blanc = Float32Array.from({ length: N }, () => tirage() * 2 - 1);
    const energies = OCTAVES.map(([a, b]) => energieDeBande(blanc, a, b));
    const ecart = Math.max(...energies) / Math.min(...energies);
    expect(ecart, `énergies : ${energies.map((e) => e.toExponential(2)).join(", ")}`).toBeGreaterThan(8);
    // Et l'énergie double bien d'une octave à la suivante, ce qui est la définition du bruit blanc.
    for (let k = 1; k < energies.length; k++) {
      expect(energies[k] / energies[k - 1], `octave ${k}`).toBeGreaterThan(1.5);
    }
  });

  it("ET IL SE REFAIT À L'IDENTIQUE, pour que deux mesures se comparent", () => {
    const a = echantillonsDeBruitRose(256, tirageSeme(3));
    const b = echantillonsDeBruitRose(256, tirageSeme(3));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("ET IL RESTE DANS LES BORNES : un bruit qui sature n'est plus une matière", () => {
    const x = echantillonsDeBruitRose(N, tirageSeme(11));
    expect(Math.max(...Array.from(x, Math.abs))).toBeLessThan(1);
  });
});

describe("la vitesse du pointeur", () => {
  it("SE COMPTE PAR SECONDE, et le même geste donne le même chiffre quel que soit le pas", () => {
    // LE CAS QUI GARDE LA LOI. Trois cents pixels en un dixième de seconde, rapportés en un seul
    // événement ou en trois : la vitesse est la même. Une mesure par événement donnerait 3000 d'un
    // côté et 1000 de l'autre, et le même geste sonnerait trois fois plus doux.
    const dUnCoup = vitesseDuPointeur(300, 0, 0.1);
    const enTrois = vitesseDuPointeur(100, 0, 0.1 / 3);
    expect(dUnCoup).toBeCloseTo(3000, 6);
    expect(enTrois).toBeCloseTo(3000, 6);
  });

  it("ET ELLE SUIT LA DIAGONALE, non la somme des deux côtés", () => {
    expect(vitesseDuPointeur(3, 4, 1)).toBeCloseTo(5, 9);
  });

  it("ET UN INTERVALLE NUL OU NÉGATIF NE REND PAS L'INFINI", () => {
    // Deux événements dans la même milliseconde arrivent, et une horloge qui recule aussi.
    expect(vitesseDuPointeur(10, 10, 0)).toBe(0);
    expect(vitesseDuPointeur(10, 10, -0.5)).toBe(0);
  });
});

describe("ce que la vitesse commande", () => {
  it("SE TAIT AU REPOS, et sous le seuil du tremblement de main", () => {
    expect(commandeDepuisVitesse(0).niveau).toBe(0);
    expect(commandeDepuisVitesse(VITESSE_PLEINE * SEUIL).niveau).toBe(0);
    // Un pixel plus vite, et le son commence.
    expect(commandeDepuisVitesse(VITESSE_PLEINE * SEUIL * 1.1).niveau).toBeGreaterThan(0);
  });

  it("MONTE AVEC LA VITESSE, en niveau comme en fréquence", () => {
    const vitesses = [100, 500, 1000, 2000, 2999];
    for (let k = 1; k < vitesses.length; k++) {
      const avant = commandeDepuisVitesse(vitesses[k - 1]);
      const apres = commandeDepuisVitesse(vitesses[k]);
      expect(apres.niveau, `${vitesses[k]} px/s`).toBeGreaterThan(avant.niveau);
      expect(apres.frequence, `${vitesses[k]} px/s`).toBeGreaterThan(avant.frequence);
    }
  });

  it("ET SE PLAFONNE : une main trois fois trop rapide ne sonne pas trois fois plus fort", () => {
    const plein = commandeDepuisVitesse(VITESSE_PLEINE);
    expect(plein.niveau).toBeCloseTo(NIVEAU_MAX, 9);
    expect(plein.frequence).toBeCloseTo(FREQUENCE_HAUTE, 9);
    for (const trop of [VITESSE_PLEINE * 3, 1e6, Infinity]) {
      expect(commandeDepuisVitesse(trop).niveau, `${trop}`).toBeCloseTo(NIVEAU_MAX, 9);
      expect(commandeDepuisVitesse(trop).frequence, `${trop}`).toBeCloseTo(FREQUENCE_HAUTE, 9);
    }
  });

  it("ET LA FRÉQUENCE PART DU GRAVE ANNONCÉ, celui du grain lourd", () => {
    expect(commandeDepuisVitesse(VITESSE_PLEINE * SEUIL * 1.001).frequence)
      .toBeCloseTo(FREQUENCE_BASSE + SEUIL * (FREQUENCE_HAUTE - FREQUENCE_BASSE), 0);
  });

  it("ET UNE VITESSE NÉGATIVE, QUI NE DEVRAIT PAS ARRIVER, SE TAIT", () => {
    expect(commandeDepuisVitesse(-500).niveau).toBe(0);
  });
});

describe("le délai de silence", () => {
  it("TIENT ENTRE DEUX BORNES, et c'est le défaut qu'il répare qui les fixe", () => {
    // UNE MAIN QUI S'ARRÊTE N'ENVOIE PLUS RIEN : éteindre le son dans le gestionnaire de
    // déplacement suppose un dernier déplacement lent, qui n'arrive jamais. MESURÉ AVANT
    // CORRECTION : une demi-seconde après la fin du geste, le gain valait encore 0,3333 sur 0,4,
    // et il y serait resté.
    //
    // Le délai doit dépasser l'écart entre deux déplacements d'une main qui bouge, seize
    // millisecondes à soixante images par seconde, faute de quoi un geste continu serait haché.
    expect(DELAI_SILENCE).toBeGreaterThan(16);
    // Et rester sous ce qui s'entend comme une traîne, la rampe achevant de fondre le reste.
    expect(DELAI_SILENCE / 1000 + RAMPE_NIVEAU * 3).toBeLessThan(0.15);
  });
});
