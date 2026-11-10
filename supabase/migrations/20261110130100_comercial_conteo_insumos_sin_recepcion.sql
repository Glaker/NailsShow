-- ---------------------------------------------------------------------------
-- Propósito : Actualizar el stock de un insumo desde Stock sin pasar por
--             recepciones. Gerencia de Producción, Gerencia, Administración y
--             DT cargan lo que hay y el saldo pasa a eso; queda el conteo
--             (existencia histórica) y el ajuste en el kardex a su nombre.
-- Reglas    : RN-50, RN-54, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- Copia de comercial.registrar_conteo (20260923150000) con tres cambios,
-- pedidos por el codirector técnico el 2026-11-10:
--   1. Suma a Gerencia (ya veía Stock › Conteo y no podía cargar).
--   2. Un insumo sin lote de saldo de apertura ya no exige recepción: se le
--      crea el lote al contar, igual que en las cargas de etiquetas.
--   3. Si lo contado es menos de lo que explica el saldo de apertura, el resto
--      se descuenta de los demás lotes con saldo, del más viejo al más nuevo,
--      con un ajuste por lote. Antes se rechazaba y había que ir lote a lote.
-- SECURITY DEFINER: el lote de apertura y los ajustes sobre lotes con
-- recepción no los permite la política a GP ni a Gerencia; el rol se controla
-- adentro y la autoría la sellan los triggers con el usuario del JWT.
-- Nada se borra ni se edita: solo se insertan conteo, lote y movimientos.

create or replace function comercial.registrar_conteo(
  p_insumo_id   uuid,
  p_cantidad    numeric,
  p_observacion text default null,
  p_provisorio  boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insumo      gmp.insumos_catalogo%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_migracion   uuid;
  v_articulo    uuid;
  v_total       numeric(16,4);
  v_otra_unidad numeric(16,4);
  v_en_apertura numeric(16,4);
  v_diferencia  numeric(16,4);
  v_resto       numeric(16,4);
  v_toma        numeric(16,4);
  v_conteo      uuid;
  v_motivo      text;
  r             record;
begin
  if not core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA') then
    raise exception 'Actualizar el stock de un insumo es de DT, Administración, Gerencia o Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad contada tiene que ser cero o más.' using errcode = 'check_violation';
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = p_insumo_id;
  if not found then
    raise exception 'El insumo no existe.';
  end if;
  if v_insumo.unidad_medida is null then
    raise exception 'El insumo % no tiene unidad de medida confirmada: no se puede contar.', v_insumo.codigo_interno
      using errcode = 'check_violation';
  end if;

  select * into v_lote
    from gmp.lotes_insumo
   where insumo_id = p_insumo_id
     and estado = 'SALDO_APERTURA'
     and unidad = v_insumo.unidad_medida
   order by creado_en desc
   limit 1;
  if not found then
    select id into v_migracion from gmp.migracion_apertura order by ejecutada_en limit 1;
    if v_migracion is null then
      raise exception 'No hay carga de saldo de apertura: el stock no tiene lote donde asentarse.';
    end if;
    insert into gmp.lotes_insumo (
      insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
      lote_proveedor, unidad
    ) values (
      p_insumo_id, 'SALDO_APERTURA', v_migracion, 0, true,
      'SALDO DE APERTURA — creado al actualizar el stock desde Stock', v_insumo.unidad_medida
    )
    returning * into v_lote;
  end if;

  v_articulo := comercial.articulo_de_insumo(p_insumo_id);

  select coalesce(sum(s.saldo) filter (where l.unidad = v_insumo.unidad_medida), 0),
         coalesce(sum(s.saldo) filter (where l.unidad <> v_insumo.unidad_medida), 0),
         coalesce(sum(s.saldo) filter (where s.lote_insumo_id = v_lote.id and s.deposito_id = v_lote.deposito_actual_id), 0)
    into v_total, v_otra_unidad, v_en_apertura
    from comercial.v_saldos_stock s
    join gmp.lotes_insumo l on l.id = s.lote_insumo_id
   where s.articulo_id = v_articulo;

  if v_otra_unidad <> 0 then
    raise exception
      'El insumo % tiene saldo registrado en otra unidad que la del catálogo (%): hay que llevar ese lote a cero antes de contar.',
      v_insumo.codigo_interno, v_insumo.unidad_medida
      using errcode = 'check_violation';
  end if;

  v_diferencia := p_cantidad - v_total;

  insert into comercial.conteos_inventario
    (insumo_id, unidad, cantidad_contada, saldo_previo, provisorio, observacion)
  values
    (p_insumo_id, v_insumo.unidad_medida, p_cantidad, v_total, p_provisorio, nullif(btrim(p_observacion), ''))
  returning id into v_conteo;

  if v_diferencia = 0 then
    return 0;
  end if;

  v_motivo := case when p_provisorio then 'Saldo provisorio' else 'Conteo físico' end
              || format(': %s %s contados, había %s', p_cantidad, v_insumo.unidad_medida, v_total)
              || coalesce('. ' || nullif(btrim(p_observacion), ''), '');

  -- Sobra, o falta y el saldo de apertura alcanza: un ajuste sobre ese lote.
  if v_diferencia > 0 or v_en_apertura + v_diferencia >= 0 then
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
       documento_tipo, documento_id)
    values
      (v_articulo, v_lote.id, v_lote.deposito_actual_id,
       case when v_diferencia > 0 then 'ENTRADA_AJUSTE' else 'SALIDA_AJUSTE' end::comercial.tipo_movimiento_enum,
       v_diferencia, v_motivo, 'DIFERENCIA_DE_INVENTARIO', 'CONTEO', v_conteo);
    return v_diferencia;
  end if;

  -- Falta más de lo que hay en el saldo de apertura: se vacía ese y el resto
  -- sale de los demás lotes con saldo, del más viejo al más nuevo.
  v_resto := -v_diferencia;
  for r in
    select s.lote_insumo_id, s.deposito_id, s.saldo
      from comercial.v_saldos_stock s
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and s.saldo > 0
     order by (s.lote_insumo_id = v_lote.id and s.deposito_id = v_lote.deposito_actual_id) desc,
              l.creado_en, s.deposito_id
  loop
    exit when v_resto <= 0;
    v_toma := least(v_resto, r.saldo);
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
       documento_tipo, documento_id)
    values
      (v_articulo, r.lote_insumo_id, r.deposito_id, 'SALIDA_AJUSTE', -v_toma, v_motivo,
       'DIFERENCIA_DE_INVENTARIO', 'CONTEO', v_conteo);
    v_resto := v_resto - v_toma;
  end loop;

  return v_diferencia;
end;
$$;

comment on function comercial.registrar_conteo(uuid, numeric, text, boolean) is
  'Lleva el saldo de un insumo a lo contado, sin recepción: registra el conteo y ajusta la diferencia sobre su lote de '
  'saldo de apertura (lo crea si no hay); si falta más de lo que ese lote tiene, descuenta el resto de los demás lotes, '
  'del más viejo al más nuevo. DT, ADM, GERENCIA y GP. p_provisorio marca una estimación que todavía hay que contar.';
revoke execute on function comercial.registrar_conteo(uuid, numeric, text, boolean) from public, anon;
grant execute on function comercial.registrar_conteo(uuid, numeric, text, boolean) to authenticated;
