-- ---------------------------------------------------------------------------
-- Propósito : Que una factura de venta no se cargue dos veces, aunque la
--             carguen dos personas a la vez o el número se lea distinto:
--             huella SHA-256 del PDF y número normalizado (0008-00002818 =
--             8-2818), con aviso de quién la cargó y cuándo.
-- Reglas    : RN-54 (el stock no se mueve dos veces por el mismo comprobante),
--             RN-50 (auditado). D-factura-x-1 / D-factura-x-2. Pedido del
--             codirector técnico del 2026-11-25.
-- Fecha     : 2026-11-25
-- ---------------------------------------------------------------------------
--
-- La huella la calcula el navegador sobre los bytes del PDF (el PDF no se
-- guarda, D-factura-x-1): sirve para reconocer el mismo archivo. La autoridad
-- sigue siendo el comprobante (emisor, tipo, número normalizado), único.
-- Al 2026-11-25 no hay facturas repetidas con el número normalizado.

-- ===========================================================================
-- 1. Número normalizado y huella
-- ===========================================================================

create function comercial.numero_comprobante_normalizado(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when position('-' in p_numero) > 0
      then coalesce(nullif(ltrim(btrim(split_part(p_numero, '-', 1)), '0'), ''), '0') || '-'
        || coalesce(nullif(ltrim(btrim(split_part(p_numero, '-', 2)), '0'), ''), '0')
    else coalesce(nullif(ltrim(btrim(p_numero), '0'), ''), '0')
  end;
$$;
comment on function comercial.numero_comprobante_normalizado(text) is
  'Punto de venta y número sin ceros a la izquierda: «0008-00002818» → «8-2818».';
grant execute on function comercial.numero_comprobante_normalizado(text) to authenticated;

alter table comercial.facturas_x
  add column pdf_sha256 text check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  add column numero_normalizado text
    generated always as (comercial.numero_comprobante_normalizado(numero)) stored;
comment on column comercial.facturas_x.pdf_sha256 is
  'SHA-256 de los bytes del PDF cargado (lo calcula el navegador). Null en las cargadas antes del 2026-11-25.';

create unique index facturas_x_pdf_sha256_key on comercial.facturas_x (pdf_sha256)
  where pdf_sha256 is not null;
create unique index facturas_x_comprobante_normalizado_key
  on comercial.facturas_x (emisor_cuit, tipo, numero_normalizado);

-- ===========================================================================
-- 2. Quién la cargó (aviso antes de confirmar)
-- ===========================================================================

create function comercial.factura_ya_cargada(p_pdf_sha256 text, p_tipo text, p_emisor_cuit text, p_numero text)
returns table (tipo text, numero text, cargada_en timestamptz, cargada_por text, pdf_igual boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.tipo, f.numero, f.cargada_en, u.nombre_completo, f.pdf_sha256 = p_pdf_sha256
    from comercial.facturas_x f
    left join core.usuarios u on u.id = f.cargada_por
   where core.es_rol('DESPACHO', 'VENTAS', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
     and (f.pdf_sha256 = p_pdf_sha256
          or (f.emisor_cuit = coalesce(btrim(p_emisor_cuit), '')
              and f.tipo = upper(coalesce(nullif(btrim(p_tipo), ''), 'X'))
              and f.numero_normalizado = comercial.numero_comprobante_normalizado(p_numero)))
   order by f.cargada_en
   limit 1;
$$;
comment on function comercial.factura_ya_cargada(text, text, text, text) is
  'La factura ya cargada con ese PDF o ese comprobante, con quién y cuándo; vacío si no está. Para avisar antes de confirmar.';
revoke execute on function comercial.factura_ya_cargada(text, text, text, text) from public, anon;
grant execute on function comercial.factura_ya_cargada(text, text, text, text) to authenticated;

-- ===========================================================================
-- 3. Al insertar: de a una por comprobante y con mensaje claro
-- ===========================================================================

create function comercial.fn_factura_no_repetida()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ya record;
begin
  -- Dos cargas a la vez del mismo comprobante o PDF: la segunda espera a la
  -- primera y después la ve (cada consulta toma una foto nueva).
  perform pg_advisory_xact_lock(hashtextextended(
    'factura|' || coalesce(new.emisor_cuit, '') || '|' || coalesce(new.tipo, '') || '|'
    || comercial.numero_comprobante_normalizado(new.numero), 0));
  if new.pdf_sha256 is not null then
    perform pg_advisory_xact_lock(hashtextextended('factura-pdf|' || new.pdf_sha256, 0));
  end if;
  select f.tipo, f.numero, f.cargada_en, u.nombre_completo as quien
    into v_ya
    from comercial.facturas_x f
    left join core.usuarios u on u.id = f.cargada_por
   where f.pdf_sha256 = new.pdf_sha256
      or (f.emisor_cuit = new.emisor_cuit and f.tipo = new.tipo
          and f.numero_normalizado = comercial.numero_comprobante_normalizado(new.numero))
   limit 1;
  if found then
    raise exception 'Esta factura ya está cargada: % %, por % el %. No se descontó nada.',
      v_ya.tipo, v_ya.numero, coalesce(v_ya.quien, 'otra persona'),
      to_char(v_ya.cargada_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI')
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
comment on function comercial.fn_factura_no_repetida() is
  'Rechaza una factura ya cargada (mismo PDF o mismo comprobante normalizado) con quién y cuándo; serializa cargas simultáneas.';

create trigger trg_factura_no_repetida before insert on comercial.facturas_x
  for each row execute function comercial.fn_factura_no_repetida();

-- ===========================================================================
-- 4. Las cargas guardan la huella
-- ===========================================================================
-- Copias de las vigentes (20261124103700). Cambios marcados NUEVO: guardan
-- pdf_sha256 y comparan el número normalizado.

CREATE OR REPLACE FUNCTION comercial.cargar_factura_x(p_pedido_id uuid, p_factura jsonb)
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
  -- NUEVO (2026-11-25): con el número normalizado (0008-00002818 = 8-2818).
  if exists (select 1 from comercial.facturas_x
              where numero_normalizado = comercial.numero_comprobante_normalizado(v_numero)) then
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

  -- NUEVO (2026-11-25): la huella del PDF.
  insert into comercial.facturas_x (pdf_sha256, numero, fecha, pedido_id, deposito_id, cliente, total)
  values (nullif(p_factura ->> 'pdf_sha256', ''), v_numero, coalesce((p_factura ->> 'fecha')::date, current_date), p_pedido_id, v_dep,
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

CREATE OR REPLACE FUNCTION comercial.cargar_factura_venta(p_factura jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
              where emisor_cuit = v_emisor and tipo = v_tipo
                and numero_normalizado = comercial.numero_comprobante_normalizado(v_numero)) then  -- NUEVO (2026-11-25)
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

  -- NUEVO (2026-11-25): la huella del PDF.
  insert into comercial.facturas_x (pdf_sha256, numero, fecha, pedido_id, deposito_id, cliente, total, tipo, emisor_cuit, canal)
  values (nullif(p_factura ->> 'pdf_sha256', ''), v_numero, coalesce((p_factura ->> 'fecha')::date, current_date), null, v_dep,
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
$function$;

