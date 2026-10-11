// audio/granulation-ecologique.test.ts — Un témoin par modèle, chacun avec son cas de contrôle.
//
// POURQUOI TROIS TÉMOINS ET NON UN. « Ça sonne comme de l'eau » ne prouve rien, et c'est le piège
// propre à ce composant : les trois modèles de l'article sont nommés d'après ce qu'on croit
// entendre, de sorte qu'un rendu plausible passerait pour une preuve. Chacun porte donc ici une
// propriété MESURABLE et le cas qui l'écarterait.
//
// ET LE SUIVEUR DE HAUTEUR NE PEUT PAS VERROUILLER SUR UN TRAIN QUI ACCÉLÈRE SANS CESSE, ce qui a
// coûté quatre sondes avant d'être compris. Un détecteur de période cherche la ressemblance du
// signal avec lui-même à un décalage ; dans un rebond, la période change à CHAQUE choc, de sorte
// qu'aucune fenêtre d'analyse ne contient deux périodes égales. Relevé : à amortissement 0,46 et
// 0,49, zéro trame voisée sur tout le rendu, alors que le débit balayait bien 22 Hz à 16 kHz.
// Le régime où la mesure est possible est celui où la période est LOCALEMENT stable, c'est-à-dire
// un amortissement proche d'un demi : à 0,4995 le rapport vaut 0,9987 par choc, et le suiveur lit
// alors la montée. Cela ne limite pas le modèle, cela limite l'instrument, et c'est à savoir avant
// de mesurer un rebond.
//
// LA MATIÈRE D'ESSAI COMPTE AUTANT QUE LES RÉGLAGES, et une première version s'y est trompée. Le
// frottement se mesurait sur un choc qui décroît, et sa prise à mi-source y tombait là où le choc
// avait décru à trois millièmes : le cas lisait un silence et l'imputait au modèle. Un frottement
// se mesure sur une SURFACE, c'est-à-dire un bruit stationnaire, dont tout endroit vaut l'autre.
import { describe, expect, it } from "vitest";
import { granulationEcologique, instants, rapportDeRebond } from "./granulation-ecologique";
import { hauteurMediane, partVoisee, suivreHauteur } from "./hauteur";

const SR = 16000;

/** Un choc : une attaque suivie d'une décroissance. C'est la collision des deux premiers modèles. */
function choc(duree: number): Float32Array {
  const n = Math.round(duree * SR);
  const x = new Float32Array(n);
  let etat = 99991;
  for (let i = 0; i < n; i++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    x[i] = ((etat / 4294967296) * 2 - 1) * Math.exp(-12 * (i / n));
  }
  return x;
}

/** Une surface : un bruit stationnaire, dont tout endroit vaut l'autre. C'est la matière frottée. */
function surface(duree: number): Float32Array {
  const n = Math.round(duree * SR);
  const x = new Float32Array(n);
  let etat = 7777;
  for (let i = 0; i < n; i++) {
    etat = (etat * 1103515245 + 12345) >>> 0;
    x[i] = ((etat / 4294967296) * 2 - 1) * 0.5;
  }
  return x;
}

const efficace = (x: Float32Array) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
};

const niveauDb = (x: Float32Array) => 20 * Math.log10(Math.max(1e-12, efficace(x)));

/**
 * La part du rendu où rien ne sonne, à trente décibels sous la crête.
 *
 * C'EST LA GRANDEUR DU PASSAGE DE LA GOUTTE AU FLUX, et elle est directe : là où aucun grain n'est
 * actif, la somme vaut zéro et le diviseur, dont le plancher est à un, ne la relève pas.
 */
/** Le niveau là où ça sonne, en décibels : les trames muettes ne comptent pas. */
function niveauSonnant(x: Float32Array, sousLaCrete = 30): number {
  const { seuil, fen } = seuilEtFenetre(x, sousLaCrete);
  let somme = 0;
  let n = 0;
  for (let i = 0; i + fen <= x.length; i += fen) {
    let c = 0;
    for (let k = 0; k < fen; k++) c = Math.max(c, Math.abs(x[i + k]));
    if (c <= seuil) continue;
    for (let k = 0; k < fen; k++) { somme += x[i + k] * x[i + k]; n++; }
  }
  return 20 * Math.log10(Math.max(1e-12, Math.sqrt(somme / Math.max(1, n))));
}

function seuilEtFenetre(x: Float32Array, sousLaCrete: number) {
  let crete = 0;
  for (let i = 0; i < x.length; i++) crete = Math.max(crete, Math.abs(x[i]));
  // L'enveloppe est lissée sur une milliseconde : un passage par zéro d'une sinusoïde n'est pas un
  // silence, et sans lissage on compterait les zéros de la forme d'onde.
  return { seuil: crete * Math.pow(10, -sousLaCrete / 20), fen: Math.max(1, Math.round(SR / 1000)) };
}

function partSilencieuse(x: Float32Array, sousLaCrete = 30): number {
  let crete = 0;
  for (let i = 0; i < x.length; i++) crete = Math.max(crete, Math.abs(x[i]));
  const seuil = crete * Math.pow(10, -sousLaCrete / 20);
  // L'enveloppe est lissée sur une milliseconde : un passage par zéro d'une sinusoïde n'est pas un
  // silence, et sans lissage on compterait les zéros de la forme d'onde.
  const fen = Math.max(1, Math.round(SR / 1000));
  let muets = 0;
  let trames = 0;
  for (let i = 0; i + fen <= x.length; i += fen) {
    let c = 0;
    for (let k = 0; k < fen; k++) c = Math.max(c, Math.abs(x[i + k]));
    trames++;
    if (c <= seuil) muets++;
  }
  return trames === 0 ? 0 : muets / trames;
}

const suivi = (x: Float32Array, fMin: number, fMax: number) =>
  suivreHauteur(x, SR, { fMin, fMax, cadence: 200 });

/** La hauteur médiane d'une seconde du rendu, prise à l'instant dit. */
const hauteurA = (x: Float32Array, seconde: number) =>
  hauteurMediane(suivi(x.subarray(seconde * SR, (seconde + 1) * SR), 60, 2000));

const BASE = {
  sampleRate: SR, duree: 2 * SR, taille: 0.01, prise: 0,
  fenetre: "expodec" as const, graine: 5,
};

describe("la granulation écologique", () => {
  it("LE RAPPORT DU REBOND EST LA RACINE DE SA RÉCURRENCE, et il se vérifie à la valeur près", () => {
    // La récurrence est `d · [x(n) + x(n − 1)]`, donc le rapport asymptotique résout r² = d(r + 1).
    // À un demi il vaut un : le rebond ne s'arrête jamais, ce qui borne le réglage par le haut.
    expect(rapportDeRebond(0.5)).toBeCloseTo(1, 2);
    expect(rapportDeRebond(0.45)).toBeCloseTo(0.9325, 3);
    expect(rapportDeRebond(0.25)).toBeCloseTo(0.6404, 3);
    for (const d of [0.1, 0.2, 0.3, 0.4, 0.49]) {
      const r = rapportDeRebond(d);
      expect(r * r, `d = ${d}`).toBeCloseTo(d * (r + 1), 6);
    }
  });

  it("ET LE REBOND S'ARRÊTE DE LUI-MÊME : la somme d'une suite de rapport inférieur à un converge", () => {
    const o = { ...BASE, modele: "rebond" as const, intervalle: 0.2, amortissement: 0.4 };
    const t = instants(o, 0, () => 0.5);
    // Le dernier choc tombe bien avant la fin des deux secondes rendues : c'est le repos du corps.
    expect(t[t.length - 1] / SR).toBeLessThan(1.6);
    const ecarts = t.slice(1).map((v, k) => v - t[k]);
    expect(ecarts[0]).toBeGreaterThan(ecarts[ecarts.length - 1] * 10);
  });

  it("UN AMORTISSEMENT FORT ÉTIRE L'ÉVÉNEMENT, un faible le ramasse en un crépitement", () => {
    const cas = (d: number) => {
      const t = instants({ ...BASE, modele: "rebond" as const, intervalle: 0.2, amortissement: d }, 0, () => 0.5);
      return { fin: t[t.length - 1] / SR, chocs: t.length };
    };
    const faible = cas(0.3);
    const fort = cas(0.48);
    // L'événement dure plus longtemps à amortissement fort, le rapport étant plus près de un.
    expect(fort.fin, `${faible.fin.toFixed(2)} s contre ${fort.fin.toFixed(2)} s`)
      .toBeGreaterThan(faible.fin);
    // ET IL PORTE MOINS DE CHOCS, ce qui surprend et se tient : un rebond vite amorti entasse ses
    // intervalles courts avant de s'éteindre, là où un rebond lent les étire sans en ajouter.
    expect(fort.chocs, `${faible.chocs} chocs contre ${fort.chocs}`).toBeLessThan(faible.chocs);
  });

  it("LE TÉMOIN DU REBOND : la hauteur MONTE sans qu'aucune transposition existe", () => {
    // Un grain unique, jamais transposé, et une fonction de contrôle qui n'est qu'un débit : la
    // hauteur entendue est celle du débit qui entre dans l'audible. C'est la propriété émergente
    // que l'article annonce sur un rebond de bouteille.
    const o = { ...BASE, modele: "rebond" as const, intervalle: 0.02, amortissement: 0.4995, duree: 10 * SR };
    const { sortie, rapport } = granulationEcologique(choc(0.004), o);
    const tot = hauteurA(sortie, 3);
    const tard = hauteurA(sortie, 9);
    const dit = `${rapport.premierMs.toFixed(1)} vers ${rapport.dernierMs.toFixed(2)} ms,`
      + ` hauteur ${tot.toFixed(0)} puis ${tard.toFixed(0)} Hz`;
    expect(tard, dit).toBeGreaterThan(tot * 1.5);
    // Et la hauteur lue suit le débit : l'intervalle final donne sa fréquence, à un tiers près sur
    // une seconde où le débit bouge encore.
    expect(Math.abs(tard - 1000 / rapport.dernierMs) / tard, dit).toBeLessThan(0.33);
  });

  it("ET LE CAS DE CONTRÔLE : à débit CONSTANT, le même grain ne monte pas", () => {
    // Même grain, même fenêtre, même matière : seule la fonction de contrôle change. Si la montée
    // venait du grain ou de la fenêtre, elle serait encore là.
    const o = { ...BASE, modele: "frottement" as const, intervalle: 0.01, rugosite: 0, duree: 10 * SR };
    const { sortie } = granulationEcologique(choc(0.004), o);
    const tot = hauteurA(sortie, 3);
    const tard = hauteurA(sortie, 9);
    expect(Math.abs(tard - tot) / Math.max(1, tot),
      `${tot.toFixed(0)} Hz puis ${tard.toFixed(0)} Hz`).toBeLessThan(0.05);
  });

  it("LE TÉMOIN DE L'ÉCOULEMENT : le recouvrement comble les silences entre les gouttes", () => {
    // L'article promet un passage continu de la goutte au flux, le recouvrement faisant une région
    // de formants. CE QUI SE MESURE EST LA PART DE SILENCE : des gouttes clairsemées laissent de
    // vrais trous entre elles, un flux fondu n'en laisse aucun. Un détecteur d'attaques ne sert pas
    // ici, et la sonde l'a montré : la fenêtre expodec garde une attaque visible à chaque goutte,
    // de sorte que le compte plafonne entre cinquante et soixante quelle que soit la durée. La part
    // de silence ne plafonne pas, et elle ne tient pas au diviseur, qui a un plancher à un : là où
    // aucun grain ne sonne, la sortie vaut exactement zéro.
    const cas = (taille: number) => {
      const o = { ...BASE, modele: "ecoulement" as const, intervalle: 0.05, taille, flux: 3, duree: 3 * SR };
      const { sortie } = granulationEcologique(surface(0.3), o);
      return { part: partSilencieuse(sortie), db: niveauDb(sortie) };
    };
    const gouttes = cas(0.002);
    const flux = cas(0.1);
    const dit = `${(gouttes.part * 100).toFixed(0)} % de silence en gouttes,`
      + ` ${(flux.part * 100).toFixed(0)} % une fois fondu`;
    expect(gouttes.part, dit).toBeGreaterThan(0.5);
    expect(flux.part, dit).toBeLessThan(0.05);
  });

  it("ET LE CAS DE CONTRÔLE : AUCUN CHANGEMENT DE NIVEAU NE PEUT PRODUIRE CE TÉMOIN", () => {
    // CE QU'IL FALLAIT ÉCARTER, et deux tentatives s'y sont trompées avant celle-ci. L'explication
    // concurrente du témoin est qu'un gain monte et fait passer tout le rendu au-dessus du seuil.
    // Elle est écartée par la FORME de la mesure et non par un second relevé : le seuil est pris à
    // trente décibels sous la crête DU MÊME signal, de sorte que la part de silence ne dépend pas
    // de l'échelle. La multiplier par un dixième ou par dix ne la déplace pas d'un millième.
    //
    // CE QUI NE S'EXIGE PAS, EN REVANCHE, c'est que les deux régimes sonnent au même niveau. Deux
    // essais l'ont demandé et les deux ont eu tort. Sur tout le rendu, l'écart valait 12,80 dB,
    // c'est-à-dire le rapport cyclique des gouttes et non leur sonie ; mesuré là où ça sonne, il
    // reste 7,09 dB, et c'est le facteur de crête : une texture fondue EST plus dense en énergie là
    // où elle sonne, puisque c'est ce que fondre veut dire. Exiger l'égalité serait exiger que la
    // fusion ne change rien.
    const o = { ...BASE, modele: "ecoulement" as const, intervalle: 0.05, taille: 0.002, flux: 3, duree: 3 * SR };
    const { sortie } = granulationEcologique(surface(0.3), o);
    const fort = Float32Array.from(sortie, (v) => v * 10);
    const faible = Float32Array.from(sortie, (v) => v * 0.1);
    const part = partSilencieuse(sortie);
    expect(partSilencieuse(fort), `part ${part.toFixed(4)}`).toBeCloseTo(part, 10);
    expect(partSilencieuse(faible), `part ${part.toFixed(4)}`).toBeCloseTo(part, 10);
    // Et le niveau, lui, a bel et bien changé : la mesure est insensible à ce que l'oreille entend
    // comme un volume, ce qui est exactement ce qu'on lui demande.
    expect(niveauSonnant(fort) - niveauSonnant(sortie)).toBeCloseTo(20, 6);
  });

  it("LE TÉMOIN DU FROTTEMENT : la rugosité fait passer d'une hauteur à du bruit", () => {
    const cas = (rugosite: number) => {
      const o = { ...BASE, modele: "frottement" as const, intervalle: 0.01, taille: 0.008, rugosite, prise: 0.5, duree: 3 * SR };
      const { sortie } = granulationEcologique(surface(1), o);
      const s = suivi(sortie, 60, 700);
      return { part: partVoisee(s), hauteur: hauteurMediane(s), db: niveauDb(sortie) };
    };
    const lisse = cas(0);
    const rugueux = cas(1);
    const dit = `lisse ${lisse.hauteur.toFixed(1)} Hz à ${lisse.part.toFixed(2)} voisé et ${lisse.db.toFixed(1)} dB,`
      + ` rugueux ${rugueux.hauteur.toFixed(1)} Hz à ${rugueux.part.toFixed(2)} voisé et ${rugueux.db.toFixed(1)} dB`;
    // À rugosité nulle, tous les grains viennent du même endroit : le flux rend la hauteur de son
    // propre débit, cent chocs par seconde.
    expect(lisse.hauteur, dit).toBeCloseTo(100, 0);
    expect(lisse.part, dit).toBeGreaterThan(0.9);
    // À rugosité pleine, ils viennent de partout et la hauteur se perd.
    expect(rugueux.part, dit).toBeLessThan(lisse.part - 0.2);
    // ET LE NIVEAU NE BOUGE PAS, la surface étant stationnaire : ce n'est pas un volume qu'on lit.
    expect(Math.abs(rugueux.db - lisse.db), dit).toBeLessThan(1);
  });

  it("LE FROTTEMENT LISSE EST EXACTEMENT PÉRIODIQUE, ce qui ne se lit pas sur le suiveur", () => {
    // POURQUOI CE CAS EXISTE, et c'est une limite de l'instrument qu'il faut écrire. Relevé dans
    // l'application, le suiveur de hauteur lit bien 100 Hz sur un frottement à cent chocs par
    // seconde, mais à deux cents il annonce encore 100, et plus rien du tout quand on exclut
    // l'octave inférieure de sa recherche. Le signal, lui, est exactement périodique à la période
    // du débit : c'est ce que ce cas établit, sans passer par aucun détecteur. La conclusion est
    // que la lecture du suiveur sur un train de grains cesse d'être fiable au-delà d'une centaine
    // de chocs par seconde, et que les relevés se font à cent.
    for (const chocsParSeconde of [100, 200, 400]) {
      const periode = Math.round(SR / chocsParSeconde);
      const o = {
        ...BASE, modele: "frottement" as const, duree: SR,
        intervalle: periode / SR, taille: 0.008, rugosite: 0, prise: 0.5,
      };
      const { sortie } = granulationEcologique(surface(1), o);
      // La comparaison commence passé la montée en régime, le temps que le recouvrement s'établisse.
      let pire = 0;
      for (let i = 4 * SR / 10; i < 8 * SR / 10; i++) {
        pire = Math.max(pire, Math.abs(sortie[i] - sortie[i + periode]));
      }
      expect(pire, `${chocsParSeconde} chocs/s, période ${periode} échantillons,`
        + ` écart maximal ${pire.toExponential(2)}`).toBeLessThan(1e-6);
    }
  });

  it("LES FLUX SYNCHRONES PARTAGENT LEURS INSTANTS, les asynchrones ont chacun leur phase", () => {
    const o = { ...BASE, modele: "ecoulement" as const, intervalle: 0.03, taille: 0.004, flux: 4 };
    const sync = granulationEcologique(choc(0.02), { ...o, synchrone: true });
    const async = granulationEcologique(choc(0.02), { ...o, synchrone: false });
    expect(Array.from(sync.sortie)).not.toEqual(Array.from(async.sortie));
    const dit = `synchrones ${sync.rapport.instantsDistincts} instants pour ${sync.rapport.grains} grains,`
      + ` asynchrones ${async.rapport.instantsDistincts} pour ${async.rapport.grains}`;
    // LES COMPTES DE GRAINS NE SONT PAS ÉGAUX DES DEUX CÔTÉS, et il ne faut pas l'exiger : chaque
    // flux asynchrone tire sa propre gigue, donc sa propre longueur de suite. Ce qui se compare est
    // le RAPPORT des instants distincts au nombre de grains.
    expect(sync.rapport.instantsDistincts * 4, dit).toBe(sync.rapport.grains);
    expect(async.rapport.instantsDistincts, dit).toBeGreaterThan(async.rapport.grains * 0.9);
  });

  it("À GRAINE ÉGALE, LE MÊME RENDU ; à graine différente, un autre tirage", () => {
    const o = { ...BASE, modele: "ecoulement" as const, intervalle: 0.03, flux: 3, rugosite: 0.5 };
    const a = granulationEcologique(surface(1), { ...o, graine: 11 });
    const b = granulationEcologique(surface(1), { ...o, graine: 11 });
    const c = granulationEcologique(surface(1), { ...o, graine: 12 });
    expect(Array.from(a.sortie)).toEqual(Array.from(b.sortie));
    expect(Array.from(c.sortie)).not.toEqual(Array.from(a.sortie));
  });

  it("UNE COURBE PLATE REND EXACTEMENT CE QUE REND LE RÉGLAGE, au bit près", () => {
    // LES VALEURS SONT DYADIQUES, et il faut le dire : un tableau est en simple précision, de sorte
    // qu'une courbe plate à un centième ne porte pas le même nombre que le réglage à un centième.
    const o = {
      ...BASE, modele: "frottement" as const,
      intervalle: 0.03125, taille: 0.0078125, rugosite: 0.5, prise: 0.5, niveau: 0.5,
    };
    const n = o.duree;
    const fixe = granulationEcologique(surface(1), o);
    const plate = granulationEcologique(surface(1), {
      ...o,
      intervalle: new Float32Array(n).fill(0.03125),
      taille: new Float32Array(n).fill(0.0078125),
      rugosite: new Float32Array(n).fill(0.5),
      prise: new Float32Array(n).fill(0.5),
      niveau: new Float32Array(n).fill(0.5),
    });
    expect(Array.from(plate.sortie)).toEqual(Array.from(fixe.sortie));
    expect(plate.rapport.grains).toBe(fixe.rapport.grains);
  });

  it("UNE COURBE QUI VARIE NE REND PAS CE QUE REND SA PREMIÈRE VALEUR", () => {
    const o = { ...BASE, modele: "frottement" as const, intervalle: 0.03, taille: 0.008, prise: 0.5 };
    const n = o.duree;
    const montante = new Float32Array(n);
    for (let i = 0; i < n; i++) montante[i] = i / n;
    const tenue = granulationEcologique(surface(1), { ...o, rugosite: new Float32Array(n) });
    const variee = granulationEcologique(surface(1), { ...o, rugosite: montante });
    expect(Array.from(variee.sortie)).not.toEqual(Array.from(tenue.sortie));

    // La même exigence sur l'intervalle, qui est la fonction de contrôle elle-même : lue à son seul
    // premier point, une courbe de débit rendrait un débit constant.
    const debit = new Float32Array(n);
    for (let i = 0; i < n; i++) debit[i] = 0.01 + (0.04 * i) / n;
    const fixe = granulationEcologique(surface(1), { ...o, intervalle: 0.01 });
    const balaye = granulationEcologique(surface(1), { ...o, intervalle: debit });
    expect(balaye.rapport.grains).toBeLessThan(fixe.rapport.grains);
  });
});
