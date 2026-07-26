// src/audio/build-plugins.ts — Plugins Vite spécifiques au domaine audio.
// Ces plugins n'ont pas de sens pour un autre domaine ; ils sont isolés ici pour
// garder vite.config.ts agnostique du domaine.

import fs from "fs";
import path from "path";

// Alias de résolution spécifique au domaine audio.
export const audioResolveAliases: any[] = [
  // Le package.json de @magenta/music a un champ "exports" pointant vers
  // ./index.js (inexistant). On force l'entrée ESM valide, mais seulement
  // pour l'import exact — pas pour les sous-chemins esm/... utilisés dans le worker.
  { find: /^@magenta\/music$/, replacement: path.resolve(process.cwd(), 'node_modules/@magenta/music/esm/index.js') },
];

export const audioBuildPlugins: any[] = [
  {
    name: "exclude-oonx-from-build",
    apply: "build",
    generateBundle() {
      // Les modèles .onnx sont livrés via extraResources (electron-builder),
      // pas dans dist/ — on les retire du bundle pour éviter de dupliquer ~450 MB.
    },
    writeBundle(_opts: any, _bundle: any) {
      const oonxDir = path.resolve("dist", "oonx");
      if (fs.existsSync(oonxDir)) {
        for (const f of fs.readdirSync(oonxDir)) {
          if (f.endsWith(".onnx")) fs.unlinkSync(path.join(oonxDir, f));
        }
      }
    },
  },
];

export const audioOptimizeDeps: any = {
  // _audio_backup ne doit pas être optimisé.
  // Les dépendances CJS ci-dessous sont utilisées par @magenta/music dans le
  // thread principal (notamment par le nœud DDSP) et dans le worker ; on les
  // pré-bundl pour éviter des erreurs de module CJS dans le worker/dev.
  exclude: ["_audio_backup", "piper-tts-web"],
  include: [
    "@tensorflow/tfjs",
    "@tensorflow/tfjs-core",
    "seedrandom",
    "ndarray",
    "ndarray-resample",
    "midi-file",
    "protobufjs",
    "long",
    "tesseract.js",
  ],
};
