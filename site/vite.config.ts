import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import simulations, { site } from '../simulations.config.mjs';
import { renderCards } from './render.ts';

/**
 * Fills the homepage from simulations.config.mjs: the cards, the site's address and the year.
 * It runs before Vite reads the page, so the cards' posters and videos are bundled like any
 * other asset (with a content hash in their names).
 */
function fromConfig(): Plugin {
  return {
    name: 'fabone-from-config',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('<!-- simulations -->', renderCards(simulations))
          .replaceAll('%SITE_URL%', site.url)
          .replaceAll('%YEAR%', String(new Date().getFullYear())),
    },
  };
}

// The FAB / ONE homepage and its 404 page. `npm run build` puts the simulations next to them.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [fromConfig()],
  server: { host: '127.0.0.1', port: 5170 },
  preview: { host: '127.0.0.1', port: 4170 },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // keep the preview video and its poster as files, whatever their size
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        404: fileURLToPath(new URL('404.html', import.meta.url)),
      },
    },
  },
});
