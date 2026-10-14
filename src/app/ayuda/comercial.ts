import type { MapaAyuda } from './tipos';

const NADA_SE_BORRA =
  'Nada se borra: si algo se cargó mal, se corrige con otro registro que lo anula.';

export const AYUDA_COMERCIAL: MapaAyuda = {
  '/ventas': {
    queEs:
      'Es la lista de todos los pedidos mayoristas, como la planilla de antes. El monto, el descuento y lo que hay en Calle 5 salen solos.',
    porRol: {
      VENTAS: [
        'Arriba tenés tres filtros: «Abiertos» (los que todavía no se entregaron), «Entregados» y «Todos». Empieza en «Abiertos».',
        'Para encontrar uno, escribí el cliente, el número o el destino en el buscador.',
        'Tocá «Nuevo pedido» para cargar uno. Tocar una fila abre ese pedido.',
        'Las filas verdes están entregadas y pagas. Las naranjas tienen algo pendiente: falta stock, hay que producir o está sin armar.',
        'En la columna «Pago» podés cambiar el estado del pago directo desde la lista, sin abrir el pedido.',
        'La columna «Stock» dice si en Calle 5 «hay ✓», si «falta», si está «a revisar» (Calle 5 todavía no lo miró) o si es un «borrador» sin enviar.',
      ],
      ADMINISTRACION: [
        'Podés ver todos los pedidos y buscarlos por cliente, número o destino.',
        'Con «Abiertos», «Entregados» y «Todos» cambiás qué pedidos ves.',
        'Tocá una fila para abrir el pedido. Ahí está el camino para facturarlo.',
        'En la columna «Pago» podés cambiar el estado del pago directo desde la lista.',
        'La columna «Fact.» muestra el número de factura cuando el pedido ya se facturó.',
      ],
      GERENCIA: [
        'Ves todos los pedidos mayoristas. Usá «Abiertos», «Entregados» y «Todos» y el buscador para acotar.',
        'Tocá una fila para ver el detalle del pedido.',
        'Naranja significa que algo falta (stock, producción o armado). Verde, que está entregado y pago.',
        'Podés cargar un pedido con «Nuevo pedido» y cambiar el estado de pago desde la columna «Pago».',
      ],
    },
    aTener: [
      'Un pedido «borrador» todavía no llegó a Calle 5: hasta que se envíe, nadie lo arma.',
      'Un pedido enviado no se borra.',
    ],
  },

  '/ventas/:id': {
    queEs:
      'Es un pedido mayorista. Es la lista de precios con una columna de cantidad: escribís cuántas unidades querés de cada producto y el total y el descuento se calculan solos.',
    porRol: {
      VENTAS: [
        'Escribí el nombre del cliente. Si no está en el padrón, se puede cargar igual, pero para facturar hay que darlo de alta en Clientes.',
        'Completá entrega, forma de pago, destino (envío o «retira en el local») y observación si hace falta.',
        'Elegí el descuento: «Por monto» (lo calcula la escala según el total) o «Fijo» con un porcentaje que escribís.',
        'En la tabla escribí la cantidad en cada producto. El número de la columna «Calle 5» es lo que hay disponible: verde alcanza, naranja alcanza a medias, rojo no hay.',
        'El lápiz al lado del precio unitario sirve para poner otro precio a mano. «Volver a la lista» lo deshace.',
        'Abajo ves el total, el porcentaje y el total con descuento. «Ver escala» muestra los escalones y cuánto te falta para el próximo.',
        '«Guardar borrador» guarda sin avisar a nadie. «Enviar» abre una ventana donde decidís cuánto se arma de Calle 5 para este cliente. Lo que falta va a Producción.',
        'Después de enviar el pedido ya no se edita. Desde «Facturar y ver el despacho» seguís con la factura y la entrega.',
      ],
      ADMINISTRACION: [
        'Podés cargar o completar un pedido igual que Ventas: cliente, cantidades, descuento y destino.',
        '«Guardar borrador» lo deja guardado sin enviarlo. «Enviar» lo manda a Calle 5.',
        'Con el pedido ya enviado, tocá «Facturar y ver el despacho» para emitir la factura.',
        'Un pedido enviado no se edita.',
      ],
      GERENCIA: [
        'Podés cargar un pedido o revisar uno existente: cliente, cantidades, descuento y precios.',
        '«Guardar borrador» lo guarda. «Enviar» lo manda a Calle 5 y a Producción.',
        'Con el pedido enviado, «Facturar y ver el despacho» abre la factura y el seguimiento de la entrega.',
        'Un pedido enviado no se edita.',
      ],
    },
    aTener: [
      'Antes de «Enviar» todo se puede cambiar. Después, el pedido queda fijo.',
      'El precio de cada pedido queda como estaba al cargarlo: si después cambia la lista, este pedido no cambia.',
      'No te pongas a repartir lo disponible entre clientes a ojo: el sistema no lo reparte, lo decidís vos en la ventana de «Enviar».',
    ],
  },

  '/armado': {
    queEs:
      'Es lo único que ve la encargada de Calle 5: los pedidos que hay que preparar, con código y cantidad de cada producto. La otra pestaña es el stock de Calle 5.',
    porRol: {
      ENCARGADA_STOCK: [
        'En «Pedidos a armar» aparece una tarjeta por pedido con cliente, destino y lo que hay que preparar. Al lado de cada producto ves cuánto hay en Calle 5.',
        'Cuando mirás el stock y alcanza, tocá «Hay». Ventas lo ve en su lista.',
        'Si no alcanza, tocá «Falta», escribí qué falta (por ejemplo «del 101 hay 12, no 20») y «Avisar a Ventas».',
        'Cuando armaste el pedido y sale, tocá «Enviado». Se abre una ventana con lo que sale.',
        'Si sale todo lo pedido, dejá «Va completo». Si sale menos, elegí «Va con faltantes» y escribí cuántas unidades salen de cada producto.',
        'Si sale distinto de lo pedido, el sistema te pide el motivo (fallado, no hay, lo pidió el cliente). No te deja confirmar sin motivo.',
        'Al confirmar, se descuenta el stock y queda registrado el lote de cada unidad que salió.',
        'La pestaña «Stock de Calle 5» es para contar, anotar lo que entra o sacar lo fallado.',
      ],
      GERENCIA: [
        'Ves los mismos pedidos que la encargada: lo que hay que armar, con las cantidades.',
        'Podés tocar «Hay» o «Falta» y «Enviado» como ella.',
        'Con «Enviado» elegís si sale completo o con faltantes. Si sale distinto de lo pedido, hay que escribir el motivo.',
        'En «Stock de Calle 5» ves el stock y los movimientos.',
      ],
    },
    aTener: [
      '«Enviado» descuenta el stock y no se deshace. Revisá las cantidades antes de confirmar.',
      'Lo que no sale queda pendiente dentro del pedido.',
      NADA_SE_BORRA,
    ],
  },

  '/punto-venta': {
    queEs:
      'Es el stock de producto terminado de Calle 5, el local. Entra lo que manda la planta y sale lo que se vende o se descarta.',
    porRol: {
      VENTAS: [
        'Arriba ves cuántas unidades hay en el local y cuántos productos tienen stock.',
        '«Contar» sirve para dejar un producto en lo que hay de verdad: elegís el producto, escribís las unidades contadas y registrás el conteo.',
        '«Entró» registra mercadería que llega desde planta, una devolución o un ajuste.',
        '«Salida sin pedido» es para lo que sale sin pedido: mostrador, ajuste o descarte. Los pedidos mayoristas se despachan desde «Pedidos a armar».',
        '«Sacar fallado» saca producto fallado. Pide un motivo obligatorio.',
        'Más abajo hay pestañas con los pedidos a despachar, el stock por producto (con lo reservado para cada cliente) y las reservas.',
      ],
      ADMINISTRACION: [
        'Ves el stock del local y sus movimientos.',
        '«Contar» deja un producto en lo que hay de verdad. «Entró» y «Salida sin pedido» registran movimientos.',
        '«Sacar fallado» y los ajustes piden motivo.',
        'En «Por producto» podés mandar a producir lo que falta para cubrir los pedidos abiertos.',
      ],
      GERENCIA: [
        'Ves el stock del local, lo reservado para cada cliente y lo que falta producir.',
        '«Contar», «Entró», «Salida sin pedido» y «Sacar fallado» registran los movimientos.',
        'Los ajustes, descartes y fallados piden motivo.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves el stock del local y lo que piden los pedidos abiertos.',
        'En «Por producto» aparece «Mandar a producir lo que falta»: crea el pedido de producción para Calle 5.',
        '«Contar», «Entró», «Salida sin pedido» y «Sacar fallado» registran movimientos.',
      ],
    },
    aTener: [
      'Un ajuste o un descarte siempre pide motivo y no se borra.',
      'Si un movimiento estuvo mal, se corrige con otro movimiento.',
    ],
  },

  '/facturas': {
    queEs:
      'Es la lista de las facturas emitidas desde cada pedido, con su estado y el CAE. Acá solo se miran: las facturas se emiten desde el pedido.',
    porRol: {
      VENTAS: [
        'Arriba hay tres contadores: «Autorizadas», «Rechazadas» y «Pendientes».',
        'Filtrá con «Todas», «Autorizadas», «Rechazadas» o «Pendientes».',
        'Cada fila muestra el comprobante, el cliente, el pedido y los importes. Tocá el número de pedido para abrirlo.',
        'Si una está «Rechazada», al lado dice el motivo que dio ARCA. Si está «Pendiente», se reintenta desde el pedido.',
        'Desde esta pantalla no se emite ni se anula nada: se hace desde la ficha del pedido.',
      ],
      ADMINISTRACION: [
        'Ves todas las facturas y podés filtrarlas por estado.',
        'La columna «CAE / motivo» muestra el CAE si está autorizada, o el motivo del rechazo.',
        'Para emitir, reintentar o anular con nota de crédito, abrí el pedido (tocá su número).',
      ],
      GERENCIA: [
        'Ves el total autorizado (las notas de crédito restan), cuántas fueron rechazadas y cuántas están pendientes.',
        'Filtrá por estado con los botones de arriba.',
        'Tocá el pedido de una factura para ver su detalle.',
      ],
    },
    aTener: [
      'Una factura autorizada no se edita ni se borra. Se corrige con una nota de crédito (en el pedido: «Anular con nota de crédito») y después se vuelve a facturar.',
      'Si aparece el aviso de «homologación», esas facturas son pruebas contra ARCA: no tienen validez fiscal.',
    ],
  },

  '/clientes': {
    queEs:
      'Es el padrón de clientes. La condición frente al IVA de cada uno decide si se le factura A o B.',
    porRol: {
      VENTAS: [
        'Buscá por nombre o documento en el buscador de arriba.',
        'Tocá «Nuevo cliente» y completá razón social, condición frente al IVA, tipo y número de documento. Domicilio y correo son opcionales.',
        'Para corregir un cliente, tocá su fila y cambiá los datos.',
        'Si un cliente ya no compra, destildá «Activo». No se borra.',
        'Revisá bien el documento y la condición de IVA: de ahí sale el tipo de factura.',
      ],
      ADMINISTRACION: [
        'Buscá por nombre o documento.',
        '«Nuevo cliente» da de alta uno nuevo. Tocá una fila para editarlo.',
        'La condición frente al IVA decide si se le factura A o B: cargala con cuidado.',
        'Si ya no opera, destildá «Activo» en lugar de borrarlo.',
      ],
      GERENCIA: [
        'Ves el padrón completo y podés buscar por nombre o documento.',
        'Podés dar de alta con «Nuevo cliente» o corregir los datos tocando la fila.',
        'Para dar de baja a un cliente, destildá «Activo».',
      ],
    },
    aTener: [
      'Un cliente nunca se borra: se desactiva y su historia queda.',
      'Si el documento o la condición de IVA están mal, la factura puede salir con el tipo equivocado.',
    ],
  },

  '/precios': {
    queEs:
      'Es donde se ven y se cambian los precios de lista (con IVA incluido), los descuentos por cliente y la escala de descuento por monto del pedido mayorista.',
    porRol: {
      VENTAS: [
        'Hay tres pestañas: «Precios de lista», «Descuentos por cliente» y «Escala por monto».',
        'En «Precios de lista» buscá el producto. «Sin precio» muestra solo los que todavía no tienen precio.',
        'Tocá «Cambiar» (o «Poner precio» si no tiene), escribí el nuevo precio con IVA y un motivo, y «Guardar precio».',
        'En «Descuentos por cliente» elegís cliente, producto, porcentaje y motivo para fijar un descuento.',
        'En «Escala por monto» ves los escalones de descuento. Podés cambiarlos desde esa misma pestaña.',
      ],
      ADMINISTRACION: [
        'Podés ver y cambiar precios de lista con «Cambiar» o «Poner precio». Escribí el precio con IVA y un motivo.',
        'En «Descuentos por cliente» cargás o cambiás un descuento: cliente, producto, porcentaje y motivo.',
        'En «Escala por monto» ajustás los escalones del descuento por monto.',
      ],
      GERENCIA: [
        'Ves precios, descuentos y escala. Podés cambiarlos igual que Ventas y Administración.',
        'Cada cambio de precio pide un motivo opcional pero conviene escribirlo.',
        '«Sin precio» te muestra rápido qué productos faltan cargar.',
      ],
    },
    aTener: [
      'Cada cambio de precio crea una versión nueva: la anterior queda guardada.',
      'Los pedidos ya cargados conservan el precio con el que se cargaron.',
    ],
  },

  '/administracion': {
    queEs:
      'Es el inicio de Administración: lo que hay que resolver hoy, ordenado por prioridad. Cada cuadro lleva a la pantalla donde se resuelve.',
    porRol: {
      ADMINISTRACION: [
        'Arriba hay cuadros: «Pagos vencidos», «Solicitudes por aprobar», «Facturas por cargar», «Diferencias con proveedores», «Cajas y bancos propios», «IVA del mes», «A cobrar» y «Próximos 7 días». Tocá uno para ir a donde se resuelve.',
        'Si aparece el aviso rojo «Tenés N facturas por cargar», hay recepciones que entraron sin comprobante. En la recepción la factura es opcional, y Dirección Técnica ni la ve.',
        'En cada una tocá «Cargar factura». Se abre el formulario del proveedor con la recepción ya vinculada.',
        'Elegí el tipo de comprobante y completá punto de venta, número, fecha, vencimiento e importes. Con eso queda el IVA crédito y la deuda con el proveedor.',
        'Si de verdad vino sin factura, cargala como «Sin factura». Esa compra no da crédito fiscal.',
        'Mientras no cargues la factura, la recepción sigue apareciendo en el aviso.',
        'Más abajo hay el gráfico de flujo de fondos, las tortas de ventas por cliente y compras por proveedor, y botones rápidos a Proveedores, Clientes, Tesorería, Pagos, Compras, Facturas y Reportes.',
      ],
      GERENCIA: [
        'Es el resumen de lo que hay que resolver: pagos vencidos, solicitudes por aprobar, cajas y bancos, IVA del mes y lo que hay para cobrar.',
        'Tocá un cuadro para ir a la pantalla donde se resuelve.',
        'El aviso «Facturas por cargar» lista recepciones que entraron sin comprobante. Las carga Administración con «Cargar factura».',
        'El gráfico de flujo y las tortas muestran el movimiento de fondos y los volúmenes por cliente y proveedor.',
        'Los botones de abajo te llevan a las cuentas, Tesorería, Pagos, Compras, Facturas y Reportes.',
      ],
    },
    aTener: [
      'Una factura de proveedor cargada no se edita: si hubo un error, se anula desde la cuenta del proveedor y se carga de nuevo.',
      'Las compras «Sin factura» no dan crédito fiscal de IVA.',
      'El stock valorizado todavía no tiene el costo de cada insumo; monotributos, sueldos y comercio exterior esperan definición.',
    ],
  },

  '/tesoreria': {
    queEs:
      'Son las cajas, los bancos y las cuentas de terceros. Los pagos y cobros se registran solos; acá va lo demás.',
    porRol: {
      ADMINISTRACION: [
        'Elegí una caja o cuenta de la lista para ver su saldo y sus movimientos.',
        '«Nueva cuenta» crea una caja, un banco o una billetera. Marcá si es de un tercero.',
        '«Ingreso o egreso» registra plata que entra o sale: importe, fecha, concepto y comprobante.',
        '«Transferir» mueve plata entre dos cuentas. Hacen falta al menos dos.',
        '«Conciliar» compara el saldo del sistema con el real: elegí el día, escribí el saldo real y explicá la diferencia si hay.',
        '«Editar cuenta» cambia nombre, banco, titular o la desactiva. Una cuenta inactiva no aparece para pagar ni cobrar, pero su historia queda.',
        'Para deshacer un movimiento, usá «Anular» (o «Anular transferencia») y escribí el motivo. Los movimientos automáticos de pagos y cobros no se anulan acá.',
      ],
      GERENCIA: [
        'Ves el saldo de cada caja y banco y todos sus movimientos.',
        'Podés registrar un ingreso o egreso, transferir entre cuentas y conciliar.',
        'Para corregir un movimiento usá «Anular» con un motivo.',
        'Los pagos y cobros generan su movimiento solos: no los cargues dos veces.',
      ],
    },
    aTener: [
      'Un movimiento no se edita ni se borra: se anula, y la anulación queda registrada con su motivo.',
      'Los pagos a proveedores y los cobros de clientes se anulan desde sus cuentas corrientes, no desde acá.',
    ],
  },

  '/cuentas-proveedores': {
    queEs:
      'Es la cuenta corriente de cada proveedor: lo que se le debe, qué vence y si coincide con lo que él informa.',
    porRol: {
      ADMINISTRACION: [
        'La lista muestra la deuda y los vencimientos de cada proveedor. Tocá uno, o usá «Ir a un proveedor», para ver su cuenta.',
        '«Nuevo proveedor» da de alta uno. Queda «sin dictamen» hasta que Dirección Técnica lo apruebe, pero igual podés pagarle y cargarle comprobantes.',
        '«Cargar comprobante»: elegí el tipo (factura, nota de crédito o «Sin factura»), completá punto de venta, número, fecha, vencimiento e importes. Una nota de crédito pide la factura que corrige.',
        '«Registrar pago»: elegí de qué cuenta sale, el medio y el importe, y a qué comprobantes se imputa.',
        '«Conciliar» compara tu saldo con el que informa el proveedor: escribí el saldo informado y explicá la diferencia.',
        'En cada fila del movimiento podés tocar «Anular» (comprobante o pago) y escribir el motivo.',
      ],
      GERENCIA: [
        'Ves todas las cuentas de proveedores y sus saldos. Elegí uno para ver el detalle.',
        'Podés registrar pagos, cargar comprobantes y conciliar.',
        '«Anular» deja sin efecto un pago o comprobante con su motivo.',
        'El «Historial» de cada movimiento muestra quién lo cambió y cuándo.',
      ],
    },
    aTener: [
      'Un comprobante o un pago no se edita ni se borra: se anula con motivo, y se vuelve a cargar bien.',
      'Sin factura no hay crédito fiscal de IVA.',
      'Los pagos se hacen desde acá o desde «Solicitudes de pago».',
    ],
  },

  '/cuentas-clientes': {
    queEs:
      'Es la cuenta corriente de cada cliente: lo facturado, lo cobrado, lo que debe y hace cuánto.',
    porRol: {
      ADMINISTRACION: [
        'La lista muestra el saldo de cada cliente y cuánto tiene vencido: hasta 30 días, de 31 a 60, de 61 a 90 y más de 90.',
        'Tocá un cliente (o usá «Ir a un cliente») para abrir su cuenta.',
        'Tocá «Registrar cobro»: elegí en qué cuenta entra, el medio y el importe.',
        'Imputá el cobro a las facturas que corresponden. No podés imputar más de lo cobrado ni más de lo que debe cada factura.',
        'Lo cobrado que no imputás queda como «Cobrado sin imputar».',
        'Si un cobro estuvo mal, tocá «Anular» en su fila y escribí el motivo.',
      ],
      GERENCIA: [
        'Ves el saldo y la antigüedad de la deuda de cada cliente.',
        'Abrí un cliente para ver sus facturas, cobros y saldo.',
        '«Registrar cobro» anota lo que pagó e imputa a facturas. «Anular» deshace un cobro con motivo.',
        'El «Historial» muestra quién modificó cada movimiento.',
      ],
    },
    aTener: [
      'Un cobro no se borra ni se edita: se anula con motivo.',
      'Las facturas de homologación (pruebas) no cuentan en los saldos.',
    ],
  },

  '/solicitudes-pago': {
    queEs:
      'Es donde cualquier área pide un pago y Administración lo aprueba y lo paga. Queda quién pidió, quién resolvió y cuándo.',
    porRol: {
      VENTAS: [
        'Tocá «Pedir un pago».',
        'Completá «Qué se paga», el proveedor (o «A quién» si no está cargado), el importe y el vencimiento. El medio sugerido es opcional.',
        'Tocá «Enviar a Administración». La solicitud queda «pendiente».',
        'Si te equivocaste y todavía está pendiente, podés tocar «Anular» y escribir el motivo.',
        'No podés aprobar, rechazar ni pagar: eso lo hace Administración.',
      ],
      GERENCIA_PRODUCCION: [
        'Tocá «Pedir un pago» para pedir el pago de algo del área de producción.',
        'Completá qué se paga, a quién, el importe y el vencimiento, y «Enviar a Administración».',
        'Seguí el estado en la lista: pendiente, aprobada, pagada o rechazada.',
        'Mientras esté pendiente podés anular la tuya con «Anular» y un motivo.',
        'No podés aprobar ni pagar.',
      ],
      ADMINISTRACION: [
        'En «Pendientes y aprobadas» ves lo que hay para resolver. «Todas» incluye las pagadas, rechazadas y anuladas.',
        'En una solicitud pendiente tocá «Aprobar», o «Rechazar» con un motivo.',
        'En una aprobada tocá «Pagar»: elegí de qué cuenta sale. Si es a un proveedor cargado, baja su cuenta corriente.',
        '«Anular» deja sin efecto una aprobada (con motivo).',
        'También podés pedir un pago con «Pedir un pago».',
      ],
      GERENCIA: [
        'Ves todas las solicitudes de las distintas áreas.',
        'Podés «Aprobar» o «Rechazar» las pendientes y «Pagar» las aprobadas.',
        '«Rechazar» y «Anular» piden motivo.',
        'También podés pedir un pago con «Pedir un pago».',
      ],
    },
    aTener: [
      'Para pedir un pago tu usuario tiene que tener un sector asignado. Si «Enviar a Administración» no se activa, avisale al administrador del sistema.',
      'Una solicitud pagada no se modifica ni se borra.',
    ],
  },

  '/reportes': {
    queEs:
      'Son los reportes de IVA, ventas, resultado, flujo de fondos y compras, armados con lo que se carga día a día.',
    porRol: {
      ADMINISTRACION: [
        'Elegí la pestaña: «IVA Compras vs. Ventas», «Ventas», «Resultado mensual», «Cash flow real», «Cash flow proyectado» o «Compras».',
        'El IVA es una estimación para anticipar la posición antes del cierre. La liquidación la hace el estudio.',
        'Las compras «Sin factura» no dan crédito fiscal.',
        'Estas pantallas son solo para mirar: los datos se cargan en Facturas, Proveedores, Clientes y Tesorería.',
      ],
      GERENCIA: [
        'Elegí la pestaña según lo que quieras ver: IVA, ventas, resultado mensual, cash flow real, cash flow proyectado o compras.',
        '«Cash flow proyectado» muestra lo que vence y se espera cobrar.',
        'Si algo no cierra, la cuenta corriente de proveedores o de clientes te lleva al detalle.',
        'Las facturas de homologación (pruebas) no cuentan en los números.',
      ],
    },
    aTener: [
      'Los números salen de lo cargado: si falta cargar una factura, no aparece acá.',
      'El IVA es una estimación, no la liquidación.',
    ],
  },

  '/usuarios': {
    queEs:
      'Es la lista de las personas del sistema, con su rol y su sector. Solo la ve el administrador del sistema.',
    porRol: {
      ADMINISTRADOR_SISTEMA: [
        'Cada fila muestra nombre, correo, rol, sector, fecha de alta y estado (Habilitado o Desactivado).',
        'Tocá «Editar» en la fila de la persona.',
        'En «Rol principal» elegí su puesto. En «Roles adicionales» sumá otros si ocupa más de un puesto: los permisos son la suma de todos.',
        'Elegí su «Sector».',
        'Para dar de baja, apagá «Cuenta habilitada». La persona deja de entrar, pero su historial queda.',
        'Tocá «Guardar». El cambio de rol se aplica cuando la persona renueva su sesión: puede hacerlo con «Actualizar permisos» desde su menú.',
        'Cuidado si te editás a vos: si te sacás el rol de administrador del sistema perdés esta pantalla.',
      ],
    },
    aTener: [
      'Un usuario nunca se borra, solo se desactiva.',
      'Cada cambio queda en la auditoría.',
    ],
  },

  '/visibilidad': {
    queEs:
      'Es una grilla de cada pantalla contra cada rol. Tildar o destildar decide qué aparece en el menú de ese rol.',
    porRol: {
      ADMINISTRADOR_SISTEMA: [
        'Cada fila es una pantalla (o una pestaña) y cada columna es un rol, con quién lo usa hoy.',
        'Tildado significa que ese rol la ve en su menú. Tocá la casilla para mostrarla u ocultarla.',
        'El borde azul marca lo que cambiaste respecto del valor original. Si volvés a dejarla como estaba, el borde se va.',
        'El cambio es inmediato y queda registrado.',
        'Esto solo decide el menú: lo que cada rol puede leer o cargar lo sigue decidiendo la base de datos. Si le mostrás una pantalla a un rol sin permiso, la va a ver vacía.',
        'Vos (administrador del sistema) ves todo siempre.',
      ],
    },
    aTener: [
      'Ocultar una pantalla no bloquea el acceso a los datos: es solo el menú.',
    ],
  },

  '/auditoria': {
    queEs:
      'Es el registro de todo lo que se escribió en el sistema: quién, cuándo, y qué valor tenía antes y después. Es lo que un inspector va a pedir.',
    porRol: {
      DIRECCION_TECNICA: [
        'Ves las últimas 200 escrituras, de la más nueva a la más vieja.',
        'Cada fila indica el momento, la tabla, la operación (alta, cambio, intento de borrado, firma), el usuario y el rol de base.',
        'Tocá «Ver valores» para ver el «ANTES» y el «DESPUÉS» de ese registro.',
        'Un aviso rojo («Escrituras con rol privilegiado») marca cambios que no vinieron de una persona. El sistema no los produce normalmente: hay que justificarlos.',
        'Solo se mira: acá no se puede editar ni borrar nada.',
      ],
      GERENCIA: [
        'Ves el registro de las últimas 200 escrituras con usuario y momento.',
        '«Ver valores» abre cómo estaba el registro antes y cómo quedó después.',
        'Si aparece el aviso rojo de escrituras con rol privilegiado, avisá al administrador del sistema: hay que justificarlas.',
      ],
      ADMINISTRADOR_SISTEMA: [
        'Ves las últimas 200 escrituras con usuario, tabla, operación y rol de base.',
        '«Ver valores» muestra el «ANTES» y el «DESPUÉS» de cada una.',
        'Las filas con rol privilegiado se marcan en rojo: son anomalías y hay que justificarlas.',
        'Es un registro de solo lectura.',
      ],
    },
    aTener: [
      'La auditoría no se modifica ni se borra, por nadie.',
      'Solo muestra las últimas 200 escrituras.',
    ],
  },
};
