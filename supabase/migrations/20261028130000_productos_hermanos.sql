-- ---------------------------------------------------------------------------
-- Propósito : Productos hermanos: los que se envasan del mismo granel (el
--             sanitizante de 1 L y el de 250 ml). Una orden de uno puede dar
--             unidades de los dos, con el mismo lote, y Gerencia de
--             Producción carga cuántas de cada uno al terminarla. Lo que ya
--             entró a la fábrica (PTF) de un lote se puede repartir de nuevo
--             entre los hermanos («salieron 300 de 100 ml y el resto de
--             200 ml»), con motivo, con un ajuste de salida y uno de entrada.
-- Reglas    : D-hermanos-1 (codirector técnico, 2026-10-28). RN-51 (el lote
--             sigue siendo la orden: el hermano se libera con ella), RN-54 /
--             invariante 8 (el reparto es un par de ajustes, nada se edita),
--             invariante 7 (comercial → gmp).
-- Fecha     : 2026-10-28
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Familia de granel
-- ===========================================================================

alter table gmp.productos add column familia_granel uuid;
comment on column gmp.productos.familia_granel is
  'Productos con el mismo valor son hermanos: se envasan del mismo granel (D-hermanos-1). Null = sin hermanos.';
create index productos_familia_granel_idx on gmp.productos (familia_granel) where familia_granel is not null;

create or replace function gmp.son_hermanos(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_a = p_b, false)
      or exists (select 1 from gmp.productos a join gmp.productos b on b.familia_granel = a.familia_granel
                  where a.id = p_a and b.id = p_b);
$$;
comment on function gmp.son_hermanos(uuid, uuid) is
  'El mismo producto, o dos de la misma familia de granel (D-hermanos-1).';
revoke execute on function gmp.son_hermanos(uuid, uuid) from public, anon;
grant execute on function gmp.son_hermanos(uuid, uuid) to authenticated;

-- Une las dos familias (si una ya tenía hermanos, quedan todos juntos).
-- SECURITY INVOKER: rige productos_update_tecnicos y queda en la auditoría.
create or replace function gmp.vincular_hermano(p_producto_id uuid, p_hermano_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
  v_f uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Los productos hermanos los carga Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if p_producto_id = p_hermano_id then
    raise exception 'Elegí otro producto: es el mismo.' using errcode = 'check_violation';
  end if;
  select familia_granel into v_a from gmp.productos where id = p_producto_id;
  if not found then
    raise exception 'El producto no existe.' using errcode = 'check_violation';
  end if;
  select familia_granel into v_b from gmp.productos where id = p_hermano_id;
  if not found then
    raise exception 'El producto hermano no existe.' using errcode = 'check_violation';
  end if;
  v_f := coalesce(v_a, v_b, gen_random_uuid());
  update gmp.productos set familia_granel = v_f
   where (id in (p_producto_id, p_hermano_id) or familia_granel in (v_a, v_b))
     and familia_granel is distinct from v_f;
end;
$$;
comment on function gmp.vincular_hermano(uuid, uuid) is
  'Hace hermanos a dos productos (mismo granel), con los hermanos que ya tuviera cada uno (D-hermanos-1).';
revoke execute on function gmp.vincular_hermano(uuid, uuid) from public, anon;
grant execute on function gmp.vincular_hermano(uuid, uuid) to authenticated;

create or replace function gmp.desvincular_hermano(p_producto_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_f uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Los productos hermanos los carga Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select familia_granel into v_f from gmp.productos where id = p_producto_id;
  update gmp.productos set familia_granel = null where id = p_producto_id and familia_granel is not null;
  -- El que queda solo ya no tiene hermanos.
  update gmp.productos set familia_granel = null
   where familia_granel = v_f
     and (select count(*) from gmp.productos where familia_granel = v_f) = 1;
end;
$$;
comment on function gmp.desvincular_hermano(uuid) is
  'Saca un producto de su familia de granel (D-hermanos-1). Lo que ya entró al stock con un lote compartido no cambia.';
revoke execute on function gmp.desvincular_hermano(uuid) from public, anon;
grant execute on function gmp.desvincular_hermano(uuid) to authenticated;

-- ===========================================================================
-- 2. El lote de una orden admite a sus hermanos
-- ===========================================================================
--
-- Copia de 20261016130000 con dos cambios (marcados NUEVO): el lote puede
-- ser de un hermano del producto, y «Terminado» de un pedido de un hermano
-- encuentra la orden del otro (si no, entraría sin lote y por duplicado).

create or replace function comercial.fn_movimiento_pt_lote()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_orig     comercial.movimientos_pt%rowtype;
  v_n        integer;
  v_orden    uuid;
  v_producto uuid;
  v_imp      text;
  v_c5       boolean;
  a          record;
  v_primero  boolean := true;
begin
  -- Una anulación cae sobre el mismo lote que el movimiento que anula.
  if new.anula_a_movimiento_id is not null then
    select * into v_orig from comercial.movimientos_pt where id = new.anula_a_movimiento_id;
    if not found then
      raise exception 'El movimiento que se pretende anular no existe.' using errcode = 'check_violation';
    end if;
    if v_orig.anula_a_movimiento_id is not null then
      raise exception 'No se anula una anulación. Si la corrección estuvo mal, corresponde un ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.producto_id, new.deposito_id) is distinct from (v_orig.producto_id, v_orig.deposito_id) then
      raise exception 'La anulación cae sobre el mismo producto y depósito que el movimiento que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_orig.cantidad then
      raise exception 'La anulación es exactamente el opuesto del original (% esperado, % recibido).',
        -v_orig.cantidad, new.cantidad using errcode = 'check_violation';
    end if;
    -- Una venta no es una anulación: si lo fuera, saltearía RN-51.
    if new.tipo in ('SALIDA_VENTA', 'ENTRADA_PRODUCCION') then
      raise exception 'Una anulación es un ajuste, no una venta ni una producción.' using errcode = 'check_violation';
    end if;
    new.orden_id := v_orig.orden_id;
    return new;
  end if;

  -- Producción: el lote de la orden del pedido para ese producto, si la hay.
  -- NUEVO en 20261028130000: o para un hermano suyo.
  if new.tipo = 'ENTRADA_PRODUCCION' and new.orden_id is null and new.documento_tipo = 'PEDIDO' then
    select count(*), (array_agg(o.id))[1] into v_n, v_orden
      from comercial.pedido_ordenes po
      join gmp.ordenes_produccion o on o.id = po.orden_id
     where po.pedido_id = new.documento_id and gmp.son_hermanos(o.producto_id, new.producto_id)
       and o.estado <> 'ANULADA';
    if v_n > 1 then
      raise exception 'El pedido tiene % órdenes de este producto: indicá de cuál es lo producido.', v_n
        using errcode = 'check_violation';
    end if;
    new.orden_id := v_orden;
  end if;

  if new.orden_id is not null then
    select producto_id into v_producto from gmp.ordenes_produccion where id = new.orden_id;
    -- NUEVO en 20261028130000: o de un hermano (mismo granel, D-hermanos-1).
    if not gmp.son_hermanos(v_producto, new.producto_id) then
      raise exception 'El lote es de otro producto, que no es su hermano.' using errcode = 'check_violation';
    end if;
  end if;

  select numero = 'C5' into v_c5 from gmp.depositos where id = new.deposito_id;

  -- A Calle 5 entra solo lo liberado o lo sin lote (R-09).
  if new.cantidad > 0 then
    if v_c5 and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception '% A Calle 5 va solo lo liberado: queda en la fábrica (PTF) hasta que la DT lo libere.', v_imp
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  -- Salida con lote ya elegido (por quien llama, o por el reparto de abajo).
  if new.orden_id is not null
     or coalesce(current_setting('comercial.lote_pt_asignado', true), '') = '1' then
    if new.tipo = 'SALIDA_VENTA' and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception 'No se puede vender. %', v_imp using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  if new.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS' then
    raise exception 'Las transferencias de producto terminado se hacen con comercial.transferir_pt, que lleva el lote de un depósito al otro.'
      using errcode = 'check_violation';
  end if;

  -- Reparto: la primera porción queda en esta fila, el resto en filas nuevas
  -- con los mismos datos. Una venta toma solo lo despachable (RN-51).
  perform pg_advisory_xact_lock(hashtextextended('pt|' || new.deposito_id::text || '|' || new.producto_id::text, 0));
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for a in
    select * from comercial.asignar_lotes_pt(new.producto_id, new.deposito_id, -new.cantidad,
                                             new.tipo = 'SALIDA_VENTA')
  loop
    if v_primero then
      new.orden_id := a.orden_id;
      new.cantidad := -a.cantidad;
      v_primero := false;
    else
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id, orden_id)
      values
        (new.producto_id, new.deposito_id, new.tipo, -a.cantidad, new.motivo, new.documento_tipo,
         new.documento_id, new.despacho_id, a.orden_id);
    end if;
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
  return new;
end;
$function$;


-- ===========================================================================
-- 3. Terminar la orden con unidades de cada hermano
-- ===========================================================================
--
-- Copia de 20261028120000 con p_reparto (marcado NUEVO): [{producto_id,
-- unidades}], que suma las unidades obtenidas. Sin reparto, todo es del
-- producto de la orden, como antes. Cambia la firma: se reemplaza la de tres.

drop function comercial.terminar_orden(uuid, numeric, integer);

create function comercial.terminar_orden(p_id uuid, p_cantidad numeric, p_unidades integer,
                                         p_reparto jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_pedido   uuid;
  mp         record;
  pos        record;
  rp         record;
  v_reparto  jsonb;
  v_suma     integer;
  v_ficha    text;
  v_necesita numeric(16,4);
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_consumo  uuid;
  v_articulo uuid;
  v_retenido numeric(16,4);
  v_abierta  boolean;
begin
  -- 20261028120000: descuenta solo la orden que pasa de abierta a
  -- terminada en esta llamada. Volver a terminarla (para corregir lo
  -- obtenido) o una terminada antes de esa migración no descuenta.
  v_abierta := exists (select 1 from gmp.ordenes_produccion where id = p_id and estado = 'ABIERTA');
  perform gmp.terminar_orden(p_id, p_cantidad, p_unidades);

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_id::text, 0));
  select * into v_orden from gmp.ordenes_produccion where id = p_id;

  -- 20261028120000: la materia prima, una sola vez por orden.
  if v_abierta
     and not exists (select 1 from comercial.orden_consumos where orden_id = p_id)
     and (select tercero_id from gmp.productos where id = v_orden.producto_id) is null then
    if lower(v_orden.unidad) not in ('kg', 'l') then
      raise exception 'La orden % está en «%»: para descontar la materia prima tiene que estar en kg o L.',
        v_orden.numero, v_orden.unidad using errcode = 'check_violation';
    end if;
    for mp in
      select c.insumo_id, sum(c.masa_kg) as masa_kg, sum(c.volumen_l) as volumen_l,
             bool_or(c.masa_kg is null) as sin_masa, bool_or(c.volumen_l is null) as sin_volumen,
             i.nombre, i.unidad_medida
        from gmp.calcular_lote(v_orden.formula_id,
               p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
               p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
        join gmp.insumos_catalogo i on i.id = c.insumo_id
       group by c.insumo_id, i.nombre, i.unidad_medida
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
          'Cargala en Densidades y volvé a terminar la orden.',
          mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad'), case when mp.sin_masa then 'volumen' else 'masa' end
          using errcode = 'check_violation';
      end if;
      v_necesita := round(v_necesita, 4);
      continue when v_necesita <= 0;

      insert into comercial.orden_consumos (orden_id, insumo_id, unidad, cantidad)
      values (p_id, mp.insumo_id, mp.unidad_medida, v_necesita)
      returning id into v_consumo;

      v_articulo := comercial.articulo_de_insumo(mp.insumo_id);
      v_restante := v_necesita;
      for pos in
        select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
          from comercial.v_saldos_stock s
          join gmp.lotes_insumo l on l.id = s.lote_insumo_id
         where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
           and gmp.lote_consumible(s.lote_insumo_id)
         order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
      loop
        if lower(pos.unidad) is distinct from v_ficha then
          raise exception 'El lote de % está en % y la ficha en %: no se puede descontar sin convertir.',
            mp.nombre, pos.unidad, mp.unidad_medida using errcode = 'check_violation';
        end if;
        v_toma := least(v_restante, pos.saldo);
        insert into comercial.movimientos_stock
          (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values
          (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
           format('Orden %s, lote %s', v_orden.numero, v_orden.numero_lote), 'ORDEN_CONSUMO', v_consumo);
        v_restante := v_restante - v_toma;
        exit when v_restante <= 0;
      end loop;

      if v_restante > 0 then
        -- Lo que queda y no se puede usar (cuarentena, análisis, vencido).
        select coalesce(sum(s.saldo), 0) into v_retenido
          from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
         where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
           and not gmp.lote_consumible(s.lote_insumo_id);
        raise exception
          'No alcanza % para la orden %: faltan % %.%',
          mp.nombre, v_orden.numero, v_restante, mp.unidad_medida,
          case when v_retenido > 0
               then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
               else ' Si está en planta, falta registrarlo (recepción o ajuste). La orden no se terminó.' end
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  if exists (select 1 from comercial.movimientos_pt where orden_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    -- NUEVO en 20261028130000: un reparto que no se va a aplicar no se calla.
    if p_reparto is not null and jsonb_array_length(p_reparto) > 0 then
      raise exception 'Lo obtenido de la orden % ya entró al stock: para cambiar de cuál hermano es, usá «Corregir reparto».',
        v_orden.numero using errcode = 'check_violation';
    end if;
    return;
  end if;
  if coalesce(p_unidades, 0) <= 0 then
    return;
  end if;

  -- NUEVO en 20261028130000: cuántas de cada hermano.
  v_reparto := case when p_reparto is null or jsonb_array_length(p_reparto) = 0
                    then jsonb_build_array(jsonb_build_object('producto_id', v_orden.producto_id, 'unidades', p_unidades))
                    else p_reparto end;
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_suma from jsonb_array_elements(v_reparto) x;
  if v_suma <> p_unidades then
    raise exception 'Lo repartido entre los hermanos suma % y las unidades obtenidas son %.', v_suma, p_unidades
      using errcode = 'check_violation';
  end if;

  perform set_config('comercial.terminando_orden', p_id::text, true);
  for rp in
    select (x ->> 'producto_id')::uuid as producto_id, (x ->> 'unidades')::integer as unidades
      from jsonb_array_elements(v_reparto) x
  loop
    if rp.unidades < 0 then
      raise exception 'Las unidades de cada hermano no pueden ser negativas.' using errcode = 'check_violation';
    end if;
    if not gmp.son_hermanos(v_orden.producto_id, rp.producto_id) then
      raise exception 'Ese producto no es hermano del de la orden %: cargalo en «Productos hermanos».', v_orden.numero
        using errcode = 'check_violation';
    end if;
    continue when rp.unidades = 0;

    -- El pedido de Nail Show de esta orden que lleva el producto, si es uno solo.
    select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
      from comercial.pedido_ordenes po
      join comercial.pedidos p on p.id = po.pedido_id
     where po.orden_id = p_id and p.tercero_id is null and p.eliminado_en is null
       and exists (select 1 from comercial.pedido_renglones r
                    where r.pedido_id = p.id and r.producto_id = rp.producto_id and not r.anulado);

    insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
    values (rp.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', rp.unidades,
            format('Producción de la orden %s, lote %s', v_orden.numero, v_orden.numero_lote),
            case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_id), p_id);
  end loop;
  perform set_config('comercial.terminando_orden', '', true);
end;
$$;
comment on function comercial.terminar_orden(uuid, numeric, integer, jsonb) is
  'Termina la orden (gmp.terminar_orden), descuenta la materia prima de la fórmula por la cantidad teórica, del lote '
  'consumible que vence primero (D-consumo-orden-1), y carga las unidades obtenidas en PTF con su lote, repartidas '
  'entre el producto y sus hermanos (D-hermanos-1), retenidas hasta que la DT libera (RN-51). A nombre del pedido de '
  'la orden si lo lleva. SECURITY INVOKER: rige movimientos_pt_insert_produccion.';
revoke execute on function comercial.terminar_orden(uuid, numeric, integer, jsonb) from public, anon;
grant  execute on function comercial.terminar_orden(uuid, numeric, integer, jsonb) to authenticated;

-- ===========================================================================
-- 4. Repartir de nuevo lo que ya entró
-- ===========================================================================
--
-- p_reparto dice cuántas de cada hermano tiene que haber en la fábrica (PTF)
-- de ese lote; lo que no figura queda en cero. El total no cambia: solo se
-- corrige de cuál hermano son. Por cada diferencia, un SALIDA_AJUSTE y un
-- ENTRADA_AJUSTE con el lote de la orden y el motivo (RN-54). Lo que ya salió
-- de la fábrica no se toca. SECURITY INVOKER: rige movimientos_pt_insert_stock.
-- Las unidades de producto terminado son enteras (el ::integer de abajo).
--
-- ponytail: comercial.v_pendientes_despacho cuenta lo producido para un
-- pedido con las entradas de producción, no con los ajustes (tampoco ve un
-- descarte): después de un reparto puede mostrar de más en «en fábrica para el
-- pedido». Leer el saldo real por lote si se vuelve un problema.

create function comercial.repartir_lote_hermanos(p_orden_id uuid, p_reparto jsonb, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden  gmp.ordenes_produccion%rowtype;
  v_ptf    uuid;
  v_antes  integer;
  v_despues integer;
  v_motivo text;
  d        record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'El reparto entre hermanos lo corrige Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí por qué se corrige el reparto.' using errcode = 'check_violation';
  end if;
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id;
  if not found then
    raise exception 'La orden no existe.' using errcode = 'check_violation';
  end if;
  if v_orden.estado not in ('TERMINADA', 'LIBERADA') then
    raise exception 'La orden % está %: se reparte lo que entró de una orden terminada.', v_orden.numero,
      lower(v_orden.estado::text) using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_reparto) x
              where not gmp.son_hermanos(v_orden.producto_id, (x ->> 'producto_id')::uuid)) then
    raise exception 'Hay un producto que no es hermano del de la orden %.', v_orden.numero using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_reparto) x where (x ->> 'unidades')::integer < 0) then
    raise exception 'Las unidades de cada hermano no pueden ser negativas.' using errcode = 'check_violation';
  end if;

  v_ptf := (select id from gmp.depositos where numero = 'PTF');
  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_orden_id::text, 0));

  select coalesce(sum(cantidad), 0) into v_antes
    from comercial.movimientos_pt where orden_id = p_orden_id and deposito_id = v_ptf;
  select coalesce(sum((x ->> 'unidades')::integer), 0) into v_despues from jsonb_array_elements(p_reparto) x;
  if v_antes <> v_despues then
    raise exception 'En la fábrica hay % del lote % y el reparto suma %: solo se corrige de cuál hermano son.',
      v_antes, v_orden.numero_lote, v_despues using errcode = 'check_violation';
  end if;

  v_motivo := format('Reparto entre hermanos del lote %s: %s', v_orden.numero_lote, btrim(p_motivo));
  -- Primero las salidas, después las entradas: el saldo nunca queda negativo.
  for d in
    with actual as (
      select producto_id, sum(cantidad)::integer as hay
        from comercial.movimientos_pt where orden_id = p_orden_id and deposito_id = v_ptf
       group by producto_id
    ), nuevo as (
      select (x ->> 'producto_id')::uuid as producto_id, sum((x ->> 'unidades')::integer) as va
        from jsonb_array_elements(p_reparto) x group by 1
    )
    select coalesce(a.producto_id, n.producto_id) as producto_id,
           coalesce(n.va, 0) - coalesce(a.hay, 0) as dif
      from actual a full join nuevo n on n.producto_id = a.producto_id
     where coalesce(n.va, 0) <> coalesce(a.hay, 0)
     order by 2
  loop
    insert into comercial.movimientos_pt
      (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
    values
      (d.producto_id, v_ptf, case when d.dif < 0 then 'SALIDA_AJUSTE' else 'ENTRADA_AJUSTE' end::comercial.tipo_movimiento_enum,
       d.dif, v_motivo, 'ORDEN', p_orden_id, p_orden_id);
  end loop;
end;
$$;
comment on function comercial.repartir_lote_hermanos(uuid, jsonb, text) is
  'Corrige de cuál hermano son las unidades de un lote que están en la fábrica, con un par de ajustes y su motivo '
  '(D-hermanos-1, RN-54). El total no cambia.';
revoke execute on function comercial.repartir_lote_hermanos(uuid, jsonb, text) from public, anon;
grant  execute on function comercial.repartir_lote_hermanos(uuid, jsonb, text) to authenticated;
