-- ---------------------------------------------------------------------------
-- Propósito : Repaso del trabajo de la fase 1. Tres cosas.
--             1. Corrige el conteo de la serie diaria del tablero, que
--                multiplicaba las recepciones por sus lotes.
--             2. Cierra dos huecos de escritura: la recepción y el lote se
--                podían editar enteros después de registrados. Ahora la
--                recepción solo admite su carga administrativa diferida, y el
--                lote solo el avance del circuito.
--             3. Agrega `core.verificar_invariantes()`, que responde con datos
--                si las invariantes estructurales de CLAUDE.md §3 se cumplen
--                de verdad. Es el sujeto de las pruebas pgTAP pendientes y,
--                mientras no existan, se puede consultar desde la aplicación.
-- Reglas    : Invariantes 1, 2, 3, 6, 7, 8 y 9 de CLAUDE.md §3. §4.3, §5.1.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Serie diaria del tablero
-- ===========================================================================
--
-- El LEFT JOIN contra lotes multiplica la fila de la recepción por cada lote
-- que trajo, así que `count(r.id)` contaba una recepción de tres lotes como
-- tres recepciones. El gráfico exageraba la actividad justo los días de más
-- trabajo, que son los que uno mira.

create or replace view gmp.v_recepciones_por_dia with (security_invoker = true) as
  select
    d::date                    as dia,
    count(distinct r.id)       as recepciones,
    count(l.id)                as lotes
  from generate_series(current_date - 29, current_date, interval '1 day') as d
  left join gmp.recepciones r
         on r.fecha_hora >= d and r.fecha_hora < d + interval '1 day'
  left join gmp.lotes_insumo l on l.recepcion_id = r.id
  group by d
  order by d;

comment on view gmp.v_recepciones_por_dia is
  'Recepciones y lotes por día de los últimos 30 días, con los días vacíos incluidos.';

-- ===========================================================================
-- 2. Qué se puede modificar después de registrado
-- ===========================================================================
--
-- Las políticas RLS decidían quién podía hacer UPDATE, pero no sobre qué. Con
-- eso, Administración podía cambiarle el proveedor a una recepción ya
-- registrada, y un operario podía corregir la cantidad de bultos de un lote
-- días después. Ninguna de las dos cosas es aceptable en un registro BPF: el
-- dato que se corrige a mano deja de probar lo que decía probar.
--
-- La corrección de un dato mal cargado no es editar. Es el camino de PG.60.18:
-- no conformidad abierta y registro rectificativo que apunta al original.

create or replace function gmp.fn_recepcion_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- §4.3: la carga administrativa (factura, monto, forma de pago, alta en
  -- stock) es deliberadamente diferida y la hace otro sector, más tarde. Es lo
  -- único que puede cambiar. Las observaciones también, porque son el lugar
  -- donde se deja constancia de lo que apareció después.
  if (new.proveedor_id, new.proveedor_nuevo, new.numero_remito,
      new.coincide_con_pedido, new.numero, new.fecha_hora, new.registrado_por)
     is distinct from
     (old.proveedor_id, old.proveedor_nuevo, old.numero_remito,
      old.coincide_con_pedido, old.numero, old.fecha_hora, old.registrado_por) then
    raise exception
      'Una recepción registrada no se edita. Solo admite su carga administrativa diferida (§4.3). '
      'Para corregir un dato del remito corresponde abrir no conformidad según PG.60.18 y dejar el registro rectificativo.'
      using errcode = 'restrict_violation';
  end if;

  -- Quién cargó a stock y cuándo lo pone el sistema, no quien completa el form.
  if new.cargado_a_stock and not old.cargado_a_stock then
    new.cargado_por := core.usuario_actual();
    new.cargado_en  := now();
  end if;

  return new;
end;
$$;

create trigger trg_recepcion_campos_editables
  before update on gmp.recepciones
  for each row execute function gmp.fn_recepcion_campos_editables();

create or replace function gmp.fn_lote_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      new.lote_proveedor, new.plazo_validez, new.cantidad_bultos,
      new.cantidad_unidades, new.unidad, new.bultos_peso_similar,
      new.unidades_contadas, new.planchas_etiquetas, new.etiquetas_por_plancha,
      new.protocolo_recibido, new.peso_pigmento_kg, new.contenedores_limpiados,
      new.registrado_por, new.creado_en)
     is distinct from
     (old.recepcion_id, old.insumo_id, old.numero_registro_interno,
      old.lote_proveedor, old.plazo_validez, old.cantidad_bultos,
      old.cantidad_unidades, old.unidad, old.bultos_peso_similar,
      old.unidades_contadas, old.planchas_etiquetas, old.etiquetas_por_plancha,
      old.protocolo_recibido, old.peso_pigmento_kg, old.contenedores_limpiados,
      old.registrado_por, old.creado_en) then
    raise exception
      'Un lote registrado solo admite el avance de su circuito (estado y depósito). '
      'Lo constatado en la recepción no se edita: corresponde no conformidad según PG.60.18 y registro rectificativo.'
      using errcode = 'restrict_violation';
  end if;

  -- `protocolo_archivo_url` queda fuera de la lista a propósito: el protocolo
  -- del fabricante puede llegar escaneado después de la recepción, y adjuntarlo
  -- agrega evidencia, no la altera.
  return new;
end;
$$;

create trigger trg_lote_campos_editables
  before update on gmp.lotes_insumo
  for each row execute function gmp.fn_lote_campos_editables();

-- ===========================================================================
-- 3. Escritura privilegiada, definida en un solo lugar
-- ===========================================================================
--
-- Antes la vista enumeraba nombres de roles con privilegio. Enumerar es
-- frágil: un rol nuevo no aparece en la lista y por lo tanto no se detecta. La
-- pregunta correcta es la inversa —¿esto lo escribió una sesión de usuario?— y
-- se contesta con dos nombres, no con una lista abierta.

create or replace function core.es_escritura_privilegiada(p_db_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_db_role is distinct from 'authenticated'
     and p_db_role is distinct from 'supabase_auth_admin';
$$;

comment on function core.es_escritura_privilegiada(text) is
  'Verdadero si la escritura no vino de una sesión de usuario. `authenticated` es la aplicación; '
  '`supabase_auth_admin` es el servicio de autenticación creando la ficha del usuario que se acaba de registrar, '
  'que es esperable y acotado. Cualquier otro rol es una anomalía a justificar (CLAUDE.md §5).';

grant execute on function core.es_escritura_privilegiada(text) to authenticated;

create or replace view core.escrituras_privilegiadas
with (security_invoker = true) as
  select id, esquema, tabla, registro_id, operacion, usuario_id,
         db_role, db_session, ocurrido_en
    from core.auditoria
   where core.es_escritura_privilegiada(db_role)
   order by ocurrido_en desc;

comment on view core.escrituras_privilegiadas is
  'Escrituras que no vinieron de una sesión de usuario. Cada fila es una anomalía a justificar (CLAUDE.md §5).';

-- ===========================================================================
-- 4. Verificación de las invariantes estructurales
-- ===========================================================================
--
-- CLAUDE.md §3 declara nueve invariantes y afirma que hay pruebas que las
-- verifican. Dos de ellas —la 6 y la 7— se declaraban verificadas sin que la
-- prueba existiera. Esta función es el sujeto de esas pruebas: la suite pgTAP
-- va a exigir que ninguna fila devuelva `cumple = false`, y mientras la suite
-- no exista se puede consultar desde la aplicación y ver el resultado.
--
-- Es de diagnóstico, no de negocio: no decide nada, solo mira el catálogo.

create or replace function core.verificar_invariantes()
returns table (
  invariante text,
  exigencia  text,
  cumple     boolean,
  detalle    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_detalle text;
begin
  -- Diagnóstico del sistema: lo consulta quien responde por él.
  if not core.es_rol('DIRECCION_TECNICA', 'GERENCIA', 'ADMINISTRADOR_SISTEMA') then
    raise exception 'La verificación de invariantes la consulta Dirección Técnica, Gerencia o el Administrador del Sistema.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ---- Invariante 6: toda tabla de negocio con trigger de auditoría --------
  select string_agg(esquema || '.' || tabla, ', ' order by esquema, tabla)
    into v_detalle
    from core.tablas_sin_auditoria();

  return query select
    'Invariante 6'::text,
    'Toda tabla de negocio lleva el trigger genérico de auditoría'::text,
    v_detalle is null,
    coalesce('Sin trigger: ' || v_detalle, 'Todas las tablas de negocio están auditadas.');

  -- ---- Invariante 3: ENABLE y FORCE ROW LEVEL SECURITY ---------------------
  select string_agg(n.nspname || '.' || c.relname, ', ' order by n.nspname, c.relname)
    into v_detalle
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
     and n.nspname in ('core', 'gmp', 'comercial')
     and not (c.relrowsecurity and c.relforcerowsecurity);

  return query select
    'Invariante 3'::text,
    'Toda tabla de negocio tiene ENABLE y FORCE ROW LEVEL SECURITY'::text,
    v_detalle is null,
    coalesce('Sin ENABLE o sin FORCE: ' || v_detalle, 'Todas las tablas fuerzan RLS, incluido su dueño.');

  -- ---- Invariante 2: core.auditoria append-only ----------------------------
  select string_agg(p.polname, ', ' order by p.polname)
    into v_detalle
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'core' and c.relname = 'auditoria'
     -- 'w' = UPDATE, 'd' = DELETE, '*' = ALL
     and p.polcmd in ('w', 'd', '*');

  return query select
    'Invariante 2'::text,
    'core.auditoria no tiene políticas de UPDATE ni de DELETE'::text,
    v_detalle is null,
    coalesce('Políticas que no deberían existir: ' || v_detalle, 'La auditoría es append-only.');

  -- ---- Invariantes 1, 8 y 9: nada se borra ---------------------------------
  select string_agg(distinct g.table_schema || '.' || g.table_name || ' → ' || g.grantee, ', ')
    into v_detalle
    from information_schema.role_table_grants g
   where g.table_schema in ('core', 'gmp', 'comercial')
     and g.privilege_type = 'DELETE'
     and g.grantee in ('authenticated', 'anon');

  return query select
    'Invariantes 1, 8 y 9'::text,
    'Ningún rol de la aplicación tiene privilegio de DELETE'::text,
    v_detalle is null,
    coalesce('Con DELETE otorgado: ' || v_detalle, 'Ninguna tabla admite borrado desde la aplicación.');

  -- ---- Invariante 7: dirección de dependencia entre esquemas ---------------
  -- Permitido: comercial → gmp, comercial → core, gmp → core.
  -- Prohibido: cualquier flecha en sentido contrario.
  select string_agg(
           no.nspname || '.' || co.relname || ' → ' || nd.nspname || '.' || cd.relname,
           ', ')
    into v_detalle
    from pg_constraint k
    join pg_class co     on co.oid = k.conrelid
    join pg_namespace no on no.oid = co.relnamespace
    join pg_class cd     on cd.oid = k.confrelid
    join pg_namespace nd on nd.oid = cd.relnamespace
   where k.contype = 'f'
     and no.nspname in ('core', 'gmp', 'comercial')
     and nd.nspname in ('core', 'gmp', 'comercial')
     and (
       (no.nspname = 'core' and nd.nspname in ('gmp', 'comercial'))
       or (no.nspname = 'gmp' and nd.nspname = 'comercial')
     );

  return query select
    'Invariante 7'::text,
    'Dirección de dependencia: comercial → gmp → core, nunca al revés'::text,
    v_detalle is null,
    coalesce('Claves foráneas en sentido prohibido: ' || v_detalle,
             'Ninguna clave foránea invierte la dirección de dependencia.');

  -- ---- §5: quién puede saltear RLS ----------------------------------------
  -- No es una invariante que se pueda exigir: `service_role` tiene BYPASSRLS y
  -- no se puede sacar del proyecto. Se informa para que el número sea conocido
  -- y no una sorpresa durante una auditoría.
  select string_agg(rolname, ', ' order by rolname)
    into v_detalle
    from pg_roles
   where rolbypassrls or rolsuper;

  return query select
    'CLAUDE.md §5'::text,
    'Roles que saltean RLS (informativo, no exigible)'::text,
    true,
    coalesce(v_detalle, 'Ninguno.');
end;
$$;

comment on function core.verificar_invariantes() is
  'Estado de las invariantes estructurales de CLAUDE.md §3, leído del catálogo. '
  'Sujeto de las pruebas pgTAP pendientes: ninguna fila debe devolver cumple = false.';

grant execute on function core.verificar_invariantes() to authenticated;
