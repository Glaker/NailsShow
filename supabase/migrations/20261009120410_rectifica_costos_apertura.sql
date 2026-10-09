-- ---------------------------------------------------------------------------
-- Propósito : Rectificar dos costos de la carga de apertura (20261009120400)
--             que la planilla trae mal: 111ENV con un dólar implícito absurdo
--             (COSTO $ / COSTO U$D = 0,66) y 135FRA6 con fecha 4835-02-07.
-- Reglas    : R-10, D-42. El costo no se edita: se carga una fila que rectifica
--             a la original y dice por qué (comercial.costos_lote.rectifica_a).
-- Fecha     : 2026-10-09
-- ---------------------------------------------------------------------------
--
-- El neto en pesos de los dos ya era correcto (importe × tipo de cambio = el
-- unitario de la planilla); lo que estaba mal era el dato de origen: una
-- moneda original en dólares que no es real y una fecha imposible. Se
-- reexpresan en pesos (111ENV) y sin fecha (135FRA6). El generador
-- (scripts/apertura/generar_costos_apertura.mjs) ya descarta esos casos.
--
-- AUTOR y ANOMALÍA ESPERADA: como en 20261009120400.

do $$
declare
  v_autor uuid;
  v_n     integer;
begin
  select ejecutada_por into v_autor from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_autor is null then
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('usuario_id', v_autor::text)::text, true);

  insert into comercial.costos_lote
    (lote_insumo_id, origen, importe, moneda, tipo_cambio, cantidad, unidad, fecha_costo, rectifica_a, motivo, cargado_por)
  select c.lote_insumo_id, 'APERTURA', c.importe_neto_ars, 'ARS', 1, c.cantidad, c.unidad,
         case when c.fecha_costo > date '2026-10-09' then null else c.fecha_costo end,
         c.id,
         case i.codigo_interno
           when '111ENV'  then 'La planilla da un dólar implícito de 0,66 $/U$D: se reexpresa en pesos (mismo neto).'
           when '135FRA6' then 'La planilla trae fecha de costo 4835-02-07: se deja sin fecha (mismo neto).'
         end,
         v_autor
    from comercial.costos_lote c
    join gmp.lotes_insumo l on l.id = c.lote_insumo_id
    join gmp.insumos_catalogo i on i.id = l.insumo_id
   where c.origen = 'APERTURA'
     and c.rectifica_a is null
     and i.codigo_interno in ('111ENV', '135FRA6')
     and not exists (select 1 from comercial.costos_lote r where r.rectifica_a = c.id);
  get diagnostics v_n = row_count;
  raise notice 'Costos de apertura rectificados: %', v_n;
end;
$$;
