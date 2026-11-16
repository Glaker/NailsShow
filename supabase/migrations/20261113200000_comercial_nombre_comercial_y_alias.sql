-- ---------------------------------------------------------------------------
-- Propósito : Nombre comercial y alias de búsqueda por producto para el portal
--             del cliente. Los humectantes y exfoliantes se llaman en el
--             catálogo «HUMECTANTE AMOR 240ml.» y el cliente los busca como
--             «crema»: el portal muestra «Crema humectante Amor 240 ml» y
--             busca también por alias.
-- Reglas    : P2 de docs/PROMPT_PEDIDOS_HADA.md. NO toca gmp.productos.nombre,
--             que es la denominación registrada ante ANMAT: el nombre comercial
--             vive solo en comercial y solo lo usa comercial.cliente_lista().
--             Dirección de dependencia comercial -> gmp (§3.7).
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------

create table comercial.productos_nombre_comercial (
  -- id propio solo para que core.auditoria.registro_id identifique la fila.
  id               uuid not null unique default gen_random_uuid(),
  producto_id      uuid primary key references gmp.productos(id),
  nombre_comercial text not null check (length(btrim(nombre_comercial)) > 0),
  -- Palabras con las que el cliente busca el producto además del nombre.
  alias            text[] not null default '{}'
    constraint productos_nombre_comercial_alias_limpio check (
      array_position(alias, null) is null and array_position(alias, '') is null
      and alias = lower(alias::text)::text[]),
  actualizado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  actualizado_en   timestamptz not null default now()
);

comment on table comercial.productos_nombre_comercial is
  'Nombre comercial y alias de búsqueda que ve el cliente en el portal. No reemplaza la denominación de '
  'gmp.productos (ANMAT). P2 de docs/PROMPT_PEDIDOS_HADA.md.';

create index productos_nombre_comercial_actualizado_por_idx
  on comercial.productos_nombre_comercial (actualizado_por);

alter table comercial.productos_nombre_comercial enable row level security;
alter table comercial.productos_nombre_comercial force  row level security;

grant select, insert, update on comercial.productos_nombre_comercial to authenticated;

create policy productos_nombre_comercial_select_authenticated on comercial.productos_nombre_comercial
  for select to authenticated using (core.rol() is not null);
comment on policy productos_nombre_comercial_select_authenticated on comercial.productos_nombre_comercial is
  'Consulta para los roles internos. El Cliente (sin rol) lo recibe solo a través de cliente_lista().';

create policy productos_nombre_comercial_insert_ventas on comercial.productos_nombre_comercial
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and actualizado_por = core.usuario_actual());
comment on policy productos_nombre_comercial_insert_ventas on comercial.productos_nombre_comercial is
  'Lo carga quien administra la lista mayorista (Ventas, Administración, Gerencia), a su nombre.';

create policy productos_nombre_comercial_update_ventas on comercial.productos_nombre_comercial
  for update to authenticated
  using (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA'))
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and actualizado_por = core.usuario_actual());
comment on policy productos_nombre_comercial_update_ventas on comercial.productos_nombre_comercial is
  'Mismos roles que la carga; el valor anterior queda en core.auditoria. Sin DELETE.';

-- actualizado_en y actualizado_por los pone la base, y el producto de una fila no cambia (se crea otra).
create function comercial.fn_nombre_comercial_antes_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.producto_id is distinct from old.producto_id or new.id is distinct from old.id then
    raise exception 'No se cambia el producto de un nombre comercial (%).', old.producto_id
      using errcode = 'restrict_violation';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := coalesce(core.usuario_actual(), old.actualizado_por);  -- lo sella la base, no el cliente
  return new;
end;
$$;

create trigger trg_nombre_comercial_antes_update
  before update on comercial.productos_nombre_comercial
  for each row execute function comercial.fn_nombre_comercial_antes_update();

select core.adjuntar_auditoria('comercial.productos_nombre_comercial');

-- Carga inicial a nombre de la Dirección Técnica activa (como las otras cargas).
-- Idempotente; un código que no está en el catálogo se saltea.
do $$
declare
  v_autor uuid;
begin
  select id into v_autor from core.usuarios
   where rol = 'DIRECCION_TECNICA' and activo
   order by es_dt_titular desc, creado_en limit 1;
  if v_autor is null then
    return;  -- base sin usuarios: no hay a nombre de quién cargar
  end if;
  perform set_config('request.jwt.claims', json_build_object('usuario_id', v_autor::text)::text, true);

  insert into comercial.productos_nombre_comercial (producto_id, nombre_comercial, alias, actualizado_por)
  select p.id, v.nombre,
         case when v.nombre like 'Crema humectante%'
              then array['crema', 'cremas', 'humectante', 'humectantes']
              else array['crema', 'cremas', 'exfoliante', 'exfoliantes'] end,
         v_autor
    from (values
      ('364', 'Crema exfoliante Amor 240 ml'),
      ('365', 'Crema exfoliante Aire 240 ml'),
      ('366', 'Crema exfoliante Paz 240 ml'),
      ('367', 'Crema exfoliante Amor 100 ml'),
      ('368', 'Crema exfoliante Aire 100 ml'),
      ('369', 'Crema exfoliante Paz 100 ml'),
      ('370', 'Crema humectante Amor 240 ml'),
      ('371', 'Crema humectante Aire 240 ml'),
      ('372', 'Crema humectante Paz 240 ml'),
      ('373', 'Crema humectante Amor 100 ml'),
      ('374', 'Crema humectante Aire 100 ml'),
      ('375', 'Crema humectante Paz 100 ml')
    ) as v(codigo, nombre)
    join gmp.productos p on p.codigo_interno = v.codigo
  on conflict (producto_id) do nothing;
end;
$$;

-- Copia de 20261112130000 con dos cambios: `producto` devuelve el nombre
-- comercial si lo hay, y se agrega `alias`. Cambia el tipo de retorno: DROP.
-- Ninguna otra función ni vista depende de ella.
drop function comercial.cliente_lista();

create function comercial.cliente_lista()
returns table (producto_id uuid, codigo text, producto text, rubro text, orden_lista integer,
               precio_lista numeric, precio_promo numeric, minimo integer, alias text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not comercial.cliente_ve_lista() then
    perform comercial.cliente_exigir();
  end if;
  return query
  select l.producto_id, l.codigo_interno, coalesce(nc.nombre_comercial, l.producto), l.rubro, l.orden_lista,
         l.precio_lista, l.precio_promo, l.minimo, coalesce(nc.alias, '{}'::text[])
    from comercial.v_lista_mayorista l
    left join comercial.productos_nombre_comercial nc on nc.producto_id = l.producto_id
   where not l.es_regalo and l.precio_promo > 0
   order by l.orden_lista nulls last, l.producto;
end;
$$;

comment on function comercial.cliente_lista() is
  'Portal de clientes: lista mayorista con nombre comercial y alias de búsqueda (P2).';

revoke execute on function comercial.cliente_lista() from public, anon;
grant execute on function comercial.cliente_lista() to authenticated;
