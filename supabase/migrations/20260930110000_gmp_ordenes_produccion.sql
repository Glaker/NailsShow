-- ---------------------------------------------------------------------------
-- Propósito : Órdenes de producción con su registro de lote (batch record,
--             R.40.x.1): las nueve etapas con «Realizó» y «Controló», número de
--             lote y vencimiento según I.40.25, equipos, cierre de la orden y
--             liberación del producto terminado por Dirección Técnica.
-- Reglas    : §4.7 y §8.3 del alcance, ME.40.xx / R.40.26.1 y R.40.27.1,
--             I.40.25 (borrador: R-08), RN-50, invariante 1 de CLAUDE.md (una
--             etapa controlada no se modifica), invariante 7 (el vínculo con el
--             pedido vive en comercial). Ítem 5 de la cola del 2026-09-24.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- EL BATCH RECORD NO SE GUARDA: SE ARMA.
-- Pedido del codirector técnico: se genera al descargarlo, con los datos de
-- cada etapa. Acá viven esos datos; el documento lo compone la aplicación.
--
-- ETAPAS Y DATOS.
-- Las nueve etapas son las de R.40.26.1 y R.40.27.1 (§4.7). Los datos de cada
-- una (verificaciones SÍ/NO, tablas de pesada y de proceso, recuento, muestras,
-- resultados contra la especificación) van en `datos` jsonb, con la forma que
-- fija la aplicación. Se eligió esto y no el motor genérico proc_etapas /
-- proc_items del alcance porque los registros comparten estructura: el motor
-- queda para cuando aparezca un registro que no la comparta.
--
-- REALIZÓ Y CONTROLÓ. Registrar una etapa es «Realizó»; «Controlar» la cierra
-- y desde ahí no cambia (es lo que se firma a mano en el papel). Si controla
-- la misma persona que realizó, se permite y queda marcado: §3.4 recomienda
-- advertencia registrada mientras no haya dotación para la doble firma.
--
-- LIBERACIÓN. La marca Dirección Técnica («aprobado: ya se puede vender»). La
-- firma física del batch record sigue aparte (D-01 sin resolver).

-- ===========================================================================
-- 1. Equipos
-- ===========================================================================

create table gmp.equipos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique check (length(btrim(codigo)) > 0),
  nombre      text not null check (length(btrim(nombre)) > 0),
  tipo        text not null check (tipo in ('BALANZA', 'BALANZA_PORTATIL', 'VARILLA', 'MAQUINA_FRACCIONADORA',
                                           'ETIQUETADORA', 'PHMETRO', 'DENSITOMETRO', 'MICROSCOPIO_DIGITAL', 'OTRO')),
  ultima_calibracion  date,
  proxima_calibracion date,
  activo      boolean not null default true,
  creado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en   timestamptz not null default now()
);

comment on table gmp.equipos is
  'Equipos que se nombran en los batch records (código de balanza, varilla, fraccionadora…), §4.7.';

-- ===========================================================================
-- 2. Órdenes de producción
-- ===========================================================================

create type gmp.estado_orden_enum as enum ('ABIERTA', 'TERMINADA', 'LIBERADA', 'RECHAZADA', 'ANULADA');
create type gmp.etapa_orden_enum as enum (
  'PESADA', 'ELABORACION', 'MUESTREO_GRANEL', 'CC_GRANEL', 'FRACCIONAMIENTO',
  'MUESTREO_PT', 'CC_PT', 'CONTRAMUESTRA', 'REVISION'
);

-- Numeración OP-AAAA-NNNN sin huecos: contador con bloqueo, no sequence.
create table gmp.contadores_orden (
  anio   integer primary key,
  ultimo integer not null default 0
);

create table gmp.ordenes_produccion (
  id                 uuid primary key default gen_random_uuid(),
  numero             text not null unique,
  formula_id         uuid not null references gmp.formulas_fabricacion(id),
  producto_id        uuid not null references gmp.productos(id),
  especificacion_id  uuid references gmp.especificaciones(id),
  -- Versión del procedimiento vigente al abrir la orden (gmp.formula_procedimientos).
  procedimiento_version integer,
  -- I.40.25: fecha de elaboración, partida del granel (P) y presentación (#).
  jornada            date not null,
  partida            integer not null default 1 check (partida between 1 and 99),
  presentacion       integer not null default 1 check (presentacion between 1 and 99),
  presentacion_texto text,
  numero_lote        text not null,
  vencimiento        date not null,
  vencimiento_texto  text not null,
  cantidad_teorica   numeric(14,3) not null check (cantidad_teorica > 0),
  unidad             text not null default 'kg',
  cantidad_obtenida  numeric(14,3) check (cantidad_obtenida is null or cantidad_obtenida >= 0),
  unidades_obtenidas integer check (unidades_obtenidas is null or unidades_obtenidas >= 0),
  estado             gmp.estado_orden_enum not null default 'ABIERTA',
  observaciones      text,
  abierta_por        uuid not null references core.usuarios(id) default core.usuario_actual(),
  abierta_en         timestamptz not null default now(),
  terminada_por      uuid references core.usuarios(id),
  terminada_en       timestamptz,
  liberada_por       uuid references core.usuarios(id),
  liberada_en        timestamptz,
  motivo_cierre      text,
  unique (formula_id, jornada, partida, presentacion),
  constraint ordenes_liberada check (
    estado not in ('LIBERADA', 'RECHAZADA') or (liberada_por is not null and liberada_en is not null)
  ),
  constraint ordenes_rechazo_motivado check (
    estado not in ('RECHAZADA', 'ANULADA') or length(btrim(coalesce(motivo_cierre, ''))) >= 3
  )
);

comment on table gmp.ordenes_produccion is
  'Orden de producción de un lote (§4.7). Lote y vencimiento según I.40.25 (R-08): «#<presentación> dd/mm/aa» y '
  '«P<partida> mm/aa». El batch record se arma con sus etapas.';

-- Número de orden, lote y vencimiento los pone la base.
create or replace function gmp.fn_orden_numerar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from new.jornada)::int;
  v_n    integer;
  v_vida integer;
  v_proc integer;
begin
  insert into gmp.contadores_orden (anio) values (v_anio) on conflict (anio) do nothing;
  update gmp.contadores_orden set ultimo = ultimo + 1 where anio = v_anio returning ultimo into v_n;
  new.numero := format('OP-%s-%s', v_anio, lpad(v_n::text, 4, '0'));

  new.numero_lote := format('#%s %s', new.presentacion, to_char(new.jornada, 'DD/MM/YY'));
  if new.vencimiento is null then
    select coalesce(e.vida_util_meses, p.vida_util_meses) into v_vida
      from gmp.productos p
      left join gmp.especificaciones e on e.id = new.especificacion_id
     where p.id = new.producto_id;
    if v_vida is null then
      raise exception 'El producto no tiene vida útil cargada: indicá el vencimiento.' using errcode = 'check_violation';
    end if;
    new.vencimiento := (new.jornada + make_interval(months => v_vida))::date;
  end if;
  new.vencimiento_texto := format('P%s %s', new.partida, to_char(new.vencimiento, 'MM/YY'));

  select max(version) into v_proc from gmp.formula_procedimientos where formula_id = new.formula_id;
  new.procedimiento_version := v_proc;
  if new.especificacion_id is null then
    select especificacion_id into new.especificacion_id from gmp.formulas_fabricacion where id = new.formula_id;
  end if;
  if new.estado <> 'ABIERTA' then
    raise exception 'Una orden nace abierta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_orden_numerar
  before insert on gmp.ordenes_produccion
  for each row execute function gmp.fn_orden_numerar();

-- Lo identificatorio no cambia; el estado solo avanza por las funciones.
create or replace function gmp.fn_orden_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                            'terminada_en','liberada_por','liberada_en','motivo_cierre'])
     is distinct from
     (to_jsonb(old) - array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                            'terminada_en','liberada_por','liberada_en','motivo_cierre']) then
    raise exception 'El número, el lote y el vencimiento de la orden % no cambian.', old.numero
      using errcode = 'restrict_violation';
  end if;
  if old.estado in ('LIBERADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'La orden % está %: no se modifica.', old.numero, lower(old.estado::text)
      using errcode = 'restrict_violation';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'ABIERTA'   and new.estado in ('TERMINADA', 'ANULADA'))
    or (old.estado = 'TERMINADA' and new.estado in ('LIBERADA', 'RECHAZADA'))
  ) then
    raise exception 'Una orden no pasa de % a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;
  if new.estado in ('LIBERADA', 'RECHAZADA') and not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_orden_inmutable
  before update on gmp.ordenes_produccion
  for each row execute function gmp.fn_orden_inmutable();

-- ===========================================================================
-- 3. Etapas del registro de lote
-- ===========================================================================

create table gmp.op_etapas (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references gmp.ordenes_produccion(id),
  etapa           gmp.etapa_orden_enum not null,
  -- Forma según la etapa (la fija la aplicación): verificaciones, tablas,
  -- recuento, resultados. {"no_aplica": true, "motivo": …} si no corresponde.
  datos           jsonb not null default '{}'::jsonb,
  observaciones   text,
  realizo_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  realizo_en      timestamptz not null default now(),
  controlo_por    uuid references core.usuarios(id),
  controlo_en     timestamptz,
  unique (orden_id, etapa),
  constraint op_etapas_control check ((controlo_por is null) = (controlo_en is null))
);

comment on table gmp.op_etapas is
  'Etapas del batch record (R.40.x.1). «Controlar» la cierra: desde ahí no cambia (invariante 1).';

create or replace function gmp.fn_op_etapa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado gmp.estado_orden_enum;
  v_cc     boolean := new.etapa in ('CC_GRANEL', 'CC_PT');
begin
  select estado into v_estado from gmp.ordenes_produccion where id = new.orden_id;
  -- La revisión de la documentación se hace con la orden terminada; el resto,
  -- con la orden abierta.
  if (new.etapa = 'REVISION' and v_estado not in ('ABIERTA', 'TERMINADA'))
     or (new.etapa <> 'REVISION' and v_estado <> 'ABIERTA') then
    raise exception 'La orden está %: esa etapa ya no se registra.', lower(v_estado::text) using errcode = 'check_violation';
  end if;
  if v_cc and not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El control de calidad lo registra Control de Calidad o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.etapa = 'REVISION' and not core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD') then
    raise exception 'La revisión del batch record es de Dirección Técnica o Control de Calidad.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    if new.controlo_por is not null then
      raise exception 'Una etapa se registra primero y se controla después.' using errcode = 'check_violation';
    end if;
    new.realizo_por := core.usuario_actual();
    new.realizo_en := now();
    return new;
  end if;

  if old.controlo_por is not null then
    raise exception 'La etapa % ya está controlada: no se modifica.', lower(old.etapa::text)
      using errcode = 'restrict_violation';
  end if;
  if new.realizo_por is distinct from old.realizo_por or new.realizo_en is distinct from old.realizo_en
     or new.etapa is distinct from old.etapa or new.orden_id is distinct from old.orden_id then
    raise exception 'Quién realizó la etapa y cuándo no cambian.' using errcode = 'restrict_violation';
  end if;
  if new.controlo_por is not null then
    new.controlo_por := core.usuario_actual();
    new.controlo_en := now();
    -- Controlar no cambia los datos.
    if new.datos is distinct from old.datos or new.observaciones is distinct from old.observaciones then
      raise exception 'Al controlar no se cambian los datos: corregí primero y controlá después.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_op_etapa
  before insert or update on gmp.op_etapas
  for each row execute function gmp.fn_op_etapa();

-- ===========================================================================
-- 4. Terminar, liberar, anular
-- ===========================================================================

create or replace function gmp.terminar_orden(p_id uuid, p_cantidad numeric, p_unidades integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Termina la orden Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'FRACCIONAMIENTO') then
    raise exception 'Falta registrar el fraccionamiento.' using errcode = 'check_violation';
  end if;
  update gmp.ordenes_produccion
     set estado = 'TERMINADA', cantidad_obtenida = p_cantidad, unidades_obtenidas = p_unidades,
         terminada_por = core.usuario_actual(), terminada_en = now()
   where id = p_id;
  if not found then
    raise exception 'La orden no existe o tu rol no puede terminarla.';
  end if;
end;
$$;

-- Qué le falta a una orden para liberarse: etapas sin registrar o sin
-- controlar (salvo las marcadas «no aplica», que igual necesitan control).
create or replace function gmp.faltantes_liberacion(p_id uuid)
returns table (etapa gmp.etapa_orden_enum, falta text)
language sql
stable
set search_path = ''
as $$
  select e.etapa,
         case when x.id is null then 'sin registrar' when x.controlo_por is null then 'sin controlar' end
    from unnest(enum_range(null::gmp.etapa_orden_enum)) as e(etapa)
    left join gmp.op_etapas x on x.orden_id = p_id and x.etapa = e.etapa
   where x.id is null or x.controlo_por is null;
$$;

create or replace function gmp.liberar_orden(p_id uuid, p_aprobado boolean, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_falta text;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
  end if;
  if p_aprobado then
    select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta from gmp.faltantes_liberacion(p_id);
    if v_falta is not null then
      raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
    end if;
    if exists (select 1 from gmp.op_etapas where orden_id = p_id and etapa = 'CC_PT'
                and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
      raise exception 'El control de calidad del producto terminado no está aprobado.' using errcode = 'check_violation';
    end if;
  end if;
  update gmp.ordenes_produccion
     set estado = case when p_aprobado then 'LIBERADA' else 'RECHAZADA' end::gmp.estado_orden_enum,
         liberada_por = core.usuario_actual(), liberada_en = now(),
         motivo_cierre = nullif(btrim(p_motivo), '')
   where id = p_id;
  if not found then
    raise exception 'La orden no existe.';
  end if;
end;
$$;

create or replace function gmp.anular_orden(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update gmp.ordenes_produccion set estado = 'ANULADA', motivo_cierre = btrim(p_motivo) where id = p_id;
  if not found then
    raise exception 'La orden no existe o tu rol no puede anularla.';
  end if;
end;
$$;

-- ===========================================================================
-- 5. RLS, grants, auditoría
-- ===========================================================================

alter table gmp.equipos            enable row level security;
alter table gmp.equipos            force  row level security;
alter table gmp.contadores_orden   enable row level security;
alter table gmp.contadores_orden   force  row level security;
alter table gmp.ordenes_produccion enable row level security;
alter table gmp.ordenes_produccion force  row level security;
alter table gmp.op_etapas          enable row level security;
alter table gmp.op_etapas          force  row level security;

grant select, insert, update on gmp.equipos, gmp.ordenes_produccion, gmp.op_etapas to authenticated;
grant select, insert, update on gmp.contadores_orden to authenticated;
grant execute on function gmp.terminar_orden(uuid, numeric, integer), gmp.faltantes_liberacion(uuid),
                          gmp.liberar_orden(uuid, boolean, text), gmp.anular_orden(uuid, text) to authenticated;

create policy equipos_select_authenticated on gmp.equipos
  for select to authenticated using (core.rol() is not null);
create policy equipos_escribe_produccion on gmp.equipos
  for insert to authenticated with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
create policy equipos_actualiza_produccion on gmp.equipos
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'CONTROL_CALIDAD'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'CONTROL_CALIDAD'));
comment on policy equipos_escribe_produccion on gmp.equipos is
  'Alta de equipos de los batch records: Producción, Calidad y DT.';

-- El contador lo toca solo el trigger de numeración, dentro del INSERT de la
-- orden: la misma gente que abre órdenes.
create policy contadores_orden_produccion on gmp.contadores_orden
  for all to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy contadores_orden_produccion on gmp.contadores_orden is
  'Numeración de órdenes (OP-AAAA-NNNN) sin huecos; la usa el trigger al abrir una orden.';

create policy ordenes_select_authenticated on gmp.ordenes_produccion
  for select to authenticated using (core.rol() is not null);
create policy ordenes_abre_produccion on gmp.ordenes_produccion
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and abierta_por = core.usuario_actual());
create policy ordenes_actualiza_produccion_dt on gmp.ordenes_produccion
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy ordenes_abre_produccion on gmp.ordenes_produccion is
  '§3.3: abre la orden Gerencia de Producción (DT supervisa). Liberar es solo DT (trigger).';

create policy op_etapas_select_authenticated on gmp.op_etapas
  for select to authenticated using (core.rol() is not null);
create policy op_etapas_registra on gmp.op_etapas
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'OPERARIO', 'CONTROL_CALIDAD'));
create policy op_etapas_actualiza on gmp.op_etapas
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'OPERARIO', 'CONTROL_CALIDAD'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'OPERARIO', 'CONTROL_CALIDAD'));
comment on policy op_etapas_registra on gmp.op_etapas is
  'Realizó: Producción y operarios; las etapas de calidad, CC o DT (trigger).';

select core.adjuntar_auditoria('gmp.equipos');
select core.adjuntar_auditoria('gmp.contadores_orden');
select core.adjuntar_auditoria('gmp.ordenes_produccion');
select core.adjuntar_auditoria('gmp.op_etapas');

-- ===========================================================================
-- 6. Vínculo con el pedido (comercial → gmp, invariante 7)
-- ===========================================================================

create table comercial.pedido_ordenes (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references comercial.pedidos(id),
  orden_id   uuid not null unique references gmp.ordenes_produccion(id),
  creado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en  timestamptz not null default now()
);

comment on table comercial.pedido_ordenes is
  'Qué órdenes de producción se abrieron para un pedido. Vive en comercial: gmp no conoce los pedidos (invariante 7).';

alter table comercial.pedido_ordenes enable row level security;
alter table comercial.pedido_ordenes force  row level security;
grant select, insert on comercial.pedido_ordenes to authenticated;
create policy pedido_ordenes_select_authenticated on comercial.pedido_ordenes
  for select to authenticated using (core.rol() is not null);
create policy pedido_ordenes_insert_produccion on comercial.pedido_ordenes
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and creado_por = core.usuario_actual());
comment on policy pedido_ordenes_insert_produccion on comercial.pedido_ordenes is
  'Lo registra quien abre la orden desde el pedido.';
select core.adjuntar_auditoria('comercial.pedido_ordenes');
