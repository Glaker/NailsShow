-- ---------------------------------------------------------------------------
-- Propósito : Envío idempotente del pedido del portal: si la respuesta se
--             pierde y el navegador reintenta con la misma clave, no se
--             duplica el pedido. Columna `clave_cliente`, índice único parcial
--             y la función `cliente_enviar_pedido_unico`, un envoltorio de
--             `cliente_enviar_pedido` (que no se toca).
-- Reglas    : P6 (Hada), RN-50, D-hada-4. No cambia ninguna regla del pedido.
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------

alter table comercial.pedidos add column clave_cliente uuid;

comment on column comercial.pedidos.clave_cliente is
  'P6: clave de idempotencia que genera el portal por cada pedido armado. Con la misma clave el envío devuelve el pedido ya creado. Null = no vino del portal o vino sin clave.';

-- Un reintento del mismo cliente con la misma clave es el mismo pedido; la
-- misma clave en otro cliente es independiente.
create unique index pedidos_cliente_clave_uq
  on comercial.pedidos (cliente_id, clave_cliente)
  where clave_cliente is not null;

-- Solo el portal escribe la clave. `authenticated` tiene INSERT/UPDATE de tabla
-- entera en pedidos: sin esto Ventas podría fijar o anular una clave y romper
-- la idempotencia. `cliente_enviar_pedido` marca la transacción
-- (comercial.portal_cliente = 1); `cliente_enviar_pedido_unico` pasa por ahí.
create function comercial.fn_pedidos_clave_cliente_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clave_cliente is distinct from (case when tg_op = 'UPDATE' then old.clave_cliente end)
     and coalesce(current_setting('comercial.portal_cliente', true), '') <> '1' then
    raise exception 'La clave del cliente solo la fija el portal.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_pedidos_clave_cliente_guarda
  before insert or update on comercial.pedidos
  for each row execute function comercial.fn_pedidos_clave_cliente_guarda();

-- Intencional (diseño §1.3): la misma clave devuelve el pedido aunque ese pedido
-- esté hoy cancelado o borrado; un reintento no crea un segundo pedido.

-- Toma el mismo lock que `cliente_enviar_pedido` (advisory de transacción:
-- reentrante dentro de la misma sesión) para que dos reintentos simultáneos con
-- la misma clave se serialicen y el segundo vea el pedido del primero.
create function comercial.cliente_enviar_pedido_unico(
  p_clave         uuid,
  p_renglones     jsonb,
  p_observaciones text default null,
  p_cajas         jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := comercial.cliente_exigir();
  v_id      uuid;
begin
  if p_clave is null then
    raise exception 'Falta la clave del envío.' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('comercial.numero_venta'));

  select id into v_id from comercial.pedidos
   where cliente_id = v_cliente and clave_cliente = p_clave;
  if found then
    return v_id;
  end if;

  v_id := comercial.cliente_enviar_pedido(null, p_renglones, p_observaciones, p_cajas);
  -- `cliente_enviar_pedido` dejó marcada la transacción (comercial.portal_cliente)
  -- y el pedido sigue en BORRADOR: este UPDATE pasa los triggers de pedidos.
  update comercial.pedidos set clave_cliente = p_clave where id = v_id;
  return v_id;
end;
$$;

comment on function comercial.cliente_enviar_pedido_unico(uuid, jsonb, text, jsonb) is
  'Portal de clientes (P6): envía un pedido nuevo una sola vez por clave. Mismos argumentos que cliente_enviar_pedido más la clave; solo crea (no corrige).';

revoke execute on function comercial.cliente_enviar_pedido_unico(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function comercial.cliente_enviar_pedido_unico(uuid, jsonb, text, jsonb) to authenticated;
