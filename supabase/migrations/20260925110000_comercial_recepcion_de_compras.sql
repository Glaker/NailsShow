-- ---------------------------------------------------------------------------
-- Propósito : Al registrar una recepción, indicar a qué compras pendientes
--             corresponde: la compra queda vinculada al lote recibido y, si
--             llegó completa, resuelta.
-- Reglas    : I.20.1 paso 2 (verificar que lo recibido coincida con lo
--             pedido), RN-50 (auditoría), invariante 7 (el vínculo vive en
--             comercial y apunta a gmp, nunca al revés). Pedido del
--             codirector técnico (2026-09-25).
-- Fecha     : 2026-09-25
-- ---------------------------------------------------------------------------
--
-- Hasta acá una compra anotada («en compra») se resolvía a mano desde la
-- lista de compras pendientes, sin decir con qué recepción llegó. Ahora el
-- que recibe elige la compra, y queda la traza: qué se pidió, para qué pedido,
-- y en qué lote entró.

alter table comercial.avisos_compra
  add column recepcion_id   uuid references gmp.recepciones(id),
  add column lote_insumo_id uuid references gmp.lotes_insumo(id);

comment on column comercial.avisos_compra.lote_insumo_id is
  'Lote con el que llegó lo comprado (vínculo hecho al recibir). Nulo = todavía no llegó o se resolvió a mano.';

create index avisos_compra_lote_idx on comercial.avisos_compra (lote_insumo_id) where lote_insumo_id is not null;

-- p_vinculos: [{ "aviso_id": uuid, "lote_insumo_id": uuid, "completa": bool }]
-- «completa» = llegó todo lo que se había pedido: la compra queda RESUELTA. Si
-- llegó una parte, queda vinculada y en compra, con la nota de lo recibido.
create or replace function comercial.vincular_recepcion_compras(p_recepcion_id uuid, p_vinculos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  e       jsonb;
  v_aviso comercial.avisos_compra%rowtype;
  v_lote  gmp.lotes_insumo%rowtype;
  v_n     integer := 0;
  v_completa boolean;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'ADMINISTRACION') then
    raise exception 'Tu rol no puede resolver compras.' using errcode = 'insufficient_privilege';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_vinculos, '[]'::jsonb))
  loop
    select * into v_aviso from comercial.avisos_compra where id = (e ->> 'aviso_id')::uuid for update;
    if not found then
      raise exception 'La compra no existe.';
    end if;
    if v_aviso.estado not in ('PENDIENTE', 'EN_COMPRA') then
      raise exception 'La compra de ese insumo ya está %.', lower(v_aviso.estado::text) using errcode = 'check_violation';
    end if;

    select * into v_lote from gmp.lotes_insumo where id = (e ->> 'lote_insumo_id')::uuid;
    if not found or v_lote.recepcion_id is distinct from p_recepcion_id then
      raise exception 'El lote no es de esta recepción.' using errcode = 'check_violation';
    end if;
    if v_lote.insumo_id <> v_aviso.insumo_id then
      raise exception 'El lote es de otro insumo que el de la compra.' using errcode = 'check_violation';
    end if;

    v_completa := coalesce((e ->> 'completa')::boolean, true);
    update comercial.avisos_compra
       set recepcion_id   = p_recepcion_id,
           lote_insumo_id = v_lote.id,
           estado         = case when v_completa then 'RESUELTO' else 'EN_COMPRA' end::comercial.estado_aviso_enum,
           resuelto_por   = case when v_completa then core.usuario_actual() else resuelto_por end,
           resuelto_en    = case when v_completa then now() else resuelto_en end,
           nota           = concat_ws(' · ', nullif(nota, ''),
                              format('Recibido en lote %s (%s %s)%s', v_lote.numero_registro_interno,
                                     coalesce(v_lote.cantidad_unidades::text, '?'), v_lote.unidad,
                                     case when v_completa then '' else ', parcial' end))
     where id = v_aviso.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function comercial.vincular_recepcion_compras(uuid, jsonb) is
  'Vincula compras pendientes con los lotes de una recepción. Completa = RESUELTA; parcial = sigue en compra con nota.';

grant execute on function comercial.vincular_recepcion_compras(uuid, jsonb) to authenticated;
