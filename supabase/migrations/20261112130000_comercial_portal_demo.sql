-- ---------------------------------------------------------------------------
-- Propósito : Cuenta de demostración del portal de clientes: un CLIENTE
--             marcado es_ejemplo entra al portal con la lista de precios y la
--             escala reales, pero sin cliente vinculado. Sus pedidos son de
--             ejemplo y viven solo en la pantalla: no escribe nada y no le
--             llega nada a Ventas ni a Producción.
-- Reglas    : D-portal-clientes-1 (provisorio).
-- Fecha     : 2026-11-12
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico del 2026-11-12: «una cuenta de prueba en la
-- que se vea cómo funciona, con pedidos de ejemplo en los distintos estados,
-- y que un pedido que haga no sea real ni le llegue a Mati».
--
-- La cuenta de demostración no tiene fila en comercial.clientes_usuarios, así
-- que comercial.cliente_exigir() la rechaza: no puede enviar, corregir,
-- cancelar ni ver pedidos. Solo se le abren la lista y la escala.

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_usuario core.usuarios%rowtype;
  v_claims  jsonb;
begin
  select * into v_usuario
    from core.usuarios
   where auth_user_id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  if found and v_usuario.activo and v_usuario.rol = 'CLIENTE' then
    -- Portal de clientes (20261110160100): sin rol, para que ninguna política
    -- interna lo deje pasar; solo las funciones comercial.cliente_*.
    -- es_demo (20261112130000): cuenta de demostración, pedidos de ejemplo.
    v_claims := v_claims
      || jsonb_build_object(
           'rol',        null,
           'roles',      '[]'::jsonb,
           'usuario_id', v_usuario.id::text,
           'nombre',     v_usuario.nombre_completo,
           'es_cliente', true,
           'es_demo',    v_usuario.es_ejemplo
         );
  elsif found and v_usuario.activo then
    v_claims := v_claims
      || jsonb_build_object(
           'rol',         v_usuario.rol::text,
           'roles',       to_jsonb(
                            array(
                              select distinct r::text
                                from unnest(
                                  array[v_usuario.rol] || v_usuario.roles_adicionales
                                ) as r
                            )
                          ),
           'usuario_id',  v_usuario.id::text,
           'sector',      v_usuario.sector::text,
           'nombre',      v_usuario.nombre_completo,
           'es_dt_titular', v_usuario.es_dt_titular,
           'es_cliente',  false
         );
  else
    v_claims := v_claims
      || jsonb_build_object('rol', null, 'roles', '[]'::jsonb, 'usuario_id', null, 'es_cliente', false);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function core.custom_access_token_hook(jsonb) is
  'Inyecta rol, usuario_id y sector en el JWT. Un CLIENTE va sin rol y con es_cliente; el de demostración, con es_demo '
  '(20261112130000). Habilitado en el proyecto alojado con `supabase config push`.';

-- ¿Puede ver la lista? Un cliente vinculado, o la cuenta de demostración.
create function comercial.cliente_ve_lista()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select comercial.cliente_actual() is not null
      or exists (select 1 from core.usuarios
                  where id = core.usuario_actual() and rol = 'CLIENTE' and activo and es_ejemplo);
$$;

create or replace function comercial.cliente_lista()
returns table (producto_id uuid, codigo text, producto text, rubro text, orden_lista integer,
               precio_lista numeric, precio_promo numeric, minimo integer)
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
  select l.producto_id, l.codigo_interno, l.producto, l.rubro, l.orden_lista,
         l.precio_lista, l.precio_promo, l.minimo
    from comercial.v_lista_mayorista l
   where not l.es_regalo and l.precio_promo > 0
   order by l.orden_lista nulls last, l.producto;
end;
$$;

create or replace function comercial.cliente_escala()
returns table (desde_monto numeric, porcentaje numeric)
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
  select e.desde_monto, e.porcentaje
    from comercial.v_escala_descuento e
   order by e.desde_monto;
end;
$$;

revoke execute on function comercial.cliente_ve_lista() from public, anon;
grant execute on function comercial.cliente_ve_lista() to authenticated;
