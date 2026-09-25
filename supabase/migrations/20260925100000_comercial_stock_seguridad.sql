-- ---------------------------------------------------------------------------
-- Propósito : Stock de seguridad y punto de pedido por SKU, sobre un depósito
--             de producto terminado en fábrica (PTF): conteo inicial, entrada
--             de lo producido al terminar un pedido de Nail Show, salida al
--             entregar, pedidos «para stock», meta de stock de seguridad
--             editable por Gerencia de Producción, y la vista que dice qué
--             producir o comprar por SKU.
-- Reglas    : §4.12 (stock como libro de movimientos), RN-54 (el movimiento
--             no se edita), RN-50 (auditoría). Pedido del codirector técnico
--             (2026-09-24, ítem 4 de la cola).
-- Fecha     : 2026-09-25
-- ---------------------------------------------------------------------------
--
-- EL DEPÓSITO USA EL LIBRO DE CALLE 5.
-- comercial.movimientos_pt ya lleva producto terminado sin lote (D-04). Se le
-- agrega el depósito PTF y el tipo ENTRADA_PRODUCCION, que solo puede venir de
-- un pedido terminado y por no más de lo que el pedido pedía.
--
-- CÓMO SE CUENTA.
--   en fábrica          saldo de PTF.
--   comprometido        pedidos de clientes ya producidos y no entregados:
--                       están en PTF pero son del cliente.
--   en producción       pedidos «para stock» enviados o en producción.
--   posición            en fábrica − comprometido + en producción.
--   Lo que falta se separa como pidió el codirector técnico:
--     para el disponible = demanda durante el lead time − posición
--     para el SS         = meta de SS − lo que sobra de posición sobre la
--                          demanda del lead time
--   y la suma es el punto de pedido (con la meta propia) menos la posición.
-- Los pedidos de clientes todavía sin producir no cuentan: se van a producir
-- con su propia cantidad.

-- ===========================================================================
-- 1. Depósito de producto terminado en fábrica
-- ===========================================================================

insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior, activo)
values ('PTF', 'Producto terminado — fábrica', 'PT_NACIONAL', null, false, true)
on conflict (numero) do nothing;

-- ===========================================================================
-- 2. Libro de producto terminado: entrada por producción
-- ===========================================================================

alter table comercial.movimientos_pt drop constraint movimientos_pt_tipo_admitido;
alter table comercial.movimientos_pt
  add constraint movimientos_pt_tipo_admitido check (
    tipo in ('ENTRADA_DEVOLUCION', 'ENTRADA_AJUSTE', 'ENTRADA_PRODUCCION', 'SALIDA_VENTA',
             'SALIDA_AJUSTE', 'SALIDA_DESCARTE', 'TRANSFERENCIA_ENTRE_DEPOSITOS')
  ),
  add constraint movimientos_pt_produccion_de_pedido check (
    tipo <> 'ENTRADA_PRODUCCION' or (documento_tipo = 'PEDIDO' and documento_id is not null)
  );

create or replace function comercial.fn_movimiento_pt_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido  comercial.pedidos%rowtype;
  v_pedido_cant numeric;
  v_ya      numeric;
begin
  if new.documento_tipo is distinct from 'PEDIDO' then
    if new.tipo = 'ENTRADA_PRODUCCION' then
      raise exception 'La entrada de producción viene de un pedido terminado.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select * into v_pedido from comercial.pedidos where id = new.documento_id;
  if not found then
    raise exception 'El movimiento apunta a un pedido que no existe.';
  end if;

  select coalesce(sum(cantidad), 0) into v_pedido_cant
    from comercial.pedido_renglones
   where pedido_id = v_pedido.id and producto_id = new.producto_id and not anulado;

  select coalesce(sum(abs(cantidad)), 0) into v_ya
    from comercial.movimientos_pt
   where documento_tipo = 'PEDIDO' and documento_id = v_pedido.id
     and producto_id = new.producto_id and tipo = new.tipo;

  if v_ya + abs(new.cantidad) > v_pedido_cant then
    raise exception 'El pedido % tiene % unidades de ese producto: no se registran más.', v_pedido.numero, v_pedido_cant
      using errcode = 'check_violation';
  end if;

  if new.tipo = 'ENTRADA_PRODUCCION' and v_pedido.estado <> 'CUMPLIDO' then
    raise exception 'Entra a stock lo de un pedido terminado (el % está %).', v_pedido.numero, v_pedido.estado
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_movimiento_pt_pedido
  before insert on comercial.movimientos_pt
  for each row execute function comercial.fn_movimiento_pt_pedido();

-- Dirección Técnica termina pedidos (§3.3, supervisión) pero no carga ventas:
-- se le habilita solo la entrada de producción.
create policy movimientos_pt_insert_produccion on comercial.movimientos_pt
  for insert to authenticated
  with check (tipo = 'ENTRADA_PRODUCCION' and core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION'));
comment on policy movimientos_pt_insert_produccion on comercial.movimientos_pt is
  '§3.3: quien termina un pedido registra lo producido; la DT solo por esta vía.';

-- ===========================================================================
-- 3. Pedidos para stock y entregas
-- ===========================================================================

alter table comercial.pedidos
  add column para_stock    boolean not null default false,
  add column entregado_en  timestamptz,
  add column entregado_por uuid references core.usuarios(id);

comment on column comercial.pedidos.para_stock is
  'Producción para reponer stock (de seguridad o disponible) en el depósito PTF, sin cliente que lo reciba.';
comment on column comercial.pedidos.entregado_en is
  'Entrega al cliente: sale del depósito PTF. Un pedido se puede entregar desde stock sin producirse.';

alter table comercial.pedidos
  add constraint pedidos_stock_de_nail_show check (not para_stock or tercero_id is null),
  add constraint pedidos_stock_no_se_entrega check (not para_stock or entregado_en is null);

-- ===========================================================================
-- 4. Transición del pedido: entrega desde stock y marca de entrega
-- ===========================================================================
--
-- Copia de la versión vigente con dos agregados: un pedido cerrado admite que
-- se le marque la entrega, y CONFIRMADO → CUMPLIDO sin consumo vale si se
-- entregó desde stock (no se produjo: no hay nada que consumir).

CREATE OR REPLACE FUNCTION comercial.fn_pedido_transicion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
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

  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'BORRADOR'      and new.estado in ('CONFIRMADO', 'CANCELADO'))
      or (old.estado = 'CONFIRMADO'    and new.estado in ('BORRADOR', 'EN_PRODUCCION', 'CUMPLIDO', 'CANCELADO'))
      or (old.estado = 'EN_PRODUCCION' and new.estado in ('CUMPLIDO', 'CANCELADO'))
    ) then
      raise exception 'Un pedido no pasa de % a %.', old.estado, new.estado
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CONFIRMADO'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se envía a producción un pedido sin productos.'
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
$function$;


-- ===========================================================================
-- 5. «Terminado» suma lo producido al depósito PTF
-- ===========================================================================
--
-- Copia de la versión vigente (20260924170000) con el bloque final NUEVO: los
-- pedidos de Nail Show entran a PTF por la cantidad pedida. Los de un
-- tercerizado no: el producto es del cliente. Qué se hace si se produjo más o
-- menos es el ítem 15 de la cola.

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(p_pedido_id uuid, p_consumos jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  v_titular   uuid;
  v_propio    uuid;
  v_nombre_titular text;
  pos         record;
  res         record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Terminar un pedido es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se termina un pedido enviado o en producción (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo,
             nullif(e ->> 'origen', '')        as origen
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      i.origen,
      c.nombre,
      c.unidad_medida,
      c.tercero_id                             as propio
    from teorico t
    full join informado i on i.insumo_id = t.insumo_id
    join gmp.insumos_catalogo c on c.id = coalesce(t.insumo_id, i.insumo_id)
    order by c.nombre
  loop
    if r.usada is null or r.usada < 0 then
      raise exception 'La cantidad usada de % no es válida.', r.nombre using errcode = 'check_violation';
    end if;
    if r.usada <> r.teorica and r.motivo is null then
      raise exception 'Usaste % % de % y la receta dice %: escribí el motivo de la diferencia.',
        r.usada, coalesce(r.unidad_medida, ''), r.nombre, r.teorica
        using errcode = 'check_violation';
    end if;
    if r.unidad_medida is null then
      raise exception 'El insumo % no tiene unidad de medida confirmada en el catálogo.', r.nombre
        using errcode = 'check_violation';
    end if;

    v_titular := case r.origen
                   when 'NAILSHOW' then null
                   when 'TERCERO'  then v_pedido.tercero_id
                   else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                 end;
    if v_titular is not null and v_titular is distinct from v_pedido.tercero_id then
      raise exception 'No se consume material de un cliente tercerizado para otro (%).', r.nombre
        using errcode = 'check_violation';
    end if;
    if r.propio is not null and v_titular is distinct from r.propio then
      raise exception '«%» es propio del cliente tercerizado: sale de su stock.', r.nombre
        using errcode = 'check_violation';
    end if;
    v_nombre_titular := coalesce((select nombre from gmp.terceros where id = v_titular), 'Nail Show');

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia, tercero_id)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo, v_titular)
    returning id into v_consumo;

    continue when r.usada = 0;

    v_articulo := comercial.articulo_de_insumo(r.insumo_id);
    v_restante := r.usada;

    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo
         and s.saldo > 0
         and l.tercero_id is not distinct from v_titular
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from r.unidad_medida then
        raise exception
          'El lote de % está en % y la receta en %: no se puede descontar sin convertir.',
          r.nombre, pos.unidad, r.unidad_medida
          using errcode = 'check_violation';
      end if;

      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      raise exception
        'No alcanza el stock de % de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        v_nombre_titular, r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;

    -- Lo usado descuenta de las reservas del mismo titular para este cliente,
    -- de la que vence primero a la última.
    v_restante := r.usada;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_stock
       where insumo_id = r.insumo_id
         and tercero_id is not distinct from v_titular
         and para_tercero_id is not distinct from v_pedido.tercero_id
         and (pedido_id is null or pedido_id = p_pedido_id)
         and not liberada and vence_en > now()
       order by (pedido_id is null), vence_en, creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_stock set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;
  end loop;

  -- Una reserva atada a este pedido no sobrevive al pedido.
  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260925100000: lo producido para Nail Show entra al depósito
  -- de producto terminado en fábrica.
  if v_pedido.tercero_id is null then
    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
    select rr.producto_id,
           (select id from gmp.depositos where numero = 'PTF'),
           'ENTRADA_PRODUCCION',
           sum(rr.cantidad),
           format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
           'PEDIDO',
           p_pedido_id
      from comercial.pedido_renglones rr
     where rr.pedido_id = p_pedido_id and not rr.anulado
     group by rr.producto_id;
  end if;
end;
$function$;


-- ===========================================================================
-- 6. Entregar un pedido
-- ===========================================================================

create or replace function comercial.entregar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_ptf    uuid;
  r        record;
  v_saldo  numeric;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'GERENCIA', 'ENCARGADA_STOCK') then
    raise exception 'Tu rol no registra entregas.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % está borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.para_stock then
    raise exception 'Un pedido para stock no se entrega: su producción queda en el depósito.' using errcode = 'check_violation';
  end if;
  if v_pedido.tercero_id is not null then
    raise exception 'Los pedidos tercerizados no pasan por el depósito de Nail Show.' using errcode = 'check_violation';
  end if;
  if v_pedido.entregado_en is not null then
    raise exception 'El pedido % ya se entregó.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'CUMPLIDO') then
    raise exception 'Se entrega un pedido terminado, o uno enviado directamente desde stock (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;

  select id into v_ptf from gmp.depositos where numero = 'PTF';

  for r in
    select rr.producto_id, sum(rr.cantidad) as cantidad, p.nombre
      from comercial.pedido_renglones rr
      join gmp.productos p on p.id = rr.producto_id
     where rr.pedido_id = p_pedido_id and not rr.anulado
     group by rr.producto_id, p.nombre
  loop
    select coalesce(sum(cantidad), 0) into v_saldo
      from comercial.movimientos_pt where deposito_id = v_ptf and producto_id = r.producto_id;
    if v_saldo < r.cantidad then
      raise exception 'No alcanza el stock en fábrica de %: hay % y el pedido lleva %.', r.nombre, v_saldo, r.cantidad
        using errcode = 'check_violation';
    end if;
    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
    values (r.producto_id, v_ptf, 'SALIDA_VENTA', -r.cantidad,
            format('Entrega del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
  end loop;

  update comercial.pedidos
     set entregado_en = now(),
         entregado_por = core.usuario_actual(),
         estado = 'CUMPLIDO'
   where id = p_pedido_id;
end;
$$;

comment on function comercial.entregar_pedido(uuid) is
  'Entrega un pedido de Nail Show al cliente: sale del depósito PTF. Si estaba solo enviado, se entrega desde '
  'stock sin producir y queda CUMPLIDO.';

grant execute on function comercial.entregar_pedido(uuid) to authenticated;

-- ===========================================================================
-- 7. Conteo de producto terminado
-- ===========================================================================
--
-- Deja el saldo del depósito igual a lo contado con un ajuste por la
-- diferencia. Sirve para el stock inicial de PTF y para que la encargada de
-- stock corrija Calle 5 (ítem 14 de la cola).

create or replace function comercial.registrar_conteo_pt(
  p_producto_id     uuid,
  p_cantidad        numeric,
  p_observacion     text default null,
  p_deposito_numero text default 'PTF'
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_dep   uuid;
  v_saldo numeric;
  v_dif   numeric;
begin
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad contada no puede ser negativa.' using errcode = 'check_violation';
  end if;
  select id into v_dep from gmp.depositos where numero = p_deposito_numero and activo;
  if v_dep is null then
    raise exception 'No existe el depósito %.', p_deposito_numero;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pt|' || v_dep::text || '|' || p_producto_id::text, 0));
  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt where deposito_id = v_dep and producto_id = p_producto_id;
  v_dif := p_cantidad - v_saldo;

  if v_dif <> 0 then
    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
    values (p_producto_id, v_dep,
            case when v_dif > 0 then 'ENTRADA_AJUSTE' else 'SALIDA_AJUSTE' end::comercial.tipo_movimiento_enum,
            v_dif,
            format('Conteo: %s contados, había %s registrados.%s', p_cantidad, v_saldo,
                   coalesce(' ' || nullif(btrim(p_observacion), ''), '')),
            'CONTEO_PT');
  end if;
  return v_dif;
end;
$$;

comment on function comercial.registrar_conteo_pt(uuid, numeric, text, text) is
  'Conteo de producto terminado en un depósito comercial: registra el ajuste que deja el saldo en lo contado. '
  'SECURITY INVOKER: rige la política de movimientos_pt.';

grant execute on function comercial.registrar_conteo_pt(uuid, numeric, text, text) to authenticated;

-- ===========================================================================
-- 8. Parámetros por SKU (planilla) y meta propia
-- ===========================================================================

create table comercial.stock_seguridad_sku (
  id                 uuid primary key default gen_random_uuid(),
  sku_cod            text not null unique check (length(btrim(sku_cod)) > 0),
  producto_id        uuid unique references gmp.productos(id),
  descripcion        text not null,
  estado_demanda     text,
  origen             text,
  aplica_stock       boolean not null,
  incluye_produccion boolean not null,
  clase_demanda      text,
  mu_mensual         numeric(14,4),
  sigma_mensual      numeric(14,4),
  lead_time_dh       numeric(8,4),
  demanda_lead_time  numeric(14,4) not null default 0,
  ss_planilla        integer not null default 0 check (ss_planilla >= 0),
  rop_planilla       integer not null default 0 check (rop_planilla >= 0),
  cobertura_ss_dh    numeric(10,4),
  creado_en          timestamptz not null default now()
);

comment on table comercial.stock_seguridad_sku is
  'Stock de seguridad y punto de pedido por SKU según la planilla (referencia). La meta que rige es la de '
  'comercial.metas_stock_seguridad si hay una.';

create table comercial.metas_stock_seguridad (
  id          uuid primary key default gen_random_uuid(),
  -- Orden de carga: dos metas en la misma transacción tienen el mismo now().
  orden       bigint generated always as identity,
  sku_id      uuid not null references comercial.stock_seguridad_sku(id),
  ss_meta     integer not null check (ss_meta >= 0),
  motivo      text,
  creado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en   timestamptz not null default now()
);

comment on table comercial.metas_stock_seguridad is
  'Meta propia de stock de seguridad por SKU, la que Gerencia de Producción puede sostener. Append-only: la '
  'vigente es la última; el historial queda.';

create index metas_stock_seguridad_sku_idx on comercial.metas_stock_seguridad (sku_id, orden desc);

alter table comercial.stock_seguridad_sku    enable row level security;
alter table comercial.stock_seguridad_sku    force  row level security;
alter table comercial.metas_stock_seguridad  enable row level security;
alter table comercial.metas_stock_seguridad  force  row level security;

grant select, update on comercial.stock_seguridad_sku to authenticated;
grant select, insert on comercial.metas_stock_seguridad to authenticated;

create policy stock_seguridad_sku_select_authenticated on comercial.stock_seguridad_sku
  for select to authenticated using (core.rol() is not null);
comment on policy stock_seguridad_sku_select_authenticated on comercial.stock_seguridad_sku is
  '§3.3: consulta habilitada para todos los roles.';
create policy stock_seguridad_sku_update_produccion on comercial.stock_seguridad_sku
  for update to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA'));
comment on policy stock_seguridad_sku_update_produccion on comercial.stock_seguridad_sku is
  'Vincular el SKU con su producto y decidir si lleva stock; los números de la planilla no se editan (trigger).';

create policy metas_stock_seguridad_select_authenticated on comercial.metas_stock_seguridad
  for select to authenticated using (core.rol() is not null);
comment on policy metas_stock_seguridad_select_authenticated on comercial.metas_stock_seguridad is
  '§3.3: consulta habilitada para todos los roles.';
create policy metas_stock_seguridad_insert_produccion on comercial.metas_stock_seguridad
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'GERENCIA'));
comment on policy metas_stock_seguridad_insert_produccion on comercial.metas_stock_seguridad is
  'La meta de SS la fija quien produce (pedido del codirector técnico, 2026-09-24).';

-- De la planilla solo cambia el vínculo con el producto y si aplica stock.
create or replace function comercial.fn_sku_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'producto_id' - 'aplica_stock') is distinct from (to_jsonb(old) - 'producto_id' - 'aplica_stock') then
    raise exception 'Los números de la planilla no se editan: la meta propia se carga aparte.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_sku_campos_editables
  before update on comercial.stock_seguridad_sku
  for each row execute function comercial.fn_sku_campos_editables();

select core.adjuntar_auditoria('comercial.stock_seguridad_sku');
select core.adjuntar_auditoria('comercial.metas_stock_seguridad');

-- Alta del producto para un SKU que vende Nail Show y no está en el catálogo.
create or replace function comercial.alta_producto_de_sku(p_sku_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_sku comercial.stock_seguridad_sku%rowtype;
  v_id  uuid;
begin
  select * into v_sku from comercial.stock_seguridad_sku where id = p_sku_id for update;
  if not found then
    raise exception 'El SKU no existe.';
  end if;
  if v_sku.producto_id is not null then
    return v_sku.producto_id;
  end if;
  select id into v_id from gmp.productos
   where upper(btrim(codigo_interno)) = upper(btrim(v_sku.sku_cod)) and tercero_id is null;
  if v_id is null then
    insert into gmp.productos (codigo_interno, nombre)
    values (btrim(v_sku.sku_cod), btrim(v_sku.descripcion))
    returning id into v_id;
  end if;
  update comercial.stock_seguridad_sku set producto_id = v_id where id = p_sku_id;
  return v_id;
end;
$$;

comment on function comercial.alta_producto_de_sku(uuid) is
  'Da de alta en el catálogo el producto de un SKU de la planilla (con su código y descripción) y lo vincula. '
  'SECURITY INVOKER: rige la política de alta de productos (DT, GP, SYS).';

grant execute on function comercial.alta_producto_de_sku(uuid) to authenticated;

-- ===========================================================================
-- 9. Qué producir o comprar, por SKU
-- ===========================================================================

create view comercial.v_stock_seguridad
with (security_invoker = true) as
with meta as (
  select distinct on (sku_id) sku_id, ss_meta, creado_en, creado_por
    from comercial.metas_stock_seguridad
   order by sku_id, orden desc
),
saldo as (
  select m.producto_id,
         sum(m.cantidad) filter (where d.numero = 'PTF') as en_fabrica,
         sum(m.cantidad) filter (where d.numero = 'C5')  as en_calle5
    from comercial.movimientos_pt m
    join gmp.depositos d on d.id = m.deposito_id
   group by m.producto_id
),
pedidos as (
  select r.producto_id,
         sum(r.cantidad) filter (where not p.para_stock and p.estado = 'CUMPLIDO' and p.entregado_en is null)
           as comprometido,
         sum(r.cantidad) filter (where p.para_stock and p.estado in ('CONFIRMADO', 'EN_PRODUCCION'))
           as en_produccion,
         sum(r.cantidad) filter (where not p.para_stock and p.estado in ('CONFIRMADO', 'EN_PRODUCCION'))
           as pedidos_clientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.eliminado_en is null and p.tercero_id is null
   group by r.producto_id
),
base as (
  select s.*,
         pr.nombre                                    as producto_nombre,
         coalesce(mt.ss_meta, s.ss_planilla)          as ss_meta,
         mt.ss_meta is not null                       as meta_propia,
         mt.creado_en                                 as meta_desde,
         ceil(s.demanda_lead_time)                    as demanda_lt,
         coalesce(sa.en_fabrica, 0)                   as en_fabrica,
         coalesce(sa.en_calle5, 0)                    as en_calle5,
         coalesce(pe.comprometido, 0)                 as comprometido,
         coalesce(pe.en_produccion, 0)                as en_produccion,
         coalesce(pe.pedidos_clientes, 0)             as pedidos_clientes
    from comercial.stock_seguridad_sku s
    left join gmp.productos pr on pr.id = s.producto_id
    left join meta mt          on mt.sku_id = s.id
    left join saldo sa         on sa.producto_id = s.producto_id
    left join pedidos pe       on pe.producto_id = s.producto_id
)
select
  b.id                                   as sku_id,
  b.sku_cod,
  b.producto_id,
  b.producto_nombre,
  b.descripcion,
  b.estado_demanda,
  b.origen,
  b.clase_demanda,
  b.aplica_stock,
  case when b.incluye_produccion then 'PRODUCIR' else 'COMPRAR' end as accion,
  b.mu_mensual,
  b.lead_time_dh,
  b.demanda_lt,
  b.ss_planilla,
  b.rop_planilla,
  b.ss_meta,
  b.meta_propia,
  b.meta_desde,
  (b.demanda_lt + b.ss_meta)::numeric    as rop_meta,
  b.en_fabrica,
  b.en_calle5,
  b.comprometido,
  b.en_produccion,
  b.pedidos_clientes,
  b.en_fabrica - b.comprometido          as disponible,
  b.en_fabrica - b.comprometido + b.en_produccion as posicion,
  case when b.aplica_stock
       then greatest(b.demanda_lt - (b.en_fabrica - b.comprometido + b.en_produccion), 0) else 0 end
                                          as falta_disponible,
  case when b.aplica_stock
       then greatest(b.ss_meta - greatest((b.en_fabrica - b.comprometido + b.en_produccion) - b.demanda_lt, 0), 0)
       else 0 end                         as falta_ss,
  b.aplica_stock and (b.en_fabrica - b.comprometido + b.en_produccion) <= (b.demanda_lt + b.ss_meta)
                                          as bajo_punto_de_pedido
from base b;

comment on view comercial.v_stock_seguridad is
  'Por SKU: stock en fábrica, comprometido con clientes, en producción para stock, meta de SS y lo que falta, '
  'separado entre lo que falta para cubrir la demanda del lead time (disponible) y para el stock de seguridad.';

grant select on comercial.v_stock_seguridad to authenticated;
