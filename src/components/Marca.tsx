/**
 * Marca del sistema.
 *
 * Un frasco de esmalte dibujado en SVG. Es la única concesión decorativa del
 * sistema y está acá por una razón práctica: la aplicación se abre en una
 * tablet compartida donde también hay otras, y la marca es lo que hace que se
 * reconozca de un vistazo cuál es.
 */
export function Marca({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="marca-frasco" x1="8" y1="14" x2="32" y2="36">
          <stop offset="0%" stopColor="#d45a88" />
          <stop offset="100%" stopColor="#8b479f" />
        </linearGradient>
      </defs>
      {/* Tapa */}
      <rect x="16" y="3" width="8" height="9" rx="2" fill="#e8dcec" />
      {/* Cuello */}
      <rect x="17.5" y="11" width="5" height="4" fill="#c9b3d1" />
      {/* Cuerpo */}
      <path
        d="M12 19a5 5 0 0 1 3.2-4.66l.8-.32V14h8v.02l.8.32A5 5 0 0 1 28 19v13a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19Z"
        fill="url(#marca-frasco)"
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
