-- ---------------------------------------------------------------------------
-- Propósito : Carga de saldo inicial de apertura (docs/ESPEC_SALDO_INICIAL.md).
--             Tabla gmp.migracion_apertura, columnas nuevas y relajadas en
--             gmp.lotes_insumo, y las tres funciones que gobiernan el lote
--             (validación, numeración, color de rótulo) enteradas del estado
--             terminal SALDO_APERTURA agregado en la migración …120000.
-- Reglas    : No genera aprobación de calidad ni firma (§2 y §7 del documento
--             de alcance de la carga). RN-50 (auditoría). Invariante 7:
--             gmp no depende de comercial — migracion_apertura vive acá
--             porque gmp.lotes_insumo la referencia, no al revés.
-- Fecha     : 2026-09-16
-- ---------------------------------------------------------------------------
--
-- DESVÍO DEL DOCUMENTO DE ORIGEN, Y POR QUÉ.
--
-- El documento pide `ejecutada_por uuid references gmp.usuarios(id)`.
-- `gmp.usuarios` no existe: la identidad vive en `core.usuarios` (CLAUDE.md
-- §4). Se corrige a `core.usuarios(id)`, que es exactamente el criterio que
-- el propio documento fija en su encabezado: «describe QUÉ hay que construir
-- y POR QUÉ, no el código exacto».
--
-- El documento también pide (§6) que la carga se pueda deshacer con
-- `delete from movimientos where migracion_id = <id>`. Eso borra un registro
-- de negocio, y la invariante 1 de CLAUDE.md es explícita: «Ningún registro
-- firmado se modifica ni se borra. Ni por la aplicación, ni por un
-- administrador, ni por un script de migración de datos». RN-54 dice lo mismo
-- para movimientos de stock en particular, y `comercial.movimientos_stock` no
-- tiene GRANT de DELETE para ningún rol —no hace falta ni bloquearlo con RLS:
-- estructuralmente no se puede. Esta migración NO implementa el borrado que
-- pide §6. La reversibilidad en una sola operación se resuelve en la
-- migración …150000 con `comercial.deshacer_apertura()`, que invoca el
-- mecanismo de anulación por movimiento inverso que ya existe
-- (`comercial.anular_movimiento`, RN-54) sobre todos los movimientos de la
-- migración. El resultado es el mismo saldo en cero, con el rastro completo
-- en vez de sin él. Este apartamiento se lo señalé al usuario al entregar la
-- tarea; no se implementó en silencio.

-- ===========================================================================
-- 1. gmp.migracion_apertura
-- ===========================================================================
--
-- Una fila por corte. Todos los lotes de esa carga la referencian, así que
-- alcanza con esta fila para explicar el origen de todos ellos y para poder
-- deshacer la carga entera por migracion_apertura_id.

create table gmp.migracion_apertura (
  id             uuid primary key default gen_random_uuid(),
  fecha_corte    date not null,
  archivo_origen text not null check (length(btrim(archivo_origen)) > 0),
  hash_archivo   text not null check (hash_archivo ~ '^[0-9a-f]{64}$'),
  ejecutada_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  ejecutada_en   timestamptz not null default now(),
  observaciones  text
);

comment on table gmp.migracion_apertura is
  'Evidencia de una carga de saldo inicial de apertura: qué archivo, con qué hash, quién y cuándo. '
  'Los lotes de gmp.lotes_insumo con estado SALDO_APERTURA la referencian por migracion_apertura_id.';
comment on column gmp.migracion_apertura.hash_archivo is
  'SHA-256 del archivo de origen, en hexadecimal minúscula: evidencia de integridad de qué planilla exactamente se usó.';

create index migracion_apertura_fecha_corte_idx on gmp.migracion_apertura (fecha_corte);

-- ===========================================================================
-- 2. gmp.lotes_insumo: columnas y restricciones para el lote de apertura
-- ===========================================================================
--
-- `recepcion_id` deja de ser NOT NULL: un lote de apertura no viene de ninguna
-- recepción física (I.20.1), viene de una planilla de inventario. La
-- alternativa —inventar una gmp.recepciones con un proveedor y un remito que
-- no existieron— es exactamente el tipo de dato fabricado que §2 del
-- documento de origen prohíbe para la aprobación de calidad, y aplica igual
-- acá: una recepción falsa es un registro de circuito de calidad falso.

alter table gmp.lotes_insumo
  alter column recepcion_id drop not null;

alter table gmp.lotes_insumo
  add column migracion_apertura_id uuid references gmp.migracion_apertura(id),
  add column color_origen          text,
  add column cantidad_no_declarada boolean not null default false;

comment on column gmp.lotes_insumo.migracion_apertura_id is
  'Carga de apertura que originó este lote. NOT NULL si y solo si estado = SALDO_APERTURA (constraint lotes_insumo_apertura_coherente).';
comment on column gmp.lotes_insumo.color_origen is
  'Color de fila de la planilla de origen (VERDE/AMARILLO/ROJO/VIOLETA/CELESTE/SIN_COLOR), tal cual vino. '
  'Significado sin definir (§4.1 del documento de la carga): se guarda como metadato crudo, no se interpreta.';
comment on column gmp.lotes_insumo.cantidad_no_declarada is
  'true si la planilla de origen no traía cantidad para este renglón (se cargó como 0). No es lo mismo que «hay cero unidades»: '
  'es «no se sabe cuántas hay». Sin este campo, un 0 declarado y un 0 desconocido serían indistinguibles.';

-- La identidad del lote de apertura es la ausencia de recepción y la
-- presencia de la migración, y las dos van con el estado terminal. Una sola
-- restricción ata las tres: no hace falta acordarse de mantenerlas
-- sincronizadas a mano.
alter table gmp.lotes_insumo
  add constraint lotes_insumo_apertura_coherente check (
    (estado = 'SALDO_APERTURA') = (migracion_apertura_id is not null)
    and (estado = 'SALDO_APERTURA') = (recepcion_id is null)
  );

comment on constraint lotes_insumo_apertura_coherente on gmp.lotes_insumo is
  'Un lote está en SALDO_APERTURA si y solo si tiene migración de apertura y no tiene recepción. Las tres cosas van juntas.';

-- ===========================================================================
-- 3. Depósito histórico para el material de apertura
-- ===========================================================================
--
-- No corresponde asignarlo a ninguno de los diez depósitos de la migración
-- …140200: todos son parte de la segregación por estado de calidad
-- (`estado_admitido`), y el material de apertura no tiene estado de calidad
-- real. Meterlo en «05 — Materia prima aprobada» lo presentaría como aprobado
-- sin haberlo sido, que es exactamente lo que este diseño existe para evitar.

insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior)
values ('APE', 'Existencia histórica — saldo de apertura, sin clasificar', null, null, false)
on conflict (numero) do nothing;

-- ===========================================================================
-- 4. gmp.fn_validar_lote_insumo: exención del circuito para SALDO_APERTURA
-- ===========================================================================
--
-- Un lote de apertura no pasa por I.20.1: no hay protocolo que exigirle
-- (RN-01), no hay pesada de pigmento que hacerle (RN-03), no hay unidad de
-- catálogo que deba estar confirmada para «recepcionarlo» porque no se lo
-- está recepcionando. Forzar esos tres controles sobre un dato migrado
-- obligaría a marcar protocolo_recibido = true sin que exista protocolo, que
-- es fabricar evidencia de cumplimiento — lo que el documento de la carga
-- prohíbe expresamente. La salida es eximir el circuito para este estado, no
-- falsificarlo.
--
-- Lo que SÍ se controla, siempre: que el insumo exista. Y se completan dos
-- valores de conveniencia para que el script de importación no tenga que
-- adivinarlos: `cantidad_bultos` (siempre 1: cada renglón de la planilla es
-- una posición, no un conteo de bultos físicos) y `deposito_actual_id` (el
-- depósito histórico de la sección 3, si no se indicó otro).

create or replace function gmp.fn_validar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select * into v_insumo from gmp.insumos_catalogo where id = new.insumo_id;

  if not found then
    raise exception 'El insumo % no existe en el catálogo.', new.insumo_id;
  end if;

  if new.estado = 'SALDO_APERTURA' then
    new.cantidad_bultos := coalesce(new.cantidad_bultos, 1);

    if new.deposito_actual_id is null then
      select id into new.deposito_actual_id from gmp.depositos where numero = 'APE';
    end if;

    return new;
  end if;

  -- La unidad del catálogo está pendiente de confirmación: las cantidades del
  -- lote no serían verificables contra nada.
  if v_insumo.unidad_medida is null then
    raise exception
      '«%» no tiene unidad de medida confirmada en el catálogo. No se puede recepcionar hasta que la planta la defina.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-01: una materia prima no se recepciona sin protocolo de análisis.
  if v_insumo.requiere_protocolo and coalesce(new.protocolo_recibido, false) = false then
    raise exception
      'RN-01: «%» exige protocolo de análisis del fabricante para ser recepcionado (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-03: los pigmentos se pesan antes de continuar el proceso.
  if v_insumo.requiere_pesada_recepcion and new.peso_pigmento_kg is null then
    raise exception
      'RN-03: «%» se pesa durante la recepción; falta el peso en kg (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-48: el inflamable va al depósito exterior, no lo elige quien carga.
  if v_insumo.es_inflamable and new.deposito_actual_id is null then
    select id into new.deposito_actual_id
      from gmp.depositos
     where tipo_contenido = 'INFLAMABLES' and es_exterior and activo
     limit 1;
  end if;

  return new;
end;
$$;

comment on function gmp.fn_validar_lote_insumo() is
  'RN-01, RN-03, RN-48 y la precondición de unidad confirmada, salvo para estado SALDO_APERTURA: un lote migrado '
  'no pasa por I.20.1 y no se le puede exigir evidencia de un circuito que no corrió (docs/ESPEC_SALDO_INICIAL.md §2).';

-- ===========================================================================
-- 5. gmp.fn_numerar_lote_insumo: numeración distinguible para apertura
-- ===========================================================================
--
-- «RI-» es el prefijo de un lote con recepción real. Numerar un lote de
-- apertura igual lo haría indistinguible de un registro de I.20.1 en
-- cualquier listado, reporte o búsqueda por número. RN-05 exige poder saber
-- de un vistazo qué se está mirando; el prefijo distinto es esa señal antes
-- de mirar el estado.

create or replace function gmp.fn_numerar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from now())::integer;
begin
  if new.numero_registro_interno is not null and btrim(new.numero_registro_interno) <> '' then
    return new;
  end if;

  if new.estado = 'SALDO_APERTURA' then
    new.numero_registro_interno :=
      'AP-' || lpad(gmp.siguiente_numero('registro_interno_apertura', v_anio)::text, 5, '0')
      || '/' || v_anio::text;
  else
    new.numero_registro_interno :=
      'RI-' || lpad(gmp.siguiente_numero('registro_interno', v_anio)::text, 5, '0')
      || '/' || v_anio::text;
  end if;

  return new;
end;
$$;

comment on function gmp.fn_numerar_lote_insumo() is
  'Correlativo «RI-» para lotes con recepción real y «AP-» para lotes de saldo de apertura: el prefijo distingue '
  'de un vistazo un registro de I.20.1 de uno migrado, antes de mirar el estado.';

-- ===========================================================================
-- 6. gmp.color_rotulo: color propio para el saldo de apertura
-- ===========================================================================
--
-- Ni AMARILLO (cuarentena: esperando análisis) ni VERDE (aprobado: analizado
-- y liberado) describen un renglón migrado sin análisis pendiente ni hecho.
-- AZUL, que ningún otro estado usa, es el distintivo visual que pide §5.1 del
-- documento de la carga.

create or replace function gmp.color_rotulo(p_estado gmp.estado_calidad_enum)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_estado
           when 'CUARENTENA'      then 'AMARILLO'
           when 'EN_ANALISIS'     then 'GRIS'
           when 'APROBADO'        then 'VERDE'
           when 'RECHAZADO'       then 'ROJO'
           when 'SALDO_APERTURA'  then 'AZUL'
           else 'SIN_ROTULO'
         end;
$$;

comment on function gmp.color_rotulo(gmp.estado_calidad_enum) is
  'RN-04 (I.20.2): cuarentena amarillo, en análisis gris, aprobado verde, rechazado rojo. '
  'AZUL para SALDO_APERTURA: no es un color de I.20.2, es el distintivo de que no hay lote identificado ni control de calidad (§5.1 de docs/ESPEC_SALDO_INICIAL.md).';

-- ===========================================================================
-- 7. RLS y auditoría de gmp.migracion_apertura
-- ===========================================================================

alter table gmp.migracion_apertura enable row level security;
alter table gmp.migracion_apertura force  row level security;

grant select, insert on gmp.migracion_apertura to authenticated;
-- Sin UPDATE ni DELETE: es evidencia de una carga ya hecha, no una ficha editable.

create policy migracion_apertura_select_authenticated on gmp.migracion_apertura
  for select to authenticated using (core.rol() is not null);
comment on policy migracion_apertura_select_authenticated on gmp.migracion_apertura is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

-- Cargar un saldo de apertura es una operación administrativa excepcional,
-- no parte del circuito de recepción diario: se restringe a quienes deciden
-- sobre datos maestros y stock, no a quien opera el día a día.
create policy migracion_apertura_insert_administrativo on gmp.migracion_apertura
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'ADMINISTRADOR_SISTEMA'));
comment on policy migracion_apertura_insert_administrativo on gmp.migracion_apertura is
  'Carga de saldo de apertura: operación excepcional reservada a DT, ADM y SYS, no al circuito diario de recepción.';

select core.adjuntar_auditoria('gmp.migracion_apertura');

-- ---------------------------------------------------------------------------
-- Endurecimiento de la política de alta de lotes: un lote SALDO_APERTURA
-- solo lo crea quien puede crear la migración que lo origina. Los roles del
-- circuito físico (OPERARIO, CONTROL_CALIDAD) siguen dando de alta lotes con
-- recepción real, igual que antes.
-- ---------------------------------------------------------------------------

drop policy if exists lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo;

create policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo
  for insert to authenticated
  with check (
    (estado <> 'SALDO_APERTURA'
       and core.es_rol('OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','GERENCIA_PRODUCCION'))
    or
    (estado = 'SALDO_APERTURA'
       and core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','ADMINISTRADOR_SISTEMA'))
  );
comment on policy lotes_insumo_insert_recepcion_fisica on gmp.lotes_insumo is
  '§3.3: el lote se da de alta en la misma operación que la recepción física (OP, CC, DT, GP). '
  'Un lote SALDO_APERTURA no tiene recepción física: se restringe a quien puede cargar la migración que lo origina (DT, ADM, SYS).';
