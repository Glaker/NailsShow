-- ---------------------------------------------------------------------------
-- Propósito : Una cotización con varios productos. Cada producto sigue siendo
--             una fila de comercial.cotizaciones con su composición, su costo y
--             su precio; los productos agregados apuntan a la principal por
--             cotizacion_principal_id. Se emiten juntos, con el número de la
--             principal, y el PDF los lista a todos. Destino, cliente, IVA y
--             vigencia son los de la principal. Además, imágenes para el PDF
--             (comercial.cotizacion_imagenes).
-- Reglas    : D-52 (cotizador), RN-50, RN-55 (un solo número por cotización,
--             con el contador). Pedido del codirector técnico, 2026-11-27.
-- Fecha     : 2026-11-27
-- ---------------------------------------------------------------------------

alter table comercial.cotizaciones
  add column cotizacion_principal_id uuid references comercial.cotizaciones(id),
  add constraint cotizaciones_principal_distinta check (cotizacion_principal_id <> id);

create index cotizaciones_principal_idx on comercial.cotizaciones (cotizacion_principal_id)
  where cotizacion_principal_id is not null;

-- Los productos agregados llevan el número de la principal: el número es único
-- sólo entre principales.
drop index comercial.cotizaciones_numero_idx;
create unique index cotizaciones_numero_idx on comercial.cotizaciones (anio, numero)
  where numero is not null and cotizacion_principal_id is null;

comment on column comercial.cotizaciones.cotizacion_principal_id is
  'Producto agregado a otra cotización (la principal). Se emite y se anula con ella, con su número. Lo pone sólo '
  'comercial.agregar_producto_cotizacion / quitar_producto_cotizacion: no tiene grant de escritura.';

-- ---------------------------------------------------------------------------
-- 0. Imágenes de la cotización, para el PDF del cliente. Se guardan en la base
--    (data URL, comprimida en el navegador) y no en Storage: así pasan por RLS
--    y por la auditoría como el resto. Se cargan y se quitan sólo en borrador;
--    emitida, quedan como se emitieron. Quitar es marcar anulada (no hay DELETE).
-- ---------------------------------------------------------------------------

create table comercial.cotizacion_imagenes (
  id            uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references comercial.cotizaciones(id),
  orden         integer not null default 0,
  nombre        text,
  datos         text not null check (datos ~ '^data:image/(jpeg|png|webp);base64,' and length(datos) <= 1500000),
  anulada       boolean not null default false,
  creado_por    uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en     timestamptz not null default now()
);

select core.adjuntar_auditoria('comercial.cotizacion_imagenes');
create index cotizacion_imagenes_cotizacion_idx on comercial.cotizacion_imagenes (cotizacion_id);

comment on table comercial.cotizacion_imagenes is
  'Imágenes que van en el PDF de la cotización. Sólo en borrador; emitida no cambian. Quitar = anulada.';

create function comercial.fn_cotizacion_imagen_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select estado from comercial.cotizaciones where id = new.cotizacion_id for share) is distinct from 'BORRADOR' then
    raise exception 'La cotización ya se emitió: sus imágenes no cambian. Duplicala para hacer otra.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.anulada := false;
    new.creado_por := core.usuario_actual();
    new.creado_en := now();
  elsif (to_jsonb(new) - 'anulada') <> (to_jsonb(old) - 'anulada') or (old.anulada and not new.anulada) then
    raise exception 'Una imagen no se edita: se quita y se carga otra.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_cotizacion_imagen_borrador
  before insert or update on comercial.cotizacion_imagenes
  for each row execute function comercial.fn_cotizacion_imagen_borrador();

alter table comercial.cotizacion_imagenes enable row level security;
alter table comercial.cotizacion_imagenes force  row level security;

grant select on comercial.cotizacion_imagenes to authenticated;
grant insert (cotizacion_id, orden, nombre, datos) on comercial.cotizacion_imagenes to authenticated;
grant update (anulada) on comercial.cotizacion_imagenes to authenticated;

create policy cotizacion_imagenes_select_cotizan on comercial.cotizacion_imagenes
  for select to authenticated
  using (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_imagenes_select_cotizan on comercial.cotizacion_imagenes is
  'D-52: las ve quien ve la cotización.';
create policy cotizacion_imagenes_insert_cotizan on comercial.cotizacion_imagenes
  for insert to authenticated
  with check (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_imagenes_insert_cotizan on comercial.cotizacion_imagenes is
  'D-52, RN-50: las carga quien ve la cotización; el trigger exige que esté en borrador.';
create policy cotizacion_imagenes_update_cotizan on comercial.cotizacion_imagenes
  for update to authenticated
  using (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id))
  with check (exists (select 1 from comercial.cotizaciones c where c.id = cotizacion_id));
comment on policy cotizacion_imagenes_update_cotizan on comercial.cotizacion_imagenes is
  'D-52, RN-50: quitar (anulada) una imagen del borrador.';

-- ---------------------------------------------------------------------------
-- 1. Agregar y quitar productos (sólo en borrador)
-- ---------------------------------------------------------------------------

create function comercial.agregar_producto_cotizacion(p_principal uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c     comercial.cotizaciones%rowtype;
  v_nueva uuid;
begin
  if not core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'No tenés permiso para cotizar.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_c from comercial.cotizaciones where id = p_principal for update;
  if not found or v_c.estado <> 'BORRADOR' or v_c.cotizacion_principal_id is not null
     or (v_c.creado_por <> core.usuario_actual() and not core.es_rol('FINANZAS', 'GERENCIA')) then
    raise exception 'Sólo se agregan productos a una cotización en borrador, tuya y que no sea a su vez un producto agregado.'
      using errcode = 'check_violation';
  end if;
  insert into comercial.cotizaciones
    (titulo, destino, cliente_id, cliente_potencial_id, incluir_mano_obra, modo_margen, fija, margen_objetivo,
     redondeo, leyenda_iva, alicuota_iva, vigencia_dias, cotizacion_principal_id, creado_por)
  values ('Producto nuevo', v_c.destino, v_c.cliente_id, v_c.cliente_potencial_id, v_c.incluir_mano_obra,
          v_c.modo_margen, 'MARGEN', coalesce(v_c.margen_objetivo, (select margen_minimo from comercial.v_parametros_costo)),
          v_c.redondeo, v_c.leyenda_iva, v_c.alicuota_iva, v_c.vigencia_dias, p_principal,
          -- Del mismo dueño que la principal: quien la ve y la anula, ve y anula sus productos.
          v_c.creado_por)
  returning id into v_nueva;
  return v_nueva;
end;
$$;

comment on function comercial.agregar_producto_cotizacion(uuid) is
  'Agrega un producto (una cotización borrador nueva) a una cotización principal en borrador. SECURITY DEFINER: es '
  'la única vía para escribir cotizacion_principal_id.';

-- Quitar: el producto queda como borrador suelto (no hay DELETE).
create function comercial.quitar_producto_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'No tenés permiso para cotizar.' using errcode = 'insufficient_privilege';
  end if;
  update comercial.cotizaciones set cotizacion_principal_id = null
   where id = p_id and estado = 'BORRADOR' and cotizacion_principal_id is not null
     and (creado_por = core.usuario_actual() or core.es_rol('FINANZAS', 'GERENCIA'));
  if not found then
    raise exception 'Sólo se quita un producto agregado, en borrador y tuyo.' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Emitir: copia de 20261029130000 que congela la principal y sus productos
--    con un mismo número. El cálculo por producto no cambia.
-- ---------------------------------------------------------------------------

create or replace function comercial.emitir_cotizacion(p_id uuid, p_justificacion text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p       comercial.cotizaciones%rowtype;
  v_c       comercial.cotizaciones%rowtype;
  v_lineas  jsonb;
  v_falta   text;
  v_mat     numeric;
  v_hora    numeric;
  v_mo      numeric;
  v_costo   numeric;
  v_precio  numeric;
  v_mostrado numeric;
  v_margen  numeric;
  v_minimo  numeric;
  v_justif  text;
  v_numero  integer;
  v_anio    integer := extract(year from comercial.hoy())::int;
  v_cliente jsonb;
  v_item    jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_total   numeric := 0;
  v_emisor  text := (select nombre_completo from core.usuarios where id = core.usuario_actual());
begin
  if not core.es_rol('FINANZAS', 'GERENCIA', 'GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') then
    raise exception 'No tenés permiso para emitir cotizaciones.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_p from comercial.cotizaciones where id = p_id for update;
  if not found or v_p.estado <> 'BORRADOR'
     or (v_p.creado_por <> core.usuario_actual() and not core.es_rol('FINANZAS', 'GERENCIA')) then
    raise exception 'La cotización no existe, ya se emitió o no es tuya.' using errcode = 'check_violation';
  end if;
  -- NUEVO: un producto agregado se emite desde su principal.
  if v_p.cotizacion_principal_id is not null then
    raise exception 'Este producto es parte de otra cotización: se emite desde la principal.' using errcode = 'check_violation';
  end if;

  -- NUEVO: los productos agregados toman destino, cliente, IVA y vigencia de la principal.
  update comercial.cotizaciones
     set destino = v_p.destino, cliente_id = v_p.cliente_id, cliente_potencial_id = v_p.cliente_potencial_id,
         leyenda_iva = v_p.leyenda_iva, alicuota_iva = v_p.alicuota_iva, vigencia_dias = v_p.vigencia_dias
   where cotizacion_principal_id = p_id and estado = 'BORRADOR';

  select costo_hora, margen_minimo into v_hora, v_minimo from comercial.v_parametros_costo;

  select case v_p.destino
           when 'CLIENTE' then (select jsonb_build_object('razon_social', razon_social, 'documento', numero_documento,
                                                          'tipo_documento', tipo_documento)
                                  from comercial.clientes where id = v_p.cliente_id)
           when 'POTENCIAL' then (select jsonb_build_object('razon_social', razon_social, 'documento', cuit,
                                                            'contacto', contacto)
                                    from comercial.clientes_potenciales where id = v_p.cliente_potencial_id)
         end into v_cliente;

  v_numero := comercial.siguiente_numero('cotizacion', v_anio);

  -- Los agregados primero, en el orden en que se cargaron, y la principal al
  -- final: su foto lleva a todos y, una vez emitida, el trigger no deja tocarla.
  for v_c in
    select * from comercial.cotizaciones
     where id = p_id or (cotizacion_principal_id = p_id and estado = 'BORRADOR')
     order by (id = p_id), creado_en, id
     for update
  loop
    -- El servidor recalcula todo: lo de la pantalla era sólo para ver en vivo.
    select jsonb_agg(to_jsonb(x) order by x.orden), sum(x.subtotal), string_agg(x.falta, '; ')
      into v_lineas, v_mat, v_falta
      from comercial.costear_cotizacion(v_c.id) x;
    if v_lineas is null then
      raise exception '«%» no tiene componentes.', v_c.titulo using errcode = 'check_violation';
    end if;
    if v_falta is not null then
      raise exception '«%»: no se puede emitir con componentes sin costo: %', v_c.titulo, v_falta
        using errcode = 'check_violation';
    end if;
    v_mo := 0;
    if v_c.incluir_mano_obra then
      if v_hora is null or v_c.minutos_por_unidad is null then
        raise exception '«%»: para incluir mano de obra hacen falta el costo hora (Finanzas) y los minutos por unidad.',
          v_c.titulo using errcode = 'check_violation';
      end if;
      v_mo := round(v_c.minutos_por_unidad * v_hora / 60, 4);
    end if;
    v_costo  := round(v_mat + v_mo, 4);
    v_precio := round(comercial.precio_cotizacion(v_costo, v_c.modo_margen, v_c.fija, v_c.margen_objetivo,
                                                  v_c.precio_objetivo, v_c.redondeo, v_c.leyenda_iva,
                                                  v_c.alicuota_iva), 4);
    if v_precio is null or v_precio <= 0 then
      raise exception '«%»: el precio tiene que ser mayor que cero.', v_c.titulo using errcode = 'check_violation';
    end if;
    v_mostrado := round(case when v_c.leyenda_iva = 'IVA_INCLUIDO' then v_precio * (1 + v_c.alicuota_iva / 100)
                             else v_precio end, 2);
    v_margen := (v_precio - v_costo) / v_precio;
    v_justif := coalesce(nullif(btrim(p_justificacion), ''), nullif(btrim(v_c.justificacion_margen), ''));
    if v_margen < v_minimo and v_justif is null then
      raise exception '«%»: el margen (%) queda debajo del mínimo (%): escribí por qué se cotiza así.',
        v_c.titulo, round(v_margen * 100, 1), round(v_minimo * 100, 1) using errcode = 'check_violation';
    end if;

    v_item := jsonb_build_object(
      'titulo', v_c.titulo, 'contenido_cantidad', v_c.contenido_cantidad,
      'contenido_unidad', v_c.contenido_unidad, 'cantidad', v_c.cantidad_cotizada,
      'precio_unitario', v_mostrado, 'total', round(v_mostrado * v_c.cantidad_cotizada, 2));
    v_total := v_total + round(v_mostrado * v_c.cantidad_cotizada, 2);
    if v_c.id <> p_id then
      v_items := v_items || v_item;
    elsif jsonb_array_length(v_items) > 0 then
      -- NUEVO: el PDF de la principal lleva todos los productos (ella primero) y
      -- el total general. Con un solo producto queda igual que antes.
      v_item := v_item || jsonb_build_object('items', jsonb_build_array(v_item) || v_items,
                                             'total_general', v_total);
    end if;

    update comercial.cotizaciones
       set estado = 'EMITIDA', numero = v_numero, anio = v_anio,
           emitida_en = now(), emitida_por = core.usuario_actual(),
           vence_el = comercial.hoy() + v_p.vigencia_dias,
           costo_unitario = v_costo, precio_unitario = v_precio,
           justificacion_margen = v_justif,
           foto = jsonb_build_object(
             'lineas', v_lineas, 'costo_materiales', v_mat, 'mano_de_obra', v_mo, 'costo_hora', v_hora,
             'minutos_por_unidad', v_c.minutos_por_unidad, 'costo_unitario', v_costo, 'precio_unitario', v_precio,
             'margen_sobre_precio', round(v_margen, 6),
             'recargo_sobre_costo', case when v_costo > 0 then round((v_precio - v_costo) / v_costo, 6) end,
             'margen_minimo', v_minimo, 'cliente', v_cliente,
             -- Lo que va al PDF (y sólo esto): precios mostrados, nada de costos.
             'pdf', jsonb_build_object(
               'numero', v_numero, 'anio', v_anio, 'fecha', comercial.hoy(),
               'vence_el', comercial.hoy() + v_p.vigencia_dias, 'destino', v_p.destino, 'cliente', v_cliente,
               'leyenda_iva', v_p.leyenda_iva, 'alicuota_iva', v_p.alicuota_iva,
               'observaciones', v_p.observaciones, 'emitida_por', v_emisor) || v_item)
     where id = v_c.id;
  end loop;
  return v_numero;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Anular: la principal arrastra sus productos; un producto solo, no.
-- ---------------------------------------------------------------------------

create or replace function comercial.anular_cotizacion(p_id uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from comercial.cotizaciones where id = p_id and cotizacion_principal_id is not null) then
    raise exception 'Este producto es parte de otra cotización: se anula la principal.' using errcode = 'check_violation';
  end if;
  -- Quién y cuándo los pone el trigger.
  update comercial.cotizaciones set estado = 'ANULADA', motivo_anulacion = btrim(p_motivo)
   where id = p_id and estado = 'EMITIDA';
  if not found then
    raise exception 'Sólo se anula una cotización emitida que puedas ver.' using errcode = 'check_violation';
  end if;
  update comercial.cotizaciones set estado = 'ANULADA', motivo_anulacion = btrim(p_motivo)
   where cotizacion_principal_id = p_id and estado = 'EMITIDA';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Duplicar: copia también los productos agregados. Duplicar un producto
--    agregado duplica su principal entera.
-- ---------------------------------------------------------------------------

create or replace function comercial.duplicar_cotizacion(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen uuid;
  v_nueva  uuid;
  v_copia  uuid;
  v_hijo   record;
  v_vig    integer := (select vigencia_cotizacion_dias from comercial.v_parametros_costo);
begin
  -- SECURITY DEFINER para escribir cotizacion_principal_id: se exige lo mismo
  -- que piden las políticas para ver la cotización.
  select coalesce(cotizacion_principal_id, id) into v_origen
    from comercial.cotizaciones
   where id = p_id
     and (core.es_rol('FINANZAS', 'GERENCIA')
          or (core.es_rol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA') and creado_por = core.usuario_actual()));
  if v_origen is null then
    raise exception 'La cotización no existe o no la podés ver.' using errcode = 'check_violation';
  end if;

  for v_hijo in
    select * from comercial.cotizaciones
     where id = v_origen or cotizacion_principal_id = v_origen
     order by (id <> v_origen), creado_en, id
  loop
    insert into comercial.cotizaciones
      (titulo, producto_base_id, contenido_cantidad, contenido_unidad, cantidad_cotizada, destino, cliente_id,
       cliente_potencial_id, incluir_mano_obra, minutos_por_unidad, modo_margen, fija, margen_objetivo,
       precio_objetivo, redondeo, leyenda_iva, alicuota_iva, vigencia_dias, observaciones, duplicada_de,
       cotizacion_principal_id)
    values (v_hijo.titulo, v_hijo.producto_base_id, v_hijo.contenido_cantidad, v_hijo.contenido_unidad,
            v_hijo.cantidad_cotizada, v_hijo.destino, v_hijo.cliente_id, v_hijo.cliente_potencial_id,
            v_hijo.incluir_mano_obra, v_hijo.minutos_por_unidad, v_hijo.modo_margen, v_hijo.fija,
            v_hijo.margen_objetivo, v_hijo.precio_objetivo, v_hijo.redondeo, v_hijo.leyenda_iva, v_hijo.alicuota_iva,
            v_vig, v_hijo.observaciones, v_hijo.id, v_nueva)
    returning id into v_copia;
    v_nueva := coalesce(v_nueva, v_copia);
    insert into comercial.cotizacion_lineas
      (cotizacion_id, orden, tipo, insumo_id, nombre, cantidad, unidad, precio, cantidad_presentacion,
       unidad_presentacion, incluye_iva, alicuota_iva, densidad, merma)
    select v_copia, orden, tipo, insumo_id, nombre, cantidad, unidad, precio, cantidad_presentacion,
           unidad_presentacion, incluye_iva, alicuota_iva, densidad, merma
      from comercial.cotizacion_lineas where cotizacion_id = v_hijo.id and not anulada;
    insert into comercial.cotizacion_imagenes (cotizacion_id, orden, nombre, datos)
    select v_copia, orden, nombre, datos
      from comercial.cotizacion_imagenes where cotizacion_id = v_hijo.id and not anulada;
  end loop;
  return v_nueva;
end;
$$;

comment on function comercial.duplicar_cotizacion(uuid) is
  'Copia una cotización (emitida o no) con sus productos agregados como borrador nuevo, con la vigencia por defecto '
  'de Finanzas. La original no cambia y queda en el historial.';

revoke execute on function comercial.agregar_producto_cotizacion(uuid), comercial.quitar_producto_cotizacion(uuid),
  comercial.duplicar_cotizacion(uuid) from public, anon;
grant execute on function comercial.agregar_producto_cotizacion(uuid), comercial.quitar_producto_cotizacion(uuid),
  comercial.duplicar_cotizacion(uuid) to authenticated;
