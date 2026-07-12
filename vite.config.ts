import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react() as any, {
    name: 'exclude-oonx-from-build',
    apply: 'build',
    generateBundle() {
      // Les modèles .onnx sont livrés via extraResources (electron-builder),
      // pas dans dist/ — on les retire du bundle pour éviter de dupliquer ~450 MB.
    },
    writeBundle(_opts, bundle) {
      // Vite copie public/ → dist/ automatiquement ; on supprime oonx/ après.
      const fs = require('fs');
      const path = require('path');
      const oonxDir = path.resolve('dist', 'oonx');
      if (fs.existsSync(oonxDir)) {
        for (const f of fs.readdirSync(oonxDir)) {
          if (f.endsWith('.onnx')) fs.unlinkSync(path.join(oonxDir, f));
        }
      }
    },
  }],
  build: { outDir: 'dist', emptyOutDir: true },
  optimizeDeps: { exclude: ['_audio_backup'] },
  test: { include: ['src/**/*.test.ts'] },
})
