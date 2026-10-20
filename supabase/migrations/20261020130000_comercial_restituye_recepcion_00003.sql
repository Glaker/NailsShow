-- ---------------------------------------------------------------------------
-- Propósito : Restituir al stock la Recepción 00003/2026 (5 L de «Primer sin
--             ácido», PSA-0001), anulada por error en 20261020120000.
-- Reglas    : RN-54 (no se anula una anulación: se corrige con un ajuste con
--             motivo), RN-50 (auditoría), invariante 8 de CLAUDE.md.
-- Fecha     : 2026-10-20
-- ---------------------------------------------------------------------------
--
-- QUÉ PASÓ.
-- 20261020120000 tenía que llevar a cero el stock viejo (saldo de apertura del
-- 2026-09-23 y sus ajustes). Anuló todo movimiento vigente al momento de
-- aplicarse, y entre la prueba y la aplicación entró una recepción real de
-- Gerencia de Producción (2026-10-20 16:17). Esa entrada no era stock viejo.
--
-- CÓMO SE CORRIGE.
-- La anulación queda en el kardex. comercial.fn_validar_movimiento() no deja
-- anular una anulación, así que se registra un ajuste de entrada por la misma
-- cantidad sobre la misma posición, que apunta a la recepción como documento.
-- Busca el movimiento por su id y verifica que siga anulado y en cero: si algo
-- cambió, no hace nada y avisa.

do $$
declare
  v_adm      uuid;
  v_original comercial.movimientos_stock%rowtype;
  v_saldo    numeric;
begin
  select id into v_adm
    from core.usuarios
   where email = 'nailshowargentina@hotmail.com' and rol = 'ADMINISTRACION' and activo;
  if v_adm is null then
    raise exception 'No está activa la cuenta de Administración (nailshowargentina@hotmail.com).';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_adm::text, 'rol', 'ADMINISTRACION',
                      'roles', json_build_array('ADMINISTRACION'))::text,
    true
  );

  select * into v_original
    from comercial.movimientos_stock
   where id = '9fff0146-bb09-4686-bade-3f46cb747436'
     and tipo = 'ENTRADA_COMPRA'
     and documento_tipo = 'RECEPCION';
  if not found then
    raise exception 'No está la entrada de la Recepción 00003/2026 que se iba a restituir.';
  end if;

  if not exists (
    select 1 from comercial.movimientos_stock
     where anula_a_movimiento_id = v_original.id
       and motivo like 'Stock viejo dado de baja%'
  ) then
    raise exception 'La entrada de la Recepción 00003/2026 no fue anulada por 20261020120000: no hay nada que restituir.';
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = v_original.articulo_id
     and lote_insumo_id = v_original.lote_insumo_id
     and deposito_id    = v_original.deposito_id;
  if v_saldo <> 0 then
    raise exception 'El lote de la Recepción 00003/2026 ya tiene saldo % : alguien lo corrigió, no se restituye dos veces.', v_saldo;
  end if;

  insert into comercial.movimientos_stock
    (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
     documento_tipo, documento_id)
  values
    (v_original.articulo_id, v_original.lote_insumo_id, v_original.deposito_id,
     'ENTRADA_AJUSTE', v_original.cantidad,
     'Restituye la Recepción 00003/2026, anulada por error al dar de baja el stock viejo '
     '(20261020120000): era una entrada real del mismo día, no stock viejo.',
     'ERROR_DE_REGISTRO', v_original.documento_tipo, v_original.documento_id);
end;
$$;
