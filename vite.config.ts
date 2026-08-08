import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { audioBuildPlugins, audioOptimizeDeps, audioResolveAliases } from './src/audio/build-plugins'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Numéro de version affiché dans la barre d'outils (BarreOutils.tsx) : lu ici
// depuis package.json au build/dev, pas codé en dur côté renderer — sinon il
// se fige à la valeur écrite au moment où quelqu'un l'a tapée à la main et ne
// suit plus les versions publiées.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

export default defineConfig({
  base: './',
  resolve: {
    alias: audioResolveAliases,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react() as any, ...audioBuildPlugins, wasmMimeTypePlugin()],
  build: { outDir: 'dist', emptyOutDir: true },
  optimizeDeps: audioOptimizeDeps,
  ssr: { noExternal: ['tone'] },
  test: { include: ['src/**/*.test.ts'], testTimeout: 15000 },
})

// Vite dev server does not always serve .wasm files with the correct MIME type,
// which breaks WebAssembly streaming compilation in workers (piper-tts-web, etc.).
function wasmMimeTypePlugin() {
  return {
    name: 'wasm-mime-type',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const urlPath = (req.url ?? '').split('?')[0];
        if (urlPath.endsWith('.wasm')) {
          const originalSetHeader = res.setHeader.bind(res);
          res.setHeader = (name: string, value: any) => {
            if (name.toLowerCase() === 'content-type') {
              return originalSetHeader(name, 'application/wasm');
            }
            return originalSetHeader(name, value);
          };
        }
        next();
      });
    },
  };
}
