import { useState } from 'react';

/** Frasco de esmalte en SVG: la marca anterior, que queda de respaldo si el logo no carga. */
function Frasco({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Tapa */}
      <rect x="16" y="3" width="8" height="9" rx="2" fill="#e5e5ea" />
      {/* Cuello */}
      <rect x="17.5" y="11" width="5" height="4" fill="#c7c7cc" />
      {/* Cuerpo */}
      <path
        d="M12 19a5 5 0 0 1 3.2-4.66l.8-.32V14h8v.02l.8.32A5 5 0 0 1 28 19v13a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19Z"
        fill="#0071e3"
      />
      {/* Brillo */}
      <path
        d="M16 20.5c0-1.6.9-3 2.2-3.7v13.9c-1.3-.7-2.2-2-2.2-3.6v-6.6Z"
        fill="#fff"
        fillOpacity="0.25"
      />
    </svg>
  );
}

/** Logo de Nail Show (public/marca-nailshow.png). */
export const LOGO = '/marca-nailshow.png';

/**
 * Marca del sistema: el logo de Nail Show en un círculo blanco, que se lee
 * igual sobre la barra oscura y sobre fondo claro. Si el archivo no está, queda
 * el frasco.
 */
export function Marca({ size = 34 }: { size?: number }) {
  const [falla, setFalla] = useState(false);
  if (falla) return <Frasco size={size} />;
  return (
    <span
      className="marca"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        flexShrink: 0,
      }}
    >
      <img
        src={LOGO}
        alt=""
        width={size - 4}
        height={size - 4}
        style={{ display: 'block', objectFit: 'contain' }}
        onError={() => setFalla(true)}
      />
    </span>
  );
}
