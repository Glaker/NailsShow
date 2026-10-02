-- ---------------------------------------------------------------------------
-- Propósito : Ajustes de la central de Ventas pedidos el 2026-10-01, antes de
--             ponerla en servicio:
--               1. Al enviar un pedido de venta, lo disponible en Calle 5 se
--                  reserva siempre (deja de ser opcional).
--               2. La salida de producto terminado elige lotes con
--                  gmp.lote_despachable(): un lote bloqueado no sale.
--               3. «Enviado» de la encargada de Calle 5: si manda distinto de
--                  lo pendiente, queda registrado qué se pedía y qué salió,
--                  con motivo.
--               4. La factura de un pedido de venta toma lo despachado real.
--               5. La escala de descuento por monto tiene fecha de vigencia.
-- Reglas    : RN-51, RN-52 (vía gmp, CLAUDE.md §4), RN-50 (auditoría), RN-54
--             (el libro de movimientos no se edita), RN-59 (precio del
--             renglón), §4.12.1 (escala versionada).
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Enviar reserva siempre
-- ===========================================================================
--
-- POR QUÉ RESERVAR SIEMPRE (y no recalcular al armar): con la reserva
-- opcional, lo que una venta «toma» de Calle 5 sin reservar lo puede vender
-- otra venta o la salida de mostrador antes de que se arme, y lo que se mandó
-- a Producción queda corto sin que nadie se entere. Recalcular al armar y
-- avisar a Ventas resuelve lo mismo con más estados, más avisos y una ventana
-- en la que dos personas creen tener el mismo stock. Reservar al enviar es una
-- regla, la hace cumplir la base, y la encargada arma exactamente lo reservado.
-- Si Ventas necesita soltar algo, la reserva se libera con motivo
-- (comercial.liberar_reserva_pt), como cualquier otra.

drop function comercial.enviar_venta(uuid, boolean);

create function comercial.enviar_venta(p_pedido_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  r        record;
  v_disp   numeric;
  v_falta  numeric := 0;
  v_s      uuid;
  v_numero text;
begin
  if not core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') then
    raise exception 'Enviar un pedido de venta es de Ventas.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  if v_pedido.estado <> 'BORRADOR' then
    raise exception 'El pedido % ya se envió.', v_pedido.numero using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  -- Dos ventas que se envían a la vez no pueden tomar el mismo stock.
  perform pg_advisory_xact_lock(hashtext('comercial.enviar_venta'));

  for r in
    select id, producto_id, cantidad from comercial.pedido_renglones
     where pedido_id = p_pedido_id and not anulado
  loop
    select coalesce(disponible, 0) into v_disp
      from comercial.v_disponible_calle5 where producto_id = r.producto_id;
    v_disp := coalesce(v_disp, 0);
    update comercial.pedido_renglones
       set de_calle5  = least(r.cantidad, v_disp),
           a_producir = r.cantidad - least(r.cantidad, v_disp)
     where id = r.id;
    v_falta := v_falta + (r.cantidad - least(r.cantidad, v_disp));
  end loop;

  update comercial.pedidos
     set estado = 'CONFIRMADO', gestionado_por = coalesce(gestionado_por, core.usuario_actual())
   where id = p_pedido_id;

  if v_falta > 0 then
    perform pg_advisory_xact_lock(hashtext('comercial.numero_pedido_stock'));
    select format('S-%s', lpad((coalesce(max(substring(numero from '^S-(\d+)$')::int), 0) + 1)::text, 4, '0'))
      into v_numero from comercial.pedidos where numero ~ '^S-\d+$';
    insert into comercial.pedidos (numero, cliente, fecha_entrega, observaciones, para_stock,
                                   destino_deposito_id, para_pedido_id)
    values (v_numero, format('Para %s — %s', v_pedido.numero, v_pedido.cliente), v_pedido.fecha_entrega,
            format('Lo que falta del pedido de venta %s. Al terminar en Calle 5 queda reservado para él.', v_pedido.numero),
            true, (select id from gmp.depositos where numero = 'C5'), p_pedido_id)
    returning id into v_s;
    insert into comercial.pedido_renglones (pedido_id, producto_id, cantidad)
    select v_s, producto_id, a_producir from comercial.pedido_renglones
     where pedido_id = p_pedido_id and not anulado and a_producir > 0;
    update comercial.pedidos set estado = 'CONFIRMADO' where id = v_s;
  end if;

  -- Lo que se arma de Calle 5 queda reservado para esta venta.
  perform comercial.reservar_venta(p_pedido_id);

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_s, 'pedido_stock', v_numero);
end;
$$;

comment on function comercial.enviar_venta(uuid) is
  'Envía un pedido de venta: compara cada renglón contra lo disponible en Calle 5, reserva lo que hay y manda lo que '
  'falta a Producción en un pedido de stock S-xxxx para él.';

grant execute on function comercial.enviar_venta(uuid) to authenticated;

-- ===========================================================================
-- 2. Reparto por lote con gmp.lote_despachable()
-- ===========================================================================
--
-- Copia de la vigente (20260930160000) con la pregunta cambiada: el lote que
-- no es despachable (no liberado, vencido o bloqueado) no se toma para una
-- venta ni para Calle 5. El mensaje de por qué sigue saliendo de gmp.

create or replace function comercial.asignar_lotes_pt(
  p_producto_id      uuid,
  p_deposito_id      uuid,
  p_cantidad         numeric,
  p_solo_despachable boolean
)
returns table (orden_id uuid, cantidad numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  r        record;
  v_rest   numeric := p_cantidad;
  v_total  numeric := 0;
  v_toma   numeric;
begin
  for r in
    select m.orden_id as lote, sum(m.cantidad) as saldo, o.vencimiento
      from comercial.movimientos_pt m
      left join gmp.ordenes_produccion o on o.id = m.orden_id
     where m.producto_id = p_producto_id and m.deposito_id = p_deposito_id
     group by m.orden_id, o.vencimiento
    having sum(m.cantidad) > 0
     order by (m.orden_id is not null), o.vencimiento, m.orden_id
  loop
    v_total := v_total + r.saldo;
    continue when v_rest <= 0;
    continue when p_solo_despachable and r.lote is not null and not gmp.lote_despachable(r.lote);
    v_toma := least(v_rest, r.saldo);
    orden_id := r.lote;
    cantidad := v_toma;
    return next;
    v_rest := v_rest - v_toma;
  end loop;

  if v_rest > 0 then
    if p_solo_despachable and v_total >= p_cantidad then
      raise exception
        'Hay % unidades, pero solo % se pueden vender: el resto es de lotes no liberados, vencidos o bloqueados.',
        v_total, p_cantidad - v_rest
        using errcode = 'check_violation';
    end if;
    raise exception 'No alcanza el stock: hay % unidades y salen %.', v_total, p_cantidad
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ===========================================================================
-- 3. «Enviado»: lo que se pedía y lo que salió
-- ===========================================================================

create table comercial.despacho_diferencias (
  id           uuid primary key default gen_random_uuid(),
  despacho_id  uuid not null references comercial.despachos_pt(id),
  pedido_id    uuid not null references comercial.pedidos(id),
  producto_id  uuid not null references gmp.productos(id),
  pendiente    numeric(14,4) not null check (pendiente >= 0),
  enviado      numeric(14,4) not null check (enviado >= 0),
  motivo       text not null check (length(btrim(motivo)) > 0),
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now(),
  constraint despacho_diferencias_distinto check (pendiente <> enviado)
);

comment on table comercial.despacho_diferencias is
  'Cuando quien arma un pedido manda distinto de lo pendiente: por producto, lo que se pedía (valor anterior), lo que '
  'salió (valor nuevo) y por qué. Append-only; el despacho y sus movimientos por lote quedan en despachos_pt y '
  'movimientos_pt.';

create or replace function comercial.enviar_armado(
  p_pedido_id  uuid,
  p_renglones  jsonb,
  p_motivo     text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_despacho uuid;
  v_dif      integer;
begin
  -- Lo pendiente antes de despachar, contra lo que se manda ahora.
  create temporary table if not exists pg_temp.armado_dif (
    producto_id uuid, pendiente numeric, enviado numeric
  ) on commit drop;
  delete from pg_temp.armado_dif;
  insert into pg_temp.armado_dif
  select pd.producto_id, pd.pendiente,
         coalesce((select sum((x ->> 'cantidad')::numeric)
                     from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) x
                    where (x ->> 'producto_id')::uuid = pd.producto_id), 0)
    from comercial.v_pendientes_despacho pd
   where pd.pedido_id = p_pedido_id and pd.pendiente > 0;

  select count(*) into v_dif from pg_temp.armado_dif where enviado <> pendiente;
  if v_dif > 0 and length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Mandás distinto de lo pedido en % producto(s): escribí por qué (fallado, no hay, lo pidió el cliente…).', v_dif
      using errcode = 'check_violation';
  end if;

  v_despacho := comercial.despachar_pedido(
    p_pedido_id,
    (select coalesce(jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', enviado)), '[]'::jsonb)
       from pg_temp.armado_dif where enviado > 0),
    'C5',
    exists (select 1 from pg_temp.armado_dif where enviado < pendiente),
    nullif(btrim(p_motivo), ''));

  insert into comercial.despacho_diferencias (despacho_id, pedido_id, producto_id, pendiente, enviado, motivo)
  select v_despacho, p_pedido_id, producto_id, pendiente, enviado, btrim(p_motivo)
    from pg_temp.armado_dif where enviado <> pendiente;

  return v_despacho;
end;
$$;

comment on function comercial.enviar_armado(uuid, jsonb, text) is
  '«Enviado» de la encargada de Calle 5: despacha lo que se manda (por lote, con gmp.lote_despachable) y, si difiere '
  'de lo pendiente, registra producto por producto lo que se pedía y lo que salió, con motivo obligatorio.';

alter table comercial.despacho_diferencias enable row level security;
alter table comercial.despacho_diferencias force  row level security;
grant select, insert on comercial.despacho_diferencias to authenticated;
grant execute on function comercial.enviar_armado(uuid, jsonb, text) to authenticated;

create policy despacho_diferencias_select_authenticated on comercial.despacho_diferencias
  for select to authenticated using (core.rol() is not null);
comment on policy despacho_diferencias_select_authenticated on comercial.despacho_diferencias is
  'Ventas, Administración y Producción ven qué cambió en el armado de cada pedido.';
create policy despacho_diferencias_insert_stock on comercial.despacho_diferencias
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS')
              and registrado_por = core.usuario_actual());
comment on policy despacho_diferencias_insert_stock on comercial.despacho_diferencias is
  'Los mismos roles que despachan (comercial.despachar_pedido). Append-only.';

select core.adjuntar_auditoria('comercial.despacho_diferencias');

-- ===========================================================================
-- 4. La factura de una venta toma lo despachado
-- ===========================================================================
--
-- Copia de la vigente (20260930150000) con un cambio: en un pedido de venta,
-- la base de cada alícuota es Σ min(cantidad, despachado) × precio_unitario. Lo
-- despachado se cuenta igual que en comercial.v_pendientes_despacho: salidas de
-- venta del pedido. Sin nada despachado, no se factura.

create or replace function comercial.preparar_factura(p_pedido_id uuid, p_emisor_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_cliente  comercial.clientes%rowtype;
  v_config   comercial.configuracion_fiscal%rowtype;
  v_factura  comercial.facturas%rowtype;
  v_clase    text;
  v_sin_precio integer;
  v_vigentes integer;
  v_neto     numeric(16,2);
  v_iva      numeric(16,2);
  v_alic     jsonb;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Emitir facturas es de Administración, Gerencia o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'El pedido no existe.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('factura|' || p_pedido_id::text, 0));

  select * into v_factura from comercial.facturas
   where pedido_id = p_pedido_id and estado = 'PENDIENTE' and comprobante = 'FACTURA';
  if found then
    return comercial.fn_factura_para_arca(v_factura.id);
  end if;

  if exists (
       select 1 from comercial.facturas f
        where f.pedido_id = p_pedido_id and f.comprobante = 'FACTURA' and f.estado = 'AUTORIZADA'
          and not exists (select 1 from comercial.facturas nc
                           where nc.factura_asociada_id = f.id and nc.estado = 'AUTORIZADA')) then
    raise exception 'El pedido % ya tiene una factura autorizada. Para refacturarlo, anulala con una nota de crédito.', v_pedido.numero
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

  if p_emisor_id is null then
    select count(*) into v_vigentes from comercial.configuracion_fiscal where vigente;
    if v_vigentes = 0 then
      raise exception 'No hay configuración fiscal vigente (ambiente, CUIT y punto de venta).';
    elsif v_vigentes > 1 then
      raise exception 'Hay % emisores vigentes: elegí a nombre de quién se factura.', v_vigentes
        using errcode = 'check_violation';
    end if;
    select * into v_config from comercial.configuracion_fiscal where vigente;
  else
    select * into v_config from comercial.configuracion_fiscal where id = p_emisor_id and vigente;
    if not found then
      raise exception 'Ese emisor no está vigente.' using errcode = 'check_violation';
    end if;
  end if;

  v_clase := comercial.clase_factura(v_config.condicion_iva, v_cliente.condicion_iva);

  with despachado as (
    select m.producto_id, coalesce(sum(-m.cantidad), 0) as cantidad
      from comercial.movimientos_pt m
     where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'SALIDA_VENTA'
     group by m.producto_id
  ),
  por_alicuota as (
    select r.alicuota_iva,
           round(sum(case when v_pedido.es_venta
                          then least(r.cantidad, coalesce(d.cantidad, 0))
                          else r.cantidad end * r.precio_unitario), 2) as base
      from comercial.pedido_renglones r
      left join despachado d on d.producto_id = r.producto_id
     where r.pedido_id = p_pedido_id and not r.anulado
     group by r.alicuota_iva
  ),
  calculado as (
    select alicuota_iva, base, round(base * alicuota_iva / 100, 2) as importe
      from por_alicuota where base > 0
  )
  select sum(base), sum(importe),
         jsonb_agg(jsonb_build_object(
           'Id', comercial.alicuota_iva_arca(alicuota_iva),
           'BaseImp', base, 'Importe', importe, 'alicuota', alicuota_iva)
           order by alicuota_iva)
    into v_neto, v_iva, v_alic
    from calculado;

  if coalesce(v_neto, 0) <= 0 then
    if v_pedido.es_venta then
      raise exception 'Del pedido % todavía no salió nada: la factura toma lo despachado.', v_pedido.numero
        using errcode = 'check_violation';
    end if;
    raise exception 'El pedido suma $0: no se factura.' using errcode = 'check_violation';
  end if;

  if v_clase = 'C' then
    v_neto := v_neto + v_iva;
    v_iva  := 0;
    v_alic := '[]'::jsonb;
  end if;

  insert into comercial.facturas (
    pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta,
    receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva,
    importe_neto, importe_iva, importe_total, alicuotas
  ) values (
    p_pedido_id, v_cliente.id, v_config.ambiente, v_config.cuit_emisor, v_clase,
    comercial.codigo_comprobante_arca(v_clase, 'FACTURA'), v_config.punto_venta,
    comercial.tipo_documento_arca(v_cliente.tipo_documento), v_cliente.numero_documento,
    comercial.condicion_iva_arca(v_cliente.condicion_iva),
    v_neto, v_iva, v_neto + v_iva, v_alic
  ) returning * into v_factura;

  return comercial.fn_factura_para_arca(v_factura.id);
end;
$$;

-- ===========================================================================
-- 5. Escala de descuentos con vigencia
-- ===========================================================================
--
-- Rige la carga más reciente cuya vigencia ya empezó. Cambiar la escala es
-- cargar una entera nueva con su fecha; la anterior queda. La de la planilla
-- (carga 1) es provisoria: ver PENDIENTES.md.

alter table comercial.escalas_descuento
  add column vigente_desde date not null default current_date;

create or replace view comercial.v_escala_descuento
with (security_invoker = true) as
select desde_monto, porcentaje, cargado_en, vigente_desde, carga
  from comercial.escalas_descuento
 where carga = (select carga from comercial.escalas_descuento
                 where vigente_desde <= current_date
                 order by vigente_desde desc, carga desc
                 limit 1)
 order by desde_monto;

comment on view comercial.v_escala_descuento is
  'Escala de descuento por monto que rige hoy: la última carga con vigencia ya empezada.';
