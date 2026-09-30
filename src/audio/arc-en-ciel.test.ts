// audio/arc-en-ciel.test.ts — La carte entre la fréquence et l'espace tient-elle ?
//
// CE QUE CE FICHIER DOIT PROUVER, ET POURQUOI IL EST EN DEUX PARTIES. Le composant promet trois
// choses qui tiennent au même gradient : chaque bande sort d'une DIRECTION qui lui est propre,
// arrive à un INSTANT qui lui est propre, et DEMEURE le temps de sa résonance. Les deux premières se
// lisent dans la carte, qui est une fonction pure ; la troisième et l'effet audible demandent un
// rendu, et c'est la seconde partie.
//
// LE PIÈGE QUE CES CAS ÉVITENT. Un banc de filtres panoramiqué passerait la première partie sans
// rien faire de ce que l'arc-en-ciel fait : c'est pourquoi les cas vérifient aussi que les trajets
// s'ORDONNENT avec la fréquence, et qu'un son bref rend bien deux canaux dont les énergies penchent
// du bon côté selon sa hauteur.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { arcEnCiel, bandesArcEnCiel, dureeArcEnCiel, type OptionsArcEnCiel } from "./arc-en-ciel";

const REGLAGES: OptionsArcEnCiel = {
  bandes: 24, grave: 60, aigu: 12000, sens: "grave-gauche",
  ouverture: 100, courbure: 0, dispersion: 0.25, piegeage: 0.3, mix: 100,
};

const o = (p: Partial<OptionsArcEnCiel> = {}): OptionsArcEnCiel => ({ ...REGLAGES, ...p });

/** Une sinusoïde brève, de quoi exciter une bande et une seule. */
function sinus(hz: number, secondes = 0.5, sr = 44100): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * hz * i) / sr);
  return b;
}

/** L'énergie d'un canal, de quoi dire de quel côté un son penche. */
const energie = (b: AudioBuffer, c: number): number => {
  const d = b.getChannelData(c);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return s;
};

describe("la carte entre la fréquence et l'espace", () => {
  it("RANGE LES BANDES PAR OCTAVES ÉGALES entre les deux bords", () => {
    const b = bandesArcEnCiel(o({ bandes: 5, grave: 100, aigu: 1600 }));
    expect(b.map((x) => Math.round(x.frequence))).toEqual([100, 200, 400, 800, 1600]);
  });

  it("ET LE GRAVE SORT DU CÔTÉ DEMANDÉ, l'aigu de l'autre", () => {
    const gauche = bandesArcEnCiel(o({ sens: "grave-gauche" }));
    expect(gauche[0].position).toBeCloseTo(-1, 6);
    expect(gauche[gauche.length - 1].position).toBeCloseTo(1, 6);
    const droite = bandesArcEnCiel(o({ sens: "grave-droite" }));
    expect(droite[0].position).toBeCloseTo(1, 6);
    expect(droite[droite.length - 1].position).toBeCloseTo(-1, 6);
  });

  it("LES PLACES SE SUIVENT SANS JAMAIS REVENIR EN ARRIÈRE", () => {
    // C'est ce qui fait un arc-en-ciel plutôt qu'un éparpillement : le spectre se déplie dans
    // l'espace, une fois, dans un sens.
    const b = bandesArcEnCiel(o({ bandes: 64 }));
    for (let k = 1; k < b.length; k++) expect(b[k].position).toBeGreaterThan(b[k - 1].position);
  });

  it("L'OUVERTURE RESSERRE TOUT VERS LE CENTRE, et à zéro il ne reste rien de l'espace", () => {
    const moitie = bandesArcEnCiel(o({ ouverture: 50 }));
    expect(moitie[0].position).toBeCloseTo(-0.5, 6);
    const centre = bandesArcEnCiel(o({ ouverture: 0 }));
    for (const x of centre) expect(x.position).toBeCloseTo(0, 6);
  });

  it("LE GRAVE VA LE PLUS LOIN, donc il arrive le dernier", () => {
    const b = bandesArcEnCiel(o());
    expect(b[0].retard).toBeCloseTo(0.25, 6);
    expect(b[b.length - 1].retard).toBeCloseTo(0, 6);
    for (let k = 1; k < b.length; k++) expect(b[k].retard).toBeLessThan(b[k - 1].retard);
  });

  it("ET SANS DISPERSION TOUTES ARRIVENT ENSEMBLE, le tri ne restant que dans l'espace", () => {
    const b = bandesArcEnCiel(o({ dispersion: 0 }));
    for (const x of b) expect(x.retard).toBe(0);
    // Les places, elles, n'ont pas bougé : les deux effets sont indépendants.
    expect(b[0].position).toBeCloseTo(-1, 6);
  });

  it("LA BANDE QUI VA LE PLUS LOIN DEMEURE LE PLUS LONGTEMPS, le banc étant à Q constant", () => {
    const b = bandesArcEnCiel(o({ grave: 100, aigu: 1600, bandes: 5, piegeage: 0.4 }));
    expect(b[0].t60).toBeCloseTo(0.4, 6);
    // À Q constant, le temps suit l'inverse de la fréquence : une octave plus haut, moitié moins.
    expect(b[1].t60).toBeCloseTo(0.2, 6);
    expect(b[4].t60).toBeCloseTo(0.025, 6);
  });

  it("LA COURBURE RESSERRE LE GRADIENT SANS EN CHANGER LES BOUTS", () => {
    // Les deux bords restent là où ils sont ; c'est la répartition entre eux qui penche.
    const plat = bandesArcEnCiel(o({ bandes: 9, courbure: 0 }));
    const penche = bandesArcEnCiel(o({ bandes: 9, courbure: 100 }));
    expect(penche[0].position).toBeCloseTo(plat[0].position, 6);
    expect(penche[8].position).toBeCloseTo(plat[8].position, 6);
    expect(plat[4].position).toBeCloseTo(0, 6);
    expect(penche[4].position).toBeLessThan(plat[4].position);
  });

  it("LA DURÉE RENDUE TIENT LE TRAJET ET LA RÉSONANCE, sans quoi la traîne serait coupée", () => {
    const b = bandesArcEnCiel(o());
    // Le grave part le dernier ET résonne le plus longtemps : c'est lui qui fixe la fin.
    expect(dureeArcEnCiel(1, b)).toBeCloseTo(1 + 0.25 + 0.3, 6);
  });
});

describe("ce qu'on entend", () => {
  it("UN GRAVE PENCHE DU CÔTÉ DU GRAVE, UN AIGU DE L'AUTRE", () => {
    // La preuve qui compte : ce n'est pas la carte qu'on lit, c'est le son qui sort.
    const bas = arcEnCiel(sinus(100), o({ dispersion: 0 }));
    const haut = arcEnCiel(sinus(6000), o({ dispersion: 0 }));
    expect(energie(bas, 0)).toBeGreaterThan(energie(bas, 1) * 5);
    expect(energie(haut, 1)).toBeGreaterThan(energie(haut, 0) * 5);
  });

  it("ET LE SENS RENVERSÉ RENVERSE LE SON, non pas seulement la carte", () => {
    const bas = arcEnCiel(sinus(100), o({ dispersion: 0, sens: "grave-droite" }));
    expect(energie(bas, 1)).toBeGreaterThan(energie(bas, 0) * 5);
  });

  it("SANS OUVERTURE, LES DEUX CANAUX SE VALENT", () => {
    const bas = arcEnCiel(sinus(100), o({ dispersion: 0, ouverture: 0 }));
    expect(energie(bas, 0)).toBeCloseTo(energie(bas, 1), 4);
  });

  it("LA SORTIE EST PLUS LONGUE QUE L'ENTRÉE, la traîne sortant après la fin du son", () => {
    const entree = sinus(100, 0.5);
    const y = arcEnCiel(entree, o());
    expect(y.length).toBeGreaterThan(entree.length);
    expect(y.numberOfChannels).toBe(2);
  });

  it("ET LE GRAVE ARRIVE APRÈS L'AIGU quand la dispersion agit", () => {
    // Le trajet se mesure sur le son : le premier échantillon qui sort du silence.
    const debut = (b: AudioBuffer): number => {
      const g = b.getChannelData(0), d = b.getChannelData(1);
      const seuil = 1e-3;
      for (let i = 0; i < b.length; i++) if (Math.abs(g[i]) > seuil || Math.abs(d[i]) > seuil) return i;
      return b.length;
    };
    const reglages = o({ dispersion: 0.3, piegeage: 0.2 });
    expect(debut(arcEnCiel(sinus(100), reglages))).toBeGreaterThan(debut(arcEnCiel(sinus(6000), reglages)));
  });

  it("LE TRI TIENT AUX DEUX BOUTS, avec une marge qu'aucune fuite ne renverse", () => {
    // LE CAS QUI A TROUVÉ LA FAUTE. La première version employait un résonateur tout-pôles, sans
    // zéro au continu : chaque bande aiguë laissait passer le grave, ces fuites s'ajoutaient en
    // phase, et une sinusoïde de 100 Hz sortait du côté de l'aigu. Ce cas mesure l'écart entre les
    // deux canaux, et non le seul signe : un tri qui ne tiendrait qu'à un cheveu repasserait sous
    // une fuite au premier réglage venu.
    const marge = (hz: number): number => {
      const y = arcEnCiel(sinus(hz), o({ dispersion: 0 }));
      const g = energie(y, 0);
      const d = energie(y, 1);
      return 10 * Math.log10(Math.max(g, d) / Math.max(1e-12, Math.min(g, d)));
    };
    expect(marge(80)).toBeGreaterThan(15);
    expect(marge(10000)).toBeGreaterThan(15);
  });

  it("ET LE PIÉGEAGE DURE CE QU'IL DIT : soixante décibels dans le temps demandé", () => {
    // DEUX SECTIONS NE DÉCROISSENT PAS COMME UNE SEULE, et le pôle est calculé en conséquence. Sans
    // cette correction le réglage annonçait une demeure de moitié plus courte que celle qu'on
    // entend ; ce cas l'empêche de revenir.
    const sr = 44100;
    const impulsion = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: sr });
    impulsion.getChannelData(0)[0] = 1;
    for (const demande of [0.3, 1]) {
      // Une seule bande, pour que ce soit bien sa décroissance qu'on lise.
      const y = arcEnCiel(impulsion, o({ bandes: 2, grave: 200, aigu: 202, dispersion: 0, piegeage: demande }));
      const g = y.getChannelData(0);
      const d = y.getChannelData(1);
      let pic = 0;
      for (let i = 0; i < y.length; i++) pic = Math.max(pic, Math.abs(g[i]), Math.abs(d[i]));
      let fin = 0;
      for (let i = y.length - 1; i >= 0; i--) {
        if (Math.abs(g[i]) > pic / 1000 || Math.abs(d[i]) > pic / 1000) { fin = i; break; }
      }
      expect(fin / sr, `${demande} s demandées`).toBeGreaterThan(demande * 0.9);
      expect(fin / sr, `${demande} s demandées`).toBeLessThan(demande * 1.1);
    }
  });

  it("À MIX ZÉRO, L'ENTRÉE RESSORT INCHANGÉE sur la part qu'elle occupe", () => {
    const entree = sinus(440, 0.2);
    const y = arcEnCiel(entree, o({ mix: 0 }));
    const x = entree.getChannelData(0), s = y.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(x[i] - s[i]));
    expect(ecart).toBeLessThan(1e-6);
  });
});
