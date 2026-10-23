-- ---------------------------------------------------------------------------
-- Propósito : Un producto puede llevar más de un envase (por ejemplo frasco y
--             pincel-tapa, dos insumos), además de los extras. Se levanta el
--             «uno vigente por producto» y el etiquetado descuenta todos.
-- Reglas    : Amplía D-etiquetado-1 por pedido del codirector técnico del
--             2026-10-22 (D-ajustes-3). RN-54 y RN-13 siguen como en
--             20261021150000.
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------

drop index gmp.materiales_un_envase;

comment on column gmp.materiales_acondicionamiento.rol is
  'ENVASE (uno o más) y ETIQUETA (una o más) forman el envase etiquetado; EXTRA es lo demás que se agrega al '
  'acondicionar. NULL = sin clasificar (cargas anteriores a 20261021120000). D-ajustes-3.';

-- Copia de 20261021150000 con un solo cambio: el control pide al menos un
-- envase (antes, exactamente uno). El descuento ya recorría todos.
create or replace function comercial.registrar_etiquetado(p_producto_id uuid, p_cantidad integer)
returns comercial.etiquetados
language plpgsql
set search_path = ''
as $$
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
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Etiquetar lo registra Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select nombre into v_nombre from gmp.productos where id = p_producto_id and activo;
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
  if (select count(*) from gmp.materiales_acondicionamiento
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
     where ma.producto_id = p_producto_id and ma.activo and ma.rol in ('ENVASE', 'ETIQUETA')
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
$$;
