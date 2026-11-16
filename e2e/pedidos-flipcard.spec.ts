/**
 * P5 de docs/PROMPT_PEDIDOS_HADA.md: la tarjeta de pedido se da vuelta solo con los
 * botones, mide su alto sin recortar, gira una a la vez, y el blur de la lista no
 * tapa ni intercepta nada.
 */
import { expect, test, type Page } from '@playwright/test';
import { CAJAS, NOMBRES, prepararPortal, sesion } from './portal-falso';

const pedido = (n: number, lineas: number, editable: boolean) => ({
  id: `00000000-0000-4000-a000-00000000010${n}`,
  numero: `V-010${n}`,
  estado: editable ? 'PENDIENTE' : 'EN_CURSO',
  estado_cliente: editable ? 'PENDIENTE' : 'EN_PRODUCCION',
  enviado_en: '2026-11-10T12:00:00Z',
  fecha_entrega: null,
  editable,
  cancelado: false,
  observaciones: null,
  renglones: Array.from({ length: lineas }, (_, i) => ({
    producto_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    cantidad: 6 + i,
    producto: `${NOMBRES[i % NOMBRES.length]!} línea ${i + 1}`,
    codigo: String(360 + i),
  })),
  cajas:
    n === 1
      ? [
          {
            caja_id: CAJAS[0]!.caja_id,
            nombre: CAJAS[0]!.nombre,
            opcion: 'SURTIDO',
            cajas: 2,
          },
        ]
      : [],
});

async function abrir(page: Page) {
  await page.setViewportSize({ width: 390, height: 800 });
  const escenario = await prepararPortal(page, false, 100);
  escenario.pedidos = [pedido(1, 1, true), pedido(2, 15, true), pedido(3, 3, false)];
  await page.addInitScript(
    (s) => localStorage.setItem('sb-falso-auth-token', s),
    sesion(false),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: /Mis pedidos/ }).click();
  await expect(page.locator('.flip-card')).toHaveCount(3, { timeout: 30_000 });
}
const tarjeta = (page: Page, numero: string) =>
  page.locator('.flip-card', { hasText: numero });
const caraVisible = (page: Page, numero: string) =>
  tarjeta(page, numero).locator('.flip-card__face[aria-hidden="false"]');
const editar = (page: Page, numero: string) =>
  tarjeta(page, numero).getByRole('button', { name: 'Editar', exact: true });
const volver = (page: Page, numero: string) =>
  tarjeta(page, numero).getByRole('button', { name: 'Volver' });

/** El alto de la tarjeta alcanza para la cara que se ve: nada queda recortado (offset*, sin la inclinación del giro). */
async function sinRecorte(page: Page, numero: string) {
  await expect
    .poll(() =>
      tarjeta(page, numero).evaluate((root) => {
        const cara = root.querySelector<HTMLElement>(
          '.flip-card__face[aria-hidden="false"]',
        )!;
        return (
          (root as HTMLElement).offsetHeight >= cara.offsetHeight &&
          cara.scrollHeight <= cara.offsetHeight + 1
        );
      }),
    )
    .toBe(true);
}

test('gira y vuelve solo con los botones; tocar la tarjeta no la gira', async ({
  page,
}) => {
  await abrir(page);
  const t = tarjeta(page, 'V-0101');
  await expect(
    caraVisible(page, 'V-0101').getByText('Crema humectante 250 ml · Surtido'),
  ).toBeVisible();
  await expect(t.locator('[role="button"]')).toHaveCount(0);
  await t.getByText('V-0101').first().click();
  await expect(caraVisible(page, 'V-0101')).toHaveClass(/front/);
  await editar(page, 'V-0101').click();
  await expect(caraVisible(page, 'V-0101')).toHaveClass(/back/);
  await t.getByText('Las cantidades y las cajas').click();
  await expect(caraVisible(page, 'V-0101')).toHaveClass(/back/);
  await volver(page, 'V-0101').click();
  await expect(caraVisible(page, 'V-0101')).toHaveClass(/front/);
});

test('Espacio y Enter accionan el botón enfocado sin que la tarjeta los cancele', async ({
  page,
}) => {
  await abrir(page);
  await editar(page, 'V-0101').focus();
  await page.keyboard.press('Space');
  await expect(volver(page, 'V-0101')).toBeVisible();
  await volver(page, 'V-0101').focus();
  await page.keyboard.press('Enter');
  await expect(editar(page, 'V-0101')).toBeVisible();
  // El keydown que nace en un control no se cancela en la raíz.
  const cancelado = await tarjeta(page, 'V-0101').evaluate((root) => {
    const boton = root.querySelector('.flip-card__face[aria-hidden="false"] button')!;
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    boton.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(cancelado).toBe(false);
});

test('pedido de 15 líneas y de 1: sin recorte en frente ni dorso', async ({ page }) => {
  await abrir(page);
  for (const n of ['V-0101', 'V-0102']) {
    await tarjeta(page, n).scrollIntoViewIfNeeded();
    await sinRecorte(page, n);
    await editar(page, n).click();
    await expect(volver(page, n)).toBeVisible();
    await sinRecorte(page, n);
    await volver(page, n).click();
  }
  await expect(tarjeta(page, 'V-0102').getByText('línea 15').first()).toBeVisible();
});

test('una sola tarjeta girada: abrir una cierra la otra', async ({ page }) => {
  await abrir(page);
  await editar(page, 'V-0101').click();
  const dorsos = page.locator('.flip-card__face--back[aria-hidden="false"]');
  await expect(dorsos).toHaveCount(1);
  await tarjeta(page, 'V-0102').scrollIntoViewIfNeeded();
  await editar(page, 'V-0102').click();
  await expect(volver(page, 'V-0102')).toBeVisible();
  await expect(dorsos).toHaveCount(1);
  await expect(editar(page, 'V-0101')).toBeVisible();
});

test('pedido no editable: el dorso es de solo lectura', async ({ page }) => {
  await abrir(page);
  const t = tarjeta(page, 'V-0103');
  await t.scrollIntoViewIfNeeded();
  await expect(editar(page, 'V-0103')).toHaveCount(0);
  await t.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(t.getByText('Este pedido ya no se puede modificar.')).toBeVisible();
  await expect(t.getByRole('button', { name: 'Editar en el armado' })).toHaveCount(0);
  await expect(t.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await volver(page, 'V-0103').click();
});

test('el blur no intercepta clics en la última tarjeta y no está en el armado', async ({
  page,
}) => {
  await abrir(page);
  await expect(page.locator('.gradual-blur')).toHaveCount(1);
  await expect(page.locator('.gradual-blur')).toHaveCSS('pointer-events', 'none');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  await tarjeta(page, 'V-0103').getByRole('button', { name: 'Repetir' }).click();
  await expect(page.getByRole('button', { name: /Ver pedido/ })).toBeVisible();
  await expect(page.locator('.gradual-blur')).toHaveCount(0);
});
