-- ---------------------------------------------------------------------------
-- Propósito : «Borrar pedido» y «Quitar producto» del pedido en borrador, sin
--             borrar filas: el pedido queda eliminado (fuera de toda bandeja,
--             con quién, cuándo y por qué) y el renglón queda anulado (deja de
--             contar para faltantes, consumo y factura).
-- Reglas    : Invariante 1 y auditoría genérica (core.fn_auditoria rechaza
--             todo DELETE en tablas de negocio: la corrección es un registro
--             que lo dice), RN-50, §5.7 del alcance (circuito del pedido).
--             Pedido del codirector técnico del 2026-09-24: «poné una opción
--             de borrar pedido».
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- POR QUÉ NO ES UN DELETE.
-- El trigger de auditoría de todas las tablas de negocio rechaza el DELETE
-- desde la fase 1 (y por eso el botón «quitar producto» fallaba). Para quien
-- usa la pantalla el resultado es el mismo: el pedido desaparece. Para un
-- inspector queda la fila, marcada, con su autor.
--
-- Las cinco funciones de abajo son copia de su versión vigente
-- (pg_get_functiondef) con un único cambio cada una: ignorar los renglones
-- anulados.

-- ===========================================================================
-- 1. Renglón anulado
-- ===========================================================================

alter table comercial.pedido_renglones
  add column anulado     boolean not null default false,
  add column anulado_en  timestamptz,
  add column anulado_por uuid references core.usuarios(id);

comment on column comercial.pedido_renglones.anulado is
  'Producto quitado del pedido en borrador. La fila queda (no se borra) y deja de contar en todo cálculo.';

-- El mismo producto puede volver a agregarse después de quitarlo.
alter table comercial.pedido_renglones
  drop constraint pedido_renglones_pedido_id_producto_id_key;
create unique index pedido_renglones_vigente_idx
  on comercial.pedido_renglones (pedido_id, producto_id) where not anulado;

create or replace function comercial.fn_renglon_anulado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.anulado then
    raise exception 'Ese producto ya se quitó del pedido: si hace falta, agregalo de nuevo.'
      using errcode = 'restrict_violation';
  end if;
  if new.anulado then
    new.anulado_en  := now();
    new.anulado_por := core.usuario_actual();
  end if;
  return new;
end;
$$;

-- Corre después de trg_renglon_en_borrador (orden alfabético), que ya exige
-- que el pedido esté en borrador para tocar sus productos.
create trigger trg_renglon_anulado
  before update on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_anulado();

-- ===========================================================================
-- 2. Pedido eliminado
-- ===========================================================================

alter table comercial.pedidos
  add column eliminado_en       timestamptz,
  add column eliminado_por      uuid references core.usuarios(id),
  add column motivo_eliminacion text;

comment on column comercial.pedidos.eliminado_en is
  'Pedido borrado por el usuario: queda CANCELADO y fuera de toda bandeja. No se borra la fila.';

alter table comercial.pedidos
  add constraint pedidos_eliminado_cancelado check (eliminado_en is null or estado = 'CANCELADO');

create or replace function comercial.eliminar_pedido(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
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

comment on function comercial.eliminar_pedido(uuid, text) is
  'Borra un pedido que no está terminado ni facturado: lo cancela y lo marca eliminado, libera sus reservas y '
  'descarta sus avisos de compra pendientes. La fila queda para la trazabilidad.';

grant execute on function comercial.eliminar_pedido(uuid, text) to authenticated;

-- ===========================================================================
-- 3. Los cálculos ignoran los renglones anulados
-- ===========================================================================

CREATE OR REPLACE FUNCTION comercial.necesidad_pedido(p_pedido_id uuid)
 RETURNS TABLE(insumo_id uuid, necesario numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    m.insumo_id,
    case
      when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
        then ceil(sum(r.cantidad * m.cantidad_por_unidad / (1 - m.merma)))
      else round(sum(r.cantidad * m.cantidad_por_unidad / (1 - m.merma)), 4)
    end
  from comercial.pedido_renglones r
  join gmp.materiales_acondicionamiento m
    on m.producto_id = r.producto_id and m.activo
  join gmp.insumos_catalogo i on i.id = m.insumo_id
  where r.pedido_id = p_pedido_id
    and not r.anulado
  group by m.insumo_id, i.unidad_medida;
$function$;

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
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION') then
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

CREATE OR REPLACE FUNCTION comercial.fn_pedido_transicion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
    -- Un pedido cancelado todavía se puede marcar borrado (20260924170000).
    if old.estado = 'CANCELADO' and old.eliminado_en is null and new.eliminado_en is not null
       and (to_jsonb(new) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion')
         = (to_jsonb(old) - 'eliminado_en' - 'eliminado_por' - 'motivo_eliminacion') then
      return new;
    end if;
    if old.cliente_id is null and new.cliente_id is not null
       and (to_jsonb(new) - 'cliente_id') = (to_jsonb(old) - 'cliente_id') then
      return new;
    end if;
    raise exception 'El pedido % está cerrado (%) y no se modifica.', old.numero, old.estado
      using errcode = 'restrict_violation';
  end if;

  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'BORRADOR'      and new.estado in ('CONFIRMADO', 'CANCELADO'))
      or (old.estado = 'CONFIRMADO'    and new.estado in ('BORRADOR', 'EN_PRODUCCION', 'CUMPLIDO', 'CANCELADO'))
      or (old.estado = 'EN_PRODUCCION' and new.estado in ('CUMPLIDO', 'CANCELADO'))
    ) then
      raise exception 'Un pedido no pasa de % a %.', old.estado, new.estado
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CONFIRMADO'
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id and not anulado) then
      raise exception 'No se envía a producción un pedido sin productos.'
        using errcode = 'check_violation';
    end if;

    if new.estado = 'CUMPLIDO'
       and not exists (select 1 from comercial.pedido_consumos where pedido_id = new.id) then
      raise exception 'Un pedido se termina con «Terminado», que registra lo consumido y baja el stock.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(p_pedido_id uuid, p_consumos jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  v_titular   uuid;
  v_propio    uuid;
  v_nombre_titular text;
  pos         record;
  res         record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Terminar un pedido es de Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;
  if v_pedido.estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se termina un pedido enviado o en producción (este está %).', v_pedido.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo,
             nullif(e ->> 'origen', '')        as origen
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      i.origen,
      c.nombre,
      c.unidad_medida,
      c.tercero_id                             as propio
    from teorico t
    full join informado i on i.insumo_id = t.insumo_id
    join gmp.insumos_catalogo c on c.id = coalesce(t.insumo_id, i.insumo_id)
    order by c.nombre
  loop
    if r.usada is null or r.usada < 0 then
      raise exception 'La cantidad usada de % no es válida.', r.nombre using errcode = 'check_violation';
    end if;
    if r.usada <> r.teorica and r.motivo is null then
      raise exception 'Usaste % % de % y la receta dice %: escribí el motivo de la diferencia.',
        r.usada, coalesce(r.unidad_medida, ''), r.nombre, r.teorica
        using errcode = 'check_violation';
    end if;
    if r.unidad_medida is null then
      raise exception 'El insumo % no tiene unidad de medida confirmada en el catálogo.', r.nombre
        using errcode = 'check_violation';
    end if;

    v_titular := case r.origen
                   when 'NAILSHOW' then null
                   when 'TERCERO'  then v_pedido.tercero_id
                   else comercial.origen_insumo(p_pedido_id, r.insumo_id)
                 end;
    if v_titular is not null and v_titular is distinct from v_pedido.tercero_id then
      raise exception 'No se consume material de un cliente tercerizado para otro (%).', r.nombre
        using errcode = 'check_violation';
    end if;
    if r.propio is not null and v_titular is distinct from r.propio then
      raise exception '«%» es propio del cliente tercerizado: sale de su stock.', r.nombre
        using errcode = 'check_violation';
    end if;
    v_nombre_titular := coalesce((select nombre from gmp.terceros where id = v_titular), 'Nail Show');

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia, tercero_id)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo, v_titular)
    returning id into v_consumo;

    continue when r.usada = 0;

    v_articulo := comercial.articulo_de_insumo(r.insumo_id);
    v_restante := r.usada;

    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo
         and s.saldo > 0
         and l.tercero_id is not distinct from v_titular
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from r.unidad_medida then
        raise exception
          'El lote de % está en % y la receta en %: no se puede descontar sin convertir.',
          r.nombre, pos.unidad, r.unidad_medida
          using errcode = 'check_violation';
      end if;

      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      raise exception
        'No alcanza el stock de % de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        v_nombre_titular, r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;

    -- Lo usado descuenta de las reservas del mismo titular para este cliente,
    -- de la que vence primero a la última.
    v_restante := r.usada;
    for res in
      select id, cantidad - consumido as pendiente
        from comercial.reservas_stock
       where insumo_id = r.insumo_id
         and tercero_id is not distinct from v_titular
         and para_tercero_id is not distinct from v_pedido.tercero_id
         and (pedido_id is null or pedido_id = p_pedido_id)
         and not liberada and vence_en > now()
       order by (pedido_id is null), vence_en, creado_en
       for update
    loop
      exit when v_restante <= 0;
      v_toma := least(v_restante, res.pendiente);
      update comercial.reservas_stock set consumido = consumido + v_toma where id = res.id;
      v_restante := v_restante - v_toma;
    end loop;
  end loop;

  -- Una reserva atada a este pedido no sobrevive al pedido.
  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;
end;
$function$;

CREATE OR REPLACE FUNCTION comercial.fn_pedido_tercero()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.tercero_id is not null
     and (tg_op = 'INSERT' or new.tercero_id is distinct from old.tercero_id)
     and not exists (select 1 from gmp.terceros where id = new.tercero_id and activo) then
    raise exception 'El cliente tercerizado no existe o está desactivado.' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.tercero_id is distinct from old.tercero_id then
    if old.estado <> 'BORRADOR' then
      raise exception 'Para quién es el pedido se cambia en borrador (está %).', old.estado
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from comercial.pedido_renglones r
        join gmp.productos pr on pr.id = r.producto_id
       where r.pedido_id = new.id and not r.anulado and pr.tercero_id is not null
         and pr.tercero_id is distinct from new.tercero_id
    ) then
      raise exception 'El pedido tiene productos de otro cliente tercerizado: sacalos antes de cambiar el cliente.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.estado = 'EN_PRODUCCION' and old.estado <> 'EN_PRODUCCION' and new.tercero_id is not null
     and exists (
       select 1 from comercial.necesidad_pedido(new.id) n
        where not exists (select 1 from comercial.pedido_origen_insumos o
                           where o.pedido_id = new.id and o.insumo_id = n.insumo_id)
     ) then
    raise exception 'Un pedido tercerizado pasa a producción eligiendo de qué stock sale cada insumo («Pasar a producción»).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;
