-- ---------------------------------------------------------------------------
-- Propósito : Ventas aprueba un pedido de venta que no está todo en stock
--             para mandarlo con menos unidades de algunos SKU («con
--             faltantes»), con una nota obligatoria. Lo que falta no va a
--             Producción: no se crean pedidos de stock S-xxxx. Al despachar,
--             la observación del despacho dice qué SKU salieron con menos.
-- Reglas    : RN-51 (el despacho sigue pasando por despachar_pedido y sus
--             controles), RN-54. Pedido del codirector técnico del
--             2026-11-18: «a veces se despachan pedidos con menos unidades
--             de las solicitadas, es una práctica común».
-- Fecha     : 2026-11-18
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. La nota queda en el pedido
-- ===========================================================================

alter table comercial.pedidos
  add column faltantes_nota text check (faltantes_nota is null or btrim(faltantes_nota) <> '');

comment on column comercial.pedidos.faltantes_nota is
  'Pedido de venta aprobado para salir con menos unidades de las pedidas (2026-11-18): la nota de Ventas. '
  'Con nota, lo que falta no se pide a Producción.';

-- ===========================================================================
-- 2. Aprobar con faltantes
-- ===========================================================================

create function comercial.aprobar_venta_con_faltantes(p_pedido_id uuid, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_dep    uuid;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Aprobar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_nota), '') is null then
    raise exception 'Escribí la nota: qué sale con menos y por qué.' using errcode = 'check_violation';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta or v_pedido.eliminado_en is not null
     or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    raise exception 'Se aprueba así un pedido de venta que todavía no está aprobado.'
      using errcode = 'check_violation';
  end if;

  -- Algo tiene que salir: reservado para el pedido o libre en su depósito.
  v_dep := comercial.deposito_de_venta(p_pedido_id);
  if not exists (
    select 1
      from comercial.pedido_renglones rr
     where rr.pedido_id = p_pedido_id and not rr.anulado
       and (exists (select 1 from comercial.reservas_pt r
                     where r.pedido_id = p_pedido_id and r.producto_id = rr.producto_id
                       and r.deposito_id = v_dep and not r.liberada and r.cantidad > r.consumido)
            or coalesce((select disponible from comercial.v_disponible_pt d
                          where d.deposito_id = v_dep and d.producto_id = rr.producto_id), 0) > 0)
  ) then
    raise exception 'El pedido % no tiene nada en stock para mandar.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  update comercial.pedidos set faltantes_nota = btrim(p_nota) where id = p_pedido_id;
  if v_pedido.estado = 'BORRADOR' then
    update comercial.pedidos set estado = 'ESPERANDO_FECHA' where id = p_pedido_id;
  end if;
  if v_pedido.estado <> 'FECHA_PROPUESTA' then
    insert into comercial.propuestas_fecha (pedido_id, fecha_pedido, nota)
    values (p_pedido_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
            format('Sale con faltantes: %s', btrim(p_nota)));
  end if;
  return comercial.aprobar_venta_interna(p_pedido_id, null);
end;
$$;

comment on function comercial.aprobar_venta_con_faltantes(uuid, text) is
  'Ventas aprueba un pedido de venta para mandarlo con lo que hay (2026-11-18): nota obligatoria, toma lo reservado '
  'y lo libre del depósito, y lo que falta no se pide a Producción.';
revoke execute on function comercial.aprobar_venta_con_faltantes(uuid, text) from public, anon;
grant execute on function comercial.aprobar_venta_con_faltantes(uuid, text) to authenticated;

-- ===========================================================================
-- 3. aprobar_venta_interna: con nota de faltantes no crea pedidos de stock
-- ===========================================================================
-- Copia de 20261027140000. Único cambio: si el pedido tiene faltantes_nota,
-- a_producir queda en 0 y no se crea ningún S-xxxx.

create or replace function comercial.aprobar_venta_interna(p_pedido_id uuid, p_de_deposito jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  comercial.pedidos%rowtype;
  v_prop    comercial.propuestas_fecha%rowtype;
  v_dep     uuid;
  r         record;
  v_disp    numeric;
  v_pide    numeric;
  v_toma    numeric;
  v_falta   numeric := 0;
  v_s       uuid;
  v_primero uuid;
  v_numero  text;
  v_numeros text[] := '{}';
  v_usado   jsonb := '{}';
  v_con_faltantes boolean;
begin
  -- Aprueba Ventas; Gerencia de Producción, solo un pedido que reservó entero
  -- (reservar_producto_venta).
  if not (core.es_rol('VENTAS', 'ADMINISTRACION')
          or (core.es_rol('GERENCIA_PRODUCCION')
              and comercial.venta_toda_reservada(p_pedido_id))) then
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
  v_con_faltantes := v_pedido.faltantes_nota is not null;
  select * into v_prop from comercial.propuestas_fecha
   where pedido_id = p_pedido_id order by orden desc limit 1;
  v_dep := comercial.deposito_de_venta(p_pedido_id);

  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  for r in
    select rr.id, rr.producto_id, rr.cantidad, pr.codigo_interno
      from comercial.pedido_renglones rr
      join gmp.productos pr on pr.id = rr.producto_id
     where rr.pedido_id = p_pedido_id and not rr.anulado
     order by rr.id
  loop
    -- Lo reservado para este pedido más lo libre, menos lo que ya tomó un
    -- renglón anterior del mismo producto.
    select coalesce(sum(cantidad - consumido), 0) into v_disp
      from comercial.reservas_pt
     where pedido_id = p_pedido_id and producto_id = r.producto_id and deposito_id = v_dep and not liberada;
    v_disp := v_disp + coalesce((select disponible from comercial.v_disponible_pt
                                  where deposito_id = v_dep and producto_id = r.producto_id), 0)
            - coalesce((v_usado ->> r.producto_id::text)::numeric, 0);
    v_disp := greatest(v_disp, 0);
    v_pide := (select sum((x ->> 'cantidad')::numeric)
                 from jsonb_array_elements(coalesce(p_de_deposito, '[]'::jsonb)) x
                where (x ->> 'producto_id')::uuid = r.producto_id);
    if v_pide is not null and v_pide < 0 then
      raise exception 'La cantidad del depósito de % no puede ser negativa.', r.codigo_interno
        using errcode = 'check_violation';
    end if;
    if v_pide is not null and v_pide > least(r.cantidad, v_disp) then
      raise exception 'De % se piden % del depósito y hay % disponibles para este pedido (pedido: %).',
        r.codigo_interno, trim_scale(v_pide), trim_scale(v_disp), trim_scale(r.cantidad)
        using errcode = 'check_violation';
    end if;
    v_toma := coalesce(v_pide, least(r.cantidad, v_disp));
    v_usado := v_usado || jsonb_build_object(r.producto_id::text,
                 coalesce((v_usado ->> r.producto_id::text)::numeric, 0) + v_toma);
    update comercial.pedido_renglones
       set de_calle5 = v_toma,
           a_producir = case when v_con_faltantes then 0 else r.cantidad - v_toma end
     where id = r.id;
    if not v_con_faltantes then
      v_falta := v_falta + (r.cantidad - v_toma);
    end if;
  end loop;

  insert into comercial.fotos_pedido (pedido_id) values (p_pedido_id);

  update comercial.pedidos
     set estado = 'CONFIRMADO', fecha_entrega = v_prop.fecha_pedido,
         gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    for r in
      select rr.producto_id, sum(rr.a_producir) as a_producir
        from comercial.pedido_renglones rr
        join gmp.productos pr on pr.id = rr.producto_id
       where rr.pedido_id = p_pedido_id and not rr.anulado and rr.a_producir > 0
       group by rr.producto_id, pr.codigo_interno
       order by pr.codigo_interno
    loop
      select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
        into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
      insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock, para_pedido_id)
      values (v_numero, '', v_prop.fecha_pedido,
              format('Lo que falta del pedido de venta %s. Al terminar queda reservado para él.', v_pedido.numero),
              true, p_pedido_id)
      returning id into v_s;
      insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
      values (v_s, r.producto_id, r.a_producir);
      update comercial.pedidos set estado = 'CONFIRMADO' where id = v_s;
      v_primero := coalesce(v_primero, v_s);
      v_numeros := v_numeros || v_numero;
    end loop;
  end if;

  perform comercial.reservar_venta(p_pedido_id);

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_primero,
                            'pedido_stock', nullif(array_to_string(v_numeros, ', '), ''),
                            'pedidos_stock', to_jsonb(v_numeros));
end;
$$;

comment on function comercial.aprobar_venta_interna(uuid, jsonb) is
  'Aprueba un pedido de venta con fecha propuesta (D-pedidos-por-deposito-1): foto, lo reservado y lo libre del depósito '
  'del pedido como tomado, un S-xxxx por producto que falta, y reserva. Ventas, o GP si el pedido está todo reservado. '
  'Con faltantes_nota (2026-11-18) lo que falta no va a Producción.';

-- ===========================================================================
-- 4. Despachado: la observación dice qué salió con menos
-- ===========================================================================
-- Copia de 20261118120000. Único cambio: si algún producto sale con menos de
-- lo pendiente, la observación del despacho lo lista.

create or replace function comercial.despachar_pedido_reservado(p_pedido_id uuid, p_observacion text default null)
returns integer
language plpgsql
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
  if not core.es_rol('VENTAS', 'ADMINISTRACION') then
    raise exception 'Marcar un pedido despachado es de Ventas.' using errcode = 'insufficient_privilege';
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
                     coalesce(nullif(btrim(p_observacion), ''), 'Despachado por Ventas'),
                     'Sale con menos: ' || v_menos);

  -- Un despacho por depósito con reserva: cada producto sale por lo reservado,
  -- sin pasar lo que falta despachar.
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

  -- Lo que no estaba reservado no sale del stock: el pedido se cierra igual.
  if (select entregado_en from comercial.pedidos where id = p_pedido_id) is null then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s despachado por Ventas.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set estado = 'CUMPLIDO', entregado_en = now(), entregado_por = core.usuario_actual()
     where id = p_pedido_id;
  end if;
  return v_n;
end;
$$;

comment on function comercial.despachar_pedido_reservado(uuid, text) is
  'Ventas marca despachado un pedido aprobado (2026-11-18): despacha lo reservado de cada depósito con '
  'despachar_pedido (descuenta stock) y deja el pedido CUMPLIDO con entregado_en. Si algo sale con menos, '
  'la observación del despacho lo lista.';
