-- ---------------------------------------------------------------------------
-- Propósito : Corregir la cantidad (bultos y unidades) de un lote de insumo
--             mal cargado en la recepción, también si ya entró a stock. La
--             corrección es un registro nuevo con motivo
--             (comercial.correcciones_lote); el lote toma el valor corregido
--             y, si ya estaba en stock, la diferencia entra o sale con un
--             ajuste ERROR_DE_REGISTRO que apunta a la corrección. El
--             movimiento de entrada original no se toca.
-- Reglas    : RN-54 (el stock se corrige con un movimiento nuevo), RN-50 (la
--             corrección y el cambio del lote quedan en core.auditoria con
--             valor anterior), invariantes 1, 3, 6, 7 y 8. Decisión del
--             codirector técnico del 2026-10-22 (D-ajustes-1): «a veces lo
--             cargamos mal».
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------
--
-- Va en comercial porque mueve stock: comercial → gmp, nunca al revés. gmp
-- solo sabe que, dentro de la corrección, la cantidad del lote se puede
-- cambiar (gmp.corrigiendo_lote, un parámetro de la transacción).

create table comercial.correcciones_lote (
  id               uuid primary key default gen_random_uuid(),
  lote_insumo_id   uuid not null references gmp.lotes_insumo(id),
  bultos_antes     integer not null,
  bultos_despues   integer not null check (bultos_despues > 0),
  unidades_antes   numeric(14,3),
  unidades_despues numeric(14,3) not null check (unidades_despues >= 0),
  motivo           text not null check (length(btrim(motivo)) >= 3),
  corregido_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  corregido_en     timestamptz not null default now()
);

comment on table comercial.correcciones_lote is
  'Correcciones de cantidad de un lote de insumo mal cargado (D-ajustes-1). Append-only. Si el lote ya estaba en '
  'stock, la diferencia es un movimiento ENTRADA_AJUSTE/SALIDA_AJUSTE con documento CORRECCION_LOTE.';

create index correcciones_lote_lote_idx on comercial.correcciones_lote (lote_insumo_id);
create index correcciones_lote_corregido_por_idx on comercial.correcciones_lote (corregido_por);

-- ---------------------------------------------------------------------------
-- 1. El lote admite el cambio de cantidad solo dentro de una corrección
-- ---------------------------------------------------------------------------
-- Copia de 20261022180000 con cantidad_bultos y cantidad_unidades fuera de la
-- comparación cuando la transacción está corrigiendo ese lote.

create or replace function gmp.fn_lote_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- D-ajustes-1: lo pone comercial.fn_corregir_lote, solo para este lote.
  v_corrige boolean := coalesce(current_setting('gmp.corrigiendo_lote', true), '') = old.id::text;
begin
  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      new.lote_proveedor, new.plazo_validez,
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
      'Lo constatado en la recepción no se edita: la cantidad se corrige con «Corregir cantidad» (D-ajustes-1).'
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

-- ---------------------------------------------------------------------------
-- 2. La corrección: valor anterior, lote corregido y ajuste de stock
-- ---------------------------------------------------------------------------

create or replace function comercial.fn_corregir_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote      gmp.lotes_insumo%rowtype;
  v_entro     boolean;
  v_dif       numeric(16,4);
  v_articulo  uuid;
  v_deposito  uuid;
  v_saldo     numeric(16,4);
begin
  if not core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION') then
    raise exception 'La cantidad de un lote la corrige Dirección Técnica o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id for update;
  if not found then
    raise exception 'El lote no existe o no lo podés ver.' using errcode = 'check_violation';
  end if;

  -- El valor anterior lo pone la base, no el formulario.
  new.bultos_antes   := v_lote.cantidad_bultos;
  new.unidades_antes := v_lote.cantidad_unidades;
  if (new.bultos_antes, new.unidades_antes) is not distinct from (new.bultos_despues, new.unidades_despues) then
    raise exception 'La cantidad corregida es igual a la cargada: no hay nada que corregir.'
      using errcode = 'check_violation';
  end if;

  v_entro := exists (select 1 from comercial.movimientos_stock
                      where lote_insumo_id = v_lote.id
                        and tipo in ('ENTRADA_COMPRA', 'ENTRADA_PROVISTO_TERCERO'));
  v_dif := new.unidades_despues - coalesce(new.unidades_antes, 0);

  if v_entro and v_dif <> 0 then
    if v_lote.tercero_id is not null then
      raise exception 'El lote % es material de un cliente tercerizado y ya entró a stock: se corrige desde su stock.',
        v_lote.numero_registro_interno using errcode = 'check_violation';
    end if;
    v_articulo := comercial.articulo_de_insumo(v_lote.insumo_id);
    -- La posición con más saldo del lote; si no queda nada, donde entró.
    select s.deposito_id, s.saldo into v_deposito, v_saldo
      from comercial.v_saldos_stock s
     where s.lote_insumo_id = v_lote.id and s.articulo_id = v_articulo
     order by s.saldo desc
     limit 1;
    if v_deposito is null then
      select deposito_id, 0 into v_deposito, v_saldo
        from comercial.movimientos_stock
       where lote_insumo_id = v_lote.id and tipo = 'ENTRADA_COMPRA'
       order by ocurrido_en limit 1;
    end if;
    if v_dif < 0 and v_saldo + v_dif < 0 then
      raise exception
        'Del lote % ya se usó parte: quedan % % en un depósito y la corrección baja %. '
        'Lo que ya se consumió no se descuenta acá; corregí con un ajuste de inventario.',
        v_lote.numero_registro_interno, v_saldo, v_lote.unidad, -v_dif
        using errcode = 'check_violation';
    end if;
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
       documento_tipo, documento_id)
    values
      (v_articulo, v_lote.id, v_deposito,
       case when v_dif > 0 then 'ENTRADA_AJUSTE' else 'SALIDA_AJUSTE' end::comercial.tipo_movimiento_enum,
       v_dif,
       format('Corrección de cantidad del lote %s: %s → %s %s. %s',
              v_lote.numero_registro_interno, coalesce(new.unidades_antes, 0), new.unidades_despues,
              v_lote.unidad, new.motivo),
       'ERROR_DE_REGISTRO', 'CORRECCION_LOTE', new.id);
  end if;

  perform set_config('gmp.corrigiendo_lote', v_lote.id::text, true);
  update gmp.lotes_insumo
     set cantidad_bultos = new.bultos_despues, cantidad_unidades = new.unidades_despues
   where id = v_lote.id;
  perform set_config('gmp.corrigiendo_lote', '', true);

  return new;
end;
$$;

comment on function comercial.fn_corregir_lote() is
  'D-ajustes-1: completa el valor anterior, corrige la cantidad del lote y, si ya entró a stock, asienta la '
  'diferencia como ajuste ERROR_DE_REGISTRO. Lo que ya se consumió no se descuenta: tope en el saldo.';

create trigger trg_corregir_lote
  before insert on comercial.correcciones_lote
  for each row execute function comercial.fn_corregir_lote();

-- ---------------------------------------------------------------------------
-- 3. RLS y auditoría (invariantes 3 y 6). Append-only: sin UPDATE ni DELETE.
-- ---------------------------------------------------------------------------

alter table comercial.correcciones_lote enable row level security;
alter table comercial.correcciones_lote force  row level security;
select core.adjuntar_auditoria('comercial.correcciones_lote');

grant select, insert on comercial.correcciones_lote to authenticated;

create policy correcciones_lote_select_authenticated on comercial.correcciones_lote
  for select to authenticated using (core.rol() is not null);
comment on policy correcciones_lote_select_authenticated on comercial.correcciones_lote is
  '§3.3: consulta de registros y trazabilidad, para todos los roles (D-ajustes-1).';

create policy correcciones_lote_insert_tecnicos on comercial.correcciones_lote
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION')
              and corregido_por = core.usuario_actual());
comment on policy correcciones_lote_insert_tecnicos on comercial.correcciones_lote is
  'D-ajustes-1: corrigen la cantidad DT y GP, a su nombre. Mismo conjunto que ajusta stock, sin Administración, '
  'que no escribe lotes.';
