/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is ONE self-contained docs/index.html (code, styles and fonts inlined)
// plus the logo/icons next to it. Relative paths ('./') mean the same files work:
//  - double-clicked from your PC (file://), and
//  - on GitHub Pages "Deploy from a branch" → main → /docs, at any repository name.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
