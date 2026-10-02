-- ---------------------------------------------------------------------------
-- Propósito : Central de pedidos de Ventas (pedido del 2026-10-01): el pedido
--             mayorista como en la planilla «PEDIDOS MAYORISTAS» y la lista
--             46.14, con el monto calculado solo, el descuento por monto
--             aplicado al pedido entero, la comparación contra Calle 5, lo que
--             falta mandado a Producción y el visto bueno de stock de la
--             encargada de Calle 5.
-- Reglas    : RN-59 (el renglón guarda su precio), §4.12.1 (precios y escalas
--             versionados, append-only), RN-50 (auditoría), RN-51 (lo que se
--             despacha sigue pasando por despachar_pedido y el lote liberado).
-- Fecha     : 2026-10-01
-- ---------------------------------------------------------------------------
--
-- LISTA MAYORISTA. Es otra lista que la de consumidor final (precios_producto):
-- precio de lista y precio con promoción por UNIDAD, IVA incluido, y cuántas
-- unidades trae el pack. Si el producto se vende por pack («80PACK» trae 6), el
-- precio del pack es unidades × precio con promoción, y el renglón se carga en
-- packs, que es la unidad del stock de ese código. Si no, `minimo` es la
-- cantidad mínima sugerida (la planilla la marca y no la impone).
--
-- PRECIO BASE = precio con promoción (respuesta de la Gerencia, 2026-10-01).
-- DESCUENTO POR MONTO. La planilla suma Σ cantidad × pack × precio con promo y,
-- según ese total, descuenta 0/20/25/30/35 % del pedido entero (fórmula IFS de
-- la celda H342). Es una escala versionada: cambiarla es cargar otra. Ventas
-- puede fijar otro porcentaje para un pedido; vacío = el de la escala.
-- El precio final por unidad redondea a pesos como la columna I de la planilla.
--
-- CALLE 5. Al enviar, cada renglón se compara contra lo disponible en Calle 5
-- (saldo − reservado − lo que otros pedidos de venta ya tomaron sin reservar).
-- Lo que hay queda «de Calle 5»; lo que falta va a Producción en un pedido de
-- stock S-xxxx con destino Calle 5 y `para_pedido_id` apuntando a la venta.
-- Reservar lo que hay es opcional y lo decide Ventas (al enviar o después).
-- Cuando Producción termina el S-xxxx en Calle 5, eso queda reservado para el
-- pedido de venta, hasta lo que le falte.

-- ===========================================================================
-- 1. Lista mayorista y escala de descuentos
-- ===========================================================================

create table comercial.lista_mayorista (
  id                 uuid primary key default gen_random_uuid(),
  orden              bigint generated always as identity,
  producto_id        uuid not null references gmp.productos(id),
  numero_lista       text not null,
  rubro              text,
  orden_lista        integer,
  precio_lista       numeric(14,2) not null check (precio_lista >= 0),
  precio_promo       numeric(14,2) not null check (precio_promo >= 0),
  unidades_pack      integer not null default 1 check (unidades_pack >= 1),
  minimo             integer check (minimo is null or minimo >= 1),
  es_regalo          boolean not null default false,
  alicuota_iva       numeric(5,2) not null default 21 check (alicuota_iva in (0, 10.5, 21, 27)),
  origen             text,
  cargado_por        uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en         timestamptz not null default now(),
  constraint lista_mayorista_promo_tope check (precio_promo <= precio_lista or precio_lista = 0),
  constraint lista_mayorista_regalo check (not es_regalo or precio_promo = 0)
);

comment on table comercial.lista_mayorista is
  'Lista de precios mayorista por producto (por unidad, IVA incluido), con unidades por pack y mínimo. '
  'Append-only: rige la última fila de cada producto.';

create index lista_mayorista_vigente_idx on comercial.lista_mayorista (producto_id, orden desc);

create view comercial.v_lista_mayorista
with (security_invoker = true) as
select distinct on (l.producto_id)
       l.producto_id, pr.codigo_interno, pr.nombre as producto, l.numero_lista, l.rubro, l.orden_lista,
       l.precio_lista, l.precio_promo, l.unidades_pack, l.minimo, l.es_regalo, l.alicuota_iva,
       l.unidades_pack * l.precio_promo as precio_base,
       l.cargado_en as vigente_desde
  from comercial.lista_mayorista l
  join gmp.productos pr on pr.id = l.producto_id
 order by l.producto_id, l.orden desc;

comment on view comercial.v_lista_mayorista is
  'Precio mayorista vigente por producto. precio_base = unidades del pack × precio con promoción: lo que vale una '
  'unidad del código (un pack si es un pack).';

create table comercial.escalas_descuento (
  id           uuid primary key default gen_random_uuid(),
  carga        integer not null,
  desde_monto  numeric(14,2) not null check (desde_monto >= 0),
  porcentaje   numeric(5,2) not null check (porcentaje between 0 and 100),
  cargado_por  uuid references core.usuarios(id) default core.usuario_actual(),
  cargado_en   timestamptz not null default now(),
  unique (carga, desde_monto)
);

comment on table comercial.escalas_descuento is
  'Descuento por monto del pedido mayorista. Rige la última carga entera; cambiar la escala es una carga nueva.';

create view comercial.v_escala_descuento
with (security_invoker = true) as
select desde_monto, porcentaje, cargado_en
  from comercial.escalas_descuento
 where carga = (select max(carga) from comercial.escalas_descuento)
 order by desde_monto;

create or replace function comercial.descuento_por_monto(p_monto numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select porcentaje from comercial.v_escala_descuento
      where desde_monto <= coalesce(p_monto, 0)
      order by desde_monto desc limit 1),
    0);
$$;

-- Escala de la lista 46.14 (celda H342):
-- IFS(<625000;0; <1000000;20; <1450000;25; <4616000;30; >4615000;35).
-- Mati la contó como «más de $1,4 M, 30 %»; rige la fórmula de la planilla.
insert into comercial.escalas_descuento (carga, desde_monto, porcentaje) values
  (1, 0, 0),
  (1, 625000, 20),
  (1, 1000000, 25),
  (1, 1450000, 30),
  (1, 4616000, 35);

-- ===========================================================================
-- 2. El pedido de venta
-- ===========================================================================

alter table comercial.pedidos
  add column es_venta        boolean not null default false,
  add column forma_pago      text,
  add column estado_pago     text not null default 'NO_PAGO'
    check (estado_pago in ('NO_PAGO', 'PARCIAL', 'PAGO')),
  add column destino_envio   text,
  add column gestionado_por  uuid references core.usuarios(id),
  add column descuento_pct   numeric(5,2) check (descuento_pct is null or descuento_pct between 0 and 100),
  add column reservar_calle5 boolean not null default false,
  add column stock_ok        boolean,
  add column stock_ok_por    uuid references core.usuarios(id),
  add column stock_ok_en     timestamptz,
  add column stock_nota      text,
  add column para_pedido_id  uuid references comercial.pedidos(id),
  add constraint pedidos_stock_ok_firmado check (
    (stock_ok is null and stock_ok_por is null and stock_ok_en is null)
    or (stock_ok is not null and stock_ok_por is not null and stock_ok_en is not null));

comment on column comercial.pedidos.es_venta is
  'Pedido cargado en la central de Ventas: se arma desde Calle 5 y lo que falta va a Producción en un S-xxxx.';
comment on column comercial.pedidos.descuento_pct is
  'Descuento del pedido entero. NULL = el de la escala por monto (comercial.descuento_por_monto).';
comment on column comercial.pedidos.para_pedido_id is
  'En un pedido de stock: el pedido de venta para el que se produce. Lo que entra a Calle 5 se le reserva.';
comment on column comercial.pedidos.stock_ok is
  'Visto bueno de la encargada de Calle 5: hay (true) o no hay (false) lo que el sistema dice. NULL = sin revisar.';

alter table comercial.pedido_renglones
  add column precio_base   numeric(14,2) check (precio_base is null or precio_base >= 0),
  add column precio_final  numeric(14,2) check (precio_final is null or precio_final >= 0),
  add column precio_manual boolean not null default false,
  add column de_calle5     numeric(14,4) check (de_calle5 is null or de_calle5 >= 0),
  add column a_producir    numeric(14,4) check (a_producir is null or a_producir >= 0),
  add constraint renglones_precio_manual check (not precio_manual or precio_final is not null);

comment on column comercial.pedido_renglones.precio_base is
  'Venta mayorista: precio de una unidad del código según la lista (pack × precio con promoción), IVA incluido.';
comment on column comercial.pedido_renglones.precio_final is
  'Venta mayorista: precio por unidad del código con el descuento del pedido, IVA incluido. Si precio_manual, lo '
  'escribió Ventas y no se recalcula.';
comment on column comercial.pedido_renglones.de_calle5 is
  'Al enviar: cuánto se arma desde Calle 5. a_producir es el resto, que va a Producción.';

-- El renglón de venta nuevo toma el precio de la lista mayorista.
create or replace function comercial.fn_renglon_precio_mayorista()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lista record;
begin
  if new.precio_base is not null
     or not exists (select 1 from comercial.pedidos where id = new.pedido_id and es_venta) then
    return new;
  end if;
  select precio_base, alicuota_iva into v_lista
    from comercial.v_lista_mayorista where producto_id = new.producto_id;
  if found then
    new.precio_base  := v_lista.precio_base;
    new.alicuota_iva := v_lista.alicuota_iva;
  end if;
  return new;
end;
$$;

-- «trg_renglon_precio_m…» corre después de «…_en_borrador» y antes de
-- «…_precio_sugerido» (orden alfabético); el sugerido de consumidor final
-- queda pisado por el recálculo de la venta.
create trigger trg_renglon_precio_mayorista
  before insert on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_precio_mayorista();

-- Recalcula precios de un pedido de venta en borrador: escala por monto sobre
-- Σ cantidad × precio_base, precio final por unidad redondeado a pesos.
create or replace function comercial.recalcular_venta(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_base   numeric;
  v_desc   numeric;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found or not v_pedido.es_venta or v_pedido.estado <> 'BORRADOR' then
    return;
  end if;
  select coalesce(sum(cantidad * coalesce(precio_base, 0)), 0) into v_base
    from comercial.pedido_renglones where pedido_id = p_pedido_id and not anulado;
  v_desc := coalesce(v_pedido.descuento_pct, comercial.descuento_por_monto(v_base));

  update comercial.pedido_renglones r
     set precio_final    = x.final,
         precio_unitario = round(x.final / (1 + r.alicuota_iva / 100), 4)
    from (select id,
                 case when precio_manual then precio_final
                      else round(round(precio_base / greatest(coalesce(
                             (select unidades_pack from comercial.v_lista_mayorista l
                               where l.producto_id = rr.producto_id), 1), 1)
                             * (1 - v_desc / 100), 0)
                           * coalesce((select unidades_pack from comercial.v_lista_mayorista l
                                        where l.producto_id = rr.producto_id), 1), 2)
                 end as final
            from comercial.pedido_renglones rr
           where rr.pedido_id = p_pedido_id and not rr.anulado
             and (rr.precio_manual or rr.precio_base is not null)) x
   where r.id = x.id
     and (r.precio_final is distinct from x.final
          or r.precio_unitario is distinct from round(x.final / (1 + r.alicuota_iva / 100), 4));
end;
$$;

comment on function comercial.recalcular_venta(uuid) is
  'Pedido de venta en borrador: aplica el descuento del pedido (el fijado o el de la escala) a cada renglón no '
  'manual. Precio final por unidad = redondeo a pesos de precio con promo × (1 − %), × unidades del pack.';

create or replace function comercial.fn_venta_recalcular()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- El recálculo actualiza renglones: sin esta guarda se llamaría a sí mismo.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform comercial.recalcular_venta(coalesce(new.pedido_id, old.pedido_id));
  return null;
end;
$$;

create trigger trg_venta_recalcular
  after insert or update on comercial.pedido_renglones
  for each row execute function comercial.fn_venta_recalcular();

create or replace function comercial.fn_venta_recalcular_cabecera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform comercial.recalcular_venta(new.id);
  return null;
end;
$$;

create trigger trg_venta_recalcular_cabecera
  after update of descuento_pct, es_venta on comercial.pedidos
  for each row execute function comercial.fn_venta_recalcular_cabecera();

-- ===========================================================================
-- 3. Lo disponible en Calle 5 para un pedido de venta
-- ===========================================================================

-- Lo que un pedido de venta ya tomó de Calle 5 sin reservarlo: de_calle5 que
-- todavía no salió ni quedó reservado. Cuenta como ocupado para los demás.
create view comercial.v_calle5_tomado_ventas
with (security_invoker = true) as
select pd.pedido_id, pd.producto_id,
       greatest(least(coalesce(r.de_calle5, 0), pd.pendiente) - pd.reservado_para_pedido, 0) as tomado
  from comercial.v_pendientes_despacho pd
  join comercial.pedidos p on p.id = pd.pedido_id and p.es_venta
  join (select pedido_id, producto_id, sum(de_calle5) as de_calle5
          from comercial.pedido_renglones where not anulado group by pedido_id, producto_id) r
    on r.pedido_id = pd.pedido_id and r.producto_id = pd.producto_id;

create view comercial.v_disponible_calle5
with (security_invoker = true) as
with saldo as (
  select m.producto_id, sum(m.cantidad) as en_calle5
    from comercial.movimientos_pt m
    join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
   group by m.producto_id
),
reservado as (
  select r.producto_id, sum(r.cantidad - r.consumido) as reservado
    from comercial.reservas_pt r
    join gmp.depositos d on d.id = r.deposito_id and d.numero = 'C5'
   where not r.liberada
   group by r.producto_id
),
tomado as (
  select producto_id, sum(tomado) as tomado from comercial.v_calle5_tomado_ventas group by producto_id
)
select s.producto_id,
       s.en_calle5,
       coalesce(rv.reservado, 0) as reservado,
       coalesce(t.tomado, 0)     as tomado_sin_reservar,
       greatest(s.en_calle5 - coalesce(rv.reservado, 0) - coalesce(t.tomado, 0), 0) as disponible
  from saldo s
  left join reservado rv on rv.producto_id = s.producto_id
  left join tomado t     on t.producto_id = s.producto_id;

comment on view comercial.v_disponible_calle5 is
  'Por producto: lo que hay en Calle 5, lo reservado, lo que otros pedidos de venta ya tomaron sin reservar, y lo '
  'disponible para un pedido nuevo.';

-- ===========================================================================
-- 4. Enviar un pedido de venta, reservar lo que se arma de Calle 5
-- ===========================================================================

create or replace function comercial.reservar_venta(p_pedido_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_pedido comercial.pedidos%rowtype;
  v_c5     uuid;
  v_n      integer;
begin
  select * into v_pedido from comercial.pedidos where id = p_pedido_id for update;
  if not found or not v_pedido.es_venta then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
  select id into v_c5 from gmp.depositos where numero = 'C5';
  -- Lo que este pedido tomó y todavía no reservó, hasta lo que hay libre.
  insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
  select t.producto_id, v_c5, p_pedido_id,
         least(t.tomado, greatest(coalesce(d.en_calle5, 0) - coalesce(d.reservado, 0), 0)),
         format('Reservado por Ventas para el pedido %s', v_pedido.numero)
    from comercial.v_calle5_tomado_ventas t
    left join comercial.v_disponible_calle5 d on d.producto_id = t.producto_id
   where t.pedido_id = p_pedido_id
     and least(t.tomado, greatest(coalesce(d.en_calle5, 0) - coalesce(d.reservado, 0), 0)) > 0;
  get diagnostics v_n = row_count;
  update comercial.pedidos set reservar_calle5 = true where id = p_pedido_id and not reservar_calle5;
  return v_n;
end;
$$;

comment on function comercial.reservar_venta(uuid) is
  'Reserva en Calle 5 lo que el pedido de venta arma de ahí y todavía no tiene reservado. Lo decide Ventas.';

create or replace function comercial.enviar_venta(p_pedido_id uuid, p_reservar boolean default false)
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

  if p_reservar then
    perform comercial.reservar_venta(p_pedido_id);
  end if;

  return jsonb_build_object('a_producir', v_falta, 'pedido_stock_id', v_s, 'pedido_stock', v_numero);
end;
$$;

comment on function comercial.enviar_venta(uuid, boolean) is
  'Envía un pedido de venta: compara cada renglón contra lo disponible en Calle 5, lo que falta va a Producción en '
  'un pedido de stock S-xxxx para él, y opcionalmente reserva lo que se arma de Calle 5.';

-- Lo que Producción termina en Calle 5 para un pedido de venta queda reservado
-- para ese pedido, hasta lo que le falte cubrir.
create or replace function comercial.fn_produccion_para_venta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venta  uuid;
  v_numero text;
  v_falta  numeric;
begin
  if new.tipo <> 'ENTRADA_PRODUCCION' or new.documento_tipo <> 'PEDIDO' or new.cantidad <= 0
     or not exists (select 1 from gmp.depositos where id = new.deposito_id and numero = 'C5') then
    return null;
  end if;
  select p.para_pedido_id into v_venta from comercial.pedidos p
   where p.id = new.documento_id and p.para_stock and p.para_pedido_id is not null;
  if v_venta is null then
    return null;
  end if;
  select numero into v_numero from comercial.pedidos where id = v_venta;
  select greatest(pd.pendiente - pd.reservado_para_pedido, 0) into v_falta
    from comercial.v_pendientes_despacho pd
   where pd.pedido_id = v_venta and pd.producto_id = new.producto_id;
  if coalesce(v_falta, 0) > 0 then
    insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
    values (new.producto_id, new.deposito_id, v_venta, least(new.cantidad, v_falta),
            format('Producido para el pedido de venta %s', v_numero));
  end if;
  return null;
end;
$$;

create trigger trg_produccion_para_venta
  after insert on comercial.movimientos_pt
  for each row execute function comercial.fn_produccion_para_venta();

-- ===========================================================================
-- 5. Visto bueno de stock de la encargada de Calle 5
-- ===========================================================================

create or replace function comercial.verificar_stock_pedido(p_pedido_id uuid, p_ok boolean, p_nota text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not core.es_rol('ENCARGADA_STOCK', 'GERENCIA') then
    raise exception 'El visto bueno de stock lo da la encargada de Calle 5.' using errcode = 'insufficient_privilege';
  end if;
  if p_ok is null then
    raise exception 'Decí si hay o no hay.' using errcode = 'check_violation';
  end if;
  if not p_ok and length(btrim(coalesce(p_nota, ''))) = 0 then
    raise exception 'Si no hay, escribí qué falta.' using errcode = 'check_violation';
  end if;
  update comercial.pedidos
     set stock_ok = p_ok, stock_ok_por = core.usuario_actual(), stock_ok_en = now(),
         stock_nota = nullif(btrim(p_nota), '')
   where id = p_pedido_id and es_venta;
  if not found then
    raise exception 'No es un pedido de venta.' using errcode = 'check_violation';
  end if;
end;
$$;

-- La encargada de stock pasa por esta guarda: además de marcar la entrega,
-- puede dar el visto bueno de stock. Copia de 20260929140100 con esa rama.
create or replace function comercial.fn_pedido_entrega_solo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if core.es_rol('GERENCIA_PRODUCCION', 'ADMINISTRACION', 'DIRECCION_TECNICA', 'VENTAS') then
    return new;
  end if;
  if (to_jsonb(new) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota'])
     = (to_jsonb(old) - array['stock_ok','stock_ok_por','stock_ok_en','stock_nota']) then
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

-- ===========================================================================
-- 6. La central: una fila por pedido de venta, como la planilla
-- ===========================================================================

create view comercial.v_ventas
with (security_invoker = true) as
with tot as (
  select pedido_id,
         sum(cantidad * coalesce(precio_base, 0))                     as importe_lista,
         sum(cantidad * coalesce(precio_final, 0))                    as importe_total,
         count(*)                                                     as productos,
         sum(cantidad)                                                as unidades,
         sum(coalesce(a_producir, 0))                                 as a_producir
    from comercial.pedido_renglones where not anulado group by pedido_id
),
pend as (
  select pedido_id, sum(pendiente) as pendiente, sum(despachado) as despachado
    from comercial.v_pendientes_despacho group by pedido_id
),
fac as (
  select distinct on (f.pedido_id) f.pedido_id, f.tipo, f.punto_venta, f.numero
    from comercial.facturas f
   where f.estado = 'AUTORIZADA' and f.comprobante = 'FACTURA'
     and not exists (select 1 from comercial.facturas nc
                      where nc.factura_asociada_id = f.id and nc.estado = 'AUTORIZADA')
   order by f.pedido_id, f.creado_en desc
)
select p.id, p.numero, p.fecha, p.cliente, p.cliente_id, p.estado, p.fecha_entrega,
       p.forma_pago, p.estado_pago, p.destino_envio, p.observaciones,
       p.gestionado_por, coalesce(g.nombre_completo, c.nombre_completo) as gestionado,
       p.descuento_pct,
       coalesce(p.descuento_pct, comercial.descuento_por_monto(coalesce(t.importe_lista, 0))) as descuento_aplicado,
       coalesce(t.importe_lista, 0) as importe_lista,
       coalesce(t.importe_total, 0) as importe_total,
       coalesce(t.productos, 0)     as productos,
       coalesce(t.a_producir, 0)    as a_producir,
       coalesce(pe.pendiente, 0)    as pendiente,
       coalesce(pe.despachado, 0)   as despachado,
       p.reservar_calle5, p.stock_ok, p.stock_nota, p.stock_ok_en,
       s.id as pedido_stock_id, s.numero as pedido_stock, s.estado as pedido_stock_estado,
       f.tipo as factura_tipo, f.punto_venta as factura_punto_venta, f.numero as factura_numero,
       p.entregado_en, p.creado_en
  from comercial.pedidos p
  left join tot t  on t.pedido_id = p.id
  left join pend pe on pe.pedido_id = p.id
  left join fac f  on f.pedido_id = p.id
  left join core.v_nomina g on g.id = p.gestionado_por
  left join core.v_nomina c on c.id = p.creado_por
  left join lateral (select id, numero, estado from comercial.pedidos x
                      where x.para_pedido_id = p.id and x.eliminado_en is null
                      order by x.creado_en desc limit 1) s on true
 where p.es_venta and p.eliminado_en is null;

comment on view comercial.v_ventas is
  'Central de pedidos de Ventas: una fila por pedido con las columnas de la planilla PEDIDOS MAYORISTAS (cliente, '
  'fecha, gestionado, forma de pago, factura, descuento, faltantes, pago, destino, importe con descuento).';

-- ===========================================================================
-- 7. Permisos y auditoría
-- ===========================================================================

alter table comercial.lista_mayorista   enable row level security;
alter table comercial.lista_mayorista   force  row level security;
alter table comercial.escalas_descuento enable row level security;
alter table comercial.escalas_descuento force  row level security;

grant select, insert on comercial.lista_mayorista, comercial.escalas_descuento to authenticated;
grant select on comercial.v_lista_mayorista, comercial.v_escala_descuento, comercial.v_calle5_tomado_ventas,
  comercial.v_disponible_calle5, comercial.v_ventas to authenticated;
grant execute on function comercial.descuento_por_monto(numeric), comercial.recalcular_venta(uuid),
  comercial.reservar_venta(uuid), comercial.enviar_venta(uuid, boolean),
  comercial.verificar_stock_pedido(uuid, boolean, text) to authenticated;

create policy lista_mayorista_select_authenticated on comercial.lista_mayorista
  for select to authenticated using (core.rol() is not null);
comment on policy lista_mayorista_select_authenticated on comercial.lista_mayorista is
  'La lista mayorista la consulta toda la empresa.';
create policy lista_mayorista_insert_ventas on comercial.lista_mayorista
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and cargado_por = core.usuario_actual());
comment on policy lista_mayorista_insert_ventas on comercial.lista_mayorista is
  'Ventas carga precios mayoristas nuevos. Append-only (§4.12.1).';

create policy escalas_descuento_select_authenticated on comercial.escalas_descuento
  for select to authenticated using (core.rol() is not null);
comment on policy escalas_descuento_select_authenticated on comercial.escalas_descuento is
  'Quien carga un pedido ve la escala que se le aplica.';
create policy escalas_descuento_insert_ventas on comercial.escalas_descuento
  for insert to authenticated
  with check (core.es_rol('VENTAS', 'ADMINISTRACION', 'GERENCIA') and cargado_por = core.usuario_actual());
comment on policy escalas_descuento_insert_ventas on comercial.escalas_descuento is
  'Ventas cambia la escala cargando una nueva entera. Append-only.';

select core.adjuntar_auditoria('comercial.lista_mayorista');
select core.adjuntar_auditoria('comercial.escalas_descuento');
