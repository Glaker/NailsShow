-- ---------------------------------------------------------------------------
-- Propósito : Permisos del rol VENTAS (20260929140000). Puede: cargar y editar
--             pedidos y sus productos, borrar un pedido no terminado, dar de
--             alta clientes (también tercerizados), facturar, reservar y
--             despachar producto terminado de Calle 5, y ver cobros y cuentas
--             corrientes de clientes. No puede: terminar pedidos ni pasarlos a
--             producción, anotar compras, recibir mercadería, tocar fórmulas,
--             calidad, tesorería ni pagos.
-- Reglas    : §3.3 (matriz de permisos), §5 del documento de Administración
--             («Ventas: información comercial y cobranzas»). Ítem 8 de la cola
--             del 2026-09-24; D-31.
-- Fecha     : 2026-09-29
-- ---------------------------------------------------------------------------
--
-- CÓMO SE HIZO.
-- Lista explícita, política por política y función por función, en vez de
-- darle a VENTAS todo lo de GERENCIA_PRODUCCION: ese rol termina pedidos y
-- consume insumos, que es producción. Las políticas se cambian con ALTER
-- POLICY (conservan nombre y comentario); las funciones con control propio se
-- copian de su versión vigente cambiando solo la lista de roles.
--
-- LA CUENTA DE MATIAS NO SE TOCA ACÁ. Cambiarle el rol es un acto de
-- administración de usuarios (pantalla Usuarios), no de migración.

-- ===========================================================================
-- 1. Políticas
-- ===========================================================================

alter policy pedidos_escribe on comercial.pedidos
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'));
alter policy pedidos_actualiza on comercial.pedidos
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'));

alter policy renglones_escribe on comercial.pedido_renglones
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'));
alter policy renglones_actualiza on comercial.pedido_renglones
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'))
  with check (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'));
alter policy renglones_borra on comercial.pedido_renglones
  using (core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS'));

alter policy clientes_insert_comercial on comercial.clientes
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'VENTAS'));
alter policy clientes_update_comercial on comercial.clientes
  using (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'VENTAS'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'VENTAS'));

alter policy facturas_insert_emisores on comercial.facturas
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS'));
alter policy facturas_update_emisores on comercial.facturas
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS'));

-- Matias da de alta clientes tercerizados desde el pedido (ítem 2 de la cola).
alter policy terceros_insert_pedidos on gmp.terceros
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA', 'VENTAS'));
alter policy terceros_update_pedidos on gmp.terceros
  using (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA', 'VENTAS'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA', 'DIRECCION_TECNICA', 'VENTAS'));

-- Calle 5: Silveira y Mati deciden a quién va el stock (ítem 21).
alter policy reservas_pt_insert_stock on comercial.reservas_pt
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS')
              and creado_por = core.usuario_actual());
alter policy reservas_pt_update_stock on comercial.reservas_pt
  using (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS'))
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS'));
alter policy despachos_pt_insert_stock on comercial.despachos_pt
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS'));
alter policy movimientos_pt_insert_stock on comercial.movimientos_pt
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS'));

-- Cobranzas: las ve (cuenta corriente de clientes); registrarlas es de
-- Administración, que maneja las cuentas de fondos.
alter policy cobros_cliente_select_administracion on comercial.cobros_cliente
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS'));
alter policy imputaciones_cobro_select_administracion on comercial.imputaciones_cobro
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS'));

-- ===========================================================================
-- 2. Funciones con control de rol propio (copia de la versión vigente; solo
--    cambia la lista de roles)
-- ===========================================================================

-- De 20260924170000.
CREATE OR REPLACE FUNCTION comercial.preparar_factura(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_cliente  comercial.clientes%rowtype;
  v_config   comercial.configuracion_fiscal%rowtype;
  v_factura  comercial.facturas%rowtype;
  v_clase    text;
  v_sin_precio integer;
  v_neto     numeric(16,2);
  v_iva      numeric(16,2);
  v_alic     jsonb;
  v_items    jsonb;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Emitir facturas es de Administración, Gerencia o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'El pedido no existe.';
  end if;

  -- Reintento: la pendiente vuelve tal cual, con su número si ya lo tenía.
  select * into v_factura from comercial.facturas
   where pedido_id = p_pedido_id and estado = 'PENDIENTE';
  if found then
    return comercial.fn_factura_para_arca(v_factura.id);
  end if;

  if exists (select 1 from comercial.facturas where pedido_id = p_pedido_id and estado = 'AUTORIZADA') then
    raise exception 'El pedido % ya tiene una factura autorizada.', v_pedido.numero
      using errcode = 'unique_violation';
  end if;
  if v_pedido.estado in ('BORRADOR', 'CANCELADO') then
    raise exception 'No se factura un pedido en %.', v_pedido.estado using errcode = 'check_violation';
  end if;
  if v_pedido.cliente_id is null then
    raise exception 'El pedido % no tiene cliente del padrón: asignale uno con su condición frente al IVA.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  select * into v_cliente from comercial.clientes where id = v_pedido.cliente_id;
  if not v_cliente.activo then
    raise exception 'El cliente % está desactivado.', v_cliente.razon_social using errcode = 'check_violation';
  end if;

  select count(*) into v_sin_precio
    from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado and precio_unitario is null;
  if v_sin_precio > 0 then
    raise exception 'El pedido tiene % renglón(es) sin precio.', v_sin_precio using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  select * into v_config from comercial.configuracion_fiscal where vigente;
  if not found then
    raise exception 'No hay configuración fiscal vigente (ambiente, CUIT y punto de venta).';
  end if;

  v_clase := comercial.clase_factura(v_cliente.condicion_iva);

  -- Importes por alícuota, redondeados a centavos por alícuota: ARCA exige
  -- que ImpTotal = ImpNeto + ImpIVA y que cada AlicIva cierre con su base.
  with por_alicuota as (
    select r.alicuota_iva,
           round(sum(r.cantidad * r.precio_unitario), 2) as base
      from comercial.pedido_renglones r
     where r.pedido_id = p_pedido_id and not r.anulado
     group by r.alicuota_iva
  ),
  calculado as (
    select alicuota_iva, base, round(base * alicuota_iva / 100, 2) as importe
      from por_alicuota
  )
  select sum(base), sum(importe),
         jsonb_agg(jsonb_build_object(
           'Id', comercial.alicuota_iva_arca(alicuota_iva),
           'BaseImp', base, 'Importe', importe, 'alicuota', alicuota_iva)
           order by alicuota_iva)
    into v_neto, v_iva, v_alic
    from calculado;

  if v_neto <= 0 then
    raise exception 'El pedido suma $0: no se factura.' using errcode = 'check_violation';
  end if;

  insert into comercial.facturas (
    pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta,
    receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva,
    importe_neto, importe_iva, importe_total, alicuotas
  ) values (
    p_pedido_id, v_cliente.id, v_config.ambiente, v_config.cuit_emisor, v_clase,
    comercial.codigo_comprobante_arca(v_clase), v_config.punto_venta,
    comercial.tipo_documento_arca(v_cliente.tipo_documento), v_cliente.numero_documento,
    comercial.condicion_iva_arca(v_cliente.condicion_iva),
    v_neto, v_iva, v_neto + v_iva, v_alic
  ) returning * into v_factura;

  return comercial.fn_factura_para_arca(v_factura.id);
end;
$function$;

-- De 20260924170000.
create or replace function comercial.eliminar_pedido(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA', 'VENTAS') then
    raise exception 'Tu rol no puede borrar pedidos.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % ya estaba borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado = 'CUMPLIDO' then
    raise exception 'El pedido % está terminado: su consumo ya bajó el stock y no se borra.', v_pedido.numero
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.facturas
              where pedido_id = p_pedido_id and estado in ('AUTORIZADA', 'PENDIENTE')) then
    raise exception 'El pedido % tiene una factura emitida o en curso: se anula con nota de crédito, no se borra.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  -- Lo que el pedido tenía apartado o pedido deja de estarlo.
  update comercial.reservas_stock set liberada = true
   where pedido_id = p_pedido_id and not liberada;
  update comercial.avisos_compra set estado = 'DESCARTADO'
   where pedido_id = p_pedido_id and estado = 'PENDIENTE';

  -- Un pedido ya cancelado se puede borrar igual: solo se marca.
  if v_pedido.estado = 'CANCELADO' then
    update comercial.pedidos
       set eliminado_en = now(), eliminado_por = core.usuario_actual(),
           motivo_eliminacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_pedido_id;
  else
    update comercial.pedidos
       set estado = 'CANCELADO',
           eliminado_en = now(), eliminado_por = core.usuario_actual(),
           motivo_eliminacion = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = p_pedido_id;
  end if;
end;
$$;

-- De 20260929110100.
create or replace function comercial.despachar_pedido(
  p_pedido_id     uuid,
  p_renglones     jsonb,
  p_deposito      text default 'C5',
  p_con_faltantes boolean default false,
  p_observacion   text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  v_dep       uuid;
  v_despacho  uuid;
  r           record;
  res         record;
  v_pend      numeric;
  v_restante  numeric;
  v_toma      numeric;
  v_n         integer := 0;
  v_queda     numeric;
begin
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS') then
    raise exception 'Tu rol no despacha pedidos.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.eliminado_en is not null then
    raise exception 'El pedido % está borrado.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.para_stock then
    raise exception 'Un pedido para stock no se despacha: su producción queda en el depósito.' using errcode = 'check_violation';
  end if;
  if v_pedido.tercero_id is not null then
    raise exception 'Los pedidos tercerizados no pasan por el depósito de Nail Show.' using errcode = 'check_violation';
  end if;
  if v_pedido.entregado_en is not null then
    raise exception 'El pedido % ya se entregó completo.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION', 'CUMPLIDO') then
    raise exception 'Se despacha un pedido enviado (este está %).', v_pedido.estado using errcode = 'check_violation';
  end if;

  select id into v_dep from gmp.depositos where numero = p_deposito and numero in ('C5', 'PTF') and activo;
  if v_dep is null then
    raise exception 'Se despacha desde Calle 5 (C5) o desde la fábrica (PTF).' using errcode = 'check_violation';
  end if;

  -- Lo que va a quedar pendiente, antes de escribir la cabecera.
  select coalesce(sum(v.pendiente), 0) - coalesce(sum(least(v.pendiente, greatest(s.cantidad, 0))), 0)
    into v_queda
    from comercial.v_pendientes_despacho v
    left join (select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
                 from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e group by 1) s
      on s.producto_id = v.producto_id
   where v.pedido_id = p_pedido_id;

  insert into comercial.despachos_pt (pedido_id, deposito_id, con_faltantes, observacion)
  values (p_pedido_id, v_dep, v_queda > 0, nullif(btrim(p_observacion), ''))
  returning id into v_despacho;

  for r in
    select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::numeric) as cantidad
      from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) e
     group by 1
  loop
    if r.cantidad is null or r.cantidad < 0 then
      raise exception 'Una cantidad a despachar no es válida.' using errcode = 'check_violation';
    end if;
    continue when r.cantidad = 0;

    select pendiente into v_pend from comercial.v_pendientes_despacho
     where pedido_id = p_pedido_id and producto_id = r.producto_id;
    if v_pend is null then
      raise exception 'El pedido % no lleva ese producto.', v_pedido.numero using errcode = 'check_violation';
    end if;
    if r.cantidad > v_pend then
      raise exception 'De % quedan % por despachar en el pedido %: no salen %.',
        (select nombre from gmp.productos where id = r.producto_id), v_pend, v_pedido.numero, r.cantidad
        using errcode = 'check_violation';
    end if;

    -- Primero lo reservado para este pedido, después lo del cliente.
    v_restante := r.cantidad;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_pt
       where deposito_id = v_dep and producto_id = r.producto_id and not liberada and cantidad > consumido
         and (pedido_id = p_pedido_id
              or (pedido_id is null and cliente_id is not null and cliente_id = v_pedido.cliente_id))
       order by (pedido_id is null), creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_pt set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;

    insert into comercial.movimientos_pt
      (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, despacho_id)
    values
      (r.producto_id, v_dep, 'SALIDA_VENTA', -r.cantidad,
       format('Despacho del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id, v_despacho);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Elegí qué sale y cuánto.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(pendiente), 0) into v_queda
    from comercial.v_pendientes_despacho where pedido_id = p_pedido_id;

  if v_queda > 0 and not coalesce(p_con_faltantes, false) then
    raise exception 'Quedan % unidades sin despachar: marcá el despacho «con faltantes» o completá las cantidades.', v_queda
      using errcode = 'check_violation';
  end if;

  if v_queda = 0 then
    update comercial.reservas_pt
       set liberada = true, liberada_en = now(), liberada_por = core.usuario_actual(),
           motivo_liberacion = format('Pedido %s entregado completo.', v_pedido.numero)
     where pedido_id = p_pedido_id and not liberada;
    update comercial.pedidos
       set entregado_en = now(), entregado_por = core.usuario_actual(), estado = 'CUMPLIDO'
     where id = p_pedido_id;
  end if;

  return v_despacho;
end;
$$;

-- De 20260929110100: Ventas pasa por la política general de pedidos, no por
-- la de entrega.
create or replace function comercial.fn_pedido_entrega_solo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Quien tiene la política general de pedidos no pasa por acá.
  if core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS') then
    return new;
  end if;
  if old.entregado_en is not null or new.entregado_en is null or new.estado <> 'CUMPLIDO'
     or (to_jsonb(new) - array['entregado_en','entregado_por','estado'])
        is distinct from (to_jsonb(old) - array['entregado_en','entregado_por','estado']) then
    raise exception 'Desde el depósito solo se marca la entrega de un pedido despachado.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from comercial.v_pendientes_despacho where pedido_id = new.id and pendiente > 0) then
    raise exception 'Al pedido % le quedan productos por despachar.', new.numero using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
