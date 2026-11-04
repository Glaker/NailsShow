-- ---------------------------------------------------------------------------
-- Propósito : Alta y conteo de las 48 etiquetas de la planilla
--             «Stock_etiquetas_Nail_Show.xlsx» que tenían cantidad y no
--             estaban en el catálogo. Completa 20261104150000.
-- Reglas    : RN-50, RN-54, §3.3 «Ajustar stock por diferencia de inventario».
-- Fecha     : 2026-11-04
-- ---------------------------------------------------------------------------
--
-- Pedido del codirector técnico. Etiqueta en unidades, nombre de la planilla
-- sin el prefijo de plancha («Px204»); las fresas llevan su número porque la
-- planilla les da a todas el mismo nombre. Lote de apertura vacío y conteo con
-- comercial.registrar_conteo, igual que 20261104150000 y a nombre de la misma
-- persona. Donde el código ya exista no se da de alta de nuevo.

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  v_obs       constant text := 'Inventario físico de etiquetas (Stock_etiquetas_Nail_Show.xlsx), 2026-11-04';
  r           record;
begin
  select id into v_dt
    from core.usuarios
   where email = 'salta.agustin@gmail.com' and rol = 'DIRECCION_TECNICA' and activo;
  if v_dt is null then
    raise exception 'No está activa la cuenta de Dirección Técnica suplente (salta.agustin@gmail.com), a cuyo nombre va la carga.';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('usuario_id', v_dt::text, 'rol', 'DIRECCION_TECNICA',
                      'roles', json_build_array('DIRECCION_TECNICA'))::text,
    true
  );

  select id into v_migracion from gmp.migracion_apertura order by ejecutada_en limit 1;
  if v_migracion is null then
    raise exception 'No hay carga de saldo de apertura: el conteo no tiene lote donde asentarse.';
  end if;

  create temp table carga_etiquetas_nuevas on commit drop as
  select * from (values
      ('161ETT', 'ETIQUETA TAPA BORDE PIGMENTO DORADO', 2121),
      ('245ET', 'ETIQUETA PIGMENTO XXVIII VIOLETA FLUO', 901),
      ('246ET', 'ETIQUETA PIGMENTO XXIX CELESTE FLUO', 1104),
      ('251ET', 'ETIQUETA GLITTER FLAKES', 0),
      ('253ET', 'ETIQUETA PIGMENTO AURORA COBRE', 226),
      ('254ET', 'ETIQUETA PIGMENTO AURORA AZUL', 211),
      ('255ET', 'ETIQUETA PIGMENTO AURORA ROSE', 112),
      ('280ET', 'ETIQUETA SUGAR REFLECTIVO BEIGE', 788),
      ('281ET', 'ETIQUETA SUGAR REFLECTIVO PLATA', 788),
      ('282ET', 'ETIQUETA SUGAR REFLECTIVO NEGRO', 788),
      ('283ET', 'ETIQUETA SUGAR REFLECTIVO LILA', 788),
      ('284ET', 'ETIQUETA SUGAR REFLECTIVO LADRILLO', 788),
      ('285ET', 'ETIQUETA SUGAR REFLECTIVO AZUL', 788),
      ('286ET', 'ETIQUETA SUGAR REFLECTIVO VERDE', 789),
      ('343ET', 'ETIQUETA FRENTE FRESA 343', 99),
      ('344ET', 'ETIQUETA FRENTE FRESA 344', 179),
      ('344ETD', 'ETIQUETA DORSO FRESA 344', 40),
      ('345ET', 'ETIQUETA FRENTE FRESA 345', 266),
      ('345ETD', 'ETIQUETA DORSO FRESA 345', 7),
      ('346ET', 'ETIQUETA FRENTE FRESA 346', 191),
      ('346ETD', 'ETIQUETA DORSO FRESA 346', 11),
      ('347ET', 'ETIQUETA FRENTE FRESA 347', 100),
      ('347ETD', 'ETIQUETA DORSO FRESA 347', 32),
      ('348ET', 'ETIQUETA FRENTE FRESA 348', 164),
      ('348ETD', 'ETIQUETA DORSO FRESA 348', 40),
      ('349ET', 'ETIQUETA FRENTE FRESA 349', 65),
      ('349ETD', 'ETIQUETA DORSO FRESA 349', 10),
      ('350ET', 'ETIQUETA FRENTE FRESA 350', 155),
      ('350ETD', 'ETIQUETA DORSO FRESA 350', 71),
      ('351ET', 'ETIQUETA FRENTE FRESA 351', 136),
      ('351ETD', 'ETIQUETA DORSO FRESA 351', 29),
      ('352ET', 'ETIQUETA FRENTE FRESA 352', 163),
      ('353ET', 'ETIQUETA FRENTE FRESA 353', 678),
      ('354ET', 'ETIQUETA FRENTE FRESA 354', 110),
      ('354ETD', 'ETIQUETA DORSO FRESA 354', 48),
      ('356ET', 'ETIQUETA FRENTE FRESA 356', 143),
      ('356ETD', 'ETIQUETA DORSO FRESA 356', 7),
      ('357ET', 'ETIQUETA FRENTE FRESA 357', 546),
      ('357ETD', 'ETIQUETA DORSO FRESA 357', 15),
      ('358ET', 'ETIQUETA FRENTE FRESA 358', 270),
      ('359ET', 'ETIQUETA FRENTE FRESA 359', 406),
      ('359ETD', 'ETIQUETA DORSO FRESA 359', 39),
      ('NS-397ET', 'ETIQUETA SANITIZANTE AMOR 1 LITRO', 60),
      ('NS-398ET', 'ETIQUETA SANITIZANTE AIRE 1 LITRO', 210),
      ('NS-399ET', 'ETIQUETA SANITIZANTE PAZ 1 LITRO', 230),
      ('NST-510ET', 'ETIQUETA Tips Clear Oval-soft gel (L)x100u.', 10),
      ('NST-511ET', 'ETIQUETA Tips Clear Coffin-soft gel (L)x100u', 15),
      ('NST-512ET', 'ETIQUETA Nail Tips Nat Curva C x100', 501)
  ) as t (codigo, nombre, cantidad);

  insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
  select t.codigo, t.nombre, 'ETIQUETA', 'UNIDAD'
    from carga_etiquetas_nuevas t
   where not exists (select 1 from gmp.insumos_catalogo i where i.codigo_interno = t.codigo);

  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (inventario de etiquetas 2026-11-04)', i.unidad_medida
    from carga_etiquetas_nuevas t
    join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
   where i.unidad_medida is not null
     and not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  for r in
    select i.id, t.cantidad
      from carga_etiquetas_nuevas t
      join gmp.insumos_catalogo i on i.codigo_interno = t.codigo
  loop
    perform comercial.registrar_conteo(r.id, r.cantidad, v_obs, false);
  end loop;
end;
$$;
