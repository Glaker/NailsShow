-- ---------------------------------------------------------------------------
-- Propósito : Tercer paso de la carga de saldo inicial de apertura. Dos
--             operaciones sobre comercial.movimientos_stock:
--             `cargar_apertura_a_stock()` crea el movimiento de entrada por
--             cada lote SALDO_APERTURA de una migración, y
--             `deshacer_apertura()` la revierte por completo anulando cada
--             movimiento que generó.
-- Reglas    : RN-54 (el movimiento no se edita ni se borra; la corrección es
--             un movimiento inverso). §3.3 y §6 de docs/ESPEC_SALDO_INICIAL.md.
-- Fecha     : 2026-09-16
-- ---------------------------------------------------------------------------
--
-- POR QUÉ `deshacer_apertura` NO BORRA (desvío de §6 del documento de origen).
-- Ver el comentario largo en la cabecera de la migración …130000. En síntesis:
-- la invariante 1 de CLAUDE.md y RN-54 prohíben borrar un movimiento de stock,
-- sin excepción para scripts de migración. `comercial.movimientos_stock` no
-- tiene GRANT de DELETE para ningún rol. La reversión «en una sola operación»
-- que pide §6 se cumple con `comercial.anular_movimiento()` (RN-54, ya
-- existente desde la migración …170000) sobre cada movimiento de la carga: el
-- saldo queda en cero, y a diferencia de un DELETE, queda además el rastro de
-- que hubo una carga y de que se deshizo, con quién y cuándo.

create or replace function comercial.cargar_apertura_a_stock(p_migracion_id uuid)
returns setof comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_migracion gmp.migracion_apertura%rowtype;
  v_lote      gmp.lotes_insumo%rowtype;
  v_articulo  uuid;
  v_creados   integer := 0;
begin
  select * into v_migracion from gmp.migracion_apertura where id = p_migracion_id;
  if not found then
    raise exception 'La migración de apertura % no existe.', p_migracion_id;
  end if;

  for v_lote in
    select * from gmp.lotes_insumo
     where migracion_apertura_id = p_migracion_id
       and estado = 'SALDO_APERTURA'
     order by numero_registro_interno
  loop
    -- Sin cantidad no hay movimiento que crear: un renglón «sin cantidad
    -- declarada» (cantidad_no_declarada = true) queda representado por el
    -- lote y su metadato, no por un movimiento de cero — que además
    -- rechazaría movimientos_stock_signo_segun_tipo, movimientos_stock exige
    -- `cantidad <> 0`.
    if coalesce(v_lote.cantidad_unidades, 0) <= 0 then
      continue;
    end if;

    if v_lote.deposito_actual_id is null then
      raise exception
        'El lote de apertura % no tiene depósito asignado.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    -- Idempotente: si este lote ya generó su movimiento (una corrida previa,
    -- parcial o repetida), no se duplica la entrada.
    if exists (
      select 1 from comercial.movimientos_stock
       where lote_insumo_id = v_lote.id and tipo = 'ENTRADA_SALDO_APERTURA'
    ) then
      continue;
    end if;

    v_articulo := comercial.articulo_de_insumo(v_lote.insumo_id);

    return query
      with ins as (
        insert into comercial.movimientos_stock (
          articulo_id, lote_insumo_id, deposito_id, tipo, cantidad,
          motivo, documento_tipo, documento_id
        )
        values (
          v_articulo, v_lote.id, v_lote.deposito_actual_id,
          'ENTRADA_SALDO_APERTURA', v_lote.cantidad_unidades,
          format('Saldo de apertura, corte %s, archivo %s',
                 to_char(v_migracion.fecha_corte, 'DD/MM/YYYY'), v_migracion.archivo_origen),
          'MIGRACION_APERTURA', v_migracion.id
        )
        returning *
      )
      select * from ins;

    v_creados := v_creados + 1;
  end loop;

  if v_creados = 0 then
    raise notice 'La migración de apertura % no generó movimientos nuevos (sin lotes con cantidad, o ya cargada).',
      p_migracion_id;
  end if;
end;
$$;

comment on function comercial.cargar_apertura_a_stock(uuid) is
  'Crea una ENTRADA_SALDO_APERTURA por cada lote SALDO_APERTURA de la migración con cantidad > 0. Idempotente: '
  'un lote que ya tiene su movimiento no se vuelve a cargar. Los renglones sin cantidad declarada quedan solo como lote.';

-- ---------------------------------------------------------------------------
-- Reversión completa de una carga (RN-54: por movimiento inverso, no borrado)
-- ---------------------------------------------------------------------------

create or replace function comercial.deshacer_apertura(p_migracion_id uuid, p_motivo text)
returns setof comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_movimiento comercial.movimientos_stock%rowtype;
  v_inverso    comercial.movimientos_stock%rowtype;
  v_anulados   integer := 0;
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Deshacer una carga de apertura exige motivo escrito (RN-54).'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from gmp.migracion_apertura where id = p_migracion_id) then
    raise exception 'La migración de apertura % no existe.', p_migracion_id;
  end if;

  for v_movimiento in
    select m.*
      from comercial.movimientos_stock m
      join gmp.lotes_insumo l on l.id = m.lote_insumo_id
     where l.migracion_apertura_id = p_migracion_id
       and m.tipo = 'ENTRADA_SALDO_APERTURA'
       and not exists (
             select 1 from comercial.movimientos_stock x
              where x.anula_a_movimiento_id = m.id
           )
     order by m.orden
  loop
    v_inverso := comercial.anular_movimiento(v_movimiento.id, p_motivo);
    v_anulados := v_anulados + 1;
    return next v_inverso;
  end loop;

  if v_anulados = 0 then
    raise notice 'La migración de apertura % no tenía movimientos vigentes para deshacer.', p_migracion_id;
  end if;
end;
$$;

comment on function comercial.deshacer_apertura(uuid, text) is
  'RN-54: revierte una carga de apertura completa anulando (no borrando) cada ENTRADA_SALDO_APERTURA que generó, '
  'vía comercial.anular_movimiento(). El saldo queda en cero con el rastro de la carga y de su reversión intactos.';

grant execute on function comercial.cargar_apertura_a_stock(uuid)     to authenticated;
grant execute on function comercial.deshacer_apertura(uuid, text)     to authenticated;
