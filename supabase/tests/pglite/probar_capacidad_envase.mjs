// Capacidad del envase en la ficha del insumo (20261020120000).
import { banco } from './lib.mjs';
const { uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('gp@x', 'GERENCIA_PRODUCCION');
await como('gp@x');

await prueba('un envase se da de alta con su capacidad', async () => {
  const r = await uno(
    `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, capacidad, unidad_capacidad)
     values ('ENV-T1', 'Frasco 15', 'MATERIAL_ENVASE', 'UNIDAD', 15, 'mL') returning capacidad, unidad_capacidad`,
  );
  if (Number(r.capacidad) !== 15 || r.unidad_capacidad !== 'mL')
    throw new Error(JSON.stringify(r));
});
await prueba(
  'y sin capacidad también (los envases viejos la completan después)',
  async () => {
    await uno(
      `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida)
     values ('ENV-T2', 'Tapa', 'MATERIAL_ENVASE', 'UNIDAD') returning id`,
    );
  },
);
await rechaza(
  'capacidad sin unidad',
  `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, capacidad)
   values ('ENV-T3', 'X', 'MATERIAL_ENVASE', 'UNIDAD', 10)`,
  /capacidad_con_unidad/,
);
await rechaza(
  'unidad de capacidad fuera de g / mL',
  `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, capacidad, unidad_capacidad)
   values ('ENV-T4', 'X', 'MATERIAL_ENVASE', 'UNIDAD', 10, 'L')`,
  /unidad_capacidad/,
);
await rechaza(
  'capacidad cero',
  `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, capacidad, unidad_capacidad)
   values ('ENV-T5', 'X', 'MATERIAL_ENVASE', 'UNIDAD', 0, 'mL')`,
  /capacidad/,
);
await rechaza(
  'una materia prima no lleva capacidad',
  `insert into gmp.insumos_catalogo (codigo_interno, nombre, tipo, unidad_medida, capacidad, unidad_capacidad)
   values ('MP-T6', 'X', 'MATERIA_PRIMA', 'g', 10, 'g')`,
  /capacidad_solo_envase/,
);
await invariantes();
fin();
