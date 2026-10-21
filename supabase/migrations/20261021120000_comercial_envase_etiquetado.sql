-- ---------------------------------------------------------------------------
-- Propósito : Envase etiquetado (envase + etiqueta) como paso intermedio de
--             todos los productos: se etiqueta por día, descuenta envase y
--             etiqueta en ese momento, y el pedido después consume envases
--             etiquetados. Más lo que hace falta para cargar qué lleva cada
--             producto: rol del material (envase, etiqueta, extra) y la
--             marca «no lleva fórmula».
-- Reglas    : RN-54 (los movimientos no se editan: el consumo del etiquetado
--             es movimiento propio), RN-13 (solo se consume material aprobado:
--             gmp.lote_consumible). Pedido del 2026-10-20 (D-etiquetado-1):
--             «faltan etiquetar» se cuenta contra los pedidos en curso.
-- Fecha     : 2026-10-21
-- ---------------------------------------------------------------------------
--
-- Un envase etiquetado no es un lote GMP: no se recibe ni se analiza, se arma
-- en planta con dos materiales ya aprobados. Por eso no es un insumo del
-- catálogo con lotes propios sino un registro de comercial (cuántos se
-- etiquetaron, cuándo, quién) cuyos consumos de envase y etiqueta sí bajan
-- lotes reales. Dirección de dependencia: comercial → gmp, como pide CLAUDE.md.

-- ===========================================================================
-- 1. Qué lleva cada producto: el rol de cada material
-- ===========================================================================

alter table gmp.materiales_acondicionamiento
  add column rol text check (rol in ('ENVASE', 'ETIQUETA', 'EXTRA'));

comment on column gmp.materiales_acondicionamiento.rol is
  'ENVASE y ETIQUETA forman el envase etiquetado (uno de cada uno vigente por producto); EXTRA es lo demás que se '
  'agrega al acondicionar (tapa, pincel). NULL = sin clasificar (cargas anteriores a 20261021120000).';

create unique index materiales_un_envase_y_una_etiqueta
  on gmp.materiales_acondicionamiento (producto_id, rol)
  where activo and rol in ('ENVASE', 'ETIQUETA');

-- «No corresponde»: el producto no lleva fórmula (accesorios, importados,
-- reventa). Distinto de «todavía no se cargó», que es la ausencia de fórmula.
alter table gmp.productos
  add column sin_formula boolean not null default false;

comment on column gmp.productos.sin_formula is
  'Verdadero si el producto no lleva fórmula de granel. Sin esta marca, no tener fórmula es un pendiente de carga.';

-- ===========================================================================
-- 2. Fórmulas: Gerencia de Producción carga borradores (D-etiquetado-1)
-- ===========================================================================
--
-- Dejarla VIGENTE sigue siendo de Dirección Técnica: es el documento GMP.

alter policy formulas_escribe_dt on gmp.formulas_fabricacion
  with check (core.es_rol('DIRECCION_TECNICA')
              or (core.es_rol('GERENCIA_PRODUCCION') and estado = 'BORRADOR'));
comment on policy formulas_escribe_dt on gmp.formulas_fabricacion is
  'La fórmula la escribe DT; GP la carga en BORRADOR (D-etiquetado-1). Dejarla vigente es de DT.';

alter policy formulas_actualiza_dt on gmp.formulas_fabricacion
  using (core.es_rol('DIRECCION_TECNICA')
         or (core.es_rol('GERENCIA_PRODUCCION') and estado = 'BORRADOR'))
  with check (core.es_rol('DIRECCION_TECNICA')
              or (core.es_rol('GERENCIA_PRODUCCION') and estado = 'BORRADOR'));
comment on policy formulas_actualiza_dt on gmp.formulas_fabricacion is
  'DT; GP solo mientras está en BORRADOR y sin sacarla de ese estado (D-etiquetado-1).';

create or replace function gmp.formula_en_borrador(p_formula_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from gmp.formulas_fabricacion where id = p_formula_id and estado = 'BORRADOR');
$$;

alter policy componentes_escribe_dt on gmp.formula_componentes
  with check (core.es_rol('DIRECCION_TECNICA')
              or (core.es_rol('GERENCIA_PRODUCCION') and gmp.formula_en_borrador(formula_id)));
alter policy componentes_actualiza_dt on gmp.formula_componentes
  using (core.es_rol('DIRECCION_TECNICA')
         or (core.es_rol('GERENCIA_PRODUCCION') and gmp.formula_en_borrador(formula_id)))
  with check (core.es_rol('DIRECCION_TECNICA')
              or (core.es_rol('GERENCIA_PRODUCCION') and gmp.formula_en_borrador(formula_id)));
-- Sin DELETE desde 20260930130000: un componente se da de baja, no se borra.
comment on policy componentes_escribe_dt on gmp.formula_componentes is
  'DT; GP en fórmulas en BORRADOR (D-etiquetado-1).';
comment on policy componentes_actualiza_dt on gmp.formula_componentes is
  'DT; GP en fórmulas en BORRADOR (D-etiquetado-1).';

-- ===========================================================================
-- 3. Etiquetados, su consumo y su asignación a pedidos
-- ===========================================================================

create table comercial.etiquetados (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references gmp.productos(id),
  cantidad       integer not null check (cantidad > 0),
  -- Día de Buenos Aires: la sesión corre en UTC (comercial.hoy, 20261009120300).
  fecha          date not null default comercial.hoy(),
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now()
);
comment on table comercial.etiquetados is
  'Envases etiquetados en planta, por día. No se editan ni se borran: uno mal cargado se anula con su registro '
  'rectificativo (comercial.etiquetado_anulaciones), que devuelve envase y etiqueta (RN-54).';

-- La corrección de un etiquetado: registro aparte que apunta al original
-- (CLAUDE.md §3.1), con movimientos inversos de sus consumos.
create table comercial.etiquetado_anulaciones (
  etiquetado_id uuid primary key references comercial.etiquetados(id),
  motivo        text not null check (length(btrim(motivo)) > 0),
  anulado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  anulado_en    timestamptz not null default now()
);
comment on table comercial.etiquetado_anulaciones is
  'Etiquetados anulados, con motivo. Solo se anula uno que ningún pedido usó (comercial.anular_etiquetado).';

create table comercial.etiquetado_consumos (
  id            uuid primary key default gen_random_uuid(),
  etiquetado_id uuid not null references comercial.etiquetados(id),
  insumo_id     uuid not null references gmp.insumos_catalogo(id),
  unidad        text not null,
  cantidad      numeric(16,4) not null check (cantidad > 0),
  unique (etiquetado_id, insumo_id)
);
comment on table comercial.etiquetado_consumos is
  'Envase y etiqueta que consumió un etiquetado. Los movimientos de stock apuntan acá (documento ETIQUETADO_CONSUMO).';

create table comercial.pedido_etiquetados (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references comercial.pedidos(id),
  etiquetado_id uuid not null references comercial.etiquetados(id),
  producto_id   uuid not null references gmp.productos(id),
  -- numeric como pedido_renglones.cantidad: un renglón puede no ser entero.
  cantidad      numeric(14,4) not null check (cantidad > 0),
  creado_en     timestamptz not null default now()
);
comment on table comercial.pedido_etiquetados is
  'Envases etiquetados que tomó un pedido al terminarse (comercial.terminar_pedido), del etiquetado más viejo al '
  'más nuevo. Une el lote de producto terminado con los lotes de envase y etiqueta que llevó.';

create index pedido_etiquetados_etiquetado_idx on comercial.pedido_etiquetados (etiquetado_id);
create index pedido_etiquetados_pedido_idx on comercial.pedido_etiquetados (pedido_id);
create index pedido_etiquetados_producto_idx on comercial.pedido_etiquetados (producto_id);
create index etiquetados_producto_idx on comercial.etiquetados (producto_id);
create index etiquetados_registrado_por_idx on comercial.etiquetados (registrado_por);
create index etiquetado_consumos_insumo_idx on comercial.etiquetado_consumos (insumo_id);
create index etiquetado_anulaciones_por_idx on comercial.etiquetado_anulaciones (anulado_por);
-- fn_validar_movimiento busca lo ya bajado por documento en cada consumo.
create index if not exists movimientos_stock_documento_idx
  on comercial.movimientos_stock (documento_tipo, documento_id);

alter table comercial.etiquetados            enable row level security;
alter table comercial.etiquetados            force row level security;
alter table comercial.etiquetado_consumos    enable row level security;
alter table comercial.etiquetado_consumos    force row level security;
alter table comercial.pedido_etiquetados     enable row level security;
alter table comercial.pedido_etiquetados     force row level security;
alter table comercial.etiquetado_anulaciones enable row level security;
alter table comercial.etiquetado_anulaciones force row level security;

grant select, insert on comercial.etiquetados, comercial.etiquetado_consumos, comercial.pedido_etiquetados,
  comercial.etiquetado_anulaciones to authenticated;

create policy etiquetados_select_authenticated on comercial.etiquetados
  for select to authenticated using (core.rol() is not null);
comment on policy etiquetados_select_authenticated on comercial.etiquetados is
  '§3.3: consulta para todos los roles (D-etiquetado-1).';
create policy etiquetados_insert_gerencia_produccion on comercial.etiquetados
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and registrado_por = core.usuario_actual());
comment on policy etiquetados_insert_gerencia_produccion on comercial.etiquetados is
  'Etiqueta Gerencia de Producción (o DT), a su nombre (D-etiquetado-1). Sin UPDATE ni DELETE (RN-54).';

create policy etiquetado_consumos_select_authenticated on comercial.etiquetado_consumos
  for select to authenticated using (core.rol() is not null);
comment on policy etiquetado_consumos_select_authenticated on comercial.etiquetado_consumos is
  '§3.3: consulta para todos los roles; une el etiquetado con los lotes que consumió.';
create policy etiquetado_consumos_insert_gerencia_produccion on comercial.etiquetado_consumos
  for insert to authenticated with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy etiquetado_consumos_insert_gerencia_produccion on comercial.etiquetado_consumos is
  'Lo escribe comercial.registrar_etiquetado (GP o DT). Sin UPDATE ni DELETE (RN-54).';

create policy pedido_etiquetados_select_authenticated on comercial.pedido_etiquetados
  for select to authenticated using (core.rol() is not null);
comment on policy pedido_etiquetados_select_authenticated on comercial.pedido_etiquetados is
  '§3.3: consulta para todos los roles; es parte de la trazabilidad del lote de producto terminado.';
create policy pedido_etiquetados_insert_gerencia_produccion on comercial.pedido_etiquetados
  for insert to authenticated with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA'));
comment on policy pedido_etiquetados_insert_gerencia_produccion on comercial.pedido_etiquetados is
  'Lo escribe comercial.terminar_pedido (GP o DT). Sin UPDATE ni DELETE.';

create policy etiquetado_anulaciones_select_authenticated on comercial.etiquetado_anulaciones
  for select to authenticated using (core.rol() is not null);
comment on policy etiquetado_anulaciones_select_authenticated on comercial.etiquetado_anulaciones is
  '§3.3: consulta para todos los roles.';
create policy etiquetado_anulaciones_insert_gerencia_produccion on comercial.etiquetado_anulaciones
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and anulado_por = core.usuario_actual());
comment on policy etiquetado_anulaciones_insert_gerencia_produccion on comercial.etiquetado_anulaciones is
  'Anula GP o DT, a su nombre, por comercial.anular_etiquetado (RN-54). Sin UPDATE ni DELETE.';

select core.adjuntar_auditoria('comercial.etiquetados');
select core.adjuntar_auditoria('comercial.etiquetado_consumos');
select core.adjuntar_auditoria('comercial.pedido_etiquetados');
select core.adjuntar_auditoria('comercial.etiquetado_anulaciones');

-- Lo que queda sin usar de cada etiquetado. Uno anulado no tiene saldo.
create view comercial.v_etiquetados_saldo with (security_invoker = true) as
select e.id as etiquetado_id, e.producto_id, e.cantidad, e.fecha, e.registrado_en,
       a.etiquetado_id is not null as anulado,
       case when a.etiquetado_id is not null then 0
            else e.cantidad - coalesce((select sum(pe.cantidad) from comercial.pedido_etiquetados pe
                                         where pe.etiquetado_id = e.id), 0)
       end as saldo
  from comercial.etiquetados e
  left join comercial.etiquetado_anulaciones a on a.etiquetado_id = e.id;

-- Envase o etiqueta que está adentro de envases etiquetados sin usar,
-- proporcional a lo que consumió cada etiquetado.
create or replace function comercial.en_etiquetados(p_insumo_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(c.cantidad * s.saldo / s.cantidad), 0)
    from comercial.etiquetado_consumos c
    join comercial.v_etiquetados_saldo s on s.etiquetado_id = c.etiquetado_id
   where c.insumo_id = p_insumo_id and s.saldo > 0;
$$;
revoke execute on function comercial.en_etiquetados(uuid) from public, anon;
grant execute on function comercial.en_etiquetados(uuid) to authenticated;

-- ===========================================================================
-- 4. Etiquetar
-- ===========================================================================

create or replace function comercial.registrar_etiquetado(p_producto_id uuid, p_cantidad integer)
returns comercial.etiquetados
language plpgsql
set search_path = ''
as $$
declare
  v_et       comercial.etiquetados%rowtype;
  m          record;
  v_consumo  uuid;
  v_articulo uuid;
  v_necesita numeric(16,4);
  v_restante numeric(16,4);
  v_toma     numeric(16,4);
  v_aprobado numeric(16,4);
  pos        record;
  v_nombre   text;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Etiquetar lo registra Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select nombre into v_nombre from gmp.productos where id = p_producto_id and activo;
  if not found then
    raise exception 'El producto no existe o está desactivado.' using errcode = 'check_violation';
  end if;
  -- El tercerizado etiqueta con material del cliente, que no es este circuito.
  if (select tercero_id from gmp.productos where id = p_producto_id) is not null then
    raise exception '«%» es de un cliente tercerizado: su envase y etiqueta salen de su stock, no se etiquetan acá.',
      v_nombre using errcode = 'check_violation';
  end if;
  if (select count(*) from gmp.materiales_acondicionamiento
       where producto_id = p_producto_id and activo and rol in ('ENVASE', 'ETIQUETA')) <> 2 then
    raise exception '«%» no tiene envase y etiqueta definidos: cargalos en «Tareas pendientes de carga».', v_nombre
      using errcode = 'check_violation';
  end if;

  insert into comercial.etiquetados (producto_id, cantidad) values (p_producto_id, p_cantidad)
  returning * into v_et;

  for m in
    select ma.insumo_id, ma.cantidad_por_unidad, ma.merma, i.nombre, i.unidad_medida
      from gmp.materiales_acondicionamiento ma
      join gmp.insumos_catalogo i on i.id = ma.insumo_id
     where ma.producto_id = p_producto_id and ma.activo and ma.rol in ('ENVASE', 'ETIQUETA')
  loop
    if m.unidad_medida is null then
      raise exception '«%» no tiene unidad de medida en el catálogo.', m.nombre using errcode = 'check_violation';
    end if;
    -- Misma cuenta que comercial.necesidad_pedido: lo que se cuenta por unidad, hacia arriba.
    v_necesita := p_cantidad * m.cantidad_por_unidad / (1 - m.merma);
    v_necesita := case when upper(m.unidad_medida) in ('UNIDAD', 'U', 'UN')
                       then ceil(v_necesita) else round(v_necesita, 4) end;

    insert into comercial.etiquetado_consumos (etiquetado_id, insumo_id, unidad, cantidad)
    values (v_et.id, m.insumo_id, m.unidad_medida, v_necesita)
    returning id into v_consumo;

    v_articulo := comercial.articulo_de_insumo(m.insumo_id);
    v_restante := v_necesita;
    for pos in
      select s.lote_insumo_id, s.deposito_id, s.saldo, l.unidad
        from comercial.v_saldos_stock s
        join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null
         and gmp.lote_consumible(s.lote_insumo_id)
       order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
    loop
      if pos.unidad is distinct from m.unidad_medida then
        raise exception 'El lote de % está en % y la ficha en %: no se puede descontar sin convertir.',
          m.nombre, pos.unidad, m.unidad_medida using errcode = 'check_violation';
      end if;
      v_toma := least(v_restante, pos.saldo);
      insert into comercial.movimientos_stock
        (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      values
        (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_CONSUMO_PRODUCCION', -v_toma,
         format('Etiquetado de %s %s', p_cantidad, v_nombre), 'ETIQUETADO_CONSUMO', v_consumo);
      v_restante := v_restante - v_toma;
      exit when v_restante <= 0;
    end loop;

    if v_restante > 0 then
      select coalesce(sum(s.saldo), 0) into v_aprobado
        from comercial.v_saldos_stock s join gmp.lotes_insumo l on l.id = s.lote_insumo_id
       where s.articulo_id = v_articulo and s.saldo > 0 and l.tercero_id is null;
      raise exception
        'No alcanza % para etiquetar %: faltan % %.%',
        m.nombre, p_cantidad, v_restante, m.unidad_medida,
        case when v_aprobado > v_necesita - v_restante
             then ' Hay más en stock, pero sin aprobar: calidad tiene que liberarlo antes de usarlo.'
             else ' No se descontó nada.' end
        using errcode = 'check_violation';
    end if;
  end loop;

  return v_et;
end;
$$;

comment on function comercial.registrar_etiquetado(uuid, integer) is
  'Registra envases etiquetados y descuenta envase y etiqueta de lotes aprobados, del que vence primero '
  '(como comercial.terminar_pedido). Todo o nada.';
revoke execute on function comercial.registrar_etiquetado(uuid, integer) from public, anon;
grant execute on function comercial.registrar_etiquetado(uuid, integer) to authenticated;

-- Anular un etiquetado mal cargado: registro rectificativo y movimientos
-- inversos de sus consumos, que devuelven envase y etiqueta al mismo lote
-- (RN-54). Solo si ningún pedido lo usó: después ya es producto terminado.
create or replace function comercial.anular_etiquetado(p_etiquetado_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_saldo comercial.v_etiquetados_saldo%rowtype;
  mv      comercial.movimientos_stock%rowtype;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Anular un etiquetado es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_saldo from comercial.v_etiquetados_saldo where etiquetado_id = p_etiquetado_id;
  if not found then
    raise exception 'El etiquetado no existe.';
  end if;
  if v_saldo.anulado then
    raise exception 'Ese etiquetado ya está anulado.' using errcode = 'check_violation';
  end if;
  if v_saldo.saldo <> v_saldo.cantidad then
    raise exception 'Ese etiquetado ya lo usó un pedido: no se anula. La diferencia se corrige con un ajuste de inventario.'
      using errcode = 'check_violation';
  end if;

  insert into comercial.etiquetado_anulaciones (etiquetado_id, motivo) values (p_etiquetado_id, btrim(p_motivo));

  for mv in
    select m.* from comercial.movimientos_stock m
      join comercial.etiquetado_consumos c on c.id = m.documento_id
     where m.documento_tipo = 'ETIQUETADO_CONSUMO' and c.etiquetado_id = p_etiquetado_id
       and m.anula_a_movimiento_id is null
  loop
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo, anula_a_movimiento_id)
    values
      (mv.articulo_id, mv.lote_insumo_id, mv.deposito_id, 'ENTRADA_AJUSTE', -mv.cantidad,
       format('Anulación de etiquetado: %s', btrim(p_motivo)), 'ERROR_DE_REGISTRO', mv.id);
  end loop;
end;
$$;

comment on function comercial.anular_etiquetado(uuid, text) is
  'Anula un etiquetado que ningún pedido usó: registro en etiquetado_anulaciones y movimientos inversos (RN-54).';
revoke execute on function comercial.anular_etiquetado(uuid, text) from public, anon;
grant execute on function comercial.anular_etiquetado(uuid, text) to authenticated;

-- ===========================================================================
-- 5. El consumo del etiquetado es un consumo de producción válido
-- ===========================================================================
--
-- Copia de 20260924150200 con una sola diferencia: SALIDA_CONSUMO_PRODUCCION
-- admite también documento ETIQUETADO_CONSUMO, con los mismos controles que
-- el del pedido (que el consumo exista y sea de ese insumo, que no se baje más
-- de lo declarado, que el lote sea consumible).

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
  v_etq         comercial.etiquetado_consumos%rowtype;
  v_ya_bajado   numeric(16,4);
begin
  -- ---- Tipos que todavía no tienen circuito -------------------------------
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

  new.unidad := v_lote.unidad;
  new.ocurrido_en := now();

  -- ---- Titular del lote (NUEVO en 20260924150200) -------------------------
  if new.tipo = 'ENTRADA_COMPRA' and v_lote.tercero_id is not null then
    raise exception 'El lote % es material de un cliente tercerizado: no entra como compra de Nail Show.',
      v_lote.numero_registro_interno
      using errcode = 'check_violation';
  end if;
  if new.tipo = 'ENTRADA_PROVISTO_TERCERO' then
    if v_lote.tercero_id is null then
      raise exception 'El lote % es de Nail Show: no entra como material provisto por un tercero.',
        v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    if new.documento_tipo is distinct from 'RECEPCION' or new.documento_id is distinct from v_lote.recepcion_id then
      raise exception 'El material de un tercero entra a stock con su recepción (comercial.ingresar_stock_tercero).'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- RN-51 y RN-52 ------------------------------------------------------
  if new.tipo = 'SALIDA_MUESTRA' then
    v_impedimento := gmp.impedimento_despacho(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede disponer de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  end if;

  -- ---- Consumo de producción ----------------------------------------------
  if new.tipo = 'SALIDA_CONSUMO_PRODUCCION' and new.documento_tipo = 'ETIQUETADO_CONSUMO' then
    -- NUEVO en 20261021120000: el envase y la etiqueta que consume un etiquetado.
    select * into v_etq from comercial.etiquetado_consumos where id = new.documento_id;
    if not found or v_etq.insumo_id <> v_articulo.insumo_id then
      raise exception 'El movimiento de consumo no corresponde a un etiquetado registrado de este insumo.'
        using errcode = 'check_violation';
    end if;
    if v_lote.tercero_id is not null then
      raise exception 'El etiquetado usa material de Nail Show; el lote % es de un tercero.', v_lote.numero_registro_interno
        using errcode = 'check_violation';
    end if;
    select coalesce(-sum(cantidad), 0) into v_ya_bajado
      from comercial.movimientos_stock
     where documento_id = v_etq.id and tipo = 'SALIDA_CONSUMO_PRODUCCION';
    if v_ya_bajado - new.cantidad > v_etq.cantidad then
      raise exception 'El etiquetado consume % % y los movimientos ya suman %: no se puede bajar más.',
        v_etq.cantidad, v_etq.unidad, v_ya_bajado
        using errcode = 'check_violation';
    end if;
    v_impedimento := gmp.impedimento_consumo(new.lote_insumo_id);
    if v_impedimento is not null then
      raise exception 'No se puede consumir de este lote. %', v_impedimento
        using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'SALIDA_CONSUMO_PRODUCCION' then
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

    -- NUEVO en 20260924150200: se consume del stock que el consumo declara.
    if v_lote.tercero_id is distinct from v_consumo.tercero_id then
      raise exception 'El lote % no es del stock del que se declaró el consumo.', v_lote.numero_registro_interno
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
-- 6. Necesidad del pedido, neta de envases etiquetados
-- ===========================================================================
--
-- comercial.necesidad_pedido sigue siendo la receta completa (la usan la
-- explosión y los faltantes, que suman el etiquetado como disponible). Esta es
-- lo que el pedido consume de verdad: de envase y etiqueta, solo lo que no
-- cubren los envases etiquetados. Si el pedido ya los tomó (pedido_etiquetados)
-- se usa eso; si no, lo que tomaría hoy. Un pedido de un tercerizado no usa
-- etiquetados de Nail Show.

create or replace function comercial.etiquetados_en_stock(p_producto_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(saldo), 0) from comercial.v_etiquetados_saldo where producto_id = p_producto_id;
$$;

create or replace function comercial.necesidad_pedido_neta(p_pedido_id uuid)
returns table (insumo_id uuid, necesario numeric)
language sql
stable
set search_path = ''
as $$
  with renglones as (
    select r.producto_id, r.cantidad,
           case when p.tercero_id is not null then 0
                else coalesce(
                  (select sum(pe.cantidad) from comercial.pedido_etiquetados pe
                    where pe.pedido_id = r.pedido_id and pe.producto_id = r.producto_id),
                  least(r.cantidad, comercial.etiquetados_en_stock(r.producto_id)))
           end as cubierto
      from comercial.pedido_renglones r
      join comercial.pedidos p on p.id = r.pedido_id
     where r.pedido_id = p_pedido_id and not r.anulado
  )
  select
    m.insumo_id,
    case
      when upper(coalesce(i.unidad_medida, '')) in ('UNIDAD', 'U', 'UN')
        then ceil(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                      * m.cantidad_por_unidad / (1 - m.merma)))
      else round(sum((r.cantidad - case when m.rol in ('ENVASE', 'ETIQUETA') then r.cubierto else 0 end)
                     * m.cantidad_por_unidad / (1 - m.merma)), 4)
    end
  from renglones r
  join gmp.materiales_acondicionamiento m on m.producto_id = r.producto_id and m.activo
  join gmp.insumos_catalogo i on i.id = m.insumo_id
  group by m.insumo_id, i.unidad_medida;
$$;

comment on function comercial.necesidad_pedido_neta(uuid) is
  'Lo que consume el pedido al terminarse: la receta, menos el envase y la etiqueta que cubren los envases '
  'etiquetados (D-etiquetado-1). La receta completa sigue en comercial.necesidad_pedido.';
revoke execute on function comercial.etiquetados_en_stock(uuid) from public, anon;
revoke execute on function comercial.necesidad_pedido_neta(uuid) from public, anon;
grant execute on function comercial.etiquetados_en_stock(uuid) to authenticated;
grant execute on function comercial.necesidad_pedido_neta(uuid) to authenticated;

-- La explosión de un pedido y los faltantes leen esto (no la vista). Copia de
-- 20260924150200 que suma, para Nail Show, el envase y la etiqueta que están
-- en envases etiquetados sin usar: si no, diría «faltan envases» justo
-- después de etiquetarlos.
create or replace function comercial.disponible_para(p_insumo_id uuid, p_titular uuid, p_para uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select greatest(
           coalesce((select saldo from comercial.v_saldo_consumible
                      where insumo_id = p_insumo_id and tercero_id is not distinct from p_titular), 0)
         + case when p_titular is null then comercial.en_etiquetados(p_insumo_id) else 0 end
         - coalesce((select sum(cantidad - consumido) from comercial.reservas_stock
                      where insumo_id = p_insumo_id
                        and tercero_id is not distinct from p_titular
                        and para_tercero_id is distinct from p_para
                        and not liberada and vence_en > now()), 0),
         0);
$$;

-- ===========================================================================
-- 7. Terminar pedido: toma primero los envases etiquetados
-- ===========================================================================
--
-- Copia de 20260929110100 con dos cambios: antes de consumir, el pedido toma
-- envases etiquetados (del más viejo al más nuevo) hasta cubrir cada renglón,
-- y el teórico sale de comercial.necesidad_pedido_neta.

CREATE OR REPLACE FUNCTION comercial.terminar_pedido(
  p_pedido_id  uuid,
  p_consumos   jsonb DEFAULT '[]'::jsonb,
  p_produccion jsonb DEFAULT NULL
)
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
  ep          record;
  v_dep       uuid;
  ren         record;
  et          record;
  v_falta_et  numeric(14,4);
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

  -- NUEVO en 20261021120000: los envases etiquetados que cubren el pedido.
  if v_pedido.tercero_id is null then
    for ren in
      select producto_id, cantidad
        from comercial.pedido_renglones
       where pedido_id = p_pedido_id and not anulado
    loop
      -- Dos pedidos del mismo producto terminándose a la vez no toman el
      -- mismo etiquetado. Lock por producto: etiquetados no admite UPDATE,
      -- así que FOR UPDATE no es posible.
      perform pg_advisory_xact_lock(hashtextextended('etiquetado|' || ren.producto_id::text, 0));
      v_falta_et := ren.cantidad;
      for et in
        select s.etiquetado_id, s.saldo
          from comercial.v_etiquetados_saldo s
         where s.producto_id = ren.producto_id and s.saldo > 0
         order by s.fecha, s.registrado_en
      loop
        exit when v_falta_et <= 0;
        insert into comercial.pedido_etiquetados (pedido_id, etiquetado_id, producto_id, cantidad)
        values (p_pedido_id, et.etiquetado_id, ren.producto_id, least(v_falta_et, et.saldo));
        v_falta_et := v_falta_et - least(v_falta_et, et.saldo);
      end loop;
    end loop;
  end if;

  for r in
    with teorico as (
      select n.insumo_id, n.necesario from comercial.necesidad_pedido_neta(p_pedido_id) n
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

  update comercial.reservas_stock
     set liberada = true
   where pedido_id = p_pedido_id and not liberada;

  update comercial.pedidos set estado = 'CUMPLIDO' where id = p_pedido_id;

  -- NUEVO en 20260929110000: cuánto se produjo y adónde va.
  if v_pedido.tercero_id is null then
    perform set_config('comercial.terminando_pedido', p_pedido_id::text, true);

    if p_produccion is null or jsonb_array_length(p_produccion) = 0 then
      insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
      select rr.producto_id,
             coalesce(v_pedido.destino_deposito_id, (select id from gmp.depositos where numero = 'PTF')),
             'ENTRADA_PRODUCCION',
             sum(rr.cantidad),
             format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente),
             'PEDIDO',
             p_pedido_id
        from comercial.pedido_renglones rr
       where rr.pedido_id = p_pedido_id and not rr.anulado
       group by rr.producto_id;
    else
      for ep in
        select (x ->> 'producto_id')::uuid                    as producto_id,
               (x ->> 'cantidad')::numeric                    as cantidad,
               coalesce(nullif(x ->> 'deposito', ''), 'PTF')  as deposito
          from jsonb_array_elements(p_produccion) x
      loop
        if ep.cantidad is null or ep.cantidad < 0 then
          raise exception 'La cantidad producida no es válida.' using errcode = 'check_violation';
        end if;
        continue when ep.cantidad = 0;
        select id into v_dep from gmp.depositos where numero = ep.deposito and numero in ('PTF', 'C5') and activo;
        if v_dep is null then
          raise exception 'Lo producido va a la fábrica (PTF) o a Calle 5 (C5).' using errcode = 'check_violation';
        end if;
        insert into comercial.movimientos_pt (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
        values (ep.producto_id, v_dep, 'ENTRADA_PRODUCCION', ep.cantidad,
                format('Producción del pedido %s — %s', v_pedido.numero, v_pedido.cliente), 'PEDIDO', p_pedido_id);
      end loop;
    end if;

    -- Lo producido para un cliente que va a Calle 5 queda reservado para su
    -- pedido, hasta lo pedido: si no, se lo puede llevar otro.
    if not v_pedido.para_stock then
      insert into comercial.reservas_pt (producto_id, deposito_id, pedido_id, cantidad, observacion)
      select m.producto_id, m.deposito_id, p_pedido_id,
             least(sum(m.cantidad), (select sum(rr.cantidad) from comercial.pedido_renglones rr
                                      where rr.pedido_id = p_pedido_id and rr.producto_id = m.producto_id and not rr.anulado)),
             format('Producido para el pedido %s', v_pedido.numero)
        from comercial.movimientos_pt m
        join gmp.depositos d on d.id = m.deposito_id and d.numero = 'C5'
       where m.documento_tipo = 'PEDIDO' and m.documento_id = p_pedido_id and m.tipo = 'ENTRADA_PRODUCCION'
       group by m.producto_id, m.deposito_id;
    end if;

    perform set_config('comercial.terminando_pedido', '', true);
  end if;
end;
$function$;

-- ===========================================================================
-- 8. Disponible: un envase etiquetado todavía es envase y etiqueta
-- ===========================================================================
--
-- Copia de 20260924150200 que suma, a cada envase y etiqueta, lo que está
-- adentro de envases etiquetados sin usar (proporcional a su consumo), igual
-- que comercial.disponible_para más arriba. Mismas columnas, mismo orden.

create or replace view comercial.v_disponible_por_insumo
with (security_invoker = true) as
with totales as (
  select insumo_id, saldo, saldo_apertura
    from comercial.v_saldo_consumible
   where tercero_id is null
),
etiquetado as (
  -- Misma cuenta que comercial.en_etiquetados, agrupada.
  select c.insumo_id, sum(c.cantidad * s.saldo / s.cantidad) as en_etiquetados
    from comercial.etiquetado_consumos c
    join comercial.v_etiquetados_saldo s on s.etiquetado_id = c.etiquetado_id
   where s.saldo > 0
   group by c.insumo_id
)
select
  i.id                                                        as insumo_id,
  i.codigo_interno,
  i.nombre                                                    as insumo_nombre,
  coalesce(t.saldo, 0) + coalesce(e.en_etiquetados, 0)        as saldo,
  coalesce(r.reservado, 0)                                    as reservado,
  greatest(coalesce(t.saldo, 0) + coalesce(e.en_etiquetados, 0) - coalesce(r.reservado, 0), 0) as disponible,
  coalesce(t.saldo_apertura, 0)                               as saldo_apertura
from gmp.insumos_catalogo i
left join totales t                          on t.insumo_id = i.id
left join etiquetado e                       on e.insumo_id = i.id
left join comercial.v_reservado_por_insumo r on r.insumo_id = i.id
where t.insumo_id is not null or r.insumo_id is not null or e.insumo_id is not null;

comment on view comercial.v_disponible_por_insumo is
  'Disponible de Nail Show para producción: saldo de lotes propios que gmp.lote_consumible() acepta, más el envase y '
  'la etiqueta que están en envases etiquetados sin usar (20261021120000), menos lo reservado.';

-- ===========================================================================
-- 9. Lo que ve Gerencia de Producción
-- ===========================================================================

-- «Faltan etiquetar»: por producto de Nail Show con pedidos en curso.
create view comercial.v_faltan_etiquetar with (security_invoker = true) as
with pendientes as (
  select r.producto_id, sum(r.cantidad)::integer as pendientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.tercero_id is null and p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
   group by r.producto_id
),
stock as (
  select producto_id, sum(saldo) as en_stock from comercial.v_etiquetados_saldo group by producto_id
),
hoy as (
  select e.producto_id, sum(e.cantidad)::integer as hoy
    from comercial.etiquetados e
   where e.fecha = comercial.hoy()
     and not exists (select 1 from comercial.etiquetado_anulaciones a where a.etiquetado_id = e.id)
   group by e.producto_id
),
roles as (
  select producto_id,
         bool_or(rol = 'ENVASE') as tiene_envase,
         bool_or(rol = 'ETIQUETA') as tiene_etiqueta
    from gmp.materiales_acondicionamiento where activo group by producto_id
)
select pr.id as producto_id, pr.codigo_interno, pr.nombre,
       coalesce(pe.pendientes, 0) as pendientes,
       coalesce(s.en_stock, 0) as en_stock,
       greatest(coalesce(pe.pendientes, 0) - coalesce(s.en_stock, 0), 0) as faltan,
       coalesce(h.hoy, 0) as etiquetados_hoy,
       coalesce(ro.tiene_envase and ro.tiene_etiqueta, false) as definido
  from gmp.productos pr
  left join pendientes pe on pe.producto_id = pr.id
  left join stock s on s.producto_id = pr.id
  left join hoy h on h.producto_id = pr.id
  left join roles ro on ro.producto_id = pr.id
 where pr.activo and pr.tercero_id is null
   and (pe.producto_id is not null or h.producto_id is not null or coalesce(s.en_stock, 0) > 0);

comment on view comercial.v_faltan_etiquetar is
  'Por producto: unidades de pedidos en curso (CONFIRMADO, EN_PRODUCCION) de Nail Show, envases etiquetados sin usar, '
  'cuántos faltan etiquetar y cuántos se etiquetaron hoy (D-etiquetado-1).';

-- Qué le falta cargar a cada producto.
create view comercial.v_tareas_carga with (security_invoker = true) as
with roles as (
  select producto_id,
         max(insumo_id::text) filter (where rol = 'ENVASE')::uuid   as envase_id,
         max(insumo_id::text) filter (where rol = 'ETIQUETA')::uuid as etiqueta_id,
         count(*) filter (where rol = 'EXTRA')                      as extras
    from gmp.materiales_acondicionamiento where activo group by producto_id
),
pendientes as (
  select r.producto_id, sum(r.cantidad)::integer as pendientes
    from comercial.pedido_renglones r
    join comercial.pedidos p on p.id = r.pedido_id
   where not r.anulado and p.estado in ('CONFIRMADO', 'EN_PRODUCCION')
   group by r.producto_id
)
select pr.id as producto_id, pr.codigo_interno, pr.nombre, pr.sin_formula,
       ro.envase_id, ro.etiqueta_id, coalesce(ro.extras, 0) as extras,
       exists (select 1 from gmp.formulas_fabricacion f where f.producto_id = pr.id) as tiene_formula,
       coalesce(pe.pendientes, 0) as pendientes
  from gmp.productos pr
  left join roles ro on ro.producto_id = pr.id
  left join pendientes pe on pe.producto_id = pr.id
 where pr.activo and pr.tercero_id is null
   and (ro.envase_id is null or ro.etiqueta_id is null
        or (not pr.sin_formula
            and not exists (select 1 from gmp.formulas_fabricacion f where f.producto_id = pr.id)));

comment on view comercial.v_tareas_carga is
  'Productos activos de Nail Show a los que les falta envase, etiqueta o fórmula (o la marca «no lleva fórmula»). '
  'Una fórmula en BORRADOR ya cuenta como cargada: dejarla vigente es otra tarea, de DT (D-etiquetado-1).';

-- ===========================================================================
-- 10. Trazabilidad: el lote de producto terminado llega a su envase y etiqueta
-- ===========================================================================
--
-- Copia de 20260930160000 con una rama más: los lotes de envase y etiqueta
-- que entraron al pedido por envases etiquetados (pedido_etiquetados →
-- etiquetado_consumos → movimientos ETIQUETADO_CONSUMO). La cantidad se
-- prorratea: un etiquetado de 1000 que tomó un pedido de 10 aporta 1/100 de
-- su consumo. Sin esto, un retiro de mercado no llegaría al lote de envase.

create or replace view comercial.v_trazabilidad_orden
with (security_invoker = true) as
select po.orden_id,
       'INSUMO'::text as sentido,
       m.ocurrido_en as momento,
       i.codigo_interno,
       i.nombre as articulo,
       -m.cantidad as cantidad,
       l.unidad,
       l.numero_registro_interno as lote_interno,
       l.lote_proveedor,
       r.numero as recepcion,
       coalesce(pr.razon_social, 'Saldo de apertura') as contraparte,
       p.numero as pedido
  from comercial.pedido_ordenes po
  join comercial.pedidos p on p.id = po.pedido_id
  join comercial.pedido_consumos c on c.pedido_id = p.id
  join comercial.movimientos_stock m
    on m.documento_tipo = 'PEDIDO_CONSUMO' and m.documento_id = c.id and m.anula_a_movimiento_id is null
   and not exists (select 1 from comercial.movimientos_stock x where x.anula_a_movimiento_id = m.id)
  join gmp.lotes_insumo l on l.id = m.lote_insumo_id
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  left join gmp.recepciones r on r.id = l.recepcion_id
  left join gmp.proveedores pr on pr.id = r.proveedor_id
union all
select po.orden_id,
       'INSUMO'::text,
       m.ocurrido_en,
       i.codigo_interno,
       i.nombre,
       round(-m.cantidad * pe.cantidad / e.cantidad, 4),
       l.unidad,
       l.numero_registro_interno,
       l.lote_proveedor,
       r.numero,
       coalesce(pr.razon_social, 'Saldo de apertura'),
       p.numero
  from comercial.pedido_ordenes po
  join comercial.pedidos p on p.id = po.pedido_id
  join comercial.pedido_etiquetados pe on pe.pedido_id = p.id
  join comercial.etiquetados e on e.id = pe.etiquetado_id
  join comercial.etiquetado_consumos ec on ec.etiquetado_id = e.id
  join comercial.movimientos_stock m
    on m.documento_tipo = 'ETIQUETADO_CONSUMO' and m.documento_id = ec.id and m.anula_a_movimiento_id is null
   and not exists (select 1 from comercial.movimientos_stock x where x.anula_a_movimiento_id = m.id)
  join gmp.lotes_insumo l on l.id = m.lote_insumo_id
  join gmp.insumos_catalogo i on i.id = l.insumo_id
  left join gmp.recepciones r on r.id = l.recepcion_id
  left join gmp.proveedores pr on pr.id = r.proveedor_id
union all
select m.orden_id,
       'DESPACHO'::text,
       m.ocurrido_en,
       pd.codigo_interno,
       pd.nombre,
       -m.cantidad,
       'u'::text,
       o.numero_lote,
       null::text,
       dep.numero,
       coalesce(p.cliente, 'Venta sin pedido'),
       p.numero
  from comercial.movimientos_pt m
  join gmp.ordenes_produccion o on o.id = m.orden_id
  join gmp.productos pd on pd.id = m.producto_id
  join gmp.depositos dep on dep.id = m.deposito_id
  left join comercial.pedidos p on m.documento_tipo = 'PEDIDO' and p.id = m.documento_id
 where m.tipo = 'SALIDA_VENTA'
union all
select po.orden_id,
       'DESPACHO'::text,
       m.ocurrido_en,
       pd.codigo_interno,
       pd.nombre,
       -m.cantidad,
       'u'::text,
       null::text,
       null::text,
       dep.numero,
       p.cliente,
       p.numero
  from comercial.pedido_ordenes po
  join comercial.pedidos p on p.id = po.pedido_id
  join comercial.movimientos_pt m
    on m.documento_tipo = 'PEDIDO' and m.documento_id = p.id and m.tipo = 'SALIDA_VENTA' and m.orden_id is null
  join gmp.productos pd on pd.id = m.producto_id
  join gmp.depositos dep on dep.id = m.deposito_id;

grant select on comercial.v_etiquetados_saldo, comercial.v_faltan_etiquetar, comercial.v_tareas_carga
  to authenticated;
