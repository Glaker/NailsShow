-- ---------------------------------------------------------------------------
-- Propósito : Planificar la producción por producto y que Gerencia de
--             Producción elija para qué pedido de venta va, o si es para stock.
--               1. Al aprobar una venta, lo que falta va a Producción en un
--                  S-xxxx por producto (antes, uno con todo).
--               2. El destino de un pedido de producción (para_pedido_id) lo
--                  elige GP y lo valida la base: venta aprobada que lleve esos
--                  productos, o nada (stock).
--               3. comercial.crear_produccion: producir N de un producto, para
--                  una venta o para stock, ya planificado.
-- Reglas    : D-ventas-pedidos-17 (pedido del 2026-10-16, diseño aprobado el
--             2026-10-19). RN-50 (auditoría). RN-51 queda igual: la reserva
--             para la venta la sigue haciendo trg_produccion_para_venta al
--             entrar lo producido a Calle 5, con el destino de ese momento.
-- Fecha     : 2026-10-19
-- ---------------------------------------------------------------------------
--
-- La unidad de fabricación sigue siendo el pedido de producción: consumos,
-- «Terminado», lote y reserva no cambian. Lo que cambia es que cada S-xxxx
-- nuevo lleva un solo producto, así que en el Gantt cada barra es un producto.
-- Los S-xxxx viejos con varios productos siguen andando como hasta ahora.

-- ===========================================================================
-- 1. Destino de un pedido de producción
-- ===========================================================================

create function comercial.fn_pedido_destino()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venta comercial.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' and new.para_pedido_id is not distinct from old.para_pedido_id then
    return new;
  end if;
  -- Al crearlo lo fija quien lo crea (enviar_venta, crear_produccion); después
  -- lo cambia solo GP, como el plan (fn_pedido_plan).
  if tg_op = 'UPDATE' and not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'El destino de una producción lo elige Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.para_pedido_id is null then
    -- Pasa a stock: lo que se produzca entra sin reservar.
    if tg_op = 'UPDATE' then
      new.cliente := 'Para stock';
    end if;
    return new;
  end if;

  if not new.para_stock or new.es_venta then
    raise exception 'Solo un pedido de producción va para un pedido de venta.'
      using errcode = 'check_violation';
  end if;
  select * into v_venta from comercial.pedidos where id = new.para_pedido_id;
  if not found or not v_venta.es_venta or v_venta.eliminado_en is not null
     or v_venta.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'La producción va para un pedido de venta aprobado y sin entregar.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and exists (
       select 1 from comercial.pedido_renglones s
        where s.pedido_id = new.id and not s.anulado
          and not exists (select 1 from comercial.pedido_renglones v
                           where v.pedido_id = v_venta.id and not v.anulado
                             and v.producto_id = s.producto_id)) then
    raise exception 'El pedido % no lleva lo que produce %.', v_venta.numero, new.numero
      using errcode = 'check_violation';
  end if;

  -- Lo producido para una venta entra a Calle 5: ahí la reserva
  -- trg_produccion_para_venta (20261001130000).
  new.destino_deposito_id := (select id from gmp.depositos where numero = 'C5');
  new.cliente := format('Para %s — %s', v_venta.numero, v_venta.cliente);
  if tg_op = 'UPDATE' then
    new.fecha_entrega := v_venta.fecha_entrega;
  end if;
  return new;
end;
$$;

comment on function comercial.fn_pedido_destino() is
  'Destino de un pedido de producción (D-ventas-pedidos-17): una venta aprobada que lleve sus productos, o stock. '
  'Lo cambia Gerencia de Producción; la base ajusta el depósito (C5), el rótulo y la entrega.';

-- ponytail: no valida el producto de un renglón que se agregue después a un
-- S-xxxx con destino; hoy solo los crean enviar_venta y crear_produccion.
create trigger trg_pedido_destino
  before insert or update of para_pedido_id on comercial.pedidos
  for each row execute function comercial.fn_pedido_destino();

-- ===========================================================================
-- 2. Aprobar una venta: un S-xxxx por producto que falta
-- ===========================================================================
--
-- Copia de 20261019130100. Cambia solo el final: en vez de un S-xxxx con todo
-- lo que falta, uno por renglón con a_producir > 0. Devuelve los números
-- separados por coma en `pedido_stock` (el front lo muestra tal cual).

create or replace function comercial.enviar_venta(p_pedido_id uuid, p_de_calle5 jsonb default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido  comercial.pedidos%rowtype;
  v_prop    comercial.propuestas_fecha%rowtype;
  r         record;
  v_disp    numeric;
  v_pide    numeric;
  v_toma    numeric;
  v_falta   numeric := 0;
  v_s       uuid;
  v_primero uuid;
  v_numero  text;
  v_numeros text[] := '{}';
begin
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

  insert into comercial.fotos_pedido (pedido_id) values (p_pedido_id);

  update comercial.pedidos
     set estado = 'CONFIRMADO', fecha_entrega = v_prop.fecha_pedido,
         gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  -- NUEVO: un S-xxxx por producto que falta (D-ventas-pedidos-17). Destino,
  -- depósito y rótulo los pone fn_pedido_destino.
  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    for r in
      select rr.producto_id, rr.a_producir
        from comercial.pedido_renglones rr
        join gmp.productos pr on pr.id = rr.producto_id
       where rr.pedido_id = p_pedido_id and not rr.anulado and rr.a_producir > 0
       order by pr.codigo_interno
    loop
      select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
        into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
      insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock, para_pedido_id)
      values (v_numero, '', v_prop.fecha_pedido,
              format('Lo que falta del pedido de venta %s. Al terminar en Calle 5 queda reservado para él.', v_pedido.numero),
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

comment on function comercial.enviar_venta(uuid, jsonb) is
  'Aprueba un pedido de venta con la fecha que propuso Gerencia de Producción: toma la foto del importe pedido, '
  'reserva lo que Ventas arma de Calle 5 y manda lo que falta a Producción, un S-xxxx por producto '
  '(D-ventas-pedidos-17). El sistema no reparte entre clientes.';

-- ===========================================================================
-- 3. Nueva producción desde el Gantt
-- ===========================================================================

create function comercial.crear_produccion(
  p_producto_id    uuid,
  p_cantidad       numeric,
  p_para_pedido_id uuid default null,
  p_inicio         date default null,
  p_dias           integer default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_numero text;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Cargar producción es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a producir tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;
  if (p_inicio is null) <> (p_dias is null) then
    raise exception 'El plan lleva inicio y días, o ninguno de los dos.' using errcode = 'check_violation';
  end if;
  if p_para_pedido_id is not null and not exists (
       select 1 from comercial.pedido_renglones
        where pedido_id = p_para_pedido_id and producto_id = p_producto_id and not anulado) then
    raise exception 'Ese pedido de venta no lleva este producto.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
  select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
    into v_numero from comercial.pedidos where numero ~ '^S-\d+$';

  -- Para stock entra a la fábrica (PTF), como «Producir para stock»; para una
  -- venta, fn_pedido_destino lo manda a Calle 5.
  insert into comercial.pedidos (numero, cliente, observaciones, para_stock, para_pedido_id)
  values (v_numero, 'Para stock', 'Producción cargada desde Planificación.', true, p_para_pedido_id)
  returning id into v_id;
  insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
  values (v_id, p_producto_id, p_cantidad);
  update comercial.pedidos set estado = 'CONFIRMADO' where id = v_id;
  if p_inicio is not null then
    update comercial.pedidos set plan_inicio = p_inicio, plan_dias = p_dias where id = v_id;
  end if;
  return v_id;
end;
$$;

comment on function comercial.crear_produccion(uuid, numeric, uuid, date, integer) is
  'Producir N de un producto, para un pedido de venta o para stock, y opcionalmente ya planificado '
  '(D-ventas-pedidos-17). Crea un S-xxxx de un solo producto.';

revoke execute on function comercial.crear_produccion(uuid, numeric, uuid, date, integer) from public, anon;
grant execute on function comercial.crear_produccion(uuid, numeric, uuid, date, integer) to authenticated;
revoke execute on function comercial.fn_pedido_destino() from public, anon, authenticated;
