-- ---------------------------------------------------------------------------
-- Propósito : Facturación electrónica ARCA desde los pedidos: maestro de
--             clientes con condición frente al IVA, precio en los renglones
--             del pedido, configuración del emisor, y comercial.facturas con
--             las funciones que la Edge Function `emitir-factura` usa para
--             preparar y registrar cada comprobante.
-- Reglas    : RN-55 (numeración correlativa sin huecos por punto de venta y
--             tipo), RN-56 (el comprobante autorizado no se edita ni se borra),
--             RN-57 (tipo de comprobante según condición frente al IVA),
--             RN-58 (CAE y vencimiento antes de entregar), RN-66 (credenciales
--             solo en el almacén de secretos), RN-50 (auditoría). §3.3 y
--             §4.12.1 / §4.12.3 del alcance.
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- QUÉ FALTABA EN EL MODELO PARA PODER FACTURAR.
-- - comercial.pedidos.cliente era texto libre: sin condición frente al IVA ni
--   documento no se puede elegir el tipo de comprobante ni identificar al
--   receptor. Se agrega comercial.clientes (§4.12.1, recortado a lo que la
--   factura necesita) y pedidos.cliente_id. El texto queda como estaba.
-- - Los renglones del pedido no tenían precio. Se agregan precio unitario neto
--   y alícuota de IVA. Es un precio por pedido, no una lista de precios
--   (§4.12.1 la prevé versionada por fecha, RN-59): cuando exista la lista, el
--   precio del renglón se toma de ahí al cargar el pedido y queda congelado
--   en el renglón, que es lo que RN-59 pide.
--
-- RN-57, TIPO DE COMPROBANTE. Verificado contra ARCA en homologación el
-- 2026-09-24 (FECAESolicitar y FEParamGetCondicionIvaReceptor):
--   RESPONSABLE_INSCRIPTO → A      MONOTRIBUTO → A     (B se rechaza: 10243)
--   CONSUMIDOR_FINAL      → B      EXENTO      → B     NO_ALCANZADO → B
-- La indicación original era «B para monotributistas». ARCA hoy la rechaza
-- con 10243 («Condición IVA receptor no es válido para la clase de
-- comprobante»): quien es Responsable Inscripto le factura A al monotributista.
-- Queda como D-30 para que lo confirme el contador.
--
-- RN-55, NUMERACIÓN. El número lo asigna ARCA: tiene que ser el último
-- autorizado + 1 para ese punto de venta y tipo, y ARCA rechaza cualquier otro
-- (10016). La tabla de contadores con FOR UPDATE que prevé el alcance resuelve
-- un problema que acá tiene otra forma: el riesgo no es el hueco (ARCA no deja
-- saltear) sino que dos emisiones simultáneas pidan el mismo número. Se evita
-- con un índice único parcial: a lo sumo una factura PENDIENTE por emisor,
-- punto de venta y tipo. La segunda emisión concurrente falla al preparar, no
-- en ARCA.
--
-- AMBIENTE. Se arranca en homologación. Cada factura guarda su ambiente, y las
-- de homologación no son comprobantes fiscales: el tablero y cualquier reporte
-- tienen que filtrarlas.

-- ===========================================================================
-- 1. Enumeraciones
-- ===========================================================================

create type comercial.condicion_iva_enum as enum (
  'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL', 'NO_ALCANZADO'
);

create type comercial.tipo_documento_enum as enum ('CUIT', 'CUIL', 'DNI', 'SIN_IDENTIFICAR');

create type comercial.estado_factura_enum as enum ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA');

create type comercial.ambiente_fiscal_enum as enum ('HOMOLOGACION', 'PRODUCCION');

-- ===========================================================================
-- 2. Tablas de correspondencia con ARCA (RN-57)
-- ===========================================================================
--
-- Funciones deterministas, como pide RN-57. Los códigos son los de ARCA
-- (FEParamGetCondicionIvaReceptor, FEParamGetTiposDoc, FEParamGetTiposCbte),
-- verificados el 2026-09-24.

create or replace function comercial.clase_factura(p_condicion comercial.condicion_iva_enum)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_condicion
           when 'RESPONSABLE_INSCRIPTO' then 'A'
           when 'MONOTRIBUTO'           then 'A'
           else 'B'
         end;
$$;

comment on function comercial.clase_factura(comercial.condicion_iva_enum) is
  'RN-57: A a Responsable Inscripto y Monotributo (ARCA rechaza B a monotributo, 10243); B al resto. Verificado en homologación 2026-09-24.';

create or replace function comercial.condicion_iva_arca(p_condicion comercial.condicion_iva_enum)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_condicion
           when 'RESPONSABLE_INSCRIPTO' then 1
           when 'EXENTO'                then 4
           when 'CONSUMIDOR_FINAL'      then 5
           when 'MONOTRIBUTO'           then 6
           when 'NO_ALCANZADO'          then 15
         end;
$$;

create or replace function comercial.tipo_documento_arca(p_tipo comercial.tipo_documento_enum)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
           when 'CUIT'            then 80
           when 'CUIL'            then 86
           when 'DNI'             then 96
           when 'SIN_IDENTIFICAR' then 99
         end;
$$;

-- Código de comprobante de ARCA: 1 = Factura A, 6 = Factura B.
create or replace function comercial.codigo_comprobante_arca(p_clase text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_clase when 'A' then 1 when 'B' then 6 end;
$$;

-- Id de alícuota de IVA de ARCA.
create or replace function comercial.alicuota_iva_arca(p_alicuota numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_alicuota
           when 0    then 3
           when 10.5 then 4
           when 21   then 5
           when 27   then 6
           when 5    then 8
           when 2.5  then 9
         end;
$$;

-- CUIT/CUIL: 11 dígitos con dígito verificador (módulo 11).
create or replace function comercial.cuit_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_pesos int[] := array[5,4,3,2,7,6,5,4,3,2];
  v_suma  int := 0;
  v_dv    int;
begin
  if p is null or p !~ '^[0-9]{11}$' then
    return false;
  end if;
  for i in 1..10 loop
    v_suma := v_suma + substr(p, i, 1)::int * v_pesos[i];
  end loop;
  v_dv := 11 - (v_suma % 11);
  v_dv := case v_dv when 11 then 0 when 10 then 9 else v_dv end;
  return v_dv = substr(p, 11, 1)::int;
end;
$$;

-- ===========================================================================
-- 3. Clientes (§4.12.1, recortado)
-- ===========================================================================

create table comercial.clientes (
  id               uuid primary key default gen_random_uuid(),
  razon_social     text not null check (length(btrim(razon_social)) > 0),
  condicion_iva    comercial.condicion_iva_enum not null,
  tipo_documento   comercial.tipo_documento_enum not null,
  -- Sin guiones ni puntos. '0' para consumidor final sin identificar.
  numero_documento text not null check (numero_documento ~ '^[0-9]+$'),
  domicilio        text,
  email            text,
  activo           boolean not null default true,
  creado_por       uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en        timestamptz not null default now(),
  -- La factura A identifica al receptor por CUIT: sin CUIT no hay A.
  constraint clientes_a_con_cuit check (
    comercial.clase_factura(condicion_iva) <> 'A' or tipo_documento = 'CUIT'
  ),
  constraint clientes_cuit_valido check (
    tipo_documento not in ('CUIT', 'CUIL') or comercial.cuit_valido(numero_documento)
  ),
  constraint clientes_sin_identificar check (
    (tipo_documento = 'SIN_IDENTIFICAR') = (numero_documento = '0')
  ),
  constraint clientes_sin_identificar_solo_consumidor check (
    tipo_documento <> 'SIN_IDENTIFICAR' or condicion_iva = 'CONSUMIDOR_FINAL'
  )
);

comment on table comercial.clientes is
  'Maestro de clientes (§4.12.1, recortado a lo que la factura necesita). La condición frente al IVA decide el tipo de comprobante (RN-57).';

create unique index clientes_documento_idx
  on comercial.clientes (tipo_documento, numero_documento)
  where tipo_documento <> 'SIN_IDENTIFICAR';

alter table comercial.clientes enable row level security;
alter table comercial.clientes force  row level security;

grant select, insert, update on comercial.clientes to authenticated;

create policy clientes_select_authenticated on comercial.clientes
  for select to authenticated using (core.rol() is not null);
comment on policy clientes_select_authenticated on comercial.clientes is
  '§3.3: consulta habilitada para todos los roles.';

create policy clientes_insert_comercial on comercial.clientes
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA'));
comment on policy clientes_insert_comercial on comercial.clientes is
  '§3.3 «Alta y edición de cliente»: ADM, GP y GG.';

create policy clientes_update_comercial on comercial.clientes
  for update to authenticated
  using (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA_PRODUCCION', 'GERENCIA'));
comment on policy clientes_update_comercial on comercial.clientes is
  '§3.3 «Alta y edición de cliente»: ADM, GP y GG.';

select core.adjuntar_auditoria('comercial.clientes');

-- ===========================================================================
-- 4. Pedido: cliente del padrón y precio por renglón
-- ===========================================================================

alter table comercial.pedidos
  add column cliente_id uuid references comercial.clientes(id);

comment on column comercial.pedidos.cliente_id is
  'Cliente del padrón, obligatorio para facturar. `cliente` (texto) queda como la descripción que se cargó.';

alter table comercial.pedido_renglones
  add column precio_unitario numeric(16,4) check (precio_unitario is null or precio_unitario >= 0),
  add column alicuota_iva    numeric(5,2) not null default 21
    check (comercial.alicuota_iva_arca(alicuota_iva) is not null);

comment on column comercial.pedido_renglones.precio_unitario is
  'Precio unitario NETO de IVA, en pesos. NULL = sin precio todavía; no se factura un pedido con renglones sin precio.';

-- El pedido cerrado no se modifica (20260923130000), salvo una cosa: asignarle
-- el cliente del padrón si todavía no lo tenía. No cambia nada de lo que
-- pasó; completa el dato que la factura necesita, y solo una vez.
create or replace function comercial.fn_pedido_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('CUMPLIDO', 'CANCELADO') then
    if old.cliente_id is null and new.cliente_id is not null
       and (to_jsonb(new) - 'cliente_id') = (to_jsonb(old) - 'cliente_id') then
      return new;
    end if;
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

-- ===========================================================================
-- 5. Configuración del emisor
-- ===========================================================================
--
-- Una sola fila vigente. Nada de CUIT, punto de venta ni ambiente escrito en
-- la Edge Function: se cambia de homologación a producción acá, con auditoría.
-- Las credenciales NO van acá (RN-66): el token de Afip SDK, y en producción el
-- certificado y la clave, están en el almacén de secretos.

create table comercial.configuracion_fiscal (
  id           uuid primary key default gen_random_uuid(),
  ambiente     comercial.ambiente_fiscal_enum not null,
  cuit_emisor  text not null check (comercial.cuit_valido(cuit_emisor)),
  punto_venta  integer not null check (punto_venta between 1 and 99998),
  vigente      boolean not null default true,
  observacion  text,
  creado_en    timestamptz not null default now()
);

create unique index configuracion_fiscal_una_vigente_idx
  on comercial.configuracion_fiscal ((true)) where vigente;

comment on table comercial.configuracion_fiscal is
  'Emisor de las facturas: ambiente, CUIT y punto de venta. Una sola fila vigente. Sin credenciales (RN-66).';

alter table comercial.configuracion_fiscal enable row level security;
alter table comercial.configuracion_fiscal force  row level security;

grant select, insert, update on comercial.configuracion_fiscal to authenticated;

create policy configuracion_fiscal_select_authenticated on comercial.configuracion_fiscal
  for select to authenticated using (core.rol() is not null);
comment on policy configuracion_fiscal_select_authenticated on comercial.configuracion_fiscal is
  'Todos los roles ven con qué ambiente y punto de venta se factura.';

create policy configuracion_fiscal_escribe_sistema on comercial.configuracion_fiscal
  for insert to authenticated with check (core.es_rol('ADMINISTRADOR_SISTEMA', 'GERENCIA'));
create policy configuracion_fiscal_actualiza_sistema on comercial.configuracion_fiscal
  for update to authenticated
  using (core.es_rol('ADMINISTRADOR_SISTEMA', 'GERENCIA'))
  with check (core.es_rol('ADMINISTRADOR_SISTEMA', 'GERENCIA'));
comment on policy configuracion_fiscal_escribe_sistema on comercial.configuracion_fiscal is
  '§3.3 «Configurar parámetros fiscales y puntos de venta»: SYS (con GG como autoridad comercial).';

select core.adjuntar_auditoria('comercial.configuracion_fiscal');

-- Arranque en homologación con el CUIT de demostración de Afip SDK. NO es el
-- CUIT de Nail Show: pasar a producción es insertar una fila nueva vigente con
-- el CUIT real y el punto de venta habilitado en ARCA, y cargar el certificado
-- y la clave como secretos.
insert into comercial.configuracion_fiscal (ambiente, cuit_emisor, punto_venta, observacion)
values ('HOMOLOGACION', '20409378472', 1,
        'CUIT de demostración de Afip SDK para homologación. No es el CUIT de Nail Show.');

-- ===========================================================================
-- 6. Facturas
-- ===========================================================================

create table comercial.facturas (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references comercial.pedidos(id),
  cliente_id       uuid not null references comercial.clientes(id),
  ambiente         comercial.ambiente_fiscal_enum not null,
  cuit_emisor      text not null,
  tipo             text not null check (tipo in ('A', 'B')),
  codigo_arca      integer not null check (codigo_arca in (1, 6)),
  punto_venta      integer not null,
  -- Lo fija la Edge Function con el último autorizado de ARCA + 1, antes de
  -- enviar: si la función se cae con el pedido en vuelo, el número queda y el
  -- reintento lo consulta en ARCA en vez de pedir otro.
  numero           integer check (numero is null or numero > 0),
  fecha            date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  -- Datos del receptor tal como se enviaron: la factura no cambia si después
  -- se corrige el cliente.
  receptor_doc_tipo     integer not null,
  receptor_doc_numero   text not null,
  receptor_condicion_iva integer not null,
  importe_neto     numeric(16,2) not null check (importe_neto >= 0),
  importe_iva      numeric(16,2) not null check (importe_iva >= 0),
  importe_total    numeric(16,2) not null,
  alicuotas        jsonb not null,
  estado           comercial.estado_factura_enum not null default 'PENDIENTE',
  cae              text,
  cae_vencimiento  date,
  motivo_rechazo   text,
  -- Lo que se le mandó a ARCA, sin el Auth (token y firma no se guardan).
  solicitud_arca   jsonb,
  -- La respuesta completa de la API, para auditoría.
  respuesta_arca   jsonb,
  emitida_por      uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en        timestamptz not null default now(),
  resuelta_en      timestamptz,
  constraint facturas_total_cierra check (importe_total = importe_neto + importe_iva),
  constraint facturas_tipo_codigo check (codigo_arca = comercial.codigo_comprobante_arca(tipo)),
  -- RN-58: autorizada = con CAE de 14 dígitos, vencimiento y número.
  constraint facturas_autorizada_completa check (
    estado <> 'AUTORIZADA'
    or (cae ~ '^[0-9]{14}$' and cae_vencimiento is not null and numero is not null
        and respuesta_arca is not null and resuelta_en is not null)
  ),
  constraint facturas_rechazada_con_motivo check (
    estado <> 'RECHAZADA'
    or (length(btrim(coalesce(motivo_rechazo, ''))) > 0 and resuelta_en is not null)
  )
);

comment on table comercial.facturas is
  'Facturas electrónicas ARCA emitidas desde pedidos. RN-56: autorizada o rechazada no se modifica. '
  'Las de ambiente HOMOLOGACION son pruebas, no comprobantes fiscales.';
comment on column comercial.facturas.respuesta_arca is
  'Respuesta completa de Afip SDK / ARCA, tal cual. Evidencia de lo que el organismo contestó.';

-- Un pedido se factura una vez: a lo sumo una en vuelo o autorizada. Una
-- rechazada no cuenta, para poder reintentar con los datos corregidos.
create unique index facturas_un_pedido_idx
  on comercial.facturas (pedido_id) where estado in ('PENDIENTE', 'AUTORIZADA');

-- RN-55: una sola emisión en vuelo por emisor, punto de venta y tipo, para
-- que dos no pidan el mismo número.
create unique index facturas_una_en_vuelo_idx
  on comercial.facturas (ambiente, cuit_emisor, punto_venta, codigo_arca) where estado = 'PENDIENTE';

-- Ningún número se autoriza dos veces.
create unique index facturas_numero_unico_idx
  on comercial.facturas (ambiente, cuit_emisor, punto_venta, codigo_arca, numero)
  where estado = 'AUTORIZADA';

create index facturas_pedido_idx on comercial.facturas (pedido_id);

-- RN-56: la resuelta no cambia. La pendiente solo puede recibir su número y
-- después su resultado; ningún otro dato se toca.
create or replace function comercial.fn_factura_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado <> 'PENDIENTE' then
    raise exception
      'RN-56: la factura % está %, no se modifica. Se corrige con una nota de crédito que la referencie.',
      coalesce(old.numero::text, old.id::text), old.estado
      using errcode = 'restrict_violation';
  end if;

  if (to_jsonb(new) - array['numero','estado','cae','cae_vencimiento','motivo_rechazo',
                            'solicitud_arca','respuesta_arca','resuelta_en'])
     is distinct from
     (to_jsonb(old) - array['numero','estado','cae','cae_vencimiento','motivo_rechazo',
                            'solicitud_arca','respuesta_arca','resuelta_en']) then
    raise exception 'De una factura pendiente solo cambian su número y el resultado de ARCA.'
      using errcode = 'restrict_violation';
  end if;

  if old.numero is not null and new.numero is distinct from old.numero then
    raise exception 'El número de la factura ya se fijó y no cambia.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger trg_factura_inmutable
  before update on comercial.facturas
  for each row execute function comercial.fn_factura_inmutable();

alter table comercial.facturas enable row level security;
alter table comercial.facturas force  row level security;

-- Sin DELETE para nadie (RN-56).
grant select, insert, update on comercial.facturas to authenticated;

create policy facturas_select_authenticated on comercial.facturas
  for select to authenticated using (core.rol() is not null);
comment on policy facturas_select_authenticated on comercial.facturas is
  '§3.3: consulta habilitada para todos los roles.';

create policy facturas_insert_emisores on comercial.facturas
  for insert to authenticated
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'));
create policy facturas_update_emisores on comercial.facturas
  for update to authenticated
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION'));
comment on policy facturas_insert_emisores on comercial.facturas is
  '§3.3 «Emitir factura y solicitar CAE»: ADM y GG, más GERENCIA_PRODUCCION por indicación del codirector '
  'técnico (2026-09-24): emiten Matias Alonso y Nazarena, que tienen ese rol. Ver D-31.';

select core.adjuntar_auditoria('comercial.facturas');

-- ===========================================================================
-- 7. Preparar la factura de un pedido
-- ===========================================================================
--
-- La llama la Edge Function con la sesión del usuario. Valida el pedido,
-- calcula los importes en la base (no en la función ni en el navegador) y deja
-- la factura PENDIENTE. Devuelve todo lo que hace falta para armar el
-- FECAESolicitar. Si el pedido ya tiene una pendiente, la devuelve: es un
-- reintento, y la función decide si el comprobante ya llegó a ARCA.

create or replace function comercial.preparar_factura(p_pedido_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido   comercial.pedidos%rowtype;
  v_cliente  comercial.clientes%rowtype;
  v_config   comercial.configuracion_fiscal%rowtype;
  v_factura  comercial.facturas%rowtype;
  v_clase    text;
  v_sin_precio integer;
  v_neto     numeric(16,2);
  v_iva      numeric(16,2);
  v_alic     jsonb;
  v_items    jsonb;
begin
  if not core.es_rol('ADMINISTRACION', 'GERENCIA', 'GERENCIA_PRODUCCION') then
    raise exception 'Emitir facturas es de Administración, Gerencia o Gerencia de Producción.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_pedido from comercial.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'El pedido no existe.';
  end if;

  -- Reintento: la pendiente vuelve tal cual, con su número si ya lo tenía.
  select * into v_factura from comercial.facturas
   where pedido_id = p_pedido_id and estado = 'PENDIENTE';
  if found then
    return comercial.fn_factura_para_arca(v_factura.id);
  end if;

  if exists (select 1 from comercial.facturas where pedido_id = p_pedido_id and estado = 'AUTORIZADA') then
    raise exception 'El pedido % ya tiene una factura autorizada.', v_pedido.numero
      using errcode = 'unique_violation';
  end if;
  if v_pedido.estado in ('BORRADOR', 'CANCELADO') then
    raise exception 'No se factura un pedido en %.', v_pedido.estado using errcode = 'check_violation';
  end if;
  if v_pedido.cliente_id is null then
    raise exception 'El pedido % no tiene cliente del padrón: asignale uno con su condición frente al IVA.', v_pedido.numero
      using errcode = 'check_violation';
  end if;

  select * into v_cliente from comercial.clientes where id = v_pedido.cliente_id;
  if not v_cliente.activo then
    raise exception 'El cliente % está desactivado.', v_cliente.razon_social using errcode = 'check_violation';
  end if;

  select count(*) into v_sin_precio
    from comercial.pedido_renglones where pedido_id = p_pedido_id and precio_unitario is null;
  if v_sin_precio > 0 then
    raise exception 'El pedido tiene % renglón(es) sin precio.', v_sin_precio using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pedido_renglones where pedido_id = p_pedido_id) then
    raise exception 'El pedido no tiene productos.' using errcode = 'check_violation';
  end if;

  select * into v_config from comercial.configuracion_fiscal where vigente;
  if not found then
    raise exception 'No hay configuración fiscal vigente (ambiente, CUIT y punto de venta).';
  end if;

  v_clase := comercial.clase_factura(v_cliente.condicion_iva);

  -- Importes por alícuota, redondeados a centavos por alícuota: ARCA exige
  -- que ImpTotal = ImpNeto + ImpIVA y que cada AlicIva cierre con su base.
  with por_alicuota as (
    select r.alicuota_iva,
           round(sum(r.cantidad * r.precio_unitario), 2) as base
      from comercial.pedido_renglones r
     where r.pedido_id = p_pedido_id
     group by r.alicuota_iva
  ),
  calculado as (
    select alicuota_iva, base, round(base * alicuota_iva / 100, 2) as importe
      from por_alicuota
  )
  select sum(base), sum(importe),
         jsonb_agg(jsonb_build_object(
           'Id', comercial.alicuota_iva_arca(alicuota_iva),
           'BaseImp', base, 'Importe', importe, 'alicuota', alicuota_iva)
           order by alicuota_iva)
    into v_neto, v_iva, v_alic
    from calculado;

  if v_neto <= 0 then
    raise exception 'El pedido suma $0: no se factura.' using errcode = 'check_violation';
  end if;

  insert into comercial.facturas (
    pedido_id, cliente_id, ambiente, cuit_emisor, tipo, codigo_arca, punto_venta,
    receptor_doc_tipo, receptor_doc_numero, receptor_condicion_iva,
    importe_neto, importe_iva, importe_total, alicuotas
  ) values (
    p_pedido_id, v_cliente.id, v_config.ambiente, v_config.cuit_emisor, v_clase,
    comercial.codigo_comprobante_arca(v_clase), v_config.punto_venta,
    comercial.tipo_documento_arca(v_cliente.tipo_documento), v_cliente.numero_documento,
    comercial.condicion_iva_arca(v_cliente.condicion_iva),
    v_neto, v_iva, v_neto + v_iva, v_alic
  ) returning * into v_factura;

  return comercial.fn_factura_para_arca(v_factura.id);
end;
$$;

-- Lo que la Edge Function necesita para armar el comprobante.
create or replace function comercial.fn_factura_para_arca(p_factura_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'factura_id',       f.id,
    'pedido_numero',    p.numero,
    'ambiente',         f.ambiente,
    'cuit_emisor',      f.cuit_emisor,
    'punto_venta',      f.punto_venta,
    'tipo',             f.tipo,
    'codigo_arca',      f.codigo_arca,
    'numero',           f.numero,
    'fecha',            to_char(f.fecha, 'YYYYMMDD'),
    'doc_tipo',         f.receptor_doc_tipo,
    'doc_numero',       f.receptor_doc_numero,
    'condicion_iva',    f.receptor_condicion_iva,
    'importe_neto',     f.importe_neto,
    'importe_iva',      f.importe_iva,
    'importe_total',    f.importe_total,
    'alicuotas',        f.alicuotas
  )
  from comercial.facturas f
  join comercial.pedidos p on p.id = f.pedido_id
  where f.id = p_factura_id;
$$;

grant execute on function comercial.preparar_factura(uuid) to authenticated;
grant execute on function comercial.fn_factura_para_arca(uuid) to authenticated;

-- ===========================================================================
-- 8. Registrar el resultado de ARCA
-- ===========================================================================
--
-- La respuesta se interpreta acá, en la base, y no en la función: el criterio
-- de «autorizada» o «rechazada» es uno solo y queda versionado con la tabla.
-- Formas verificadas en homologación (2026-09-24):
--   FECAESolicitarResult.FeCabResp.Resultado            'A' | 'R' | 'P'
--   FECAESolicitarResult.FeDetResp.FECAEDetResponse[0]  {Resultado, CAE,
--                                     CAEFchVto 'YYYYMMDD', Observaciones.Obs[]}
--   FECAESolicitarResult.Errors.Err[]                   errores de cabecera
--   HTTP 200 aun cuando ARCA rechaza.
--
-- p_error_envio: la función no llegó a mandar el comprobante (autorización
-- fallida, configuración, red antes de enviar). Se registra RECHAZADA con ese
-- motivo, porque ARCA no lo recibió y no hay nada que conciliar.

create or replace function comercial.registrar_resultado_factura(
  p_factura_id  uuid,
  p_solicitud   jsonb,
  p_respuesta   jsonb,
  p_error_envio text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_f          comercial.facturas%rowtype;
  v_res        jsonb := p_respuesta -> 'FECAESolicitarResult';
  v_det        jsonb := v_res -> 'FeDetResp' -> 'FECAEDetResponse' -> 0;
  v_resultado  text  := coalesce(v_det ->> 'Resultado', v_res -> 'FeCabResp' ->> 'Resultado');
  v_cae        text  := nullif(v_det ->> 'CAE', '');
  v_vto        text  := nullif(v_det ->> 'CAEFchVto', '');
  v_mensajes   text;
begin
  select * into v_f from comercial.facturas where id = p_factura_id for update;
  if not found then
    raise exception 'La factura no existe.';
  end if;
  if v_f.estado <> 'PENDIENTE' then
    raise exception 'La factura ya está %.', v_f.estado using errcode = 'check_violation';
  end if;

  -- Observaciones del detalle y errores de cabecera, «código: mensaje».
  select string_agg(format('%s: %s', m ->> 'Code', m ->> 'Msg'), ' | ')
    into v_mensajes
    from (
      select jsonb_array_elements(coalesce(v_det -> 'Observaciones' -> 'Obs', '[]'::jsonb)) as m
      union all
      select jsonb_array_elements(coalesce(v_res -> 'Errors' -> 'Err', '[]'::jsonb))
    ) x;

  if p_error_envio is not null then
    update comercial.facturas
       set estado = 'RECHAZADA',
           motivo_rechazo = 'No se envió a ARCA: ' || p_error_envio,
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  elsif v_resultado = 'A' and v_cae is not null then
    update comercial.facturas
       set estado = 'AUTORIZADA',
           cae = v_cae,
           cae_vencimiento = to_date(v_vto, 'YYYYMMDD'),
           -- Las observaciones de una autorizada (p. ej. 10217) se conservan.
           motivo_rechazo = null,
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  else
    update comercial.facturas
       set estado = 'RECHAZADA',
           motivo_rechazo = coalesce(v_mensajes, format('ARCA respondió Resultado «%s» sin CAE.', coalesce(v_resultado, '?'))),
           solicitud_arca = p_solicitud,
           respuesta_arca = p_respuesta,
           resuelta_en = now()
     where id = p_factura_id;
  end if;

  select * into v_f from comercial.facturas where id = p_factura_id;
  return jsonb_build_object(
    'factura_id', v_f.id, 'estado', v_f.estado, 'tipo', v_f.tipo,
    'punto_venta', v_f.punto_venta, 'numero', v_f.numero,
    'cae', v_f.cae, 'cae_vencimiento', v_f.cae_vencimiento,
    'importe_total', v_f.importe_total, 'motivo', v_f.motivo_rechazo,
    'observaciones', v_mensajes, 'ambiente', v_f.ambiente
  );
end;
$$;

comment on function comercial.registrar_resultado_factura(uuid, jsonb, jsonb, text) is
  'Interpreta la respuesta de ARCA y resuelve la factura pendiente: AUTORIZADA con CAE, o RECHAZADA con el motivo '
  '(observaciones y errores de ARCA). Nunca deja una respuesta sin registrar.';

grant execute on function comercial.registrar_resultado_factura(uuid, jsonb, jsonb, text) to authenticated;

-- Fijar el número antes de enviar (lo pide la Edge Function). Un UPDATE que
-- RLS filtra no falla, afecta cero filas: por eso se verifica y se avisa.
create or replace function comercial.fijar_numero_factura(p_factura_id uuid, p_numero integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update comercial.facturas
     set numero = p_numero
   where id = p_factura_id and estado = 'PENDIENTE' and (numero is null or numero = p_numero);
  if not found then
    raise exception 'No se pudo fijar el número % en la factura: no está pendiente, ya tiene otro número o tu rol no la puede tocar.', p_numero
      using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function comercial.fijar_numero_factura(uuid, integer) to authenticated;
