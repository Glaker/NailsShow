import { useEffect, useState } from 'react';
import { LOGO } from './Marca';

const CLAVE = 'nailshow-intro-vista';
const DURACION = 1900;

const yaVista = () => {
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
};
const marcarVista = () => {
  try {
    sessionStorage.setItem(CLAVE, '1');
  } catch {
    /* sin almacenamiento: se vuelve a ver, no pasa nada */
  }
};
const reducido = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Entrada a la aplicación (pedido del 2026-10-01): el logo aparece desde un
 * desenfoque, un anillo blanco lo dibuja alrededor y todo
 * se abre hacia la pantalla. Una vez por sesión del navegador, menos de dos
 * segundos, se saltea tocando o con Esc, y no se muestra con reducción de
 * movimiento. Es decorativa: no tapa ni retrasa ningún dato.
 */
export function IntroMarca() {
  const [visible, setVisible] = useState(() => !yaVista() && !reducido());

  useEffect(() => {
    if (!visible) return;
    marcarVista();
    const t = setTimeout(() => setVisible(false), DURACION);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setVisible(false);
    window.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      className="intro-marca no-imprimir"
      role="presentation"
      onClick={() => setVisible(false)}
    >
      <div className="intro-escena">
        <svg className="intro-anillo" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="94" pathLength="1" />
        </svg>
        <div className="intro-disco">
          <img src={LOGO} alt="Nail Show" />
        </div>
      </div>
    </div>
  );
}
