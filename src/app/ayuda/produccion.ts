import { FINANZAS } from '@/features/auth/sesion';
import type { MapaAyuda } from './tipos';

/** Ayuda «¿Cómo funciona?» de las pantallas de producción, stock y calidad. */
export const AYUDA_PRODUCCION: MapaAyuda = {
  '/': {
    queEs:
      'Tu pantalla de inicio. Cada rol ve lo que le toca hacer hoy, y nada más. Los números y las filas llevan directo a la pantalla donde se resuelve.',
    porRol: {
      DIRECCION_TECNICA: [
        'Ves dos contadores grandes: «Insumos sin aprobar» y «Lotes de producto por liberar».',
        'Tocá «Insumos sin aprobar» para ir a los lotes en cuarentena. Ahí registrás el muestreo y aprobás o rechazás.',
        'Tocá «Lotes de producto por liberar» para ir a Liberación y firmar los lotes terminados.',
        'Debajo hay dos listas cortas con los insumos esperando aprobación y el producto terminado esperando liberación. Tocá una fila para abrirla.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves tus pedidos pendientes: cuántos hay, cuántos están en producción, cuántos faltan planificar y cuántos tienen la entrega vencida.',
        'En «Resumen de pedidos» tocá el número de un pedido para abrirlo.',
        'Abajo hay un Gantt de las próximas dos semanas y un calendario del mes. Acá solo se miran: para mover algo andá a «Planificación».',
        'Al final están las «Tareas de planta», las mismas que ven los operarios. Si la pesada la hacés vos, tocá «Hacer» en esa tarjeta y completala como ellos.',
      ],
      VENTAS: [
        'Ves los pedidos en curso: cuántos hay, cuántos están en producción, cuántos faltan planificar y cuántos tienen la entrega vencida.',
        'Tocá el número de un pedido para abrirlo.',
        'El Gantt y el calendario son solo para mirar cuándo se produce cada pedido.',
      ],
      ENCARGADA_STOCK: [
        'Tu inicio es la lista de pedidos a armar. Abrí cada uno y preparalo con lo que dice el pedido.',
        'Hay una ayuda propia en esa pantalla con los pasos de armado.',
      ],
      ADMINISTRACION: [
        'Tu inicio es el tablero de Administración: pagos vencidos, solicitudes por aprobar, facturas por cargar, diferencias con proveedores y la posición del mes.',
        'En «Facturas por cargar» aparecen las recepciones de mercadería a las que todavía nadie les cargó la factura del proveedor. Tocá «Cargar» en cada una.',
      ],
      [FINANZAS]: [
        'Tu inicio es el Resultado de gestión: facturación contra costos del mes.',
        'Es un resultado de gestión, no fiscal. Lo valida el estudio contable.',
        'Si dice que todavía no hay resultado, falta cargar los gastos del mes en Costos.',
      ],
      GERENCIA: [
        'Ves el tablero general del circuito de insumos: lotes en cuarentena, lotes aprobados, recepciones del mes y lotes sin rotular.',
        'Cada tarjeta lleva a la lista correspondiente. Tocá una para ver el detalle.',
        'Más abajo ves el ingreso de lotes de los últimos 30 días, los lotes por estado y un resumen de catálogo, proveedores y vencimientos próximos.',
        'Solo mirás. Las acciones las hace cada área.',
      ],
      CONTROL_CALIDAD: [
        'Ves el tablero general del circuito de insumos. Lo más importante para vos es la lista «En cuarentena, a muestrear».',
        'Tocá un insumo de esa lista para abrir el lote y registrar el muestreo.',
        'Las tarjetas de arriba te muestran cuántos lotes hay en cada estado y cuántos recibidos esperan su rótulo.',
      ],
      OPERARIO: [
        'Ves tus tareas de planta: por cada orden que abrió Gerencia de Producción, el próximo paso (pesada, elaboración o fraccionamiento).',
        'Elegí una y tocá «Hacer».',
        'Contestá las verificaciones previas (área limpia, balanza, vestimenta según protocolo…). Si alguna da «No», anotá el desvío en observaciones.',
        'Completá lo que pide el POE: en la pesada, cuánto pesaste de cada materia prima, el lote y la balanza; en la elaboración, cada paso con su hora y equipo; en el fraccionamiento, envases, horarios y canastas.',
        'Tocá «Registrar (realizó)»: ese es tu ok y queda en el batch record a tu nombre. Después lo controla otra persona.',
        'Cuando terminás un paso, aparece el siguiente de esa orden.',
      ],
      ADMINISTRADOR_SISTEMA: [
        'Ves el tablero general del circuito de insumos, en modo lectura.',
        'Tus herramientas propias (Usuarios, Quién ve qué, Auditoría) están en el menú.',
      ],
    },
    aTener: [
      'Los números se actualizan solos. Si algo no coincide con lo que esperabas, tocá la tarjeta y mirá el detalle.',
    ],
  },

  '/lotes': {
    queEs:
      'La lista de todos los lotes de insumo que se recibieron, con su estado de calidad y su rótulo. Sirve para buscar un lote y abrir su ficha.',
    porRol: {
      OPERARIO: [
        'Buscá por número interno, lote del proveedor o nombre del insumo.',
        'Filtrá por estado con los botones de arriba: «Todos», cuarentena, aprobado, etc.',
        'Tocá una fila para abrir la ficha del lote.',
        'Desde la ficha podés poner en cuarentena un lote recién recibido. No podés aprobar ni rechazar.',
      ],
      GERENCIA_PRODUCCION: [
        'Buscá por número interno, lote del proveedor o nombre del insumo.',
        'Filtrá por estado con los botones de arriba.',
        'Tocá una fila para abrir la ficha. Ahí podés poner en cuarentena un lote recién recibido y mover stock.',
        'No aprobás ni rechazás lotes: eso es de Calidad y Dirección Técnica.',
      ],
      GERENCIA: [
        'Buscá por número interno, lote del proveedor o nombre del insumo, y filtrá por estado.',
        'Tocá una fila para ver la ficha completa del lote.',
        'Podés bloquear un lote para despacho desde la ficha, pero no aprobarlo ni rechazarlo.',
      ],
      CONTROL_CALIDAD: [
        'Filtrá por «Cuarentena» para ver lo que falta muestrear.',
        'Tocá un lote para abrirlo y seguir el circuito: muestreo, análisis, aprobado o rechazado.',
        'Buscá por número interno, lote del proveedor o insumo.',
      ],
      DIRECCION_TECNICA: [
        'Filtrá por «Cuarentena» para ver lo que falta muestrear y aprobar.',
        'Tocá un lote para abrirlo y llevarlo por el circuito de calidad.',
        'Buscá por número interno, lote del proveedor o insumo.',
      ],
    },
    aTener: [
      'El circuito es: recibido, cuarentena, muestreado, en análisis y finalmente aprobado o rechazado (POE I.20.1). Aprobado y rechazado son finales.',
    ],
  },

  '/lotes/:id': {
    queEs:
      'La ficha de un lote de insumo: sus datos, su estado de calidad, el rótulo vigente, la existencia por depósito, los bloqueos y los muestreos. Los botones de arriba cambian según el estado del lote y tu rol.',
    porRol: {
      OPERARIO: [
        'Si el lote está «recibido», tocá «Poner en cuarentena». Se emite el rótulo amarillo y el material va al depósito de cuarentena.',
        'Tocá «Imprimir rótulo» para sacar el rótulo vigente.',
        'Más abajo ves la existencia y los movimientos. Solo lectura.',
        'No podés muestrear, aprobar ni rechazar.',
      ],
      GERENCIA_PRODUCCION: [
        'Si el lote está «recibido», tocá «Poner en cuarentena».',
        'En «Existencia» ves cuánto hay en cada depósito y podés registrar un movimiento de stock.',
        'En «Movimientos» podés tocar «Anular» en uno: no se borra, se genera el movimiento inverso y te pide el motivo.',
        'No muestreás, aprobás ni rechazás.',
      ],
      CONTROL_CALIDAD: [
        'Con el lote en cuarentena, tocá «Registrar muestreo». Completá las verificaciones previas y la cantidad tomada. Al guardar se emite la etiqueta de la muestra y el lote pasa a muestreado.',
        'Con el lote muestreado, tocá «Enviar a análisis». Se emite el rótulo gris.',
        'Con el lote en análisis, tocá «Aprobar» o «Rechazar»: se abre el registro de análisis (R.50.5.1, o R.50.6.1 si es semielaborado). Completá tamaño de la muestra, descripción y conclusiones y tocá «Registrar análisis y dictamen». El registro y el rótulo (verde o rojo) se hacen juntos.',
        'El registro queda siempre visible en la ficha del lote, en «Registro de análisis».',
        'En «Bloqueos» podés tocar «Bloquear lote para despacho» con un motivo y un fundamento. Levantar un bloqueo lo hace solo Dirección Técnica.',
      ],
      DIRECCION_TECNICA: [
        'Con el lote en cuarentena, tocá «Registrar muestreo» y completá las verificaciones. Se emite la etiqueta de la muestra.',
        'Con el lote muestreado, «Enviar a análisis». Con el lote en análisis, «Aprobar» o «Rechazar», que abren el registro de análisis (R.50.5.1 o R.50.6.1).',
        'En «Bloqueos» podés bloquear el lote para despacho con motivo y fundamento, y levantar un bloqueo con «Levantar» (pide el motivo).',
        'En «Existencia» podés registrar movimientos de stock y anular uno (se genera el inverso).',
      ],
      GERENCIA: [
        'Ves todos los datos del lote, su rótulo y su historia.',
        'En «Bloqueos» podés bloquear el lote para despacho con motivo y fundamento.',
        'No aprobás, rechazás ni movés stock.',
      ],
    },
    aTener: [
      'Aprobar y rechazar quedan registrados a tu nombre y no se deshacen. Si un estado fue un error, se corrige con una no conformidad, no revirtiendo.',
      'El rótulo anterior queda no vigente cada vez que cambia el estado, pero queda guardado.',
      'Un lote bloqueado no se puede despachar aunque esté aprobado. Un motivo vigente no se puede repetir.',
      'POE: I.20.1 (recepción), I.20.2 (rótulos), I.50.4 (muestreo).',
    ],
  },

  '/stock': {
    queEs:
      'Todo lo de existencias en pestañas: «Insumos», «Recepciones», «Stock de seguridad», «En fábrica» y «Conteo». Cada rol ve solo las pestañas que le tocan.',
    porRol: {
      OPERARIO: [
        'En «Insumos» ves cuánto hay de cada artículo, con el desglose por lote y depósito. Usá el buscador o los filtros «Con existencia», «Bajo el mínimo» y «Con material retenido».',
        'En «Recepciones» tocá «Nueva recepción» cuando llega mercadería. Elegí el proveedor; el N° de remito es opcional. Agregá cada lote con insumo, lote del proveedor, bultos, cantidad y plazo de validez, y tildá lo que corresponda (protocolo recibido, contenedores limpiados).',
        'Si dejás tildado «Emitir rótulo de cuarentena al guardar», el material queda rotulado en amarillo. Tocá «Registrar recepción».',
        'La sección «Comprobante del proveedor» (la factura) es opcional: con «Cargar la factura ahora» la completás. Si no la cargás, le queda a Administración en «Facturas por cargar».',
        'En «Stock de seguridad» y «En fábrica» solo mirás.',
        'No cargás recepciones a stock ni dás de baja.',
      ],
      GERENCIA_PRODUCCION: [
        'En «Insumos» abrí un artículo para ver su desglose. Ahí está «Dar de baja todo el stock», que descarta todas las posiciones con saldo (pide el motivo).',
        'En «Recepciones» tocá «Nueva recepción» al llegar mercadería. Cuando está conciliada, tocá «Cargar a stock» en esa fila.',
        'En «Stock de seguridad» mirás qué está por debajo del mínimo.',
        'En «Conteo» hacés el inventario por diferencia.',
        'En «En fábrica» ves el producto terminado.',
      ],
      DIRECCION_TECNICA: [
        'En «Recepciones» mirás lo que llegó para aprobar calidad y cantidad. Podés tocar «Nueva recepción» y «Cargar a stock».',
        'En el desglose de un artículo podés usar «Dar de baja todo el stock» (pide el motivo).',
        'Al registrar una recepción, la sección «Comprobante del proveedor» no se te muestra: la factura la carga Administración desde «Facturas por cargar».',
      ],
      ADMINISTRACION: [
        'En «Recepciones» ves cada recepción con su remito, su comprobante y si está cargada a stock.',
        'Tocá «Cargar a stock» en una recepción pendiente: se registra una entrada por cada lote. No se deshace.',
        'Las recepciones sin factura aparecen en «Facturas por cargar» de tu inicio. Ahí completás el comprobante del proveedor.',
        'En «En fábrica» ves el producto terminado.',
        'No registrás recepciones nuevas ni tocás calidad.',
      ],
      CONTROL_CALIDAD: [
        'En «Insumos» ves las existencias.',
        'En «Recepciones» podés tocar «Nueva recepción» y ver cada ingreso.',
        'Para aprobar o rechazar lotes andá a la ficha del lote, desde «Lotes».',
      ],
      GERENCIA: [
        'Ves «Insumos», «Recepciones», «Stock de seguridad», «En fábrica» y «Conteo» en modo lectura.',
        'No registrás ni cargás nada.',
      ],
    },
    aTener: [
      'Un movimiento de stock no se edita ni se borra. Se anula con un movimiento inverso, con motivo.',
      'La pestaña vuelve a abrirse donde la dejaste: el enlace guarda la pestaña.',
    ],
  },

  '/liberacion': {
    queEs:
      'Los lotes de producto terminado que esperan la firma de Dirección Técnica, y los últimos ya resueltos. La firma se hace en la orden; desde acá la abrís o bajás el batch record.',
    porRol: {
      DIRECCION_TECNICA: [
        '¿Primera vez? Tocá «Ver un lote de ejemplo»: es un batch record inventado, con marca de agua «SOLO EJEMPLO», que podés descargar para conocer el documento.',
        'Arriba ves los lotes que esperan liberación.',
        'Tocá «Batch record» para revisar el registro completo del lote.',
        'Tocá «Liberar o rechazar»: te lleva a la orden, donde tocás el mismo botón y firmás.',
        'Abajo ves los últimos 30 lotes ya liberados o rechazados.',
      ],
      CONTROL_CALIDAD: [
        'Ves los lotes que esperan liberación y los ya resueltos.',
        'Tocá «Batch record» para revisar el registro de un lote.',
        'Podés abrir la orden, pero liberar o rechazar lo firma solo Dirección Técnica.',
      ],
      GERENCIA: [
        'Ves los lotes que esperan liberación y los ya resueltos, y abrís su batch record.',
        'Es solo lectura: no liberás ni rechazás.',
      ],
    },
    aTener: [
      'Liberar habilita la venta del lote. Es una firma y no se deshace.',
      'Un lote no se puede liberar si falta registrar o controlar alguna etapa: el sistema te lo avisa.',
    ],
  },

  '/ordenes': {
    queEs:
      'Las órdenes de producción: una por lote, con su registro de la pesada a la liberación. De cada orden sale el batch record.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá «Abrir orden». Elegí la fórmula, el producto, la especificación, la fecha de elaboración y la cantidad teórica en kg.',
        'Completá partida y presentación del lote, y el vencimiento (vacío calcula fecha + vida útil).',
        'Guardá. La orden aparece en la lista; tocala para empezar a registrar las etapas.',
        'Con «Equipos» das de alta balanzas y otros equipos para usar en los registros.',
      ],
      DIRECCION_TECNICA: [
        'Podés abrir órdenes con «Abrir orden» y dar de alta equipos con «Equipos».',
        'Tocá una orden de la lista para ver sus etapas y liberar el lote cuando esté terminada.',
      ],
      OPERARIO: [
        'Ves la lista de órdenes con su estado.',
        'Tocá una orden para registrar las etapas de producción que te toquen.',
        'No abrís ni anulás órdenes.',
      ],
      CONTROL_CALIDAD: [
        'Ves la lista de órdenes con su estado.',
        'Tocá una orden para registrar y controlar las etapas de control de calidad.',
      ],
      GERENCIA: [
        'Ves la lista de órdenes y abrís cada una para consultar su avance.',
        'Es solo lectura.',
      ],
    },
    aTener: [
      'El número de una orden anulada no se reutiliza.',
    ],
  },

  '/ordenes/:id': {
    queEs:
      'La ficha de una orden de producción, con las nueve etapas del registro. Cada etapa la registra alguien («Realizó») y otra persona la cierra con «Controlar». Con todo controlado, la orden se termina y Dirección Técnica libera el lote.',
    porRol: {
      OPERARIO: [
        'En cada etapa sin registrar tocá «Registrar» y completá los datos que pide. Si una verificación da NO, tenés que anotar el desvío.',
        'Mientras no esté controlada, podés tocar «Corregir» para cambiar lo cargado.',
        'La etapa pasa a «falta controlar». La controla otra persona.',
        'No registrás las etapas de control de calidad, ni terminás ni anulás la orden.',
      ],
      GERENCIA_PRODUCCION: [
        'Registrá cada etapa con «Registrar» y cerrala con «Controlar». Lo ideal es que controle otra persona: si sos la misma, aparece «misma persona».',
        'Tocá «Batch record» para ver el documento imprimible.',
        'Con todas las etapas cargadas, tocá «Terminar» y completá la cantidad obtenida y las unidades.',
        'Mientras la orden esté abierta, «Anular» la cierra con motivo.',
      ],
      CONTROL_CALIDAD: [
        'Granel: en «Control de calidad de producto a granel» tocá «Analizar granel (R.50.10.1)», completá el registro y el dictamen. Producción puede envasar antes; el lote no se libera sin este registro aprobado. Te aparece en «Análisis pendientes» del tablero.',
        'Producto terminado: en «Control de calidad de producto terminado» tocá «Registrar» y cargá los resultados contra la especificación.',
        'Después tocá «Controlar» para cerrar la etapa. Lo ideal es que sea otra persona la que controle.',
        'Podés registrar también las etapas de producción, igual que el resto.',
      ],
      DIRECCION_TECNICA: [
        'Podés registrar y controlar cualquier etapa, terminar y anular la orden mientras está abierta.',
        'Con la orden terminada, tocá «Liberar o rechazar». Si falta algo, el cartel «Todavía no se puede liberar» dice qué.',
        'Para rechazar escribí el motivo y tocá «Rechazar el lote». Para liberar, «Liberar al mercado».',
        'Tocá «Batch record» para revisar el documento antes de firmar.',
      ],
      GERENCIA: [
        'Ves todas las etapas, quién las hizo y quién las controló.',
        'Tocá «Batch record» para ver el documento.',
        'Solo lectura.',
      ],
    },
    aTener: [
      'Una etapa controlada no se modifica. Liberar y rechazar son firmas y no se deshacen.',
      'Al terminar, la cantidad obtenida y las unidades quedan registradas con tu nombre.',
      'POE: I.40.16 (pesada), I.50.5 (control de producto terminado).',
    ],
  },

  '/ordenes/:id/batch-record': {
    queEs:
      'El batch record del lote: el documento con todo lo registrado en cada etapa, listo para imprimir o guardar como PDF.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Revisá que cada etapa tenga sus datos.',
        'Tocá «Descargar PDF» para imprimir o guardar el documento.',
        'Tocá «Volver a la orden» para regresar a la ficha.',
      ],
      OPERARIO: [
        'Mirá el registro completo del lote.',
        'Tocá «Descargar PDF» si necesitás una copia.',
        'Tocá «Volver a la orden» para regresar.',
      ],
      CONTROL_CALIDAD: [
        'Revisá los resultados y los controles de todas las etapas.',
        'Tocá «Descargar PDF» para guardar una copia.',
      ],
      DIRECCION_TECNICA: [
        'Revisalo completo antes de liberar el lote.',
        'Tocá «Descargar PDF» para guardar una copia y «Volver a la orden» para firmar.',
      ],
      GERENCIA: [
        'Consultá el registro completo del lote.',
        'Tocá «Descargar PDF» si necesitás una copia.',
      ],
    },
    aTener: [
      'Este documento no se edita: refleja lo cargado en la orden. La firma física del batch record se hace aparte.',
    ],
  },

  '/especificaciones': {
    queEs:
      'Los requisitos de cada producto (documentos I-E.50.xx): composición, almacenamiento, vida útil y los límites que tiene que cumplir. Las órdenes controlan el producto contra estas especificaciones.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá «Nueva especificación» y cargá los datos del documento: denominación, composición y vida útil.',
        'Abrí la especificación y, mientras sea borrador, cargá los componentes con su % mínimo y máximo, y los requisitos con su criterio, mínimo y máximo.',
        'Tocá «Datos generales» para editar la cabecera mientras es borrador.',
        'La aprueba Dirección Técnica. Vos no.',
        'Si ya está aprobada, escribí «Motivo de la nueva versión» y emití otra versión.',
      ],
      DIRECCION_TECNICA: [
        'Revisá la especificación en borrador y corregila si hace falta.',
        'Tocá «Aprobar (DT)» para dejarla vigente.',
        'Para cambiar una ya vigente, escribí el «Motivo de la nueva versión» y emití una nueva.',
        'También podés tocar «Nueva especificación» para cargar una desde cero.',
      ],
      CONTROL_CALIDAD: [
        'Abrí una especificación para ver qué tiene que cumplir cada producto.',
        'Solo lectura: no creás ni aprobás.',
      ],
      GERENCIA: [
        'Abrí una especificación para ver sus requisitos.',
        'Solo lectura.',
      ],
    },
    aTener: [
      'Una especificación vigente no se edita: se emite una versión nueva y queda el historial.',
      'POE: I-E.50.xx (especificaciones de producto).',
    ],
  },

  '/formulas': {
    queEs:
      'Dos pestañas: «Fórmulas» (la fórmula maestra de cada producto, en porcentaje) y «Calculadora de lote» (cuánto pesar de cada componente para el lote que quieras).',
    porRol: {
      DIRECCION_TECNICA: [
        'En «Fórmulas» tocá «Nueva fórmula»: elegí el producto, la variedad, el código ME y la versión.',
        'Se abre la ficha de la fórmula para cargar los componentes.',
        'Tocá una fórmula de la lista para verla o editarla si está en borrador.',
        'En «Calculadora de lote» elegí una fórmula y el objetivo. Te dice cuánto pesar.',
      ],
      GERENCIA_PRODUCCION: [
        'En «Fórmulas» ves cuál está vigente para cada producto, antes de pesar un lote. Solo lectura.',
        'En «Calculadora de lote» elegí una fórmula, cargá el volumen (L) o la masa (kg) objetivo y la temperatura de trabajo.',
        'Tocá «Qué lleva cada producto» para ver la lista de materiales.',
      ],
      OPERARIO: [
        'En «Fórmulas» podés ver qué fórmula está vigente. Solo lectura.',
        'En «Calculadora de lote» elegí la fórmula y el objetivo para saber cuánto pesar de cada componente.',
        'Si aparece un cartel rojo, corregí el dato que señala.',
      ],
      CONTROL_CALIDAD: [
        'Mirá las fórmulas y su estado. Solo lectura.',
        'Podés usar la calculadora para verificar cantidades.',
      ],
      GERENCIA: [
        'Mirá las fórmulas y su estado. Solo lectura.',
        'Podés usar la calculadora de lote.',
      ],
    },
    aTener: [
      'Una fórmula vigente no se edita: la corrección es una versión nueva. Solo Dirección Técnica las crea y edita.',
      'POE: PG.60.8 (fórmula maestra).',
    ],
  },

  '/formulas/:id': {
    queEs:
      'La ficha de una fórmula de fabricación: sus componentes en porcentaje, la densidad del producto, el procedimiento y su estado (borrador, vigente o dada de baja).',
    porRol: {
      DIRECCION_TECNICA: [
        'Con la fórmula en borrador, cargá los componentes con «Agregar componente»: insumo, porcentaje y etapa si corresponde. Uno puede ir como «c.s.p.».',
        'Revisá el resumen de porcentajes: tiene que cerrar.',
        'Cargá la densidad del producto terminado y guardala.',
        'Tocá «Cargar procedimiento» para escribir los pasos de elaboración. Cada salto de línea es un paso.',
        'Cuando esté lista, tocá «Marcar como vigente». Después no se puede editar.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves la fórmula en modo lectura: componentes, densidad y estado.',
        'Podés cargar o editar el procedimiento con «Editar» o «Cargar procedimiento».',
        'En «Versiones anteriores» ves cómo estaba escrito antes.',
      ],
      OPERARIO: [
        'Ves la fórmula en modo lectura.',
        'Tocá el botón de más información para leer el procedimiento mientras producís.',
      ],
      CONTROL_CALIDAD: [
        'Ves la fórmula completa en modo lectura.',
        'Revisá componentes, densidad y procedimiento.',
      ],
      GERENCIA: [
        'Ves la fórmula completa en modo lectura.',
      ],
    },
    aTener: [
      'Marcar como vigente no se deshace. Para corregir una vigente se emite una versión nueva desde «Nueva fórmula».',
      'Para pasar a vigente tiene que estar cargada la densidad del producto.',
    ],
  },

  '/pedidos': {
    queEs:
      'La bandeja de pedidos. Se cargan acá, Producción los revisa contra el stock y lo que falta queda anotado en compras. Arriba elegís la vista: «Tablero», «Para revisar», «En producción», «Borradores» o «Cerrados».',
    porRol: {
      ADMINISTRACION: [
        'Tocá «Nuevo pedido». Elegí el cliente, la fecha de «Entrega comprometida» y agregá productos con su cantidad y precio.',
        'Guardalo como borrador y revisalo.',
        'Abrí el pedido y tocá «Enviar a producción» cuando esté completo.',
        'En «Borradores» ves los que todavía no mandaste.',
        'Tocá «Compras pendientes» para ver lo que falta comprar.',
      ],
      GERENCIA_PRODUCCION: [
        'En «Para revisar» están los pedidos enviados y todavía sin tomar. Abrí cada uno para ver si alcanza el material.',
        'En «En producción» están los que ya tomaste.',
        'Podés cargar uno con «Nuevo pedido».',
        'Tocá «Compras pendientes» para ver lo que falta comprar.',
      ],
      OPERARIO: [
        'Ves el tablero con lo que está en curso. Tocá una tarjeta para abrir el pedido.',
        'Solo lectura: no cargás ni cambiás pedidos.',
      ],
      GERENCIA: [
        'Ves todos los pedidos en curso y los cerrados.',
        'Tocá una tarjeta para abrir el pedido.',
        'Solo lectura.',
      ],
    },
    aTener: [
      'Los pedidos de venta al público (S-xxxx) no están acá: viven en Ventas.',
      'La cobertura de stock no se calcula en la lista: se ve al abrir cada pedido.',
    ],
  },

  '/pedidos/:id': {
    queEs:
      'La ficha de un pedido: sus productos, la entrega comprometida y si alcanza el material para fabricarlo. Los botones de arriba ofrecen el paso siguiente del circuito: borrador, enviado, en producción y terminado.',
    porRol: {
      ADMINISTRACION: [
        'En borrador podés corregir los productos y tocar «Aplicar precios de lista».',
        'Tocá «Enviar a producción» cuando esté completo (necesita al menos un producto).',
        'Si lo enviaste por error, «Devolver a borrador» lo saca de la bandeja de Producción.',
        'Si falta material, tocá «Anotar» en un insumo o «Anotar todo lo que falta» para dejarlo en Compras pendientes.',
        'Podés despachar y facturar desde esta ficha. «Cancelar» y «Borrar pedido» piden confirmación o motivo.',
      ],
      GERENCIA_PRODUCCION: [
        'Mirá el cartel de cobertura: dice si alcanza el material o qué falta.',
        'Con «Anotar» o «Anotar todo lo que falta» pasás los faltantes a Compras pendientes.',
        'Tocá «Pasar a producción» para tomar el pedido. En «Órdenes de producción» tocá «Abrir orden» para fabricarlo.',
        'Al terminar de fabricar, tocá «Terminado»: completá lo que realmente se usó de cada insumo (si difiere, pide el motivo) y lo producido. Descuenta el stock.',
        'Tocá «Despachar» para entregar el pedido al cliente.',
      ],
      DIRECCION_TECNICA: [
        'Podés tomar el pedido, abrir órdenes, anotar faltantes y tocar «Terminado», igual que Gerencia de Producción.',
        'Si el pedido es de un cliente tercerizado, al pasar a producción elegís de qué stock sale cada insumo.',
      ],
      OPERARIO: [
        'Ves el pedido, su estado y si alcanza el material.',
        'Solo lectura.',
      ],
      GERENCIA: [
        'Ves el pedido y su cobertura de material.',
        'Podés tocar «Despachar» cuando corresponda.',
      ],
    },
    aTener: [
      '«Terminado» descuenta el stock y cierra el pedido todo junto, y no se deshace: se corrige con ajustes de stock.',
      '«Cancelar» deja el pedido en «Cerrados». Las compras que ya anotaste siguen en la lista hasta que alguien las descarte.',
      'Un pedido borrado no figura en ninguna bandeja, pero queda registrado.',
    ],
  },

  '/planificacion': {
    queEs:
      'Qué se produce cada día y cuánto dura cada pedido. Hay dos vistas: «Gantt» y «Calendario». La línea roja es la entrega comprometida.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Abajo, en «Sin planificar», tocá «Planificar» en un pedido. Elegí cuándo «Empieza a producirse» y los «Días de producción». Guardá.',
        'Para mover un pedido ya planificado usá las flechas del bloque (un día antes o después) y los botones de más o menos días.',
        'Para sacarlo del plan, tocá su número abajo y «Sacar del plan».',
        'Con las flechas del encabezado y «Hoy» te movés en el tiempo.',
      ],
      DIRECCION_TECNICA: [
        'Planificás igual que Gerencia de Producción: «Planificar» en cada pedido sin planificar, flechas para moverlo.',
        'Cambiá entre «Gantt» y «Calendario» arriba.',
      ],
      GERENCIA: [
        'Ves el plan en «Gantt» y «Calendario».',
        'Solo lectura: no movés pedidos.',
      ],
    },
    aTener: [
      'Planificar no abre la orden de producción ni cambia el estado del pedido: solo agenda.',
    ],
  },

  '/tercerizados': {
    queEs:
      'Los clientes para los que Nail Show fabrica con su propia marca. Cada uno tiene su stock, sus productos y sus pedidos, aparte de los de Nail Show.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá un cliente para abrir su ficha.',
        'Tocá «Nuevo cliente» para dar de alta uno.',
        'Dentro de la ficha cargás su stock, sus productos y sus pedidos.',
      ],
      GERENCIA: [
        'Tocá un cliente para ver su ficha.',
        'Tocá «Nuevo cliente» para dar de alta uno.',
        'No cargás stock ni productos.',
      ],
    },
    aTener: [
      'El stock de un cliente tercerizado es aparte del de Nail Show. No se mezcla.',
    ],
  },

  '/tercerizados/:id': {
    queEs:
      'La ficha de un cliente tercerizado, con cuatro pestañas: «Pedidos», «Stock», «Productos» y «Producción».',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Pedidos» tocá «Nuevo pedido». Arriba un cartel te dice qué tiene que traer el cliente para los pedidos en curso.',
        'En «Stock» tocá «Agregar stock» cuando el cliente trae material. Lo que entra queda en cuarentena hasta que Calidad lo apruebe. Con «Quitar» sacás stock.',
        'En «Productos» tocá «Nuevo producto» (uno nuevo o uno de Nail Show con la etiqueta del cliente).',
        'En «Producción» ves los pedidos en producción y los terminados.',
        'Con «Editar» cambiás los datos del cliente.',
        'Al pasar un pedido a producción, elegís insumo por insumo si sale del stock de Nail Show o del cliente.',
      ],
      GERENCIA: [
        'Ves los pedidos, el stock, los productos y la producción del cliente.',
        'Podés tocar «Editar» y «Nuevo pedido».',
        'No cargás stock ni productos.',
      ],
    },
    aTener: [
      'El material del cliente que ingresa entra a cuarentena y sigue el circuito de calidad como cualquier otro.',
    ],
  },

  '/catalogos': {
    queEs:
      'Los listados maestros del sistema en cuatro pestañas: «Productos», «Insumos», «Proveedores» y «Depósitos». Todo lo demás (recepciones, órdenes) se arma sobre ellos.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Insumos» y «Productos» tocá el botón de alta para cargar uno nuevo. La ficha del insumo define qué se exige al recibirlo y a qué depósito va.',
        'En «Proveedores» podés dar de alta uno nuevo. Aprobarlo es solo de Dirección Técnica.',
        'En «Depósitos» solo mirás.',
      ],
      DIRECCION_TECNICA: [
        'Cargás y editás insumos y productos.',
        'En «Proveedores» das de alta y tocás «Aprobar» o «Rechazar» para dictaminar. El dictamen es solo tuyo.',
        'En «Depósitos» ves los diez depósitos y su dedicación.',
      ],
      CONTROL_CALIDAD: [
        'Consultás insumos, productos, proveedores y depósitos.',
        'Solo lectura.',
      ],
      GERENCIA: [
        'Consultás insumos, productos, proveedores y depósitos.',
        'Solo lectura.',
      ],
    },
    aTener: [
      'Sin un insumo y un proveedor cargados no se puede registrar una recepción.',
      'El dictamen de un proveedor (aprobado o rechazado) queda a nombre de quien lo firma.',
    ],
  },

  '/compras': {
    queEs:
      'Lo que falta comprar para cubrir los pedidos, anotado desde la ficha de cada pedido. Hay dos vistas: «Abiertas» e «Historial».',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Abiertas» ves cada compra con su insumo, cantidad y fecha límite. Las más urgentes van arriba.',
        'Cuando le pedís al proveedor, tocá «Ya lo pedí».',
        'Cuando llega, tocá «Resuelto».',
        'Si ya no hace falta, tocá «Descartar» y escribí el motivo (mínimo 5 caracteres).',
        'Un aviso te marca si el mismo insumo está anotado para más de un pedido: sumá antes de comprar.',
      ],
      ADMINISTRACION: [
        'En «Abiertas» marcás «Ya lo pedí» cuando hacés el pedido al proveedor y «Resuelto» cuando llega.',
        'Con «Descartar» sacás una compra con su motivo.',
        'En «Historial» ves las resueltas y descartadas.',
      ],
      GERENCIA: [
        'Ves las compras abiertas y el historial.',
        'Solo lectura.',
      ],
    },
    aTener: [
      '«Resuelto» no da entrada al stock. El material entra cuando se registra su recepción, con su lote y su circuito de calidad.',
      'Una compra descartada queda en el historial con su motivo.',
    ],
  },
};
