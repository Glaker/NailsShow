-- ---------------------------------------------------------------------------
-- Propósito : Cerrar el circuito del pedido: faltantes sumados de todos los
--             pedidos en curso, «Terminado» con baja automática de stock por
--             lote y registro de lo realmente consumido (con sus
--             correcciones), y control de estados del pedido en la base.
-- Reglas    : RN-51/RN-52 vía gmp.impedimento_consumo() (20260923120000),
--             RN-54 (el movimiento no se edita; el consumo tampoco), RN-50
--             (auditoría de toda escritura), §3.3 (Gerencia de Producción
--             registra la producción), §5.7 del alcance (circuito del pedido).
--             Criterio de lote: vencimiento más próximo, por decisión de la
--             conducción del proyecto (2026-09-23) mientras falte I.20.3
--             (D-05).
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- QUÉ SE DESTRABA.
-- `SALIDA_CONSUMO_PRODUCCION` estaba rechazado por comercial.fn_validar_movimiento
-- «a la espera del circuito de producción». Este es ese circuito, en su versión
-- mínima: un pedido terminado consume los insumos de su lista de materiales. El
-- movimiento solo se acepta si apunta a un renglón de comercial.pedido_consumos
-- y no excede lo que ese renglón declara, así que no se puede registrar un
-- consumo suelto que ningún pedido explique.
--
-- QUÉ NO RESUELVE.
-- No da entrada al stock del producto terminado (ENTRADA_PRODUCCION sigue
-- cerrado): eso arrastra lote de producto terminado y su numeración, que
-- bloquea I.40.25 (D-04). El pedido terminado baja insumos; el producto que
-- sale no se registra como existencia todavía.

-- ===========================================================================
-- 1. Disponible para producción
-- ===========================================================================
--
-- Antes contaba solo `saldo_aprobado`. Ahora cuenta lo que gmp dice que se
-- puede consumir, que incluye el saldo de apertura (R-05). La columna
-- `saldo_apertura` va al final porque `create or replace view` solo admite
-- agregar columnas, y sirve para que la pantalla diga cuánto del disponible
-- es material sin lote identificado.

create or replace view comercial.v_disponible_por_insumo
with (security_invoker = true) as
with posiciones as (
  select a.insumo_id, s.saldo, l.estado
    from comercial.v_saldos_stock s
    join comercial.articulos a  on a.id = s.articulo_id
    join gmp.lotes_insumo l     on l.id = s.lote_insumo_id
   where s.saldo > 0
     and gmp.lote_consumible(s.lote_insumo_id)
),
totales as (
  select insumo_id,
         sum(saldo)                                           as saldo,
         sum(saldo) filter (where estado = 'SALDO_APERTURA')  as saldo_apertura
    from posiciones
   group by insumo_id
)
select
  i.id                                                        as insumo_id,
  i.codigo_interno,
  i.nombre                                                    as insumo_nombre,
  coalesce(t.saldo, 0)                                        as saldo,
  coalesce(r.reservado, 0)                                    as reservado,
  greatest(coalesce(t.saldo, 0) - coalesce(r.reservado, 0), 0) as disponible,
  coalesce(t.saldo_apertura, 0)                               as saldo_apertura
from gmp.insumos_catalogo i
left join totales t                          on t.insumo_id = i.id
left join comercial.v_reservado_por_insumo r on r.insumo_id = i.id
where t.insumo_id is not null or r.insumo_id is not null;

comment on view comercial.v_disponible_por_insumo is
  'Lo que se puede usar en producción: saldo de lotes que gmp.lote_consumible() acepta (aprobados y saldo de '
  'apertura, sin vencer ni bloquear), menos lo reservado. `saldo_apertura` dice cuánto de eso no tiene lote identificado.';

-- ===========================================================================
-- 2. Necesidad de un pedido: una sola implementación
-- ===========================================================================
--
-- La usan la explosión (qué falta), la consolidación (qué falta sumando
-- pedidos) y el cierre (qué se consume en teoría). Tres cálculos separados de
-- la misma cuenta terminan dando tres números.
--
-- Los insumos que se cuentan por unidad se redondean hacia arriba: con merma,
-- 100 etiquetas al 2 % dan 102,04, y no se consume un 0,04 de etiqueta.

create or replace function comercial.necesidad_pedido(p_pedido_id uuid)
returns table (insumo_id uuid, necesario numeric)
language sql
stable
set search_path = ''
as $$
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
  group by m.insumo_id, i.unidad_medida;
$$;

comment on function comercial.necesidad_pedido(uuid) is
  'Insumos que consume un pedido según la lista de materiales vigente: cantidad × cantidad_por_unidad / (1 − merma). '
  'Única implementación del cálculo; la usan explotar_pedido, faltantes_en_curso y terminar_pedido.';

grant execute on function comercial.necesidad_pedido(uuid) to authenticated;

-- La explosión por pedido pasa a leer de ahí. Mismo contrato de antes.
create or replace function comercial.explotar_pedido(p_pedido_id uuid)
returns setof comercial.renglon_faltante
language sql
stable
set search_path = ''
as $$
  select
    n.insumo_id,
    i.codigo_interno,
    i.nombre,
    i.unidad_medida,
    n.necesario,
    coalesce(d.disponible, 0),
    round(greatest(n.necesario - coalesce(d.disponible, 0), 0), 4),
    pv.proveedor_id,
    pv.razon_social,
    pv.estado_aprobacion::text,
    pv.ultima_compra
  from comercial.necesidad_pedido(p_pedido_id) n
  join gmp.insumos_catalogo i on i.id = n.insumo_id
  left join comercial.v_disponible_por_insumo d on d.insumo_id = n.insumo_id
  left join lateral (
    select * from comercial.v_proveedores_por_insumo v
     where v.insumo_id = n.insumo_id and v.activo
     order by v.ultima_compra desc nulls last
     limit 1
  ) pv on true
  where n.necesario > coalesce(d.disponible, 0)
  order by i.nombre;
$$;

-- ===========================================================================
-- 3. Faltantes sumados de todos los pedidos en curso
-- ===========================================================================
--
-- Sumar los faltantes de cada pedido por separado da un número falso: cada
-- explosión compara contra el disponible entero, así que dos pedidos que
-- necesitan 60 de algo que hay 100 dan cero faltante cada uno cuando juntos
-- faltan 20. Acá se suma primero la necesidad y después se compara.
--
-- En curso = enviado a producción o en producción. El borrador todavía es de
-- quien lo carga y no compromete compras.

create or replace function comercial.faltantes_en_curso()
returns table (
  insumo_id        uuid,
  codigo_interno   text,
  insumo           text,
  unidad           text,
  necesario        numeric,
  disponible       numeric,
  saldo_apertura   numeric,
  faltante         numeric,
  proveedor_id     uuid,
  proveedor        text,
  proveedor_estado text,
  pedidos          jsonb
)
language sql
stable
set search_path = ''
as $$
  with por_pedido as (
    select p.id, p.numero, p.cliente, p.fecha_entrega, n.insumo_id, n.necesario
      from comercial.pedidos p
      cross join lateral comercial.necesidad_pedido(p.id) n
     where p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
  ),
  total as (
    select
      insumo_id,
      sum(necesario) as necesario,
      jsonb_agg(
        jsonb_build_object(
          'pedido_id', id, 'numero', numero, 'cliente', cliente,
          'fecha_entrega', fecha_entrega, 'necesario', necesario
        )
        order by fecha_entrega nulls last, numero
      ) as pedidos
    from por_pedido
    group by insumo_id
  )
  select
    t.insumo_id,
    i.codigo_interno,
    i.nombre,
    i.unidad_medida,
    t.necesario,
    coalesce(d.disponible, 0),
    coalesce(d.saldo_apertura, 0),
    round(t.necesario - coalesce(d.disponible, 0), 4),
    pv.proveedor_id,
    pv.razon_social,
    pv.estado_aprobacion::text,
    t.pedidos
  from total t
  join gmp.insumos_catalogo i on i.id = t.insumo_id
  left join comercial.v_disponible_por_insumo d on d.insumo_id = t.insumo_id
  left join lateral (
    select * from comercial.v_proveedores_por_insumo v
     where v.insumo_id = t.insumo_id and v.activo
     order by v.ultima_compra desc nulls last
     limit 1
  ) pv on true
  where t.necesario > coalesce(d.disponible, 0)
  order by i.nombre;
$$;

comment on function comercial.faltantes_en_curso() is
  'Faltantes de todos los pedidos enviados o en producción, sumando la necesidad antes de comparar con el disponible. '
  '`pedidos` detalla cuánto aporta cada pedido al total.';

grant execute on function comercial.faltantes_en_curso() to authenticated;

-- ===========================================================================
-- 4. Lo que se consumió de verdad
-- ===========================================================================
--
-- Un renglón por insumo y pedido: la cantidad que la lista de materiales
-- calculaba y la que se usó. Si difieren, el motivo es obligatorio: es la
-- diferencia la que hay que poder explicar después («se rompieron dos
-- envases», «se derramó alcohol»), no el número redondo.
--
-- No se edita ni se borra, igual que los movimientos que genera. Un consumo
-- mal registrado se corrige con un ajuste de inventario con su motivo.

create table comercial.pedido_consumos (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references comercial.pedidos(id),
  insumo_id         uuid not null references gmp.insumos_catalogo(id),
  unidad            text not null,
  cantidad_teorica  numeric(16,4) not null check (cantidad_teorica >= 0),
  cantidad_real     numeric(16,4) not null check (cantidad_real >= 0),
  motivo_diferencia text,
  registrado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en     timestamptz not null default now(),
  unique (pedido_id, insumo_id),
  constraint pedido_consumos_diferencia_explicada check (
    cantidad_real = cantidad_teorica
    or length(btrim(coalesce(motivo_diferencia, ''))) >= 3
  )
);

comment on table comercial.pedido_consumos is
  'Consumo real de cada insumo al terminar un pedido, junto al teórico de la lista de materiales. '
  'Sustento de los movimientos SALIDA_CONSUMO_PRODUCCION (documento_tipo = PEDIDO_CONSUMO).';

create index pedido_consumos_pedido_idx on comercial.pedido_consumos (pedido_id);

create or replace function comercial.fn_consumo_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'El consumo registrado de un pedido no se modifica. Si quedó mal, corresponde un ajuste de inventario con su motivo.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_consumo_inmutable
  before update or delete on comercial.pedido_consumos
  for each row execute function comercial.fn_consumo_inmutable();

-- Solo se registra consumo de un pedido abierto y enviado.
create or replace function comercial.fn_consumo_pedido_abierto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado comercial.estado_pedido_enum;
begin
  select estado into v_estado from comercial.pedidos where id = new.pedido_id;
  if v_estado not in ('CONFIRMADO', 'EN_PRODUCCION') then
    raise exception 'Solo se registra consumo de un pedido enviado o en producción (este está %).', v_estado
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_consumo_pedido_abierto
  before insert on comercial.pedido_consumos
  for each row execute function comercial.fn_consumo_pedido_abierto();

alter table comercial.pedido_consumos enable row level security;
alter table comercial.pedido_consumos force  row level security;

grant select, insert on comercial.pedido_consumos to authenticated;

create policy pedido_consumos_select_authenticated on comercial.pedido_consumos
  for select to authenticated using (core.rol() is not null);
comment on policy pedido_consumos_select_authenticated on comercial.pedido_consumos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy pedido_consumos_insert_produccion on comercial.pedido_consumos
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy pedido_consumos_insert_produccion on comercial.pedido_consumos is
  '§3.3: registrar lo producido es de Gerencia de Producción; DT como supervisión.';

select core.adjuntar_auditoria('comercial.pedido_consumos');

-- ===========================================================================
-- 5. Validación del movimiento: se habilita el consumo de producción
-- ===========================================================================
--
-- Copia textual de la versión de 20260910170000, salvo el tratamiento de
-- SALIDA_CONSUMO_PRODUCCION (marcado abajo). ENTRADA_PRODUCCION sigue cerrado.

create or replace function comercial.fn_validar_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articulo    comercial.articulos%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_deposito    gmp.depositos%rowtype;
  v_impedimento text;
  v_saldo       numeric(16,4);
  v_anulado     comercial.movimientos_stock%rowtype;
  v_consumo     comercial.pedido_consumos%rowtype;
  v_ya_bajado   numeric(16,4);
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
  -- Registrarlos sería aceptar un dato que ningún flujo produjo ni verificó.
  if new.tipo = 'ENTRADA_PRODUCCION' then
    raise exception
      'El tipo % exige lote de producto terminado, que todavía no existe (D-04).', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo in ('SALIDA_VENTA', 'ENTRADA_DEVOLUCION') then
    raise exception
      'El tipo % exige clientes y pedidos, que son de la fase comercial y todavía no existen.', new.tipo
      using errcode = 'feature_not_supported';
  end if;

  if new.tipo = 'SALIDA_RETIRO_MERCADO' then
    raise exception
      'El tipo SALIDA_RETIRO_MERCADO lo produce el módulo de retiro de mercado (PG.60.4), que todavía no existe. '
      'Para detener material hoy corresponde registrar un bloqueo en gmp.bloqueos_lote.'
      using errcode = 'feature_not_supported';
  end if;

  -- ---- Coherencia de las tres referencias ---------------------------------
  select * into v_articulo from comercial.articulos where id = new.articulo_id;
  if not found then
    raise exception 'El artículo % no existe.', new.articulo_id;
  end if;
  if not v_articulo.activo then
    raise exception 'El artículo % está desactivado y no admite movimientos.', v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id;
  if not found then
    raise exception 'El lote % no existe.', new.lote_insumo_id;
  end if;

  -- Mover un lote de otro insumo bajo este artículo desarma la trazabilidad
  -- entera sin que nada lo delate después.
  if v_lote.insumo_id <> v_articulo.insumo_id then
    raise exception
      'El lote % no pertenece al artículo % : es de otro insumo.',
      v_lote.numero_registro_interno, v_articulo.sku
      using errcode = 'check_violation';
  end if;

  select * into v_deposito from gmp.depositos where id = new.deposito_id;
  if not found then
    raise exception 'El depósito % no existe.', new.deposito_id;
  end if;
  if not v_deposito.activo then
    raise exception 'El depósito % está desactivado.', v_deposito.numero
      using errcode = 'check_violation';
  end if;

  -- La unidad la fija el lote, no quien carga el formulario.
  new.unidad := v_lote.unidad;
  -- Y el momento es ahora. Sin cierre de período (RN-61) no hay nada que
  -- impida antedatar un movimiento, así que la fecha no se ofrece.
  new.ocurrido_en := now();

  -- ---- RN-51 y RN-52 ------------------------------------------------------
  -- Solo sobre las salidas que sacan material bueno del circuito. El descarte
  -- y la transferencia quedan fuera a propósito: son justamente las vías por
  -- las que un lote rechazado o bloqueado tiene que poder moverse. Prohibirlas
  -- dejaría el material trabado en el depósito sin forma de sacarlo del medio.
  if new.tipo = 'SALIDA_MUESTRA' then
    v_impedimento := gmp.impedimento_despacho(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede disponer de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Consumo de producción (NUEVO en 20260923130000) --------------------
  -- Tiene que apuntar a un consumo registrado de un pedido, del mismo insumo,
  -- y entre todos sus movimientos no puede bajar más de lo declarado. Así no
  -- hay consumo sin pedido que lo explique, ni consumo que exceda al pedido.
  -- Qué lote se puede usar lo decide gmp (impedimento_consumo), no esto.
  if new.tipo = 'SALIDA_CONSUMO_PRODUCCION' then
    if new.documento_tipo is distinct from 'PEDIDO_CONSUMO' or new.documento_id is null then
      raise exception
        'El consumo de producción se registra terminando el pedido (comercial.terminar_pedido), no como movimiento suelto.'
        using errcode = 'check_violation';
    end if;

    select * into v_consumo from comercial.pedido_consumos where id = new.documento_id;
    if not found or v_consumo.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un consumo registrado de este insumo.'
        using errcode = 'check_violation';
    end if;

    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_consumo.id
       and tipo = 'SALIDA_CONSUMO_PRODUCCION';

    if v_ya_bajado - new.cantidad > v_consumo.cantidad_real then
      raise exception
        'El consumo registrado es de % % y los movimientos ya suman %: no se puede bajar más.',
        v_consumo.cantidad_real, v_consumo.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;

    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Anulación (RN-54) --------------------------------------------------
  if new.anula_a_movimiento_id is not null then
    select * into v_anulado
      from comercial.movimientos_stock
     where id = new.anula_a_movimiento_id;

    if not found then
      raise exception 'El movimiento que se pretende anular no existe.';
    end if;
    if v_anulado.anula_a_movimiento_id is not null then
      raise exception
        'No se anula una anulación. Si la corrección estuvo mal, corresponde un movimiento de ajuste con su motivo.'
        using errcode = 'check_violation';
    end if;
    if (new.articulo_id, new.lote_insumo_id, new.deposito_id)
       is distinct from
       (v_anulado.articulo_id, v_anulado.lote_insumo_id, v_anulado.deposito_id) then
      raise exception
        'El movimiento inverso tiene que caer sobre la misma posición (artículo, lote y depósito) que el que anula.'
        using errcode = 'check_violation';
    end if;
    if new.cantidad <> -v_anulado.cantidad then
      raise exception
        'El movimiento inverso tiene que ser exactamente el opuesto del original (% esperado, % recibido).',
        -v_anulado.cantidad, new.cantidad
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- El saldo no queda negativo -----------------------------------------
  -- Un saldo negativo no es un stock: es la prueba de que falta registrar algo.
  -- El bloqueo de aviso serializa las inserciones sobre la misma posición, así
  -- que dos salidas concurrentes no pueden colarse mirando el mismo saldo.
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.articulo_id::text || '|' || new.lote_insumo_id::text || '|' || new.deposito_id::text,
      0
    )
  );

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = new.articulo_id
     and lote_insumo_id = new.lote_insumo_id
     and deposito_id    = new.deposito_id;

  if v_saldo + new.cantidad < 0 then
    raise exception
      'El movimiento dejaría el saldo en % (hay % y se quieren mover %) para el lote % en el depósito %. '
      'Si la existencia física no coincide con la registrada, corresponde un ajuste por diferencia de inventario.',
      v_saldo + new.cantidad, v_saldo, new.cantidad,
      v_lote.numero_registro_interno, v_deposito.numero
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 6. Terminar un pedido
-- ===========================================================================
--
-- Todo en una transacción: el registro de consumo de cada insumo, las bajas
-- de stock lote por lote y el paso del pedido a CUMPLIDO. Si un insumo no
-- alcanza, no se baja nada de ninguno y el mensaje dice cuál falta: un pedido
-- terminado a medias deja el stock diciendo algo que no pasó.
--
-- p_consumos: [{ "insumo_id": uuid, "cantidad": numeric, "motivo": text }]
--   - Los insumos de la lista de materiales que no vengan se toman con su
--     cantidad teórica.
--   - Los que vengan con otra cantidad son la corrección («usamos 1001 y no
--     1000») y exigen motivo.
--   - Uno que no está en la lista (se usó algo de más, de otro insumo) entra
--     con teórico cero y también exige motivo.
--
-- Qué lote: el que vence primero; entre los que no vencen, el más antiguo en
-- el sistema. Decisión de la conducción del proyecto del 2026-09-23 a falta de
-- I.20.3 (D-05). Cada baja queda con su lote en el kardex.
--
-- SECURITY INVOKER: las políticas RLS de pedido_consumos y movimientos_stock
-- siguen siendo la autoridad.

create or replace function comercial.terminar_pedido(p_pedido_id uuid, p_consumos jsonb default '[]'::jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pedido    comercial.pedidos%rowtype;
  r           record;
  v_consumo   uuid;
  v_articulo  uuid;
  v_restante  numeric(16,4);
  v_toma      numeric(16,4);
  pos         record;
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
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido(p_pedido_id) n
    ),
    informado as (
      select (e ->> 'insumo_id')::uuid        as insumo_id,
             (e ->> 'cantidad')::numeric      as cantidad,
             nullif(btrim(e ->> 'motivo'), '') as motivo
        from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb)) e
    )
    select
      coalesce(t.insumo_id, i.insumo_id)       as insumo_id,
      coalesce(t.necesario, 0)                 as teorica,
      coalesce(i.cantidad, t.necesario)        as usada,
      i.motivo,
      c.nombre,
      c.unidad_medida
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

    insert into comercial.pedido_consumos
      (pedido_id, insumo_id, unidad, cantidad_teorica, cantidad_real, motivo_diferencia)
    values
      (p_pedido_id, r.insumo_id, r.unidad_medida, r.teorica, r.usada, r.motivo)
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
        'No alcanza el stock de % (%): faltan % %. No se descontó nada del pedido. '
        'Si el material está en planta, falta registrarlo: recepción o ajuste de inventario.',
        r.nombre, (select codigo_interno from gmp.insumos_catalogo where id = r.insumo_id),
        v_restante, r.unidad_medida
        using errcode = 'check_violation';
    end if;
  end loop;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;
end;
$$;

comment on function comercial.terminar_pedido(uuid, jsonb) is
  'Termina un pedido: registra el consumo real de cada insumo (con motivo si difiere de la receta), baja el stock '
  'por lote —vence primero, después el más antiguo— y pasa el pedido a CUMPLIDO. Todo o nada.';

grant execute on function comercial.terminar_pedido(uuid, jsonb) to authenticated;

-- ===========================================================================
-- 7. Circuito del pedido en la base
-- ===========================================================================
--
-- Hasta acá la pantalla ofrecía solo el paso siguiente pero la base aceptaba
-- cualquier estado (quedó anotado el 2026-09-23 en ESTADO.md). Con el cierre
-- bajando stock, CUMPLIDO no puede ser un valor que se escribe a mano: solo lo
-- alcanza un pedido con su consumo registrado.
--
--   BORRADOR       → CONFIRMADO, CANCELADO
--   CONFIRMADO     → BORRADOR (corregir antes de producir), EN_PRODUCCION,
--                    CUMPLIDO (solo con consumo), CANCELADO
--   EN_PRODUCCION  → CUMPLIDO (solo con consumo), CANCELADO
--   CUMPLIDO, CANCELADO: cerrados, no cambian.

create or replace function comercial.fn_pedido_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
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
       and not exists (select 1 from comercial.pedido_renglones where pedido_id = new.id) then
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
$$;

create trigger trg_pedido_transicion
  before update on comercial.pedidos
  for each row execute function comercial.fn_pedido_transicion();

-- Los productos del pedido se tocan solo en borrador: una vez enviado,
-- Producción está decidiendo compras sobre esa lista.
create or replace function comercial.fn_renglon_en_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_estado comercial.estado_pedido_enum;
begin
  select estado into v_estado
    from comercial.pedidos
   where id = coalesce(new.pedido_id, old.pedido_id);

  if v_estado is distinct from 'BORRADOR' then
    raise exception 'Los productos se cambian con el pedido en borrador (está %). Devolvelo a borrador primero.', v_estado
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_renglon_en_borrador
  before insert or update or delete on comercial.pedido_renglones
  for each row execute function comercial.fn_renglon_en_borrador();
