-- ---------------------------------------------------------------------------
-- Propósito : 1. «Corregir cantidad» de un lote también corrige la unidad
--                (kg por UNIDAD en tapas y bombas dadas de alta desde la
--                recepción), mientras el lote no entró a stock.
--             2. Dirección Técnica elimina una recepción que no se cargó a
--                stock aunque sus lotes ya estén dictaminados.
-- Reglas    : D-estado-orden-envasado-1 (unidad), D-estado-orden-envasado-2
--             (eliminar). Extienden D-ajustes-1 y D-recepcion-3. Pedido del
--             codirector técnico, 2026-11-04. RN-50, invariantes 1, 3 y 6.
-- Fecha     : 2026-11-04
-- ---------------------------------------------------------------------------
--
-- UNIDAD. El saldo de un lote que ya entró a stock está asentado en su unidad:
-- cambiarla después haría que los movimientos anteriores digan otra cosa. Por
-- eso solo se corrige antes de cargar a stock; después, ajuste de inventario.
-- La fila de la corrección guarda la unidad anterior y la nueva.
--
-- ELIMINAR. Sigue siendo la baja lógica de D-recepcion-3 (una fila en
-- gmp.recepciones_eliminadas, RLS la saca de las consultas): no se borra nada
-- y los registros de análisis quedan en la base. Sin stock no hubo consumo.

-- ===========================================================================
-- 1. Unidad en la corrección
-- ===========================================================================

alter table comercial.correcciones_lote
  add column unidad_antes   text,
  add column unidad_despues text
    constraint correcciones_lote_unidad_valida
    check (unidad_despues is null or unidad_despues in ('g', 'kg', 'ml', 'l', 'L', 'UNIDAD'));

comment on column comercial.correcciones_lote.unidad_despues is
  'Unidad corregida (D-estado-orden-envasado-1). Null = la del lote. La anterior la pone la base.';

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
  -- NUEVO (D-estado-orden-envasado-1).
  new.unidad_antes   := v_lote.unidad;
  new.unidad_despues := coalesce(new.unidad_despues, v_lote.unidad);
  if (new.bultos_antes, new.unidades_antes, new.unidad_antes)
     is not distinct from (new.bultos_despues, new.unidades_despues, new.unidad_despues) then
    raise exception 'La cantidad corregida es igual a la cargada: no hay nada que corregir.'
      using errcode = 'check_violation';
  end if;

  v_entro := exists (select 1 from comercial.movimientos_stock
                      where lote_insumo_id = v_lote.id
                        and tipo in ('ENTRADA_COMPRA', 'ENTRADA_PROVISTO_TERCERO'));

  -- NUEVO (D-estado-orden-envasado-1): la unidad, solo antes de entrar a stock.
  if v_entro and new.unidad_despues is distinct from v_lote.unidad then
    raise exception
      'El lote % ya entró a stock en %: su saldo está en esa unidad y no se cambia. '
      'Corregí con un ajuste de inventario.',
      v_lote.numero_registro_interno, v_lote.unidad
      using errcode = 'check_violation';
  end if;

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
     set cantidad_bultos = new.bultos_despues, cantidad_unidades = new.unidades_despues,
         unidad = new.unidad_despues
   where id = v_lote.id;
  perform set_config('gmp.corrigiendo_lote', '', true);

  return new;
end;
$$;

-- La guarda del lote: con la corrección en curso también admite la unidad.
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
  -- D-recepcion-5: lo pone comercial.editar_recepcion.
  v_edita boolean := gmp.editando_recepcion(old.recepcion_id);
begin
  if v_edita then
    if (new.recepcion_id, new.numero_registro_interno, new.registrado_por, new.creado_en)
       is distinct from
       (old.recepcion_id, old.numero_registro_interno, old.registrado_por, old.creado_en) then
      raise exception 'El n° interno del lote y su recepción no se cambian.'
        using errcode = 'restrict_violation';
    end if;
    if old.estado not in ('RECIBIDO', 'CUARENTENA')
       and (new.insumo_id, new.contenedores_limpiados, new.protocolo_recibido)
           is distinct from (old.insumo_id, old.contenedores_limpiados, old.protocolo_recibido) then
      raise exception 'El lote % ya pasó por calidad: no cambia de insumo ni de contenedores o protocolo.',
                      old.numero_registro_interno
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      case when v_corrige_dato then old.lote_proveedor else new.lote_proveedor end,
      case when v_corrige_dato then old.plazo_validez else new.plazo_validez end,
      case when v_corrige then old.cantidad_bultos else new.cantidad_bultos end,
      case when v_corrige then old.cantidad_unidades else new.cantidad_unidades end,
      -- NUEVO (D-estado-orden-envasado-1).
      case when v_corrige then old.unidad else new.unidad end,
      new.bultos_peso_similar,
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
      'Lo constatado en la recepción no se edita así: antes de cargar a stock, con «Editar» en Recepciones; '
      'después, con «Corregir cantidad» o «Corregir datos» en la ficha del lote (D-ajustes-1).'
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

-- ===========================================================================
-- 2. Eliminar una recepción con lotes dictaminados: solo DT
-- ===========================================================================

create or replace function gmp.fn_recepcion_eliminable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rec gmp.recepciones%rowtype;
begin
  select * into v_rec from gmp.recepciones where id = new.recepcion_id for update;
  if not found then
    raise exception 'La recepción no existe.' using errcode = 'no_data_found';
  end if;
  if v_rec.cargado_a_stock then
    raise exception 'La recepción % ya se cargó a stock: no se elimina. Anulá sus movimientos en Stock.', v_rec.numero
      using errcode = 'restrict_violation';
  end if;
  -- NUEVO (D-estado-orden-envasado-2): DT también con lotes ya dictaminados.
  if not core.es_rol('DIRECCION_TECNICA')
     and exists (select 1 from gmp.lotes_insumo
                  where recepcion_id = new.recepcion_id
                    and estado not in ('RECIBIDO', 'CUARENTENA')) then
    raise exception 'La recepción % tiene lotes ya muestreados o dictaminados: la elimina Dirección Técnica.', v_rec.numero
      using errcode = 'restrict_violation';
  end if;
  new.eliminada_por := core.usuario_actual();
  new.eliminada_en  := now();
  return new;
end;
$$;
