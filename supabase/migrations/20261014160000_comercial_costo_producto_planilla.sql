-- ---------------------------------------------------------------------------
-- Propósito : Costo de producto de la planilla «C.T.» (costo total) de
--             05 INVENTARIO NAIL SHOW FABRICA(4).xlsx como punto de partida
--             del costo de cada producto, editable por Finanzas. Mientras el
--             costo calculado (fórmula + insumos + minutos) esté incompleto,
--             v_costo_producto usa el de la planilla y lo dice.
-- Reglas    : D-38 (Finanzas fija los costos de referencia), R-10 (lo pagado
--             no se reescribe), RN-50 (auditoría). Pedido del codirector
--             técnico, 2026-10-14. Registrado como D-56.
-- Fecha     : 2026-10-14
-- ---------------------------------------------------------------------------
--
-- QUÉ SE CARGA. Hoja C.T.: C.V.D. (costo variable directo: materiales),
-- M.O.D. (mano de obra) y C.V.I. (costo variable indirecto) por unidad, neto.
-- Archivo sha256 95020141f995fcf2…. De 497 renglones no se cargan: 104 con
-- total 0, 10 con código fuera del catálogo y 82 sin C.V.D. (solo mano de obra
-- o indirectos: ese total no es el costo del producto). Quedan 301.
--
-- CÓMO SE CAMBIA. No se edita: Finanzas carga una fila nueva que reemplaza a
-- la anterior (reemplaza_a, con motivo). La vigente es la que nadie reemplazó.
--
-- AUTOR. cargado_por es NOT NULL y una migración no tiene usuario: queda a
-- nombre del codirector técnico, que pidió la carga.

create table comercial.costos_producto_planilla (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references gmp.productos(id),
  cvd           numeric(16,4) check (cvd >= 0),
  mod           numeric(16,4) check (mod >= 0),
  cvi           numeric(16,4) check (cvi >= 0),
  total         numeric(16,4) generated always as (coalesce(cvd, 0) + coalesce(mod, 0) + coalesce(cvi, 0)) stored,
  fuente        text not null check (length(btrim(fuente)) > 0),
  vigente_desde date not null default comercial.hoy(),
  reemplaza_a   uuid unique references comercial.costos_producto_planilla(id),
  motivo        text,
  cargado_por   uuid not null references core.usuarios(id) default core.usuario_actual(),
  cargado_en    timestamptz not null default now(),
  constraint costos_producto_planilla_con_importe
    check (coalesce(cvd, 0) + coalesce(mod, 0) + coalesce(cvi, 0) > 0),
  constraint costos_producto_planilla_reemplazo_con_motivo
    check (reemplaza_a is null or length(btrim(coalesce(motivo, ''))) >= 3)
);

comment on table comercial.costos_producto_planilla is
  'Costo unitario neto de producto tomado de la planilla C.T. (C.V.D. + M.O.D. + C.V.I.), o fijado por Finanzas. '
  'Punto de partida mientras el costo calculado esté incompleto. Append-only: se reemplaza con otra fila (D-56).';

create index costos_producto_planilla_producto_idx on comercial.costos_producto_planilla (producto_id);

-- El reemplazo es del mismo producto.
create or replace function comercial.fn_validar_costo_producto_planilla()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reemplaza_a is not null and not exists (
    select 1 from comercial.costos_producto_planilla
     where id = new.reemplaza_a and producto_id = new.producto_id
  ) then
    raise exception 'El costo que se reemplaza es de otro producto.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_validar_costo_producto_planilla
  before insert on comercial.costos_producto_planilla
  for each row execute function comercial.fn_validar_costo_producto_planilla();

alter table comercial.costos_producto_planilla enable row level security;
alter table comercial.costos_producto_planilla force  row level security;

-- Sin UPDATE ni DELETE: se reemplaza con otra fila.
grant select, insert on comercial.costos_producto_planilla to authenticated;

create policy costos_producto_planilla_select_costos on comercial.costos_producto_planilla
  for select to authenticated
  using (core.es_rol('FINANZAS', 'GERENCIA', 'ADMINISTRACION', 'GERENCIA_PRODUCCION'));
comment on policy costos_producto_planilla_select_costos on comercial.costos_producto_planilla is 'D-38.';

create policy costos_producto_planilla_insert_finanzas on comercial.costos_producto_planilla
  for insert to authenticated
  with check (core.es_rol('FINANZAS') and cargado_por = core.usuario_actual());
comment on policy costos_producto_planilla_insert_finanzas on comercial.costos_producto_planilla is
  'D-38: el costo de referencia lo fija Finanzas.';

select core.adjuntar_auditoria('comercial.costos_producto_planilla');

-- Vigente por producto: la fila que ninguna otra reemplazó.
create view comercial.v_costo_producto_planilla
with (security_invoker = true) as
select c.*
  from comercial.costos_producto_planilla c
 where not exists (select 1 from comercial.costos_producto_planilla r where r.reemplaza_a = c.id);

grant select on comercial.v_costo_producto_planilla to authenticated;

-- Mismas columnas que en 20261009120300, más la planilla al final.
create or replace view comercial.v_costo_producto
with (security_invoker = true) as
select p.id as producto_id, p.codigo_interno, p.nombre, p.origen, p.contenido_neto, p.unidad_contenido,
       f.estado as formula_estado, f.version as formula_version,
       sum(c.subtotal) filter (where c.tipo = 'GRANEL') as granel,
       sum(c.subtotal) filter (where c.tipo = 'ACONDICIONAMIENTO') as acondicionamiento,
       sum(c.subtotal) filter (where c.tipo = 'MANO_DE_OBRA') as mano_de_obra,
       sum(c.subtotal) as costo_unitario,
       count(*) filter (where c.falta is not null) as faltantes,
       count(*) filter (where c.falta is null) as componentes_costeados,
       pl.id as planilla_id, pl.total as costo_planilla, pl.cvd as planilla_cvd, pl.mod as planilla_mod,
       pl.cvi as planilla_cvi, pl.fuente as planilla_fuente,
       case
         when count(*) filter (where c.falta is not null) = 0 and sum(c.subtotal) > 0 then sum(c.subtotal)
         else pl.total
       end as costo_vigente,
       case
         when count(*) filter (where c.falta is not null) = 0 and sum(c.subtotal) > 0 then 'CALCULADO'
         when pl.id is not null then 'PLANILLA'
       end as fuente_costo
  from comercial.costos_productos() c
  join gmp.productos p on p.id = c.producto_id
  left join lateral comercial.formula_para_costo(p.id) f on true
  left join comercial.v_costo_producto_planilla pl on pl.producto_id = p.id
 group by p.id, f.estado, f.version, pl.id, pl.total, pl.cvd, pl.mod, pl.cvi, pl.fuente;

comment on view comercial.v_costo_producto is
  'Costo unitario por producto activo. faltantes > 0 = costo calculado incompleto. costo_vigente: el calculado si '
  'está completo; si no, el de la planilla C.T. o el que fijó Finanzas (fuente_costo = PLANILLA, D-56).';

do $$
declare
  v_autor uuid;
begin
  select id into v_autor from core.usuarios where email = 'salta.agustin@gmail.com';
  -- Base reconstruida desde cero: no hay usuarios, no se carga nada.
  if v_autor is null then
    return;
  end if;
  insert into comercial.costos_producto_planilla (producto_id, cvd, mod, cvi, fuente, cargado_por)
  select p.id, v.cvd, v.mod, v.cvi, 'Planilla C.T., 05 INVENTARIO NAIL SHOW FABRICA(4).xlsx', v_autor
    from (values
      ('80', 1089.6397, 360.7504, 146.9724),
      ('81', 1089.6397, 360.7504, 146.9724),
      ('82', 1089.6397, 360.7504, 146.9724),
      ('83', 1089.6397, 360.7504, 146.9724),
      ('84', 1089.6397, 360.7504, 146.9724),
      ('85', 1089.6397, 360.7504, 146.9724),
      ('86', 1089.6397, 360.7504, 146.9724),
      ('87', 1089.6397, 360.7504, 146.9724),
      ('88', 1089.6397, 360.7504, 146.9724),
      ('89', 1089.6397, 360.7504, 146.9724),
      ('90', 1089.6397, 360.7504, 146.9724),
      ('91', 1089.6397, 360.7504, 146.9724),
      ('92', 1089.6397, 360.7504, 146.9724),
      ('80PACK', 6561.7383, 2813.8528, 1146.3845),
      ('81PACK', 6561.7383, 2813.8528, 1146.3845),
      ('82PACK', 13099.5766, 4978.355, 2028.2187),
      ('83PACK', 13099.5766, 4978.355, 2028.2187),
      ('84PACK', 6561.7383, 2813.8528, 1146.3845),
      ('85PACK', 13099.5766, 4978.355, 2028.2187),
      ('86PACK', 13099.5766, 4978.355, 2028.2187),
      ('87PACK', 13099.5766, 4978.355, 2028.2187),
      ('88PACK', 6561.7383, 2813.8528, 1146.3845),
      ('89PACK', 6561.7383, 2813.8528, 1146.3845),
      ('90PACK', 6561.7383, 2813.8528, 1146.3845),
      ('91PACK', 6561.7383, 2813.8528, 1146.3845),
      ('92PACK', 6561.7383, 2813.8528, 1146.3845),
      ('93', 2917.4116, 393.2179, 160.1999),
      ('94', 2917.4116, 393.2179, 160.1999),
      ('95', 2917.4116, 393.2179, 160.1999),
      ('96', 2917.4116, 393.2179, 160.1999),
      ('97', 2917.4116, 393.2179, 160.1999),
      ('98', 2917.4116, 393.2179, 160.1999),
      ('99', 2917.4116, 393.2179, 160.1999),
      ('100', 2917.4116, 393.2179, 160.1999),
      ('93PACK', 23369.2927, 3795.0938, 1546.1493),
      ('94PACK', 23369.2927, 3795.0938, 1546.1493),
      ('95PACK', 35038.939, 5367.9654, 2186.9489),
      ('96PACK', 35038.939, 5367.9654, 2186.9489),
      ('97PACK', 23369.2927, 3795.0938, 1546.1493),
      ('98PACK', 35038.939, 5367.9654, 2186.9489),
      ('99PACK', 35038.939, 5367.9654, 2186.9489),
      ('100PACK', 35038.939, 5367.9654, 2186.9489),
      ('101', 3179.18, 389.6104, 158.7302),
      ('102', 7442.38, 541.1255, 220.4586),
      ('103', 14587.28, 591.6306, 241.0347),
      ('105', 2199.1432, 180.3752, null),
      ('107', 5346.715, null, 313.4212),
      ('108', 5346.715, null, 313.4212),
      ('109', 5346.715, null, 313.4212),
      ('110', 5346.715, null, 313.4212),
      ('111', 3169.4332, 1089.4661, 443.8566),
      ('112', 3169.4332, 1089.4661, 443.8566),
      ('113', 3169.4332, 1089.4661, 443.8566),
      ('114', 3169.4332, 1089.4661, 443.8566),
      ('115', 3169.4332, 1089.4661, 443.8566),
      ('116', 3169.4332, 1089.4661, 443.8566),
      ('117', 3169.4332, 1089.4661, 443.8566),
      ('118', 3169.4332, 1089.4661, 443.8566),
      ('119', 3169.4332, 1089.4661, 443.8566),
      ('278', 3169.4332, 1089.4661, 443.8566),
      ('279', 3169.4332, 1089.4661, 443.8566),
      ('299', 3169.4332, 1089.4661, 443.8566),
      ('327', 3169.4332, 1320.3463, 537.9189),
      ('120', 450.945, 447.3304, 182.2457),
      ('121', 288.289, 461.7605, 188.1246),
      ('137', 472.4175, 447.3304, 182.2457),
      ('139', 4064.1047, 11320.3463, 4611.9929),
      ('140', 8023.3265, 23549.7835, 9594.3563),
      ('142', 522.8387, 245.3102, 99.9412),
      ('143', 522.8387, 245.3102, 99.9412),
      ('144', 522.8387, 245.3102, 99.9412),
      ('145', 522.8387, 245.3102, 99.9412),
      ('146', 522.8387, 245.3102, 99.9412),
      ('147', 522.8387, 245.3102, 99.9412),
      ('148', 522.8387, 245.3102, 99.9412),
      ('149', 522.8387, 245.3102, 99.9412),
      ('150', 522.8387, 245.3102, 99.9412),
      ('151', 522.8387, 245.3102, 99.9412),
      ('152', 522.8387, 245.3102, 99.9412),
      ('153', 522.8387, 245.3102, 99.9412),
      ('154', 522.8387, 245.3102, 99.9412),
      ('155', 522.8387, 245.3102, 99.9412),
      ('156', 522.8387, 245.3102, 99.9412),
      ('157', 522.8387, 245.3102, 99.9412),
      ('158', 522.8387, 245.3102, 99.9412),
      ('159', 522.8387, 245.3102, 99.9412),
      ('160', 522.8387, 245.3102, 99.9412),
      ('161', 522.8387, 245.3102, 99.9412),
      ('162', 522.8387, 245.3102, 99.9412),
      ('163', 522.8387, 245.3102, 99.9412),
      ('164', 522.8387, 245.3102, 99.9412),
      ('165', 522.8387, 245.3102, 99.9412),
      ('166', 533.3586, 245.3102, 99.9412),
      ('166PACK', 6400.3029, 3737.3737, 1522.6337),
      ('167', 354.3586, 245.3102, 99.9412),
      ('168', 354.3586, 245.3102, 99.9412),
      ('198', 14410, 4329.0043, 1763.6684),
      ('199', 1710, 3463.2035, 1410.9347),
      ('245', 522.8387, 245.3102, 99.9412),
      ('246', 522.8387, 245.3102, 99.9412),
      ('247', 522.8387, 656.5657, 267.4897),
      ('247PACK', 2313.0909, 8528.1385, 3474.4268),
      ('249', 178.445, null, null),
      ('249PACK', 3598.9, null, 313.4212),
      ('251', 1022.5855, 245.3102, 99.9412),
      ('251PACK', 15234.09, 3593.0736, 1463.8448),
      ('252', 241.3217, 367.9654, 149.9118),
      ('252PACK', 2925.8605, 5064.9351, 2063.4921),
      ('253', 522.8387, 245.3102, 99.9412),
      ('254', 522.8387, 245.3102, 99.9412),
      ('255', 522.8387, 245.3102, 99.9412),
      ('259', 699.2515, 627.7056, 255.7319),
      ('260', 699.2515, 627.7056, 255.7319),
      ('261', 699.2515, 627.7056, 255.7319),
      ('262', 699.2515, 627.7056, 255.7319),
      ('265', 699.2515, 627.7056, 255.7319),
      ('266', 699.2515, 627.7056, 255.7319),
      ('267', 699.2515, 627.7056, 255.7319),
      ('268', 699.2515, 627.7056, 255.7319),
      ('269', 699.2515, 627.7056, 255.7319),
      ('270', 699.2515, 627.7056, 255.7319),
      ('271', 699.2515, 627.7056, 255.7319),
      ('272', 699.2515, 627.7056, 255.7319),
      ('273', 699.2515, 627.7056, 255.7319),
      ('274', 699.2515, 627.7056, 255.7319),
      ('275', 699.2515, 627.7056, 255.7319),
      ('276', 699.2515, 627.7056, 255.7319),
      ('277', 699.2515, 627.7056, 255.7319),
      ('336', 699.2515, 627.7056, 255.7319),
      ('337', 699.2515, 627.7056, 255.7319),
      ('338', 699.2515, 627.7056, 255.7319),
      ('287', 354.3586, 245.3102, 99.9412),
      ('288', 354.3586, 245.3102, 99.9412),
      ('289', 354.3586, 245.3102, 99.9412),
      ('290', 354.3586, 245.3102, 99.9412),
      ('291', 354.3586, 245.3102, 99.9412),
      ('292', 354.3586, 245.3102, 99.9412),
      ('293', 354.3586, 245.3102, 99.9412),
      ('294', 354.3586, 245.3102, 99.9412),
      ('295', 354.3586, 245.3102, 99.9412),
      ('296', 354.3586, 245.3102, 99.9412),
      ('297', 354.3586, 245.3102, 99.9412),
      ('632PACK', 21681.673, 22294.3723, 9082.8924),
      ('633PACK', 16006.1357, 13636.3636, 5555.5556),
      ('300', 288.289, 245.3102, 99.9412),
      ('301', 288.289, 245.3102, 99.9412),
      ('302', 288.289, 245.3102, 99.9412),
      ('303', 288.289, 245.3102, 99.9412),
      ('304', 288.289, 245.3102, 99.9412),
      ('305', 288.289, 245.3102, 99.9412),
      ('306', 288.289, 245.3102, 99.9412),
      ('307', 288.289, 245.3102, 99.9412),
      ('308', 288.289, 245.3102, 99.9412),
      ('309', 288.289, 245.3102, 99.9412),
      ('310', 288.289, 245.3102, 99.9412),
      ('311', 288.289, 245.3102, 99.9412),
      ('312', 288.289, 245.3102, 99.9412),
      ('313', 288.289, 245.3102, 99.9412),
      ('314', 288.289, 245.3102, 99.9412),
      ('315', 288.289, 245.3102, 99.9412),
      ('316', 288.289, 245.3102, 99.9412),
      ('317', 288.289, 245.3102, 99.9412),
      ('318', 288.289, 245.3102, 99.9412),
      ('319', 288.289, 245.3102, 99.9412),
      ('321', 1513, 1406.9264, 313.4212),
      ('328', 522.8387, 245.3102, 99.9412),
      ('329', 522.8387, 245.3102, 99.9412),
      ('330', 522.8387, 245.3102, 99.9412),
      ('331', 288.289, 245.3102, 99.9412),
      ('332', 288.289, 245.3102, 99.9412),
      ('333', 288.289, 245.3102, 99.9412),
      ('334', 288.289, 245.3102, 99.9412),
      ('340', 1254.9733, 620.4906, 252.7925),
      ('364', 2435.8004, 526.6955, null),
      ('365', 2435.8004, 526.6955, null),
      ('366', 2435.8004, 526.6955, null),
      ('367', 1528.091, 389.6104, null),
      ('368', 1528.091, 389.6104, null),
      ('369', 1528.091, 389.6104, null),
      ('370', 2118.7254, 526.6955, null),
      ('371', 2118.7254, 526.6955, null),
      ('372', 2118.7254, 526.6955, null),
      ('373', 987.091, 389.6104, null),
      ('374', 998.301, 389.6104, null),
      ('375', 987.209, 389.6104, null),
      ('377', 530.2, 165.9452, null),
      ('378', 1987.6336, null, null),
      ('379', 1987.6336, null, null),
      ('380', 1987.6336, null, null),
      ('381', 1018.2517, null, null),
      ('382', 1018.2517, null, null),
      ('383', 1018.2517, null, null),
      ('384', 569.66, 389.6104, 158.7302),
      ('385', 977.6, 541.1255, 220.4586),
      ('386', 3338.5, 613.2756, 249.853),
      ('387', 2251.6732, 144.3001, null),
      ('391', 1036.2156, 685.4257, 279.2475),
      ('392', 740.6603, 613.2756, 249.853),
      ('393', 1036.2156, 685.4257, 279.2475),
      ('394', 740.6603, 613.2756, 249.853),
      ('395', 1036.2156, 685.4257, 279.2475),
      ('396', 740.6603, 613.2756, 249.853),
      ('501', 41955.0872, 38441.5584, 15661.3757),
      ('NST-516', 1844.7084, 3860.0289, 1572.6044),
      ('NST-517', 1844.7084, 3860.0289, 1572.6044),
      ('NST-511', 1844.7084, 3860.0289, 1572.6044),
      ('NST-510', 1844.7084, 3860.0289, 1572.6044),
      ('NST-519', 1844.7084, 3860.0289, 1572.6044),
      ('NST-520', 1844.7084, 3860.0289, null),
      ('NST-521', 1844.7084, 3860.0289, 1572.6044),
      ('NST-522', 1844.7084, 3860.0289, 1572.6044),
      ('NST-523', 1844.7084, 3860.0289, 1572.6044),
      ('NST-524', 1844.7084, 3860.0289, 1572.6044),
      ('NST-525', 1844.7084, 3860.0289, 1572.6044),
      ('NST-526', 1844.7084, 3860.0289, 1572.6044),
      ('NST-548', 1724.4014, 3860.0289, 1572.6044),
      ('600', 5613.8968, 4632.0346, 1887.1252),
      ('600PACK', 16866.6905, 13679.6537, 5573.1922),
      ('601', 289.8975, 331.8903, 135.2146),
      ('602', 289.8975, 331.8903, 135.2146),
      ('603', 289.8975, 331.8903, 135.2146),
      ('604', 289.8975, 331.8903, 135.2146),
      ('605', 289.8975, 331.8903, 135.2146),
      ('606', 289.8975, 331.8903, 135.2146),
      ('607', 289.8975, 331.8903, 135.2146),
      ('608', 289.8975, 331.8903, 135.2146),
      ('609', 289.8975, 331.8903, 135.2146),
      ('610', 289.8975, 331.8903, 135.2146),
      ('611', 289.8975, 331.8903, 135.2146),
      ('612', 289.8975, 331.8903, 135.2146),
      ('613', 2313.0909, 2943.7229, 1199.2945),
      ('614', 1619.8658, 1717.1717, 699.5885),
      ('DUO01', 2734.8432, 476.1905, 194.0035),
      ('DUO02', 2787.3732, 476.1905, 194.0035),
      ('POL01', 450.945, 447.3304, 313.4212),
      ('POL02', 450.945, 447.3304, 313.4212),
      ('POL03', 450.945, 447.3304, 313.4212),
      ('POL04', 450.945, 447.3304, 313.4212),
      ('POL05', 450.945, 447.3304, 313.4212),
      ('POL06', 450.945, 447.3304, 313.4212),
      ('POL07', 450.945, 447.3304, 313.4212),
      ('POL08', 450.945, 447.3304, 313.4212),
      ('POL09', 450.945, 447.3304, 313.4212),
      ('POL10', 450.945, 447.3304, 313.4212),
      ('POL11', 450.945, 447.3304, 313.4212),
      ('POL12', 450.945, 447.3304, 313.4212),
      ('POL13', 450.945, 447.3304, 313.4212),
      ('POL14', 450.945, 447.3304, 313.4212),
      ('POL15', 450.945, 447.3304, 313.4212),
      ('POL16', 450.945, 447.3304, 313.4212),
      ('POL17', 450.945, 447.3304, 313.4212),
      ('POL18', 450.945, 447.3304, 313.4212),
      ('POL19', 450.945, 447.3304, 313.4212),
      ('POL20', 450.945, 447.3304, 313.4212),
      ('POL21', 450.945, 447.3304, 313.4212),
      ('POL22', 450.945, 447.3304, 313.4212),
      ('POL23', 450.945, 447.3304, 313.4212),
      ('POL24', 450.945, 447.3304, 313.4212),
      ('POL25', 450.945, 447.3304, 313.4212),
      ('POL26', 450.945, 447.3304, 313.4212),
      ('POL27', 450.945, 447.3304, 313.4212),
      ('POL28', 450.945, 447.3304, 313.4212),
      ('POL29', 450.945, 447.3304, 313.4212),
      ('POL30', 450.945, 447.3304, 313.4212),
      ('POL31', 450.945, 447.3304, 313.4212),
      ('POL32', 450.945, 447.3304, 313.4212),
      ('POL33', 450.945, 447.3304, 313.4212),
      ('POL34', 450.945, 447.3304, 313.4212),
      ('POL35', 450.945, 447.3304, 313.4212),
      ('POL36', 450.945, 447.3304, 313.4212),
      ('POL37', 450.945, 447.3304, 313.4212),
      ('POL38', 450.945, 447.3304, 313.4212),
      ('POL39', 450.945, 447.3304, 313.4212),
      ('POL40', 450.945, 447.3304, 313.4212),
      ('POL41', 450.945, 447.3304, 313.4212),
      ('POL42', 450.945, 447.3304, 313.4212),
      ('POL43', 450.945, 447.3304, 313.4212),
      ('POL44', 450.945, 447.3304, 313.4212),
      ('POL45', 450.945, 447.3304, 313.4212),
      ('POL46', 450.945, 447.3304, 313.4212),
      ('POL47', 450.945, 447.3304, 313.4212),
      ('POL48', 450.945, 447.3304, 313.4212),
      ('POL49', 450.945, 447.3304, 313.4212),
      ('POL50', 450.945, 447.3304, 313.4212),
      ('POL51', 450.945, 447.3304, 313.4212),
      ('POL52', 450.945, 447.3304, 313.4212),
      ('POL53', 450.945, 447.3304, 313.4212),
      ('POL54', 450.945, 447.3304, 313.4212),
      ('POL55', 450.945, 447.3304, 313.4212),
      ('POL56', 450.945, 447.3304, 313.4212),
      ('POL57', 450.945, 447.3304, 313.4212),
      ('POL58', 450.945, 447.3304, 313.4212),
      ('POL59', 450.945, 447.3304, 313.4212),
      ('POL60', 450.945, 447.3304, 313.4212),
      ('POL61', 450.945, 447.3304, 313.4212),
      ('POL62', 450.945, 447.3304, 313.4212),
      ('POL63', 450.945, 447.3304, 313.4212),
      ('POL64', 450.945, 447.3304, 313.4212),
      ('POL65', 450.945, 447.3304, 313.4212),
      ('POL66', 450.945, 447.3304, 313.4212),
      ('192', 1043.3072, 389.6104, 313.4212)
    ) as v(codigo, cvd, mod, cvi)
    join gmp.productos p on upper(btrim(p.codigo_interno)) = upper(v.codigo);
end;
$$;
