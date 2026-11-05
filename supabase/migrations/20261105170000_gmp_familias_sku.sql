-- ---------------------------------------------------------------------------
-- Propósito : Familias de SKU. Cada producto lleva su familia (Exfoliante,
--             Sanitizante, Polvo acrílico…) y su variante (la fragancia o el
--             color: AMOR, PAZ, CLEAR TRANSPARENTE…); las presentaciones son
--             los productos de una misma familia y variante. Al dejar vigente
--             la fórmula de una presentación, se deja vigente la misma en las
--             demás: cambian las cantidades del lote, no los componentes.
-- Reglas    : D-familias-sku-1 (codirector técnico, 2026-11-05). PG.60.8
--             (fórmula maestra: cada presentación tiene su versión, aprobada
--             por la DT), D-nuevo-producto-3 (la vigente anterior pasa a
--             DADO_DE_BAJA), RN-50 (todo queda en core.auditoria), invariante 1.
-- Fecha     : 2026-11-05
-- ---------------------------------------------------------------------------
--
-- Familia y variante son texto en gmp.productos: agrupan, no tienen datos
-- propios. Las edita quien edita el producto (productos_update_tecnicos).
--
-- REPLICAR. Al pasar a VIGENTE la fórmula de un producto con familia, cada
-- hermano de presentación (misma familia y variante, activo, que lleva
-- fórmula) recibe una versión nueva con los mismos componentes, densidad,
-- rendimiento, base y procedimiento, y la DT que aprobó la aprueba en la misma
-- transacción, a su nombre. Se saltea el hermano que:
--   · ya tiene vigente una con los mismos componentes (nada que cambiar);
--   · envasa un granel (versión «Envasado», D-orden-producto-1): no lleva la
--     fórmula del granel, lleva el granel.
-- Una fórmula de envasado tampoco se replica. Lo que el hermano tenía en
-- borrador queda como está.

alter table gmp.productos
  add column familia  text check (familia is null or length(btrim(familia)) > 0),
  add column variante text check (variante is null or length(btrim(variante)) > 0),
  add constraint productos_variante_con_familia check (variante is null or familia is not null);

comment on column gmp.productos.familia is
  'Familia de SKU (D-familias-sku-1): Exfoliante, Sanitizante, Polvo acrílico… Null = sin familia.';
comment on column gmp.productos.variante is
  'Fragancia o color dentro de la familia (AMOR, PAZ, CLEAR TRANSPARENTE…). Los productos de la misma familia y '
  'variante son presentaciones de una misma fórmula (D-familias-sku-1).';

create index productos_familia_idx on gmp.productos (familia, variante) where familia is not null;

-- ===========================================================================
-- 1. Replicar la fórmula vigente a las demás presentaciones
-- ===========================================================================

-- Los componentes de una fórmula como un valor comparable.
create or replace function gmp.huella_formula(p_formula_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(c.insumo_id, c.nombre_libre, c.porcentaje_pp, c.es_csp,
                                              c.se_mide_a_volumen, c.densidad_id)
                            order by c.orden), '[]'::jsonb)
    from gmp.formula_componentes c
   where c.formula_id = p_formula_id and not c.anulado;
$$;

comment on function gmp.huella_formula(uuid) is
  'D-familias-sku-1: los componentes de una fórmula (sin anulados), en orden, para comparar dos fórmulas.';
revoke execute on function gmp.huella_formula(uuid) from public, anon;
grant execute on function gmp.huella_formula(uuid) to authenticated;

create or replace function gmp.fn_formula_replicar_presentaciones()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prod    gmp.productos%rowtype;
  v_huella  jsonb;
  v_texto   text;
  v_pv      integer;
  h         record;
  v_ant     gmp.formulas_fabricacion%rowtype;
  v_version integer;
  v_id      uuid;
begin
  -- Las réplicas también pasan a vigente: no se replican de nuevo.
  if coalesce(current_setting('gmp.replicando_formula', true), '') = 'si' then
    return null;
  end if;
  -- Envasar un granel no es la fórmula de la familia.
  if new.version = 'Envasado' then
    return null;
  end if;
  select * into v_prod from gmp.productos where id = new.producto_id;
  if v_prod.familia is null then
    return null;
  end if;

  v_huella := gmp.huella_formula(new.id);
  select texto, version into v_texto, v_pv from gmp.v_procedimiento_vigente where formula_id = new.id;
  perform set_config('gmp.replicando_formula', 'si', true);

  for h in
    select p.id, p.codigo_interno
      from gmp.productos p
     where p.familia = v_prod.familia
       and p.variante is not distinct from v_prod.variante
       and p.id <> v_prod.id
       and p.activo and not p.sin_formula and not p.solo_reventa
     order by p.codigo_interno
  loop
    select * into v_ant from gmp.formulas_fabricacion
     where producto_id = h.id and variedad is not distinct from new.variedad and estado = 'VIGENTE';
    if found and (v_ant.version = 'Envasado' or gmp.huella_formula(v_ant.id) = v_huella) then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('formula|' || h.id::text, 0));
    select coalesce(max(version::integer), 0) + 1 into v_version
      from gmp.formulas_fabricacion
     where producto_id = h.id and variedad is not distinct from new.variedad and version ~ '^[0-9]+$';

    insert into gmp.formulas_fabricacion
      (producto_id, variedad, especificacion_id, codigo_me, version, densidad_producto, densidad_temp_c,
       rendimiento, base_porcentaje)
    values
      (h.id, new.variedad, v_ant.especificacion_id, v_ant.codigo_me, v_version::text,
       new.densidad_producto, new.densidad_temp_c, new.rendimiento, new.base_porcentaje)
    returning id into v_id;

    insert into gmp.formula_componentes
      (formula_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
       etapa, observacion)
    select v_id, orden, insumo_id, nombre_libre, porcentaje_pp, es_csp, se_mide_a_volumen, densidad_id,
           etapa, observacion
      from gmp.formula_componentes
     where formula_id = new.id and not anulado;

    if v_texto is not null then
      insert into gmp.formula_procedimientos (formula_id, version, texto, motivo_cambio)
      values (v_id, 0, v_texto,
              format('Misma fórmula que %s v%s (familia %s), procedimiento v%s',
                     v_prod.codigo_interno, new.version, v_prod.familia, v_pv));
    end if;

    -- La aprueba la misma DT (fn_formula_aprobacion) y da de baja la anterior.
    update gmp.formulas_fabricacion set estado = 'VIGENTE' where id = v_id;
  end loop;

  perform set_config('gmp.replicando_formula', '', true);
  return null;
end;
$$;

comment on function gmp.fn_formula_replicar_presentaciones() is
  'D-familias-sku-1: al pasar a VIGENTE la fórmula de un producto con familia, la misma (componentes, densidad, '
  'rendimiento, procedimiento) pasa a vigente en las demás presentaciones de su familia y variante, aprobada por '
  'la misma DT. Saltea las que ya la tienen y las de envasado de granel.';

create trigger trg_formula_replicar_presentaciones
  after update of estado on gmp.formulas_fabricacion
  for each row
  when (new.estado = 'VIGENTE' and old.estado is distinct from 'VIGENTE')
  execute function gmp.fn_formula_replicar_presentaciones();

-- ===========================================================================
-- 2. Las familias de hoy (agrupadas por nombre, 2026-11-05)
-- ===========================================================================

do $$
declare
  v_dt uuid;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is not null then
    perform set_config(
      'request.jwt.claims',
      json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                        'roles', json_build_array('DIRECCION_TECNICA'))::text,
      true
    );
  end if;

  update gmp.productos p
     set familia = t.familia, variante = t.variante
    from (values
      ('378','Aceite de cutícula','AMOR'), ('381','Aceite de cutícula','AMOR'),
      ('379','Aceite de cutícula','AIRE'), ('382','Aceite de cutícula','AIRE'),
      ('380','Aceite de cutícula','PAZ'),  ('383','Aceite de cutícula','PAZ'),
      ('364','Exfoliante','AMOR'), ('367','Exfoliante','AMOR'),
      ('365','Exfoliante','AIRE'), ('368','Exfoliante','AIRE'),
      ('366','Exfoliante','PAZ'),  ('369','Exfoliante','PAZ'),
      ('370','Humectante','AMOR'), ('373','Humectante','AMOR'),
      ('371','Humectante','AIRE'), ('374','Humectante','AIRE'),
      ('372','Humectante','PAZ'),  ('375','Humectante','PAZ'),
      ('391','Sanitizante','AMOR'), ('392','Sanitizante','AMOR'), ('NS-397','Sanitizante','AMOR'),
      ('393','Sanitizante','AIRE'), ('394','Sanitizante','AIRE'), ('NS-398','Sanitizante','AIRE'),
      ('395','Sanitizante','PAZ'),  ('396','Sanitizante','PAZ'),  ('NS-399','Sanitizante','PAZ'),
      ('384','Clarificador (cleanser)',null), ('385','Clarificador (cleanser)',null),
      ('386','Clarificador (cleanser)',null),
      ('192','Removedor',null), ('195','Removedor',null),
      ('101','Monómero',null), ('102','Monómero',null), ('103','Monómero',null),
      ('340','Aceite para torno',null), ('376','Aceite para torno',null),
      ('82','Polvo acrílico','CLEAR TRANSPARENTE'), ('95','Polvo acrílico','CLEAR TRANSPARENTE'),
      ('83','Polvo acrílico','BLANCO FRENCH'),      ('96','Polvo acrílico','BLANCO FRENCH'),
      ('84','Polvo acrílico','BLANCO SHIMMER'),     ('97','Polvo acrílico','BLANCO SHIMMER'),
      ('85','Polvo acrílico','SHOW COVER PINK'),    ('98','Polvo acrílico','SHOW COVER PINK'),
      ('86','Polvo acrílico','SOFT COVER PINK'),    ('99','Polvo acrílico','SOFT COVER PINK'),
      ('87','Polvo acrílico','DARK COVER PINK'),    ('100','Polvo acrílico','DARK COVER PINK'),
      ('81','Polvo acrílico','ROSADO NATURAL'),     ('94','Polvo acrílico','ROSADO NATURAL'),
      ('80','Polvo acrílico','ROSADO TRASLÚCIDO'),  ('93','Polvo acrílico','ROSADO TRASLÚCIDO'),
      ('78','Polvo acrílico','VÍA LÁCTEA'),         ('79','Polvo acrílico','VÍA LÁCTEA'),
      ('88','Polvo acrílico','PINKY COVER PINK'),
      ('89','Polvo acrílico','COVER PINK BEIGE'),
      ('90','Polvo acrílico','COVER PINK DIAMONDS'),
      ('91','Polvo acrílico','COVER PINK PRINCESS'),
      ('92','Polvo acrílico','COVER PINK GOLDEN TOUCH'),
      ('463','Stardust','CLEAR'), ('464','Stardust','CLEAR'), ('465','Stardust','CLEAR'),
      ('457','Stardust','COVER'), ('458','Stardust','COVER'), ('459','Stardust','COVER'),
      ('460','Stardust','SOFT WHITE'), ('461','Stardust','SOFT WHITE'), ('462','Stardust','SOFT WHITE'),
      ('450','Stardust','BLUE'), ('451','Stardust','GREEN'), ('453','Stardust','LILA'),
      ('452','Stardust','PINK'), ('454','Stardust','SILVER'), ('455','Stardust','SUN'),
      ('TP-00020','Aceite de cutícula Jennifer Beauty','COCO / VAINILLA'),
      ('TP-00016','Aceite de cutícula Jennifer Beauty','FRUTOS ROJOS'),
      ('TP-00012','Aceite de cutícula Jennifer Beauty','MANGO / DURAZNO'),
      ('TP-00018','Crema exfoliante Jennifer Beauty','COCO / VAINILLA'),
      ('TP-00014','Crema exfoliante Jennifer Beauty','FRUTOS ROJOS'),
      ('TP-00010','Crema exfoliante Jennifer Beauty','MANGO / DURAZNO'),
      ('TP-00017','Crema humectante Jennifer Beauty','COCO / VAINILLA'),
      ('TP-00013','Crema humectante Jennifer Beauty','FRUTOS ROJOS'),
      ('TP-00009','Crema humectante Jennifer Beauty','MANGO / DURAZNO'),
      ('TP-00019','Sanitizante Jennifer Beauty','COCO / VAINILLA'),
      ('TP-00015','Sanitizante Jennifer Beauty','FRUTOS ROJOS'),
      ('TP-00011','Sanitizante Jennifer Beauty','MANGO / DURAZNO')
    ) as t (codigo, familia, variante)
   where p.codigo_interno = t.codigo;

  -- Esmalte tradicional: la variante es el color del nombre.
  update gmp.productos
     set familia = 'Esmalte tradicional',
         variante = upper(btrim(regexp_replace(nombre, '^ESMALTE TRADICIONAL\s+', '', 'i')))
   where nombre ~* '^ESMALTE TRADICIONAL\s+\S';
end;
$$;
