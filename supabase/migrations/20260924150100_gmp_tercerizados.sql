-- ---------------------------------------------------------------------------
-- Propósito : Producción para terceros («tercerizados»), lado regulado:
--             quién es el tercero, de quién es cada lote de insumo, insumos de
--             nombre genérico, productos propios del tercero (nuevos o un
--             producto de Nail Show con otra etiqueta) y el ingreso de su
--             material con recepción automática que entra al mismo circuito
--             de calidad que el resto.
-- Reglas    : RN-01, RN-03, RN-48 (se siguen aplicando: el material del
--             tercero entra por el mismo trigger de validación), RN-05
--             (identificación inequívoca del lote), RN-50 (auditoría), §3.3
--             (quién da de alta maestros y registra recepciones), I.20.1 e
--             I.20.2 (recepción y rótulo de cuarentena).
--             Especificación del codirector técnico del 2026-09-24
--             (docs/ESTADO.md, «Pedidos del codirector técnico», ítem 2).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- POR QUÉ EL TERCERO VIVE EN gmp Y NO EN comercial.
-- El material del tercero es un lote de insumo que Nail Show recibe, pone en
-- cuarentena, muestrea y aprueba o rechaza: es gmp. De quién es ese lote es un
-- dato del lote, y gmp no puede apuntar a comercial (invariante 7). Así que el
-- tercero se define acá y comercial lo referencia (pedidos, clientes).
--
-- QUÉ NO CAMBIA.
-- El circuito de calidad es el mismo. Un lote del tercero nace RECIBIDO, se
-- rotula en CUARENTENA en la misma operación del ingreso, y lo aprueba la
-- Dirección Técnica como a cualquier otro. «Recepción automática» quiere decir
-- que Nazarena no carga un remito aparte: no quiere decir que el material
-- saltee la recepción. La recepción existe, con número, y se ve en la lista.
--
-- «SIN PROVEEDOR».
-- Los proveedores del tercero son surtidos e imposibles de registrar uno por
-- uno (codirector técnico, 2026-09-24). gmp.recepciones exige proveedor, y esa
-- exigencia es la que responde «de dónde vino esto». La respuesta honesta acá
-- es «lo trajo el cliente»: cada tercero tiene un proveedor genérico «Provisto
-- por <tercero>», creado solo, que queda PENDIENTE de aprobación como
-- cualquier alta. Inventar un proveedor real sería peor que decir la verdad.

-- ===========================================================================
-- 1. Terceros
-- ===========================================================================

create table gmp.terceros (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) > 0),
  -- Color del cuadrito en pantalla, de la paleta de Mantine. No es un dato
  -- regulado; va acá para que todos lo vean igual.
  color         text not null default 'teal'
                check (color in ('teal', 'cyan', 'blue', 'indigo', 'grape', 'pink',
                                 'red', 'orange', 'yellow', 'lime', 'green')),
  activo        boolean not null default true,
  observaciones text,
  creado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en     timestamptz not null default now()
);

comment on table gmp.terceros is
  'Clientes para los que Nail Show fabrica («tercerizados»). Titular del material que traen y de sus productos. '
  'Se desactiva, no se borra (mismo criterio que RN-49).';

create unique index terceros_nombre_idx on gmp.terceros (lower(btrim(nombre)));

alter table gmp.terceros enable row level security;
alter table gmp.terceros force  row level security;

grant select, insert, update on gmp.terceros to authenticated;

create policy terceros_select_authenticated on gmp.terceros
  for select to authenticated using (core.rol() is not null);
comment on policy terceros_select_authenticated on gmp.terceros is
  '§3.3: consulta de maestros habilitada para todos los roles.';

create policy terceros_insert_pedidos on gmp.terceros
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA'));
comment on policy terceros_insert_pedidos on gmp.terceros is
  'Quien carga pedidos puede dar de alta un cliente tercerizado desde el pedido (especificación del 2026-09-24).';

create policy terceros_update_pedidos on gmp.terceros
  for update to authenticated
  using (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA'));
comment on policy terceros_update_pedidos on gmp.terceros is
  'Mismo conjunto que el alta: nombre, color, observaciones y desactivación.';

select core.adjuntar_auditoria('gmp.terceros');

-- ===========================================================================
-- 2. Proveedor genérico del tercero
-- ===========================================================================

alter table gmp.proveedores
  add column tercero_id uuid unique references gmp.terceros(id);

comment on column gmp.proveedores.tercero_id is
  'Si no es nulo, es el proveedor genérico «Provisto por <tercero>»: el material lo trajo ese cliente y su '
  'origen real no se registra (especificación del 2026-09-24).';

create or replace function gmp.proveedor_de_tercero(p_tercero_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid;
  v_tercero gmp.terceros%rowtype;
begin
  select id into v_id from gmp.proveedores where tercero_id = p_tercero_id;
  if found then
    return v_id;
  end if;

  select * into v_tercero from gmp.terceros where id = p_tercero_id;
  if not found then
    raise exception 'El cliente tercerizado % no existe.', p_tercero_id;
  end if;

  insert into gmp.proveedores (razon_social, tercero_id, observaciones)
  values (
    'Provisto por ' || v_tercero.nombre,
    v_tercero.id,
    'Proveedor genérico: el material lo entrega el cliente tercerizado y no se registra su origen.'
  )
  on conflict (tercero_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from gmp.proveedores where tercero_id = p_tercero_id;
  end if;

  return v_id;
end;
$$;

comment on function gmp.proveedor_de_tercero(uuid) is
  'Proveedor genérico del tercero, creándolo si falta. SECURITY INVOKER: la política de alta de proveedores rige.';

grant execute on function gmp.proveedor_de_tercero(uuid) to authenticated;

-- ===========================================================================
-- 3. Insumos genéricos y titular del lote
-- ===========================================================================
--
-- Dos preguntas distintas:
--   - insumos_catalogo.tercero_id: el insumo es propio de ese tercero
--     («envase cristal 100 cc» de Navi). Nulo = catálogo de Nail Show, que
--     puede tener stock de los dos (alcohol, por ejemplo).
--   - lotes_insumo.tercero_id: de quién es ESTE lote. Nulo = de Nail Show.
-- La segunda es la que decide el stock; la primera solo impide que un insumo
-- propio de un tercero aparezca como stock de otro.

alter table gmp.insumos_catalogo
  add column tercero_id uuid references gmp.terceros(id);

comment on column gmp.insumos_catalogo.tercero_id is
  'Insumo genérico propio de un cliente tercerizado. Nulo = catálogo de Nail Show (compartible con terceros).';

create index insumos_catalogo_tercero_idx on gmp.insumos_catalogo (tercero_id) where tercero_id is not null;

alter table gmp.lotes_insumo
  add column tercero_id uuid references gmp.terceros(id);

comment on column gmp.lotes_insumo.tercero_id is
  'Titular del material. Nulo = Nail Show. No cambia después del alta: de quién es un lote es lo que se '
  'constató al recibirlo.';

create index lotes_insumo_tercero_idx on gmp.lotes_insumo (tercero_id) where tercero_id is not null;

create or replace function gmp.fn_lote_titular()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_propio uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tercero_id is distinct from old.tercero_id then
      raise exception 'El titular de un lote no cambia: es lo que se constató al recibirlo.'
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  select tercero_id into v_propio from gmp.insumos_catalogo where id = new.insumo_id;
  if v_propio is not null and new.tercero_id is distinct from v_propio then
    raise exception 'Ese insumo es propio de otro cliente tercerizado: su stock solo puede ser de ese cliente.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lote_titular
  before insert or update on gmp.lotes_insumo
  for each row execute function gmp.fn_lote_titular();

-- Depósito del material de terceros. Segregado del de Nail Show: el material
-- del cliente no se mezcla en estantería con el propio. Los inflamables siguen
-- yendo al exterior por RN-48 (lo resuelve gmp.fn_validar_lote_insumo).
insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior, activo)
values ('TER', 'Tercerizados — material de clientes', null, null, false, true)
on conflict (numero) do nothing;

-- Alta de un insumo genérico del tercero. El código lo pone la base
-- («T-00001»): quien carga «envase cristal 100 cc» no tiene un código que
-- ofrecer, y uno inventado a mano choca tarde o temprano con uno de Nail Show.
create or replace function gmp.alta_insumo_tercero(
  p_tercero_id    uuid,
  p_nombre        text,
  p_tipo          gmp.tipo_insumo_enum,
  p_unidad        text,
  p_es_inflamable boolean default false
)
returns gmp.insumos_catalogo
language plpgsql
set search_path = ''
as $$
declare
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  if not exists (select 1 from gmp.terceros where id = p_tercero_id and activo) then
    raise exception 'El cliente tercerizado no existe o está desactivado.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Poné un nombre que describa el insumo (por ejemplo «envase cristal 100 cc»).'
      using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_unidad, ''))) = 0 then
    raise exception 'Falta la unidad de medida.' using errcode = 'check_violation';
  end if;

  insert into gmp.insumos_catalogo (
    codigo_interno, nombre, tipo, unidad_medida, es_inflamable,
    requiere_protocolo, requiere_pesada_recepcion,
    deposito_cuarentena_id, tercero_id
  )
  values (
    'T-' || lpad(gmp.siguiente_numero('insumo_tercero', 0)::text, 5, '0'),
    btrim(p_nombre), p_tipo, btrim(p_unidad), coalesce(p_es_inflamable, false),
    false, false,
    (select id from gmp.depositos where numero = 'TER'),
    p_tercero_id
  )
  returning * into v_insumo;

  return v_insumo;
end;
$$;

comment on function gmp.alta_insumo_tercero(uuid, text, gmp.tipo_insumo_enum, text, boolean) is
  'Alta de insumo genérico propio de un tercero, con código T-nnnnn asignado por la base. SECURITY INVOKER: '
  'rige la política de alta del catálogo (DT, GP, SYS).';

grant execute on function gmp.alta_insumo_tercero(uuid, text, gmp.tipo_insumo_enum, text, boolean) to authenticated;

-- ===========================================================================
-- 4. Ingreso del material del tercero: recepción automática
-- ===========================================================================
--
-- p_items: [{ "insumo_id": uuid, "cantidad": numeric, "lote": text?,
--             "vence": date?, "bultos": int?, "protocolo": bool?,
--             "peso_kg": numeric? }]
--
-- Una recepción por ingreso, un lote por renglón, cada lote rotulado en
-- CUARENTENA en la misma transacción. `protocolo` y `peso_kg` solo hacen
-- falta para los insumos que los exigen (RN-01, RN-03): el trigger de
-- validación del lote los sigue pidiendo igual que en una recepción común.
--
-- Sin lote del proveedor, el lote se identifica con el número de recepción:
-- RN-05 pide identificación inequívoca, y «sin lote» no identifica nada.
--
-- La carga a stock NO se hace acá: es comercial y gmp no depende de comercial
-- (invariante 7). La hace comercial.ingresar_stock_tercero(), que llama a ésta.

create or replace function gmp.ingresar_insumo_tercero(
  p_tercero_id              uuid,
  p_items                   jsonb,
  p_remito                  text    default null,
  p_observaciones           text    default null,
  p_contenedores_limpiados  boolean default true
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tercero   gmp.terceros%rowtype;
  v_recepcion gmp.recepciones%rowtype;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_lote      gmp.lotes_insumo%rowtype;
  v_deposito  uuid;
  e           jsonb;
  v_cantidad  numeric;
begin
  select * into v_tercero from gmp.terceros where id = p_tercero_id;
  if not found or not v_tercero.activo then
    raise exception 'El cliente tercerizado no existe o está desactivado.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada para ingresar.' using errcode = 'check_violation';
  end if;
  if not coalesce(p_contenedores_limpiados, false) then
    raise exception 'I.20.1: los contenedores se limpian antes de ingresar el material a cuarentena.'
      using errcode = 'check_violation';
  end if;

  select id into v_deposito from gmp.depositos where numero = 'TER';

  insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido, observaciones)
  values (
    gmp.proveedor_de_tercero(p_tercero_id),
    coalesce(nullif(btrim(p_remito), ''), 'Sin remito'),
    -- No hay orden de compra de Nail Show contra la cual comparar: lo que
    -- llega es lo que el cliente declara que trae, y eso es lo que se carga.
    true,
    nullif(btrim(coalesce(p_observaciones, '')), '')
  )
  returning * into v_recepcion;

  for e in select * from jsonb_array_elements(p_items)
  loop
    select * into v_insumo from gmp.insumos_catalogo where id = (e ->> 'insumo_id')::uuid;
    if not found then
      raise exception 'Un renglón apunta a un insumo que no existe.' using errcode = 'check_violation';
    end if;
    if not v_insumo.activo then
      raise exception '«%» está desactivado y no admite ingresos.', v_insumo.nombre using errcode = 'check_violation';
    end if;

    v_cantidad := (e ->> 'cantidad')::numeric;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad de «%» tiene que ser mayor que cero.', v_insumo.nombre
        using errcode = 'check_violation';
    end if;

    insert into gmp.lotes_insumo (
      recepcion_id, insumo_id, tercero_id, lote_proveedor, plazo_validez,
      cantidad_bultos, cantidad_unidades, unidad,
      protocolo_recibido, peso_pigmento_kg, contenedores_limpiados,
      deposito_actual_id
    )
    values (
      v_recepcion.id, v_insumo.id, p_tercero_id,
      coalesce(nullif(btrim(e ->> 'lote'), ''), 'S/L ' || v_recepcion.numero),
      nullif(e ->> 'vence', '')::date,
      greatest(coalesce((e ->> 'bultos')::integer, 1), 1),
      v_cantidad,
      coalesce(v_insumo.unidad_medida, ''),
      coalesce((e ->> 'protocolo')::boolean, false),
      nullif(e ->> 'peso_kg', '')::numeric,
      true,
      -- El inflamable queda en nulo para que RN-48 lo mande al exterior.
      case when v_insumo.es_inflamable then null else v_deposito end
    )
    returning * into v_lote;

    perform gmp.emitir_rotulo_lote_insumo(v_lote.id, 'CUARENTENA');
  end loop;

  return v_recepcion.id;
end;
$$;

comment on function gmp.ingresar_insumo_tercero(uuid, jsonb, text, text, boolean) is
  'Ingreso del material de un tercero: recepción con su proveedor genérico, un lote por renglón con titular, '
  'rótulo de CUARENTENA. El control de calidad sigue igual. SECURITY INVOKER: rigen las políticas de recepción.';

grant execute on function gmp.ingresar_insumo_tercero(uuid, jsonb, text, text, boolean) to authenticated;

-- ===========================================================================
-- 5. Productos del tercero
-- ===========================================================================
--
-- Dos casos (codirector técnico, 2026-09-24):
--   - Producto totalmente nuevo: sin base, lista de materiales propia.
--   - Producto que Nail Show ya fabrica con otra etiqueta: `producto_base_id`
--     apunta al de Nail Show y la lista de materiales se copia al alta, para
--     que después se cambie la etiqueta (o lo que difiera) en la lista.
-- La fórmula del granel es la del producto base: el granel es el mismo.

alter table gmp.productos
  add column tercero_id       uuid references gmp.terceros(id),
  add column producto_base_id uuid references gmp.productos(id);

comment on column gmp.productos.tercero_id is
  'Producto de un cliente tercerizado. Nulo = producto de Nail Show.';
comment on column gmp.productos.producto_base_id is
  'Producto de Nail Show del que éste es una variante con otra etiqueta. Su fórmula de granel es la del base.';

alter table gmp.productos
  add constraint productos_base_solo_tercero check (producto_base_id is null or tercero_id is not null),
  add constraint productos_base_distinto check (producto_base_id is distinct from id);

create index productos_tercero_idx on gmp.productos (tercero_id) where tercero_id is not null;

create or replace function gmp.alta_producto_tercero(
  p_tercero_id uuid,
  p_nombre     text,
  p_base_id    uuid default null,
  p_variedad   text default null
)
returns gmp.productos
language plpgsql
set search_path = ''
as $$
declare
  v_producto gmp.productos%rowtype;
  v_base     gmp.productos%rowtype;
begin
  if not exists (select 1 from gmp.terceros where id = p_tercero_id and activo) then
    raise exception 'El cliente tercerizado no existe o está desactivado.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Falta el nombre del producto.' using errcode = 'check_violation';
  end if;

  if p_base_id is not null then
    select * into v_base from gmp.productos where id = p_base_id;
    if not found or v_base.tercero_id is not null then
      raise exception 'El producto base tiene que ser un producto de Nail Show.' using errcode = 'check_violation';
    end if;
  end if;

  insert into gmp.productos (
    codigo_interno, nombre, variedad, tipo, forma_cosmetica, origen, vida_util_meses,
    tercero_id, producto_base_id
  )
  values (
    'TP-' || lpad(gmp.siguiente_numero('producto_tercero', 0)::text, 5, '0'),
    btrim(p_nombre),
    coalesce(nullif(btrim(coalesce(p_variedad, '')), ''), v_base.variedad),
    v_base.tipo, v_base.forma_cosmetica, coalesce(v_base.origen, 'FABRICADO'), v_base.vida_util_meses,
    p_tercero_id, p_base_id
  )
  returning * into v_producto;

  if p_base_id is not null then
    insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, merma, origen)
    select v_producto.id, m.insumo_id, m.cantidad_por_unidad, m.merma,
           'Copia de ' || v_base.codigo_interno || ' al alta'
      from gmp.materiales_acondicionamiento m
     where m.producto_id = p_base_id and m.activo;
  end if;

  return v_producto;
end;
$$;

comment on function gmp.alta_producto_tercero(uuid, text, uuid, text) is
  'Alta de producto de un tercero con código TP-nnnnn. Con base, copia la lista de materiales activa del producto '
  'de Nail Show para cambiarle después la etiqueta. SECURITY INVOKER: rigen las políticas de maestros.';

grant execute on function gmp.alta_producto_tercero(uuid, text, uuid, text) to authenticated;
