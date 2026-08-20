// audio/effets-montage.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { extraireZone } from "./effets-montage";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
}

beforeAll(() => { (globalThis as any).AudioBuffer = AudioBufferPolyfill; });

const SR = 44100;

// Signal constant à 1 : n'importe quel écart à 1 dans le résultat vient donc
// exclusivement du fondu, ce qui rend l'assertion sans ambiguïté.
function constant(dureeS: number, valeur = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.getChannelData(0).fill(valeur);
  return b;
}

describe("extraireZone — paramètre Fondu", () => {
  it("sans fondu, l'extrait est une copie brute (bords à pleine amplitude)", () => {
    const out = extraireZone(constant(2), 0.5, 1, 0);
    const d = out.getChannelData(0);
    expect(d[0]).toBe(1);
    expect(d[d.length - 1]).toBe(1);
  });

  // C'est le cœur du bug : le paramètre existait dans l'interface mais n'était
  // ni lu par le nœud, ni accepté par extraireZone — il ne changeait rien.
  it("avec fondu, les bords sont atténués et le milieu reste intact", () => {
    const fonduMs = 10;
    const out = extraireZone(constant(2), 0.5, 1, fonduMs);
    const d = out.getChannelData(0);
    const milieu = Math.floor(d.length / 2);
    expect(d[0]).toBe(0);                       // début du fondu d'entrée
    expect(d[d.length - 1]).toBe(0);            // fin du fondu de sortie
    expect(d[milieu]).toBe(1);                  // partie centrale non touchée
    // Progression monotone sur la rampe d'entrée.
    const n = Math.floor((fonduMs / 1000) * SR);
    expect(d[Math.floor(n / 2)]).toBeGreaterThan(0);
    expect(d[Math.floor(n / 2)]).toBeLessThan(1);
    expect(d[n]).toBe(1);                       // rampe terminée
  });

  it("un fondu plus long produit une atténuation plus étendue", () => {
    const court = extraireZone(constant(2), 0.5, 1, 5).getChannelData(0);
    const long = extraireZone(constant(2), 0.5, 1, 50).getChannelData(0);
    const sonde = Math.floor((20 / 1000) * SR);   // 20 ms après le début
    expect(court[sonde]).toBe(1);                 // fondu de 5 ms déjà terminé
    expect(long[sonde]).toBeLessThan(1);          // fondu de 50 ms encore en cours
  });

  // Garde-fou : sur une zone plus courte que 2× le fondu demandé, les deux
  // rampes se chevaucheraient et le signal pourrait s'annuler entièrement.
  it("le fondu est plafonné à la moitié de l'extrait", () => {
    const out = extraireZone(constant(2), 0, 0.01, 100);   // 10 ms extraits, 100 ms de fondu
    const d = out.getChannelData(0);
    const pic = Math.max(...Array.from(d));
    expect(pic).toBeGreaterThan(0);        // le signal n'est pas annulé
    expect(d.length).toBe(Math.floor(0.01 * SR));
  });

  it("applique le fondu sur tous les canaux", () => {
    const n = Math.floor(SR * 2);
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
    b.getChannelData(0).fill(1);
    b.getChannelData(1).fill(1);
    const out = extraireZone(b, 0.5, 1, 10);
    expect(out.getChannelData(0)[0]).toBe(0);
    expect(out.getChannelData(1)[0]).toBe(0);
  });
});
