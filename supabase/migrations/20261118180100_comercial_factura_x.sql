-- ---------------------------------------------------------------------------
-- Propósito : La factura X de un pedido de venta es la fuente verdadera de lo
--             que salió del depósito. DESPACHO (Johana) la carga asociada al
--             pedido: el stock baja por lo facturado, lo reservado que no se
--             mandó vuelve a quedar libre, y si la factura dice menos de lo
--             que ya se había despachado, la diferencia vuelve al stock. Si un
--             SKU queda en negativo, DESPACHO carga su conteo real.
--             DESPACHO también marca «Despachado», como Ventas.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditado). RN-51: la factura registra lo que
--             salió; primero sale de lotes despachables y lo que no alcanza
--             queda sin lote, marcado. D-factura-x-1 (decisión del codirector
--             técnico del 2026-11-18).
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------
--
-- El stock que ve Ventas mientras reserva es orientativo (lo libre): el real
-- solo baja con la factura X o con «Despachado». El PDF de la factura no se
-- guarda (pedido del 2026-11-18): se leen sus renglones en el navegador y
-- quedan acá.
--
-- Reconciliación por producto: facturado (todas las facturas X del pedido)
-- menos lo ya salido por el pedido (SALIDA_VENTA menos ENTRADA_DEVOLUCION, con
-- documento PEDIDO de «Despachado» o FACTURA_X de una factura anterior).
-- Positivo: sale. Negativo: vuelve. Así da igual si Ventas marcó «Despachado»
-- antes o si llega una segunda factura. Los movimientos de la factura llevan
-- documento FACTURA_X (no PEDIDO): la factura puede traer productos o
-- cantidades que el pedido no tenía (bonificados, agregados), y
-- fn_movimiento_pt_pedido limita lo de PEDIDO a lo pedido.

-- ===========================================================================
-- 1. Facturas X
-- ===========================================================================

create table comercial.facturas_x (
  id           uuid primary key default gen_random_uuid(),
  numero       text not null unique check (btrim(numero) <> ''),
  fecha        date not null,
  pedido_id    uuid not null references comercial.pedidos(id),
  deposito_id  uuid not null references gmp.depositos(id),
  cliente      text,
  total        numeric(14,2),
  cargada_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargada_en   timestamptz not null default now()
);

comment on table comercial.facturas_x is
  'Factura X de un pedido de venta (D-factura-x-1): lo que salió de verdad. Append-only: se carga con '
  'comercial.cargar_factura_x y no se edita.';

create index facturas_x_pedido_idx on comercial.facturas_x (pedido_id);

create table comercial.facturas_x_renglones (
  id               uuid primary key default gen_random_uuid(),
  factura_id       uuid not null references comercial.facturas_x(id),
  orden            integer not null,
  codigo           text not null,
  producto_id      uuid references gmp.productos(id),
  descripcion      text,
  cantidad         numeric(14,4) not null check (cantidad >= 0),
  precio_unitario  numeric(14,4),
  bonificacion_pct numeric(6,2),
  subtotal         numeric(14,2),
  unique (factura_id, orden)
);

comment on table comercial.facturas_x_renglones is
  'Renglones de la factura X tal como vienen. producto_id null: el código no está en el catálogo y no movió stock.';

alter table comercial.despachos_pt
  add column factura_x_id uuid references comercial.facturas_x(id);
comment on column comercial.despachos_pt.factura_x_id is
  'El despacho registra una factura X (D-factura-x-1): sus movimientos pueden dejar stock en negativo.';

alter table comercial.facturas_x enable row level security;
alter table comercial.facturas_x force  row level security;
alter table comercial.facturas_x_renglones enable row level security;
alter table comercial.facturas_x_renglones force  row level security;

grant select on comercial.facturas_x, comercial.facturas_x_renglones to authenticated;

-- Sin políticas de escritura: se cargan solo con comercial.cargar_factura_x.
create policy facturas_x_select_authenticated on comercial.facturas_x
  for select to authenticated using (core.rol() is not null);
comment on policy facturas_x_select_authenticated on comercial.facturas_x is
  'Todo usuario interno ve las facturas X (D-factura-x-1). RN-50: se escriben solo por función, auditadas.';
create policy facturas_x_renglones_select_authenticated on comercial.facturas_x_renglones
  for select to authenticated using (core.rol() is not null);
comment on policy facturas_x_renglones_select_authenticated on comercial.facturas_x_renglones is
  'Todo usuario interno ve los renglones de las facturas X (D-factura-x-1). RN-50: se escriben solo por función, auditados.';

-- Índices de las claves foráneas y de la búsqueda por documento FACTURA_X.
create index facturas_x_deposito_idx on comercial.facturas_x (deposito_id);
create index facturas_x_cargada_por_idx on comercial.facturas_x (cargada_por);
create index facturas_x_renglones_producto_idx on comercial.facturas_x_renglones (producto_id);
create index despachos_pt_factura_x_idx on comercial.despachos_pt (factura_x_id) where factura_x_id is not null;
create index movimientos_pt_factura_x_idx on comercial.movimientos_pt (documento_id, producto_id)
  where documento_tipo = 'FACTURA_X';

select core.adjuntar_auditoria('comercial.facturas_x');
select core.adjuntar_auditoria('comercial.facturas_x_renglones');

-- La factura respalda stock: no se modifica (el borrado ya lo prohíbe la
-- auditoría). Defensa extra por si algún día se concede UPDATE.
create function comercial.fn_factura_x_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Una factura X cargada no se modifica: si está mal, se corrige con otra.'
    using errcode = 'restrict_violation';
end;
$$;
create trigger trg_facturas_x_inmutable before update on comercial.facturas_x
  for each row execute function comercial.fn_factura_x_inmutable();
create trigger trg_facturas_x_renglones_inmutable before update on comercial.facturas_x_renglones
  for each row execute function comercial.fn_factura_x_inmutable();

-- Una factura X se carga en la misma transacción que su despacho: solo
-- comercial.cargar_factura_x puede crearla (no hay política de INSERT) y la
-- marca de tiempo es now(). Lo que no cumpla eso no es un movimiento de factura
-- X, aunque apunte a una (los roles de stock insertan en despachos_pt).
create function comercial.factura_x_de_esta_transaccion(p_factura_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from comercial.facturas_x
                  where id = p_factura_id and cargada_en = now()
                    and cargada_por = core.usuario_actual());
$$;
comment on function comercial.factura_x_de_esta_transaccion(uuid) is
  'La factura X se cargó en esta transacción y por este usuario (D-factura-x-1): no se puede reusar una vieja.';
-- La usan triggers que corren como quien inserta: authenticated sí, anon no.
revoke execute on function comercial.factura_x_de_esta_transaccion(uuid) from public, anon;
grant execute on function comercial.factura_x_de_esta_transaccion(uuid) to authenticated;

create function comercial.fn_despacho_factura_x_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.factura_x_id is distinct from old.factura_x_id then
    raise exception 'La factura X de un despacho no se cambia.' using errcode = 'restrict_violation';
  end if;
  if tg_op = 'INSERT' and new.factura_x_id is not null
     and not comercial.factura_x_de_esta_transaccion(new.factura_x_id) then
    raise exception 'Un despacho de factura X lo registra solo comercial.cargar_factura_x.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger trg_despacho_factura_x_guarda before insert or update on comercial.despachos_pt
  for each row execute function comercial.fn_despacho_factura_x_guarda();

-- ===========================================================================
-- 2. Los controles de stock dejan pasar lo que registra una factura X
-- ===========================================================================

-- Copia de 20261118170000 (una entrada nunca se frena: solo mejora un
-- negativo). Cambio: lo que registra una factura X tampoco (D-factura-x-1).
create or replace function comercial.fn_stock_pt_no_negativo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  if new.cantidad >= 0
     or comercial.es_movimiento_factura_x(new.despacho_id, new.documento_tipo, new.documento_id) then
    return null;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt
   where deposito_id = new.deposito_id and producto_id = new.producto_id
     and orden_id is not distinct from new.orden_id;

  if v_saldo < 0 then
    raise exception
      'El movimiento dejaría el stock de este producto en % unidades en el depósito%. No se puede sacar lo que no hay.',
      trim_scale(v_saldo), case when new.orden_id is null then ' (sin lote)' else ' para ese lote' end
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create function comercial.es_movimiento_factura_x(p_despacho_id uuid, p_documento_tipo text, p_documento_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_documento_tipo = 'FACTURA_X'
     and exists (select 1 from comercial.despachos_pt
                  where id = p_despacho_id and factura_x_id = p_documento_id)
     and comercial.factura_x_de_esta_transaccion(p_documento_id);
$$;
revoke execute on function comercial.es_movimiento_factura_x(uuid, text, uuid) from public, anon;
grant execute on function comercial.es_movimiento_factura_x(uuid, text, uuid) to authenticated;
comment on function comercial.es_movimiento_factura_x(uuid, text, uuid) is
  'El movimiento lo registra comercial.cargar_factura_x en esta transacción (D-factura-x-1): documento FACTURA_X, '
  'su despacho apunta a esa factura y la factura es de esta transacción.';

-- Copia de 20260929110100. Cambio: lo que registra una factura X ya salió;
-- no se bloquea aunque deje reservas de otros sin respaldo (la pantalla lo muestra).
create or replace function comercial.fn_reservas_pt_alcanzan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo     numeric;
  v_reservado numeric;
begin
  -- Solo las salidas que dependen de una decisión: venta y transferencia. Un
  -- ajuste o un descarte registran lo que pasó y no se bloquean; si dejan la
  -- reserva sin respaldo, la pantalla lo muestra.
  if tg_table_name = 'movimientos_pt' then
    if not (new.cantidad < 0 and new.tipo in ('SALIDA_VENTA', 'TRANSFERENCIA_ENTRE_DEPOSITOS'))
       or comercial.es_movimiento_factura_x(new.despacho_id, new.documento_tipo, new.documento_id) then
      return null;
    end if;
  elsif new.liberada then
    return null;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt where deposito_id = new.deposito_id and producto_id = new.producto_id;
  v_reservado := comercial.reservado_pt(new.deposito_id, new.producto_id);

  if v_reservado > v_saldo then
    raise exception
      'Hay % unidades y % están reservadas: %.', v_saldo, v_reservado,
      case when tg_table_name = 'reservas_pt' then 'no se puede reservar más de lo que hay libre'
           else 'lo que sale no puede tocar lo reservado para otro cliente' end
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- 3. Cargar la factura X
-- ===========================================================================

create function comercial.cargar_factura_x(p_pedido_id uuid, p_factura jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_dep      uuid;
  v_factura  uuid;
  v_despacho uuid;
  v_numero   text := nullif(btrim(p_factura ->> 'numero'), '');
  v_motivo   text;
  r          record;
  res        record;
  v_dif      numeric;
  v_ok       numeric;
  v_hay      numeric;
  v_rest     numeric;
  v_toma     numeric;
  v_negativos jsonb;
  v_sin_catalogo text;
  v_dev      uuid;
  v_dev_lote uuid;
begin
  -- Ventas también puede cargarla: sigue haciendo todo lo que hacía (D-factura-x-1).
  if not core.es_rol('DESPACHO', 'VENTAS', 'ADMINISTRACION') then
    raise exception 'Cargar una factura X es de Despacho.' using errcode = 'insufficient_privilege';
  end if;
  if v_numero is null then
    raise exception 'Falta el número de la factura.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.facturas_x where numero = v_numero) then
    raise exception 'La factura X % ya está cargada.', v_numero using errcode = 'unique_violation';
  end if;
  if jsonb_array_length(coalesce(p_factura -> 'renglones', '[]'::jsonb)) = 0 then
    raise exception 'La factura no tiene renglones.' using errcode = 'check_violation';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null then
    raise exception 'No es un pedido de venta vigente.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO') then
    raise exception 'El pedido % todavía no está aprobado: que Ventas lo apruebe y después cargá la factura.',
      v_pedido.numero using errcode = 'check_violation';
  end if;
  v_dep := comercial.deposito_de_venta(p_pedido_id);
  v_motivo := format('Factura X %s — pedido %s, %s', v_numero, v_pedido.numero, v_pedido.cliente);

  insert into comercial.facturas_x (numero, fecha, pedido_id, deposito_id, cliente, total)
  values (v_numero, coalesce((p_factura ->> 'fecha')::date, current_date), p_pedido_id, v_dep,
          nullif(btrim(p_factura ->> 'cliente'), ''), (p_factura ->> 'total')::numeric)
  returning id into v_factura;

  insert into comercial.facturas_x_renglones
    (factura_id, orden, codigo, producto_id, descripcion, cantidad, precio_unitario, bonificacion_pct, subtotal)
  select v_factura, x.ord::integer, btrim(x.e ->> 'codigo'),
         (select p.id from gmp.productos p
           where upper(btrim(p.codigo_interno)) = upper(btrim(x.e ->> 'codigo')) and p.tercero_id is null),
         x.e ->> 'descripcion', (x.e ->> 'cantidad')::numeric, (x.e ->> 'precio_unitario')::numeric,
         (x.e ->> 'bonificacion_pct')::numeric, (x.e ->> 'subtotal')::numeric
    from jsonb_array_elements(p_factura -> 'renglones') with ordinality as x(e, ord);

  select string_agg(distinct codigo, ', ') into v_sin_catalogo
    from comercial.facturas_x_renglones where factura_id = v_factura and producto_id is null;

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion, factura_x_id)
  values (p_pedido_id, v_dep,
          exists (select 1 from comercial.pedido_renglones pr
                   where pr.pedido_id = p_pedido_id and not pr.anulado
                     and pr.cantidad > coalesce((select sum(fr.cantidad)
                                                   from comercial.facturas_x_renglones fr
                                                   join comercial.facturas_x f on f.id = fr.factura_id
                                                  where f.pedido_id = p_pedido_id
                                                    and fr.producto_id = pr.producto_id), 0)),
          v_motivo, v_factura)
  returning id into v_despacho;

  -- Por producto: todo lo facturado al pedido contra todo lo que ya salió por él.
  for r in
    with fact as (
      select fr.producto_id, sum(fr.cantidad) as facturado
        from comercial.facturas_x_renglones fr
        join comercial.facturas_x f on f.id = fr.factura_id
       where f.pedido_id = p_pedido_id and fr.producto_id is not null
       group by fr.producto_id
    ), sal as (
      select producto_id,
             sum(-cantidad) filter (where tipo in ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION')) as salido
        from comercial.movimientos_pt
       where (documento_tipo = 'PEDIDO' and documento_id = p_pedido_id)
          or (documento_tipo = 'FACTURA_X'
              and documento_id in (select id from comercial.facturas_x where pedido_id = p_pedido_id))
       group by producto_id
    )
    select coalesce(fact.producto_id, sal.producto_id) as producto_id,
           coalesce(fact.facturado, 0) - coalesce(sal.salido, 0) as dif
      from fact full join sal on sal.producto_id = fact.producto_id
     where coalesce(fact.facturado, 0) <> coalesce(sal.salido, 0)
     order by 1
  loop
    v_dif := r.dif;

    if v_dif < 0 then
      -- La factura dice menos de lo que ya había salido: vuelve al depósito y
      -- al lote de donde salió más (un pedido pudo salir de dos). Si ese lote
      -- ya no es despachable (bloqueo, vencimiento), vuelve sin lote.
      v_dev := null;
      v_dev_lote := null;
      select m.deposito_id, m.orden_id into v_dev, v_dev_lote
        from comercial.movimientos_pt m
       where m.producto_id = r.producto_id
         and ((m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id)
              or (m.documento_tipo = 'FACTURA_X'
                  and m.documento_id in (select id from comercial.facturas_x where pedido_id = p_pedido_id)))
       group by m.deposito_id, m.orden_id
      having sum(-m.cantidad) > 0
       order by sum(-m.cantidad) desc
       limit 1;
      if v_dev_lote is not null and not gmp.lote_despachable(v_dev_lote) then
        v_dev_lote := null;
      end if;
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id, orden_id)
      values (r.producto_id, coalesce(v_dev, v_dep), 'ENTRADA_DEVOLUCION', -v_dif,
              v_motivo || case when v_dev_lote is null then ': no salió (vuelve sin lote)' else ': no salió' end,
              'FACTURA_X', v_factura, v_despacho, v_dev_lote);
      continue;
    end if;

    -- Lo reservado para este pedido se consume primero.
    v_rest := v_dif;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_pt
       where pedido_id = p_pedido_id and deposito_id = v_dep and producto_id = r.producto_id
         and not liberada and cantidad > consumido
       order by creado_en
       for update
    loop
      exit when v_rest <= 0;
      v_toma := least(v_rest, res.pendiente);
      update comercial.reservas_pt set consumido = consumido + v_toma where id = res.id;
      v_rest := v_rest - v_toma;
    end loop;

    -- Sale de los lotes despachables (RN-51, el mismo criterio que
    -- asignar_lotes_pt); lo que no alcanza, sin lote. Con el lock del reparto
    -- (fn_movimiento_pt_lote) para que lo calculado no cambie antes del insert.
    perform pg_advisory_xact_lock(hashtextextended('pt|' || v_dep::text || '|' || r.producto_id::text, 0));
    select coalesce(sum(s), 0) into v_ok
      from (select sum(m.cantidad) s, m.orden_id
              from comercial.movimientos_pt m
             where m.deposito_id = v_dep and m.producto_id = r.producto_id
             group by m.orden_id
            having sum(m.cantidad) > 0) g
     where g.orden_id is null or gmp.lote_despachable(g.orden_id);
    v_hay := least(v_dif, v_ok);
    if v_hay > 0 then
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
      values (r.producto_id, v_dep, 'SALIDA_VENTA', -v_hay, v_motivo, 'FACTURA_X', v_factura, v_despacho);
    end if;
    if v_dif > v_hay then
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
      values (r.producto_id, v_dep, 'SALIDA_VENTA', -(v_dif - v_hay),
              v_motivo || ': sin stock en el sistema, queda para contar', 'FACTURA_X', v_factura, v_despacho);
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;

  -- Lo reservado que no se mandó vuelve a quedar libre, y el pedido se cierra.
  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Factura X %s cargada: no salió.', v_numero)
   where pedido_id = p_pedido_id and not liberada;
  if v_pedido.entregado_en is null then
    update comercial.pedidos
       set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
     where id = p_pedido_id;
  end if;

  -- Los SKU de la factura que quedaron en negativo: hay que contarlos.
  select jsonb_agg(jsonb_build_object('producto_id', s.producto_id, 'codigo', p.codigo_interno,
                                      'producto', p.nombre, 'saldo', s.saldo) order by p.codigo_interno)
    into v_negativos
    from (select m.producto_id, sum(m.cantidad) as saldo
            from comercial.movimientos_pt m
           where m.deposito_id = v_dep
             and m.producto_id in (select producto_id from comercial.facturas_x_renglones
                                    where factura_id = v_factura and producto_id is not null)
           group by m.producto_id
          having sum(m.cantidad) < 0) s
    join gmp.productos p on p.id = s.producto_id;

  return jsonb_build_object('factura_id', v_factura, 'deposito_id', v_dep,
                            'negativos', coalesce(v_negativos, '[]'::jsonb),
                            'sin_catalogo', v_sin_catalogo);
end;
$$;

comment on function comercial.cargar_factura_x(uuid, jsonb) is
  'Carga la factura X de un pedido de venta aprobado (D-factura-x-1): el stock del depósito del pedido baja por lo '
  'facturado (o vuelve si ya había salido más), lo reservado que no salió se libera y el pedido queda entregado. '
  'Devuelve los SKU que quedaron en negativo para contarlos. p_factura: {numero, fecha, cliente, total, '
  'renglones: [{codigo, descripcion, cantidad, precio_unitario, bonificacion_pct, subtotal}]}.';
revoke execute on function comercial.cargar_factura_x(uuid, jsonb) from public, anon;
grant execute on function comercial.cargar_factura_x(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 4. Conteo de los SKU en negativo
-- ===========================================================================

create function comercial.cargar_conteo_pt(p_deposito_id uuid, p_conteos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep     record;
  v_quien   text;
  v_solo_negativos boolean;
  r         record;
  v_saldo   numeric;
  v_sin_lote numeric;
  v_dif     numeric;
  v_lotes   numeric;
  v_hay     numeric;
  v_motivo  text;
  v_n       integer := 0;
begin
  if not core.es_rol('DESPACHO', 'ENCARGADA_STOCK', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') then
    raise exception 'Tu rol no carga conteos de stock.' using errcode = 'insufficient_privilege';
  end if;
  -- Despacho cuenta los SKU que una factura X dejó en negativo (D-factura-x-1).
  v_solo_negativos := not core.es_rol('ENCARGADA_STOCK', 'ADMINISTRACION', 'GERENCIA_PRODUCCION');
  select id, numero into v_dep from gmp.depositos
   where id = p_deposito_id and activo and numero in ('C5', 'PTF', 'BER');
  if v_dep.id is null then
    raise exception 'Se cuenta producto terminado en Calle 5 (C5), la fábrica (PTF) o Berna (BER).'
      using errcode = 'check_violation';
  end if;
  select nombre_completo into v_quien from core.usuarios where id = core.usuario_actual();

  for r in
    select (e ->> 'producto_id')::uuid as producto_id, (e ->> 'cantidad')::numeric as cantidad
      from jsonb_array_elements(coalesce(p_conteos, '[]'::jsonb)) e
  loop
    if r.cantidad is null or r.cantidad < 0 then
      raise exception 'Un conteo no es válido.' using errcode = 'check_violation';
    end if;
    -- El mismo lock que el reparto de lotes: una venta en paralelo no corre el ajuste.
    perform pg_advisory_xact_lock(hashtextextended('pt|' || v_dep.id::text || '|' || r.producto_id::text, 0));
    select coalesce(sum(cantidad), 0),
           coalesce(sum(cantidad) filter (where orden_id is null), 0)
      into v_saldo, v_sin_lote
      from comercial.movimientos_pt where deposito_id = v_dep.id and producto_id = r.producto_id;
    if v_solo_negativos
       and (v_saldo >= 0
            or not exists (select 1 from comercial.movimientos_pt
                            where deposito_id = v_dep.id and producto_id = r.producto_id
                              and documento_tipo = 'FACTURA_X')) then
      raise exception 'Desde Despacho se cuentan los SKU que una factura X dejó en negativo (% tiene %).',
        (select codigo_interno from gmp.productos where id = r.producto_id), trim_scale(v_saldo)
        using errcode = 'check_violation';
    end if;
    continue when r.cantidad = v_saldo and v_sin_lote >= 0;
    v_motivo := format('Conteo de %s por %s%s: %s; el sistema tenía %s.',
                       v_dep.numero, coalesce(v_quien, 'usuario'),
                       case when v_solo_negativos then ' (Despacho, tras una factura X)' else '' end,
                       trim_scale(r.cantidad), trim_scale(v_saldo));

    -- Primero el «sin lote» negativo vuelve a 0: si no, un lote con saldo
    -- seguiría vendible aunque el total contado sea menor.
    if v_sin_lote < 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.producto_id, v_dep.id, 'ENTRADA_AJUSTE', -v_sin_lote, v_motivo, 'CONTEO_PT');
      v_saldo := v_saldo - v_sin_lote;
    end if;
    v_dif := r.cantidad - v_saldo;

    if v_dif = 0 then
      null;
    elsif v_dif > 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
      values (r.producto_id, v_dep.id, 'ENTRADA_AJUSTE', v_dif, v_motivo, 'CONTEO_PT');
    else
      -- Sale primero de los lotes con saldo; lo que falte, sin lote (como 20261116140000).
      select coalesce(sum(s), 0) into v_lotes
        from (select sum(cantidad) s from comercial.movimientos_pt
               where deposito_id = v_dep.id and producto_id = r.producto_id
               group by orden_id having sum(cantidad) > 0) g;
      v_hay := least(-v_dif, v_lotes);
      if v_hay > 0 then
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
        values (r.producto_id, v_dep.id, 'SALIDA_AJUSTE', -v_hay, v_motivo, 'CONTEO_PT');
      end if;
      if -v_dif > v_hay then
        perform set_config('comercial.lote_pt_asignado', '1', true);
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo)
        values (r.producto_id, v_dep.id, 'SALIDA_AJUSTE', -(-v_dif - v_hay), v_motivo, 'CONTEO_PT');
        perform set_config('comercial.lote_pt_asignado', '', true);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function comercial.cargar_conteo_pt(uuid, jsonb) is
  'Lleva el stock de producto terminado de un depósito al conteo real (RN-54: con movimientos CONTEO_PT). Despacho '
  'solo cuenta los SKU en negativo (D-factura-x-1). p_conteos: [{producto_id, cantidad}].';
revoke execute on function comercial.cargar_conteo_pt(uuid, jsonb) from public, anon;
grant execute on function comercial.cargar_conteo_pt(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 5. Despacho también marca «Despachado»
-- ===========================================================================

-- Copia de 20261110160100. Cambio: DESPACHO cierra pedidos como Ventas.
create or replace function comercial.fn_pedido_entrega_solo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS', 'DESPACHO') then
    return new;
  end if;
  if current_setting('comercial.portal_cliente', true) = '1' then
    return new;
  end if;
  if (to_jsonb(new) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota'])
     = (to_jsonb(old) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota']) then
    return new;
  end if;
  if old.entregado_en is not null or new.entregado_en is null or new.estado <> 'CUMPLIDO'
     or (to_jsonb(new) - array['entregado_en','entregado_por','estado'])
        is distinct from (to_jsonb(old) - array['entregado_en','entregado_por','estado']) then
    raise exception 'Desde el depósito solo se marca la entrega de un pedido despachado.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from comercial.v_pendientes_despacho where pedido_id = new.id and pendiente > 0) then
    raise exception 'Al pedido % le quedan productos por despachar.', new.numero using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Copia de 20261027140000. Cambio: DESPACHO en la lista de roles.
create or replace function comercial.despachar_pedido(
  p_pedido_id     uuid,
  p_renglones     jsonb,
  p_deposito      text default 'C5',
  p_con_faltantes boolean default false,
  p_observacion   text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  v_dep       uuid;
  v_despacho  uuid;
  r           record;
  res         record;
  v_pend      numeric;
  v_restante  numeric;
  v_toma      numeric;
  v_n         integer := 0;
  v_queda     numeric;
begin
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS', 'DESPACHO') then
    raise exception 'Tu rol no despacha pedidos.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % está borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.para_stock then
    raise exception 'Un pedido para stock no se despacha: su producción queda en el depósito.' using errcode = 'check_violation';
  end if;
  if v_pedido.tercero_id is not null then
    raise exception 'Los pedidos tercerizados no pasan por el depósito de Nail Show.' using errcode = 'check_violation';
  end if;
  if v_pedido.entregado_en is not null then
    raise exception 'El pedido % ya se entregó completo.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO') then
    raise exception 'Se despacha un pedido enviado (este está %).', v_pedido.estado using errcode = 'check_violation';
  end if;

  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('C5', 'PTF', 'BER') and activo;
  if v_dep is null then
    raise exception 'Se despacha desde Calle 5 (C5), la fábrica (PTF) o Berna (BER).' using errcode = 'check_violation';
  end if;

  select coalesce(sum(v.pendiente), 0) - coalesce(sum(least(v.pendiente, greatest(s.cantidad, 0))), 0)
    into v_queda
    from comercial.v_pendientes_despacho v
    left join (select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
                 from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e group by 1) s
      on s.producto_id = v.producto_id
   where v.pedido_id = p_pedido_id;

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
  values (p_pedido_id, v_dep, v_queda > 0, nullif(btrim(p_observacion), ''))
  returning id into v_despacho;

  for r in
    select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
      from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e
     group by 1
  loop
    if r.cantidad is null or r.cantidad < 0 then
      raise exception 'Una cantidad a despachar no es válida.' using errcode = 'check_violation';
    end if;
    continue when r.cantidad = 0;

    select pendiente into v_pend from comercial.v_pendientes_despacho
     where pedido_id = p_pedido_id and producto_id = r.producto_id;
    if v_pend is null then
      raise exception 'El pedido % no lleva ese producto.', v_pedido.numero using errcode = 'check_violation';
    end if;
    if r.cantidad > v_pend then
      raise exception 'De % quedan % por despachar en el pedido %: no salen %.',
        (select nombre from gmp.productos where id = r.producto_id), v_pend, v_pedido.numero, r.cantidad
        using errcode = 'check_violation';
    end if;

    v_restante := r.cantidad;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_pt
       where deposito_id = v_dep and producto_id = r.producto_id and not liberada and cantidad > consumido
         and (pedido_id = p_pedido_id
              or (pedido_id is null and cliente_id is not null and cliente_id = v_pedido.cliente_id))
       order by (pedido_id is null), creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_pt set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;

    insert into comercial.movimientos_pt
      (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
    values
      (r.producto_id, v_dep, 'SALIDA_VENTA', -r.cantidad,
       format('Despacho del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id, v_despacho);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Elegí qué sale y cuánto.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(pendiente), 0) into v_queda
    from comercial.v_pendientes_despacho where pedido_id = p_pedido_id;

  if v_queda > 0 and not coalesce(p_con_faltantes, false) then
    raise exception 'Quedan % unidades sin despachar: marcá el despacho «con faltantes» o completá las cantidades.', v_queda
      using errcode = 'check_violation';
  end if;

  if v_queda = 0 then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s entregado completo.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set entregado_en = now(), entregado_por = core.usuario_actual(), estado = 'CUMPLIDO'
     where id = p_pedido_id;
  end if;

  return v_despacho;
end;
$$;

-- Copia de 20261118160000. Cambios: DESPACHO puede marcarlo y corre como
-- SECURITY DEFINER (DESPACHO no tiene políticas de escritura sobre pedidos ni
-- reservas; el rol se controla adentro y en despachar_pedido). La observación
-- por defecto dice quién despachó y el motivo de liberar ya no dice «por Ventas».
create or replace function comercial.despachar_pedido_reservado(p_pedido_id uuid, p_observacion text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_dep      record;
  v_renglones jsonb;
  v_n        integer := 0;
  v_menos    text;
  v_obs      text;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION', 'DESPACHO') then
    raise exception 'Marcar un pedido despachado es de Ventas o Despacho.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null then
    raise exception 'No es un pedido de venta vigente.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Se despacha un pedido aprobado (el % está %).', v_pedido.numero, v_pedido.estado
      using errcode = 'check_violation';
  end if;

  -- Lo que sale con menos: pendiente de despachar mayor que lo reservado.
  select string_agg(format('%s sale %s de %s', pr.codigo_interno,
                           trim_scale(coalesce(x.reservado, 0)), trim_scale(v.pendiente)),
                    ', ' order by pr.codigo_interno)
    into v_menos
    from comercial.v_pendientes_despacho v
    join gmp.productos pr on pr.id = v.producto_id
    left join (select producto_id, sum(cantidad - consumido) as reservado
                 from comercial.reservas_pt
                where pedido_id = p_pedido_id and not liberada
                group by producto_id) x on x.producto_id = v.producto_id
   where v.pedido_id = p_pedido_id and v.pendiente > coalesce(x.reservado, 0);
  v_obs := concat_ws(' · ',
                     coalesce(nullif(btrim(p_observacion), ''),
                              case when core.es_rol('VENTAS', 'ADMINISTRACION') then 'Despachado por Ventas'
                                   else 'Despachado por Despacho' end),
                     'Sale con menos: ' || v_menos);

  for v_dep in
    select distinct d.id, d.numero
      from comercial.reservas_pt r
      join gmp.depositos d on d.id = r.deposito_id
     where r.pedido_id = p_pedido_id and not r.liberada and r.cantidad > r.consumido
  loop
    select jsonb_agg(jsonb_build_object('producto_id', x.producto_id,
                                        'cantidad', least(x.reservado, v.pendiente)))
      into v_renglones
      from (select producto_id, sum(cantidad - consumido) as reservado
              from comercial.reservas_pt
             where pedido_id = p_pedido_id and deposito_id = v_dep.id and not liberada
             group by producto_id) x
      join comercial.v_pendientes_despacho v
        on v.pedido_id = p_pedido_id and v.producto_id = x.producto_id
     where least(x.reservado, v.pendiente) > 0;
    continue when v_renglones is null;
    perform comercial.despachar_pedido(p_pedido_id, v_renglones, v_dep.numero, true, v_obs);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'El pedido % no tiene nada reservado para despachar. Si salió por fuera del sistema, finalizalo.',
      v_pedido.numero using errcode = 'check_violation';
  end if;

  if (select entregado_en from comercial.pedidos where id = p_pedido_id) is null then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s despachado.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
     where id = p_pedido_id;
  end if;
  return v_n;
end;
$$;

comment on function comercial.despachar_pedido_reservado(uuid, text) is
  'Ventas o Despacho marcan despachado un pedido aprobado (2026-11-18): despacha lo reservado de cada depósito con '
  'despachar_pedido (descuenta stock) y deja el pedido CUMPLIDO con entregado_en. Si algo sale con menos, la '
  'observación del despacho lo lista. La factura X, si llega después, corrige contra lo despachado.';
