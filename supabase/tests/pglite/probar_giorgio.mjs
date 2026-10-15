import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('operario@x', 'OPERARIO');
await usuario('fin@x', 'FINANZAS', 'ADMINISTRACION');
const ADMIN = 'verificacion@nailshow.com.ar';
const registrar = (modelo = 'claude-haiku-5-5', salida = 100) =>
  q(
    `select core.giorgio_registrar('/costos', '¿de dónde sale el costo?', 'Sale de…', $1, 1000, $2, 5000, 0, '{ir_a}', 2::smallint, 900, null)`,
    [modelo, salida],
  );
const estado = async () => (await uno(`select core.giorgio_estado() e`)).e;

await como('operario@x');
await prueba('un operario puede preguntar, con 50 por día', async () => {
  const e = await estado();
  if (!e.permitido || e.limite_diario !== 50 || e.roles[0] !== 'OPERARIO')
    throw new Error(JSON.stringify(e));
});
await prueba(
  'registrar deja la fila a su nombre, marcada como IA y con costo estimado',
  async () => {
    await registrar();
    const r = await uno(
      `select preguntado_por = core.usuario_actual() mio, rol, generado_por_ia, costo_usd::float c from core.giorgio_mensajes`,
    );
    // 1000 × 0,10 + 100 × 0,50 + 5000 × 0,01 por millón
    if (
      !r.mio ||
      r.rol !== 'OPERARIO' ||
      !r.generado_por_ia ||
      Math.abs(r.c - 0.0002) > 1e-9
    )
      throw new Error(JSON.stringify(r));
  },
);
await rechaza(
  'nadie inserta directo en el registro',
  `insert into core.giorgio_mensajes (preguntado_por, pregunta) values (core.usuario_actual(), 'x')`,
  /permission|row-level/,
);
await rechaza(
  'el registro no se edita',
  `update core.giorgio_mensajes set respuesta = 'otra'`,
  /permission/,
);
await rechaza(
  'el registro no se borra',
  `delete from core.giorgio_mensajes`,
  /permission|Prohibido/,
);
await prueba('un operario no cambia la configuración (RLS: 0 filas)', async () => {
  const r = await q(`update core.giorgio_config set activo = false returning id`);
  if (r.length !== 0) throw new Error('la cambió');
});
await prueba('un operario no lee la configuración', async () => {
  const n = await uno(`select count(*)::int n from core.giorgio_config`);
  if (n.n !== 0) throw new Error(String(n.n));
});

await como('fin@x');
await prueba(
  'Finanzas no ve las consultas del operario y tiene 150 por día',
  async () => {
    const n = await uno(`select count(*)::int n from core.giorgio_mensajes`);
    const e = await estado();
    if (n.n !== 0 || e.limite_diario !== 150) throw new Error(JSON.stringify({ n, e }));
  },
);
await prueba('un modelo sin precio se cobra como el más caro, no gratis', async () => {
  await registrar('claude-modelo-nuevo', 0);
  const r = await uno(
    `select costo_usd::float c from core.giorgio_mensajes where modelo = 'claude-modelo-nuevo'`,
  );
  // precio de Sonnet: 1000 × 2 + 5000 × 0,20 por millón
  if (Math.abs(r.c - 0.003) > 1e-9) throw new Error(String(r.c));
});
await prueba(
  'los tokens inventados se recortan a lo que puede gastar una consulta',
  async () => {
    await q(
      `select core.giorgio_registrar('/', 'x', null, 'claude-haiku-5-5', 2000000000, 2000000000, 0, 0, '{}', 1::smallint, 1, null)`,
    );
    const r = await uno(
      `select tokens_entrada, tokens_salida from core.giorgio_mensajes where tokens_salida > 1000`,
    );
    if (r.tokens_entrada !== 100000 || r.tokens_salida !== 4096)
      throw new Error(JSON.stringify(r));
  },
);

await como('operario@x');
await prueba(
  'al llegar al límite diario, el operario no puede preguntar más',
  async () => {
    for (let i = 0; i < 49; i++) await registrar();
    const e = await estado();
    if (e.permitido || e.motivo !== 'LIMITE_USUARIO' || e.preguntas_hoy !== 50)
      throw new Error(JSON.stringify(e));
  },
);

await como(ADMIN);
await prueba('el administrador ve todas las consultas', async () => {
  const n = await uno(`select count(*)::int n from core.giorgio_mensajes`);
  if (n.n !== 52) throw new Error(String(n.n));
});
await prueba(
  'el administrador baja el tope: al 80 % se apaga para todos (D-60)',
  async () => {
    await q(`update core.giorgio_config set tope_diario_usd = 0.01`);
    const c = await uno(
      `select cambiado_por = core.usuario_actual() quien from core.giorgio_config`,
    );
    if (!c.quien) throw new Error('cambiado_por no lo fijó el trigger');
    await como('fin@x');
    const e = await estado();
    if (e.permitido || e.motivo !== 'TOPE_GLOBAL') throw new Error(JSON.stringify(e));
  },
);
await como(ADMIN);
await prueba('el interruptor apaga a Giorgio', async () => {
  await q(`update core.giorgio_config set activo = false, tope_diario_usd = 100`);
  await como('fin@x');
  const e = await estado();
  if (e.permitido || e.motivo !== 'APAGADO') throw new Error(JSON.stringify(e));
});
await como(ADMIN);
await rechaza(
  'límites mal cargados no se guardan',
  `update core.giorgio_config set limites_por_rol = '{"OPERARIO": "x"}'`,
  /check/,
);
await rechaza(
  'precios incompletos no se guardan',
  `update core.giorgio_config set precios = '{"m": {"entrada": 1}}'`,
  /check/,
);
await rechaza(
  'el id de la configuración no se cambia',
  `update core.giorgio_config set id = gen_random_uuid()`,
  /permission/,
);
await prueba('la auditoría asienta los cambios de configuración', async () => {
  const n = await uno(
    `select count(*)::int n from core.auditoria where tabla = 'giorgio_config'`,
  );
  if (n.n < 3) throw new Error(String(n.n));
});
await invariantes();
fin();
