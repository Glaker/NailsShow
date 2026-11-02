// Código de insumo editable con stock (20261030130000, D-codigo-editable-1):
// el artículo de stock sigue al insumo, también si edita quien no puede
// tocar artículos.
import { banco } from './lib.mjs';
const { db, q, uno, prueba, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('ventas@x', 'VENTAS');

await como('naza@x');
const ins = (
  await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
     values ('ENV-X1', 'Frasco viejo', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
  )
).id;
const art = (await uno(`select comercial.articulo_de_insumo($1) as id`, [ins])).id;

const articulo = () =>
  uno(`select sku, descripcion from comercial.articulos where id = $1`, [art]);

await prueba('Gerencia de Producción cambia el código y el nombre con artículo creado', async () => {
  await q(
    `update gmp.insumos_catalogo set codigo_interno = 'ENV-X2', nombre = 'Frasco nuevo' where id = $1`,
    [ins],
  );
  const a = await articulo();
  if (a.sku !== 'ENV-X2' || a.descripcion !== 'Frasco nuevo') throw new Error(JSON.stringify(a));
});

await como('ventas@x');
await prueba('lo cambia un rol sin permiso sobre artículos y el SKU igual sigue', async () => {
  const r = await q(
    `update gmp.insumos_catalogo set codigo_interno = 'ENV-X3' where id = $1 returning id`,
    [ins],
  );
  if (r.length !== 1) throw new Error('RLS no dejó editar el catálogo');
  const a = await articulo();
  if (a.sku !== 'ENV-X3') throw new Error(JSON.stringify(a));
});

await prueba('el cambio queda en la auditoría con el valor anterior y a nombre de quien editó', async () => {
  await db.exec('reset role');
  const r = await uno(
    `select a.datos_antes ->> 'sku' as antes, u.email
       from core.auditoria a join core.usuarios u on u.id = a.usuario_id
      where a.esquema = 'comercial' and a.tabla = 'articulos' and a.registro_id = $1
        and a.operacion = 'UPDATE'
      order by a.id desc limit 1`,
    [art],
  );
  if (r?.antes !== 'ENV-X2' || r.email !== 'ventas@x') throw new Error(JSON.stringify(r));
});

await invariantes();
fin();
