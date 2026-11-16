-- ---------------------------------------------------------------------------
-- Propósito : Cajas mixtas (Amor y Paz, Amor y Aire, Paz y Aire) para todas
--             las cajas, también las de unidades impares (aceite de cutícula
--             8 ml = 91, sanitizante 1 L = 15). Cada caja mixta impar lleva la
--             mitad redondeada hacia arriba del PRIMER aroma nombrado y la
--             mitad hacia abajo del segundo (91 → 46 + 45). Además, Hada se
--             habilita en la cuenta de demostración con 10 interacciones por
--             día: el tope diario por usuario (20261113220300) evita que la
--             cuenta compartida agote el tope global.
-- Reglas    : P3 (docs/disenos/P3-opciones-caja.md), D-opciones-caja-4
--             (mixtas impares), D-hada-2 (Hada en demo), RN-50 (auditoría: el
--             cambio de hada_config queda en core.auditoria).
-- Fecha     : 2026-11-16
-- ---------------------------------------------------------------------------
--
-- Las filas vigentes de pedido_cajas con opción mixta tienen unidades pares
-- (lo exigía el CHECK que se quita), y en pares ceil y floor dan lo mismo que
-- la mitad exacta: el cambio de caja_aporte no altera lo ya volcado en los
-- renglones (fn_cajas_materializa revierte con la misma función).

alter table comercial.pedido_cajas drop constraint pedido_cajas_mixta_unidades_pares;

-- ===========================================================================
-- 1. Lo que cada opción aporta a cada SKU (D-opciones-caja-4)
-- ===========================================================================

create or replace function comercial.caja_aporte(
  p_caja comercial.cajas_aromas, p_opcion comercial.opcion_caja_enum, p_cajas integer, p_unidades integer,
  p_amor integer, p_paz integer, p_aire integer)
returns table (producto_id uuid, cantidad numeric)
language sql
immutable
set search_path = ''
as $$
  -- Mixtas: el primer aroma nombrado lleva la mitad hacia arriba y el segundo la mitad hacia abajo.
  select x.producto_id, x.cantidad
    from (values
      (p_caja.producto_amor_id,
       case p_opcion when 'AMOR' then p_cajas::numeric * p_unidades
                     when 'AMOR_PAZ' then p_cajas * ceil(p_unidades / 2.0)
                     when 'AMOR_AIRE' then p_cajas * ceil(p_unidades / 2.0)
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_amor, 0)::numeric * p_unidades else 0 end),
      (p_caja.producto_paz_id,
       case p_opcion when 'PAZ' then p_cajas::numeric * p_unidades
                     when 'AMOR_PAZ' then p_cajas * floor(p_unidades / 2.0)
                     when 'PAZ_AIRE' then p_cajas * ceil(p_unidades / 2.0)
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_paz, 0)::numeric * p_unidades else 0 end),
      (p_caja.producto_aire_id,
       case p_opcion when 'AIRE' then p_cajas::numeric * p_unidades
                     when 'AMOR_AIRE' then p_cajas * floor(p_unidades / 2.0)
                     when 'PAZ_AIRE' then p_cajas * floor(p_unidades / 2.0)
                     when 'UNA_DE_CADA' then p_cajas::numeric / 3 * p_unidades
                     when 'SURTIDO' then coalesce(p_aire, 0)::numeric * p_unidades else 0 end)
    ) as x (producto_id, cantidad);
$$;
comment on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer) is
  'Unidades que una caja con opción aporta a cada uno de sus tres SKU (P3). Mixtas impares: el primer aroma la mitad '
  'hacia arriba, el segundo hacia abajo (D-opciones-caja-4). Surtido: lo asignado, 0 sin asignar.';
revoke execute on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function comercial.caja_aporte(comercial.cajas_aromas, comercial.opcion_caja_enum, integer, integer, integer, integer, integer)
  to authenticated;

-- ===========================================================================
-- 2. Portal del cliente: toda caja admite mixtas
-- ===========================================================================

-- Copia de 20261113210000 con mixta siempre true: la columna queda para no
-- cambiar el contrato con el portal y con Hada. No lee nada de stock.
create or replace function comercial.cliente_cajas()
returns table (caja_id uuid, nombre text, unidades_caja integer, porcentaje numeric, precio_promo numeric,
               mixta boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not comercial.cliente_ve_lista() then
    perform comercial.cliente_exigir();
  end if;
  return query
  select c.id, c.nombre, min(d.unidades_caja)::integer, min(d.porcentaje), min(l.precio_promo),
         true
    from comercial.cajas_aromas c
    join comercial.v_lista_mayorista l
      on l.producto_id in (c.producto_amor_id, c.producto_paz_id, c.producto_aire_id)
     and not l.es_regalo and l.precio_promo > 0
    join comercial.v_descuentos_caja d on d.producto_id = l.producto_id
   where c.activo
   group by c.id, c.nombre
  having count(*) = 3 and count(distinct l.precio_promo) = 1
     and count(distinct d.unidades_caja) = 1 and count(distinct d.porcentaje) = 1
   order by c.nombre;
end;
$$;
comment on function comercial.cliente_cajas() is
  'Portal de clientes (P3): los grupos de aromas que se pueden pedir en caja, con unidades, porcentaje y precio. '
  'mixta es siempre true (D-opciones-caja-4). No consulta ninguna relación de stock (regla 8).';
revoke execute on function comercial.cliente_cajas() from public, anon;
grant execute on function comercial.cliente_cajas() to authenticated;

-- ===========================================================================
-- 3. Hada en la cuenta de demostración (D-hada-2)
-- ===========================================================================

-- trg_hada_config_sello pone cambiado_por (nulo en una migración, la columna lo admite) y cambiado_en.
update comercial.hada_config set limite_dia_demo = 10;
