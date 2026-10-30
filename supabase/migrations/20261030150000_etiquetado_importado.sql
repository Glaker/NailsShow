-- ---------------------------------------------------------------------------
-- Propósito : Etiquetar un producto importado descuenta solo la etiqueta: el
--             producto llega hecho y en su envase. El panel «Envases
--             etiquetados» lo da por definido con la etiqueta sola.
-- Reglas    : D-importado-1 (cierra su pendiente, pedido del 2026-10-30).
--             RN-54 y RN-13 siguen como en 20261022200200. RN-50.
-- Fecha     : 2026-10-30
-- ---------------------------------------------------------------------------
--
-- Importado = gmp.productos.origen = 'IMPORTADO' (§4.7, 20261030140000).
-- Anular un etiquetado no cambia: devuelve lo que se descontó, sea lo que sea.

-- Copia de 20261022200200 (marcado NUEVO): sin envase para el importado.
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

-- Copia de 20261021150000 (marcado NUEVO): el importado está definido con la
-- etiqueta sola, y `origen` al final para que la pantalla diga qué falta.
create or replace view comercial.v_faltan_etiquetar with (security_invoker = true) as
with pendientes as (
  select r.producto_id, sum(r.cantidad)::integer as pendientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.tercero_id is null and p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
   group by r.producto_id
),
stock as (
  select producto_id, sum(saldo) as en_stock from comercial.v_etiquetados_saldo group by producto_id
),
hoy as (
  select e.producto_id, sum(e.cantidad)::integer as hoy
    from comercial.etiquetados e
   where e.fecha = comercial.hoy()
     and not exists (select 1 from comercial.etiquetado_anulaciones a where a.etiquetado_id = e.id)
   group by e.producto_id
),
roles as (
  select producto_id,
         bool_or(rol = 'ENVASE') as tiene_envase,
         bool_or(rol = 'ETIQUETA') as tiene_etiqueta
    from gmp.materiales_acondicionamiento where activo group by producto_id
)
select pr.id as producto_id, pr.codigo_interno, pr.nombre,
       coalesce(pe.pendientes, 0) as pendientes,
       coalesce(s.en_stock, 0) as en_stock,
       greatest(coalesce(pe.pendientes, 0) - coalesce(s.en_stock, 0), 0) as faltan,
       coalesce(h.hoy, 0) as etiquetados_hoy,
       -- NUEVO en 20261030150000: al importado le alcanza con la etiqueta.
       coalesce(ro.tiene_etiqueta and (ro.tiene_envase or pr.origen = 'IMPORTADO'), false) as definido,
       pr.origen
  from gmp.productos pr
  left join pendientes pe on pe.producto_id = pr.id
  left join stock s on s.producto_id = pr.id
  left join hoy h on h.producto_id = pr.id
  left join roles ro on ro.producto_id = pr.id
 where pr.activo and pr.tercero_id is null and not pr.solo_reventa
   and (pe.producto_id is not null or h.producto_id is not null or coalesce(s.en_stock, 0) > 0);
