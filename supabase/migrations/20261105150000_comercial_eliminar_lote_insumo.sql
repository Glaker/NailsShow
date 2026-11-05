-- ---------------------------------------------------------------------------
-- Propósito : Eliminar un lote de insumo en cualquier momento, solo la
--             Dirección Técnica y con motivo, siempre que el lote no se haya
--             usado. No se borra: queda en comercial.lotes_eliminados, el
--             saldo que tenía sale con un ajuste ERROR_DE_REGISTRO que apunta
--             a esa fila, y una fila en gmp.lotes_quitados lo oculta de toda
--             consulta, igual que un lote quitado de una recepción.
-- Reglas    : D-eliminar-lote-1 (codirector técnico, 2026-11-05), extensión
--             de D-recepcion-5. RN-54 (el stock se corrige con un movimiento
--             nuevo), RN-50 (todo queda en core.auditoria), invariantes 1,
--             3, 6, 7 y 8.
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------
--
-- USADO = alguna salida que no sea ajuste ni transferencia: consumo de
-- producción, venta, muestra, descarte o retiro. Ese lote no se elimina,
-- porque perdería la trazabilidad de lo que se hizo con él; se corrige con un
-- ajuste de inventario. Tampoco se eliminan los lotes de saldo de apertura:
-- hay uno por insumo y juntan todo lo que se contó, así que se corrigen con un
-- conteo.
--
-- Va en comercial porque mira y mueve stock (comercial → gmp). gmp solo sabe
-- que, dentro de una eliminación, el lote se quita aunque su recepción ya se
-- haya cargado a stock (gmp.eliminando_lote, un parámetro de la transacción).

create table comercial.lotes_eliminados (
  id             uuid primary key default gen_random_uuid(),
  lote_insumo_id uuid not null unique references gmp.lotes_insumo(id),
  motivo         text not null check (length(btrim(motivo)) >= 3),
  eliminado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  eliminado_en   timestamptz not null default now()
);

comment on table comercial.lotes_eliminados is
  'Lotes de insumo eliminados por la DT (D-eliminar-lote-1). Append-only. El lote queda intacto y oculto '
  '(gmp.lotes_quitados); su saldo salió con un ajuste de documento ELIMINACION_LOTE.';

create index lotes_eliminados_eliminado_por_idx on comercial.lotes_eliminados (eliminado_por);

-- ---------------------------------------------------------------------------
-- 1. gmp: dentro de una eliminación, el lote se quita en cualquier momento
-- ---------------------------------------------------------------------------
-- Copia de 20261103130000 con un cambio (NUEVO).

create or replace function gmp.fn_lote_quitable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote gmp.lotes_insumo%rowtype;
begin
  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id for update;
  if not found then
    raise exception 'El lote no existe o no lo podés ver.' using errcode = 'no_data_found';
  end if;

  -- NUEVO (D-eliminar-lote-1): lo pone comercial.fn_eliminar_lote, solo para
  -- este lote y solo con la sesión de la DT. Los controles están allá.
  if coalesce(current_setting('gmp.eliminando_lote', true), '') = v_lote.id::text
     and core.es_rol('DIRECCION_TECNICA') then
    new.quitado_por := core.usuario_actual();
    new.quitado_en  := now();
    return new;
  end if;

  perform 1 from gmp.recepciones where id = v_lote.recepcion_id for update;
  if not gmp.recepcion_editable(v_lote.recepcion_id) then
    raise exception 'La recepción ya se cargó a stock: el lote % no se quita.', v_lote.numero_registro_interno
      using errcode = 'restrict_violation';
  end if;
  if v_lote.estado not in ('RECIBIDO', 'CUARENTENA') then
    raise exception 'El lote % ya pasó por calidad: no se quita.', v_lote.numero_registro_interno
      using errcode = 'restrict_violation';
  end if;
  if not exists (select 1 from gmp.lotes_insumo l
                  where l.recepcion_id = v_lote.recepcion_id and l.id <> v_lote.id
                    and not exists (select 1 from gmp.lotes_quitados q where q.lote_insumo_id = l.id)) then
    raise exception 'Es el único lote de la recepción: eliminá la recepción entera.'
      using errcode = 'check_violation';
  end if;
  new.quitado_por := core.usuario_actual();
  new.quitado_en  := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. La eliminación: controles, saldo a cero y lote oculto
-- ---------------------------------------------------------------------------

create or replace function comercial.fn_eliminar_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote gmp.lotes_insumo%rowtype;
  pos    record;
begin
  if not core.es_rol('DIRECCION_TECNICA') then
    raise exception 'Un lote lo elimina solo la Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id for update;
  if not found then
    raise exception 'El lote no existe o no lo podés ver.' using errcode = 'check_violation';
  end if;
  if v_lote.estado = 'SALDO_APERTURA' or v_lote.migracion_apertura_id is not null then
    raise exception 'El lote % es el saldo de apertura del insumo: se corrige con un conteo, no se elimina.',
      coalesce(v_lote.numero_registro_interno, v_lote.id::text) using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.movimientos_stock
              where lote_insumo_id = v_lote.id
                and tipo in ('SALIDA_CONSUMO_PRODUCCION', 'SALIDA_VENTA', 'SALIDA_MUESTRA',
                             'SALIDA_DESCARTE', 'SALIDA_RETIRO_MERCADO')) then
    raise exception
      'Del lote % ya se usó material (producción, venta, muestra o descarte): no se elimina, porque se '
      'perdería su trazabilidad. Corregí el stock con un ajuste de inventario.',
      v_lote.numero_registro_interno using errcode = 'check_violation';
  end if;

  new.eliminado_por := core.usuario_actual();
  new.eliminado_en  := now();

  -- Lo que queda en cada depósito sale (o entra, si estuviera en negativo).
  for pos in
    select s.articulo_id, s.deposito_id, s.saldo
      from comercial.v_saldos_stock s
     where s.lote_insumo_id = v_lote.id and s.saldo <> 0
  loop
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
       documento_tipo, documento_id)
    values
      (pos.articulo_id, v_lote.id, pos.deposito_id,
       case when pos.saldo > 0 then 'SALIDA_AJUSTE' else 'ENTRADA_AJUSTE' end::comercial.tipo_movimiento_enum,
       -pos.saldo,
       format('Eliminación del lote %s. %s', v_lote.numero_registro_interno, new.motivo),
       'ERROR_DE_REGISTRO', 'ELIMINACION_LOTE', new.id);
  end loop;

  perform set_config('gmp.eliminando_lote', v_lote.id::text, true);
  insert into gmp.lotes_quitados (lote_insumo_id) values (v_lote.id);
  perform set_config('gmp.eliminando_lote', '', true);

  return new;
end;
$$;

comment on function comercial.fn_eliminar_lote() is
  'D-eliminar-lote-1: solo DT; rechaza lotes usados y de saldo de apertura; lleva el saldo a cero con ajustes '
  'ERROR_DE_REGISTRO y oculta el lote en gmp.lotes_quitados.';

create trigger trg_eliminar_lote
  before insert on comercial.lotes_eliminados
  for each row execute function comercial.fn_eliminar_lote();

-- ---------------------------------------------------------------------------
-- 3. RLS y auditoría (invariantes 3 y 6). Append-only: sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------------

alter table comercial.lotes_eliminados enable row level security;
alter table comercial.lotes_eliminados force  row level security;
select core.adjuntar_auditoria('comercial.lotes_eliminados');

grant select, insert on comercial.lotes_eliminados to authenticated;

create policy lotes_eliminados_select_authenticated on comercial.lotes_eliminados
  for select to authenticated using (core.rol() is not null);
comment on policy lotes_eliminados_select_authenticated on comercial.lotes_eliminados is
  '§3.3: consulta de registros y trazabilidad, para todos los roles (D-eliminar-lote-1).';

create policy lotes_eliminados_insert_dt on comercial.lotes_eliminados
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA') and eliminado_por = core.usuario_actual());
comment on policy lotes_eliminados_insert_dt on comercial.lotes_eliminados is
  'D-eliminar-lote-1: elimina solo la Dirección Técnica, a su nombre.';
