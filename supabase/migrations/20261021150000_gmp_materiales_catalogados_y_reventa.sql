-- ---------------------------------------------------------------------------
-- Propósito : 1) Un producto puede llevar más de una etiqueta (frente,
--                trasera): el envase etiquetado es un envase + todas sus
--                etiquetas. Cada material lleva una categoría libre
--                («Guarnición», «Etiqueta trasera», «Tapa»).
--             2) «No la sé»: Gerencia de Producción deriva la fórmula de un
--                producto a Dirección Técnica, que la ve en Fórmulas ›
--                Pendientes.
--             3) Producto de reventa: no lleva envase, etiqueta ni fórmula;
--                sale de las tareas de carga y del etiquetado.
-- Reglas    : D-etiquetado-1 (amplía), D-etiquetado-2 (este pedido,
--             2026-10-21). RN-54 y RN-13 siguen como en 20261021120000.
-- Fecha     : 2026-10-21
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Un envase por producto, etiquetas las que hagan falta
-- ===========================================================================

drop index gmp.materiales_un_envase_y_una_etiqueta;
create unique index materiales_un_envase
  on gmp.materiales_acondicionamiento (producto_id)
  where activo and rol = 'ENVASE';

alter table gmp.materiales_acondicionamiento
  add column categoria text check (categoria is null or length(btrim(categoria)) > 0);

comment on column gmp.materiales_acondicionamiento.categoria is
  'Qué es este material para el producto, en palabras de planta: «Etiqueta trasera», «Guarnición», «Tapa». Libre.';
comment on column gmp.materiales_acondicionamiento.rol is
  'ENVASE (uno vigente por producto) y ETIQUETA (una o más) forman el envase etiquetado; EXTRA es lo demás que se '
  'agrega al acondicionar. NULL = sin clasificar (cargas anteriores a 20261021120000).';

-- ===========================================================================
-- 2. Producto de reventa y fórmula consultada a Dirección Técnica
-- ===========================================================================

alter table gmp.productos
  add column solo_reventa           boolean not null default false,
  add column formula_consultada_en  timestamptz,
  add column formula_consultada_por uuid references core.usuarios(id);

create index productos_formula_consultada_por_idx on gmp.productos (formula_consultada_por);

comment on column gmp.productos.solo_reventa is
  'Producto final que se compra hecho y se revende: no lleva envase, etiqueta ni fórmula (D-etiquetado-2).';
comment on column gmp.productos.formula_consultada_en is
  'Cuándo Gerencia de Producción dijo que no sabe la fórmula y la derivó a Dirección Técnica (D-etiquetado-2).';

-- Quién y cuándo lo pone la base, no el que llama.
create or replace function gmp.consultar_formula(p_producto_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_filas integer;
begin
  if not core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Derivar una fórmula es de Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from gmp.productos where id = p_producto_id and activo and tercero_id is null) then
    raise exception 'El producto no existe, está desactivado o es de un cliente tercerizado.'
      using errcode = 'check_violation';
  end if;
  -- Única puerta a esas dos columnas (gmp.fn_formula_consultada_solo_por_funcion).
  perform set_config('gmp.consultando_formula', 'si', true);
  update gmp.productos
     set formula_consultada_en = now(), formula_consultada_por = core.usuario_actual()
   where id = p_producto_id and formula_consultada_en is null;
  get diagnostics v_filas = row_count;
  perform set_config('gmp.consultando_formula', '', true);
end;
$$;

-- Quién derivó y cuándo no se escribe a mano: un UPDATE directo podría poner
-- a otro como autor (CLAUDE.md §1: quién lo escribió y cuándo).
create or replace function gmp.fn_formula_consultada_solo_por_funcion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.formula_consultada_en, new.formula_consultada_por)
       is distinct from (old.formula_consultada_en, old.formula_consultada_por)
     and coalesce(current_setting('gmp.consultando_formula', true), '') <> 'si' then
    raise exception 'Quién derivó la fórmula y cuándo lo registra gmp.consultar_formula, no un cambio a mano.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger trg_formula_consultada_solo_por_funcion
  before update on gmp.productos
  for each row execute function gmp.fn_formula_consultada_solo_por_funcion();

comment on function gmp.consultar_formula(uuid) is
  '«No la sé»: deriva la fórmula del producto a Dirección Técnica (Fórmulas › Pendientes).';
revoke execute on function gmp.consultar_formula(uuid) from public, anon;
grant execute on function gmp.consultar_formula(uuid) to authenticated;

-- Lo que Dirección Técnica tiene que cargar.
create view gmp.v_formulas_consultadas with (security_invoker = true) as
select p.id as producto_id, p.codigo_interno, p.nombre, p.formula_consultada_en,
       u.nombre_completo as consultada_por
  from gmp.productos p
  -- core.v_nomina y no core.usuarios: la ficha está restringida (20260911180000).
  left join core.v_nomina u on u.id = p.formula_consultada_por
 where p.formula_consultada_en is not null
   and p.activo and not p.sin_formula and not p.solo_reventa
   -- Una dada de baja no cuenta: el producto sigue sin fórmula.
   and not exists (select 1 from gmp.formulas_fabricacion f
                    where f.producto_id = p.id and f.estado <> 'DADO_DE_BAJA');

comment on view gmp.v_formulas_consultadas is
  'Productos cuya fórmula Gerencia de Producción derivó a Dirección Técnica y que todavía no la tienen.';
grant select on gmp.v_formulas_consultadas to authenticated;

-- ===========================================================================
-- 3. Etiquetar: un envase y todas sus etiquetas
-- ===========================================================================
--
-- Copia de 20261021120000 con dos cambios: el control pide un envase y al
-- menos una etiqueta (antes, exactamente una de cada), y rechaza la reventa.

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
  if (select solo_reventa from gmp.productos where id = p_producto_id) then
    raise exception '«%» es de reventa: no se etiqueta.', v_nombre using errcode = 'check_violation';
  end if;
  if (select count(*) from gmp.materiales_acondicionamiento
       where producto_id = p_producto_id and activo and rol = 'ENVASE') <> 1
     or not exists (select 1 from gmp.materiales_acondicionamiento
                     where producto_id = p_producto_id and activo and rol = 'ETIQUETA') then
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

-- ===========================================================================
-- 4. Lo que ve Gerencia de Producción, sin reventa
-- ===========================================================================

-- Copia de 20261021120000 con la reventa afuera. Mismas columnas.
create or replace view comercial.v_faltan_etiquetar with (security_invoker = true) as
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
 where pr.activo and pr.tercero_id is null and not pr.solo_reventa
   and (pe.producto_id is not null or h.producto_id is not null or coalesce(s.en_stock, 0) > 0);

-- Copia de 20261021120000: sin reventa, una fórmula derivada a DT deja de
-- ser tarea de GP, y dos columnas nuevas al final.
create or replace view comercial.v_tareas_carga with (security_invoker = true) as
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
       exists (select 1 from gmp.formulas_fabricacion f
                where f.producto_id = pr.id and f.estado <> 'DADO_DE_BAJA') as tiene_formula,
       coalesce(pe.pendientes, 0) as pendientes,
       pr.formula_consultada_en is not null as formula_consultada,
       pr.solo_reventa
  from gmp.productos pr
  left join roles ro on ro.producto_id = pr.id
  left join pendientes pe on pe.producto_id = pr.id
 where pr.activo and pr.tercero_id is null and not pr.solo_reventa
   and (ro.envase_id is null or ro.etiqueta_id is null
        or (not pr.sin_formula and pr.formula_consultada_en is null
            and not exists (select 1 from gmp.formulas_fabricacion f
                             where f.producto_id = pr.id and f.estado <> 'DADO_DE_BAJA')));

comment on view comercial.v_tareas_carga is
  'Productos activos de Nail Show (no de reventa) a los que les falta envase, etiqueta o fórmula. Una fórmula en '
  'BORRADOR o derivada a DT ya no es tarea de GP (D-etiquetado-1, D-etiquetado-2).';
