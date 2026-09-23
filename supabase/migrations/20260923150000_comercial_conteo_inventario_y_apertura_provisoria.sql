-- ---------------------------------------------------------------------------
-- Propósito : (1) Registro de conteo físico de inventario, que lleva el saldo
--             de cada insumo a lo contado con un ajuste trazable.
--             (2) Corrección provisoria del saldo de apertura de las materias
--             primas: 1 envase × contenido de la planilla, a la espera del
--             conteo.
-- Reglas    : RN-54 (el movimiento no se edita: se corrige con otro), RN-50
--             (auditoría), §3.3 «Ajustar stock por diferencia de inventario»
--             (DT, ADM, GP). Resuelve en forma provisoria D-26.
-- Fecha     : 2026-09-23
-- ---------------------------------------------------------------------------
--
-- EL PROBLEMA (D-26).
-- La carga 20260922200000 leyó la columna CANTIDAD de la hoja INVENTARIO como
-- existencia. Para las materias primas esa columna vale 1 en todos los
-- renglones: es «1 envase», la unidad a la que se refiere el costo, y la
-- existencia quedó en 1 g de monómero, 1 g de agua, 1 g de glicerina.
--
-- LO QUE SE DECIDIÓ (conducción del proyecto, 2026-09-23).
--   - Ahora: tomar 1 envase × CONTENIDO como saldo provisorio, marcado como
--     tal. Lectura de la unidad del contenido, confirmada: monómero, agua,
--     glicerina, alcoholes, esencia y aceite en litros; polvo, pigmentos y
--     acrílicos en kg; fragancias en ml.
--   - Después: contar, y cargar lo contado con esta misma herramienta.
--
-- CÓMO SE CORRIGE SIN BORRAR.
-- Nada del saldo de apertura se toca. Cada corrección es un renglón de
-- comercial.conteos_inventario (qué se contó, qué había, la diferencia,
-- provisorio o no, quién) y un ajuste de inventario por la diferencia sobre el
-- lote de apertura del insumo. El inspector ve el 1 original, el ajuste y por
-- qué.
--
-- QUÉ QUEDA AFUERA DEL PROVISORIO.
--   - Fragancias: el contenido es 1000 ml, pero se llevan en gramos y no hay
--     densidad cargada. Se cuentan.
--   - Materias primas que no están en la lectura confirmada (top coat, nail
--     prep, adhesivo, aloe, propilenglicol, microperlas, resina): se cuentan.
--   - Envases, tapas y etiquetas: no es lo que se señaló como mal, y su
--     cantidad sí varía de renglón a renglón. Se cuentan si hace falta.
--
-- ESENCIA EN ml.
-- 20260923135000 pasó 101ESE a ml. Su lote de apertura está en g y la unidad
-- de un lote no se reescribe, así que se abre un lote de apertura en ml (misma
-- migración de apertura, misma planilla) y el de g se lleva a cero con un
-- ajuste que dice por qué.
--
-- A NOMBRE DE QUIÉN.
-- La corrección provisoria la indicó el codirector técnico (Dirección Técnica
-- suplente), y a su nombre queda. Mismo mecanismo que la carga de apertura:
-- el claim se fija solo para esta transacción.

-- ===========================================================================
-- 1. Registro de conteos
-- ===========================================================================

create table comercial.conteos_inventario (
  id               uuid primary key default gen_random_uuid(),
  insumo_id        uuid not null references gmp.insumos_catalogo(id),
  unidad           text not null,
  cantidad_contada numeric(16,4) not null check (cantidad_contada >= 0),
  saldo_previo     numeric(16,4) not null,
  diferencia       numeric(16,4) generated always as (cantidad_contada - saldo_previo) stored,
  -- Provisorio = no es un conteo físico sino una estimación a reemplazar.
  provisorio       boolean not null default false,
  observacion      text,
  registrado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en    timestamptz not null default now(),
  constraint conteos_provisorio_explicado check (
    not provisorio or length(btrim(coalesce(observacion, ''))) > 0
  )
);

comment on table comercial.conteos_inventario is
  'Conteos de inventario por insumo. Cada uno lleva el saldo a lo contado con un ajuste (documento_tipo = CONTEO). '
  'El último conteo de un insumo dice si su saldo es contado o todavía provisorio.';

create index conteos_inventario_insumo_idx on comercial.conteos_inventario (insumo_id, registrado_en desc);

create or replace function comercial.fn_conteo_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Un conteo registrado no se modifica. Si estuvo mal, se registra un conteo nuevo.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_conteo_inmutable
  before update or delete on comercial.conteos_inventario
  for each row execute function comercial.fn_conteo_inmutable();

alter table comercial.conteos_inventario enable row level security;
alter table comercial.conteos_inventario force  row level security;

grant select, insert on comercial.conteos_inventario to authenticated;

create policy conteos_inventario_select_authenticated on comercial.conteos_inventario
  for select to authenticated using (core.rol() is not null);
comment on policy conteos_inventario_select_authenticated on comercial.conteos_inventario is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles.';

create policy conteos_inventario_insert_stock on comercial.conteos_inventario
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy conteos_inventario_insert_stock on comercial.conteos_inventario is
  '§3.3 «Ajustar stock por diferencia de inventario»: DT, ADM y GP, los mismos que pueden ajustar.';

select core.adjuntar_auditoria('comercial.conteos_inventario');

-- ===========================================================================
-- 2. registrar_conteo
-- ===========================================================================
--
-- Lleva el saldo total del insumo a lo contado. La diferencia cae sobre el
-- lote de apertura del insumo (el material sin lote identificado): los lotes
-- con recepción y circuito de calidad no se tocan desde acá, porque su saldo
-- está respaldado por un documento y una diferencia en ellos se ajusta lote por
-- lote, con su motivo, desde la ficha del lote.
--
-- Si el conteo da menos de lo que hay en lotes con recepción, la diferencia no
-- entra en el lote de apertura y se rechaza con un mensaje que lo dice.

create or replace function comercial.registrar_conteo(
  p_insumo_id   uuid,
  p_cantidad    numeric,
  p_observacion text default null,
  p_provisorio  boolean default false
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_insumo      gmp.insumos_catalogo%rowtype;
  v_lote        gmp.lotes_insumo%rowtype;
  v_articulo    uuid;
  v_total       numeric(16,4);
  v_otra_unidad numeric(16,4);
  v_en_apertura numeric(16,4);
  v_diferencia  numeric(16,4);
  v_conteo      uuid;
  v_motivo      text;
begin
  if not core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION') then
    raise exception 'Registrar un conteo es de quien ajusta inventario: DT, Administración o Gerencia de Producción (§3.3).'
      using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad < 0 then
    raise exception 'La cantidad contada tiene que ser cero o más.' using errcode = 'check_violation';
  end if;

  select * into v_insumo from gmp.insumos_catalogo where id = p_insumo_id;
  if not found then
    raise exception 'El insumo no existe.';
  end if;
  if v_insumo.unidad_medida is null then
    raise exception 'El insumo % no tiene unidad de medida confirmada: no se puede contar.', v_insumo.codigo_interno
      using errcode = 'check_violation';
  end if;

  select * into v_lote
    from gmp.lotes_insumo
   where insumo_id = p_insumo_id
     and estado = 'SALDO_APERTURA'
     and unidad = v_insumo.unidad_medida
   order by creado_en desc
   limit 1;
  if not found then
    raise exception
      'El insumo % no tiene lote de saldo de apertura en %: su existencia entra por recepción.',
      v_insumo.codigo_interno, v_insumo.unidad_medida
      using errcode = 'check_violation';
  end if;

  v_articulo := comercial.articulo_de_insumo(p_insumo_id);

  select coalesce(sum(s.saldo) filter (where l.unidad = v_insumo.unidad_medida), 0),
         coalesce(sum(s.saldo) filter (where l.unidad <> v_insumo.unidad_medida), 0),
         coalesce(sum(s.saldo) filter (where s.lote_insumo_id = v_lote.id and s.deposito_id = v_lote.deposito_actual_id), 0)
    into v_total, v_otra_unidad, v_en_apertura
    from comercial.v_saldos_stock s
    join gmp.lotes_insumo l on l.id = s.lote_insumo_id
   where s.articulo_id = v_articulo;

  if v_otra_unidad <> 0 then
    raise exception
      'El insumo % tiene saldo registrado en otra unidad que la del catálogo (%): hay que llevar ese lote a cero antes de contar.',
      v_insumo.codigo_interno, v_insumo.unidad_medida
      using errcode = 'check_violation';
  end if;

  v_diferencia := p_cantidad - v_total;

  if v_en_apertura + v_diferencia < 0 then
    raise exception
      'Se contaron % % de % y hay % registrados en lotes con recepción. La diferencia no se puede explicar con el saldo de apertura: '
      'corresponde ajustar esos lotes uno por uno desde Stock, con su motivo.',
      p_cantidad, v_insumo.unidad_medida, v_insumo.codigo_interno, v_total - v_en_apertura
      using errcode = 'check_violation';
  end if;

  insert into comercial.conteos_inventario
    (insumo_id, unidad, cantidad_contada, saldo_previo, provisorio, observacion)
  values
    (p_insumo_id, v_insumo.unidad_medida, p_cantidad, v_total, p_provisorio, nullif(btrim(p_observacion), ''))
  returning id into v_conteo;

  if v_diferencia = 0 then
    return 0;
  end if;

  v_motivo := case when p_provisorio then 'Saldo provisorio' else 'Conteo físico' end
              || format(': %s %s contados, había %s', p_cantidad, v_insumo.unidad_medida, v_total)
              || coalesce('. ' || nullif(btrim(p_observacion), ''), '');

  insert into comercial.movimientos_stock
    (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo,
     documento_tipo, documento_id)
  values
    (v_articulo, v_lote.id, v_lote.deposito_actual_id,
     case when v_diferencia > 0 then 'ENTRADA_AJUSTE' else 'SALIDA_AJUSTE' end::comercial.tipo_movimiento_enum,
     v_diferencia, v_motivo, 'DIFERENCIA_DE_INVENTARIO', 'CONTEO', v_conteo);

  return v_diferencia;
end;
$$;

comment on function comercial.registrar_conteo(uuid, numeric, text, boolean) is
  'Lleva el saldo de un insumo a lo contado: registra el conteo y ajusta la diferencia sobre su lote de saldo de apertura. '
  'No toca lotes con recepción. p_provisorio marca una estimación que todavía hay que contar.';

grant execute on function comercial.registrar_conteo(uuid, numeric, text, boolean) to authenticated;

-- Último conteo de cada insumo: la pantalla lo usa para mostrar qué está
-- contado, qué es provisorio y qué nunca se contó.
create view comercial.v_ultimo_conteo
with (security_invoker = true) as
select distinct on (c.insumo_id)
  c.insumo_id, c.id as conteo_id, c.cantidad_contada, c.unidad, c.provisorio,
  c.registrado_en, c.registrado_por, n.nombre_completo as registrado_por_nombre
from comercial.conteos_inventario c
left join core.v_nomina n on n.id = c.registrado_por
order by c.insumo_id, c.registrado_en desc;

grant select on comercial.v_ultimo_conteo to authenticated;

-- ===========================================================================
-- 3. Datos: lotes de apertura que faltan, esencia en ml, provisorio
-- ===========================================================================

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  r           record;
  v_ml        gmp.lotes_insumo%rowtype;
  v_g         record;
begin
  -- A nombre del codirector técnico, que indicó la corrección.
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va la corrección.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  select id into v_migracion from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_migracion is null then
    raise exception 'No hay carga de saldo de apertura: esta corrección supone 20260922200000 aplicada.';
  end if;

  -- 3.a Lote de apertura (sin cantidad) para cada insumo del catálogo que no
  -- tenga uno en su unidad: los dados de alta hoy y los que la carga dejó
  -- afuera. Sin él, el conteo no tiene dónde asentarse.
  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (alta 2026-09-23)', i.unidad_medida
    from gmp.insumos_catalogo i
   where i.activo
     and i.unidad_medida is not null
     and not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  -- 3.b Esencia: el lote viejo en g se lleva a cero.
  for v_g in
    select s.articulo_id, s.lote_insumo_id, s.deposito_id, s.saldo
      from comercial.v_saldos_stock s
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id
      join gmp.insumos_catalogo i on i.id = l.insumo_id
     where i.codigo_interno = '101ESE' and l.unidad <> 'ml' and s.saldo <> 0
  loop
    insert into comercial.movimientos_stock
      (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo)
    values
      (v_g.articulo_id, v_g.lote_insumo_id, v_g.deposito_id,
       case when v_g.saldo > 0 then 'SALIDA_AJUSTE' else 'ENTRADA_AJUSTE' end::comercial.tipo_movimiento_enum,
       -v_g.saldo,
       'La esencia pasó a manejarse en ml (20260923135000): este lote en g queda en cero y el saldo sigue en el lote en ml.',
       'ERROR_DE_REGISTRO');
  end loop;

  -- 3.c Provisorio: 1 envase × contenido, en la unidad del catálogo.
  for r in
    with lectura (codigo, contenido, unidad, compuesto) as (
      values
        ('101MONO', 200,  'L',  'Metacrilato de etilo (EMA)'),
        ('135AGUA', 10,   'L',  'Agua desionizada'),
        ('135GLI',  10,   'L',  'Glicerina'),
        ('138CL1',  1,    'L',  'Etanol 96 GL'),
        ('138CL2',  1,    'L',  '2-Propanol (IPA)'),
        ('135SAN',  1,    'L',  'Etanol 96 GL'),
        ('101ESE',  1,    'L',  null),
        ('131AC',   1,    'L',  'Vaselina líquida liviana (Paraffinum liquidum perliquidum)'),
        ('378ACE',  1,    'L',  'Vaselina líquida liviana (Paraffinum liquidum perliquidum)'),
        ('080POL',  1,    'kg', null)
      union all
      -- Pigmentos: 1 kg por envase; acrílicos de color: 0,06 kg.
      select i.codigo_interno, 1, 'kg', null
        from gmp.insumos_catalogo i where i.codigo_interno ~ 'PIG$' and i.tipo = 'MATERIA_PRIMA'
      union all
      select i.codigo_interno, 0.06, 'kg', null
        from gmp.insumos_catalogo i where i.codigo_interno ~ '^1(39|40)AC[0-9]+$'
    )
    select i.id, i.codigo_interno, i.unidad_medida, x.contenido, x.unidad, x.compuesto, d.id as densidad_id
      from lectura x
      join gmp.insumos_catalogo i on i.codigo_interno = x.codigo
      left join gmp.densidades_referencia d on d.nombre = x.compuesto and d.activo
  loop
    if r.compuesto is not null and r.densidad_id is null then
      raise exception 'Falta la densidad «%» para %.', r.compuesto, r.codigo_interno;
    end if;

    perform comercial.registrar_conteo(
      r.id,
      round(
        case
          when r.unidad = 'kg' and r.unidad_medida = 'g'  then r.contenido * 1000
          when r.unidad = 'L'  and r.unidad_medida = 'ml' then r.contenido * 1000
          when r.unidad = 'L'  and r.unidad_medida = 'g'  then r.contenido * 1000 * gmp.densidad_a(r.densidad_id, 20)
          else null
        end, 4),
      format('1 envase × %s %s de la planilla (hoja INVENTARIO)%s, a la espera del conteo físico. Indicación del codirector técnico, 2026-09-23.',
             r.contenido, r.unidad,
             case when r.densidad_id is not null
                  then format(', a %s g/ml (%s, 20 °C)', round(gmp.densidad_a(r.densidad_id, 20), 5), r.compuesto)
                  else '' end),
      true
    );
  end loop;
end;
$$;
