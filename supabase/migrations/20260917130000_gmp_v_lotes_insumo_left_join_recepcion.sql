-- ---------------------------------------------------------------------------
-- Propósito : `gmp.v_lotes_insumo` hacía INNER JOIN contra `gmp.recepciones`
--             (y, en cascada, contra `gmp.proveedores`). Desde la migración
--             …130000 del 2026-09-16, `recepcion_id` es nullable: un lote
--             SALDO_APERTURA no tiene recepción. Con INNER JOIN esos lotes
--             quedaban invisibles en la vista, aunque existen en
--             `gmp.lotes_insumo`. Se cambian los dos JOIN a LEFT JOIN.
-- Reglas    : Ninguna nueva. Corrige un efecto colateral no buscado de
--             docs/ESPEC_SALDO_INICIAL.md sobre gmp.v_lotes_insumo (migración
--             …140400 del 2026-09-04, redefinida por …190000 el mismo día).
-- Fecha     : 2026-09-17
-- ---------------------------------------------------------------------------
--
-- QUÉ SE VERIFICÓ ANTES DE ESTE CAMBIO (para que un LEFT JOIN no rompa nada
-- silenciosamente en cascada).
--
-- 1. La vista no tiene WHERE. Un LEFT JOIN que produce NULL en las columnas de
--    `r` y `p` no descarta ninguna fila: antes las descartaba el propio INNER
--    JOIN, que es justo el comportamiento que se corrige.
--
-- 2. Las columnas que salen de `r` (`recepcion_id`, `recepcion_numero`,
--    `recepcion_fecha`) y de `p` (`proveedor_id`, `proveedor`) pasan a poder
--    ser NULL. Es lo correcto: un lote SALDO_APERTURA no tiene recepción ni
--    proveedor real, y esas columnas tienen que decir eso, no ocultar la fila.
--
-- 3. Único consumidor de la vista fuera de esta misma migración:
--    `comercial.v_proveedores_por_insumo` (migración …120000 del 2026-09-17).
--    Hace `join gmp.proveedores p on p.id = l.proveedor_id` sobre el
--    resultado de esta vista, con `where l.proveedor_id is not null` antes.
--    Con `proveedor_id` en NULL para los lotes de apertura, ese WHERE los
--    excluye —correcto: no hay proveedor real que sugerir para un renglón
--    migrado— sin que el join posterior falle ni descarte de más. No hace
--    falta tocar esa vista.
--
-- 4. `gmp.v_tablero_calidad` y el resto de `…140400_gmp_vistas_tablero` no
--    usan `gmp.v_lotes_insumo`: consultan `gmp.lotes_insumo` directo. Ningún
--    otro archivo referencia esta vista.

drop view if exists gmp.v_lotes_insumo;

create view gmp.v_lotes_insumo with (security_invoker = true) as
  select
    l.id,
    l.numero_registro_interno,
    l.lote_proveedor,
    l.estado,
    ro.estado                           as rotulo_estado,
    ro.color                            as color_rotulo,
    l.plazo_validez,
    l.cantidad_bultos,
    l.cantidad_unidades,
    l.unidad,
    l.total_etiquetas,
    l.protocolo_recibido,
    l.contenedores_limpiados,
    l.creado_en,
    i.id                                as insumo_id,
    i.codigo_interno,
    i.nombre                            as insumo_nombre,
    i.tipo                              as insumo_tipo,
    i.es_inflamable,
    i.requiere_protocolo,
    r.id                                as recepcion_id,
    r.numero                            as recepcion_numero,
    r.fecha_hora                        as recepcion_fecha,
    p.id                                as proveedor_id,
    p.razon_social                      as proveedor,
    d.numero                            as deposito_numero,
    d.nombre                            as deposito_nombre,
    ro.id                               as rotulo_vigente_id,
    ro.emitido_en                       as rotulo_emitido_en,
    -- Cuántos muestreos lleva el lote. La pantalla lo usa para no ofrecer
    -- «registrar muestreo» sobre algo ya muestreado.
    (select count(*) from gmp.muestreos m
      where m.entidad_tipo = 'lote_insumo' and m.entidad_id = l.id) as muestreos
  from gmp.lotes_insumo l
  join gmp.insumos_catalogo i     on i.id = l.insumo_id
  -- LEFT: un lote SALDO_APERTURA no tiene recepción (recepcion_id nullable
  -- desde la migración …130000 del 2026-09-16). Con INNER quedaba fuera de
  -- esta vista, aunque existe en gmp.lotes_insumo.
  left join gmp.recepciones r     on r.id = l.recepcion_id
  -- LEFT por la misma razón, en cascada: si r es NULL, r.proveedor_id también
  -- lo es, y un INNER JOIN contra proveedores volvería a descartar la fila.
  left join gmp.proveedores p     on p.id = r.proveedor_id
  left join gmp.depositos d       on d.id = l.deposito_actual_id
  left join gmp.rotulos ro        on ro.entidad_tipo = 'lote_insumo'
                                 and ro.entidad_id = l.id
                                 and ro.vigente;

comment on view gmp.v_lotes_insumo is
  'Lote de insumo con insumo, proveedor, depósito y rótulo vigente resueltos. '
  '`estado` es dónde está en el circuito; `color_rotulo` es el color del cartel que tiene puesto. Difieren a propósito entre el muestreo y el análisis. '
  'Proveedor y recepción vía LEFT JOIN: un lote SALDO_APERTURA no tiene ninguno de los dos, y no por eso deja de existir.';
comment on column gmp.v_lotes_insumo.recepcion_id is
  'NULL en un lote SALDO_APERTURA: no hay recepción física que citar.';
comment on column gmp.v_lotes_insumo.proveedor_id is
  'NULL en un lote SALDO_APERTURA: no hay proveedor real, es saldo migrado sin lote de origen identificado.';

grant select on gmp.v_lotes_insumo to authenticated;
