-- ---------------------------------------------------------------------------
-- Propósito : Las facturas de venta son la única fuente que da de baja el
--             stock real de Berna (Casiopea). Tres salidas: Mayorista
--             (factura X asociada a un pedido, 20261118180100), Educadores
--             (factura J) y Minorista (factura C, B electrónica o X de
--             mostrador), estas dos sin pedido. Las carga Despacho, Ventas,
--             Administración o Gerencia de Producción (Naza, pedido del
--             2026-11-24), indistintamente. «Despachado» deja de mover
--             stock: solo cierra el pedido.
-- Reglas    : RN-54 / invariante 8 (el stock se corrige con movimientos
--             nuevos), RN-50 (auditado), RN-51 (primero lotes despachables).
--             D-factura-x-2 (decisiones del codirector técnico, 2026-11-18 y
--             2026-11-24).
-- Fecha     : 2026-11-24 (escrita el 2026-11-18, frenada y renumerada)
-- ---------------------------------------------------------------------------
--
-- No hay facturas cargadas todavía (consultado el 2026-11-18): las columnas
-- nuevas entran con valores por defecto y no hace falta corregir filas.

-- ===========================================================================
-- 1. Una factura de venta: tipo, emisor y canal
-- ===========================================================================

alter table comercial.facturas_x
  alter column pedido_id drop not null,
  add column tipo        text not null default 'X' check (tipo ~ '^[A-Z]$'),
  add column emisor_cuit text not null default '',
  add column canal       text not null default 'MAYORISTA'
    check (canal in ('MAYORISTA', 'EDUCADORES', 'MINORISTA')),
  add constraint facturas_x_mayorista_con_pedido check ((canal = 'MAYORISTA') = (pedido_id is not null)),
  drop constraint facturas_x_numero_key,
  add constraint facturas_x_comprobante_key unique (emisor_cuit, tipo, numero);

comment on table comercial.facturas_x is
  'Factura de venta (D-factura-x-1, D-factura-x-2): lo que salió de verdad del depósito. Mayorista: factura X '
  'asociada a un pedido (comercial.cargar_factura_x). Educadores (J) y Minorista (C, B o X): sin pedido '
  '(comercial.cargar_factura_venta). Append-only.';
comment on column comercial.facturas_x.tipo is 'Letra del comprobante: X, J, B, C…';
comment on column comercial.facturas_x.emisor_cuit is
  'CUIT del emisor (Virginia Arleo, Athene del Plata…): dos emisores pueden repetir número.';
comment on column comercial.facturas_x.canal is
  'Por dónde salió: MAYORISTA (con pedido), EDUCADORES o MINORISTA.';

-- ===========================================================================
-- 2. La excepción a los controles de stock ya no pasa por el despacho
-- ===========================================================================
-- Copia de 20261118180100. Cambio: una factura sin pedido no tiene despacho;
-- alcanza con que el movimiento sea de documento FACTURA_X y la factura se
-- haya cargado en esta transacción por este usuario (solo la crean las
-- funciones SECURITY DEFINER). p_despacho_id queda por compatibilidad.
create or replace function comercial.es_movimiento_factura_x(p_despacho_id uuid, p_documento_tipo text, p_documento_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_documento_tipo = 'FACTURA_X'
     and comercial.factura_x_de_esta_transaccion(p_documento_id);
$$;

-- ===========================================================================
-- 3. Cargar una factura sin pedido (Educadores, Minorista)
-- ===========================================================================

create function comercial.cargar_factura_venta(p_factura jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep      uuid;
  v_factura  uuid;
  v_numero   text := nullif(btrim(p_factura ->> 'numero'), '');
  v_tipo     text := upper(coalesce(nullif(btrim(p_factura ->> 'tipo'), ''), 'X'));
  v_emisor   text := coalesce(btrim(p_factura ->> 'emisor_cuit'), '');
  v_canal    text := upper(btrim(p_factura ->> 'canal'));
  v_motivo   text;
  r          record;
  v_ok       numeric;
  v_hay      numeric;
  v_negativos jsonb;
  v_sin_catalogo text;
begin
  if not core.es_rol('DESPACHO', 'VENTAS', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') then
    raise exception 'Cargar una factura de venta es de Despacho, Ventas, Administración o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_numero is null then
    raise exception 'Falta el número de la factura.' using errcode = 'check_violation';
  end if;
  if v_canal is null or v_canal not in ('EDUCADORES', 'MINORISTA') then
    raise exception 'Sin pedido, la factura es de Educadores o Minorista; la mayorista va con su pedido.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.facturas_x
              where emisor_cuit = v_emisor and tipo = v_tipo and numero = v_numero) then
    raise exception 'La factura % % ya está cargada.', v_tipo, v_numero using errcode = 'unique_violation';
  end if;
  if jsonb_array_length(coalesce(p_factura -> 'renglones', '[]'::jsonb)) = 0 then
    raise exception 'La factura no tiene renglones.' using errcode = 'check_violation';
  end if;

  -- Educadores y Minorista salen de Berna (pedido del 2026-11-18).
  select id into v_dep from gmp.depositos where numero = 'BER' and activo;
  if v_dep is null then
    raise exception 'No existe el depósito de Berna (BER).';
  end if;
  v_motivo := format('Factura %s %s — %s, %s', v_tipo, v_numero, initcap(v_canal),
                     coalesce(nullif(btrim(p_factura ->> 'cliente'), ''), 'sin cliente'));

  insert into comercial.facturas_x (numero, fecha, pedido_id, deposito_id, cliente, total, tipo, emisor_cuit, canal)
  values (v_numero, coalesce((p_factura ->> 'fecha')::date, current_date), null, v_dep,
          nullif(btrim(p_factura ->> 'cliente'), ''), (p_factura ->> 'total')::numeric, v_tipo, v_emisor, v_canal)
  returning id into v_factura;

  insert into comercial.facturas_x_renglones
    (factura_id, orden, codigo, producto_id, descripcion, cantidad, precio_unitario, bonificacion_pct, subtotal)
  select v_factura, x.ord::integer, btrim(x.e ->> 'codigo'),
         (select p.id from gmp.productos p
           where replace(upper(p.codigo_interno), ' ', '') = replace(upper(x.e ->> 'codigo'), ' ', '')
             and p.tercero_id is null
           limit 1),
         x.e ->> 'descripcion', (x.e ->> 'cantidad')::numeric, (x.e ->> 'precio_unitario')::numeric,
         (x.e ->> 'bonificacion_pct')::numeric, (x.e ->> 'subtotal')::numeric
    from jsonb_array_elements(p_factura -> 'renglones') with ordinality as x(e, ord);

  select string_agg(distinct codigo, ', ') into v_sin_catalogo
    from comercial.facturas_x_renglones where factura_id = v_factura and producto_id is null;

  -- Sale todo lo facturado: primero de lotes despachables (RN-51, el criterio
  -- de asignar_lotes_pt, con su lock); lo que no alcanza, sin lote y marcado.
  for r in
    select producto_id, sum(cantidad) as cantidad
      from comercial.facturas_x_renglones
     where factura_id = v_factura and producto_id is not null and cantidad > 0
     group by producto_id
     order by producto_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('pt|' || v_dep::text || '|' || r.producto_id::text, 0));
    select coalesce(sum(s), 0) into v_ok
      from (select sum(m.cantidad) s, m.orden_id
              from comercial.movimientos_pt m
             where m.deposito_id = v_dep and m.producto_id = r.producto_id
             group by m.orden_id
            having sum(m.cantidad) > 0) g
     where g.orden_id is null or gmp.lote_despachable(g.orden_id);
    v_hay := least(r.cantidad, v_ok);
    if v_hay > 0 then
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values (r.producto_id, v_dep, 'SALIDA_VENTA', -v_hay, v_motivo, 'FACTURA_X', v_factura);
    end if;
    if r.cantidad > v_hay then
      perform set_config('comercial.lote_pt_asignado', '1', true);
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values (r.producto_id, v_dep, 'SALIDA_VENTA', -(r.cantidad - v_hay),
              v_motivo || ': sin stock en el sistema, queda para contar', 'FACTURA_X', v_factura);
      perform set_config('comercial.lote_pt_asignado', '', true);
    end if;
  end loop;

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

comment on function comercial.cargar_factura_venta(jsonb) is
  'Carga una factura de venta sin pedido (D-factura-x-2): Educadores (J) o Minorista (C, B, X). El stock de Berna '
  'baja por lo facturado. Devuelve los SKU que quedaron en negativo para contarlos. p_factura: {numero, tipo, '
  'emisor_cuit, canal, fecha, cliente, total, renglones: [{codigo, descripcion, cantidad, precio_unitario, '
  'bonificacion_pct, subtotal}]}.';
revoke execute on function comercial.cargar_factura_venta(jsonb) from public, anon;
grant execute on function comercial.cargar_factura_venta(jsonb) to authenticated;

-- ===========================================================================
-- 4. «Despachado» ya no mueve stock: cierra el pedido
-- ===========================================================================
-- Reemplaza la de 20261118180100 (D-factura-x-2): el stock real baja solo con
-- la factura. Registra el despacho (sin movimientos) con la observación y lo
-- que sale con menos, libera lo reservado y deja el pedido entregado. La
-- factura X que llegue después descuenta todo lo facturado.
create or replace function comercial.despachar_pedido_reservado(p_pedido_id uuid, p_observacion text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_menos  text;
  v_obs    text;
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
                     'Sale con menos: ' || v_menos,
                     'El stock baja con la factura X');

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
  values (p_pedido_id, comercial.deposito_de_venta(p_pedido_id), v_menos is not null, v_obs);

  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Pedido %s despachado: el stock baja con la factura X.', v_pedido.numero)
   where pedido_id = p_pedido_id and not liberada;
  update comercial.pedidos
     set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
   where id = p_pedido_id;
  return 1;
end;
$$;

comment on function comercial.despachar_pedido_reservado(uuid, text) is
  'Ventas o Despacho marcan despachado un pedido aprobado (D-factura-x-2): registra el despacho sin mover stock, '
  'libera lo reservado y deja el pedido entregado. El stock real baja cuando se carga la factura X.';

-- ===========================================================================
-- 5. La factura mayorista también la carga Gerencia de Producción
-- ===========================================================================
-- Copia de la vigente (20261118180100). Único cambio: GERENCIA_PRODUCCION en
-- la lista de roles (Naza, pedido del 2026-11-24).
create or replace function comercial.cargar_factura_x(p_pedido_id uuid, p_factura jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- D-factura-x-2: también Gerencia de Producción (Naza, pedido del 2026-11-24).
  if not core.es_rol('DESPACHO', 'VENTAS', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') then
    raise exception 'Cargar una factura X es de Despacho, Ventas, Administración o Gerencia de Producción.' using errcode = 'insufficient_privilege';
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
$function$;
