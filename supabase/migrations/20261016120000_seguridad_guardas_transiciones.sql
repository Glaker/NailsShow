-- ---------------------------------------------------------------------------
-- Propósito : Cerrar el atajo del PATCH directo. Las condiciones de liberar un
--             lote, aprobar una especificación y autorizar una factura vivían
--             solo en las funciones RPC, pero la tabla seguía admitiendo UPDATE
--             (y, en facturas, INSERT) del rol. Con la sesión propia, desde la
--             consola del navegador, un usuario las salteaba:
--               - DT liberaba una orden sin etapas ni control de calidad;
--               - Ventas dejaba una factura AUTORIZADA con un CAE inventado,
--                 sin pasar por ARCA (o la insertaba ya autorizada);
--               - cualquier columna *_por aceptaba el id de otra persona.
--             Revisión del 2026-10-16, probado en PGlite antes de escribirla.
-- Reglas    : invariante 1 (registro firmado), RN-50 (quién escribió), RN-55
--             (numeración), RN-56 (factura autorizada), RN-66 (secretos en el
--             almacén de Supabase), §5.1 y §3.3 (liberación por DT), CLAUDE.md
--             §6 «la base es la autoridad».
-- Fecha     : 2026-10-16
-- ---------------------------------------------------------------------------
--
-- CRITERIO. La RPC da el buen mensaje; el trigger es la autoridad. Toda
-- condición de una transición se exige en el trigger, de modo que la RPC y un
-- PATCH directo sean equivalentes. Las RPC no se tocan: siguen validando lo
-- mismo antes de escribir.
--
-- Contenido:
--   1. Sellado de autores: toda columna *_por que apunta a core.usuarios.
--   2. Órdenes de producción: terminar y liberar exigen sus condiciones.
--   3. Especificaciones: aprobar exige requisitos y una sola vigente.
--   4. Facturas: solo las escriben las funciones; el resultado de ARCA exige
--      la clave que guarda la Edge Function.
--   5. gmp.siguiente_numero: deja de ser invocable como RPC suelta.

-- ===========================================================================
-- 1. Sellado de autores
-- ===========================================================================
--
-- En una sesión de usuario (claim role = authenticated), una columna de autor
-- que se escribe con un valor queda con el usuario de la sesión, mande lo que
-- mande el cliente. Nadie firma por otro.
--   - INSERT: si viene no nula, se reemplaza por core.usuario_actual().
--   - UPDATE: si cambia a un valor no nulo, ídem. Si no cambia, queda la
--     firma original (la de quien hizo la acción en su momento).
--   - Volver a null no se toca: hay circuitos que lo hacen a propósito
--     (desliberar en tercerizados) y los demás los cierran sus propios guardas.
-- Fuera de una sesión de usuario (migración, rol dedicado sin usuario) no hace
-- nada: las cargas iniciales atribuyen explícitamente.

create or replace function core.fn_sellar_autores()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nuevo jsonb;
  v_viejo jsonb;
  v_yo    jsonb;
  v_col   text;
  v_tocado boolean := false;
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
     <> 'authenticated' then
    return new;
  end if;
  v_nuevo := to_jsonb(new);
  v_viejo := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_yo    := coalesce(to_jsonb(core.usuario_actual()), 'null'::jsonb);
  foreach v_col in array tg_argv loop
    if jsonb_typeof(v_nuevo -> v_col) is distinct from 'null'
       and v_nuevo ? v_col
       and (tg_op = 'INSERT' or (v_nuevo -> v_col) is distinct from (v_viejo -> v_col))
       and (v_nuevo -> v_col) is distinct from v_yo then
      v_nuevo := jsonb_set(v_nuevo, array[v_col], v_yo);
      v_tocado := true;
    end if;
  end loop;
  if v_tocado then
    new := jsonb_populate_record(new, v_nuevo);
  end if;
  return new;
end;
$$;
comment on function core.fn_sellar_autores() is
  'Columnas de autor (*_por): en una sesión de usuario, el valor escrito es siempre el usuario de la sesión. '
  'Los argumentos del trigger son los nombres de las columnas. Revisión 2026-10-16.';
revoke execute on function core.fn_sellar_autores() from public, anon, authenticated;
-- Toda columna *_por con clave foránea a core.usuarios en una tabla que el rol
-- authenticated puede escribir (consulta al catálogo del 2026-10-16).
create trigger trg_sellar_autores before insert or update on comercial.avisos_compra
  for each row execute function core.fn_sellar_autores('resuelto_por');
create trigger trg_sellar_autores before insert or update on comercial.avisos_costo
  for each row execute function core.fn_sellar_autores('visto_por');
create trigger trg_sellar_autores before insert or update on comercial.categorias_gasto
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on comercial.clientes
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on comercial.cobros_cliente
  for each row execute function core.fn_sellar_autores('registrado_por', 'anulado_por');
create trigger trg_sellar_autores before insert or update on comercial.comprobantes_proveedor
  for each row execute function core.fn_sellar_autores('registrado_por', 'anulado_por');
create trigger trg_sellar_autores before insert or update on comercial.conciliaciones_fondos
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.conciliaciones_proveedor
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.conteos_inventario
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.costos_accesorios
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.costos_lote
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.costos_producto_planilla
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.costos_referencia
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.cuentas_fondos
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on comercial.descuentos_cliente
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.despacho_diferencias
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.despachos_pt
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.escalas_descuento
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.facturas
  for each row execute function core.fn_sellar_autores('emitida_por');
create trigger trg_sellar_autores before insert or update on comercial.fotos_costo_producto
  for each row execute function core.fn_sellar_autores('tomada_por');
create trigger trg_sellar_autores before insert or update on comercial.gastos
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.imputaciones_cobro
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.imputaciones_pago
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.lista_mayorista
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.metas_stock_seguridad
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on comercial.minutos_producto
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.movimientos_fondos
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.movimientos_pt
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.movimientos_stock
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.pagos_proveedor
  for each row execute function core.fn_sellar_autores('registrado_por', 'anulado_por');
create trigger trg_sellar_autores before insert or update on comercial.parametros_costo
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.pedido_consumos
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on comercial.pedido_ordenes
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on comercial.pedido_origen_insumos
  for each row execute function core.fn_sellar_autores('elegido_por');
create trigger trg_sellar_autores before insert or update on comercial.pedido_renglones
  for each row execute function core.fn_sellar_autores('anulado_por');
create trigger trg_sellar_autores before insert or update on comercial.pedidos
  for each row execute function core.fn_sellar_autores('creado_por', 'eliminado_por', 'entregado_por', 'gestionado_por', 'stock_ok_por');
create trigger trg_sellar_autores before insert or update on comercial.precios_producto
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.reservas_pt
  for each row execute function core.fn_sellar_autores('liberada_por', 'creado_por');
create trigger trg_sellar_autores before insert or update on comercial.reservas_stock
  for each row execute function core.fn_sellar_autores('creado_por', 'liberada_por');
create trigger trg_sellar_autores before insert or update on comercial.series_macro
  for each row execute function core.fn_sellar_autores('cargado_por');
create trigger trg_sellar_autores before insert or update on comercial.solicitudes_pago
  for each row execute function core.fn_sellar_autores('resuelto_por');
create trigger trg_sellar_autores before insert or update on comercial.tareas_equipo
  for each row execute function core.fn_sellar_autores('creada_por', 'movida_por', 'hecha_por');
create trigger trg_sellar_autores before insert or update on core.visibilidad_pantallas
  for each row execute function core.fn_sellar_autores('cambiado_por');
create trigger trg_sellar_autores before insert or update on gmp.bloqueos_lote
  for each row execute function core.fn_sellar_autores('bloqueado_por', 'levantado_por');
create trigger trg_sellar_autores before insert or update on gmp.densidades_referencia
  for each row execute function core.fn_sellar_autores('verificada_por');
create trigger trg_sellar_autores before insert or update on gmp.equipos
  for each row execute function core.fn_sellar_autores('creado_por');
create trigger trg_sellar_autores before insert or update on gmp.especificaciones
  for each row execute function core.fn_sellar_autores('emitida_por', 'aprobada_por');
create trigger trg_sellar_autores before insert or update on gmp.formula_componentes
  for each row execute function core.fn_sellar_autores('anulado_por');
create trigger trg_sellar_autores before insert or update on gmp.formula_procedimientos
  for each row execute function core.fn_sellar_autores('redactado_por');
create trigger trg_sellar_autores before insert or update on gmp.formulas_fabricacion
  for each row execute function core.fn_sellar_autores('emitida_por', 'aprobada_por');
create trigger trg_sellar_autores before insert or update on gmp.lotes_insumo
  for each row execute function core.fn_sellar_autores('registrado_por');
create trigger trg_sellar_autores before insert or update on gmp.migracion_apertura
  for each row execute function core.fn_sellar_autores('ejecutada_por');
create trigger trg_sellar_autores before insert or update on gmp.muestreos
  for each row execute function core.fn_sellar_autores('realizado_por');
create trigger trg_sellar_autores before insert or update on gmp.op_etapas
  for each row execute function core.fn_sellar_autores('realizo_por', 'controlo_por');
create trigger trg_sellar_autores before insert or update on gmp.ordenes_produccion
  for each row execute function core.fn_sellar_autores('abierta_por', 'terminada_por', 'liberada_por');
create trigger trg_sellar_autores before insert or update on gmp.proveedores
  for each row execute function core.fn_sellar_autores('aprobado_por', 'creado_por');
create trigger trg_sellar_autores before insert or update on gmp.recepciones
  for each row execute function core.fn_sellar_autores('cargado_por', 'registrado_por');
create trigger trg_sellar_autores before insert or update on gmp.registros_analisis
  for each row execute function core.fn_sellar_autores('controlo_por');
create trigger trg_sellar_autores before insert or update on gmp.rotulos
  for each row execute function core.fn_sellar_autores('emitido_por');
create trigger trg_sellar_autores before insert or update on gmp.tareas_planta
  for each row execute function core.fn_sellar_autores('creada_por', 'iniciada_por', 'terminada_por', 'visto_por');
create trigger trg_sellar_autores before insert or update on gmp.terceros
  for each row execute function core.fn_sellar_autores('creado_por');
-- ===========================================================================
-- 2. Órdenes de producción
-- ===========================================================================
--
-- Las condiciones de gmp.terminar_orden y gmp.liberar_orden pasan al trigger.
-- Autor y momento de terminar y de liberar los pone la base en la transición;
-- fuera de ella no cambian.

create or replace function gmp.fn_orden_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_falta text;
begin
  if (to_jsonb(new) - array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                            'terminada_en','liberada_por','liberada_en','motivo_cierre'])
     is distinct from
     (to_jsonb(old) - array['estado','cantidad_obtenida','unidades_obtenidas','observaciones','terminada_por',
                            'terminada_en','liberada_por','liberada_en','motivo_cierre']) then
    raise exception 'El número, el lote y el vencimiento de la orden % no cambian.', old.numero
      using errcode = 'restrict_violation';
  end if;
  if old.estado in ('LIBERADA', 'RECHAZADA', 'ANULADA') then
    raise exception 'La orden % está %: no se modifica.', old.numero, lower(old.estado::text)
      using errcode = 'restrict_violation';
  end if;
  if new.estado is distinct from old.estado and not (
       (old.estado = 'ABIERTA'   and new.estado in ('TERMINADA', 'ANULADA'))
    or (old.estado = 'TERMINADA' and new.estado in ('LIBERADA', 'RECHAZADA'))
  ) then
    raise exception 'Una orden no pasa de % a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;

  -- Firmas: solo las pone la transición.
  new.terminada_por := old.terminada_por;
  new.terminada_en  := old.terminada_en;
  new.liberada_por  := old.liberada_por;
  new.liberada_en   := old.liberada_en;

  if new.estado = 'TERMINADA' and old.estado = 'ABIERTA' then
    if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
      raise exception 'Termina la orden Gerencia de Producción.' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'FRACCIONAMIENTO') then
      raise exception 'Falta registrar el fraccionamiento.' using errcode = 'check_violation';
    end if;
    new.terminada_por := core.usuario_actual();
    new.terminada_en  := now();
  end if;

  if new.estado in ('LIBERADA', 'RECHAZADA') and old.estado = 'TERMINADA' then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception 'Libera o rechaza el lote Dirección Técnica.' using errcode = 'insufficient_privilege';
    end if;
    if new.estado = 'LIBERADA' then
      select string_agg(lower(etapa::text) || ' ' || falta, ', ') into v_falta
        from gmp.faltantes_liberacion(new.id);
      if v_falta is not null then
        raise exception 'Todavía no se puede liberar: %.', v_falta using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_GRANEL'
                  and not coalesce((datos ->> 'no_aplica')::boolean, false)
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El granel no está aprobado en su registro R.50.10.1: el lote no se libera.'
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.op_etapas where orden_id = new.id and etapa = 'CC_PT'
                  and coalesce((datos ->> 'aprobado')::boolean, false) is false) then
        raise exception 'El control de calidad del producto terminado no está aprobado.'
          using errcode = 'check_violation';
      end if;
    end if;
    new.liberada_por := core.usuario_actual();
    new.liberada_en  := now();
  end if;

  return new;
end;
$$;
-- ===========================================================================
-- 3. Especificaciones
-- ===========================================================================
--
-- Aprobar (BORRADOR → VIGENTE) exige DT, requisitos y que no haya otra vigente
-- del mismo código y variedad; el aprobador y el momento los pone la base.
-- Dar de baja una vigente (lo hace gmp.aprobar_especificacion al reemplazarla)
-- también es de DT.

create or replace function gmp.fn_especificacion_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_estado gmp.estado_documento_enum;
begin
  if tg_table_name = 'especificaciones' then
    if tg_op = 'UPDATE' and old.estado <> 'BORRADOR' then
      -- Única salida de una vigente: darla de baja cuando la reemplaza otra.
      if old.estado = 'VIGENTE' and new.estado = 'DADO_DE_BAJA'
         and (to_jsonb(new) - 'estado') = (to_jsonb(old) - 'estado') then
        if not core.es_rol('DIRECCION_TECNICA') then
          raise exception 'Da de baja una especificación Dirección Técnica.' using errcode = 'insufficient_privilege';
        end if;
        return new;
      end if;
      raise exception 'La especificación % v% está %: no se edita, se emite la versión siguiente.',
        old.codigo_poe, old.version, lower(old.estado::text) using errcode = 'restrict_violation';
    end if;
    if tg_op = 'INSERT' and new.estado <> 'BORRADOR' then
      raise exception 'Una especificación nace en borrador.' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' then
      new.aprobada_por := null;
      new.aprobada_en  := null;
      return new;
    end if;

    -- UPDATE de un borrador.
    new.aprobada_por := old.aprobada_por;
    new.aprobada_en  := old.aprobada_en;
    if new.estado = 'VIGENTE' then
      if not core.es_rol('DIRECCION_TECNICA') then
        raise exception 'Aprueba la especificación Dirección Técnica.' using errcode = 'insufficient_privilege';
      end if;
      if not exists (select 1 from gmp.espec_parametros where especificacion_id = new.id and not quitado) then
        raise exception 'Una especificación sin requisitos no se aprueba.' using errcode = 'check_violation';
      end if;
      if exists (select 1 from gmp.especificaciones
                  where codigo_poe = new.codigo_poe and variedad is not distinct from new.variedad
                    and estado = 'VIGENTE' and id <> new.id) then
        raise exception 'Ya hay una versión vigente de %: se reemplaza aprobando con la función, que la da de baja.',
          new.codigo_poe using errcode = 'unique_violation';
      end if;
      new.aprobada_por   := core.usuario_actual();
      new.aprobada_en    := now();
      new.vigencia_desde := coalesce(new.vigencia_desde,
                                     (now() at time zone 'America/Argentina/Buenos_Aires')::date);
    end if;
    return new;
  end if;

  v_id := new.especificacion_id;
  select estado into v_estado from gmp.especificaciones where id = v_id;
  if v_estado <> 'BORRADOR' then
    raise exception 'La especificación ya no está en borrador: sus renglones no cambian.' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
-- Respaldo del trigger: una sola vigente por código y variedad.
create unique index especificaciones_una_vigente_idx
  on gmp.especificaciones (codigo_poe, coalesce(variedad, ''))
  where estado = 'VIGENTE';
-- ===========================================================================
-- 4. Facturas
-- ===========================================================================
--
-- La base no puede saber si ARCA autorizó: solo lo sabe la Edge Function que
-- habló con ARCA. Por eso:
--   - authenticated pierde INSERT y UPDATE directos sobre comercial.facturas;
--   - preparar_factura y preparar_nota_credito pasan a SECURITY DEFINER (ya
--     validaban rol y pedido; ahora son la única entrada);
--   - fijar_numero_factura y registrar_resultado_factura piden además una
--     clave que vive en Vault (nombre «arca_registro_clave») y en los secretos
--     de la Edge Function (ARCA_REGISTRO_CLAVE). El usuario no la conoce: la
--     llamada sigue saliendo con su token (RLS de lectura y auditoría a su
--     nombre), pero solo prospera si pasa por la función.
-- La clave no va en el repositorio (invariante 5): se carga en Vault y en los
-- secretos de la función al desplegar.

revoke insert, update on comercial.facturas from authenticated;
drop policy facturas_insert_emisores on comercial.facturas;
-- Bloqueo de fila sin escritura. El cobro (fn_validar_imputacion_cobro) y
-- eliminar_pedido toman la factura con SELECT … FOR UPDATE, que exige UPDATE
-- sobre al menos una columna y la política de UPDATE. Se concede solo sobre
-- `motivo`, que fn_factura_inmutable rechaza siempre (no está entre lo que
-- cambia de una pendiente, y una resuelta no cambia): sirve para bloquear,
-- no para escribir. facturas_update_emisores queda por la misma razón.
grant update (motivo) on comercial.facturas to authenticated;
comment on policy facturas_update_emisores on comercial.facturas is
  'Solo habilita SELECT … FOR UPDATE: el único UPDATE concedido es sobre motivo, que fn_factura_inmutable rechaza (20261016120000).';
alter function comercial.preparar_factura(uuid, uuid) security definer;
alter function comercial.preparar_nota_credito(uuid, text) security definer;
create or replace function comercial.fn_clave_arca_valida(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_clave) >= 32 and p_clave = (
           select decrypted_secret from vault.decrypted_secrets where name = 'arca_registro_clave'
         ), false);
$$;
comment on function comercial.fn_clave_arca_valida(text) is
  'Compara contra la clave de Vault «arca_registro_clave». Solo la usan las funciones de facturación.';
revoke execute on function comercial.fn_clave_arca_valida(text) from public, anon, authenticated;
drop function comercial.fijar_numero_factura(uuid, integer);
drop function comercial.registrar_resultado_factura(uuid, jsonb, jsonb, text);
create function comercial.fijar_numero_factura(p_factura_id uuid, p_numero integer, p_clave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Emitir facturas es de Administración, Gerencia, Gerencia de Producción o Ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if not comercial.fn_clave_arca_valida(p_clave) then
    raise exception 'El número de una factura lo fija la emisión con ARCA, no una llamada suelta.'
      using errcode = 'insufficient_privilege';
  end if;
  update comercial.facturas
     set numero = p_numero
   where id = p_factura_id and estado = 'PENDIENTE' and (numero is null or numero = p_numero);
  if not found then
    raise exception 'No se pudo fijar el número % en la factura: no está pendiente o ya tiene otro número.', p_numero
      using errcode = 'check_violation';
  end if;
end;
$$;
create function comercial.registrar_resultado_factura(
  p_factura_id uuid, p_solicitud jsonb, p_respuesta jsonb, p_error_envio text, p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f          comercial.facturas%rowtype;
  v_res        jsonb := p_respuesta -> 'FECAESolicitarResult';
  v_det        jsonb := v_res -> 'FeDetResp' -> 'FECAEDetResponse' -> 0;
  v_resultado  text  := coalesce(v_det ->> 'Resultado', v_res -> 'FeCabResp' ->> 'Resultado');
  v_cae        text  := nullif(v_det ->> 'CAE', '');
  v_vto        text  := nullif(v_det ->> 'CAEFchVto', '');
  v_mensajes   text;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Emitir facturas es de Administración, Gerencia, Gerencia de Producción o Ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if not comercial.fn_clave_arca_valida(p_clave) then
    raise exception 'El resultado de ARCA lo registra la emisión, no una llamada suelta.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_f from comercial.facturas where id = p_factura_id for update;
  if not found then
    raise exception 'La factura no existe.';
  end if;
  if v_f.estado <> 'PENDIENTE' then
    raise exception 'La factura ya está %.', v_f.estado using errcode = 'check_violation';
  end if;

  -- Observaciones del detalle y errores de cabecera, «código: mensaje».
  select string_agg(format('%s: %s', m ->> 'Code', m ->> 'Msg'), ' | ')
    into v_mensajes
    from (
      select jsonb_array_elements(coalesce(v_det -> 'Observaciones' -> 'Obs', '[]'::jsonb)) as m
      union all
      select jsonb_array_elements(coalesce(v_res -> 'Errors' -> 'Err', '[]'::jsonb))
    ) x;

  if p_error_envio is not null then
    update comercial.facturas
       set estado = 'RECHAZADA',
           motivo_rechazo = 'No se envió a ARCA: ' || p_error_envio,
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  elsif v_resultado = 'A' and v_cae is not null then
    update comercial.facturas
       set estado = 'AUTORIZADA',
           cae = v_cae,
           cae_vencimiento = to_date(v_vto, 'YYYYMMDD'),
           -- Las observaciones de una autorizada (p. ej. 10217) se conservan.
           motivo_rechazo = null,
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  else
    update comercial.facturas
       set estado = 'RECHAZADA',
           motivo_rechazo = coalesce(v_mensajes, format('ARCA respondió Resultado «%s» sin CAE.', coalesce(v_resultado, '?'))),
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  end if;

  select * into v_f from comercial.facturas where id = p_factura_id;
  return jsonb_build_object(
    'factura_id', v_f.id, 'estado', v_f.estado, 'tipo', v_f.tipo,
    'punto_venta', v_f.punto_venta, 'numero', v_f.numero,
    'cae', v_f.cae, 'cae_vencimiento', v_f.cae_vencimiento,
    'importe_total', v_f.importe_total, 'motivo', v_f.motivo_rechazo,
    'observaciones', v_mensajes, 'ambiente', v_f.ambiente
  );
end;
$$;
revoke execute on function comercial.fijar_numero_factura(uuid, integer, text) from public, anon;
revoke execute on function comercial.registrar_resultado_factura(uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function comercial.fijar_numero_factura(uuid, integer, text) to authenticated;
grant execute on function comercial.registrar_resultado_factura(uuid, jsonb, jsonb, text, text) to authenticated;
-- ===========================================================================
-- 5. gmp.siguiente_numero
-- ===========================================================================
--
-- Es SECURITY DEFINER (escribe gmp.contadores, que no tiene GRANT) y estaba
-- expuesta como RPC: cualquier usuario podía quemar números de cualquier
-- ámbito y dejar huecos en la numeración GMP. La llaman triggers de numeración
-- y funciones de alta; no se puede revocar el EXECUTE sin romperlas, así que
-- se exige que la llamada venga de otra función (la pila de PL/pgSQL tiene más
-- de un nivel). Una llamada directa por PostgREST tiene uno solo.

create or replace function gmp.siguiente_numero(p_ambito text, p_anio integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo integer;
  v_pila   text;
begin
  get diagnostics v_pila = pg_context;
  if array_length(regexp_split_to_array(v_pila, E'\n'), 1) < 2 then
    raise exception 'La numeración la asigna la base al registrar, no una llamada suelta.'
      using errcode = 'insufficient_privilege';
  end if;
  -- ON CONFLICT DO UPDATE toma el bloqueo de fila, así que dos transacciones
  -- concurrentes se serializan acá y ninguna repite número. Si la transacción
  -- se deshace, el incremento se deshace con ella y no queda hueco.
  insert into gmp.contadores (ambito, anio, ultimo)
  values (p_ambito, p_anio, 1)
  on conflict (ambito, anio)
    do update set ultimo = gmp.contadores.ultimo + 1
  returning ultimo into v_ultimo;
  return v_ultimo;
end;
$$;
