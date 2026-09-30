-- ---------------------------------------------------------------------------
-- Propósito : Etapa 2 del módulo de Administración: cobros de clientes con
--             imputación a las facturas, cuenta corriente y antigüedad de
--             saldos de clientes, cash flow real y proyectado, ventas por mes
--             y cliente, y un resultado mensual de gestión.
-- Reglas    : RN-63 (la imputación no supera el saldo del comprobante), RN-50
--             (auditoría), §4.12.4 del alcance. Documento de requerimientos de
--             Administración §2.3 («Ingresos y facturación»), §3 (reportes).
--             Ítem 25 de la cola.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- LO QUE ESTO NO ES.
-- El resultado mensual es de gestión: ventas netas facturadas menos compras
-- netas menos otros egresos de fondos. No es un estado contable: no hay
-- devengamiento, amortizaciones ni costo de lo vendido (el sistema no tiene
-- costos: D-36). Si se lleva contabilidad propia o se importa de Holistor es
-- D-34.
--
-- FACTURAS DE HOMOLOGACIÓN.
-- Mientras la facturación esté en homologación, las facturas no son fiscales.
-- Las vistas traen la columna `ambiente` para que la pantalla muestre solo
-- producción y avise.

-- ===========================================================================
-- 1. Cobros de clientes e imputaciones
-- ===========================================================================

create table comercial.cobros_cliente (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references comercial.clientes(id),
  fecha            date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  cuenta_id        uuid not null references comercial.cuentas_fondos(id),
  medio            comercial.medio_pago_enum not null,
  importe          numeric(16,2) not null check (importe > 0),
  referencia       text,
  observacion      text,
  registrado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en    timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid references core.usuarios(id),
  motivo_anulacion text,
  constraint cobros_cliente_anulacion check (
    (anulado_en is null and anulado_por is null and motivo_anulacion is null)
    or (anulado_en is not null and anulado_por is not null and length(btrim(coalesce(motivo_anulacion, ''))) > 0)
  )
);

comment on table comercial.cobros_cliente is
  'Cobros a clientes. Cada cobro genera su ingreso en la caja o el banco. No se edita: se anula con motivo.';

alter table comercial.movimientos_fondos
  add column cobro_id uuid references comercial.cobros_cliente(id);

create table comercial.imputaciones_cobro (
  id             uuid primary key default gen_random_uuid(),
  cobro_id       uuid not null references comercial.cobros_cliente(id),
  factura_id     uuid not null references comercial.facturas(id),
  importe        numeric(16,2) not null check (importe > 0),
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now(),
  unique (cobro_id, factura_id)
);

comment on table comercial.imputaciones_cobro is
  'Qué facturas cancela cada cobro (RN-63). Lo no imputado es «cobrado sin facturar» (§2.3).';

create view comercial.v_facturas_pendientes_cobro
with (security_invoker = true) as
select f.id as factura_id, f.cliente_id, f.pedido_id, f.ambiente, f.tipo, f.punto_venta, f.numero, f.fecha,
       f.importe_total,
       coalesce(im.total, 0) as cobrado,
       greatest(f.importe_total - coalesce(im.total, 0), 0) as pendiente,
       ((now() at time zone 'America/Argentina/Buenos_Aires')::date - f.fecha) as dias
  from comercial.facturas f
  left join lateral (
    select sum(i.importe) as total from comercial.imputaciones_cobro i
      join comercial.cobros_cliente c on c.id = i.cobro_id and c.anulado_en is null
     where i.factura_id = f.id
  ) im on true
 where f.estado = 'AUTORIZADA';

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
  select * into v_cobro from comercial.cobros_cliente where id = new.cobro_id;
  select * into v_fac from comercial.facturas where id = new.factura_id for update;
  if v_cobro.anulado_en is not null then
    raise exception 'No se imputa un cobro anulado.' using errcode = 'check_violation';
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

create trigger trg_validar_imputacion_cobro
  before insert on comercial.imputaciones_cobro
  for each row execute function comercial.fn_validar_imputacion_cobro();

create or replace function comercial.fn_cobro_cliente_fondos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cli text;
  v_mov comercial.movimientos_fondos%rowtype;
begin
  select razon_social into v_cli from comercial.clientes where id = new.cliente_id;
  if tg_op = 'INSERT' then
    insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto, comprobante, contraparte, cobro_id)
    values (new.cuenta_id, new.fecha, 'INGRESO', new.importe, format('Cobro a %s', v_cli), new.referencia, v_cli, new.id);
    return new;
  end if;
  if old.anulado_en is not null then
    raise exception 'El cobro ya está anulado.' using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - array['anulado_en','anulado_por','motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulado_en','anulado_por','motivo_anulacion']) then
    raise exception 'Un cobro no se edita: se anula con motivo y se carga el correcto.' using errcode = 'restrict_violation';
  end if;
  select * into v_mov from comercial.movimientos_fondos where cobro_id = new.id and anula_a_id is null;
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, contraparte, cobro_id, anula_a_id)
  values (v_mov.cuenta_id, 'INGRESO', -v_mov.importe, format('Anula cobro a %s — %s', v_cli, new.motivo_anulacion),
          v_cli, new.id, v_mov.id);
  return new;
end;
$$;

create trigger trg_cobro_cliente_fondos
  after insert or update on comercial.cobros_cliente
  for each row execute function comercial.fn_cobro_cliente_fondos();

-- El egreso de un cobro tampoco se anula suelto (mismo criterio que el pago).
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
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, anula_a_id, transferencia_grupo)
  values (v.cuenta_id, v.tipo, -v.importe, format('Anula: %s — %s', v.concepto, btrim(p_motivo)), v.id,
          v.transferencia_grupo)
  returning id into v_n;
  return v_n;
end;
$$;

create or replace function comercial.registrar_cobro_cliente(
  p_cliente_id   uuid,
  p_cuenta_id    uuid,
  p_importe      numeric,
  p_medio        comercial.medio_pago_enum,
  p_imputaciones jsonb default '[]'::jsonb,
  p_fecha        date default null,
  p_referencia   text default null,
  p_observacion  text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_cobro uuid;
  e       record;
begin
  insert into comercial.cobros_cliente (cliente_id, fecha, cuenta_id, medio, importe, referencia, observacion)
  values (p_cliente_id, coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
          p_cuenta_id, p_medio, p_importe, nullif(btrim(p_referencia), ''), nullif(btrim(p_observacion), ''))
  returning id into v_cobro;
  for e in
    select (x ->> 'factura_id')::uuid as factura_id, (x ->> 'importe')::numeric as importe
      from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) x
  loop
    continue when coalesce(e.importe, 0) = 0;
    insert into comercial.imputaciones_cobro (cobro_id, factura_id, importe) values (v_cobro, e.factura_id, e.importe);
  end loop;
  return v_cobro;
end;
$$;

create or replace function comercial.anular_cobro_cliente(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update comercial.cobros_cliente
     set anulado_en = now(), anulado_por = core.usuario_actual(), motivo_anulacion = btrim(p_motivo)
   where id = p_id;
  if not found then
    raise exception 'El cobro no existe o tu rol no puede anularlo.';
  end if;
end;
$$;

-- ===========================================================================
-- 2. Cuenta corriente y antigüedad de saldos de clientes
-- ===========================================================================

create view comercial.v_cuenta_corriente_clientes
with (security_invoker = true) as
select f.cliente_id, f.fecha, f.creado_en as momento, 'FACTURA' as movimiento, f.tipo as detalle_tipo,
       lpad(f.punto_venta::text, 4, '0') || '-' || lpad(coalesce(f.numero, 0)::text, 8, '0') as referencia,
       f.id as factura_id, null::uuid as cobro_id, f.importe_total as debe, 0::numeric as haber, f.ambiente::text as ambiente
  from comercial.facturas f
 where f.estado = 'AUTORIZADA'
union all
select c.cliente_id, c.fecha, c.registrado_en, 'COBRO', c.medio::text, coalesce(c.referencia, ''),
       null, c.id, 0, c.importe, null
  from comercial.cobros_cliente c
 where c.anulado_en is null;

create view comercial.v_saldos_clientes
with (security_invoker = true) as
with fac as (
  select cliente_id,
         sum(importe_total) filter (where ambiente = 'PRODUCCION') as facturado,
         sum(pendiente) filter (where ambiente = 'PRODUCCION') as pendiente,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias <= 30) as a_30,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias between 31 and 60) as a_60,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias between 61 and 90) as a_90,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias > 90) as mas_90,
         sum(pendiente) filter (where ambiente = 'HOMOLOGACION') as pendiente_homologacion
    from comercial.v_facturas_pendientes_cobro
   group by cliente_id
),
cob as (
  select c.cliente_id, sum(c.importe) as cobrado,
         sum(c.importe) - coalesce(sum(i.imputado), 0) as sin_imputar
    from comercial.cobros_cliente c
    left join lateral (select sum(importe) as imputado from comercial.imputaciones_cobro where cobro_id = c.id) i on true
   where c.anulado_en is null
   group by c.cliente_id
)
select cl.id as cliente_id, cl.razon_social, cl.condicion_iva,
       coalesce(f.facturado, 0) as facturado,
       coalesce(c.cobrado, 0)   as cobrado,
       coalesce(f.facturado, 0) - coalesce(c.cobrado, 0) as saldo,
       coalesce(f.pendiente, 0) as facturas_pendientes,
       coalesce(c.sin_imputar, 0) as cobrado_sin_imputar,
       coalesce(f.a_30, 0) as a_30, coalesce(f.a_60, 0) as a_60, coalesce(f.a_90, 0) as a_90,
       coalesce(f.mas_90, 0) as mas_90,
       coalesce(f.pendiente_homologacion, 0) as pendiente_homologacion
  from comercial.clientes cl
  left join fac f on f.cliente_id = cl.id
  left join cob c on c.cliente_id = cl.id
 where f.cliente_id is not null or c.cliente_id is not null;

comment on view comercial.v_saldos_clientes is
  'Por cliente: facturado (producción), cobrado, saldo, facturas pendientes por antigüedad y lo cobrado sin imputar '
  '(«cobros pendientes de facturación», §2.3).';

-- ===========================================================================
-- 3. Cash flow
-- ===========================================================================

-- Real: lo que entró y salió de verdad, por mes y cuenta. Las transferencias
-- entre cuentas propias no son flujo; las de cuentas de terceros se muestran
-- con su marca.
create view comercial.v_cash_flow_real
with (security_invoker = true) as
select date_trunc('month', m.fecha)::date as periodo, m.cuenta_id, c.nombre as cuenta, c.de_tercero,
       sum(m.importe) filter (where m.importe > 0 and m.tipo <> 'TRANSFERENCIA') as ingresos,
       -sum(m.importe) filter (where m.importe < 0 and m.tipo <> 'TRANSFERENCIA') as egresos,
       sum(m.importe) filter (where m.tipo <> 'TRANSFERENCIA') as neto
  from comercial.movimientos_fondos m
  join comercial.cuentas_fondos c on c.id = m.cuenta_id
 group by 1, 2, 3, 4;

-- Proyectado: compromisos con fecha. Cobranzas: las facturas no tienen
-- vencimiento cargado, así que van sin fecha (no se inventa un plazo).
create view comercial.v_cash_flow_proyectado
with (security_invoker = true) as
select p.vencimiento_pago as fecha, 'PAGO_PROVEEDOR' as tipo, pr.razon_social as detalle,
       -p.pendiente as importe, p.comprobante_id as origen_id
  from comercial.v_comprobantes_proveedor_pendientes p
  join gmp.proveedores pr on pr.id = p.proveedor_id
 where p.pendiente > 0
union all
select s.vencimiento, 'SOLICITUD_PAGO', s.concepto || ' — ' || s.destinatario, -s.importe, s.id
  from comercial.solicitudes_pago s
 where s.estado in ('PENDIENTE', 'APROBADA')
   -- La de un comprobante ya cuenta como pago a proveedor.
   and s.comprobante_id is null
union all
select null::date, 'COBRANZA', cl.razon_social, f.pendiente, f.factura_id
  from comercial.v_facturas_pendientes_cobro f
  join comercial.clientes cl on cl.id = f.cliente_id
 where f.pendiente > 0 and f.ambiente = 'PRODUCCION';

comment on view comercial.v_cash_flow_proyectado is
  'Compromisos futuros: pagos a proveedores por vencimiento, solicitudes de pago y cobranzas pendientes (sin fecha: '
  'las facturas no tienen vencimiento cargado). Sueldos e impuestos esperan su módulo (D-34).';

-- ===========================================================================
-- 4. Ventas y resultado mensual de gestión
-- ===========================================================================

create view comercial.v_ventas_mensuales
with (security_invoker = true) as
select date_trunc('month', f.fecha)::date as periodo, f.cliente_id, cl.razon_social as cliente, f.ambiente::text as ambiente,
       count(*) as facturas, sum(f.importe_neto) as neto, sum(f.importe_iva) as iva, sum(f.importe_total) as total
  from comercial.facturas f
  join comercial.clientes cl on cl.id = f.cliente_id
 where f.estado = 'AUTORIZADA'
 group by 1, 2, 3, 4;

create view comercial.v_resultado_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', fecha)::date as periodo, sum(importe_neto) as ventas_netas
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
  select date_trunc('month', fecha)::date as periodo, -sum(importe) as otros_egresos
    from comercial.movimientos_fondos
   where tipo in ('EGRESO', 'AJUSTE') and importe < 0 and pago_id is null and cobro_id is null and anula_a_id is null
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

comment on view comercial.v_resultado_mensual is
  'Resultado de gestión por mes: ventas netas facturadas − compras netas − otros egresos de fondos. No es un estado '
  'contable (sin costo de lo vendido ni devengamiento: D-34, D-36).';

-- ===========================================================================
-- 5. RLS, grants y auditoría
-- ===========================================================================

alter table comercial.cobros_cliente     enable row level security;
alter table comercial.cobros_cliente     force  row level security;
alter table comercial.imputaciones_cobro enable row level security;
alter table comercial.imputaciones_cobro force  row level security;

grant select, insert, update on comercial.cobros_cliente to authenticated;
grant select, insert on comercial.imputaciones_cobro to authenticated;
grant select on comercial.v_facturas_pendientes_cobro, comercial.v_cuenta_corriente_clientes,
                comercial.v_saldos_clientes, comercial.v_cash_flow_real, comercial.v_cash_flow_proyectado,
                comercial.v_ventas_mensuales, comercial.v_resultado_mensual to authenticated;
grant execute on function comercial.registrar_cobro_cliente(uuid, uuid, numeric, comercial.medio_pago_enum, jsonb, date, text, text),
                          comercial.anular_cobro_cliente(uuid, text) to authenticated;

create policy cobros_cliente_select_administracion on comercial.cobros_cliente
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy cobros_cliente_insert_administracion on comercial.cobros_cliente
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
create policy cobros_cliente_update_administracion on comercial.cobros_cliente
  for update to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA'));
comment on policy cobros_cliente_insert_administracion on comercial.cobros_cliente is
  '§2.3 del documento: cobros. Administración y Gerencia; Ventas cuando exista su rol (ítem 8 de la cola).';
comment on policy cobros_cliente_update_administracion on comercial.cobros_cliente is
  'Solo la anulación (trigger).';

create policy imputaciones_cobro_select_administracion on comercial.imputaciones_cobro
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy imputaciones_cobro_insert_administracion on comercial.imputaciones_cobro
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
comment on policy imputaciones_cobro_insert_administracion on comercial.imputaciones_cobro is
  'RN-63 en el trigger. Append-only.';

select core.adjuntar_auditoria('comercial.cobros_cliente');
select core.adjuntar_auditoria('comercial.imputaciones_cobro');
