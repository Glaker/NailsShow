import { banco } from './lib.mjs';
const { q, uno, prueba, rechaza, como, usuario, fin, invariantes } = await banco();
await usuario('operario@x', 'OPERARIO');
await usuario('fin@x', 'FINANZAS', 'ADMINISTRACION');
const ADMIN = 'verificacion@nailshow.com.ar';
const CLAVE = 'clave-de-prueba';
const registrar = (modelo = 'claude-haiku-5-5', salida = 100, clave = CLAVE) =>
  q(
    `select core.giorgio_registrar($3, '/costos', '¿de dónde sale el costo?', 'Sale de…', $1, 1000, $2, 5000, 0, '{ir_a}', 2::smallint, 900, null)`,
    [modelo, salida, clave],
  );
const estado = async () => (await uno(`select core.giorgio_estado() e`)).e;

await como('operario@x');
await prueba('sin la clave de registro cargada, Giorgio no atiende (D-59)', async () => {
  const e = await estado();
  if (e.permitido || e.motivo !== 'SIN_CONFIGURAR') throw new Error(JSON.stringify(e));
});
// El paso manual de 20261019120000: el hash se carga desde el editor SQL.
await q(`reset role`);
await q(
  `update core.giorgio_config set clave_registro_sha256 = sha256(convert_to($1, 'UTF8'))`,
  [CLAVE],
);
await como('operario@x');
await rechaza(
  'registrar sin la clave se rechaza: nadie carga consultas inventadas',
  `select core.giorgio_registrar(null, '/', 'x', null, 'claude-sonnet-5-5', 200000, 8192, 0, 0, '{}', 1::smallint, 1, null)`,
  /no autorizado/,
);
await rechaza(
  'registrar con una clave equivocada se rechaza',
  `select core.giorgio_registrar('adivinada', '/', 'x', null, 'claude-sonnet-5-5', 200000, 8192, 0, 0, '{}', 1::smallint, 1, null)`,
  /no autorizado/,
);
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
      `select core.giorgio_registrar('${CLAVE}', '/', 'x', null, 'claude-haiku-5-5', 2000000000, 2000000000, 0, 0, '{}', 1::smallint, 1, null)`,
    );
    const r = await uno(
      `select tokens_entrada, tokens_salida from core.giorgio_mensajes where tokens_salida > 1000`,
    );
    // Con escalado, hasta 8 llamadas de 1024 tokens de salida (D-61).
    if (r.tokens_entrada !== 200000 || r.tokens_salida !== 8192)
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
await prueba('topes de partida: USD 1 por día y USD 20 por mes (D-60)', async () => {
  const c = await uno(
    `select tope_diario_usd::float d, tope_mensual_usd::float m from core.giorgio_config`,
  );
  if (c.d !== 1 || c.m !== 20) throw new Error(JSON.stringify(c));
});
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
await prueba(
  'el gasto del mes anterior no cuenta, aunque en UTC ya sea este mes',
  async () => {
    await q(`reset role`);
    // 30 minutos antes del primer día del mes en hora argentina (en UTC ya
    // cae dentro del mes): USD 50 que no deben contar.
    await q(`insert into core.giorgio_mensajes (preguntado_por, pregunta, costo_usd, creado_en)
             select id, 'del mes pasado', 50,
                    (date_trunc('month', core.giorgio_hoy()::timestamp) at time zone 'America/Argentina/Buenos_Aires')
                      - interval '30 minutes'
               from core.usuarios where email = 'fin@x'`);
    await como(ADMIN);
    await q(`update core.giorgio_config set tope_diario_usd = 100, tope_mensual_usd = 1`);
    await como('fin@x');
    const e = await estado();
    if (!e.permitido) throw new Error(JSON.stringify(e));
  },
);
await como(ADMIN);
await prueba('al llegar al tope mensual se apaga hasta el mes siguiente', async () => {
  await q(
    `update core.giorgio_config set tope_diario_usd = 100, tope_mensual_usd = 0.01`,
  );
  await como('fin@x');
  const e = await estado();
  if (e.permitido || e.motivo !== 'TOPE_MENSUAL') throw new Error(JSON.stringify(e));
});
await como(ADMIN);
await prueba('el interruptor apaga a Giorgio', async () => {
  await q(
    `update core.giorgio_config set activo = false, tope_diario_usd = 100, tope_mensual_usd = 100`,
  );
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
