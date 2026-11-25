-- ---------------------------------------------------------------------------
-- Propósito : Que la base rechace una orden de producción cuya cantidad
--             teórica, dividida por las unidades previstas, da más de 5 kg o
--             5 L por unidad: es una cuenta mal hecha (gramos cargados como
--             kilos), no un producto real. El más grande del catálogo es de 1 L.
-- Reglas    : RN-50 (registro confiable); CLAUDE.md §6 (la base es la
--             autoridad, no la pantalla). Caso del 2026-11-25: OP-2026-0029,
--             HUMECTANTE PAZ 240 ml, 336 unidades, abierta el 18/11 con 240
--             «kg» por unidad = 80.640 kg en vez de 80,64 kg; el envasado pedía
--             80.640 kg de 372CREMA y no dejaba cargar nada.
-- Fecha     : 2026-11-25
-- ---------------------------------------------------------------------------
--
-- Solo mira la orden nueva o un cambio de cantidad_teorica / unidades_previstas:
-- las órdenes ya guardadas no se tocan (OP-2026-0029 se corrige aparte).
-- Sin unidades previstas no hay contra qué dividir y no se controla.

create or replace function gmp.fn_orden_teorica_por_unidad()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.cantidad_teorica is not distinct from old.cantidad_teorica
     and new.unidades_previstas is not distinct from old.unidades_previstas then
    return new;
  end if;
  if coalesce(new.unidades_previstas, 0) > 0
     and new.cantidad_teorica / new.unidades_previstas > 5 then
    raise exception
      'La cantidad teórica da % % por unidad (% % para % unidades). Ningún producto lleva más de 5 %: revisá si la cantidad por unidad va en g o ml, no en kg o L.',
      round(new.cantidad_teorica / new.unidades_previstas, 3), new.unidad,
      new.cantidad_teorica, new.unidad, new.unidades_previstas, new.unidad
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function gmp.fn_orden_teorica_por_unidad() is
  'Rechaza una orden con más de 5 kg o 5 L por unidad prevista (caso OP-2026-0029, 2026-11-25).';

create trigger trg_orden_teorica_por_unidad
  before insert or update on gmp.ordenes_produccion
  for each row execute function gmp.fn_orden_teorica_por_unidad();
