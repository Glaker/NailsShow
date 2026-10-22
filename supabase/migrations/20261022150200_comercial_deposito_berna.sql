-- ---------------------------------------------------------------------------
-- Propósito : Tercer depósito de producto terminado, Berna, junto a la fábrica
--             (PTF) y Calle 5 (C5). Se cuenta y registra entradas y salidas
--             sueltas («Contar», «Entró», «Salió»), y se transfiere en
--             cualquier sentido entre los tres. Los pedidos se siguen
--             despachando desde C5 o PTF.
-- Reglas    : RN-51 (fuera de la fábrica va solo lo liberado), invariante 8 /
--             RN-54 (la transferencia es un par de movimientos, no una
--             edición). Pedido del 2026-10-22 (D-stock-pt-orden-2).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- ponytail: el control de fn_movimiento_pt_lote sobre lotes sin liberar que
-- entran sueltos mira solo C5. A BER no entra un lote retenido por pantalla
-- (las entradas a mano no llevan orden_id y la transferencia toma solo lo
-- despachable); extenderlo si se abre otra vía.

insert into gmp.depositos (numero, nombre, tipo_contenido, es_exterior)
values ('BER', 'Berna', 'PT_NACIONAL', false)
on conflict (numero) do nothing;

-- Copia de la vigente (20260930160000) con BER. Lo que sale de la fábrica a
-- un local toma solo lo despachable, como antes a Calle 5.
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
  select id into v_origen  from gmp.depositos where numero = p_origen  and numero in ('C5', 'PTF', 'BER') and activo;
  select id into v_destino from gmp.depositos where numero = p_destino and numero in ('C5', 'PTF', 'BER') and activo;
  if v_origen is null or v_destino is null or v_origen = v_destino then
    raise exception 'Se transfiere entre la fábrica (PTF), Calle 5 (C5) y Berna (BER).' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pt|' || v_origen::text || '|' || p_producto_id::text, 0));
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for a in select * from comercial.asignar_lotes_pt(p_producto_id, v_origen, p_cantidad, p_destino <> 'PTF') loop
    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, orden_id)
    values (p_producto_id, v_origen,  'TRANSFERENCIA_ENTRE_DEPOSITOS', -a.cantidad,
            coalesce(nullif(btrim(p_motivo), ''), format('Envío a %s', p_destino)), 'TRANSFERENCIA_PT', a.orden_id),
           (p_producto_id, v_destino, 'TRANSFERENCIA_ENTRE_DEPOSITOS',  a.cantidad,
            coalesce(nullif(btrim(p_motivo), ''), format('Llegada desde %s', p_origen)), 'TRANSFERENCIA_PT', a.orden_id);
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
end;
$$;
