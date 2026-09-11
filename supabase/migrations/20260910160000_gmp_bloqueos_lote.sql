-- ---------------------------------------------------------------------------
-- Propósito : Materializar el bloqueo de un lote y dar la única autoridad del
--             sistema sobre la pregunta «¿este lote puede salir del depósito?».
-- Reglas    : RN-51 (solo se despacha stock de lotes liberados),
--             RN-52 (un lote alcanzado por un retiro queda bloqueado de
--             inmediato), RN-50 (auditoría). CLAUDE.md §4.
-- Fecha     : 2026-09-10
-- ---------------------------------------------------------------------------
--
-- POR QUÉ ESTO VIVE EN `gmp` Y NO EN `comercial`.
-- RN-51 y RN-52 parecen comerciales —hablan de vender y despachar— pero son
-- reguladas: constituyen la efectividad del retiro de mercado que exige la
-- Disposición ANMAT 1402/08. CLAUDE.md §4 lo resuelve así y esta migración lo
-- implementa: `gmp` decide, `comercial` consulta y no replica.
--
-- EL BLOQUEO ES UNA FILA, NO UN CÁLCULO.
-- Se podría derivar «está bloqueado» de una consulta sobre retiros y no
-- conformidades. No sirve. El inspector no pregunta si el lote está bloqueado
-- hoy: pregunta cuándo se bloqueó, quién lo hizo y con qué fundamento. Eso
-- solo lo contesta un registro con autor y momento.
--
-- SE ESCRIBE ANTES QUE EL MÓDULO DE RETIRO DE MERCADO (fase 8), A PROPÓSITO.
-- El consumidor de esta función —los movimientos de salida de stock— se crea
-- en la migración siguiente. Si la autoridad no existiera todavía, `comercial`
-- tendría que evaluar por su cuenta si un lote está liberado, y esa lógica
-- duplicada es exactamente lo que CLAUDE.md §4 prohíbe. Lo que falta de fase 8
-- es el disparador automático del bloqueo, no el bloqueo.

-- ===========================================================================
-- 1. Motivos de bloqueo
-- ===========================================================================
--
-- No está en el Anexo A del alcance: el documento nombra el bloqueo pero no
-- enumera sus causas. Estos cinco son los que los POE ya mencionan como
-- motivo para detener material. Ampliarlo es `ALTER TYPE ... ADD VALUE`.

create type gmp.motivo_bloqueo_enum as enum (
  'RETIRO_MERCADO',     -- PG.60.4, RN-52
  'NO_CONFORMIDAD',     -- PG.60.18
  'INVESTIGACION',      -- material en estudio, sin no conformidad abierta todavía
  'VENCIMIENTO',        -- plazo de validez cumplido
  'DECISION_DIRECCION_TECNICA'
);

-- ===========================================================================
-- 2. gmp.bloqueos_lote
-- ===========================================================================

create table gmp.bloqueos_lote (
  id               uuid primary key default gen_random_uuid(),
  lote_insumo_id   uuid not null references gmp.lotes_insumo(id),
  motivo           gmp.motivo_bloqueo_enum not null,
  detalle          text not null check (length(btrim(detalle)) > 0),

  -- Origen del bloqueo. 'MANUAL' es una decisión de una persona; los otros dos
  -- los va a poner el trigger del módulo correspondiente cuando exista, y
  -- `origen_id` apunta al retiro o a la no conformidad que lo causó.
  origen           text not null default 'MANUAL'
                     check (origen in ('MANUAL','RETIRO_MERCADO','NO_CONFORMIDAD')),
  origen_id        uuid,

  bloqueado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  bloqueado_en     timestamptz not null default now(),

  -- El levantamiento no borra el bloqueo: lo cierra. La fila queda, con las
  -- dos fechas, porque el período en que el material estuvo detenido es parte
  -- de su historia y se pregunta en una auditoría.
  levantado        boolean not null default false,
  levantado_motivo text,
  levantado_por    uuid references core.usuarios(id),
  levantado_en     timestamptz,

  constraint bloqueos_lote_levantamiento_consistente check (
    (not levantado and levantado_motivo is null
       and levantado_por is null and levantado_en is null)
    or (levantado and length(btrim(coalesce(levantado_motivo,''))) > 0
       and levantado_por is not null and levantado_en is not null)
  ),
  constraint bloqueos_lote_levantamiento_posterior check (
    levantado_en is null or levantado_en >= bloqueado_en
  )
);

comment on table gmp.bloqueos_lote is
  'Bloqueo de un lote para despacho (RN-51, RN-52, Disp. ANMAT 1402/08). El bloqueo es una fila con autor y momento, '
  'no un cálculo: la pregunta que se audita es cuándo se bloqueó y quién lo hizo.';
comment on column gmp.bloqueos_lote.origen_id is
  'Retiro de mercado o no conformidad que causó el bloqueo. Sin clave foránea: esas tablas son de fase 8.';
comment on column gmp.bloqueos_lote.levantado is
  'Un bloqueo levantado no se borra. La ventana en que el material estuvo detenido es parte del legajo del lote.';

create index bloqueos_lote_lote_idx on gmp.bloqueos_lote (lote_insumo_id);
create index bloqueos_lote_vigentes_idx
  on gmp.bloqueos_lote (lote_insumo_id) where not levantado;

-- Un mismo lote puede estar bloqueado por más de un motivo a la vez (un retiro
-- y además una no conformidad), pero no dos veces por el mismo motivo: el
-- segundo bloqueo no agrega información y enturbia el levantamiento.
create unique index bloqueos_lote_un_vigente_por_motivo
  on gmp.bloqueos_lote (lote_insumo_id, motivo) where not levantado;

comment on index gmp.bloqueos_lote_un_vigente_por_motivo is
  'Varios motivos simultáneos sí; el mismo motivo dos veces no.';

-- ---------------------------------------------------------------------------
-- Inmutabilidad: un bloqueo registrado solo se levanta, y una sola vez
-- ---------------------------------------------------------------------------

create or replace function gmp.fn_bloqueo_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.lote_insumo_id, new.motivo, new.detalle, new.origen, new.origen_id,
      new.bloqueado_por, new.bloqueado_en)
     is distinct from
     (old.lote_insumo_id, old.motivo, old.detalle, old.origen, old.origen_id,
      old.bloqueado_por, old.bloqueado_en) then
    raise exception
      'Un bloqueo registrado no se edita: lo único que admite es su levantamiento. '
      'Si el fundamento estaba mal, se levanta con ese motivo y se registra el bloqueo correcto.'
      using errcode = 'restrict_violation';
  end if;

  if old.levantado and not new.levantado then
    raise exception
      'Un bloqueo levantado no se vuelve a activar. Corresponde registrar un bloqueo nuevo (RN-52).'
      using errcode = 'restrict_violation';
  end if;

  -- El levantamiento de un bloqueo es una decisión de calidad: devuelve al
  -- circuito comercial material que se había detenido por una causa regulada.
  -- §3.3 reserva a Dirección Técnica el cierre de no conformidad y el retiro
  -- de mercado; el levantamiento es del mismo orden.
  if new.levantado and not old.levantado then
    if not core.es_rol('DIRECCION_TECNICA') then
      raise exception
        'Solo Dirección Técnica levanta el bloqueo de un lote (§3.3, por analogía con el cierre de no conformidad).'
        using errcode = 'insufficient_privilege';
    end if;
    new.levantado_por := core.usuario_actual();
    new.levantado_en  := now();
  end if;

  return new;
end;
$$;

create trigger trg_bloqueo_campos_editables
  before update on gmp.bloqueos_lote
  for each row execute function gmp.fn_bloqueo_campos_editables();

-- ===========================================================================
-- 3. La autoridad: ¿puede salir este lote?
-- ===========================================================================
--
-- Dos funciones con una sola lógica. `impedimento_despacho` devuelve el motivo
-- en texto —lo necesita el mensaje de error y lo necesita la pantalla— y
-- `lote_despachable` es esa misma función leída como booleano. Tener dos
-- implementaciones de la misma pregunta es la forma más común de que se
-- desincronicen.
--
-- SECURITY DEFINER porque `comercial` la invoca desde un trigger y no puede
-- depender de que el usuario tenga visibilidad sobre los bloqueos.

create or replace function gmp.impedimento_despacho(p_lote_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lote    gmp.lotes_insumo%rowtype;
  v_motivos text;
begin
  select * into v_lote from gmp.lotes_insumo where id = p_lote_id;

  if not found then
    return 'El lote no existe.';
  end if;

  -- RN-51: liberado quiere decir APROBADO. Ningún otro estado despacha, y el
  -- rechazado menos que ninguno.
  if v_lote.estado <> 'APROBADO' then
    return format(
      'RN-51: el lote %s está en estado %s. Solo se despacha material aprobado.',
      v_lote.numero_registro_interno, v_lote.estado
    );
  end if;

  -- Un lote vencido está liberado y sin embargo no se puede despachar. No es
  -- un bloqueo registrado: es una condición del propio lote que se cumple sola
  -- con el paso del tiempo, así que se evalúa acá y no en `bloqueos_lote`.
  if v_lote.plazo_validez is not null and v_lote.plazo_validez < current_date then
    return format(
      'El lote %s venció el %s.',
      v_lote.numero_registro_interno, to_char(v_lote.plazo_validez, 'DD/MM/YYYY')
    );
  end if;

  -- RN-52: el bloqueo por retiro de mercado pesa sobre un lote aprobado y
  -- vigente. Es el caso que la regla existe para cubrir.
  select string_agg(motivo::text || ' (' || detalle || ')', '; ' order by bloqueado_en)
    into v_motivos
    from gmp.bloqueos_lote
   where lote_insumo_id = p_lote_id
     and not levantado;

  if v_motivos is not null then
    return format('RN-52: el lote %s está bloqueado — %s',
                  v_lote.numero_registro_interno, v_motivos);
  end if;

  return null;
end;
$$;

comment on function gmp.impedimento_despacho(uuid) is
  'Motivo por el que un lote no puede despacharse, o NULL si puede (RN-51, RN-52). '
  'Única autoridad del sistema sobre la pregunta: `comercial` la invoca, no la replica (CLAUDE.md §4).';

create or replace function gmp.lote_despachable(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select gmp.impedimento_despacho(p_lote_id) is null;
$$;

comment on function gmp.lote_despachable(uuid) is
  'RN-51 y RN-52 leídas como booleano. Envoltorio de gmp.impedimento_despacho() para no tener dos implementaciones '
  'de la misma pregunta que puedan desincronizarse.';

grant execute on function gmp.impedimento_despacho(uuid) to authenticated;
grant execute on function gmp.lote_despachable(uuid)     to authenticated;

-- ===========================================================================
-- 4. Vista de lectura
-- ===========================================================================
--
-- El nombre del autor se resuelve en SQL y no con un `embed` de PostgREST
-- desde el cliente: el bloqueo vive en `gmp` y la nómina en `core`, y el
-- embebido entre esquemas depende de cómo esté expuesto el proyecto. Un JOIN
-- acá no depende de nada de eso, y además es lo mismo que ya hace
-- comercial.v_kardex con quien registró el movimiento.

create view gmp.v_bloqueos_lote with (security_invoker = true) as
  select
    b.id,
    b.lote_insumo_id,
    l.numero_registro_interno,
    b.motivo,
    b.detalle,
    b.origen,
    b.origen_id,
    b.bloqueado_por,
    ub.nombre_completo as bloqueado_por_nombre,
    b.bloqueado_en,
    b.levantado,
    b.levantado_motivo,
    b.levantado_por,
    ul.nombre_completo as levantado_por_nombre,
    b.levantado_en
  from gmp.bloqueos_lote b
  join gmp.lotes_insumo l on l.id = b.lote_insumo_id
  join core.usuarios   ub on ub.id = b.bloqueado_por
  left join core.usuarios ul on ul.id = b.levantado_por;

comment on view gmp.v_bloqueos_lote is
  'Bloqueos con el nombre de quien bloqueó y de quien levantó. Un bloqueo sin autor legible no contesta la pregunta del inspector.';

-- ===========================================================================
-- 5. RLS (invariante 3)
-- ===========================================================================

alter table gmp.bloqueos_lote enable row level security;
alter table gmp.bloqueos_lote force  row level security;

grant select, insert, update on gmp.bloqueos_lote to authenticated;
grant select on gmp.v_bloqueos_lote to authenticated;

create policy bloqueos_lote_select_authenticated on gmp.bloqueos_lote
  for select to authenticated using (core.rol() is not null);
comment on policy bloqueos_lote_select_authenticated on gmp.bloqueos_lote is
  '§3.3: consulta de registros y trazabilidad, habilitada para todos los roles. '
  'Que un lote esté detenido es información operativa: quien va a buscarlo al depósito tiene que poder verlo.';

-- Detener material es una decisión de calidad. §3.3 reserva a DT el inicio del
-- retiro de mercado y el cierre de no conformidad, y da a CC el veredicto de
-- calidad; ambos pueden detener. Gerencia puede abrir no conformidad, y un
-- bloqueo preventivo es de ese orden.
create policy bloqueos_lote_insert_calidad on gmp.bloqueos_lote
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA','CONTROL_CALIDAD','GERENCIA'));
comment on policy bloqueos_lote_insert_calidad on gmp.bloqueos_lote is
  'Detener un lote: DT, CC y Gerencia. Detener de más cuesta una demora; detener de menos cuesta un retiro fallido.';

-- La política habilita a los tres roles que pueden detener un lote, y el
-- trigger reserva el levantamiento a Dirección Técnica. Parece redundante y no
-- lo es: si la política dijera solo DIRECCION_TECNICA, el intento de
-- Control de Calidad no encontraría la fila y el UPDATE afectaría cero filas
-- —sin error—, de modo que la pantalla informaría un levantamiento que nunca
-- ocurrió. Dejando pasar la fila hasta el trigger, quien no corresponde recibe
-- el motivo escrito en vez de un silencio.
create policy bloqueos_lote_update_calidad on gmp.bloqueos_lote
  for update to authenticated
  using (core.es_rol('DIRECCION_TECNICA','CONTROL_CALIDAD','GERENCIA'))
  with check (core.es_rol('DIRECCION_TECNICA','CONTROL_CALIDAD','GERENCIA'));
comment on policy bloqueos_lote_update_calidad on gmp.bloqueos_lote is
  'Lo único actualizable es el levantamiento. La política deja pasar a los tres roles que bloquean y el trigger '
  'lo reserva a DT, para que el rechazo sea un mensaje y no un UPDATE de cero filas.';

-- Sin política de DELETE. Un bloqueo no se borra: se levanta.

select core.adjuntar_auditoria('gmp.bloqueos_lote');
