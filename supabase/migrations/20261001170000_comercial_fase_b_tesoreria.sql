-- ---------------------------------------------------------------------------
-- Propósito : Fase B de la auditoría de Administración (docs/AUDITORIA_ADMIN.md):
--             corregir lo roto del módulo de tesorería y cuentas.
--               B1  Una transferencia se anula entera, nunca una pata.
--               B2  El resultado mensual no cuenta egresos anulados.
--               B3  El cash flow real no suma las anulaciones como entradas y
--                   salidas.
--               B5  No se anula una factura de proveedor con pagos vigentes
--                   imputados o notas de crédito vigentes: primero eso.
--               B6  Pagar una solicitud exige el mismo proveedor y el mismo
--                   importe.
--               R11 Imputar bloquea la fila del pago o cobro: dos imputaciones
--                   simultáneas no superan su importe.
-- Reglas    : RN-63 (no se imputa más que el saldo), RN-54/§3.1 (lo registrado
--             se corrige con un contramovimiento, no se edita), RN-50.
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- B1. Transferencias: anulación atómica
-- ===========================================================================

-- Copia de la vigente (20260929130000) con una guarda NUEVA: la pata de una
-- transferencia no se anula sola.
create or replace function comercial.anular_movimiento_fondos(p_id uuid, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v   comercial.movimientos_fondos%rowtype;
  v_n uuid;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí por qué se anula.' using errcode = 'check_violation';
  end if;
  select * into v from comercial.movimientos_fondos where id = p_id;
  if not found then
    raise exception 'El movimiento no existe.';
  end if;
  if v.anula_a_id is not null then
    raise exception 'Una anulación no se anula: cargá el movimiento correcto.' using errcode = 'check_violation';
  end if;
  if v.pago_id is not null then
    raise exception 'El egreso de un pago se anula anulando el pago.' using errcode = 'check_violation';
  end if;
  if v.cobro_id is not null then
    raise exception 'El ingreso de un cobro se anula anulando el cobro.' using errcode = 'check_violation';
  end if;
  if v.transferencia_grupo is not null then
    raise exception 'Es una pata de una transferencia: se anula la transferencia entera, las dos cuentas a la vez.'
      using errcode = 'check_violation';
  end if;
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, anula_a_id)
  values (v.cuenta_id, v.tipo, -v.importe, format('Anula: %s — %s', v.concepto, btrim(p_motivo)), v.id)
  returning id into v_n;
  return v_n;
end;
$$;

create or replace function comercial.anular_transferencia(p_grupo uuid, p_motivo text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí por qué se anula.' using errcode = 'check_violation';
  end if;
  -- Las dos patas, bloqueadas: una anulación a la vez.
  perform 1 from comercial.movimientos_fondos where transferencia_grupo = p_grupo for update;
  select count(*) into v_n from comercial.movimientos_fondos
   where transferencia_grupo = p_grupo and anula_a_id is null;
  if v_n <> 2 then
    raise exception 'La transferencia no existe.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.movimientos_fondos x
               join comercial.movimientos_fondos o on o.id = x.anula_a_id
              where o.transferencia_grupo = p_grupo) then
    raise exception 'La transferencia ya está anulada.' using errcode = 'check_violation';
  end if;
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, anula_a_id, transferencia_grupo)
  select m.cuenta_id, m.tipo, -m.importe, format('Anula: %s — %s', m.concepto, btrim(p_motivo)), m.id, p_grupo
    from comercial.movimientos_fondos m
   where m.transferencia_grupo = p_grupo and m.anula_a_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function comercial.anular_transferencia(uuid, text) is
  'Anula una transferencia entre cuentas: un contramovimiento por cada pata, en la misma transacción. Una pata '
  'suelta no se anula (anular_movimiento_fondos la rechaza).';

grant execute on function comercial.anular_transferencia(uuid, text) to authenticated;

-- ===========================================================================
-- B2. Resultado mensual sin egresos anulados
-- ===========================================================================
--
-- Copia de la vigente (20260930150000). Cambia solo «gastos»: ni el original
-- anulado ni su inverso cuentan.

create or replace view comercial.v_resultado_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when comprobante = 'NOTA_CREDITO' then -importe_neto else importe_neto end) as ventas_netas
    from comercial.facturas where estado = 'AUTORIZADA' and ambiente = 'PRODUCCION' group by 1
),
compras as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when tipo = 'FACTURA_A' then importe_neto + coalesce(importe_otros, 0)
                  when tipo = 'NOTA_CREDITO_A' then -(importe_neto + coalesce(importe_otros, 0))
                  when tipo::text like 'NOTA_CREDITO%' then -coalesce(importe_total, 0)
                  else coalesce(importe_total, 0) end) as compras
    from comercial.comprobantes_proveedor where anulado_en is null group by 1
),
gastos as (
  select date_trunc('month', m.fecha)::date as periodo, -sum(m.importe) as otros_egresos
    from comercial.movimientos_fondos m
   where m.tipo in ('EGRESO', 'AJUSTE') and m.importe < 0 and m.pago_id is null and m.cobro_id is null
     and m.anula_a_id is null
     and not exists (select 1 from comercial.movimientos_fondos x where x.anula_a_id = m.id)
   group by 1
)
select coalesce(v.periodo, c.periodo, g.periodo) as periodo,
       coalesce(v.ventas_netas, 0)  as ventas_netas,
       coalesce(c.compras, 0)       as compras,
       coalesce(g.otros_egresos, 0) as otros_egresos,
       coalesce(v.ventas_netas, 0) - coalesce(c.compras, 0) - coalesce(g.otros_egresos, 0) as resultado
  from ventas v
  full join compras c on c.periodo = v.periodo
  full join gastos g on g.periodo = coalesce(v.periodo, c.periodo);

-- ===========================================================================
-- B3. Cash flow real sin anulaciones en el bruto
-- ===========================================================================
--
-- Copia de la vigente (20260929130000): ingresos y egresos dejan afuera el
-- movimiento anulado y su inverso. El neto no cambia (el par suma cero).

create or replace view comercial.v_cash_flow_real
with (security_invoker = true) as
select date_trunc('month', m.fecha)::date as periodo, m.cuenta_id, c.nombre as cuenta, c.de_tercero,
       sum(m.importe) filter (where m.importe > 0 and m.tipo <> 'TRANSFERENCIA' and not a.en_par) as ingresos,
       -sum(m.importe) filter (where m.importe < 0 and m.tipo <> 'TRANSFERENCIA' and not a.en_par) as egresos,
       sum(m.importe) filter (where m.tipo <> 'TRANSFERENCIA') as neto
  from comercial.movimientos_fondos m
  join comercial.cuentas_fondos c on c.id = m.cuenta_id
  cross join lateral (
    select m.anula_a_id is not null
           or exists (select 1 from comercial.movimientos_fondos x where x.anula_a_id = m.id) as en_par
  ) a
 group by 1, 2, 3, 4;

-- ===========================================================================
-- B5. Anular una factura de proveedor: primero lo que cuelga de ella
-- ===========================================================================

create or replace function comercial.anular_comprobante_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_imputado numeric;
  v_nc       text;
begin
  perform 1 from comercial.comprobantes_proveedor where id = p_id for update;
  select coalesce(sum(i.importe), 0) into v_imputado
    from comercial.imputaciones_pago i
    join comercial.pagos_proveedor p on p.id = i.pago_id and p.anulado_en is null
   where i.comprobante_id = p_id;
  if v_imputado > 0 then
    raise exception 'El comprobante tiene $% pagados con pagos vigentes: anulá esos pagos primero (y volvé a cargarlos sin este comprobante si corresponde).', v_imputado
      using errcode = 'check_violation';
  end if;
  select string_agg(format('%s %s-%s', tipo, punto_venta, numero), ', ') into v_nc
    from comercial.comprobantes_proveedor
   where comprobante_asociado_id = p_id and anulado_en is null;
  if v_nc is not null then
    raise exception 'El comprobante tiene notas de crédito vigentes (%): anulalas primero.', v_nc
      using errcode = 'check_violation';
  end if;
  update comercial.comprobantes_proveedor
     set anulado_en = now(), anulado_por = core.usuario_actual(), motivo_anulacion = btrim(p_motivo)
   where id = p_id;
  if not found then
    raise exception 'El comprobante no existe o tu rol no puede anularlo.';
  end if;
end;
$$;

-- ===========================================================================
-- B6. Pagar una solicitud: el pago es el de la solicitud
-- ===========================================================================
--
-- Copia de la vigente (20260929120000) con las guardas NUEVAS sobre la
-- solicitud antes de marcarla pagada.

create or replace function comercial.registrar_pago_proveedor(
  p_proveedor_id  uuid,
  p_cuenta_id     uuid,
  p_importe       numeric,
  p_medio         comercial.medio_pago_enum,
  p_imputaciones  jsonb default '[]'::jsonb,
  p_fecha         date default null,
  p_referencia    text default null,
  p_observacion   text default null,
  p_solicitud_id  uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pago uuid;
  v_s    comercial.solicitudes_pago%rowtype;
  e      record;
begin
  if p_solicitud_id is not null then
    select * into v_s from comercial.solicitudes_pago where id = p_solicitud_id for update;
    if not found then
      raise exception 'La solicitud no existe.';
    end if;
    if v_s.proveedor_id is not null and v_s.proveedor_id <> p_proveedor_id then
      raise exception 'La solicitud es para otro proveedor.' using errcode = 'check_violation';
    end if;
    if v_s.importe <> p_importe then
      raise exception 'La solicitud es por $% y el pago por $%: tienen que coincidir.', v_s.importe, p_importe
        using errcode = 'check_violation';
    end if;
  end if;

  insert into comercial.pagos_proveedor (proveedor_id, fecha, cuenta_id, medio, importe, referencia, observacion)
  values (p_proveedor_id, coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
          p_cuenta_id, p_medio, p_importe, nullif(btrim(p_referencia), ''), nullif(btrim(p_observacion), ''))
  returning id into v_pago;

  for e in
    select (x ->> 'comprobante_id')::uuid as comprobante_id, (x ->> 'importe')::numeric as importe
      from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) x
  loop
    continue when coalesce(e.importe, 0) = 0;
    insert into comercial.imputaciones_pago (pago_id, comprobante_id, importe)
    values (v_pago, e.comprobante_id, e.importe);
  end loop;

  if p_solicitud_id is not null then
    update comercial.solicitudes_pago set estado = 'PAGADA', pago_id = v_pago where id = p_solicitud_id;
  end if;
  return v_pago;
end;
$$;

-- ===========================================================================
-- R11. Imputar bloquea el pago o el cobro
-- ===========================================================================
--
-- Copias de las vigentes (20260929120000 y 20260930150000) con `for update`
-- sobre la fila del pago o del cobro, además de la del comprobante.

create or replace function comercial.fn_validar_imputacion_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pago  comercial.pagos_proveedor%rowtype;
  v_comp  comercial.comprobantes_proveedor%rowtype;
  v_pend  numeric;
  v_usado numeric;
begin
  select * into v_pago from comercial.pagos_proveedor where id = new.pago_id for update;
  select * into v_comp from comercial.comprobantes_proveedor where id = new.comprobante_id for update;
  if v_pago.anulado_en is not null or v_comp.anulado_en is not null then
    raise exception 'No se imputa un pago o un comprobante anulado.' using errcode = 'check_violation';
  end if;
  if v_pago.proveedor_id <> v_comp.proveedor_id then
    raise exception 'El comprobante es de otro proveedor que el pago.' using errcode = 'check_violation';
  end if;
  if v_comp.tipo::text like 'NOTA_CREDITO%' then
    raise exception 'Una nota de crédito no se paga: descuenta de la factura que corrige.' using errcode = 'check_violation';
  end if;
  select pendiente into v_pend from comercial.v_comprobantes_proveedor_pendientes where comprobante_id = new.comprobante_id;
  if v_pend is null or new.importe > v_pend then
    raise exception 'RN-63: al comprobante le quedan % por pagar; no se imputan %.', coalesce(v_pend, 0), new.importe
      using errcode = 'check_violation';
  end if;
  select coalesce(sum(importe), 0) into v_usado from comercial.imputaciones_pago where pago_id = new.pago_id;
  if v_usado + new.importe > v_pago.importe then
    raise exception 'El pago es de % y ya tiene % imputados.', v_pago.importe, v_usado using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function comercial.fn_validar_imputacion_cobro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cobro comercial.cobros_cliente%rowtype;
  v_fac   comercial.facturas%rowtype;
  v_pend  numeric;
  v_usado numeric;
begin
  select * into v_cobro from comercial.cobros_cliente where id = new.cobro_id for update;
  select * into v_fac from comercial.facturas where id = new.factura_id for update;
  if v_cobro.anulado_en is not null then
    raise exception 'No se imputa un cobro anulado.' using errcode = 'check_violation';
  end if;
  if v_fac.comprobante <> 'FACTURA' then
    raise exception 'Un cobro se imputa a una factura, no a una nota de crédito.' using errcode = 'check_violation';
  end if;
  if v_fac.estado <> 'AUTORIZADA' then
    raise exception 'Se imputa contra una factura autorizada.' using errcode = 'check_violation';
  end if;
  if v_fac.cliente_id <> v_cobro.cliente_id then
    raise exception 'La factura es de otro cliente que el cobro.' using errcode = 'check_violation';
  end if;
  select pendiente into v_pend from comercial.v_facturas_pendientes_cobro where factura_id = new.factura_id;
  if new.importe > coalesce(v_pend, 0) then
    raise exception 'RN-63: a la factura le quedan % por cobrar; no se imputan %.', coalesce(v_pend, 0), new.importe
      using errcode = 'check_violation';
  end if;
  select coalesce(sum(importe), 0) into v_usado from comercial.imputaciones_cobro where cobro_id = new.cobro_id;
  if v_usado + new.importe > v_cobro.importe then
    raise exception 'El cobro es de % y ya tiene % imputados.', v_cobro.importe, v_usado using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
