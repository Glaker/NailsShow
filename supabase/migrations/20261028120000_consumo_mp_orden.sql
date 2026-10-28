-- ---------------------------------------------------------------------------
-- Propósito : Las fórmulas se cargan en % P/P o en % V/V, y la materia prima
--             que lleva una orden se descuenta del stock al terminarla, de
--             los lotes que se pueden usar que vencen primero. Un removedor 50 %
--             acetona / 50 % etanol en V/V, orden de 100 ml: salen 50 ml de
--             cada uno. Si el insumo está en otra unidad (kg contra ml), se
--             convierte con su densidad; si falta, no deja terminar y dice
--             cuál.
-- Reglas    : D-consumo-orden-1 (codirector técnico, 2026-10-28: el total es
--             el de cada orden; P/P o V/V por fórmula; al terminar, del lote
--             que vence primero, todo o nada). RN-54 / invariante 8 (los
--             movimientos no se editan), invariante 7 (comercial → gmp: el
--             consumo vive en comercial). Pedido pendiente de ESTADO.md
--             «Cargar fórmulas en %V/V además de %P/P».
-- Fecha     : 2026-10-28
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Base de los porcentajes, por fórmula
-- ===========================================================================

alter table gmp.formulas_fabricacion
  add column base_porcentaje text not null default 'PP' check (base_porcentaje in ('PP', 'VV'));
comment on column gmp.formulas_fabricacion.base_porcentaje is
  'PP: porcentaje_pp de los componentes es % masa/masa. VV: es % volumen/volumen (D-consumo-orden-1). '
  'La columna del componente conserva su nombre; la interpreta gmp.calcular_lote según esto.';

-- Una vigente es el documento GMP: cambiar cómo se leen sus porcentajes es
-- otra versión (gmp.nueva_version_formula).
create or replace function gmp.fn_formula_base_fija()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.base_porcentaje is distinct from old.base_porcentaje and old.estado <> 'BORRADOR' then
    raise exception 'La fórmula % ya no está en borrador: P/P o V/V se cambia en una versión nueva.', old.version
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger trg_formula_base_fija before update of base_porcentaje on gmp.formulas_fabricacion
  for each row execute function gmp.fn_formula_base_fija();

-- ===========================================================================
-- 2. calcular_lote en V/V
-- ===========================================================================
--
-- Copia de 20260930130000. P/P sin cambios. V/V: el objetivo se pasa a
-- volumen (con la densidad del producto o, si no la tiene, la ideal de la
-- mezcla en volumen), cada componente es su % de ese volumen y su masa es
-- volumen × densidad (null si el insumo no tiene densidad).

CREATE OR REPLACE FUNCTION gmp.calcular_lote(p_formula_id uuid, p_volumen_l numeric DEFAULT NULL::numeric, p_masa_kg numeric DEFAULT NULL::numeric, p_temp_c numeric DEFAULT 20)
 RETURNS SETOF gmp.renglon_pesada
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_f        gmp.formulas_fabricacion%rowtype;
  v_masa     numeric;
  v_vol      numeric;
  v_rho      numeric;
  v_declarado numeric;
  v_estimada record;
  v_faltan   text;
begin
  select * into v_f from gmp.formulas_fabricacion where id = p_formula_id;
  if not found then
    raise exception 'No existe la fórmula %.', p_formula_id;
  end if;

  if (p_volumen_l is null) = (p_masa_kg is null) then
    raise exception 'Indicá el objetivo en volumen o en masa, uno de los dos.'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(porcentaje_pp) filter (where not es_csp), 0)
    into v_declarado
    from gmp.formula_componentes where formula_id = p_formula_id and not anulado;

  -- NUEVO en 20261028120000: fórmula en % V/V.
  if v_f.base_porcentaje = 'VV' then
    if p_volumen_l is not null then
      v_vol := p_volumen_l;
    elsif v_f.densidad_producto is not null then
      v_vol := p_masa_kg / v_f.densidad_producto;
    else
      -- Densidad ideal de la mezcla en volumen: Σ fracción × densidad.
      select sum(coalesce(c.porcentaje_pp, 100 - v_declarado) / 100
                 * gmp.densidad_a(coalesce(c.densidad_id, i.densidad_referencia_id), p_temp_c))
               filter (where coalesce(c.densidad_id, i.densidad_referencia_id) is not null),
             string_agg(coalesce(i.nombre, c.nombre_libre), ', ')
               filter (where coalesce(c.densidad_id, i.densidad_referencia_id) is null)
        into v_rho, v_faltan
        from gmp.formula_componentes c
        left join gmp.insumos_catalogo i on i.id = c.insumo_id
       where c.formula_id = p_formula_id and not c.anulado;
      if v_faltan is not null or v_rho is null or v_rho <= 0 then
        raise exception
          'La fórmula es en V/V y la orden en kg: falta la densidad del producto (no tienen densidad: %). '
          'Cargala en la fórmula, o abrí la orden en litros.', coalesce(v_faltan, 'ningún componente')
          using errcode = 'check_violation';
      end if;
      v_vol := p_masa_kg / v_rho;
    end if;
    v_vol := v_vol / v_f.rendimiento;

    return query
    with base as (
      select c.*, i.nombre as insumo_nombre, i.codigo_interno as insumo_codigo,
             coalesce(c.densidad_id, i.densidad_referencia_id) as densidad_efectiva,
             v_vol * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100 as vol
        from gmp.formula_componentes c
        left join gmp.insumos_catalogo i on i.id = c.insumo_id
       where c.formula_id = p_formula_id and not c.anulado
    ),
    con_densidad as (
      select b.*, case when b.densidad_efectiva is null then null
                       else gmp.densidad_a(b.densidad_efectiva, p_temp_c) end as rho
        from base b
    )
    select d.orden, coalesce(d.insumo_nombre, d.nombre_libre), d.insumo_id, d.insumo_codigo,
           coalesce(d.porcentaje_pp, 100 - v_declarado),
           case when d.rho is null then null else round(d.vol * d.rho, 4) end,
           d.se_mide_a_volumen, d.rho, round(d.vol, 4), d.etapa, d.observacion
      from con_densidad d
     order by d.orden;
    return;
  end if;

  if p_masa_kg is not null then
    v_masa := p_masa_kg;
  elsif v_f.densidad_producto is not null then
    -- densidad en g/mL es numéricamente igual a kg/L, así que no hay factor.
    v_masa := p_volumen_l * v_f.densidad_producto;
  else
    -- NUEVO en 20260924160000: sin densidad medida, la del modelo de mezcla,
    -- siempre que todos los componentes tengan densidad.
    select * into v_estimada from gmp.densidad_mezcla_formula(p_formula_id, p_temp_c);
    if v_estimada.densidad_real is null or cardinality(v_estimada.sin_densidad) > 0 then
      raise exception
        'La fórmula no tiene densidad del producto terminado y no se puede estimar (faltan densidades de: %). '
        'Medirla con el densitómetro (I.50.25) y cargarla, o indicar el objetivo en masa.',
        coalesce(array_to_string(v_estimada.sin_densidad, ', '), 'todos los componentes')
        using errcode = 'check_violation';
    end if;
    v_masa := p_volumen_l * v_estimada.densidad_real::numeric;
  end if;

  -- El rendimiento agranda la carga, no la achica.
  v_masa := v_masa / v_f.rendimiento;

  return query
  with base as (
    select
      c.*,
      i.nombre          as insumo_nombre,
      i.codigo_interno  as insumo_codigo,
      coalesce(c.densidad_id, i.densidad_referencia_id) as densidad_efectiva,
      v_masa * coalesce(c.porcentaje_pp, 100 - v_declarado) / 100 as masa
    from gmp.formula_componentes c
    left join gmp.insumos_catalogo i on i.id = c.insumo_id
    where c.formula_id = p_formula_id
      and not c.anulado
  ),
  con_densidad as (
    select b.*,
           case when b.densidad_efectiva is null then null
                else gmp.densidad_a(b.densidad_efectiva, p_temp_c) end as rho
    from base b
  )
  select
    d.orden,
    coalesce(d.insumo_nombre, d.nombre_libre)                  as componente,
    d.insumo_id,
    d.insumo_codigo,
    coalesce(d.porcentaje_pp, 100 - v_declarado)               as porcentaje_pp,
    round(d.masa, 4)                                           as masa_kg,
    d.se_mide_a_volumen,
    d.rho                                                      as densidad_aplicada,
    case when d.rho is null then null else round(d.masa / d.rho, 4) end as volumen_l,
    d.etapa,
    d.observacion
  from con_densidad d
  order by d.orden;
end;
$function$;

-- ===========================================================================
-- 3. Las copias de fórmula conservan la base
-- ===========================================================================
--
-- Copias de 20261023170000 y 20261023120000 con base_porcentaje en el insert,
-- y de 20261023160000 (pegar componentes) con la base controlada.

create or replace function gmp.nueva_version_formula(p_formula_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_f       gmp.formulas_fabricacion%rowtype;
  v_version integer;
  v_id      uuid;
  v_texto   text;
  v_pv      integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Una versión nueva de la fórmula la emite Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_f from gmp.formulas_fabricacion where id = p_formula_id;
  if not found then
    raise exception 'La fórmula no existe.' using errcode = 'check_violation';
  end if;

  -- Si ya hay una en borrador de ese producto y variedad, se sigue esa.
  select id into v_id from gmp.formulas_fabricacion
   where producto_id = v_f.producto_id and variedad is not distinct from v_f.variedad and estado = 'BORRADOR'
   order by creado_en desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('formula|' || v_f.producto_id::text, 0));
  select coalesce(max(version::integer), 0) + 1 into v_version
    from gmp.formulas_fabricacion
   where producto_id = v_f.producto_id and variedad is not distinct from v_f.variedad and version ~ '^[0-9]+$';

  insert into gmp.formulas_fabricacion
    (producto_id, variedad, especificacion_id, codigo_me, version, densidad_producto, densidad_temp_c, rendimiento,
     base_porcentaje)
  values
    (v_f.producto_id, v_f.variedad, v_f.especificacion_id, v_f.codigo_me, v_version::text,
     v_f.densidad_producto, v_f.densidad_temp_c, v_f.rendimiento, v_f.base_porcentaje)
  returning id into v_id;

  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select v_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
         etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_formula_id and not anulado;

  -- El procedimiento que rige, como primera versión del de la fórmula nueva.
  select texto, version into v_texto, v_pv from gmp.v_procedimiento_vigente where formula_id = p_formula_id;
  if v_texto is not null then
    insert into gmp.formula_procedimientos (formula_id, version, texto, motivo_cambio)
    values (v_id, 0, v_texto, format('Viene de la versión %s de la fórmula (procedimiento v%s)', v_f.version, v_pv));
  end if;
  return v_id;
end;
$$;

create or replace function gmp.copiar_formula(p_origen uuid, p_producto_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_o       gmp.formulas_fabricacion%rowtype;
  v_version integer;
  v_id      uuid;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar una fórmula es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_o from gmp.formulas_fabricacion where id = p_origen;
  if not found then
    raise exception 'La fórmula que se quiere copiar no existe.' using errcode = 'check_violation';
  end if;
  select coalesce(max(version::integer), 0) + 1 into v_version
    from gmp.formulas_fabricacion
   where producto_id = p_producto_id and variedad is null and version ~ '^[0-9]+$';

  insert into gmp.formulas_fabricacion
    (producto_id, version, densidad_producto, densidad_temp_c, rendimiento, base_porcentaje)
  values (p_producto_id, v_version::text, v_o.densidad_producto, v_o.densidad_temp_c, v_o.rendimiento,
          v_o.base_porcentaje)
  returning id into v_id;

  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select v_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
         etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_origen and not anulado;
  return v_id;
end;
$$;

-- Copia de 20261023160000: pegar componentes de otra fórmula. NUEVO: en un
-- borrador vacío toma la base de la original; con componentes, las dos
-- tienen que tener la misma (si no, los % se leerían de otra manera).
create or replace function gmp.copiar_componentes(p_origen uuid, p_destino uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_desde integer;
  v_n     integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Copiar una fórmula es de Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_origen = p_destino then
    raise exception 'Elegí otra fórmula: es la misma.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from gmp.formulas_fabricacion where id = p_destino and estado = 'BORRADOR') then
    raise exception 'Solo se pega en una fórmula en borrador.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from gmp.formula_componentes where formula_id = p_destino and es_csp and not anulado)
     and exists (select 1 from gmp.formula_componentes where formula_id = p_origen and es_csp and not anulado) then
    raise exception 'Las dos fórmulas tienen componente csp y solo puede haber uno: quitá el de esta antes de pegar.'
      using errcode = 'check_violation';
  end if;

  -- NUEVO en 20261028120000.
  if not exists (select 1 from gmp.formula_componentes where formula_id = p_destino and not anulado) then
    update gmp.formulas_fabricacion d set base_porcentaje = o.base_porcentaje
      from gmp.formulas_fabricacion o
     where d.id = p_destino and o.id = p_origen and d.base_porcentaje <> o.base_porcentaje;
  elsif (select base_porcentaje from gmp.formulas_fabricacion where id = p_origen)
        <> (select base_porcentaje from gmp.formulas_fabricacion where id = p_destino) then
    raise exception 'Una fórmula está en %% P/P y la otra en %% V/V: no se pegan juntas.'
      using errcode = 'check_violation';
  end if;

  -- Se agregan al final, en el orden de la original.
  select coalesce(max(orden), 0) into v_desde from gmp.formula_componentes where formula_id = p_destino;
  insert into gmp.formula_componentes
    (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
     etapa, observacion)
  select p_destino, v_desde + row_number() over (order by orden), insumo_id, nombre_libre, porcentaje_pp,
         es_csp, se_mide_a_volumen, densidad_id, etapa, observacion
    from gmp.formula_componentes
   where formula_id = p_origen and not anulado;
  get diagnostics v_n = row_count;

  -- La densidad medida, si esta no tiene.
  update gmp.formulas_fabricacion d
     set densidad_producto = o.densidad_producto, densidad_temp_c = o.densidad_temp_c
    from gmp.formulas_fabricacion o
   where d.id = p_destino and o.id = p_origen and d.densidad_producto is null and o.densidad_producto is not null;
  return v_n;
end;
$$;

-- ===========================================================================
-- 4. Lo que consumió cada orden
-- ===========================================================================

create table comercial.orden_consumos (
  id        uuid primary key default gen_random_uuid(),
  orden_id  uuid not null references gmp.ordenes_produccion(id),
  insumo_id uuid not null references gmp.insumos_catalogo(id),
  unidad    text not null,
  cantidad  numeric(16,4) not null check (cantidad > 0),
  creado_en timestamptz not null default now(),
  unique (orden_id, insumo_id)
);
comment on table comercial.orden_consumos is
  'Materia prima que consumió una orden al terminarse, en la unidad de la ficha del insumo (D-consumo-orden-1). '
  'Los movimientos de stock apuntan acá (documento ORDEN_CONSUMO).';
create index orden_consumos_insumo_idx on comercial.orden_consumos (insumo_id);

alter table comercial.orden_consumos enable row level security;
alter table comercial.orden_consumos force  row level security;
grant select, insert on comercial.orden_consumos to authenticated;

create policy orden_consumos_select_authenticated on comercial.orden_consumos
  for select to authenticated using (core.rol() is not null);
comment on policy orden_consumos_select_authenticated on comercial.orden_consumos is
  '§3.3: consulta para todos los roles; une el lote de producto con los lotes de materia prima que llevó.';
create policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos
  for insert to authenticated with check (
    core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
    and exists (select 1 from gmp.ordenes_produccion o where o.id = orden_id and o.estado = 'TERMINADA'));
comment on policy orden_consumos_insert_gerencia_produccion on comercial.orden_consumos is
  'Lo escribe comercial.terminar_orden (GP o DT), con la orden ya terminada. Sin UPDATE ni DELETE (RN-54).';

select core.adjuntar_auditoria('comercial.orden_consumos');

-- ===========================================================================
-- 5. Validación del movimiento de consumo de una orden
-- ===========================================================================
--
-- Copia de 20261021120000 con la rama ORDEN_CONSUMO (marcada NUEVO).

create or replace function comercial.fn_validar_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articulo    comercial.articulos%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_deposito    gmp.depositos%rowtype;
  v_impedimento text;
  v_saldo       numeric(16,4);
  v_anulado     comercial.movimientos_stock%rowtype;
  v_consumo     comercial.pedido_consumos%rowtype;
  v_etq         comercial.etiquetado_consumos%rowtype;
  v_oc          comercial.orden_consumos%rowtype;
  v_ya_bajado   numeric(16,4);
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
  if new.tipo = 'ENTRADA_PRODUCCION' then
    raise exception
      'El tipo % exige lote de producto terminado, que todavía no existe (D-04).', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo in ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION') then
    raise exception
      'El tipo % exige clientes y pedidos, que son de la fase comercial y todavía no existen.', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo = 'SALIDA_RETIRO_MERCADO' then
    raise exception
      'El tipo SALIDA_RETIRO_MERCADO lo produce el módulo de retiro de mercado (PG.60.4), que todavía no existe. '
      'Para detener material hoy corresponde registrar un bloqueo en gmp.bloqueos_lote.'
      using errcode = 'feature_not_supported';
  end if;

  -- ---- Coherencia de las tres referencias ---------------------------------
  select * into v_articulo from comercial.articulos where id = new.articulo_id;
  if not found then
    raise exception 'El artículo % no existe.', new.articulo_id;
  end if;
  if not v_articulo.activo then
    raise exception 'El artículo % está desactivado y no admite movimientos.', v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id;
  if not found then
    raise exception 'El lote % no existe.', new.lote_insumo_id;
  end if;

  if v_lote.insumo_id <> v_articulo.insumo_id then
    raise exception
      'El lote % no pertenece al artículo % : es de otro insumo.',
      v_lote.numero_registro_interno, v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_deposito from gmp.depositos where id = new.deposito_id;
  if not found then
    raise exception 'El depósito % no existe.', new.deposito_id;
  end if;
  if not v_deposito.activo then
    raise exception 'El depósito % está desactivado.', v_deposito.numero
      using errcode = 'check_violation';
  end if;

  new.unidad := v_lote.unidad;
  new.ocurrido_en := now();

  -- ---- Titular del lote (NUEVO en 20260924150200) -------------------------
  if new.tipo = 'ENTRADA_COMPRA' and v_lote.tercero_id is not null then
    raise exception 'El lote % es material de un cliente tercerizado: no entra como compra de Nail Show.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;
  if new.tipo = 'ENTRADA_PROVISTO_TERCERO' then
    if v_lote.tercero_id is null then
      raise exception 'El lote % es de Nail Show: no entra como material provisto por un tercero.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    if new.documento_tipo is distinct from 'RECEPCION' or new.documento_id is distinct from v_lote.recepcion_id then
      raise exception 'El material de un tercero entra a stock con su recepción (comercial.ingresar_stock_tercero).'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- RN-51 y RN-52 ------------------------------------------------------
  if new.tipo = 'SALIDA_MUESTRA' then
    v_impedimento := gmp.impedimento_despacho(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede disponer de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Consumo de producción ----------------------------------------------
  if new.tipo = 'SALIDA_CONSUMO_PRODUCCION' and new.documento_tipo = 'ETIQUETADO_CONSUMO' then
    -- NUEVO en 20261021120000: el envase y la etiqueta que consume un etiquetado.
    select * into v_etq from comercial.etiquetado_consumos where id = new.documento_id;
    if not found or v_etq.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un etiquetado registrado de este insumo.'
        using errcode = 'check_violation';
    end if;
    if v_lote.tercero_id is not null then
      raise exception 'El etiquetado usa material de Nail Show; el lote % es de un tercero.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_etq.id and tipo = 'SALIDA_CONSUMO_PRODUCCION';
    if v_ya_bajado - new.cantidad > v_etq.cantidad then
      raise exception 'El etiquetado consume % % y los movimientos ya suman %: no se puede bajar más.',
        v_etq.cantidad, v_etq.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;
    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'SALIDA_CONSUMO_PRODUCCION' and new.documento_tipo = 'ORDEN_CONSUMO' then
    -- NUEVO en 20261028120000: la materia prima que consume una orden.
    select * into v_oc from comercial.orden_consumos where id = new.documento_id;
    if not found or v_oc.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de esta orden.'
        using errcode = 'check_violation';
    end if;
    if v_lote.tercero_id is not null then
      raise exception 'La orden usa materia prima de Nail Show; el lote % es de un tercero.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_oc.id and tipo = 'SALIDA_CONSUMO_PRODUCCION';
    if v_ya_bajado - new.cantidad > v_oc.cantidad then
      raise exception 'La orden consume % % y los movimientos ya suman %: no se puede bajar más.',
        v_oc.cantidad, v_oc.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;
    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'SALIDA_CONSUMO_PRODUCCION' then
    if new.documento_tipo is distinct from 'PEDIDO_CONSUMO' or new.documento_id is null then
      raise exception
        'El consumo de producción se registra terminando el pedido (comercial.terminar_pedido), no como movimiento suelto.'
        using errcode = 'check_violation';
    end if;

    select * into v_consumo from comercial.pedido_consumos where id = new.documento_id;
    if not found or v_consumo.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de este insumo.'
        using errcode = 'check_violation';
    end if;

    -- NUEVO en 20260924150200: se consume del stock que el consumo declara.
    if v_lote.tercero_id is distinct from v_consumo.tercero_id then
      raise exception 'El lote % no es del stock del que se declaró el consumo.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_consumo.id
       and tipo = 'SALIDA_CONSUMO_PRODUCCION';

    if v_ya_bajado - new.cantidad > v_consumo.cantidad_real then
      raise exception
        'El consumo registrado es de % % y los movimientos ya suman %: no se puede bajar más.',
        v_consumo.cantidad_real, v_consumo.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;

    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Anulación (RN-54) --------------------------------------------------
  if new.anula_a_movimiento_id is not null then
    select * into v_anulado
      from comercial.movimientos_stock
     where id = new.anula_a_movimiento_id;

    if not found then
      raise exception 'El movimiento que se pretende anular no existe.';
    end if;
    if v_anulado.anula_a_movimiento_id is not null then
      raise exception
        'No se anula una anulación. Si la corrección estuvo mal, corresponde un movimiento de ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.articulo_id, new.lote_insumo_id, new.deposito_id)
       is distinct from
       (v_anulado.articulo_id, v_anulado.lote_insumo_id, v_anulado.deposito_id) then
      raise exception
        'El movimiento inverso tiene que caer sobre la misma posición (artículo, lote y depósito) que el que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_anulado.cantidad then
      raise exception
        'El movimiento inverso tiene que ser exactamente el opuesto del original (% esperado, % recibido).',
        -v_anulado.cantidad, new.cantidad
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- El saldo no queda negativo -----------------------------------------
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.articulo_id::text || '|' || new.lote_insumo_id::text || '|' || new.deposito_id::text,
      0
    )
  );

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = new.articulo_id
     and lote_insumo_id = new.lote_insumo_id
     and deposito_id    = new.deposito_id;

  if v_saldo + new.cantidad < 0 then
    raise exception
      'El movimiento dejaría el saldo en % (hay % y se quieren mover %) para el lote % en el depósito %. '
      'Si la existencia física no coincide con la registrada, corresponde un ajuste por diferencia de inventario.',
      v_saldo + new.cantidad, v_saldo, new.cantidad,
      v_lote.numero_registro_interno, v_deposito.numero
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 6. Terminar la orden descuenta la materia prima
-- ===========================================================================
--
-- Copia de 20261022150100 con el consumo (marcado NUEVO). La cantidad es la
-- teórica de la orden: la que se pesó. Por renglón de gmp.calcular_lote,
-- pasada a la unidad de la ficha del insumo (masa o volumen según la ficha;
-- calcular_lote ya lo da en los dos cuando el insumo tiene densidad), del
-- lote aprobado que vence primero, como comercial.registrar_etiquetado. Los
-- componentes sin insumo de catálogo (nombre libre) no tienen stock y no se
-- descuentan. Todo o nada: si falta stock o densidad, la orden no se termina.
--
-- ponytail: el producto de un tercerizado no descuenta acá (su materia prima
-- puede ser del cliente, que va por comercial.terminar_pedido). Sumarlo si
-- la orden pasa a saber de quién es el material.

create or replace function comercial.terminar_orden(p_id uuid, p_cantidad numeric, p_unidades integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_orden    gmp.ordenes_produccion%rowtype;
  v_pedido   uuid;
  mp         record;
  pos        record;
  v_ficha    text;
  v_necesita numeric(16,4);
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_consumo  uuid;
  v_articulo uuid;
  v_retenido numeric(16,4);
  v_abierta  boolean;
begin
  -- NUEVO en 20261028120000: descuenta solo la orden que pasa de abierta a
  -- terminada en esta llamada. Volver a terminarla (para corregir lo
  -- obtenido) o una terminada antes de esta migración no descuenta.
  v_abierta := exists (select 1 from gmp.ordenes_produccion where id = p_id and estado = 'ABIERTA');
  perform gmp.terminar_orden(p_id, p_cantidad, p_unidades);

  perform pg_advisory_xact_lock(hashtextextended('orden|' || p_id::text, 0));
  select * into v_orden from gmp.ordenes_produccion where id = p_id;

  -- NUEVO en 20261028120000: la materia prima, una sola vez por orden.
  if v_abierta
     and not exists (select 1 from comercial.orden_consumos where orden_id = p_id)
     and (select tercero_id from gmp.productos where id = v_orden.producto_id) is null then
    if lower(v_orden.unidad) not in ('kg', 'l') then
      raise exception 'La orden % está en «%»: para descontar la materia prima tiene que estar en kg o L.',
        v_orden.numero, v_orden.unidad using errcode = 'check_violation';
    end if;
    for mp in
      select c.insumo_id, sum(c.masa_kg) as masa_kg, sum(c.volumen_l) as volumen_l,
             bool_or(c.masa_kg is null) as sin_masa, bool_or(c.volumen_l is null) as sin_volumen,
             i.nombre, i.unidad_medida
        from gmp.calcular_lote(v_orden.formula_id,
               p_volumen_l => case when lower(v_orden.unidad) = 'l' then v_orden.cantidad_teorica end,
               p_masa_kg   => case when lower(v_orden.unidad) = 'l' then null else v_orden.cantidad_teorica end) c
        join gmp.insumos_catalogo i on i.id = c.insumo_id
       group by c.insumo_id, i.nombre, i.unidad_medida
    loop
      v_ficha := lower(coalesce(mp.unidad_medida, ''));
      if v_ficha not in ('g', 'kg', 'ml', 'l') then
        raise exception 'La ficha de % está en «%»: un componente de fórmula va en g, kg, ml o L.',
          mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad') using errcode = 'check_violation';
      end if;
      v_necesita := case
        when v_ficha in ('g', 'kg') and not mp.sin_masa then comercial.convertir_cantidad(mp.masa_kg, 'kg', v_ficha)
        when v_ficha in ('ml', 'l') and not mp.sin_volumen then comercial.convertir_cantidad(mp.volumen_l, 'l', v_ficha)
      end;
      if v_necesita is null then
        raise exception
          'Para descontar % hace falta su densidad: la ficha está en % y la fórmula lo da en %. '
          'Cargala en Densidades y volvé a terminar la orden.',
          mp.nombre, coalesce(mp.unidad_medida, 'ninguna unidad'), case when mp.sin_masa then 'volumen' else 'masa' end
          using errcode = 'check_violation';
      end if;
      v_necesita := round(v_necesita, 4);
      continue when v_necesita <= 0;

      insert into comercial.orden_consumos (orden_id, insumo_id, unidad, cantidad)
      values (p_id, mp.insumo_id, mp.unidad_medida, v_necesita)
      returning id into v_consumo;

      v_articulo := comercial.articulo_de_insumo(mp.insumo_id);
      v_restante := v_necesita;
      for pos in
        select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
          from comercial.v_saldos_stock s
          join gmp.lotes_insumo l on l.id = s.lote_insumo_id
         where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
           and gmp.lote_consumible(s.lote_insumo_id)
         order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
      loop
        if lower(pos.unidad) is distinct from v_ficha then
          raise exception 'El lote de % está en % y la ficha en %: no se puede descontar sin convertir.',
            mp.nombre, pos.unidad, mp.unidad_medida using errcode = 'check_violation';
        end if;
        v_toma := least(v_restante, pos.saldo);
        insert into comercial.movimientos_stock
          (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values
          (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
           format('Orden %s, lote %s', v_orden.numero, v_orden.numero_lote), 'ORDEN_CONSUMO', v_consumo);
        v_restante := v_restante - v_toma;
        exit when v_restante <= 0;
      end loop;

      if v_restante > 0 then
        -- Lo que queda y no se puede usar (cuarentena, análisis, vencido).
        select coalesce(sum(s.saldo), 0) into v_retenido
          from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
         where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
           and not gmp.lote_consumible(s.lote_insumo_id);
        raise exception
          'No alcanza % para la orden %: faltan % %.%',
          mp.nombre, v_orden.numero, v_restante, mp.unidad_medida,
          case when v_retenido > 0
               then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
               else ' Si está en planta, falta registrarlo (recepción o ajuste). La orden no se terminó.' end
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  if coalesce(p_unidades, 0) <= 0
     or exists (select 1 from comercial.movimientos_pt where orden_id = p_id and tipo = 'ENTRADA_PRODUCCION') then
    return;
  end if;

  -- El pedido de Nail Show de esta orden que lleva el producto, si es uno solo.
  select case when count(*) = 1 then (array_agg(p.id))[1] end into v_pedido
    from comercial.pedido_ordenes po
    join comercial.pedidos p on p.id = po.pedido_id
   where po.orden_id = p_id and p.tercero_id is null and p.eliminado_en is null
     and exists (select 1 from comercial.pedido_renglones r
                  where r.pedido_id = p.id and r.producto_id = v_orden.producto_id and not r.anulado);

  perform set_config('comercial.terminando_orden', p_id::text, true);
  insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
  values (v_orden.producto_id, (select id from gmp.depositos where numero = 'PTF'), 'ENTRADA_PRODUCCION', p_unidades,
          format('Producción de la orden %s, lote %s', v_orden.numero, v_orden.numero_lote),
          case when v_pedido is null then 'ORDEN' else 'PEDIDO' end, coalesce(v_pedido, p_id), p_id);
  perform set_config('comercial.terminando_orden', '', true);
end;
$$;
comment on function comercial.terminar_orden(uuid, numeric, integer) is
  'Termina la orden (gmp.terminar_orden), descuenta la materia prima de la fórmula por la cantidad teórica, del lote '
  'consumible que vence primero (D-consumo-orden-1), y carga las unidades obtenidas en PTF con su lote, retenidas '
  'hasta que la DT libera (RN-51). A nombre del pedido de la orden si tiene uno. SECURITY INVOKER: rige '
  'movimientos_pt_insert_produccion.';
