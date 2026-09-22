-- ---------------------------------------------------------------------------
-- Propósito : Completar solo, al pasar una fórmula de fabricación a VIGENTE,
--             quién la aprobó y cuándo. Sin esto, la única forma de satisfacer
--             el CHECK `formula_vigente_con_aprobacion` es que el cliente
--             mande `aprobada_por`/`aprobada_en` en el UPDATE, que es
--             exactamente lo que CLAUDE.md §6 prohíbe: «la interfaz oculta lo
--             que el rol no puede hacer, pero la autoridad sigue siendo la
--             base — nunca confíes en el cliente para lo que firma la base».
-- Reglas    : §3.3 (Dirección Técnica aprueba la fórmula maestra), PG.60.8.
-- Fecha     : 2026-09-21
-- ---------------------------------------------------------------------------
--
-- POR QUÉ ES UNA MIGRACIÓN NUEVA Y NO UN AJUSTE DE
-- `20260917110000_gmp_formulas_fabricacion`.
-- Esa migración ya está aplicada (o en camino de estarlo) y CLAUDE.md §6 es
-- explícito: «Jamás edites una migración ya aplicada». Dejó el CHECK que
-- exige la aprobación pero no el trigger que la completa sin intervención del
-- cliente; esto lo cierra, con el mismo patrón que
-- `gmp.fn_bloqueo_campos_editables` sobre `gmp.bloqueos_lote`
-- (20260910160000): el trigger, no el formulario, pone quién y cuándo.
--
-- La política `formulas_actualiza_dt` ya exige `DIRECCION_TECNICA` para
-- cualquier UPDATE de la tabla. El chequeo de rol de acá adentro es
-- redundante con esa política a propósito: si el día de mañana alguien
-- amplía la política de UPDATE a otro rol sin pensar en la aprobación, esto
-- sigue exigiendo Dirección Técnica para el paso a VIGENTE en particular.

create or replace function gmp.fn_formula_aprobacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'VIGENTE' and old.estado is distinct from 'VIGENTE' then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception
        'Solo Dirección Técnica pasa una fórmula a vigente (§3.3).'
        using errcode = 'insufficient_privilege';
    end if;
    new.aprobada_por := core.usuario_actual();
    new.aprobada_en  := now();
  end if;

  return new;
end;
$$;

comment on function gmp.fn_formula_aprobacion is
  'Completa aprobada_por/aprobada_en al pasar una fórmula a VIGENTE. El cliente pide el cambio de estado; quién y cuándo los pone la base (CLAUDE.md §6).';

-- Antes de `trg_formula_coherente` en orden alfabético, pero no importa: uno
-- completa aprobada_por/aprobada_en, el otro valida la suma de porcentajes y
-- el csp único, y ninguno depende del resultado del otro.
create trigger trg_formula_aprobacion
  before update on gmp.formulas_fabricacion
  for each row execute function gmp.fn_formula_aprobacion();
