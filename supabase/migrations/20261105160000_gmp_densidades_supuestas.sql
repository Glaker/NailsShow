-- ---------------------------------------------------------------------------
-- Propósito : Densidad supuesta para fragancias/esencias (0,98 g/mL, cercana
--             al agua) y pigmentos (2,0 g/mL) que no tienen una cargada, para
--             que la fórmula pueda estimar la densidad del producto. Se asigna
--             a las que hay y, al dar de alta una nueva, por nombre o código.
-- Reglas    : D-densidad-supuesta-1 (codirector técnico, 2026-11-05), sobre
--             D-33 (densidad estimada por defecto). RN-50 (la asignación queda
--             en core.auditoria). Invariantes 3 y 6 (tablas ya con RLS
--             forzada y auditoría).
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------
--
-- Son dos filas de gmp.densidades_referencia, de literatura y marcadas como
-- supuestas (categoria), sin insumo propio: varias materias primas apuntan a
-- la misma. Cuando haya certificado o medición, se carga la propia y se
-- cambia en la ficha del insumo. Sin coeficiente de dilatación: no se corrige
-- por temperatura.
--
-- Fragancia/esencia: nombre con «fragancia», «esencia» o «perfume», o código
-- NNNFRAn, NNNESE o FRAG… . Pigmento: nombre con «pigmento» o código NNNPIG.
-- Solo materias primas, y solo si el insumo no tiene densidad.

insert into gmp.densidades_referencia
  (nombre, densidad_ref, temp_ref_c, fuente, categoria, calidad, notas)
values
  ('Fragancia / esencia (supuesta)', 0.98, 20, 'LITERATURA', 'SUPUESTA_FRAGANCIA', 'C',
   'Valor típico de aceites de fragancia (0,95–1,05 g/mL). Supuesto por la DT el 2026-11-05 '
   'para estimar la densidad del producto mientras no haya certificado ni medición.'),
  ('Pigmento (supuesto)', 2.0, 20, 'LITERATURA', 'SUPUESTA_PIGMENTO', 'C',
   'Valor supuesto por la DT el 2026-11-05 (pigmentos y micas: 1,5–5 g/mL). Pesa poco en el '
   'volumen por el % bajo; reemplazar por el del certificado cuando lo haya.');

create or replace function gmp.densidad_supuesta(p_tipo text, p_codigo text, p_nombre text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select d.id
    from gmp.densidades_referencia d
   where d.activo
     and p_tipo = 'MATERIA_PRIMA'
     and d.categoria = case
           when p_nombre ~* '(fragancia|esencia|perfume)'
             or p_codigo ~ '^[0-9]*(FRA[0-9]+|ESE)$' or p_codigo ~ '^FRAG' then 'SUPUESTA_FRAGANCIA'
           when p_nombre ~* 'pigmento' or p_codigo ~ '^[0-9]*PIG[0-9]*$' then 'SUPUESTA_PIGMENTO'
         end
   order by d.creado_en
   limit 1;
$$;

comment on function gmp.densidad_supuesta(text, text, text) is
  'D-densidad-supuesta-1: la densidad supuesta que corresponde a una materia prima por nombre o código '
  '(fragancia/esencia o pigmento), o null.';
revoke execute on function gmp.densidad_supuesta(text, text, text) from public, anon;
grant execute on function gmp.densidad_supuesta(text, text, text) to authenticated;

-- Alta de insumo: si no trae densidad, la supuesta que le toque.
create or replace function gmp.fn_insumo_densidad_supuesta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.densidad_referencia_id is null then
    new.densidad_referencia_id := gmp.densidad_supuesta(new.tipo::text, new.codigo_interno, new.nombre);
  end if;
  return new;
end;
$$;

create trigger trg_insumo_densidad_supuesta
  before insert on gmp.insumos_catalogo
  for each row execute function gmp.fn_insumo_densidad_supuesta();

-- Las que ya están, a nombre de la DT suplente como las demás cargas de datos.
do $$
declare
  v_dt uuid;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is not null then
    perform set_config(
      'request.jwt.claims',
      json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                        'roles', json_build_array('DIRECCION_TECNICA'))::text,
      true
    );
  end if;

  update gmp.insumos_catalogo i
     set densidad_referencia_id = gmp.densidad_supuesta(i.tipo::text, i.codigo_interno, i.nombre)
   where i.densidad_referencia_id is null
     and gmp.densidad_supuesta(i.tipo::text, i.codigo_interno, i.nombre) is not null;
end;
$$;
