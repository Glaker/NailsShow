import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Tarjeta que da vuelta (inspirada en FlipCard de React Bits, 2026-11-06):
 * frente y dorso, se gira con un toque o con Enter, se inclina un poco hacia
 * el cursor y lleva un brillo. Sin dependencias: CSS 3D (global.css,
 * «.flip-card»). Con reducción de movimiento el giro es instantáneo.
 */
export function FlipCard({
  frente,
  dorso,
  alto = 230,
  etiqueta,
  style,
}: {
  frente: ReactNode;
  dorso: ReactNode;
  alto?: number;
  /** Para lectores de pantalla: qué es la tarjeta. */
  etiqueta: string;
  style?: CSSProperties;
}) {
  const [vuelta, setVuelta] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const mover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.setProperty('--fc-rx', `${(-y * 10).toFixed(2)}deg`);
    ref.current.style.setProperty('--fc-ry', `${(x * 12).toFixed(2)}deg`);
    ref.current.style.setProperty('--fc-gx', `${((x + 0.5) * 100).toFixed(1)}%`);
    ref.current.style.setProperty('--fc-gy', `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const salir = () => {
    ref.current?.style.setProperty('--fc-rx', '0deg');
    ref.current?.style.setProperty('--fc-ry', '0deg');
  };

  return (
    <div
      ref={ref}
      className="flip-card"
      data-vuelta={vuelta}
      style={{ height: alto, ...style }}
      onPointerMove={mover}
      onPointerLeave={salir}
    >
      <div
        className="flip-card__giro"
        role="button"
        tabIndex={0}
        aria-pressed={vuelta}
        aria-label={`${etiqueta}: ${vuelta ? 'ver frente' : 'ver detalle'}`}
        onClick={(e) => {
          // Los botones del dorso no dan vuelta la tarjeta.
          if ((e.target as HTMLElement).closest('button, a') !== null) return;
          setVuelta((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setVuelta((v) => !v);
          }
        }}
      >
        <div className="flip-card__cara flip-card__frente" aria-hidden={vuelta}>
          {frente}
          <span className="flip-card__brillo" />
        </div>
        <div className="flip-card__cara flip-card__dorso" aria-hidden={!vuelta}>
          {dorso}
        </div>
      </div>
    </div>
  );
}
