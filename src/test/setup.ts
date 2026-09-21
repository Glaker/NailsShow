// Configuración global de Vitest para los tests de interfaz.
// Los matchers de jest-dom se registran una sola vez por corrida.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
