-- ---------------------------------------------------------------------------
-- Propósito : Densidad estimada para los líquidos de la carga
--             20261112140000 que no tenían densidad (cargados provisorios con
--             densidad 1), y nuevo conteo de cada uno en gramos con esa
--             densidad.
-- Reglas    : D-densidad-supuesta-1 (densidad supuesta de literatura hasta
--             tener certificado o medición), RN-50, RN-54 (la diferencia es un
--             ajuste, nada se edita), §3.3.
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico el 2026-11-12: «estimá todos, el
-- enmascarante estimalo como 0,95 g/ml». Valores supuestos, calidad C:
--   192ENM  enmascarante ............................ 0,95 (codirector)
--   192ALOE aloe vera tintura (hidroalcohólica) ..... 0,96
--   135ALOE extracto glicólico de aloe .............. 1,04 (base propilenglicol)
--   137AD   adhesivo foil (acrílico acuoso) ......... 1,02
--   139AC01–140AC27 pinturas acrílicas .............. 1,35 (pintura acrílica
--           artística, 1,2–1,6 según carga de pigmento)
-- Se reemplazan por el del certificado o el densitómetro cuando los haya.
--
-- El conteo nuevo es litros de la planilla × densidad × 1000. Antes de
-- contar se verifica que el saldo siga siendo el de la carga anterior
-- (litros × 1000): si algo se movió en el medio, se frena en vez de pisarlo.

do $$
declare
  v_dt  uuid;
  v_obs constant text := 'Planilla «INSUMOS ROMERO 12-11» (depósito 10, Stock x Dep.), existencia al 2026-11-12, con densidad estimada';
  r     record;
  v_ins gmp.insumos_catalogo%rowtype;
  v_dens uuid;
  v_saldo numeric;
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

  create temp table densidades_estimadas on commit drop as
  select * from (values
    ('ENM',  'Enmascarante (supuesta)',                0.95, 'Estimada por el codirector técnico el 2026-11-12.'),
    ('TINT', 'Tintura hidroalcohólica (supuesta)',     0.96, 'Mezcla agua/etanol con extracto: 0,93–0,98 g/mL. Supuesta el 2026-11-12.'),
    ('GLIC', 'Extracto glicólico (supuesta)',          1.04, 'Extracto en propilenglicol/agua: 1,02–1,06 g/mL. Supuesta el 2026-11-12.'),
    ('ADH',  'Adhesivo acrílico acuoso (supuesta)',    1.02, 'Emulsión acrílica en agua: 1,00–1,05 g/mL. Supuesta el 2026-11-12.'),
    ('ACR',  'Pintura acrílica artística (supuesta)',  1.35, 'Pintura acrílica: 1,2–1,6 g/mL según pigmento. Supuesta el 2026-11-12.')
  ) as t (clave, nombre, densidad, notas);

  alter table densidades_estimadas add column id uuid;
  update densidades_estimadas set id = gen_random_uuid();

  insert into gmp.densidades_referencia (id, nombre, densidad_ref, temp_ref_c, fuente, categoria, calidad, notas)
  select id, nombre, densidad, 20, 'LITERATURA', 'SUPUESTA_' || clave, 'C', notas
    from densidades_estimadas;

  for r in
    select * from (values
      ('192ENM', 'ENM', 2), ('192ALOE', 'TINT', 2), ('135ALOE', 'GLIC', 0.4), ('137AD', 'ADH', 2),
      ('139AC01', 'ACR', 13.2), ('139AC02', 'ACR', 3.6), ('139AC03', 'ACR', 10.5), ('139AC04', 'ACR', 7.5),
      ('139AC05', 'ACR', 28.5), ('139AC06', 'ACR', 5.5), ('139AC07', 'ACR', 65), ('139AC08', 'ACR', 5.7),
      ('139AC09', 'ACR', 28.7), ('139AC10', 'ACR', 21.9), ('139AC11', 'ACR', 54.5), ('139AC12', 'ACR', 6),
      ('140AC13', 'ACR', 60.1), ('140AC14', 'ACR', 68.2), ('140AC15', 'ACR', 77), ('140AC16', 'ACR', 75.7),
      ('140AC17', 'ACR', 76.9), ('140AC18', 'ACR', 96.3), ('140AC19', 'ACR', 94.1), ('140AC20', 'ACR', 77.5),
      ('140AC21', 'ACR', 39.4), ('140AC22', 'ACR', 48.4), ('140AC23', 'ACR', 74.4), ('140AC24', 'ACR', 77.6),
      ('140AC25', 'ACR', 82.2), ('140AC26', 'ACR', 87.4), ('140AC27', 'ACR', 74)
    ) as t (codigo, clave, litros)
  loop
    select * into v_ins from gmp.insumos_catalogo where codigo_interno = r.codigo;
    if not found or v_ins.unidad_medida is distinct from 'g' then
      raise exception 'El insumo % no está o no es en g.', r.codigo;
    end if;
    if v_ins.densidad_referencia_id is not null then
      raise exception 'El insumo % ya tiene densidad: no se pisa.', r.codigo;
    end if;

    select coalesce(sum(s.saldo), 0) into v_saldo
      from comercial.v_saldos_stock s
     where s.articulo_id = comercial.articulo_de_insumo(v_ins.id);
    if v_saldo <> r.litros * 1000 then
      raise exception 'El saldo de % es % g y la carga anterior dejó % g: se movió en el medio.', r.codigo, v_saldo, r.litros * 1000;
    end if;

    select id into v_dens from densidades_estimadas where clave = r.clave;
    update gmp.insumos_catalogo set densidad_referencia_id = v_dens where id = v_ins.id;

    perform comercial.registrar_conteo(
      v_ins.id, round(r.litros * (select densidad from densidades_estimadas where clave = r.clave) * 1000, 3),
      v_obs || format(': planilla %s L', r.litros), false);
  end loop;
end;
$$;
