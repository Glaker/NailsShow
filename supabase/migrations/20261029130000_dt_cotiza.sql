-- ---------------------------------------------------------------------------
-- Propósito : Dirección Técnica también cotiza, como Gerencia de Producción:
--             crea, edita y emite sus cotizaciones (componentes del catálogo
--             con su costo, o con nombre y precio a mano, solo de uso interno)
--             y ve las suyas. Para eso lee los costos que usa el cotizador. El
--             PDF del cliente no cambia: producto, cantidad y precio.
-- Reglas    : D-52 (quién cotiza) y D-38 (quién ve costos), ampliadas por el
--             codirector técnico el 2026-10-29 (D-cotiza-dt-1). RN-50.
-- Fecha     : 2026-10-29
-- ---------------------------------------------------------------------------

-- 1. Costos que lee el cotizador (v_costo_referencia, v_parametros_costo,
--    v_costo_producto): se suma DIRECCION_TECNICA a la lectura (D-38).
alter policy costos_accesorios_select_costos on comercial.costos_accesorios
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy costos_apertura_pendientes_select_costos on comercial.costos_apertura_pendientes
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy costos_estimados_select_costos on comercial.costos_estimados
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy costos_lote_select_costos on comercial.costos_lote
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy costos_producto_planilla_select_costos on comercial.costos_producto_planilla
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy costos_referencia_select_costos on comercial.costos_referencia
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy parametros_costo_select_costos on comercial.parametros_costo
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
alter policy series_macro_select_costos on comercial.series_macro
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));

-- La vista de parámetros también filtra por rol: copia de 20261010120000.
create or replace view comercial.v_parametros_costo
with (security_invoker = true) as
select (select h.costo_hora from comercial.parametros_costo h
         where h.costo_hora is not null order by h.orden desc limit 1) as costo_hora,
       coalesce((select h.umbral_variacion from comercial.parametros_costo h
                  where h.umbral_variacion is not null order by h.orden desc limit 1), 0.05) as umbral_variacion,
       coalesce((select h.margen_minimo from comercial.parametros_costo h
                  where h.margen_minimo is not null order by h.orden desc limit 1), 0.25) as margen_minimo,
       coalesce((select h.vigencia_cotizacion_dias from comercial.parametros_costo h
                  where h.vigencia_cotizacion_dias is not null order by h.orden desc limit 1), 7) as vigencia_cotizacion_dias,
       coalesce((select h.serie_tipo_cambio from comercial.parametros_costo h
                  where h.serie_tipo_cambio is not null order by h.orden desc limit 1), 'A3500') as serie_tipo_cambio,
       p.cargado_por, p.cargado_en,
       coalesce((select h.corte_a from comercial.parametros_costo h
                  where h.corte_a is not null order by h.orden desc limit 1), 0.80) as corte_a,
       coalesce((select h.corte_b from comercial.parametros_costo h
                  where h.corte_b is not null order by h.orden desc limit 1), 0.95) as corte_b,
       coalesce((select h.corte_apertura from comercial.parametros_costo h
                  where h.corte_apertura is not null order by h.orden desc limit 1), date '2025-01-01') as corte_apertura
  from (select 1) d
  left join lateral (select * from comercial.parametros_costo order by orden desc limit 1) p on true
 -- NUEVO en 20261029130000: DIRECCION_TECNICA, que cotiza.
 where core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
    or current_user not in ('authenticated', 'anon');

-- 2. Cotizaciones: la DT, como Gerencia de Producción, las suyas (D-52).
alter policy cotizaciones_select_cotizan on comercial.cotizaciones
  using (core.es_rol('FINANZAS', 'GERENCIA')
         or (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and creado_por = core.usuario_actual()));
alter policy cotizaciones_insert_cotizan on comercial.cotizaciones
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
              and creado_por = core.usuario_actual());
alter policy cotizaciones_update_cotizan on comercial.cotizaciones
  using (core.es_rol('FINANZAS', 'GERENCIA')
         or (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and creado_por = core.usuario_actual()))
  with check (core.es_rol('FINANZAS', 'GERENCIA')
              or (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and creado_por = core.usuario_actual()));

-- Clientes potenciales (D-53) y propuestas al catálogo, como quien cotiza.
alter policy clientes_potenciales_select_cotizan on comercial.clientes_potenciales
  using (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));
alter policy clientes_potenciales_insert_cotizan on comercial.clientes_potenciales
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
              and creado_por = core.usuario_actual());
alter policy clientes_potenciales_update_comercial on comercial.clientes_potenciales
  using (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'))
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA'));
alter policy solicitudes_catalogo_insert_cotizan on comercial.solicitudes_catalogo
  with check (core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
              and creado_por = core.usuario_actual()
              and exists (select 1 from comercial.cotizacion_lineas l where l.id = cotizacion_linea_id));

-- 3. Emitir: copia de 20261009160000 con DIRECCION_TECNICA (marcado NUEVO).
create or replace function comercial.emitir_cotizacion(p_id uuid, p_justificacion text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c       comercial.cotizaciones%rowtype;
  v_lineas  jsonb;
  v_falta   text;
  v_mat     numeric;
  v_hora    numeric;
  v_mo      numeric := 0;
  v_costo   numeric;
  v_precio  numeric;
  v_mostrado numeric;
  v_margen  numeric;
  v_minimo  numeric;
  v_justif  text;
  v_numero  integer;
  v_anio    integer := extract(year from comercial.hoy())::int;
  v_cliente jsonb;
begin
  -- NUEVO en 20261029130000: también Dirección Técnica.
  if not core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'No tenés permiso para emitir cotizaciones.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from comercial.cotizaciones where id = p_id for update;
  if not found or v_c.estado <> 'BORRADOR'
     or (v_c.creado_por <> core.usuario_actual() and not core.es_rol('FINANZAS', 'GERENCIA')) then
    raise exception 'La cotización no existe, ya se emitió o no es tuya.' using errcode = 'check_violation';
  end if;

  -- El servidor recalcula todo: lo de la pantalla era sólo para ver en vivo.
  select jsonb_agg(to_jsonb(x) order by x.orden), sum(x.subtotal), string_agg(x.falta, '; ')
    into v_lineas, v_mat, v_falta
    from comercial.costear_cotizacion(p_id) x;
  if v_lineas is null then
    raise exception 'La cotización no tiene componentes.' using errcode = 'check_violation';
  end if;
  if v_falta is not null then
    raise exception 'No se puede emitir con componentes sin costo: %', v_falta using errcode = 'check_violation';
  end if;
  select costo_hora, margen_minimo into v_hora, v_minimo from comercial.v_parametros_costo;
  if v_c.incluir_mano_obra then
    if v_hora is null or v_c.minutos_por_unidad is null then
      raise exception 'Para incluir mano de obra hacen falta el costo hora (Finanzas) y los minutos por unidad.'
        using errcode = 'check_violation';
    end if;
    v_mo := round(v_c.minutos_por_unidad * v_hora / 60, 4);
  end if;
  v_costo  := round(v_mat + v_mo, 4);
  v_precio := round(comercial.precio_cotizacion(v_costo, v_c.modo_margen, v_c.fija, v_c.margen_objetivo,
                                                v_c.precio_objetivo, v_c.redondeo, v_c.leyenda_iva, v_c.alicuota_iva), 4);
  if v_precio is null or v_precio <= 0 then
    raise exception 'El precio tiene que ser mayor que cero.' using errcode = 'check_violation';
  end if;
  v_mostrado := round(case when v_c.leyenda_iva = 'IVA_INCLUIDO' then v_precio * (1 + v_c.alicuota_iva / 100)
                           else v_precio end, 2);
  v_margen := (v_precio - v_costo) / v_precio;
  v_justif := coalesce(nullif(btrim(p_justificacion), ''), nullif(btrim(v_c.justificacion_margen), ''));
  if v_margen < v_minimo and v_justif is null then
    raise exception 'El margen (%) queda debajo del mínimo (%): escribí por qué se cotiza así.',
      round(v_margen * 100, 1), round(v_minimo * 100, 1) using errcode = 'check_violation';
  end if;

  select case v_c.destino
           when 'CLIENTE' then (select jsonb_build_object('razon_social', razon_social, 'documento', numero_documento,
                                                          'tipo_documento', tipo_documento)
                                  from comercial.clientes where id = v_c.cliente_id)
           when 'POTENCIAL' then (select jsonb_build_object('razon_social', razon_social, 'documento', cuit,
                                                            'contacto', contacto)
                                    from comercial.clientes_potenciales where id = v_c.cliente_potencial_id)
         end into v_cliente;

  v_numero := comercial.siguiente_numero('cotizacion', v_anio);

  update comercial.cotizaciones
     set estado = 'EMITIDA', numero = v_numero, anio = v_anio,
         emitida_en = now(), emitida_por = core.usuario_actual(),
         vence_el = comercial.hoy() + v_c.vigencia_dias,
         costo_unitario = v_costo, precio_unitario = v_precio,
         justificacion_margen = v_justif,
         foto = jsonb_build_object(
           'lineas', v_lineas, 'costo_materiales', v_mat, 'mano_de_obra', v_mo, 'costo_hora', v_hora,
           'minutos_por_unidad', v_c.minutos_por_unidad, 'costo_unitario', v_costo, 'precio_unitario', v_precio,
           'margen_sobre_precio', round(v_margen, 6),
           'recargo_sobre_costo', case when v_costo > 0 then round((v_precio - v_costo) / v_costo, 6) end,
           'margen_minimo', v_minimo, 'cliente', v_cliente,
           -- Lo que va al PDF (y sólo esto): precios mostrados, nada de costos.
           'pdf', jsonb_build_object(
             'numero', v_numero, 'anio', v_anio, 'fecha', comercial.hoy(),
             'vence_el', comercial.hoy() + v_c.vigencia_dias, 'destino', v_c.destino, 'cliente', v_cliente,
             'titulo', v_c.titulo, 'contenido_cantidad', v_c.contenido_cantidad,
             'contenido_unidad', v_c.contenido_unidad, 'cantidad', v_c.cantidad_cotizada,
             'precio_unitario', v_mostrado, 'total', round(v_mostrado * v_c.cantidad_cotizada, 2),
             'leyenda_iva', v_c.leyenda_iva, 'alicuota_iva', v_c.alicuota_iva,
             'observaciones', v_c.observaciones,
             'emitida_por', (select nombre_completo from core.usuarios where id = core.usuario_actual())))
   where id = p_id;
  return v_numero;
end;
$$;
