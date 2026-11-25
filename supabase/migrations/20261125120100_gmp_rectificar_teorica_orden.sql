-- ---------------------------------------------------------------------------
-- Propósito : Rectificar la cantidad teórica de una orden de producción sin
--             editar la orden (invariante 1): registro nuevo con el valor
--             anterior, el nuevo, el motivo, quién y cuándo. El descuento de
--             materia prima (consumir_mp_orden) y el aviso de faltantes
--             (faltantes_tanda) usan la vigente. Se rectifica OP-2026-0029.
-- Reglas    : Invariante 1 de CLAUDE.md (corrección por registro
--             rectificativo, como D-rectificar-etapa-1), RN-50 (auditado).
--             Caso del 2026-11-25: OP-2026-0029, HUMECTANTE PAZ 240 ml, 336
--             unidades, abierta con 80.640 kg (240 «kg» por unidad) en vez de
--             80,64 kg; el envasado pedía 80.640 kg de 372CREMA.
-- Fecha     : 2026-11-25
-- ---------------------------------------------------------------------------
--
-- Solo antes de descontar la materia prima: después, el stock ya salió con la
-- cantidad anterior y se corrige con un ajuste, no con esto.

-- ===========================================================================
-- 1. Rectificaciones
-- ===========================================================================

create table gmp.ordenes_teorica_rectificaciones (
  id                uuid primary key default gen_random_uuid(),
  orden             bigint generated always as identity,
  orden_id          uuid not null references gmp.ordenes_produccion(id),
  cantidad_anterior numeric(14,3) not null,
  cantidad          numeric(14,3) not null check (cantidad > 0),
  motivo            text not null check (btrim(motivo) <> ''),
  rectifico_por     uuid not null references core.usuarios(id) default core.usuario_actual(),
  rectifico_en      timestamptz not null default now()
);

comment on table gmp.ordenes_teorica_rectificaciones is
  'Rectificación de la cantidad teórica de una orden (invariante 1): vale la última. Append-only: se carga con '
  'gmp.rectificar_teorica_orden.';

create index ordenes_teorica_rectificaciones_orden_idx
  on gmp.ordenes_teorica_rectificaciones (orden_id, orden desc);
create index ordenes_teorica_rectificaciones_rectifico_por_idx
  on gmp.ordenes_teorica_rectificaciones (rectifico_por);

alter table gmp.ordenes_teorica_rectificaciones enable row level security;
alter table gmp.ordenes_teorica_rectificaciones force  row level security;
grant select on gmp.ordenes_teorica_rectificaciones to authenticated;

-- Sin políticas de escritura: se cargan solo con gmp.rectificar_teorica_orden.
create policy ordenes_teorica_rectificaciones_select_authenticated on gmp.ordenes_teorica_rectificaciones
  for select to authenticated using (core.rol() is not null);
comment on policy ordenes_teorica_rectificaciones_select_authenticated on gmp.ordenes_teorica_rectificaciones is
  'Todo usuario interno ve las rectificaciones, como la orden. RN-50: se escriben solo por función, auditadas.';

select core.adjuntar_auditoria('gmp.ordenes_teorica_rectificaciones');

-- La misma de 20261120121700: una rectificación no se modifica.
create trigger trg_ordenes_teorica_rectificaciones_inmutable
  before update on gmp.ordenes_teorica_rectificaciones
  for each row execute function gmp.fn_rectificacion_inmutable();

create function gmp.teorica_vigente(p_orden_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select r.cantidad from gmp.ordenes_teorica_rectificaciones r
                    where r.orden_id = p_orden_id order by r.orden desc limit 1),
                  (select o.cantidad_teorica from gmp.ordenes_produccion o where o.id = p_orden_id));
$$;
comment on function gmp.teorica_vigente(uuid) is
  'Cantidad teórica vigente de una orden: la de la última rectificación, o la original.';
revoke execute on function gmp.teorica_vigente(uuid) from public, anon;
grant execute on function gmp.teorica_vigente(uuid) to authenticated;

create function gmp.rectificar_teorica_orden(p_orden_id uuid, p_cantidad numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden gmp.ordenes_produccion%rowtype;
  v_id    uuid;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'La cantidad teórica de una orden la rectifica Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Escribí el motivo de la rectificación.' using errcode = 'check_violation';
  end if;
  if not (p_cantidad > 0) then
    raise exception 'La cantidad teórica tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;
  if coalesce(v_orden.unidades_previstas, 0) > 0 and p_cantidad / v_orden.unidades_previstas > 5 then
    raise exception 'La cantidad teórica da % % por unidad: ningún producto lleva más de 5.',
      round(p_cantidad / v_orden.unidades_previstas, 3), v_orden.unidad using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.orden_consumos c where c.orden_id = p_orden_id and c.tanda_numero is null) then
    raise exception 'La materia prima de la orden % ya se descontó: corregí el stock con un ajuste.', v_orden.numero
      using errcode = 'check_violation';
  end if;
  insert into gmp.ordenes_teorica_rectificaciones (orden_id, cantidad_anterior, cantidad, motivo)
  values (p_orden_id, gmp.teorica_vigente(p_orden_id), p_cantidad, btrim(p_motivo))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function gmp.rectificar_teorica_orden(uuid, numeric, text) is
  'Rectifica la cantidad teórica de una orden antes de descontar la materia prima (invariante 1). Dirección Técnica.';
revoke execute on function gmp.rectificar_teorica_orden(uuid, numeric, text) from public, anon;
grant execute on function gmp.rectificar_teorica_orden(uuid, numeric, text) to authenticated;

-- ===========================================================================
-- 2. Descuento y faltantes con la vigente
-- ===========================================================================
-- Copias de las vigentes en producción (20261113130000). Único cambio: la
-- línea marcada NUEVO.

CREATE OR REPLACE FUNCTION comercial.consumir_mp_orden(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  -- NUEVO (2026-11-25): la cantidad teórica vigente, con la rectificación si la hay.
  v_orden.cantidad_teorica := gmp.teorica_vigente(p_id);
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

CREATE OR REPLACE FUNCTION comercial.faltantes_tanda(p_orden_id uuid, p_reparto jsonb)
 RETURNS TABLE(insumo_id uuid, codigo text, insumo text, unidad text, necesita numeric, disponible numeric, sin_aprobar numeric, falta numeric, nota text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_orden gmp.ordenes_produccion%rowtype;
  v_mp    jsonb := '[]';
begin
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id;
  -- NUEVO (2026-11-25): la cantidad teórica vigente, con la rectificación si la hay.
  v_orden.cantidad_teorica := gmp.teorica_vigente(p_orden_id);
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

-- ===========================================================================
-- 3. OP-2026-0029: 336 × 240 g = 80,64 kg
-- ===========================================================================
-- A nombre de la Dirección Técnica suplente, como 20261113130000 (pedido del
-- codirector técnico, 2026-11-25).
do $$
declare
  v_dt uuid;
  v_op uuid;
begin
  select id into v_op from gmp.ordenes_produccion
   where numero = 'OP-2026-0029' and cantidad_teorica = 80640 and unidades_previstas = 336;
  if v_op is null then
    return;  -- base sin esa orden (práctica, pruebas)
  end if;
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
  perform gmp.rectificar_teorica_orden(v_op, 80.64,
    'Abierta con 240 kg por unidad en vez de 240 g: 336 × 240 g = 80,64 kg. '
    'Cargado por Claude a pedido del codirector técnico, 2026-11-25.');
end;
$$;
