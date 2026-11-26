-- ---------------------------------------------------------------------------
-- Propósito : Corregir las fichas con la unidad mal cargada que el descuento
--             no puede convertir (20261126120000):
--               9382GT30  frasco para aceite x30 ml ... ficha ml → UNIDAD
--               9382TP20- pipeta 20 mm ................. ficha ml → UNIDAD
--               VAS001    vaselina 180 ................. densidad 0,854 g/ml
--             y que el conversor reconozca «Unidades», «u» y «un» como
--             unidad (dos lotes de esos envases dicen «Unidades»).
-- Reglas    : RN-50 (auditado), RN-54. Pedido del codirector técnico del
--             2026-11-26 («corregí todo y cargá densidad de vaselina
--             0,854 g/ml»).
-- Fecha     : 2026-11-26
-- ---------------------------------------------------------------------------
--
-- La densidad de la vaselina la informó el codirector técnico; se carga como
-- las estimadas de 20261112150000 (fuente LITERATURA, nota con el origen)
-- hasta tener certificado o medición. Los lotes no se tocan: el de vaselina
-- está en L (ficha kg) y ahora se convierte con esta densidad.

-- ===========================================================================
-- 1. El conversor reconoce los nombres de «unidad» que usan los lotes
-- ===========================================================================
-- Copia de la vigente; único cambio: los sinónimos de 'unidad' (NUEVO).

CREATE OR REPLACE FUNCTION comercial.convertir_cantidad(p_cantidad numeric, p_desde text, p_hacia text, p_densidad numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  fd numeric; fh numeric; dd text; dh text; v numeric;
begin
  select f, d into fd, dd
    from (values ('g', 1, 'M'), ('kg', 1000, 'M'), ('ml', 1, 'V'), ('l', 1000, 'V'), ('unidad', 1, 'U'),
                  ('unidades', 1, 'U'), ('u', 1, 'U'), ('un', 1, 'U')) t(u, f, d)  -- NUEVO (2026-11-26)
   where u = lower(btrim(p_desde));
  select f, d into fh, dh
    from (values ('g', 1, 'M'), ('kg', 1000, 'M'), ('ml', 1, 'V'), ('l', 1000, 'V'), ('unidad', 1, 'U'),
                  ('unidades', 1, 'U'), ('u', 1, 'U'), ('un', 1, 'U')) t(u, f, d)  -- NUEVO (2026-11-26)
   where u = lower(btrim(p_hacia));
  if fd is null or fh is null then
    return null;
  end if;
  v := p_cantidad * fd;                       -- en g, mL o unidades
  if dd <> dh then
    if dd = 'U' or dh = 'U' or p_densidad is null or p_densidad <= 0 then
      return null;
    end if;
    v := case when dd = 'M' then v / p_densidad else v * p_densidad end;
  end if;
  return v / fh;
end;
$function$
;

-- ===========================================================================
-- 2. Fichas y densidad (solo en la base real: si no están, no hace nada)
-- ===========================================================================
do $$
declare
  v_dt   uuid;
  v_dens uuid;
  v_vas  gmp.insumos_catalogo%rowtype;
begin
  if not exists (select 1 from gmp.insumos_catalogo where codigo_interno in ('9382GT30', '9382TP20-', 'VAS001')) then
    return;  -- base sin esos insumos (práctica, pruebas)
  end if;
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

  -- Envases que se reciben y se usan por unidad.
  update gmp.insumos_catalogo set unidad_medida = 'UNIDAD'
   where codigo_interno in ('9382GT30', '9382TP20-') and unidad_medida = 'ml';
  if exists (select 1 from gmp.insumos_catalogo
              where codigo_interno in ('9382GT30', '9382TP20-') and unidad_medida <> 'UNIDAD') then
    raise exception 'El frasco 9382GT30 o la pipeta 9382TP20- no quedaron en UNIDAD.';
  end if;

  select * into v_vas from gmp.insumos_catalogo where codigo_interno = 'VAS001';
  if v_vas.densidad_referencia_id is not null then
    raise exception 'VAS001 ya tiene densidad: no se pisa.';
  end if;
  insert into gmp.densidades_referencia (nombre, densidad_ref, temp_ref_c, fuente, categoria, calidad, notas)
  values ('Vaselina 180', 0.854, 20, 'LITERATURA', 'INFORMADA', 'C',
          'Informada por el codirector técnico el 2026-11-26: 0,854 g/ml. Reemplazar por certificado o medición.')
  returning id into v_dens;
  update gmp.insumos_catalogo set densidad_referencia_id = v_dens where id = v_vas.id;
  if comercial.densidad_insumo(v_vas.id) is null then
    raise exception 'La densidad de VAS001 no quedó vigente a 20 °C.';
  end if;
end;
$$;
