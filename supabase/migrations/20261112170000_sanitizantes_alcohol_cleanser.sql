-- ---------------------------------------------------------------------------
-- Propósito : Las fórmulas de los sanitizantes Nail Show dejan de llevar
--             135SAN (alcohol para sanitizante) y pasan a llevar 138CL1
--             (alcohol de cereal, el del cleanser), con la misma proporción.
-- Reglas    : PG.60.8 (control de cambios de la fórmula maestra), invariante
--             1 (la vigente no se edita: se emite la versión siguiente y la
--             anterior queda DADO_DE_BAJA), RN-50. Pedido del codirector
--             técnico el 2026-11-12.
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- VIGENTES (392, 393, 395, 396, NS-397, NS-398): gmp.nueva_version_formula
-- copia componentes, densidad y procedimiento a la versión siguiente; ahí se
-- cambia el insumo y se deja vigente, aprobada por la DT. La versión que regía
-- pasa sola a DADO_DE_BAJA (fn_formula_aprobacion). Las órdenes sobre las
-- versiones viejas (OP-2026-0002 y 0008) ya están liberadas.
--
-- La réplica por familia (D-familias-sku-1) se apaga en esta transacción:
-- cada presentación conserva su fórmula y solo cambia el alcohol. Si no, la
-- primera en pasar a vigente pisaría a sus hermanas.
--
-- BORRADORES: 391 v1 y 394 v3 se corrigen en el lugar (un borrador se edita).
-- 394 v3 queda en borrador: además saca el aloe, y eso no lo pidió nadie hoy;
-- la vigente del 394 (v2, con aloe) se versiona como las demás.
--
-- Afuera: las fórmulas de terceros (TP-00006, TP-00011, TP-00015, TP-00019).
--
-- Solo cambia el insumo de la fila del alcohol. Las filas de 135SAN de estas
-- fórmulas son «csp» sin densidad propia (no se miden a volumen), así que no
-- hay porcentaje ni densidad que mover. La densidad del producto terminado
-- queda la que estaba: es un dato medido de la fórmula, no una suma.

do $$
declare
  v_dt    uuid;
  v_san   uuid;
  v_cl1   uuid;
  v_vieja uuid;
  v_nueva uuid;
  v_n     integer;
  r       record;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va el cambio.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );
  perform set_config('gmp.replicando_formula', 'si', true);

  select id into v_san from gmp.insumos_catalogo where codigo_interno = '135SAN';
  select id into v_cl1 from gmp.insumos_catalogo where codigo_interno = '138CL1';
  if v_san is null or v_cl1 is null then
    raise exception 'Falta 135SAN o 138CL1 en el catálogo.';
  end if;

  -- Vigentes: versión nueva con el alcohol cambiado.
  for r in
    select f.id, p.codigo_interno
      from gmp.formulas_fabricacion f
      join gmp.productos p on p.id = f.producto_id
     where p.codigo_interno in ('392', '393', '394', '395', '396', 'NS-397', 'NS-398')
       and f.estado = 'VIGENTE'
     order by p.codigo_interno
  loop
    if r.codigo_interno = '394' then
      -- nueva_version_formula devolvería el borrador v3 (sin aloe): la versión
      -- nueva se arma a mano desde la vigente, igual que hace esa función.
      insert into gmp.formulas_fabricacion
        (producto_id, variedad, especificacion_id, codigo_me, version, densidad_producto, densidad_temp_c, rendimiento)
      select producto_id, variedad, especificacion_id, codigo_me,
             (select max(version::integer) + 1 from gmp.formulas_fabricacion x
               where x.producto_id = f.producto_id and x.version ~ '^[0-9]+$')::text,
             densidad_producto, densidad_temp_c, rendimiento
        from gmp.formulas_fabricacion f where f.id = r.id
      returning id into v_nueva;
      insert into gmp.formula_componentes
        (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id, etapa, observacion)
      select v_nueva, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id, etapa, observacion
        from gmp.formula_componentes where formula_id = r.id and not anulado;
      insert into gmp.formula_procedimientos (formula_id, version, texto, motivo_cambio)
      select v_nueva, 0, texto, 'Viene de la versión vigente (procedimiento v' || version || '); cambia el alcohol a 138CL1'
        from gmp.v_procedimiento_vigente where formula_id = r.id;
    else
      if exists (select 1 from gmp.formulas_fabricacion f2
                  join gmp.formulas_fabricacion f1 on f1.producto_id = f2.producto_id
                   and f1.variedad is not distinct from f2.variedad
                  where f1.id = r.id and f2.estado = 'BORRADOR') then
        raise exception 'El % tiene un borrador abierto: no se versiona sin mirarlo.', r.codigo_interno;
      end if;
      v_nueva := gmp.nueva_version_formula(r.id);
    end if;

    update gmp.formula_componentes
       set insumo_id = v_cl1
     where formula_id = v_nueva and insumo_id = v_san and not anulado;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'El % tiene % filas de 135SAN; se esperaba una.', r.codigo_interno, v_n;
    end if;

    update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = v_nueva;
  end loop;

  -- Borradores: en el lugar.
  update gmp.formula_componentes c
     set insumo_id = v_cl1
    from gmp.formulas_fabricacion f
    join gmp.productos p on p.id = f.producto_id
   where c.formula_id = f.id and c.insumo_id = v_san and not c.anulado
     and f.estado = 'BORRADOR' and p.codigo_interno in ('391', '394');
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'Se esperaban 2 borradores con 135SAN (391 y 394) y hay %.', v_n;
  end if;

  -- Ninguna fórmula Nail Show vigente o en borrador queda con 135SAN.
  if exists (
    select 1 from gmp.formula_componentes c
      join gmp.formulas_fabricacion f on f.id = c.formula_id
      join gmp.productos p on p.id = f.producto_id
     where c.insumo_id = v_san and not c.anulado and f.estado in ('VIGENTE', 'BORRADOR')
       and p.codigo_interno in ('391', '392', '393', '394', '395', '396', 'NS-397', 'NS-398')
  ) then
    raise exception 'Quedó una fórmula de sanitizante con 135SAN.';
  end if;
end;
$$;
