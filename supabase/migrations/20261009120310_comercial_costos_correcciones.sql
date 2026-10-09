-- ---------------------------------------------------------------------------
-- Propósito : Correcciones de la segunda revisión de 20261009120300, antes de
--             la carga de apertura: merma de acondicionamiento con la cuenta de
--             la base, fórmula sin componentes marcada como faltante, IVA en
--             comprobantes que no son factura A, notas de crédito asociadas por
--             factura en la conciliación, y conciliación oculta a quien no ve
--             costos.
-- Reglas    : R-10, D-38, D-44; merma según 20260917120000 (cantidad / (1 − merma)).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- Va como migración aparte, no como edición de 20261009120300: una migración
-- escrita no se toca (CLAUDE.md §6), aunque todavía no se haya aplicado.

-- 1. IVA: en un comprobante que no es factura A no va NINGUNO de los dos
--    campos (antes se aceptaba «incluye IVA» sin alícuota en una B).
alter table comercial.costos_lote drop constraint costos_lote_iva_solo_factura_a;
alter table comercial.costos_lote add constraint costos_lote_iva_solo_factura_a check (
  (tipo_comprobante is not distinct from 'FACTURA_A' and incluye_iva is not null and alicuota_iva is not null)
  or (tipo_comprobante is distinct from 'FACTURA_A' and incluye_iva is null and alicuota_iva is null));
alter table comercial.costos_accesorios drop constraint costos_accesorios_iva_solo_factura_a;
alter table comercial.costos_accesorios add constraint costos_accesorios_iva_solo_factura_a check (
  (tipo_comprobante = 'FACTURA_A' and incluye_iva is not null and alicuota_iva is not null)
  or (tipo_comprobante <> 'FACTURA_A' and incluye_iva is null and alicuota_iva is null));

-- 2. Costeo: merma como la define la base (cantidad / (1 − merma), igual que
--    los faltantes de 20260917120000) y fórmula sin componentes = faltante.
create or replace function comercial.costos_productos(p_productos uuid[] default null)
returns table (
  producto_id     uuid,
  orden           integer,
  tipo            text,
  componente      text,
  insumo_id       uuid,
  codigo_interno  text,
  cantidad        numeric,
  unidad          text,
  merma           numeric,
  costo_unitario  numeric,
  origen_costo    text,
  subtotal        numeric,
  falta           text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_refs     jsonb;
  v_hora     numeric;
  v_prod     record;
  v_formula  uuid;
  v_minutos  numeric;
  v_pesada   gmp.renglon_pesada[];
  v_err      text;
begin
  -- insumo → costo por unidad de catálogo (c), origen (o) y gramos por unidad de catálogo (g).
  select coalesce(jsonb_object_agg(cr.insumo_id::text, jsonb_build_object(
           'c', cr.costo_unitario_ars,
           'o', cr.origen,
           'g', comercial.convertir_cantidad(1, cr.unidad_medida, 'g', comercial.densidad_insumo(cr.insumo_id)))), '{}')
    into v_refs
    from comercial.v_costo_referencia cr
   where cr.costo_unitario_ars is not null;
  select pc.costo_hora into v_hora from comercial.v_parametros_costo pc;

  for v_prod in
    select p.id, p.contenido_neto, p.unidad_contenido
      from gmp.productos p
     where (p_productos is null and p.activo) or p.id = any (p_productos)
  loop
    -- Granel
    select fc.formula_id into v_formula from comercial.formula_para_costo(v_prod.id) fc;
    v_pesada := null;
    v_err := null;
    if v_formula is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric, 'Sin fórmula'::text;
    elsif v_prod.contenido_neto is null then
      return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                          null::text, null::numeric, null::numeric, null::text, null::numeric,
                          'Sin contenido neto por unidad'::text;
    else
      -- Sólo calcular_lote va dentro del bloque, y sólo se atrapan los errores
      -- que levanta por diseño (sin densidad, sin objetivo, fórmula inexistente).
      begin
        select array_agg(x) into v_pesada
          from gmp.calcular_lote(
                 v_formula,
                 p_volumen_l => case when v_prod.unidad_contenido = 'mL' then v_prod.contenido_neto end,
                 p_masa_kg   => case when v_prod.unidad_contenido = 'g'  then v_prod.contenido_neto end
               ) x;
      exception when check_violation or raise_exception or no_data_found then
        get stacked diagnostics v_err = message_text;
      end;
      if v_err is not null then
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'No se pudo escalar la fórmula: ' || v_err;
      elsif v_pesada is null then
        -- Un borrador sin componentes (o con todos anulados) no es un granel gratis.
        return query select v_prod.id, 0, 'GRANEL'::text, 'Granel'::text, null::uuid, null::text, null::numeric,
                            null::text, null::numeric, null::numeric, null::text, null::numeric,
                            'Fórmula sin componentes'::text;
      else
        return query
          select v_prod.id, p.orden, 'GRANEL'::text, p.componente, p.insumo_id, p.codigo_interno,
                 p.masa_kg, 'g'::text, 0::numeric,
                 k.c / k.g, k.o,
                 round(p.masa_kg * k.c / k.g, 4),
                 case when p.insumo_id is null then 'Componente sin insumo de catálogo'
                      when k.c is null then 'Insumo sin costo'
                      when k.g is null then 'Unidad del insumo incompatible con gramos' end
            from unnest(v_pesada) p
            left join lateral (
              select (v_refs -> p.insumo_id::text ->> 'c')::numeric as c,
                     v_refs -> p.insumo_id::text ->> 'o' as o,
                     nullif((v_refs -> p.insumo_id::text ->> 'g')::numeric, 0) as g
            ) k on true;
      end if;
    end if;

    -- Acondicionamiento: cantidad por unidad (unidad del catálogo) / (1 − merma).
    return query
      select v_prod.id, 1000 + (row_number() over (order by i.codigo_interno))::integer, 'ACONDICIONAMIENTO'::text,
             i.nombre, m.insumo_id, i.codigo_interno, m.cantidad_por_unidad, i.unidad_medida, m.merma,
             (v_refs -> m.insumo_id::text ->> 'c')::numeric, v_refs -> m.insumo_id::text ->> 'o',
             round(m.cantidad_por_unidad / (1 - m.merma) * (v_refs -> m.insumo_id::text ->> 'c')::numeric, 4),
             case when v_refs -> m.insumo_id::text is null then 'Insumo sin costo' end
        from gmp.materiales_acondicionamiento m
        join gmp.insumos_catalogo i on i.id = m.insumo_id
       where m.producto_id = v_prod.id and m.activo;

    -- Mano de obra
    select mp.minutos_por_unidad into v_minutos
      from comercial.minutos_producto mp where mp.producto_id = v_prod.id order by mp.orden desc limit 1;
    return query
      select v_prod.id, 2000, 'MANO_DE_OBRA'::text, 'Mano de obra'::text, null::uuid, null::text, v_minutos,
             'min'::text, 0::numeric, round(v_hora / 60, 6), 'COSTO_HORA'::text, round(v_minutos * v_hora / 60, 4),
             case when v_minutos is null then 'Sin minutos por unidad'
                  when v_hora is null then 'Sin costo hora' end;
  end loop;
end;
$$;

comment on function comercial.costos_productos(uuid[]) is
  'Desglose del costo unitario: granel (formula_para_costo × contenido), acondicionamiento (cantidad / (1 − merma), '
  'como los faltantes de 20260917120000) y mano de obra (minutos × costo hora / 60). Las filas con `falta` no suman.';

-- 3. Conciliación: la nota de crédito cuenta para la recepción de su factura
--    aunque no tenga recepción propia; y quien no ve costos no ve la vista
--    (sin costos de lote le marcaría «revisar» en todas).
create or replace view comercial.v_conciliacion_recepcion
with (security_invoker = true) as
with comprobantes as (
  select coalesce(cp.recepcion_id, fa.recepcion_id) as recepcion_id,
         sum(case when cp.tipo = 'FACTURA_A' then cp.importe_neto
                  when cp.tipo in ('FACTURA_B', 'FACTURA_C') then cp.importe_total
                  when cp.tipo = 'NOTA_CREDITO_A' then -cp.importe_neto
                  else -cp.importe_total end) as neto_comprobantes,
         count(*) filter (where cp.tipo::text like 'FACTURA%') as comprobantes
    from comercial.comprobantes_proveedor cp
    left join comercial.comprobantes_proveedor fa on fa.id = cp.comprobante_asociado_id
   where coalesce(cp.recepcion_id, fa.recepcion_id) is not null
     and cp.anulado_en is null
     and cp.tipo <> 'SIN_FACTURA'
   group by coalesce(cp.recepcion_id, fa.recepcion_id)
  having count(*) filter (where cp.tipo::text like 'FACTURA%') > 0
),
lotes as (
  select l.recepcion_id,
         count(*) as lotes,
         count(c.id) as lotes_con_costo,
         coalesce(sum(c.precio_neto_ars), 0) as neto_lotes
    from gmp.lotes_insumo l
    left join comercial.v_costos_lote c on c.lote_insumo_id = l.id
   where l.recepcion_id is not null
   group by l.recepcion_id
)
select r.id as recepcion_id, r.numero as recepcion,
       (r.fecha_hora at time zone 'America/Argentina/Buenos_Aires')::date as fecha, r.proveedor_id,
       k.comprobantes, k.neto_comprobantes, l.lotes, l.lotes_con_costo, l.neto_lotes,
       l.neto_lotes - k.neto_comprobantes as diferencia,
       abs(l.neto_lotes - k.neto_comprobantes) > 1 or l.lotes_con_costo < l.lotes as con_aviso
  from comprobantes k
  join gmp.recepciones r on r.id = k.recepcion_id
  join lotes l on l.recepcion_id = r.id
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION');

-- 4. Lo que la revisión pidió dejar escrito.
comment on view comercial.v_parametros_costo is
  'Parámetros vigentes. Sin rol de costos, ninguna fila. El escape por current_user (fuera de authenticated/anon) es '
  'para migraciones y funciones SECURITY DEFINER; vale mientras ningún rol dedicado (CLAUDE.md §5) reciba SELECT '
  'sobre esta vista. La RLS forzada de parametros_costo sigue aplicando igual.';
comment on function comercial.fn_aviso_variacion() is
  'SECURITY DEFINER: quien carga el lote (Gerencia de Producción) no escribe avisos; el aviso lo genera la base. '
  'Compara el precio del lote SIN accesorios contra el costo de referencia manual vigente. El INSERT en avisos_costo '
  'no tiene política: funciona porque el dueño de la función (postgres) tiene BYPASSRLS. Si el dueño cambia, hace '
  'falta una política de INSERT para él, o toda carga que supere el umbral fallaría.';
