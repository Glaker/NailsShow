-- ---------------------------------------------------------------------------
-- Propósito : Descontar un insumo aunque un lote esté en otra unidad que la
--             ficha (g ↔ kg, ml ↔ L, o masa ↔ volumen con la densidad del
--             insumo). Antes la carga se frenaba con «no se puede descontar
--             sin convertir». El movimiento queda en la unidad del lote (como
--             se contó) y descuenta lo equivalente a lo que pide la ficha.
-- Reglas    : RN-54 (el stock se mueve con movimientos), RN-50 (auditado).
--             Caso del 2026-11-26: 138CL1 ALCOHOL DE CEREAL, ficha en L, con
--             el lote AP-00161/2026 contado en g (11.072,62 g del conteo Romero
--             del 12/11) y el RI-00066/2026 de Distek en L.
-- Fecha     : 2026-11-26
-- ---------------------------------------------------------------------------
--
-- Si va de masa a volumen y el insumo no tiene densidad, se frena y pide
-- cargarla (no se supone). Además, asignar_lotes_pt dice qué producto y en
-- qué depósito no alcanza (pedido del 2026-11-26: «No alcanza el stock: hay 1
-- unidades y salen 50» en una salida de varios productos). Copias de las
-- vigentes en producción; cambios marcados NUEVO.

CREATE OR REPLACE FUNCTION comercial.descontar_insumo_orden(p_consumo uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_c        comercial.orden_consumos%rowtype;
  v_nombre   text;
  v_ficha    text;
  v_articulo uuid;
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_saldo_ficha numeric;  -- NUEVO (2026-11-26)
  v_retenido numeric(16,4);
  pos        record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Descontar insumos de una orden es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from comercial.orden_consumos where id = p_consumo;
  select nombre, lower(unidad_medida) into v_nombre, v_ficha from gmp.insumos_catalogo where id = v_c.insumo_id;
  v_articulo := comercial.articulo_de_insumo(v_c.insumo_id);
  v_restante := v_c.cantidad;
  for pos in
    select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
      from comercial.v_saldos_stock s
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
       and gmp.lote_consumible(s.lote_insumo_id)
     order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
  loop
    -- NUEVO (2026-11-26): lote en otra unidad que la ficha: se convierte.
    v_saldo_ficha := comercial.convertir_cantidad(pos.saldo, pos.unidad, v_ficha,
                       comercial.densidad_insumo(v_c.insumo_id));
    if v_saldo_ficha is null then
      raise exception 'El lote de % está en % y la ficha en %: para convertirlo hace falta la densidad. Cargala en Densidades y volvé a intentar.',
        v_nombre, pos.unidad, v_ficha using errcode = 'check_violation';
    end if;
    v_toma := least(v_restante, v_saldo_ficha);
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
    values
      (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -(case when v_toma >= round(v_saldo_ficha, 4) then pos.saldo
              else least(pos.saldo, round(comercial.convertir_cantidad(v_toma, v_ficha, pos.unidad,
                         comercial.densidad_insumo(v_c.insumo_id)), 4)) end), p_motivo,
       'ORDEN_CONSUMO', v_c.id);
    v_restante := v_restante - v_toma;
    exit when v_restante <= 0;
  end loop;

  if v_restante > 0 then
    -- Lo que queda y no se puede usar (cuarentena, análisis, vencido).
    select coalesce(sum(s.saldo), 0) into v_retenido
      from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
       and not gmp.lote_consumible(s.lote_insumo_id);
    raise exception 'No alcanza %: faltan % %.%', v_nombre, v_restante, v_c.unidad,
      case when v_retenido > 0
           then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
           else ' Si está en planta, falta registrarlo (recepción o ajuste). No se cargó nada.' end
      using errcode = 'check_violation';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION comercial.registrar_etiquetado(p_producto_id uuid, p_cantidad integer)
 RETURNS comercial.etiquetados
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_et       comercial.etiquetados%rowtype;
  m          record;
  v_consumo  uuid;
  v_articulo uuid;
  v_necesita numeric(16,4);
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_saldo_ficha numeric;  -- NUEVO (2026-11-26)
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
      -- NUEVO (2026-11-26): lote en otra unidad que la ficha: se convierte.
      v_saldo_ficha := comercial.convertir_cantidad(pos.saldo, pos.unidad, m.unidad_medida,
                         comercial.densidad_insumo(m.insumo_id));
      if v_saldo_ficha is null then
        raise exception 'El lote de % está en % y la ficha en %: para convertirlo hace falta la densidad. Cargala en Densidades y volvé a intentar.',
          m.nombre, pos.unidad, m.unidad_medida using errcode = 'check_violation';
      end if;
      v_toma := least(v_restante, v_saldo_ficha);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -(case when v_toma >= round(v_saldo_ficha, 4) then pos.saldo
                else least(pos.saldo, round(comercial.convertir_cantidad(v_toma, m.unidad_medida, pos.unidad,
                           comercial.densidad_insumo(m.insumo_id)), 4)) end),
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
$function$;

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(p_pedido_id uuid, p_consumos jsonb DEFAULT '[]'::jsonb, p_produccion jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  v_saldo_ficha numeric;  -- NUEVO (2026-11-26)
  v_titular   uuid;
  v_propio    uuid;
  v_nombre_titular text;
  pos         record;
  res         record;
  ep          record;
  v_dep       uuid;
  ren         record;
  et          record;
  v_falta_et  numeric(14,4);
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Terminar un pedido es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se termina un pedido enviado o en producción (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;
  -- NUEVO en 20261028140000: con una orden que se envasa por tandas, el
  -- pedido se termina cuando termina la orden (si no, se descuenta y se carga
  -- dos veces).
  if exists (select 1 from comercial.pedido_ordenes po
               join gmp.ordenes_produccion o on o.id = po.orden_id
              where po.pedido_id = p_pedido_id and o.estado = 'ABIERTA'
                and exists (select 1 from gmp.orden_tandas t where t.orden_id = o.id)) then
    raise exception 'La orden de este pedido se está envasando por días: terminá la orden y después el pedido.'
      using errcode = 'check_violation';
  end if;

  -- NUEVO en 20261021120000: los envases etiquetados que cubren el pedido.
  if v_pedido.tercero_id is null then
    for ren in
      select producto_id, cantidad
        from comercial.pedido_renglones
       where pedido_id = p_pedido_id and not anulado
    loop
      -- Dos pedidos del mismo producto terminándose a la vez no toman el
      -- mismo etiquetado. Lock por producto: etiquetados no admite UPDATE,
      -- así que FOR UPDATE no es posible.
      perform pg_advisory_xact_lock(hashtextextended('etiquetado|' || ren.producto_id::text, 0));
      -- NUEVO en 20261028140000: lo que envasaron las tandas ya tiene envase y etiqueta.
      v_falta_et := greatest(ren.cantidad - comercial.unidades_por_tandas(p_pedido_id, ren.producto_id), 0);
      for et in
        select s.etiquetado_id, s.saldo
          from comercial.v_etiquetados_saldo s
         where s.producto_id = ren.producto_id and s.saldo > 0
         order by s.fecha, s.registrado_en
      loop
        exit when v_falta_et <= 0;
        insert into comercial.pedido_etiquetados (pedido_id, etiquetado_id, producto_id, cantidad)
        values (p_pedido_id, et.etiquetado_id, ren.producto_id, least(v_falta_et, et.saldo));
        v_falta_et := v_falta_et - least(v_falta_et, et.saldo);
      end loop;
    end loop;
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido_neta(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo,
             nullif(e ->> 'origen', '')        as origen
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      i.origen,
      c.nombre,
      c.unidad_medida,
      c.tercero_id                             as propio
    from teorico t
    full join informado i on i.insumo_id = t.insumo_id
    join gmp.insumos_catalogo c on c.id = coalesce(t.insumo_id, i.insumo_id)
    order by c.nombre
  loop
    if r.usada is null or r.usada < 0 then
      raise exception 'La cantidad usada de % no es válida.', r.nombre using errcode = 'check_violation';
    end if;
    if r.usada <> r.teorica and r.motivo is null then
      raise exception 'Usaste % % de % y la receta dice %: escribí el motivo de la diferencia.',
        r.usada, coalesce(r.unidad_medida, ''), r.nombre, r.teorica
        using errcode = 'check_violation';
    end if;
    if r.unidad_medida is null then
      raise exception 'El insumo % no tiene unidad de medida confirmada en el catálogo.', r.nombre
        using errcode = 'check_violation';
    end if;

    v_titular := case r.origen
                   when 'NAILSHOW' then null
                   when 'TERCERO'  then v_pedido.tercero_id
                   else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                 end;
    if v_titular is not null and v_titular is distinct from v_pedido.tercero_id then
      raise exception 'No se consume material de un cliente tercerizado para otro (%).', r.nombre
        using errcode = 'check_violation';
    end if;
    if r.propio is not null and v_titular is distinct from r.propio then
      raise exception '«%» es propio del cliente tercerizado: sale de su stock.', r.nombre
        using errcode = 'check_violation';
    end if;
    v_nombre_titular := coalesce((select nombre from gmp.terceros where id = v_titular), 'Nail Show');

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia, tercero_id)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo, v_titular)
    returning id into v_consumo;

    continue when r.usada = 0;

    v_articulo := comercial.articulo_de_insumo(r.insumo_id);
    v_restante := r.usada;

    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo
         and s.saldo > 0
         and l.tercero_id is not distinct from v_titular
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      -- NUEVO (2026-11-26): lote en otra unidad que la ficha: se convierte.
      v_saldo_ficha := comercial.convertir_cantidad(pos.saldo, pos.unidad, r.unidad_medida,
                         comercial.densidad_insumo(r.insumo_id));
      if v_saldo_ficha is null then
        raise exception 'El lote de % está en % y la receta en %: para convertirlo hace falta la densidad. Cargala en Densidades y volvé a intentar.',
          r.nombre, pos.unidad, r.unidad_medida using errcode = 'check_violation';
      end if;

      v_toma := least(v_restante, v_saldo_ficha);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -(case when v_toma >= round(v_saldo_ficha, 4) then pos.saldo
                else least(pos.saldo, round(comercial.convertir_cantidad(v_toma, r.unidad_medida, pos.unidad,
                           comercial.densidad_insumo(r.insumo_id)), 4)) end),
         format('Pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      raise exception
        'No alcanza el stock de % de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        v_nombre_titular, r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;

    v_restante := r.usada;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_stock
       where insumo_id = r.insumo_id
         and tercero_id is not distinct from v_titular
         and para_tercero_id is not distinct from v_pedido.tercero_id
         and (pedido_id is null or pedido_id = p_pedido_id)
         and not liberada and vence_en > now()
       order by (pedido_id is null), vence_en, creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_stock set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;
  end loop;

  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260929110000: cuánto se produjo y adónde va.
  if v_pedido.tercero_id is null then
    perform set_config('comercial.terminando_pedido', p_pedido_id::text, true);

    if p_produccion is null or jsonb_array_length(p_produccion) = 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      select rr.producto_id,
             coalesce(v_pedido.destino_deposito_id, (select id from gmp.depositos where numero = 'PTF')),
             'ENTRADA_PRODUCCION',
             sum(rr.cantidad),
             format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
             'PEDIDO',
             p_pedido_id
        from comercial.pedido_renglones rr
       where rr.pedido_id = p_pedido_id and not rr.anulado
       group by rr.producto_id;
    else
      for ep in
        select (x ->> 'producto_id')::uuid                    as producto_id,
               (x ->> 'cantidad')::numeric                    as cantidad,
               coalesce(nullif(x ->> 'deposito', ''), 'PTF')  as deposito
          from jsonb_array_elements(p_produccion) x
      loop
        if ep.cantidad is null or ep.cantidad < 0 then
          raise exception 'La cantidad producida no es válida.' using errcode = 'check_violation';
        end if;
        continue when ep.cantidad = 0;
        select id into v_dep from gmp.depositos where numero = ep.deposito and numero in ('PTF', 'C5') and activo;
        if v_dep is null then
          raise exception 'Lo producido va a la fábrica (PTF) o a Calle 5 (C5).' using errcode = 'check_violation';
        end if;
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values (ep.producto_id, v_dep, 'ENTRADA_PRODUCCION', ep.cantidad,
                format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
      end loop;
    end if;

    -- Lo producido para un cliente que va a Calle 5 queda reservado para su
    -- pedido, hasta lo pedido: si no, se lo puede llevar otro.
    if not v_pedido.para_stock then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
      select m.producto_id, m.deposito_id, p_pedido_id,
             least(sum(m.cantidad), (select sum(rr.cantidad) from comercial.pedido_renglones rr
                                      where rr.pedido_id = p_pedido_id and rr.producto_id = m.producto_id and not rr.anulado)),
             format('Producido para el pedido %s', v_pedido.numero)
        from comercial.movimientos_pt m
        join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
       where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'ENTRADA_PRODUCCION'
       group by m.producto_id, m.deposito_id;
    end if;

    perform set_config('comercial.terminando_pedido', '', true);
  end if;
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
           -- NUEVO (2026-11-26): cada lote en la unidad de la ficha.
           coalesce(sum(comercial.convertir_cantidad(s.saldo, l.unidad, (select ic.unidad_medida from gmp.insumos_catalogo ic where ic.id = a.insumo_id), comercial.densidad_insumo(a.insumo_id))) filter (where gmp.lote_consumible(s.lote_insumo_id)), 0) as disponible,
           coalesce(sum(comercial.convertir_cantidad(s.saldo, l.unidad, (select ic.unidad_medida from gmp.insumos_catalogo ic where ic.id = a.insumo_id), comercial.densidad_insumo(a.insumo_id))) filter (where not gmp.lote_consumible(s.lote_insumo_id)), 0) as sin_aprobar
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

CREATE OR REPLACE FUNCTION comercial.asignar_lotes_pt(p_producto_id uuid, p_deposito_id uuid, p_cantidad numeric, p_solo_despachable boolean)
 RETURNS TABLE(orden_id uuid, cantidad numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  r        record;
  v_rest   numeric := p_cantidad;
  v_total  numeric := 0;
  v_toma   numeric;
begin
  for r in
    select m.orden_id as lote, sum(m.cantidad) as saldo, o.vencimiento
      from comercial.movimientos_pt m
      left join gmp.ordenes_produccion o on o.id = m.orden_id
     where m.producto_id = p_producto_id and m.deposito_id = p_deposito_id
     group by m.orden_id, o.vencimiento
    having sum(m.cantidad) > 0
     order by (m.orden_id is not null), o.vencimiento, m.orden_id
  loop
    v_total := v_total + r.saldo;
    continue when v_rest <= 0;
    continue when p_solo_despachable and r.lote is not null and not gmp.lote_despachable(r.lote);
    v_toma := least(v_rest, r.saldo);
    orden_id := r.lote;
    cantidad := v_toma;
    return next;
    v_rest := v_rest - v_toma;
  end loop;

  if v_rest > 0 then
    if p_solo_despachable and v_total >= p_cantidad then
      raise exception
        -- NUEVO (2026-11-26): qué producto y en qué depósito.
        '%: en % hay % unidades, pero solo % se pueden vender o mandar a Calle 5: el resto es de lotes que Dirección Técnica todavía no liberó, que vencieron o que están bloqueados.',
        (select p.codigo_interno || ' ' || p.nombre from gmp.productos p where p.id = p_producto_id), (select d.nombre from gmp.depositos d where d.id = p_deposito_id), trim_scale(v_total), trim_scale(p_cantidad - v_rest)
        using errcode = 'check_violation';
    end if;
    -- NUEVO (2026-11-26): qué producto y en qué depósito.
    raise exception 'No alcanza el stock de % en %: hay % unidades y salen %.',
      (select p.codigo_interno || ' ' || p.nombre from gmp.productos p where p.id = p_producto_id), (select d.nombre from gmp.depositos d where d.id = p_deposito_id), trim_scale(v_total), trim_scale(p_cantidad)
      using errcode = 'check_violation';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION comercial.fn_validar_movimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_articulo    comercial.articulos%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_deposito    gmp.depositos%rowtype;
  v_impedimento text;
  v_saldo       numeric(16,4);
  v_anulado     comercial.movimientos_stock%rowtype;
  v_consumo     comercial.pedido_consumos%rowtype;
  v_etq         comercial.etiquetado_consumos%rowtype;
  v_oc          comercial.orden_consumos%rowtype;
  v_ya_bajado   numeric(16,4);
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
  if new.tipo = 'ENTRADA_PRODUCCION' then
    raise exception
      'El tipo % exige lote de producto terminado, que todavía no existe (D-04).', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo in ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION') then
    raise exception
      'El tipo % exige clientes y pedidos, que son de la fase comercial y todavía no existen.', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo = 'SALIDA_RETIRO_MERCADO' then
    raise exception
      'El tipo SALIDA_RETIRO_MERCADO lo produce el módulo de retiro de mercado (PG.60.4), que todavía no existe. '
      'Para detener material hoy corresponde registrar un bloqueo en gmp.bloqueos_lote.'
      using errcode = 'feature_not_supported';
  end if;

  -- ---- Coherencia de las tres referencias ---------------------------------
  select * into v_articulo from comercial.articulos where id = new.articulo_id;
  if not found then
    raise exception 'El artículo % no existe.', new.articulo_id;
  end if;
  if not v_articulo.activo then
    raise exception 'El artículo % está desactivado y no admite movimientos.', v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id;
  if not found then
    raise exception 'El lote % no existe.', new.lote_insumo_id;
  end if;

  if v_lote.insumo_id <> v_articulo.insumo_id then
    raise exception
      'El lote % no pertenece al artículo % : es de otro insumo.',
      v_lote.numero_registro_interno, v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_deposito from gmp.depositos where id = new.deposito_id;
  if not found then
    raise exception 'El depósito % no existe.', new.deposito_id;
  end if;
  if not v_deposito.activo then
    raise exception 'El depósito % está desactivado.', v_deposito.numero
      using errcode = 'check_violation';
  end if;

  new.unidad := v_lote.unidad;
  new.ocurrido_en := now();

  -- ---- Titular del lote (NUEVO en 20260924150200) -------------------------
  if new.tipo = 'ENTRADA_COMPRA' and v_lote.tercero_id is not null then
    raise exception 'El lote % es material de un cliente tercerizado: no entra como compra de Nail Show.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;
  if new.tipo = 'ENTRADA_PROVISTO_TERCERO' then
    if v_lote.tercero_id is null then
      raise exception 'El lote % es de Nail Show: no entra como material provisto por un tercero.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    if new.documento_tipo is distinct from 'RECEPCION' or new.documento_id is distinct from v_lote.recepcion_id then
      raise exception 'El material de un tercero entra a stock con su recepción (comercial.ingresar_stock_tercero).'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- RN-51 y RN-52 ------------------------------------------------------
  if new.tipo = 'SALIDA_MUESTRA' then
    v_impedimento := gmp.impedimento_despacho(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede disponer de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Consumo de producción ----------------------------------------------
  if new.tipo = 'SALIDA_CONSUMO_PRODUCCION' and new.documento_tipo = 'ETIQUETADO_CONSUMO' then
    -- NUEVO en 20261021120000: el envase y la etiqueta que consume un etiquetado.
    select * into v_etq from comercial.etiquetado_consumos where id = new.documento_id;
    if not found or v_etq.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un etiquetado registrado de este insumo.'
        using errcode = 'check_violation';
    end if;
    if v_lote.tercero_id is not null then
      raise exception 'El etiquetado usa material de Nail Show; el lote % es de un tercero.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    -- NUEVO (2026-11-26): cada movimiento en la unidad del consumo (el lote puede estar en otra).
    select coalesce(-sum(coalesce(comercial.convertir_cantidad(m.cantidad, l.unidad, v_etq.unidad, comercial.densidad_insumo(v_etq.insumo_id)), m.cantidad)), 0)
      into v_ya_bajado
      from comercial.movimientos_stock m
      join gmp.lotes_insumo l on l.id = m.lote_insumo_id
     where m.documento_id = v_etq.id and m.tipo = 'SALIDA_CONSUMO_PRODUCCION';
    if v_ya_bajado - coalesce(comercial.convertir_cantidad(new.cantidad, v_lote.unidad, v_etq.unidad, comercial.densidad_insumo(v_etq.insumo_id)), new.cantidad)
       > v_etq.cantidad + 0.0001 then
      raise exception 'El etiquetado consume % % y los movimientos ya suman %: no se puede bajar más.',
        v_etq.cantidad, v_etq.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;
    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'SALIDA_CONSUMO_PRODUCCION' and new.documento_tipo = 'ORDEN_CONSUMO' then
    -- NUEVO en 20261028120000: la materia prima que consume una orden.
    select * into v_oc from comercial.orden_consumos where id = new.documento_id;
    if not found or v_oc.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de esta orden.'
        using errcode = 'check_violation';
    end if;
    if v_lote.tercero_id is not null then
      raise exception 'La orden usa materia prima de Nail Show; el lote % es de un tercero.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    -- NUEVO (2026-11-26): cada movimiento en la unidad del consumo (el lote puede estar en otra).
    select coalesce(-sum(coalesce(comercial.convertir_cantidad(m.cantidad, l.unidad, v_oc.unidad, comercial.densidad_insumo(v_oc.insumo_id)), m.cantidad)), 0)
      into v_ya_bajado
      from comercial.movimientos_stock m
      join gmp.lotes_insumo l on l.id = m.lote_insumo_id
     where m.documento_id = v_oc.id and m.tipo = 'SALIDA_CONSUMO_PRODUCCION';
    if v_ya_bajado - coalesce(comercial.convertir_cantidad(new.cantidad, v_lote.unidad, v_oc.unidad, comercial.densidad_insumo(v_oc.insumo_id)), new.cantidad)
       > v_oc.cantidad + 0.0001 then
      raise exception 'La orden consume % % y los movimientos ya suman %: no se puede bajar más.',
        v_oc.cantidad, v_oc.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;
    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'SALIDA_CONSUMO_PRODUCCION' then
    if new.documento_tipo is distinct from 'PEDIDO_CONSUMO' or new.documento_id is null then
      raise exception
        'El consumo de producción se registra terminando el pedido (comercial.terminar_pedido), no como movimiento suelto.'
        using errcode = 'check_violation';
    end if;

    select * into v_consumo from comercial.pedido_consumos where id = new.documento_id;
    if not found or v_consumo.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de este insumo.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO en 20260924150200: se consume del stock que el consumo declara.
    if v_lote.tercero_id is distinct from v_consumo.tercero_id then
      raise exception 'El lote % no es del stock del que se declaró el consumo.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    -- NUEVO (2026-11-26): cada movimiento en la unidad del consumo (el lote puede estar en otra).
    select coalesce(-sum(coalesce(comercial.convertir_cantidad(m.cantidad, l.unidad, v_consumo.unidad, comercial.densidad_insumo(v_consumo.insumo_id)), m.cantidad)), 0)
      into v_ya_bajado
      from comercial.movimientos_stock m
      join gmp.lotes_insumo l on l.id = m.lote_insumo_id
     where m.documento_id = v_consumo.id and m.tipo = 'SALIDA_CONSUMO_PRODUCCION';

    if v_ya_bajado - coalesce(comercial.convertir_cantidad(new.cantidad, v_lote.unidad, v_consumo.unidad, comercial.densidad_insumo(v_consumo.insumo_id)), new.cantidad)
       > v_consumo.cantidad_real + 0.0001 then
      raise exception
        'El consumo registrado es de % % y los movimientos ya suman %: no se puede bajar más.',
        v_consumo.cantidad_real, v_consumo.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;

    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Anulación (RN-54) --------------------------------------------------
  if new.anula_a_movimiento_id is not null then
    select * into v_anulado
      from comercial.movimientos_stock
     where id = new.anula_a_movimiento_id;

    if not found then
      raise exception 'El movimiento que se pretende anular no existe.';
    end if;
    if v_anulado.anula_a_movimiento_id is not null then
      raise exception
        'No se anula una anulación. Si la corrección estuvo mal, corresponde un movimiento de ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.articulo_id, new.lote_insumo_id, new.deposito_id)
       is distinct from
       (v_anulado.articulo_id, v_anulado.lote_insumo_id, v_anulado.deposito_id) then
      raise exception
        'El movimiento inverso tiene que caer sobre la misma posición (artículo, lote y depósito) que el que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_anulado.cantidad then
      raise exception
        'El movimiento inverso tiene que ser exactamente el opuesto del original (% esperado, % recibido).',
        -v_anulado.cantidad, new.cantidad
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- El saldo no queda negativo -----------------------------------------
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.articulo_id::text || '|' || new.lote_insumo_id::text || '|' || new.deposito_id::text,
      0
    )
  );

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = new.articulo_id
     and lote_insumo_id = new.lote_insumo_id
     and deposito_id    = new.deposito_id;

  if v_saldo + new.cantidad < 0 then
    raise exception
      'El movimiento dejaría el saldo en % (hay % y se quieren mover %) para el lote % en el depósito %. '
      'Si la existencia física no coincide con la registrada, corresponde un ajuste por diferencia de inventario.',
      v_saldo + new.cantidad, v_saldo, new.cantidad,
      v_lote.numero_registro_interno, v_deposito.numero
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;
