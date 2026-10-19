-- ---------------------------------------------------------------------------
-- Propósito : Dos atajos más de la revisión del 2026-10-16.
--             1. Los contadores de órdenes (OP-AAAA-NNNN) y de registros de
--                análisis (R.50.x.1, NNN/AAAA) admitían INSERT y UPDATE
--                directo de Producción, DT y Calidad (políticas FOR ALL): se
--                podía retroceder un contador (números repetidos) o
--                adelantarlo (huecos). Mismo defecto que gmp.siguiente_numero.
--             2. Un movimiento de producto terminado marcado como anulación
--                (anula_a_movimiento_id) salía del trigger sin ningún control:
--                Ventas registraba como venta un lote RETENIDO «anulando» su
--                entrada de producción. Probado en PGlite.
-- Reglas    : RN-51 (solo se vende lo liberado), RN-54 (la corrección es un
--             movimiento inverso), RN-55 (numeración sin huecos),
--             invariante 1. CLAUDE.md §4: RN-51 es regulada (Disp. 1402/08).
-- Fecha     : 2026-10-16
-- ---------------------------------------------------------------------------
--
-- ===========================================================================
-- 1. Contadores
-- ===========================================================================
--
-- El incremento pasa a dos funciones SECURITY DEFINER que solo prosperan
-- llamadas desde otra función (los triggers de numeración), como
-- gmp.siguiente_numero. El rol pierde INSERT y UPDATE sobre los contadores;
-- conserva la lectura.

create function gmp.siguiente_numero_orden(p_anio integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n    integer;
  v_pila text;
begin
  get diagnostics v_pila = pg_context;
  if array_length(regexp_split_to_array(v_pila, E'\n'), 1) < 2 then
    raise exception 'La numeración la asigna la base al registrar, no una llamada suelta.'
      using errcode = 'insufficient_privilege';
  end if;
  insert into gmp.contadores_orden (anio) values (p_anio) on conflict (anio) do nothing;
  update gmp.contadores_orden set ultimo = ultimo + 1 where anio = p_anio returning ultimo into v_n;
  return v_n;
end;
$$;

create function gmp.siguiente_numero_analisis(p_registro text, p_anio integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n    integer;
  v_pila text;
begin
  get diagnostics v_pila = pg_context;
  if array_length(regexp_split_to_array(v_pila, E'\n'), 1) < 2 then
    raise exception 'La numeración la asigna la base al registrar, no una llamada suelta.'
      using errcode = 'insufficient_privilege';
  end if;
  insert into gmp.contadores_analisis (registro, anio) values (p_registro, p_anio)
    on conflict (registro, anio) do nothing;
  update gmp.contadores_analisis set ultimo = ultimo + 1
   where registro = p_registro and anio = p_anio
  returning ultimo into v_n;
  return v_n;
end;
$$;

revoke execute on function gmp.siguiente_numero_orden(integer) from public, anon;
revoke execute on function gmp.siguiente_numero_analisis(text, integer) from public, anon;
grant execute on function gmp.siguiente_numero_orden(integer) to authenticated;
grant execute on function gmp.siguiente_numero_analisis(text, integer) to authenticated;

-- Los triggers de numeración, iguales salvo el incremento.
create or replace function gmp.fn_orden_numerar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anio integer := extract(year from new.jornada)::int;
  v_n    integer;
  v_vida integer;
  v_proc integer;
begin
  v_n := gmp.siguiente_numero_orden(v_anio);
  new.numero := format('OP-%s-%s', v_anio, lpad(v_n::text, 4, '0'));

  new.numero_lote := format('#%s %s', new.presentacion, to_char(new.jornada, 'DD/MM/YY'));
  if new.vencimiento is null then
    select coalesce(e.vida_util_meses, p.vida_util_meses) into v_vida
      from gmp.productos p
      left join gmp.especificaciones e on e.id = new.especificacion_id
     where p.id = new.producto_id;
    if v_vida is null then
      raise exception 'El producto no tiene vida útil cargada: indicá el vencimiento.' using errcode = 'check_violation';
    end if;
    new.vencimiento := (new.jornada + make_interval(months => v_vida))::date;
  end if;
  new.vencimiento_texto := format('P%s %s', new.partida, to_char(new.vencimiento, 'MM/YY'));

  select max(version) into v_proc from gmp.formula_procedimientos where formula_id = new.formula_id;
  new.procedimiento_version := v_proc;
  if new.especificacion_id is null then
    select especificacion_id into new.especificacion_id from gmp.formulas_fabricacion where id = new.formula_id;
  end if;
  if new.estado <> 'ABIERTA' then
    raise exception 'Una orden nace abierta.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function gmp.fn_registro_analisis()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo gmp.tipo_insumo_enum;
  v_anio integer;
  v_n    integer;
  v_prev gmp.registros_analisis%rowtype;
begin
  if not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El registro de análisis lo hace Control de Calidad o Dirección Técnica (I.50.5).'
      using errcode = 'insufficient_privilege';
  end if;

  if new.lote_insumo_id is not null then
    select i.tipo into v_tipo
      from gmp.lotes_insumo l join gmp.insumos_catalogo i on i.id = l.insumo_id
     where l.id = new.lote_insumo_id;
    new.registro := case when v_tipo = 'SEMIELABORADO' then 'R.50.6.1' else 'R.50.5.1' end;
  else
    new.registro := 'R.50.10.1';
  end if;

  if new.rectifica_a is not null then
    select * into v_prev from gmp.registros_analisis where id = new.rectifica_a;
    if v_prev.lote_insumo_id is distinct from new.lote_insumo_id
       or v_prev.orden_id is distinct from new.orden_id then
      raise exception 'La rectificación es del mismo lote que el registro que corrige.' using errcode = 'check_violation';
    end if;
  end if;

  v_anio := extract(year from new.fecha)::int;
  v_n := gmp.siguiente_numero_analisis(new.registro, v_anio);
  new.numero := format('%s/%s', lpad(v_n::text, 3, '0'), v_anio);

  new.controlo_por := core.usuario_actual();
  new.controlo_en := now();
  return new;
end;
$$;

-- Sin escritura directa: solo lectura para los mismos roles.
revoke insert, update, delete on gmp.contadores_orden, gmp.contadores_analisis from authenticated;
drop policy contadores_orden_produccion on gmp.contadores_orden;
drop policy contadores_analisis_calidad on gmp.contadores_analisis;

create policy contadores_orden_select_produccion on gmp.contadores_orden
  for select to authenticated
  using (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy contadores_orden_select_produccion on gmp.contadores_orden is
  'Solo lectura: el contador lo incrementa gmp.siguiente_numero_orden (RN-55, 20261016130000).';

create policy contadores_analisis_select_calidad on gmp.contadores_analisis
  for select to authenticated
  using (core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA'));
comment on policy contadores_analisis_select_calidad on gmp.contadores_analisis is
  'Solo lectura: el contador lo incrementa gmp.siguiente_numero_analisis (RN-55, 20261016130000).';

-- ===========================================================================
-- 2. Anulaciones de producto terminado
-- ===========================================================================
--
-- Las mismas reglas que la anulación de insumos (comercial.fn_validar_movimiento):
-- el original existe, no es a su vez una anulación, misma posición, cantidad
-- exactamente opuesta. Además, una anulación no es una venta ni una producción:
-- esos tipos tienen su propio control (RN-51, pedido) y la anulación lo
-- salteaba. Al 2026-10-16 no hay ninguna anulación de PT en la base ni función
-- que las genere, así que el endurecimiento no afecta datos existentes. El
-- resto de la función queda igual (20260930160000 y siguientes).

create or replace function comercial.fn_movimiento_pt_lote()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_orig     comercial.movimientos_pt%rowtype;
  v_n        integer;
  v_orden    uuid;
  v_producto uuid;
  v_imp      text;
  v_c5       boolean;
  a          record;
  v_primero  boolean := true;
begin
  -- Una anulación cae sobre el mismo lote que el movimiento que anula.
  if new.anula_a_movimiento_id is not null then
    select * into v_orig from comercial.movimientos_pt where id = new.anula_a_movimiento_id;
    if not found then
      raise exception 'El movimiento que se pretende anular no existe.' using errcode = 'check_violation';
    end if;
    if v_orig.anula_a_movimiento_id is not null then
      raise exception 'No se anula una anulación. Si la corrección estuvo mal, corresponde un ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.producto_id, new.deposito_id) is distinct from (v_orig.producto_id, v_orig.deposito_id) then
      raise exception 'La anulación cae sobre el mismo producto y depósito que el movimiento que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_orig.cantidad then
      raise exception 'La anulación es exactamente el opuesto del original (% esperado, % recibido).',
        -v_orig.cantidad, new.cantidad using errcode = 'check_violation';
    end if;
    -- Una venta no es una anulación: si lo fuera, saltearía RN-51.
    if new.tipo in ('SALIDA_VENTA', 'ENTRADA_PRODUCCION') then
      raise exception 'Una anulación es un ajuste, no una venta ni una producción.' using errcode = 'check_violation';
    end if;
    new.orden_id := v_orig.orden_id;
    return new;
  end if;

  -- Producción: el lote de la orden del pedido para ese producto, si la hay.
  if new.tipo = 'ENTRADA_PRODUCCION' and new.orden_id is null and new.documento_tipo = 'PEDIDO' then
    select count(*), (array_agg(o.id))[1] into v_n, v_orden
      from comercial.pedido_ordenes po
      join gmp.ordenes_produccion o on o.id = po.orden_id
     where po.pedido_id = new.documento_id and o.producto_id = new.producto_id and o.estado <> 'ANULADA';
    if v_n > 1 then
      raise exception 'El pedido tiene % órdenes de este producto: indicá de cuál es lo producido.', v_n
        using errcode = 'check_violation';
    end if;
    new.orden_id := v_orden;
  end if;

  if new.orden_id is not null then
    select producto_id into v_producto from gmp.ordenes_produccion where id = new.orden_id;
    if v_producto is distinct from new.producto_id then
      raise exception 'El lote es de otro producto.' using errcode = 'check_violation';
    end if;
  end if;

  select numero = 'C5' into v_c5 from gmp.depositos where id = new.deposito_id;

  -- A Calle 5 entra solo lo liberado o lo sin lote (R-09).
  if new.cantidad > 0 then
    if v_c5 and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception '% A Calle 5 va solo lo liberado: queda en la fábrica (PTF) hasta que la DT lo libere.', v_imp
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  -- Salida con lote ya elegido (por quien llama, o por el reparto de abajo).
  if new.orden_id is not null
     or coalesce(current_setting('comercial.lote_pt_asignado', true), '') = '1' then
    if new.tipo = 'SALIDA_VENTA' and new.orden_id is not null then
      v_imp := gmp.impedimento_despacho_orden(new.orden_id);
      if v_imp is not null then
        raise exception 'No se puede vender. %', v_imp using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  if new.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS' then
    raise exception 'Las transferencias de producto terminado se hacen con comercial.transferir_pt, que lleva el lote de un depósito al otro.'
      using errcode = 'check_violation';
  end if;

  -- Reparto: la primera porción queda en esta fila, el resto en filas nuevas
  -- con los mismos datos. Una venta toma solo lo despachable (RN-51).
  perform pg_advisory_xact_lock(hashtextextended('pt|' || new.deposito_id::text || '|' || new.producto_id::text, 0));
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for a in
    select * from comercial.asignar_lotes_pt(new.producto_id, new.deposito_id, -new.cantidad,
                                             new.tipo = 'SALIDA_VENTA')
  loop
    if v_primero then
      new.orden_id := a.orden_id;
      new.cantidad := -a.cantidad;
      v_primero := false;
    else
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id, orden_id)
      values
        (new.producto_id, new.deposito_id, new.tipo, -a.cantidad, new.motivo, new.documento_tipo,
         new.documento_id, new.despacho_id, a.orden_id);
    end if;
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);
  return new;
end;
$function$;
