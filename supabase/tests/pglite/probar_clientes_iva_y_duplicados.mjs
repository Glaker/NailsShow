// «No categorizado» (20261026160000-160100, D-clientes-iva-1) y el documento
// repetido, que ya rechazaba clientes_documento_idx.
import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
await como('mati@x');

const alta = (nombre, condicion, tipo, numero) =>
  `insert into comercial.clientes (razon_social, condicion_iva, tipo_documento, numero_documento)
   values ('${nombre}', '${condicion}', '${tipo}', '${numero}')`;

await prueba(
  'un cliente No categorizado se carga, va a ARCA con 7 y lleva B',
  async () => {
    await q(alta('Kiosco Pepe', 'NO_CATEGORIZADO', 'DNI', '30111222'));
    const r = await uno(
      `select comercial.condicion_iva_arca('NO_CATEGORIZADO') arca, comercial.clase_factura('NO_CATEGORIZADO'::comercial.condicion_iva_enum) clase`,
    );
    if (r.arca !== 7 || r.clase !== 'B') throw new Error(JSON.stringify(r));
  },
);
await prueba('las demás condiciones siguen igual', async () => {
  const r = await uno(
    `select comercial.condicion_iva_arca('RESPONSABLE_INSCRIPTO') ri, comercial.condicion_iva_arca('CONSUMIDOR_FINAL') cf`,
  );
  if (r.ri !== 1 || r.cf !== 5) throw new Error(JSON.stringify(r));
});
await rechaza(
  'el mismo DNI no se carga dos veces',
  alta('Pepe Kiosco', 'CONSUMIDOR_FINAL', 'DNI', '30111222'),
  /clientes_documento_idx/,
);
await q(alta('Distribuidora Sur SRL', 'RESPONSABLE_INSCRIPTO', 'CUIT', '30712345671'));
await rechaza(
  'ni el mismo CUIT',
  alta('Distrib. Sur', 'RESPONSABLE_INSCRIPTO', 'CUIT', '30712345671'),
  /clientes_documento_idx/,
);
await prueba('varios consumidores finales sin identificar, sí', async () => {
  await q(alta('Mostrador 1', 'CONSUMIDOR_FINAL', 'SIN_IDENTIFICAR', '0'));
  await q(alta('Mostrador 2', 'CONSUMIDOR_FINAL', 'SIN_IDENTIFICAR', '0'));
});
await invariantes();
fin();
