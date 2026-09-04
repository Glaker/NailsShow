-- ---------------------------------------------------------------------------
-- Propósito : Vistas de lectura para el tablero y el listado de lotes.
-- Reglas    : Ninguna nueva. Son proyecciones de lo ya registrado.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------
--
-- Todas con `security_invoker = true`: la vista se evalúa con los permisos de
-- quien consulta, así que las políticas RLS de las tablas de base siguen
-- gobernando. Una vista con `security_definer` sería un agujero por el que se
-- lee lo que la política niega.

-- ---------------------------------------------------------------------------
-- Lote de insumo con su contexto resuelto
-- ---------------------------------------------------------------------------
-- La pantalla de planta muestra nombre de insumo, proveedor y color de rótulo
-- juntos. Resolverlo en la base evita cuatro consultas encadenadas desde una
-- tablet con conexión mala.

create view gmp.v_lotes_insumo with (security_invoker = true) as
  select
    l.id,
    l.numero_registro_interno,
    l.lote_proveedor,
    l.estado,
    gmp.color_rotulo(l.estado)          as color_rotulo,
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
    ro.emitido_en                       as rotulo_emitido_en
  from gmp.lotes_insumo l
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  join gmp.recepciones r      on r.id = l.recepcion_id
  join gmp.proveedores p      on p.id = r.proveedor_id
  left join gmp.depositos d   on d.id = l.deposito_actual_id
  left join gmp.rotulos ro    on ro.entidad_tipo = 'lote_insumo'
                             and ro.entidad_id = l.id
                             and ro.vigente;

comment on view gmp.v_lotes_insumo is
  'Lote de insumo con insumo, proveedor, depósito y rótulo vigente resueltos. Lectura del listado de planta.';

-- ---------------------------------------------------------------------------
-- Tablero
-- ---------------------------------------------------------------------------
-- Una sola fila con los indicadores de la pantalla de inicio. Un lote en
-- cuarentena hace días y sin muestrear es el dato que mueve el trabajo del
-- turno; por eso está acá y no en un reporte.

create view gmp.v_tablero with (security_invoker = true) as
  select
    (select count(*) from gmp.lotes_insumo where estado = 'CUARENTENA')                      as lotes_en_cuarentena,
    (select count(*) from gmp.lotes_insumo where estado = 'EN_ANALISIS')                     as lotes_en_analisis,
    (select count(*) from gmp.lotes_insumo where estado = 'APROBADO')                        as lotes_aprobados,
    (select count(*) from gmp.lotes_insumo where estado = 'RECHAZADO')                       as lotes_rechazados,
    (select count(*) from gmp.lotes_insumo where estado = 'RECIBIDO')                        as lotes_sin_rotular,
    (select count(*) from gmp.lotes_insumo
      where plazo_validez is not null
        and plazo_validez <= current_date + 90
        and estado <> 'RECHAZADO')                                                           as lotes_por_vencer,
    (select count(*) from gmp.recepciones
      where fecha_hora >= date_trunc('month', now()))                                        as recepciones_del_mes,
    (select count(*) from gmp.recepciones where not cargado_a_stock)                         as recepciones_sin_cargar,
    (select count(*) from gmp.insumos_catalogo where activo)                                 as insumos_activos,
    (select count(*) from gmp.proveedores where activo)                                      as proveedores_activos,
    (select count(*) from gmp.proveedores where activo and estado_aprobacion = 'PENDIENTE')  as proveedores_pendientes,
    (select count(*) from core.usuarios where activo)                                        as usuarios_activos;

comment on view gmp.v_tablero is
  'Indicadores de la pantalla de inicio. Una sola fila.';

-- Serie diaria de recepciones para el gráfico del tablero. Se generan los días
-- faltantes con generate_series: un gráfico que saltea los días sin actividad
-- miente sobre el ritmo de trabajo.
create view gmp.v_recepciones_por_dia with (security_invoker = true) as
  select
    d::date                                    as dia,
    count(r.id)                                as recepciones,
    count(l.id)                                as lotes
  from generate_series(current_date - 29, current_date, interval '1 day') as d
  left join gmp.recepciones r
         on r.fecha_hora >= d and r.fecha_hora < d + interval '1 day'
  left join gmp.lotes_insumo l on l.recepcion_id = r.id
  group by d
  order by d;

comment on view gmp.v_recepciones_por_dia is
  'Recepciones y lotes por día de los últimos 30 días, con los días vacíos incluidos.';

create view gmp.v_lotes_por_estado with (security_invoker = true) as
  select
    e.estado,
    gmp.color_rotulo(e.estado) as color_rotulo,
    count(l.id)                as cantidad
  from unnest(enum_range(null::gmp.estado_calidad_enum)) as e(estado)
  left join gmp.lotes_insumo l on l.estado = e.estado
  group by e.estado
  order by e.estado;

comment on view gmp.v_lotes_por_estado is
  'Conteo de lotes por estado, incluidos los estados sin lotes.';

grant select on gmp.v_lotes_insumo        to authenticated;
grant select on gmp.v_tablero             to authenticated;
grant select on gmp.v_recepciones_por_dia to authenticated;
grant select on gmp.v_lotes_por_estado    to authenticated;
