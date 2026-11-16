/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /<repository-name>/.
// The deploy workflow sets BASE_PATH; locally it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { msal: ['@azure/msal-browser'], supabase: ['@supabase/supabase-js'] } },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
