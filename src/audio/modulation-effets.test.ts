// audio/modulation-effets.test.ts — Ouvrir un effet à une courbe sans toucher à ce qu'il faisait.
//
// LE TEST QUI COMMANDE TOUS LES AUTRES : SANS COURBE, PAS UN BIT NE BOUGE. Ajouter une entrée à un
// effet qui tourne déjà dans les graphes de quelqu'un n'est acceptable qu'à cette condition. Et la
// tentation est forte de s'en dispenser — on a réécrit la boucle, le son « semble » le même —, or
// la faute que cela cache n'est pas une différence audible : c'est une différence d'un demi-LSB qui
// rendrait tout rendu enregistré irreproductible sans que personne ne s'en aperçoive avant des mois.
// On exige donc l'égalité EXACTE, échantillon par échantillon.
//
// LE SECOND : LA COURBE DOIT COMMANDER VRAIMENT. Un port qui ne change rien serait pire qu'une
// absence de port. Deux courbes opposées doivent donner deux sons mesurablement différents, et une
// courbe constante doit tenir la valeur qu'elle désigne — ce qui se lit au spectre.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { autoPan, chopper, phaser, tremolo, vibrato, vibratoLogistique, wahwah } from "./effets-spectral";
import { appliquerEchoPingPong } from "./effets-temporel";
import { constante, engendrer, type Courbe } from "./courbe";

/** La meme courbe a l envers. `engendrer` ne sait pas inverser, et le dire ici vaut mieux que
 *  de comparer sans le savoir deux courbes identiques — ce que ce test faisait d abord. */
const retournee = (c: Courbe): Courbe => ({ ...c, valeurs: Float32Array.from(c.valeurs, (v) => 1 - v) });

const SR = 44100;

function bruit(n: number, graine = 5): AudioBuffer {
  let e = graine >>> 0;
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
  b.copyToChannel(x, 0);
  return b;
}

const memesOctets = (a: AudioBuffer, b: AudioBuffer): boolean => {
  const x = a.getChannelData(0), y = b.getChannelData(0);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

/** Le centre de gravité du spectre, par les passages par zéro : une mesure d'aigu sans transformée. */
const aigu = (b: AudioBuffer): number => {
  const x = b.getChannelData(0);
  let passages = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) passages++;
  return (passages * SR) / (2 * (x.length - 1));
};

describe("le wah-wah ouvert à une courbe", () => {
  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS — la boucle a été réécrite, pas changée", () => {
    const x = bruit(SR);
    // Les bornes par défaut sont celles qui étaient câblées : 200 et 2500 Hz.
    const avant = wahwah(x, 2, 100, 5, 100);
    const apres = wahwah(x, 2, 100, 5, 100, undefined, { min: 200, max: 2500 });
    expect(memesOctets(avant, apres)).toBe(true);
    // Et une entrée qui n'est pas une courbe ne prend pas la main non plus.
    expect(memesOctets(avant, wahwah(x, 2, 100, 5, 100, "bonjour"))).toBe(true);
    expect(memesOctets(avant, wahwah(x, 2, 100, 5, 100, null))).toBe(true);
  });

  it("UNE COURBE CONSTANTE TIENT SA FRÉQUENCE, et deux constantes donnent deux timbres", () => {
    const x = bruit(SR);
    const bas = wahwah(x, 2, 100, 8, 100, constante(0, 1), { min: 300, max: 3000 });
    const haut = wahwah(x, 2, 100, 8, 100, constante(1, 1), { min: 300, max: 3000 });
    // Le filtre est un passe-bande : tenu en bas, il laisse passer le grave, et l'inverse.
    expect(aigu(haut)).toBeGreaterThan(aigu(bas) * 3);
  });

  it("LE BALAYAGE SE PARCOURT EN MULTIPLIANT — le milieu est la moyenne géométrique", () => {
    const x = bruit(SR);
    const milieu = wahwah(x, 2, 100, 8, 100, constante(0.5, 1), { min: 200, max: 3200 });
    // La moyenne géométrique de 200 et 3200 vaut 800 ; l'arithmétique en donnerait 1700.
    const attendu = aigu(wahwah(x, 2, 100, 8, 100, constante(0, 1), { min: 800, max: 800 }));
    expect(Math.abs(Math.log2(aigu(milieu) / attendu))).toBeLessThan(0.35);
  });

  it("les bornes du balayage sont bien des réglages, avec ou sans courbe", () => {
    const x = bruit(SR);
    // Sans courbe non plus elles ne sont pas décoratives : le LFO balaie entre elles.
    const etroit = wahwah(x, 2, 100, 8, 100, undefined, { min: 300, max: 400 });
    const large = wahwah(x, 2, 100, 8, 100, undefined, { min: 300, max: 4000 });
    expect(aigu(large)).toBeGreaterThan(aigu(etroit) * 1.5);
  });

  it("une rampe et sa rampe inverse ne rendent pas le même son", () => {
    const x = bruit(SR);
    const montante = wahwah(x, 2, 100, 8, 100, engendrer({ dureeSec: 1, forme: "rampe" }), { min: 200, max: 3000 });
    const descendante = wahwah(x, 2, 100, 8, 100, retournee(engendrer({ dureeSec: 1, forme: "rampe" })), { min: 200, max: 3000 });
    const premiereMoitie = (b: AudioBuffer) => {
      const t = new AudioBuffer({ numberOfChannels: 1, length: SR / 2, sampleRate: SR });
      t.copyToChannel(b.getChannelData(0).slice(0, SR / 2), 0);
      return aigu(t);
    };
    // Au début, la montante est encore dans le grave et la descendante déjà dans l'aigu.
    expect(premiereMoitie(descendante)).toBeGreaterThan(premiereMoitie(montante));
  });
});

describe("le vibrato ouvert à une courbe", () => {
  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    const x = bruit(SR);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, undefined))).toBe(true);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, null))).toBe(true);
    expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, 42))).toBe(true);
  });

  it("LA COURBE DESSINE LE GESTE : deux formes opposées donnent deux sons différents", () => {
    const x = bruit(SR);
    const montant = vibrato(x, 5, 80, engendrer({ dureeSec: 1, forme: "rampe" }));
    const descendant = vibrato(x, 5, 80, retournee(engendrer({ dureeSec: 1, forme: "rampe" })));
    let ecart = 0;
    const a = montant.getChannelData(0), b = descendant.getChannelData(0);
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeGreaterThan(0.05);
  });

  it("LA PROFONDEUR GARDE SON SENS : à zéro, la courbe ne peut plus rien déplacer", () => {
    // La courbe pilote la position DANS la plage que la profondeur fixe. Plage nulle, aucun
    // mouvement possible — c'est ce qui garantit que le réglage n'a pas été contourné.
    const x = bruit(SR);
    const a = vibrato(x, 5, 0, engendrer({ dureeSec: 1, forme: "rampe" }));
    const b = vibrato(x, 5, 0, retournee(engendrer({ dureeSec: 1, forme: "rampe" })));
    expect(memesOctets(a, b)).toBe(true);
  });

  it("la sortie reste dans le gabarit et finie", () => {
    const x = bruit(SR);
    for (const c of [undefined, constante(0, 1), constante(1, 1), engendrer({ dureeSec: 1, forme: "rampe" })]) {
      const y = vibrato(x, 5, 100, c).getChannelData(0);
      expect(y.every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.max(...Array.from(y, Math.abs))).toBeLessThanOrEqual(1);
    }
  });
});

/** Un signal constant : ce qui sort du trémolo est alors le gain lui-même, lisible tel quel. */
function continu(n: number, v = 0.5): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.copyToChannel(new Float32Array(n).fill(v), 0);
  return b;
}

/** Le nombre de cycles d'un LFO entre deux échantillons : ses passages montants par son milieu. */
function cycles(x: Float32Array, milieu: number, de = 0, a = x.length): number {
  let n = 0;
  for (let i = Math.max(1, de); i < a; i++) if (x[i - 1] < milieu && x[i] >= milieu) n++;
  return n;
}

const ecartMax = (a: AudioBuffer, b: AudioBuffer): number => {
  const x = a.getChannelData(0), y = b.getChannelData(0);
  let e = 0;
  for (let i = 0; i < x.length; i++) e = Math.max(e, Math.abs(x[i] - y[i]));
  return e;
};

/** La boucle du trémolo telle qu'elle était dans le nœud avant d'en sortir — la référence. */
function tremoloDOrigine(a: AudioBuffer, freq: number, profondeur: number, forme: string): Float32Array {
  const sr = a.sampleRate, src = a.getChannelData(0), dst = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const phase = 2 * Math.PI * freq * t;
    let lfo: number;
    if (forme === "Carré" || forme === "Square") lfo = Math.sin(phase) >= 0 ? 1 : -1;
    else if (forme === "Triangle") lfo = 2 * Math.abs(2 * (freq * t - Math.floor(freq * t + 0.5))) - 1;
    else if (forme === "Sawtooth") lfo = 2 * (freq * t - Math.floor(freq * t)) - 1;
    else lfo = Math.sin(phase);
    // Lue d'un Float32Array dans le nœud d'origine : 0,7 y vaut 0,69999998…, et c'est ce qu'on garde.
    dst[i] = src[i] * (1 - Math.fround(profondeur) * (1 - lfo) / 2);
  }
  return dst;
}

describe("le trémolo dont la fréquence suit une courbe", () => {
  const FORMES = ["Sinus", "Carré", "Triangle", "Sawtooth"];

  it("SANS COURBE, LE SON EST CELUI D'AVANT AU BIT PRÈS, dans les quatre formes", () => {
    const x = bruit(SR);
    for (const forme of FORMES) {
      const attendu = tremoloDOrigine(x, 5.3, 0.7, forme);
      for (const pasUneCourbe of [undefined, null, 42, "bonjour"]) {
        const y = tremolo(x, 5.3, new Float32Array(SR).fill(0.7), forme, pasUneCourbe).getChannelData(0);
        expect(y.every((v, i) => v === attendu[i]), `${forme} ${String(pasUneCourbe)}`).toBe(true);
      }
    }
  });

  it("UNE COURBE CONSTANTE REND LE RÉGLAGE : le milieu de 1 à 16 Hz vaut 4 Hz, et sonne comme 4 Hz", () => {
    // Le chemin intégré et le calcul direct ne donnent pas les mêmes bits, mais le même son : l'écart
    // tient dans les arrondis. C'est ce qui prouve que la phase est bien accumulée, et au bon pas.
    const x = bruit(2 * SR);
    const p = new Float32Array(2 * SR).fill(1);
    for (const forme of ["Sinus", "Triangle"]) {
      const direct = tremolo(x, 4, p, forme);
      const integre = tremolo(x, 999, p, forme, constante(0.5, 2), { min: 1, max: 16 });
      expect(ecartMax(direct, integre), forme).toBeLessThan(1e-4);
    }
  });

  it("LE BALAYAGE COMPTE LE BON NOMBRE DE CYCLES — ce que `f · t` aurait faussé", () => {
    // Quatre secondes, de 1 à 16 Hz en multipliant : f(t) = 16^(t/4). L'intégrale vaut
    // 4 · 15 / ln 16 ≈ 21,6 cycles. Le calcul naïf f(t) · t en ferait 64 dans la dernière seconde.
    const n = 4 * SR;
    const y = tremolo(continu(n, 1), 5, new Float32Array(n).fill(1), "Sinus",
      engendrer({ dureeSec: 4, forme: "rampe" }), { min: 1, max: 16 }).getChannelData(0);
    const total = cycles(y, 0.5);
    expect(total).toBeGreaterThanOrEqual(20);
    expect(total).toBeLessThanOrEqual(23);
    // Et le rythme monte seconde après seconde, d'environ un facteur deux à chaque fois.
    const parSeconde = [0, 1, 2, 3].map((k) => cycles(y, 0.5, k * SR, (k + 1) * SR));
    for (let k = 1; k < 4; k++) expect(parSeconde[k]).toBeGreaterThan(parSeconde[k - 1]);
    expect(parSeconde[3]).toBeLessThanOrEqual(16);
  });

  it("la profondeur et la fréquence bougent ensemble, chacune sur son port", () => {
    const n = 2 * SR;
    const profondeurs = Float32Array.from({ length: n }, (_, i) => i / n); // de rien à tout
    const y = tremolo(continu(n, 1), 5, profondeurs, "Sinus", constante(1, 2), { min: 1, max: 12 }).getChannelData(0);
    // 12 Hz tenus : 24 cycles en deux secondes, dont la profondeur grandit.
    expect(Math.abs(cycles(y, 1 - 0.5 * 0.75, n / 2) - 12)).toBeLessThanOrEqual(1);
    const creux = (de: number, a: number) => Math.min(...y.subarray(de, a));
    expect(creux(0, SR / 4)).toBeGreaterThan(0.8);
    expect(creux(n - SR / 4, n)).toBeLessThan(0.1);
  });
});

describe("le vibrato dont la fréquence suit une courbe", () => {
  it("SANS COURBE DE FRÉQUENCE, LE SON EST CELUI D'AVANT AU BIT PRÈS", () => {
    const x = bruit(SR);
    for (const pasUneCourbe of [undefined, null, 42]) {
      expect(memesOctets(vibrato(x, 5, 50), vibrato(x, 5, 50, undefined, pasUneCourbe, { min: 1, max: 16 }))).toBe(true);
    }
  });

  it("UNE COURBE CONSTANTE REND LE RÉGLAGE : 4 Hz au milieu de 1 à 16", () => {
    const x = bruit(2 * SR);
    expect(ecartMax(vibrato(x, 4, 60), vibrato(x, 999, 60, undefined, constante(0.5, 2), { min: 1, max: 16 }))).toBeLessThan(1e-3);
  });

  it("deux fréquences tenues donnent deux vibratos différents", () => {
    const x = bruit(SR);
    const lent = vibrato(x, 5, 80, undefined, constante(0, 1), { min: 1, max: 16 });
    const rapide = vibrato(x, 5, 80, undefined, constante(1, 1), { min: 1, max: 16 });
    expect(ecartMax(lent, rapide)).toBeGreaterThan(0.05);
  });

  it("LA COURBE DE POSITION GARDE LA PRIORITÉ : elle remplace le LFO, il n'y a plus de vitesse à régler", () => {
    const x = bruit(SR);
    const geste = engendrer({ dureeSec: 1, forme: "rampe" });
    expect(memesOctets(vibrato(x, 5, 80, geste), vibrato(x, 5, 80, geste, constante(1, 1), { min: 1, max: 16 }))).toBe(true);
  });
});

// LA MÊME PREUVE POUR CHAQUE NŒUD À LFO : une courbe constante au milieu de ses bornes (la moyenne
// géométrique, puisque la course se parcourt en multipliant) sonne comme le réglage à cette valeur.
// L'égalité au bit près SANS courbe a été vérifiée contre les versions commitées, au moment du
// changement ; ici, on garde l'invariant qui survivra aux prochains.
describe("auto-pan, phaser, chopper et wah-wah : la fréquence du LFO suit une courbe", () => {
  const x = () => { const b = bruit(2 * SR); return b; };
  const milieu = (min: number, max: number) => Math.sqrt(min * max);

  it("L'AUTO-PAN : le milieu de 0,5 à 8 Hz sonne comme 2 Hz, et le balayage compte ses cycles", async () => {
    const son = x();
    expect(ecartMax(await autoPan(son, milieu(0.5, 8), 80), await autoPan(son, 999, 80, constante(0.5, 2), { min: 0.5, max: 8 }))).toBeLessThan(1e-4);
    // Un signal continu : le canal gauche est le gain lui-même. De 1 à 16 Hz sur 4 s : 21,6 cycles.
    const y = (await autoPan(continu(4 * SR, 1), 2, 100, engendrer({ dureeSec: 4, forme: "rampe" }), { min: 1, max: 16 })).getChannelData(0);
    const n = cycles(y, 0.5);
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThanOrEqual(23);
  });

  it("LE PHASER : le milieu de 0,1 à 4 Hz sonne comme 0,63 Hz", () => {
    const son = x();
    expect(ecartMax(phaser(son, milieu(0.1, 4), 80, 4, 50), phaser(son, 999, 80, 4, 50, constante(0.5, 2), { min: 0.1, max: 4 }))).toBeLessThan(1e-3);
    expect(ecartMax(phaser(son, 0.5, 80, 4, 50, constante(0, 2), { min: 0.1, max: 4 }),
      phaser(son, 0.5, 80, 4, 50, constante(1, 2), { min: 0.1, max: 4 }))).toBeGreaterThan(0.05);
  });

  it("LE CHOPPER : même découpe que le réglage, et la coupe accélère sur un balayage", () => {
    // Une coupe franche : un arrondi peut faire basculer un échantillon à la frontière d'un cycle.
    // On compte donc les échantillons qui diffèrent, et non l'écart maximal.
    const son = continu(2 * SR, 1);
    for (const type of [0, 1]) {
      const a = chopper(son, 4, 50, type).getChannelData(0);
      const b = chopper(son, 999, 50, type, constante(0.5, 2), { min: 1, max: 16 }).getChannelData(0);
      let differents = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-3) differents++;
      expect(differents / a.length, `type ${type}`).toBeLessThan(1e-3);
    }
    const y = chopper(continu(4 * SR, 1), 4, 50, 0, engendrer({ dureeSec: 4, forme: "rampe" }), { min: 1, max: 16 }).getChannelData(0);
    const parSeconde = [0, 1, 2, 3].map((k) => cycles(y, 0.5, k * SR, (k + 1) * SR));
    for (let k = 1; k < 4; k++) expect(parSeconde[k]).toBeGreaterThan(parSeconde[k - 1]);
  });

  it("LE WAH-WAH : le milieu de 0,5 à 8 Hz sonne comme 2 Hz ; la courbe de position garde la priorité", () => {
    const son = x();
    expect(ecartMax(wahwah(son, milieu(0.5, 8), 100, 5, 100),
      wahwah(son, 999, 100, 5, 100, undefined, undefined, constante(0.5, 2), { min: 0.5, max: 8 }))).toBeLessThan(1e-3);
    const geste = engendrer({ dureeSec: 2, forme: "rampe" });
    expect(memesOctets(wahwah(son, 2, 100, 5, 100, geste),
      wahwah(son, 2, 100, 5, 100, geste, undefined, constante(1, 2), { min: 0.5, max: 8 }))).toBe(true);
  });
});

describe("l'écho : le retard et la réinjection suivent une courbe", () => {
  /** Un clic au début, puis le silence : les répétitions se lisent comme des pics. */
  const clic = () => { const b = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR }); b.getChannelData(0)[0] = 1; return b; };
  const energie = (b: AudioBuffer, de: number, a: number) => {
    let e = 0;
    for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = de; i < Math.min(a, x.length); i++) e += x[i] * x[i]; }
    return e;
  };

  it("UN RETARD TENU PAR UNE COURBE REND LE RÉGLAGE", async () => {
    const son = bruit(SR);
    const regle = await appliquerEchoPingPong(son, 300, 40, 50);
    const courbe = await appliquerEchoPingPong(son, 999, 40, 50, { temps: constante(0.5, 1), bornesTemps: { min: 200, max: 400 } });
    expect(regle.length).toBe(courbe.length);
    expect(ecartMax(regle, courbe)).toBeLessThan(1e-3);
  });

  it("LA PREMIÈRE RÉPÉTITION ARRIVE AU RETARD QUE DIT LA COURBE", async () => {
    for (const [valeur, attenduMs] of [[0, 200], [1, 600]] as const) {
      const y = await appliquerEchoPingPong(clic(), 999, 0, 0, { temps: constante(valeur, 1), bornesTemps: { min: 200, max: 600 } });
      const x = y.getChannelData(0);
      let pic = 0, ou = 0;
      for (let i = 100; i < x.length; i++) if (Math.abs(x[i]) > pic) { pic = Math.abs(x[i]); ou = i; }
      expect(Math.abs((ou / SR) * 1000 - attenduMs), `courbe à ${valeur}`).toBeLessThan(2);
    }
  });

  it("LA RÉINJECTION PILOTÉE ALLONGE OU ÉTEINT LA QUEUE, et la boucle ne diverge jamais", async () => {
    const eteinte = await appliquerEchoPingPong(clic(), 200, 40, 0, { feedback: constante(0, 1), bornesFeedback: { min: 0, max: 95 } });
    const longue = await appliquerEchoPingPong(clic(), 200, 40, 0, { feedback: constante(1, 1), bornesFeedback: { min: 0, max: 95 } });
    // Après la première répétition (200 ms), plus rien sans réinjection ; tout le reste avec.
    expect(energie(eteinte, Math.round(0.3 * SR), eteinte.length)).toBeLessThan(1e-6);
    expect(energie(longue, Math.round(0.3 * SR), longue.length)).toBeGreaterThan(0.1);
    // Même des bornes absurdes ne dépassent pas 95 % : la sortie reste finie et bornée.
    const folle = await appliquerEchoPingPong(bruit(SR), 200, 40, 50, { feedback: constante(1, 1), bornesFeedback: { min: 0, max: 400 } });
    const z = folle.getChannelData(0);
    expect(z.every(Number.isFinite)).toBe(true);
    expect(Math.max(...Array.from(z.subarray(z.length - SR), Math.abs))).toBeLessThan(1);
  });
});

describe("l'écho ne diverge plus", () => {
  it("À 95 % DE RÉINJECTION ET TOUTE RÉPARTITION, LA QUEUE DÉCROÎT", async () => {
    // Le panoramique était dans la boucle : répartition à 50 %, la fin du fichier montait à 273 à
    // 90 % de réinjection, à 2 423 à 95 %. La réinjection se prend désormais avant lui.
    const pic = (x: Float32Array, de: number, a: number) => { let m = 0; for (let i = de; i < a; i++) m = Math.max(m, Math.abs(x[i])); return m; };
    for (const repartition of [0, 50, 100]) {
      for (const fb of [70, 90, 95]) {
        const y = await appliquerEchoPingPong(bruit(SR), 200, fb, repartition);
        for (let c = 0; c < 2; c++) {
          const z = y.getChannelData(c);
          const debut = pic(z, SR, 2 * SR), fin = pic(z, z.length - SR, z.length);
          expect(fin, `répartition ${repartition}, réinjection ${fb}, canal ${c}`).toBeLessThan(debut);
          expect(debut).toBeLessThan(10);
        }
      }
    }
  });
});

/** L'écart de hauteur, en cents, d'un sinus de 1 kHz passé au vibrato : crêtes haute et basse. */
function cretes(y: Float32Array, de: number, a: number): { haut: number; bas: number } {
  const passages: number[] = [];
  for (let i = Math.max(1, de); i < a; i++) {
    if (y[i - 1] < 0 && y[i] >= 0) passages.push(i - 1 + y[i - 1] / (y[i - 1] - y[i]));
  }
  let haut = -Infinity, bas = Infinity;
  for (let k = 1; k < passages.length; k++) {
    const cents = 1200 * Math.log2(SR / (passages[k] - passages[k - 1]) / 1000);
    haut = Math.max(haut, cents); bas = Math.min(bas, cents);
  }
  return { haut, bas };
}

const sinus1k = (n: number) => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.copyToChannel(Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / SR)), 0);
  return b;
};

describe("la profondeur du vibrato dit ce qu'elle promet", () => {
  it("100 % = ±2 DEMI-TONS, À 2, 5 COMME À 10 Hz — l'ampleur ne suit plus la vitesse", () => {
    // Avant : amplitude de retard fixe, donc un écart proportionnel à la vitesse — ±2,6 demi-tons à
    // 50 % et 5 Hz, et une lecture à l'envers à 100 % au-delà de 16 Hz.
    const x = sinus1k(3 * SR);
    for (const f of [2, 5, 10]) {
      const { haut, bas } = cretes(vibrato(x, f, 100).getChannelData(0), SR / 2, 3 * SR - SR / 2);
      // +189 et −213 cents : une lecture décalée monte un peu moins qu'elle ne descend, et c'est la
      // moyenne des deux crêtes qui vaut la profondeur.
      expect(Math.abs(haut - 189), `${f} Hz, crête haute ${haut.toFixed(1)}`).toBeLessThan(12);
      expect(Math.abs(bas + 213), `${f} Hz, crête basse ${bas.toFixed(1)}`).toBeLessThan(12);
      expect(Math.abs((haut - bas) / 2 - 200)).toBeLessThan(10);
    }
  });

  it("50 % = ±1 demi-ton, et à 20 Hz le son ne repart jamais à l'envers", () => {
    const x = sinus1k(2 * SR);
    const { haut, bas } = cretes(vibrato(x, 5, 50).getChannelData(0), SR / 2, 3 * SR / 2);
    expect(Math.abs((haut - bas) / 2 - 100)).toBeLessThan(8);
    const rapide = cretes(vibrato(x, 20, 100).getChannelData(0), SR / 2, 3 * SR / 2);
    expect(rapide.bas).toBeGreaterThan(-260);
    expect(rapide.haut).toBeLessThan(240);
  });

  it("LE VIBRATO QUI S'ACCÉLÈRE GARDE SA LARGEUR", () => {
    const x = sinus1k(4 * SR);
    const y = vibrato(x, 5, 100, undefined, engendrer({ dureeSec: 4, forme: "rampe" }), { min: 1, max: 12 }).getChannelData(0);
    const lent = cretes(y, SR / 2, 3 * SR / 2), vif = cretes(y, 5 * SR / 2, 7 * SR / 2);
    expect(Math.abs((lent.haut - lent.bas) / 2 - 200)).toBeLessThan(15);
    expect(Math.abs((vif.haut - vif.bas) / 2 - 200)).toBeLessThan(15);
  });

  it("le vibrato logistique atteint sa profondeur annoncée en fin de courbe", () => {
    const x = sinus1k(4 * SR);
    const y = vibratoLogistique(x, 5, 100, 20, 40, 100).getChannelData(0);
    const debut = cretes(y, 0, SR / 4), fin = cretes(y, 3 * SR, 4 * SR - SR / 8);
    expect(Math.abs((fin.haut - fin.bas) / 2 - 200)).toBeLessThan(15);
    expect((debut.haut - debut.bas) / 2).toBeLessThan(60);
  });
});
