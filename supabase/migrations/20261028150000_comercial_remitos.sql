-- ---------------------------------------------------------------------------
-- Propósito : Remito de producto terminado para lo que sale de un depósito
--             («Enviar a otro depósito», p. ej. a Berna, y «Salió»): quién lo
--             recibe, qué va (código, descripción, bultos, cantidad,
--             observaciones) y quién lo confeccionó, con número
--             PPPP-NNNNNNNN correlativo y sin huecos. Por ahora remito interno
--             «X» (sin CAI); la tabla ya admite el «R» con CAI y vencimiento
--             para cuando se defina con ARCA y el contador.
-- Reglas    : D-remito-1 (2026-10-28: interno a priori, ventana abierta al R
--             con CAI). RN-55 (numeración con tabla de contadores, nunca una
--             sequence), RN-54 / invariante 1 (un remito emitido no se edita
--             ni se borra), RN-66 (sin credenciales fiscales acá: el CAI es un
--             dato impreso, no una clave).
-- Fecha     : 2026-10-28
-- ---------------------------------------------------------------------------

create table comercial.remitos (
  id                 uuid primary key default gen_random_uuid(),
  letra              text not null default 'X' check (letra in ('X', 'R')),
  punto_venta        integer not null default 1 check (punto_venta between 1 and 99999),
  numero             integer not null check (numero between 1 and 99999999),
  fecha              date not null default comercial.hoy(),
  motivo             text not null check (motivo in ('TRANSFERENCIA', 'SALIDA')),
  deposito_origen_id uuid references gmp.depositos(id),
  -- Quién recibe (lo completa quien lo confecciona).
  receptor_nombre    text not null check (length(btrim(receptor_nombre)) > 0),
  receptor_cuit      text,
  receptor_domicilio text,
  receptor_iva       text,
  entrega_domicilio  text,
  transporte         text,
  observaciones      text,
  -- Remito «R» (ventana abierta, D-remito-1): lo imprime una imprenta
  -- autorizada o lo emite ARCA, con su CAI y vencimiento.
  cai                text,
  cai_vencimiento    date,
  confeccionado_por  uuid not null references core.usuarios(id) default core.usuario_actual(),
  creado_en          timestamptz not null default now(),
  unique (letra, punto_venta, numero),
  constraint remitos_r_con_cai check (letra = 'X' or (cai is not null and cai_vencimiento is not null))
);
comment on table comercial.remitos is
  'Remitos de producto terminado (D-remito-1). Uno emitido no se edita ni se borra (RN-54): si salió mal, se emite otro.';
create index remitos_confeccionado_por_idx on comercial.remitos (confeccionado_por);
create index remitos_deposito_origen_idx on comercial.remitos (deposito_origen_id);
create index remitos_fecha_idx on comercial.remitos (fecha desc);

create table comercial.remito_renglones (
  id            uuid primary key default gen_random_uuid(),
  remito_id     uuid not null references comercial.remitos(id),
  orden         integer not null check (orden > 0),
  producto_id   uuid references gmp.productos(id),
  codigo        text,
  descripcion   text not null check (length(btrim(descripcion)) > 0),
  bultos        integer check (bultos is null or bultos >= 0),
  cantidad      numeric(14,3) not null check (cantidad > 0),
  observaciones text,
  unique (remito_id, orden)
);
comment on table comercial.remito_renglones is
  'Lo que va en un remito: código, nombre y descripción, bultos, cantidad y observaciones (D-remito-1).';
create index remito_renglones_producto_idx on comercial.remito_renglones (producto_id);

-- Número correlativo por letra y punto de venta, en la misma transacción
-- (RN-55). SECURITY DEFINER: comercial.siguiente_numero no tiene EXECUTE para
-- nadie (20261009160000). Quién lo confecciona lo pone la base.
create or replace function comercial.fn_remito_numerar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.numero := comercial.siguiente_numero(format('remito_%s_%s', new.letra, new.punto_venta), 0);
  new.confeccionado_por := core.usuario_actual();
  new.creado_en := now();
  return new;
end;
$$;
revoke execute on function comercial.fn_remito_numerar() from public, anon, authenticated;
create trigger trg_remito_numerar before insert on comercial.remitos
  for each row execute function comercial.fn_remito_numerar();

alter table comercial.remitos          enable row level security;
alter table comercial.remitos          force  row level security;
alter table comercial.remito_renglones enable row level security;
alter table comercial.remito_renglones force  row level security;
grant select, insert on comercial.remitos, comercial.remito_renglones to authenticated;

create policy remitos_select_authenticated on comercial.remitos
  for select to authenticated using (core.rol() is not null);
comment on policy remitos_select_authenticated on comercial.remitos is
  '§3.3: consulta para todos los roles (se reimprime).';
create policy remitos_insert_stock on comercial.remitos
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS'));
comment on policy remitos_insert_stock on comercial.remitos is
  'D-remito-1: lo emiten los mismos roles que mueven stock de producto terminado (movimientos_pt_insert_stock). '
  'Sin UPDATE ni DELETE (RN-54).';
create policy remito_renglones_select_authenticated on comercial.remito_renglones
  for select to authenticated using (core.rol() is not null);
comment on policy remito_renglones_select_authenticated on comercial.remito_renglones is
  '§3.3: consulta para todos los roles.';
-- Los renglones van con el remito recién emitido, en la misma transacción.
create policy remito_renglones_insert_stock on comercial.remito_renglones
  for insert to authenticated
  with check (core.es_rol('ENCARGADA_STOCK', 'GERENCIA_PRODUCCION', 'GERENCIA', 'ADMINISTRACION', 'VENTAS')
              and exists (select 1 from comercial.remitos r
                           where r.id = remito_id and r.confeccionado_por = core.usuario_actual()
                             and r.creado_en = now()));
comment on policy remito_renglones_insert_stock on comercial.remito_renglones is
  'D-remito-1: solo al emitirlo (misma transacción, mismo autor). Sin UPDATE ni DELETE (RN-54).';

select core.adjuntar_auditoria('comercial.remitos');
select core.adjuntar_auditoria('comercial.remito_renglones');

-- Emitir: cabecera y renglones juntos, todo o nada.
create or replace function comercial.emitir_remito(p_remito jsonb, p_renglones jsonb)
returns comercial.remitos
language plpgsql
set search_path = ''
as $$
declare
  v_r comercial.remitos%rowtype;
begin
  if jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El remito necesita al menos un renglón.' using errcode = 'check_violation';
  end if;
  insert into comercial.remitos
    (letra, punto_venta, numero, fecha, motivo, deposito_origen_id, receptor_nombre, receptor_cuit,
     receptor_domicilio, receptor_iva, entrega_domicilio, transporte, observaciones, cai, cai_vencimiento)
  values
    (coalesce(nullif(p_remito ->> 'letra', ''), 'X'),
     coalesce((p_remito ->> 'punto_venta')::integer, 1),
     0,  -- lo pone fn_remito_numerar
     coalesce((p_remito ->> 'fecha')::date, comercial.hoy()),
     p_remito ->> 'motivo',
     (p_remito ->> 'deposito_origen_id')::uuid,
     btrim(coalesce(p_remito ->> 'receptor_nombre', '')),
     nullif(btrim(coalesce(p_remito ->> 'receptor_cuit', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'receptor_domicilio', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'receptor_iva', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'entrega_domicilio', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'transporte', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'observaciones', '')), ''),
     nullif(btrim(coalesce(p_remito ->> 'cai', '')), ''),
     (p_remito ->> 'cai_vencimiento')::date)
  returning * into v_r;

  insert into comercial.remito_renglones
    (remito_id, orden, producto_id, codigo, descripcion, bultos, cantidad, observaciones)
  select v_r.id, x.n, (x.e ->> 'producto_id')::uuid, nullif(btrim(coalesce(x.e ->> 'codigo', '')), ''),
         btrim(coalesce(x.e ->> 'descripcion', '')), (x.e ->> 'bultos')::integer, (x.e ->> 'cantidad')::numeric,
         nullif(btrim(coalesce(x.e ->> 'observaciones', '')), '')
    from jsonb_array_elements(p_renglones) with ordinality as x(e, n);
  return v_r;
end;
$$;
comment on function comercial.emitir_remito(jsonb, jsonb) is
  'Emite un remito con sus renglones (D-remito-1). SECURITY INVOKER: rigen remitos_insert_stock y los checks.';
revoke execute on function comercial.emitir_remito(jsonb, jsonb) from public, anon;
grant execute on function comercial.emitir_remito(jsonb, jsonb) to authenticated;
