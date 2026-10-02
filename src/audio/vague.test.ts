// audio/vague.test.ts — La vague se brise-t-elle, ou bat-elle comme un trémolo ?
//
// CE QUE CE FICHIER DOIT PROUVER. Une courbe symétrique rendue par erreur sonnerait parfaitement
// plausible : on entendrait un son qui va et vient, et personne ne dirait que ce n'est pas une
// vague. Ce qui fait la vague est le RAPPORT entre le temps qu'elle met à se former et celui qu'elle
// met à se briser, et c'est la seule chose que l'oreille ne vérifie pas d'elle-même. Les cas le
// mesurent sur l'enveloppe du son rendu, et non sur les réglages.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { dureesDesCycles, formeDeLaVague, vague } from "./vague";

const SR = 8000;

const BASE = {
  periode: 2, variation: 0, montee: 0.7, rupture: "deferlante" as const,
  profondeur: 1, ouverture: 0.6, graine: 5,
};

/** Un bruit constant : ce qui en ressort est l'enveloppe, et rien d'autre. */
function fond(secondes: number): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  let g = 9;
  for (let i = 0; i < n; i++) {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    d[i] = g / 4294967296 - 0.5;
  }
  return b;
}

/**
 * L'enveloppe du son rendu : sa crête sur des fenêtres de vingt millisecondes, puis lissée.
 *
 * LE LISSAGE N'EST PAS UN CONFORT. L'enveloppe d'un bruit est dentelée d'un centième à l'autre, et
 * chaque dent est un maximum local : sans lui, le compteur de vagues en trouvait seize là où il y en
 * a cinq. On moyenne donc sur deux cents millisecondes, ce qui est court devant une vague de deux
 * secondes et long devant le grain du bruit.
 */
function enveloppe(b: AudioBuffer): Float32Array {
  const x = b.getChannelData(0);
  const pas = Math.round(0.02 * SR);
  const brute = new Float32Array(Math.floor(x.length / pas));
  for (let k = 0; k < brute.length; k++) {
    let m = 0;
    for (let i = k * pas; i < (k + 1) * pas; i++) m = Math.max(m, Math.abs(x[i]));
    brute[k] = m;
  }
  const demi = 5;
  return Float32Array.from(brute, (_, k) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, k - demi); j <= Math.min(brute.length - 1, k + demi); j++) { s += brute[j]; n++; }
    return s / n;
  });
}

/** Les instants des sommets de l'enveloppe, en fenêtres. */
function sommets(env: Float32Array): number[] {
  const seuil = Math.max(...Array.from(env)) * 0.6;
  const large = 8;
  const out: number[] = [];
  for (let k = large; k < env.length - large; k++) {
    if (env[k] < seuil) continue;
    let plusHaut = true;
    for (let j = k - large; j <= k + large; j++) if (env[j] > env[k]) { plusHaut = false; break; }
    if (plusHaut && (out.length === 0 || k - out[out.length - 1] > large)) out.push(k);
  }
  return out;
}

describe("la forme d'un cycle", () => {
  it("PART DU CREUX, PASSE PAR UN SOMMET, ET Y REVIENT", () => {
    expect(formeDeLaVague(0, 0.7, "deferlante")).toBeCloseTo(0, 6);
    expect(formeDeLaVague(0.7, 0.7, "deferlante")).toBeCloseTo(1, 6);
    expect(formeDeLaVague(1, 0.7, "deferlante")).toBeCloseTo(0, 6);
  });

  it("ET SON SOMMET TOMBE OÙ LA MONTÉE LE PLACE, non au milieu", () => {
    // LA PROPRIÉTÉ QUI FAIT LA VAGUE. Un sommet au milieu, c'est un trémolo : la courbe monterait et
    // descendrait du même pas, et le sens du mouvement disparaîtrait.
    for (const m of [0.3, 0.5, 0.8]) {
      let ou = 0;
      let haut = -1;
      for (let k = 0; k <= 200; k++) {
        const v = formeDeLaVague(k / 200, m, "deferlante");
        if (v > haut) { haut = v; ou = k / 200; }
      }
      expect(ou, `montée ${m}`).toBeCloseTo(m, 2);
    }
  });

  it("ET LA DÉFERLANTE TOMBE PLUS VITE QUE LA PROGRESSIVE", () => {
    // À mi-chemin de la chute, la déferlante a déjà presque tout perdu quand la progressive est
    // encore à la moitié.
    const miChute = 0.7 + (1 - 0.7) / 2;
    expect(formeDeLaVague(miChute, 0.7, "progressive")).toBeCloseTo(0.5, 2);
    expect(formeDeLaVague(miChute, 0.7, "deferlante")).toBeLessThan(0.2);
  });
});

describe("la suite des cycles", () => {
  it("SANS VARIATION, TOUTES LES DURÉES SONT ÉGALES, au bit près", () => {
    const d = dureesDesCycles({ ...BASE, variation: 0 }, 20);
    for (const x of d) expect(x).toBe(BASE.periode);
  });

  it("ET AVEC VARIATION, ELLES NE LE SONT PLUS, sans dériver au loin", () => {
    const d = dureesDesCycles({ ...BASE, variation: 0.5 }, 40);
    expect(new Set(d).size).toBeGreaterThan(d.length / 2);
    for (const x of d) {
      expect(x).toBeGreaterThan(BASE.periode * 0.5);
      expect(x).toBeLessThan(BASE.periode * 1.5);
    }
  });
});

describe("le son rendu", () => {
  it("PORTE AUTANT DE VAGUES QUE LA DURÉE EN CONTIENT DE PÉRIODES", () => {
    const out = vague(fond(10), BASE);
    expect(sommets(enveloppe(out)).length).toBe(5);
  });

  it("ET SA MONTÉE EST PLUS LONGUE QUE SA CHUTE, ce qui le sépare d'un trémolo", () => {
    // LA PREUVE QUI COMPTE, et elle se prend sur le son. Du creux au sommet, puis du sommet au creux
    // suivant : à sept dixièmes de montée, le premier doit durer plus du double du second.
    const env = enveloppe(vague(fond(10), BASE));
    const pics = sommets(env);
    expect(pics.length).toBeGreaterThan(2);
    // Le creux se cherche ENTRE DEUX SOMMETS, et non en avant d'un seul : chercher sur une fenêtre
    // fixe franchissait le sommet suivant et rendait une montée négative.
    const creuxEntre = (a: number, b: number) => {
      let ou = a;
      let bas = Infinity;
      for (let k = a; k <= b; k++) if (env[k] < bas) { bas = env[k]; ou = k; }
      return ou;
    };
    const sommet = pics[1];
    const montee = sommet - creuxEntre(pics[0], sommet);
    const chute = creuxEntre(sommet, pics[2]) - sommet;
    // MESURÉ : 67 fenêtres de montée pour 34 de chute, soit un rapport de 1,97. Le réglage en
    // promet 2,33, sept dixièmes de cycle contre trois : le lissage de deux cents millisecondes
    // arrondit le creux et le sommet, qui sont tous deux des angles, et rapproche les deux instants.
    // Ce qui est gardé ici est l'asymétrie, et un trémolo rendrait exactement un.
    expect(montee).toBeGreaterThan(chute * 1.5);
  });

  it("ET LE TIMBRE S'OUVRE AU SOMMET, ce qui est la part de filtrage de l'effet", () => {
    // Un son qui ne ferait que changer de niveau irait et viendrait sans s'approcher. On compare
    // donc le haut du spectre au sommet et au creux, rapporté au niveau de chacun.
    const out = vague(fond(10), { ...BASE, profondeur: 0.5, ouverture: 1 });
    const x = out.getChannelData(0);
    const brillance = (centre: number) => {
      const d = Math.max(0, centre - Math.round(0.05 * SR));
      const f = Math.min(x.length, centre + Math.round(0.05 * SR));
      let haut = 0;
      let total = 0;
      for (let i = d + 1; i < f; i++) { haut += (x[i] - x[i - 1]) ** 2; total += x[i] * x[i]; }
      return total > 0 ? haut / total : 0;
    };
    const pas = Math.round(0.02 * SR);
    const pics = sommets(enveloppe(out));
    const auSommet = brillance(pics[1] * pas);
    const auCreux = brillance(Math.round((pics[1] + pics[2]) / 2) * pas);
    expect(auSommet).toBeGreaterThan(auCreux * 1.5);
  });
});
