-- ---------------------------------------------------------------------------
-- Propósito : Las tandas de OP-2026-0020, 0021 y 0022 descontaron por segunda
--             vez materia prima que la orden ya había consumido con la
--             fórmula. La lista de qué lleva cada unidad
--             (gmp.materiales_acondicionamiento, cargada el 2026-09-23 desde
--             la planilla de costos) repetía ingredientes de la fórmula
--             vigente: comercial.registrar_tanda baja la fórmula con
--             consumir_mp_orden y después vuelve a bajar la lista.
--             Solo en alcohol de cereal 138CL1 fueron 65.363,47 g de más
--             (≈ 81 L): la planta dejó de poder cubrir órdenes con alcohol
--             que en la realidad sobra.
--             1. Se quitan de la lista los 29 materiales que ya están en la
--                fórmula vigente del producto o de un hermano (mismo caso
--                que 20261105140000 con el removedor 120 ml).
--             2. Se anulan los 8 movimientos de la segunda baja.
-- Reglas    : RN-54 (el movimiento no se edita: se anula con su inverso
--             vinculado, comercial.anular_movimiento), RN-50 (queda en
--             core.auditoria), 20260930130000 (quitar = activo false).
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Movimientos anulados (segunda baja, la de la tanda 1):
--   OP-2026-0020  138CL1 −50.507,3107 g · 135AGUA −21.311,57 g
--                 135GLI −700,1229 g    · 135FRA1 −854 g
--   OP-2026-0021  384ESE −24,8 ml
--   OP-2026-0022  138CL1 −14.856,16 g   · 138CL2 −3.616,9155 g · 384ESE −46 ml
-- Las bajas de la fórmula (tanda_numero null) quedan: son las reales.
-- Las filas de comercial.orden_consumos quedan como registro de lo que hizo el
-- sistema; la anulación explica por qué el saldo no las sigue.
--
-- Productos cuya lista pierde materiales: clarificador 100 ml y 1 L,
-- exfoliantes y humectantes (crema a granel), monómero 100/250/500 ml,
-- primer ácido, sanitizante Amor 125 y 200 ml. En todos la fórmula vigente
-- (de él o de un hermano) ya trae ese insumo.
--
-- Pedido del codirector técnico (2026-11-13). Guardas: si no son exactamente
-- 29 filas y 8 movimientos, no se toca nada.

do $$
declare
  v_dt     uuid;
  v_n      integer;
  v_id     uuid;
  v_motivo constant text :=
    'Anulación: la tanda volvió a descontar materia prima que la orden ya había consumido con la fórmula '
    '(la lista de materiales repetía ingredientes de la fórmula vigente). Pedido del codirector técnico, 2026-11-13.';
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com).';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  -- 1. Fuera de la lista lo que ya trae la fórmula.
  update gmp.materiales_acondicionamiento ma
     set activo = false
   where ma.activo
     and exists (select 1
                   from gmp.formulas_fabricacion f
                   join gmp.formula_componentes c on c.formula_id = f.id and not c.anulado
                  where f.estado = 'VIGENTE'
                    and gmp.son_hermanos(f.producto_id, ma.producto_id)
                    and c.insumo_id = ma.insumo_id);
  get diagnostics v_n = row_count;
  if v_n <> 29 then
    raise exception 'Se esperaban 29 materiales repetidos con la fórmula y hay %: revisar antes de aplicar.', v_n;
  end if;

  -- 2. Anular la segunda baja.
  v_n := 0;
  foreach v_id in array array[
    '4625f049-7088-4877-9f41-2175ec07038a',  -- OP-0020 138CL1 −50.507,3107 g
    '09cff68f-db91-411f-abce-801d2f342d86',  -- OP-0020 135AGUA −21.311,57 g
    '7fd599fb-9acc-4bea-a6bf-cb3c888df43a',  -- OP-0020 135GLI −700,1229 g
    'e7d22274-23f0-4343-88a7-3f7a149def11',  -- OP-0020 135FRA1 −854 g
    '6754972b-8a2a-4fec-8482-dcd1e3f7b10e',  -- OP-0021 384ESE −24,8 ml
    '5beb5942-2f2c-4bd6-98d6-305f5d0c633d',  -- OP-0022 138CL1 −14.856,16 g
    '3e547551-81eb-4f34-973e-3cffde82de06',  -- OP-0022 138CL2 −3.616,9155 g
    '46ffa796-15bc-41cb-ba52-5af2e16ca2cd'   -- OP-0022 384ESE −46 ml
  ]::uuid[]
  loop
    -- Tiene que ser la baja de una tanda cuyo insumo la orden ya consumió con la fórmula.
    if not exists (
      select 1
        from comercial.movimientos_stock m
        join comercial.orden_consumos t on t.id = m.documento_id and t.tanda_numero is not null
        join comercial.orden_consumos mp on mp.orden_id = t.orden_id and mp.insumo_id = t.insumo_id
                                        and mp.tanda_numero is null
       where m.id = v_id and m.tipo = 'SALIDA_CONSUMO_PRODUCCION'
    ) then
      raise exception 'El movimiento % no es una baja repetida de tanda.', v_id;
    end if;
    perform comercial.anular_movimiento(v_id, v_motivo);
    v_n := v_n + 1;
  end loop;
  if v_n <> 8 then
    raise exception 'Se esperaban 8 anulaciones y hubo %.', v_n;
  end if;
end;
$$;
