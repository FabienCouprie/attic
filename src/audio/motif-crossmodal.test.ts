// audio/motif-crossmodal.test.ts — Un motif fabriqué pour un point s'y mesure-t-il vraiment ?
//
// C'EST LE SEUL TEST QUI COMPTE ICI, et il est exigeant : on demande un point, on synthétise le
// motif, on le remesure avec `gout.ts` — qui ne sait rien de la demande — et l'on vérifie que le
// point mesuré est celui qu'on visait. Un générateur qui « sonne aigu » sans que le registre mesuré
// monte ne servirait à rien, puisque tout l'intérêt de la série est de pouvoir vérifier.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  attaquesDepuisVitesse, dbDepuisIntensite, hertzDepuisHauteur, motifDepuisPoint, octetsMidi, viserNiveau,
} from "./motif-crossmodal";
import { mesurer, type DimensionsGout } from "./gout";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;
const milieu: DimensionsGout = { hauteur: 0.5, articulation: 0.5, vitesse: 0.5, consonance: 0.5, intensite: 0.5 };

/**
 * Rend un motif en additionnant des notes, chacune une somme de huit harmoniques décroissantes.
 *
 * Volontairement plus simple que le rendu du nœud, qui passe par le synthétiseur de l'application :
 * ce qui se vérifie ici est le MOTIF — ses hauteurs, ses instants, ses durées —, non le timbre. Un
 * timbre harmonique suffit pour que le registre, la vitesse et l'articulation se mesurent.
 */
function rendre(notes: { note: number; velocite: number; debut: number; fin: number }[], duree: number): AudioBuffer {
  const n = Math.round(duree * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = b.getChannelData(0);
  for (const note of notes) {
    const f = 440 * Math.pow(2, (note.note - 69) / 12);
    const i0 = Math.round(note.debut * SR), i1 = Math.min(n, Math.round(note.fin * SR));
    const duree = (i1 - i0) / SR;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR;
      // Attaque de 5 ms puis décroissance douce : de quoi faire une attaque franche et détectable.
      const env = Math.min(1, t / 0.005) * Math.exp(-t / Math.max(0.05, duree));
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
      x[i] += (v / 2.7) * env * (note.velocite / 127) * 0.3;
    }
  }
  let crete = 0;
  for (let i = 0; i < n; i++) crete = Math.max(crete, Math.abs(x[i]));
  if (crete > 0.95) for (let i = 0; i < n; i++) x[i] *= 0.95 / crete;
  return b;
}

describe("les inversions de gout.ts", () => {
  it("le registre en hertz défait la normalisation, terme pour terme", () => {
    expect(hertzDepuisHauteur(0)).toBeCloseTo(55, 6);
    expect(hertzDepuisHauteur(1)).toBeCloseTo(1760, 6);
    // Le milieu de l'échelle est à deux octaves et demie de 55 Hz.
    expect(hertzDepuisHauteur(0.5)).toBeCloseTo(55 * Math.pow(2, 2.5), 6);
    // Et l'aller-retour revient au même nombre, ce qui est tout ce qu'on demande à une inversion.
    for (const h of [0.1, 0.35, 0.6, 0.9]) {
      expect(Math.log2(hertzDepuisHauteur(h) / 55) / 5).toBeCloseTo(h, 10);
    }
  });

  it("la vitesse en attaques par seconde, et l'intensité en dB, aussi", () => {
    expect(attaquesDepuisVitesse(0.25)).toBeCloseTo(1, 6); // une attaque par seconde
    expect(attaquesDepuisVitesse(0.75)).toBeCloseTo(4, 6);
    for (const v of [0.2, 0.5, 0.85]) {
      expect((Math.log2(attaquesDepuisVitesse(v)) + 1) / 4).toBeCloseTo(v, 10);
    }
    expect(dbDepuisIntensite(0)).toBeCloseTo(-40, 6);
    expect(dbDepuisIntensite(1)).toBeCloseTo(0, 6);
    for (const i of [0.3, 0.6]) expect((dbDepuisIntensite(i) + 40) / 40).toBeCloseTo(i, 10);
  });
});

describe("motifDepuisPoint", () => {
  const hasard = () => creerAleatoire(7)();

  it("deux voix simultanées, parce que la rugosité ne naît que de notes qui sonnent ensemble", () => {
    const m = motifDepuisPoint(milieu, { duree: 4, hasard: creerAleatoire(7) });
    expect(m.notes.length).toBeGreaterThan(1);
    // Chaque instant d'attaque porte autant de notes que le motif a de voix.
    const paires = new Map<number, number>();
    for (const n of m.notes) paires.set(n.debut, (paires.get(n.debut) ?? 0) + 1);
    expect([...paires.values()].every((c) => c === m.voix.length)).toBe(true);
  });

  it("les voix simultanées suivent la consonance visée", () => {
    const doux = motifDepuisPoint({ ...milieu, consonance: 0.95 }, { duree: 2, hasard: creerAleatoire(1) });
    expect(doux.voix).toEqual([0, 7]); // la quinte, et non l'octave : voir le commentaire du module
    const apre = motifDepuisPoint({ ...milieu, consonance: 0.05 }, { duree: 2, hasard: creerAleatoire(1) });
    // L'amas contient des demi-tons voisins, seuls à produire une rugosité mesurable.
    expect(apre.voix).toContain(1);
    expect(apre.voix.length).toBeGreaterThan(doux.voix.length);
  });

  it("le nombre d'attaques suit la vitesse visée", () => {
    const lent = motifDepuisPoint({ ...milieu, vitesse: 0.25 }, { duree: 8, hasard: creerAleatoire(3) });
    const vif = motifDepuisPoint({ ...milieu, vitesse: 0.75 }, { duree: 8, hasard: creerAleatoire(3) });
    expect(new Set(lent.notes.map((n) => n.debut)).size).toBe(8);  // une par seconde
    expect(new Set(vif.notes.map((n) => n.debut)).size).toBe(32);  // quatre par seconde
  });

  it("à graine égale, le même motif ; à graine différente, un autre", () => {
    const a = motifDepuisPoint(milieu, { duree: 4, hasard: creerAleatoire(11) });
    const b = motifDepuisPoint(milieu, { duree: 4, hasard: creerAleatoire(11) });
    const c = motifDepuisPoint(milieu, { duree: 4, hasard: creerAleatoire(12) });
    expect(a.notes.map((n) => n.note)).toEqual(b.notes.map((n) => n.note));
    expect(a.notes.map((n) => n.note)).not.toEqual(c.notes.map((n) => n.note));
  });

  it("aucune note ne sort du clavier, ni ne dure zéro", () => {
    for (const h of [0, 0.5, 1]) {
      const m = motifDepuisPoint({ ...milieu, hauteur: h }, { duree: 3, hasard: creerAleatoire(5) });
      for (const n of m.notes) {
        expect(n.note).toBeGreaterThanOrEqual(21);
        expect(n.note).toBeLessThanOrEqual(108);
        expect(n.fin).toBeGreaterThan(n.debut);
        expect(n.fin).toBeLessThanOrEqual(3 + 1e-9);
      }
    }
  });

  it("écrit un MIDI lisible, avec son instrument dedans", () => {
    const m = motifDepuisPoint(milieu, { duree: 2, hasard, programme: 42 });
    const octets = octetsMidi(m.notes, m.tempo, m.programme);
    expect(octets.length).toBeGreaterThan(20);
    expect([...octets.slice(0, 4)]).toEqual([0x4d, 0x54, 0x68, 0x64]); // « MThd »
  });
});

describe("viserNiveau", () => {
  const bruit = () => {
    const b = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const x = b.getChannelData(0), a = creerAleatoire(9);
    for (let i = 0; i < x.length; i++) x[i] = (a() * 2 - 1) * 0.1;
    return b;
  };

  it("amène le niveau efficace là où on le demande", () => {
    expect(mesurer(viserNiveau(bruit(), -20)).db).toBeCloseTo(-20, 1);
    expect(mesurer(viserNiveau(bruit(), -6)).db).toBeCloseTo(-6, 1);
  });

  it("n'écrête jamais, même si le niveau demandé l'exigerait", () => {
    const y = viserNiveau(bruit(), 12); // impossible sans dépasser la pleine échelle
    let crete = 0;
    for (const v of y.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThanOrEqual(1);
  });
});

describe("l'aller-retour : générer un point, puis le remesurer", () => {
  /** Le point mesuré sur le rendu du motif, par le nœud d'analyse et non par le générateur. */
  const mesurerLe = (cible: DimensionsGout, duree = 6, graine = 4) => {
    const m = motifDepuisPoint(cible, { duree, hasard: creerAleatoire(graine) });
    return { mesure: mesurer(viserNiveau(rendre(m.notes, duree), dbDepuisIntensite(cible.intensite))), motif: m };
  };

  it("un point aigu se mesure plus aigu qu'un point grave", () => {
    const grave = mesurerLe({ ...milieu, hauteur: 0.15 });
    const aigu = mesurerLe({ ...milieu, hauteur: 0.85 });
    expect(aigu.mesure.dimensions.hauteur).toBeGreaterThan(grave.mesure.dimensions.hauteur + 0.3);
    // Et le registre mesuré tombe près de celui qu'on visait, à un demi-ton d'octave près.
    expect(aigu.mesure.dimensions.hauteur).toBeCloseTo(0.85, 1);
    expect(grave.mesure.dimensions.hauteur).toBeCloseTo(0.15, 1);
  });

  it("un point rapide se mesure plus rapide qu'un point lent", () => {
    const lent = mesurerLe({ ...milieu, vitesse: 0.3 });
    const vif = mesurerLe({ ...milieu, vitesse: 0.8 });
    expect(vif.mesure.attaques).toBeGreaterThan(lent.mesure.attaques * 2);
    expect(vif.mesure.dimensions.vitesse).toBeGreaterThan(lent.mesure.dimensions.vitesse + 0.2);
  });

  it("un point piqué se mesure moins lié qu'un point lié", () => {
    const pique = mesurerLe({ ...milieu, articulation: 0.1, vitesse: 0.5 });
    const lie = mesurerLe({ ...milieu, articulation: 0.95, vitesse: 0.5 });
    expect(lie.mesure.dimensions.articulation).toBeGreaterThan(pique.mesure.dimensions.articulation + 0.2);
  });

  it("un point âpre se mesure plus rugueux qu'un point consonant", () => {
    const doux = mesurerLe({ ...milieu, consonance: 0.95 });
    const apre = mesurerLe({ ...milieu, consonance: 0.05 });
    expect(apre.mesure.rugosite).toBeGreaterThan(doux.mesure.rugosite);
  });

  it("l'intensité visée est atteinte, celle-là exactement", () => {
    for (const i of [0.25, 0.5]) {
      expect(mesurerLe({ ...milieu, intensite: i }).mesure.dimensions.intensite).toBeCloseTo(i, 1);
    }
  });

  it("mais un motif très crête n'atteint pas les intensités fortes, et ne les force pas", () => {
    // Un motif fait de notes qui décroissent a une crête bien au-dessus de son niveau efficace :
    // demander −9 dB de niveau efficace exigerait de dépasser la pleine échelle. `viserNiveau`
    // s'arrête alors à ce que la crête permet plutôt que d'écrêter, si bien que l'intensité
    // mesurée reste EN DESSOUS de celle qu'on visait. C'est un manque assumé, pas une erreur, et
    // les nœuds l'annoncent en donnant le point visé à côté du point mesuré.
    const fort = mesurerLe({ ...milieu, intensite: 0.9 });
    expect(fort.mesure.dimensions.intensite).toBeLessThan(0.9);
    // Ce qui reste vrai : plus fort demandé, plus fort obtenu, et jamais d'écrêtage.
    expect(fort.mesure.dimensions.intensite).toBeGreaterThan(mesurerLe({ ...milieu, intensite: 0.3 }).mesure.dimensions.intensite);
    let crete = 0;
    const son = viserNiveau(rendre(motifDepuisPoint({ ...milieu, intensite: 0.9 }, { duree: 6, hasard: creerAleatoire(4) }).notes, 6), dbDepuisIntensite(0.9));
    for (const v of son.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBeLessThanOrEqual(1);
  });
});
