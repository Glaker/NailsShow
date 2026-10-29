// Catálogo de insumos y proveedores editable por todos menos operarios (20261022160100, D-catalogo-1).
import { banco } from './lib.mjs';
const { db, q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('anabella@x', 'DIRECCION_TECNICA');
await usuario('ventas@x', 'VENTAS');
await usuario('operario@x', 'OPERARIO');

await como('anabella@x');
let mp, prov;
await prueba('DT da de alta una materia prima nueva (desde la fórmula)', async () => {
  mp = (
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, requiere_protocolo)
       values ('MP-C1', 'Alcohol C', 'MATERIA_PRIMA', 'kg', true) returning id`,
    )
  ).id;
  prov = (
    await uno(`insert into gmp.proveedores (razon_social) values ('Prov C') returning id`)
  ).id;
});
await como('ventas@x');
await prueba('Ventas edita el nombre y la unidad del insumo', async () => {
  const r = await q(
    `update gmp.insumos_catalogo set nombre = 'Alcohol etílico C', unidad_medida = 'L' where id = $1 returning id`,
    [mp],
  );
  if (r.length !== 1) throw new Error('no editó');
});
await prueba('y el contacto del proveedor', async () => {
  const r = await q(
    `update gmp.proveedores set razon_social = 'Proveedor C SA', contacto_nombre = 'Juan' where id = $1 returning id`,
    [prov],
  );
  if (r.length !== 1) throw new Error('no editó');
});
await rechaza(
  'pero no aprueba el proveedor: eso sigue siendo de DT',
  `update gmp.proveedores set estado_aprobacion = 'APROBADO' where id = '${prov}'`,
  /Dirección Técnica/,
);
await prueba('da de alta un insumo', async () => {
  await q(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('ENV-C1', 'Frasco C', 'MATERIAL_ENVASE', 'UNIDAD')`,
  );
});
await como('operario@x');
await prueba('el operario no edita (la política no le deja la fila)', async () => {
  const r = await q(
    `update gmp.insumos_catalogo set nombre = 'x' where id = $1 returning id`,
    [mp],
  );
  if (r.length !== 0) throw new Error('editó');
});
await rechaza(
  'ni da de alta',
  `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida) values ('X-1', 'X', 'ETIQUETA', 'UNIDAD')`,
  /row-level security|policy/i,
);
await prueba('los cambios quedaron auditados a nombre de Ventas', async () => {
  await db.exec('reset role');
  const r = await uno(
    `select count(*)::int n from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.tabla in ('insumos_catalogo', 'proveedores') and a.operacion = 'UPDATE' and u.email = 'ventas@x'`,
  );
  if (r.n !== 2) throw new Error(String(r.n));
});
await invariantes();
fin();
