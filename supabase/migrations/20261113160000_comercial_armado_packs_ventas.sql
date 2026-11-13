-- ---------------------------------------------------------------------------
-- Propósito : Que también armen packs (DUO01) Matías Alonso y Agustina Sierra.
--             Los dos tienen el rol VENTAS, y al 2026-11-13 son los únicos
--             activos con ese rol. Se agrega VENTAS a la función y a la
--             política de alta del armado.
-- Reglas    : D-armado-duo-1, RN-50.
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico (2026-11-13). VENTAS ya puede registrar
-- ajustes de producto terminado (movimientos_pt_insert_stock), que es lo
-- que hace el armado. La función es la de 20261113140000 y solo cambia el
-- chequeo de rol.

drop policy armados_pack_insert_gp on comercial.armados_pack;
create policy armados_pack_insert_gp_ventas on comercial.armados_pack
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'VENTAS') and registrado_por = core.usuario_actual());
comment on policy armados_pack_insert_gp_ventas on comercial.armados_pack is
  'D-armado-duo-1: arman Gerencia de Producción y Ventas, a su nombre. Sin UPDATE ni DELETE.';

create or replace function comercial.armar_pack(p_pack_id uuid, p_deposito_id uuid, p_cantidad integer,
                                     p_observaciones text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_pack   text;
  v_motivo text;
  v_hay    numeric;
  c        record;
  a        record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Los packs los arman Gerencia de Producción y Ventas.' using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Cargá cuántos packs se armaron.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pack_componentes where pack_id = p_pack_id) then
    raise exception 'Ese producto no tiene componentes de pack cargados.' using errcode = 'check_violation';
  end if;

  select codigo_interno || ' ' || nombre into v_pack from gmp.productos where id = p_pack_id;

  insert into comercial.armados_pack (pack_id, deposito_id, cantidad, observaciones)
  values (p_pack_id, p_deposito_id, p_cantidad, nullif(btrim(coalesce(p_observaciones, '')), ''))
  returning id into v_id;
  v_motivo := format('Armado de %s × %s', p_cantidad, v_pack);

  -- Los lotes los elige esta función (solo vendibles, RN-51): el trigger de
  -- lote no reparte de nuevo.
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for c in select pc.componente_id, pc.cantidad, p.codigo_interno || ' ' || p.nombre as nombre
             from comercial.pack_componentes pc
             join gmp.productos p on p.id = pc.componente_id
            where pc.pack_id = p_pack_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('pt|' || p_deposito_id::text || '|' || c.componente_id::text, 0));
    select coalesce(sum(m.cantidad), 0) into v_hay
      from comercial.movimientos_pt m
     where m.producto_id = c.componente_id and m.deposito_id = p_deposito_id;
    if v_hay < c.cantidad * p_cantidad then
      raise exception 'Falta %: hay % en este depósito y el armado necesita %.',
        c.nombre, trim_scale(greatest(v_hay, 0)), c.cantidad * p_cantidad
        using errcode = 'check_violation';
    end if;
    for a in select * from comercial.asignar_lotes_pt(c.componente_id, p_deposito_id, c.cantidad * p_cantidad, true)
    loop
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
      values
        (c.componente_id, p_deposito_id, 'SALIDA_AJUSTE', -a.cantidad, v_motivo, 'ARMADO', v_id, a.orden_id);
    end loop;
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);

  insert into comercial.movimientos_pt
    (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
  values
    (p_pack_id, p_deposito_id, 'ENTRADA_AJUSTE', p_cantidad, v_motivo, 'ARMADO', v_id);

  return v_id;
end;
$$;
