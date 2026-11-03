-- ---------------------------------------------------------------------------
-- Propósito : Descuento por caja mixto. En el mismo renglón Ventas puede
--             vender algunas cajas cerradas (con descuento) y unidades sueltas
--             (sin descuento de caja). Se guarda cuántas unidades van en caja.
-- Reglas    : §4.12.1, RN-50. Pedido del 2026-11-03 (D-caja-mixta-1), sobre
--             D-descuento-caja-1.
-- Fecha     : 2026-11-03
-- ---------------------------------------------------------------------------
--
-- POR QUÉ EN EL MISMO RENGLÓN.
-- Un pedido tiene un renglón vigente por producto (pedido_renglones_vigente_idx)
-- y de eso dependen reservas, faltantes, despacho y producción. Partir el
-- producto en dos renglones tocaría todo eso; acá el renglón dice cuántas de
-- sus unidades van en caja cerrada y el resto se cobra suelto.
--
-- CÓMO SE CALCULA.
--   suelta = redondeo(promo × (1 − pedido %))
--   caja   = redondeo(suelta × (1 − caja %))
--   importe exacto = en caja × caja + (cantidad − en caja) × suelta
--   precio_final   = redondeo(importe / cantidad, 2)      (promedio del renglón)
--   precio_unitario = redondeo(importe / cantidad / (1 + IVA), 4)
-- Con todo en caja o todo suelto da lo mismo que antes. Mezclado, el promedio
-- a centavos puede apartarse del importe exacto en menos de medio centavo por
-- unidad.
--
-- cantidad_caja NULL con descuento_caja_pct cargado = todo el renglón en caja:
-- así quedan los renglones cargados desde 20261102130000, sin tocarlos.

alter table comercial.pedido_renglones
  add column cantidad_caja numeric(14,4)
    check (cantidad_caja is null or cantidad_caja >= 0),
  add constraint renglones_cantidad_caja_tope
    check (cantidad_caja is null or cantidad_caja <= cantidad);

comment on column comercial.pedido_renglones.cantidad_caja is
  'Venta mayorista: unidades del renglón que van en caja cerrada y llevan descuento_caja_pct; el resto va suelto '
  'sin ese descuento. NULL = todo el renglón (D-caja-mixta-1).';

-- Copia de 20261102130000 con un cambio (NUEVO): el renglón mezcla cajas y sueltas.
create or replace function comercial.recalcular_venta(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_base   numeric;
  v_desc   numeric;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found or not v_pedido.es_venta
     or v_pedido.estado not in ('BORRADOR', 'ESPERANDO_FECHA', 'FECHA_PROPUESTA') then
    return;
  end if;
  select coalesce(sum(cantidad * coalesce(precio_base, 0)), 0) into v_base
    from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado;
  v_desc := coalesce(v_pedido.descuento_pct, comercial.descuento_por_monto(v_base));

  update comercial.pedido_renglones r
     set precio_final    = round(x.exacto, 2),
         precio_unitario = round(x.exacto / (1 + r.alicuota_iva / 100), 4)
    from (select id,
                 case when precio_manual then precio_final
                      -- NUEVO (D-caja-mixta-1): promedio de las unidades en caja y las sueltas.
                      else (coalesce(cantidad_caja, cantidad) * round(suelta * (1 - coalesce(descuento_caja_pct, 0) / 100), 0)
                            + (cantidad - coalesce(cantidad_caja, cantidad)) * suelta)
                           / cantidad * pack
                 end as exacto
            from (select rr.*,
                         coalesce((select unidades_pack from comercial.v_lista_mayorista l
                                    where l.producto_id = rr.producto_id), 1) as pack,
                         round(rr.precio_base / greatest(coalesce(
                           (select unidades_pack from comercial.v_lista_mayorista l
                             where l.producto_id = rr.producto_id), 1), 1)
                           * (1 - v_desc / 100), 0) as suelta
                    from comercial.pedido_renglones rr
                   where rr.pedido_id = p_pedido_id and not rr.anulado
                     and (rr.precio_manual or rr.precio_base is not null)) rr) x
   where r.id = x.id
     and (r.precio_final is distinct from round(x.exacto, 2)
          or r.precio_unitario is distinct from round(x.exacto / (1 + r.alicuota_iva / 100), 4));
end;
$$;

comment on function comercial.recalcular_venta(uuid) is
  'Pedido de venta todavía no aprobado: aplica el descuento del pedido (el fijado o el de la escala) y, a las '
  'unidades en caja cerrada, el de caja. Precio final = promedio del renglón entre caja y sueltas, a centavos '
  '(D-descuento-caja-1, D-caja-mixta-1).';
