// Varias etiquetas, categoría, «No la sé» y reventa (20261021150000).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');

await como('naza@x');
const producto = async (codigo) =>
  (
    await uno(
      `insert into gmp.productos (codigo_interno, nombre, vida_util_meses) values ($1, $1, 36) returning id`,
      [codigo],
    )
  ).id;
const insumo = async (codigo, tipo) =>
  (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ($1, $1, $2, 'UNIDAD', false) returning id`,
      [codigo, tipo],
    )
  ).id;
const prod = await producto('PR-2ET');
const envase = await insumo('ENV-2', 'MATERIAL_ENVASE');
const frente = await insumo('ETQ-F', 'ETIQUETA');
const trasera = await insumo('ETQ-T', 'ETIQUETA');
const otroEnvase = await insumo('ENV-3', 'MATERIAL_ENVASE');
const material = (ins, rol, categoria = null) =>
  q(
    `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol, categoria)
     values ($1, $2, 1, $3, $4)`,
    [prod, ins, rol, categoria],
  );

await prueba('un envase y dos etiquetas, con su categoría', async () => {
  await material(envase, 'ENVASE');
  await material(frente, 'ETIQUETA', 'Etiqueta frente');
  await material(trasera, 'ETIQUETA', 'Etiqueta trasera');
});
await rechaza(
  'pero un solo envase',
  `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol) values ('${prod}', '${otroEnvase}', 1, 'ENVASE')`,
  /duplicate|unique|materiales_un_envase/,
);

// Stock aprobado de los tres.
await db.exec('reset role');
const prov = (
  await uno(`insert into gmp.proveedores (razon_social) values ('Prov R') returning id`)
).id;
await como('naza@x');
const rec = (
  await uno(
    `insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido) values ($1, 'R-2', true) returning id`,
    [prov],
  )
).id;
const lotes = [];
for (const ins of [envase, frente, trasera])
  lotes.push(
    (
      await uno(
        `insert into gmp.lotes_insumo (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades, unidad, contenedores_limpiados)
         values ($1, $2, 'L', 1, 50, 'UNIDAD', true) returning id`,
        [rec, ins],
      )
    ).id,
  );
await q(`select * from comercial.cargar_recepcion_a_stock($1)`, [rec]);
await db.exec('reset role');
await db.exec('set session_replication_role = replica');
await q(`update gmp.lotes_insumo set estado = 'APROBADO' where id = any($1)`, [lotes]);
await db.exec('set session_replication_role = origin');
const saldo = async (ins) =>
  Number(
    (
      await uno(
        `select coalesce(sum(s.saldo), 0) s from comercial.v_saldos_stock s
          join comercial.articulos a on a.id = s.articulo_id where a.insumo_id = $1`,
        [ins],
      )
    ).s,
  );

await como('naza@x');
await prueba('etiquetar 10 baja 10 envases y 10 de cada etiqueta', async () => {
  await q(`select comercial.registrar_etiquetado($1, 10)`, [prod]);
  const [e, f, t] = [await saldo(envase), await saldo(frente), await saldo(trasera)];
  if (e !== 40 || f !== 40 || t !== 40) throw new Error(`${e} ${f} ${t}`);
});

const sinFormula = await producto('PR-SF');
await prueba(
  '«No la sé»: pasa a Pendientes de DT y sale de las tareas de GP',
  async () => {
    // Con envase y etiqueta, lo único que le falta es la fórmula.
    await q(
      `insert into gmp.materiales_acondicionamiento (producto_id, insumo_id, cantidad_por_unidad, rol) values ($1, $2, 1, 'ENVASE'), ($1, $3, 1, 'ETIQUETA')`,
      [sinFormula, envase, frente],
    );
    if (
      (
        await q(`select 1 from comercial.v_tareas_carga where producto_id = $1`, [
          sinFormula,
        ])
      ).length !== 1
    )
      throw new Error('debería estar en tareas');
    await q(`select gmp.consultar_formula($1)`, [sinFormula]);
    const p = await q(
      `select consultada_por from gmp.v_formulas_consultadas where producto_id = $1`,
      [sinFormula],
    );
    if (p.length !== 1 || p[0].consultada_por !== 'naza@x')
      throw new Error(JSON.stringify(p));
    if (
      (
        await q(`select 1 from comercial.v_tareas_carga where producto_id = $1`, [
          sinFormula,
        ])
      ).length !== 0
    )
      throw new Error('sigue en tareas');
  },
);

const reventa = await producto('PR-RV');
await prueba('un producto de reventa no es tarea ni se etiqueta', async () => {
  if (
    (await q(`select 1 from comercial.v_tareas_carga where producto_id = $1`, [reventa]))
      .length !== 1
  )
    throw new Error('debería estar en tareas antes');
  await q(`update gmp.productos set solo_reventa = true where id = $1`, [reventa]);
  if (
    (await q(`select 1 from comercial.v_tareas_carga where producto_id = $1`, [reventa]))
      .length !== 0
  )
    throw new Error('sigue en tareas');
});
await rechaza(
  'y etiquetarlo se rechaza',
  `select comercial.registrar_etiquetado('${reventa}', 1)`,
  /reventa/,
);
await rechaza(
  'quién derivó la fórmula no se escribe a mano',
  `update gmp.productos set formula_consultada_por = null where id = '${sinFormula}'`,
  /consultar_formula/,
);
await invariantes();
fin();
