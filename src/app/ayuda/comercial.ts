import type { MapaAyuda } from './tipos';

const NADA_SE_BORRA =
  'Nada se borra: si algo se cargó mal, se corrige con otro registro que lo anula.';

export const AYUDA_COMERCIAL: MapaAyuda = {
  '/ventas': {
    queEs:
      'Es la lista de todos los pedidos mayoristas, como la planilla de antes. Cada fila es un pedido: muestra el cliente y su número, la fecha, quién lo gestionó, la forma de pago, el número de factura, el descuento, lo que falta, la observación, el estado del pago, el destino, el importe con descuento y el estado del stock. El monto, el descuento y lo que hay en Calle 5 se calculan solos. Al tocar una fila se abre el pedido; desde ahí se envía a Calle 5 y a Producción, y después se factura y se despacha.',
    porRol: {
      VENTAS: [
        'Arriba tenés tres filtros: «Abiertos» (los que todavía no se entregaron y no están cancelados), «Entregados» y «Todos». Empieza en «Abiertos».',
        'Para encontrar uno, escribí en el buscador el cliente, el número, el destino, la observación o la forma de pago.',
        'Tocá «Nuevo pedido» para cargar uno. Tocar una fila abre ese pedido.',
        'Las filas verdes están entregadas y pagas. Las naranjas tienen algo pendiente: falta stock en Calle 5, hay unidades a producir o queda algo por armar. Las que no tienen color están al día o son borradores.',
        'La columna «Faltantes» te dice qué falta: lo que no hay en Calle 5, las unidades a producir (con el número del pedido de producción) o «por armar». Un borrador dice «sin enviar».',
        'En la columna «Pago» podés cambiar el estado del pago directo desde la lista, sin abrir el pedido: se guarda apenas elegís otro valor.',
        'La columna «Stock» dice si en Calle 5 «hay ✓», si «falta», si ya está «entregado», si está «a revisar» (Calle 5 todavía no lo miró) o si es un «borrador» sin enviar.',
        'En «Fact.» ves el tipo y el número de factura cuando el pedido ya se facturó; si dejás el mouse encima, ves el número completo con punto de venta.',
      ],
      ADMINISTRACION: [
        'Podés ver todos los pedidos y buscarlos por cliente, número, destino, observación o forma de pago.',
        'Con «Abiertos» (sin entregar y no cancelados), «Entregados» y «Todos» cambiás qué pedidos ves.',
        'Tocá una fila para abrir el pedido. Ahí está el botón «Facturar y ver el despacho», que lleva a la factura.',
        'En la columna «Pago» podés cambiar el estado del pago directo desde la lista; se guarda al elegir otro valor.',
        'La columna «Fact.» muestra el tipo y el número de factura cuando el pedido ya se facturó.',
        'Las filas verdes están entregadas y pagas; las naranjas tienen algo pendiente (falta stock, hay que producir o está sin armar). La columna «Faltantes» explica qué es.',
        'Con «Nuevo pedido» podés cargar uno vos.',
      ],
      GERENCIA: [
        'Ves todos los pedidos mayoristas. Usá «Abiertos», «Entregados» y «Todos» y el buscador (cliente, número, destino) para acotar.',
        'Tocá una fila para ver el detalle del pedido.',
        'Naranja significa que algo falta (stock en Calle 5, producción o armado). Verde, que está entregado y pago. La columna «Faltantes» dice qué es.',
        'La columna «Stock» muestra «hay ✓», «falta», «a revisar», «entregado» o «borrador».',
        'Podés cargar un pedido con «Nuevo pedido» y cambiar el estado de pago desde la columna «Pago».',
        'La columna «Fact.» muestra el número de factura cuando el pedido ya se facturó.',
      ],
    },
    aTener: [
      'Un pedido «borrador» todavía no llegó a Calle 5: hasta que se envíe, nadie lo arma.',
      'Un pedido enviado no se borra.',
      'Cambiar el estado de «Pago» desde la lista es inmediato: no pide confirmación.',
    ],
  },

  '/ventas/:id': {
    queEs:
      'Es un pedido mayorista. Es la lista de precios con una columna de cantidad: escribís cuántas unidades querés de cada producto y el total y el descuento se calculan solos. Arriba están los datos del pedido (cliente, entrega, forma de pago, descuento, destino, observación); abajo, la tabla de productos con su precio de lista, el precio con promoción, el total del renglón y lo que hay disponible en Calle 5; y en el pie fijo, el total de la compra, el porcentaje de descuento y el total con descuento.',
    porRol: {
      VENTAS: [
        'Escribí el nombre del cliente. Si está en el padrón te lo sugiere; si no está, se puede cargar igual, pero para facturar hay que darlo de alta en Clientes.',
        'Completá la fecha de «Entrega», la «Forma de pago», el «Destino (envío o retiro)» (nombre, DNI, domicilio o «retira en el local») y la «Observación» si hace falta.',
        'En «Descuento del pedido» elegí «Por monto» (lo calcula la escala según el total del pedido, y al pasar cada escalón se aplica a todo el pedido) o «Fijo», y escribí el porcentaje de 0 a 100.',
        'En la tabla escribí la cantidad en la primera columna de cada producto. Podés buscar por código o nombre, y tildar «Solo lo pedido» para ver únicamente lo que ya cargaste. Los productos en pack se cargan en packs; si hay un mínimo y no llegás, el campo marca «mín.».',
        'La última columna, «Calle 5», es lo que hay disponible: verde si alcanza para lo que pediste, naranja si alcanza a medias, rojo si no hay.',
        'El lápiz al lado del precio unitario final sirve para poner otro precio a mano (precio final con IVA): escribilo y tocá «Usar». «Volver a la lista» lo deshace.',
        'En el pie ves el total de la compra, el porcentaje de descuento y el total con descuento. «Te faltan $X para el N %» te dice cuánto falta para el próximo escalón; «Ver escala» muestra todos los escalones.',
        '«Guardar borrador» guarda sin avisar a nadie (hace falta al menos el cliente) y podés seguir editando después.',
        'En «Sale de» elegís de qué depósito se envía: por defecto, Fábrica para BELLA CENTRAL (y sus locales), CESAR CUEVA (TAURO) y YESSICA FRANCHESCA CONTRERAS DUQUE, y Berna para el resto. La columna de stock muestra lo libre en ese depósito.',
        'Cuando el pedido esté completo, tocá «Pedir fecha a Producción» (necesita cliente y al menos un producto). Queda «Esperando fecha» y le aparece a Gerencia de Producción: reserva lo que hay en stock y pone fecha solo para lo que hay que producir. Si reserva todo, el pedido queda aprobado solo, para hoy.',
        '«Descartar pedido» lo cancela con un motivo y libera lo reservado. No se borra: queda en el historial.',
        'Cuando Producción propone la fecha, el pedido pasa a «Fecha propuesta» y arriba ves en verde qué día se compromete a entregarlo, quién lo propuso, su nota y los productos que demoran más.',
        'Mientras no lo apruebes podés seguir corrigiendo y tocar «Guardar cambios». Si cambiás productos o cantidades, vuelve a Producción para que reconfirme la fecha; si cambiás precio, descuento o forma de pago, no.',
        'Si la fecha te sirve, tocá «Aprobar». En la ventana decidís cuántas unidades de cada producto se arman de Calle 5 para este cliente (te sugiere lo disponible); lo que falta va a Producción. Confirmás con «Aprobar».',
        'Al aprobar, el pedido impacta: reserva lo de Calle 5, la entrega queda en la fecha que comprometió Producción y se registra el importe pedido, que es el que cuenta en las estadísticas. Desde ahí ya no se edita, y «Facturar y ver el despacho» te lleva a la factura y a la entrega.',
      ],
      ADMINISTRACION: [
        'Podés cargar o completar un pedido igual que Ventas: escribí el cliente, la entrega, la forma de pago, el destino y la observación, y elegí el descuento («Por monto» o «Fijo»).',
        'En la tabla escribí la cantidad de cada producto; el total con descuento se calcula solo en el pie. El número de la columna «Calle 5» es lo que hay disponible.',
        '«Guardar borrador» lo deja guardado sin enviarlo (necesita el cliente). «Pedir fecha a Producción» lo manda a Gerencia de Producción para que comprometa cuándo sale.',
        'Con la fecha propuesta, «Aprobar» abre una ventana donde decidís cuánto se arma de Calle 5 y lo que falta va a Producción; confirmás con «Aprobar».',
        'Con el pedido aprobado, tocá «Facturar y ver el despacho» para emitir la factura y seguir la entrega. Un pedido aprobado no se edita.',
      ],
      GERENCIA: [
        'Podés cargar un pedido o revisar uno existente: cliente, entrega, forma de pago, destino, descuento, cantidades y precios.',
        'El lápiz junto al unitario final permite poner un precio a mano; «Volver a la lista» lo deshace.',
        '«Guardar borrador» lo guarda sin avisar a nadie. «Pedir fecha a Producción» lo manda a Gerencia de Producción para que comprometa cuándo sale.',
        'Aprobar el pedido con la fecha propuesta es de Ventas: vos lo ves, pero no tenés el botón «Aprobar».',
        'Con el pedido aprobado, «Facturar y ver el despacho» abre la factura y el seguimiento de la entrega. Un pedido aprobado no se edita.',
      ],
    },
    aTener: [
      'Antes de «Aprobar» todo se puede cambiar. Después, el pedido queda fijo.',
      'Un pedido cuenta en las estadísticas de ventas recién cuando se aprueba, con el importe de ese momento. Los aprobados antes de este circuito no cuentan en esa estadística.',
      'El precio de cada pedido queda como estaba al cargarlo: si después cambia la lista, este pedido no cambia.',
      'No te pongas a repartir lo disponible entre clientes a ojo: el sistema no lo reparte, lo decidís vos en la ventana de «Aprobar».',
      'Un cliente que no está en el padrón no se puede facturar: hay que darlo de alta en Clientes.',
    ],
  },

  '/armado': {
    queEs:
      'Es lo único que ve la encargada de Calle 5. Tiene dos pestañas. «Pedidos a armar» muestra una tarjeta por cada pedido que Ventas envió y todavía no salió completo: número, cliente, destino, fecha de entrega y una tabla con el código, el producto, cuánto hay que armar y cuánto hay en Calle 5. «Stock de Calle 5» es el stock de producto terminado del local, para contar, registrar lo que entra o sacar lo fallado. Lo que se confirma acá descuenta el stock y deja registrado el lote de cada unidad.',
    porRol: {
      ENCARGADA_STOCK: [
        'En «Pedidos a armar» aparece una tarjeta por pedido con cliente, destino, observación y lo que hay que preparar. En la columna «En C5» ves cuánto hay de cada producto: verde si alcanza, naranja si no.',
        'Cuando mirás el stock y alcanza, tocá «Hay». Ventas lo ve en su lista como «hay ✓».',
        'Si no alcanza, tocá «Falta», escribí qué falta (por ejemplo «del 101 hay 12, no 20») y tocá «Avisar a Ventas». La nota es obligatoria.',
        'Cuando armaste el pedido y sale, tocá «Enviado». Se abre una ventana con el código, el producto, lo pedido y lo que sale.',
        'Si sale todo lo pedido, dejá «Va completo». Si sale menos, elegí «Va con faltantes» y escribí en la columna «Sale» cuántas unidades salen de cada producto.',
        'Si sale distinto de lo pedido, el sistema te pide el motivo (fallado, no hay, lo pidió el cliente) y no te deja confirmar sin él.',
        'Tocá «Enviado» para confirmar (o «Volver» para cerrar sin hacer nada). Al confirmar, se descuenta el stock y queda registrado el lote de cada unidad que salió.',
        'La pestaña «Stock de Calle 5» es para contar con «Contar», anotar lo que entra con «Entró», sacar lo que sale sin pedido con «Salida sin pedido» o sacar lo fallado con «Sacar fallado». Los pedidos se despachan siempre desde «Pedidos a armar».',
      ],
      GERENCIA: [
        'Ves los mismos pedidos que la encargada: una tarjeta por pedido con lo que hay que armar y cuánto hay en Calle 5.',
        'Podés tocar «Hay» si alcanza el stock, o «Falta» (con una nota de qué falta y «Avisar a Ventas»).',
        'Con «Enviado» se abre una ventana: elegís «Va completo» o «Va con faltantes» y, en este último caso, cuántas unidades salen de cada producto. Si sale distinto de lo pedido hay que escribir el motivo.',
        'Al confirmar con «Enviado» se descuenta el stock y queda el lote de cada unidad.',
        'En la pestaña «Stock de Calle 5» ves el stock, las reservas y los últimos movimientos, y podés contar, registrar entradas, salidas sin pedido y fallados.',
      ],
    },
    aTener: [
      '«Enviado» descuenta el stock y no se deshace. Revisá las cantidades antes de confirmar.',
      'Lo que no sale queda pendiente dentro del pedido y sigue apareciendo hasta que salga.',
      NADA_SE_BORRA,
    ],
  },

  '/stock?vista=depositos': {
    queEs:
      'Arriba hay un cuadradito por depósito de producto terminado: Fábrica, Calle 5 y Berna. Tocá uno para ver su stock; «Enviar a otro depósito» mueve mercadería entre los tres. Lo que sigue describe Calle 5, el local; Fábrica y Berna funcionan igual, sin la parte de pedidos. Es el stock de producto terminado de Calle 5, el local. Entra lo que manda la planta y sale lo que se vende o se descarta. Arriba hay dos contadores: «Unidades en el local» y «Productos con stock». Después viene la tabla con cada producto, sus unidades (con las que están retenidas por lote sin liberar) y la fecha del último movimiento. Más abajo hay tres pestañas («Pedidos a despachar», «Por producto» y «Reservas») y la lista de últimos movimientos. Todo movimiento queda en un libro del que no se borra nada.',
    porRol: {
      VENTAS: [
        'Arriba ves cuántas unidades hay en el local y cuántos productos tienen stock. Si un producto tiene unidades «retenidas: lote sin liberar», esas no se pueden vender todavía.',
        '«Contar» sirve para dejar un producto en lo que hay de verdad: elegí el producto, escribí las «Unidades contadas», sumá una observación si querés y tocá «Registrar conteo». El sistema registra el ajuste por la diferencia y el saldo queda en lo contado.',
        '«Entró» registra mercadería que llega: elegí el motivo (devolución, por ejemplo), el producto, la cantidad (siempre en positivo) y el lote del envase. Tocá «Registrar».',
        '«Salida sin pedido» es para lo que sale sin pedido: mostrador, ajuste o descarte. Elegí el motivo, el producto, la cantidad y el lote. Los pedidos mayoristas se despachan desde «Pedidos a despachar».',
        '«Sacar fallado» saca producto fallado como descarte y exige una observación. Un ajuste o un descarte sin explicación no te deja registrar.',
        'En la pestaña «Pedidos a despachar» ves los pedidos enviados que todavía no salieron completos; tocá «Despachar», revisá en cada producto lo que sale ahora y confirmá con «Despachar completo» o «Despachar con faltantes». No te deja sacar más de lo que hay para ese cliente.',
        'En «Por producto» ves por cada producto lo que hay en Calle 5, lo reservado, lo libre, lo que piden los pedidos abiertos, lo que está en producción y lo que falta producir. Desde ahí se reserva mercadería con «Reservar» (para un pedido) o «Reservar para un cliente sin pedido».',
        'En «Reservas» ves lo reservado para cada cliente o pedido y cuánto ya salió; con «Liberar» y un motivo (mínimo 3 letras) lo que quedó sin salir vuelve a estar libre.',
      ],
      ADMINISTRACION: [
        'Ves el stock del local y sus últimos movimientos.',
        '«Contar» deja un producto en lo que hay de verdad; «Entró» y «Salida sin pedido» registran movimientos con su motivo, producto, cantidad y lote. «Sacar fallado» y los ajustes piden observación.',
        'En «Pedidos a despachar» tocá «Despachar» para sacar un pedido entero o con faltantes.',
        'En «Por producto» podés reservar con «Reservar» y, si falta producir, usar «Mandar a producir lo que falta»: revisás las cantidades y tocás «Enviar a producción».',
        'En «Reservas» ves lo reservado y podés liberarlo con «Liberar» y un motivo.',
      ],
      GERENCIA: [
        'Ves el stock del local, lo reservado para cada cliente y lo que falta producir.',
        '«Contar», «Entró», «Salida sin pedido» y «Sacar fallado» registran los movimientos: se elige producto, cantidad y lote.',
        'Los ajustes, descartes y fallados piden observación obligatoria.',
        'En «Pedidos a despachar» podés despachar con «Despachar»; en «Por producto» reservar; en «Reservas», liberar con motivo.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves el stock del local y lo que piden los pedidos abiertos.',
        'En la pestaña «Por producto», si falta producir, aparece el aviso con el botón «Mandar a producir lo que falta». Se abre una ventana con las cantidades que faltan (las podés ajustar) y «Enviar a producción» crea el pedido de producción para Calle 5.',
        '«Contar», «Entró», «Salida sin pedido» y «Sacar fallado» registran movimientos. Los ajustes y fallados piden observación.',
        'En «Pedidos a despachar» tocá «Despachar» y en «Reservas», «Liberar» (con motivo).',
      ],
    },
    aTener: [
      'Un ajuste o un descarte siempre pide motivo y no se borra.',
      'Si un movimiento estuvo mal, se corrige con otro movimiento.',
      'La cantidad se escribe siempre en positivo: el sistema pone el signo según el motivo.',
      'El lote es lo que permite alcanzar esa mercadería si hay un retiro del mercado.',
    ],
  },

  '/facturas': {
    queEs:
      'Es la lista de las facturas emitidas desde cada pedido, con su estado y el CAE. Arriba hay tres contadores («Autorizadas», con el total; «Rechazadas»; y «Pendientes»), después los filtros y la tabla con comprobante, cliente, pedido, neto, IVA, total, estado y CAE o motivo. Acá solo se miran: las facturas se emiten desde el pedido.',
    porRol: {
      VENTAS: [
        'Arriba hay tres contadores: «Autorizadas» (con el total; las notas de crédito restan), «Rechazadas» y «Pendientes».',
        'Filtrá con «Todas», «Autorizadas», «Rechazadas» o «Pendientes».',
        'Cada fila muestra el comprobante y su fecha, el cliente, el pedido, el neto, el IVA y el total. Tocá el número de pedido para abrirlo.',
        'En «CAE / motivo» ves el CAE si está autorizada. Si está «Rechazada», dice el motivo que dio ARCA. Si está «Pendiente», dice «En curso» y se reintenta desde el pedido.',
        'Desde esta pantalla no se emite ni se anula nada: se hace desde la ficha del pedido.',
      ],
      ADMINISTRACION: [
        'Ves todas las facturas y podés filtrarlas por estado con «Todas», «Autorizadas», «Rechazadas» o «Pendientes».',
        'La columna «CAE / motivo» muestra el CAE si está autorizada, o el motivo del rechazo.',
        'Para emitir, reintentar una pendiente o anular con nota de crédito, abrí el pedido (tocá su número) y usá los botones de ahí.',
        'Las notas de crédito aparecen como comprobantes aparte y restan del total autorizado.',
      ],
      GERENCIA: [
        'Ves el total autorizado (las notas de crédito restan), cuántas facturas fueron rechazadas y cuántas están pendientes.',
        'Filtrá por estado con los botones de arriba.',
        'Tocá el pedido de una factura para ver su detalle.',
        'Para una rechazada, la columna «CAE / motivo» muestra el motivo que dio ARCA.',
      ],
    },
    aTener: [
      'Una factura autorizada no se edita ni se borra. Se corrige con una nota de crédito (en el pedido: «Anular con nota de crédito») y después se vuelve a facturar.',
      'Si aparece el aviso de «homologación», esas facturas son pruebas contra ARCA: no tienen validez fiscal.',
    ],
  },

  '/clientes': {
    queEs:
      'Es el padrón de clientes. La tabla muestra el nombre (con domicilio y correo si los hay), la condición frente al IVA, el documento y la clase de factura que le corresponde (A o B). La condición frente al IVA decide si se le factura A o B; los clientes desactivados se ven atenuados y con la marca «Inactivo».',
    porRol: {
      VENTAS: [
        'Buscá por nombre o documento en el buscador de arriba.',
        'Tocá «Nuevo cliente» y completá razón social o nombre, condición frente al IVA, tipo de documento (CUIT, CUIL, DNI o «Sin identificar») y número. Domicilio y correo son opcionales.',
        'Antes de guardar, el cuadro azul te avisa qué factura le va a corresponder («Se le va a emitir Factura A» o «B»). Tocá «Dar de alta».',
        'Si la condición es Responsable Inscripto o Monotributo, hace falta el CUIT, y el sistema valida los 11 dígitos. «Sin identificar» solo vale para Consumidor Final.',
        'Para corregir un cliente, tocá su fila, cambiá los datos y tocá «Guardar».',
        'Si un cliente ya no compra, destildá «Activo» (aparece al editar). No se borra.',
      ],
      ADMINISTRACION: [
        'Buscá por nombre o documento.',
        '«Nuevo cliente» da de alta uno nuevo: razón social, condición frente al IVA, documento y número (domicilio y correo son opcionales). Se confirma con «Dar de alta».',
        'Tocá una fila para editarlo y confirmá con «Guardar».',
        'La condición frente al IVA decide si se le factura A o B: cargala con cuidado. El sistema valida que el CUIT tenga sus 11 dígitos correctos.',
        'Si ya no opera, destildá «Activo» al editar en lugar de borrarlo.',
      ],
      GERENCIA: [
        'Ves el padrón completo y podés buscar por nombre o documento.',
        'Podés dar de alta con «Nuevo cliente» (se confirma con «Dar de alta») o corregir los datos tocando la fila («Guardar»).',
        'El cuadro azul del formulario te dice qué factura le corresponde según la condición de IVA.',
        'Para dar de baja a un cliente, destildá «Activo» al editarlo.',
      ],
    },
    aTener: [
      'Un cliente nunca se borra: se desactiva y su historia queda.',
      'Si el documento o la condición de IVA están mal, la factura puede salir con el tipo equivocado.',
      'ARCA no acepta Factura B a un monotributista: por eso a un Monotributo se le factura A.',
    ],
  },

  '/precios': {
    queEs:
      'Es donde se ven y se cambian los precios de lista (con IVA incluido), los descuentos por cliente y la escala de descuento por monto del pedido mayorista. Tiene tres pestañas: «Precios de lista» (cada producto con su precio con IVA, el neto y desde cuándo rige), «Descuentos por cliente» y «Escala por monto» (los escalones que se aplican según el total del pedido). Los pedidos nuevos toman estos valores.',
    porRol: {
      VENTAS: [
        'Hay tres pestañas: «Precios de lista», «Descuentos por cliente» y «Escala por monto».',
        'En «Precios de lista» buscá el producto por nombre o código. El botón «Sin precio» muestra solo los que todavía no tienen precio (entre paréntesis, cuántos son).',
        'Tocá «Cambiar» (o «Poner precio» si no tiene), escribí el «Nuevo precio de lista (con IVA)», sumá un motivo si querés (por ejemplo «Aumento de septiembre») y tocá «Guardar precio». El precio tiene que ser mayor a cero.',
        'En «Descuentos por cliente» elegí el cliente, el producto (vacío es un descuento general del cliente), el porcentaje (0 lo quita) y un motivo, y tocá «Guardar». El descuento de un producto gana sobre el general.',
        'En «Escala por monto» ves los escalones de descuento. Tocá «Cambiar los cortes»: en «Escala nueva» cargá cada escalón («Desde» el monto y «Descuento»), el primero tiene que estar en $0; con «Agregar escalón» sumás más, indicá «Rige desde» y tocá «Guardar escala».',
      ],
      ADMINISTRACION: [
        'Podés ver y cambiar precios de lista con «Cambiar» o «Poner precio». Escribí el precio con IVA, un motivo si querés, y «Guardar precio».',
        'En «Descuentos por cliente» cargás o cambiás un descuento: cliente, producto (vacío es general), porcentaje (0 lo quita) y motivo, y «Guardar».',
        'En «Escala por monto», con «Cambiar los cortes» ajustás los escalones del descuento por monto: el primero en $0, sin montos repetidos y con porcentajes de 0 a 100; elegí «Rige desde» y «Guardar escala».',
        'Usá «Sin precio» para ver rápido qué productos faltan cargar.',
      ],
      GERENCIA: [
        'Ves precios, descuentos y escala. Podés cambiarlos igual que Ventas y Administración.',
        'En «Precios de lista», «Cambiar» o «Poner precio» abre una ventana con el precio con IVA y un motivo opcional; conviene escribirlo. Se confirma con «Guardar precio».',
        '«Sin precio» te muestra rápido qué productos faltan cargar.',
        'En «Descuentos por cliente» fijás un descuento por cliente (general o por producto) y en «Escala por monto» cambiás los escalones con «Cambiar los cortes».',
      ],
    },
    aTener: [
      'Cada cambio de precio crea una versión nueva: la anterior queda guardada.',
      'Los pedidos ya cargados conservan el precio con el que se cargaron.',
      'Una escala nueva no cambia los pedidos ya enviados.',
    ],
  },

  '/administracion': {
    queEs:
      'Es el inicio de Administración: lo que hay que resolver hoy, ordenado por prioridad. Arriba hay ocho cuadros con importes y cantidades; la mayoría lleva con un toque a la pantalla donde se resuelve. Más abajo hay un aviso de facturas por cargar (si corresponde), el gráfico de flujo de fondos, las tortas de ventas por cliente y compras por proveedor, y botones rápidos a las demás pantallas.',
    porRol: {
      ADMINISTRACION: [
        'Arriba hay cuadros: «Pagos vencidos» (lleva a Cuentas de proveedores), «Solicitudes por aprobar» (a Solicitudes de pago), «Facturas por cargar», «Diferencias con proveedores», «Cajas y bancos propios» (a Tesorería), «IVA del mes» (a Reportes), «A cobrar» (a Cuentas de clientes) y «Próximos 7 días» (a Reportes). Tocá uno para ir a donde se resuelve.',
        'Si aparece el aviso rojo «Tenés N facturas por cargar», hay recepciones que entraron sin comprobante. En la recepción la factura es opcional, y Dirección Técnica ni la ve.',
        'En cada una tocá «Cargar factura». Se abre el formulario «Cargar comprobante» con la recepción ya vinculada.',
        'Elegí el tipo de comprobante (Factura A, B o C, nota de crédito, o «Sin factura») y completá punto de venta, número, fecha, vencimiento del pago e importes (neto, IVA y otros en facturas A; total en el resto). Tocá «Cargar». Con eso queda el IVA crédito y la deuda con el proveedor.',
        'Si de verdad vino sin factura, cargala como «Sin factura». Esa compra no da crédito fiscal.',
        'Mientras no cargues la factura, la recepción sigue apareciendo en el aviso.',
        'Más abajo hay el gráfico de flujo de fondos, las tortas de «Ventas por cliente» y «Compras por proveedor», y botones rápidos a Proveedores, Clientes, Tesorería, Pagos, Compras, Facturas y Reportes.',
      ],
      GERENCIA: [
        'Es el resumen de lo que hay que resolver: pagos vencidos, solicitudes por aprobar (con su importe), facturas por cargar, diferencias con proveedores, cajas y bancos propios, IVA del mes, lo que hay para cobrar y los vencimientos de los próximos 7 días.',
        'Tocá un cuadro para ir a la pantalla donde se resuelve (por ejemplo, «Solicitudes por aprobar» lleva a Solicitudes de pago).',
        'El aviso «Tenés N facturas por cargar» lista recepciones que entraron sin comprobante. Las carga Administración con «Cargar factura»; vos también podés tocar ese botón.',
        'El gráfico de flujo y las tortas muestran el movimiento de fondos y los volúmenes por cliente y proveedor.',
        'Los botones de abajo te llevan a Proveedores, Clientes, Tesorería, Pagos, Compras, Facturas y Reportes.',
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
      'Son las cajas, los bancos, las billeteras y las cuentas de terceros. Arriba una tarjeta por cuenta muestra su nombre, tipo, saldo y la fecha de la última conciliación (en naranja si pasaron más de 30 días o nunca se hizo); la cuenta elegida muestra debajo sus movimientos con concepto, contraparte, comprobante e importe. Los pagos y cobros de proveedores y clientes se registran solos; acá va lo demás.',
    porRol: {
      ADMINISTRACION: [
        'Tocá la tarjeta de una caja o cuenta para ver su saldo y sus movimientos. Arriba ves el total en cuentas propias.',
        '«Nueva cuenta» crea una caja, un banco o una billetera: escribí el nombre y elegí el tipo; en banco o billetera podés sumar el banco y el N° / CBU / alias. Marcá «Es de un tercero» si no es de Nail Show (ahí el titular es obligatorio). Tocá «Crear».',
        '«Ingreso o egreso» registra plata que entra o sale de la cuenta elegida: elegí «Sale plata» o «Entra plata», el importe, la fecha, el concepto (obligatorio), a quién o de quién y el comprobante. Tocá «Registrar». Un pago a proveedor o un cobro a cliente no se cargan acá: se cargan desde su cuenta corriente.',
        '«Transferir» mueve plata entre dos cuentas: elegí «De» y «A», el importe y el concepto. Hacen falta al menos dos cuentas.',
        '«Conciliar» compara el saldo del sistema con el real (extracto del banco o arqueo de caja): elegí el día, escribí el saldo real y, si hay diferencia, explicala (es obligatorio). Tocá «Registrar conciliación».',
        '«Editar cuenta» cambia nombre, banco, número o titular, o la desactiva. Una cuenta inactiva no aparece para pagar ni cobrar, pero su historia queda.',
        'Para deshacer un movimiento, tocá «Anular» (o «Anular transferencia», que revierte las dos cuentas a la vez) y escribí el motivo (mínimo 3 letras). Se registra el movimiento inverso y el original queda a la vista. Los movimientos automáticos de pagos y cobros no se anulan acá.',
      ],
      GERENCIA: [
        'Ves el saldo de cada caja y banco, el total en cuentas propias y todos los movimientos de la cuenta que elijas.',
        'Podés crear cuentas con «Nueva cuenta», registrar «Ingreso o egreso» (concepto e importe obligatorios), «Transferir» entre cuentas y «Conciliar» (la explicación es obligatoria si hay diferencia).',
        'Para corregir un movimiento usá «Anular» con un motivo; las transferencias se anulan enteras con «Anular transferencia».',
        'Los pagos y cobros generan su movimiento solos (aparecen marcados «automático»): no los cargues dos veces.',
      ],
    },
    aTener: [
      'Un movimiento no se edita ni se borra: se anula, y la anulación queda registrada con su motivo.',
      'Los pagos a proveedores y los cobros de clientes se anulan desde sus cuentas corrientes, no desde acá.',
    ],
  },

  '/cuentas-proveedores': {
    queEs:
      'Es la cuenta corriente de cada proveedor. La lista muestra el saldo (lo que se le debe), lo vencido, el próximo vencimiento y el estado de la conciliación (si coincide con lo que el proveedor informa, tiene diferencia o está sin conciliar). Al abrir un proveedor se ve su cuenta con cada factura (debe), pago (haber) y el saldo corrido.',
    porRol: {
      ADMINISTRACION: [
        'La lista muestra la deuda y los vencimientos de cada proveedor. Tocá uno, o usá «Ir a un proveedor», para ver su cuenta con los movimientos y el saldo corrido; podés filtrar por período con «Desde» y «Hasta».',
        '«Nuevo proveedor» da de alta uno. Queda «sin dictamen» hasta que Dirección Técnica lo apruebe, pero igual podés pagarle y cargarle comprobantes.',
        '«Cargar comprobante»: elegí el tipo (Factura A, B o C, nota de crédito A, B o C, o «Sin factura»), completá punto de venta, número, fecha, «Vence el pago» e importes y tocá «Cargar». En facturas A se cargan neto, IVA y otros; en el resto, el total. Una nota de crédito pide la factura que corrige («Corrige la factura»).',
        '«Registrar pago»: elegí de qué cuenta sale («Sale de»), el medio, el importe y la referencia, y en «¿Qué cancela?» a qué comprobantes se imputa. No podés imputar más de lo que debe cada comprobante ni más que el importe del pago; lo que no imputás queda a cuenta.',
        '«Conciliar» compara tu saldo con el que informa el proveedor: elegí el día, escribí el saldo informado y explicá la diferencia si hay (obligatoria). Tocá «Registrar».',
        'En cada fila del movimiento podés tocar «Anular» (comprobante o pago) y escribir el motivo. Anular un pago revierte el egreso de la caja o banco y la deuda vuelve a la cuenta; un comprobante con pagos o notas de crédito vigentes exige anular esos primero.',
      ],
      GERENCIA: [
        'Ves todas las cuentas de proveedores y sus saldos, vencidos y conciliaciones. Elegí uno para ver el detalle (filtrable por período).',
        'Podés registrar pagos («Registrar pago»), cargar comprobantes («Cargar comprobante») y conciliar («Conciliar»).',
        '«Anular» deja sin efecto un pago o comprobante con su motivo (mínimo 3 letras).',
        'El «Historial» de cada movimiento muestra quién lo cambió y cuándo.',
        'Con «Nuevo proveedor» das de alta uno; queda «sin dictamen» hasta que Dirección Técnica lo apruebe.',
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
      'Es la cuenta corriente de cada cliente: lo facturado, lo cobrado, lo que debe y hace cuánto. La lista muestra el saldo de cada cliente repartido por antigüedad (hasta 30 días, 31 a 60, 61 a 90 y más de 90, este último en rojo) y lo cobrado que todavía no se imputó a una factura. Al abrir un cliente se ve su cuenta con facturas, notas de crédito y cobros.',
    porRol: {
      ADMINISTRACION: [
        'La lista muestra el saldo de cada cliente y cuánto tiene vencido: hasta 30 días, de 31 a 60, de 61 a 90 y más de 90.',
        'Tocá un cliente (o usá «Ir a un cliente») para abrir su cuenta; podés filtrar por período con «Desde» y «Hasta».',
        'Tocá «Registrar cobro»: elegí en qué cuenta entra («Entra a»), el medio, el importe y una referencia si querés.',
        'En «¿Qué facturas cancela?» imputá el cobro a las facturas que corresponden. No podés imputar más de lo cobrado ni más de lo que debe cada factura.',
        'Lo cobrado que no imputás queda como «Cobrado sin imputar». Si no hay facturas pendientes, el cobro queda sin imputar.',
        'Tocá «Registrar cobro» para confirmar.',
        'Si un cobro estuvo mal, tocá «Anular» en su fila y escribí el motivo: el ingreso se revierte en la caja o banco y la factura vuelve a quedar pendiente. Después cargá el cobro correcto.',
      ],
      GERENCIA: [
        'Ves el saldo y la antigüedad de la deuda de cada cliente.',
        'Abrí un cliente para ver sus facturas, notas de crédito, cobros y saldo corrido.',
        '«Registrar cobro» anota lo que pagó: cuenta de ingreso, medio, importe e imputación a facturas. «Anular» deshace un cobro con motivo.',
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
      'Es donde cualquier área pide un pago y Administración lo aprueba y lo paga. La lista muestra el concepto, a quién se paga, quién pidió y cuándo, el vencimiento, el importe y el estado (pendiente, aprobada, pagada, rechazada o anulada). Queda registrado quién pidió, quién resolvió y cuándo. Cada solicitud tiene «Comentarios (N)»: una conversación corta, con nombre y hora, entre quien pidió y Administración; el último comentario se ve debajo del concepto.',
    porRol: {
      VENTAS: [
        'Tocá «Pedir un pago».',
        'Completá «Qué se paga», el proveedor (o «A quién» si no está cargado), el importe y el vencimiento. El medio sugerido es opcional.',
        'Tocá «Enviar a Administración». La solicitud queda «pendiente» y la ves en la lista.',
        'Seguí el estado en la lista: pendiente, aprobada, pagada o rechazada. «Pendientes y aprobadas» es la vista que arranca; «Todas» incluye el resto.',
        'Si te equivocaste y todavía está pendiente, podés tocar «Anular» y escribir el motivo (mínimo 3 letras).',
        'Si Administración te deja una pregunta, aparece debajo del concepto. Tocá «Comentarios» para leer la conversación y responder con «Comentar».',
        'No podés aprobar, rechazar ni pagar: eso lo hace Administración.',
      ],
      GERENCIA_PRODUCCION: [
        'Ves todas las solicitudes de pago de todas las áreas, no solo las tuyas, con quién pidió y cuándo.',
        'Tocá «Pedir un pago» para pedir el pago de algo del área de producción.',
        'Completá «Qué se paga», el proveedor (o «A quién»), el importe y el vencimiento («Vence», la fecha que elegís en el calendario), y tocá «Enviar a Administración».',
        'Seguí el estado en la lista: pendiente, aprobada, pagada o rechazada.',
        'Tocá «Comentarios (N)» en una solicitud para ver lo que escribió Administración y responder: escribí en «Nuevo comentario» y tocá «Comentar».',
        'Mientras esté pendiente podés anular la tuya con «Anular» y un motivo (mínimo 3 letras).',
        'No podés aprobar ni pagar.',
      ],
      ADMINISTRACION: [
        'En «Pendientes y aprobadas» ves lo que hay para resolver. «Todas» incluye las pagadas, rechazadas y anuladas.',
        'En una solicitud pendiente tocá «Aprobar», o «Rechazar» (se abre una ventana: escribí el motivo y «Confirmar»).',
        'En una aprobada tocá «Pagar». Si es a un proveedor cargado, se abre el pago a ese proveedor y baja su cuenta corriente: elegí de qué cuenta sale, el medio y a qué comprobantes se imputa. Si no, se abre «Pagar la solicitud»: elegí la cuenta («Sale de») y, si querés, el comprobante.',
        '«Anular» deja sin efecto una aprobada (con motivo) y también las pendientes que pediste vos.',
        'Para preguntar o aclarar algo sin resolver la solicitud, tocá «Comentarios (N)», escribí en «Nuevo comentario» y tocá «Comentar». Quien la pidió lo ve debajo del concepto y puede responder.',
        'También podés pedir un pago con «Pedir un pago»: completá concepto, proveedor o destinatario, importe y vencimiento, y «Enviar a Administración».',
      ],
      GERENCIA: [
        'Ves todas las solicitudes de las distintas áreas, con quién pidió y cuándo.',
        'Podés «Aprobar» o «Rechazar» las pendientes y «Pagar» las aprobadas.',
        '«Rechazar» y «Anular» piden motivo (mínimo 3 letras). Al pagar elegís la cuenta de la que sale la plata.',
        'También podés pedir un pago con «Pedir un pago».',
      ],
    },
    aTener: [
      'Para pedir un pago tu usuario tiene que tener un sector asignado. Si «Enviar a Administración» no se activa, avisale al administrador del sistema.',
      'Una solicitud pagada no se modifica ni se borra.',
      'Un comentario tampoco: queda con el nombre de quien lo escribió y la hora. Si hay que corregir algo, se agrega otro comentario.',
    ],
  },

  '/reportes': {
    queEs:
      'Son los reportes de IVA, ventas, resultado, flujo de fondos y compras, armados con lo que se carga día a día. Tiene seis pestañas, cada una con una nota arriba que explica cómo se calcula y una tabla con los números por mes. No se carga nada acá: son solo para mirar.',
    porRol: {
      ADMINISTRACION: [
        'Elegí la pestaña: «IVA Compras vs. Ventas» (débito, crédito y posición del mes, «a pagar» o «a favor»), «Ventas» (facturado neto por mes y por cliente), «Resultado mensual», «Cash flow real», «Cash flow proyectado» o «Compras».',
        'El IVA es una estimación para anticipar la posición antes del cierre. La liquidación la hace el estudio.',
        'Las compras «Sin factura» no dan crédito fiscal.',
        '«Cash flow real» muestra lo que entró y salió de verdad por mes y cuenta (las transferencias entre cuentas no cuentan). «Cash flow proyectado» muestra los vencimientos con fecha y, aparte, lo que no tiene fecha.',
        '«Compras» sigue cada compra desde el pedido de Producción hasta la recepción, la factura y lo que falta pagar.',
        'Estas pantallas son solo para mirar: los datos se cargan en Facturas, Proveedores, Clientes y Tesorería.',
      ],
      GERENCIA: [
        'Elegí la pestaña según lo que quieras ver: IVA, ventas, resultado mensual, cash flow real, cash flow proyectado o compras.',
        '«Resultado mensual» es resultado de gestión (ventas netas menos compras netas menos otros egresos): no es un estado contable y todavía no tiene costos.',
        '«Cash flow proyectado» muestra lo que vence y se espera cobrar.',
        '«Compras» muestra la situación de cada compra: sin recibir, recibida sin factura cargada, impaga, pagada, descartada o recepción sin compra anotada.',
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
      'Es la lista de las personas del sistema, con su rol y su sector. La tabla muestra el nombre (con la marca «DT titular» si corresponde), el correo, el rol principal y los adicionales, el sector, la fecha de alta y el estado (Habilitado o Desactivado). Solo la ve el administrador del sistema.',
    porRol: {
      ADMINISTRADOR_SISTEMA: [
        'Cada fila muestra nombre, correo, rol, sector, fecha de alta y estado (Habilitado o Desactivado).',
        'Tocá «Editar» en la fila de la persona: se abre su ficha.',
        'En «Rol principal» elegí su puesto. En «Roles adicionales» sumá otros si ocupa más de un puesto: los permisos son la suma de todos.',
        'Elegí su «Sector».',
        'Para dar de baja, apagá «Cuenta habilitada». La persona deja de entrar, pero su historial queda. Para volver a habilitarla, prendé el interruptor.',
        'Tocá «Guardar» (o «Cancelar» para salir sin cambios). El cambio de rol se aplica cuando la persona renueva su sesión: puede hacerlo con «Actualizar permisos» desde su menú.',
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
      'Es una grilla de cada pantalla (y de las pestañas) contra cada rol. Tildar o destildar decide qué aparece en el menú de ese rol. Cada columna es un rol, con el nombre de quien lo usa hoy cuando corresponde. Solo cambia el menú: no da ni quita permisos sobre los datos.',
    porRol: {
      ADMINISTRADOR_SISTEMA: [
        'Cada fila es una pantalla (o una pestaña, sangrada debajo de su pantalla, con su ruta en letra chica) y cada columna es un rol, con quién lo usa hoy.',
        'Tildado significa que ese rol la ve en su menú. Tocá la casilla para mostrarla u ocultarla.',
        'El borde azul marca lo que cambiaste respecto del valor original; al dejar el mouse encima dice «Cambiado respecto del valor original». Si volvés a dejarla como estaba, el borde se va.',
        'El cambio es inmediato, sin botón de guardar, y queda registrado.',
        'Esto solo decide el menú: lo que cada rol puede leer o cargar lo sigue decidiendo la base de datos. Si le mostrás una pantalla a un rol sin permiso, la va a ver vacía.',
        'Vos (administrador del sistema) ves todo siempre.',
      ],
    },
    aTener: ['Ocultar una pantalla no bloquea el acceso a los datos: es solo el menú.'],
  },

  '/auditoria': {
    queEs:
      'Es el registro de todo lo que se escribió en el sistema: quién, cuándo, y qué valor tenía antes y después. Es lo que un inspector va a pedir. Cada fila muestra el momento, la tabla, la operación, el usuario y el rol de base que hizo la escritura. Es de solo lectura.',
    porRol: {
      DIRECCION_TECNICA: [
        'Ves las últimas 200 escrituras, de la más nueva a la más vieja.',
        'Cada fila indica el momento, la tabla, la operación (alta, cambio, intento de borrado, firma), el usuario y el rol de base.',
        'Tocá «Ver valores» para ver el «ANTES» y el «DESPUÉS» de ese registro; «Ocultar» lo vuelve a cerrar.',
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
        'Las filas con rol privilegiado se marcan en rojo y arriba aparece el aviso con cuántas son: son anomalías y hay que justificarlas.',
        'Es un registro de solo lectura.',
      ],
    },
    aTener: [
      'La auditoría no se modifica ni se borra, por nadie.',
      'Solo muestra las últimas 200 escrituras.',
    ],
  },
};
