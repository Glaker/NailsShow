-- ---------------------------------------------------------------------------
-- Propósito : Comprobante que trae el proveedor con la mercadería: Factura A,
--             B o C, nota de crédito, o sin factura (solo remito). Es la
--             recepción fiscal, separada de la física y vinculada a ella, y la
--             semilla de la cuenta corriente del proveedor y del IVA Compras.
-- Reglas    : RN-65 (recepción física y fiscal son registros separados y
--             vinculados), §2.4 del alcance, RN-50 (auditoría), invariante 7
--             (vive en comercial y apunta a gmp). Ítem 18 de la cola
--             (2026-09-29).
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- «SIN FACTURA» SE REGISTRA, NO SE ESCONDE.
-- Se pidió poder marcar en la recepción si vino con factura o no. El material
-- entra igual al circuito regulado (el remito es el documento de la recepción
-- física) y el comprobante queda con tipo SIN_FACTURA, visible para
-- Administración y para auditoría como cualquier otro. No tiene IVA
-- discriminado, así que no computa crédito fiscal. No hay circuito paralelo ni
-- filas que un rol vea y otro no: mismo criterio que el ítem 16 de la cola.
--
-- POR QUÉ NO UNA COLUMNA EN gmp.recepciones.
-- La recepción física es regulada (I.20.1) y la fiscal es comercial; tienen
-- momentos y responsables distintos (el insumo puede estar en cuarentena con
-- la factura ya contabilizada, y al revés). Además, invariante 7: gmp no puede
-- apuntar a comercial. La factura puede llegar después, o no tener recepción
-- (un servicio): por eso recepcion_id es opcional.
--
-- CORRECCIÓN. Un comprobante mal cargado no se edita: se anula con motivo
-- (queda la fila, con quién y cuándo) y se carga el correcto.

create type comercial.tipo_comprobante_proveedor_enum as enum (
  'FACTURA_A', 'FACTURA_B', 'FACTURA_C',
  'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C',
  'SIN_FACTURA'
);

create table comercial.comprobantes_proveedor (
  id               uuid primary key default gen_random_uuid(),
  proveedor_id     uuid not null references gmp.proveedores(id),
  recepcion_id     uuid references gmp.recepciones(id),
  tipo             comercial.tipo_comprobante_proveedor_enum not null,
  punto_venta      integer check (punto_venta between 1 and 99999),
  numero           bigint check (numero between 1 and 99999999),
  fecha            date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  vencimiento_pago date,
  -- Solo las clases A discriminan IVA: neto + IVA + otros (no gravado, exento,
  -- percepciones) = total. En B, C y sin factura solo hay total.
  importe_neto     numeric(16,2) check (importe_neto >= 0),
  importe_iva      numeric(16,2) check (importe_iva >= 0),
  importe_otros    numeric(16,2) check (importe_otros >= 0),
  importe_total    numeric(16,2) check (importe_total >= 0),
  -- Nota de crédito: la factura que corrige.
  comprobante_asociado_id uuid references comercial.comprobantes_proveedor(id),
  observacion      text,
  registrado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en    timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid references core.usuarios(id),
  motivo_anulacion text,

  constraint comprobantes_proveedor_numerado check (
    (tipo = 'SIN_FACTURA' and punto_venta is null and numero is null)
    or (tipo <> 'SIN_FACTURA' and punto_venta is not null and numero is not null)
  ),
  constraint comprobantes_proveedor_con_total check (
    tipo = 'SIN_FACTURA' or importe_total > 0
  ),
  constraint comprobantes_proveedor_iva_discriminado check (
    case when tipo in ('FACTURA_A', 'NOTA_CREDITO_A')
      then importe_neto is not null and importe_iva is not null
           and importe_total = importe_neto + importe_iva + coalesce(importe_otros, 0)
      else importe_neto is null and importe_iva is null and importe_otros is null
    end
  ),
  constraint comprobantes_proveedor_nc_asociada check (
    (tipo::text like 'NOTA_CREDITO%') = (comprobante_asociado_id is not null)
  ),
  constraint comprobantes_proveedor_anulacion check (
    (anulado_en is null and anulado_por is null and motivo_anulacion is null)
    or (anulado_en is not null and anulado_por is not null
        and length(btrim(coalesce(motivo_anulacion, ''))) > 0)
  )
);

comment on table comercial.comprobantes_proveedor is
  'Comprobantes recibidos de proveedores (recepción fiscal, RN-65). SIN_FACTURA registra que la mercadería llegó solo con remito: '
  'queda visible y no computa crédito fiscal. No se editan: se anulan con motivo.';
comment on column comercial.comprobantes_proveedor.importe_iva is
  'IVA discriminado (solo clase A). Es el crédito fiscal del IVA Compras.';

-- El mismo comprobante no se carga dos veces (salvo que el anterior esté anulado).
create unique index comprobantes_proveedor_unico_idx
  on comercial.comprobantes_proveedor (proveedor_id, tipo, punto_venta, numero)
  where anulado_en is null and numero is not null;

create index comprobantes_proveedor_recepcion_idx
  on comercial.comprobantes_proveedor (recepcion_id) where recepcion_id is not null;
create index comprobantes_proveedor_proveedor_idx
  on comercial.comprobantes_proveedor (proveedor_id, fecha);

-- Coherencia que un CHECK no puede ver: proveedor de la recepción y de la
-- factura asociada.
create or replace function comercial.fn_validar_comprobante_proveedor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prov  uuid;
  v_asoc  comercial.comprobantes_proveedor%rowtype;
begin
  if new.recepcion_id is not null then
    select proveedor_id into v_prov from gmp.recepciones where id = new.recepcion_id;
    if v_prov is distinct from new.proveedor_id then
      raise exception 'El comprobante es de otro proveedor que la recepción.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.comprobante_asociado_id is not null then
    select * into v_asoc from comercial.comprobantes_proveedor where id = new.comprobante_asociado_id;
    if v_asoc.proveedor_id is distinct from new.proveedor_id
       or v_asoc.tipo::text not like 'FACTURA%'
       or right(v_asoc.tipo::text, 1) <> right(new.tipo::text, 1) then
      raise exception 'La nota de crédito tiene que corregir una factura de la misma clase y del mismo proveedor.'
        using errcode = 'check_violation';
    end if;
    if v_asoc.anulado_en is not null then
      raise exception 'La factura que corrige está anulada.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validar_comprobante_proveedor
  before insert on comercial.comprobantes_proveedor
  for each row execute function comercial.fn_validar_comprobante_proveedor();

-- Lo único que cambia de un comprobante es su anulación, una vez.
create or replace function comercial.fn_comprobante_proveedor_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anulado_en is not null then
    raise exception 'El comprobante ya está anulado y no cambia.' using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - array['anulado_en','anulado_por','motivo_anulacion'])
     is distinct from (to_jsonb(old) - array['anulado_en','anulado_por','motivo_anulacion']) then
    raise exception 'Un comprobante no se edita: se anula con motivo y se carga el correcto.'
      using errcode = 'restrict_violation';
  end if;
  if new.anulado_por is distinct from core.usuario_actual() then
    raise exception 'La anulación queda a nombre de quien la hace.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_comprobante_proveedor_inmutable
  before update on comercial.comprobantes_proveedor
  for each row execute function comercial.fn_comprobante_proveedor_inmutable();

create or replace function comercial.anular_comprobante_proveedor(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update comercial.comprobantes_proveedor
     set anulado_en = now(), anulado_por = core.usuario_actual(), motivo_anulacion = btrim(p_motivo)
   where id = p_id;
  if not found then
    raise exception 'El comprobante no existe o tu rol no puede anularlo.';
  end if;
end;
$$;

grant execute on function comercial.anular_comprobante_proveedor(uuid, text) to authenticated;

alter table comercial.comprobantes_proveedor enable row level security;
alter table comercial.comprobantes_proveedor force  row level security;

-- Sin DELETE para nadie: se anula.
grant select, insert, update on comercial.comprobantes_proveedor to authenticated;

create policy comprobantes_proveedor_select_authenticated on comercial.comprobantes_proveedor
  for select to authenticated using (core.rol() is not null);
comment on policy comprobantes_proveedor_select_authenticated on comercial.comprobantes_proveedor is
  '§3.3: consulta para todos los roles. Un comprobante sin factura se ve igual que los demás.';

-- Lo carga quien registra la recepción (I.20.1) o Administración después.
create policy comprobantes_proveedor_insert_carga on comercial.comprobantes_proveedor
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION',
                          'DIRECCION_TECNICA', 'OPERARIO', 'CONTROL_CALIDAD')
              and registrado_por = core.usuario_actual());
comment on policy comprobantes_proveedor_insert_carga on comercial.comprobantes_proveedor is
  'RN-65: lo carga quien recibe (roles de «Registrar recepción», §3.3) o Administración cuando llega la factura.';

create policy comprobantes_proveedor_update_administracion on comercial.comprobantes_proveedor
  for update to authenticated
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'));
comment on policy comprobantes_proveedor_update_administracion on comercial.comprobantes_proveedor is
  'Solo la anulación (trigger de inmutabilidad): Administración, Gerencia y Gerencia de Producción.';

select core.adjuntar_auditoria('comercial.comprobantes_proveedor');
