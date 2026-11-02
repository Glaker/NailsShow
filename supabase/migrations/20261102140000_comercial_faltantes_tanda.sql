-- ---------------------------------------------------------------------------
-- Propósito : Antes de cargar lo que salió de una orden, ver todo lo que falta
--             de insumos, no solo el primero. comercial.registrar_tanda corta
--             en el primer insumo que no alcanza; esta función hace la misma
--             cuenta sin escribir nada y devuelve cada insumo con lo que
--             necesita, lo que hay y lo que falta.
-- Reglas    : RN-13 (solo se consume material aprobado: gmp.lote_consumible),
--             D-tandas-1. Pedido del 2026-11-02 (Gerencia de Producción no
--             sabía qué le faltaba para cargar el removedor).
-- Fecha     : 2026-11-02
-- ---------------------------------------------------------------------------
--
-- LA MISMA CUENTA QUE LA CARGA.
--   - Materia prima del granel: solo si la orden todavía no la descontó (la
--     primera tanda), con gmp.calcular_lote como comercial.consumir_mp_orden.
--   - Lista de materiales de cada producto: unidades × cantidad por unidad /
--     (1 − merma), hacia arriba si se cuenta por unidad. Envase y etiqueta,
--     menos lo que cubren los envases ya etiquetados del producto.
--   - Disponible: saldo de lotes consumibles, sin tercerizados. Lo que hay
--     pero no se puede usar (cuarentena, análisis, vencido) va aparte.
-- Si cambia la cuenta de registrar_tanda, cambia acá también.
--
-- SECURITY INVOKER: lee con los permisos de quien pregunta, como la pantalla.

create or replace function comercial.faltantes_tanda(p_orden_id uuid, p_reparto jsonb)
returns table (
  insumo_id   uuid,
  codigo      text,
  insumo      text,
  unidad      text,
  necesita    numeric,
  disponible  numeric,
  sin_aprobar numeric,
  falta       numeric,
  nota        text
)
language plpgsql
stable
set search_path = ''
as $$
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
      from (select c.insumo_id,
                   round(case
                     when lower(coalesce(i.unidad_medida, '')) in ('g', 'kg') and not bool_or(c.masa_kg is null)
                       then comercial.convertir_cantidad(sum(c.masa_kg), 'kg', lower(i.unidad_medida))
                     when lower(coalesce(i.unidad_medida, '')) in ('ml', 'l') and not bool_or(c.volumen_l is null)
                       then comercial.convertir_cantidad(sum(c.volumen_l), 'l', lower(i.unidad_medida))
                   end, 4) as cantidad
              from gmp.calcular_lote(v_orden.formula_id,
                     p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
                     p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
              join gmp.insumos_catalogo i on i.id = c.insumo_id
             group by c.insumo_id, i.unidad_medida) q;
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
  materiales as (
    select ma.insumo_id,
           case when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
                then ceil(sum((r.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                 then coalesce(e.cubierto, 0) else 0 end)
                              * ma.cantidad_por_unidad / (1 - ma.merma)))
                else round(sum((r.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                  then coalesce(e.cubierto, 0) else 0 end)
                               * ma.cantidad_por_unidad / (1 - ma.merma)), 4)
           end as cantidad,
           null::text as nota
      from reparto r
      join gmp.materiales_acondicionamiento ma on ma.producto_id = r.producto_id and ma.activo
      join gmp.insumos_catalogo i on i.id = ma.insumo_id
      left join etiquetado e on e.producto_id = r.producto_id
     group by ma.insumo_id, i.unidad_medida
  ),
  mp as (
    select (x ->> 'insumo_id')::uuid as insumo_id, (x ->> 'cantidad')::numeric as cantidad
      from jsonb_array_elements(v_mp) x
  ),
  necesidad as (
    select n.insumo_id, sum(n.cantidad) as cantidad,
           string_agg(n.nota, '; ') as nota
      from (select m.insumo_id, m.cantidad, null::text as nota from materiales m where m.cantidad > 0
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
$$;

comment on function comercial.faltantes_tanda(uuid, jsonb) is
  'Lo que necesita, lo que hay y lo que falta de cada insumo para cargar esa tanda de la orden, con la misma '
  'cuenta que comercial.registrar_tanda y sin escribir nada.';

revoke execute on function comercial.faltantes_tanda(uuid, jsonb) from public, anon;
grant execute on function comercial.faltantes_tanda(uuid, jsonb) to authenticated;
