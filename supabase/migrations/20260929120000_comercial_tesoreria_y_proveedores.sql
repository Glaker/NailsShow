-- ---------------------------------------------------------------------------
-- Propósito : Etapa 1 del módulo de Administración: cajas y bancos (con
--             cuentas de terceros identificadas y conciliación), cuenta
--             corriente de proveedores (comprobantes, pagos, imputaciones,
--             conciliación contra el saldo que informa el proveedor),
--             solicitudes de pago de todas las áreas, IVA Compras contra IVA
--             Ventas por mes y la traza de cada compra de Producción.
-- Reglas    : RN-63 (la imputación no supera el saldo del comprobante), RN-65
--             (recepción física y fiscal vinculadas), RN-50 (auditoría),
--             §4.12.4 del alcance (cuenta corriente). Documento de
--             requerimientos de Administración §2.2, §2.3, §2.4, §4 (ítems 23
--             y 24 de la cola; D-34 para lo que no está en el alcance).
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- UN DATO SE CARGA UNA VEZ (§4 del documento).
--   compra (avisos_compra) → recepción → comprobante del proveedor
--   → pago con imputación → movimiento de la caja o el banco.
-- El pago genera su egreso solo: nadie lo vuelve a cargar en tesorería.
--
-- NADA SE EDITA NI SE BORRA.
-- Movimientos de fondos, pagos, imputaciones y conciliaciones son
-- append-only. Un movimiento se anula con su inverso; un pago se anula con
-- motivo y genera el contramovimiento. Mismo criterio que el stock (RN-54).
--
-- QUIÉN VE LA PLATA.
-- Tesorería y cuentas corrientes: Administración y Gerencia (§5 del
-- documento). Las solicitudes de pago las carga cualquier área y cada una ve
-- las suyas; Administración las ve todas.

-- ===========================================================================
-- 1. Cajas y bancos
-- ===========================================================================

create type comercial.tipo_cuenta_fondos_enum as enum ('CAJA', 'BANCO', 'BILLETERA');
create type comercial.tipo_movimiento_fondos_enum as enum ('INGRESO', 'EGRESO', 'TRANSFERENCIA', 'AJUSTE');
create type comercial.medio_pago_enum as enum ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA', 'OTRO');

create table comercial.cuentas_fondos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (length(btrim(nombre)) > 0),
  tipo        comercial.tipo_cuenta_fondos_enum not null,
  banco       text,
  numero      text,
  -- §2.3 del documento: operaciones de Nail Show por cajas o cuentas de
  -- terceros, identificadas aparte para poder auditarlas.
  de_tercero  boolean not null default false,
  titular     text,
  moneda      text not null default 'ARS' check (moneda ~ '^[A-Z]{3}$'),
  activo      boolean not null default true,
  creado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en   timestamptz not null default now(),
  constraint cuentas_fondos_tercero_con_titular check (
    not de_tercero or length(btrim(coalesce(titular, ''))) > 0
  )
);

comment on table comercial.cuentas_fondos is
  'Cajas, cuentas bancarias y billeteras. de_tercero marca las cuentas que no son de Nail Show pero por las que pasan '
  'operaciones suyas (§2.3 del documento de Administración).';

create table comercial.movimientos_fondos (
  id                  uuid primary key default gen_random_uuid(),
  orden               bigint generated always as identity,
  cuenta_id           uuid not null references comercial.cuentas_fondos(id),
  fecha               date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  tipo                comercial.tipo_movimiento_fondos_enum not null,
  -- Con signo, como el stock: positivo entra, negativo sale.
  importe             numeric(16,2) not null check (importe <> 0),
  concepto            text not null check (length(btrim(concepto)) > 0),
  comprobante         text,
  contraparte         text,
  pago_id             uuid,
  solicitud_id        uuid,
  transferencia_grupo uuid,
  anula_a_id          uuid unique references comercial.movimientos_fondos(id),
  registrado_por      uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en       timestamptz not null default now(),
  constraint movimientos_fondos_signo check (
    (tipo = 'INGRESO' and (importe > 0 or anula_a_id is not null))
    or (tipo = 'EGRESO' and (importe < 0 or anula_a_id is not null))
    or tipo in ('TRANSFERENCIA', 'AJUSTE')
  ),
  constraint movimientos_fondos_transferencia_agrupada check (
    tipo <> 'TRANSFERENCIA' or transferencia_grupo is not null
  )
);

comment on table comercial.movimientos_fondos is
  'Libro de caja y bancos. Append-only: un movimiento se corrige con su inverso (anula_a_id). Los pagos a proveedores '
  'generan su egreso solos.';

create index movimientos_fondos_cuenta_idx on comercial.movimientos_fondos (cuenta_id, fecha);


create or replace function comercial.saldo_fondos(p_cuenta_id uuid, p_hasta date default null)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(importe), 0) from comercial.movimientos_fondos
   where cuenta_id = p_cuenta_id and (p_hasta is null or fecha <= p_hasta);
$$;

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
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, anula_a_id, transferencia_grupo)
  values (v.cuenta_id, v.tipo, -v.importe, format('Anula: %s — %s', v.concepto, btrim(p_motivo)), v.id,
          v.transferencia_grupo)
  returning id into v_n;
  return v_n;
end;
$$;

create or replace function comercial.transferir_fondos(
  p_origen uuid, p_destino uuid, p_importe numeric, p_concepto text, p_fecha date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_grupo uuid := gen_random_uuid();
begin
  if p_importe is null or p_importe <= 0 then
    raise exception 'El importe a transferir tiene que ser positivo.' using errcode = 'check_violation';
  end if;
  if p_origen = p_destino then
    raise exception 'La transferencia es entre dos cuentas distintas.' using errcode = 'check_violation';
  end if;
  insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto, transferencia_grupo)
  values (p_origen,  coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
          'TRANSFERENCIA', -p_importe, coalesce(nullif(btrim(p_concepto), ''), 'Transferencia'), v_grupo),
         (p_destino, coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date),
          'TRANSFERENCIA',  p_importe, coalesce(nullif(btrim(p_concepto), ''), 'Transferencia'), v_grupo);
  return v_grupo;
end;
$$;

-- Conciliación: saldo real contra saldo del sistema a una fecha (§2.3).
create table comercial.conciliaciones_fondos (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references comercial.cuentas_fondos(id),
  fecha          date not null,
  saldo_real     numeric(16,2) not null,
  saldo_sistema  numeric(16,2) not null,
  diferencia     numeric(16,2) generated always as (saldo_real - saldo_sistema) stored,
  observacion    text,
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now(),
  constraint conciliaciones_fondos_diferencia_explicada check (
    saldo_real = saldo_sistema or length(btrim(coalesce(observacion, ''))) > 0
  )
);

comment on table comercial.conciliaciones_fondos is
  'Saldo real (extracto, arqueo) contra el del sistema a una fecha. Una diferencia exige explicación. Append-only.';

-- El saldo del sistema lo pone la base, no el que concilia.
create or replace function comercial.fn_conciliacion_fondos_saldo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.saldo_sistema := comercial.saldo_fondos(new.cuenta_id, new.fecha);
  return new;
end;
$$;

create trigger trg_conciliacion_fondos_saldo
  before insert on comercial.conciliaciones_fondos
  for each row execute function comercial.fn_conciliacion_fondos_saldo();

create view comercial.v_saldos_fondos
with (security_invoker = true) as
select c.id as cuenta_id, c.nombre, c.tipo, c.banco, c.numero, c.de_tercero, c.titular, c.moneda, c.activo,
       coalesce(sum(m.importe), 0)                         as saldo,
       max(m.fecha)                                        as ultimo_movimiento,
       (select max(k.fecha) from comercial.conciliaciones_fondos k where k.cuenta_id = c.id) as ultima_conciliacion
  from comercial.cuentas_fondos c
  left join comercial.movimientos_fondos m on m.cuenta_id = c.id
 group by c.id;

-- ===========================================================================
-- 2. Pagos a proveedores e imputaciones
-- ===========================================================================

create table comercial.pagos_proveedor (
  id               uuid primary key default gen_random_uuid(),
  proveedor_id     uuid not null references gmp.proveedores(id),
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
  constraint pagos_proveedor_anulacion check (
    (anulado_en is null and anulado_por is null and motivo_anulacion is null)
    or (anulado_en is not null and anulado_por is not null and length(btrim(coalesce(motivo_anulacion, ''))) > 0)
  )
);

comment on table comercial.pagos_proveedor is
  'Pagos a proveedores. Cada pago genera su egreso en la caja o el banco (movimientos_fondos.pago_id). No se edita: '
  'se anula con motivo y el egreso se revierte.';

alter table comercial.movimientos_fondos
  add constraint movimientos_fondos_pago_fk foreign key (pago_id) references comercial.pagos_proveedor(id);

create table comercial.imputaciones_pago (
  id             uuid primary key default gen_random_uuid(),
  pago_id        uuid not null references comercial.pagos_proveedor(id),
  comprobante_id uuid not null references comercial.comprobantes_proveedor(id),
  importe        numeric(16,2) not null check (importe > 0),
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now(),
  unique (pago_id, comprobante_id)
);

comment on table comercial.imputaciones_pago is
  'Qué comprobantes cancela cada pago (RN-63: no más que su saldo). Lo no imputado queda «a cuenta».';

-- Lo que falta pagar de cada comprobante: total − notas de crédito − imputado.
create view comercial.v_comprobantes_proveedor_pendientes
with (security_invoker = true) as
select c.id as comprobante_id, c.proveedor_id, c.tipo, c.punto_venta, c.numero, c.fecha, c.vencimiento_pago,
       c.recepcion_id, c.importe_total,
       coalesce(nc.total, 0)   as notas_credito,
       coalesce(im.total, 0)   as imputado,
       greatest(c.importe_total - coalesce(nc.total, 0) - coalesce(im.total, 0), 0) as pendiente
  from comercial.comprobantes_proveedor c
  left join lateral (
    select sum(n.importe_total) as total from comercial.comprobantes_proveedor n
     where n.comprobante_asociado_id = c.id and n.anulado_en is null
  ) nc on true
  left join lateral (
    select sum(i.importe) as total from comercial.imputaciones_pago i
      join comercial.pagos_proveedor p on p.id = i.pago_id and p.anulado_en is null
     where i.comprobante_id = c.id
  ) im on true
 where c.anulado_en is null
   and c.importe_total is not null
   and c.tipo::text not like 'NOTA_CREDITO%';

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
  select * into v_pago from comercial.pagos_proveedor where id = new.pago_id;
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

create trigger trg_validar_imputacion_pago
  before insert on comercial.imputaciones_pago
  for each row execute function comercial.fn_validar_imputacion_pago();

-- El pago genera su egreso; su anulación, el contramovimiento.
create or replace function comercial.fn_pago_proveedor_fondos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prov text;
  v_mov  comercial.movimientos_fondos%rowtype;
begin
  select razon_social into v_prov from gmp.proveedores where id = new.proveedor_id;
  if tg_op = 'INSERT' then
    insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto, comprobante, contraparte, pago_id)
    values (new.cuenta_id, new.fecha, 'EGRESO', -new.importe, format('Pago a %s', v_prov), new.referencia, v_prov, new.id);
    return new;
  end if;

  -- UPDATE: solo la anulación, una vez.
  if old.anulado_en is not null then
    raise exception 'El pago ya está anulado.' using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - array['anulado_en','anulado_por','motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulado_en','anulado_por','motivo_anulacion']) then
    raise exception 'Un pago no se edita: se anula con motivo y se carga el correcto.' using errcode = 'restrict_violation';
  end if;
  select * into v_mov from comercial.movimientos_fondos where pago_id = new.id and anula_a_id is null;
  insert into comercial.movimientos_fondos (cuenta_id, tipo, importe, concepto, contraparte, pago_id, anula_a_id)
  values (v_mov.cuenta_id, 'EGRESO', -v_mov.importe, format('Anula pago a %s — %s', v_prov, new.motivo_anulacion),
          v_prov, new.id, v_mov.id);
  return new;
end;
$$;

create trigger trg_pago_proveedor_fondos
  after insert or update on comercial.pagos_proveedor
  for each row execute function comercial.fn_pago_proveedor_fondos();

create or replace function comercial.anular_pago_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update comercial.pagos_proveedor
     set anulado_en = now(), anulado_por = core.usuario_actual(), motivo_anulacion = btrim(p_motivo)
   where id = p_id;
  if not found then
    raise exception 'El pago no existe o tu rol no puede anularlo.';
  end if;
end;
$$;

-- ===========================================================================
-- 3. Solicitudes de pago de todas las áreas (§2.2)
-- ===========================================================================

create type comercial.estado_solicitud_pago_enum as enum ('PENDIENTE', 'APROBADA', 'PAGADA', 'RECHAZADA', 'ANULADA');

create table comercial.solicitudes_pago (
  id              uuid primary key default gen_random_uuid(),
  solicitante     uuid not null references core.usuarios(id) default core.usuario_actual(),
  area            core.sector_enum not null,
  concepto        text not null check (length(btrim(concepto)) > 0),
  destinatario    text not null check (length(btrim(destinatario)) > 0),
  proveedor_id    uuid references gmp.proveedores(id),
  comprobante_id  uuid references comercial.comprobantes_proveedor(id),
  importe         numeric(16,2) not null check (importe > 0),
  vencimiento     date,
  medio_pago      comercial.medio_pago_enum,
  estado          comercial.estado_solicitud_pago_enum not null default 'PENDIENTE',
  resuelto_por    uuid references core.usuarios(id),
  resuelto_en     timestamptz,
  motivo          text,
  pago_id         uuid references comercial.pagos_proveedor(id),
  movimiento_id   uuid references comercial.movimientos_fondos(id),
  creado_en       timestamptz not null default now(),
  constraint solicitudes_pago_resuelta check (
    estado = 'PENDIENTE' or (resuelto_por is not null and resuelto_en is not null)
  ),
  constraint solicitudes_pago_rechazo_motivado check (
    estado not in ('RECHAZADA', 'ANULADA') or length(btrim(coalesce(motivo, ''))) > 0
  ),
  constraint solicitudes_pago_pagada check (
    estado <> 'PAGADA' or num_nonnulls(pago_id, movimiento_id) = 1
  )
);

comment on table comercial.solicitudes_pago is
  'Pedidos de pago de cualquier área, con solicitante, concepto, destinatario, importe, vencimiento, medio y estado '
  '(§2.2 del documento de Administración). Se pagan con un pago a proveedor o con un egreso de caja.';

alter table comercial.movimientos_fondos
  add constraint movimientos_fondos_solicitud_fk foreign key (solicitud_id) references comercial.solicitudes_pago(id);

create or replace function comercial.fn_solicitud_pago_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin boolean := core.es_rol('ADMINISTRACION', 'GERENCIA');
begin
  if (to_jsonb(new) - array['estado','resuelto_por','resuelto_en','motivo','pago_id','movimiento_id'])
     is distinct from (to_jsonb(old) - array['estado','resuelto_por','resuelto_en','motivo','pago_id','movimiento_id']) then
    raise exception 'Una solicitud no se edita: se anula y se carga otra.' using errcode = 'restrict_violation';
  end if;
  if new.estado = old.estado then
    raise exception 'La solicitud ya está %.', lower(old.estado::text) using errcode = 'check_violation';
  end if;
  if not (
       (old.estado = 'PENDIENTE' and new.estado in ('APROBADA', 'RECHAZADA', 'ANULADA'))
    or (old.estado = 'APROBADA'  and new.estado in ('PAGADA', 'ANULADA'))
  ) then
    raise exception 'Una solicitud no pasa de % a %.', old.estado, new.estado using errcode = 'check_violation';
  end if;
  -- Quien la pidió puede anularla mientras esté pendiente; lo demás es de
  -- Administración.
  if not v_admin and not (new.estado = 'ANULADA' and old.estado = 'PENDIENTE'
                          and old.solicitante = core.usuario_actual()) then
    raise exception 'Aprobar, rechazar y pagar solicitudes es de Administración.' using errcode = 'insufficient_privilege';
  end if;
  new.resuelto_por := core.usuario_actual();
  new.resuelto_en  := now();
  return new;
end;
$$;

create trigger trg_solicitud_pago_transicion
  before update on comercial.solicitudes_pago
  for each row execute function comercial.fn_solicitud_pago_transicion();

-- ===========================================================================
-- 4. Registrar un pago en un solo paso: pago, imputaciones, egreso, solicitud
-- ===========================================================================

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
  e      record;
begin
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
    if not found then
      raise exception 'La solicitud no existe.';
    end if;
  end if;
  return v_pago;
end;
$$;

comment on function comercial.registrar_pago_proveedor(uuid, uuid, numeric, comercial.medio_pago_enum, jsonb, date, text, text, uuid) is
  'Pago a proveedor con sus imputaciones [{comprobante_id, importe}], el egreso de fondos (lo genera el trigger) y, si '
  'viene de una solicitud, la marca pagada. Todo o nada. SECURITY INVOKER: rigen las políticas.';

-- Una solicitud sin proveedor (servicio, sueldo, gasto) se paga con un egreso.
create or replace function comercial.pagar_solicitud_con_egreso(
  p_solicitud_id uuid, p_cuenta_id uuid, p_fecha date default null, p_comprobante text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_s   comercial.solicitudes_pago%rowtype;
  v_mov uuid;
begin
  select * into v_s from comercial.solicitudes_pago where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud no existe.';
  end if;
  if v_s.proveedor_id is not null then
    raise exception 'Es un pago a proveedor: registralo como pago, para que baje su cuenta corriente.'
      using errcode = 'check_violation';
  end if;
  insert into comercial.movimientos_fondos (cuenta_id, fecha, tipo, importe, concepto, comprobante, contraparte, solicitud_id)
  values (p_cuenta_id, coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date), 'EGRESO',
          -v_s.importe, v_s.concepto, nullif(btrim(p_comprobante), ''), v_s.destinatario, v_s.id)
  returning id into v_mov;
  update comercial.solicitudes_pago set estado = 'PAGADA', movimiento_id = v_mov where id = p_solicitud_id;
  return v_mov;
end;
$$;

-- ===========================================================================
-- 5. Cuenta corriente de proveedores y conciliación contra su saldo
-- ===========================================================================

create view comercial.v_cuenta_corriente_proveedores
with (security_invoker = true) as
select c.proveedor_id, c.fecha, c.registrado_en as momento,
       case when c.tipo::text like 'NOTA_CREDITO%' then 'NOTA_CREDITO' else 'COMPROBANTE' end as movimiento,
       c.tipo::text as detalle_tipo,
       case when c.punto_venta is null then 'solo remito'
            else lpad(c.punto_venta::text, 4, '0') || '-' || lpad(c.numero::text, 8, '0') end as referencia,
       c.id as comprobante_id, null::uuid as pago_id,
       case when c.tipo::text like 'NOTA_CREDITO%' then 0 else c.importe_total end as debe,
       case when c.tipo::text like 'NOTA_CREDITO%' then c.importe_total else 0 end as haber,
       c.vencimiento_pago
  from comercial.comprobantes_proveedor c
 where c.anulado_en is null and c.importe_total is not null and c.importe_total > 0
union all
select p.proveedor_id, p.fecha, p.registrado_en, 'PAGO', p.medio::text, coalesce(p.referencia, ''),
       null, p.id, 0, p.importe, null
  from comercial.pagos_proveedor p
 where p.anulado_en is null;

comment on view comercial.v_cuenta_corriente_proveedores is
  'Cuenta corriente por proveedor: comprobantes al debe, notas de crédito y pagos al haber. Sin anulados.';

create table comercial.conciliaciones_proveedor (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references gmp.proveedores(id),
  fecha           date not null,
  saldo_informado numeric(16,2) not null,
  saldo_sistema   numeric(16,2) not null,
  diferencia      numeric(16,2) generated always as (saldo_informado - saldo_sistema) stored,
  observacion     text,
  registrado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en   timestamptz not null default now(),
  constraint conciliaciones_proveedor_diferencia_explicada check (
    saldo_informado = saldo_sistema or length(btrim(coalesce(observacion, ''))) > 0
  )
);

comment on table comercial.conciliaciones_proveedor is
  'Saldo que informa el proveedor contra el de su cuenta corriente a una fecha (§2.2). Append-only.';

create or replace function comercial.fn_conciliacion_proveedor_saldo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(sum(debe - haber), 0) into new.saldo_sistema
    from comercial.v_cuenta_corriente_proveedores
   where proveedor_id = new.proveedor_id and fecha <= new.fecha;
  return new;
end;
$$;

create trigger trg_conciliacion_proveedor_saldo
  before insert on comercial.conciliaciones_proveedor
  for each row execute function comercial.fn_conciliacion_proveedor_saldo();

create view comercial.v_saldos_proveedores
with (security_invoker = true) as
with cc as (
  select proveedor_id, sum(debe) as debe, sum(haber) as haber from comercial.v_cuenta_corriente_proveedores
   group by proveedor_id
),
pend as (
  select proveedor_id,
         sum(pendiente) as pendiente_comprobantes,
         sum(pendiente) filter (where vencimiento_pago < (now() at time zone 'America/Argentina/Buenos_Aires')::date) as vencido,
         min(vencimiento_pago) filter (where pendiente > 0) as proximo_vencimiento
    from comercial.v_comprobantes_proveedor_pendientes
   group by proveedor_id
),
conc as (
  select distinct on (proveedor_id) proveedor_id, fecha, saldo_informado, diferencia
    from comercial.conciliaciones_proveedor
   order by proveedor_id, fecha desc, registrado_en desc
)
select pr.id as proveedor_id, pr.razon_social, pr.cuit,
       coalesce(cc.debe, 0) as debe, coalesce(cc.haber, 0) as haber,
       coalesce(cc.debe, 0) - coalesce(cc.haber, 0) as saldo,
       coalesce(pe.vencido, 0) as vencido,
       pe.proximo_vencimiento,
       co.fecha as conciliado_al, co.saldo_informado, co.diferencia as diferencia_conciliacion
  from gmp.proveedores pr
  left join cc   on cc.proveedor_id = pr.id
  left join pend pe on pe.proveedor_id = pr.id
  left join conc co on co.proveedor_id = pr.id
 where cc.proveedor_id is not null or co.proveedor_id is not null;

comment on view comercial.v_saldos_proveedores is
  'Saldo por proveedor, lo vencido, el próximo vencimiento y la última conciliación contra su saldo informado.';

-- ===========================================================================
-- 6. IVA Compras contra IVA Ventas, por mes (§2.4)
-- ===========================================================================

create view comercial.v_iva_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', f.fecha)::date as periodo,
         sum(f.importe_iva) filter (where f.ambiente = 'PRODUCCION')   as debito,
         sum(f.importe_iva) filter (where f.ambiente = 'HOMOLOGACION') as debito_homologacion,
         sum(f.importe_neto) filter (where f.ambiente = 'PRODUCCION')  as neto_ventas
    from comercial.facturas f
   where f.estado = 'AUTORIZADA'
   group by 1
),
compras as (
  select date_trunc('month', c.fecha)::date as periodo,
         sum(case when c.tipo = 'FACTURA_A' then c.importe_iva
                  when c.tipo = 'NOTA_CREDITO_A' then -c.importe_iva else 0 end) as credito,
         sum(case when c.tipo in ('FACTURA_A') then c.importe_neto
                  when c.tipo = 'NOTA_CREDITO_A' then -c.importe_neto else 0 end) as neto_compras_a,
         sum(c.importe_total) filter (where c.tipo in ('FACTURA_B', 'FACTURA_C')) as compras_sin_iva_discriminado,
         sum(c.importe_total) filter (where c.tipo = 'SIN_FACTURA')             as compras_sin_factura
    from comercial.comprobantes_proveedor c
   where c.anulado_en is null
   group by 1
)
select coalesce(v.periodo, c.periodo) as periodo,
       coalesce(v.debito, 0)                         as debito_fiscal,
       coalesce(c.credito, 0)                        as credito_fiscal,
       coalesce(v.debito, 0) - coalesce(c.credito, 0) as posicion,
       coalesce(v.neto_ventas, 0)                    as neto_ventas,
       coalesce(c.neto_compras_a, 0)                 as neto_compras_a,
       coalesce(c.compras_sin_iva_discriminado, 0)   as compras_sin_iva_discriminado,
       coalesce(c.compras_sin_factura, 0)            as compras_sin_factura,
       coalesce(v.debito_homologacion, 0)            as debito_homologacion
  from ventas v
  full join compras c on c.periodo = v.periodo;

comment on view comercial.v_iva_mensual is
  'Débito fiscal (facturas autorizadas en producción) contra crédito fiscal (facturas y NC A de proveedores) por mes. '
  'Estimación de gestión para anticipar la posición; la liquidación la hace el estudio contable. Las facturas de '
  'homologación se muestran aparte y no cuentan.';

-- ===========================================================================
-- 7. Traza de cada compra de Producción (§2.2 «Compras productivas», §4)
-- ===========================================================================

create view comercial.v_compras_trazadas
with (security_invoker = true) as
select a.id as aviso_id, a.estado, a.insumo_id, i.codigo_interno, i.nombre as insumo, a.cantidad, a.unidad,
       a.creado_en as pedida_en, a.pedido_id,
       coalesce(r.proveedor_id, a.proveedor_id) as proveedor_id,
       pr.razon_social as proveedor,
       a.recepcion_id, r.numero as recepcion_numero, r.fecha_hora as recibida_en,
       cp.comprobante_id, cp.tipo as comprobante_tipo, cp.importe_total, cp.pendiente,
       case
         when a.estado = 'DESCARTADO' then 'DESCARTADA'
         when a.recepcion_id is null then 'SIN_RECIBIR'
         when cp.comprobante_id is null then 'SIN_COMPROBANTE'
         when cp.pendiente > 0 then 'IMPAGA'
         else 'CERRADA'
       end as situacion
  from comercial.avisos_compra a
  join gmp.insumos_catalogo i on i.id = a.insumo_id
  left join gmp.recepciones r on r.id = a.recepcion_id
  left join gmp.proveedores pr on pr.id = coalesce(r.proveedor_id, a.proveedor_id)
  left join lateral (
    select p.comprobante_id, p.tipo, p.importe_total, p.pendiente
      from comercial.v_comprobantes_proveedor_pendientes p
     where p.recepcion_id = a.recepcion_id
     order by p.fecha desc
     limit 1
  ) cp on true
 union all
select null, null, null, null, null, null, null, null, null,
       c.proveedor_id, pr.razon_social, c.recepcion_id, r.numero, r.fecha_hora,
       c.id, c.tipo, c.importe_total, p.pendiente, 'SIN_COMPRA'
  from comercial.comprobantes_proveedor c
  join gmp.recepciones r on r.id = c.recepcion_id
  join gmp.proveedores pr on pr.id = c.proveedor_id
  left join comercial.v_comprobantes_proveedor_pendientes p on p.comprobante_id = c.id
 where c.anulado_en is null
   and not exists (select 1 from comercial.avisos_compra a where a.recepcion_id = c.recepcion_id);

comment on view comercial.v_compras_trazadas is
  'Cada compra anotada por Producción con su recepción, comprobante y lo que falta pagar, y en qué situación está. '
  'También las recepciones con comprobante que no salieron de una compra anotada (SIN_COMPRA).';

-- ===========================================================================
-- 8. RLS, grants y auditoría
-- ===========================================================================

alter table comercial.cuentas_fondos          enable row level security;
alter table comercial.cuentas_fondos          force  row level security;
alter table comercial.movimientos_fondos      enable row level security;
alter table comercial.movimientos_fondos      force  row level security;
alter table comercial.conciliaciones_fondos   enable row level security;
alter table comercial.conciliaciones_fondos   force  row level security;
alter table comercial.pagos_proveedor         enable row level security;
alter table comercial.pagos_proveedor         force  row level security;
alter table comercial.imputaciones_pago       enable row level security;
alter table comercial.imputaciones_pago       force  row level security;
alter table comercial.solicitudes_pago        enable row level security;
alter table comercial.solicitudes_pago        force  row level security;
alter table comercial.conciliaciones_proveedor enable row level security;
alter table comercial.conciliaciones_proveedor force  row level security;

grant select, insert, update on comercial.cuentas_fondos to authenticated;
grant select, insert        on comercial.movimientos_fondos, comercial.conciliaciones_fondos,
                               comercial.imputaciones_pago, comercial.conciliaciones_proveedor to authenticated;
grant select, insert, update on comercial.pagos_proveedor, comercial.solicitudes_pago to authenticated;
grant select on comercial.v_saldos_fondos, comercial.v_comprobantes_proveedor_pendientes,
                comercial.v_cuenta_corriente_proveedores, comercial.v_saldos_proveedores,
                comercial.v_iva_mensual, comercial.v_compras_trazadas to authenticated;
grant execute on function comercial.saldo_fondos(uuid, date),
                          comercial.anular_movimiento_fondos(uuid, text),
                          comercial.transferir_fondos(uuid, uuid, numeric, text, date),
                          comercial.anular_pago_proveedor(uuid, text),
                          comercial.registrar_pago_proveedor(uuid, uuid, numeric, comercial.medio_pago_enum, jsonb, date, text, text, uuid),
                          comercial.pagar_solicitud_con_egreso(uuid, uuid, date, text) to authenticated;

-- Tesorería y cuentas corrientes: Administración y Gerencia.
create policy cuentas_fondos_select_administracion on comercial.cuentas_fondos
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy cuentas_fondos_insert_administracion on comercial.cuentas_fondos
  for insert to authenticated with check (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy cuentas_fondos_update_administracion on comercial.cuentas_fondos
  for update to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA'));
comment on policy cuentas_fondos_select_administracion on comercial.cuentas_fondos is
  '§5 del documento de Administración: tesorería la ven Administración y Dirección (GERENCIA).';

create policy movimientos_fondos_select_administracion on comercial.movimientos_fondos
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy movimientos_fondos_insert_administracion on comercial.movimientos_fondos
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
comment on policy movimientos_fondos_insert_administracion on comercial.movimientos_fondos is
  'Movimientos de caja y banco: Administración y Gerencia, a su nombre. Sin UPDATE ni DELETE: append-only.';

create policy conciliaciones_fondos_select_administracion on comercial.conciliaciones_fondos
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy conciliaciones_fondos_insert_administracion on comercial.conciliaciones_fondos
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
comment on policy conciliaciones_fondos_insert_administracion on comercial.conciliaciones_fondos is
  '§2.3: conciliación de cajas y bancos. Append-only.';

create policy pagos_proveedor_select_administracion on comercial.pagos_proveedor
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy pagos_proveedor_insert_administracion on comercial.pagos_proveedor
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
create policy pagos_proveedor_update_administracion on comercial.pagos_proveedor
  for update to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA'));
comment on policy pagos_proveedor_update_administracion on comercial.pagos_proveedor is
  'Solo la anulación (trigger): nada más cambia.';

create policy imputaciones_pago_select_administracion on comercial.imputaciones_pago
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy imputaciones_pago_insert_administracion on comercial.imputaciones_pago
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
comment on policy imputaciones_pago_insert_administracion on comercial.imputaciones_pago is
  'RN-63 en el trigger. Append-only.';

create policy conciliaciones_proveedor_select_administracion on comercial.conciliaciones_proveedor
  for select to authenticated using (core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy conciliaciones_proveedor_insert_administracion on comercial.conciliaciones_proveedor
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA') and registrado_por = core.usuario_actual());
comment on policy conciliaciones_proveedor_insert_administracion on comercial.conciliaciones_proveedor is
  '§2.2: conciliación contra el saldo que informa el proveedor. Append-only.';

-- Solicitudes: cualquier área pide; cada uno ve las suyas; Administración todas.
create policy solicitudes_pago_select_propias on comercial.solicitudes_pago
  for select to authenticated
  using (solicitante = core.usuario_actual() or core.es_rol('ADMINISTRACION', 'GERENCIA'));
create policy solicitudes_pago_insert_cualquier_area on comercial.solicitudes_pago
  for insert to authenticated
  with check (core.rol() is not null and solicitante = core.usuario_actual() and estado = 'PENDIENTE');
create policy solicitudes_pago_update_resolucion on comercial.solicitudes_pago
  for update to authenticated
  using (solicitante = core.usuario_actual() or core.es_rol('ADMINISTRACION', 'GERENCIA'))
  with check (solicitante = core.usuario_actual() or core.es_rol('ADMINISTRACION', 'GERENCIA'));
comment on policy solicitudes_pago_insert_cualquier_area on comercial.solicitudes_pago is
  '§2.2: solicitudes de todas las áreas. Nace pendiente y a nombre de quien la carga.';
comment on policy solicitudes_pago_update_resolucion on comercial.solicitudes_pago is
  'Transiciones en el trigger: el solicitante solo anula la suya pendiente; aprobar, rechazar y pagar es de Administración.';

select core.adjuntar_auditoria('comercial.cuentas_fondos');
select core.adjuntar_auditoria('comercial.movimientos_fondos');
select core.adjuntar_auditoria('comercial.conciliaciones_fondos');
select core.adjuntar_auditoria('comercial.pagos_proveedor');
select core.adjuntar_auditoria('comercial.imputaciones_pago');
select core.adjuntar_auditoria('comercial.solicitudes_pago');
select core.adjuntar_auditoria('comercial.conciliaciones_proveedor');
