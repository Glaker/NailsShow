import { matchPath } from 'react-router-dom';

/**
 * Preguntas típicas de cada pantalla, que Giorgio ofrece al abrir el panel
 * vacío (D-57). Son metadatos de la guía, no textos del componente. Clave:
 * igual que en la ayuda, el `path` de routes.tsx o una pestaña con `?vista=`.
 * La prueba de catalogo.test.ts exige que cada clave sea una ruta real.
 */
export const SUGERENCIAS: Record<string, string[]> = {
  '/': [
    '¿Qué me muestra esta pantalla?',
    '¿A dónde voy para lo que tengo que hacer hoy?',
  ],
  '/ventas': [
    '¿Cómo cargo un pedido mayorista?',
    '¿De dónde sale el descuento de un pedido?',
  ],
  '/ventas/:id': [
    '¿Cómo se calcula el total con descuento?',
    '¿Qué pasa cuando envío el pedido?',
  ],
  '/armado': ['¿Qué tengo que preparar primero?', '¿Cómo marco un pedido como armado?'],
  '/pedidos': ['¿Cómo cargo un pedido?', '¿Dónde veo los insumos que faltan?'],
  '/pedidos/:id': [
    '¿De dónde salen los insumos que faltan?',
    '¿Cómo anoto algo para comprar?',
  ],
  '/planificacion': ['¿Qué significa la línea roja?', '¿Cómo muevo un pedido de día?'],
  '/ordenes': ['¿Cómo abro una orden de producción?', '¿Dónde está el batch record?'],
  '/formulas': [
    '¿Cómo calculo cuánto lleva un lote?',
    '¿Dónde veo la fórmula de un producto?',
  ],
  '/stock': ['¿Cómo cargo una recepción?', '¿Qué es el stock de seguridad?'],
  '/lotes': ['¿Cómo busco un lote?', '¿Qué significa cada estado de un lote?'],
  '/lotes/:id': ['¿Por qué este lote está en cuarentena?', '¿Dónde se usó este lote?'],
  '/liberacion': ['¿Qué hace falta para liberar un lote?', '¿Quién firma la liberación?'],
  '/especificaciones': [
    '¿Qué es una especificación?',
    '¿Quién aprueba una especificación?',
  ],
  '/compras': [
    '¿De dónde salen las compras pendientes?',
    '¿Cómo marco algo como pedido?',
  ],
  '/facturas': ['¿Cómo se emite una factura?', '¿Qué hago si una factura fue rechazada?'],
  '/clientes': [
    '¿Por qué a un cliente se le factura A o B?',
    '¿Cómo doy de alta un cliente?',
  ],
  '/precios': [
    '¿Cómo cambio un precio de lista?',
    '¿Cómo funciona la escala de descuentos?',
  ],
  '/administracion': ['¿Qué tengo que resolver hoy?', '¿De dónde sale «A cobrar»?'],
  '/cuentas-proveedores': [
    '¿Cómo registro un pago?',
    '¿Qué significa una diferencia con el proveedor?',
  ],
  '/cuentas-clientes': ['¿Cómo registro un cobro?', '¿Cómo veo lo que debe un cliente?'],
  '/tesoreria': ['¿Cómo cargo un movimiento de caja?', '¿Cómo concilio un banco?'],
  '/solicitudes-pago': ['¿Cómo pido un pago?', '¿Quién aprueba las solicitudes?'],
  '/costos': [
    '¿De dónde sale el costo de un insumo?',
    '¿Cómo cargo el costo de un lote?',
  ],
  '/costos/producto/:id': [
    '¿De dónde sale este costo?',
    '¿Qué significa «costo incompleto»?',
  ],
  '/resultado': [
    '¿Qué es el punto de equilibrio?',
    '¿De dónde sale el resultado del mes?',
  ],
  '/eficiencia': ['¿Qué es la clase A del Pareto?', '¿Cómo leo la matriz de margen?'],
  '/cotizaciones': ['¿Cómo armo una cotización?', '¿Cómo se calcula el precio sugerido?'],
  '/gerencia': [
    '¿De dónde sale el resultado del mes?',
    '¿Qué es el punto de equilibrio?',
  ],
  '/reportes': ['¿Dónde veo el IVA del mes?', '¿Qué reporte uso para las ventas?'],
  '/usuarios': ['¿Cómo doy de alta a una persona?', '¿Cómo desactivo un usuario?'],
  '/visibilidad': [
    '¿Cómo le oculto una pantalla a un rol?',
    '¿Esto cambia lo que el rol puede leer?',
  ],
  '/auditoria': ['¿Cómo veo quién cambió un registro?', '¿Qué queda registrado acá?'],
  '/catalogos': ['¿Cómo doy de alta un insumo?', '¿Dónde cargo un proveedor nuevo?'],
};

/**
 * Las sugerencias de la pantalla actual: primero la pestaña (`?vista=`), si
 * tiene propias; después la ruta. Misma resolución que `ayudaDe`.
 */
export function sugerenciasDe(pathname: string, search = ''): string[] {
  const vista = new URLSearchParams(search).get('vista');
  const pestania = vista ? SUGERENCIAS[`${pathname}?vista=${vista}`] : undefined;
  if (pestania) return pestania;
  const clave = Object.keys(SUGERENCIAS).find(
    (p) => !p.includes('?') && matchPath(p, pathname),
  );
  return clave ? SUGERENCIAS[clave]! : [];
}
