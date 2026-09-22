-- ---------------------------------------------------------------------------
-- Propósito : Carga del saldo inicial de apertura (docs/ESPEC_SALDO_INICIAL.md)
--             a partir de la planilla «05 INVENTARIO NAIL SHOW FABRICA»
--             (scripts/apertura/inventario_apertura.csv, 650 renglones de origen).
--             Generado por scripts/apertura/generar_migracion.mjs — no editar
--             a mano; si el CSV cambia, se regenera el script y este archivo
--             se reemplaza por uno nuevo (nunca se edita una migración ya
--             aplicada, CLAUDE.md §6).
-- Reglas    : §2, §3 y §4 de docs/ESPEC_SALDO_INICIAL.md. No crea aprobación
--             de calidad ni firma (§7 del mismo documento). RN-50 (auditoría,
--             vía el trigger genérico que ya lleva gmp.lotes_insumo).
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- ALCANCE: 382 de los 650 renglones del CSV, los que tienen
-- codigo_interno ya cargado en gmp.insumos_catalogo. Los 251 restantes
-- (herramientas, mobiliario, merchandising, libros — ninguno es insumo GMP con
-- tipo_insumo_enum asignable sin que la Gerencia lo confirme) quedan listados
-- en scripts/apertura/pendientes.md y fuera de esta carga: clasificarlos es
-- tarea de catálogo, no de saldo inicial.
--
-- CONSOLIDACIÓN DE CÓDIGOS DUPLICADOS (§4.2 del documento de la carga): los
-- códigos que la planilla repite se suman en un solo renglón por
-- codigo_interno, con `lote_proveedor` listando todos los proveedores de
-- origen y `color_origen` concatenando los colores si difieren entre filas.
--
-- SIN CANTIDAD DECLARADA: se carga con cantidad 0 y `cantidad_no_declarada =
-- true`. Estos renglones generan el lote (con su metadato) pero NINGÚN
-- movimiento de stock: `comercial.movimientos_stock` exige `cantidad <> 0`,
-- y un movimiento de cero no es un movimiento. `comercial.cargar_apertura_a_stock()`
-- (migración …150000) los salta a propósito.

do $$
declare
  v_migracion_id uuid;
  v_ejecutada_por uuid;
  v_ya_cargado integer;
begin
  -- CANDADO CONTRA DOBLE CARGA.
  -- El stock es un libro de movimientos: cargar dos veces no pisa el saldo,
  -- lo duplica, y la corrección sería un movimiento inverso por cada renglón
  -- (invariante 8, RN-54). Si ya hay una carga de apertura asentada, esta se
  -- detiene. No es paranoia: hubo una migración de carga anterior que se
  -- escribió, no se aplicó, y se reemplazó por ésta; si aquélla hubiera
  -- llegado a correr en algún entorno, esto lo detecta.
  select count(*) into v_ya_cargado from gmp.migracion_apertura;
  if v_ya_cargado > 0 then
    raise exception
      'Ya hay % carga(s) de saldo de apertura asentada(s) en gmp.migracion_apertura. '
      'Una segunda carga duplicaría el stock en vez de corregirlo. Si el saldo cambió, '
      'corresponde un ajuste de inventario, no otra apertura.', v_ya_cargado
      using errcode = 'check_violation';
  end if;

  -- La carga la asienta la Dirección Técnica titular: es la autoridad
  -- regulatoria responsable de que un dato migrado sin circuito de calidad
  -- entre al sistema (§2 de docs/ESPEC_SALDO_INICIAL.md). Si todavía no hay
  -- una persona marcada como titular, la migración se detiene acá con un
  -- mensaje claro en vez de asentar la carga a nombre de cualquiera.
  select id into v_ejecutada_por from core.usuarios where es_dt_titular and activo limit 1;
  if v_ejecutada_por is null then
    raise exception
      'No hay ninguna Dirección Técnica titular activa en core.usuarios. '
      'La carga de saldo de apertura necesita un responsable regulatorio identificado antes de asentarse.'
      using errcode = 'check_violation';
  end if;

  -- `supabase db push` corre esta migración como el rol de conexión de la
  -- CLI, sin sesión de PostgREST detrás: `request.jwt.claims` no existe, y
  -- `core.usuario_actual()` (el DEFAULT de `registrado_por` en
  -- gmp.lotes_insumo y en comercial.movimientos_stock) devolvería NULL contra
  -- columnas NOT NULL. Se fija el claim, acotado a esta transacción
  -- (`set_config(..., true)`), a nombre de la misma Dirección Técnica
  -- titular que asienta la migración: es información real —quien queda
  -- registrado como autor es quien de hecho autoriza la carga— y no un valor
  -- inventado para pasar la restricción.
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_ejecutada_por::text, 'rol', 'DIRECCION_TECNICA')::text,
    true
  );

  insert into gmp.migracion_apertura (fecha_corte, archivo_origen, hash_archivo, ejecutada_por, observaciones)
  values (
    '2026-09-22',
    '05 INVENTARIO NAIL SHOW FABRICA(4).xlsx (hoja INVENTARIO)',
    '6957d867a8def01126281de327069c8587b4cc1b1bfbe82d7676e28df95f89ec',
    v_ejecutada_por,
    '382 de 650 renglones de origen importados. El resto (herramientas, mobiliario, merchandising, libros) queda fuera del catálogo de insumos y listado en scripts/apertura/pendientes.md. Origen: 05 INVENTARIO NAIL SHOW FABRICA(4).xlsx (hoja INVENTARIO), sha256 6957d867a8def01126281de327069c8587b4cc1b1bfbe82d7676e28df95f89ec. CANTIDAD de la planilla leída como unidades en existencia por indicación de la conducción del proyecto (2026-09-22).'
  )
  returning id into v_migracion_id;

  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id,
    cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, color_origen, unidad
  )
  select
    i.id,
    'SALDO_APERTURA',
    v_migracion_id,
    d.cantidad,
    d.cantidad_no_declarada,
    d.lote_proveedor,
    d.color_origen,
    coalesce(i.unidad_medida, 'PENDIENTE')
  from (
    values
    ('080POL', 1, false, 'SALDO DE APERTURA — KEYSTONE', 'GRIS'),
    ('080ENV', 1000, false, 'SALDO DE APERTURA — DANO', 'ROJO'),
    ('080ENVA', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'ROJO'),
    ('080G', 1, false, 'SALDO DE APERTURA — NGM', 'ROJO'),
    ('080BOL', 1, false, 'SALDO DE APERTURA — MAZA LOSA', 'ROJO'),
    ('080ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('081ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('082ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('083ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('084ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('085ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('086ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('087ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('088ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('089ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('090ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('091ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('092ET', 54, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('093ENV', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('093ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('094ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('095ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('096ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('097ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('098ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('099ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('100ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('101ESE', 1, false, 'SALDO DE APERTURA — EUMA', 'GRIS'),
    ('101TAP', 1, false, 'SALDO DE APERTURA — AMOPLAST', 'VIOLETA'),
    ('101ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'VIOLETA'),
    ('101ENVA', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('101TAPA', 4000, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('101TAPACIEGA', 1, false, 'SALDO DE APERTURA — RUMAR', 'ROJO'),
    ('101MONO', 1, false, 'SALDO DE APERTURA — ACRILAB', 'VERDE'),
    ('102ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'VIOLETA'),
    ('102ET', 12, false, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('103ENV', 1, false, 'SALDO DE APERTURA — AMOPLAST', 'VERDE'),
    ('103ENVA', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('103ET', 12, false, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('104ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('104TAP', 3000, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('104ET', 12, false, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('105ENV', 1, false, 'SALDO DE APERTURA — O''MACRI', 'ROJO'),
    ('105TAP', 1, false, 'SALDO DE APERTURA — O''MACRI', 'ROJO'),
    ('105TAPA', 1, false, 'SALDO DE APERTURA — O''MACRI', 'ROJO'),
    ('105BOL', 1000, false, 'SALDO DE APERTURA — PAPELERA LEGASA', 'ROJO'),
    ('201ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('106TAP', 1, false, 'SALDO DE APERTURA — O''MACRI', 'ROJO'),
    ('106ET', 198, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('107TAP', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('107ENV', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('108ENV', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('109ENV', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('110ENV', 1, false, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('111ENV', 1000, false, 'SALDO DE APERTURA — DONGGUAN', 'ROJO'),
    ('111G', 1, false, 'SALDO DE APERTURA — NGM', 'ROJO'),
    ('111ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('112ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('113ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('114ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('115ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('116ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('117ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('118ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('119ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('279ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('278ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('299ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('327ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('120ET', 150, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('111CAJ', 1, false, 'SALDO DE APERTURA — CREAPACK', 'ROJO'),
    ('111ETT', 96, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('111ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('112ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('113ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('114ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('115ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('116ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('117ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('118ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('119ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('279ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('278ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('299ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('327ETC', 48, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('300ENV', 1344, false, 'SALDO DE APERTURA — DONGGUAN', 'ROJO'),
    ('300G', 1000, false, 'SALDO DE APERTURA — NGM', 'ROJO'),
    ('300ETT', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('300ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('301ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('302ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('303ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('304ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('305ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('306ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('307ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('308ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('309ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('310ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('311ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('312ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('313ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('314ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('315ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('316ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('317ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('318ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('319ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('331ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('332ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('333ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('334ETB', 204, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('122ENV', 1344, false, 'SALDO DE APERTURA — DANO', 'ROJO'),
    ('130ENV', 1, false, 'SALDO DE APERTURA — CRISTALMAN', 'ROJO'),
    ('130ET', 114, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('130TOP', 1, false, 'SALDO DE APERTURA — KEYSTONE', 'GRIS'),
    ('131ET', 195, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('131AC', 1, false, 'SALDO DE APERTURA — MAHO', 'GRIS'),
    ('132ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('133ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('134ET', 16, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('136ET', 195, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('136PRE', 2, false, 'SALDO DE APERTURA — EUMA / LADCO LAB', 'GRIS'),
    ('137ET', 195, false, 'SALDO DE APERTURA — ELGART', 'GRIS'),
    ('137AD', 1, false, 'SALDO DE APERTURA — CENTER GRAPH', 'GRIS'),
    ('135ENV', 1, false, 'SALDO DE APERTURA — PLASMARE', 'ROJO'),
    ('391ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('320TAP', 1, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('320TAPA', 1, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('135SAN', 1, false, 'SALDO DE APERTURA — MAHO', 'VERDE'),
    ('135GLI', 1, false, 'SALDO DE APERTURA — MV (mercado libre)', 'VERDE'),
    ('135ALOE', 1, false, 'SALDO DE APERTURA — EUMA', 'VERDE'),
    ('135AGUA', 1, false, 'SALDO DE APERTURA — DI FRANCO PABLO ERNESTO', 'VERDE'),
    ('135PRO', 1, false, 'SALDO DE APERTURA — LADCO LAB', 'VERDE'),
    ('135FRA1', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA2', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA3', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA4', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA5', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA6', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('135FRA7', 1, false, 'SALDO DE APERTURA — AROMATICA', 'VERDE'),
    ('392ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('393BOM', 1, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('395BOM', 1, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('135ET', 12, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('391ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('391ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('392ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('392ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('393ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('393ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('394ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('394ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('395ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('395ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('396ET', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('396ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('400ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('401ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('402ETD', 1, false, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('138CL1', 1, false, 'SALDO DE APERTURA — ADECO LAB', 'VERDE'),
    ('138CL2', 1, false, 'SALDO DE APERTURA — LADCO LAB', 'VERDE'),
    ('138ET', 15, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('139ENV', 1, false, 'SALDO DE APERTURA — PLASTICOS VG', 'ROJO'),
    ('139ENVA', 1, false, 'SALDO DE APERTURA — CARELLI', 'ROJO'),
    ('139CAJ', 1, false, 'SALDO DE APERTURA — DILENE', 'ROJO'),
    ('140CAJ', 1, false, 'SALDO DE APERTURA — DILENE', 'ROJO'),
    ('139AC01', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC02', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC03', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC04', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC05', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC06', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC07', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC08', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC09', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC10', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC11', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139AC12', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC13', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC14', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC15', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC16', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC17', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC18', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC19', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC20', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC21', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC22', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC23', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC24', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC25', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC26', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('140AC27', 1, false, 'SALDO DE APERTURA — DIBU', 'VERDE'),
    ('139ETE', 110, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('139ET', 22, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('140ET', 22, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('142PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('143PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('144PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('145PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('146PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('147PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('148PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('149PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('150PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('151PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('152PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('153PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('154PIG', 1, false, 'SALDO DE APERTURA — CALVANO', 'VERDE'),
    ('155PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('156PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('157PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('158PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('159PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('160PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('161PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('162PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('163PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('164PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('165PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('247PIG', 1, false, 'SALDO DE APERTURA — ROMANO DANIEL GUILLERMO', 'VERDE'),
    ('252PIG', 1, false, 'SALDO DE APERTURA — CALVANO', 'VERDE'),
    ('328PIG', 1, false, 'SALDO DE APERTURA — CALVANO', 'VERDE'),
    ('329PIG', 1, false, 'SALDO DE APERTURA — QUIMICA COLOR', 'VERDE'),
    ('330PIG', 1, false, 'SALDO DE APERTURA — DONGGUAN', 'VERDE'),
    ('142ETT', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('142ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('143ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('144ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('145ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('146ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('147ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('148ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('149ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('150ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('151ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('152ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('153ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('154ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('155ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('156ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('157ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('158ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('159ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('160ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('161ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('162ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('163ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('164ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('165ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('328ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('329ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('330ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('166ETT', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('166ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('167ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('168ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('287ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('288ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('289ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('290ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('291ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('292ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('293ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('294ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('295ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('296ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('297ET', 204, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('614BOL', 0, true, 'SALDO DE APERTURA — CAPKELITOS', 'AMARILLO'),
    ('340ET1', 72, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('340ET2', 128, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('343ETF', 112, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('343ETD', 20, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('364ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('364TAP', 2400, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('364ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('365ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('366ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('364ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('365ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('366ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('370ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('371ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('372ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('370ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('371ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('372ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('367ENV', 1, false, 'SALDO DE APERTURA — PIROPLAST', 'ROJO'),
    ('367TAP', 3400, false, 'SALDO DE APERTURA — ENTAPLAST', 'ROJO'),
    ('367ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('368ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('369ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('367ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('368ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('369ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('373ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('374ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('375ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('373ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('374ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('375ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('378ACE', 1, false, 'SALDO DE APERTURA — EVIDENS', 'VERDE'),
    ('378ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('379ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('380ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('378ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('379ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('380ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('381ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('382ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('383ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('381ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('382ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('383ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('249ET', 80, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('384ET', 0, true, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('385ET', 0, true, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('386ET', 0, true, 'SALDO DE APERTURA — QUILMES', 'AMARILLO'),
    ('387ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('387ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('450ENV', 0, true, 'SALDO DE APERTURA — DANO', 'ROJO'),
    ('450RES', 0, true, 'SALDO DE APERTURA — SERVIFIBRAS', 'ROJO'),
    ('450ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('450ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('450ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('451ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('451ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('451ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('452ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('452ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('452ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('453ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('453ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('453ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('454ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('454ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('454ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('455ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('455ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('455ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('457ENV', 0, true, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('457ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('457ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('458ENV', 0, true, 'SALDO DE APERTURA — PLASMARE', 'ROJO'),
    ('458ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('458ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('458ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('459ENV', 0, true, 'SALDO DE APERTURA — CHIBI', 'ROJO'),
    ('459ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('459ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('460ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('460ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('461ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('461ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('461ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('462ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('462ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('463ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('463ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('464ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('464ETD', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('464ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('465ETF', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('465ETL', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('377ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('510ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('511ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('513ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('274MP', 1, false, 'SALDO DE APERTURA — SUMMIT', 'VERDE'),
    ('274ET', 0, true, 'SALDO DE APERTURA — DARACT', 'AMARILLO'),
    ('274ETT', 680, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('274ETC', 220, false, 'SALDO DE APERTURA — ELGART', 'AMARILLO'),
    ('192ENV', 0, true, 'SALDO DE APERTURA — VG', 'VERDE'),
    ('192ENVA', 0, true, 'SALDO DE APERTURA — PLASMARE', 'VERDE'),
    ('192ET', 0, true, 'SALDO DE APERTURA — VIP LABEL', 'AMARILLO'),
    ('192ALOE', 0, true, 'SALDO DE APERTURA — EUMA', 'AMARILLO'),
    ('192SELLO', 0, true, 'SALDO DE APERTURA — MALLOL HNOS', 'AMARILLO'),
    ('195ET', 0, true, 'SALDO DE APERTURA — VIP LABEL', 'AMARILLO'),
    ('195SELLO', 0, true, 'SALDO DE APERTURA — MALLOL HNOS', 'AMARILLO'),
    ('198ACNS', 0, true, 'SALDO DE APERTURA — sin proveedor registrado en la planilla de origen', 'ROJO'),
    ('198ACE', 0, true, 'SALDO DE APERTURA — sin proveedor registrado en la planilla de origen', 'ROJO')
  ) as d(codigo, cantidad, cantidad_no_declarada, lote_proveedor, color_origen)
  join gmp.insumos_catalogo i on i.codigo_interno = d.codigo;

  -- Los movimientos de stock son un paso administrativo aparte y deliberado,
  -- igual que la carga de una recepción (comercial.cargar_recepcion_a_stock):
  -- separa "el dato ya está en el sistema" de "el stock ya se puede descontar".
  perform comercial.cargar_apertura_a_stock(v_migracion_id);
end;
$$;
