import {defineConfig} from 'vite';

// Keep the stable React runtime separate from SOMA's growing feature code.
// Rolldown groups preserve normal static imports; no deferred UI ownership reads.
export default defineConfig({
  base: '/static/ui/',
  build: {
    outDir: '../soma/ui/static',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-runtime',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
