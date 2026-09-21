-- ---------------------------------------------------------------------------
-- Propósito : Tipifica el motivo de los ajustes de stock y marca los que
--             exigen investigación. El libro de movimientos ya existe
--             (20260910170000): esto no lo reemplaza, lo clasifica.
-- Reglas    : PG.60.18 (gestión de no conformidades y CAPA), RN-54 (el
--             movimiento no se edita), §3.3 fila «Ajustar stock por
--             diferencia de inventario».
-- Fecha     : 2026-09-17
-- ---------------------------------------------------------------------------
--
-- POR QUÉ UN ENUM ADEMÁS DEL TEXTO LIBRE.
-- `motivo` (texto, mínimo 10 caracteres) queda como está: es la explicación,
-- y ninguna lista cerrada la reemplaza. El enum contesta otra pregunta: cuánto
-- se pierde por rotura contra cuánto por vencimiento. Eso no se puede contar
-- sobre texto libre sin adivinar, y es justo lo que una revisión de calidad
-- necesita mirar.
--
-- LAS FILAS VIEJAS NO TIENEN MOTIVO TIPIFICADO Y ASÍ QUEDAN.
-- El CHECK se declara `not valid`: obliga de acá en adelante y no miente sobre
-- el pasado. Poner un motivo inventado en los movimientos ya registrados sería
-- exactamente la clase de dato falso que el sistema existe para impedir.

create type comercial.motivo_ajuste_enum as enum (
  'ROTURA',
  'DERRAME',
  'VENCIMIENTO',
  'MERMA_DE_PROCESO',
  'DIFERENCIA_DE_INVENTARIO',
  'ERROR_DE_REGISTRO',
  'ROBO_O_EXTRAVIO',
  'MUESTRA_DE_ARCHIVO',
  'DEVOLUCION_A_PROVEEDOR'
);

comment on type comercial.motivo_ajuste_enum is
  'Clasificación del ajuste. El texto de `motivo` explica el caso; esto lo agrupa para poder analizarlo.';

alter table comercial.movimientos_stock
  add column motivo_tipo            comercial.motivo_ajuste_enum,
  add column requiere_investigacion boolean not null default false,
  add column investigacion_id       uuid;

comment on column comercial.movimientos_stock.motivo_tipo is
  'Obligatorio en los tipos manuales (ajustes y descarte). Nulo en los movimientos que genera el circuito.';
comment on column comercial.movimientos_stock.requiere_investigacion is
  'Lo pone el sistema, no el usuario: el ajuste superó el umbral del artículo. Dispara el aviso a Dirección Técnica.';
comment on column comercial.movimientos_stock.investigacion_id is
  'Referencia a la no conformidad abierta (PG.60.18). Sin FK: el módulo de no conformidades todavía no existe '
  '(docs/ESTADO.md, pendiente #5). Se completa cuando se construya.';

-- El motivo tipificado se exige solo donde el usuario elige: los movimientos
-- que nacen del circuito (recepción, producción, venta) no tienen un motivo
-- que tipificar, y pedírselo sería inventar una categoría por cada uno.
alter table comercial.movimientos_stock
  add constraint movimientos_motivo_tipo_en_manuales check (
    tipo not in ('ENTRADA_AJUSTE', 'SALIDA_AJUSTE', 'SALIDA_DESCARTE')
    or motivo_tipo is not null
  ) not valid;

-- ===========================================================================
-- Umbral por artículo
-- ===========================================================================
--
-- Dos umbrales, y cualquiera de los dos alcanza para marcar. El relativo cubre
-- el lote chico donde 2 kg es todo; el absoluto cubre el lote grande donde el
-- 5 % ya es una cantidad que hay que explicar. Un solo umbral deja ciego uno
-- de los dos extremos.

alter table comercial.articulos
  add column umbral_ajuste_relativo numeric(5,4) not null default 0.05
    check (umbral_ajuste_relativo > 0 and umbral_ajuste_relativo <= 1),
  add column umbral_ajuste_absoluto numeric(14,4)
    check (umbral_ajuste_absoluto is null or umbral_ajuste_absoluto > 0);

comment on column comercial.articulos.umbral_ajuste_relativo is
  'Fracción del saldo de la posición por encima de la cual un ajuste negativo se marca para investigación. Por defecto 5 %.';
comment on column comercial.articulos.umbral_ajuste_absoluto is
  'Cantidad absoluta con el mismo efecto. Nulo = sin umbral absoluto. Se evalúa en O (cualquiera de los dos marca).';

-- ===========================================================================
-- Marcado automático
-- ===========================================================================
--
-- Va en BEFORE INSERT y después del trigger de validación existente, por orden
-- alfabético del nombre (`trg_validar_movimiento` < `trg_zz_marcar…`). Importa:
-- si el movimiento va a ser rechazado por saldo, no tiene sentido evaluarlo.

create or replace function comercial.fn_marcar_investigacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo     numeric;
  v_relativo  numeric;
  v_absoluto  numeric;
  v_magnitud  numeric := abs(new.cantidad);
begin
  if new.tipo not in ('SALIDA_AJUSTE', 'SALIDA_DESCARTE') then
    return new;
  end if;

  -- Los dos motivos que suelen tapar un problema de fondo se investigan
  -- siempre, sin importar la magnitud. Un extravío de 100 g no es chico: es
  -- un extravío.
  if new.motivo_tipo in ('ROBO_O_EXTRAVIO', 'ERROR_DE_REGISTRO') then
    new.requiere_investigacion := true;
    return new;
  end if;

  select umbral_ajuste_relativo, umbral_ajuste_absoluto
    into v_relativo, v_absoluto
    from comercial.articulos
   where id = new.articulo_id;

  select coalesce(sum(cantidad), 0) into v_saldo
    from comercial.movimientos_stock
   where articulo_id    = new.articulo_id
     and lote_insumo_id = new.lote_insumo_id
     and deposito_id    = new.deposito_id;

  if (v_saldo > 0 and v_magnitud >= v_saldo * v_relativo)
     or (v_absoluto is not null and v_magnitud >= v_absoluto) then
    new.requiere_investigacion := true;
  end if;

  return new;
end;
$$;

create trigger trg_zz_marcar_investigacion
  before insert on comercial.movimientos_stock
  for each row execute function comercial.fn_marcar_investigacion();

-- ===========================================================================
-- Vista de trabajo de Dirección Técnica
-- ===========================================================================
--
-- CORRECCIÓN CONTRA EL ESQUEMA REAL: la versión original de este archivo
-- filtraba con `and not m.anulado`. `comercial.movimientos_stock` no tiene
-- ninguna columna `anulado` — es un campo derivado que solo existe en la
-- vista `comercial.v_kardex` (`exists (...) as anulado`, migración
-- …170000 del 2026-09-10), calculado ahí porque RN-54 prohíbe guardarlo en el
-- movimiento original (marcarlo ahí sería editarlo). Acá se consulta
-- `comercial.movimientos_stock` directo, así que hace falta la misma
-- subconsulta que usa `v_kardex`, no una columna que no existe.

create view comercial.v_ajustes_a_investigar
with (security_invoker = true) as
select
  m.id,
  m.ocurrido_en,
  m.tipo,
  m.motivo_tipo,
  m.motivo,
  m.cantidad,
  m.unidad,
  m.investigacion_id,
  l.numero_registro_interno as lote,
  i.codigo_interno,
  i.nombre                  as insumo,
  d.numero                  as deposito,
  u.nombre_completo         as registro
from comercial.movimientos_stock m
join gmp.lotes_insumo      l on l.id = m.lote_insumo_id
join gmp.insumos_catalogo  i on i.id = l.insumo_id
join gmp.depositos         d on d.id = m.deposito_id
join core.usuarios         u on u.id = m.registrado_por
where m.requiere_investigacion
  and m.investigacion_id is null
  and not exists (
    select 1 from comercial.movimientos_stock x
     where x.anula_a_movimiento_id = m.id
  );

comment on view comercial.v_ajustes_a_investigar is
  'Ajustes marcados que todavía no tienen no conformidad abierta (PG.60.18). Es una bandeja de trabajo, no un informe. '
  '"Anulado" se resuelve por EXISTS contra anula_a_movimiento_id: no hay columna anulado en movimientos_stock (RN-54).';

grant select on comercial.v_ajustes_a_investigar to authenticated;
