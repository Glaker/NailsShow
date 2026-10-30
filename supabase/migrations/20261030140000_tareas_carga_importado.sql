-- ---------------------------------------------------------------------------
-- Propósito : «Importado» en Tareas pendientes de carga: el producto llega
--             hecho y en su envase, y lo único que se le pone acá es la
--             etiqueta. No lleva envase ni fórmula; la tarea queda completa
--             con la etiqueta elegida.
-- Reglas    : D-importado-1 (pedido del 2026-10-30). §4.7 (`origen` de
--             gmp.productos: FABRICADO / FRACCIONADO / IMPORTADO). RN-50 (el
--             cambio de origen queda en la auditoría de productos).
-- Fecha     : 2026-10-30
-- ---------------------------------------------------------------------------
--
-- No hace falta columna nueva: `origen = 'IMPORTADO'` ya dice exactamente
-- esto, y cuatro productos ya lo tienen. Gerencia de Producción lo marca con
-- un UPDATE común (productos_update_tecnicos), auditado por trg_auditar_productos.
--
-- A diferencia de la reventa, el importado sigue en las tareas mientras le
-- falte la etiqueta.
--
-- Copia de 20261021150000 (marcado NUEVO): el importado solo pide etiqueta,
-- y `origen` al final para que la pantalla sepa cuál es.

create or replace view comercial.v_tareas_carga with (security_invoker = true) as
with roles as (
  select producto_id,
         max(insumo_id::text) filter (where rol = 'ENVASE')::uuid   as envase_id,
         max(insumo_id::text) filter (where rol = 'ETIQUETA')::uuid as etiqueta_id,
         count(*) filter (where rol = 'EXTRA')                      as extras
    from gmp.materiales_acondicionamiento where activo group by producto_id
),
pendientes as (
  select r.producto_id, sum(r.cantidad)::integer as pendientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
   group by r.producto_id
)
select pr.id as producto_id, pr.codigo_interno, pr.nombre, pr.sin_formula,
       ro.envase_id, ro.etiqueta_id, coalesce(ro.extras, 0) as extras,
       exists (select 1 from gmp.formulas_fabricacion f
                where f.producto_id = pr.id and f.estado <> 'DADO_DE_BAJA') as tiene_formula,
       coalesce(pe.pendientes, 0) as pendientes,
       pr.formula_consultada_en is not null as formula_consultada,
       pr.solo_reventa,
       pr.origen
  from gmp.productos pr
  left join roles ro on ro.producto_id = pr.id
  left join pendientes pe on pe.producto_id = pr.id
 where pr.activo and pr.tercero_id is null and not pr.solo_reventa
   and (ro.etiqueta_id is null
        -- NUEVO en 20261030140000: al importado no se le pide envase ni fórmula.
        or (pr.origen is distinct from 'IMPORTADO'
            and (ro.envase_id is null
                 or (not pr.sin_formula and pr.formula_consultada_en is null
                     and not exists (select 1 from gmp.formulas_fabricacion f
                                      where f.producto_id = pr.id and f.estado <> 'DADO_DE_BAJA')))));

comment on view comercial.v_tareas_carga is
  'Productos activos de Nail Show (no de reventa) a los que les falta envase, etiqueta o fórmula. Una fórmula en '
  'BORRADOR o derivada a DT ya no es tarea de GP (D-etiquetado-1, D-etiquetado-2). Al importado solo se le pide '
  'la etiqueta (D-importado-1).';
