-- ---------------------------------------------------------------------------
-- Propósito : «Corregir presentación» ya no exige que el reparto sume lo que
--             hay: pueden haber salido unidades de más (o de menos). La
--             diferencia entra o sale del mismo lote, con el motivo (p. ej. un
--             conteo), y no queda aparte como «sin lote».
-- Reglas    : D-hermanos-1 (pedido del 2026-10-29), RN-54 / invariante 8 (se
--             corrige con ajustes con motivo, no editando), RN-51 (lo que entra
--             a un lote sigue su liberación).
-- Fecha     : 2026-10-29
-- ---------------------------------------------------------------------------
--
-- Copia de 20261028170000 sin el control de que el total no cambie (marcado
-- NUEVO). Misma firma.

create or replace function comercial.repartir_stock_hermanos(
  p_deposito text,
  p_orden_id uuid,
  p_reparto  jsonb,
  p_motivo   text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_dep      uuid;
  v_base     uuid;
  v_antes    integer;
  v_despues  integer;
  v_motivo   text;
  d          record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'El reparto entre hermanos lo corrige Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí por qué se corrige el reparto.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_reparto) is distinct from 'array' or jsonb_array_length(p_reparto) = 0 then
    raise exception 'El reparto necesita al menos un producto.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_reparto) x where (x ->> 'unidades')::integer < 0) then
    raise exception 'Las unidades de cada hermano no pueden ser negativas.' using errcode = 'check_violation';
  end if;
  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('PTF', 'C5', 'BER') and activo;
  if v_dep is null then
    raise exception 'Se corrige en la fábrica (PTF), Calle 5 (C5) o Berna (BER).' using errcode = 'check_violation';
  end if;

  if p_orden_id is not null then
    select * into v_orden from gmp.ordenes_produccion where id = p_orden_id;
    if not found then
      raise exception 'La orden no existe.' using errcode = 'check_violation';
    end if;
    if v_orden.estado not in ('TERMINADA', 'LIBERADA') then
      raise exception 'La orden % está %: se reparte lo que entró de una orden terminada.', v_orden.numero,
        lower(v_orden.estado::text) using errcode = 'check_violation';
    end if;
    v_base := v_orden.producto_id;
  else
    v_base := (p_reparto -> 0 ->> 'producto_id')::uuid;
  end if;
  if exists (select 1 from jsonb_array_elements(p_reparto) x
              where not gmp.son_hermanos(v_base, (x ->> 'producto_id')::uuid)) then
    raise exception 'Hay un producto que no es hermano de los demás.' using errcode = 'check_violation';
  end if;

  -- El mismo cerrojo que las salidas que reparten lotes, por cada hermano y
  -- en orden fijo para no trabarse con otra corrección.
  perform pg_advisory_xact_lock(hashtextextended('pt|' || v_dep::text || '|' || p.id::text, 0))
     from gmp.productos p where gmp.son_hermanos(v_base, p.id) order by p.id;

  -- NUEVO en 20261029120000: el total puede cambiar (salieron de más o de
  -- menos); la diferencia queda en el mismo lote y se anota en el motivo.
  select coalesce(sum(cantidad), 0) into v_antes
    from comercial.movimientos_pt
   where deposito_id = v_dep and orden_id is not distinct from p_orden_id and gmp.son_hermanos(v_base, producto_id);
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_despues from jsonb_array_elements(p_reparto) x;

  v_motivo := format('Reparto entre hermanos %s%s: %s',
                     case when p_orden_id is null then 'sin lote' else 'del lote ' || v_orden.numero_lote end,
                     case when v_despues = v_antes then ''
                          else format(' (había %s, quedan %s)', v_antes, v_despues) end,
                     btrim(p_motivo));
  -- El lote ya está elegido (o no hay): que fn_movimiento_pt_lote no lo reparta.
  perform set_config('comercial.lote_pt_asignado', '1', true);
  -- Primero las salidas, después las entradas: el saldo nunca queda negativo.
  for d in
    with actual as (
      select producto_id, sum(cantidad)::integer as hay
        from comercial.movimientos_pt
       where deposito_id = v_dep and orden_id is not distinct from p_orden_id
         and gmp.son_hermanos(v_base, producto_id)
       group by producto_id
    ), nuevo as (
      select (x ->> 'producto_id')::uuid as producto_id, sum((x ->> 'unidades')::integer) as va
        from jsonb_array_elements(p_reparto) x group by 1
    )
    select coalesce(a.producto_id, n.producto_id) as producto_id,
           coalesce(n.va, 0) - coalesce(a.hay, 0) as dif
      from actual a full join nuevo n on n.producto_id = a.producto_id
     where coalesce(n.va, 0) <> coalesce(a.hay, 0)
     order by 2
  loop
    insert into comercial.movimientos_pt
      (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
    values
      (d.producto_id, v_dep, case when d.dif < 0 then 'SALIDA_AJUSTE' else 'ENTRADA_AJUSTE' end::comercial.tipo_movimiento_enum,
       d.dif, v_motivo, case when p_orden_id is null then null else 'ORDEN' end, p_orden_id, p_orden_id);
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
end;
$$;
comment on function comercial.repartir_stock_hermanos(text, uuid, jsonb, text) is
  'Corrige cuántas de cada hermano hay en un lote (o en lo sin lote) de un depósito, con ajustes y su motivo '
  '(D-hermanos-1, RN-54). El total puede cambiar; la diferencia queda en el mismo lote.';
