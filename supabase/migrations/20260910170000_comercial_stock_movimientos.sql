-- ---------------------------------------------------------------------------
-- Propósito : Primer poblamiento de `comercial`. Libro de movimientos de stock
--             de insumos: entradas por recepción, ajustes por diferencia de
--             inventario, descartes, salidas de muestra y transferencias entre
--             depósitos. Saldos y kardex derivados.
-- Reglas    : RN-54 (un movimiento nunca se edita ni se borra; la corrección
--             genera un movimiento inverso vinculado),
--             RN-51 y RN-52 por invocación de gmp.lote_despachable(),
--             RN-50 (auditoría). §4.12.2 del alcance. §3.3 fila «Ajustar stock
--             por diferencia de inventario».
-- Fecha     : 2026-09-10
-- ---------------------------------------------------------------------------
--
-- RECORTE DELIBERADO: ESTE STOCK NO ESTÁ VALORIZADO.
-- §4.12.2 define `costo_unitario` NOT NULL sobre cada movimiento y
-- `costos_lote` para el costeo por lote. Nada de eso se implementa acá, por un
-- motivo concreto y no por comodidad: en el sistema no existe hoy ningún dato
-- de costo unitario. `gmp.recepciones.monto` es el total del remito, no un
-- precio por insumo, y la recepción fiscal de la factura (RN-65) es fase 12.
-- Poner un `costo_unitario` ahora obligaría a inventarlo, y un stock valorizado
-- con números inventados es peor que uno sin valorizar: el segundo se sabe
-- incompleto, el primero se cree exacto.
--
-- Cuando llegue la valorización, agrega columnas a esta tabla y una tabla
-- `costos_lote`. No la reescribe: las cantidades y su trazabilidad ya son las
-- definitivas.
--
-- QUÉ REEMPLAZA. `gmp.v_existencias_recibidas` (migración …130000) informa lo
-- recibido, que solo crece. A partir de acá la existencia real es
-- `comercial.v_existencias`. La vista vieja se deja en pie porque contesta otra
-- pregunta —qué entró por el circuito de calidad— y esa sigue siendo válida.

-- ===========================================================================
-- 1. Enumeraciones de comercial (Anexo A)
-- ===========================================================================
--
-- El enum lleva los once tipos del alcance, no solo los cinco que esta fase
-- implementa. Un vocabulario incompleto invita a que alguien registre un
-- consumo de producción como «SALIDA_AJUSTE» porque es lo que había. Los seis
-- no implementados los rechaza comercial.fn_validar_movimiento(), nombrando la
-- fase que los trae.

create type comercial.tipo_movimiento_enum as enum (
  'ENTRADA_COMPRA',
  'ENTRADA_PRODUCCION',
  'ENTRADA_DEVOLUCION',
  'ENTRADA_AJUSTE',
  'SALIDA_VENTA',
  'SALIDA_CONSUMO_PRODUCCION',
  'SALIDA_MUESTRA',
  'SALIDA_DESCARTE',
  'SALIDA_AJUSTE',
  'SALIDA_RETIRO_MERCADO',
  'TRANSFERENCIA_ENTRE_DEPOSITOS'
);

-- §4.12.2 recomienda promedio ponderado móvil por defecto. La columna se
-- declara ahora para que el artículo nazca con su criterio definido, aunque
-- nada la lea hasta que exista la valorización.
create type comercial.metodo_costeo_enum as enum ('PEPS', 'PPP', 'ESTANDAR');

-- ===========================================================================
-- 2. comercial.articulos  (§4.12.2)
-- ===========================================================================
--
-- El artículo es la unidad de stock. §4.12.2 lo define como la unificación de
-- un insumo o una presentación de producto terminado, con
-- `CHECK (num_nonnulls(presentacion_id, insumo_id) = 1)`.
--
-- Acá solo puede ser un insumo: `gmp.presentaciones` no existe todavía. En vez
-- de declarar una columna `presentacion_id` que apunte a la nada, `insumo_id`
-- es NOT NULL y la migración que cree las presentaciones agregará la columna y
-- cambiará la restricción. Una columna huérfana esperando su tabla se
-- convierte en una columna que nadie sabe si se puede usar.

create table comercial.articulos (
  id            uuid primary key default gen_random_uuid(),
  insumo_id     uuid not null unique references gmp.insumos_catalogo(id),
  sku           text not null unique check (length(btrim(sku)) > 0),
  descripcion   text not null check (length(btrim(descripcion)) > 0),
  metodo_costeo comercial.metodo_costeo_enum not null default 'PPP',
  -- Umbral de reposición. NULL = sin umbral definido, que es lo que
  -- corresponde mientras nadie lo haya fijado: cero sería un umbral, y falso.
  stock_minimo  numeric(14,3) check (stock_minimo is null or stock_minimo >= 0),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

comment on table comercial.articulos is
  'Unidad de stock (§4.12.2). Hoy solo insumos: gmp.presentaciones es de una fase posterior y agregará presentacion_id.';
comment on column comercial.articulos.metodo_costeo is
  '§4.12.2: PPP por defecto. Declarado, todavía sin lector: esta fase no valoriza.';
comment on column comercial.articulos.stock_minimo is
  'Umbral de reposición, en la unidad de medida del insumo. NULL = no definido, que no es lo mismo que cero.';

create index articulos_insumo_idx on comercial.articulos (insumo_id);

-- El vínculo con el insumo es la identidad del artículo: repuntarlo a otro
-- insumo le cambiaría el significado a todos los movimientos ya registrados,
-- retroactivamente y sin dejar rastro en el saldo. Lo demás sí se edita.
create or replace function comercial.fn_articulo_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.insumo_id, new.creado_en)
     is distinct from
     (old.id, old.insumo_id, old.creado_en) then
    raise exception
      'Un artículo no cambia de insumo: eso reescribiría el significado de todos sus movimientos. '
      'Lo editable es el SKU, la descripción, el método de costeo, el stock mínimo y la baja.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_articulo_campos_editables
  before update on comercial.articulos
  for each row execute function comercial.fn_articulo_campos_editables();

-- ---------------------------------------------------------------------------
-- Semilla: un artículo por insumo del catálogo
-- ---------------------------------------------------------------------------
-- Va acá, antes de habilitar RLS y de adjuntar la auditoría, por la misma
-- razón y en el mismo orden que la semilla de depósitos de la migración
-- …140200: es carga de esquema, no operación de un usuario. Su respaldo es
-- este archivo versionado, no un asiento de core.auditoria con autor nulo.
--
-- El SKU arranca igual al código interno del insumo y queda editable, por si
-- el criterio comercial difiere del técnico. Los insumos que se den de alta
-- después reciben su artículo de comercial.articulo_de_insumo().

insert into comercial.articulos (insumo_id, sku, descripcion)
select i.id, i.codigo_interno, i.nombre
  from gmp.insumos_catalogo i
 where i.activo
on conflict (insumo_id) do nothing;

-- ===========================================================================
-- 3. comercial.movimientos_stock  (§4.12.2, RN-54)
-- ===========================================================================
--
-- DOS APARTAMIENTOS DE §4.12.2, AMBOS FORZADOS POR REGLAS DE ESTE REPOSITORIO.
--
-- (a) La clave primaria es `uuid`, no `bigserial`. El trigger genérico de
--     auditoría hace `(to_jsonb(new) ->> 'id')::uuid` para llenar
--     `core.auditoria.registro_id`, que es de tipo uuid. Una tabla de negocio
--     con clave primaria entera rompe la auditoría en tiempo de ejecución, y
--     la invariante 6 es innegociable. Para el orden del kardex, que es lo que
--     `bigserial` daba, se agrega `orden` como identidad: sirve para ordenar,
--     no para identificar, y sus huecos no importan porque no es un
--     correlativo fiscal (CLAUDE.md §7 habla de comprobantes, no de esto).
--
-- (b) La referencia al movimiento anulado se llama `anula_a_movimiento_id` y
--     no `anulado_por_id`. Dos razones. CLAUDE.md §6 reserva el sufijo `*_por`
--     para `uuid REFERENCES core.usuarios(id)`, y un campo `anulado_por_id`
--     que apunta a un movimiento se lee como si apuntara a una persona. Y, más
--     de fondo: §4.12.2 pone el puntero en el movimiento original, lo que
--     obliga a hacerle UPDATE cuando se lo anula. RN-54 dice que un movimiento
--     nunca se edita. El puntero va en el movimiento que anula, que es el que
--     se está creando, y «está anulado» se deriva. Así la regla se cumple sin
--     excepciones en vez de cumplirse salvo en el caso que la pone a prueba.

create table comercial.movimientos_stock (
  id                    uuid primary key default gen_random_uuid(),
  orden                 bigint generated always as identity,

  articulo_id           uuid not null references comercial.articulos(id),
  -- NOT NULL mientras el stock sea solo de insumos: un movimiento sin lote es
  -- material sin trazabilidad, que es justamente lo que este sistema existe
  -- para impedir. Se relaja cuando entre producto terminado con
  -- `lote_producto_id`.
  lote_insumo_id        uuid not null references gmp.lotes_insumo(id),
  deposito_id           uuid not null references gmp.depositos(id),

  tipo                  comercial.tipo_movimiento_enum not null,
  -- Con signo: positivo entra, negativo sale. El signo tiene que concordar con
  -- el tipo, y lo verifica una restricción, no la costumbre.
  cantidad              numeric(16,4) not null check (cantidad <> 0),
  -- Unidad del lote al momento del movimiento. La llena el trigger, no el
  -- formulario. El DEFAULT vacío existe por la trampa de docs/ESTADO.md: sin
  -- él, el generador de tipos la declara obligatoria en el cliente.
  unidad                text not null default '',

  motivo                text,
  documento_tipo        text,
  documento_id          uuid,
  -- Las dos patas de una transferencia comparten este identificador. Sin él,
  -- una salida y una entrada del mismo día en dos depósitos no se distinguen
  -- de dos ajustes sueltos.
  transferencia_id      uuid,

  anula_a_movimiento_id uuid unique references comercial.movimientos_stock(id),

  -- Primer día del mes del movimiento, para el cierre de período de fase 14.
  -- El huso es explícito: `date_trunc` sobre timestamptz depende del TimeZone
  -- de la sesión y por lo tanto no es IMMUTABLE, y una columna generada exige
  -- que lo sea. `timestamptz at time zone '<literal>'` sí lo es.
  periodo               date generated always as (
                          date_trunc('month',
                            ocurrido_en at time zone 'America/Argentina/Buenos_Aires'
                          )::date
                        ) stored,

  registrado_por        uuid not null references core.usuarios(id) default core.usuario_actual(),
  ocurrido_en           timestamptz not null default now(),

  constraint movimientos_stock_signo_segun_tipo check (
    (tipo::text like 'ENTRADA%' and cantidad > 0)
    or (tipo::text like 'SALIDA%' and cantidad < 0)
    or (tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS')
  ),
  -- Un movimiento que anula es siempre correctivo y lleva el porqué escrito.
  constraint movimientos_stock_anulacion_con_motivo check (
    anula_a_movimiento_id is null
    or length(btrim(coalesce(motivo, ''))) > 0
  ),
  constraint movimientos_stock_transferencia_agrupada check (
    (tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS') = (transferencia_id is not null)
  )
);

comment on table comercial.movimientos_stock is
  'Libro de movimientos de stock (§4.12.2). RN-54: no se edita ni se borra; la corrección es un movimiento inverso '
  'que apunta al original por anula_a_movimiento_id. Sin valorizar en esta fase: no existe dato de costo en el sistema.';
comment on column comercial.movimientos_stock.orden is
  'Orden determinista del kardex. La clave primaria es uuid porque el trigger de auditoría la castea a uuid.';
comment on column comercial.movimientos_stock.cantidad is
  'Con signo: positivo entra, negativo sale. La concordancia con el tipo la verifica movimientos_stock_signo_segun_tipo.';
comment on column comercial.movimientos_stock.anula_a_movimiento_id is
  'Movimiento que este movimiento revierte (RN-54). UNIQUE: un movimiento se anula una sola vez. '
  'El puntero va en el que anula y no en el anulado, porque marcar el anulado exigiría editarlo.';
comment on column comercial.movimientos_stock.periodo is
  'Primer día del mes en huso de Buenos Aires. Sujeto del cierre de período contable (RN-61), que es de fase posterior.';

create index movimientos_stock_posicion_idx
  on comercial.movimientos_stock (articulo_id, lote_insumo_id, deposito_id, orden);
create index movimientos_stock_lote_idx     on comercial.movimientos_stock (lote_insumo_id);
create index movimientos_stock_deposito_idx on comercial.movimientos_stock (deposito_id);
create index movimientos_stock_ocurrido_idx on comercial.movimientos_stock (ocurrido_en desc);
create index movimientos_stock_periodo_idx  on comercial.movimientos_stock (periodo);
create index movimientos_stock_transferencia_idx
  on comercial.movimientos_stock (transferencia_id) where transferencia_id is not null;

-- ---------------------------------------------------------------------------
-- Validación del movimiento
-- ---------------------------------------------------------------------------

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
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
  -- Registrarlos sería aceptar un dato que ningún flujo produjo ni verificó.
  if new.tipo in ('ENTRADA_PRODUCCION', 'SALIDA_CONSUMO_PRODUCCION') then
    raise exception
      'El tipo % exige órdenes de producción, que son de la fase de producción y todavía no existen.', new.tipo
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

create trigger trg_validar_movimiento
  before insert on comercial.movimientos_stock
  for each row execute function comercial.fn_validar_movimiento();

-- ---------------------------------------------------------------------------
-- RN-54: el movimiento no se edita
-- ---------------------------------------------------------------------------
-- Ni siquiera se otorga UPDATE más abajo, así que este trigger es redundante
-- por diseño. Está igual: es la clase de privilegio que alguien concede sin
-- pensar tres fases más adelante, y entonces la regla tiene que seguir en pie
-- sin depender del GRANT.

create or replace function comercial.fn_movimiento_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'RN-54: un movimiento de stock no se modifica. La corrección genera un movimiento inverso vinculado '
    '(comercial.anular_movimiento).'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_movimiento_inmutable
  before update on comercial.movimientos_stock
  for each row execute function comercial.fn_movimiento_inmutable();

-- ===========================================================================
-- 4. Saldos y kardex
-- ===========================================================================

create view comercial.v_saldos_stock with (security_invoker = true) as
  select
    m.articulo_id,
    m.lote_insumo_id,
    m.deposito_id,
    m.unidad,
    sum(m.cantidad)           as saldo,
    count(*)                  as movimientos,
    max(m.ocurrido_en)        as ultimo_movimiento
  from comercial.movimientos_stock m
  -- La unidad la impone el lote y el lote es parte de la clave del grupo, así
  -- que agrupar por ella no parte nada y evita un agregado que la disimule.
  group by m.articulo_id, m.lote_insumo_id, m.deposito_id, m.unidad;

comment on view comercial.v_saldos_stock is
  'Saldo por posición (artículo, lote, depósito). Incluye las posiciones en cero: que un lote se haya consumido '
  'del todo es información, no ausencia de información.';

-- La vista que mira la aplicación. Trae el saldo con todo lo que hace falta
-- para decidir sobre él sin una segunda consulta: en qué estado de calidad
-- está el lote, de qué color es su rótulo, cuándo vence, y si se puede
-- despachar. El impedimento viene en texto porque la pantalla tiene que poder
-- decir por qué no, y ese texto lo escribe la autoridad de `gmp`, no el front.
create view comercial.v_existencias with (security_invoker = true) as
  select
    s.articulo_id,
    a.sku,
    a.stock_minimo,
    i.id                            as insumo_id,
    i.codigo_interno,
    i.nombre                        as insumo_nombre,
    i.tipo                          as insumo_tipo,
    i.es_inflamable,
    s.lote_insumo_id,
    l.numero_registro_interno,
    l.lote_proveedor,
    l.estado,
    gmp.color_rotulo(l.estado)      as color_rotulo,
    l.plazo_validez,
    s.deposito_id,
    d.numero                        as deposito_numero,
    d.nombre                        as deposito_nombre,
    d.es_exterior                   as deposito_es_exterior,
    s.unidad,
    s.saldo,
    s.movimientos,
    s.ultimo_movimiento,
    gmp.impedimento_despacho(s.lote_insumo_id) as impedimento_despacho,
    (l.plazo_validez is not null
       and l.plazo_validez <= current_date + 90) as vence_en_90_dias
  from comercial.v_saldos_stock s
  join comercial.articulos    a on a.id = s.articulo_id
  join gmp.insumos_catalogo   i on i.id = a.insumo_id
  join gmp.lotes_insumo       l on l.id = s.lote_insumo_id
  join gmp.depositos          d on d.id = s.deposito_id;

comment on view comercial.v_existencias is
  'Existencia real por lote y depósito, con el estado de calidad del lote y el impedimento de despacho si lo hay. '
  'Ésta es la existencia; gmp.v_existencias_recibidas es lo que entró, que solo crece.';

-- Kardex: el movimiento con su saldo corrido. El saldo se calcula por posición
-- y en el orden de `orden`, que es el único orden con el que la columna
-- significa algo.
create view comercial.v_kardex with (security_invoker = true) as
  select
    m.id,
    m.orden,
    m.ocurrido_en,
    m.articulo_id,
    a.sku,
    i.codigo_interno,
    i.nombre                        as insumo_nombre,
    m.lote_insumo_id,
    l.numero_registro_interno,
    l.lote_proveedor,
    m.deposito_id,
    d.numero                        as deposito_numero,
    d.nombre                        as deposito_nombre,
    m.tipo,
    m.cantidad,
    m.unidad,
    sum(m.cantidad) over (
      partition by m.articulo_id, m.lote_insumo_id, m.deposito_id
      order by m.orden
      rows between unbounded preceding and current row
    )                               as saldo_posterior,
    m.motivo,
    m.transferencia_id,
    m.anula_a_movimiento_id,
    -- Derivado, no almacenado: marcar el original exigiría editarlo (RN-54).
    exists (
      select 1 from comercial.movimientos_stock x
       where x.anula_a_movimiento_id = m.id
    )                               as anulado,
    m.periodo,
    m.registrado_por,
    u.nombre_completo               as registrado_por_nombre
  from comercial.movimientos_stock m
  join comercial.articulos    a on a.id = m.articulo_id
  join gmp.insumos_catalogo   i on i.id = a.insumo_id
  join gmp.lotes_insumo       l on l.id = m.lote_insumo_id
  join gmp.depositos          d on d.id = m.deposito_id
  join core.usuarios          u on u.id = m.registrado_por;

comment on view comercial.v_kardex is
  'Libro de movimientos con saldo corrido por posición. `anulado` se deriva de la existencia del movimiento inverso, '
  'porque marcarlo en el original sería editarlo (RN-54).';

-- Existencia consolidada por artículo, que es la pregunta de reposición:
-- cuánto hay en total y si está por debajo del umbral.
create view comercial.v_stock_por_articulo with (security_invoker = true) as
  select
    a.id                            as articulo_id,
    a.sku,
    a.stock_minimo,
    a.activo,
    i.id                            as insumo_id,
    i.codigo_interno,
    i.nombre                        as insumo_nombre,
    i.tipo                          as insumo_tipo,
    i.unidad_medida,
    i.es_inflamable,
    coalesce(sum(s.saldo), 0)                                     as saldo_total,
    coalesce(sum(s.saldo) filter (where l.estado = 'APROBADO'), 0) as saldo_aprobado,
    coalesce(sum(s.saldo) filter (
      where l.estado = 'APROBADO' and gmp.lote_despachable(l.id)
    ), 0)                                                         as saldo_despachable,
    count(distinct s.lote_insumo_id) filter (where s.saldo > 0)    as lotes_con_saldo,
    count(distinct s.deposito_id)    filter (where s.saldo > 0)    as depositos,
    min(l.plazo_validez) filter (where s.saldo > 0)                as vence_primero,
    max(s.ultimo_movimiento)                                       as ultimo_movimiento,
    a.stock_minimo is not null
      and coalesce(sum(s.saldo), 0) < a.stock_minimo               as bajo_minimo
  from comercial.articulos a
  join gmp.insumos_catalogo i on i.id = a.insumo_id
  left join comercial.v_saldos_stock s on s.articulo_id = a.id
  left join gmp.lotes_insumo l on l.id = s.lote_insumo_id
  group by a.id, a.sku, a.stock_minimo, a.activo,
           i.id, i.codigo_interno, i.nombre, i.tipo, i.unidad_medida, i.es_inflamable;

comment on view comercial.v_stock_por_articulo is
  'Existencia consolidada por artículo. `saldo_despachable` aplica RN-51 y RN-52 lote por lote: el total que hay '
  'y el total que se puede sacar no son el mismo número, y confundirlos es prometer mercadería que no se puede entregar.';

-- ===========================================================================
-- 5. Operaciones
-- ===========================================================================
--
-- Todas SECURITY INVOKER: las políticas RLS de la sección 6 siguen siendo la
-- autoridad sobre quién puede hacer qué. Estas funciones existen para que
-- varias filas entren en una sola transacción, no para saltear permisos.
-- PostgREST no da transacción entre llamadas (docs/ESTADO.md, «Trampas
-- conocidas»): sin ellas, una transferencia podría quedar con la salida
-- escrita y la entrada no.

-- Artículo del insumo, creándolo si falta. El alta perezosa vive del lado de
-- `comercial` y no como trigger sobre `gmp.insumos_catalogo` por la invariante
-- 7: un trigger en una tabla de gmp que escribe en comercial hace que gmp
-- dependa de comercial, aunque el verificador de claves foráneas no lo vea.
create or replace function comercial.articulo_de_insumo(p_insumo_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_insumo gmp.insumos_catalogo%rowtype;
begin
  select id into v_id from comercial.articulos where insumo_id = p_insumo_id;
  if found then
    return v_id;
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = p_insumo_id;
  if not found then
    raise exception 'El insumo % no existe en el catálogo.', p_insumo_id;
  end if;

  insert into comercial.articulos (insumo_id, sku, descripcion)
  values (v_insumo.id, v_insumo.codigo_interno, v_insumo.nombre)
  on conflict (insumo_id) do nothing
  returning id into v_id;

  -- DO NOTHING no devuelve fila. Si otra transacción ganó la carrera, el
  -- artículo existe y es el que corresponde: se lo relee.
  if v_id is null then
    select id into v_id from comercial.articulos where insumo_id = p_insumo_id;
  end if;

  return v_id;
end;
$$;

comment on function comercial.articulo_de_insumo(uuid) is
  'Artículo de stock del insumo, creándolo si no existe. El alta vive en comercial y no como trigger sobre gmp, '
  'porque eso invertiría la dirección de dependencia de la invariante 7.';

-- ---------------------------------------------------------------------------
-- Carga de una recepción a stock
-- ---------------------------------------------------------------------------
-- `gmp.recepciones.cargado_a_stock` existe desde la fase 1 y hasta acá no lo
-- escribía nadie. Éste es su acto: la carga a stock es un paso administrativo
-- deliberado y posterior a la recepción física, no un efecto automático de
-- ella. Esa separación es la que permite que Depósito reciba y Administración
-- concilie, que es como trabaja la planta.

create or replace function comercial.cargar_recepcion_a_stock(p_recepcion_id uuid)
returns setof comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_recepcion gmp.recepciones%rowtype;
  v_lote      gmp.lotes_insumo%rowtype;
  v_articulo  uuid;
  v_deposito  uuid;
  v_creados   integer := 0;
begin
  select * into v_recepcion from gmp.recepciones where id = p_recepcion_id for update;
  if not found then
    raise exception 'La recepción % no existe.', p_recepcion_id;
  end if;

  if v_recepcion.cargado_a_stock then
    raise exception
      'La recepción % ya fue cargada a stock el %. Cargarla dos veces duplicaría la existencia.',
      v_recepcion.numero, to_char(v_recepcion.cargado_en, 'DD/MM/YYYY HH24:MI')
      using errcode = 'check_violation';
  end if;

  for v_lote in
    select * from gmp.lotes_insumo where recepcion_id = p_recepcion_id order by numero_registro_interno
  loop
    -- Sin cantidad en unidades no hay stock que registrar. `cantidad_bultos`
    -- no sirve de reemplazo: un bulto puede ser un tambor de 200 kg o una caja
    -- de 5 unidades, así que sumarlos entre lotes mezcla magnitudes. El CHECK
    -- de RN-02 solo exige el conteo cuando los bultos son dispares; para
    -- llevar libro de stock hace falta siempre.
    if v_lote.cantidad_unidades is null then
      raise exception
        'El lote % no tiene cantidad en unidades cargada, así que no se puede llevar a stock. '
        'La cantidad de bultos no la reemplaza: un bulto no es una unidad de medida.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    if v_lote.deposito_actual_id is null then
      raise exception
        'El lote % no tiene depósito asignado. El stock se lleva por depósito: sin destino no hay existencia.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;

    v_articulo := comercial.articulo_de_insumo(v_lote.insumo_id);
    v_deposito := v_lote.deposito_actual_id;

    -- El INSERT va dentro de un CTE porque RETURN QUERY espera una consulta,
    -- no una sentencia de modificación con RETURNING.
    return query
      with ins as (
        insert into comercial.movimientos_stock (
          articulo_id, lote_insumo_id, deposito_id, tipo, cantidad,
          motivo, documento_tipo, documento_id
        )
        values (
          v_articulo, v_lote.id, v_deposito, 'ENTRADA_COMPRA', v_lote.cantidad_unidades,
          format('Recepción %s, remito %s', v_recepcion.numero, v_recepcion.numero_remito),
          'RECEPCION', v_recepcion.id
        )
        returning *
      )
      select * from ins;

    v_creados := v_creados + 1;
  end loop;

  if v_creados = 0 then
    raise exception 'La recepción % no tiene lotes cargados.', v_recepcion.numero
      using errcode = 'check_violation';
  end if;

  -- `cargado_por` y `cargado_en` los pone gmp.fn_recepcion_campos_editables().
  update gmp.recepciones set cargado_a_stock = true where id = p_recepcion_id;
end;
$$;

comment on function comercial.cargar_recepcion_a_stock(uuid) is
  'Crea una ENTRADA_COMPRA por cada lote de la recepción y la marca cargada, en una sola transacción. '
  'Idempotente por rechazo: una recepción ya cargada no se vuelve a cargar.';

-- ---------------------------------------------------------------------------
-- Transferencia entre depósitos
-- ---------------------------------------------------------------------------

create or replace function comercial.transferir_deposito(
  p_lote_id        uuid,
  p_deposito_origen uuid,
  p_deposito_destino uuid,
  p_cantidad       numeric,
  p_motivo         text
)
returns setof comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_articulo uuid;
  v_grupo    uuid := gen_random_uuid();
  v_lote     gmp.lotes_insumo%rowtype;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a transferir tiene que ser mayor que cero.'
      using errcode = 'check_violation';
  end if;
  if p_deposito_origen = p_deposito_destino then
    raise exception 'El depósito de origen y el de destino son el mismo.'
      using errcode = 'check_violation';
  end if;

  select * into v_lote from gmp.lotes_insumo where id = p_lote_id;
  if not found then
    raise exception 'El lote % no existe.', p_lote_id;
  end if;

  v_articulo := comercial.articulo_de_insumo(v_lote.insumo_id);

  -- La salida primero: si no hay saldo en el origen, la validación la rechaza
  -- y la entrada nunca llega a escribirse.
  return query
    with salida as (
      insert into comercial.movimientos_stock (
        articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, transferencia_id
      )
      values (v_articulo, p_lote_id, p_deposito_origen,
              'TRANSFERENCIA_ENTRE_DEPOSITOS', -p_cantidad, p_motivo, v_grupo)
      returning *
    )
    select * from salida;

  return query
    with entrada as (
      insert into comercial.movimientos_stock (
        articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, transferencia_id
      )
      values (v_articulo, p_lote_id, p_deposito_destino,
              'TRANSFERENCIA_ENTRE_DEPOSITOS', p_cantidad, p_motivo, v_grupo)
      returning *
    )
    select * from entrada;

  -- NO se toca gmp.lotes_insumo.deposito_actual_id, por dos motivos.
  --
  -- Uno de fondo: CLAUDE.md §4 dice que `comercial` consume lo que `gmp`
  -- expone. Consumir no es escribir. Una función de comercial que actualiza
  -- una tabla de gmp invierte la relación aunque ninguna clave foránea lo
  -- delate.
  --
  -- Uno práctico, y es el que lo habría roto en silencio: la política
  -- `lotes_insumo_update_circuito` habilita a OP, CC, DT y GP, y no a
  -- ADMINISTRACION, que sí mueve stock. Un UPDATE bajo RLS que no encuentra
  -- fila no falla: afecta cero filas. Administración habría transferido
  -- material y el lote habría quedado apuntando al depósito viejo sin que
  -- nada avisara.
  --
  -- Desde esta migración `deposito_actual_id` es la aproximación de fase 1
  -- —un lote, un depósito— y la existencia por depósito la contesta
  -- comercial.v_existencias, que además admite que un lote esté repartido.
end;
$$;

comment on function comercial.transferir_deposito(uuid, uuid, uuid, numeric, text) is
  'Mueve cantidad de un lote entre depósitos con las dos patas en una sola transacción, agrupadas por transferencia_id.';

-- ---------------------------------------------------------------------------
-- Anulación de un movimiento (RN-54)
-- ---------------------------------------------------------------------------

create or replace function comercial.anular_movimiento(
  p_movimiento_id uuid,
  p_motivo        text
)
returns comercial.movimientos_stock
language plpgsql
set search_path = ''
as $$
declare
  v_original comercial.movimientos_stock%rowtype;
  v_inverso  comercial.movimientos_stock%rowtype;
  v_tipo     comercial.tipo_movimiento_enum;
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'La anulación de un movimiento exige motivo escrito (RN-54).'
      using errcode = 'check_violation';
  end if;

  select * into v_original from comercial.movimientos_stock where id = p_movimiento_id;
  if not found then
    raise exception 'El movimiento % no existe.', p_movimiento_id;
  end if;

  if exists (select 1 from comercial.movimientos_stock
              where anula_a_movimiento_id = p_movimiento_id) then
    raise exception 'Ese movimiento ya fue anulado.'
      using errcode = 'check_violation';
  end if;

  -- El inverso tiene que ser de un tipo cuyo signo admita la cantidad opuesta,
  -- porque movimientos_stock_signo_segun_tipo no hace excepciones con las
  -- anulaciones. Una entrada se anula con un ajuste de salida y viceversa; una
  -- transferencia se anula con una transferencia, que admite los dos signos.
  v_tipo := case
              when v_original.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS'
                then 'TRANSFERENCIA_ENTRE_DEPOSITOS'
              when v_original.cantidad > 0 then 'SALIDA_AJUSTE'
              else 'ENTRADA_AJUSTE'
            end::comercial.tipo_movimiento_enum;

  insert into comercial.movimientos_stock (
    articulo_id, lote_insumo_id, deposito_id, tipo, cantidad,
    motivo, documento_tipo, documento_id, transferencia_id, anula_a_movimiento_id
  )
  values (
    v_original.articulo_id, v_original.lote_insumo_id, v_original.deposito_id,
    v_tipo, -v_original.cantidad,
    p_motivo, v_original.documento_tipo, v_original.documento_id,
    case when v_original.tipo = 'TRANSFERENCIA_ENTRE_DEPOSITOS'
         then v_original.transferencia_id end,
    v_original.id
  )
  returning * into v_inverso;

  return v_inverso;
end;
$$;

comment on function comercial.anular_movimiento(uuid, text) is
  'RN-54: anula un movimiento creando su inverso vinculado. El original no se toca. '
  'Anular una de las dos patas de una transferencia deja la otra en pie a propósito: puede haber salido y no llegado.';

grant execute on function comercial.articulo_de_insumo(uuid)                        to authenticated;
grant execute on function comercial.cargar_recepcion_a_stock(uuid)                  to authenticated;
grant execute on function comercial.transferir_deposito(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function comercial.anular_movimiento(uuid,text)                    to authenticated;

-- ===========================================================================
-- 6. RLS (invariante 3)
-- ===========================================================================

alter table comercial.articulos          enable row level security;
alter table comercial.articulos          force  row level security;
alter table comercial.movimientos_stock  enable row level security;
alter table comercial.movimientos_stock  force  row level security;

grant select, insert, update on comercial.articulos         to authenticated;
-- Sin UPDATE ni DELETE sobre los movimientos. RN-54 antes que cualquier política.
grant select, insert         on comercial.movimientos_stock to authenticated;

grant select on comercial.v_saldos_stock       to authenticated;
grant select on comercial.v_existencias        to authenticated;
grant select on comercial.v_kardex             to authenticated;
grant select on comercial.v_stock_por_articulo to authenticated;

create policy articulos_select_authenticated on comercial.articulos
  for select to authenticated using (core.rol() is not null);
comment on policy articulos_select_authenticated on comercial.articulos is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy articulos_insert_stock on comercial.articulos
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION','ADMINISTRADOR_SISTEMA'));
comment on policy articulos_insert_stock on comercial.articulos is
  'Mismo conjunto que mueve stock, más SYS: el artículo se crea solo como paso previo a un movimiento.';

create policy articulos_update_stock on comercial.articulos
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION','ADMINISTRADOR_SISTEMA'))
  with check (core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION','ADMINISTRADOR_SISTEMA'));
comment on policy articulos_update_stock on comercial.articulos is
  'Edición del umbral de reposición y del método de costeo. El vínculo con el insumo no se toca: es la identidad del artículo.';

create policy movimientos_stock_select_authenticated on comercial.movimientos_stock
  for select to authenticated using (core.rol() is not null);
comment on policy movimientos_stock_select_authenticated on comercial.movimientos_stock is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

-- §3.3 tiene una sola fila sobre stock, «Ajustar stock por diferencia de
-- inventario», con DT, ADM y GP. Ninguna fila cubre la entrada por recepción
-- ni la transferencia entre depósitos. Se aplica el mismo conjunto, que es el
-- más restrictivo de los defendibles: ampliarlo después es trámite, recortarlo
-- cuando la gente ya trabaja con el permiso no lo es. Queda anotado como D-14.
create policy movimientos_stock_insert_stock on comercial.movimientos_stock
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA','ADMINISTRACION','GERENCIA_PRODUCCION'));
comment on policy movimientos_stock_insert_stock on comercial.movimientos_stock is
  '§3.3 «Ajustar stock por diferencia de inventario»: DT, ADM y GP. La entrada por recepción y la transferencia '
  'entre depósitos no figuran en la matriz y toman el mismo conjunto (decisión abierta D-14).';

-- Sin políticas de UPDATE ni de DELETE sobre movimientos_stock (RN-54).

select core.adjuntar_auditoria('comercial.articulos');
select core.adjuntar_auditoria('comercial.movimientos_stock');
