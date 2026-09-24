/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Las Edge Functions separan su lógica pura en supabase/functions/_shared
    // para poder probarla acá, sin Deno ni red.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'supabase/functions/_shared/**/*.{test,spec}.ts',
    ],
  },
});
