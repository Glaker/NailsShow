-- ---------------------------------------------------------------------------
-- Propósito : Corregir, además de la cantidad, el n° de remito, el proveedor
--             (los dos de la recepción entera), el lote del proveedor y el
--             plazo de validez de un lote de insumo, en cualquier estado. Cada
--             corrección es un registro nuevo con valor anterior (lo pone la
--             base), valor nuevo y motivo: error de tipeo, error del
--             proveedor u otro con detalle.
-- Reglas    : D-corregir-datos-lote-1 (codirector técnico, 2026-10-26),
--             extensión de D-ajustes-1. RN-50 (queda en core.auditoria con
--             valor anterior), invariantes 1, 3, 6 y 7.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------
--
-- Va en comercial, como comercial.correcciones_lote: el proveedor de una
-- recepción con comprobante de proveedor vigente no se cambia por acá (el
-- comprobante quedaría con otro), y gmp no lee comercial (§3.7). gmp solo
-- sabe que, dentro de la corrección, esos datos del lote y de la recepción se
-- pueden cambiar (gmp.corrigiendo_dato_lote y gmp.corrigiendo_recepcion,
-- parámetros de la transacción).
--
-- Los motivos son los tres que pidió el codirector. «Otro» exige detalle.

create table comercial.correcciones_dato_lote (
  id              uuid primary key default gen_random_uuid(),
  lote_insumo_id  uuid not null references gmp.lotes_insumo(id),
  campo           text not null
    check (campo in ('numero_remito', 'proveedor', 'lote_proveedor', 'plazo_validez')),
  valor_antes     text,
  valor_despues   text,
  motivo          text not null
    check (motivo in ('ERROR_TIPEO', 'ERROR_PROVEEDOR', 'OTRO')),
  motivo_detalle  text,
  corregido_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  corregido_en    timestamptz not null default now(),
  constraint correcciones_dato_lote_otro_con_detalle
    check (motivo <> 'OTRO' or length(btrim(coalesce(motivo_detalle, ''))) >= 3)
);

comment on table comercial.correcciones_dato_lote is
  'Correcciones de remito, proveedor, lote del proveedor y plazo de validez de un lote de insumo '
  '(D-corregir-datos-lote-1). Append-only. Remito y proveedor son de la recepción: corregirlos desde un lote '
  'cambia la recepción entera.';
comment on column comercial.correcciones_dato_lote.valor_despues is
  'El nuevo valor como texto: remito, lote del proveedor, fecha AAAA-MM-DD o id del proveedor. Vacío = sin dato.';

create index correcciones_dato_lote_lote_idx on comercial.correcciones_dato_lote (lote_insumo_id);
create index correcciones_dato_lote_corregido_por_idx on comercial.correcciones_dato_lote (corregido_por);

-- ---------------------------------------------------------------------------
-- 1. gmp deja corregir lote del proveedor y plazo de validez dentro de la
--    corrección. Copia de 20261022200000 con gmp.corrigiendo_dato_lote.
-- ---------------------------------------------------------------------------

create or replace function gmp.fn_lote_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- D-ajustes-1: lo pone comercial.fn_corregir_lote, solo para este lote.
  v_corrige boolean := coalesce(current_setting('gmp.corrigiendo_lote', true), '') = old.id::text;
  -- D-corregir-datos-lote-1: lo pone comercial.fn_corregir_dato_lote.
  v_corrige_dato boolean := coalesce(current_setting('gmp.corrigiendo_dato_lote', true), '') = old.id::text;
begin
  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      case when v_corrige_dato then old.lote_proveedor else new.lote_proveedor end,
      case when v_corrige_dato then old.plazo_validez else new.plazo_validez end,
      case when v_corrige then old.cantidad_bultos else new.cantidad_bultos end,
      case when v_corrige then old.cantidad_unidades else new.cantidad_unidades end,
      new.unidad, new.bultos_peso_similar,
      new.unidades_contadas, new.planchas_etiquetas, new.etiquetas_por_plancha,
      new.peso_pigmento_kg, new.registrado_por, new.creado_en)
     is distinct from
     (old.recepcion_id, old.insumo_id, old.numero_registro_interno,
      old.lote_proveedor, old.plazo_validez, old.cantidad_bultos,
      old.cantidad_unidades, old.unidad, old.bultos_peso_similar,
      old.unidades_contadas, old.planchas_etiquetas, old.etiquetas_por_plancha,
      old.peso_pigmento_kg, old.registrado_por, old.creado_en) then
    raise exception
      'Un lote registrado solo admite el avance de su circuito (estado y depósito). '
      'Lo constatado en la recepción no se edita: se corrige con «Corregir cantidad» o «Corregir datos» en la ficha del lote, con motivo (D-ajustes-1).'
      using errcode = 'restrict_violation';
  end if;

  -- D-recepcion-4: las dos casillas se completan (de no a sí) con el lote
  -- todavía RECIBIDO. Nunca se destildan.
  if (new.contenedores_limpiados, new.protocolo_recibido)
     is distinct from (old.contenedores_limpiados, old.protocolo_recibido) then
    if old.estado <> 'RECIBIDO'
       or (old.contenedores_limpiados and not new.contenedores_limpiados)
       or (coalesce(old.protocolo_recibido, false) and not coalesce(new.protocolo_recibido, false)) then
      raise exception
        'Contenedores limpiados y protocolo recibido solo se completan, de no a sí, mientras el lote está recibido.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  -- `protocolo_archivo_url` queda fuera de la lista a propósito: el protocolo
  -- del fabricante puede llegar escaneado después de la recepción, y adjuntarlo
  -- agrega evidencia, no la altera.
  return new;
end;
$$;

-- La recepción, igual: remito y proveedor se corrigen solo dentro de la
-- corrección, que es el registro rectificativo que pide PG.60.18 (con su
-- motivo). Copia de 20260904170000 con gmp.corrigiendo_recepcion.
create or replace function gmp.fn_recepcion_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- D-corregir-datos-lote-1: lo pone comercial.fn_corregir_dato_lote.
  v_corrige boolean := coalesce(current_setting('gmp.corrigiendo_recepcion', true), '') = old.id::text;
begin
  -- §4.3: la carga administrativa (factura, monto, forma de pago, alta en
  -- stock) es deliberadamente diferida y la hace otro sector, más tarde. Es lo
  -- único que puede cambiar. Las observaciones también, porque son el lugar
  -- donde se deja constancia de lo que apareció después.
  if (case when v_corrige then old.proveedor_id else new.proveedor_id end,
      new.proveedor_nuevo,
      case when v_corrige then old.numero_remito else new.numero_remito end,
      new.coincide_con_pedido, new.numero, new.fecha_hora, new.registrado_por)
     is distinct from
     (old.proveedor_id, old.proveedor_nuevo, old.numero_remito,
      old.coincide_con_pedido, old.numero, old.fecha_hora, old.registrado_por) then
    raise exception
      'Una recepción registrada no se edita. Solo admite su carga administrativa diferida (§4.3). '
      'Remito y proveedor se corrigen con «Corregir datos» en la ficha del lote, con motivo (PG.60.18).'
      using errcode = 'restrict_violation';
  end if;

  -- Quién cargó a stock y cuándo lo pone el sistema, no quien completa el form.
  if new.cargado_a_stock and not old.cargado_a_stock then
    new.cargado_por := core.usuario_actual();
    new.cargado_en  := now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. La corrección: valor anterior y dato corregido
-- ---------------------------------------------------------------------------

create or replace function comercial.fn_corregir_dato_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote  gmp.lotes_insumo%rowtype;
  v_rec   gmp.recepciones%rowtype;
  v_nuevo text := nullif(btrim(coalesce(new.valor_despues, '')), '');
  v_fecha date;
  v_prov  uuid;
begin
  if not core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION') then
    raise exception 'Los datos de un lote los corrige Dirección Técnica o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id for update;
  if not found then
    raise exception 'El lote no existe o no lo podés ver.' using errcode = 'check_violation';
  end if;
  select * into v_rec from gmp.recepciones where id = v_lote.recepcion_id for update;

  new.motivo_detalle := nullif(btrim(coalesce(new.motivo_detalle, '')), '');
  new.valor_despues  := v_nuevo;

  -- El valor anterior lo pone la base, no el formulario.
  case new.campo
    when 'numero_remito' then
      new.valor_antes := v_rec.numero_remito;
      -- Sin remito, todos los lotes necesitan lote del proveedor
      -- (gmp.fn_validar_lote_insumo, D-unidad-solo-materia-prima-2).
      if v_nuevo is null and exists (
        select 1 from gmp.lotes_insumo l
         where l.recepcion_id = v_rec.id and nullif(btrim(coalesce(l.lote_proveedor, '')), '') is null
      ) then
        raise exception 'La recepción tiene lotes sin lote del proveedor: el remito no se puede dejar vacío.'
          using errcode = 'check_violation';
      end if;
    when 'proveedor' then
      new.valor_antes := v_rec.proveedor_id::text;
      begin
        v_prov := v_nuevo::uuid;
      exception when invalid_text_representation then
        raise exception 'El proveedor elegido no es válido.' using errcode = 'check_violation';
      end;
      if v_prov is null or not exists (select 1 from gmp.proveedores where id = v_prov) then
        raise exception 'Elegí el proveedor correcto.' using errcode = 'check_violation';
      end if;
      if exists (select 1 from comercial.comprobantes_proveedor c
                  where c.recepcion_id = v_rec.id and c.anulado_en is null
                    and c.proveedor_id <> v_prov) then
        raise exception 'La recepción tiene un comprobante de proveedor vigente a nombre del otro proveedor: '
                        'anulalo primero y cargalo de nuevo.'
          using errcode = 'check_violation';
      end if;
    when 'lote_proveedor' then
      new.valor_antes := v_lote.lote_proveedor;
      if v_nuevo is null and nullif(btrim(coalesce(v_rec.numero_remito, '')), '') is null then
        raise exception 'Sin remito en la recepción, el lote del proveedor no se puede dejar vacío.'
          using errcode = 'check_violation';
      end if;
    when 'plazo_validez' then
      new.valor_antes := v_lote.plazo_validez::text;
      begin
        v_fecha := v_nuevo::date;
      exception when others then
        raise exception 'La fecha de validez no es válida.' using errcode = 'check_violation';
      end;
  end case;

  if new.valor_antes is not distinct from new.valor_despues then
    raise exception 'El valor corregido es igual al cargado: no hay nada que corregir.'
      using errcode = 'check_violation';
  end if;

  if new.campo in ('numero_remito', 'proveedor') then
    perform set_config('gmp.corrigiendo_recepcion', v_rec.id::text, true);
    if new.campo = 'numero_remito' then
      update gmp.recepciones set numero_remito = v_nuevo where id = v_rec.id;
    else
      update gmp.recepciones set proveedor_id = v_prov where id = v_rec.id;
    end if;
    perform set_config('gmp.corrigiendo_recepcion', '', true);
  else
    perform set_config('gmp.corrigiendo_dato_lote', v_lote.id::text, true);
    if new.campo = 'lote_proveedor' then
      update gmp.lotes_insumo set lote_proveedor = v_nuevo where id = v_lote.id;
    else
      update gmp.lotes_insumo set plazo_validez = v_fecha where id = v_lote.id;
    end if;
    perform set_config('gmp.corrigiendo_dato_lote', '', true);
  end if;

  return new;
end;
$$;

comment on function comercial.fn_corregir_dato_lote() is
  'D-corregir-datos-lote-1: completa el valor anterior y corrige remito, proveedor, lote del proveedor o plazo '
  'de validez. El proveedor no cambia si hay un comprobante vigente del otro.';

create trigger trg_corregir_dato_lote
  before insert on comercial.correcciones_dato_lote
  for each row execute function comercial.fn_corregir_dato_lote();

-- ---------------------------------------------------------------------------
-- 3. RLS y auditoría (invariantes 3 y 6). Append-only: sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------------

alter table comercial.correcciones_dato_lote enable row level security;
alter table comercial.correcciones_dato_lote force  row level security;
select core.adjuntar_auditoria('comercial.correcciones_dato_lote');

grant select, insert on comercial.correcciones_dato_lote to authenticated;

create policy correcciones_dato_lote_select_authenticated on comercial.correcciones_dato_lote
  for select to authenticated using (core.rol() is not null);
comment on policy correcciones_dato_lote_select_authenticated on comercial.correcciones_dato_lote is
  '§3.3: consulta de registros y trazabilidad, para todos los roles (D-corregir-datos-lote-1).';

create policy correcciones_dato_lote_insert_tecnicos on comercial.correcciones_dato_lote
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION')
              and corregido_por = core.usuario_actual());
comment on policy correcciones_dato_lote_insert_tecnicos on comercial.correcciones_dato_lote is
  'D-corregir-datos-lote-1: corrigen DT y GP, a su nombre, como la cantidad (D-ajustes-1).';
