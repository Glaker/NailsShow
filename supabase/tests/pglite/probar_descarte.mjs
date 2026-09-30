import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('naza@x', 'GERENCIA_PRODUCCION');
await usuario('mati@x', 'VENTAS', 'ADMINISTRACION');
const art = await uno(`select articulo_id, count(*)::int n, sum(saldo) total from comercial.v_existencias
  where tercero_id is null and saldo > 0 group by articulo_id order by count(*) desc limit 1`);
if (!art) throw new Error('la base reconstruida no trae stock para probar');
const saldo = async () => Number((await uno(`select coalesce(sum(saldo),0) s from comercial.v_existencias where articulo_id=$1 and tercero_id is null`, [art.articulo_id])).s);

// Dos posiciones: la mitad del primer lote pasa a otro depósito.
await como('naza@x');
{
  const p = await uno(`select lote_insumo_id, deposito_id, saldo from comercial.v_existencias where articulo_id=$1 and tercero_id is null and saldo > 0 limit 1`, [art.articulo_id]);
  const otro = (await uno(`select id from gmp.depositos where activo and id <> $1 and not es_exterior limit 1`, [p.deposito_id])).id;
  await q(`select comercial.transferir_deposito($1, $2, $3, $4, 'prueba')`, [p.lote_insumo_id, p.deposito_id, otro, Number(p.saldo) / 2]);
  art.n = (await uno(`select count(*)::int n from comercial.v_existencias where articulo_id=$1 and tercero_id is null and saldo > 0`, [art.articulo_id])).n;
}
await como('mati@x');
await rechaza('Ventas no da de baja stock', `select comercial.descartar_articulo('${art.articulo_id}', 'no se usa')`, /row-level/);
await como('naza@x');
await rechaza('sin motivo, no', `select comercial.descartar_articulo('${art.articulo_id}', '  ')`, /por qué/);
await prueba(`Producción da de baja todo: ${art.n} posiciones, saldo en cero`, async () => {
  const n = (await uno(`select comercial.descartar_articulo($1, 'No se usa más') n`, [art.articulo_id])).n;
  if (n !== art.n) throw new Error(`dio de baja ${n} de ${art.n}`);
  if ((await saldo()) !== 0) throw new Error('quedó saldo');
  const m = await q(`select tipo, motivo_tipo, motivo, registrado_por from comercial.movimientos_stock
    where articulo_id=$1 and tipo='SALIDA_DESCARTE'`, [art.articulo_id]);
  if (m.length !== art.n || m.some((x) => x.motivo_tipo !== 'DISCONTINUADO' || !x.registrado_por)) throw new Error(JSON.stringify(m));
});
await rechaza('sin stock, avisa', `select comercial.descartar_articulo('${art.articulo_id}', 'otra vez')`, /No queda stock/);

await invariantes();
fin();
