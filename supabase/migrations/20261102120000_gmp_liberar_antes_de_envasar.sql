-- ---------------------------------------------------------------------------
-- Propósito : Liberar el lote antes de terminar el envasado. Dirección Técnica
--             libera una orden ABIERTA con todas sus etapas registradas y
--             controladas (granel y producto terminado aprobados), y Gerencia
--             de Producción sigue cargando lo que sale por día: entra a la
--             fábrica ya liberado. Cerrar el envasado deja lo obtenido sin
--             cambiar el estado.
-- Reglas    : RN-51 (solo sale lo liberado: gmp.impedimento_despacho_orden no
--             cambia), RN-50. Decisión del codirector técnico del 2026-11-02
--             (D-liberar-antes-1). La orden la sigue terminando Gerencia de
--             Producción: Dirección Técnica no termina órdenes.
-- Fecha     : 2026-11-02
-- ---------------------------------------------------------------------------
--
-- QUÉ CAMBIA.
--   1. gmp.fn_orden_inmutable: ABIERTA → LIBERADA / RECHAZADA, con los mismos
--      requisitos que desde TERMINADA (gmp.faltantes_liberacion, granel y
--      producto terminado aprobados). Una orden LIBERADA admite un único
--      cambio más, el cierre del envasado, y solo con gmp.cerrando_envasado.
--   2. comercial.registrar_tanda: carga tandas en una orden LIBERADA mientras
--      no se cerró el envasado (terminada_en vacío). Al cerrar, deja lo
--      obtenido sin pasar por TERMINADA.
--   3. La política de comercial.orden_consumos admite el consumo de la tanda
--      en la orden LIBERADA, como ya lo hacía en la ABIERTA.
--
-- gmp.liberar_orden no cambia: no mira el estado, la transición la valida el
-- trigger. Las dos funciones se copian de la base vigente; lo nuevo va marcado
-- «NUEVO (D-liberar-antes-1)».

create or replace function gmp.fn_orden_inmutable()
 RETURNS trigger
language plpgsql
set search_path = ''
AS $$
declare
  v_falta text;
  -- D-orden-producto-1: la especificación que faltaba la completa DT, solo
  -- dentro de gmp.asignar_especificacion_orden (de vacía a una).
  v_libres text[] := array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                           'terminada_en','liberada_por','liberada_en','motivo_cierre']
                     || case when coalesce(current_setting('gmp.asignando_especificacion', true), '') = old.id::text
                              and old.especificacion_id is null
                             then array['especificacion_id'] else '{}'::text[] end;
begin
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'El número, el lote y el vencimiento de la orden % no cambian.', old.numero
      using errcode = 'restrict_violation';
  end if;
  -- NUEVO (D-liberar-antes-1): liberada antes de terminar el envasado, la
  -- orden admite un único cambio más: el cierre del envasado, que deja lo
  -- obtenido y quién lo cerró. Solo desde comercial.registrar_tanda.
  if old.estado = 'LIBERADA' and new.estado = 'LIBERADA' and old.terminada_en is null
     and coalesce(current_setting('gmp.cerrando_envasado', true), '') = old.id::text then
    if (to_jsonb(new) - array['cantidad_obtenida','unidades_obtenidas','terminada_por','terminada_en'])
       is distinct from (to_jsonb(old) - array['cantidad_obtenida','unidades_obtenidas','terminada_por','terminada_en']) then
      raise exception 'Al cerrar el envasado de la orden % solo se carga lo obtenido.', old.numero
        using errcode = 'restrict_violation';
    end if;
    new.terminada_por := core.usuario_actual();
    new.terminada_en  := now();
    return new;
  end if;
  if old.estado in ('LIBERADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'La orden % está %: no se modifica.', old.numero, lower(old.estado::text)
      using errcode = 'restrict_violation';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'ABIERTA'   and new.estado in ('TERMINADA', 'ANULADA', 'LIBERADA', 'RECHAZADA'))
    or (old.estado = 'TERMINADA' and new.estado in ('LIBERADA', 'RECHAZADA'))
  ) then
    raise exception 'Una orden no pasa de % a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;

  -- Firmas: solo las pone la transición.
  new.terminada_por := old.terminada_por;
  new.terminada_en  := old.terminada_en;
  new.liberada_por  := old.liberada_por;
  new.liberada_en   := old.liberada_en;

  if new.estado = 'TERMINADA' and old.estado = 'ABIERTA' then
    if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
      raise exception 'Termina la orden Gerencia de Producción.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'FRACCIONAMIENTO') then
      raise exception 'Falta registrar el fraccionamiento.' using errcode = 'check_violation';
    end if;
    new.terminada_por := core.usuario_actual();
    new.terminada_en  := now();
  end if;

  -- NUEVO (D-liberar-antes-1): también desde ABIERTA, con los mismos requisitos.
  if new.estado in ('LIBERADA', 'RECHAZADA') and old.estado in ('ABIERTA', 'TERMINADA') then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
    end if;
    if new.estado = 'LIBERADA' then
      select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta
        from gmp.faltantes_liberacion(new.id);
      if v_falta is not null then
        raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_GRANEL'
                  and not coalesce((datos ->> 'no_aplica')::boolean, false)
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El granel no está aprobado en su registro R.50.10.1: el lote no se libera.'
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_PT'
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El control de calidad del producto terminado no está aprobado.'
          using errcode = 'check_violation';
      end if;
    end if;
    new.liberada_por := core.usuario_actual();
    new.liberada_en  := now();
  end if;

  return new;
end;
$$
;

create or replace function comercial.registrar_tanda(p_orden_id uuid, p_fecha date, p_reparto jsonb, p_observaciones text DEFAULT NULL::text, p_finaliza boolean DEFAULT false, p_cantidad_obtenida numeric DEFAULT NULL::numeric)
 RETURNS integer
language plpgsql
set search_path = ''
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
        select ma.insumo_id, i.unidad_medida,
               case when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
                    then ceil(sum((t.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                     then coalesce(te.cubierto, 0) else 0 end)
                                  * ma.cantidad_por_unidad / (1 - ma.merma)))
                    else round(sum((t.unidades - case when ma.rol in ('ENVASE', 'ETIQUETA')
                                                      then coalesce(te.cubierto, 0) else 0 end)
                                   * ma.cantidad_por_unidad / (1 - ma.merma)), 4)
               end as necesario
          from gmp.orden_tandas t
          join gmp.materiales_acondicionamiento ma on ma.producto_id = t.producto_id and ma.activo
          join gmp.insumos_catalogo i on i.id = ma.insumo_id
          left join lateral (select sum(x.cantidad) as cubierto from comercial.tanda_etiquetados x
                              where x.orden_id = t.orden_id and x.tanda_numero = t.numero
                                and x.producto_id = t.producto_id) te on true
         where t.orden_id = p_orden_id and t.numero = v_numero
         group by ma.insumo_id, i.unidad_medida
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

-- 3. El consumo de la tanda, también en la orden liberada. Igual que con la
--    abierta, solo dentro de comercial.registrar_tanda (gmp.registrando_tanda),
--    que ya exige el envasado sin cerrar.
alter policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos
  with check (
    core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
    and exists (
      select 1 from gmp.ordenes_produccion o
       where o.id = orden_consumos.orden_id
         and (o.estado = 'TERMINADA'
              or (o.estado in ('ABIERTA', 'LIBERADA')
                  and coalesce(current_setting('gmp.registrando_tanda', true), '') = o.id::text))
    )
  );
comment on policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos is
  'GP o DT al terminar la orden; en abierta o liberada, solo desde comercial.registrar_tanda (D-tandas-1, D-liberar-antes-1).';
