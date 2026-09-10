-- ---------------------------------------------------------------------------
-- Propósito : Vista de material recibido por insumo y estado de calidad.
--             Responde "qué hay en planta y en qué punto del circuito está".
-- Reglas    : Ninguna nueva. Es una proyección de gmp.lotes_insumo.
-- Fecha     : 2026-09-10
-- ---------------------------------------------------------------------------
--
-- ATENCIÓN AL NOMBRE. Esto NO es stock. Es lo *recibido*, agrupado por estado.
-- No existe registro de consumo ni de egreso, así que estas cantidades solo
-- crecen: son exactas al recibir y se degradan a medida que producción usa el
-- material. La existencia real, con movimientos, costeo y valorización, es
-- comercial.movimientos_stock (§4.12, RN-51 a RN-66), que todavía no existe.
-- Cuando llegue, esta vista no debe usarse para decidir despachos.
--
-- Sobre las cantidades: `bultos` y `unidades` van en columnas separadas a
-- propósito. Un bulto puede ser un tambor de 200 kg o una caja de 5 unidades,
-- así que sumar bultos entre lotes distintos mezcla magnitudes. `unidades` es
-- lo comparable, pero es nullable — el CHECK rn02 solo lo exige cuando los
-- bultos no son de peso similar. Por eso se expone `lotes_sin_unidades`: si es
-- mayor que cero, la suma de `unidades` está incompleta y hay que decirlo.
-- Se agrupa además por `unidad` para no sumar kg con litros.

create view gmp.v_existencias_recibidas with (security_invoker = true) as
  select
    i.id                                as insumo_id,
    i.codigo_interno,
    i.nombre                            as insumo_nombre,
    i.tipo                              as insumo_tipo,
    i.es_inflamable,
    l.estado,
    gmp.color_rotulo(l.estado)          as color_rotulo,
    l.unidad,
    count(*)                            as lotes,
    sum(l.cantidad_bultos)              as bultos,
    sum(l.cantidad_unidades)            as unidades,
    count(*) filter (
      where l.cantidad_unidades is null
    )                                   as lotes_sin_unidades,
    sum(l.peso_pigmento_kg)             as peso_pigmento_kg,
    sum(l.total_etiquetas)              as total_etiquetas,
    min(l.plazo_validez)                as vence_primero,
    count(*) filter (
      where l.plazo_validez is not null
        and l.plazo_validez <= current_date + 90
    )                                   as lotes_por_vencer,
    max(l.creado_en)                    as ultimo_ingreso
  from gmp.lotes_insumo l
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  group by i.id, i.codigo_interno, i.nombre, i.tipo, i.es_inflamable,
           l.estado, l.unidad;

comment on view gmp.v_existencias_recibidas is
  'Material recibido por insumo, estado de calidad y unidad. NO es stock: no '
  'hay registro de consumo, así que las cantidades solo crecen. La existencia '
  'real será comercial.movimientos_stock. `lotes_sin_unidades` > 0 significa '
  'que la suma de `unidades` está incompleta (CHECK rn02).';

grant select on gmp.v_existencias_recibidas to authenticated;
