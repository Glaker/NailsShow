-- ---------------------------------------------------------------------------
-- Propósito : Correcciones de 20260929110000 encontradas al probarla, antes de
--             aplicarla: (1) el control de reservas leía un campo que el
--             registro de la otra tabla no tiene; (2) en «Terminado», la
--             variable del bucle de producción chocaba de nombre con el alias
--             de la consulta de consumos; (3) la encargada de stock no podía
--             despachar: SELECT … FOR UPDATE y la marca de entrega exigen
--             política de UPDATE sobre comercial.pedidos, y no la tenía;
--             (4) al cerrar un despacho completo se actualizaba su cabecera,
--             sin permiso de UPDATE; (5) el control de reservas se disparaba
--             también al consumirlas, con el mensaje de «reservar».
-- Reglas    : las mismas de 20260929110000 (ítems 19 a 22 de la cola).
--             Invariante de CLAUDE.md §6: no se edita una migración escrita;
--             se corrige con otra.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Reservas que alcanzan: IF anidados, cada tabla con sus campos
-- ===========================================================================

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
    if not (new.cantidad < 0 and new.tipo in ('SALIDA_VENTA', 'TRANSFERENCIA_ENTRE_DEPOSITOS')) then
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

-- Consumir una reserva nunca aumenta lo reservado: el control va solo al
-- reservar.
drop trigger trg_reservas_pt_alcanzan on comercial.reservas_pt;
create constraint trigger trg_reservas_pt_alcanzan
  after insert on comercial.reservas_pt
  deferrable initially deferred
  for each row execute function comercial.fn_reservas_pt_alcanzan();

-- ===========================================================================
-- 2. La encargada de stock marca la entrega de un pedido despachado, y nada más
-- ===========================================================================

create policy pedidos_actualiza_entrega on comercial.pedidos
  for update to authenticated
  using (core.es_rol('ENCARGADA_STOCK', 'GERENCIA'))
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA'));
comment on policy pedidos_actualiza_entrega on comercial.pedidos is
  'Quien despacha (ítem 21) cierra el pedido al entregarlo completo. El trigger trg_pedido_entrega_solo limita el '
  'cambio a la marca de entrega de un pedido sin pendientes.';

create or replace function comercial.fn_pedido_entrega_solo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Quien tiene la política general de pedidos no pasa por acá.
  if core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA') then
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

create trigger trg_pedido_entrega_solo
  before update on comercial.pedidos
  for each row execute function comercial.fn_pedido_entrega_solo();

-- ===========================================================================
-- 3. «Terminado»: la variable del bucle de producción se llama ep
-- ===========================================================================

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(
  p_pedido_id  uuid,
  p_consumos   jsonb DEFAULT '[]'::jsonb,
  p_produccion jsonb DEFAULT NULL
)
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
  ep          record;
  v_dep       uuid;
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

  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260929110000: cuánto se produjo y adónde va.
  if v_pedido.tercero_id is null then
    perform set_config('comercial.terminando_pedido', p_pedido_id::text, true);

    if p_produccion is null or jsonb_array_length(p_produccion) = 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      select rr.producto_id,
             coalesce(v_pedido.destino_deposito_id, (select id from gmp.depositos where numero = 'PTF')),
             'ENTRADA_PRODUCCION',
             sum(rr.cantidad),
             format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
             'PEDIDO',
             p_pedido_id
        from comercial.pedido_renglones rr
       where rr.pedido_id = p_pedido_id and not rr.anulado
       group by rr.producto_id;
    else
      for ep in
        select (x ->> 'producto_id')::uuid                    as producto_id,
               (x ->> 'cantidad')::numeric                    as cantidad,
               coalesce(nullif(x ->> 'deposito', ''), 'PTF')  as deposito
          from jsonb_array_elements(p_produccion) x
      loop
        if ep.cantidad is null or ep.cantidad < 0 then
          raise exception 'La cantidad producida no es válida.' using errcode = 'check_violation';
        end if;
        continue when ep.cantidad = 0;
        select id into v_dep from gmp.depositos where numero = ep.deposito and numero in ('PTF', 'C5') and activo;
        if v_dep is null then
          raise exception 'Lo producido va a la fábrica (PTF) o a Calle 5 (C5).' using errcode = 'check_violation';
        end if;
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values (ep.producto_id, v_dep, 'ENTRADA_PRODUCCION', ep.cantidad,
                format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
      end loop;
    end if;

    -- Lo producido para un cliente que va a Calle 5 queda reservado para su
    -- pedido, hasta lo pedido: si no, se lo puede llevar otro.
    if not v_pedido.para_stock then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
      select m.producto_id, m.deposito_id, p_pedido_id,
             least(sum(m.cantidad), (select sum(rr.cantidad) from comercial.pedido_renglones rr
                                      where rr.pedido_id = p_pedido_id and rr.producto_id = m.producto_id and not rr.anulado)),
             format('Producido para el pedido %s', v_pedido.numero)
        from comercial.movimientos_pt m
        join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
       where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'ENTRADA_PRODUCCION'
       group by m.producto_id, m.deposito_id;
    end if;

    perform set_config('comercial.terminando_pedido', '', true);
  end if;
end;
$function$;

-- ===========================================================================
-- 4. Despacho: la marca «con faltantes» se calcula antes de la cabecera (no
--    hace falta UPDATE sobre despachos_pt) y no se tocan reservas agotadas
-- ===========================================================================

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
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION') then
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

  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('C5', 'PTF') and activo;
  if v_dep is null then
    raise exception 'Se despacha desde Calle 5 (C5) o desde la fábrica (PTF).' using errcode = 'check_violation';
  end if;

  -- Lo que va a quedar pendiente, antes de escribir la cabecera.
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

    -- Primero lo reservado para este pedido, después lo del cliente.
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
