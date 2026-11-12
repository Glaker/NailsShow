import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas en navegador del portal de clientes (P1 de docs/PROMPT_PEDIDOS_HADA.md).
 * Vite corre contra un Supabase falso: la prueba intercepta la red y no toca la
 * base alojada.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Con 4 navegadores la máquina de desarrollo se satura y los casos vencen por tiempo.
  workers: 2,
  reporter: 'list',
  timeout: 180_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
  webServer: {
    // Empaquetado, no el servidor de desarrollo: con varios navegadores a la vez
    // los miles de módulos sueltos de Vite no llegan a cargar.
    command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 5174 --strictPort',
    timeout: 300_000,
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://falso.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'clave-falsa',
    },
  },
});
