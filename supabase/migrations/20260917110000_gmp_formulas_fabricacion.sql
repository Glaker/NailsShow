-- ---------------------------------------------------------------------------
-- Propósito : Fórmulas de fabricación en %P/P, tabla de densidades con
--             corrección por temperatura, y la función que convierte un
--             volumen objetivo en masas y volúmenes por componente.
-- Reglas    : PG.60.8 (fórmula patrón/maestra), I.40.16 (pesada), I.50.25
--             (densitómetro), §3.3 (la fórmula la define Dirección Técnica).
-- Fecha     : 2026-09-17
-- ---------------------------------------------------------------------------
--
-- POR QUÉ NO ALCANZA `gmp.espec_formula`.
-- La fórmula de especificación declara rangos (`5-10 %`, `csp 100 %`): es lo
-- que se presenta ante la autoridad. Con un rango no se pesa. La fórmula de
-- fabricación tiene valores puntuales y es la que produce. Son dos documentos
-- distintos con dos propósitos distintos, y el segundo tiene que caer dentro
-- del primero.
--
-- POR QUÉ %P/P Y NO %v/v.
-- La masa es aditiva siempre; el volumen no. Mezclar etanol y agua contrae el
-- volumen (volumen molar de exceso negativo): 50 mL + 50 mL dan unos 96,3 mL.
-- Una fórmula en %v/v obliga a arrastrar ese error en cada escalado. En %P/P
-- el escalado es una multiplicación y nada más.
--
-- DOS CORRECCIONES CONTRA EL ESQUEMA REAL (no estaban en la versión original
-- de este archivo).
--
-- 1. `gmp.estado_documento_enum` no existe todavía en ningún lado del schema.
--    Existe en el documento de alcance (§4.6, línea ~1716) con seis valores
--    para el ciclo de vida de un documento controlado, pensado para
--    `especificaciones`, que tampoco está construida (docs/ESTADO.md la lista
--    como pendiente #2, bloqueada además por D-02: quién firma el veredicto).
--    Se crea acá, con el mismo vocabulario del alcance, porque esta es la
--    primera tabla de un documento controlado que efectivamente se construye.
--    Cuando se arme `gmp.especificaciones`, reutiliza este enum: no lo vuelve
--    a crear.
--
-- 2. `especificacion_id uuid references gmp.especificaciones(id)` no se puede
--    escribir así: `gmp.especificaciones` no existe (mismo pendiente #2). La
--    referencia queda como `uuid` suelto, sin FK, documentada como pendiente.
--    Una fórmula de fabricación puede emitirse y usarse sin que exista todavía
--    la fórmula de especificación que la encuadra —el circuito de calidad de
--    insumos con especificaciones es una fase posterior, no un prerrequisito
--    de pesar un lote—, así que no bloquea esta migración. Cuando la tabla
--    exista, una migración de endurecimiento agrega la FK y completa los
--    valores ya cargados.

-- ===========================================================================
-- 0. Estado de documento controlado (§4.6 del alcance)
-- ===========================================================================

create type gmp.estado_documento_enum as enum (
  'EN_DESARROLLO',
  'BORRADOR',
  'LISTO_PARA_EMITIR',
  'VIGENTE',
  'EN_REVISION',
  'DADO_DE_BAJA'
);

comment on type gmp.estado_documento_enum is
  '§4.6 del alcance: ciclo de vida de un documento controlado (especificación, fórmula de fabricación, POE). '
  'Primer uso: gmp.formulas_fabricacion. gmp.especificaciones (pendiente, docs/ESTADO.md #2) lo reutiliza cuando se construya.';

-- ===========================================================================
-- 1. Densidades de referencia
-- ===========================================================================
--
-- La procedencia del número es parte del número. Un 0,789 de manual y un 0,789
-- de certificado se escriben igual y no valen lo mismo: el segundo respalda un
-- lote ante una inspección y el primero no.

create type gmp.fuente_densidad_enum as enum (
  'LITERATURA',
  'CERTIFICADO_PROVEEDOR',
  'MEDICION_PROPIA',
  'FARMACOPEA'
);

create table gmp.densidades_referencia (
  id             uuid primary key default gen_random_uuid(),
  insumo_id      uuid references gmp.insumos_catalogo(id),
  nombre         text not null check (length(btrim(nombre)) > 0),
  densidad_ref   numeric(9,5) not null check (densidad_ref > 0),
  temp_ref_c     numeric(5,2) not null default 20,
  -- Coeficiente de expansión volumétrica. Nulo = no corregir por temperatura;
  -- es lo correcto para un sólido pulverulento, donde la densidad aparente
  -- depende del empaquetamiento y no de la dilatación.
  beta_k         numeric(12,9) check (beta_k is null or beta_k > 0),
  fuente         gmp.fuente_densidad_enum not null,
  documento_ref  text,
  verificada_por uuid references core.usuarios(id),
  verificada_en  date,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  -- Un valor certificado sin documento que lo respalde no es certificado.
  constraint densidad_certificada_con_documento check (
    fuente <> 'CERTIFICADO_PROVEEDOR' or documento_ref is not null
  ),
  constraint densidad_medida_con_autor check (
    fuente <> 'MEDICION_PROPIA' or (verificada_por is not null and verificada_en is not null)
  )
);

comment on table gmp.densidades_referencia is
  'Densidades por compuesto con su procedencia. Un valor de literatura sirve para estimar; para fabricar hace falta el del certificado o el del densitómetro (I.50.25).';
comment on column gmp.densidades_referencia.beta_k is
  'Coeficiente de expansión volumétrica, K⁻¹. rho(T) = rho_ref * (1 - beta * (T - T_ref)).';

create unique index densidades_insumo_activa_idx
  on gmp.densidades_referencia (insumo_id)
  where activo and insumo_id is not null;

-- ---------------------------------------------------------------------------
-- rho(T), linealización de primer orden
-- ---------------------------------------------------------------------------
-- Válida en unos ±20 °C alrededor de la referencia, que cubre de sobra el
-- rango de una planta. Con beta nulo devuelve la densidad sin tocar, que es lo
-- honesto cuando no se sabe cómo dilata.

create or replace function gmp.densidad_a(p_densidad_id uuid, p_temp_c numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
           when d.beta_k is null then d.densidad_ref
           else d.densidad_ref * (1 - d.beta_k * (p_temp_c - d.temp_ref_c))
         end
    from gmp.densidades_referencia d
   where d.id = p_densidad_id;
$$;

-- ===========================================================================
-- 2. Fórmula de fabricación
-- ===========================================================================

create table gmp.formulas_fabricacion (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references gmp.productos(id),
  variedad          text,
  -- Sin FK: gmp.especificaciones todavía no existe. Ver la nota de cabecera.
  especificacion_id uuid,
  codigo_me         text,
  version           text not null,
  -- Densidad del granel terminado, medida. NO es la suma de las densidades de
  -- los componentes: esa suma no existe. Es el dato que convierte «2000 L de
  -- producto» en una masa, y sin él la calculadora no puede arrancar.
  densidad_producto numeric(9,5) check (densidad_producto is null or densidad_producto > 0),
  densidad_temp_c   numeric(5,2) default 20,
  -- Fracción de rendimiento esperado. 0,97 significa que se pierde un 3 % en
  -- el equipo y hay que cargar de más para sacar el volumen pedido.
  rendimiento       numeric(6,4) not null default 1
                      check (rendimiento > 0 and rendimiento <= 1),
  estado            gmp.estado_documento_enum not null default 'BORRADOR',
  vigencia_desde    date,
  vigencia_hasta    date,
  emitida_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  aprobada_por      uuid references core.usuarios(id),
  aprobada_en       timestamptz,
  creado_en         timestamptz not null default now(),
  unique (producto_id, variedad, version),
  constraint formula_vigente_con_densidad check (
    estado <> 'VIGENTE' or densidad_producto is not null
  ),
  constraint formula_vigente_con_aprobacion check (
    estado <> 'VIGENTE' or (aprobada_por is not null and aprobada_en is not null)
  )
);

comment on table gmp.formulas_fabricacion is
  'Fórmula maestra en %P/P (PG.60.8). Distinta de la fórmula de especificación, que declara rangos y no sirve para pesar.';
comment on column gmp.formulas_fabricacion.especificacion_id is
  'Referencia a gmp.especificaciones (§4.6), pendiente de construir (docs/ESTADO.md #2). Sin FK hasta que la tabla exista: '
  'una migración de endurecimiento la agrega y completa los valores ya cargados.';

-- Una sola fórmula vigente por producto y variedad. El índice parcial lo
-- resuelve sin trigger, y con `variedad` nula tratada como texto vacío para
-- que dos nulos colisionen (en SQL dos nulos no son iguales, y acá sí deben
-- serlo: «sin variedad» es una variedad).
create unique index formulas_una_vigente_idx
  on gmp.formulas_fabricacion (producto_id, coalesce(variedad, ''))
  where estado = 'VIGENTE';

create table gmp.formula_componentes (
  id            uuid primary key default gen_random_uuid(),
  formula_id    uuid not null references gmp.formulas_fabricacion(id) on delete cascade,
  orden         integer not null,
  insumo_id     uuid references gmp.insumos_catalogo(id),
  nombre_libre  text,
  porcentaje_pp numeric(10,6) check (porcentaje_pp is null or porcentaje_pp >= 0),
  -- «csp 100 %»: el componente que completa. A lo sumo uno por fórmula.
  es_csp        boolean not null default false,
  -- Si se mide con probeta en vez de balanza, la hoja de pesada muestra el
  -- volumen. Sigue siendo la masa la que manda: el volumen es una conveniencia.
  se_mide_a_volumen boolean not null default false,
  densidad_id   uuid references gmp.densidades_referencia(id),
  etapa         text,
  observacion   text,
  unique (formula_id, orden),
  constraint componente_identificado check (insumo_id is not null or nombre_libre is not null),
  constraint componente_csp_sin_porcentaje check (
    (es_csp and porcentaje_pp is null) or (not es_csp and porcentaje_pp is not null)
  ),
  constraint componente_a_volumen_con_densidad check (
    not se_mide_a_volumen or densidad_id is not null
  )
);

comment on constraint componente_a_volumen_con_densidad on gmp.formula_componentes is
  'Pedir un volumen sin densidad es pedir un número que no se puede calcular. Se exige en la definición, no al calcular.';

create index formula_componentes_formula_idx on gmp.formula_componentes (formula_id, orden);

-- ---------------------------------------------------------------------------
-- Integridad de la fórmula
-- ---------------------------------------------------------------------------
-- Se valida al pasar a VIGENTE, no en cada INSERT de componente: mientras es
-- borrador, una fórmula a medio cargar es un estado legítimo.

create or replace function gmp.fn_formula_coherente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_suma numeric;
  v_csp  integer;
begin
  if new.estado <> 'VIGENTE' then
    return new;
  end if;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0),
         count(*) filter (where es_csp)
    into v_suma, v_csp
    from gmp.formula_componentes
   where formula_id = new.id;

  if v_csp > 1 then
    raise exception 'La fórmula tiene % componentes marcados csp. Solo puede haber uno: el que completa.', v_csp
      using errcode = 'check_violation';
  end if;

  if v_csp = 0 and abs(v_suma - 100) > 0.0001 then
    raise exception 'Los componentes suman % %% y no hay componente csp. Sin csp, la suma tiene que ser exactamente 100 %%.', v_suma
      using errcode = 'check_violation';
  end if;

  if v_csp = 1 and v_suma >= 100 then
    raise exception 'Los componentes declarados suman % %%, así que no queda nada para el csp.', v_suma
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_formula_coherente
  before update on gmp.formulas_fabricacion
  for each row execute function gmp.fn_formula_coherente();

-- ---------------------------------------------------------------------------
-- Una fórmula vigente no se edita
-- ---------------------------------------------------------------------------
-- Mismo criterio que RN-54 sobre los movimientos. Un lote producido apunta a
-- la fórmula que usó; si esa fórmula puede cambiar después, el batch record
-- deja de decir qué se hizo y pasa a decir qué se hace hoy.

create or replace function gmp.fn_componente_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado gmp.estado_documento_enum;
begin
  select estado into v_estado
    from gmp.formulas_fabricacion
   where id = coalesce(new.formula_id, old.formula_id);

  if v_estado = 'VIGENTE' then
    raise exception
      'La fórmula está vigente y no se modifica. Emitir una versión nueva y dar de baja esta.'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_componente_inmutable
  before insert or update or delete on gmp.formula_componentes
  for each row execute function gmp.fn_componente_inmutable();

-- ===========================================================================
-- 3. La calculadora
-- ===========================================================================
--
-- Orden del cálculo, y el orden importa:
--   1. masa del lote  = volumen objetivo x densidad DEL PRODUCTO
--   2. masa por componente = masa del lote x %P/P
--   3. volumen por componente = masa / densidad DEL COMPONENTE a la T de trabajo
--
-- El paso 3 es informativo. La suma de esos volúmenes no da el volumen
-- objetivo, y no es un error: los volúmenes no son aditivos. La pantalla tiene
-- que decirlo, porque alguien lo va a reportar como bug.

create type gmp.renglon_pesada as (
  orden              integer,
  componente         text,
  insumo_id          uuid,
  codigo_interno     text,
  porcentaje_pp      numeric,
  masa_kg            numeric,
  se_mide_a_volumen  boolean,
  densidad_aplicada  numeric,
  volumen_l          numeric,
  etapa              text,
  observacion        text
);

create or replace function gmp.calcular_lote(
  p_formula_id  uuid,
  p_volumen_l   numeric default null,
  p_masa_kg     numeric default null,
  p_temp_c      numeric default 20
)
returns setof gmp.renglon_pesada
language plpgsql
stable
set search_path = ''
as $$
declare
  v_f        gmp.formulas_fabricacion%rowtype;
  v_masa     numeric;
  v_declarado numeric;
begin
  select * into v_f from gmp.formulas_fabricacion where id = p_formula_id;
  if not found then
    raise exception 'No existe la fórmula %.', p_formula_id;
  end if;

  if (p_volumen_l is null) = (p_masa_kg is null) then
    raise exception 'Indicá el objetivo en volumen o en masa, uno de los dos.'
      using errcode = 'check_violation';
  end if;

  if p_masa_kg is not null then
    v_masa := p_masa_kg;
  else
    if v_f.densidad_producto is null then
      raise exception
        'La fórmula no tiene densidad del producto terminado, así que un volumen objetivo no se puede convertir a masa. '
        'Medirla con el densitómetro (I.50.25) y cargarla.'
        using errcode = 'check_violation';
    end if;
    -- densidad en g/mL es numéricamente igual a kg/L, así que no hay factor.
    v_masa := p_volumen_l * v_f.densidad_producto;
  end if;

  -- El rendimiento agranda la carga, no la achica: para sacar 2000 L con 97 %
  -- de rendimiento hay que cargar 2000 / 0,97.
  v_masa := v_masa / v_f.rendimiento;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id;

  return query
  select
    c.orden,
    coalesce(i.nombre, c.nombre_libre)                                  as componente,
    c.insumo_id,
    i.codigo_interno,
    coalesce(c.porcentaje_pp, 100 - v_declarado)                        as porcentaje_pp,
    round(v_masa * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100, 4) as masa_kg,
    c.se_mide_a_volumen,
    gmp.densidad_a(c.densidad_id, p_temp_c)                             as densidad_aplicada,
    case
      when c.se_mide_a_volumen then
        round(
          (v_masa * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100)
          / gmp.densidad_a(c.densidad_id, p_temp_c), 4)
      else null
    end                                                                  as volumen_l,
    c.etapa,
    c.observacion
  from gmp.formula_componentes c
  left join gmp.insumos_catalogo i on i.id = c.insumo_id
  where c.formula_id = p_formula_id
  order by c.orden;
end;
$$;

comment on function gmp.calcular_lote is
  'Explota una fórmula a masas por componente. El volumen por componente es informativo: su suma no da el volumen del lote, porque los volúmenes no son aditivos.';

-- ===========================================================================
-- 4. Permisos
-- ===========================================================================
--
-- §3.3 y PG.60.1: la fórmula maestra es de Dirección Técnica. Producción la
-- lee y la ejecuta. Esta es la separación pedida explícitamente.

alter table gmp.formulas_fabricacion enable row level security;
alter table gmp.formulas_fabricacion force  row level security;
alter table gmp.formula_componentes  enable row level security;
alter table gmp.formula_componentes  force  row level security;
alter table gmp.densidades_referencia enable row level security;
alter table gmp.densidades_referencia force  row level security;

grant select                 on gmp.formulas_fabricacion  to authenticated;
grant insert, update         on gmp.formulas_fabricacion  to authenticated;
grant select                 on gmp.formula_componentes   to authenticated;
grant insert, update, delete on gmp.formula_componentes   to authenticated;
grant select                 on gmp.densidades_referencia to authenticated;
grant insert, update         on gmp.densidades_referencia to authenticated;

create policy formulas_select_authenticated on gmp.formulas_fabricacion
  for select to authenticated using (core.rol() is not null);

create policy formulas_escribe_dt on gmp.formulas_fabricacion
  for insert to authenticated with check (core.es_rol('DIRECCION_TECNICA'));

create policy formulas_actualiza_dt on gmp.formulas_fabricacion
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA'))
  with check (core.es_rol('DIRECCION_TECNICA'));

create policy componentes_select_authenticated on gmp.formula_componentes
  for select to authenticated using (core.rol() is not null);

create policy componentes_escribe_dt on gmp.formula_componentes
  for insert to authenticated with check (core.es_rol('DIRECCION_TECNICA'));

create policy componentes_actualiza_dt on gmp.formula_componentes
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA'))
  with check (core.es_rol('DIRECCION_TECNICA'));

create policy componentes_borra_dt on gmp.formula_componentes
  for delete to authenticated using (core.es_rol('DIRECCION_TECNICA'));

create policy densidades_select_authenticated on gmp.densidades_referencia
  for select to authenticated using (core.rol() is not null);

create policy densidades_escribe_calidad on gmp.densidades_referencia
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));

create policy densidades_actualiza_calidad on gmp.densidades_referencia
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'))
  with check (core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD'));

select core.adjuntar_auditoria('gmp.formulas_fabricacion');
select core.adjuntar_auditoria('gmp.formula_componentes');
select core.adjuntar_auditoria('gmp.densidades_referencia');

-- ===========================================================================
-- 5. Semilla de densidades
-- ===========================================================================
--
-- Todas entran como LITERATURA, y la interfaz tiene que mostrarlas como tales.
-- Para fabricar de verdad, cada una se reemplaza por el valor del certificado
-- del lote o por una medición propia. Un número de manual y un número
-- certificado no valen lo mismo, y el sistema no debe dejar que se confundan.

insert into gmp.densidades_referencia (nombre, densidad_ref, temp_ref_c, beta_k, fuente) values
  ('Agua desionizada',            0.99820, 20, 0.000207,  'LITERATURA'),
  ('Etanol absoluto',             0.78930, 20, 0.001090,  'LITERATURA'),
  ('Etanol 96 GL',                0.80740, 20, 0.001050,  'LITERATURA'),
  ('Isopropanol',                 0.78550, 20, 0.001070,  'LITERATURA'),
  ('Glicerina',                   1.26130, 20, 0.000500,  'LITERATURA'),
  ('Propilenglicol',              1.03610, 20, 0.000700,  'LITERATURA'),
  ('Acetona',                     0.78990, 20, 0.001430,  'LITERATURA'),
  ('Acetato de butilo',           0.88130, 20, 0.001200,  'LITERATURA'),
  ('Acetato de etilo',            0.90060, 20, 0.001380,  'LITERATURA'),
  ('Metacrilato de etilo (EMA)',  0.91350, 20, 0.001000,  'LITERATURA');
