-- ---------------------------------------------------------------------------
-- Propósito : Corrige 20260930180000, escrita y no aplicada:
--             1. flujo_caja_diario nombraba `d.fecha` sobre una generate_series
--                sin alias de columna, y fallaba en cada llamada.
--             2. Revocaba la ejecución a `anon` pero no a PUBLIC, por donde
--                anon la hereda. (Los datos igual estaban protegidos por RLS.)
-- Reglas    : Control de cambios (CLAUDE.md §6): la migración escrita no se
--             edita, se corrige con otra.
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------

create or replace function comercial.flujo_caja_diario(p_desde date, p_hasta date)
returns table (
  fecha          date,
  ingresos       numeric,
  egresos        numeric,
  neto           numeric,
  saldo_bancos   numeric,
  saldo_efectivo numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El período va de una fecha a otra posterior, hasta 400 días.' using errcode = 'check_violation';
  end if;

  -- ponytail: saldo por subconsulta correlativa (días × movimientos); si el
  -- libro crece a cientos de miles de filas, pasar a una suma acumulada.
  return query
  with mov as (
    select m.fecha, m.importe, m.tipo, c.tipo as cuenta_tipo
      from comercial.movimientos_fondos m
      join comercial.cuentas_fondos c on c.id = m.cuenta_id
  ),
  flujo as (
    select mov.fecha,
           coalesce(sum(mov.importe) filter (where mov.importe > 0 and mov.tipo <> 'TRANSFERENCIA'), 0) as ing,
           coalesce(-sum(mov.importe) filter (where mov.importe < 0 and mov.tipo <> 'TRANSFERENCIA'), 0) as egr
      from mov
     where mov.fecha between p_desde and p_hasta
     group by mov.fecha
  )
  select d.dia::date,
         coalesce(f.ing, 0),
         coalesce(f.egr, 0),
         coalesce(f.ing, 0) - coalesce(f.egr, 0),
         (select coalesce(sum(x.importe), 0) from mov x where x.fecha <= d.dia and x.cuenta_tipo <> 'CAJA'),
         (select coalesce(sum(x.importe), 0) from mov x where x.fecha <= d.dia and x.cuenta_tipo = 'CAJA')
    from generate_series(p_desde, p_hasta, interval '1 day') as d(dia)
    left join flujo f on f.fecha = d.dia::date
   order by 1;
end;
$$;

revoke execute on function comercial.flujo_caja_diario(date, date),
                           comercial.flujo_caja_dia(date),
                           comercial.volumenes_por_contraparte(date, date) from public, anon;
grant  execute on function comercial.flujo_caja_diario(date, date),
                           comercial.flujo_caja_dia(date),
                           comercial.volumenes_por_contraparte(date, date) to authenticated;
