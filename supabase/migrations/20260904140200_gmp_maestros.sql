-- ---------------------------------------------------------------------------
-- Propósito : Maestros del dominio regulado: depósitos, proveedores y catálogo
--             de insumos. Incluye la semilla de depósitos identificados en los
--             POE.
-- Reglas    : RN-01 (protocolo de análisis obligatorio en materia prima),
--             RN-03 (pesada de pigmentos en recepción),
--             RN-47 y RN-48 (circuito de inflamables).
--             Matriz de permisos de §3.3 del documento de alcance.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Depósitos (§4.1)
-- ===========================================================================

create table gmp.depositos (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,
  nombre          text not null,
  tipo_contenido  gmp.tipo_contenido_enum,
  -- NULL = admite material en cualquier estado. Los depósitos de I.20.1 e
  -- I.20.5 están dedicados por estado, y esa dedicación es la que sostiene la
  -- segregación física que exigen las Buenas Prácticas.
  estado_admitido gmp.estado_calidad_enum,
  es_exterior     boolean not null default false,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on table gmp.depositos is
  'Depósitos físicos de la planta (§4.1). La segregación por estado es la que materializa la cuarentena.';
comment on column gmp.depositos.numero is
  'Numeración de los POE. I.20.1, I.40.16 e I.20.5 numeran cinco depósitos (01, 04, 05, 19, 20); '
  'los otros cinco se nombran pero no se numeran, y llevan código mnemotécnico provisional.';
comment on column gmp.depositos.es_exterior is
  'Depósito fuera del edificio. I.20.6 exige que las materias primas inflamables vayan a uno certificado en el exterior (RN-48).';

-- ===========================================================================
-- Proveedores (§4.2)
-- ===========================================================================

create table gmp.proveedores (
  id                uuid primary key default gen_random_uuid(),
  razon_social      text not null check (length(btrim(razon_social)) > 0),
  cuit              text check (cuit is null or cuit ~ '^[0-9]{11}$'),
  contacto_nombre   text,
  contacto_telefono text,
  contacto_email    text,
  domicilio         text,
  estado_aprobacion gmp.aprobacion_proveedor_enum not null default 'PENDIENTE',
  aprobado_por      uuid references core.usuarios(id),
  aprobado_en       timestamptz,
  observaciones     text,
  activo            boolean not null default true,
  creado_por        uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en         timestamptz not null default now(),
  -- Un veredicto sobre el proveedor sin autor y sin momento no es un veredicto.
  constraint proveedores_veredicto_con_autor check (
    (estado_aprobacion = 'PENDIENTE' and aprobado_por is null and aprobado_en is null)
    or (estado_aprobacion <> 'PENDIENTE' and aprobado_por is not null and aprobado_en is not null)
  )
);

comment on table gmp.proveedores is
  'Proveedores de insumos (§4.2). La aprobación es competencia exclusiva de Dirección Técnica (§3.3).';

create index proveedores_razon_social_idx on gmp.proveedores (razon_social);

-- La aprobación del proveedor es de Dirección Técnica, y eso es más fino que
-- lo que una política RLS puede expresar: RLS decide sobre la fila entera, no
-- sobre una columna en función de su valor anterior. Va en trigger.
create or replace function gmp.fn_proveedor_aprobacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado_aprobacion is distinct from old.estado_aprobacion
     and not core.es_rol('DIRECCION_TECNICA') then
    raise exception
      'Solo Dirección Técnica aprueba o rechaza un proveedor (§3.3 del documento de alcance).'
      using errcode = 'insufficient_privilege';
  end if;

  if new.estado_aprobacion is distinct from old.estado_aprobacion
     and new.estado_aprobacion <> 'PENDIENTE' then
    new.aprobado_por := core.usuario_actual();
    new.aprobado_en  := now();
  end if;

  return new;
end;
$$;

create trigger trg_proveedor_aprobacion
  before update on gmp.proveedores
  for each row execute function gmp.fn_proveedor_aprobacion();

-- ===========================================================================
-- Catálogo de insumos (§4.2)
-- ===========================================================================

create table gmp.insumos_catalogo (
  id                        uuid primary key default gen_random_uuid(),
  codigo_interno            text not null unique,
  nombre                    text not null check (length(btrim(nombre)) > 0),
  tipo                      gmp.tipo_insumo_enum not null,
  unidad_medida             text not null,
  -- RN-48: dispara el circuito de I.20.6, con destino forzado al depósito exterior.
  es_inflamable             boolean not null default false,
  -- RN-01: I.20.1 paso 5 exige protocolo de análisis del fabricante en materia prima.
  requiere_protocolo        boolean not null default false,
  -- RN-03: los pigmentos se pesan antes de continuar la recepción.
  requiere_pesada_recepcion boolean not null default false,
  deposito_cuarentena_id    uuid references gmp.depositos(id),
  deposito_aprobado_id      uuid references gmp.depositos(id),
  activo                    boolean not null default true,
  creado_en                 timestamptz not null default now()
);

comment on table gmp.insumos_catalogo is
  'Catálogo de insumos (§4.2). Los tres booleanos de circuito (protocolo, pesada, inflamable) son los que activan RN-01, RN-03 y RN-48.';

create index insumos_catalogo_nombre_idx on gmp.insumos_catalogo (nombre);
create index insumos_catalogo_tipo_idx   on gmp.insumos_catalogo (tipo);

-- ===========================================================================
-- Semilla de depósitos (§4.1, identificados en los POE)
-- ===========================================================================

insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior) values
  ('01',      'Materiales de envase y empaque — cuarentena', 'ENVASE_EMPAQUE', 'CUARENTENA', false),
  ('04',      'Materia prima — cuarentena',                  'MATERIA_PRIMA',  'CUARENTENA', false),
  ('05',      'Materia prima — aprobada',                    'MATERIA_PRIMA',  'APROBADO',   false),
  ('19',      'Producto terminado importado — aprobado',     'PT_IMPORTADO',   'APROBADO',   false),
  ('20',      'Producto terminado importado — cuarentena',   'PT_IMPORTADO',   'CUARENTENA', false),
  ('INF',     'Materias primas inflamables (exterior, certificado)', 'INFLAMABLES', null,    true),
  ('GRA-CUA', 'Graneles — cuarentena',                       'GRANEL',         'CUARENTENA', false),
  ('ENV-APR', 'Envases aprobados',                           'ENVASE_EMPAQUE', 'APROBADO',   false),
  ('CTM',     'Contramuestras cosméticas',                   'CONTRAMUESTRA',  null,         false),
  ('RET',     'Retiro de mercado',                           'RETIRO_MERCADO', null,         false);

-- ===========================================================================
-- RLS (invariante 3: ENABLE y FORCE en toda tabla de negocio)
-- ===========================================================================

alter table gmp.depositos         enable row level security;
alter table gmp.depositos         force  row level security;
alter table gmp.proveedores       enable row level security;
alter table gmp.proveedores       force  row level security;
alter table gmp.insumos_catalogo  enable row level security;
alter table gmp.insumos_catalogo  force  row level security;

grant select, insert, update on gmp.depositos        to authenticated;
grant select, insert, update on gmp.proveedores      to authenticated;
grant select, insert, update on gmp.insumos_catalogo to authenticated;

-- Consultar registros y trazabilidad: todos los roles (§3.3).
create policy depositos_select_authenticated on gmp.depositos
  for select to authenticated using (core.rol() is not null);
comment on policy depositos_select_authenticated on gmp.depositos is
  '§3.3: «Consultar registros y trazabilidad» está habilitado para todos los roles.';

create policy proveedores_select_authenticated on gmp.proveedores
  for select to authenticated using (core.rol() is not null);
comment on policy proveedores_select_authenticated on gmp.proveedores is
  '§3.3: consulta habilitada para todos los roles.';

create policy insumos_catalogo_select_authenticated on gmp.insumos_catalogo
  for select to authenticated using (core.rol() is not null);
comment on policy insumos_catalogo_select_authenticated on gmp.insumos_catalogo is
  '§3.3: consulta habilitada para todos los roles.';

-- Maestros técnicos: administrador del sistema (§3.3, tabla de administración).
create policy depositos_insert_administrador_sistema on gmp.depositos
  for insert to authenticated with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy depositos_insert_administrador_sistema on gmp.depositos is
  '§3.3: «Configurar maestros técnicos (depósitos, equipos, enums)» es exclusivo de SYS.';

create policy depositos_update_administrador_sistema on gmp.depositos
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA'));
comment on policy depositos_update_administrador_sistema on gmp.depositos is
  '§3.3: configuración de maestros técnicos, exclusiva de SYS.';

-- Alta de proveedor: DT, Administración y Gerencia de Producción (§3.3).
create policy proveedores_insert_alta_habilitada on gmp.proveedores
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy proveedores_insert_alta_habilitada on gmp.proveedores is
  '§3.3: «Alta de proveedor» habilitada a DT, ADM y GP. La aprobación, en cambio, es solo de DT y la controla trg_proveedor_aprobacion.';

create policy proveedores_update_alta_habilitada on gmp.proveedores
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy proveedores_update_alta_habilitada on gmp.proveedores is
  '§3.3: edición de la ficha por DT, ADM y GP. El cambio de estado de aprobación queda reservado a DT en el trigger.';

-- Catálogo de insumos: define el circuito técnico de cada material.
create policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy insumos_catalogo_insert_tecnicos on gmp.insumos_catalogo is
  '§3.3: maestro técnico. Lo definen DT y GP, y lo configura SYS.';

create policy insumos_catalogo_update_tecnicos on gmp.insumos_catalogo
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy insumos_catalogo_update_tecnicos on gmp.insumos_catalogo is
  '§3.3: maestro técnico. Lo definen DT y GP, y lo configura SYS.';

-- Sin políticas de DELETE. Ningún maestro se borra: se desactiva.

select core.adjuntar_auditoria('gmp.depositos');
select core.adjuntar_auditoria('gmp.proveedores');
select core.adjuntar_auditoria('gmp.insumos_catalogo');
