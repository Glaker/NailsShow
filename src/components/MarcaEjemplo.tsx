/**
 * Marca de agua «SOLO EJEMPLO — NO VÁLIDO ANMAT» sobre un documento o rótulo
 * de demostración. Va encima del contenido (position: absolute): el padre
 * tiene que tener position: relative. Se imprime igual que en pantalla.
 */
export function MarcaEjemplo({ tamano = 28 }: { tamano?: number }) {
  return (
    <div
      aria-label="Solo ejemplo, no válido ANMAT"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 2,
      }}
    >
      <div
        style={{
          transform: 'rotate(-24deg)',
          border: '4px solid rgba(201, 42, 42, 0.55)',
          color: 'rgba(201, 42, 42, 0.55)',
          padding: '6px 18px',
          fontSize: tamano,
          fontWeight: 900,
          letterSpacing: 2,
          textAlign: 'center',
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        }}
      >
        SOLO EJEMPLO
        <div style={{ fontSize: tamano * 0.5 }}>NO VÁLIDO ANMAT</div>
      </div>
    </div>
  );
}
