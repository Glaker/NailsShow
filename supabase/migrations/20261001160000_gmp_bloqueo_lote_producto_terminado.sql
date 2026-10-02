-- ---------------------------------------------------------------------------
-- Propósito : Que un lote de producto terminado (la orden de producción, R-09)
--             se pueda bloquear igual que un lote de insumo, y que
--             gmp.lote_despachable() sea la única pregunta para los dos.
-- Reglas    : RN-51 (solo se despacha lo liberado), RN-52 (un lote alcanzado
--             por un retiro queda bloqueado de inmediato), CLAUDE.md §4 (la
--             autoridad vive en gmp y comercial la invoca). Pedido del
--             2026-10-01: «Enviado» usa gmp.lote_despachable().
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- POR QUÉ. Hasta hoy gmp.bloqueos_lote apuntaba solo a lotes de insumo, y la
-- salida de producto terminado preguntaba a gmp.impedimento_despacho_orden(),
-- que miraba solamente si la orden estaba LIBERADA. Un retiro de mercado sobre
-- producto terminado —el caso que RN-52 existe para cubrir— no podía
-- registrarse y no frenaba una venta. Ahora:
--   - un bloqueo es de un lote de insumo o de un lote de producto terminado
--     (uno de los dos, nunca ambos);
--   - gmp.impedimento_despacho_orden() suma el vencimiento y los bloqueos
--     vigentes, como hace gmp.impedimento_despacho() con el insumo;
--   - gmp.lote_despachable(uuid) responde por cualquiera de los dos lotes.
-- Nada de esto vive en comercial: comercial sigue invocando.

-- ===========================================================================
-- 1. Bloqueo de un lote de producto terminado
-- ===========================================================================

alter table gmp.bloqueos_lote
  alter column lote_insumo_id drop not null,
  add column orden_id uuid references gmp.ordenes_produccion(id),
  add constraint bloqueos_lote_un_lote check (num_nonnulls(lote_insumo_id, orden_id) = 1);

comment on column gmp.bloqueos_lote.orden_id is
  'Lote de producto terminado (orden de producción) bloqueado. Excluyente con lote_insumo_id.';

create index bloqueos_lote_orden_idx on gmp.bloqueos_lote (orden_id) where orden_id is not null;
create unique index bloqueos_lote_orden_un_vigente_por_motivo
  on gmp.bloqueos_lote (orden_id, motivo) where not levantado and orden_id is not null;

-- Copia de la vigente (20260910160000) con orden_id entre lo que no se edita.
create or replace function gmp.fn_bloqueo_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.lote_insumo_id, new.orden_id, new.motivo, new.detalle, new.origen, new.origen_id,
      new.bloqueado_por, new.bloqueado_en)
     is distinct from
     (old.lote_insumo_id, old.orden_id, old.motivo, old.detalle, old.origen, old.origen_id,
      old.bloqueado_por, old.bloqueado_en) then
    raise exception
      'Un bloqueo registrado no se edita: lo único que admite es su levantamiento. '
      'Si el fundamento estaba mal, se levanta con ese motivo y se registra el bloqueo correcto.'
      using errcode = 'restrict_violation';
  end if;

  if old.levantado and not new.levantado then
    raise exception
      'Un bloqueo levantado no se vuelve a activar. Corresponde registrar un bloqueo nuevo (RN-52).'
      using errcode = 'restrict_violation';
  end if;

  if new.levantado and not old.levantado then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception
        'Solo Dirección Técnica levanta el bloqueo de un lote (§3.3, por analogía con el cierre de no conformidad).'
        using errcode = 'insufficient_privilege';
    end if;
    new.levantado_por := core.usuario_actual();
    new.levantado_en  := now();
  end if;

  return new;
end;
$$;

-- La vista muestra los dos tipos de lote. Reescrita desde pg_get_viewdef.
create or replace view gmp.v_bloqueos_lote with (security_invoker = true) as
  select
    b.id,
    b.lote_insumo_id,
    coalesce(l.numero_registro_interno, o.numero_lote) as numero_registro_interno,
    b.motivo,
    b.detalle,
    b.origen,
    b.origen_id,
    b.bloqueado_por,
    ub.nombre_completo as bloqueado_por_nombre,
    b.bloqueado_en,
    b.levantado,
    b.levantado_motivo,
    b.levantado_por,
    ul.nombre_completo as levantado_por_nombre,
    b.levantado_en,
    b.orden_id
  from gmp.bloqueos_lote b
  left join gmp.lotes_insumo l on l.id = b.lote_insumo_id
  left join gmp.ordenes_produccion o on o.id = b.orden_id
  join core.v_nomina ub on ub.id = b.bloqueado_por
  left join core.v_nomina ul on ul.id = b.levantado_por;

-- ===========================================================================
-- 2. La autoridad sobre producto terminado
-- ===========================================================================

create or replace function gmp.impedimento_despacho_orden(p_orden_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orden   gmp.ordenes_produccion%rowtype;
  v_motivos text;
begin
  select * into v_orden from gmp.ordenes_produccion where id = p_orden_id;
  if not found then
    return 'El lote no existe.';
  end if;

  -- RN-51: liberado por Dirección Técnica.
  if v_orden.estado <> 'LIBERADA' then
    return format('El lote %s (%s) no está liberado por Dirección Técnica: está %s.',
                  v_orden.numero_lote, v_orden.numero, lower(v_orden.estado::text));
  end if;

  -- Liberado pero vencido: no sale (mismo criterio que el insumo).
  if v_orden.vencimiento is not null and v_orden.vencimiento < current_date then
    return format('El lote %s venció el %s.', v_orden.numero_lote, to_char(v_orden.vencimiento, 'DD/MM/YYYY'));
  end if;

  -- RN-52: bloqueo vigente (retiro de mercado, no conformidad, decisión manual).
  select string_agg(motivo::text || ' (' || detalle || ')', '; ' order by bloqueado_en)
    into v_motivos
    from gmp.bloqueos_lote
   where orden_id = p_orden_id and not levantado;
  if v_motivos is not null then
    return format('RN-52: el lote %s está bloqueado — %s', v_orden.numero_lote, v_motivos);
  end if;

  return null;
end;
$$;

comment on function gmp.impedimento_despacho_orden(uuid) is
  'Motivo por el que un lote de producto terminado no puede despacharse (no liberado, vencido o bloqueado), o NULL '
  'si puede (RN-51, RN-52). comercial la invoca, no la replica (CLAUDE.md §4).';

-- Una sola pregunta para cualquier lote: de insumo o de producto terminado.
create or replace function gmp.lote_despachable(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when exists (select 1 from gmp.lotes_insumo where id = p_lote_id)
             then gmp.impedimento_despacho(p_lote_id) is null
           else gmp.impedimento_despacho_orden(p_lote_id) is null
         end;
$$;

comment on function gmp.lote_despachable(uuid) is
  'RN-51 y RN-52 leídas como booleano, para un lote de insumo o un lote de producto terminado (orden de '
  'producción). Envoltorio de las funciones que dan el motivo: una sola lógica por tipo de lote.';

revoke execute on function gmp.impedimento_despacho_orden(uuid) from public, anon;
grant  execute on function gmp.impedimento_despacho_orden(uuid) to authenticated;
grant  execute on function gmp.lote_despachable(uuid) to authenticated;
