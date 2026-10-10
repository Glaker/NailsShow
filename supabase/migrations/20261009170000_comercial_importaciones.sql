-- ---------------------------------------------------------------------------
-- Propósito : Fase 6 del módulo de costos: importación de planillas Excel con
--             registro (quién, cuándo, qué archivo, su hash y lo que se cargó),
--             y la primera plantilla: costos de referencia de materias primas.
-- Reglas    : RN-50, D-38, D-54 (criterios de importación y exportación).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- QUE NO ADIVINE. La pantalla lee la plantilla fija (encabezados exactos), la
-- valida renglón por renglón y muestra qué se va a crear, qué se va a
-- actualizar y qué tiene error. Recién al confirmar se llama a la función de
-- la plantilla, que vuelve a validar todo en la base (tipos estrictos: números
-- como número JSON, fechas AAAA-MM-DD) y escribe en UNA transacción: si un
-- renglón falla, no entra ninguno.
--
-- EL HASH. Es el SHA-256 del archivo que calculó el navegador: el archivo en
-- sí no se sube. La base guarda el hash declarado y los renglones tal como se
-- enviaron (datos; los valores por defecto que aplicó la función —cantidad 1,
-- ARS, hoy— no están en datos sino en lo cargado).
--
-- EL REGISTRO NO SE ESCRIBE A MANO. Sólo la función de la plantilla, en la
-- misma transacción que carga los datos, pone la marca que el trigger exige:
-- un registro de importación prueba que esa importación ocurrió.

create table comercial.importaciones (
  id             uuid primary key default gen_random_uuid(),
  plantilla      text not null check (plantilla in ('costos_materias_primas')),
  archivo        text not null check (length(btrim(archivo)) > 0),
  hash_archivo   text not null check (hash_archivo ~ '^[0-9a-f]{64}$'),
  filas          integer not null check (filas > 0),
  datos          jsonb not null,
  importado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  importado_en   timestamptz not null default now()
);

select core.adjuntar_auditoria('comercial.importaciones');

create index importaciones_plantilla_idx on comercial.importaciones (plantilla, importado_en desc);
create index importaciones_importado_por_idx on comercial.importaciones (importado_por);

comment on table comercial.importaciones is
  'Registro de cada importación de planilla (D-54): plantilla, nombre y SHA-256 del archivo, cantidad de renglones, '
  'los renglones enviados y quién y cuándo. Lo escriben sólo las funciones de importación (marca de transacción).';

create function comercial.fn_importacion_sello()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('comercial.importando', true), '') <> 'si' then
    raise exception 'El registro de importación lo escribe la importación, no se carga a mano.'
      using errcode = 'insufficient_privilege';
  end if;
  new.importado_en := now();
  new.importado_por := core.usuario_actual();
  return new;
end;
$$;

create trigger trg_importacion_sello before insert on comercial.importaciones
  for each row execute function comercial.fn_importacion_sello();

-- Plantilla «costos de materias primas»: un precio de referencia de Finanzas
-- por renglón (comercial.costos_referencia). Mismas reglas que la carga a mano
-- (el trigger rechaza una unidad que no se pueda llevar a la del catálogo).
create function comercial.importar_costos_referencia(p_archivo text, p_hash text, p_filas jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r       jsonb;
  v_ins   record;
  v_n     integer := 0;
  v_fila  integer := 0;
begin
  if not core.es_rol('FINANZAS') then
    raise exception 'Los costos de referencia los importa Finanzas.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_archivo, ''))) = 0 or coalesce(lower(p_hash), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Faltan el nombre del archivo o su SHA-256.' using errcode = 'check_violation';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'La planilla no tiene renglones.' using errcode = 'check_violation';
  end if;
  for r in select * from jsonb_array_elements(p_filas) loop
    v_fila := v_fila + 1;
    select id, activo into v_ins from gmp.insumos_catalogo where codigo_interno = r ->> 'codigo_insumo';
    if v_ins.id is null then
      raise exception 'Renglón %: no existe el insumo «%».', v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    elsif not v_ins.activo then
      raise exception 'Renglón %: el insumo «%» está inactivo.', v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    end if;
    -- Tipos estrictos: sin interpretar textos (DateStyle, separadores de miles).
    if jsonb_typeof(r -> 'importe') is distinct from 'number'
       or (r ? 'cantidad' and jsonb_typeof(r -> 'cantidad') not in ('number', 'null'))
       or (r ? 'tipo_cambio' and jsonb_typeof(r -> 'tipo_cambio') not in ('number', 'null'))
       or (r ->> 'vigente_desde' is not null and r ->> 'vigente_desde' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Renglón % («%»): importe, cantidad y tipo de cambio van como número y la fecha como AAAA-MM-DD.',
        v_fila, r ->> 'codigo_insumo' using errcode = 'check_violation';
    end if;
    begin
      insert into comercial.costos_referencia (insumo_id, importe, cantidad, unidad, moneda, tipo_cambio, vigente_desde,
                                               motivo)
      values (v_ins.id, (r ->> 'importe')::numeric, coalesce((r ->> 'cantidad')::numeric, 1), r ->> 'unidad',
              coalesce(r ->> 'moneda', 'ARS'),
              case when coalesce(r ->> 'moneda', 'ARS') = 'ARS' then 1 else (r ->> 'tipo_cambio')::numeric end,
              coalesce((r ->> 'vigente_desde')::date, comercial.hoy()),
              coalesce(nullif(btrim(r ->> 'motivo'), ''), 'Importación ' || btrim(p_archivo)));
    exception when data_exception or integrity_constraint_violation then
      raise exception 'Renglón % («%»): %', v_fila, r ->> 'codigo_insumo', sqlerrm using errcode = 'check_violation';
    end;
    v_n := v_n + 1;
  end loop;
  perform set_config('comercial.importando', 'si', true);
  insert into comercial.importaciones (plantilla, archivo, hash_archivo, filas, datos)
  values ('costos_materias_primas', btrim(p_archivo), lower(p_hash), v_n, p_filas);
  perform set_config('comercial.importando', '', true);
  return v_n;
end;
$$;

comment on function comercial.importar_costos_referencia(text, text, jsonb) is
  'Importa la plantilla de costos de materias primas en una sola transacción (si un renglón falla, no entra ninguno, '
  'y el error dice cuál) y deja el registro en comercial.importaciones. Sólo Finanzas (D-38).';

alter table comercial.importaciones enable row level security;
alter table comercial.importaciones force  row level security;

grant select on comercial.importaciones to authenticated;
grant insert (plantilla, archivo, hash_archivo, filas, datos) on comercial.importaciones to authenticated;
grant execute on function comercial.importar_costos_referencia(text, text, jsonb) to authenticated;
revoke execute on function comercial.importar_costos_referencia(text, text, jsonb) from public, anon;

create policy importaciones_select_costos on comercial.importaciones
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION'));
comment on policy importaciones_select_costos on comercial.importaciones is
  'D-54, RN-50: el registro de importaciones lo ven Finanzas, Gerencia y Administración.';
create policy importaciones_insert_finanzas on comercial.importaciones
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and importado_por = core.usuario_actual());
comment on policy importaciones_insert_finanzas on comercial.importaciones is
  'D-54, RN-50: hoy la única plantilla es de Finanzas. El trigger exige además la marca de la función de importación. '
  'Cuando haya plantillas de Administración, se agrega su rol acá.';
