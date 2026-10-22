-- ---------------------------------------------------------------------------
-- Propósito : Revisar una orden terminada para poder liberarla. Hasta ahora,
--             terminada la orden solo se podía registrar la revisión del batch
--             record: las etapas sin controlar o sin registrar (y el análisis
--             del granel) quedaban trabadas y gmp.liberar_orden no se podía
--             usar nunca. Ahora, mientras la orden está TERMINADA, las etapas
--             se siguen registrando y controlando; liberada, rechazada o
--             anulada, ya no.
-- Reglas    : RN-51 (se libera con todo registrado y controlado), I.40.x
--             (R.40.x.1), I.50.10. Pedido del codirector técnico del
--             2026-10-22 (D-liberacion-1).
-- Fecha     : 2026-10-22
-- ---------------------------------------------------------------------------

-- Copia de 20261014180000 con un único cambio: la condición de estado.
create or replace function gmp.fn_op_etapa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado   gmp.estado_orden_enum;
  v_cc       boolean := new.etapa in ('CC_GRANEL', 'CC_PT');
  v_dictamen boolean;
  v_previa   gmp.op_etapas%rowtype;
  v_nombre   text;
begin
  select estado into v_estado from gmp.ordenes_produccion where id = new.orden_id;
  -- Terminada la orden, la DT todavía revisa: controla lo que falta y completa
  -- lo que no se registró, porque la liberación exige todo registrado y
  -- controlado (gmp.faltantes_liberacion). Liberada, rechazada o anulada, no.
  if v_estado not in ('ABIERTA', 'TERMINADA') then
    raise exception 'La orden está %: esa etapa ya no se registra.', lower(v_estado::text) using errcode = 'check_violation';
  end if;
  if v_cc and not core.es_rol('CONTROL_CALIDAD', 'DIRECCION_TECNICA') then
    raise exception 'El control de calidad lo registra Control de Calidad o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.etapa = 'REVISION' and not core.es_rol('DIRECCION_TECNICA', 'CONTROL_CALIDAD') then
    raise exception 'La revisión del batch record es de Dirección Técnica o Control de Calidad.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.etapa = 'CC_GRANEL' and not coalesce((new.datos ->> 'no_aplica')::boolean, false) then
    v_dictamen := gmp.analisis_vigente(null, new.orden_id);
    if v_dictamen is null then
      raise exception 'El control del granel se registra con su registro de análisis R.50.10.1.'
        using errcode = 'check_violation';
    end if;
    if (new.datos ->> 'aprobado')::boolean is distinct from v_dictamen then
      raise exception 'El dictamen del granel tiene que ser el de su registro R.50.10.1.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Dos personas hicieron la misma etapa: vale la primera (pedido del
    -- 2026-10-14). El segundo intento se rechaza diciendo quién la registró.
    select * into v_previa from gmp.op_etapas where orden_id = new.orden_id and etapa = new.etapa;
    if found then
      select nombre_completo into v_nombre from core.v_nomina where id = v_previa.realizo_por;
      raise exception 'Esta etapa ya la registró % a las %: vale el primer registro.',
        coalesce(v_nombre, 'otra persona'),
        to_char(v_previa.realizo_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI')
        using errcode = 'unique_violation';
    end if;
    if new.controlo_por is not null then
      raise exception 'Una etapa se registra primero y se controla después.' using errcode = 'check_violation';
    end if;
    new.realizo_por := core.usuario_actual();
    new.realizo_en := now();
    return new;
  end if;

  if old.controlo_por is not null then
    raise exception 'La etapa % ya está controlada: no se modifica.', lower(old.etapa::text)
      using errcode = 'restrict_violation';
  end if;
  if new.realizo_por is distinct from old.realizo_por or new.realizo_en is distinct from old.realizo_en
     or new.etapa is distinct from old.etapa or new.orden_id is distinct from old.orden_id then
    raise exception 'Quién realizó la etapa y cuándo no cambian.' using errcode = 'restrict_violation';
  end if;
  if new.controlo_por is not null then
    new.controlo_por := core.usuario_actual();
    new.controlo_en := now();
    if new.datos is distinct from old.datos or new.observaciones is distinct from old.observaciones then
      raise exception 'Al controlar no se cambian los datos: corregí primero y controlá después.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

