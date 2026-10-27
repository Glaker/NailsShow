-- ---------------------------------------------------------------------------
-- Propósito : Para que las chicas sepan dónde buscar lo que tienen que usar:
--             por producto, cada insumo de su fórmula vigente y de su lista de
--             acondicionamiento, con los lotes que se pueden usar (aprobados o
--             saldo de apertura) que tienen stock, en qué depósito y estiba,
--             cuánto queda y cuándo vence. Primero el que vence antes.
-- Reglas    : D-ubicacion-insumos-1 (codirector técnico, 2026-10-26).
--             Dirección de dependencia: comercial lee gmp, no al revés (§3.7).
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER: Producción no lee el libro de stock (movimientos_stock).
-- La función devuelve solo ubicación y cantidad, nada de costos, y la puede
-- usar cualquier usuario activo. Funciona porque el dueño (postgres) tiene
-- BYPASSRLS, como en 20261009140000.

create or replace function comercial.ubicacion_insumos_producto(p_producto_id uuid)
returns table (
  insumo_id   uuid,
  codigo      text,
  insumo      text,
  para        text,
  lote        text,
  deposito    text,
  estiba      text,
  saldo       numeric,
  unidad      text,
  vence       date
)
language sql
stable
security definer
set search_path = ''
as $$
  with insumos as (
    select c.insumo_id, 'Fórmula'::text as para
      from gmp.formula_componentes c
      join gmp.formulas_fabricacion f on f.id = c.formula_id
     where f.producto_id = p_producto_id and f.estado = 'VIGENTE' and c.insumo_id is not null
    union
    select m.insumo_id, 'Acondicionamiento'
      from gmp.materiales_acondicionamiento m
     where m.producto_id = p_producto_id and m.activo
  )
  select i.insumo_id, ic.codigo_interno, ic.nombre, i.para,
         u.lote, u.deposito, u.estiba, u.saldo, u.unidad, u.vence
    from insumos i
    join gmp.insumos_catalogo ic on ic.id = i.insumo_id
    -- Sin lotes con stock, igual sale el insumo: así se ve que falta.
    left join lateral (
      select l.numero_registro_interno as lote, d.nombre as deposito, l.estiba,
             s.saldo, s.unidad, l.plazo_validez as vence
        from gmp.lotes_insumo l
        join comercial.v_saldos_stock s on s.lote_insumo_id = l.id and s.saldo > 0
        join gmp.depositos d on d.id = s.deposito_id
       where l.insumo_id = i.insumo_id
         and l.estado in ('APROBADO', 'SALDO_APERTURA')
    ) u on true
   where core.rol() is not null
   order by i.para desc, ic.nombre, u.vence nulls last, u.lote;
$$;

comment on function comercial.ubicacion_insumos_producto(uuid) is
  'Dónde está cada insumo de un producto (fórmula vigente y acondicionamiento): lotes usables con stock, depósito, '
  'estiba, saldo y vencimiento (D-ubicacion-insumos-1).';

revoke execute on function comercial.ubicacion_insumos_producto(uuid) from public, anon;
grant execute on function comercial.ubicacion_insumos_producto(uuid) to authenticated;
