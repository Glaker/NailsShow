-- ---------------------------------------------------------------------------
-- Propósito : Sustituir un insumo de la fórmula en una orden ya abierta o
--             liberada sin tocar la orden ni la fórmula firmadas: queda una
--             fila en gmp.orden_sustituciones (registro rectificativo, firmado
--             por la DT) y el descuento de materia prima de la primera tanda
--             la respeta. Se carga la primera: OP-2026-0008 (sanitizante 394,
--             fórmula v1 dada de baja) pasa de 135SAN «alcohol para
--             sanitizante», dado de baja, a 138CL1 «alcohol de cereal
--             (cleanser)».
-- Reglas    : invariante 1 (la orden liberada y la fórmula no se editan),
--             RN-50 (auditoría), D-sustitucion-alcohol-op8-1.
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Solo cambia qué insumo se descuenta, con la misma cantidad que pide la
-- fórmula de la orden. Una vez descontada la materia prima de la orden, la
-- sustitución ya no corre: el consumo es un movimiento y se corrige con un
-- inverso (RN-54). No hay trigger que lo impida porque leería
-- comercial.orden_consumos desde gmp (invariante 7).

create table gmp.orden_sustituciones (
  id                  uuid primary key default gen_random_uuid(),
  orden_id            uuid not null references gmp.ordenes_produccion(id),
  insumo_original_id  uuid not null references gmp.insumos_catalogo(id),
  insumo_reemplazo_id uuid not null references gmp.insumos_catalogo(id),
  motivo              text not null check (btrim(motivo) <> ''),
  registrado_por      uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en       timestamptz not null default now(),
  unique (orden_id, insumo_original_id),
  check (insumo_original_id <> insumo_reemplazo_id)
);
comment on table gmp.orden_sustituciones is
  'D-sustitucion-alcohol-op8-1: insumo de la fórmula reemplazado en una orden, sin editar orden ni fórmula. Append-only.';

alter table gmp.orden_sustituciones enable row level security;
alter table gmp.orden_sustituciones force  row level security;
grant select, insert on gmp.orden_sustituciones to authenticated;

create policy orden_sustituciones_select_autenticados on gmp.orden_sustituciones
  for select to authenticated using (true);
comment on policy orden_sustituciones_select_autenticados on gmp.orden_sustituciones is
  'D-sustitucion-alcohol-op8-1: la leen quienes ven la orden y el descuento de Gerencia de Producción.';
create policy orden_sustituciones_insert_dt on gmp.orden_sustituciones
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA') and registrado_por = core.usuario_actual());
comment on policy orden_sustituciones_insert_dt on gmp.orden_sustituciones is
  'D-sustitucion-alcohol-op8-1: la sustitución la firma la DT, a su nombre. Sin UPDATE ni DELETE.';

select core.adjuntar_auditoria('gmp.orden_sustituciones');

-- comercial.consumir_mp_orden: igual que antes, con el insumo sustituido.
create or replace function comercial.consumir_mp_orden(p_id uuid)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  mp         record;
  v_ficha    text;
  v_necesita numeric(16,4);
  v_consumo  uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Descontar insumos de una orden es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_id;
  if exists (select 1 from comercial.orden_consumos where orden_id = p_id and tanda_numero is null)
     or (select tercero_id from gmp.productos where id = v_orden.producto_id) is not null then
    return;
  end if;
  if lower(v_orden.unidad) not in ('kg', 'l') then
    raise exception 'La orden % está en «%»: para descontar la materia prima tiene que estar en kg o L.',
      v_orden.numero, v_orden.unidad using errcode = 'check_violation';
  end if;
  for mp in
    -- NUEVO (D-sustitucion-alcohol-op8-1): el insumo sustituido en la orden.
    select coalesce(s.insumo_reemplazo_id, c.insumo_id) as insumo_id,
           sum(c.masa_kg) as masa_kg, sum(c.volumen_l) as volumen_l,
           bool_or(c.masa_kg is null) as sin_masa, bool_or(c.volumen_l is null) as sin_volumen,
           i.nombre, i.unidad_medida
      from gmp.calcular_lote(v_orden.formula_id,
             p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
             p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
      left join gmp.orden_sustituciones s on s.orden_id = p_id and s.insumo_original_id = c.insumo_id
      join gmp.insumos_catalogo i on i.id = coalesce(s.insumo_reemplazo_id, c.insumo_id)
     group by 1, i.nombre, i.unidad_medida
  loop
    v_ficha := lower(coalesce(mp.unidad_medida, ''));
    if v_ficha not in ('g', 'kg', 'ml', 'l') then
      raise exception 'La ficha de % está en «%»: un componente de fórmula va en g, kg, ml o L.',
        mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad') using errcode = 'check_violation';
    end if;
    v_necesita := case
      when v_ficha in ('g', 'kg') and not mp.sin_masa then comercial.convertir_cantidad(mp.masa_kg, 'kg', v_ficha)
      when v_ficha in ('ml', 'l') and not mp.sin_volumen then comercial.convertir_cantidad(mp.volumen_l, 'l', v_ficha)
    end;
    if v_necesita is null then
      raise exception
        'Para descontar % hace falta su densidad: la ficha está en % y la fórmula lo da en %. '
        'Cargala en Densidades y volvé a intentar.',
        mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad'), case when mp.sin_masa then 'volumen' else 'masa' end
        using errcode = 'check_violation';
    end if;
    v_necesita := round(v_necesita, 4);
    continue when v_necesita <= 0;

    insert into comercial.orden_consumos (orden_id, insumo_id, unidad, cantidad)
    values (p_id, mp.insumo_id, mp.unidad_medida, v_necesita)
    returning id into v_consumo;
    perform comercial.descontar_insumo_orden(v_consumo,
      format('Orden %s, lote %s', v_orden.numero, v_orden.numero_lote));
  end loop;
end;
$function$;

-- comercial.faltantes_tanda: la misma cuenta que la carga, con el sustituido.
create or replace function comercial.faltantes_tanda(p_orden_id uuid, p_reparto jsonb)
 returns table(insumo_id uuid, codigo text, insumo text, unidad text, necesita numeric, disponible numeric, sin_aprobar numeric, falta numeric, nota text)
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_orden gmp.ordenes_produccion%rowtype;
  v_mp    jsonb := '[]';
begin
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id;
  if not found then
    return;
  end if;
  -- El tercerizado envasa con material del cliente: no es este circuito.
  if (select tercero_id from gmp.productos where id = v_orden.producto_id) is not null then
    return;
  end if;

  -- La materia prima va con la primera tanda: solo si todavía no se descontó.
  -- Se calcula aparte porque gmp.calcular_lote falla sin fórmula.
  if not exists (select 1 from comercial.orden_consumos c
                  where c.orden_id = p_orden_id and c.tanda_numero is null)
     and exists (select 1 from jsonb_array_elements(coalesce(p_reparto, '[]')) x
                  where coalesce((x ->> 'unidades')::integer, 0) > 0)
     and lower(v_orden.unidad) in ('kg', 'l') then
    select coalesce(jsonb_agg(jsonb_build_object('insumo_id', q.insumo_id, 'cantidad', q.cantidad)), '[]')
      into v_mp
      -- NUEVO (D-sustitucion-alcohol-op8-1): el insumo sustituido en la orden.
      from (select i.id as insumo_id,
                   round(case
                     when lower(coalesce(i.unidad_medida, '')) in ('g', 'kg') and not bool_or(c.masa_kg is null)
                       then comercial.convertir_cantidad(sum(c.masa_kg), 'kg', lower(i.unidad_medida))
                     when lower(coalesce(i.unidad_medida, '')) in ('ml', 'l') and not bool_or(c.volumen_l is null)
                       then comercial.convertir_cantidad(sum(c.volumen_l), 'l', lower(i.unidad_medida))
                   end, 4) as cantidad
              from gmp.calcular_lote(v_orden.formula_id,
                     p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
                     p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
              left join gmp.orden_sustituciones s on s.orden_id = p_orden_id and s.insumo_original_id = c.insumo_id
              join gmp.insumos_catalogo i on i.id = coalesce(s.insumo_reemplazo_id, c.insumo_id)
             group by i.id, i.unidad_medida) q;
  end if;

  return query
  with reparto as (
    select (x ->> 'producto_id')::uuid as producto_id, sum((x ->> 'unidades')::integer) as unidades
      from jsonb_array_elements(coalesce(p_reparto, '[]')) x
     where coalesce((x ->> 'unidades')::integer, 0) > 0
     group by 1
  ),
  etiquetado as (
    select r.producto_id,
           least(r.unidades, coalesce((select sum(s.saldo) from comercial.v_etiquetados_saldo s
                                        where s.producto_id = r.producto_id and s.saldo > 0), 0)) as cubierto
      from reparto r
  ),
  -- NUEVO (D-materiales-o-1): la misma elección de opción que la carga.
  materiales as (
    select mu.insumo_id,
           case when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
                then ceil(sum(mu.cantidad))
                else round(sum(mu.cantidad), 4)
           end as cantidad,
           string_agg(distinct 'o en su lugar: ' || mu.alternativa, '; ') as nota
      from reparto r
      left join etiquetado e on e.producto_id = r.producto_id
      cross join lateral comercial.materiales_por_unidades(r.producto_id, r.unidades, coalesce(e.cubierto, 0)) mu
      join gmp.insumos_catalogo i on i.id = mu.insumo_id
     group by mu.insumo_id, i.unidad_medida
  ),
  mp as (
    select (x ->> 'insumo_id')::uuid as insumo_id, (x ->> 'cantidad')::numeric as cantidad
      from jsonb_array_elements(v_mp) x
  ),
  necesidad as (
    select n.insumo_id, sum(n.cantidad) as cantidad,
           string_agg(n.nota, '; ') as nota
      from (select m.insumo_id, m.cantidad, m.nota from materiales m where m.cantidad > 0
            union all
            select p.insumo_id, p.cantidad,
                   case when p.cantidad is null
                        then 'Falta la densidad para pasar la fórmula a la unidad de la ficha.' end
              from mp p
             where p.cantidad is null or p.cantidad > 0) n
     group by n.insumo_id
  ),
  stock as (
    select a.insumo_id,
           coalesce(sum(s.saldo) filter (where gmp.lote_consumible(s.lote_insumo_id)), 0) as disponible,
           coalesce(sum(s.saldo) filter (where not gmp.lote_consumible(s.lote_insumo_id)), 0) as sin_aprobar
      from comercial.articulos a
      join comercial.v_saldos_stock s on s.articulo_id = a.id and s.saldo > 0
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id and l.tercero_id is null
     where a.insumo_id in (select n.insumo_id from necesidad n)
     group by a.insumo_id
  )
  select n.insumo_id, i.codigo_interno, i.nombre, i.unidad_medida,
         n.cantidad, coalesce(st.disponible, 0), coalesce(st.sin_aprobar, 0),
         greatest(coalesce(n.cantidad, 0) - coalesce(st.disponible, 0), 0),
         n.nota
    from necesidad n
    join gmp.insumos_catalogo i on i.id = n.insumo_id
    left join stock st on st.insumo_id = n.insumo_id
   order by greatest(coalesce(n.cantidad, 0) - coalesce(st.disponible, 0), 0) desc, i.nombre;
end;
$function$;

-- Órdenes con 135SAN (hoy OP-2026-0008): 135SAN → 138CL1, firmada por la DT suplente (pedido del
-- codirector técnico, 2026-11-13).
do $$
declare
  v_dt uuid;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com).';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  insert into gmp.orden_sustituciones (orden_id, insumo_original_id, insumo_reemplazo_id, motivo)
  select o.id, a.id, b.id,
         '135SAN (alcohol para sanitizante) dado de baja el 2026-11-13; las fórmulas vigentes de los sanitizantes ya llevan 138CL1 (20261112170000).'
    from gmp.ordenes_produccion o
    join gmp.formula_componentes fc on fc.formula_id = o.formula_id and not fc.anulado
    join gmp.insumos_catalogo a on a.id = fc.insumo_id and a.codigo_interno = '135SAN'
    cross join gmp.insumos_catalogo b
   where b.codigo_interno = '138CL1'
     -- Toda orden con 135SAN que todavía va a descontar materia prima.
     -- Al 2026-11-13 es solo la 0008: la 0001 está anulada y la 0002 tiene
     -- el envasado cerrado.
     and o.estado not in ('ANULADA', 'RECHAZADA')
     and o.terminada_en is null
     and not exists (select 1 from comercial.orden_consumos c
                      where c.orden_id = o.id and c.tanda_numero is null);
  if not exists (select 1 from gmp.orden_sustituciones s
                   join gmp.ordenes_produccion o on o.id = s.orden_id
                  where o.numero = 'OP-2026-0008') then
    raise exception 'OP-2026-0008 no quedó con la sustitución: revisar antes de aplicar.';
  end if;
end;
$$;
