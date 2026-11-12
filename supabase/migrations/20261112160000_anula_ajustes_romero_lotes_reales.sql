-- ---------------------------------------------------------------------------
-- Propósito : Anular los cuatro ajustes de la carga 20261112140000 (planilla
--             «INSUMOS ROMERO 12-11») que descontaron de lotes reales —con
--             recepción o fabricados en planta— stock que la planilla del
--             sistema viejo no conocía.
-- Reglas    : RN-54 (el movimiento no se edita ni se borra: se anula con su
--             inverso vinculado, comercial.anular_movimiento), RN-50.
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- QUÉ PASÓ. La planilla sale del panel de stock del sistema viejo, que no ve
-- las recepciones cargadas acá ni lo fabricado en planta. Al llevar cada
-- insumo a lo que decía la planilla, registrar_conteo bajó la diferencia de
-- los lotes con saldo:
--   192REM   removedor granel, RI-00028/2026 (recepción 00018 del 04/11):
--            −211.492,3 ml. Dejó la orden del removedor 120 ml sin granel.
--   372CREMA lote en cuarentena: −104.000 g.
--   371CREMA lote aprobado: −11.400 g.
--   101ESE   lote con recepción: −12 ml.
-- Los cuatro vuelven a su saldo anterior. Los demás descuentos de la carga
-- son sobre lotes de saldo de apertura y quedan.
--
-- Los conteos de comercial.conteos_inventario quedan como están: son el
-- registro de lo que decía la planilla. Esta anulación explica por qué el
-- saldo no lo sigue.
--
-- A NOMBRE DE QUIÉN. Del codirector técnico (DT suplente), como la carga.

do $$
declare
  v_dt     uuid;
  v_motivo constant text :=
    'Anulación: la planilla «INSUMOS ROMERO 12-11» (sistema viejo) no conocía este lote '
    '(recepción o fabricación registrada acá); el conteo le descontó stock real. Pedido del codirector técnico, 2026-11-12.';
  v_id     uuid;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va la anulación.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  foreach v_id in array array[
    '31426140-af70-4297-8784-900540efb840',  -- 192REM   −211.492,3 ml
    '929caad2-8958-4aad-8bc3-e16ed678de08',  -- 372CREMA −104.000 g
    'f70efa50-986a-4ae3-b7de-52d7f9c9adaa',  -- 371CREMA −11.400 g
    'de6ee88b-b490-4456-b1ea-4a0d80fb65fa'   -- 101ESE   −12 ml
  ]::uuid[]
  loop
    if not exists (
      select 1 from comercial.movimientos_stock
       where id = v_id and motivo like '%INSUMOS ROMERO 12-11%' and tipo = 'SALIDA_AJUSTE'
    ) then
      raise exception 'El movimiento % no es un ajuste de la carga Romero 12-11.', v_id;
    end if;
    perform comercial.anular_movimiento(v_id, v_motivo);
  end loop;
end;
$$;
