-- ---------------------------------------------------------------------------
-- Propósito : El stock de producto terminado lleva lote (la orden de
--             producción) y solo se vende, o se manda a Calle 5, lo liberado
--             por Dirección Técnica o lo que no tiene lote.
-- Reglas    : RN-51 para producto terminado, §4 de CLAUDE.md (la autoridad
--             sobre «¿se puede despachar?» vive en gmp y comercial la invoca),
--             invariante 7 (comercial → gmp), invariante 8, RN-50. Decisión
--             R-09 del 2026-09-30.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- R-09, LO QUE SE DECIDIÓ.
-- - Lo que ya existe sin lote (conteo inicial, Calle 5) sigue saliendo,
--   marcado «sin lote», como el saldo de apertura de insumos (R-05).
-- - «Terminado» no exige orden: si el pedido tiene la orden de ese producto,
--   lo producido entra con su lote y solo sale liberado; si no la tiene, entra
--   sin lote y sale igual. Es un camino para vender sin liberar, y se eligió
--   a sabiendas para no frenar el trabajo de planta.
-- - A Calle 5 va solo lo liberado o lo sin lote.
--
-- CÓMO. `movimientos_pt.orden_id` es el lote (null = sin lote) y el saldo
-- pasa a ser por producto, depósito y lote. Un trigger reparte cada salida
-- entre los lotes: primero lo sin lote, después por vencimiento. Una venta
-- toma solo lo despachable; un ajuste o un descarte, cualquier lote. Las
-- transferencias las reparte transferir_pt, que tiene que llevar el mismo
-- lote de un depósito al otro. Así despachar_pedido, entregar_pedido y
-- registrar_conteo_pt no cambian.
--
-- LO QUE NO CUBRE. El bloqueo de un lote de producto terminado por retiro de
-- mercado (RN-52): gmp.bloqueos_lote es de lotes de insumo, y el módulo de
-- retiro (PG.60.4) no existe todavía. Cuando exista, entra en
-- gmp.impedimento_despacho_orden y todo lo de abajo lo respeta sin cambios.

-- ===========================================================================
-- 1. La autoridad, en gmp
-- ===========================================================================

create function gmp.impedimento_despacho_orden(p_orden_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when o.id is null then 'El lote no existe.'
           when o.estado = 'LIBERADA' then null
           else format('El lote %s (%s) no está liberado por Dirección Técnica: está %s.',
                       o.numero_lote, o.numero, lower(o.estado::text))
         end
    from (select 1) x
    left join gmp.ordenes_produccion o on o.id = p_orden_id;
$$;

comment on function gmp.impedimento_despacho_orden(uuid) is
  'RN-51 para producto terminado: null si el lote (orden de producción) está liberado por DT; si no, el motivo. '
  'Única autoridad: comercial la invoca, no la replica (CLAUDE.md §4).';

revoke execute on function gmp.impedimento_despacho_orden(uuid) from public, anon;
grant  execute on function gmp.impedimento_despacho_orden(uuid) to authenticated;

-- ===========================================================================
-- 2. El lote en el libro de producto terminado
-- ===========================================================================

alter table comercial.movimientos_pt
  add column orden_id uuid references gmp.ordenes_produccion(id);

comment on column comercial.movimientos_pt.orden_id is
  'Lote: la orden de producción de lo que se mueve. Null = sin lote (existencia anterior o producción sin orden, R-09).';

create index movimientos_pt_lote_idx on comercial.movimientos_pt (producto_id, deposito_id, orden_id);

-- ===========================================================================
-- 3. De qué lotes sale una cantidad
-- ===========================================================================

create function comercial.asignar_lotes_pt(
  p_producto_id      uuid,
  p_deposito_id      uuid,
  p_cantidad         numeric,
  p_solo_despachable boolean
)
returns table (orden_id uuid, cantidad numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  r        record;
  v_rest   numeric := p_cantidad;
  v_total  numeric := 0;
  v_toma   numeric;
begin
  for r in
    select m.orden_id as lote, sum(m.cantidad) as saldo, o.vencimiento
      from comercial.movimientos_pt m
      left join gmp.ordenes_produccion o on o.id = m.orden_id
     where m.producto_id = p_producto_id and m.deposito_id = p_deposito_id
     group by m.orden_id, o.vencimiento
    having sum(m.cantidad) > 0
     order by (m.orden_id is not null), o.vencimiento, m.orden_id
  loop
    v_total := v_total + r.saldo;
    continue when v_rest <= 0;
    continue when p_solo_despachable and r.lote is not null
                  and gmp.impedimento_despacho_orden(r.lote) is not null;
    v_toma := least(v_rest, r.saldo);
    orden_id := r.lote;
    cantidad := v_toma;
    return next;
    v_rest := v_rest - v_toma;
  end loop;

  if v_rest > 0 then
    if p_solo_despachable and v_total >= p_cantidad then
      raise exception
        'Hay % unidades, pero solo % se pueden vender o mandar a Calle 5: el resto es de lotes que Dirección Técnica todavía no liberó.',
        v_total, p_cantidad - v_rest
        using errcode = 'check_violation';
    end if;
    raise exception 'No alcanza el stock: hay % unidades y salen %.', v_total, p_cantidad
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function comercial.asignar_lotes_pt(uuid, uuid, numeric, boolean) is
  'Reparte una salida de producto terminado entre lotes: primero lo sin lote, después por vencimiento. '
  'Con p_solo_despachable, solo lotes liberados (RN-51, vía gmp.impedimento_despacho_orden).';

-- ===========================================================================
-- 4. Cada movimiento, con su lote
-- ===========================================================================

create function comercial.fn_movimiento_pt_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_orig     comercial.movimientos_pt%rowtype;
  v_n        integer;
  v_orden    uuid;
  v_producto uuid;
  v_imp      text;
  v_c5       boolean;
  a          record;
  v_primero  boolean := true;
begin
  -- Una anulación cae sobre el mismo lote que el movimiento que anula.
  if new.anula_a_movimiento_id is not null then
    select * into v_orig from comercial.movimientos_pt where id = new.anula_a_movimiento_id;
    new.orden_id := v_orig.orden_id;
    return new;
  end if;

  -- Producción: el lote de la orden del pedido para ese producto, si la hay.
  if new.tipo = 'ENTRADA_PRODUCCION' and new.orden_id is null and new.documento_tipo = 'PEDIDO' then
    select count(*), (array_agg(o.id))[1] into v_n, v_orden
      from comercial.pedido_ordenes po
      join gmp.ordenes_produccion o on o.id = po.orden_id
     where po.pedido_id = new.documento_id and o.producto_id = new.producto_id and o.estado <> 'ANULADA';
    if v_n > 1 then
      raise exception 'El pedido tiene % órdenes de este producto: indicá de cuál es lo producido.', v_n
        using errcode = 'check_violation';
    end if;
    new.orden_id := v_orden;
  end if;

  if new.orden_id is not null then
    select producto_id into v_producto from gmp.ordenes_produccion where id = new.orden_id;
    if v_producto is distinct from new.producto_id then
      raise exception 'El lote es de otro producto.' using errcode = 'check_violation';
    end if;
  end if;

  select numero = 'C5' into v_c5 from gmp.depositos where id = new.deposito_id;

  -- A Calle 5 entra solo lo liberado o lo sin lote (R-09).
  if new.cantidad > 0 then
    if v_c5 and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception '% A Calle 5 va solo lo liberado: queda en la fábrica (PTF) hasta que la DT lo libere.', v_imp
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  -- Salida con lote ya elegido (por quien llama, o por el reparto de abajo).
  if new.orden_id is not null
     or coalesce(current_setting('comercial.lote_pt_asignado', true), '') = '1' then
    if new.tipo = 'SALIDA_VENTA' and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception 'No se puede vender. %', v_imp using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  if new.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS' then
    raise exception 'Las transferencias de producto terminado se hacen con comercial.transferir_pt, que lleva el lote de un depósito al otro.'
      using errcode = 'check_violation';
  end if;

  -- Reparto: la primera porción queda en esta fila, el resto en filas nuevas
  -- con los mismos datos. Una venta toma solo lo despachable (RN-51).
  perform pg_advisory_xact_lock(hashtextextended('pt|' || new.deposito_id::text || '|' || new.producto_id::text, 0));
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for a in
    select * from comercial.asignar_lotes_pt(new.producto_id, new.deposito_id, -new.cantidad,
                                             new.tipo = 'SALIDA_VENTA')
  loop
    if v_primero then
      new.orden_id := a.orden_id;
      new.cantidad := -a.cantidad;
      v_primero := false;
    else
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id, orden_id)
      values
        (new.producto_id, new.deposito_id, new.tipo, -a.cantidad, new.motivo, new.documento_tipo,
         new.documento_id, new.despacho_id, a.orden_id);
    end if;
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
  return new;
end;
$$;

-- Corre antes que trg_movimiento_pt_pedido (orden alfabético): el control de
-- «no más de lo pedido» suma las filas repartidas y da lo mismo.
create trigger trg_movimiento_pt_lote
  before insert on comercial.movimientos_pt
  for each row execute function comercial.fn_movimiento_pt_lote();

-- El saldo no queda negativo en ningún lote. Copia de la vigente con el lote
-- en la condición.
create or replace function comercial.fn_stock_pt_no_negativo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt
   where deposito_id = new.deposito_id and producto_id = new.producto_id
     and orden_id is not distinct from new.orden_id;

  if v_saldo < 0 then
    raise exception
      'El movimiento dejaría el stock de este producto en % unidades en el depósito%. No se puede sacar lo que no hay.',
      v_saldo, case when new.orden_id is null then ' (sin lote)' else ' para ese lote' end
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- ===========================================================================
-- 5. «Terminado» puede decir de qué orden es lo producido
-- ===========================================================================
--
-- Solo hace falta si el pedido tiene más de una orden del mismo producto. En
-- vez de reescribir terminar_pedido, la entrada toma `orden_id` del JSON de
-- producción cuando viene: se lo pasa el trigger por una variable de sesión.
-- ponytail: el front todavía no lo manda; con dos órdenes del mismo producto
-- en un pedido, «Terminado» avisa y hay que resolverlo cuando aparezca el caso.

-- ===========================================================================
-- 6. Transferencias: el mismo lote sale de un depósito y entra al otro
-- ===========================================================================
--
-- Copia de la vigente (20260929110000) con el reparto por lote. A Calle 5,
-- solo lo despachable.

create or replace function comercial.transferir_pt(
  p_producto_id uuid,
  p_cantidad    numeric,
  p_origen      text,
  p_destino     text,
  p_motivo      text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_origen  uuid;
  v_destino uuid;
  a         record;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a transferir tiene que ser positiva.' using errcode = 'check_violation';
  end if;
  select id into v_origen  from gmp.depositos where numero = p_origen  and numero in ('C5', 'PTF') and activo;
  select id into v_destino from gmp.depositos where numero = p_destino and numero in ('C5', 'PTF') and activo;
  if v_origen is null or v_destino is null or v_origen = v_destino then
    raise exception 'Se transfiere entre la fábrica (PTF) y Calle 5 (C5).' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pt|' || v_origen::text || '|' || p_producto_id::text, 0));
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for a in select * from comercial.asignar_lotes_pt(p_producto_id, v_origen, p_cantidad, p_destino = 'C5') loop
    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, orden_id)
    values (p_producto_id, v_origen,  'TRANSFERENCIA_ENTRE_DEPOSITOS', -a.cantidad,
            coalesce(nullif(btrim(p_motivo), ''), format('Envío a %s', p_destino)), 'TRANSFERENCIA_PT', a.orden_id),
           (p_producto_id, v_destino, 'TRANSFERENCIA_ENTRE_DEPOSITOS',  a.cantidad,
            coalesce(nullif(btrim(p_motivo), ''), format('Llegada desde %s', p_origen)), 'TRANSFERENCIA_PT', a.orden_id);
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
end;
$$;

-- ===========================================================================
-- 7. Vistas
-- ===========================================================================

-- Stock por lote: lo que el inspector pregunta y lo que la pantalla muestra.
create view comercial.v_stock_pt_lotes
with (security_invoker = true) as
select m.deposito_id, d.numero as deposito_numero, d.nombre as deposito,
       m.producto_id, p.codigo_interno, p.nombre as producto,
       m.orden_id, o.numero as orden_numero, o.numero_lote, o.vencimiento, o.vencimiento_texto,
       o.estado::text as estado_lote,
       sum(m.cantidad) as saldo,
       case when m.orden_id is null then null else gmp.impedimento_despacho_orden(m.orden_id) end as impedimento
  from comercial.movimientos_pt m
  join gmp.depositos d on d.id = m.deposito_id
  join gmp.productos p on p.id = m.producto_id
  left join gmp.ordenes_produccion o on o.id = m.orden_id
 group by m.deposito_id, d.numero, d.nombre, m.producto_id, p.codigo_interno, p.nombre,
          m.orden_id, o.numero, o.numero_lote, o.vencimiento, o.vencimiento_texto, o.estado
having sum(m.cantidad) <> 0;

comment on view comercial.v_stock_pt_lotes is
  'Saldo de producto terminado por depósito y lote. Sin lote (orden_id null) = existencia anterior o producción sin '
  'orden, despachable por R-09. Con lote: despachable solo sin impedimento (RN-51).';

grant select on comercial.v_stock_pt_lotes to authenticated;

-- v_stock_pt: se agrega lo retenido (en lotes sin liberar). Copia de la
-- vigente con la columna al final.
create or replace view comercial.v_stock_pt
with (security_invoker = true) as
select m.deposito_id,
       d.nombre as deposito,
       m.producto_id,
       p.nombre as producto,
       sum(m.cantidad) as saldo,
       max(m.ocurrido_en) as ultimo_movimiento,
       coalesce(sum(m.cantidad) filter (
         where m.orden_id is not null and gmp.impedimento_despacho_orden(m.orden_id) is not null), 0) as retenido
  from comercial.movimientos_pt m
  join gmp.depositos d on d.id = m.deposito_id
  join gmp.productos p on p.id = m.producto_id
 group by m.deposito_id, d.nombre, m.producto_id, p.nombre;

-- Traza hacia adelante por el lote real. Los despachos sin lote siguen
-- atribuyéndose por el pedido de la orden, como hasta hoy.
create or replace view comercial.v_trazabilidad_orden
with (security_invoker = true) as
select po.orden_id,
       'INSUMO'::text as sentido,
       m.ocurrido_en as momento,
       i.codigo_interno,
       i.nombre as articulo,
       -m.cantidad as cantidad,
       l.unidad,
       l.numero_registro_interno as lote_interno,
       l.lote_proveedor,
       r.numero as recepcion,
       coalesce(pr.razon_social, 'Saldo de apertura') as contraparte,
       p.numero as pedido
  from comercial.pedido_ordenes po
  join comercial.pedidos p on p.id = po.pedido_id
  join comercial.pedido_consumos c on c.pedido_id = p.id
  join comercial.movimientos_stock m
    on m.documento_tipo = 'PEDIDO_CONSUMO' and m.documento_id = c.id and m.anula_a_movimiento_id is null
   and not exists (select 1 from comercial.movimientos_stock x where x.anula_a_movimiento_id = m.id)
  join gmp.lotes_insumo l on l.id = m.lote_insumo_id
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  left join gmp.recepciones r on r.id = l.recepcion_id
  left join gmp.proveedores pr on pr.id = r.proveedor_id
union all
select m.orden_id,
       'DESPACHO'::text,
       m.ocurrido_en,
       pd.codigo_interno,
       pd.nombre,
       -m.cantidad,
       'u'::text,
       o.numero_lote,
       null::text,
       dep.numero,
       coalesce(p.cliente, 'Venta sin pedido'),
       p.numero
  from comercial.movimientos_pt m
  join gmp.ordenes_produccion o on o.id = m.orden_id
  join gmp.productos pd on pd.id = m.producto_id
  join gmp.depositos dep on dep.id = m.deposito_id
  left join comercial.pedidos p on m.documento_tipo = 'PEDIDO' and p.id = m.documento_id
 where m.tipo = 'SALIDA_VENTA'
union all
select po.orden_id,
       'DESPACHO'::text,
       m.ocurrido_en,
       pd.codigo_interno,
       pd.nombre,
       -m.cantidad,
       'u'::text,
       null::text,
       null::text,
       dep.numero,
       p.cliente,
       p.numero
  from comercial.pedido_ordenes po
  join comercial.pedidos p on p.id = po.pedido_id
  join comercial.movimientos_pt m
    on m.documento_tipo = 'PEDIDO' and m.documento_id = p.id and m.tipo = 'SALIDA_VENTA' and m.orden_id is null
  join gmp.productos pd on pd.id = m.producto_id
  join gmp.depositos dep on dep.id = m.deposito_id;
