-- ---------------------------------------------------------------------------
-- Propósito : Notas de crédito de venta (anulación total de una factura
--             autorizada, que habilita refacturar el pedido) y varios
--             emisores vigentes a la vez, cada uno con su condición frente al
--             IVA: el que es monotributista emite C.
-- Reglas    : RN-56 (el comprobante autorizado no se toca: se corrige con una
--             nota de crédito vinculada), RN-55 (numeración por emisor, punto
--             de venta y tipo), RN-57 (clase según emisor y receptor), RN-63
--             (imputación de cobros), RN-50. Invariante 8. D-37 (tres
--             emisores: Virginia Arleo, Athene del Plata, Nail Show SRL).
-- Fecha     : 2026-09-30
-- ---------------------------------------------------------------------------
--
-- LA NOTA DE CRÉDITO VA EN comercial.facturas.
-- Para ARCA es el mismo FECAESolicitar con otro código de comprobante y el
-- comprobante asociado (CbtesAsoc). Ponerla en la misma tabla reusa tal cual
-- la numeración sin carreras (facturas_una_en_vuelo_idx es por código), la
-- inmutabilidad, fijar_numero_factura, registrar_resultado_factura y la Edge
-- Function. `comprobante` distingue una de otra, y toda suma de facturas la
-- resta.
--
-- ALCANCE: NOTA DE CRÉDITO TOTAL. Anula la factura entera (mismos importes,
-- mismas alícuotas, mismo emisor y punto de venta). Es el caso de «la factura
-- salió mal»: se anula y el pedido se vuelve a facturar. La NC parcial
-- (devolución de una parte) no se pidió todavía.
--
-- FACTURA C. Un emisor monotributista (o exento) no discrimina IVA: ARCA
-- espera ImpNeto = total, ImpIVA = 0 y ningún AlicIva. El total es el mismo
-- que el de una A o B del mismo pedido (neto + IVA de los renglones): el
-- cliente paga el precio de lista. Es una suposición a confirmar en D-37.
--
-- VARIOS EMISORES. Deja de haber «una sola configuración vigente»: hay una
-- vigente por CUIT, todas del mismo ambiente. Si hay una sola, se usa sin
-- preguntar (como hasta hoy); si hay varias, quien factura elige.

-- ===========================================================================
-- 1. Emisores
-- ===========================================================================

alter table comercial.configuracion_fiscal
  add column razon_social  text,
  add column condicion_iva comercial.condicion_iva_enum;

update comercial.configuracion_fiscal
   set condicion_iva = 'RESPONSABLE_INSCRIPTO',
       razon_social  = coalesce(razon_social, 'Demostración Afip SDK (homologación)')
 where condicion_iva is null;

alter table comercial.configuracion_fiscal
  alter column condicion_iva set not null,
  add constraint configuracion_fiscal_condicion_emisor
    check (condicion_iva in ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'));

comment on column comercial.configuracion_fiscal.condicion_iva is
  'Condición del EMISOR frente al IVA. Responsable Inscripto emite A o B; Monotributo y Exento emiten C (RN-57).';

drop index comercial.configuracion_fiscal_una_vigente_idx;
create unique index configuracion_fiscal_un_emisor_vigente_idx
  on comercial.configuracion_fiscal (cuit_emisor) where vigente;

create or replace function comercial.fn_emisores_mismo_ambiente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vigente and exists (
       select 1 from comercial.configuracion_fiscal
        where vigente and id <> new.id and ambiente <> new.ambiente) then
    raise exception 'Hay emisores vigentes en otro ambiente: primero dalos de baja (vigente = false). Todos los vigentes van en el mismo ambiente.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_emisores_mismo_ambiente
  before insert or update on comercial.configuracion_fiscal
  for each row execute function comercial.fn_emisores_mismo_ambiente();

-- ===========================================================================
-- 2. Clase y código de comprobante
-- ===========================================================================

create or replace function comercial.codigo_comprobante_arca(p_clase text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_clase when 'A' then 1 when 'B' then 6 when 'C' then 11 end;
$$;

-- Códigos de FEParamGetTiposCbte: Factura A/B/C 1/6/11, Nota de Crédito A/B/C 3/8/13.
create function comercial.codigo_comprobante_arca(p_clase text, p_comprobante text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_comprobante
           when 'FACTURA'      then case p_clase when 'A' then 1 when 'B' then 6 when 'C' then 11 end
           when 'NOTA_CREDITO' then case p_clase when 'A' then 3 when 'B' then 8 when 'C' then 13 end
         end;
$$;

-- RN-57 con el emisor: el que no es Responsable Inscripto emite C.
create function comercial.clase_factura(
  p_emisor   comercial.condicion_iva_enum,
  p_receptor comercial.condicion_iva_enum
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_emisor = 'RESPONSABLE_INSCRIPTO' then comercial.clase_factura(p_receptor)
              else 'C' end;
$$;

comment on function comercial.clase_factura(comercial.condicion_iva_enum, comercial.condicion_iva_enum) is
  'RN-57: emisor Responsable Inscripto → A o B según el receptor (clase_factura de un argumento); Monotributo o Exento → C.';

-- ===========================================================================
-- 3. La nota de crédito en comercial.facturas
-- ===========================================================================

alter table comercial.facturas
  add column comprobante         text not null default 'FACTURA'
    check (comprobante in ('FACTURA', 'NOTA_CREDITO')),
  add column factura_asociada_id uuid references comercial.facturas(id),
  add column motivo              text;

comment on column comercial.facturas.comprobante is
  'FACTURA o NOTA_CREDITO. La nota de crédito anula la factura asociada entera (RN-56) y resta en toda suma.';

alter table comercial.facturas
  drop constraint facturas_tipo_check,
  drop constraint facturas_codigo_arca_check,
  drop constraint facturas_tipo_codigo,
  add constraint facturas_tipo_check check (tipo in ('A', 'B', 'C')),
  add constraint facturas_tipo_codigo
    check (codigo_arca = comercial.codigo_comprobante_arca(tipo, comprobante)),
  add constraint facturas_nota_credito_asociada check (
    (comprobante = 'NOTA_CREDITO') = (factura_asociada_id is not null)
    and (comprobante = 'FACTURA' or length(btrim(coalesce(motivo, ''))) > 0)
  );

-- Un pedido puede volver a facturarse después de anular su factura con una
-- NC, así que deja de valer «una sola autorizada por pedido» como índice. La
-- regla pasa a preparar_factura, bajo un lock por pedido. Lo que el índice
-- sigue garantizando: una sola factura en vuelo por pedido.
drop index comercial.facturas_un_pedido_idx;
create unique index facturas_una_pendiente_por_pedido_idx
  on comercial.facturas (pedido_id) where estado = 'PENDIENTE' and comprobante = 'FACTURA';

-- Una factura se anula una vez.
create unique index facturas_una_nota_credito_idx
  on comercial.facturas (factura_asociada_id) where estado in ('PENDIENTE', 'AUTORIZADA');

-- ===========================================================================
-- 4. Preparar la factura: con emisor
-- ===========================================================================
--
-- Copia de la versión vigente (20260929140100) con tres cambios: el emisor
-- (p_emisor_id, o el único vigente), la clase según emisor y receptor, y la
-- regla «ya facturado» que ahora admite refacturar lo anulado con NC.
-- La firma cambia, así que se reemplaza la función: PostgREST no elige entre
-- dos sobrecargas con el mismo primer argumento. La llamada vieja
-- ({p_pedido_id}) sigue andando por el DEFAULT.

drop function comercial.preparar_factura(uuid);

create function comercial.preparar_factura(p_pedido_id uuid, p_emisor_id uuid default null)
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

  -- Dos emisiones del mismo pedido a la vez: la segunda espera y ve la primera.
  perform pg_advisory_xact_lock(hashtextextended('factura|' || p_pedido_id::text, 0));

  -- Reintento: la pendiente vuelve tal cual, con su número si ya lo tenía.
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

  -- El emisor: el pedido o, si hay uno solo vigente, ése.
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

  -- Factura C: sin IVA discriminado, mismo total (ver encabezado).
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

grant execute on function comercial.preparar_factura(uuid, uuid) to authenticated;

-- ===========================================================================
-- 5. Preparar la nota de crédito
-- ===========================================================================

create function comercial.preparar_nota_credito(p_factura_id uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_f  comercial.facturas%rowtype;
  v_nc comercial.facturas%rowtype;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION', 'VENTAS') then
    raise exception 'Emitir notas de crédito es de Administración, Gerencia, Gerencia de Producción o Ventas.'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nota_credito|' || p_factura_id::text, 0));

  select * into v_f from comercial.facturas where id = p_factura_id;
  if not found then
    raise exception 'La factura no existe.';
  end if;

  -- Reintento: la pendiente vuelve tal cual.
  select * into v_nc from comercial.facturas
   where factura_asociada_id = p_factura_id and estado = 'PENDIENTE';
  if found then
    return comercial.fn_factura_para_arca(v_nc.id);
  end if;

  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Indicá por qué se anula la factura.' using errcode = 'check_violation';
  end if;
  if v_f.comprobante <> 'FACTURA' then
    raise exception 'Una nota de crédito no se anula con otra.' using errcode = 'check_violation';
  end if;
  if v_f.estado <> 'AUTORIZADA' then
    raise exception 'Solo se anula una factura autorizada (esta está %).', v_f.estado
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.facturas
              where factura_asociada_id = p_factura_id and estado = 'AUTORIZADA') then
    raise exception 'La factura ya tiene una nota de crédito autorizada.' using errcode = 'unique_violation';
  end if;

  insert into comercial.facturas (
    pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta,
    receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva,
    importe_neto, importe_iva, importe_total, alicuotas,
    comprobante, factura_asociada_id, motivo
  ) values (
    v_f.pedido_id, v_f.cliente_id, v_f.ambiente, v_f.cuit_emisor, v_f.tipo,
    comercial.codigo_comprobante_arca(v_f.tipo, 'NOTA_CREDITO'), v_f.punto_venta,
    v_f.receptor_doc_tipo, v_f.receptor_doc_numero, v_f.receptor_condicion_iva,
    v_f.importe_neto, v_f.importe_iva, v_f.importe_total, v_f.alicuotas,
    'NOTA_CREDITO', v_f.id, btrim(p_motivo)
  ) returning * into v_nc;

  return comercial.fn_factura_para_arca(v_nc.id);
end;
$$;

comment on function comercial.preparar_nota_credito(uuid, text) is
  'RN-56: deja PENDIENTE la nota de crédito que anula entera una factura autorizada (mismos importes, emisor y punto '
  'de venta). La emite la Edge Function emitir-factura igual que una factura.';

grant execute on function comercial.preparar_nota_credito(uuid, text) to authenticated;

-- Lo que la Edge Function necesita: se agregan el comprobante y, en la NC, el
-- comprobante asociado (CbtesAsoc de FECAESolicitar).
create or replace function comercial.fn_factura_para_arca(p_factura_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'factura_id',       f.id,
    'pedido_numero',    p.numero,
    'ambiente',         f.ambiente,
    'cuit_emisor',      f.cuit_emisor,
    'punto_venta',      f.punto_venta,
    'tipo',             f.tipo,
    'codigo_arca',      f.codigo_arca,
    'numero',           f.numero,
    'fecha',            to_char(f.fecha, 'YYYYMMDD'),
    'doc_tipo',         f.receptor_doc_tipo,
    'doc_numero',       f.receptor_doc_numero,
    'condicion_iva',    f.receptor_condicion_iva,
    'importe_neto',     f.importe_neto,
    'importe_iva',      f.importe_iva,
    'importe_total',    f.importe_total,
    'alicuotas',        f.alicuotas,
    'comprobante',      f.comprobante,
    'asociado',         case when a.id is null then null else jsonb_build_object(
                          'codigo_arca', a.codigo_arca,
                          'punto_venta', a.punto_venta,
                          'numero',      a.numero,
                          'cuit_emisor', a.cuit_emisor,
                          'fecha',       to_char(a.fecha, 'YYYYMMDD')) end
  )
  from comercial.facturas f
  join comercial.pedidos p on p.id = f.pedido_id
  left join comercial.facturas a on a.id = f.factura_asociada_id
  where f.id = p_factura_id;
$$;

-- ===========================================================================
-- 6. Cobros: no se imputan a una nota de crédito
-- ===========================================================================
--
-- Copia de la versión vigente (20260929130000) con un cambio: rechazar la NC.
-- Lo pendiente de la factura ya descuenta su NC (vista de abajo).

create or replace function comercial.fn_validar_imputacion_cobro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cobro comercial.cobros_cliente%rowtype;
  v_fac   comercial.facturas%rowtype;
  v_pend  numeric;
  v_usado numeric;
begin
  select * into v_cobro from comercial.cobros_cliente where id = new.cobro_id;
  select * into v_fac from comercial.facturas where id = new.factura_id for update;
  if v_cobro.anulado_en is not null then
    raise exception 'No se imputa un cobro anulado.' using errcode = 'check_violation';
  end if;
  if v_fac.comprobante <> 'FACTURA' then
    raise exception 'Un cobro se imputa a una factura, no a una nota de crédito.' using errcode = 'check_violation';
  end if;
  if v_fac.estado <> 'AUTORIZADA' then
    raise exception 'Se imputa contra una factura autorizada.' using errcode = 'check_violation';
  end if;
  if v_fac.cliente_id <> v_cobro.cliente_id then
    raise exception 'La factura es de otro cliente que el cobro.' using errcode = 'check_violation';
  end if;
  select pendiente into v_pend from comercial.v_facturas_pendientes_cobro where factura_id = new.factura_id;
  if new.importe > coalesce(v_pend, 0) then
    raise exception 'RN-63: a la factura le quedan % por cobrar; no se imputan %.', coalesce(v_pend, 0), new.importe
      using errcode = 'check_violation';
  end if;
  select coalesce(sum(importe), 0) into v_usado from comercial.imputaciones_cobro where cobro_id = new.cobro_id;
  if v_usado + new.importe > v_cobro.importe then
    raise exception 'El cobro es de % y ya tiene % imputados.', v_cobro.importe, v_usado using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 7. Las sumas restan la nota de crédito
-- ===========================================================================
--
-- Copias de 20260929120000/130000. Las columnas nuevas van al final
-- (create or replace view no admite otra cosa).

create or replace view comercial.v_facturas_pendientes_cobro
with (security_invoker = true) as
select f.id as factura_id, f.cliente_id, f.pedido_id, f.ambiente, f.tipo, f.punto_venta, f.numero, f.fecha,
       f.importe_total,
       coalesce(im.total, 0) as cobrado,
       greatest(f.importe_total - coalesce(im.total, 0) - coalesce(nc.total, 0), 0) as pendiente,
       ((now() at time zone 'America/Argentina/Buenos_Aires')::date - f.fecha) as dias,
       coalesce(nc.total, 0) as acreditado
  from comercial.facturas f
  left join lateral (
    select sum(i.importe) as total from comercial.imputaciones_cobro i
      join comercial.cobros_cliente c on c.id = i.cobro_id and c.anulado_en is null
     where i.factura_id = f.id
  ) im on true
  left join lateral (
    select sum(n.importe_total) as total from comercial.facturas n
     where n.factura_asociada_id = f.id and n.estado = 'AUTORIZADA'
  ) nc on true
 where f.estado = 'AUTORIZADA' and f.comprobante = 'FACTURA';

create or replace view comercial.v_cuenta_corriente_clientes
with (security_invoker = true) as
select f.cliente_id, f.fecha, f.creado_en as momento, 'FACTURA' as movimiento, f.tipo as detalle_tipo,
       lpad(f.punto_venta::text, 4, '0') || '-' || lpad(coalesce(f.numero, 0)::text, 8, '0') as referencia,
       f.id as factura_id, null::uuid as cobro_id, f.importe_total as debe, 0::numeric as haber, f.ambiente::text as ambiente
  from comercial.facturas f
 where f.estado = 'AUTORIZADA' and f.comprobante = 'FACTURA'
union all
select f.cliente_id, f.fecha, f.creado_en, 'NOTA_CREDITO', f.tipo,
       lpad(f.punto_venta::text, 4, '0') || '-' || lpad(coalesce(f.numero, 0)::text, 8, '0'),
       f.id, null, 0, f.importe_total, f.ambiente::text
  from comercial.facturas f
 where f.estado = 'AUTORIZADA' and f.comprobante = 'NOTA_CREDITO'
union all
select c.cliente_id, c.fecha, c.registrado_en, 'COBRO', c.medio::text, coalesce(c.referencia, ''),
       null, c.id, 0, c.importe, null
  from comercial.cobros_cliente c
 where c.anulado_en is null;

create or replace view comercial.v_saldos_clientes
with (security_invoker = true) as
with fac as (
  select cliente_id,
         sum(importe_total - acreditado) filter (where ambiente = 'PRODUCCION') as facturado,
         sum(pendiente) filter (where ambiente = 'PRODUCCION') as pendiente,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias <= 30) as a_30,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias between 31 and 60) as a_60,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias between 61 and 90) as a_90,
         sum(pendiente) filter (where ambiente = 'PRODUCCION' and dias > 90) as mas_90,
         sum(pendiente) filter (where ambiente = 'HOMOLOGACION') as pendiente_homologacion
    from comercial.v_facturas_pendientes_cobro
   group by cliente_id
),
cob as (
  select c.cliente_id, sum(c.importe) as cobrado,
         sum(c.importe) - coalesce(sum(i.imputado), 0) as sin_imputar
    from comercial.cobros_cliente c
    left join lateral (select sum(importe) as imputado from comercial.imputaciones_cobro where cobro_id = c.id) i on true
   where c.anulado_en is null
   group by c.cliente_id
)
select cl.id as cliente_id, cl.razon_social, cl.condicion_iva,
       coalesce(f.facturado, 0) as facturado,
       coalesce(c.cobrado, 0)   as cobrado,
       coalesce(f.facturado, 0) - coalesce(c.cobrado, 0) as saldo,
       coalesce(f.pendiente, 0) as facturas_pendientes,
       coalesce(c.sin_imputar, 0) as cobrado_sin_imputar,
       coalesce(f.a_30, 0) as a_30, coalesce(f.a_60, 0) as a_60, coalesce(f.a_90, 0) as a_90,
       coalesce(f.mas_90, 0) as mas_90,
       coalesce(f.pendiente_homologacion, 0) as pendiente_homologacion
  from comercial.clientes cl
  left join fac f on f.cliente_id = cl.id
  left join cob c on c.cliente_id = cl.id
 where f.cliente_id is not null or c.cliente_id is not null;

create or replace view comercial.v_ventas_mensuales
with (security_invoker = true) as
select date_trunc('month', f.fecha)::date as periodo, f.cliente_id, cl.razon_social as cliente, f.ambiente::text as ambiente,
       count(*) filter (where f.comprobante = 'FACTURA') as facturas,
       sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_neto  else f.importe_neto  end) as neto,
       sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_iva   else f.importe_iva   end) as iva,
       sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_total else f.importe_total end) as total
  from comercial.facturas f
  join comercial.clientes cl on cl.id = f.cliente_id
 where f.estado = 'AUTORIZADA'
 group by 1, 2, 3, 4;

create or replace view comercial.v_resultado_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when comprobante = 'NOTA_CREDITO' then -importe_neto else importe_neto end) as ventas_netas
    from comercial.facturas where estado = 'AUTORIZADA' and ambiente = 'PRODUCCION' group by 1
),
compras as (
  select date_trunc('month', fecha)::date as periodo,
         sum(case when tipo = 'FACTURA_A' then importe_neto + coalesce(importe_otros, 0)
                  when tipo = 'NOTA_CREDITO_A' then -(importe_neto + coalesce(importe_otros, 0))
                  when tipo::text like 'NOTA_CREDITO%' then -coalesce(importe_total, 0)
                  else coalesce(importe_total, 0) end) as compras
    from comercial.comprobantes_proveedor where anulado_en is null group by 1
),
gastos as (
  select date_trunc('month', fecha)::date as periodo, -sum(importe) as otros_egresos
    from comercial.movimientos_fondos
   where tipo in ('EGRESO', 'AJUSTE') and importe < 0 and pago_id is null and cobro_id is null and anula_a_id is null
   group by 1
)
select coalesce(v.periodo, c.periodo, g.periodo) as periodo,
       coalesce(v.ventas_netas, 0)  as ventas_netas,
       coalesce(c.compras, 0)       as compras,
       coalesce(g.otros_egresos, 0) as otros_egresos,
       coalesce(v.ventas_netas, 0) - coalesce(c.compras, 0) - coalesce(g.otros_egresos, 0) as resultado
  from ventas v
  full join compras c on c.periodo = v.periodo
  full join gastos g on g.periodo = coalesce(v.periodo, c.periodo);

create or replace view comercial.v_iva_mensual
with (security_invoker = true) as
with ventas as (
  select date_trunc('month', f.fecha)::date as periodo,
         sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_iva else f.importe_iva end)
           filter (where f.ambiente = 'PRODUCCION')   as debito,
         sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_iva else f.importe_iva end)
           filter (where f.ambiente = 'HOMOLOGACION') as debito_homologacion,
         sum(case when f.comprobante = 'NOTA_CREDITO' then -f.importe_neto else f.importe_neto end)
           filter (where f.ambiente = 'PRODUCCION')  as neto_ventas
    from comercial.facturas f
   where f.estado = 'AUTORIZADA'
   group by 1
),
compras as (
  select date_trunc('month', c.fecha)::date as periodo,
         sum(case when c.tipo = 'FACTURA_A' then c.importe_iva
                  when c.tipo = 'NOTA_CREDITO_A' then -c.importe_iva else 0 end) as credito,
         sum(case when c.tipo in ('FACTURA_A') then c.importe_neto
                  when c.tipo = 'NOTA_CREDITO_A' then -c.importe_neto else 0 end) as neto_compras_a,
         sum(c.importe_total) filter (where c.tipo in ('FACTURA_B', 'FACTURA_C')) as compras_sin_iva_discriminado,
         sum(c.importe_total) filter (where c.tipo = 'SIN_FACTURA')             as compras_sin_factura
    from comercial.comprobantes_proveedor c
   where c.anulado_en is null
   group by 1
)
select coalesce(v.periodo, c.periodo) as periodo,
       coalesce(v.debito, 0)                         as debito_fiscal,
       coalesce(c.credito, 0)                        as credito_fiscal,
       coalesce(v.debito, 0) - coalesce(c.credito, 0) as posicion,
       coalesce(v.neto_ventas, 0)                    as neto_ventas,
       coalesce(c.neto_compras_a, 0)                 as neto_compras_a,
       coalesce(c.compras_sin_iva_discriminado, 0)   as compras_sin_iva_discriminado,
       coalesce(c.compras_sin_factura, 0)            as compras_sin_factura,
       coalesce(v.debito_homologacion, 0)            as debito_homologacion
  from ventas v
  full join compras c on c.periodo = v.periodo;
