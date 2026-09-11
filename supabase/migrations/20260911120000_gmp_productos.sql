-- ---------------------------------------------------------------------------
-- Propósito : Catálogo de productos terminados (§4.7). Maestro que va a
--             alimentar la carga de la lista provista por la planta y, más
--             adelante, las órdenes de producción y el stock de producto
--             terminado.
-- Reglas    : Ninguna nueva de negocio. §3.3 (maestros técnicos: DT, GP, SYS),
--             RN-50 (auditoría), invariantes 3, 6 y 7 de CLAUDE.md.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- ALCANCE DE ESTA MIGRACIÓN: solo el catálogo `productos`. Las presentaciones
-- (§4.7), los procedimientos, las órdenes de producción y los lotes de
-- producto llegan cuando se construya el circuito de producción. Acá se crea el
-- maestro para poder cargar la lista de productos terminados, que es el pedido
-- concreto: sin catálogo de productos no hay contra qué registrar una
-- producción.
--
-- DOS CAMPOS QUEDAN COMO `text` Y NO COMO ENUM, A PROPÓSITO.
-- §4.7 define `tipo` como `tipo_producto_enum` y `forma_cosmetica` como
-- `forma_cosmetica_enum`, pero el Anexo A no enumera sus valores y el documento
-- no los fija en ningún lado. Inventarlos sería inventar una regla de negocio
-- (CLAUDE.md §7). El vocabulario real sale de la lista que va a cargar la
-- planta, igual que el `tipo_insumo` salió del catálogo de insumos. Hasta
-- entonces son `text`: cuando la lista defina los valores, se promueven a enum
-- con una migración de endurecimiento. `origen`, en cambio, sí tiene sus tres
-- valores fijados en §4.7, así que va como enum desde ahora.

create type gmp.origen_producto_enum as enum (
  'FABRICADO',    -- se elabora el granel y se fracciona en planta (ME.40.26)
  'FRACCIONADO',  -- se recibe el granel de un tercero y se fracciona (ME.40.27)
  'IMPORTADO'     -- producto terminado que entra ya acondicionado
);

comment on type gmp.origen_producto_enum is
  '§4.7: cómo llega el producto al circuito. Define qué recorrido de producción le corresponde.';

create table gmp.productos (
  id                uuid primary key default gen_random_uuid(),
  codigo_interno    text not null unique check (length(btrim(codigo_interno)) > 0),
  nombre            text not null check (length(btrim(nombre)) > 0),
  -- Variante del producto: color, terminación, línea. Nullable porque no todo
  -- producto la tiene.
  variedad          text,
  -- `tipo` y `forma_cosmetica` en text hasta que la lista real fije el
  -- vocabulario. Ver el encabezado.
  tipo              text,
  forma_cosmetica   text,
  origen            gmp.origen_producto_enum not null default 'FABRICADO',
  -- Vida útil en meses, de donde sale el vencimiento del lote (§4.7). Nullable
  -- porque la lista puede no traerlo; se completa después. No se pone un
  -- default numérico: un 24 inventado se leería como un dato y no lo es.
  vida_util_meses   integer check (vida_util_meses is null or vida_util_meses > 0),
  activo            boolean not null default true,
  creado_en         timestamptz not null default now()
);

comment on table gmp.productos is
  'Catálogo de productos terminados (§4.7). Maestro de la carga de la lista de la planta y base de las órdenes de producción.';
comment on column gmp.productos.tipo is
  'Clase de producto. `text` hasta que la lista cargada fije el vocabulario; entonces se promueve a enum (§4.7).';
comment on column gmp.productos.vida_util_meses is
  'Vida útil en meses. Fuente del vencimiento del lote de producto. Nullable hasta que la lista lo aporte.';

create index productos_nombre_idx on gmp.productos (nombre);
create index productos_tipo_idx   on gmp.productos (tipo);

-- ===========================================================================
-- RLS (invariante 3)
-- ===========================================================================

alter table gmp.productos enable row level security;
alter table gmp.productos force  row level security;

grant select, insert, update on gmp.productos to authenticated;

create policy productos_select_authenticated on gmp.productos
  for select to authenticated using (core.rol() is not null);
comment on policy productos_select_authenticated on gmp.productos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

-- Maestro técnico, mismo conjunto que el catálogo de insumos: lo definen DT y
-- GP, y lo configura SYS (§3.3).
create policy productos_insert_tecnicos on gmp.productos
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy productos_insert_tecnicos on gmp.productos is
  '§3.3: maestro técnico. Lo definen DT y GP, y lo configura SYS.';

create policy productos_update_tecnicos on gmp.productos
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION', 'ADMINISTRADOR_SISTEMA'));
comment on policy productos_update_tecnicos on gmp.productos is
  '§3.3: maestro técnico. Lo definen DT y GP, y lo configura SYS.';

-- Sin política de DELETE. Un producto no se borra: se desactiva.

select core.adjuntar_auditoria('gmp.productos');
