-- ---------------------------------------------------------------------------
-- Propósito : Llevar a cero el stock de insumos cargado hasta hoy (saldo de
--             apertura del 2026-09-23 y sus ajustes provisorios), para cargar
--             las existencias de nuevo. El catálogo, los artículos y los lotes
--             no se tocan: sólo las cantidades.
--             De paso, corrige comercial.anular_movimiento(), que no
--             andaba con ningún movimiento (ver 1).
-- Reglas    : RN-54 (el movimiento no se edita ni se borra: se anula con su
--             inverso), RN-50 (auditoría), invariantes 1 y 8 de CLAUDE.md.
--             Cierra el saldo estimado de D-26.
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- POR QUÉ ANULAR Y NO BORRAR.
-- comercial.movimientos_stock no admite DELETE (trigger y sin GRANT). Cada
-- movimiento vigente se anula con comercial.anular_movimiento(), que inserta
-- el opuesto exacto con anula_a_movimiento_id. En el kardex queda lo que había,
-- la anulación y su motivo; el saldo de cada lote queda en cero.
--
-- Se anula de atrás para adelante (orden descendente): la salida de ajuste de
-- la esencia en g se revierte antes que la entrada de apertura que la
-- precedía, así ningún saldo pasa por negativo.
--
-- A nombre de Administración, por decisión del usuario (2026-10-20).
--
-- Las salidas que llevan un lote a cero quedan marcadas «requiere
-- investigación» por comercial.fn_marcar_investigacion(). Se dejan así a
-- propósito: el control no se toca para esta carga.
--
-- Los conteos provisorios de comercial.conteos_inventario quedan como
-- historia; el próximo conteo parte de saldo cero.

-- ===========================================================================
-- 1. comercial.anular_movimiento() con motivo_tipo
-- ===========================================================================
--
-- El inverso de una entrada o de una salida es siempre un ajuste, y desde
-- 20260917100000 la restricción movimientos_motivo_tipo_en_manuales exige
-- motivo_tipo en los ajustes. La función no lo completaba, así que toda
-- anulación fallaba (también comercial.deshacer_apertura(), que la usa).
-- Anular es declarar que el original no debió registrarse: ERROR_DE_REGISTRO.
-- Ese motivo marca siempre «requiere investigación», y está bien que así sea.

create or replace function comercial.anular_movimiento(
  p_movimiento_id uuid,
  p_motivo        text
)
returns comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_original comercial.movimientos_stock%rowtype;
  v_inverso  comercial.movimientos_stock%rowtype;
  v_tipo     comercial.tipo_movimiento_enum;
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'La anulación de un movimiento exige motivo escrito (RN-54).'
      using errcode = 'check_violation';
  end if;

  select * into v_original from comercial.movimientos_stock where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe.', p_movimiento_id;
  end if;

  if exists (select 1 from comercial.movimientos_stock
              where anula_a_movimiento_id = p_movimiento_id) then
    raise exception 'Ese movimiento ya fue anulado.'
      using errcode = 'check_violation';
  end if;

  -- El inverso tiene que ser de un tipo cuyo signo admita la cantidad opuesta,
  -- porque movimientos_stock_signo_segun_tipo no hace excepciones con las
  -- anulaciones. Una entrada se anula con un ajuste de salida y viceversa; una
  -- transferencia se anula con una transferencia, que admite los dos signos.
  v_tipo := case
              when v_original.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS'
                then 'TRANSFERENCIA_ENTRE_DEPOSITOS'
              when v_original.cantidad > 0 then 'SALIDA_AJUSTE'
              else 'ENTRADA_AJUSTE'
            end::comercial.tipo_movimiento_enum;

  insert into comercial.movimientos_stock (
    articulo_id, lote_insumo_id, deposito_id, tipo, cantidad,
    motivo, motivo_tipo, documento_tipo, documento_id, transferencia_id, anula_a_movimiento_id
  )
  values (
    v_original.articulo_id, v_original.lote_insumo_id, v_original.deposito_id,
    v_tipo, -v_original.cantidad,
    p_motivo,
    case when v_tipo <> 'TRANSFERENCIA_ENTRE_DEPOSITOS'
         then 'ERROR_DE_REGISTRO'::comercial.motivo_ajuste_enum end,
    v_original.documento_tipo, v_original.documento_id,
    case when v_original.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS'
         then v_original.transferencia_id end,
    v_original.id
  )
  returning * into v_inverso;

  return v_inverso;
end;
$$;

-- ===========================================================================
-- 2. Datos: anular todo el stock vigente
-- ===========================================================================

do $$
declare
  v_adm      uuid;
  v_mov      comercial.movimientos_stock%rowtype;
  v_anulados integer := 0;
begin
  select id into v_adm
    from core.usuarios
   where email = 'nailshowargentina@hotmail.com' and rol = 'ADMINISTRACION' and activo;
  if v_adm is null then
    raise exception 'No está activa la cuenta de Administración (nailshowargentina@hotmail.com), a cuyo nombre va la anulación.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_adm::text, 'rol', 'ADMINISTRACION',
                      'roles', json_build_array('ADMINISTRACION'))::text,
    true
  );

  for v_mov in
    select m.*
      from comercial.movimientos_stock m
     where m.anula_a_movimiento_id is null
       and not exists (
             select 1 from comercial.movimientos_stock x
              where x.anula_a_movimiento_id = m.id
           )
     order by m.orden desc
  loop
    perform comercial.anular_movimiento(
      v_mov.id,
      'Stock viejo dado de baja para recargar las existencias desde cero (2026-10-20). '
      'El saldo de apertura era una estimación (D-26).'
    );
    v_anulados := v_anulados + 1;
  end loop;

  if exists (select 1 from comercial.v_saldos_stock where saldo <> 0) then
    raise exception 'Quedaron saldos distintos de cero después de anular % movimientos.', v_anulados;
  end if;

  raise notice 'Anulados % movimientos de stock; todos los saldos en cero.', v_anulados;
end;
$$;
