import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // Module workers: `new Worker(new URL(...), { type: 'module' })` is bundled as an ES worker.
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
