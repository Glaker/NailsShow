-- ---------------------------------------------------------------------------
-- Propósito : Que Ventas cambie la escala de descuento por monto desde la app
--             (pedido del 2026-10-02: «dale a Mati y a Agustina la opción de
--             cambiar los cortes si hace falta»). Una escala nueva se carga
--             entera, en un paso, con la fecha desde la que rige; la anterior
--             queda (append-only, §4.12.1).
-- Reglas    : §4.12.1 (versionado), RN-50 (auditoría por el trigger genérico).
--             La escala de la planilla 46.14 queda confirmada por la Gerencia
--             (2026-10-02) y el descuento se suma a la promoción.
-- Fecha     : 2026-10-02
-- ---------------------------------------------------------------------------

create or replace function comercial.cargar_escala_descuento(
  p_escalones     jsonb,
  p_vigente_desde date default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_carga integer;
  v_n     integer;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') then
    raise exception 'La escala de descuentos la cambia Ventas.' using errcode = 'insufficient_privilege';
  end if;

  create temporary table if not exists pg_temp.escala_nueva (desde numeric, pct numeric) on commit drop;
  delete from pg_temp.escala_nueva;
  insert into pg_temp.escala_nueva
  select (x ->> 'desde_monto')::numeric, (x ->> 'porcentaje')::numeric
    from jsonb_array_elements(coalesce(p_escalones, '[]'::jsonb)) x;

  select count(*) into v_n from pg_temp.escala_nueva;
  if v_n = 0 then
    raise exception 'La escala necesita al menos un escalón.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from pg_temp.escala_nueva where desde is null or pct is null) then
    raise exception 'Cada escalón lleva monto y porcentaje.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from pg_temp.escala_nueva where desde = 0) then
    raise exception 'La escala empieza en $0 (lo que va hasta el primer corte).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from pg_temp.escala_nueva where desde < 0 or pct < 0 or pct > 100) then
    raise exception 'Los montos no son negativos y los porcentajes van de 0 a 100.' using errcode = 'check_violation';
  end if;
  if (select count(distinct desde) from pg_temp.escala_nueva) <> v_n then
    raise exception 'Hay dos escalones con el mismo monto.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('comercial.escalas_descuento'));
  select coalesce(max(carga), 0) + 1 into v_carga from comercial.escalas_descuento;

  insert into comercial.escalas_descuento (carga, desde_monto, porcentaje, vigente_desde)
  select v_carga, desde, pct, coalesce(p_vigente_desde, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
    from pg_temp.escala_nueva;

  return v_carga;
end;
$$;

comment on function comercial.cargar_escala_descuento(jsonb, date) is
  'Carga una escala de descuento por monto entera ([{desde_monto, porcentaje}]) con su fecha de vigencia. Rige desde '
  'esa fecha; la anterior queda. Ventas, Administración y Gerencia.';

grant execute on function comercial.cargar_escala_descuento(jsonb, date) to authenticated;
