import { FINANZAS } from '@/features/auth/sesion';
import type { MapaAyuda } from './tipos';

/** Ayuda del módulo de costos (D-38 a D-54). Quién hace qué: espejo de las políticas, manda la base. */
export const AYUDA_COSTOS: MapaAyuda = {
  '/costos': {
    queEs:
      'Acá se ve cuánto cuesta cada insumo y cada producto. Es costo de gestión, sin IVA: sirve para decidir, no es la valuación contable.',
    porRol: {
      [FINANZAS]: [
        'Elegí la pestaña «Insumos». Cada fila es un insumo con su costo vigente y de dónde sale: lote, precio manual o planilla de apertura.',
        'Usá los botones «Sin costo», «Pendientes» y «Desactualizados» para ver qué falta cargar o qué precio quedó viejo.',
        'Para fijar un precio de referencia tocá «Fijar precio». Completá importe, cantidad de la presentación, unidad y si el importe incluye IVA. Si está en dólares, cargá el tipo de cambio. Escribí el motivo.',
        'Para cargar muchos de una vez bajá el «Excel de pendientes», completalo y subilo con el botón de importar. «Dar de baja» saca un precio manual.',
        'En «Lotes» cargás el costo de un lote recibido; si ya tenía, usás «Rectificar» con un motivo. En «Recepciones» ves si lo cargado coincide con la factura y sumás fletes o aranceles.',
        'En «Productos» cargás los minutos por unidad que lleva fabricar cada uno. En «Gastos» cargás gastos fijos, operativos e inversiones.',
        'En «Avisos» aparecen los lotes cuyo precio se apartó de tu referencia, ya descontada la inflación. Tocá «Marcar visto» cuando lo revisaste.',
        'En «Parámetros» cargás el costo hora, el umbral de aviso, el margen mínimo, los cortes del Pareto y las series de IPC y tipo de cambio. Sos el único que los cambia.',
      ],
      GERENCIA: [
        'Mirá la pestaña «Insumos» para ver el costo vigente de cada materia prima y de dónde sale.',
        'En «Productos» ves el costo de cada producto. Tocá una fila y después «Ver panel del producto» para ver el desglose completo.',
        'En «Stock valorizado» ves cuánta plata hay parada en insumos y en producto terminado.',
        'En «Gastos» podés cargar gastos operativos e inversiones. Los costos fijos los carga solo Finanzas.',
        'En «Avisos» ves los precios de compra que se movieron más que la inflación. Marcarlos como vistos lo hace Finanzas.',
        'No podés fijar precios de referencia ni cambiar parámetros: eso es de Finanzas.',
      ],
      ADMINISTRACION: [
        'En la pestaña «Lotes» tocá «Cargar costo» en un lote recibido y completá lo que se pagó, con comprobante y moneda.',
        'Si te equivocaste, usá «Rectificar» y escribí el motivo. El costo anterior queda en el historial.',
        'En «Recepciones» comparás el neto de los lotes contra el de la factura. Si hay diferencia, revisá cada costo. Ahí también podés sumar fletes y otros accesorios.',
        'En «Gastos» cargás gastos operativos e inversiones del mes en que corresponden, no del mes en que se pagan. Los fijos los carga Finanzas.',
        'En «Insumos» podés exportar a Excel. No podés fijar precios de referencia ni importar.',
      ],
      GERENCIA_PRODUCCION: [
        'En la pestaña «Lotes» tocá «Cargar costo» cuando recibís un lote: completá lo que se pagó y el comprobante.',
        'Si hay un error usá «Rectificar» con un motivo. No se edita: se carga uno nuevo que corrige al anterior.',
        'En «Productos» elegí un producto y completá los minutos por unidad y el contenido neto (g o mL). Con eso se calcula la mano de obra.',
        'En «Productos», el botón «Ver panel del producto» muestra el desglose de cada costo.',
        'En «Gastos» podés cargar gastos operativos. No podés fijar precios de referencia ni cambiar parámetros.',
      ],
    },
    aTener: [
      'Un costo cargado no se edita ni se borra: se rectifica con un motivo y el anterior queda en el historial.',
      'Los importes son sin IVA. Solo la factura A discrimina IVA recuperable; en factura B, C o sin comprobante el total entero es costo.',
      'Un producto se costea con la fórmula vigente; si no hay, con la última que no esté dada de baja. El panel avisa cuál se usó.',
      'Los productos con datos faltantes figuran con «costo incompleto»: no se inventa un número.',
      'El prorrateo de fletes y accesorios entre los lotes de una recepción se hace por valor.',
    ],
  },

  '/costos/producto/:id': {
    queEs:
      'El panel de un producto: cuánto cuesta fabricarlo, de qué se compone ese costo y cómo se movió en el tiempo contra sus precios de venta.',
    porRol: {
      [FINANZAS]: [
        'Arriba mirá las etiquetas: «sin contenido neto», «costo incompleto» o «costeado con fórmula en borrador» te dicen qué no es confiable todavía.',
        'La tarjeta «Costo unitario» suma granel, acondicionamiento y mano de obra. Si falta algo, el desglose lo marca.',
        'Las tarjetas de stock muestran lo que vale hoy el producto terminado y sus insumos.',
        'La torta muestra cuánto pesa cada componente en el costo. El gráfico de barras compara costo contra precio neto en cada banda de precio.',
        'En «Sensibilidad» elegí un componente y movés el control: te dice cuánto sube o baja el costo del producto si ese componente cambia.',
        'En la tabla del final, la columna «Origen del precio» dice de dónde sale cada costo. Si está desactualizado, corregilo en Costos › Insumos.',
        'El selector de moneda de la barra superior cambia entre pesos, dólares y pesos constantes.',
      ],
      GERENCIA: [
        'Mirá «Costo unitario» y las etiquetas de arriba: avisan si el costo está incompleto o apoyado en precios viejos.',
        'La torta y la tabla final muestran qué componentes pesan más.',
        'El gráfico de barras compara costo contra precio neto en cada banda: ahí ves si alguna banda deja poco margen.',
        'En «Sensibilidad» probás qué pasa con el costo si un componente sube o baja.',
      ],
      ADMINISTRACION: [
        'Mirá «Costo unitario» y las etiquetas de arriba para saber si el número está completo.',
        'La tabla del final muestra cada componente, su cantidad, su merma y de dónde sale el precio.',
        'Para completar un dato faltante volvé a Costos y cargá el costo del lote o del insumo.',
        'No cambia nada desde acá: es solo lectura.',
      ],
      GERENCIA_PRODUCCION: [
        'Mirá «Costo unitario» y la tabla del final para ver qué componente pesa más en tu producto.',
        'Si dice «sin contenido neto», cargalo en Costos › Productos.',
        'Si falta mano de obra, cargá los minutos por unidad en Costos › Productos.',
        'En «Sensibilidad» probás cuánto cambia el costo si sube un insumo.',
      ],
    },
    aTener: [
      'Merma: se calcula como cantidad dividido (1 − merma). Con 10 % de merma se compra 1,11 veces lo que lleva el producto, no 1,10.',
      'Cada mes cerrado sale de su foto mensual; el mes en curso, del cálculo de hoy. Un mes sin foto queda como hueco.',
      'Punto hueco en un gráfico: el valor usa un IPC estimado, todavía provisorio.',
    ],
  },

  '/resultado': {
    queEs:
      'El resultado del mes: cuánto se facturó, cuánto costó todo y cuánto hay que vender para no perder. Es resultado de gestión, no fiscal.',
    porRol: {
      [FINANZAS]: [
        'Arriba hay cuatro números: «Resultado» del último mes (ganancia o pérdida), «Facturación», «Punto de equilibrio» y lo que «Falta» o «Sobra» para llegar a ese equilibrio.',
        'El equilibrio es lo que hay que facturar para cubrir costos fijos, nómina, gastos y amortizaciones, con el mix de ventas de ese mes.',
        'Si sale «—» o «Falta el tipo de cambio o el IPC del mes», cargalo en Costos › Parámetros.',
        'El aviso amarillo dice que hay meses con productos vendidos sin costo completo: el costo de lo vendido está subestimado. Completalos en Costos › Productos.',
        'Si falta cargar los gastos del mes, el resultado sale mejor de lo que es. Cargalos en Costos › Gastos.',
        'El gráfico compara facturación contra costos totales mes a mes. Usá el selector de moneda de la barra.',
        'Con el botón de exportar bajás los números a Excel.',
      ],
      GERENCIA: [
        'Mirá «Resultado» del último mes: verde es ganancia, rojo es pérdida.',
        '«Punto de equilibrio» es lo que hay que facturar para no perder; «Falta» o «Sobra» te dice qué tan lejos estás.',
        'El aviso amarillo significa que se vendió algo sin costo completo: el resultado real es peor que el que ves.',
        'El gráfico muestra facturación contra costos totales mes a mes. Se puede exportar a Excel.',
        'No se cambia nada desde acá. Los gastos se cargan en Costos › Gastos.',
      ],
      ADMINISTRACION: [
        'Mirá «Resultado», «Facturación» y «Punto de equilibrio» del último mes.',
        'Si el resultado sale mejor de lo esperado, revisá que estén cargados los gastos del mes en Costos › Gastos.',
        'El aviso amarillo indica productos vendidos sin costo completo.',
        'Podés exportar a Excel. No se edita nada desde acá.',
      ],
    },
    aTener: [
      'Es resultado de gestión: no reemplaza al balance ni a la contabilidad.',
      'La mano de obra de producción entra una sola vez: una parte en el costo de lo vendido y el resto como «no absorbida».',
      'Sin margen de contribución no se puede calcular el equilibrio y queda «—».',
    ],
  },

  '/eficiencia': {
    queEs:
      'Te muestra qué productos explican la mayor parte de la facturación, cuánto margen deja cada uno y dónde hay plata parada en stock.',
    porRol: {
      [FINANZAS]: [
        'Elegí el período arriba: «Último mes», «3 meses», «6 meses» o «12 meses».',
        'La curva de Pareto ordena los productos por facturación. Clase A son los que juntos llegan al 80 %, B hasta el 95 % y C el resto. Los cortes los cambiás en Costos › Parámetros.',
        'En «Facturación × margen» buscás un A con margen bajo o un C con margen alto: piden decisiones distintas. Solo aparecen productos con costo completo.',
        'En la tabla, «Margen» es lo que deja el producto sobre el precio, descontado su costo. Si dice «costo incompleto» no se calcula.',
        'La pestaña «Stock: rotación y capital inmovilizado» muestra el capital inmovilizado y cuántos días dura el stock de cada insumo. Filtrá por «Sin consumo» o «Más de 6 meses».',
        'La pestaña «Precios por proveedor» compara precios de cada proveedor, en pesos de hoy.',
        'La pestaña «Alertas de precio» lista los productos con una banda por debajo del costo o del margen mínimo.',
      ],
      GERENCIA: [
        'Elegí el período arriba. La curva de Pareto dice qué pocos productos explican casi toda la facturación.',
        'Mirá la matriz «Facturación × margen»: un A con margen bajo es un problema.',
        'En la pestaña de rotación de stock ves qué insumos llevan mucho tiempo parados y cuánta plata inmovilizan.',
        'En «Alertas de precio» ves qué precios están por debajo del costo o del margen mínimo.',
        'Podés exportar a Excel. No se cambia nada desde acá.',
      ],
      ADMINISTRACION: [
        'Elegí el período arriba y mirá cuáles son los productos A, B y C.',
        'En la pestaña de rotación de stock identificá insumos sin consumo o con más de 6 meses de stock.',
        'En «Precios por proveedor» comparás a quién se le compra más barato.',
        'Podés exportar a Excel. No se cambia nada desde acá.',
      ],
    },
    aTener: [
      'Un producto que cruza un corte queda en la clase de abajo: el que completa el 80 % es A.',
      'Los días de stock se calculan con lo consumido en producción en los últimos 90 días.',
      'Los porcentajes no dependen de la moneda; los montos de las tablas sí.',
    ],
  },

  '/cotizaciones': {
    queEs:
      'El historial de cotizaciones. Desde acá armás una nueva, abrís una existente o buscás una emitida.',
    porRol: {
      [FINANZAS]: [
        'Tocá «Nueva cotización». Escribí el título del producto y elegí si partís de «Hoja en blanco» o de «Copiar un producto». Copiar no cambia el producto original.',
        'Se abre el editor. La cotización queda como Borrador hasta que la emitas.',
        'Arriba, «Para clientes» y «Uso interno» separan las listas. Filtrá por estado, destino, fechas o texto.',
        'Ves todas las cotizaciones, no solo las tuyas.',
        'Un borrador se abre y se sigue editando. Una emitida o anulada se abre solo para mirarla.',
        'Una emitida no se edita: se duplica desde su pantalla.',
      ],
      GERENCIA: [
        'Tocá «Nueva cotización». Escribí el título del producto y elegí si partís de una hoja en blanco o copiás un producto.',
        'Ves todas las cotizaciones, con el desglose.',
        'Filtrá por estado (Borradores, Emitidas, Anuladas), por destino o por fechas.',
        '«Uso interno» es para saber costo y precio sin cliente. Lleva la marca de uso interno.',
        'Una emitida no se edita: se duplica.',
      ],
      GERENCIA_PRODUCCION: [
        'Tocá «Nueva cotización». Escribí el título del producto y elegí si partís de una hoja en blanco o copiás un producto.',
        'Solo ves las cotizaciones que armaste vos.',
        'Un borrador se abre y se sigue editando. Una emitida se abre para mirarla o duplicarla.',
        '«Uso interno» es para conocer costo y precio sin cliente.',
      ],
    },
    aTener: [
      'El número de cotización lo asigna el sistema, correlativo por año, recién al emitir.',
      'Ventas y Administración no cotizan.',
    ],
  },

  '/cotizaciones/:id': {
    queEs:
      'El editor de una cotización: armás el costo por unidad, definís margen o precio y emitís el PDF para el cliente.',
    porRol: {
      [FINANZAS]: [
        'Completá la cabecera: producto, contenido por unidad (g, mL o unidades) y la cantidad cotizada del pedido.',
        'Elegí «Para»: «Cliente», «Cliente potencial» (podés cargar uno nuevo ahí mismo) o «Uso interno».',
        'En «Composición por unidad» tocá «Agregar componente»: un insumo del catálogo, uno nuevo o un costo libre como un flete o un análisis. Indicá cantidad y merma.',
        'Si es un insumo nuevo con precio a mano, prendé «Incluye IVA recuperable» solo si es factura A. Con otro comprobante, el total es costo.',
        '«Incluir mano de obra» suma los minutos por unidad por el costo hora que fija Finanzas.',
        'Elegí «Fijo el margen» o «Fijo el precio». El margen puede ser sobre el precio o recargo sobre el costo. Ajustá el redondeo y la leyenda del PDF: «Precio más IVA» o «con IVA incluido».',
        'Si el margen queda bajo el mínimo, aparece un aviso naranja: escribí por qué lo cotizás así. Se puede emitir igual.',
        '«Emitir cotización» queda habilitado cuando todos los componentes tienen costo. Al emitir el costo se congela y se genera el PDF. Después podés usar «Duplicar» o «Anular» con un motivo.',
      ],
      GERENCIA: [
        'Completá producto, contenido por unidad y cantidad cotizada, y elegí para quién es.',
        'En «Composición por unidad» tocá «Agregar componente»: un insumo del catálogo, uno nuevo o un costo libre.',
        'Mirá «Costo unitario» (se recalcula en vivo) y elegí «Fijo el margen» o «Fijo el precio».',
        'Cuando «Precio unitario» te cierre, escribí las observaciones para el cliente y la vigencia.',
        'Tocá «Emitir cotización». Después podés bajar el «PDF para el cliente», «Duplicar» o «Anular» con un motivo.',
        'El costo hora de la mano de obra lo fija Finanzas.',
      ],
      GERENCIA_PRODUCCION: [
        'Completá producto, contenido por unidad y cantidad cotizada, y elegí para quién es.',
        'Tocá «Agregar componente» para sumar insumos, un insumo nuevo o un costo libre. Indicá cantidad y merma.',
        'Si el insumo no está en el catálogo, el icono «Proponer para el catálogo» le deja una solicitud a Dirección Técnica. No lo agrega solo.',
        'Prendé «Incluir mano de obra» y completá los minutos por unidad. El costo hora lo fija Finanzas.',
        'Elegí «Fijo el margen» o «Fijo el precio» y mirá el precio por unidad y el total del pedido.',
        'Cuando esté completa tocá «Emitir cotización». Después podés abrir el PDF, duplicar o anular.',
      ],
    },
    aTener: [
      'Una cotización emitida no se edita: se duplica y se arma de nuevo. Anularla pide un motivo.',
      'Mientras es borrador el costo se recalcula en vivo; al emitir queda congelado y no cambia aunque cambien los precios.',
      'El PDF para el cliente nunca muestra costos ni margen.',
      'El margen mínimo avisa y pide justificación, pero no bloquea la emisión.',
      'Merma: se calcula como cantidad dividido (1 − merma).',
      'La vigencia es de 7 días por defecto; Finanzas la puede cambiar en Parámetros.',
    ],
  },

  '/gerencia': {
    queEs:
      'Un resumen del mes con pocos números grandes: resultado, facturación, punto de equilibrio y producción.',
    porRol: {
      [FINANZAS]: [
        '«Resultado del mes» sale en verde si hay ganancia y en rojo si hay pérdida.',
        '«Facturación» trae debajo el margen de contribución.',
        '«Punto de equilibrio» dice cuánto hay que facturar para no perder, y si «Falta» o «Sobra».',
        '«Producción del mes» cuenta las unidades de las órdenes terminadas.',
        'Si el mes en curso todavía no tiene facturas, las tarjetas muestran el último mes con datos.',
        'Si sale «—», falta cargar el tipo de cambio o el IPC del mes en Costos › Parámetros.',
        '«Lo que más se vendió este mes» lista los cinco productos con su margen. «costo incompleto» significa que ese margen no se puede calcular.',
      ],
      GERENCIA: [
        '«Resultado del mes» sale en verde si hay ganancia y en rojo si hay pérdida.',
        '«Facturación» muestra el margen de contribución debajo.',
        '«Punto de equilibrio» dice cuánto falta o sobra para no perder.',
        '«Producción del mes» cuenta las unidades de las órdenes terminadas.',
        'Si hay un aviso amarillo, parte de lo vendido no tiene costo completo y el resultado está sobreestimado.',
        'Abajo ves los cinco productos más vendidos y las últimas órdenes de producción.',
        'Es solo lectura. El detalle está en Resultado y Eficiencia.',
      ],
    },
    aTener: [
      'Es resultado de gestión, no fiscal. Los montos siguen la moneda que elegiste en la barra superior.',
      'Sin facturas ni gastos cargados la pantalla queda vacía.',
    ],
  },
};
