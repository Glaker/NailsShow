/**
 * Texto corto en celular (hasta 420 px) y largo en el resto. El largo queda
 * siempre para lectores de pantalla (visualmente oculto en celular), así el
 * nombre accesible no cambia. Las reglas viven en cliente.css.
 */
export function TextoDual({ corto, largo }: { corto: string; largo: string }) {
  return (
    <>
      <span className="cli-corto" aria-hidden="true">
        {corto}
      </span>
      <span className="cli-largo">{largo}</span>
    </>
  );
}
