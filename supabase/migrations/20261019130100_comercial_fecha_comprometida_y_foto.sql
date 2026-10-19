-- ---------------------------------------------------------------------------
-- Propósito : Nuevo circuito del pedido de venta, primera parte: la fecha la
--             compromete Gerencia de Producción y, al aprobar Ventas, se
--             congela una foto del importe pedido. Recién ahí el pedido
--             impacta (reserva Calle 5, manda lo que falta a Producción) y
--             cuenta en las estadísticas.
--               BORRADOR → ESPERANDO_FECHA (Ventas lo pide)
--               ESPERANDO_FECHA → FECHA_PROPUESTA (GP propone: pedido entero y,
--                 si hace falta, renglones demorados)
--               FECHA_PROPUESTA → CONFIRMADO (Ventas aprueba: foto + impacto)
--             Si con la fecha propuesta Ventas cambia productos o cantidades,
--             el pedido vuelve solo a ESPERANDO_FECHA («a reconfirmar»). Si
--             cambia precio, descuento o forma de pago, no. (El precio de un
--             pedido de venta lo recalcula comercial.recalcular_venta;
--             aplicar_precios_pedido y el cambio de tercero son de pedidos de
--             producción y siguen solo en borrador.)
-- Reglas    : Bloque 3.1 y 3.3 del pedido del 2026-10-15. D-ventas-pedidos-4
--             (vuelta a GP) y D-ventas-pedidos-10 (foto e impacto en
--             estadísticas). D-ventas-pedidos-14 (sin foto retroactiva: las
--             estadísticas de importe pedido arrancan con esta migración).
--             RN-50 (auditoría). Invariante 1 por analogía: la propuesta y la
--             foto no se editan ni se borran.
-- Fecha     : 2026-10-19 (borrador del 2026-10-15, 20261015130100; va
--             después de 20261019130000, que agrega los dos estados)
-- ---------------------------------------------------------------------------
--
-- «Aprobado» de un pedido de venta es el CONFIRMADO de siempre: es el estado
-- que leen Calle 5, el armado, el despacho, la facturación y los S-xxxx. Lo
-- que cambia es cómo se llega: solo desde FECHA_PROPUESTA y con foto. Los
-- pedidos de producción (S-xxxx, para stock) siguen BORRADOR → CONFIRMADO.
--
-- La foto no la arma el navegador: la base copia los renglones del pedido en
-- el momento de aprobar. Las ediciones posteriores cambian lo enviado y lo
-- facturado, nunca la foto. Una nueva aprobación deja una foto nueva; las
-- anteriores quedan como historial y no suman.

-- ===========================================================================
-- 1. Propuesta de fecha de Gerencia de Producción
-- ===========================================================================

create table comercial.propuestas_fecha (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references comercial.pedidos(id),
  fecha_pedido  date not null,
  nota          text check (nota is null or length(btrim(nota)) between 1 and 1000),
  propuesta_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  propuesta_en  timestamptz not null default now(),
  -- Orden de carga, estrictamente creciente. Elige la vigente: dos propuestas
  -- en la misma transacción tienen la misma propuesta_en (now()) y un
  -- desempate por id (uuid al azar) la elegiría al azar.
  orden         bigint generated always as identity
);

comment on table comercial.propuestas_fecha is
  'Fecha comprometida por Gerencia de Producción para el pedido de venta entero. Append-only: una nueva propuesta '
  'reemplaza a la anterior, que queda como historial. La vigente es la última del pedido.';

create index propuestas_fecha_pedido_idx on comercial.propuestas_fecha (pedido_id, orden);
create index propuestas_fecha_por_idx    on comercial.propuestas_fecha (propuesta_por);

create table comercial.propuestas_fecha_renglones (
  id           uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references comercial.propuestas_fecha(id),
  renglon_id   uuid not null references comercial.pedido_renglones(id),
  fecha        date not null,
  unique (propuesta_id, renglon_id)
);

comment on table comercial.propuestas_fecha_renglones is
  'Productos que demoran más que el resto, con su fecha. La fecha del pedido entero es igual o posterior a la del '
  'renglón más demorado.';

create index propuestas_fecha_renglones_renglon_idx on comercial.propuestas_fecha_renglones (renglon_id);

-- La propuesta la escribe la base: quién y cuándo. Solo para un pedido que
-- espera fecha, y al guardarla el pedido pasa a FECHA_PROPUESTA.
create function comercial.fn_propuesta_fecha_alta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.propuesta_por := core.usuario_actual();
  new.propuesta_en  := now();
  -- La fila del pedido queda tomada: dos propuestas a la vez, o una propuesta
  -- y una edición de Ventas, no se cruzan.
  perform 1 from comercial.pedidos
    where id = new.pedido_id and es_venta and estado = 'ESPERANDO_FECHA' and eliminado_en is null
    for no key update;
  if not found then
    raise exception 'Solo se propone fecha a un pedido de venta que la está esperando.'
      using errcode = 'check_violation';
  end if;
  if new.fecha_pedido < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha comprometida no puede ser anterior a hoy.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_propuesta_fecha_alta
  before insert on comercial.propuestas_fecha
  for each row execute function comercial.fn_propuesta_fecha_alta();

create function comercial.fn_propuesta_fecha_pasa_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update comercial.pedidos set estado = 'FECHA_PROPUESTA' where id = new.pedido_id;
  -- Sin esto, un rol que no actualiza pedidos dejaría la propuesta guardada y
  -- el pedido sin moverse, en silencio (RLS esconde la fila).
  if not found then
    raise exception 'No se pudo pasar el pedido a «fecha propuesta».' using errcode = 'insufficient_privilege';
  end if;
  return null;
end;
$$;

create trigger trg_propuesta_fecha_pasa_estado
  after insert on comercial.propuestas_fecha
  for each row execute function comercial.fn_propuesta_fecha_pasa_estado();

-- Renglón demorado: del mismo pedido, vigente, cargado junto con su propuesta
-- y nunca después de la fecha del pedido entero (precisión 1 del 2026-10-15).
create function comercial.fn_propuesta_renglon_valida()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prop comercial.propuestas_fecha%rowtype;
begin
  select * into v_prop from comercial.propuestas_fecha where id = new.propuesta_id;
  if v_prop.propuesta_en <> now() then
    -- Por la API: comercial.proponer_fecha, que guarda las dos cosas juntas.
    raise exception 'Los productos demorados se cargan junto con su propuesta de fecha.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones
                  where id = new.renglon_id and pedido_id = v_prop.pedido_id and not anulado) then
    raise exception 'El producto demorado no es de este pedido.' using errcode = 'check_violation';
  end if;
  if new.fecha < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'La fecha de un producto demorado no puede ser anterior a hoy.' using errcode = 'check_violation';
  end if;
  if new.fecha > v_prop.fecha_pedido then
    raise exception 'La fecha del pedido entero (%) no puede ser anterior a la de un producto demorado (%).',
      to_char(v_prop.fecha_pedido, 'DD/MM/YYYY'), to_char(new.fecha, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_propuesta_renglon_valida
  before insert on comercial.propuestas_fecha_renglones
  for each row execute function comercial.fn_propuesta_renglon_valida();

-- Propuesta y productos demorados en una sola llamada: por PostgREST cada
-- pedido HTTP es una transacción, y los demorados van con su propuesta.
-- p_demorados: [{renglon_id, fecha}].
create function comercial.proponer_fecha(p_pedido_id uuid, p_fecha date, p_nota text default null,
                                         p_demorados jsonb default '[]'::jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- La fila del pedido se toma antes de insertar: así el número de orden de
  -- la propuesta sale ya con el pedido bloqueado y dos propuestas a la vez no
  -- quedan en orden invertido respecto de una edición de Ventas.
  perform 1 from comercial.pedidos where id = p_pedido_id for no key update;
  insert into comercial.propuestas_fecha (pedido_id, fecha_pedido, nota)
  values (p_pedido_id, p_fecha, nullif(btrim(p_nota), ''))
  returning id into v_id;
  insert into comercial.propuestas_fecha_renglones (propuesta_id, renglon_id, fecha)
  select v_id, (x ->> 'renglon_id')::uuid, (x ->> 'fecha')::date
    from jsonb_array_elements(coalesce(p_demorados, '[]'::jsonb)) x;
  return v_id;
end;
$$;

comment on function comercial.proponer_fecha(uuid, date, text, jsonb) is
  'Gerencia de Producción compromete la fecha del pedido de venta entero y, si hace falta, la de los productos '
  'que demoran (bloque 3.1). El pedido pasa a FECHA_PROPUESTA.';

revoke execute on function comercial.proponer_fecha(uuid, date, text, jsonb) from public, anon;
grant execute on function comercial.proponer_fecha(uuid, date, text, jsonb) to authenticated;

-- ===========================================================================
-- 2. Foto del importe pedido
-- ===========================================================================

create table comercial.fotos_pedido (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references comercial.pedidos(id),
  propuesta_id         uuid not null references comercial.propuestas_fecha(id),
  fecha_pedido_cliente date not null,
  fecha_comprometida   date not null,
  -- La que había pedido el cliente: al aprobar, pedidos.fecha_entrega pasa a
  -- ser la comprometida y esta se perdería (revisión del 2026-10-19).
  fecha_entrega_pedida date,
  descuento_aplicado   numeric(5,2) not null check (descuento_aplicado between 0 and 100),
  vendedor_id          uuid not null references core.usuarios(id),
  aprobada_por        uuid not null references core.usuarios(id) default core.usuario_actual(),
  aprobada_en          timestamptz not null default now(),
  -- Orden de toma, estrictamente creciente: elige la foto vigente (ver
  -- comercial.propuestas_fecha.orden).
  orden                bigint generated always as identity
);

comment on table comercial.fotos_pedido is
  'Foto del importe pedido al aprobar un pedido de venta (D-ventas-pedidos-10). Append-only. La vigente es la última '
  'del pedido; las anteriores son historial y no suman en las estadísticas.';
comment on column comercial.fotos_pedido.fecha_pedido_cliente is
  'Cuándo hizo el pedido el cliente (comercial.pedidos.fecha), para medir la demora hasta la aprobación.';
comment on column comercial.fotos_pedido.aprobada_en is
  'Fecha de aprobación: las estadísticas imputan el pedido al período de esta fecha.';

create index fotos_pedido_pedido_idx    on comercial.fotos_pedido (pedido_id, orden);
create index fotos_pedido_propuesta_idx on comercial.fotos_pedido (propuesta_id);
create index fotos_pedido_por_idx       on comercial.fotos_pedido (aprobada_por);
create index fotos_pedido_vendedor_idx  on comercial.fotos_pedido (vendedor_id);

create table comercial.fotos_pedido_renglones (
  id            uuid primary key default gen_random_uuid(),
  foto_id       uuid not null references comercial.fotos_pedido(id),
  renglon_id    uuid not null references comercial.pedido_renglones(id),
  producto_id   uuid not null references gmp.productos(id),
  cantidad      numeric(14,4) not null check (cantidad > 0),
  precio_base   numeric(14,2) check (precio_base >= 0),
  precio_final  numeric(14,2) check (precio_final >= 0),
  precio_manual boolean not null,
  precio_unitario numeric(16,4) check (precio_unitario >= 0),
  alicuota_iva  numeric(5,2) not null,
  importe_lista numeric(16,2) generated always as (round(cantidad * coalesce(precio_base, 0), 2)) stored,
  importe       numeric(16,2) generated always as (round(cantidad * coalesce(precio_final, 0), 2)) stored,
  unique (foto_id, renglon_id)
);

comment on table comercial.fotos_pedido_renglones is
  'Renglones del pedido tal como quedaron al aprobar: cantidad, precio de lista, precio final (con descuento) e '
  'importe. Los copia la base; no se editan.';

create index fotos_pedido_renglones_renglon_idx  on comercial.fotos_pedido_renglones (renglon_id);
create index fotos_pedido_renglones_producto_idx on comercial.fotos_pedido_renglones (producto_id);

-- La cabecera la completa la base: pedido en FECHA_PROPUESTA, propuesta
-- vigente, fechas, descuento aplicado, quién y cuándo.
create function comercial.fn_foto_pedido_alta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_prop   comercial.propuestas_fecha%rowtype;
  v_lista  numeric;
begin
  select * into v_pedido from comercial.pedidos where id = new.pedido_id;
  if not found or not v_pedido.es_venta or v_pedido.estado <> 'FECHA_PROPUESTA'
     or v_pedido.eliminado_en is not null then
    raise exception 'La foto se toma al aprobar un pedido de venta con fecha propuesta.'
      using errcode = 'check_violation';
  end if;
  select * into v_prop from comercial.propuestas_fecha
   where pedido_id = new.pedido_id order by orden desc limit 1;
  select coalesce(sum(cantidad * coalesce(precio_base, 0)), 0) into v_lista
    from comercial.pedido_renglones where pedido_id = new.pedido_id and not anulado;

  new.propuesta_id         := v_prop.id;
  new.fecha_pedido_cliente := v_pedido.fecha;
  new.fecha_comprometida   := v_prop.fecha_pedido;
  new.fecha_entrega_pedida := v_pedido.fecha_entrega;
  new.descuento_aplicado   := coalesce(v_pedido.descuento_pct, comercial.descuento_por_monto(v_lista));
  new.vendedor_id          := coalesce(v_pedido.gestionado_por, core.usuario_actual());
  new.aprobada_por        := core.usuario_actual();
  new.aprobada_en          := now();
  return new;
end;
$$;

create trigger trg_foto_pedido_alta
  before insert on comercial.fotos_pedido
  for each row execute function comercial.fn_foto_pedido_alta();

-- Una foto sin aprobación no queda: al confirmar la transacción el pedido
-- tiene que haber pasado a CONFIRMADO (lo hace comercial.enviar_venta). Un
-- POST suelto a la tabla se deshace.
create function comercial.fn_foto_pedido_aprobada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from comercial.pedidos where id = new.pedido_id and estado = 'CONFIRMADO') then
    raise exception 'La foto se toma al aprobar el pedido (comercial.enviar_venta).'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger trg_foto_pedido_aprobada
  after insert on comercial.fotos_pedido
  deferrable initially deferred
  for each row execute function comercial.fn_foto_pedido_aprobada();

create function comercial.fn_foto_pedido_renglones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into comercial.fotos_pedido_renglones (foto_id, renglon_id)
  select new.id, r.id from comercial.pedido_renglones r
   where r.pedido_id = new.pedido_id and not r.anulado;
  return null;
end;
$$;

create trigger trg_foto_pedido_renglones
  after insert on comercial.fotos_pedido
  for each row execute function comercial.fn_foto_pedido_renglones();

-- Cada renglón de la foto se copia del pedido, en la misma transacción que su
-- foto: lo que mande quien inserta se pisa.
create function comercial.fn_foto_renglon_copia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_foto comercial.fotos_pedido%rowtype;
  v_r    comercial.pedido_renglones%rowtype;
begin
  select * into v_foto from comercial.fotos_pedido where id = new.foto_id;
  if v_foto.aprobada_en <> now() then
    raise exception 'Los renglones de la foto se copian al tomarla.' using errcode = 'check_violation';
  end if;
  select * into v_r from comercial.pedido_renglones
   where id = new.renglon_id and pedido_id = v_foto.pedido_id and not anulado;
  if not found then
    raise exception 'El renglón no es de este pedido.' using errcode = 'check_violation';
  end if;
  new.producto_id   := v_r.producto_id;
  new.cantidad      := v_r.cantidad;
  new.precio_base   := v_r.precio_base;
  new.precio_final  := v_r.precio_final;
  new.precio_manual := v_r.precio_manual;
  new.precio_unitario := v_r.precio_unitario;
  new.alicuota_iva  := v_r.alicuota_iva;
  return new;
end;
$$;

create trigger trg_foto_renglon_copia
  before insert on comercial.fotos_pedido_renglones
  for each row execute function comercial.fn_foto_renglon_copia();

-- ===========================================================================
-- 3. Permisos y auditoría de las tablas nuevas
-- ===========================================================================

alter table comercial.propuestas_fecha           enable row level security;
alter table comercial.propuestas_fecha           force  row level security;
alter table comercial.propuestas_fecha_renglones enable row level security;
alter table comercial.propuestas_fecha_renglones force  row level security;
alter table comercial.fotos_pedido               enable row level security;
alter table comercial.fotos_pedido               force  row level security;
alter table comercial.fotos_pedido_renglones     enable row level security;
alter table comercial.fotos_pedido_renglones     force  row level security;

-- Sin UPDATE ni DELETE: append-only.
grant select, insert on comercial.propuestas_fecha           to authenticated;
grant select, insert on comercial.propuestas_fecha_renglones to authenticated;
grant select, insert on comercial.fotos_pedido               to authenticated;
grant select, insert on comercial.fotos_pedido_renglones     to authenticated;

create policy propuestas_fecha_select_authenticated on comercial.propuestas_fecha
  for select to authenticated using (core.rol() is not null);
comment on policy propuestas_fecha_select_authenticated on comercial.propuestas_fecha is
  'La fecha comprometida la ven todos los que ven el pedido (bloque 3.1).';

create policy propuestas_fecha_insert_gerencia_produccion on comercial.propuestas_fecha
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION') and propuesta_por = core.usuario_actual());
comment on policy propuestas_fecha_insert_gerencia_produccion on comercial.propuestas_fecha is
  'La fecha la propone Gerencia de Producción, no Ventas (bloque 3.1).';

create policy propuestas_fecha_renglones_select_authenticated on comercial.propuestas_fecha_renglones
  for select to authenticated using (core.rol() is not null);
comment on policy propuestas_fecha_renglones_select_authenticated on comercial.propuestas_fecha_renglones is
  'Los productos demorados se ven junto con la propuesta (bloque 3.1).';

create policy propuestas_fecha_renglones_insert_gerencia_produccion on comercial.propuestas_fecha_renglones
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION'));
comment on policy propuestas_fecha_renglones_insert_gerencia_produccion on comercial.propuestas_fecha_renglones is
  'Los productos demorados los indica Gerencia de Producción con su propuesta (bloque 3.1).';

create policy fotos_pedido_select_authenticated on comercial.fotos_pedido
  for select to authenticated using (core.rol() is not null);
comment on policy fotos_pedido_select_authenticated on comercial.fotos_pedido is
  'La foto del importe pedido la ve quien ve el pedido (D-ventas-pedidos-10).';

create policy fotos_pedido_insert_ventas on comercial.fotos_pedido
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION') and aprobada_por = core.usuario_actual());
comment on policy fotos_pedido_insert_ventas on comercial.fotos_pedido is
  'La foto se toma al aprobar, y aprueba Ventas (los mismos roles que comercial.enviar_venta). Gerencia no: no '
  'tiene UPDATE sobre los renglones ni sobre el estado del pedido.';

create policy fotos_pedido_renglones_select_authenticated on comercial.fotos_pedido_renglones
  for select to authenticated using (core.rol() is not null);
comment on policy fotos_pedido_renglones_select_authenticated on comercial.fotos_pedido_renglones is
  'Los renglones de la foto se ven con la foto (D-ventas-pedidos-10).';

create policy fotos_pedido_renglones_insert_ventas on comercial.fotos_pedido_renglones
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION'));
comment on policy fotos_pedido_renglones_insert_ventas on comercial.fotos_pedido_renglones is
  'Los copia la base al tomar la foto, en nombre de quien aprueba (D-ventas-pedidos-10).';

select core.adjuntar_auditoria('comercial.propuestas_fecha');
select core.adjuntar_auditoria('comercial.propuestas_fecha_renglones');
select core.adjuntar_auditoria('comercial.fotos_pedido');
select core.adjuntar_auditoria('comercial.fotos_pedido_renglones');

-- ===========================================================================
-- 4. Transiciones del pedido
-- ===========================================================================
--
-- Copia de la vigente (20261001130100). Cambia solo la matriz de estados y
-- suma tres controles: ESPERANDO_FECHA es de pedidos de venta con productos;
-- a FECHA_PROPUESTA se llega con una propuesta guardada en esta transacción;
-- un pedido de venta llega a CONFIRMADO solo desde FECHA_PROPUESTA y con su
-- foto tomada en esta transacción.

create or replace function comercial.fn_pedido_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
    -- Pago, forma de pago y observación se marcan después de cerrar.
    if (to_jsonb(new) - 'estado_pago' - 'forma_pago' - 'observaciones')
       = (to_jsonb(old) - 'estado_pago' - 'forma_pago' - 'observaciones') then
      return new;
    end if;
    -- Un pedido cancelado todavía se puede marcar borrado (20260924170000).
    if old.estado = 'CANCELADO' and old.eliminado_en is null and new.eliminado_en is not null
       and (to_jsonb(new) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion')
         = (to_jsonb(old) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion') then
      return new;
    end if;
    -- Un pedido terminado todavía se puede marcar entregado (20260925100000).
    if old.entregado_en is null and new.entregado_en is not null
       and (to_jsonb(new) - 'entregado_en' - 'entregado_por')
         = (to_jsonb(old) - 'entregado_en' - 'entregado_por') then
      return new;
    end if;
    if old.cliente_id is null and new.cliente_id is not null
       and (to_jsonb(new) - 'cliente_id') = (to_jsonb(old) - 'cliente_id') then
      return new;
    end if;
    raise exception 'El pedido % está cerrado (%) y no se modifica.', old.numero, old.estado
      using errcode = 'restrict_violation';
  end if;

  -- NUEVO: un pedido no cambia de venta a producción ni al revés, en ningún
  -- estado. Si se pudiera en borrador, dos PATCH (es_venta=false y después
  -- CONFIRMADO) salteaban la fecha de GP y la foto (revisión del 2026-10-19).
  -- Ningún circuito lo cambia: la central de Ventas lo crea ya de venta.
  if new.es_venta is distinct from old.es_venta then
    raise exception 'El pedido % no cambia de venta a producción ni al revés: se carga de nuevo.', old.numero
      using errcode = 'check_violation';
  end if;

  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'BORRADOR'        and new.estado in ('CONFIRMADO', 'ESPERANDO_FECHA', 'CANCELADO'))
      or (old.estado = 'ESPERANDO_FECHA' and new.estado in ('FECHA_PROPUESTA', 'BORRADOR', 'CANCELADO'))
      or (old.estado = 'FECHA_PROPUESTA' and new.estado in ('CONFIRMADO', 'ESPERANDO_FECHA', 'BORRADOR', 'CANCELADO'))
      or (old.estado = 'CONFIRMADO'      and new.estado in ('BORRADOR', 'EN_PRODUCCION', 'CUMPLIDO', 'CANCELADO'))
      or (old.estado = 'EN_PRODUCCION'   and new.estado in ('CUMPLIDO', 'CANCELADO'))
    ) then
      raise exception 'Un pedido no pasa de % a %.', old.estado, new.estado
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CONFIRMADO'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se envía a producción un pedido sin productos.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: se pide fecha para un pedido con productos.
    if new.estado = 'ESPERANDO_FECHA'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se pide fecha para un pedido sin productos.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: la fecha la espera solo un pedido de venta.
    if new.estado = 'ESPERANDO_FECHA' and not new.es_venta then
      raise exception 'Solo un pedido de venta espera fecha de Gerencia de Producción.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: a FECHA_PROPUESTA se llega guardando la propuesta.
    if new.estado = 'FECHA_PROPUESTA'
       and not exists (select 1 from comercial.propuestas_fecha
                        where pedido_id = new.id and propuesta_en = now()) then
      raise exception 'La fecha la propone Gerencia de Producción.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO: un pedido de venta se aprueba con fecha propuesta y foto.
    if new.estado = 'CONFIRMADO' and (old.es_venta or new.es_venta)
       and (old.estado <> 'FECHA_PROPUESTA'
            or not exists (select 1 from comercial.fotos_pedido
                            where pedido_id = new.id and aprobada_en = now())) then
      raise exception 'El pedido % se aprueba con la fecha que propuso Gerencia de Producción.', old.numero
        using errcode = 'check_violation';
    end if;

    -- Entregado desde stock: no se produjo, no hay consumo (20260925100000).
    if new.estado = 'CUMPLIDO' and new.entregado_en is null
       and not exists (select 1 from comercial.pedido_consumos where pedido_id = new.id) then
      raise exception 'Un pedido se termina con «Terminado», que registra lo consumido y baja el stock.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 5. Productos del pedido antes de aprobar
-- ===========================================================================

-- Copia de 20260923130000 que admite, además del borrador, los dos estados
-- previos a la aprobación: el pedido todavía no impactó en nada.
create or replace function comercial.fn_renglon_en_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado comercial.estado_pedido_enum;
begin
  -- NUEVO: la fila del pedido queda tomada, para que una edición no se cruce
  -- con una propuesta de fecha ni con la aprobación.
  select estado into v_estado
    from comercial.pedidos
   where id = coalesce(new.pedido_id, old.pedido_id)
     for no key update;

  if v_estado is null or v_estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    raise exception 'Los productos se cambian con el pedido en borrador (está %). Devolvelo a borrador primero.', v_estado
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

-- Con la fecha ya propuesta, cambiar productos o cantidades la deja «a
-- reconfirmar»: el pedido vuelve a la bandeja de GP (D-ventas-pedidos-4). La
-- propuesta anterior queda como historial. Precio, descuento y forma de pago
-- no la tocan.
create function comercial.fn_renglon_reconfirma_fecha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.producto_id is distinct from old.producto_id
     or new.cantidad    is distinct from old.cantidad
     or new.anulado     is distinct from old.anulado then
    -- Sin productos no vuelve: queda con la fecha propuesta y la aprobación
    -- lo rechaza por vacío.
    update comercial.pedidos set estado = 'ESPERANDO_FECHA'
     where id = new.pedido_id and estado = 'FECHA_PROPUESTA'
       and exists (select 1 from comercial.pedido_renglones r where r.pedido_id = new.pedido_id and not r.anulado);
  end if;
  return null;
end;
$$;

create trigger trg_renglon_reconfirma_fecha
  after insert or update on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_reconfirma_fecha();

-- Copia de 20261001130000: el recálculo de precios corre mientras el pedido
-- no se aprobó (antes, solo en borrador).
create or replace function comercial.recalcular_venta(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_base   numeric;
  v_desc   numeric;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found or not v_pedido.es_venta
     or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    return;
  end if;
  select coalesce(sum(cantidad * coalesce(precio_base, 0)), 0) into v_base
    from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado;
  v_desc := coalesce(v_pedido.descuento_pct, comercial.descuento_por_monto(v_base));

  update comercial.pedido_renglones r
     set precio_final    = x.final,
         precio_unitario = round(x.final / (1 + r.alicuota_iva / 100), 4)
    from (select id,
                 case when precio_manual then precio_final
                      else round(round(precio_base / greatest(coalesce(
                             (select unidades_pack from comercial.v_lista_mayorista l
                               where l.producto_id = rr.producto_id), 1), 1)
                             * (1 - v_desc / 100), 0)
                           * coalesce((select unidades_pack from comercial.v_lista_mayorista l
                                        where l.producto_id = rr.producto_id), 1), 2)
                 end as final
            from comercial.pedido_renglones rr
           where rr.pedido_id = p_pedido_id and not rr.anulado
             and (rr.precio_manual or rr.precio_base is not null)) x
   where r.id = x.id
     and (r.precio_final is distinct from x.final
          or r.precio_unitario is distinct from round(x.final / (1 + r.alicuota_iva / 100), 4));
end;
$$;

comment on function comercial.recalcular_venta(uuid) is
  'Pedido de venta todavía no aprobado (borrador, esperando fecha o con fecha propuesta): aplica el descuento del '
  'pedido (el fijado o el de la escala) a cada renglón no manual. Precio final por unidad = redondeo a pesos de '
  'precio con promo × (1 − %), × unidades del pack.';

-- ===========================================================================
-- 5 bis. No se factura un pedido de venta sin aprobar
-- ===========================================================================
--
-- comercial.preparar_factura rechaza BORRADOR y CANCELADO; los dos estados
-- nuevos también son «sin aprobar». Se controla en la tabla, para cualquier
-- camino que inserte una factura.

create function comercial.fn_factura_pedido_aprobado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado comercial.estado_pedido_enum;
begin
  -- Solo la factura: una nota de crédito corrige una factura ya emitida y
  -- tiene que poder salir aunque el pedido haya vuelto a esperar fecha (RN-56,
  -- invariante 8).
  if new.comprobante <> 'FACTURA' then
    return new;
  end if;
  -- La fila del pedido queda tomada: el estado no cambia mientras se factura.
  select estado into v_estado from comercial.pedidos where id = new.pedido_id for share;
  -- Si RLS escondiera el pedido, el estado quedaría nulo y la factura pasaría.
  if not found then
    raise exception 'No se encontró el pedido de la factura.' using errcode = 'check_violation';
  end if;
  if v_estado in ('ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    raise exception 'No se factura un pedido de venta que todavía no se aprobó.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_factura_pedido_aprobado
  before insert on comercial.facturas
  for each row execute function comercial.fn_factura_pedido_aprobado();

-- ===========================================================================
-- 6. Aprobar: enviar_venta exige la fecha y toma la foto
-- ===========================================================================
--
-- Copia de 20261001160300 con tres cambios: parte de FECHA_PROPUESTA y no de
-- BORRADOR; la fecha de entrega del pedido y de su S-xxxx es la comprometida
-- por GP; y la foto se toma después de repartir Calle 5 (el recálculo ya
-- corrió) y antes de pasar a CONFIRMADO, que la exige.

create or replace function comercial.enviar_venta(p_pedido_id uuid, p_de_calle5 jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_prop   comercial.propuestas_fecha%rowtype;
  r        record;
  v_disp   numeric;
  v_pide   numeric;
  v_toma   numeric;
  v_falta  numeric := 0;
  v_s      uuid;
  v_numero text;
begin
  -- NUEVO: sin GERENCIA. Nunca pudo completarlo (no tiene UPDATE sobre los
  -- renglones ni sobre el estado) y fallaba sin aviso a mitad de camino.
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Aprobar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado <> 'FECHA_PROPUESTA' then
    raise exception 'El pedido % no tiene fecha propuesta: se pide a Gerencia de Producción y se aprueba con la que comprometa (está %).',
      v_pedido.numero, v_pedido.estado using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;
  select * into v_prop from comercial.propuestas_fecha
   where pedido_id = p_pedido_id order by orden desc limit 1;

  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  for r in
    select rr.id, rr.producto_id, rr.cantidad, pr.codigo_interno
      from comercial.pedido_renglones rr
      join gmp.productos pr on pr.id = rr.producto_id
     where rr.pedido_id = p_pedido_id and not rr.anulado
  loop
    select coalesce(disponible, 0) into v_disp
      from comercial.v_disponible_calle5 where producto_id = r.producto_id;
    v_disp := coalesce(v_disp, 0);
    v_pide := (select sum((x ->> 'cantidad')::numeric)
                 from jsonb_array_elements(coalesce(p_de_calle5, '[]'::jsonb)) x
                where (x ->> 'producto_id')::uuid = r.producto_id);
    if v_pide is not null and v_pide < 0 then
      raise exception 'La cantidad de Calle 5 de % no puede ser negativa.', r.codigo_interno
        using errcode = 'check_violation';
    end if;
    if v_pide is not null and v_pide > least(r.cantidad, v_disp) then
      raise exception 'De % se piden % de Calle 5 y hay % disponibles para este pedido (pedido: %).',
        r.codigo_interno, trim_scale(v_pide), trim_scale(v_disp), trim_scale(r.cantidad)
        using errcode = 'check_violation';
    end if;
    v_toma := coalesce(v_pide, least(r.cantidad, v_disp));
    update comercial.pedido_renglones
       set de_calle5 = v_toma, a_producir = r.cantidad - v_toma
     where id = r.id;
    v_falta := v_falta + (r.cantidad - v_toma);
  end loop;

  -- NUEVO: la foto del importe pedido, con los precios ya recalculados.
  insert into comercial.fotos_pedido (pedido_id) values (p_pedido_id);

  -- NUEVO: la fecha de entrega es la que comprometió GP.
  update comercial.pedidos
     set estado = 'CONFIRMADO', fecha_entrega = v_prop.fecha_pedido,
         gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
      into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
    insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock,
                                   destino_deposito_id, para_pedido_id)
    -- NUEVO: el S-xxxx hereda la fecha comprometida, no la que tenía el pedido.
    values (v_numero, format('Para %s — %s', v_pedido.numero, v_pedido.cliente), v_prop.fecha_pedido,
            format('Lo que falta del pedido de venta %s. Al terminar en Calle 5 queda reservado para él.', v_pedido.numero),
            true, (select id from gmp.depositos where numero = 'C5'), p_pedido_id)
    returning id into v_s;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
    select v_s, producto_id, a_producir from comercial.pedido_renglones
     where pedido_id = p_pedido_id and not anulado and a_producir > 0;
    update comercial.pedidos set estado = 'CONFIRMADO' where id = v_s;
  end if;

  -- Lo que Ventas decidió armar de Calle 5 queda reservado para este pedido.
  perform comercial.reservar_venta(p_pedido_id);

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_s, 'pedido_stock', v_numero);
end;
$$;

comment on function comercial.enviar_venta(uuid, jsonb) is
  'Aprueba un pedido de venta con la fecha que propuso Gerencia de Producción: toma la foto del importe pedido, '
  'reserva lo que Ventas arma de Calle 5 y manda lo que falta a Producción en un S-xxxx. El sistema no reparte '
  'entre clientes.';

-- ===========================================================================
-- 7. Estadísticas del importe pedido
-- ===========================================================================
--
-- Una fila por pedido de venta aprobado, con su foto vigente (la última). No
-- cuenta mientras el pedido vuelve a esperar fecha o está en borrador («a
-- reconfirmar», D-ventas-pedidos-4), ni si se borró por error. Un pedido
-- cancelado después de aprobado sí cuenta: lo que el cliente pidió es el
-- denominador de la tasa de cumplimiento (bloque 3.3).

create view comercial.v_ventas_pedidas
with (security_invoker = true) as
with vigente as (
  select distinct on (f.pedido_id) f.*
    from comercial.fotos_pedido f
   order by f.pedido_id, f.orden desc
),
tot as (
  select foto_id, sum(importe_lista) as importe_lista, sum(importe) as importe_pedido,
         count(*) as productos, sum(cantidad) as unidades
    from comercial.fotos_pedido_renglones group by foto_id
)
select p.id as pedido_id, p.numero, p.cliente_id, p.cliente, p.estado,
       v.vendedor_id,
       v.id as foto_id,
       v.fecha_pedido_cliente,
       v.aprobada_en,
       date_trunc('month', v.aprobada_en at time zone 'America/Argentina/Buenos_Aires')::date as periodo,
       (v.aprobada_en at time zone 'America/Argentina/Buenos_Aires')::date - v.fecha_pedido_cliente as dias_hasta_aprobar,
       v.fecha_comprometida,
       v.fecha_entrega_pedida,
       v.descuento_aplicado,
       t.importe_lista, t.importe_pedido, t.productos, t.unidades,
       (select count(*) from comercial.fotos_pedido x where x.pedido_id = p.id) as aprobaciones
  from vigente v
  join comercial.pedidos p on p.id = v.pedido_id
  join tot t on t.foto_id = v.id
 where p.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA')
   and p.eliminado_en is null;

comment on view comercial.v_ventas_pedidas is
  'Importe pedido por el cliente, de la foto vigente de cada pedido de venta aprobado (D-ventas-pedidos-10). Se '
  'imputa al período de la aprobación y conserva la fecha del pedido para medir la demora.';

grant select on comercial.v_ventas_pedidas to authenticated;

-- ===========================================================================
-- 8. Funciones de trigger: fuera del alcance de PUBLIC y anon
-- ===========================================================================

revoke execute on function comercial.fn_propuesta_fecha_alta()       from public, anon, authenticated;
revoke execute on function comercial.fn_propuesta_fecha_pasa_estado() from public, anon, authenticated;
revoke execute on function comercial.fn_propuesta_renglon_valida()   from public, anon, authenticated;
revoke execute on function comercial.fn_foto_pedido_alta()           from public, anon, authenticated;
revoke execute on function comercial.fn_foto_pedido_renglones()      from public, anon, authenticated;
revoke execute on function comercial.fn_foto_renglon_copia()         from public, anon, authenticated;
revoke execute on function comercial.fn_renglon_reconfirma_fecha()   from public, anon, authenticated;
revoke execute on function comercial.fn_foto_pedido_aprobada()       from public, anon, authenticated;
revoke execute on function comercial.fn_factura_pedido_aprobado()    from public, anon, authenticated;
