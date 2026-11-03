-- ---------------------------------------------------------------------------
-- Propósito : Editar una recepción antes de cargarla a stock: los datos del
--             remito y todo lo constatado en cada lote, agregar un lote que
--             faltó o quitar uno que sobró, sin eliminarla y cargarla de nuevo.
-- Reglas    : D-recepcion-5 (codirector técnico, 2026-11-03), extensión de
--             D-recepcion-3 y D-recepcion-4. RN-50 (cada cambio queda en
--             core.auditoria con el valor anterior), RN-05 (el rótulo no se
--             modifica: se emite uno nuevo), invariantes 1, 3, 6 y 7.
-- Fecha     : 2026-11-03
-- ---------------------------------------------------------------------------
--
-- CUÁNDO.
-- Mientras la recepción no se cargó a stock ni se eliminó, y la edita quien
-- registra recepciones (RECEPCION, GP, DT), como para eliminarla. Después de
-- cargada siguen «Corregir cantidad» y «Corregir datos», con motivo.
--
-- QUÉ NO CAMBIA.
-- El número de la recepción, su fecha y quién la registró; el n° interno de
-- cada lote. Lo que el circuito de calidad ya verificó tampoco: el insumo y
-- las casillas de contenedores limpiados y protocolo solo cambian con el lote
-- todavía RECIBIDO o en CUARENTENA (un envase aprobado al recibir sí admite
-- cantidad, lote del proveedor, vencimiento, etc., pero no otro insumo).
--
-- CÓMO.
-- comercial.editar_recepcion pone el parámetro gmp.editando_recepcion y los
-- triggers de campos editables de gmp lo respetan solo para esa recepción y
-- solo si sigue editable. Va en comercial porque mira comprobantes y avisos de
-- compra (§3.7: gmp no lee comercial). Si algo que sale en el rótulo cambió,
-- se emite un rótulo nuevo con el mismo estado y el anterior queda reemplazado.
--
-- QUITAR UN LOTE.
-- No se borra: una fila en gmp.lotes_quitados y RLS lo saca de toda consulta,
-- como una recepción eliminada (D-recepcion-3). Solo en RECIBIDO o CUARENTENA
-- y si a la recepción le queda otro lote.

-- ===========================================================================
-- 1. ¿Se puede editar?
-- ===========================================================================

create or replace function gmp.recepcion_editable(p_recepcion_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from gmp.recepciones r
     where r.id = p_recepcion_id
       and not r.cargado_a_stock
       and not exists (select 1 from gmp.recepciones_eliminadas e where e.recepcion_id = r.id)
  );
$$;

comment on function gmp.recepcion_editable(uuid) is
  'D-recepcion-5: la recepción se edita mientras no se cargó a stock ni se eliminó.';
revoke execute on function gmp.recepcion_editable(uuid) from public, anon;
grant execute on function gmp.recepcion_editable(uuid) to authenticated;

-- El parámetro que pone comercial.editar_recepcion, validado: la recepción
-- sigue editable y quien escribe registra recepciones.
create or replace function gmp.editando_recepcion(p_recepcion_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('gmp.editando_recepcion', true), '') = p_recepcion_id::text
     and core.es_rol('RECEPCION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
     and gmp.recepcion_editable(p_recepcion_id);
$$;

revoke execute on function gmp.editando_recepcion(uuid) from public, anon;
grant execute on function gmp.editando_recepcion(uuid) to authenticated;

-- ===========================================================================
-- 2. Triggers de campos editables
-- ===========================================================================

-- Copia de 20261026140000 con un cambio (NUEVO): dentro de la edición de su
-- recepción, el lote admite todo lo constatado.
create or replace function gmp.fn_lote_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- D-ajustes-1: lo pone comercial.fn_corregir_lote, solo para este lote.
  v_corrige boolean := coalesce(current_setting('gmp.corrigiendo_lote', true), '') = old.id::text;
  -- D-corregir-datos-lote-1: lo pone comercial.fn_corregir_dato_lote.
  v_corrige_dato boolean := coalesce(current_setting('gmp.corrigiendo_dato_lote', true), '') = old.id::text;
  -- NUEVO (D-recepcion-5): lo pone comercial.editar_recepcion.
  v_edita boolean := gmp.editando_recepcion(old.recepcion_id);
begin
  -- NUEVO (D-recepcion-5).
  if v_edita then
    if (new.recepcion_id, new.numero_registro_interno, new.registrado_por, new.creado_en)
       is distinct from
       (old.recepcion_id, old.numero_registro_interno, old.registrado_por, old.creado_en) then
      raise exception 'El n° interno del lote y su recepción no se cambian.'
        using errcode = 'restrict_violation';
    end if;
    if old.estado not in ('RECIBIDO', 'CUARENTENA')
       and (new.insumo_id, new.contenedores_limpiados, new.protocolo_recibido)
           is distinct from (old.insumo_id, old.contenedores_limpiados, old.protocolo_recibido) then
      raise exception 'El lote % ya pasó por calidad: no cambia de insumo ni de contenedores o protocolo.',
                      old.numero_registro_interno
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- Lo único que se mueve en un lote es su lugar en el circuito: el estado y
  -- el depósito donde está. Todo lo demás es lo que se constató al recibirlo.
  if (new.recepcion_id, new.insumo_id, new.numero_registro_interno,
      case when v_corrige_dato then old.lote_proveedor else new.lote_proveedor end,
      case when v_corrige_dato then old.plazo_validez else new.plazo_validez end,
      case when v_corrige then old.cantidad_bultos else new.cantidad_bultos end,
      case when v_corrige then old.cantidad_unidades else new.cantidad_unidades end,
      new.unidad, new.bultos_peso_similar,
      new.unidades_contadas, new.planchas_etiquetas, new.etiquetas_por_plancha,
      new.peso_pigmento_kg, new.registrado_por, new.creado_en)
     is distinct from
     (old.recepcion_id, old.insumo_id, old.numero_registro_interno,
      old.lote_proveedor, old.plazo_validez, old.cantidad_bultos,
      old.cantidad_unidades, old.unidad, old.bultos_peso_similar,
      old.unidades_contadas, old.planchas_etiquetas, old.etiquetas_por_plancha,
      old.peso_pigmento_kg, old.registrado_por, old.creado_en) then
    raise exception
      'Un lote registrado solo admite el avance de su circuito (estado y depósito). '
      'Lo constatado en la recepción no se edita así: antes de cargar a stock, con «Editar» en Recepciones; '
      'después, con «Corregir cantidad» o «Corregir datos» en la ficha del lote (D-ajustes-1).'
      using errcode = 'restrict_violation';
  end if;

  -- D-recepcion-4: las dos casillas se completan (de no a sí) con el lote
  -- todavía RECIBIDO. Nunca se destildan.
  if (new.contenedores_limpiados, new.protocolo_recibido)
     is distinct from (old.contenedores_limpiados, old.protocolo_recibido) then
    if old.estado <> 'RECIBIDO'
       or (old.contenedores_limpiados and not new.contenedores_limpiados)
       or (coalesce(old.protocolo_recibido, false) and not coalesce(new.protocolo_recibido, false)) then
      raise exception
        'Contenedores limpiados y protocolo recibido solo se completan, de no a sí, mientras el lote está recibido.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  -- `protocolo_archivo_url` queda fuera de la lista a propósito: el protocolo
  -- del fabricante puede llegar escaneado después de la recepción, y adjuntarlo
  -- agrega evidencia, no la altera.
  return new;
end;
$$;

-- Copia de 20261026140000 con un cambio (NUEVO): dentro de la edición, la
-- recepción admite los datos del remito.
create or replace function gmp.fn_recepcion_campos_editables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- D-corregir-datos-lote-1: lo pone comercial.fn_corregir_dato_lote.
  v_corrige boolean := coalesce(current_setting('gmp.corrigiendo_recepcion', true), '') = old.id::text;
  -- NUEVO (D-recepcion-5): lo pone comercial.editar_recepcion.
  v_edita boolean := gmp.editando_recepcion(old.id);
begin
  -- §4.3: la carga administrativa (factura, monto, forma de pago, alta en
  -- stock) es deliberadamente diferida y la hace otro sector, más tarde. Es lo
  -- único que puede cambiar. Las observaciones también, porque son el lugar
  -- donde se deja constancia de lo que apareció después.
  if (case when v_corrige or v_edita then old.proveedor_id else new.proveedor_id end,
      case when v_edita then old.proveedor_nuevo else new.proveedor_nuevo end,
      case when v_corrige or v_edita then old.numero_remito else new.numero_remito end,
      case when v_edita then old.coincide_con_pedido else new.coincide_con_pedido end,
      new.numero, new.fecha_hora, new.registrado_por)
     is distinct from
     (old.proveedor_id, old.proveedor_nuevo, old.numero_remito,
      old.coincide_con_pedido, old.numero, old.fecha_hora, old.registrado_por) then
    raise exception
      'Una recepción registrada no se edita. Solo admite su carga administrativa diferida (§4.3). '
      'Antes de cargar a stock se edita desde Recepciones; después, remito y proveedor se corrigen con «Corregir datos» en la ficha del lote (PG.60.18).'
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

-- Copia de 20261020140100 con un cambio (NUEVO): Recepción también edita la
-- recepción antes de cargarla.
create or replace function gmp.fn_recepcion_solo_carga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if core.es_rol('RECEPCION')
     and not core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
     and not gmp.editando_recepcion(old.id) -- NUEVO (D-recepcion-5)
     and (to_jsonb(new) - 'cargado_a_stock' - 'cargado_por' - 'cargado_en')
         is distinct from (to_jsonb(old) - 'cargado_a_stock' - 'cargado_por' - 'cargado_en') then
    raise exception 'Recepción solo marca la recepción como cargada a stock; el resto lo completa Administración.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 3. Rótulo nuevo si cambió lo que dice
-- ===========================================================================
--
-- No usa gmp.emitir_rotulo_lote_insumo: esa avanza el estado y mueve de
-- depósito. Acá el estado es el mismo; solo se reemplaza el cartel.

create or replace function gmp.reemitir_rotulo_lote_insumo(p_lote_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_viejo     gmp.rotulos%rowtype;
  v_contenido jsonb;
  v_nuevo     uuid;
begin
  select * into v_viejo from gmp.rotulos
   where entidad_tipo = 'lote_insumo' and entidad_id = p_lote_id and vigente;
  if not found then
    return;
  end if;
  -- Los mismos campos que gmp.emitir_rotulo_lote_insumo (R.20.2.1 v01).
  select jsonb_build_object(
           'nombre',         i.nombre,
           'lote_proveedor', l.lote_proveedor,
           'proveedor',      p.razon_social,
           'numero_interno', l.numero_registro_interno,
           'codigo_interno', i.codigo_interno,
           'plazo_validez',  l.plazo_validez,
           'estatus',        v_viejo.estado::text)
    into v_contenido
    from gmp.lotes_insumo l
    join gmp.insumos_catalogo i on i.id = l.insumo_id
    join gmp.recepciones r      on r.id = l.recepcion_id
    join gmp.proveedores p      on p.id = r.proveedor_id
   where l.id = p_lote_id;
  if v_contenido is not distinct from v_viejo.contenido then
    return;
  end if;
  update gmp.rotulos set vigente = false where id = v_viejo.id;
  insert into gmp.rotulos (tipo_registro, version_formato, entidad_tipo, entidad_id, estado, contenido)
  values (v_viejo.tipo_registro, v_viejo.version_formato, 'lote_insumo', p_lote_id, v_viejo.estado, v_contenido)
  returning id into v_nuevo;
  update gmp.rotulos set reemplazado_por = v_nuevo where id = v_viejo.id;
end;
$$;

comment on function gmp.reemitir_rotulo_lote_insumo(uuid) is
  'D-recepcion-5: si cambió lo que dice el rótulo vigente del lote, emite uno nuevo con el mismo estado y da de baja '
  'el anterior (RN-05).';
revoke execute on function gmp.reemitir_rotulo_lote_insumo(uuid) from public, anon;
grant execute on function gmp.reemitir_rotulo_lote_insumo(uuid) to authenticated;

-- ===========================================================================
-- 4. Editar
-- ===========================================================================
--
-- p_cabecera: proveedor_id, proveedor_nuevo, numero_remito,
-- coincide_con_pedido, observaciones (las que vengan).
-- p_lotes: [{id, <campos del lote>}]; lo que no viene queda.

create or replace function comercial.editar_recepcion(
  p_recepcion_id uuid,
  p_cabecera     jsonb,
  p_lotes        jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_rec   gmp.recepciones%rowtype;
  v_nueva gmp.recepciones%rowtype;
  v_l     jsonb;
  v_lote  gmp.lotes_insumo%rowtype;
  v_nuevo gmp.lotes_insumo%rowtype;
  v_ins   gmp.insumos_catalogo%rowtype;
begin
  if not core.es_rol('RECEPCION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'Una recepción la edita quien las registra: Recepción, Gerencia de Producción o Dirección Técnica.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_rec from gmp.recepciones where id = p_recepcion_id for update;
  if not found then
    raise exception 'La recepción no existe o no la podés ver.' using errcode = 'no_data_found';
  end if;
  if not gmp.recepcion_editable(p_recepcion_id) then
    raise exception 'La recepción % ya se cargó a stock: se corrige con «Corregir cantidad» o «Corregir datos» en la ficha del lote.',
                    v_rec.numero
      using errcode = 'restrict_violation';
  end if;

  perform set_config('gmp.editando_recepcion', p_recepcion_id::text, true);

  v_nueva := jsonb_populate_record(v_rec, coalesce(p_cabecera, '{}'::jsonb)
               - 'id' - 'numero' - 'fecha_hora' - 'registrado_por' - 'creado_en'
               - 'cargado_a_stock' - 'cargado_por' - 'cargado_en');
  if v_nueva.proveedor_id is distinct from v_rec.proveedor_id
     and exists (select 1 from comercial.comprobantes_proveedor c
                  where c.recepcion_id = v_rec.id and c.anulado_en is null
                    and c.proveedor_id <> v_nueva.proveedor_id) then
    raise exception 'La recepción tiene un comprobante de proveedor vigente a nombre del otro proveedor: '
                    'anulalo primero y cargalo de nuevo.'
      using errcode = 'check_violation';
  end if;
  update gmp.recepciones
     set proveedor_id        = v_nueva.proveedor_id,
         proveedor_nuevo     = v_nueva.proveedor_nuevo,
         numero_remito       = v_nueva.numero_remito,
         coincide_con_pedido = v_nueva.coincide_con_pedido,
         observaciones       = v_nueva.observaciones
   where id = p_recepcion_id
     and (proveedor_id, proveedor_nuevo, numero_remito, coincide_con_pedido, observaciones)
         is distinct from
         (v_nueva.proveedor_id, v_nueva.proveedor_nuevo, v_nueva.numero_remito,
          v_nueva.coincide_con_pedido, v_nueva.observaciones);

  for v_l in select * from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) loop
    select * into v_lote from gmp.lotes_insumo
     where id = (v_l ->> 'id')::uuid and recepcion_id = p_recepcion_id for update;
    if not found then
      raise exception 'Un lote no es de esta recepción.' using errcode = 'check_violation';
    end if;
    v_nuevo := jsonb_populate_record(v_lote, v_l
                 - 'id' - 'recepcion_id' - 'numero_registro_interno' - 'estado'
                 - 'deposito_actual_id' - 'registrado_por' - 'creado_en' - 'total_etiquetas');

    if v_nuevo.insumo_id is distinct from v_lote.insumo_id then
      if exists (select 1 from comercial.avisos_compra a where a.lote_insumo_id = v_lote.id) then
        raise exception 'El lote % está vinculado a una compra pendiente: desvinculalo antes de cambiar el insumo.',
                        v_lote.numero_registro_interno
          using errcode = 'check_violation';
      end if;
      -- Si estaba en la cuarentena de su insumo, pasa a la del nuevo.
      select * into v_ins from gmp.insumos_catalogo where id = v_lote.insumo_id;
      if v_lote.deposito_actual_id is not distinct from v_ins.deposito_cuarentena_id then
        select * into v_ins from gmp.insumos_catalogo where id = v_nuevo.insumo_id;
        v_nuevo.deposito_actual_id := coalesce(v_ins.deposito_cuarentena_id, v_lote.deposito_actual_id);
      end if;
    end if;

    update gmp.lotes_insumo
       set insumo_id              = v_nuevo.insumo_id,
           lote_proveedor         = v_nuevo.lote_proveedor,
           plazo_validez          = v_nuevo.plazo_validez,
           cantidad_bultos        = v_nuevo.cantidad_bultos,
           cantidad_unidades      = v_nuevo.cantidad_unidades,
           unidad                 = v_nuevo.unidad,
           bultos_peso_similar    = v_nuevo.bultos_peso_similar,
           unidades_contadas      = v_nuevo.unidades_contadas,
           planchas_etiquetas     = v_nuevo.planchas_etiquetas,
           etiquetas_por_plancha  = v_nuevo.etiquetas_por_plancha,
           protocolo_recibido     = v_nuevo.protocolo_recibido,
           peso_pigmento_kg       = v_nuevo.peso_pigmento_kg,
           contenedores_limpiados = v_nuevo.contenedores_limpiados,
           deposito_actual_id     = v_nuevo.deposito_actual_id
     where id = v_lote.id
       and (insumo_id, lote_proveedor, plazo_validez, cantidad_bultos, cantidad_unidades, unidad,
            bultos_peso_similar, unidades_contadas, planchas_etiquetas, etiquetas_por_plancha,
            protocolo_recibido, peso_pigmento_kg, contenedores_limpiados, deposito_actual_id)
           is distinct from
           (v_nuevo.insumo_id, v_nuevo.lote_proveedor, v_nuevo.plazo_validez, v_nuevo.cantidad_bultos,
            v_nuevo.cantidad_unidades, v_nuevo.unidad, v_nuevo.bultos_peso_similar, v_nuevo.unidades_contadas,
            v_nuevo.planchas_etiquetas, v_nuevo.etiquetas_por_plancha, v_nuevo.protocolo_recibido,
            v_nuevo.peso_pigmento_kg, v_nuevo.contenedores_limpiados, v_nuevo.deposito_actual_id);
  end loop;

  -- Rótulos: el proveedor es de la recepción, así que se miran todos sus lotes.
  perform gmp.reemitir_rotulo_lote_insumo(l.id)
     from gmp.lotes_insumo l where l.recepcion_id = p_recepcion_id;

  perform set_config('gmp.editando_recepcion', '', true);
end;
$$;

comment on function comercial.editar_recepcion(uuid, jsonb, jsonb) is
  'D-recepcion-5: edita una recepción no cargada a stock (remito y lo constatado en sus lotes). Queda en '
  'core.auditoria con el valor anterior; si cambia lo que dice un rótulo, se emite uno nuevo.';
revoke execute on function comercial.editar_recepcion(uuid, jsonb, jsonb) from public, anon;
grant execute on function comercial.editar_recepcion(uuid, jsonb, jsonb) to authenticated;

-- ===========================================================================
-- 5. Agregar un lote a una recepción ya registrada
-- ===========================================================================
--
-- El alta ya lo permitía (lotes_insumo_insert_recepcion_fisica). Ahora solo
-- mientras la recepción sea editable: un lote nuevo en una recepción cargada
-- no entraría a stock.

create or replace function gmp.fn_lote_en_recepcion_editable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado <> 'SALDO_APERTURA'
     and exists (select 1 from gmp.recepciones r where r.id = new.recepcion_id and r.cargado_a_stock) then
    raise exception 'La recepción ya se cargó a stock: no se le agregan lotes. Registrá una recepción nueva.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lote_en_recepcion_editable
  before insert on gmp.lotes_insumo
  for each row execute function gmp.fn_lote_en_recepcion_editable();

-- ===========================================================================
-- 6. Quitar un lote
-- ===========================================================================

create table gmp.lotes_quitados (
  lote_insumo_id uuid primary key references gmp.lotes_insumo(id),
  quitado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  quitado_en     timestamptz not null default now()
);

comment on table gmp.lotes_quitados is
  'Lotes quitados de una recepción antes de cargarla a stock (D-recepcion-5). Append-only: lo quitado no vuelve. '
  'El lote queda intacto; RLS lo oculta salvo al administrador del sistema.';

create index lotes_quitados_quitado_por_idx on gmp.lotes_quitados (quitado_por);

alter table gmp.lotes_quitados enable row level security;
alter table gmp.lotes_quitados force  row level security;
select core.adjuntar_auditoria('gmp.lotes_quitados');

grant select, insert on gmp.lotes_quitados to authenticated;

create policy lotes_quitados_select_authenticated on gmp.lotes_quitados
  for select to authenticated using (core.rol() is not null);
comment on policy lotes_quitados_select_authenticated on gmp.lotes_quitados is
  '§3.3: consulta para todos los roles (D-recepcion-5).';

create policy lotes_quitados_insert_recepcion on gmp.lotes_quitados
  for insert to authenticated
  with check (core.es_rol('RECEPCION', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA')
              and quitado_por = core.usuario_actual());
comment on policy lotes_quitados_insert_recepcion on gmp.lotes_quitados is
  'D-recepcion-5: quita quien registra recepciones (RECEPCION, GP, DT), a su nombre.';

create or replace function gmp.fn_lote_quitable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote gmp.lotes_insumo%rowtype;
begin
  select * into v_lote from gmp.lotes_insumo where id = new.lote_insumo_id for update;
  if not found then
    raise exception 'El lote no existe o no lo podés ver.' using errcode = 'no_data_found';
  end if;
  perform 1 from gmp.recepciones where id = v_lote.recepcion_id for update;
  if not gmp.recepcion_editable(v_lote.recepcion_id) then
    raise exception 'La recepción ya se cargó a stock: el lote % no se quita.', v_lote.numero_registro_interno
      using errcode = 'restrict_violation';
  end if;
  if v_lote.estado not in ('RECIBIDO', 'CUARENTENA') then
    raise exception 'El lote % ya pasó por calidad: no se quita.', v_lote.numero_registro_interno
      using errcode = 'restrict_violation';
  end if;
  if not exists (select 1 from gmp.lotes_insumo l
                  where l.recepcion_id = v_lote.recepcion_id and l.id <> v_lote.id
                    and not exists (select 1 from gmp.lotes_quitados q where q.lote_insumo_id = l.id)) then
    raise exception 'Es el único lote de la recepción: eliminá la recepción entera.'
      using errcode = 'check_violation';
  end if;
  new.quitado_por := core.usuario_actual();
  new.quitado_en  := now();
  return new;
end;
$$;

create trigger trg_lote_quitable
  before insert on gmp.lotes_quitados
  for each row execute function gmp.fn_lote_quitable();

-- Fuera de toda consulta, como las recepciones eliminadas (20261022160200).
alter policy lotes_insumo_select_authenticated on gmp.lotes_insumo
  using (core.rol() is not null
         and (core.es_rol('ADMINISTRADOR_SISTEMA')
              or (not exists (select 1 from gmp.recepciones_eliminadas e
                               where e.recepcion_id = lotes_insumo.recepcion_id)
                  and not exists (select 1 from gmp.lotes_quitados q
                                   where q.lote_insumo_id = lotes_insumo.id))));
comment on policy lotes_insumo_select_authenticated on gmp.lotes_insumo is
  '§3.3: consulta para todos los roles; los de recepciones eliminadas (D-recepcion-3) y los quitados '
  '(D-recepcion-5) solo el administrador del sistema.';
