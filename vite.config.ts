import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { audioBuildPlugins, audioOptimizeDeps, audioResolveAliases } from './src/audio/build-plugins'

export default defineConfig({
  base: './',
  resolve: {
    alias: audioResolveAliases,
  },
  plugins: [react() as any, ...audioBuildPlugins],
  build: { outDir: 'dist', emptyOutDir: true },
  optimizeDeps: audioOptimizeDeps,
  ssr: { noExternal: ['tone'] },
  test: { include: ['src/**/*.test.ts'], testTimeout: 15000 },
})
