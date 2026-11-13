-- ---------------------------------------------------------------------------
-- Propósito : Armar packs con otros productos terminados (un «supraproducto»).
--             El primero es el DUO01 «PREP + PRIMER LOW»: 1 PREP 8 ml (377) y
--             1 PRIMER 8 ml (105, low acid). Gerencia de Producción lo arma
--             en el depósito que elige: salen los componentes y entra el pack,
--             con los movimientos atados al armado.
-- Reglas    : RN-51 (solo se arma con lotes vendibles), RN-54 (el stock se
--             mueve con movimientos, no se edita), RN-50 (auditoría),
--             D-armado-duo-1.
-- Fecha     : 2026-11-13
-- ---------------------------------------------------------------------------
--
-- Decisiones del codirector técnico (2026-11-13):
--   - el depósito se elige al armar; componentes y pack, en el mismo;
--   - la bolsita 105BOL no se descuenta por ahora (no hay stock cargado);
--   - cada armado deja de qué lote salió cada componente (los movimientos
--     llevan orden_id y documento ARMADO), pero un DUO ya armado no se
--     bloquea solo si después se bloquea un lote de un componente: queda
--     abierto en D-armado-duo-1.
--
-- Los movimientos son ajustes (SALIDA_AJUSTE / ENTRADA_AJUSTE) con
-- documento_tipo 'ARMADO': no se agrega un tipo nuevo al enum, que comparten
-- el stock de insumos y varias pantallas. El pack entra sin lote.

create table comercial.pack_componentes (
  pack_id       uuid not null references gmp.productos(id),
  componente_id uuid not null references gmp.productos(id),
  cantidad      integer not null check (cantidad > 0),
  creado_en     timestamptz not null default now(),
  primary key (pack_id, componente_id),
  check (pack_id <> componente_id)
);
comment on table comercial.pack_componentes is
  'D-armado-duo-1: qué productos terminados lleva cada pack, y cuántos de cada uno.';

create table comercial.armados_pack (
  id             uuid primary key default gen_random_uuid(),
  pack_id        uuid not null references gmp.productos(id),
  deposito_id    uuid not null references gmp.depositos(id),
  cantidad       integer not null check (cantidad > 0),
  observaciones  text,
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now()
);
comment on table comercial.armados_pack is
  'D-armado-duo-1: cada armado de packs. Sus movimientos en movimientos_pt llevan documento_tipo ARMADO y documento_id = id.';

alter table comercial.pack_componentes enable row level security;
alter table comercial.pack_componentes force  row level security;
alter table comercial.armados_pack enable row level security;
alter table comercial.armados_pack force  row level security;
grant select on comercial.pack_componentes to authenticated;
grant select, insert on comercial.armados_pack to authenticated;

create policy pack_componentes_select_autenticados on comercial.pack_componentes
  for select to authenticated using (true);
comment on policy pack_componentes_select_autenticados on comercial.pack_componentes is
  'D-armado-duo-1: la composición la ve cualquiera; se carga por migración.';
create policy armados_pack_select_autenticados on comercial.armados_pack
  for select to authenticated using (true);
comment on policy armados_pack_select_autenticados on comercial.armados_pack is
  'D-armado-duo-1: el armado lo ve cualquiera que ve el stock.';
create policy armados_pack_insert_gp on comercial.armados_pack
  for insert to authenticated
  with check (core.es_rol('GERENCIA_PRODUCCION') and registrado_por = core.usuario_actual());
comment on policy armados_pack_insert_gp on comercial.armados_pack is
  'D-armado-duo-1: arma Gerencia de Producción, a su nombre. Sin UPDATE ni DELETE.';

select core.adjuntar_auditoria('comercial.pack_componentes');
select core.adjuntar_auditoria('comercial.armados_pack');

create function comercial.armar_pack(p_pack_id uuid, p_deposito_id uuid, p_cantidad integer,
                                     p_observaciones text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid;
  v_pack   text;
  v_motivo text;
  v_hay    numeric;
  c        record;
  a        record;
begin
  if not core.es_rol('GERENCIA_PRODUCCION') then
    raise exception 'Los packs los arma Gerencia de Producción.' using errcode = 'insufficient_privilege';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Cargá cuántos packs se armaron.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from comercial.pack_componentes where pack_id = p_pack_id) then
    raise exception 'Ese producto no tiene componentes de pack cargados.' using errcode = 'check_violation';
  end if;

  select codigo_interno || ' ' || nombre into v_pack from gmp.productos where id = p_pack_id;

  insert into comercial.armados_pack (pack_id, deposito_id, cantidad, observaciones)
  values (p_pack_id, p_deposito_id, p_cantidad, nullif(btrim(coalesce(p_observaciones, '')), ''))
  returning id into v_id;
  v_motivo := format('Armado de %s × %s', p_cantidad, v_pack);

  -- Los lotes los elige esta función (solo vendibles, RN-51): el trigger de
  -- lote no reparte de nuevo.
  perform set_config('comercial.lote_pt_asignado', '1', true);
  for c in select pc.componente_id, pc.cantidad, p.codigo_interno || ' ' || p.nombre as nombre
             from comercial.pack_componentes pc
             join gmp.productos p on p.id = pc.componente_id
            where pc.pack_id = p_pack_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('pt|' || p_deposito_id::text || '|' || c.componente_id::text, 0));
    select coalesce(sum(m.cantidad), 0) into v_hay
      from comercial.movimientos_pt m
     where m.producto_id = c.componente_id and m.deposito_id = p_deposito_id;
    if v_hay < c.cantidad * p_cantidad then
      raise exception 'Falta %: hay % en este depósito y el armado necesita %.',
        c.nombre, trim_scale(greatest(v_hay, 0)), c.cantidad * p_cantidad
        using errcode = 'check_violation';
    end if;
    for a in select * from comercial.asignar_lotes_pt(c.componente_id, p_deposito_id, c.cantidad * p_cantidad, true)
    loop
      insert into comercial.movimientos_pt
        (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id, orden_id)
      values
        (c.componente_id, p_deposito_id, 'SALIDA_AJUSTE', -a.cantidad, v_motivo, 'ARMADO', v_id, a.orden_id);
    end loop;
  end loop;
  perform set_config('comercial.lote_pt_asignado', '', true);

  insert into comercial.movimientos_pt
    (producto_id, deposito_id, tipo, cantidad, motivo, documento_tipo, documento_id)
  values
    (p_pack_id, p_deposito_id, 'ENTRADA_AJUSTE', p_cantidad, v_motivo, 'ARMADO', v_id);

  return v_id;
end;
$$;
comment on function comercial.armar_pack(uuid, uuid, integer, text) is
  'D-armado-duo-1: arma packs en un depósito; salen los componentes (lotes vendibles, el que vence antes primero) y entra el pack.';
revoke execute on function comercial.armar_pack(uuid, uuid, integer, text) from public, anon;
grant execute on function comercial.armar_pack(uuid, uuid, integer, text) to authenticated;

-- DUO01 = 1 PREP 8 ml (377) + 1 PRIMER 8 ml low acid (105).
insert into comercial.pack_componentes (pack_id, componente_id, cantidad)
select pack.id, comp.id, 1
  from gmp.productos pack
  join gmp.productos comp on comp.codigo_interno in ('377', '105')
 where pack.codigo_interno = 'DUO01';

do $$
begin
  if (select count(*) from comercial.pack_componentes pc
        join gmp.productos p on p.id = pc.pack_id where p.codigo_interno = 'DUO01') <> 2 then
    raise exception 'DUO01 no quedó con sus 2 componentes (377 y 105): revisar los códigos.';
  end if;
end;
$$;
