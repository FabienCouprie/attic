// audio/modulation-niveau.test.ts — Les niveaux ouverts à une courbe.
//
// LA FAMILLE « NIVEAU » DE `MODULABLES.md`, réduite à deux après que la Réverbération de bruit en
// a été écartée : son cœur travaille sur des trames de 8192 échantillons par sauts de 4096, soit
// une lecture onze fois par seconde, et une courbe y aurait été quantifiée par paliers de 93 ms.
//
// LES DEUX INVARIANTS SONT CEUX DE `modulation-melange.test.ts`, et ils ne changent pas :
//
// 1. SANS COURBE, PAS UN BIT NE BOUGE. Un composant qui tourne déjà dans les graphes de quelqu'un
//    ne s'ouvre qu'à cette condition.
// 2. LA COURBE DOIT COMMANDER VRAIMENT. Un port qui ne change rien serait pire qu'une absence de
//    port.
//
// ET LE MÊME PIÈGE DE FLOTTANT. Un `Float32Array` quantifie ce qu'on y range : les comparaisons au
// bit n'emploient donc que des valeurs que le flottant simple tient EXACTEMENT, c'est-à-dire des
// fractions dyadiques. De même, une vue rendue par `getChannelData` ne survit pas au tampon dont
// elle vient : tout ce qui est gardé ici est une copie possédée.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { poserDansLeCreneau } from "./creneau";
import { versBuffer } from "../plugins/instruments-communs";

const SR = 44100;

function bruit(longueur: number, graine = 5): Float32Array<ArrayBuffer> {
  // L'ARRONDI EST EXPLICITE : `SR / 8` ne tombe pas juste, et un `ArrayBuffer` d'une taille qui
  // n'est pas un multiple de quatre est refusé net là où `new Float32Array(5512.5)` tronquait en
  // silence.
  const n = Math.round(longueur);
  let e = graine >>> 0;
  const x = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
  return x;
}

const tampon = (x: Float32Array<ArrayBuffer>, canaux = 1): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: x.length, sampleRate: SR });
  for (let c = 0; c < canaux; c++) b.copyToChannel(x, c);
  return b;
};

/** Une copie possédée du canal : une vue ne survit pas au tampon natif dont elle vient. */
const canal = (b: AudioBuffer, c = 0): Float32Array => Float32Array.from(b.getChannelData(c));

const memes = (x: Float32Array, y: Float32Array): boolean => {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

const ecart = (x: Float32Array, y: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  return Math.sqrt(s / x.length);
};

/** Une courbe constante, rendue en tableau, comme le fait l'exécuteur. */
const tenue = (valeur: number, n: number) => new Float32Array(n).fill(valeur);

describe("le créneau ouvert à une courbe", () => {
  const fond = tampon(bruit(SR / 2, 3));
  const son = tampon(bruit(SR / 8, 7));
  const instant = 0.1;
  const n = son.length;

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(
      canal(poserDansLeCreneau(fond, son, instant, 0.75)),
      canal(poserDansLeCreneau(fond, son, instant, tenue(0.75, n))),
    )).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND LE FOND SEUL, exactement", () => {
    expect(memes(canal(poserDansLeCreneau(fond, son, instant, tenue(0, n))), canal(fond))).toBe(true);
  });

  it("LA COURBE SUIT LE SON POSÉ, NON LA SORTIE", () => {
    // LE CAS QUI SÉPARE LES DEUX LECTURES. Une courbe muette sur sa première moitié ne doit rien
    // poser pendant la première moitié DU SON, c'est-à-dire à partir de l'instant du créneau. Lue
    // sur la sortie, elle se serait tue pendant la première moitié du FOND, donc bien avant, et le
    // son aurait été posé en entier.
    const rampe = new Float32Array(n);
    for (let i = 0; i < n; i++) rampe[i] = i < n / 2 ? 0 : 1;
    const y = canal(poserDansLeCreneau(fond, son, instant, rampe));
    const sec = canal(fond);
    const depart = Math.round(instant * SR);
    // La première moitié du son posé n'a rien ajouté : le fond y est intact.
    for (let i = 0; i < n / 2; i++) {
      expect(y[depart + i], `échantillon ${i} de la première moitié`).toBe(sec[depart + i]);
    }
    // La seconde a bien ajouté quelque chose.
    let bouge = 0;
    for (let i = Math.ceil(n / 2); i < n; i++) if (y[depart + i] !== sec[depart + i]) bouge++;
    expect(bouge, "la seconde moitié n'a rien posé").toBeGreaterThan(n / 4);
  });

  it("et la courbe commande vraiment, ce qu'un port inerte ne ferait pas", () => {
    const bas = canal(poserDansLeCreneau(fond, son, instant, tenue(0, n)));
    const haut = canal(poserDansLeCreneau(fond, son, instant, tenue(2, n)));
    expect(ecart(bas, haut)).toBeGreaterThan(0.01);
  });
});

describe("le volume d'un synthé ouvert à une courbe", () => {
  // `versBuffer` est le socle de tous les synthés du catalogue : l'ouvrir les sert tous.
  const x = bruit(SR / 4, 11);

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    // 50 et non 80 : la comparaison au bit demande une valeur que le flottant simple tient
    // exactement, et 50/100 vaut un demi.
    expect(memes(canal(versBuffer(x, 50)), canal(versBuffer(x, tenue(50, x.length))))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND LE SILENCE, exactement", () => {
    expect(canal(versBuffer(x, tenue(0, x.length))).every((v) => v === 0)).toBe(true);
  });

  it("une courbe qui monte de zéro à un ne rend NI l'un NI l'autre", () => {
    // Le cas qui attrape une lecture faite une seule fois, hors de la boucle.
    const rampe = new Float32Array(x.length);
    for (let i = 0; i < rampe.length; i++) rampe[i] = (100 * i) / rampe.length;
    const y = canal(versBuffer(x, rampe));
    expect(memes(y, canal(versBuffer(x, 0)))).toBe(false);
    expect(memes(y, canal(versBuffer(x, 100)))).toBe(false);
  });

  it("et les deux canaux restent identiques, le socle rendant un mono élargi", () => {
    const b = versBuffer(x, tenue(60, x.length));
    expect(memes(canal(b, 0), canal(b, 1))).toBe(true);
  });
});
