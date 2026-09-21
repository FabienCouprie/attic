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
  // `electron/` est inclus depuis qu'un défaut y a survécu faute de test : la
  // boucle d'extraction d'un node .zip écrivait vers une variable jamais
  // déclarée, et le try/catch du gestionnaire IPC transformait la
  // ReferenceError en un { ok: false } silencieux. Le process principal
  // exécute du code au moins aussi délicat que le renderer — protection Zip
  // Slip comprise — il doit être couvert de la même façon.
  // LE DÉLAI EST CELUI D'UNE MACHINE DONT ON NE CHOISIT PAS LA VITESSE. Une partie de cette suite
  // rend vraiment du son — Tone.js hors ligne, Griffin-Lim sur deux secondes de stéréo, des
  // convolutions de réverbération — et ces tests coûtent plusieurs secondes chacun. Tant que la
  // suite était étroite, quinze secondes suffisaient ; à deux cent quatre-vingts fichiers tournant
  // en parallèle, deux d'entre eux ont commencé à expirer par intermittence sur cette machine —
  // et le runner d'intégration continue est plus lent qu'elle. Un échec de délai ne dit alors rien
  // du code, seulement de la charge, et c'est la pire sorte : il fait douter d'un résultat juste.
  // Soixante secondes ne coûtent rien — seuls les tests qui se bloquent VRAIMENT les paient.
  test: { include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'scripts/**/*.test.ts'], testTimeout: 60000 },
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
