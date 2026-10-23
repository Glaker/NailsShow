import { FINANZAS } from '@/features/auth/sesion';
import type { MapaAyuda } from './tipos';

/** Ayuda «¿Cómo funciona?» de las pantallas de producción, stock y calidad. */
export const AYUDA_PRODUCCION: MapaAyuda = {
  '/': {
    queEs:
      'Tu pantalla de inicio. Cada rol ve lo que le toca hacer hoy, y nada más: los números y las filas son atajos que llevan directo a la pantalla donde se resuelve. Los datos salen de lo que se registra en el resto del sistema (lotes, órdenes, pedidos), así que cambian solos a medida que el equipo trabaja.',
    porRol: {
      DIRECCION_TECNICA: [
        'Arriba ves dos contadores grandes: «Insumos sin aprobar» (lotes de insumo en cuarentena o en análisis) y «Lotes de producto por liberar» (órdenes terminadas que esperan tu firma).',
        'Tocá «Insumos sin aprobar» para ir a la lista de lotes en cuarentena. Ahí registrás el muestreo, mandás a análisis y aprobás o rechazás.',
        'Tocá «Lotes de producto por liberar» para ir a Liberación y firmar los lotes terminados.',
        '«Análisis pendientes» lista los lotes de insumo en análisis y los graneles que Producción ya elaboró. Cada fila abre el lote o la orden. Producción puede envasar el granel igual, pero el lote no se libera sin su registro de análisis aprobado.',
        '«Insumos en cuarentena o en análisis» es una tabla con insumo, cantidad, proveedor, fecha de recepción y estado. Tocá el nombre del insumo para abrir su ficha.',
        '«Producto terminado esperando liberación» lista cada lote con su producto y cantidad. Tocá el número de lote para abrir la orden, o «Ir a liberación».',
      ],
      GERENCIA_PRODUCCION: [
        'Arriba ves cuatro contadores: «Pedidos pendientes», «En producción», «Sin planificar» y «Con la entrega vencida» (se pone en rojo si hay alguno).',
        'En «Resumen de pedidos» ves hasta diez pedidos, los más urgentes primero. Cada fila muestra el número, el cliente, si ya tiene fecha de producción («produce dd/mm») o está «sin planificar», y la fecha de entrega. Tocá el número de un pedido para abrirlo.',
        'Abajo hay un Gantt de las próximas dos semanas y un calendario del mes. Acá solo se miran: para mover algo andá a «Planificación».',
        'Al final están las «Tareas de planta», las mismas que ven los operarios. Si la pesada la hacés vos, tocá «Hacer» en esa tarjeta y completala como ellos.',
        'Asignar es opcional: en cada tarjeta elegí la persona en «Para todos» si querés que sea de alguien. Sin asignar, la ven todos.',
        '«Nueva tarea» te deja pedir lo que quieras («Poner etiquetas a…»), para alguien o para todos.',
        'Cuando alguien termina, aparece un puntito rojo al lado de «Tablero» y el aviso «Terminaron»: ahí podés tocar «Asignarle otra tarea» o «Visto».',
      ],
      VENTAS: [
        'Arriba ves cuatro contadores de los pedidos en curso: «Pedidos pendientes», «En producción», «Sin planificar» y «Con la entrega vencida».',
        'En «Resumen de pedidos» ves hasta diez pedidos, los de entrega más cercana primero, con su cliente, si ya tienen fecha de producción o están «sin planificar», y la fecha de entrega. Tocá el número de un pedido para abrirlo.',
        'El Gantt y el calendario de abajo son solo para mirar cuándo se produce cada pedido. No se mueve nada desde acá.',
      ],
      ENCARGADA_STOCK: [
        'Tu inicio tiene dos pestañas: «Pedidos a armar» y «Stock de Calle 5».',
        'En «Pedidos a armar» ves una tarjeta por pedido con su número, el cliente y una tabla de «Código», «Producto», «Armar» (cuánto falta preparar) y «En C5» (cuánto hay en Calle 5, en verde si alcanza y en naranja si no).',
        'Con el pedido preparado, tocá «Enviado»: elegí «Va completo» o «Va con faltantes», confirmá cuánto sale de cada producto y, si sale distinto de lo pedido, escribí por qué.',
        'Si hay botones «Hay» y «Falta» en la tarjeta, sirven para avisar el estado del stock: «Hay» lo confirma; «Falta» te pide escribir qué falta y avisa a Ventas con «Avisar a Ventas».',
        'En «Stock de Calle 5» ves y registrás lo que entra y sale del local.',
      ],
      ADMINISTRACION: [
        'Tu inicio es el tablero de Administración: pagos vencidos, solicitudes por aprobar, facturas por cargar, diferencias con proveedores y la posición del mes. Cada bloque lleva a la pantalla donde se resuelve.',
        'En «Facturas por cargar» aparecen las recepciones de mercadería a las que todavía nadie les cargó la factura del proveedor. Tocá «Cargar» en cada una y completá el comprobante.',
      ],
      [FINANZAS]: [
        'Tu inicio es el Resultado de gestión: la facturación del mes contra los costos.',
        'Es un resultado de gestión, no fiscal. Lo valida el estudio contable.',
        'Si dice que todavía no hay resultado, falta cargar los gastos del mes en Costos.',
      ],
      GERENCIA: [
        'Arriba ves cuatro tarjetas: «Lotes en cuarentena» (esperan muestreo), «Lotes aprobados» (disponibles para pesar), «Recepciones del mes» (con cuántas siguen sin carga administrativa) y «Sin rotular» (lotes recibidos sin rótulo de estado). Tocá una tarjeta para ir a la lista correspondiente.',
        'En «Ingreso de lotes» ves un gráfico de los últimos 30 días, y en «Lotes por estado» cuántos hay en cada estado de calidad.',
        'La tabla «En cuarentena, a muestrear» muestra los primeros ocho lotes con insumo, N° interno, proveedor y vencimiento (con una alerta si vence en 90 días o menos). Tocá el insumo para abrir el lote o «Ver todos» para la lista completa.',
        'El bloque «Resumen» cuenta insumos en catálogo, proveedores activos, proveedores sin dictamen, lotes que vencen en 90 días, lotes en análisis y usuarios habilitados.',
        'Solo mirás. Las acciones las hace cada área.',
      ],
      CONTROL_CALIDAD: [
        'Ves el tablero general del circuito de insumos. Lo más importante para vos es la tabla «En cuarentena, a muestrear», con los lotes que esperan muestreo (insumo, N° interno, proveedor y vencimiento).',
        'Tocá un insumo de esa lista para abrir el lote y registrar el muestreo. «Ver todos» te lleva a la lista de lotes en cuarentena.',
        'Las tarjetas de arriba muestran cuántos lotes hay en cuarentena, cuántos aprobados, las recepciones del mes y cuántos recibidos esperan su rótulo («Sin rotular»). «Lotes por estado» da el panorama completo del circuito.',
      ],
      OPERARIO: [
        'Ves tus tareas de planta: por cada orden que abrió Gerencia de Producción, el próximo paso (pesada, elaboración o fraccionamiento), más las tareas que te pidió («Poner etiquetas a…»). Las marcadas «Para todos» las puede hacer cualquiera; las que tienen tu nombre son tuyas.',
        'Elegí una y tocá «Hacer». Desde ese momento el sistema anota la hora de inicio: no la tenés que escribir.',
        'Contestá las verificaciones previas (área limpia, balanza, vestimenta según protocolo…). Si alguna da «No», anotá el desvío en observaciones: sin eso no se puede registrar.',
        'Completá lo que pide el POE: en la pesada, cuánto pesaste de cada materia prima, el lote y la balanza; en la elaboración, cada paso con su equipo; en el fraccionamiento, envases, horarios y cuántas cajas se llenaron.',
        'Horarios, fechas, tu nombre y el número de pesada los completa el sistema (dicen «automático»). Al agregar un paso nuevo se cierra la hora del anterior.',
        'Tocá «Listo, hecho»: ese es tu ok y queda en el batch record a tu nombre. A Producción le llega el aviso.',
        'En las tareas libres tocá «Empezar» al arrancar y «Listo» al terminar.',
        'Si dos hicieron la misma etapa, vale la primera que se registró: al segundo le aparece quién la hizo. Si la hicieron entre varios, la carga uno solo.',
      ],
      ADMINISTRADOR_SISTEMA: [
        'Ves el tablero general del circuito de insumos, en modo lectura: tarjetas de lotes en cuarentena y aprobados, recepciones del mes y lotes sin rotular, más los gráficos y el resumen de catálogo, proveedores y vencimientos.',
        'Tus herramientas propias (Usuarios, Quién ve qué, Auditoría) están en el menú.',
      ],
    },
    aTener: [
      'Los números se actualizan solos. Si algo no coincide con lo que esperabas, tocá la tarjeta y mirá el detalle.',
    ],
  },

  '/lotes': {
    queEs:
      'La lista de todos los lotes de insumo que se recibieron, cada uno con su estado en el circuito de calidad y su rótulo vigente. Cada fila muestra el insumo (con una llama si es inflamable), el N° interno, el lote del proveedor, el proveedor, el estado, el depósito, el vencimiento y la cantidad. Los lotes nacen cuando se registra una recepción en Stock; desde acá se busca uno y se abre su ficha.',
    porRol: {
      OPERARIO: [
        'Escribí en el buscador un N° interno (el que figura en el rótulo), un lote del proveedor o el nombre del insumo.',
        'Filtrá por estado con los botones de arriba: «Todos», «Recibido», «En cuarentena», «Muestreado», «En análisis», «Aprobado» o «Rechazado». El filtro queda en el enlace.',
        'En la columna «Vence» aparece «vencido» o los días que faltan si es dentro de 90 días.',
        'Tocá una fila para abrir la ficha del lote.',
        'Desde la ficha podés poner en cuarentena un lote recién recibido. No podés muestrear, aprobar ni rechazar.',
      ],
      GERENCIA_PRODUCCION: [
        'Escribí en el buscador un N° interno, un lote del proveedor o el nombre del insumo.',
        'Filtrá por estado con los botones de arriba («Todos», «Recibido», «En cuarentena», «Muestreado», «En análisis», «Aprobado», «Rechazado»).',
        'Tocá una fila para abrir la ficha. Ahí podés poner en cuarentena un lote recién recibido y registrar movimientos de stock.',
        'No aprobás ni rechazás lotes: eso es de Calidad y Dirección Técnica.',
      ],
      GERENCIA: [
        'Escribí en el buscador un N° interno, un lote del proveedor o el nombre del insumo, y filtrá por estado con los botones de arriba.',
        'Tocá una fila para ver la ficha completa del lote.',
        'Desde la ficha podés bloquear un lote para despacho, pero no aprobarlo ni rechazarlo.',
      ],
      CONTROL_CALIDAD: [
        'Filtrá por «En cuarentena» para ver lo que falta muestrear, y por «Muestreado» o «En análisis» para lo que sigue en el circuito.',
        'Tocá un lote para abrirlo y seguir el circuito: muestreo, análisis, aprobado o rechazado.',
        'Buscá por N° interno, lote del proveedor o insumo. Si llegás desde el tablero, el filtro ya viene puesto.',
      ],
      DIRECCION_TECNICA: [
        'Filtrá por «En cuarentena» para ver lo que falta muestrear, y por «En análisis» para lo que falta aprobar o rechazar.',
        'Tocá un lote para abrirlo y llevarlo por el circuito de calidad.',
        'Buscá por N° interno, lote del proveedor o insumo.',
      ],
    },
    aTener: [
      'El circuito es: recibido, cuarentena, muestreado, en análisis y finalmente aprobado o rechazado (POE I.20.1). Aprobado y rechazado son finales.',
    ],
  },

  '/lotes/:id': {
    queEs:
      'La ficha de un lote de insumo. Arriba están su nombre, su estado y los botones de acción, que cambian según el estado del lote y tu rol. Abajo: «Datos del lote» (cantidad, validez, depósito, recepción, protocolo), «Registro de análisis», «Bloqueos», «Existencia» y «Movimientos» por depósito, «Muestreos» e «Historial de rótulos». A la derecha está el rótulo vigente listo para imprimir.',
    porRol: {
      OPERARIO: [
        'Si el lote está «recibido», tocá «Poner en cuarentena» y confirmá con el mismo botón. Se emite el rótulo amarillo y el material va al depósito de cuarentena.',
        'Tocá «Imprimir rótulo» para sacar el rótulo vigente. Si hubo un muestreo, «Imprimir etiqueta» saca la etiqueta de la muestra.',
        'Más abajo ves la existencia por depósito, los movimientos, los muestreos y el historial de rótulos. Todo es solo lectura.',
        'No podés muestrear, aprobar ni rechazar.',
      ],
      GERENCIA_PRODUCCION: [
        'Si el lote está «recibido», tocá «Poner en cuarentena» y confirmá. Se emite el rótulo amarillo y el material va al depósito de cuarentena.',
        'En «Existencia» ves cuánto hay en cada depósito y si ese saldo se puede despachar. En cada fila hay dos botones de icono: «Transferir a otro depósito» (elegís destino, cantidad y motivo) y «Ajuste, descarte o muestra» (elegís el tipo, la cantidad en positivo y escribís el motivo, de al menos 10 caracteres).',
        'En «Movimientos» tocá «Anular» en uno: no se borra, se genera el movimiento inverso y te pide el motivo.',
        'No muestreás, aprobás ni rechazás.',
      ],
      CONTROL_CALIDAD: [
        'Con el lote en cuarentena, tocá «Registrar muestreo». Marcá las verificaciones previas (contenedor íntegro, contenedor limpio, rotulado correcto y, si el insumo trae protocolo, que el lote coincida con el certificado del proveedor) y confirmá la cantidad de contenedores. Si alguna da mal, no se muestrea.',
        'En la misma pantalla completá la cantidad tomada con su unidad (el sistema sugiere el tamaño de muestra y, si te apartás, tenés que justificarlo), el destino del sobrante y el área de muestreo. Podés anotar una circunstancia inusual y signos de no conformidad. Tocá «Registrar muestreo»: se emite la etiqueta de la muestra y el lote pasa a muestreado.',
        'Con el lote muestreado, tocá «Enviar a análisis» y confirmá. Se emite el rótulo gris.',
        'Con el lote en análisis, tocá «Aprobar» o «Rechazar»: se abre el registro de análisis (R.50.5.1, o R.50.6.1 si es semielaborado). Completá tamaño de la muestra, descripción de la muestra y observaciones y conclusiones, y tocá «Registrar análisis y dictamen». El registro y el rótulo (verde o rojo) se hacen juntos. Si rechazás, el sistema te recuerda abrir una no conformidad (PG.60.18).',
        'El registro queda siempre visible en la ficha del lote, en «Registro de análisis».',
        'En «Bloqueos» podés tocar «Bloquear lote», elegir el motivo, escribir el fundamento (al menos 10 caracteres) y tocar «Bloquear». Surte efecto de inmediato: el lote no se despacha. Levantar un bloqueo lo hace solo Dirección Técnica.',
      ],
      DIRECCION_TECNICA: [
        'Con el lote en cuarentena, tocá «Registrar muestreo»: marcá las verificaciones previas, completá la cantidad tomada, el destino del sobrante y el área de muestreo, y confirmá con «Registrar muestreo». Se emite la etiqueta de la muestra.',
        'Con el lote muestreado, tocá «Enviar a análisis». Con el lote en análisis, tocá «Aprobar» o «Rechazar»: abren el registro de análisis (R.50.5.1 o R.50.6.1), que se completa y se firma con «Registrar análisis y dictamen».',
        'En «Bloqueos» podés bloquear el lote con «Bloquear lote» (motivo y fundamento) y levantar un bloqueo vigente con «Levantar» (pide el motivo). Un bloqueo levantado no se borra: queda en la lista.',
        'En «Existencia» podés transferir entre depósitos o registrar un ajuste, descarte o muestra con los botones de icono de cada fila. En «Movimientos» podés tocar «Anular» (se genera el movimiento inverso, con motivo).',
        'Si hay un lote recién recibido, también podés tocar «Poner en cuarentena».',
      ],
      GERENCIA: [
        'Ves todos los datos del lote, su rótulo vigente, el registro de análisis y la historia de rótulos y muestreos.',
        'En «Bloqueos» podés tocar «Bloquear lote», elegir el motivo y escribir el fundamento (al menos 10 caracteres). Levantarlo es solo de Dirección Técnica.',
        'No aprobás, rechazás ni movés stock.',
      ],
    },
    aTener: [
      'Aprobar y rechazar quedan registrados a tu nombre y no se deshacen. Si un estado fue un error, se corrige con una no conformidad, no revirtiendo.',
      'El rótulo anterior queda no vigente cada vez que cambia el estado, pero queda guardado.',
      'Un lote bloqueado no se puede despachar aunque esté aprobado. Un motivo de bloqueo vigente no se puede repetir.',
      'POE: I.20.1 (recepción), I.20.2 (rótulos), I.50.4 (muestreo).',
    ],
  },

  '/stock': {
    queEs:
      'Todo lo de existencias, en pestañas: «Insumos», «Recepciones», «Stock de seguridad», «En fábrica» y «Conteo». Cada rol ve solo las pestañas que le tocan (se configuran en «Quién ve qué»). La pestaña elegida queda en el enlace. Los datos salen de los lotes recibidos, los movimientos de stock y los pedidos.',
    porRol: {
      OPERARIO: [
        'En «Insumos» ves cuánto hay de cada artículo: «Hay», «Despachable», «Mínimo», cantidad de lotes y qué vence primero. Usá el buscador («Insumo, código o SKU») o los filtros «Con existencia», «Bajo el mínimo», «Con material retenido» y «Todos». Tocá la flecha de una fila para ver el desglose por lote y depósito.',
        'En «Recepciones» tocá «Nueva recepción» cuando llega mercadería. Elegí el proveedor; el N° de remito es opcional. Activá, si corresponde, «Coincide con lo pedido» y «Proveedor nuevo», y anotá faltantes o roturas en «Observaciones».',
        'En «Lotes recibidos» tocá «Agregar lote» por cada insumo y completá insumo, lote del proveedor (como figura en el envase), bultos, cantidad, unidad y plazo de validez. Respondé «¿Los bultos pesan parecido?». Si el insumo exige protocolo del fabricante, tildá «Protocolo de análisis del fabricante recibido»: sin eso no se recepciona. Tildá «Contenedores limpiados» cuando corresponda. Con el icono «Quitar lote» sacás uno cargado por error.',
        'Si hay compras pendientes de esos insumos aparece «¿Es de alguna compra pendiente?»: marcá las que llegaron con este remito y «Llegó todo» si vino completa.',
        'Dejá tildado «Emitir rótulo de cuarentena al guardar» para que el material quede rotulado en amarillo (si no, se puede hacer después desde el lote). Tocá «Registrar recepción».',
        'La sección «Comprobante del proveedor» (la factura) es opcional: con «Cargar la factura ahora» la completás. Si no la cargás, le queda a Administración en «Facturas por cargar». El costo de cada lote no lo cargás vos.',
        'En «Stock de seguridad» y «En fábrica» solo mirás.',
        'No cargás recepciones a stock ni dás de baja.',
      ],
      GERENCIA_PRODUCCION: [
        'En «Insumos» tocá la flecha de un artículo para ver su desglose por lote y depósito. Ahí está «Dar de baja todo el stock»: registra un descarte «Discontinuado» por cada posición con saldo y pide el motivo.',
        'Debajo de la tabla está «Reservas»: con «Reservar» apartás stock para un cliente (elegís insumo, cantidad, para quién, motivo y fecha de vencimiento; una reserva sin uso libera el stock sola al vencer) y con «Liberar» la devolvés al disponible.',
        'En «Recepciones» tocá «Nueva recepción» al llegar mercadería (proveedor, remito opcional y un renglón por lote con «Agregar lote»). Cuando la recepción figura «Pendiente», tocá «Cargar a stock» en esa fila y confirmá: se registra una entrada por cada lote, en el depósito que tiene asignado.',
        'En «Stock de seguridad» ves por producto (SKU) qué hay en fábrica y qué falta producir o comprar. Tildá los productos y tocá «Producir para stock» para mandar un pedido a producción; con el lápiz de «SS (meta)» fijás la meta de un producto.',
        'En «Conteo» imprimís la planilla, contás en el depósito y cargás lo contado: el saldo pasa a lo que contaste.',
        'En «En fábrica» ves el producto terminado, unidad por producto, y tenés los botones «Contar» (conteo inicial), «Entró», «Salió» y «Enviar a Calle 5».',
      ],
      DIRECCION_TECNICA: [
        'En «Recepciones» mirás lo que llegó para aprobar calidad y cantidad. Podés tocar «Nueva recepción» y «Cargar a stock» en las que figuran «Pendiente».',
        'En el desglose de un artículo (flecha de la fila, en «Insumos») podés usar «Dar de baja todo el stock» (pide el motivo) y reservar stock con «Reservar».',
        'Al registrar una recepción, la sección «Comprobante del proveedor» no se te muestra: la factura la carga Administración desde «Facturas por cargar».',
        'En «Stock de seguridad» podés tildar productos y tocar «Producir para stock», y editar la meta con el lápiz de «SS (meta)».',
        'En «Conteo» cargás lo contado de cada insumo.',
      ],
      ADMINISTRACION: [
        'En «Recepciones» ves cada recepción con su número, fecha, proveedor, remito, comprobante, cantidad de lotes y si está «Cargada a stock» o «Pendiente».',
        'Tocá «Cargar a stock» en una recepción pendiente y confirmá: se registra una entrada por cada lote, en el depósito asignado. No se deshace.',
        'Las recepciones con comprobante «sin cargar» aparecen en «Facturas por cargar» de tu inicio. Ahí completás el comprobante del proveedor.',
        'En «Insumos» podés reservar stock con «Reservar» y dar de baja todo el stock de un artículo desde su desglose (pide el motivo).',
        'En «Conteo» cargás lo contado: escribís la cantidad, una observación opcional y tocás «Registrar».',
        'En «En fábrica» ves el producto terminado.',
        'No registrás recepciones nuevas ni tocás calidad.',
      ],
      CONTROL_CALIDAD: [
        'En «Insumos» ves las existencias, qué parte no se puede despachar («Con material retenido») y qué vence primero.',
        'En «Recepciones» podés tocar «Nueva recepción» (proveedor, remito opcional y un renglón por lote) y ver cada ingreso. No cargás recepciones a stock.',
        'Para muestrear, aprobar o rechazar lotes andá a la ficha del lote, desde «Lotes».',
      ],
      GERENCIA: [
        'Ves «Insumos», «Recepciones», «Stock de seguridad», «En fábrica» y «Conteo». En «Stock de seguridad» podés fijar la meta de un producto con el lápiz y tocar «Producir para stock».',
        'En el resto no registrás ni cargás nada: es consulta.',
      ],
    },
    aTener: [
      'Un movimiento de stock no se edita ni se borra. Se anula con un movimiento inverso, con motivo.',
      '«Cargar a stock» y «Dar de baja todo el stock» no se deshacen: la corrección es un ajuste.',
      'La pestaña vuelve a abrirse donde la dejaste: el enlace guarda la pestaña.',
    ],
  },

  '/liberacion': {
    queEs:
      'Los lotes de producto terminado que esperan la firma de Dirección Técnica, y los últimos 30 ya resueltos. La tabla muestra lote, producto, cantidad y estado («espera liberación», «liberada» o «rechazada»). Cada lote sale de una orden de producción terminada. La firma se hace en la orden; desde acá la abrís o bajás el batch record.',
    porRol: {
      DIRECCION_TECNICA: [
        '¿Primera vez? Tocá «Ver un lote de ejemplo»: es un batch record inventado, con marca de agua «SOLO EJEMPLO», que podés descargar para conocer el documento.',
        'En «Esperan liberación» ves los lotes terminados, con el N° de lote, la orden, el producto y la cantidad.',
        'Tocá «Batch record» para revisar el registro completo del lote antes de firmar.',
        'Tocá «Liberar o rechazar»: te lleva a la orden, donde tocás el mismo botón. Si falta controlar alguna etapa, el cartel «Todavía no se puede liberar» dice cuál. Para liberar tocás «Liberar al mercado»; para rechazar escribís el motivo y tocás «Rechazar el lote».',
        'En «Resueltos» ves los últimos 30 lotes ya liberados o rechazados, con su batch record.',
      ],
      CONTROL_CALIDAD: [
        'Ves los lotes que esperan liberación y los ya resueltos.',
        'Tocá «Batch record» para revisar el registro de un lote.',
        'Podés abrir la orden tocando el N° de lote, pero liberar o rechazar lo firma solo Dirección Técnica.',
      ],
      GERENCIA: [
        'Ves los lotes que esperan liberación y los ya resueltos, y abrís su batch record con «Batch record».',
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
      'Las órdenes de producción: una por lote, con su registro de la pesada a la liberación. La tabla muestra orden, producto, lote, vencimiento, cantidad y estado. Cada orden toma la fórmula y guía las etapas que se registran en su ficha; de ahí sale el batch record.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá «Abrir orden». Elegí la fórmula, el producto (presentación que se fracciona, por defecto el de la fórmula), la especificación contra la que se controla el producto terminado, la fecha de elaboración y la cantidad teórica en kg.',
        'Completá la partida del granel (1 si es el primer granel del día), el número de presentación (1, 2… si un granel va a varias) y la presentación en texto («14 g, 45 g…»). Con eso el sistema arma el número de lote según I.40.25.',
        'En «Vencimiento», si lo dejás vacío se calcula con la fecha de elaboración más la vida útil.',
        'El botón «Abrir orden» del formulario se habilita cuando elegiste fórmula, producto, fecha y una cantidad mayor que cero. Al guardar, la orden aparece en la lista; tocala para empezar a registrar las etapas.',
        'Con «Equipos» ves los equipos cargados y das de alta uno nuevo (Código, Tipo y Nombre, y «Dar de alta»): las balanzas y demás equipos se eligen después en los registros.',
        'Si la orden se abrió por error, abrila y usá «Anular» con motivo mientras esté abierta.',
      ],
      DIRECCION_TECNICA: [
        'Podés abrir órdenes con «Abrir orden» (fórmula, producto, especificación, fecha de elaboración, cantidad teórica, partida, presentación y vencimiento) y dar de alta equipos con «Equipos».',
        'Tocá una orden de la lista para ver sus etapas, registrarlas o controlarlas, y liberar el lote cuando esté terminada.',
      ],
      OPERARIO: [
        'Ves la lista de órdenes con su número, producto, lote, vencimiento, cantidad y estado.',
        'Tocá una orden para registrar las etapas de producción que te toquen (pesada, elaboración, fraccionamiento…).',
        'No abrís ni anulás órdenes.',
      ],
      CONTROL_CALIDAD: [
        'Ves la lista de órdenes con su estado.',
        'Tocá una orden para registrar y controlar las etapas de control de calidad (granel, producto terminado y revisión del batch record).',
      ],
      GERENCIA: [
        'Ves la lista de órdenes y abrís cada una para consultar su avance y su batch record.',
        'Es solo lectura.',
      ],
    },
    aTener: ['El número de una orden anulada no se reutiliza.'],
  },

  '/ordenes/:id': {
    queEs:
      'La ficha de una orden de producción, con las nueve etapas del registro (de la pesada a la revisión del batch record). Cada etapa la registra alguien («Realizó») y otra persona la cierra con «Controlar». Arriba ves el estado de la orden, la cantidad teórica y lo obtenido; abajo, el procedimiento de la fórmula en «Más información: procedimiento» y la trazabilidad. Con todo controlado y la orden terminada, Dirección Técnica libera el lote.',
    porRol: {
      OPERARIO: [
        'En cada etapa sin registrar tocá «Registrar» y completá los datos que pide. En la pesada ya vienen cargadas las materias primas y cuánto pesar según la fórmula.',
        'Contestá las verificaciones previas con Sí o No. Si alguna da NO, tenés que anotar el desvío en «Observaciones»; sin eso no se puede registrar. Si la etapa no corresponde, tildá «No aplica en este lote» y escribí por qué.',
        'Al final tocá «Registrar (realizó)» (o «Guardar corrección» si estás cambiando algo ya cargado). Horarios, fecha y tu nombre los completa el sistema. La etapa pasa a «falta controlar».',
        'Mientras no esté controlada, podés tocar «Corregir» para cambiar lo cargado.',
        'Después tocá «Controlar» para cerrarla. Lo ideal es que controle otra persona: si coincide con quien la hizo, aparece el aviso «misma persona». Una etapa controlada ya no se cambia.',
        'No registrás las etapas de control de calidad, ni terminás ni anulás la orden.',
      ],
      GERENCIA_PRODUCCION: [
        'Registrá cada etapa con «Registrar» y cerrala con «Controlar». Lo ideal es que controle otra persona: si sos la misma, aparece «misma persona».',
        'Si hay verificaciones previas y alguna da NO, tenés que anotar el desvío en observaciones.',
        'Tocá «Batch record» para ver el documento imprimible.',
        'Tocá «Terminar» y completá la «Cantidad obtenida» y las «Unidades obtenidas» (el sistema propone el recuento del fraccionamiento); confirmá con «Terminar». La orden pasa a esperar la liberación.',
        'Mientras la orden esté abierta, «Anular» la cierra con motivo (al menos 3 caracteres). El número no se reutiliza.',
        'Las etapas de control de calidad las registra Calidad o Dirección Técnica.',
      ],
      CONTROL_CALIDAD: [
        'Granel: en «Control de calidad de producto a granel» tocá «Analizar granel (R.50.10.1)», completá el registro y el dictamen. Si el análisis no aplica (por ejemplo, granel tercerizado), «No aplica» lo deja asentado con el motivo y la etapa igual se controla. Producción puede envasar antes; el lote no se libera sin este registro aprobado. Te aparece en «Análisis pendientes» del tablero.',
        'Producto terminado: en «Control de calidad de producto terminado» tocá «Registrar» y cargá los resultados contra la especificación. Si el resultado difiere de lo que calcula el sistema, tenés que justificarlo.',
        'Después tocá «Controlar» para cerrar la etapa. Lo ideal es que sea otra persona la que controle.',
        'La «Revisión de documentación del lote (batch record)» también es de Calidad: se registra y se controla igual.',
        'Podés registrar también las etapas de producción, igual que el resto.',
      ],
      DIRECCION_TECNICA: [
        'Podés registrar y controlar cualquier etapa, terminar y anular la orden mientras está abierta.',
        'Con la orden terminada, tocá «Liberar o rechazar». Si falta algo, el cartel «Todavía no se puede liberar» dice qué etapa y por qué.',
        'Para rechazar escribí el motivo (al menos 3 caracteres) y tocá «Rechazar el lote». Para liberar, «Liberar al mercado» (el motivo es opcional).',
        'Tocá «Batch record» para revisar el documento antes de firmar. La firma física del documento se hace aparte.',
      ],
      GERENCIA: [
        'Ves todas las etapas, quién las hizo («Realizó») y quién las controló, con fecha y hora.',
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
      'El batch record del lote: el documento con todo lo registrado en cada etapa (pesada, elaboración, fraccionamiento, controles de calidad, procedimiento, trazabilidad y liberación), listo para imprimir o guardar como PDF. Los datos salen de lo que se cargó en la orden; acá no se edita nada.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Revisá que cada etapa tenga sus datos, quién la hizo y quién la controló.',
        'Tocá «Descargar PDF»: se abre la impresión del navegador, donde podés imprimir o guardar como PDF.',
        'Tocá «Volver a la orden» para regresar a la ficha.',
      ],
      OPERARIO: [
        'Mirá el registro completo del lote.',
        'Tocá «Descargar PDF» si necesitás una copia (imprimir o guardar como PDF).',
        'Tocá «Volver a la orden» para regresar.',
      ],
      CONTROL_CALIDAD: [
        'Revisá los resultados y los controles de todas las etapas, incluido el control de calidad de los insumos usados.',
        'Tocá «Descargar PDF» para guardar una copia, y «Volver a la orden» para regresar.',
      ],
      DIRECCION_TECNICA: [
        'Revisalo completo antes de liberar el lote.',
        'Tocá «Descargar PDF» para guardar una copia y «Volver a la orden» para firmar. Al final del documento figura la liberación con el espacio para tu firma a mano.',
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

  '/nuevo-producto': {
    queEs:
      'Todo lo que hace falta para fabricar un producto nuevo, en secciones: producto, fórmula, insumos (envases, etiquetas y lo demás), procedimiento, especificación y, si ya los sabés, costos y tiempos. Cada sección se guarda sola y muestra si está completa.',
    porRol: {
      DIRECCION_TECNICA: [
        'Dá de alta el producto en «1. Producto», o elegí uno ya dado de alta para seguir completándolo.',
        'En «2. Fórmula» creala en borrador y cargá sus componentes; la dejás vigente desde la misma sección.',
        'En «3. Insumos» elegí el envase (si son dos insumos, «Agregar otro envase»), las etiquetas y lo demás que lleva.',
        'Después cargá el procedimiento y la especificación. Costos y tiempos (MM:SS) son opcionales.',
        'El producto queda en la dirección de la página: podés dejarlo a medias y volver más tarde.',
      ],
    },
    aTener: [
      'Son las mismas pantallas de siempre, juntas: lo que cargues acá se ve en Fórmulas, Especificaciones y Catálogos.',
    ],
  },

  '/especificaciones': {
    queEs:
      'Los requisitos de cada producto (documentos I-E.50.xx): composición, almacenamiento, vida útil y los límites que tiene que cumplir. La lista muestra código, denominación, estado y desde cuándo está vigente; al tocar una fila se abre su ficha. Las órdenes controlan el producto terminado contra estas especificaciones.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá «Nueva especificación» y cargá los datos del documento: código del POE, variedad, denominación del producto, composición (INCI), condiciones de almacenamiento, instrucciones de muestreo, reanálisis (meses) y vida útil (meses). Para guardar hacen falta el código, la denominación y la vida útil.',
        'Abrí la especificación y, mientras sea borrador, cargá en la fórmula cuali-cuantitativa cada componente con su % mín y % máx (botón «Agregar»), y los requisitos con «Agregar requisito»: nombre, grupo, criterio, mínimo, máximo, unidad, norma o referencia, condición de ensayo y método.',
        'Tocá «Datos generales» para editar la cabecera mientras es borrador.',
        'La aprueba Dirección Técnica. Vos no.',
        'Si ya está aprobada, escribí el «Motivo de la nueva versión» (al menos 3 caracteres) y tocá «Nueva versión»: se emite una versión nueva y la anterior queda en el historial.',
      ],
      DIRECCION_TECNICA: [
        'Revisá la especificación en borrador (componentes y requisitos) y corregila si hace falta.',
        'Tocá «Aprobar (DT)» para dejarla vigente.',
        'Para cambiar una ya vigente, escribí el «Motivo de la nueva versión» y tocá «Nueva versión».',
        'También podés tocar «Nueva especificación» para cargar una desde cero.',
      ],
      CONTROL_CALIDAD: [
        'Tocá una especificación para abrirla y ver su composición, vida útil y los requisitos que tiene que cumplir cada producto.',
        'Solo lectura: no creás ni aprobás.',
      ],
      GERENCIA: [
        'Tocá una especificación para ver sus componentes y requisitos.',
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
      'Dos pestañas: «Fórmulas» (la fórmula maestra de cada producto, en porcentaje P/P, agrupadas por producto con su variedad, versión, código ME y estado) y «Calculadora de lote» (cuánto pesar o medir de cada componente para el lote que quieras). Las fórmulas son la base de las órdenes de producción y de la calculadora.',
    porRol: {
      DIRECCION_TECNICA: [
        'En «Fórmulas» tocá «Nueva fórmula»: elegí el producto, la variedad (opcional), el código ME (opcional) y la versión (v1 para la primera de ese producto y variedad). Tocá «Crear en borrador».',
        'Se abre la ficha de la fórmula para cargar los componentes, la densidad y el procedimiento.',
        'Tocá una fórmula de la lista para verla o editarla si está en borrador.',
        'En «Calculadora de lote» elegí una fórmula, el objetivo («Por volumen» o «Por masa») y la temperatura de trabajo. Te dice cuánto pesar de cada componente.',
      ],
      GERENCIA_PRODUCCION: [
        'En «Fórmulas» ves cuál está vigente para cada producto, antes de pesar un lote. Solo lectura, salvo el procedimiento, que podés cargar o editar desde la ficha.',
        'En «Calculadora de lote» elegí una fórmula y el objetivo: «Por volumen» (volumen en L) o «Por masa» (masa en kg), y la temperatura de trabajo.',
        'La tabla del resultado muestra cada componente con su % P/P y la cantidad a pesar o medir. Si la fórmula no está vigente, el sistema avisa que sirve solo como vista previa.',
        'Tocá «Qué lleva cada producto» para ver la lista de materiales.',
      ],
      OPERARIO: [
        'En «Fórmulas» podés ver qué fórmula está vigente. Solo lectura.',
        'En «Calculadora de lote» elegí la fórmula, el tipo de objetivo («Por volumen» o «Por masa»), la cantidad y la temperatura de trabajo para saber cuánto pesar de cada componente.',
        'Si aparece un cartel rojo, corregí el dato que señala (por ejemplo, una temperatura fuera de rango).',
        'Con el resultado en pantalla, «Más información: procedimiento» muestra los pasos de elaboración.',
      ],
      CONTROL_CALIDAD: [
        'Mirá las fórmulas y su estado. Solo lectura.',
        'Podés usar la calculadora de lote para verificar cantidades.',
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
      'La ficha de una fórmula de fabricación: su producto, versión y estado (borrador, vigente o dada de baja), la densidad del producto terminado, el resumen de porcentajes, la tabla de componentes (en % P/P, a qué se miden y en qué etapa entran) y el procedimiento de elaboración, que se versiona aparte. Es lo que después usa la calculadora de lote y la pesada de las órdenes.',
    porRol: {
      DIRECCION_TECNICA: [
        'Con la fórmula en borrador, cargá los componentes con «Agregar componente»: elegí si es un insumo del catálogo o un nombre libre, el % P/P y la etapa si corresponde. Uno puede ir como componente «csp» (completa al 100 %); si ya hay uno, el sistema lo avisa.',
        'Revisá el resumen de porcentajes: tiene que cerrar. Con el icono «Quitar componente» sacás uno cargado por error.',
        'En «Densidad del producto terminado» podés cargar la densidad medida (g/mL) y la temperatura de referencia, y tocar «Guardar». Si no la medís, se usa la estimada por el modelo de mezcla. En una fórmula vigente es lo único de la fórmula que se puede cambiar.',
        'En «Procedimiento» tocá «Cargar procedimiento» (o «Editar» si ya hay uno) para escribir los pasos de elaboración: un paso por línea. Cada edición queda como versión nueva y la anterior se conserva.',
        'Cuando esté lista, tocá «Marcar como vigente» y confirmá. Después no se pueden editar los componentes.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves la fórmula en modo lectura: componentes, densidad y estado.',
        'Podés cargar o editar el procedimiento con «Editar» o «Cargar procedimiento»: un paso por línea, y queda como versión nueva (podés escribir qué cambió y por qué).',
        'En «Versiones anteriores» ves cómo estaba escrito antes.',
      ],
      OPERARIO: [
        'Ves la fórmula en modo lectura: componentes en porcentaje, densidad y estado.',
        'Más abajo, en «Procedimiento», leés los pasos de elaboración mientras producís.',
      ],
      CONTROL_CALIDAD: [
        'Ves la fórmula completa en modo lectura.',
        'Revisá componentes, densidad y procedimiento.',
      ],
      GERENCIA: [
        'Ves la fórmula completa en modo lectura: componentes, densidad, estado y procedimiento.',
      ],
    },
    aTener: [
      'Marcar como vigente no se deshace. Para corregir una vigente se emite una versión nueva desde «Nueva fórmula».',
      'Para pasar a vigente el producto tiene que tener densidad: o la medida que cargás vos, o una que el sistema pueda estimar con la mezcla. Si no hay ninguna de las dos, la base rechaza el cambio de estado.',
    ],
  },

  '/pedidos': {
    queEs:
      'La bandeja de pedidos. Se cargan acá, Producción los revisa contra el stock y lo que falta queda anotado en compras. Arriba elegís la vista: «Tablero» (todo lo que está en curso, en columnas «Para revisar», «En producción» y terminados de los últimos 14 días), «Para revisar» (enviados y sin tomar), «En producción», «Borradores» (cargados pero no enviados) y «Cerrados» (terminados y cancelados). Las listas muestran número, cliente, cantidad de productos, cuándo se cargó, la entrega y el estado.',
    porRol: {
      ADMINISTRACION: [
        'Tocá «Nuevo pedido». Elegí si es «Para Nail Show» o «Tercerizado» (en ese caso, el cliente tercerizado). Completá el «Número» y el «Cliente» (podés elegirlo del padrón para poder facturarle, o darlo de alta con «Nuevo cliente»).',
        'Poné la fecha de «Entrega comprometida»: ordena la bandeja de Producción y es la fecha límite de las compras. Agregá cada producto con su cantidad, precio neto e IVA («Agregar otro producto» suma renglones) y, si hace falta, «Observaciones» para Producción.',
        '«Guardar borrador» lo deja solo para vos, para completarlo después. «Enviar a producción» lo manda directo a la bandeja de Gerencia de Producción. El sistema exige número, cliente y al menos un producto.',
        'En «Borradores» ves los que todavía no mandaste. Abrí uno y tocá «Enviar a producción» cuando esté completo.',
        'Tocá «Compras pendientes» para ver lo que falta comprar (el número es la cantidad de compras abiertas).',
      ],
      GERENCIA_PRODUCCION: [
        'Arriba de todo, «Ventas esperando fecha» lista los pedidos de venta que Ventas te mandó para que comprometas cuándo salen. Tocá «Proponer fecha», poné la «Fecha del pedido entero» y, si algún producto demora más que el resto, su fecha en «Demora hasta» (la del pedido entero no puede ser anterior). Podés dejarle una nota a Ventas. Al tocar «Proponer fecha», Ventas la ve y decide si aprueba.',
        'Si Ventas cambia productos o cantidades de un pedido al que ya le pusiste fecha, el pedido vuelve solo a «Ventas esperando fecha» para que la reconfirmes.',
        'En «Para revisar» están los pedidos enviados y todavía sin tomar. Abrí cada uno para ver si alcanza el material: la cobertura de stock se calcula al abrirlo, no en la lista.',
        'En «En producción» están los que ya tomaste.',
        'En «Tablero» ves todo lo que está en curso de un vistazo, también los de clientes tercerizados.',
        'Podés cargar uno con «Nuevo pedido» (número, cliente, entrega comprometida y productos con su cantidad), y guardarlo como borrador o enviarlo directo.',
        'Tocá «Compras pendientes» para ver lo que falta comprar.',
      ],
      OPERARIO: [
        'Ves el tablero con lo que está en curso, en columnas «Para revisar», «En producción» y terminados de los últimos 14 días. Tocá una tarjeta para abrir el pedido.',
        'Solo lectura: no cargás ni cambiás pedidos.',
      ],
      GERENCIA: [
        'Ves todos los pedidos en curso y los cerrados, cambiando de vista con los botones de arriba.',
        'Tocá una tarjeta o una fila para abrir el pedido.',
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
      'La ficha de un pedido: cliente, entrega comprometida, observaciones, productos con su cantidad y precio, y si alcanza el material para fabricarlo. Los botones de arriba ofrecen el paso siguiente del circuito (borrador, enviado, en producción y terminado) según tu rol, y debajo de los datos una frase te dice en qué paso está. Si falta material, un cartel lista qué insumos faltan y cuánto.',
    porRol: {
      ADMINISTRACION: [
        'En borrador podés corregir los productos (cantidad, precio, IVA, «Quitar producto») y tocar «Aplicar precios de lista».',
        'Tocá «Enviar a producción» cuando esté completo (necesita al menos un producto; si no, el botón queda deshabilitado y te lo explica).',
        'Si lo enviaste por error, «Devolver a borrador» lo saca de la bandeja de Producción para poder corregir los productos; después hay que volver a enviarlo.',
        'Si falta material, el cartel «Falta material para cubrir este pedido» lista los insumos: tocá «Anotar» en un insumo o «Anotar todo lo que falta» para dejarlo en Compras pendientes.',
        'En la sección «Factura», «Emitir factura» factura el pedido (si falta algún dato, el botón queda deshabilitado y avisa qué). Con «Despachar» registrás la entrega al cliente: elegís si sale de Calle 5 o de fábrica, cuánto sale de cada producto y, si va incompleto, el pedido queda «Despachado con faltantes».',
        '«Cancelar» deja el pedido en «Cerrados» y pide confirmación. «Borrar pedido» lo saca de todas las bandejas y pide un motivo.',
      ],
      GERENCIA_PRODUCCION: [
        'Mirá el cartel de cobertura: dice si alcanza el material o qué falta.',
        'Con «Anotar» o «Anotar todo lo que falta» pasás los faltantes a Compras pendientes.',
        'Tocá «Pasar a producción» para tomar el pedido. En «Órdenes de producción» tocá «Abrir orden» para fabricarlo.',
        'Al terminar de fabricar, tocá «Terminado»: revisá lo que realmente se usó de cada insumo (viene cargado lo de la receta; si difiere, pide el motivo), sumá lo que se usó y no estaba en la receta, y completá cuánto se produjo y adónde va. Confirmá con «Terminado: descontar stock». Descuenta el stock del lote que vence primero y cierra el pedido.',
        'Si salió menos de lo pedido, lo que falta queda pendiente de despacho y vuelve a aparecer en lo que falta producir.',
        'Tocá «Despachar» para entregar el pedido al cliente (de Calle 5 o de fábrica; completo o con faltantes).',
        '«Devolver a borrador», «Cancelar» y «Borrar pedido» también están disponibles según el estado, con confirmación o motivo.',
      ],
      DIRECCION_TECNICA: [
        'Podés tomar el pedido con «Pasar a producción», abrir órdenes con «Abrir orden», anotar faltantes y tocar «Terminado», igual que Gerencia de Producción.',
        'Si el pedido es de un cliente tercerizado, al pasar a producción elegís, insumo por insumo, de qué stock sale (de Nail Show o del cliente).',
        'No despachás pedidos desde acá: eso es de Producción, Administración, Ventas, Gerencia y Encargada de stock.',
      ],
      OPERARIO: [
        'Ves el pedido, su estado, los productos y si alcanza el material.',
        'Solo lectura.',
      ],
      GERENCIA: [
        'Ves el pedido, sus productos y su cobertura de material.',
        'Podés tocar «Despachar» cuando corresponda (pedido de Nail Show con mercadería pendiente de entregar) y emitir la factura.',
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
      'Qué se produce cada día y cuánto dura cada pedido. Hay dos vistas, que se cambian arriba: «Gantt» (una fila por pedido, con barras sobre tres semanas) y «Calendario» (el mes). La línea roja del Gantt es la entrega comprometida; si un pedido termina después de esa fecha, la fila lo avisa. Debajo, «Sin planificar» lista los pedidos abiertos que todavía no tienen fecha de producción.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Cada fila es una producción: «Producto × cantidad», con su número y para quién es debajo («Para V-0012 — Cliente» o «Para stock»). Al aprobar una venta, lo que falta llega acá como una producción por producto.',
        'Tocá el nombre de una producción para abrirla. En «Para» elegís a qué pedido de venta aprobado va (la lista muestra cuánto pide cada uno y cuánto le falta producir) o la dejás «Para stock». Al tocar «Terminado» en Calle 5, lo producido queda reservado para el pedido elegido en ese momento.',
        '«Nueva producción», arriba, carga producir N de un producto: elegí el «Producto», la «Cantidad a producir», «Para» qué pedido o stock, y si querés ya la fecha de inicio y los días. Si sacás una producción de un pedido para dársela a otro, el primero queda sin esa producción: fijate en la lista cuánto le falta.',
        'Abajo, en «Sin planificar», tocá «Planificar» en un pedido. Elegí cuándo «Empieza a producirse» y los «Días de producción» (entre 1 y 60). Guardá.',
        'Para mover un pedido ya planificado usá los iconos del bloque en el Gantt (al pasar el cursor dicen «Un día antes», «Un día después», «Un día menos» y «Un día más»).',
        'Para sacarlo del plan, tocá su número en el texto de abajo (se listan hasta ocho pedidos planificados) y, en la ventana, «Sacar del plan». También podés cambiar desde ahí la fecha y los días.',
        'Con las flechas del encabezado y «Hoy» te movés en el tiempo (de a una semana en el Gantt y de a cuatro en el calendario).',
      ],
      DIRECCION_TECNICA: [
        'Planificás igual que Gerencia de Producción: «Planificar» en cada pedido sin planificar, y los botones del bloque para moverlo.',
        'Cambiá entre «Gantt» y «Calendario» arriba. Con «Hoy» y las flechas te movés en el tiempo.',
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
      'Los clientes para los que Nail Show fabrica con su propia marca. Cada cliente es un cuadrito que dice, sin abrirlo, cuántos pedidos tiene en curso y en producción, cuántos insumos tiene en stock (y si alguno está en cuarentena) y cuántos productos. Cada uno tiene su stock, sus productos y sus pedidos, aparte de los de Nail Show.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'Tocá el cuadrito de un cliente para abrir su ficha.',
        'Tocá «Nuevo cliente» para dar de alta uno: completá el nombre, elegí el color del cuadrito, agregá observaciones si querés y tocá «Dar de alta».',
        'Dentro de la ficha cargás su stock, sus productos y sus pedidos.',
      ],
      GERENCIA: [
        'Tocá el cuadrito de un cliente para ver su ficha.',
        'Tocá «Nuevo cliente» para dar de alta uno (nombre, color del cuadrito y observaciones) con «Dar de alta».',
        'No cargás stock ni productos.',
      ],
    },
    aTener: [
      'El stock de un cliente tercerizado es aparte del de Nail Show. No se mezcla.',
    ],
  },

  '/tercerizados/:id': {
    queEs:
      'La ficha de un cliente tercerizado, con cuatro pestañas: «Pedidos» (los abiertos y qué tiene que traer el cliente), «Stock» (su material, aparte del de Nail Show), «Productos» (los que se fabrican con su marca) y «Producción» (pedidos en producción y terminados). Arriba, «Todos los clientes» vuelve a la lista.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Pedidos» tocá «Nuevo pedido». Arriba, si hace falta, un cartel te dice qué insumos tiene que traer el cliente para cubrir los pedidos en curso.',
        'En «Stock» tocá «Agregar stock» cuando el cliente trae material: cargás insumo, cantidad, lote, vencimiento y si vino con protocolo, más el remito. Lo que entra queda en cuarentena, con rótulo amarillo, hasta que Calidad lo apruebe. Con «Quitar» en un lote sacás stock (descarte con motivo). En «Reservas», «Reservar» aparta stock para el cliente y «Liberar» lo devuelve al disponible.',
        'En «Productos» tocá «Nuevo producto» (uno nuevo o uno de Nail Show con la etiqueta del cliente). «Qué lleva» abre la lista de materiales del producto.',
        'En «Producción» ves los pedidos en producción y los terminados; tocá uno para abrirlo.',
        'Con «Editar» cambiás los datos del cliente.',
        'Al pasar un pedido a producción, elegís insumo por insumo si sale del stock de Nail Show o del cliente.',
      ],
      GERENCIA: [
        'Ves los pedidos, el stock, los productos y la producción del cliente.',
        'Podés tocar «Editar» para cambiar los datos del cliente (nombre, color, observaciones y si está activo) y guardar con «Guardar».',
        'No cargás stock, productos ni pedidos.',
      ],
    },
    aTener: [
      'El material del cliente que ingresa entra a cuarentena y sigue el circuito de calidad como cualquier otro.',
    ],
  },

  '/catalogos': {
    queEs:
      'Los listados maestros del sistema en cuatro pestañas: «Productos», «Insumos», «Proveedores» y «Depósitos» (se abre en «Productos»). Todo lo demás (recepciones, órdenes, fórmulas) se arma sobre ellos. Cada pestaña es una tabla con buscador; los datos los carga el equipo desde acá.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Productos» tocá «Nuevo producto»: código interno, nombre, variedad, origen, tipo, forma cosmética y vida útil en meses. Sin origen no se puede abrir una orden de producción. Para modificar uno existente, tocá su fila.',
        'En «Insumos» tocá «Nuevo insumo»: código interno, nombre, tipo, unidad de medida (sin unidad no se puede recepcionar), depósito de cuarentena y depósito de aprobados. La ficha define qué se exige al recibirlo: «Exige protocolo de análisis del fabricante», «Se pesa durante la recepción» e «Inflamable».',
        'En «Proveedores» podés dar de alta uno nuevo con «Nuevo proveedor» (razón social, CUIT, contacto, teléfono, correo y domicilio). Aprobarlo es solo de Dirección Técnica.',
        'En «Depósitos» solo mirás.',
      ],
      DIRECCION_TECNICA: [
        'Cargás y editás insumos y productos con «Nuevo insumo» y «Nuevo producto»; para editar uno existente tocá su fila.',
        'En «Proveedores» das de alta con «Nuevo proveedor» y, en los que figuran pendientes, tocás «Aprobar» o «Rechazar» para dictaminar. Podés escribir el fundamento en «Observaciones» y se firma con tu nombre y la fecha. El dictamen es solo tuyo.',
        'En «Depósitos» ves los diez depósitos con su contenido, el estado admitido y la ubicación.',
      ],
      CONTROL_CALIDAD: [
        'Consultás insumos, productos, proveedores y depósitos (en insumos y productos hay buscador).',
        'Solo lectura.',
      ],
      GERENCIA: [
        'Consultás insumos, productos, proveedores y depósitos (en insumos y productos hay buscador).',
        'Solo lectura.',
      ],
    },
    aTener: [
      'Sin un insumo y un proveedor cargados no se puede registrar una recepción.',
      'Un insumo o un producto no se borra, se desactiva: los registros que lo citan quedan intactos.',
      'El dictamen de un proveedor (aprobado o rechazado) queda a nombre de quien lo firma.',
    ],
  },

  '/compras': {
    queEs:
      'Lo que falta comprar para cubrir los pedidos, anotado desde la ficha de cada pedido con «Anotar en compras». Arriba hay tres contadores: «Por comprar» (todavía no se le pidió al proveedor), «Pedido al proveedor» (esperando que llegue) y «Pasadas de fecha» (la entrega del pedido ya pasó y la compra sigue abierta). Debajo, dos vistas: «Abiertas», con lo más urgente arriba, e «Historial», con lo resuelto y lo descartado. El circuito es: «Ya lo pedí» → «Ya llegó», que abre la recepción con los datos de la compra ya cargados; el material entra en cuarentena y pasa a stock disponible cuando Control de Calidad lo aprueba.',
    porRol: {
      GERENCIA_PRODUCCION: [
        'En «Abiertas» ves cada compra con su insumo, la cantidad, el proveedor sugerido, el pedido para el que se anotó y la fecha límite. Si la fecha ya pasó, aparece en rojo.',
        'Si el mismo insumo está anotado para más de un pedido, debajo del nombre aparece «Anotado para N pedidos» con el total: sumá antes de comprar, porque cada pedido se calculó contra el mismo stock.',
        'Cuando le hacés el pedido al proveedor, tocá «Ya lo pedí». La compra pasa a «Pedido al proveedor» y el botón cambia a «Ya llegó».',
        'Cuando llega el material, tocá «Ya llegó». Se abre la recepción con el proveedor, el insumo y la cantidad de la compra ya cargados, y la compra marcada en «¿Es de alguna compra pendiente?».',
        'Completá lo que falta del remito y del lote: número de remito, lote del proveedor, bultos, vencimiento, protocolo si el insumo lo pide, y si los contenedores se limpiaron. Corregí la cantidad si no llegó lo mismo que se pidió.',
        'Si llegó una parte, apagá «Llegó todo» en la compra: queda en «Pedido al proveedor» con la nota de lo recibido, y cuando llegue el resto volvés a tocar «Ya llegó».',
        'Tocá «Registrar recepción». El lote entra en cuarentena (rótulo amarillo) y la compra pasa al historial como resuelta, vinculada a ese lote. No se puede usar ni vender hasta que Control de Calidad lo apruebe; ahí pasa solo a stock disponible.',
        'Para sacar una o varias compras que ya no hacen falta, marcá las casillas de la izquierda (la de arriba elige todas) y tocá «Descartar». Escribí el motivo (mínimo 5 caracteres): vale para todas las elegidas. Para una sola, también está «Descartar» en su fila.',
      ],
      ADMINISTRACION: [
        'En «Abiertas» ves cada compra con su insumo, cantidad, proveedor sugerido, pedido y fecha límite. Las más urgentes van arriba.',
        'Cuando hacés el pedido al proveedor, tocá «Ya lo pedí». La compra pasa a «Pedido al proveedor».',
        'La recepción del material la hace Gerencia de Producción con «Ya llegó»: en tu pantalla esa fila dice «La recibe Gerencia de Producción». Cuando la registra, la compra pasa sola al historial.',
        'Para sacar una o varias compras que ya no hacen falta, marcá sus casillas (la de arriba elige todas) y tocá «Descartar». El motivo que escribas (mínimo 5 caracteres) queda en todas.',
        'En «Historial» ves las resueltas y las descartadas, con quién y cuándo, y el motivo o el lote con que llegó.',
      ],
      GERENCIA: [
        'Ves los contadores, las compras abiertas y el historial, con el pedido para el que se anotó cada una.',
        'Es solo lectura: no ves botones ni casillas.',
      ],
    },
    aTener: [
      '«Descartar» no borra: la compra queda en el historial con el motivo, quién la descartó y cuándo. Es lo que exige el registro de auditoría.',
      'El material de «Ya llegó» no se puede usar hasta que Control de Calidad apruebe el lote en cuarentena.',
      'Si cambiás el insumo en la recepción, la compra no se vincula: la compra queda abierta.',
    ],
  },
};
