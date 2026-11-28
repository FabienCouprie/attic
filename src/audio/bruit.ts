// audio/bruit.ts — Générateurs de bruit (blanc / rose / brownien).
// Blanc = spectre plat ; Rose = −3 dB/octave (Paul Kellet) ; Brownien = −6 dB/
// octave (marche aléatoire à fuite). Chaque canal a un bruit indépendant (stéréo).
import { bruitRoseKellet } from "../core/bruit-rose";
import { frequenceDeTravail } from "./frequence-de-travail";

export function genererBruit(
  type: string, dureeSec: number, volume: number,
  // Source du hasard. Le nœud passe le générateur issu de son paramètre
  // « Graine » : c'est ce qui permet de rejouer exactement le même bruit, et ce
  // qui rend les tests de ce module reproductibles. Le repli sur `Math.random`
  // vaut pour un appelant qui n'a pas de graine à offrir.
  hasard: () => number = Math.random,
): AudioBuffer {
  const sr = frequenceDeTravail();
  const len = Math.max(1, Math.floor(dureeSec * sr));
  const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (type === "Rose") {
      d.set(bruitRoseKellet(len, () => hasard() * 2 - 1));
    } else if (type === "Brownien") {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = hasard() * 2 - 1;
        last = (last + 0.02 * w) / 1.02; // intégration à fuite (évite la dérive)
        d[i] = last;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = hasard() * 2 - 1; // Blanc
    }

    // Normalisation au pic (loudness homogène entre types, sans écrêtage) × volume.
    let pic = 1e-9;
    for (let i = 0; i < len; i++) { const v = Math.abs(d[i]); if (v > pic) pic = v; }
    const g = (0.9 / pic) * vol;
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}
