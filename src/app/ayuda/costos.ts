import { FINANZAS } from '@/features/auth/sesion';
import type { MapaAyuda } from './tipos';

/** Ayuda del módulo de costos (D-38 a D-54). Quién hace qué: espejo de las políticas, manda la base. */
export const AYUDA_COSTOS: MapaAyuda = {
  '/costos': {
    queEs:
      'Acá se ve cuánto cuesta cada insumo y cada producto. Es costo de gestión, sin IVA: sirve para decidir, no es la valuación contable. La pantalla tiene pestañas: «Insumos» (costo vigente de cada materia prima y de dónde sale), «Lotes» (lo que se pagó por cada lote recibido), «Recepciones» (si lo cargado coincide con la factura del proveedor), «Productos» (costo calculado de cada producto), «Stock valorizado» (cuánta plata hay parada), «Gastos», «Avisos» y «Parámetros». Los datos salen de las recepciones de insumos, de las fórmulas de los productos y de lo que cargan Finanzas, Administración y Producción; con ellos se calculan las cotizaciones, el resultado del mes y la eficiencia.',
    porRol: {
      [FINANZAS]: [
        'Entrá a «Insumos». Cada fila es un insumo con su «Costo vigente», la «Unidad», el «Origen» (lote, precio manual de Finanzas o planilla de apertura) y la «Fecha». Debajo del costo se ven los tres valores por separado: Finanzas, último lote y apertura.',
        'Arriba tenés un buscador («Insumo o código») y tres botones con contador: «Sin costo», «Pendientes» y «Desactualizados». Tocá uno para filtrar la tabla y tocalo de nuevo para sacar el filtro.',
        'Para fijar un precio de referencia tocá «Fijar precio» en la fila del insumo. Completá «Importe», «Cantidad de la presentación» y «Unidad» (por ejemplo, 25 kg), elegí si el importe incluye IVA (y la alícuota) y la moneda. Si es en dólares, cargá el tipo de cambio. «Vigente desde» es obligatoria y «Vigente hasta» es opcional. El «Motivo» es opcional pero conviene escribirlo. El sistema guarda el neto sin IVA y te muestra a cuánto equivale por unidad del catálogo. Después tocá «Guardar precio».',
        'Si la unidad que elegiste no se puede pasar a la del catálogo (por ejemplo, litros a kilos sin densidad), el formulario te avisa: cargalo directamente en la unidad del catálogo.',
        '«Dar de baja» aparece solo en los insumos con precio manual: desde mañana vuelve a regir el costo del último lote. Lo que ya se pagó en cada lote no cambia.',
        'Para cargar muchos costos de una vez tocá «Excel de pendientes» (baja una planilla con los insumos que faltan, ya con las columnas de la plantilla), completala y subila con «Importar Excel». «Más información» te explica las columnas y «Descargar la plantilla» baja una vacía. Primero ves una vista previa; si algún renglón tiene error, se corrige la planilla y se vuelve a subir, no se importa a medias. Los botones «Excel» y «PDF» exportan lo que estás viendo.',
        'En «Lotes» elegí el mes y mirá qué porcentaje del costo no tiene comprobante. Abajo, en «Lotes recibidos sin costo», tocá «Cargar costo» en cada lote: elegí comprobante, moneda, importe y cantidad, y confirmá. Para corregir un lote que ya tiene costo, tocá «Rectificar» en su fila, cambiá lo que esté mal, escribí el motivo (obligatorio, mínimo 3 letras) y tocá «Guardar rectificación»: el costo anterior queda en el historial.',
        'En «Recepciones» cada fila compara el neto de los lotes contra el de la factura. «Concilia» está bien; «Revisar» significa que hay diferencia. Tocá la fila para ver los costos accesorios de esa recepción. Para sumar uno elegí el «Concepto» (Flete, Seguro, Aranceles, Despachante u Otro), el comprobante, el importe y la fecha, y tocá «Agregar accesorio». Para sacar uno tocá «Quitar», escribí el motivo y confirmá con «Quitar accesorio»: queda un movimiento en cero que corrige al original, no se borra.',
        'En «Productos» tocá una fila para abrir el desglose del producto (granel, acondicionamiento y mano de obra) y el botón «Ver panel del producto». Ahí cargás los «Minutos por unidad» de mano de obra («Guardar minutos») y, si hace falta, el costo de planilla con «Guardar costo»: materiales (C.V.D.), mano de obra (M.O.D.) e indirectos (C.V.I.). El costo de planilla rige solo mientras el calculado esté incompleto; si ya había uno, pide un motivo. El contenido neto del rótulo no lo cargás vos: lo cargan Dirección Técnica o Producción.',
        'En «Stock valorizado» alterná entre «Insumos» y «Producto terminado» para ver cuánta plata hay parada. Los insumos se valúan por lote (saldo por lo que costó ese lote) y el producto terminado por su costo unitario vigente. Si hay lotes sin costo, un aviso amarillo te manda a cargarlos en «Lotes».',
        'En «Gastos» tocá «Cargar gasto». Elegí la categoría (la clase —fijo, operativo o inversión— sale de la categoría), el mes al que corresponde (no el del pago), la descripción, el comprobante, la moneda y el importe. Si es una inversión, completá la «Vida útil (meses)»: se reparte en cuotas iguales mes a mes. El link al comprobante es opcional. Los gastos fijos solo los cargás vos. Para corregir uno tocá «Corregir» en su fila, escribí el motivo y tocá «Guardar corrección»; para quitarlo, corregilo con importe 0.',
        'En «Avisos» (el número entre paréntesis son los no vistos) aparecen los lotes cuyo precio se apartó de tu referencia, ya descontada la inflación (variación real). Revisá el caso, decidí si actualizás la referencia en «Insumos» y tocá «Marcar visto».',
        'En «Parámetros» ves los valores vigentes y los cambiás en «Cambiar parámetros»: costo hora de mano de obra, umbral de aviso, margen mínimo, vigencia de cotización en días, cortes del Pareto (clase A y B) y corte de la apertura. Escribí el motivo y tocá «Guardar parámetros». Más abajo, en «Cargar un mes», cargás las series de IPC y tipo de cambio (A3500 promedio y cierre); marcá «Provisorio» si el dato todavía no es oficial. Sos el único rol que cambia parámetros y series.',
        'El selector de moneda de la barra superior ($, U$D, $ const.) cambia en qué moneda ven los montos las pantallas de gráficos y de stock valorizado.',
      ],
      GERENCIA: [
        'Mirá la pestaña «Insumos»: cada fila trae el costo vigente de una materia prima, la unidad, el origen del precio (lote, manual de Finanzas o apertura) y si está «Desactualizado». Podés buscar por nombre o código y filtrar con los botones «Sin costo», «Pendientes» y «Desactualizados».',
        'En «Productos» ves el costo unitario de cada producto dividido en granel, acondicionamiento y mano de obra. Con «Sólo completos» o «Sólo con faltantes» filtrás. Tocá una fila para abrir el desglose y después «Ver panel del producto» para ver gráficos, precios y stock.',
        'En «Stock valorizado» alterná entre «Insumos» y «Producto terminado» para ver cuánta plata hay parada. Es un valor de gestión, no contable.',
        'En «Gastos» tocá «Cargar gasto» para registrar gastos operativos o inversiones: elegí la categoría, el mes al que corresponde (no el del pago), descripción, comprobante, moneda e importe. Si es una inversión, completá la «Vida útil (meses)». Los gastos fijos solo los carga Finanzas. Si te equivocás, «Corregir» en la fila, con motivo: no se edita ni se borra.',
        'En «Avisos» ves los precios de compra que se movieron más que la inflación. Los que nadie revisó figuran como «Pendiente»; marcarlos como vistos lo hace Finanzas.',
        'En «Lotes» y «Recepciones» podés mirar qué se pagó por cada lote y si coincide con la factura, pero no cargar ni rectificar costos.',
        'En «Parámetros» ves el costo hora, el margen mínimo y los demás valores vigentes. No podés fijar precios de referencia ni cambiar parámetros: eso es de Finanzas.',
      ],
      ADMINISTRACION: [
        'Entrá a «Lotes». Abajo, en «Lotes recibidos sin costo», cada fila es un lote que llegó y todavía no tiene costo. Tocá «Cargar costo», elegí el comprobante (Factura A, B, C, IVA no discriminado o Sin comprobante) y la moneda, y completá lo que pagaste y por qué cantidad. Si es en dólares, cargá el tipo de cambio. Si es factura A, indicá si el importe incluye IVA y la alícuota: el IVA recuperable no es costo; con cualquier otro comprobante el total entero es costo.',
        'Si te equivocaste en un lote que ya tiene costo, tocá «Rectificar» en su fila, corregí los datos y escribí el motivo (obligatorio). Tocá «Guardar rectificación»: el costo anterior queda en el historial, no se borra.',
        'En la parte de arriba de «Lotes» elegí el mes y mirá qué porcentaje del costo cargado está sin comprobante. Con «Sin comprobante» o «Apertura» filtrás la tabla.',
        'En «Recepciones» cada fila compara el neto de los lotes contra el de la factura del proveedor. «Concilia» está bien; «Revisar» significa que hay diferencia: revisá cada costo. Tocá la fila para ver los costos accesorios. Para sumar uno elegí el «Concepto» (Flete, Seguro, Aranceles, Despachante u Otro), el comprobante, el importe y la fecha, y tocá «Agregar accesorio». «Quitar» sale con un motivo y deja un registro que corrige al original.',
        'En «Gastos» tocá «Cargar gasto»: elegí la categoría, el mes al que corresponde (no el del pago), la descripción, el comprobante y el importe. Si es una inversión, completá la «Vida útil (meses)». Los gastos fijos los carga Finanzas. Para corregir, «Corregir» en la fila, con motivo.',
        'En «Insumos» podés bajar el «Excel de pendientes» (los insumos sin costo de la planilla de apertura) y usar «Excel» y «PDF» para exportar lo que ves. Fijar precios de referencia e importar planillas lo hace Finanzas.',
        'En «Stock valorizado» y «Productos» podés mirar cuánta plata hay parada y cuánto cuesta cada producto, sin modificar nada.',
      ],
      GERENCIA_PRODUCCION: [
        'Entrá a «Lotes». Abajo, en «Lotes recibidos sin costo», tocá «Cargar costo» en el lote que recibiste: elegí el comprobante y la moneda y completá lo que se pagó y la cantidad. Si es factura A, indicá si el importe incluye IVA: el IVA recuperable no es costo; con otro comprobante el total es costo. Se guarda con «Cargar costo».',
        'Si hay un error, tocá «Rectificar» en la fila del lote, corregí y escribí el motivo (obligatorio). Un costo no se edita: se carga uno nuevo que corrige al anterior, y el anterior queda en el historial.',
        'En «Recepciones» comparás el neto de los lotes contra la factura. Tocá una fila para ver sus costos accesorios y agregar fletes, seguros, aranceles o despachante con «Agregar accesorio».',
        'En «Productos» tocá la fila del producto para abrir su desglose. Abajo tenés dos formularios: el «Contenido neto del rótulo» (número y unidad g o mL, «Guardar contenido») y los «Minutos por unidad» de mano de obra (con motivo opcional, «Guardar minutos»). Con eso se calcula la mano de obra del producto.',
        'En el mismo desglose, el botón «Ver panel del producto» abre los gráficos y el detalle de cada componente. Los productos con datos faltantes figuran con «costo incompleto».',
        'En «Gastos» tocá «Cargar gasto» para gastos operativos o inversiones del mes al que corresponden. Para corregir, «Corregir» con motivo. Los fijos los carga Finanzas.',
        'No podés fijar precios de referencia ni cambiar parámetros: eso es de Finanzas.',
      ],
    },
    aTener: [
      'Un costo cargado no se edita ni se borra: se rectifica con un motivo y el anterior queda en el historial.',
      'Los importes son sin IVA. Solo la factura A discrimina IVA recuperable; en factura B, C o sin comprobante el total entero es costo.',
      'Un producto se costea con la fórmula vigente; si no hay, con la última que no esté dada de baja. El panel avisa cuál se usó.',
      'Los productos con datos faltantes figuran con «costo incompleto»: no se inventa un número.',
      'El prorrateo de fletes y accesorios entre los lotes de una recepción se hace por valor.',
      'Un gasto cargado tampoco se edita: «Corregir» genera una fila nueva que apunta a la anterior.',
    ],
  },

  '/costos/producto/:id': {
    queEs:
      'El panel de un producto: cuánto cuesta fabricarlo, de qué se compone ese costo y cómo se movió en el tiempo contra sus precios de venta. Arriba hay etiquetas de estado (contenido neto, fórmula usada, costo incompleto, parte del costo sobre precios desactualizados) y tres tarjetas: «Costo unitario», «Stock de este producto» y «Stock de sus insumos». Siguen la incidencia de cada componente (torta), el costo contra el precio neto por banda de precio (barras), la evolución mensual (líneas), la «Sensibilidad» y la tabla de componentes. Los datos salen de la fórmula del producto, los costos de los insumos y las cotizaciones vigentes. Se llega desde Costos › Productos, desde Eficiencia o desde Stock valorizado.',
    porRol: {
      [FINANZAS]: [
        'Arriba mirá las etiquetas: «sin contenido neto», «costo incompleto: N datos faltan» o «costeado con fórmula en…» te dicen qué no es confiable todavía. Otra etiqueta indica qué parte del costo está apoyada en precios desactualizados.',
        'La tarjeta «Costo unitario» suma granel, acondicionamiento y mano de obra. Si falta algo dice «Incompleto: ver «Falta» en el desglose». «Stock de este producto» y «Stock de sus insumos» muestran lo que vale hoy ese stock.',
        'La torta muestra cuánto pesa cada componente en el costo. «Costo contra precio, por banda» compara costo y precio neto de IVA en cada banda de precio y su margen. El gráfico de líneas muestra el costo y los precios mes a mes: cada mes cerrado sale de su foto mensual, el mes en curso del cálculo de hoy.',
        'En «Sensibilidad» elegí un componente en «Si sube el componente» y movés el control (de −50 % a +100 %): el texto de abajo te dice cuánto sube o baja el costo del producto y cuánto pesa ese componente.',
        'En la tabla del final, la columna «Origen» dice de dónde sale el precio de cada componente y la columna «Falta» (en naranja bajo el nombre) explica qué dato falta. Si un precio está desactualizado o falta, corregilo en Costos › Insumos; si falta mano de obra, cargá los minutos en Costos › Productos.',
        'El selector de moneda de la barra superior ($, U$D o $ const.) cambia entre pesos, dólares y pesos constantes. «Volver a Costos» te lleva de nuevo a la pantalla de costos.',
        'Esta pantalla es solo de lectura: no se carga nada desde acá.',
      ],
      GERENCIA: [
        'Mirá «Costo unitario» y las etiquetas de arriba: avisan si el costo está incompleto, si usa una fórmula que no está vigente o si se apoya en precios viejos.',
        'La torta y la tabla final muestran qué componentes pesan más. En la tabla, «Origen» dice de dónde sale el precio de cada uno.',
        '«Costo contra precio, por banda» compara el costo con el precio neto de IVA en cada banda de precio: ahí ves si alguna banda deja poco margen.',
        'El gráfico de líneas muestra cómo se movieron el costo y los precios mes a mes. Un punto hueco significa que el valor usa un IPC estimado, todavía provisorio.',
        'En «Sensibilidad» elegí un componente y movés el control: el texto te dice cuánto sube o baja el costo del producto si ese componente cambia.',
        'El selector de moneda de la barra superior cambia entre pesos, dólares y pesos constantes. Es solo lectura.',
      ],
      ADMINISTRACION: [
        'Mirá «Costo unitario» y las etiquetas de arriba para saber si el número está completo.',
        'La tabla del final muestra cada componente con su cantidad, el costo unitario, el «Origen» del precio y, en naranja, lo que «Falta» si hay un dato sin cargar.',
        'Para completar un dato faltante volvé a Costos (botón «Volver a Costos») y cargá el costo del lote en «Lotes» o revisá la recepción.',
        'El selector de moneda de la barra superior cambia cómo ves los montos.',
        'No cambia nada desde acá: es solo lectura.',
      ],
      GERENCIA_PRODUCCION: [
        'Mirá «Costo unitario» y la tabla del final para ver qué componente pesa más en tu producto. Cada fila muestra cantidad, costo unitario, origen del precio, subtotal y porcentaje del total.',
        'Si la etiqueta dice «sin contenido neto», cargalo en Costos › Productos, abriendo el producto y completando «Contenido neto del rótulo».',
        'Si falta mano de obra, cargá los «Minutos por unidad» en Costos › Productos.',
        'Si en la tabla una fila dice qué le «Falta», el costo del producto queda incompleto hasta que se cargue ese dato (por ejemplo, el costo del lote del insumo).',
        'En «Sensibilidad» elegí un insumo y movés el control: te dice cuánto cambia el costo del producto si ese componente sube o baja.',
        'Esta pantalla es solo de lectura.',
      ],
    },
    aTener: [
      'Merma: se calcula como cantidad dividido (1 − merma). Con 10 % de merma se compra 1,11 veces lo que lleva el producto, no 1,10.',
      'Cada mes cerrado sale de su foto mensual; el mes en curso, del cálculo de hoy. Un mes sin foto queda como hueco.',
      'Punto hueco en un gráfico: el valor usa un IPC estimado, todavía provisorio.',
      'Los montos van en la moneda que elegiste en la barra superior; los porcentajes no cambian.',
    ],
  },

  '/resultado': {
    queEs:
      'El resultado del mes: cuánto se facturó, cuánto costó todo y cuánto hay que vender para no perder. Es resultado de gestión, no fiscal: lo valida el estudio contable. Arriba hay cuatro tarjetas del último mes con datos («Resultado», «Facturación» con su margen de contribución, «Punto de equilibrio» y «Falta para el equilibrio» o «Sobra sobre el equilibrio»). Abajo, un gráfico de facturación contra costos totales de los últimos 12 meses y una tabla mes por mes. La facturación sale de las facturas autorizadas; los costos, del costo de lo vendido más los gastos cargados en Costos › Gastos.',
    porRol: {
      [FINANZAS]: [
        'Arriba hay cuatro tarjetas: «Resultado» del último mes con datos (en verde es «Ganancia», en rojo «Pérdida»), «Facturación» con el margen de contribución, «Punto de equilibrio» y lo que «Falta» o «Sobra» para llegar a ese equilibrio.',
        'El equilibrio es lo que hay que facturar para cubrir costos fijos, nómina, gastos operativos y amortizaciones, con el mix de ventas de ese mes. Sin margen de contribución no se puede calcular y queda «—».',
        'Si una tarjeta sale «—» o dice «Falta el tipo de cambio o el IPC del mes», cargalo en Costos › Parámetros › «Cargar un mes».',
        'El aviso amarillo dice en cuántos meses se vendieron productos sin costo completo: el costo de lo vendido está subestimado. Completalos en Costos › Productos.',
        'Debajo del gráfico, «Gastos sin comprobante en los últimos 12 meses» te dice qué porcentaje de los gastos cargados no tiene comprobante. Si el resultado sale mejor de lo esperado, revisá que estén cargados todos los gastos del mes en Costos › Gastos.',
        'El gráfico compara facturación contra costos totales mes a mes. La tabla de abajo abre el detalle de cada mes: facturación, costo de lo vendido, MC %, fijos, mano de obra no absorbida, operativos, amortizaciones, resultado y equilibrio.',
        'El selector de moneda de la barra superior ($, U$D, $ const.) cambia los montos; los porcentajes no cambian.',
        'Con los botones «Excel» y «PDF» de arriba bajás o imprimís los números. Desde acá no se modifica nada.',
      ],
      GERENCIA: [
        'Mirá «Resultado» del último mes con datos: verde es ganancia, rojo es pérdida.',
        '«Punto de equilibrio» es lo que hay que facturar para no perder; la tarjeta siguiente, «Falta para el equilibrio» o «Sobra sobre el equilibrio», te dice qué tan lejos estás con el mix de ventas de ese mes.',
        'El aviso amarillo significa que se vendió algo sin costo completo: el costo de lo vendido está subestimado, así que el resultado real es peor que el que ves.',
        'El gráfico muestra facturación contra costos totales mes a mes, y la tabla de abajo el detalle de cada mes (fijos, operativos, amortizaciones, resultado, equilibrio).',
        'El selector de moneda de la barra superior cambia los montos. Con «Excel» y «PDF» exportás o imprimís.',
        'No se cambia nada desde acá. Los gastos se cargan en Costos › Gastos.',
      ],
      ADMINISTRACION: [
        'Mirá «Resultado», «Facturación» y «Punto de equilibrio» del último mes con datos. La facturación sale de las facturas autorizadas.',
        'Si el resultado sale mejor de lo esperado, revisá que estén cargados los gastos del mes en Costos › Gastos (el mes al que corresponden, no el del pago).',
        'El aviso amarillo indica meses con productos vendidos sin costo completo: el costo de lo vendido está subestimado.',
        'Debajo del gráfico ves qué porcentaje de los gastos de los últimos 12 meses no tiene comprobante.',
        'Podés exportar con «Excel» y «PDF». No se edita nada desde acá.',
      ],
    },
    aTener: [
      'Es resultado de gestión: no reemplaza al balance ni a la contabilidad.',
      'La mano de obra de producción entra una sola vez: una parte en el costo de lo vendido y el resto como «no absorbida».',
      'Sin margen de contribución no se puede calcular el equilibrio y queda «—».',
      'Las tarjetas muestran el último mes con datos, porque el mes en curso puede no tener facturas todavía.',
    ],
  },

  '/eficiencia': {
    queEs:
      'Te muestra qué productos explican la mayor parte de la facturación, cuánto margen deja cada uno y dónde hay plata parada en stock. Arriba elegís el período. Primero aparece el conteo de productos por clase A, B y C, la curva de Pareto, la matriz «Facturación × margen» y una tabla por producto (unidades, facturación, participación, acumulado y margen). Abajo hay tres pestañas: «Stock: rotación y capital inmovilizado», «Precios por proveedor» y «Alertas de precio». Los datos salen de las facturas autorizadas, los costos de los productos y el stock valorizado.',
    porRol: {
      [FINANZAS]: [
        'Elegí el período arriba: «Último mes», «3 meses», «6 meses» o «12 meses». Todo lo de arriba (Pareto, matriz y tabla) se recalcula. Los botones «Excel» y «PDF» exportan o imprimen.',
        'La curva de Pareto ordena los productos por facturación. Clase A son los que juntos llegan al 80 %, B hasta el 95 % y C el resto; los cortes vigentes se ven arriba y los cambiás en Costos › Parámetros.',
        'En «Facturación × margen» buscás un A con margen bajo o un C con margen alto: piden decisiones distintas. Solo aparecen productos con costo completo.',
        'En la tabla, «Margen» es lo que deja el producto sobre el precio, descontado su costo; en rojo, si queda por debajo del margen mínimo. Si dice «costo incompleto» no se calcula. Tocá el nombre de un producto para abrir su panel de costos.',
        'La pestaña «Stock: rotación y capital inmovilizado» muestra el capital inmovilizado (lo que vale hoy el stock de cada insumo) y cuántos días dura al ritmo de consumo de los últimos 90 días. Filtrá por «Todos», «Sin consumo» o «Más de 6 meses».',
        'La pestaña «Precios por proveedor» compara el precio unitario neto de cada compra por proveedor; el promedio y el mínimo están en pesos de hoy (ajustados por IPC). El proveedor más conveniente figura como «más barato». Podés buscar por «Insumo o proveedor».',
        'La pestaña «Alertas de precio» lista las bandas de precio que están «Debajo del costo» o con «Margen bajo el mínimo». Las variaciones de precio de compra contra tu referencia están en Costos › Avisos.',
        'Desde acá no se modifica nada: es solo lectura.',
      ],
      GERENCIA: [
        'Elegí el período arriba («Último mes», «3 meses», «6 meses» o «12 meses»). La curva de Pareto dice qué pocos productos explican casi toda la facturación (clase A hasta el 80 %, B hasta el 95 %, C el resto).',
        'Mirá la matriz «Facturación × margen»: un A con margen bajo es un problema, un C con margen alto puede ser una oportunidad. Solo aparecen productos con costo completo.',
        'En la tabla, tocá el nombre de un producto para abrir su panel de costos. Si el margen dice «costo incompleto», todavía no se puede calcular.',
        'En la pestaña «Stock: rotación y capital inmovilizado» ves qué insumos llevan mucho tiempo parados y cuánta plata inmovilizan. Filtrá por «Sin consumo» o «Más de 6 meses».',
        'En «Precios por proveedor» ves a quién se le compra más barato por insumo.',
        'En «Alertas de precio» ves qué bandas de precio están por debajo del costo o del margen mínimo.',
        'Podés exportar con «Excel» y «PDF». No se cambia nada desde acá.',
      ],
      ADMINISTRACION: [
        'Elegí el período arriba («Último mes», «3 meses», «6 meses» o «12 meses») y mirá cuáles son los productos clase A, B y C según su facturación.',
        'En la pestaña «Stock: rotación y capital inmovilizado» identificá insumos «Sin consumo» o con «Más de 6 meses» de stock con el filtro de arriba de la tabla.',
        'En «Precios por proveedor» comparás a quién se le compra más barato: la tabla muestra la última compra, el promedio y el mínimo en pesos de hoy.',
        'En «Alertas de precio» ves las bandas por debajo del costo o del margen mínimo.',
        'Podés exportar con «Excel» y «PDF». No se cambia nada desde acá.',
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
      'El historial de cotizaciones. Desde acá armás una nueva, abrís una existente o buscás una emitida. La lista está dividida en «Para clientes» y «Uso interno», y cada fila muestra número, fecha, producto, para quién es, precio unitario, margen, estado (Borrador, Emitida o Anulada), vencimiento y quién la emitió. Los datos salen de las cotizaciones que se arman en el editor; una vez emitidas quedan congeladas.',
    porRol: {
      [FINANZAS]: [
        'Tocá «Nueva cotización» (arriba a la derecha). Escribí el «Título del producto» y elegí «Partir de»: «Hoja en blanco» o «Copiar un producto» (en ese caso buscá el producto en «Producto a copiar»; copiar no cambia el producto original). Tocá «Crear cotización».',
        'Se abre el editor y la cotización queda como Borrador hasta que la emitas. No lleva número hasta ese momento.',
        'Arriba, «Para clientes» y «Uso interno» separan las listas. Filtrá por estado («Todas», «Borradores», «Emitidas», «Anuladas»), por destino (Clientes o Potenciales), por fechas «Desde» y «Hasta», o por texto (título o cliente).',
        'Ves todas las cotizaciones, no solo las tuyas.',
        'Tocá el título de una fila para abrirla. Un borrador se abre y se sigue editando; una emitida o anulada se abre solo para mirarla.',
        'Una emitida con la fecha de vencimiento pasada figura con la etiqueta «vencida». Una emitida no se edita: se duplica desde su pantalla.',
      ],
      GERENCIA: [
        'Tocá «Nueva cotización». Escribí el «Título del producto» y elegí «Partir de»: «Hoja en blanco» o «Copiar un producto» (copiar no cambia el producto original). Tocá «Crear cotización» y se abre el editor.',
        'Ves todas las cotizaciones, con precio unitario y margen.',
        'Filtrá por estado («Todas», «Borradores», «Emitidas», «Anuladas»), por destino, por fechas «Desde» y «Hasta», o buscá por título o cliente.',
        '«Uso interno» es para saber costo y precio sin cliente. Esas cotizaciones llevan la marca de uso interno.',
        'Tocá el título de una fila para abrirla: los borradores se siguen editando; las emitidas se abren solo para mirarlas. Una emitida no se edita: se duplica desde su pantalla.',
      ],
      GERENCIA_PRODUCCION: [
        'Tocá «Nueva cotización». Escribí el «Título del producto» y elegí «Partir de»: «Hoja en blanco» o «Copiar un producto» (copiar no cambia el producto original). Tocá «Crear cotización» y se abre el editor.',
        'Solo ves las cotizaciones que armaste vos.',
        'Un borrador se abre y se sigue editando. Una emitida se abre para mirarla o duplicarla; no se edita.',
        'Podés filtrar por estado («Borradores», «Emitidas», «Anuladas»), por fechas o por texto. «Uso interno» es para conocer costo y precio sin cliente.',
      ],
    },
    aTener: [
      'El número de cotización lo asigna el sistema, correlativo por año, recién al emitir.',
      'Ventas y Administración no cotizan.',
      'La vigencia por defecto sale de Costos › Parámetros.',
    ],
  },

  '/cotizaciones/:id': {
    queEs:
      'El editor de una cotización: armás el costo por unidad, definís margen o precio y emitís el PDF para el cliente. Arriba cargás los datos generales (producto, contenido por unidad, cantidad cotizada y para quién es). Después viene la tabla «Composición por unidad» con cada componente y su costo, la mano de obra y, a la derecha, el costo unitario, el precio y el margen. Los datos salen de los costos de referencia de los insumos (Costos › Insumos) y de lo que escribas a mano; el cálculo se actualiza en vivo y cada campo se guarda al salir de él. Al emitir, el costo queda congelado y la cotización pasa a ser solo de lectura.',
    porRol: {
      [FINANZAS]: [
        'Completá los datos de arriba: «Producto», «Contenido por unidad» (con su unidad: g, mL o unidades) y «Cantidad cotizada (unidades del pedido)». Cada campo se guarda al salir de él.',
        'En «Para» elegí «Cliente» (elegí uno de la lista), «Cliente potencial» (elegí uno cargado o cargá uno nuevo con «Razón social», CUIT y contacto opcionales y el botón de alta) o «Uso interno» (sin cliente: sirve para conocer costo y precio; el PDF lleva la marca «USO INTERNO»).',
        'En «Composición por unidad» tocá «Agregar componente» y elegí el tipo: «Insumo del catálogo» (buscalo por código o nombre; usa el costo de referencia vigente), «Insumo nuevo» (uno que no está en el catálogo: cargás su precio y presentación a mano) o «Costo libre» (un flete, un análisis o un servicio). Indicá la cantidad por unidad de producto y la merma, y tocá «Agregar». Si el insumo mezcla masa y volumen, cargá la densidad.',
        'En un insumo nuevo o un costo libre con precio a mano, prendé «Incluye IVA recuperable (factura A)» solo si es factura A. Con monotributista, factura B o C, o sin factura, dejalo apagado: el total es costo.',
        'En la tabla podés cambiar la cantidad de cada componente y quitarlo con el ícono del tacho. Si un componente no tiene costo, aparece en naranja lo que falta y no se puede emitir hasta completarlo.',
        '«Incluir mano de obra» suma los minutos por unidad (los escribís al lado) por el costo hora que fijó Finanzas en Costos › Parámetros.',
        'Elegí «Fijo el margen» o «Fijo el precio». Con margen, indicá el porcentaje y «Cómo se cuenta»: margen sobre el precio o recargo sobre el costo. Con precio, escribí el precio final por unidad. Ajustá el «Redondeo» y «En el PDF»: «Precio más IVA» o «Precio con IVA incluido». Abajo se ve el precio unitario, el margen equivalente y el total del pedido.',
        'Si el margen queda bajo el mínimo, aparece un aviso naranja y un campo «Por qué se cotiza con este margen»: escribí la justificación. Se puede emitir igual, pero sin justificación el botón queda deshabilitado.',
        'Escribí las «Observaciones para el cliente (van en el PDF)» y la «Vigencia (días)».',
        '«Emitir cotización» queda habilitado cuando hay al menos un componente, todos tienen costo y el precio es mayor que cero. Al emitir, el sistema recalcula, congela el costo y asigna el número. Después, desde el encabezado, podés abrir «PDF para el cliente» (y desde ahí «Imprimir o guardar como PDF»), «Duplicar» (arma un borrador nuevo igual) o «Anular» con un motivo obligatorio. Anular no la borra: queda en el historial.',
      ],
      GERENCIA: [
        'Completá «Producto», «Contenido por unidad» y «Cantidad cotizada (unidades del pedido)», y elegí en «Para» si es para un «Cliente», un «Cliente potencial» o «Uso interno». Cada campo se guarda al salir de él.',
        'En «Composición por unidad» tocá «Agregar componente»: un insumo del catálogo, un insumo nuevo o un costo libre. Indicá cantidad por unidad de producto y merma, y tocá «Agregar». Podés cambiar la cantidad en la tabla o quitar un componente con el ícono del tacho.',
        'Mirá «Costo unitario» (se recalcula en vivo) y elegí «Fijo el margen» o «Fijo el precio». Ajustá «Redondeo» y «En el PDF» (precio más IVA o con IVA incluido).',
        'Si el margen queda bajo el mínimo de Finanzas, completá «Por qué se cotiza con este margen»: es obligatorio para poder emitir, pero no impide emitir con ese margen.',
        'Cuando «Precio unitario» te cierre, escribí las «Observaciones para el cliente» y la «Vigencia (días)».',
        'Tocá «Emitir cotización» (solo se habilita si todos los componentes tienen costo). Después podés abrir el «PDF para el cliente», «Duplicar» o «Anular» con un motivo.',
        'El costo hora de la mano de obra lo fija Finanzas.',
      ],
      GERENCIA_PRODUCCION: [
        'Completá «Producto», «Contenido por unidad» y «Cantidad cotizada (unidades del pedido)», y elegí en «Para» para quién es. Cada campo se guarda al salir de él.',
        'Tocá «Agregar componente» para sumar un insumo del catálogo, un insumo nuevo o un costo libre. Indicá la cantidad por unidad de producto y la merma, y tocá «Agregar». Con el ícono del tacho quitás un componente.',
        'Si el insumo es nuevo (no está en el catálogo), el ícono de enviar, «Proponer para el catálogo», le deja una solicitud a Dirección Técnica. No lo agrega solo.',
        'Prendé «Incluir mano de obra» y completá los minutos por unidad. El costo hora lo fija Finanzas.',
        'Elegí «Fijo el margen» o «Fijo el precio» y mirá el precio por unidad y el total del pedido. Si el margen queda bajo el mínimo, escribí por qué lo cotizás así.',
        'Cuando esté completa (todos los componentes con costo) tocá «Emitir cotización». Después podés abrir el «PDF para el cliente», «Duplicar» o «Anular» con un motivo.',
      ],
    },
    aTener: [
      'Una cotización emitida no se edita: se duplica y se arma de nuevo. Anularla pide un motivo y no la borra.',
      'Mientras es borrador el costo se recalcula en vivo; al emitir queda congelado y no cambia aunque cambien los precios.',
      'El PDF para el cliente nunca muestra costos ni margen.',
      'El margen mínimo avisa y pide justificación, pero no bloquea la emisión.',
      'Merma: se calcula como cantidad dividido (1 − merma).',
      'La vigencia es de 7 días por defecto; Finanzas la puede cambiar en Parámetros.',
    ],
  },

  '/gerencia': {
    queEs:
      'Un resumen del mes con pocos números grandes: resultado, facturación, punto de equilibrio y producción. Abajo, dos listas: los cinco productos más vendidos del mes con su margen y las órdenes de producción terminadas. Los datos salen de las facturas autorizadas, los costos y gastos cargados y las órdenes de producción terminadas; el detalle completo está en Resultado y Eficiencia.',
    porRol: {
      [FINANZAS]: [
        '«Resultado del mes» sale en verde si hay ganancia y en rojo si hay pérdida.',
        '«Facturación» trae debajo el margen de contribución.',
        '«Punto de equilibrio» dice cuánto hay que facturar para no perder, y debajo si «Falta» o «Sobra».',
        '«Producción del mes» cuenta las unidades de las órdenes terminadas y, debajo, cuántas son.',
        'Si el mes en curso todavía no tiene facturas, las tarjetas muestran el último mes con datos.',
        'Si sale «—», falta cargar el tipo de cambio o el IPC del mes en Costos › Parámetros.',
        'Si aparece un aviso amarillo, parte de lo vendido no tiene costo completo y el resultado está sobreestimado: completá los costos en Costos › Productos.',
        '«Lo que más se vendió este mes» lista los cinco productos con su margen. «costo incompleto» significa que ese margen no se puede calcular. «Producción del período» lista las órdenes terminadas.',
        'Es solo lectura. Para ver el detalle, andá a Resultado o a Eficiencia.',
      ],
      GERENCIA: [
        '«Resultado del mes» sale en verde si hay ganancia y en rojo si hay pérdida.',
        '«Facturación» muestra el margen de contribución debajo.',
        '«Punto de equilibrio» dice cuánto hay que facturar para no perder, y debajo si «Falta» o «Sobra».',
        '«Producción del mes» cuenta las unidades de las órdenes terminadas y, debajo, cuántas órdenes son.',
        'Si hay un aviso amarillo, parte de lo vendido no tiene costo completo y el resultado está sobreestimado.',
        'Si el mes en curso todavía no tiene facturas, las tarjetas muestran el último mes con datos. Si sale «—», falta cargar el tipo de cambio o el IPC del mes (lo carga Finanzas).',
        'Abajo ves «Lo que más se vendió este mes» (cinco productos, con su margen) y «Producción del período» (las últimas órdenes terminadas, con su número, fecha y unidades).',
        'Es solo lectura. El detalle está en Resultado y Eficiencia.',
      ],
    },
    aTener: [
      'Es resultado de gestión, no fiscal. Los montos siguen la moneda que elegiste en la barra superior.',
      'Sin facturas ni gastos cargados la pantalla queda vacía.',
    ],
  },
};
