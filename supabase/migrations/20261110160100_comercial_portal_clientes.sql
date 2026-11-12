-- ---------------------------------------------------------------------------
-- Propósito : Portal de clientes: un cliente mayorista entra desde el celular,
--             arma su pedido sobre la lista mayorista con la escala de
--             descuentos, lo envía y, mientras Ventas no lo tomó, lo corrige
--             o lo cancela. Ventas lo aprueba, lo edita o pide fecha a
--             Producción como cualquier pedido de venta.
-- Reglas    : RN-49, D-portal-clientes-1 (provisorio), §4.12.1.
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- SEGURIDAD. Casi todas las políticas de lectura dejan pasar a cualquiera con
-- rol (core.rol() is not null). Un cliente NO puede tener rol en el JWT: el
-- hook lo emite con rol nulo, roles vacíos y es_cliente = true, igual que una
-- cuenta sin habilitar. No lee ninguna tabla: todo lo hace por las funciones
-- comercial.cliente_*, SECURITY DEFINER, que resuelven su cliente por
-- comercial.clientes_usuarios y solo devuelven la lista de precios y SUS
-- pedidos. usuario_id va en el JWT para que la autoría quede a su nombre.
--
-- De paso se cierran dos lecturas que no miraban el rol y que una cuenta sin
-- rol (cliente o no habilitada) podía hacer: comercial.movimientos_pt
-- (using true) y core.v_nomina (vista sin security_invoker).

-- ===========================================================================
-- 1. Hook: el cliente entra sin rol interno
-- ===========================================================================

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
    v_claims := v_claims
      || jsonb_build_object(
           'rol',        null,
           'roles',      '[]'::jsonb,
           'usuario_id', v_usuario.id::text,
           'nombre',     v_usuario.nombre_completo,
           'es_cliente', true
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
  'Inyecta rol, usuario_id y sector en el JWT. Un CLIENTE va sin rol y con es_cliente (20261110160100). Habilitado en '
  'el proyecto alojado con `supabase config push`.';

-- ===========================================================================
-- 2. Lecturas que no miraban el rol
-- ===========================================================================

alter policy movimientos_pt_select_authenticated on comercial.movimientos_pt
  using (core.rol() is not null);
comment on policy movimientos_pt_select_authenticated on comercial.movimientos_pt is
  'Consulta para todos los roles internos. Sin rol (cliente, cuenta sin habilitar) no ve nada (20261110160100).';

create or replace view core.v_nomina as
select u.id, u.nombre_completo, u.rol, u.activo, u.es_ejemplo
  from core.usuarios u
 where core.rol() is not null;

comment on view core.v_nomina is
  'Nombre y rol de cada usuario, para mostrar autores. Solo para roles internos (20261110160100).';

-- ===========================================================================
-- 3. Qué cliente es cada cuenta
-- ===========================================================================

create table comercial.clientes_usuarios (
  usuario_id  uuid primary key references core.usuarios(id),
  cliente_id  uuid not null references comercial.clientes(id),
  creado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en   timestamptz not null default now()
);

comment on table comercial.clientes_usuarios is
  'Cuenta del portal de clientes → cliente mayorista (D-portal-clientes-1). La cuenta tiene que tener rol CLIENTE.';

create index clientes_usuarios_cliente_idx on comercial.clientes_usuarios (cliente_id);

-- SECURITY DEFINER: Ventas y Administración no leen core.usuarios (nómina
-- restringida); el trigger solo mira el rol de la cuenta que se vincula.
create function comercial.fn_cliente_usuario_valida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from core.usuarios where id = new.usuario_id and rol = 'CLIENTE') then
    raise exception 'Solo una cuenta con rol Cliente se vincula a un cliente.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.usuario_id is distinct from old.usuario_id then
    raise exception 'El vínculo no cambia de cuenta: se cambia el cliente.' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_cliente_usuario_valida
  before insert or update on comercial.clientes_usuarios
  for each row execute function comercial.fn_cliente_usuario_valida();

alter table comercial.clientes_usuarios enable row level security;
alter table comercial.clientes_usuarios force  row level security;
grant select, insert, update on comercial.clientes_usuarios to authenticated;

create policy clientes_usuarios_select_ventas on comercial.clientes_usuarios
  for select to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA', 'ADMINISTRACION', 'VENTAS', 'GERENCIA'));
comment on policy clientes_usuarios_select_ventas on comercial.clientes_usuarios is
  'D-portal-clientes-1: quién da acceso a los clientes y Gerencia. El cliente no lee la tabla.';
create policy clientes_usuarios_insert_ventas on comercial.clientes_usuarios
  for insert to authenticated
  with check (core.es_rol('ADMINISTRADOR_SISTEMA', 'ADMINISTRACION', 'VENTAS')
              and creado_por = core.usuario_actual());
comment on policy clientes_usuarios_insert_ventas on comercial.clientes_usuarios is
  'D-portal-clientes-1: Sistemas, Administración o Ventas vinculan la cuenta con su cliente.';
create policy clientes_usuarios_update_ventas on comercial.clientes_usuarios
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA', 'ADMINISTRACION', 'VENTAS'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA', 'ADMINISTRACION', 'VENTAS'));
comment on policy clientes_usuarios_update_ventas on comercial.clientes_usuarios is
  'D-portal-clientes-1: corregir a qué cliente corresponde la cuenta. Sin DELETE: se desactiva la cuenta (RN-49).';

select core.adjuntar_auditoria('comercial.clientes_usuarios');

-- ===========================================================================
-- 4. Pedido enviado por el cliente
-- ===========================================================================

alter table comercial.pedidos
  add column enviado_por_cliente_en timestamptz;

comment on column comercial.pedidos.enviado_por_cliente_en is
  'Lo armó y envió el cliente desde el portal (última vez que lo envió). Null = lo cargó Ventas.';

-- Copia de 20261001130000: el cliente no tiene rol, así que sus cambios al
-- pedido (observaciones, reenvío, cancelar) pasan solo si vienen de las
-- funciones del portal, que marcan la transacción (comercial.portal_cliente).
-- Mismo patrón que comercial.lote_pt_asignado: set_config no se expone por
-- PostgREST.
create or replace function comercial.fn_pedido_entrega_solo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS') then
    return new;
  end if;
  if current_setting('comercial.portal_cliente', true) = '1' then
    return new;
  end if;
  if (to_jsonb(new) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota'])
     = (to_jsonb(old) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota']) then
    return new;
  end if;
  if old.entregado_en is not null or new.entregado_en is null or new.estado <> 'CUMPLIDO'
     or (to_jsonb(new) - array['entregado_en','entregado_por','estado'])
        is distinct from (to_jsonb(old) - array['entregado_en','entregado_por','estado']) then
    raise exception 'Desde el depósito solo se marca la entrega de un pedido despachado.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from comercial.v_pendientes_despacho where pedido_id = new.id and pendiente > 0) then
    raise exception 'Al pedido % le quedan productos por despachar.', new.numero using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 5. Funciones del portal
-- ===========================================================================

-- El cliente de la cuenta que llama, o null.
create function comercial.cliente_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cu.cliente_id
    from comercial.clientes_usuarios cu
    join core.usuarios u on u.id = cu.usuario_id
    join comercial.clientes c on c.id = cu.cliente_id
   where cu.usuario_id = core.usuario_actual()
     and u.rol = 'CLIENTE' and u.activo and c.activo;
$$;

create function comercial.cliente_exigir()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid := comercial.cliente_actual();
begin
  if v is null then
    raise exception 'Tu cuenta todavía no está vinculada a un cliente. Escribinos y la habilitamos.'
      using errcode = 'insufficient_privilege';
  end if;
  return v;
end;
$$;

create function comercial.cliente_perfil()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('cliente', c.razon_social,
                            'nombre', (select nombre_completo from core.usuarios where id = core.usuario_actual()))
    from comercial.clientes c
   where c.id = comercial.cliente_exigir();
$$;

create function comercial.cliente_lista()
returns table (producto_id uuid, codigo text, producto text, rubro text, orden_lista integer,
               precio_lista numeric, precio_promo numeric, minimo integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.producto_id, l.codigo_interno, l.producto, l.rubro, l.orden_lista,
         l.precio_lista, l.precio_promo, l.minimo
    from comercial.v_lista_mayorista l
   where comercial.cliente_exigir() is not null
     and not l.es_regalo and l.precio_promo > 0
   order by l.orden_lista nulls last, l.producto;
$$;

create function comercial.cliente_escala()
returns table (desde_monto numeric, porcentaje numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.desde_monto, e.porcentaje
    from comercial.v_escala_descuento e
   where comercial.cliente_exigir() is not null
   order by e.desde_monto;
$$;

create function comercial.cliente_pedidos()
returns table (id uuid, numero text, estado text, enviado_en timestamptz, fecha_entrega date,
               editable boolean, cancelado boolean, observaciones text, renglones jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.numero, p.estado::text, coalesce(p.enviado_por_cliente_en, p.creado_en), p.fecha_entrega,
         p.estado = 'BORRADOR' and p.eliminado_en is null and p.enviado_por_cliente_en is not null,
         p.eliminado_en is not null or p.estado = 'CANCELADO',
         p.observaciones,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'producto_id', r.producto_id, 'cantidad', r.cantidad,
                     'producto', pr.nombre, 'codigo', pr.codigo_interno) order by pr.codigo_interno)
                     from comercial.pedido_renglones r
                     join gmp.productos pr on pr.id = r.producto_id
                    where r.pedido_id = p.id and not r.anulado), '[]'::jsonb)
    from comercial.pedidos p
   where p.cliente_id = comercial.cliente_exigir() and p.es_venta
   order by p.creado_en desc
   limit 60;
$$;

-- Envía un pedido nuevo (p_id null) o corrige uno enviado que Ventas todavía
-- no tomó (sigue en BORRADOR). p_renglones: [{producto_id, cantidad}].
create function comercial.cliente_enviar_pedido(p_id uuid, p_renglones jsonb, p_observaciones text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := comercial.cliente_exigir();
  v_pedido  comercial.pedidos%rowtype;
  v_id      uuid;
  v_numero  text;
  v_mal     text;
begin
  perform set_config('comercial.portal_cliente', '1', true);
  if jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  create temp table if not exists cliente_renglones (producto_id uuid, cantidad numeric) on commit drop;
  truncate cliente_renglones;
  insert into cliente_renglones
  select (x ->> 'producto_id')::uuid, (x ->> 'cantidad')::numeric
    from jsonb_array_elements(p_renglones) x;

  if exists (select 1 from cliente_renglones
              where producto_id is null or cantidad is null or cantidad <= 0
                 or cantidad <> trunc(cantidad) or cantidad > 100000) then
    raise exception 'Cada producto lleva una cantidad entera entre 1 y 100000.' using errcode = 'check_violation';
  end if;
  if exists (select producto_id from cliente_renglones group by 1 having count(*) > 1) then
    raise exception 'Hay un producto repetido en el pedido.' using errcode = 'check_violation';
  end if;
  select string_agg(coalesce(pr.codigo_interno, t.producto_id::text), ', ') into v_mal
    from cliente_renglones t
    left join gmp.productos pr on pr.id = t.producto_id
   where not exists (select 1 from comercial.v_lista_mayorista l
                      where l.producto_id = t.producto_id and not l.es_regalo and l.precio_promo > 0);
  if v_mal is not null then
    raise exception 'Estos productos ya no están en la lista: %. Sacalos y volvé a enviar.', v_mal
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_venta'));
    select format('V-%s', lpad((coalesce(max(substring(numero from '^V-(\d+)$')::int), 0) + 1)::text, 4, '0'))
      into v_numero from comercial.pedidos where numero ~ '^V-\d+$';
    insert into comercial.pedidos (numero, cliente, cliente_id, es_venta, observaciones, enviado_por_cliente_en)
    select v_numero, c.razon_social, c.id, true, nullif(btrim(coalesce(p_observaciones, '')), ''), now()
      from comercial.clientes c where c.id = v_cliente
    returning id into v_id;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
    select v_id, producto_id, cantidad from cliente_renglones;
    return v_id;
  end if;

  select * into v_pedido from comercial.pedidos where id = p_id for update;
  if not found or v_pedido.cliente_id is distinct from v_cliente or not v_pedido.es_venta
     or v_pedido.enviado_por_cliente_en is null then
    raise exception 'Ese pedido no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if v_pedido.estado <> 'BORRADOR' or v_pedido.eliminado_en is not null then
    raise exception 'Ventas ya está preparando el pedido %: pediles el cambio por WhatsApp.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  update comercial.pedido_renglones r set anulado = true
   where r.pedido_id = p_id and not r.anulado
     and not exists (select 1 from cliente_renglones t where t.producto_id = r.producto_id);
  update comercial.pedido_renglones r set cantidad = t.cantidad
    from cliente_renglones t
   where r.pedido_id = p_id and not r.anulado and r.producto_id = t.producto_id
     and r.cantidad <> t.cantidad;
  insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
  select p_id, t.producto_id, t.cantidad
    from cliente_renglones t
   where not exists (select 1 from comercial.pedido_renglones r
                      where r.pedido_id = p_id and not r.anulado and r.producto_id = t.producto_id);
  update comercial.pedidos
     set observaciones = nullif(btrim(coalesce(p_observaciones, '')), ''), enviado_por_cliente_en = now()
   where id = p_id;
  return p_id;
end;
$$;

-- Cancela un pedido enviado que Ventas todavía no tomó.
create function comercial.cliente_cancelar_pedido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := comercial.cliente_exigir();
  v_pedido  comercial.pedidos%rowtype;
begin
  perform set_config('comercial.portal_cliente', '1', true);
  select * into v_pedido from comercial.pedidos where id = p_id for update;
  if not found or v_pedido.cliente_id is distinct from v_cliente or v_pedido.enviado_por_cliente_en is null then
    raise exception 'Ese pedido no es tuyo.' using errcode = 'insufficient_privilege';
  end if;
  if v_pedido.estado <> 'BORRADOR' or v_pedido.eliminado_en is not null then
    raise exception 'Ventas ya está preparando el pedido %: pediles que lo cancelen.', v_pedido.numero
      using errcode = 'check_violation';
  end if;
  update comercial.reservas_pt
     set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
         motivo_liberacion = format('Pedido %s cancelado por el cliente.', v_pedido.numero)
   where pedido_id = p_id and not liberada;
  update comercial.pedidos
     set estado = 'CANCELADO', eliminado_en = now(), eliminado_por = core.usuario_actual(),
         motivo_eliminacion = 'Cancelado por el cliente desde el portal'
   where id = p_id;
end;
$$;

comment on function comercial.cliente_enviar_pedido(uuid, jsonb, text) is
  'Portal de clientes (D-portal-clientes-1): envía un pedido de venta nuevo o corrige uno enviado que sigue en BORRADOR.';
comment on function comercial.cliente_cancelar_pedido(uuid) is
  'Portal de clientes: cancela un pedido enviado que Ventas todavía no tomó.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'comercial.cliente_actual()', 'comercial.cliente_exigir()', 'comercial.cliente_perfil()',
    'comercial.cliente_lista()', 'comercial.cliente_escala()', 'comercial.cliente_pedidos()',
    'comercial.cliente_enviar_pedido(uuid, jsonb, text)', 'comercial.cliente_cancelar_pedido(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
