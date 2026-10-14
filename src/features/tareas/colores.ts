/**
 * Color del pin de cada persona en «Tareas» (pedido del 2026-10-14). Se
 * resuelve por nombre de pila porque Agustina y Virginia todavía no tienen
 * cuenta: cuando se registren, toman su color solas.
 * ponytail: por nombre; si aparecen dos personas con el mismo nombre, pasa a
 * una columna de color por usuario.
 */
const POR_NOMBRE: Record<string, string> = {
  eliseo: '#1b2a5c', // azul marino (codirector técnico)
  diego: '#111111', // negro
  matias: '#f2c200', // amarillo
  mati: '#f2c200',
  agustina: '#d6249f', // magenta
  nazarena: '#12b5a8', // turquesa
  naza: '#12b5a8',
  virginia: '#7b3fe4', // violeta
  anabella: '#2f9e44', // verde
  jorge: '#e8590c', // naranja
  gabriel: '#c92a2a', // rojo
  gaby: '#c92a2a',
};

const RESTO = ['#1c7ed6', '#5c940d', '#862e9c', '#d9480f', '#0b7285', '#a61e4d'];

const pila = (nombre: string) =>
  nombre.trim().split(/\s+/)[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function colorDe(nombre: string | null | undefined): string {
  if (!nombre) return '#868e96';
  const p = pila(nombre);
  if (POR_NOMBRE[p]) return POR_NOMBRE[p];
  let h = 0;
  for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return RESTO[h % RESTO.length]!;
}
