// audio/index.ts — Baril public du domaine audio. Ré-exporte les modules DSP
// (issus du découpage de l'ancien monolithe) + fft + soundfont. L'API publique
// est inchangée : les consommateurs importent toujours depuis "../audio".
export { fft } from "./fft";
export { analyserSF2, chercherZoneInstrument, chercherZonesInstrument } from "./soundfont";
export type { StructureSF2, InstrumentSF2, ZoneInstrument, EchantillonSF2, PresetSF2, PresetZone } from "./soundfont";

export * from "./commun";
export * from "./io";
export * from "./effets-temporel";
export * from "./effets-dynamique";
export * from "./effets-spectral";
export * from "./effets-montage";
export * from "./generation";
export * from "./midi";
export * from "./analyse";
export * from "./batterie";
export * from "./enveloppe";
export * from "./bruit";
export * from "./convolution";
export * from "./melodie";
export * from "./couleurs";
export * from "./accords";
export * from "./vumetre";
export * from "./reservoir";
export * from "./evolution";
export * from "./multi-reservoir";
export * from "./graphe-embarque";
export * from "./formants";
export * from "./math-formules";
export * from "./tone-synths";
export * from "./attracteurs";
export * from "./mandelbrot";
export * from "./koch";
export * from "./reverb-fractal";
export * from "./spectrogramme-fractal";
export * from "./pixeltone";
export * from "./voice-changer";
export * from "./random-slice";

export { registre } from "./adaptateur";
