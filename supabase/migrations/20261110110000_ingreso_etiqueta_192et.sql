-- ---------------------------------------------------------------------------
-- Propósito : Ingreso de 3000 etiquetas 192ET (removedor 120 ml) que llegaron
--             a planta: se suman al saldo (quedaban 500 después de la tanda
--             de OP-2026-0005).
-- Reglas    : RN-50, RN-54, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- Mismo mecanismo que 20261106140000: comercial.registrar_conteo con «saldo
-- actual + 3000» sobre el lote de saldo de apertura, a nombre de la DT
-- suplente. Pedido del codirector técnico del 2026-11-10.

do $$
declare
  v_dt     uuid;
  v_insumo uuid;
  v_saldo  numeric(16,4);
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  select id into v_insumo
    from gmp.insumos_catalogo
   where codigo_interno = '192ET' and tipo = 'ETIQUETA' and unidad_medida = 'UNIDAD';
  if v_insumo is null then
    raise exception 'No existe la etiqueta 192ET en UNIDAD.';
  end if;

  select coalesce(sum(s.saldo), 0) into v_saldo
    from comercial.v_saldos_stock s
   where s.articulo_id = comercial.articulo_de_insumo(v_insumo);
  perform comercial.registrar_conteo(
    v_insumo, v_saldo + 3000,
    'Ingreso de 3000 etiquetas 192ET (se suman al saldo), 2026-11-10', false);
end;
$$;
