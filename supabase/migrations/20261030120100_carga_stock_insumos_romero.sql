-- ---------------------------------------------------------------------------
-- Propósito : Carga del conteo de envases y cierres de la planilla «stock
--             insumos romero» (panel de stock del depósito 10, columna
--             CANTIDAD REAL), y de lo que esa planilla dice que ya está
--             etiquetado (columna ETIQUETADO?).
-- Reglas    : RN-54 (el movimiento no se edita: la diferencia es un ajuste),
--             RN-50, §3.3 «Ajustar stock por diferencia de inventario».
--             D-insumos-etiquetados-1.
-- Fecha     : 2026-10-30
-- ---------------------------------------------------------------------------
--
-- QUÉ SE CARGA.
--   1. Alta de los códigos de la planilla que no estaban en el catálogo: en
--      la base alojada, 8 (tres de ellos, 140ENV/140PICO/140TAPA, vienen
--      marcados «crear código»). Envase o cierre, en unidades, sin protocolo:
--      igual que sus hermanos.
--   2. El conteo de los 44 renglones con comercial.registrar_conteo: el saldo
--      de cada insumo pasa a lo contado, con su ajuste en el kardex.
--      CANTIDAD REAL incluye lo etiquetado (391ENV: 47 contados = 15 + 32
--      etiquetados).
--   3. Lo etiquetado, en comercial.insumos_etiquetados.
--
-- LOTES CON RECEPCIÓN QUE TIENEN MÁS DE LO CONTADO.
-- registrar_conteo asienta la diferencia en el lote de apertura y no toca los
-- lotes con recepción. Dos insumos tienen en lotes recibidos más de lo que se
-- contó (101ENVA: 1380 contra 127; 103ENVA: 396 contra 330). Para ellos el
-- excedente se baja primero de esos lotes, del que vence primero, con un
-- ajuste por diferencia de inventario que lo dice; después el conteo asienta
-- el resto. Es lo que registrar_conteo pide hacer a mano («ajustar esos lotes
-- uno por uno»), hecho acá con el mismo motivo.
--
-- LO QUE LA PLANILLA NO CUANTIFICA, Y QUEDA AFUERA DE LO ETIQUETADO.
-- 101ENVA «cleanser 100ml», 104ENV «cleanser 250ml», 139ENV/139PICO/139TAPA
-- «kitx12» y 103TAP «contar etiquetado» no dicen cuántos. Se cargan desde la
-- pantalla cuando se cuenten. 516BOL trae «nst526» dos veces (93 y 43): se
-- suman. «candy» y «smoothie» de 111ENV van a la colección (279, 299), sin
-- abrir por color: la planilla no lo abre.
--
-- A NOMBRE DE QUIÉN.
-- Del codirector técnico, que pidió la carga. Mismo mecanismo que
-- 20260923150000: el claim se fija solo para esta transacción.

do $$
declare
  v_dt        uuid;
  v_migracion uuid;
  v_obs       constant text := 'Planilla «stock insumos romero» (depósito 10), conteo al 2026-10-30';
  r           record;
  v_insumo    gmp.insumos_catalogo%rowtype;
  v_articulo  uuid;
  v_total     numeric(16,4);
  v_apertura  numeric(16,4);
  v_exceso    numeric(16,4);
  v_toma      numeric(16,4);
  pos         record;
  v_faltan    text;
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

  -- 1. Códigos que falten ---------------------------------------------------
  -- En la base alojada faltan los 8 primeros. Los otros se dieron de alta
  -- desde la pantalla, sin migración: van por si se reconstruye desde cero, y
  -- donde ya existen no se tocan.
  insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
  select v.codigo, v.nombre, v.tipo::gmp.tipo_insumo_enum, 'UNIDAD'
    from (values
      ('080TAPA', 'TAPA POLIMERO DE 14gr (NUEVA)',      'MATERIAL_ENVASE'),
      ('457TAP',  'TAPA LOLITA 14gr',                   'MATERIAL_ENVASE'),
      ('459TAP',  'TAPA PAMPA 125gr',                   'MATERIAL_ENVASE'),
      ('139PICO', 'PICO GOTERO PARA ACRILICOS',         'MATERIAL_ENVASE'),
      ('140ENV',  'ENVASE GOTERO KIT x27',              'MATERIAL_ENVASE'),
      ('140PICO', 'PICO GOTERO KIT x27',                'MATERIAL_ENVASE'),
      ('140TAPA', 'TAPA GOTERO KIT x27',                'MATERIAL_ENVASE'),
      ('516BOL',  'BOLSA PARA TIPS DONNGUAN',           'MATERIAL_EMPAQUE'),
      ('093TAP',  'TAPA POLIMERO 45gr',                 'MATERIAL_ENVASE'),
      ('103TAP',  'TAPA CLEANSER Y MONOMERO 1Lt.',      'MATERIAL_ENVASE'),
      ('105PIN',  'PINCEL P/ PRIMER, BONDER, TOP, ACEITE', 'MATERIAL_ENVASE'),
      ('111TAP',  'TAPA POLIMERO 8ML',                  'MATERIAL_ENVASE'),
      ('131ENV',  'ENVASE TIPO GOTERO 30ml.',           'MATERIAL_ENVASE'),
      ('131TAP',  'TAPA GOTERO 30ML',                   'MATERIAL_ENVASE'),
      ('135GAT',  'GATILLO VAPORIZADOR',                'MATERIAL_ENVASE'),
      ('139TAPA', 'TAPA GOTERO PARA ACRILICOS',         'MATERIAL_ENVASE'),
      ('387ENV',  'ENVASE CUADRADO TRANSP+PINTURA MATE', 'MATERIAL_ENVASE'),
      ('387PIN',  'PINCEL LARGO PELO CORTO',            'MATERIAL_ENVASE'),
      ('391BOM',  'BOMBA SPRAY ROSA 24/410',            'MATERIAL_ENVASE')
    ) as v (codigo, nombre, tipo)
   where not exists (select 1 from gmp.insumos_catalogo i where i.codigo_interno = v.codigo);

  -- Lote de apertura vacío donde falte, como 20260923150000 §3.a.
  insert into gmp.lotes_insumo (
    insumo_id, estado, migracion_apertura_id, cantidad_unidades, cantidad_no_declarada,
    lote_proveedor, unidad
  )
  select i.id, 'SALDO_APERTURA', v_migracion, 0, true,
         'SALDO DE APERTURA — sin cantidad declarada (conteo 2026-10-30)', i.unidad_medida
    from gmp.insumos_catalogo i
   where i.codigo_interno in (
           '080ENV','080TAPA','093ENV','093TAP','101ENVA','101TAPACIEGA','103ENV','103ENVA','103TAP',
           '104ENV','104TAP','105ENV','105PIN','105TAP','111CAJ','111ENV','111TAP','131ENV','131TAP',
           '135GAT','139CAJ','140ENV','140PICO','140TAPA','139ENV','139PICO','139TAPA','140CAJ',
           '364ENV','364TAP','367ENV','367TAP','387ENV','387PIN','391BOM','391ENV','392ENV','393BOM',
           '395BOM','457ENV','457TAP','459ENV','459TAP','516BOL')
     and not exists (
       select 1 from gmp.lotes_insumo l
        where l.insumo_id = i.id and l.estado = 'SALDO_APERTURA' and l.unidad = i.unidad_medida
     );

  -- 2. Conteo ---------------------------------------------------------------
  for r in
    select * from (values
      ('080ENV', 5122), ('080TAPA', 6760), ('093ENV', 3815), ('093TAP', 6337),
      ('101ENVA', 127), ('101TAPACIEGA', 2033), ('103ENV', 587), ('103ENVA', 330),
      ('103TAP', 533), ('104ENV', 181), ('104TAP', 3309), ('105ENV', 2594),
      ('105PIN', 3333), ('105TAP', 1720), ('111CAJ', 852), ('111ENV', 2954),
      ('111TAP', 4314), ('131ENV', 1656), ('131TAP', 1653), ('135GAT', 1794),
      ('139CAJ', 992), ('140ENV', 35), ('140PICO', 1690), ('140TAPA', 1588),
      ('139ENV', 900), ('139PICO', 1532), ('139TAPA', 1295), ('140CAJ', 472),
      ('364ENV', 944), ('364TAP', 1209), ('367ENV', 1347), ('367TAP', 2150),
      ('387ENV', 4810), ('387PIN', 3343), ('391BOM', 99), ('391ENV', 47),
      ('392ENV', 2080), ('393BOM', 710), ('395BOM', 1131), ('457ENV', 20290),
      ('457TAP', 20400), ('459ENV', 5520), ('459TAP', 4800), ('516BOL', 3032)
    ) as t (codigo, cantidad)
  loop
    select * into v_insumo from gmp.insumos_catalogo where codigo_interno = r.codigo;
    if not found then
      raise exception 'Falta el insumo % en el catálogo.', r.codigo;
    end if;
    v_articulo := comercial.articulo_de_insumo(v_insumo.id);

    select coalesce(sum(s.saldo), 0),
           coalesce(sum(s.saldo) filter (where l.estado = 'SALDO_APERTURA'), 0)
      into v_total, v_apertura
      from comercial.v_saldos_stock s
      join gmp.lotes_insumo l on l.id = s.lote_insumo_id
     where s.articulo_id = v_articulo and l.unidad = v_insumo.unidad_medida;

    -- Lo que el lote de apertura no alcanza a explicar sale de los recibidos.
    v_exceso := (v_total - r.cantidad) - v_apertura;
    if v_exceso > 0 then
      for pos in
        select s.lote_insumo_id, s.deposito_id, s.saldo
          from comercial.v_saldos_stock s
          join gmp.lotes_insumo l on l.id = s.lote_insumo_id
         where s.articulo_id = v_articulo and s.saldo > 0 and l.estado <> 'SALDO_APERTURA'
         order by l.plazo_validez nulls last, l.creado_en, l.numero_registro_interno, s.deposito_id
      loop
        v_toma := least(v_exceso, pos.saldo);
        insert into comercial.movimientos_stock
          (articulo_id, lote_insumo_id, deposito_id, tipo, cantidad, motivo, motivo_tipo)
        values
          (v_articulo, pos.lote_insumo_id, pos.deposito_id, 'SALIDA_AJUSTE', -v_toma,
           format('Conteo físico: se contaron %s %s y los lotes recibidos tenían %s. %s',
                  r.cantidad, v_insumo.unidad_medida, v_total - v_apertura, v_obs),
           'DIFERENCIA_DE_INVENTARIO');
        v_exceso := v_exceso - v_toma;
        exit when v_exceso <= 0;
      end loop;
    end if;

    perform comercial.registrar_conteo(v_insumo.id, r.cantidad, v_obs, false);
  end loop;

  -- 3. Lo etiquetado ---------------------------------------------------------
  create temp table carga_etiquetados on commit drop as
  select t.*, i.id as insumo_id, p.id as producto_id
    from (values
      ('080ENV', '89', 218, 'beige'), ('080ENV', '83', 185, 'french'), ('080ENV', '87', 116, 'dark'),
      ('080ENV', '90', 5, 'diamonds'), ('080ENV', '88', 17, 'pinky'),
      ('093ENV', '100', 179, 'dark'), ('093ENV', '98', 238, 'show'), ('093ENV', '99', 42, 'soft'),
      ('093ENV', '79', 111, 'via lactea'), ('093ENV', '93', 17, 'rosa translucido'),
      ('103ENV', 'NS-399', 4, 'sani paz'), ('103ENV', '195', 2, 'remo'),
      ('103ENVA', '103', 3, 'etiquetado monomero'),
      ('111CAJ', '327', 37, 'basics'), ('111CAJ', '111', 1, 'donuts'), ('111CAJ', '116', 38, 'pastel'),
      ('111CAJ', '117', 40, 'baby'), ('111CAJ', '114', 9, 'chocolat'), ('111CAJ', '112', 34, 'macarrons'),
      ('111ENV', '279', 240, 'candy'), ('111ENV', '299', 240, 'smoothie'),
      ('111ENV', '247', 190, '#247'), ('111ENV', '252', 548, '#252'),
      ('111TAP', '252', 659, '#252'), ('111TAP', '247', 212, '#247'),
      ('367ENV', '367', 427, 'EXF AMOR 100GR'),
      ('391ENV', '391', 15, 'amor'), ('391ENV', '395', 32, 'paz'),
      ('392ENV', '394', 320, 'aire'), ('392ENV', '392', 96, 'amor'), ('392ENV', '396', 285, 'paz que se envasó el 22/10'),
      ('516BOL', 'NST-519', 82, 'nst519'), ('516BOL', 'NST-526', 136, 'nst526 (93 + 43)'),
      ('516BOL', 'NST-511', 117, 'nst511'), ('516BOL', 'NST-523', 32, 'nst523'),
      ('516BOL', 'NST-548', 98, 'nst548'), ('516BOL', 'NST-524', 98, 'nst 524'),
      ('516BOL', 'NST-520', 162, 'nst520'), ('516BOL', 'NST-522', 208, 'nst522'),
      ('516BOL', 'NST-525', 147, 'nst 525'), ('516BOL', 'NST-516', 162, 'nst516'),
      ('516BOL', 'NST-521', 46, 'nst 521'), ('516BOL', 'NST-517', 93, 'nst517'),
      ('516BOL', 'NST - 512', 16, 'curva c naturales')
    ) as t (insumo, producto, cantidad, nota)
    left join gmp.insumos_catalogo i on i.codigo_interno = t.insumo
    left join gmp.productos p on p.codigo_interno = t.producto;

  select string_agg(insumo || ' → ' || producto, ', ') into v_faltan
    from carga_etiquetados where insumo_id is null or producto_id is null;
  if v_faltan is not null then
    raise exception 'Faltan en el catálogo: %', v_faltan;
  end if;

  insert into comercial.insumos_etiquetados (insumo_id, producto_id, cantidad, observacion)
  select insumo_id, producto_id, cantidad, v_obs || ': «' || nota || '»'
    from carga_etiquetados;
end;
$$;
