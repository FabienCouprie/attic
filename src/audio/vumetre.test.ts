// audio/vumetre.test.ts — Ce qu'une mesure de sonie doit garantir, et que la nôtre ne garantissait
// pas.
//
// LE TEST QUI COMPTE EST CELUI DU SILENCE AJOUTÉ. Ajouter huit secondes de blanc derrière un son ne
// change rien à sa force : c'est même la raison d'être des deux portes de la norme. L'ancienne
// mesure moyennait des décibels et ne gardait rien : le même son, suivi de silence, chutait de
// quarante décibels. Mesuré dans l'application sur un rythme à −24 dBFS de niveau efficace, elle
// annonçait −73 LUFS — un chiffre qui n'était pas imprécis mais faux.
//
// LES ASSERTIONS PORTENT SUR DES RAPPORTS, ET NON SUR DES VALEURS ABSOLUES. La pondération K
// dépend d'une implémentation de biquads dont on ne veut pas figer le dixième de décibel ; en
// revanche, doubler une amplitude DOIT ajouter six décibels, deux canaux identiques DOIVENT en
// ajouter trois, et le silence NE DOIT rien changer. Ces trois-là ne dépendent d'aucun réglage.
import { beforeAll, describe, expect, it } from "vitest";
import { mesurerNiveau } from "./vumetre";

const SR = 44100;

class AudioBufferPolyfill {
  numberOfChannels: number; length: number; sampleRate: number; duration: number;
  private canaux: Float32Array[];
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels;
    this.length = o.length;
    this.sampleRate = o.sampleRate;
    this.duration = o.length / o.sampleRate;
    this.canaux = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number) { return this.canaux[c]; }
}

beforeAll(() => { (globalThis as any).AudioBuffer = AudioBufferPolyfill; });

/** Un tampon construit canal par canal. */
function tampon(...canaux: ((i: number) => number)[]): AudioBuffer {
  const longueur = 0;
  void longueur;
  const n = TAILLE;
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: canaux.length, length: n, sampleRate: SR }) as AudioBuffer;
  for (let c = 0; c < canaux.length; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = canaux[c](i);
  }
  return b;
}

let TAILLE = Math.round(3 * SR);

const sinus = (hz: number, amplitude: number) => (i: number) => amplitude * Math.sin((2 * Math.PI * hz * i) / SR);

/** Le même son, suivi de `silenceSec` secondes de rien. */
function avecSilence(hz: number, amplitude: number, sonSec: number, silenceSec: number): AudioBuffer {
  const n = Math.round((sonSec + silenceSec) * SR);
  const limite = Math.round(sonSec * SR);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR }) as AudioBuffer;
  const d = b.getChannelData(0);
  for (let i = 0; i < limite; i++) d[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  return b;
}

describe("la sonie intégrée", () => {
  it("LE SILENCE AJOUTÉ NE CHANGE PAS LA FORCE D'UN SON — c'est l'objet des deux portes", () => {
    const court = mesurerNiveau(avecSilence(1000, 0.5, 3, 0));
    const long = mesurerNiveau(avecSilence(1000, 0.5, 3, 8));
    expect(Math.abs(long.lufs - court.lufs)).toBeLessThan(0.5);
  });

  it("un son moitié fort, moitié silencieux reste au niveau de sa partie forte", () => {
    const m = mesurerNiveau(avecSilence(1000, 0.5, 3, 3));
    const plein = mesurerNiveau(avecSilence(1000, 0.5, 6, 0));
    expect(Math.abs(m.lufs - plein.lufs)).toBeLessThan(0.5);
  });

  it("DOUBLER L'AMPLITUDE AJOUTE EXACTEMENT SIX DÉCIBELS", () => {
    TAILLE = Math.round(3 * SR);
    const faible = mesurerNiveau(tampon(sinus(1000, 0.1)));
    const fort = mesurerNiveau(tampon(sinus(1000, 0.2)));
    expect(fort.lufs - faible.lufs).toBeCloseTo(6.02, 1);
  });

  it("DEUX CANAUX IDENTIQUES EN AJOUTENT TROIS : la sonie somme les puissances", () => {
    const mono = mesurerNiveau(tampon(sinus(1000, 0.25)));
    const stereo = mesurerNiveau(tampon(sinus(1000, 0.25), sinus(1000, 0.25)));
    expect(stereo.lufs - mono.lufs).toBeCloseTo(3.01, 1);
  });

  it("reste dans le voisinage du niveau efficace sur une sinusoïde à mille hertz", () => {
    // La pondération K vaut à peu près l'unité à cette fréquence : la sonie suit le RMS de près.
    const m = mesurerNiveau(tampon(sinus(1000, 0.5)));
    expect(Math.abs(m.lufs - m.rmsDb)).toBeLessThan(2);
  });

  it("le silence complet ne rend ni NaN ni un niveau inventé", () => {
    const m = mesurerNiveau(tampon(() => 0));
    expect(Number.isFinite(m.lufs)).toBe(true);
    expect(m.lufs).toBeLessThanOrEqual(-100);
    expect(m.plageDynamiqueDb).toBe(0);
  });

  it("un son plus court qu'un bloc ne fait pas lever", () => {
    TAILLE = Math.round(0.1 * SR);
    const m = mesurerNiveau(tampon(sinus(1000, 0.5)));
    expect(Number.isFinite(m.lufs)).toBe(true);
    TAILLE = Math.round(3 * SR);
  });
});

describe("la plage de sonie", () => {
  it("VAUT PRESQUE ZÉRO SUR UN SON QUI NE VARIE PAS", () => {
    expect(mesurerNiveau(tampon(sinus(1000, 0.5))).plageDynamiqueDb).toBeLessThan(1);
  });

  it("UN BLANC NE FAIT PLUS CENT DÉCIBELS DE PLAGE", () => {
    // L'ancien calcul prenait le minimum sur TOUS les blocs, silence compris : une boucle de
    // batterie ordinaire annonçait 103 dB. La porte de la norme écarte ces blocs.
    const m = mesurerNiveau(avecSilence(1000, 0.5, 4, 4));
    expect(m.plageDynamiqueDb).toBeLessThan(10);
  });

  it("mesure l'écart réel entre deux niveaux tenus", () => {
    // Douze secondes : six fortes, six à vingt décibels en dessous. Les blocs de trois secondes
    // de la norme ont alors la place de voir les deux.
    const n = Math.round(12 * SR);
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR }) as AudioBuffer;
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const fort = i < n / 2;
      d[i] = (fort ? 0.5 : 0.05) * Math.sin((2 * Math.PI * 1000 * i) / SR);
    }
    expect(mesurerNiveau(b).plageDynamiqueDb).toBeGreaterThan(15);
    expect(mesurerNiveau(b).plageDynamiqueDb).toBeLessThan(25);
  });
});

describe("ce qui ne dépend pas de la sonie", () => {
  it("la crête et le niveau efficace d'une sinusoïde à moitié", () => {
    TAILLE = Math.round(1 * SR);
    const m = mesurerNiveau(tampon(sinus(1000, 0.5)));
    expect(m.peakDb).toBeCloseTo(-6.02, 1);
    expect(m.rmsDb).toBeCloseTo(-9.03, 1);
    expect(m.crestFactorDb).toBeCloseTo(3.01, 1);
    TAILLE = Math.round(3 * SR);
  });
});
