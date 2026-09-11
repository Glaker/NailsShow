-- ---------------------------------------------------------------------------
-- Propósito : Permitir que un insumo se dé de alta con la unidad de medida sin
--             confirmar, y bloquear su recepción mientras siga así.
-- Reglas    : RN-01 y RN-03 no cambian. Precondición nueva sobre la recepción
--             del lote (I.20.1): sin unidad no hay cantidad verificable.
-- Fecha     : 2026-09-11
-- ---------------------------------------------------------------------------
--
-- POR QUÉ SE RELAJA UN `NOT NULL` Y NO SE INVENTA UN VALOR.
-- La lista de materias primas de la Gerencia llega sin unidad de medida: está
-- pendiente de confirmación en planta. Con `unidad_medida NOT NULL` las dos
-- salidas eran poner 'kg' por analogía —inventar un dato y que se lea como
-- confirmado— o no cargar el catálogo. Ninguna sirve. La tercera es la misma
-- que se aplicó en `gmp.productos` con `tipo`, `forma_cosmetica` y
-- `vida_util_meses`: el campo admite «todavía no se sabe», y esa ignorancia se
-- vuelve visible en vez de quedar disfrazada de dato.
--
-- El precio de relajarlo se paga en el único lugar donde la unidad es
-- imprescindible: la recepción. Un lote se registra con bultos y unidades, y
-- esas cantidades no significan nada si no se sabe en qué se miden. Así que el
-- insumo sin unidad se puede catalogar, pero no recepcionar. Esto reemplaza la
-- garantía que daba el NOT NULL, y en el momento correcto: cuando entra
-- material real, no cuando se anota su nombre.
--
-- Cuando la planta confirme las unidades, corresponde una migración de
-- endurecimiento que las complete y devuelva el `NOT NULL`.

alter table gmp.insumos_catalogo
  alter column unidad_medida drop not null;

alter table gmp.insumos_catalogo
  add constraint insumos_catalogo_unidad_no_vacia
  check (unidad_medida is null or length(btrim(unidad_medida)) > 0);

comment on column gmp.insumos_catalogo.unidad_medida is
  'Unidad de medida del insumo. NULL = pendiente de confirmación por la planta, que no es lo mismo que «sin unidad»: '
  'mientras siga en NULL, gmp.fn_validar_lote_insumo rechaza la recepción de lotes de este insumo.';

-- ===========================================================================
-- Precondición de recepción
-- ===========================================================================
-- Se agrega al validador que ya corre en el BEFORE INSERT OR UPDATE de
-- gmp.lotes_insumo. Va primero: es la más básica de las tres: si no se sabe en
-- qué se mide el material, discutir su protocolo o su pesada es prematuro.

create or replace function gmp.fn_validar_lote_insumo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select * into v_insumo from gmp.insumos_catalogo where id = new.insumo_id;

  if not found then
    raise exception 'El insumo % no existe en el catálogo.', new.insumo_id;
  end if;

  -- La unidad del catálogo está pendiente de confirmación: las cantidades del
  -- lote no serían verificables contra nada.
  if v_insumo.unidad_medida is null then
    raise exception
      '«%» no tiene unidad de medida confirmada en el catálogo. No se puede recepcionar hasta que la planta la defina.',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-01: una materia prima no se recepciona sin protocolo de análisis.
  if v_insumo.requiere_protocolo and coalesce(new.protocolo_recibido, false) = false then
    raise exception
      'RN-01: «%» exige protocolo de análisis del fabricante para ser recepcionado (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-03: los pigmentos se pesan antes de continuar el proceso.
  if v_insumo.requiere_pesada_recepcion and new.peso_pigmento_kg is null then
    raise exception
      'RN-03: «%» se pesa durante la recepción; falta el peso en kg (I.20.1 paso 5).',
      v_insumo.nombre
      using errcode = 'check_violation';
  end if;

  -- RN-48: el inflamable va al depósito exterior, no lo elige quien carga.
  if v_insumo.es_inflamable and new.deposito_actual_id is null then
    select id into new.deposito_actual_id
      from gmp.depositos
     where tipo_contenido = 'INFLAMABLES' and es_exterior and activo
     limit 1;
  end if;

  return new;
end;
$$;
