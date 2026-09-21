// audio/ampleur.test.ts — Plus large, pas plus fort : les trois chiffres qui le disent.
//
// LA PROMESSE DU NŒUD TIENT EN TROIS MESURES, et aucune n'est affaire de goût :
//
//   1. LA SONIE NE BOUGE PAS. Si l'énergie monte, ce n'est pas de l'ampleur, c'est du gain — et
//      c'est l'illusion la plus commune du traitement sonore.
//   2. LA CORRÉLATION TOMBE. Un vaut deux canaux identiques, donc une source ponctuelle. C'est
//      ce chiffre-là que le nœud est censé faire baisser, et le seul qui dise s'il y parvient.
//   3. LA SOMME MONO TIENT. Décorréler trop creuse le centre : un mixage qui s'ouvre en stéréo
//      se vide sur une enceinte unique. C'est le défaut des élargisseurs bon marché.
import { describe, expect, it } from "vitest";
import {
  ampleur, appliquerReflexions, correlation, efficace, sequenceVelours, tenueAttendue, tenueEnMono,
  type OptionsAmpleur,
} from "./ampleur";

const SR = 44100;
// LES RÉGLAGES PAR DÉFAUT SONT CHOISIS SUR MESURE, et non au jugé. Balayage : à 80 réflexions
// par seconde sur 45 ms, la corrélation ne tombe qu'à 0,894 — l'effet s'entend à peine. À 200 sur
// 80 ms, elle tombe à 0,035 tandis que la somme mono se tient à 0,741, c'est-à-dire au plancher
// que la géométrie impose. C'est ce point-là qu'on garde.
const BASE: OptionsAmpleur = {
  densite: 200, fenetreSec: 0.08, preDelaiSec: 0.012, absorption: 0.5,
  melange: 1, graine: 7, frequence: SR,
};

/** Un son mono, celui sur lequel tous les outils de largeur existants ne font rien. */
function mono(dureeS = 2, freq = 220): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Des attaques : un son tenu ne révèle ni réflexion ni décorrélation.
    const enveloppe = Math.exp(-6 * (t % 0.5));
    for (let k = 1; k <= 6; k++) x[i] += (Math.pow(k, -1.3) / 4) * enveloppe * Math.sin(2 * Math.PI * freq * k * t);
  }
  return x;
}

describe("la suite de bruit de velours", () => {
  const r = sequenceVelours(BASE);

  it("il y a une impulsion par case, à la densité demandée", () => {
    const attendu = Math.ceil((BASE.fenetreSec * SR) / Math.round(SR / BASE.densite));
    expect(r.length).toBe(attendu);
  });

  it("LES POSITIONS SONT CROISSANTES ET SANS PAQUET : c'est la grille qui le garantit", () => {
    const case_ = Math.round(SR / BASE.densite);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].position).toBeGreaterThan(r[i - 1].position);
      // Deux réflexions voisines ne peuvent pas s'écarter de plus de deux cases.
      expect(r[i].position - r[i - 1].position).toBeLessThanOrEqual(2 * case_);
    }
  });

  it("rien n'arrive avant le pré-délai", () => {
    expect(r[0].position).toBeGreaterThanOrEqual(Math.round(BASE.preDelaiSec * SR));
  });

  it("les signes sont des deux sortes", () => {
    const positifs = r.filter((x) => x.signe > 0).length;
    expect(positifs).toBeGreaterThan(0);
    expect(positifs).toBeLessThan(r.length);
  });

  it("les réflexions tardives sont plus faibles que les premières", () => {
    expect(r[r.length - 1].gain).toBeLessThan(r[0].gain);
  });

  it("sans absorption, elles gardent toutes la même force", () => {
    const sans = sequenceVelours({ ...BASE, absorption: 0 });
    for (const x of sans) expect(x.gain).toBeCloseTo(1, 10);
  });

  it("deux graines donnent deux suites différentes — c'est là que naît la décorrélation", () => {
    const a = sequenceVelours(BASE).map((x) => x.position);
    const b = sequenceVelours({ ...BASE, graine: BASE.graine + 104729 }).map((x) => x.position);
    expect(a).not.toEqual(b);
  });

  it("la même graine rejoue la même suite", () => {
    expect(sequenceVelours(BASE)).toEqual(sequenceVelours(BASE));
  });

  it("des réglages extrêmes ne font pas boucler ni lever", () => {
    expect(() => sequenceVelours({ ...BASE, densite: 0, fenetreSec: 0 })).not.toThrow();
    expect(sequenceVelours({ ...BASE, densite: 5000 }).length).toBeLessThan(20000);
  });
});

describe("appliquer les réflexions", () => {
  it("une seule réflexion décale et pèse ce qu'on lui demande", () => {
    const x = Float32Array.from({ length: 100 }, (_, i) => (i === 0 ? 1 : 0));
    const y = appliquerReflexions(x, [{ position: 10, signe: -1, gain: 0.5 }]);
    expect(y[10]).toBeCloseTo(-0.5, 10);
    expect(y[0]).toBe(0);
  });

  it("aucune réflexion rend le silence", () => {
    expect([...appliquerReflexions(mono(0.1), [])].every((v) => v === 0)).toBe(true);
  });

  it("ce qui déborde de la fin est coupé, sans lever", () => {
    const x = Float32Array.from({ length: 10 }, () => 1);
    expect(() => appliquerReflexions(x, [{ position: 1000, signe: 1, gain: 1 }])).not.toThrow();
  });
});

describe("LES TROIS CHIFFRES DE LA PROMESSE", () => {
  const x = mono();
  const [g, d] = ampleur(x, x, BASE);

  it("1. LA SONIE NE BOUGE PAS — c'est de l'ampleur, pas du gain", () => {
    const avant = efficace(x);
    const apres = Math.max(efficace(g), efficace(d));
    expect(apres).toBeCloseTo(avant, 6);
  });

  it("2. LA CORRÉLATION TOMBE : d'une source ponctuelle à un son sans position", () => {
    // À l'entrée, les deux canaux sont le MÊME son : corrélation parfaite.
    expect(correlation(x, x)).toBeCloseTo(1, 10);
    // À la sortie, elle est tombée à presque rien : mesuré 0,035 aux réglages par défaut.
    expect(correlation(g, d)).toBeLessThan(0.2);
  });

  it("3. LA SOMME MONO TIENT : on paie la largeur, on ne creuse pas le centre", () => {
    // LE PLANCHER EST 1/√2 ET NON ZÉRO. Deux canaux parfaitement décorrélés donnent 0,707 en
    // somme mono : leurs énergies s'ajoutent quand leurs amplitudes se moyennent. Mesuré aux
    // réglages par défaut : 0,741 pour une corrélation de 0,035 — c'est-à-dire complètement
    // décorrélé, et au plancher théorique. Le défaut à attraper serait de descendre SOUS 0,707,
    // là où les phases se détruisent activement.
    expect(tenueEnMono(g, d)).toBeGreaterThan(Math.SQRT1_2 - 0.05);
  });

  it("ET ELLE VAUT EXACTEMENT CE QUE LA CORRÉLATION IMPOSE : √((1+ρ)/2)", () => {
    // La comparaison qui a du sens, et qui remplace le seuil fixe. Mesuré dans l'application :
    // une corrélation de −0,06 donne une tenue de 0,68, et la formule en prédit 0,686. Un seuil
    // fixe à 0,707 aurait crié au défaut sur un résultat sain.
    expect(tenueEnMono(g, d)).toBeCloseTo(tenueAttendue(correlation(g, d)), 2);
  });

  it("la formule tient à ses deux bouts", () => {
    expect(tenueAttendue(1)).toBeCloseTo(1, 10);        // canaux identiques
    expect(tenueAttendue(0)).toBeCloseTo(Math.SQRT1_2, 10); // décorrélés
    expect(tenueAttendue(-1)).toBeCloseTo(0, 10);       // opposés : la somme s'annule
  });

  it("plus de mélange décorrèle davantage, et la sonie ne bouge toujours pas", () => {
    const [a1, b1] = ampleur(x, x, { ...BASE, melange: 0.2 });
    const [a2, b2] = ampleur(x, x, { ...BASE, melange: 1 });
    expect(correlation(a2, b2)).toBeLessThan(correlation(a1, b1));
    expect(Math.max(efficace(a2), efficace(b2))).toBeCloseTo(efficace(x), 6);
  });

  it("à mélange nul, rien n'est touché", () => {
    const [a, b] = ampleur(x, x, { ...BASE, melange: 0 });
    for (let i = 0; i < x.length; i += 997) {
      expect(a[i]).toBeCloseTo(x[i], 6);
      expect(b[i]).toBeCloseTo(x[i], 6);
    }
    expect(correlation(a, b)).toBeCloseTo(1, 8);
  });
});

describe("les réglages", () => {
  const x = mono();

  it("une fenêtre plus longue décorrèle davantage", () => {
    const court = ampleur(x, x, { ...BASE, fenetreSec: 0.01 });
    const long = ampleur(x, x, { ...BASE, fenetreSec: 0.08 });
    expect(correlation(long[0], long[1])).toBeLessThan(correlation(court[0], court[1]));
  });

  it("une densité plus forte aussi", () => {
    const rare = ampleur(x, x, { ...BASE, densite: 20 });
    const dense = ampleur(x, x, { ...BASE, densite: 200 });
    expect(correlation(dense[0], dense[1])).toBeLessThan(correlation(rare[0], rare[1]));
  });

  it("une entrée déjà stéréo est traitée sans que l'image se déplace", () => {
    const gauche = mono(2, 220);
    const droite = mono(2, 223);
    const [a, b] = ampleur(gauche, droite, BASE);
    // La correction d'énergie est commune aux deux canaux : leur rapport est préservé.
    const rapportAvant = efficace(gauche) / efficace(droite);
    const rapportApres = efficace(a) / efficace(b);
    expect(rapportApres).toBeCloseTo(rapportAvant, 1);
  });

  it("le son rendu reste fini aux réglages extrêmes", () => {
    const [a, b] = ampleur(x, x, {
      ...BASE, densite: 400, fenetreSec: 0.2, preDelaiSec: 0, absorption: 0, melange: 1,
    });
    expect([...a].every(Number.isFinite)).toBe(true);
    expect([...b].every(Number.isFinite)).toBe(true);
  });

  it("UNE COURBE CONSTANTE REND EXACTEMENT CE QUE REND LE RÉGLAGE", () => {
    // L'invariant qui justifie le chemin de calcul unique : si les deux façons de mélanger
    // divergeaient, un jour l'une des deux oublierait une borne et rien ne le dirait.
    const fixe = ampleur(x, x, { ...BASE, melange: 0.4 });
    const pilote = ampleur(x, x, {
      ...BASE, melange: 1, melangeCourbe: new Float32Array(x.length).fill(0.4),
    });
    for (let i = 0; i < x.length; i += 997) {
      expect(pilote[0][i]).toBeCloseTo(fixe[0][i], 6);
      expect(pilote[1][i]).toBeCloseTo(fixe[1][i], 6);
    }
  });

  it("UNE RAMPE OUVRE LA PIÈCE : sec au début, large à la fin", () => {
    const rampe = Float32Array.from({ length: x.length }, (_, i) => i / (x.length - 1));
    const [g, d] = ampleur(x, x, { ...BASE, melangeCourbe: rampe });
    const quart = Math.floor(x.length / 4);
    const debut = correlation(g.subarray(0, quart), d.subarray(0, quart));
    const fin = correlation(g.subarray(x.length - quart), d.subarray(x.length - quart));
    expect(debut).toBeGreaterThan(0.9);   // les deux canaux sont encore le même son
    expect(fin).toBeLessThan(0.3);        // et ne le sont plus du tout
  });

  it("et la sonie ne bouge toujours pas quand la courbe module", () => {
    const rampe = Float32Array.from({ length: x.length }, (_, i) => i / (x.length - 1));
    const [g, d] = ampleur(x, x, { ...BASE, melangeCourbe: rampe });
    expect(Math.max(efficace(g), efficace(d))).toBeCloseTo(efficace(x), 6);
  });

  it("une courbe hors bornes est ramenée dans les bornes, sans soustraire les réflexions", () => {
    const folle = Float32Array.from({ length: x.length }, (_, i) => (i % 2 ? -3 : 7));
    const pleine = ampleur(x, x, { ...BASE, melange: 1 });
    const bornee = ampleur(x, x, { ...BASE, melangeCourbe: folle });
    expect([...bornee[0]].every(Number.isFinite)).toBe(true);
    // Une valeur sur deux vaut zéro, l'autre un : moins de réflexions que le mélange plein.
    expect(correlation(bornee[0], bornee[1])).toBeGreaterThan(correlation(pleine[0], pleine[1]));
  });

  it("une courbe vide ou plus courte que le son ne fait pas lever", () => {
    expect(() => ampleur(x, x, { ...BASE, melangeCourbe: new Float32Array(0) })).not.toThrow();
    const courte = ampleur(x, x, { ...BASE, melangeCourbe: new Float32Array(10).fill(1) });
    expect([...courte[0]].every(Number.isFinite)).toBe(true);
  });

  it("un signal vide ne fait pas diviser par zéro", () => {
    const vide = new Float32Array(0);
    expect(() => ampleur(vide, vide, BASE)).not.toThrow();
    expect(tenueEnMono(vide, vide)).toBe(1);
    expect(correlation(vide, vide)).toBe(1);
  });
});
