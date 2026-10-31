import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset URLs, so the build works wherever it is hosted — notably a GitHub Pages
  // project site, which lives under /<repo>/ rather than at the domain root.
  base: './',
  plugins: [tailwindcss()],
  // Module workers: `new Worker(new URL(...), { type: 'module' })` is bundled as an ES worker.
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
