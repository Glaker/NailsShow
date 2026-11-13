-- ---------------------------------------------------------------------------
-- Propósito : Dar de baja el insumo 135SAN «ALCOHOL PARA SANITIZANTE» y pasar
--             a 138CL1 «ALCOHOL DE CEREAL (cleanser)» las fórmulas en
--             borrador que todavía lo usan (TP-00006, TP-00011, TP-00015,
--             TP-00019, todas «csp», de terceros). Son las que dejó afuera
--             20261112170000; las vigentes ya usan 138CL1 desde esa.
-- Reglas    : RN-49 (dar de baja = activo false, sin DELETE), RN-50 (queda en
--             core.auditoria). Las fórmulas dadas de baja con 135SAN y su lote
--             de apertura AP-00130/2026 (saldo 0) quedan como están: son
--             historia firmada (CLAUDE.md §3.1).
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico (2026-11-13). Los dos insumos tienen la misma
-- densidad de referencia (etanol) y los componentes no la fijan
-- (densidad_id null). Guardas: si los números no coinciden con lo consultado
-- ese día, no se toca nada.

do $$
declare
  v_dt  uuid;
  v_san uuid;
  v_cl1 uuid;
  v_n   integer;
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

  select id into strict v_san from gmp.insumos_catalogo where codigo_interno = '135SAN' and activo;
  select id into strict v_cl1 from gmp.insumos_catalogo where codigo_interno = '138CL1' and activo;

  if exists (select 1
               from comercial.v_saldos_stock s
               join comercial.articulos a on a.id = s.articulo_id
              where a.insumo_id = v_san and s.saldo <> 0) then
    raise exception '135SAN tiene stock: revisar antes de darlo de baja.';
  end if;

  update gmp.formula_componentes fc
     set insumo_id = v_cl1
    from gmp.formulas_fabricacion f
   where f.id = fc.formula_id
     and f.estado = 'BORRADOR'
     and fc.insumo_id = v_san
     and not fc.anulado;
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'Se esperaban 4 componentes 135SAN en fórmulas borrador y hay %: revisar antes de aplicar.', v_n;
  end if;

  if exists (select 1
               from gmp.formula_componentes fc
               join gmp.formulas_fabricacion f on f.id = fc.formula_id
              where fc.insumo_id = v_san
                and f.estado in ('BORRADOR', 'VIGENTE')
                and not fc.anulado) then
    raise exception 'Queda una fórmula vigente o en borrador con 135SAN.';
  end if;

  update gmp.insumos_catalogo set activo = false where id = v_san;
end;
$$;
