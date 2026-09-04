import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Hojas de estilo de Mantine. El orden importa: `@mantine/core` primero, porque
 * los demás paquetes dependen de sus variables CSS.
 */
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

/* Estilos propios al final: fondo de página, movimiento e impresión del rótulo. */
import './app/global.css';

import { App } from './app/App';

const contenedor = document.getElementById('root');
if (!contenedor) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
