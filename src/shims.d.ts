// Déclarations d'ambiance pour les modules sans types fournis.
declare module "lamejs";
declare module "lamejs/src/js/*";
declare module "soundtouchjs";
declare module "resonance-audio";

// Injecté par vite.config.ts (define) depuis la version de package.json.
declare const __APP_VERSION__: string;

// Verovio : le module WebAssembly et son enveloppe ESM n apportent pas de types.
declare module "verovio/wasm";
declare module "verovio/esm";
