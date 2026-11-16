/**
 * P6 (docs/disenos/P6-hada.md §1.8): el frente de Hada. La función `hada` se
 * intercepta en la red falsa; el servidor y el modelo no participan.
 */
import { expect, test, type Page } from '@playwright/test';
import { CAJAS, LISTA, NOMBRES, prepararPortal, sesion } from './portal-falso';

const TOPE = 'Hoy no estoy. Armá el pedido desde la lista, como siempre.';
const ENTRADA = 'Hacele tu pedido a la Hada de Nail Show';
const uno = (page: Page, i: number) =>
  page.getByRole('button', { name: `Uno más de ${NOMBRES[i]}` });
const global = (page: Page, k: string) =>
  page.evaluate((c) => (window as unknown as Record<string, unknown>)[c], k);

/** Cuenta real (no demo), en celular, con el listado cargado. */
async function portal(page: Page) {
  await page.setViewportSize({ width: 390, height: 800 });
  const escenario = await prepararPortal(page, false, 100);
  await page.addInitScript(
    (s) => localStorage.setItem('sb-falso-auth-token', s),
    sesion(false),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(uno(page, 0)).toBeVisible({ timeout: 30_000 });
  return escenario;
}

/** Abre el panel, escribe y manda. */
async function preguntar(page: Page, mensaje = 'poneme 5 cremas') {
  await page.getByRole('button', { name: ENTRADA }).click();
  const panel = page.getByRole('dialog', { name: 'Hada de Nail Show' });
  await panel.getByRole('textbox').fill(mensaje);
  await panel.getByRole('button', { name: 'Enviar' }).click();
  return panel;
}

test('borrador: «Pasar al pedido» SUMA al carrito y no envía nada', async ({ page }) => {
  const escenario = await portal(page);
  await uno(page, 0).click(); // ya lleva 1 de la primera crema
  escenario.hada.cuerpo = {
    tipo: 'borrador',
    textos: ['Te armé esto.'],
    borrador: {
      renglones: [{ producto_id: LISTA[0]!.producto_id, cantidad: 5 }],
      cajas: [{ caja_id: CAJAS[0]!.caja_id, opcion: 'SURTIDO', cajas: 2 }],
    },
  };
  const panel = await preguntar(page);
  await expect(panel.getByText('Revisá tu pedido antes de confirmar')).toBeVisible();
  await expect(panel.getByText(CAJAS[0]!.nombre, { exact: false })).toBeVisible();
  expect(escenario.hadaLlamadas[0]).toEqual({
    mensaje: 'poneme 5 cremas',
    historial: [],
  });
  await panel.getByRole('button', { name: 'Pasar al pedido' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText('Lo que llevo (2)', { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Cantidad de ${NOMBRES[0]}`)).toHaveValue('6');
  expect(escenario.enviados).toHaveLength(0);
});

test('pregunta: se muestra como texto y el historial viaja en el próximo mensaje', async ({
  page,
}) => {
  const escenario = await portal(page);
  const panel = await preguntar(page);
  await expect(panel.getByText('¿Cuántas querés?')).toBeVisible();
  await panel.getByRole('textbox').fill('3 cajas');
  await expect(panel.getByText('7/500')).toBeVisible();
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await expect.poll(() => escenario.hadaLlamadas.length).toBe(2);
  expect(escenario.hadaLlamadas[1]!['historial']).toEqual([
    { rol: 'cliente', texto: 'poneme 5 cremas' },
    { rol: 'hada', texto: '¿Cuántas querés?' },
  ]);
  await expect(panel.getByRole('button', { name: 'Pasar al pedido' })).toHaveCount(0);
});

test('historial: un aviso o una ubicación lo vacían; solo una pregunta lo conserva', async ({
  page,
}) => {
  const escenario = await portal(page);
  escenario.hada.cuerpo = {
    tipo: 'ubicacion',
    textos: ['Está en Mis pedidos.'],
    destino: 'MIS_PEDIDOS',
  };
  const panel = await preguntar(page, '¿dónde veo mis pedidos?');
  await expect(panel.getByText('Está en Mis pedidos.')).toBeVisible();
  const mandar = async (texto: string) => {
    await panel.getByRole('textbox').fill(texto);
    await panel.getByRole('button', { name: 'Enviar' }).click();
  };
  escenario.hada = {
    status: 200,
    cuerpo: { tipo: 'aviso', textos: ['Solo te ayudo con tu pedido.'] },
  };
  await mandar('contame un chiste');
  await expect.poll(() => escenario.hadaLlamadas.length).toBe(2);
  expect(escenario.hadaLlamadas[1]!['historial']).toEqual([]);
  escenario.hada.cuerpo = { tipo: 'pregunta', textos: ['¿Cuántas querés?'] };
  await mandar('poneme cremas');
  await expect.poll(() => escenario.hadaLlamadas.length).toBe(3);
  expect(escenario.hadaLlamadas[2]!['historial']).toEqual([]);
  await mandar('3 cajas');
  await expect.poll(() => escenario.hadaLlamadas.length).toBe(4);
  expect(escenario.hadaLlamadas[3]!['historial']).toEqual([
    { rol: 'cliente', texto: 'poneme cremas' },
    { rol: 'hada', texto: '¿Cuántas querés?' },
  ]);
});

test('aviso 429: muestra el texto fijo del servidor y no ofrece nada más', async ({
  page,
}) => {
  const escenario = await portal(page);
  escenario.hada = { status: 429, cuerpo: { tipo: 'aviso', textos: [TOPE] } };
  const panel = await preguntar(page);
  await expect(panel.getByText(TOPE)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Pasar al pedido' })).toHaveCount(0);
});

test('servidor caído sin cuerpo legible: texto fijo del frente', async ({ page }) => {
  const escenario = await portal(page);
  escenario.hada = { status: 503, cuerpo: 'no es json' };
  const panel = await preguntar(page);
  await expect(panel.getByText(/Ahora no puedo ayudarte/)).toBeVisible();
});

test('HTML y script en los textos: se ven como texto y no crean nodos', async ({
  page,
}) => {
  const escenario = await portal(page);
  const malo = '<img src=x onerror="window.__x=1">';
  escenario.hada.cuerpo = {
    tipo: 'borrador',
    textos: [malo, '<script>window.__y=1</script>'],
    rechazados: [{ motivo: 'NO_ESTA', texto: `${malo} **negrita**` }],
    borrador: {
      renglones: [{ producto_id: LISTA[1]!.producto_id, cantidad: 2 }],
      cajas: [],
    },
  };
  const panel = await preguntar(page, malo);
  await expect(panel.getByText('<script>window.__y=1</script>')).toBeVisible();
  await expect(panel.getByText('**negrita**', { exact: false })).toBeVisible();
  await expect(panel.locator('img, script, iframe')).toHaveCount(0);
  expect(await global(page, '__x')).toBeUndefined();
  expect(await global(page, '__y')).toBeUndefined();
});

test('destino: solo los de la lista cerrada, y se toca para ir', async ({ page }) => {
  const escenario = await portal(page);
  escenario.hada.cuerpo = {
    tipo: 'ubicacion',
    textos: ['Mirá esto.'],
    destino: 'https://malo.test/robar',
  };
  const panel = await preguntar(page);
  await expect(panel.getByText('Mirá esto.')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^(Ir|Abrir|Ver)/ })).toHaveCount(0);

  escenario.hada.cuerpo = {
    tipo: 'ubicacion',
    textos: ['Está acá.'],
    destino: 'MIS_PEDIDOS',
  };
  await panel.getByRole('textbox').fill('¿dónde están mis pedidos?');
  await panel.getByRole('button', { name: 'Enviar' }).click();
  await panel.getByRole('button', { name: 'Ir a «Mis pedidos»' }).click();
  await expect(page.getByText('Todavía no hiciste pedidos')).toBeVisible();
  // En «Mis pedidos» Hada no está.
  await expect(page.getByRole('button', { name: ENTRADA })).toHaveCount(0);
});

test('Hada no se ofrece con el resumen abierto; en la cuenta demo sí (D-hada-2)', async ({
  page,
}) => {
  await portal(page);
  await expect(page.getByRole('button', { name: ENTRADA })).toBeVisible();
  await uno(page, 0).click();
  await page.getByRole('button', { name: /Ver pedido/ }).click();
  await expect(page.locator('.slide-commit')).toBeVisible();
  await expect(page.getByRole('button', { name: ENTRADA })).toHaveCount(0);

  const demo = await page.context().newPage();
  await demo.setViewportSize({ width: 390, height: 800 });
  const esc = await prepararPortal(demo, false, 100); // sesión demo por defecto
  await demo.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(uno(demo, 0)).toBeVisible({ timeout: 30_000 });
  // El borrador (con una caja de cliente_cajas) se suma al carrito como en una cuenta real.
  esc.hada.cuerpo = {
    tipo: 'borrador',
    textos: ['Te armé esto.'],
    borrador: {
      renglones: [{ producto_id: LISTA[0]!.producto_id, cantidad: 5 }],
      cajas: [{ caja_id: CAJAS[1]!.caja_id, opcion: 'AMOR_PAZ', cajas: 1 }],
    },
  };
  const panel = await preguntar(demo);
  await panel.getByRole('button', { name: 'Pasar al pedido' }).click();
  await expect(demo.getByText('Lo que llevo (2)', { exact: true })).toBeVisible();
  expect(esc.enviados).toHaveLength(0);
});

test('pedido nuevo: usa cliente_enviar_pedido_unico y reintenta con la misma clave', async ({
  page,
}) => {
  const escenario = await portal(page);
  await uno(page, 0).click();
  await page.getByRole('button', { name: /Ver pedido/ }).click();
  const manija = page.locator('.slide-commit__capsule').first();
  await expect(manija).toBeVisible();
  escenario.fallarEnvios = 1; // la respuesta del primer intento «se pierde»
  await manija.focus();
  await manija.press('End');
  await expect.poll(() => escenario.enviados.length).toBe(1);
  await page.waitForTimeout(2500);
  await manija.focus();
  await manija.press('End');
  await expect(page.getByRole('heading', { name: '¡Pedido enviado!' })).toBeVisible({
    timeout: 15_000,
  });
  expect(escenario.enviados).toHaveLength(2);
  const [a, b] = escenario.enviados;
  expect(a!['p_clave']).toMatch(/^[0-9a-f-]{36}$/);
  expect(b!['p_clave']).toBe(a!['p_clave']);
  expect(a).not.toHaveProperty('p_id');
});

test('borrador con una opción de caja fuera de las 8 de P3: esa caja se descarta', async ({
  page,
}) => {
  const escenario = await portal(page);
  escenario.hada.cuerpo = {
    tipo: 'borrador',
    textos: ['Te armé esto.'],
    borrador: {
      renglones: [{ producto_id: LISTA[0]!.producto_id, cantidad: 5 }],
      cajas: [{ caja_id: CAJAS[0]!.caja_id, opcion: 'TODO_GRATIS', cajas: 2 }],
    },
  };
  const panel = await preguntar(page);
  await expect(panel.getByText('Revisá tu pedido antes de confirmar')).toBeVisible();
  await expect(panel.getByText('TODO_GRATIS', { exact: false })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Pasar al pedido' }).click();
  await expect(page.getByText('Lo que llevo (1)', { exact: true })).toBeVisible();
});
