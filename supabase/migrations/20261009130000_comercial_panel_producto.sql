-- ---------------------------------------------------------------------------
-- Propósito : Fase 2 del módulo de costos: panel por producto. Foto mensual
--             del costo de cada producto (para que la historia no se reescriba
--             cuando cambia un precio), historia de precios por banda, y stock
--             valorizado de producto terminado y de insumos.
-- Reglas    : R-10 (identificación específica: insumo = saldo del lote × costo
--             del lote), D-38 (quién ve costos), D-47 (foto mensual sin cron),
--             RN-50, RN-59 (el precio vigente a una fecha es reconstruible).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- FOTO MENSUAL SIN CRON (D-47). Una tarea programada correría como `postgres`
-- y core.es_escritura_privilegiada marca como anomalía toda escritura que no
-- venga de `authenticated` (CLAUDE.md §5). La foto del mes EN CURSO la toma la
-- sesión de quien abre costos (comercial.tomar_foto_costos(), SECURITY
-- INVOKER) y se va actualizando hasta que el mes termina; un mes cerrado queda
-- congelado. Si en un mes nadie abrió costos, ese mes no tiene foto y el
-- gráfico lo muestra como hueco: no se inventa.
--
-- NADIE ESCRIBE LA FOTO A MANO. La tabla tiene GRANT de escritura (la función
-- es INVOKER), así que el trigger exige la marca de transacción que sólo pone
-- tomar_foto_costos(): un usuario de costos no puede cargar por la API una
-- foto con valores inventados. PostgREST sólo deja fijar parámetros request.*.
--
-- BANDAS DE PRECIO. Las tres que existen: consumidor final (precios_producto),
-- mayorista de lista y mayorista con promoción (lista_mayorista). Todas se
-- cargan con IVA incluido; acá se comparan siempre NETAS (precio / (1 + IVA)).
-- La mayorista no descuenta la escala por monto del pedido (0 a 35 %,
-- 20261001130000): su margen real es menor que el que muestra la banda.

-- ===========================================================================
-- 1. Foto mensual del costo por producto
-- ===========================================================================

create table comercial.fotos_costo_producto (
  id                 uuid primary key default gen_random_uuid(),
  mes                date not null check (mes = date_trunc('month', mes)::date),
  producto_id        uuid not null references gmp.productos(id),
  costo_unitario     numeric(18,4),
  granel             numeric(18,4),
  acondicionamiento  numeric(18,4),
  mano_de_obra       numeric(18,4),
  faltantes          integer not null,
  formula_estado     text,
  detalle            jsonb not null,
  tomada_por         uuid references core.usuarios(id) default core.usuario_actual(),
  tomada_en          timestamptz not null default now(),
  unique (mes, producto_id)
);

create index fotos_costo_producto_producto_idx on comercial.fotos_costo_producto (producto_id, mes);

comment on table comercial.fotos_costo_producto is
  'Costo de cada producto mes a mes (D-47). El mes en curso se actualiza con cada tomar_foto_costos(); un mes '
  'cerrado no se toca. detalle = desglose por componente al momento de la foto.';

-- Desde la aplicación: sólo el mes en curso (hora argentina), sólo a través
-- de tomar_foto_costos(), sin mover una foto de mes ni de producto. Sólo la
-- dueña (postgres: migraciones y carga de práctica) escribe meses pasados.
create function comercial.fn_foto_mes_abierto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', comercial.hoy())::date;
begin
  if current_user <> 'postgres' then
    if coalesce(current_setting('comercial.tomando_foto', true), '') <> 'si' then
      raise exception 'La foto de costos la toma el sistema (comercial.tomar_foto_costos), no se carga a mano.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.mes <> v_mes or (tg_op = 'UPDATE' and (old.mes <> v_mes or old.mes <> new.mes
                                                  or old.producto_id <> new.producto_id)) then
      raise exception 'La foto de un mes cerrado no se modifica.' using errcode = 'check_violation';
    end if;
  end if;
  new.tomada_en := now();
  new.tomada_por := core.usuario_actual();
  return new;
end;
$$;

create trigger trg_foto_mes_abierto
  before insert or update on comercial.fotos_costo_producto
  for each row execute function comercial.fn_foto_mes_abierto();

create function comercial.tomar_foto_costos()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', comercial.hoy())::date;
  v_n   integer;
begin
  if not core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') then
    return 0;  -- sin rol de costos no hay nada que fotografiar (ni que leer)
  end if;
  perform set_config('comercial.tomando_foto', 'si', true);
  insert into comercial.fotos_costo_producto
    (mes, producto_id, costo_unitario, granel, acondicionamiento, mano_de_obra, faltantes, formula_estado, detalle)
  select v_mes, c.producto_id,
         sum(c.subtotal),
         sum(c.subtotal) filter (where c.tipo = 'GRANEL'),
         sum(c.subtotal) filter (where c.tipo = 'ACONDICIONAMIENTO'),
         sum(c.subtotal) filter (where c.tipo = 'MANO_DE_OBRA'),
         count(*) filter (where c.falta is not null),
         (select fc.estado::text from comercial.formula_para_costo(c.producto_id) fc),
         jsonb_agg(to_jsonb(c) - 'producto_id' order by c.orden)
    from comercial.costos_productos() c
   group by c.producto_id
   -- Siempre en el mismo orden: dos sesiones a la vez no se traban entre sí.
   order by c.producto_id
  on conflict (mes, producto_id) do update
     set costo_unitario    = excluded.costo_unitario,
         granel            = excluded.granel,
         acondicionamiento = excluded.acondicionamiento,
         mano_de_obra      = excluded.mano_de_obra,
         faltantes         = excluded.faltantes,
         formula_estado    = excluded.formula_estado,
         detalle           = excluded.detalle
   -- Sólo lo que cambió: abrir el panel sin cambios no llena la auditoría.
   where (comercial.fotos_costo_producto.costo_unitario, comercial.fotos_costo_producto.faltantes,
          comercial.fotos_costo_producto.formula_estado, comercial.fotos_costo_producto.detalle)
         is distinct from (excluded.costo_unitario, excluded.faltantes, excluded.formula_estado, excluded.detalle);
  get diagnostics v_n = row_count;
  perform set_config('comercial.tomando_foto', '', true);
  return v_n;
end;
$$;

comment on function comercial.tomar_foto_costos() is
  'Foto del costo de todos los productos activos para el mes en curso (D-47). La llama la pantalla de costos al '
  'abrirse, por POST (escribe).';

-- ===========================================================================
-- 2. Historia de precios netos por banda, mes a mes
-- ===========================================================================

-- El momento de carga de un precio lo pone la base: si no, un precio cargado
-- con fecha atrasada reescribiría la historia de meses pasados. Sólo la dueña
-- (migraciones y carga de práctica) puede fijarlo.
create function comercial.fn_sello_carga_precio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'postgres' then
    new.cargado_en := now();
  end if;
  return new;
end;
$$;

create trigger trg_precios_producto_sello before insert on comercial.precios_producto
  for each row execute function comercial.fn_sello_carga_precio();
create trigger trg_lista_mayorista_sello before insert on comercial.lista_mayorista
  for each row execute function comercial.fn_sello_carga_precio();

create function comercial.historia_precios(p_producto_id uuid, p_meses integer default 12)
returns table (mes date, banda text, precio_neto numeric)
language sql
stable
set search_path = ''
as $$
  with meses as (
    select (date_trunc('month', comercial.hoy()) - make_interval(months => g))::date as mes
      from generate_series(0, least(greatest(p_meses, 1), 120) - 1) g
  ),
  -- Fin de cada mes en hora argentina, como timestamptz.
  cortes as (
    select mes, ((mes + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires') as hasta
      from meses
  )
  select c.mes, 'CONSUMIDOR_FINAL', round(cf.precio_lista / (1 + cf.alicuota_iva / 100), 4)
    from cortes c
    cross join lateral (
      select p.precio_lista, p.alicuota_iva from comercial.precios_producto p
       where p.producto_id = p_producto_id and p.cargado_en < c.hasta
       order by p.cargado_en desc, p.orden desc limit 1
    ) cf
  union all
  -- La lista mayorista guarda el precio por UNIDAD del pack; el código (y su
  -- costo y su stock) es el pack entero.
  select c.mes, b.banda, round(b.precio * lm.unidades_pack / (1 + lm.alicuota_iva / 100), 4)
    from cortes c
    cross join lateral (
      select l.precio_lista, l.precio_promo, l.alicuota_iva, l.unidades_pack, l.es_regalo
        from comercial.lista_mayorista l
       where l.producto_id = p_producto_id and l.cargado_en < c.hasta
       order by l.cargado_en desc, l.orden desc limit 1
    ) lm
    cross join lateral (values ('MAYORISTA', lm.precio_lista), ('MAYORISTA_PROMO', lm.precio_promo)) b(banda, precio)
   where not lm.es_regalo and b.precio > 0
  order by 1, 2;
$$;

comment on function comercial.historia_precios(uuid, integer) is
  'Precio NETO por código de cada banda (consumidor final, mayorista, mayorista con promoción) vigente al cierre de '
  'cada uno de los últimos p_meses meses (hasta 120). Mayorista = precio por unidad × unidades del pack, sin la escala '
  'de descuento por monto.';

-- ===========================================================================
-- 3. Stock valorizado
-- ===========================================================================

-- Insumos: identificación específica. Saldo de cada lote (en la unidad del
-- lote) llevado a la unidad del catálogo × costo unitario de ESE lote.
create view comercial.v_stock_valorizado_insumos
with (security_invoker = true) as
select s.articulo_id, s.lote_insumo_id, l.insumo_id, i.codigo_interno, i.nombre as insumo, i.tipo, s.deposito_id,
       s.saldo, s.unidad, i.unidad_medida, x.saldo_unidad_catalogo,
       c.costo_unitario_ars, c.origen as origen_costo,
       round(x.saldo_unidad_catalogo * c.costo_unitario_ars, 2) as valor_ars
  from comercial.v_saldos_stock s
  join gmp.lotes_insumo l on l.id = s.lote_insumo_id
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  cross join lateral (
    select comercial.convertir_cantidad(s.saldo, s.unidad, i.unidad_medida, comercial.densidad_insumo(l.insumo_id))
             as saldo_unidad_catalogo
  ) x
  left join comercial.v_costos_lote_unitario c on c.lote_insumo_id = s.lote_insumo_id
 where s.saldo <> 0
   and core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION');

comment on view comercial.v_stock_valorizado_insumos is
  'Saldo de cada lote × costo de ese lote (R-10). valor_ars nulo = lote sin costo cargado o sin unidad convertible. '
  'Sin rol de costos, ninguna fila.';

-- Producto terminado: el lote de PT no tiene costo propio registrado; se
-- valoriza al costo del producto de la foto del mes en curso (la que toma la
-- pantalla al abrirse), sin volver a costear todo en cada lectura.
create view comercial.v_stock_valorizado_pt
with (security_invoker = true) as
select s.deposito_id, s.deposito, s.producto_id, s.producto, s.saldo, s.retenido,
       f.costo_unitario, f.faltantes,
       round(s.saldo * f.costo_unitario, 2) as valor_ars
  from comercial.v_stock_pt s
  left join comercial.fotos_costo_producto f
         on f.producto_id = s.producto_id and f.mes = date_trunc('month', comercial.hoy())::date
 where s.saldo <> 0
   and core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION');

comment on view comercial.v_stock_valorizado_pt is
  'Saldo de producto terminado × costo unitario de la foto del mes (gestión). faltantes > 0 = costo incompleto; '
  'faltantes nulo = sin foto este mes (producto inactivo o costos sin abrir).';

-- ===========================================================================
-- 4. RLS, permisos y auditoría
-- ===========================================================================

alter table comercial.fotos_costo_producto enable row level security;
alter table comercial.fotos_costo_producto force  row level security;

grant select, insert, update on comercial.fotos_costo_producto to authenticated;
grant select on comercial.v_stock_valorizado_insumos, comercial.v_stock_valorizado_pt to authenticated;
grant execute on function comercial.tomar_foto_costos(), comercial.historia_precios(uuid, integer) to authenticated;

create policy fotos_costo_producto_select_costos on comercial.fotos_costo_producto
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy fotos_costo_producto_select_costos on comercial.fotos_costo_producto is 'D-38.';
create policy fotos_costo_producto_insert_costos on comercial.fotos_costo_producto
  for insert to authenticated
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy fotos_costo_producto_insert_costos on comercial.fotos_costo_producto is
  'D-47, RN-50: la foto la toma tomar_foto_costos() con la sesión de quien abre costos; el trigger rechaza '
  'cualquier escritura directa y los meses cerrados.';
create policy fotos_costo_producto_update_costos on comercial.fotos_costo_producto
  for update to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy fotos_costo_producto_update_costos on comercial.fotos_costo_producto is
  'D-47: sólo el mes en curso y sólo desde tomar_foto_costos() (trigger trg_foto_mes_abierto).';

select core.adjuntar_auditoria('comercial.fotos_costo_producto');
