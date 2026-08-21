// audio/bruit.ts — Générateurs de bruit (blanc / rose / brownien).
// Blanc = spectre plat ; Rose = −3 dB/octave (Paul Kellet) ; Brownien = −6 dB/
// octave (marche aléatoire à fuite). Chaque canal a un bruit indépendant (stéréo).
export function genererBruit(
  type: string, dureeSec: number, volume: number,
  // Source du hasard. Le nœud passe le générateur issu de son paramètre
  // « Graine » : c'est ce qui permet de rejouer exactement le même bruit, et ce
  // qui rend les tests de ce module reproductibles. Le repli sur `Math.random`
  // vaut pour un appelant qui n'a pas de graine à offrir.
  hasard: () => number = Math.random,
): AudioBuffer {
  const sr = 44100;
  const len = Math.max(1, Math.floor(dureeSec * sr));
  const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, volume / 100));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (type === "Rose") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = hasard() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
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
