-- ---------------------------------------------------------------------------
-- Propósito : Autoridad de gmp sobre qué lote de insumo puede consumirse en
--             una producción: gmp.impedimento_consumo() y
--             gmp.lote_consumible(). Incorpora el saldo de apertura como
--             material consumible, por decisión de la conducción del
--             proyecto (desvío de docs/ESPEC_SALDO_INICIAL.md §5.2).
-- Reglas    : RN-51 (solo material liberado), RN-52 (el lote bloqueado no se
--             usa), §4 de CLAUDE.md (comercial consume la función, no la
--             replica). Desvío documentado como R-05 en
--             docs/DECISIONES_ABIERTAS.md.
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO TOCAR gmp.impedimento_despacho().
-- Despachar (vender, remitir) y consumir en producción son preguntas
-- distintas. Para despachar, RN-51 no tiene excepción: solo sale lo APROBADO,
-- y eso no cambia. Para consumir, la conducción del proyecto decidió el
-- 2026-09-23 que el saldo de apertura —el stock histórico migrado de la
-- planilla, sin lote de proveedor ni control de calidad propio— se use tal
-- cual, sin la reclasificación previa de Dirección Técnica que pedía
-- ESPEC_SALDO_INICIAL §5.2. Sin eso, todo el stock real de la planta figura
-- como faltante y ningún pedido puede terminarse.
--
-- Es un desvío deliberado y queda así escrito, en la base y en
-- DECISIONES_ABIERTAS (R-05), para que el inspector lo encuentre como decisión
-- y no como descuido. Lo que NO se afloja:
--   - El lote vencido no se consume.
--   - El lote con bloqueo vigente (retiro de mercado, no conformidad,
--     investigación) no se consume, sea aprobado o de apertura. RN-52 alcanza
--     al saldo de apertura igual que a cualquier otro lote.
--   - Cuarentena, muestreado, en análisis y rechazado siguen sin consumirse.
--
-- Vive en gmp porque la pregunta es regulada (CLAUDE.md §4): comercial la
-- invoca desde el trigger de movimientos y desde la vista de disponible, no
-- la evalúa por su cuenta.

create or replace function gmp.impedimento_consumo(p_lote_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lote    gmp.lotes_insumo%rowtype;
  v_motivos text;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id;
  if not found then
    return 'El lote no existe.';
  end if;

  -- El lote aprobado se rige exactamente por la regla de despacho: una sola
  -- implementación de RN-51/RN-52 para el material con circuito de calidad.
  if v_lote.estado = 'APROBADO' then
    return gmp.impedimento_despacho(p_lote_id);
  end if;

  if v_lote.estado <> 'SALDO_APERTURA' then
    return format(
      'RN-51: el lote %s está en estado %s. En producción solo se usa material aprobado o saldo de apertura.',
      v_lote.numero_registro_interno, v_lote.estado
    );
  end if;

  -- Saldo de apertura (R-05). Las dos condiciones que impedimento_despacho
  -- evalúa después del estado se aplican igual.
  if v_lote.plazo_validez is not null and v_lote.plazo_validez < current_date then
    return format(
      'El lote %s venció el %s.',
      v_lote.numero_registro_interno, to_char(v_lote.plazo_validez, 'DD/MM/YYYY')
    );
  end if;

  select string_agg(motivo::text || ' (' || detalle || ')', '; ' order by bloqueado_en)
    into v_motivos
    from gmp.bloqueos_lote
   where lote_insumo_id = p_lote_id
     and not levantado;

  if v_motivos is not null then
    return format('RN-52: el lote %s está bloqueado — %s',
                  v_lote.numero_registro_interno, v_motivos);
  end if;

  return null;
end;
$$;

comment on function gmp.impedimento_consumo(uuid) is
  'Motivo por el que un lote no puede consumirse en producción, o NULL si puede. APROBADO: igual que '
  'impedimento_despacho. SALDO_APERTURA: consumible salvo vencido o bloqueado (desvío R-05 de '
  'ESPEC_SALDO_INICIAL §5.2, decidido el 2026-09-23). Cualquier otro estado: no.';

create or replace function gmp.lote_consumible(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select gmp.impedimento_consumo(p_lote_id) is null;
$$;

comment on function gmp.lote_consumible(uuid) is
  'gmp.impedimento_consumo() leída como booleano, para no tener dos implementaciones de la misma pregunta.';

grant execute on function gmp.impedimento_consumo(uuid) to authenticated;
grant execute on function gmp.lote_consumible(uuid)     to authenticated;
