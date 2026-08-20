// audio/index.ts — Baril public du domaine audio. Ré-exporte les modules DSP
// (issus du découpage de l'ancien monolithe) + fft + soundfont. L'API publique
// est inchangée : les consommateurs importent toujours depuis "../audio".
export { fft } from "./fft";
export { analyserSF2, chercherZonesInstrument } from "./soundfont";
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
export * from "./accords-sequencer";
export * from "./vumetre";
export * from "./reservoir";
export * from "./multi-reservoir";
export * from "./groove-box";
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
export * from "./palette-harmonique";
export * from "./dessin-sonore";
export * from "./couleur-rgb";
export * from "./spectre-visible";
export * from "./color-looper";
export * from "./camelot";
export * from "./voice-changer";
export * from "./random-slice";
export * from "./griffin-lim";
export * from "./emotion";

// PAS de réexport de `registre` ici : `adaptateur.ts` est la racine de
// composition, il importe TOUTES les fiches de plugins. Le réexporter depuis ce
// baril créait un cycle — un plugin important « ../audio » (comme entrees.ts)
// retirait transitivement tout le registre de plugins :
//   plugins/index → entrees → audio/index → adaptateur → plugins/index
// Le chargement à froid s'en sortait par chance dans l'ordre d'évaluation, mais
// le rechargement à chaud de Vite réévalue un sous-ensemble et tombait sur
// « Cannot access 'f_entrees' before initialization ».
// Les consommateurs importent `registre` directement depuis "audio/adaptateur".
