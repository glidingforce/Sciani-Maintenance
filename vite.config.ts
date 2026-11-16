/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const emptyAddon = fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url));

// The build is ONE self-contained docs/index.html (code, styles and fonts inlined)
// plus the logo/icons next to it. Relative paths ('./') mean the same files work:
//  - double-clicked from your PC (file://), and
//  - on GitHub Pages "Deploy from a branch" → main → /docs, at any repository name.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    // jsPDF's HTML-rendering add-ons are not used (reports are drawn directly);
    // stubbing them keeps the single-file app small.
    alias: {
      html2canvas: emptyAddon,
      dompurify: emptyAddon,
      canvg: emptyAddon,
    },
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
