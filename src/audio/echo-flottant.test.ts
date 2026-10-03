// audio/echo-flottant.test.ts — Le peigne tombe-t-il où la distance le place ?
//
// CE QUE CE FICHIER DOIT PROUVER. Un écho flottant qui sonnerait simplement « métallique » serait
// faux sans qu'on s'en aperçoive : c'est la DISTANCE ENTRE LES MURS qui fixe la hauteur du battement,
// et un facteur deux oublié dans l'aller-retour donnerait un timbre parfaitement plausible, à
// l'octave du vrai. Les cas mesurent donc où tombent les dents du peigne, et non si le son a changé.
//
// POUR HAAS, CE QU'IL FAUT GARDER EST LE RETARD LUI-MÊME, à l'échantillon près : tout l'effet tient
// à ce que les deux canaux portent le MÊME son à deux instants, et un canal qui ne serait pas la
// copie exacte de l'autre ne serait plus une réflexion.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  CELERITE, echoFlottant, frequenceDuPeigne, haas, periodeEntreMurs,
} from "./echo-flottant";

const SR = 16000;

/** Une impulsion : le claquement de mains avec lequel on éprouve un couloir. */
function claquement(secondes: number, canaux = 1): AudioBuffer {
  const b = new AudioBuffer({
    numberOfChannels: canaux, length: Math.round(secondes * SR), sampleRate: SR,
  });
  for (let c = 0; c < canaux; c++) b.getChannelData(c)[0] = 1;
  return b;
}

/** L'énergie d'un signal à une fréquence, par Goertzel. */
function energieA(x: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

const BASE = { distance: 3, decroissance: 1, amortissement: 0.2, melange: 1 };

describe("la géométrie des deux murs", () => {
  it("COMPTE L'ALLER ET LE RETOUR, ce qu'un facteur deux oublié rendrait plausible à l'octave", () => {
    // Trois mètres : six mètres de trajet, dix-sept millisecondes et demie, cinquante-sept hertz.
    expect(periodeEntreMurs(3)).toBeCloseTo(6 / CELERITE, 9);
    expect(periodeEntreMurs(3) * 1000).toBeCloseTo(17.5, 1);
    expect(frequenceDuPeigne(3)).toBeCloseTo(57.2, 1);
    // Et la fréquence tombe quand les murs s'écartent, au lieu de monter.
    expect(frequenceDuPeigne(10)).toBeLessThan(frequenceDuPeigne(3));
  });
});

describe("le peigne rendu", () => {
  it("POSE SES DENTS AUX MULTIPLES DE LA FRÉQUENCE DE LA DISTANCE", () => {
    // LA PREUVE QUI COMPTE, et elle se prend sur le signal. Entre deux dents, le creux : c'est la
    // différence entre les deux qui fait le timbre, et non la seule présence d'un écho.
    const x = echoFlottant(claquement(1), BASE).getChannelData(0);
    const f = frequenceDuPeigne(BASE.distance);
    for (const k of [2, 3, 4]) {
      const dent = energieA(x, f * k);
      const creux = energieA(x, f * (k + 0.5));
      expect(dent, `dent ${k}`).toBeGreaterThan(creux * 10);
    }
  });

  it("ET LA PÉRIODE DU BATTEMENT EST CELLE DE L'ALLER-RETOUR, à l'échantillon près", () => {
    // LA MESURE SE PREND PAR AUTOCORRÉLATION, et non sur deux fréquences choisies à la main. La
    // première version comparait les deux rendus à une même dent : avec des distances de deux et
    // quatre mètres, 257 hertz se trouve être une dent des DEUX peignes, l'une étant le sixième
    // harmonique quand l'autre est le troisième. Toute distance double tombe dans ce piège. Le
    // retard, lui, se relève sans rien choisir.
    const periodeMesuree = (d: number) => {
      const x = echoFlottant(claquement(0.5), { ...BASE, distance: d, amortissement: 0 }).getChannelData(0);
      let meilleur = 0;
      let score = -Infinity;
      for (let k = 20; k < Math.round(0.08 * SR); k++) {
        let s = 0;
        for (let i = k; i < x.length; i++) s += x[i] * x[i - k];
        if (s > score) { score = s; meilleur = k; }
      }
      return meilleur;
    };
    for (const d of [2, 3, 4]) {
      expect(periodeMesuree(d), `${d} mètres`).toBe(Math.round(periodeEntreMurs(d) * SR));
    }
  });

  it("ET LES RÉFLEXIONS RESTENT DISCRÈTES, ce qui le sépare d'une réverbération", () => {
    // Une diffusion remplirait l'intervalle entre deux retours ; ici il reste vide. On compare donc
    // ce qui arrive AUTOUR du retour et ce qui arrive entre deux. Autour, et non à l'échantillon
    // exact : l'amortissement étale chaque retour sur quelques échantillons, et le sommet ne tombe
    // plus tout à fait sur le multiple du retard.
    const x = echoFlottant(claquement(0.5), { ...BASE, decroissance: 2 }).getChannelData(0);
    const pas = Math.round(periodeEntreMurs(BASE.distance) * SR);
    let auRetour = 0;
    for (let i = pas * 3 - 2; i <= pas * 3 + 6; i++) auRetour = Math.max(auRetour, Math.abs(x[i]));
    let entre = 0;
    for (let i = pas * 3 + 20; i < pas * 4 - 20; i++) entre = Math.max(entre, Math.abs(x[i]));
    // MESURÉ : le rapport vaut 4,5×10¹². Entre deux retours il ne reste rien du tout, à la
    // poussière du calcul près, et c'est bien ce qu'on attend d'un trajet sans diffusion. Le seuil
    // reste modeste : ce qui est gardé ici est la discrétion des retours, non ce chiffre.
    expect(auRetour).toBeGreaterThan(entre * 20);
  });

  it("ET LA DÉCROISSANCE TIENT SA PROMESSE : soixante décibels dans le temps demandé", () => {
    const x = echoFlottant(claquement(2), { ...BASE, decroissance: 0.5, amortissement: 0 }).getChannelData(0);
    const pas = Math.round(periodeEntreMurs(BASE.distance) * SR);
    const aUnDemi = Math.abs(x[Math.round(0.5 * SR / pas) * pas]);
    // Mille fois moins, c'est soixante décibels ; la tolérance couvre l'arrondi du retard en
    // échantillons entiers, qui décale un peu le nombre de tours tenus dans la demi-seconde.
    expect(aUnDemi).toBeLessThan(1 / 500);
    expect(aUnDemi).toBeGreaterThan(1 / 2000);
  });

  it("ET L'AMORTISSEMENT ASSOURDIT LES TOURS AU LIEU DE LES RACCOURCIR", () => {
    const sec = echoFlottant(claquement(1), { ...BASE, amortissement: 0 }).getChannelData(0);
    const mou = echoFlottant(claquement(1), { ...BASE, amortissement: 0.9 }).getChannelData(0);
    const haut = frequenceDuPeigne(BASE.distance) * 40;
    expect(energieA(sec, haut)).toBeGreaterThan(energieA(mou, haut) * 5);
  });
});

describe("l'effet Haas", () => {
  it("MET LE MÊME SON DANS LES DEUX CANAUX, à l'échantillon près", () => {
    // LA PROPRIÉTÉ QUI FAIT L'EFFET : c'est une réflexion, donc une copie. Un canal filtré ou
    // retouché ne serait plus la même onde arrivée plus tard.
    const b = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * 300 * (i / SR)) * 0.5;
    const out = haas(b, { retard: 0.012, retarderLaDroite: true, gainDuRetarde: 1 });
    const retard = Math.round(0.012 * SR);
    const g = out.getChannelData(0);
    const dr = out.getChannelData(1);
    for (let i = retard; i < d.length; i += 11) expect(dr[i], `échantillon ${i}`).toBe(g[i - retard]);
  });

  it("ET LE RETARD EST CELUI QU'ON DEMANDE, mesuré par corrélation croisée", () => {
    // Le décalage se relève sur le son rendu, et non sur le réglage : c'est la seule façon de voir
    // qu'aucun arrondi ne l'a déplacé.
    const b = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const d = b.getChannelData(0);
    let graine = 7;
    for (let i = 0; i < d.length; i++) {
      graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
      d[i] = graine / 4294967296 - 0.5;
    }
    const demande = Math.round(0.008 * SR);
    const out = haas(b, { retard: 0.008, retarderLaDroite: true, gainDuRetarde: 1 });
    const g = out.getChannelData(0);
    const dr = out.getChannelData(1);
    let meilleur = -1;
    let score = -Infinity;
    for (let k = 0; k < Math.round(0.03 * SR); k++) {
      let s = 0;
      for (let i = k; i < d.length; i += 3) s += g[i - k] * dr[i];
      if (s > score) { score = s; meilleur = k; }
    }
    expect(meilleur).toBe(demande);
  });

  it("ET CHANGER DE CÔTÉ ÉCHANGE EXACTEMENT LES DEUX CANAUX", () => {
    const b = claquement(0.2);
    const droite = haas(b, { retard: 0.01, retarderLaDroite: true, gainDuRetarde: 0.8 });
    const gauche = haas(b, { retard: 0.01, retarderLaDroite: false, gainDuRetarde: 0.8 });
    for (let i = 0; i < b.length; i += 7) {
      expect(gauche.getChannelData(0)[i]).toBe(droite.getChannelData(1)[i]);
      expect(gauche.getChannelData(1)[i]).toBe(droite.getChannelData(0)[i]);
    }
  });

  it("ET UNE PRISE STÉRÉO ENTRE PAR SA SOMME, pour que les deux canaux portent la même onde", () => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: 400, sampleRate: SR });
    b.getChannelData(0).fill(0.4);
    b.getChannelData(1).fill(0.2);
    const out = haas(b, { retard: 0, retarderLaDroite: true, gainDuRetarde: 1 });
    expect(out.getChannelData(0)[10]).toBeCloseTo(0.3, 6);
    expect(out.getChannelData(1)[10]).toBeCloseTo(0.3, 6);
  });
});
