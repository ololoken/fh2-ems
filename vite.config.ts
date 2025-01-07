import { defineConfig } from 'vite'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react(), commonjs()],
  envPrefix: 'FH2',
  base: '/fh2-ems',
  clearScreen: false,
  build: {
    outDir: './dist/',
    target: 'esnext',
    minify: 'esbuild',
    reportCompressedSize: true,
  },
});
