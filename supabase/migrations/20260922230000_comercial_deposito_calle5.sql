-- ---------------------------------------------------------------------------
-- Propósito : Punto de venta de Calle 5: depósito propio de producto terminado
--             Nail Show, con su libro de movimientos y el rol ENCARGADA_STOCK
--             que lo gestiona. Entra lo que envía Gerencia de Producción desde
--             planta; sale lo que se vende.
-- Reglas    : §4.12 (stock como libro de movimientos). RN-54: un movimiento no
--             se edita, se corrige con uno inverso. Invariante 6: la tabla
--             lleva el trigger de auditoría.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- POR QUÉ UNA TABLA NUEVA Y NO `comercial.movimientos_stock`.
-- Esa tabla tiene `lote_insumo_id` NOT NULL contra `gmp.lotes_insumo`, y su
-- comentario explica por qué: «un movimiento sin lote es material sin
-- trazabilidad, que es justamente lo que este sistema existe para impedir».
-- Calle 5 mueve producto terminado, no insumos, y el lote de producto
-- terminado todavía no existe como entidad en el esquema.
--
-- Había dos caminos. Aflojar el NOT NULL de la tabla regulada para que acepte
-- filas sin lote, o darle al punto de venta su propio libro. Se eligió el
-- segundo: aflojar esa restricción abriría la puerta a cargar insumos sin lote
-- en el circuito regulado, que es exactamente el agujero que la restricción
-- tapa. Esta migración no toca `comercial.movimientos_stock`.
--
-- LO QUE ESTO NO RESUELVE, Y HAY QUE SABERLO.
-- Sin lote de producto terminado, **un retiro de mercado no alcanza a Calle 5**.
-- RN-52 exige que un lote alcanzado por un retiro quede bloqueado de inmediato
-- y que se pueda decir dónde está la mercadería. Acá se va a saber cuántas
-- unidades hay, no de qué lote son. `lote_texto` existe para ir anotándolo
-- mientras tanto, y el día que exista `gmp.lotes_producto` se agrega la clave
-- foránea y se migran los textos. Queda como decisión abierta.

-- ---------------------------------------------------------------------------
-- 1. El depósito
-- ---------------------------------------------------------------------------
--
-- `numero` es texto y los POE numeran del 01 al 20. Calle 5 no está en ningún
-- POE porque no es un depósito de planta, así que lleva código mnemotécnico,
-- igual que los cinco depósitos sin número de D-11.

insert into gmp.depositos (numero, nombre, tipo_contenido, estado_admitido, es_exterior, activo)
values ('C5', 'Calle 5 — punto de venta', 'PT_NACIONAL', null, false, true)
on conflict (numero) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Libro de movimientos del punto de venta
-- ---------------------------------------------------------------------------

create table if not exists comercial.movimientos_pt (
  id             uuid primary key default gen_random_uuid(),
  orden          bigint generated always as identity,

  producto_id    uuid not null references gmp.productos(id),
  deposito_id    uuid not null references gmp.depositos(id),

  tipo           comercial.tipo_movimiento_enum not null,
  -- Con signo, igual que el libro de insumos: positivo entra, negativo sale.
  cantidad       numeric(16,4) not null check (cantidad <> 0),

  -- Lote de producto terminado, como texto, hasta que exista la entidad.
  -- Ver la nota de cabecera: sin esto un retiro no llega hasta acá.
  lote_texto     text,

  motivo         text,
  documento_tipo text,
  documento_id   uuid,

  anula_a_movimiento_id uuid unique references comercial.movimientos_pt(id),

  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  ocurrido_en    timestamptz not null default now(),

  -- Qué tipos tienen sentido en un punto de venta. Producción, consumo de
  -- producción y retiro de mercado no se registran desde acá.
  constraint movimientos_pt_tipo_admitido check (
    tipo in ('ENTRADA_DEVOLUCION', 'ENTRADA_AJUSTE', 'SALIDA_VENTA',
             'SALIDA_AJUSTE', 'SALIDA_DESCARTE', 'TRANSFERENCIA_ENTRE_DEPOSITOS')
  ),
  constraint movimientos_pt_signo_segun_tipo check (
    (tipo::text like 'ENTRADA%' and cantidad > 0)
    or (tipo::text like 'SALIDA%' and cantidad < 0)
    or (tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS')
  ),
  -- Un ajuste sin explicación es un descuadre escondido.
  constraint movimientos_pt_ajuste_con_motivo check (
    tipo not in ('ENTRADA_AJUSTE', 'SALIDA_AJUSTE', 'SALIDA_DESCARTE')
    or length(btrim(coalesce(motivo, ''))) > 0
  ),
  constraint movimientos_pt_anulacion_con_motivo check (
    anula_a_movimiento_id is null or length(btrim(coalesce(motivo, ''))) > 0
  )
);

comment on table comercial.movimientos_pt is
  'Libro de movimientos de producto terminado en depósitos comerciales (Calle 5). Append-only por RN-54: un movimiento no se edita, se corrige con uno inverso que lo referencia.';
comment on column comercial.movimientos_pt.lote_texto is
  'Lote de producto terminado como texto, provisorio hasta que exista gmp.lotes_producto. Sin él un retiro de mercado no alcanza a este depósito (RN-52).';

create index if not exists movimientos_pt_producto_idx
  on comercial.movimientos_pt (deposito_id, producto_id);

-- ---------------------------------------------------------------------------
-- 3. Saldo, y la regla de que no puede quedar negativo
-- ---------------------------------------------------------------------------

create or replace view comercial.v_stock_pt
with (security_invoker = true) as
select
  m.deposito_id,
  d.nombre                                as deposito,
  m.producto_id,
  p.nombre                                as producto,
  sum(m.cantidad)                         as saldo,
  max(m.ocurrido_en)                      as ultimo_movimiento
from comercial.movimientos_pt m
join gmp.depositos d on d.id = m.deposito_id
join gmp.productos p on p.id = m.producto_id
group by m.deposito_id, d.nombre, m.producto_id, p.nombre;

comment on view comercial.v_stock_pt is
  'Saldo por producto y depósito comercial. Suma de movimientos, no un contador que se pisa: evita la condición de carrera de UPDATE stock SET cantidad = cantidad - n.';

grant select on comercial.v_stock_pt to authenticated;

-- El saldo negativo es el primer modo de falla de todo sistema de stock. Se
-- bloquea en la base y no en el formulario, por el mismo criterio que el resto
-- del proyecto: la aplicación puede duplicar la validación para dar un buen
-- mensaje, la autoridad es el motor.
create or replace function comercial.fn_stock_pt_no_negativo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_pt
   where deposito_id = new.deposito_id and producto_id = new.producto_id;

  if v_saldo < 0 then
    raise exception
      'El movimiento dejaría el stock de este producto en % unidades en el depósito. No se puede sacar lo que no hay.',
      v_saldo
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- CONSTRAINT TRIGGER DEFERRABLE: se evalúa al final de la transacción, no fila
-- por fila. Una transferencia que descarga un depósito y carga otro pasaría a
-- estar mal si se mirara el saldo en el medio.
drop trigger if exists trg_stock_pt_no_negativo on comercial.movimientos_pt;
create constraint trigger trg_stock_pt_no_negativo
  after insert or update on comercial.movimientos_pt
  deferrable initially deferred
  for each row execute function comercial.fn_stock_pt_no_negativo();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table comercial.movimientos_pt enable row level security;
alter table comercial.movimientos_pt force  row level security;

grant select, insert on comercial.movimientos_pt to authenticated;
-- Sin UPDATE ni DELETE para ningún rol: RN-54. La corrección es un movimiento
-- inverso que apunta al original, no una edición.

create policy movimientos_pt_select_authenticated on comercial.movimientos_pt
  for select to authenticated using (true);
comment on policy movimientos_pt_select_authenticated on comercial.movimientos_pt is
  'El stock se lee desde toda la empresa: producción necesita saber qué hay en el punto de venta para decidir qué enviar.';

create policy movimientos_pt_insert_stock on comercial.movimientos_pt
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION',
                          'GERENCIA', 'ADMINISTRACION'));
comment on policy movimientos_pt_insert_stock on comercial.movimientos_pt is
  'Registra movimientos quien gestiona el depósito (§3.3). Dirección Técnica no está: el punto de venta no es un circuito regulado y no corresponde que la DT cargue ventas.';

-- ---------------------------------------------------------------------------
-- 5. Auditoría (invariante 6)
-- ---------------------------------------------------------------------------

select core.adjuntar_auditoria('comercial.movimientos_pt');
