-- ---------------------------------------------------------------------------
-- Propósito : Insumos etiquetados: cuántos envases, tapas, cajas o bolsas de
--             un insumo ya tienen puesta la etiqueta de un producto. Se cargan
--             y se corrigen desde Stock › Etiquetados; cada cambio es un
--             conteo nuevo y el vigente es el último.
-- Reglas    : RN-50 (auditoría de toda escritura), CLAUDE.md §3.1 (lo
--             registrado no se modifica: se corrige con un registro nuevo),
--             §3.3 «Ajustar stock por diferencia de inventario» (DT, ADM, GP).
--             Pedido del 2026-10-30 (D-insumos-etiquetados-1).
-- Fecha     : 2026-10-30
-- ---------------------------------------------------------------------------
--
-- QUÉ ES Y QUÉ NO.
-- Es un desglose de lo que ya está en stock: de los 5122 envases de polímero
-- 14 g contados, 218 llevan la etiqueta de Beige. El saldo del insumo no
-- cambia por cargar acá; lo cambian el conteo y los movimientos de siempre.
--
-- No es comercial.etiquetados (20261021120000): aquél es un producto con
-- envase y etiqueta armados en planta, que descuenta los dos y que consumen
-- tandas y pedidos. Lo de acá llegó etiquetado de antes, puede ser una tapa o
-- una bolsa y no una pareja envase+etiqueta, y por ahora nadie lo descuenta
-- solo: se corrige a mano, con un conteo nuevo.
--
-- «TOTALMENTE MODIFICABLE», SIN EDITAR.
-- Cambiar la cantidad, pasarla a otro producto o sacarla son siempre un
-- renglón nuevo (sacar = cantidad 0). El vigente de cada insumo y producto es
-- el último; los anteriores quedan como historial, con autor y momento.

create table comercial.insumos_etiquetados (
  id             uuid primary key default gen_random_uuid(),
  -- Desempata dos renglones del mismo momento: el último es el vigente.
  orden          bigint generated always as identity,
  insumo_id      uuid not null references gmp.insumos_catalogo(id),
  producto_id    uuid not null references gmp.productos(id),
  cantidad       integer not null check (cantidad >= 0),
  observacion    text,
  registrado_por uuid not null references core.usuarios(id) default core.usuario_actual(),
  registrado_en  timestamptz not null default now()
);

comment on table comercial.insumos_etiquetados is
  'Conteos de insumos ya etiquetados para un producto. El vigente por insumo y producto es el último (orden); '
  'cantidad 0 = ya no hay. No se editan ni se borran: se corrige con otro conteo (D-insumos-etiquetados-1).';

create index insumos_etiquetados_par_idx
  on comercial.insumos_etiquetados (insumo_id, producto_id, orden desc);
create index insumos_etiquetados_producto_idx on comercial.insumos_etiquetados (producto_id);
create index insumos_etiquetados_registrado_por_idx on comercial.insumos_etiquetados (registrado_por);

-- Mismo mensaje que el conteo de inventario: lo que estuvo mal se recuenta.
create trigger trg_insumo_etiquetado_inmutable
  before update or delete on comercial.insumos_etiquetados
  for each row execute function comercial.fn_conteo_inmutable();

alter table comercial.insumos_etiquetados enable row level security;
alter table comercial.insumos_etiquetados force  row level security;

grant select, insert on comercial.insumos_etiquetados to authenticated;

create policy insumos_etiquetados_select_authenticated on comercial.insumos_etiquetados
  for select to authenticated using (core.rol() is not null);
comment on policy insumos_etiquetados_select_authenticated on comercial.insumos_etiquetados is
  '§3.3: consulta de registros, habilitada para todos los roles.';

create policy insumos_etiquetados_insert_stock on comercial.insumos_etiquetados
  for insert to authenticated
  with check (core.es_rol('DIRECCION_TECNICA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION')
              and registrado_por = core.usuario_actual());
comment on policy insumos_etiquetados_insert_stock on comercial.insumos_etiquetados is
  '§3.3 «Ajustar stock por diferencia de inventario»: DT, ADM y GP, a su nombre, como el conteo. Sin UPDATE ni DELETE.';

select core.adjuntar_auditoria('comercial.insumos_etiquetados');

-- Lo vigente: el último conteo de cada insumo y producto, si no es cero.
create view comercial.v_insumos_etiquetados with (security_invoker = true) as
select v.id, v.insumo_id, i.codigo_interno as insumo_codigo, i.nombre as insumo_nombre,
       v.producto_id, p.codigo_interno as producto_codigo, p.nombre as producto_nombre,
       v.cantidad, v.observacion, v.registrado_en, n.nombre_completo as registrado_por_nombre
  from (select distinct on (e.insumo_id, e.producto_id) e.*
          from comercial.insumos_etiquetados e
         order by e.insumo_id, e.producto_id, e.orden desc) v
  join gmp.insumos_catalogo i on i.id = v.insumo_id
  join gmp.productos p on p.id = v.producto_id
  left join core.v_nomina n on n.id = v.registrado_por
 where v.cantidad > 0;

comment on view comercial.v_insumos_etiquetados is
  'Insumos etiquetados vigentes por producto (último conteo distinto de cero). D-insumos-etiquetados-1.';

grant select on comercial.v_insumos_etiquetados to authenticated;
