-- ---------------------------------------------------------------------------
-- Propósito : Materiales alternativos («o») en la lista de un producto: un
--             grupo con opciones numeradas, cada opción con uno o más insumos.
--             Al cargar lo que salió se usa la primera opción que tenga stock
--             y, si no alcanza, se completa con la siguiente. El removedor de
--             120 ml queda con «envase con pico» o «envase con tetón + pico».
-- Reglas    : RN-13 (solo se consume material aprobado), RN-54, D-tandas-1.
--             Pedido del codirector técnico del 2026-11-02 (D-materiales-o-1).
-- Fecha     : 2026-11-02
-- ---------------------------------------------------------------------------
--
-- CÓMO SE ELIGE.
-- comercial.materiales_por_unidades(producto, unidades, cubierto) devuelve qué
-- insumo y cuánto se necesita para esas unidades. Lo que no está en un grupo,
-- como siempre. En un grupo, recorre las opciones en orden: cada una cubre
-- tantas unidades como le alcance el stock consumible de su insumo más
-- escaso; lo que ninguna cubre se le pide a la primera, que es la que avisa
-- que falta (con la alternativa en el aviso). Los envases ya etiquetados
-- cubren el grupo si alguno de sus insumos es envase o etiqueta.
--
-- Lo que planifica (necesidad de pedidos, costos, etiquetado) no tiene stock
-- en la cuenta: usa la primera opción, la preferida.
--
-- ponytail: si dos productos de una misma tanda comparten un insumo de un
-- grupo, cada uno ve el stock entero al elegir; la carga igual frena si no
-- alcanza (descontar_insumo_orden), así que el riesgo es un aviso, no un
-- descuento de más.

-- 1. Grupo y opción en la lista de materiales
alter table gmp.materiales_acondicionamiento
  add column alternativa_grupo  text,
  add column alternativa_opcion smallint,
  add constraint materiales_alternativa_completa check (
    (alternativa_grupo is null) = (alternativa_opcion is null)
    and (alternativa_opcion is null or alternativa_opcion >= 1)
    and (alternativa_grupo is null or length(btrim(alternativa_grupo)) > 0)
  );

comment on column gmp.materiales_acondicionamiento.alternativa_grupo is
  'Grupo «o»: los materiales del producto con el mismo grupo son alternativas entre sí (D-materiales-o-1).';
comment on column gmp.materiales_acondicionamiento.alternativa_opcion is
  'Opción dentro del grupo: los insumos con la misma opción van juntos; la 1 es la preferida.';

-- 2. Qué insumos y cuánto, eligiendo la opción por stock
create or replace function comercial.materiales_por_unidades(
  p_producto_id uuid, p_unidades numeric, p_cubierto numeric default 0
)
returns table (insumo_id uuid, cantidad numeric, alternativa text)
language plpgsql
stable
set search_path = ''
as $$
declare
  g       record;
  o       record;
  v_resto numeric;
  v_toma  numeric;
begin
  -- Sin grupo: como siempre.
  return query
    select ma.insumo_id,
           (p_unidades - case when ma.rol in ('ENVASE', 'ETIQUETA') then p_cubierto else 0 end)
             * ma.cantidad_por_unidad / (1 - ma.merma),
           null::text
      from gmp.materiales_acondicionamiento ma
     where ma.producto_id = p_producto_id and ma.activo and ma.alternativa_grupo is null;

  for g in
    select ma.alternativa_grupo as grupo,
           bool_or(ma.rol in ('ENVASE', 'ETIQUETA')) as cubre,
           min(ma.alternativa_opcion) as primera
      from gmp.materiales_acondicionamiento ma
     where ma.producto_id = p_producto_id and ma.activo and ma.alternativa_grupo is not null
     group by 1
  loop
    v_resto := p_unidades - case when g.cubre then p_cubierto else 0 end;
    continue when v_resto <= 0;

    for o in
      select ma.alternativa_opcion as opcion,
             min(floor(coalesce(st.disponible, 0)
                       / nullif(ma.cantidad_por_unidad / (1 - ma.merma), 0))) as capacidad
        from gmp.materiales_acondicionamiento ma
        left join lateral (
          select sum(s.saldo) as disponible
            from comercial.articulos a
            join comercial.v_saldos_stock s on s.articulo_id = a.id and s.saldo > 0
            join gmp.lotes_insumo l on l.id = s.lote_insumo_id and l.tercero_id is null
           where a.insumo_id = ma.insumo_id and gmp.lote_consumible(s.lote_insumo_id)
        ) st on true
       where ma.producto_id = p_producto_id and ma.activo and ma.alternativa_grupo = g.grupo
       group by 1
       order by 1
    loop
      exit when v_resto <= 0;
      v_toma := least(v_resto, greatest(coalesce(o.capacidad, 0), 0));
      continue when v_toma <= 0;
      return query
        select ma.insumo_id, v_toma * ma.cantidad_por_unidad / (1 - ma.merma), null::text
          from gmp.materiales_acondicionamiento ma
         where ma.producto_id = p_producto_id and ma.activo
           and ma.alternativa_grupo = g.grupo and ma.alternativa_opcion = o.opcion;
      v_resto := v_resto - v_toma;
    end loop;

    -- Lo que ninguna opción cubre se le pide a la preferida, con las otras en el aviso.
    if v_resto > 0 then
      return query
        select ma.insumo_id, v_resto * ma.cantidad_por_unidad / (1 - ma.merma),
               (select string_agg(x.txt, ' o ' order by x.opcion)
                  from (select m2.alternativa_opcion as opcion,
                               string_agg(i2.nombre, ' + ' order by i2.nombre) as txt
                          from gmp.materiales_acondicionamiento m2
                          join gmp.insumos_catalogo i2 on i2.id = m2.insumo_id
                         where m2.producto_id = p_producto_id and m2.activo
                           and m2.alternativa_grupo = g.grupo and m2.alternativa_opcion <> g.primera
                         group by 1) x)
          from gmp.materiales_acondicionamiento ma
         where ma.producto_id = p_producto_id and ma.activo
           and ma.alternativa_grupo = g.grupo and ma.alternativa_opcion = g.primera;
    end if;
  end loop;
end;
$$;

comment on function comercial.materiales_por_unidades(uuid, numeric, numeric) is
  'Insumos y cantidades de la lista de materiales para esas unidades, eligiendo en cada grupo «o» la opción con '
  'stock consumible, en orden (D-materiales-o-1). cantidad sin redondear: la redondea quien la usa.';
revoke execute on function comercial.materiales_por_unidades(uuid, numeric, numeric) from public, anon;
grant execute on function comercial.materiales_por_unidades(uuid, numeric, numeric) to authenticated;

-- 3. Lo que consume o calcula con la lista de materiales
--
-- Carga y faltantes: eligen la opción por stock. Necesidad de pedidos, costos y
-- etiquetado: cuentan solo la primera opción (la preferida). Copias de la base
-- vigente; lo nuevo va marcado «NUEVO (D-materiales-o-1)».

create or replace function comercial.registrar_tanda(p_orden_id uuid, p_fecha date, p_reparto jsonb, p_observaciones text DEFAULT NULL::text, p_finaliza boolean DEFAULT false, p_cantidad_obtenida numeric DEFAULT NULL::numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_numero   integer;
  v_total    integer;
  v_tercero  boolean;
  v_pedido   uuid;
  v_motivo   text;
  v_consumo  uuid;
  v_falta    numeric(14,4);
  rp         record;
  et         record;
  m          record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Lo que salió de la orden lo carga Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'check_violation';
  end if;
  -- NUEVO (D-liberar-antes-1): también liberada, mientras no se cerró el envasado.
  if not (v_orden.estado = 'ABIERTA'
          or (v_orden.estado = 'LIBERADA' and v_orden.terminada_en is null)) then
    raise exception 'La orden % está %: no se le cargan más tandas.', v_orden.numero,
      case when v_orden.terminada_en is not null then 'con el envasado cerrado' else lower(v_orden.estado::text) end
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.op_etapas where orden_id = p_orden_id and etapa = 'CC_GRANEL'
                   and (coalesce((datos ->> 'aprobado')::boolean, false)
                        or coalesce((datos ->> 'no_aplica')::boolean, false))) then
    raise exception 'El granel de la orden % todavía no está aprobado por Calidad (R.50.10.1).', v_orden.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.pedido_ordenes po
              where po.orden_id = p_orden_id
                and exists (select 1 from comercial.pedido_consumos c where c.pedido_id = po.pedido_id)) then
    raise exception 'El pedido de la orden % ya se terminó con lo producido: no se le cargan tandas.', v_orden.numero
      using errcode = 'check_violation';
  end if;
  -- comercial.hoy(): la fecha de Buenos Aires, no la UTC.
  if p_fecha is null or p_fecha < v_orden.jornada or p_fecha > comercial.hoy() then
    raise exception 'La fecha del envasado va desde la elaboración (%) hasta hoy.', to_char(v_orden.jornada, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_reparto, '[]')) x
              where coalesce((x ->> 'unidades')::integer, 0) < 0) then
    raise exception 'Las unidades no pueden ser negativas.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_reparto, '[]')) x
              where not gmp.son_hermanos(v_orden.producto_id, (x ->> 'producto_id')::uuid)) then
    raise exception 'Hay un producto que no es hermano del de la orden %: cargalo en «Productos hermanos».',
      v_orden.numero using errcode = 'check_violation';
  end if;
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_total
    from jsonb_array_elements(coalesce(p_reparto, '[]')) x;
  if v_total = 0 and not p_finaliza then
    raise exception 'Cargá cuántas unidades salieron.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_orden_id::text, 0));
  perform set_config('gmp.registrando_tanda', p_orden_id::text, true);
  v_tercero := (select tercero_id from gmp.productos where id = v_orden.producto_id) is not null;

  if v_total > 0 then
    select coalesce(max(numero), 0) + 1 into v_numero from gmp.orden_tandas where orden_id = p_orden_id;
    v_motivo := format('Orden %s, lote %s, tanda %s', v_orden.numero, v_orden.numero_lote, v_numero);

    insert into gmp.orden_tandas (orden_id, numero, fecha, producto_id, unidades, observaciones)
    select p_orden_id, v_numero, p_fecha, (x ->> 'producto_id')::uuid, sum((x ->> 'unidades')::integer),
           nullif(btrim(coalesce(p_observaciones, '')), '')
      from jsonb_array_elements(p_reparto) x
     where (x ->> 'unidades')::integer > 0
     group by 1, 2, 3, 4;

    if not v_tercero then
      -- La materia prima del granel, con la primera tanda.
      perform comercial.consumir_mp_orden(p_orden_id);

      -- Envases etiquetados primero (cubren envase y etiqueta).
      for rp in select producto_id, unidades from gmp.orden_tandas where orden_id = p_orden_id and numero = v_numero
      loop
        perform pg_advisory_xact_lock(hashtextextended('etiquetado|' || rp.producto_id::text, 0));
        v_falta := rp.unidades;
        for et in
          select s.etiquetado_id, s.saldo from comercial.v_etiquetados_saldo s
           where s.producto_id = rp.producto_id and s.saldo > 0
           order by s.fecha, s.registrado_en
        loop
          exit when v_falta <= 0;
          insert into comercial.tanda_etiquetados (orden_id, tanda_numero, etiquetado_id, producto_id, cantidad)
          values (p_orden_id, v_numero, et.etiquetado_id, rp.producto_id, least(v_falta, et.saldo));
          v_falta := v_falta - least(v_falta, et.saldo);
        end loop;
      end loop;

      -- El resto de la lista de materiales, sumado por insumo entre productos.
      for m in
        -- NUEVO (D-materiales-o-1): la lista de materiales la arma
        -- comercial.materiales_por_unidades, que elige la opción de cada grupo «o».
        select mu.insumo_id, i.unidad_medida,
               case when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
                    then ceil(sum(mu.cantidad))
                    else round(sum(mu.cantidad), 4)
               end as necesario
          from gmp.orden_tandas t
          left join lateral (select sum(x.cantidad) as cubierto from comercial.tanda_etiquetados x
                              where x.orden_id = t.orden_id and x.tanda_numero = t.numero
                                and x.producto_id = t.producto_id) te on true
          cross join lateral comercial.materiales_por_unidades(t.producto_id, t.unidades, coalesce(te.cubierto, 0)) mu
          join gmp.insumos_catalogo i on i.id = mu.insumo_id
         where t.orden_id = p_orden_id and t.numero = v_numero
         group by mu.insumo_id, i.unidad_medida
      loop
        continue when m.necesario <= 0;
        if m.unidad_medida is null then
          raise exception 'Un material de la lista no tiene unidad de medida en el catálogo.' using errcode = 'check_violation';
        end if;
        insert into comercial.orden_consumos (orden_id, tanda_numero, insumo_id, unidad, cantidad)
        values (p_orden_id, v_numero, m.insumo_id, m.unidad_medida, m.necesario)
        returning id into v_consumo;
        perform comercial.descontar_insumo_orden(v_consumo, v_motivo);
      end loop;
    end if;

    -- Al stock de fábrica, con el lote de la orden (retenido hasta liberar).
    perform set_config('comercial.terminando_orden', p_orden_id::text, true);
    for rp in select producto_id, unidades from gmp.orden_tandas where orden_id = p_orden_id and numero = v_numero
    loop
      select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
        from comercial.pedido_ordenes po
        join comercial.pedidos p on p.id = po.pedido_id
       where po.orden_id = p_orden_id and p.tercero_id is null and p.eliminado_en is null
         and exists (select 1 from comercial.pedido_renglones r
                      where r.pedido_id = p.id and r.producto_id = rp.producto_id and not r.anulado);
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
      values (rp.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', rp.unidades,
              format('Producción de la orden %s, lote %s, tanda %s', v_orden.numero, v_orden.numero_lote, v_numero),
              case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_orden_id), p_orden_id);
    end loop;
    perform set_config('comercial.terminando_orden', '', true);
  end if;

  perform set_config('gmp.registrando_tanda', '', true);

  if p_finaliza then
    if p_cantidad_obtenida is null or p_cantidad_obtenida < 0 then
      raise exception 'Para terminar la orden, cargá la cantidad de granel obtenida.' using errcode = 'check_violation';
    end if;
    if v_orden.estado = 'LIBERADA' then
      -- NUEVO (D-liberar-antes-1): ya liberada, cerrar es dejar lo obtenido;
      -- el estado no cambia y lo envasado ya entró por tandas.
      perform set_config('gmp.cerrando_envasado', p_orden_id::text, true);
      update gmp.ordenes_produccion
         set cantidad_obtenida = p_cantidad_obtenida,
             unidades_obtenidas = (select coalesce(sum(unidades), 0)::integer
                                     from gmp.orden_tandas where orden_id = p_orden_id)
       where id = p_orden_id;
      perform set_config('gmp.cerrando_envasado', '', true);
    else
      perform comercial.terminar_orden(p_orden_id, p_cantidad_obtenida,
        (select coalesce(sum(unidades), 0)::integer from gmp.orden_tandas where orden_id = p_orden_id));
    end if;
  end if;
  return v_numero;
end;
$$
;

create or replace function comercial.faltantes_tanda(p_orden_id uuid, p_reparto jsonb)
 RETURNS TABLE(insumo_id uuid, codigo text, insumo text, unidad text, necesita numeric, disponible numeric, sin_aprobar numeric, falta numeric, nota text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
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
$$
;

create or replace function comercial.necesidad_pedido(p_pedido_id uuid)
 RETURNS TABLE(insumo_id uuid, necesario numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  select
    m.insumo_id,
    case
      when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
        then ceil(sum(r.cantidad * m.cantidad_por_unidad / (1 - m.merma)))
      else round(sum(r.cantidad * m.cantidad_por_unidad / (1 - m.merma)), 4)
    end
  from comercial.pedido_renglones r
  join gmp.materiales_acondicionamiento m
    on m.producto_id = r.producto_id and m.activo
   -- NUEVO (D-materiales-o-1): de un grupo «o», solo la primera opción.
   and (m.alternativa_grupo is null or m.alternativa_opcion = 1)
  join gmp.insumos_catalogo i on i.id = m.insumo_id
  where r.pedido_id = p_pedido_id
    and not r.anulado
  group by m.insumo_id, i.unidad_medida;
$$
;

create or replace function comercial.necesidad_pedido_neta(p_pedido_id uuid)
 RETURNS TABLE(insumo_id uuid, necesario numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $$
  with base as (
    select r.pedido_id, r.producto_id, p.tercero_id,
           -- NUEVO en 20261028140000.
           greatest(r.cantidad - case when p.tercero_id is null
                                      then comercial.unidades_por_tandas(r.pedido_id, r.producto_id) else 0 end,
                    0) as cantidad
      from comercial.pedido_renglones r
      join comercial.pedidos p on p.id = r.pedido_id
     where r.pedido_id = p_pedido_id and not r.anulado
  ),
  renglones as (
    select b.producto_id, b.cantidad,
           case when b.tercero_id is not null then 0
                else coalesce(
                  (select sum(pe.cantidad) from comercial.pedido_etiquetados pe
                    where pe.pedido_id = b.pedido_id and pe.producto_id = b.producto_id),
                  least(b.cantidad, comercial.etiquetados_en_stock(b.producto_id)))
           end as cubierto
      from base b
  )
  select
    m.insumo_id,
    case
      when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
        then ceil(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                      * m.cantidad_por_unidad / (1 - m.merma)))
      else round(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                     * m.cantidad_por_unidad / (1 - m.merma)), 4)
    end
  from renglones r
  join gmp.materiales_acondicionamiento m on m.producto_id = r.producto_id and m.activo
          -- NUEVO (D-materiales-o-1): de un grupo «o», solo la primera opción.
          and (m.alternativa_grupo is null or m.alternativa_opcion = 1)
  join gmp.insumos_catalogo i on i.id = m.insumo_id
  group by m.insumo_id, i.unidad_medida;
$$
;

create or replace function comercial.costos_productos(p_productos uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(producto_id uuid, orden integer, tipo text, componente text, insumo_id uuid, codigo_interno text, cantidad numeric, unidad text, merma numeric, costo_unitario numeric, origen_costo text, subtotal numeric, falta text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $$
declare
  v_refs     jsonb;
  v_hora     numeric;
  v_prod     record;
  v_formula  uuid;
  v_minutos  numeric;
  v_pesada   gmp.renglon_pesada[];
  v_err      text;
begin
  -- insumo → costo por unidad de catálogo (c), origen (o), gramos por unidad de
  -- catálogo (g) y, si no tiene costo, por qué (p).
  select coalesce(jsonb_object_agg(cr.insumo_id::text, jsonb_build_object(
           'c', cr.costo_unitario_ars,
           'o', cr.origen,
           'p', cr.pendiente,
           'g', comercial.convertir_cantidad(1, cr.unidad_medida, 'g', comercial.densidad_insumo(cr.insumo_id)))), '{}')
    into v_refs
    from comercial.v_costo_referencia cr
   where cr.costo_unitario_ars is not null or cr.pendiente is not null;
  select pc.costo_hora into v_hora from comercial.v_parametros_costo pc;

  for v_prod in
    select p.id, p.contenido_neto, p.unidad_contenido
      from gmp.productos p
     where (p_productos is null and p.activo) or p.id = any (p_productos)
  loop
    -- Granel
    select fc.formula_id into v_formula from comercial.formula_para_costo(v_prod.id) fc;
    v_pesada := null;
    v_err := null;
    if v_formula is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric, 'Sin fórmula'::text;
    elsif v_prod.contenido_neto is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric,
                          'Sin contenido neto por unidad'::text;
    else
      begin
        select array_agg(x) into v_pesada
          from gmp.calcular_lote(
                 v_formula,
                 p_volumen_l => case when v_prod.unidad_contenido = 'mL' then v_prod.contenido_neto end,
                 p_masa_kg   => case when v_prod.unidad_contenido = 'g'  then v_prod.contenido_neto end
               ) x;
      exception when check_violation or raise_exception or no_data_found then
        get stacked diagnostics v_err = message_text;
      end;
      if v_err is not null then
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'No se pudo escalar la fórmula: ' || v_err;
      elsif v_pesada is null then
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'Fórmula sin componentes'::text;
      else
        return query
          select v_prod.id, p.orden, 'GRANEL'::text, p.componente, p.insumo_id, p.codigo_interno,
                 p.masa_kg, 'g'::text, 0::numeric,
                 k.c / k.g, k.o,
                 round(p.masa_kg * k.c / k.g, 4),
                 case when p.insumo_id is null then 'Componente sin insumo de catálogo'
                      when k.c is null then coalesce(k.p, 'Insumo sin costo')
                      when k.g is null then 'Unidad del insumo incompatible con gramos' end
            from unnest(v_pesada) p
            left join lateral (
              select (v_refs -> p.insumo_id::text ->> 'c')::numeric as c,
                     v_refs -> p.insumo_id::text ->> 'o' as o,
                     v_refs -> p.insumo_id::text ->> 'p' as p,
                     nullif((v_refs -> p.insumo_id::text ->> 'g')::numeric, 0) as g
            ) k on true;
      end if;
    end if;

    -- Acondicionamiento: cantidad por unidad (unidad del catálogo) / (1 − merma).
    return query
      select v_prod.id, 1000 + (row_number() over (order by i.codigo_interno))::integer, 'ACONDICIONAMIENTO'::text,
             i.nombre, m.insumo_id, i.codigo_interno, m.cantidad_por_unidad, i.unidad_medida, m.merma,
             (v_refs -> m.insumo_id::text ->> 'c')::numeric, v_refs -> m.insumo_id::text ->> 'o',
             round(m.cantidad_por_unidad / (1 - m.merma) * (v_refs -> m.insumo_id::text ->> 'c')::numeric, 4),
             case when v_refs -> m.insumo_id::text ->> 'c' is null
                  then coalesce(v_refs -> m.insumo_id::text ->> 'p', 'Insumo sin costo') end
        from gmp.materiales_acondicionamiento m
        join gmp.insumos_catalogo i on i.id = m.insumo_id
       where m.producto_id = v_prod.id and m.activo
         -- NUEVO (D-materiales-o-1): de un grupo «o», solo la primera opción.
         and (m.alternativa_grupo is null or m.alternativa_opcion = 1);

    -- Mano de obra
    select mp.minutos_por_unidad into v_minutos
      from comercial.minutos_producto mp where mp.producto_id = v_prod.id order by mp.orden desc limit 1;
    return query
      select v_prod.id, 2000, 'MANO_DE_OBRA'::text, 'Mano de obra'::text, null::uuid, null::text, v_minutos,
             'min'::text, 0::numeric, round(v_hora / 60, 6), 'COSTO_HORA'::text, round(v_minutos * v_hora / 60, 4),
             case when v_minutos is null then 'Sin minutos por unidad'
                  when v_hora is null then 'Sin costo hora' end;
  end loop;
end;
$$
;

create or replace function comercial.registrar_etiquetado(p_producto_id uuid, p_cantidad integer)
 RETURNS comercial.etiquetados
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  v_et       comercial.etiquetados%rowtype;
  m          record;
  v_consumo  uuid;
  v_articulo uuid;
  v_necesita numeric(16,4);
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_aprobado numeric(16,4);
  pos        record;
  v_nombre   text;
  v_importado boolean;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Etiquetar lo registra Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select nombre, origen is not distinct from 'IMPORTADO' into v_nombre, v_importado
    from gmp.productos where id = p_producto_id and activo;
  if not found then
    raise exception 'El producto no existe o está desactivado.' using errcode = 'check_violation';
  end if;
  -- El tercerizado etiqueta con material del cliente, que no es este circuito.
  if (select tercero_id from gmp.productos where id = p_producto_id) is not null then
    raise exception '«%» es de un cliente tercerizado: su envase y etiqueta salen de su stock, no se etiquetan acá.',
      v_nombre using errcode = 'check_violation';
  end if;
  if (select solo_reventa from gmp.productos where id = p_producto_id) then
    raise exception '«%» es de reventa: no se etiqueta.', v_nombre using errcode = 'check_violation';
  end if;
  -- NUEVO en 20261030150000: el importado llega en su envase, solo pide etiqueta.
  if v_importado then
    if not exists (select 1 from gmp.materiales_acondicionamiento
                    where producto_id = p_producto_id and activo and rol = 'ETIQUETA') then
      raise exception '«%» es importado y no tiene etiqueta definida: cargala en «Tareas pendientes de carga».',
        v_nombre using errcode = 'check_violation';
    end if;
  elsif (select count(*) from gmp.materiales_acondicionamiento
       where producto_id = p_producto_id and activo and rol = 'ENVASE') < 1
     or not exists (select 1 from gmp.materiales_acondicionamiento
                     where producto_id = p_producto_id and activo and rol = 'ETIQUETA') then
    raise exception '«%» no tiene envase y etiqueta definidos: cargalos en «Tareas pendientes de carga».', v_nombre
      using errcode = 'check_violation';
  end if;

  insert into comercial.etiquetados (producto_id, cantidad) values (p_producto_id, p_cantidad)
  returning * into v_et;

  for m in
    select ma.insumo_id, ma.cantidad_por_unidad, ma.merma, i.nombre, i.unidad_medida
      from gmp.materiales_acondicionamiento ma
      join gmp.insumos_catalogo i on i.id = ma.insumo_id
     where ma.producto_id = p_producto_id and ma.activo
       -- NUEVO en 20261030150000: al importado se le descuenta solo la etiqueta,
       -- aunque haya quedado un envase cargado de antes.
       and (ma.rol = 'ETIQUETA' or (ma.rol = 'ENVASE' and not v_importado))
       -- NUEVO (D-materiales-o-1): de un grupo «o», solo la primera opción.
       and (ma.alternativa_grupo is null or ma.alternativa_opcion = 1)
  loop
    if m.unidad_medida is null then
      raise exception '«%» no tiene unidad de medida en el catálogo.', m.nombre using errcode = 'check_violation';
    end if;
    -- Misma cuenta que comercial.necesidad_pedido: lo que se cuenta por unidad, hacia arriba.
    v_necesita := p_cantidad * m.cantidad_por_unidad / (1 - m.merma);
    v_necesita := case when upper(m.unidad_medida) in ('UNIDAD', 'U', 'UN')
                       then ceil(v_necesita) else round(v_necesita, 4) end;

    insert into comercial.etiquetado_consumos (etiquetado_id, insumo_id, unidad, cantidad)
    values (v_et.id, m.insumo_id, m.unidad_medida, v_necesita)
    returning id into v_consumo;

    v_articulo := comercial.articulo_de_insumo(m.insumo_id);
    v_restante := v_necesita;
    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from m.unidad_medida then
        raise exception 'El lote de % está en % y la ficha en %: no se puede descontar sin convertir.',
          m.nombre, pos.unidad, m.unidad_medida using errcode = 'check_violation';
      end if;
      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Etiquetado de %s %s', p_cantidad, v_nombre), 'ETIQUETADO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      select coalesce(sum(s.saldo), 0) into v_aprobado
        from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null;
      raise exception
        'No alcanza % para etiquetar %: faltan % %.%',
        m.nombre, p_cantidad, v_restante, m.unidad_medida,
        case when v_aprobado > v_necesita - v_restante
             then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
             else ' No se descontó nada.' end
        using errcode = 'check_violation';
    end if;
  end loop;

  return v_et;
end;
$$
;


-- 4. El removedor de 120 ml: «envase con pico» o «envase con tetón + pico».
-- La primera opción es la que hoy tiene stock. A nombre del codirector técnico.
do $$
declare
  v_dt   uuid;
  v_prod uuid;
  v_n    integer;
begin
  select id into v_dt from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  select id into v_prod from gmp.productos where codigo_interno = '192';
  if v_dt is null or v_prod is null then
    raise notice 'Sin la cuenta de DT suplente o sin el producto 192: no se arma el grupo del removedor.';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text, true);

  update gmp.materiales_acondicionamiento ma
     set alternativa_grupo = 'Envase y pico',
         alternativa_opcion = case i.codigo_interno when '192ENVA' then 1 else 2 end
    from gmp.insumos_catalogo i
   where i.id = ma.insumo_id and ma.producto_id = v_prod and ma.activo
     and i.codigo_interno in ('192ENVA', '192ENV', '192PICO');
  get diagnostics v_n = row_count;
  if v_n <> 3 then
    raise notice 'El removedor 192 tenía % de los 3 materiales esperados en el grupo «Envase y pico».', v_n;
  end if;
end;
$$;
