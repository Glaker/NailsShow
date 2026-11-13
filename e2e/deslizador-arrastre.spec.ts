/**
 * El deslizador de «Ver pedido» responde al arrastre real (eventos de puntero en
 * varios pasos), no solo al teclado: hasta el final envía, a la mitad vuelve.
 * SlideCommit.jsx ignora eventos no confiables (isTrusted) y el primer
 * pointermove solo fija el agarre; por eso hay que mover en muchos pasos.
 */
import { expect, test, type Page } from '@playwright/test';
import { NOMBRES, prepararPortal } from './portal-falso';

async function abrirResumen(page: Page, ancho: number) {
  await page.setViewportSize({ width: ancho, height: ancho < 768 ? 720 : 900 });
  await prepararPortal(page, false, 100);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const uno = page.getByRole('button', { name: `Uno más de ${NOMBRES[0]}` });
  await expect(uno).toBeVisible({ timeout: 30_000 });
  await uno.click();
  await page.getByRole('button', { name: /Ver pedido/ }).click();
  await expect(page.locator('.slide-commit')).toBeVisible();
  // Que el cajón termine de subir antes de medir la manija.
  await page.waitForTimeout(600);
}

/** Arrastra la manija con el mouse hasta la fracción `hasta` (1 = más allá del final). */
async function arrastrar(page: Page, hasta: number) {
  const pista = (await page.locator('.slide-commit__track').boundingBox())!;
  const manija = (await page.locator('.slide-commit__capsule').boundingBox())!;
  const y = manija.y + manija.height / 2;
  const x0 = manija.x + manija.height / 2;
  const x1 =
    hasta >= 1
      ? Math.min(pista.x + pista.width + 20, page.viewportSize()!.width - 1)
      : x0 + (pista.width - manija.height) * hasta;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  // El primer pointermove solo fija el agarre: que sea mínimo para no descontarlo del recorrido.
  await page.mouse.move(x0 + 1, y);
  const pasos = 14;
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / pasos, y);
    await page.waitForTimeout(16);
  }
  return { soltar: () => page.mouse.up() };
}

for (const ancho of [390, 1280]) {
  test.describe(`deslizador a ${ancho}px`, () => {
    test('arrastrar hasta el final envía el pedido', async ({ page }) => {
      await abrirResumen(page, ancho);
      const { soltar } = await arrastrar(page, 1);
      await soltar();
      await expect(page.getByRole('heading', { name: '¡Pedido enviado!' })).toBeVisible({
        timeout: 15_000,
      });
    });

    test('soltar a la mitad no envía y la manija vuelve', async ({ page }) => {
      await abrirResumen(page, ancho);
      const manija = page.locator('.slide-commit__capsule');
      const { soltar } = await arrastrar(page, 0.5);
      const medio = Number(await manija.getAttribute('aria-valuenow'));
      expect(medio).toBeGreaterThan(30);
      expect(medio).toBeLessThan(70);
      await soltar();
      await expect(manija).toHaveAttribute('aria-valuenow', '0', { timeout: 5_000 });
      await expect(page.getByRole('heading', { name: '¡Pedido enviado!' })).toBeHidden();
    });
  });
}
