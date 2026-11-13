/**
 * P1 de docs/PROMPT_PEDIDOS_HADA.md: ningún botón del portal de pedidos recorta
 * su texto ni se encima con otro control, en 5 anchos, claro y oscuro, y con el
 * texto del sistema al 200 %.
 *
 * Recorre las pantallas del portal de clientes (src/features/cliente/): armar
 * pedido (vacío, con productos, filtros y búsqueda sin resultados), menú,
 * tutorial completo, resumen para enviar y para editar, festejos, «Mis pedidos»
 * con cada estado, y los estados de cuenta sin vincular y sin pedidos.
 *
 * Corre la app con un Supabase falso: sesión de cliente armada a mano y las
 * funciones comercial.cliente_* respondidas desde acá.
 * Capturas: CAPTURAS=antes|despues npx playwright test → docs/capturas/pedidos/.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { CLAVE_SESION, NOMBRES, prepararPortal, sesion } from './portal-falso';

const ANCHOS = [320, 360, 390, 768, 1280];
const MODOS = [
  { nombre: 'claro', oscuro: false, texto: 100 },
  { nombre: 'oscuro', oscuro: true, texto: 100 },
  { nombre: 'texto200', oscuro: false, texto: 200 },
];
const CAPTURAS = process.env.CAPTURAS;

interface Falla {
  tipo: string;
  control: string;
  otro?: string;
}

/**
 * Recorre los controles visibles: texto recortado (scrollWidth > clientWidth en
 * el control o en algo de adentro), cajas encimadas en la misma capa, y el
 * texto de «Deslizá…» debajo de la manija.
 */
function revisarControles(page: Page): Promise<Falla[]> {
  return page.evaluate(() => {
    const SEL =
      'button, a[href], [role="button"], [role="slider"], [role="radio"], .slide-commit';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== 'hidden' &&
        // Dentro de content-visibility:auto fuera de pantalla no hay cajas reales.
        el.checkVisibility({ contentVisibilityAuto: true }) &&
        el.closest('[aria-hidden="true"]') === null
      );
    };
    const nombre = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || el.className.toString())
        .trim()
        .slice(0, 60);
    // Capa: el ancestro fijo o pegajoso más cercano (o el documento).
    const capa = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') return e;
      }
      return document.body;
    };
    // Con un diálogo abierto, lo de atrás queda bajo el velo: se revisa el diálogo.
    const raiz = [...document.querySelectorAll('[role="dialog"]')].at(-1) ?? document;
    const controles = [...raiz.querySelectorAll(SEL)].filter(
      (el) => visible(el) && !el.parentElement?.closest(SEL),
    );
    const fallas: { tipo: string; control: string; otro?: string }[] = [];

    for (const c of controles) {
      for (const e of [c, ...c.querySelectorAll('*')]) {
        // ≤ 2 px: texto solo para lectores de pantalla, oculto a propósito.
        if (!(e instanceof HTMLElement) || e.clientWidth <= 2) continue;
        if (e.scrollWidth > e.clientWidth + 1) {
          fallas.push({
            tipo: 'recortado',
            control: nombre(c),
            otro: e.className.toString().slice(0, 50),
          });
          break;
        }
      }
      const r = c.getBoundingClientRect();
      if (r.right > document.documentElement.clientWidth + 1 || r.left < -1) {
        fallas.push({ tipo: 'fuera de pantalla', control: nombre(c) });
      }
    }

    for (let i = 0; i < controles.length; i++) {
      for (let j = i + 1; j < controles.length; j++) {
        const a = controles[i]!;
        const b = controles[j]!;
        if (capa(a) !== capa(b) || a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const ancho = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const alto = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ancho > 1 && alto > 1)
          fallas.push({ tipo: 'encimado', control: nombre(a), otro: nombre(b) });
      }
    }

    // SlideCommit en reposo: la manija ocupa un cuadrado a la izquierda.
    for (const s of document.querySelectorAll('.slide-commit')) {
      const pista = s.getBoundingClientRect();
      const texto = s.querySelector('.slide-commit__text--plain');
      if (!texto) continue;
      const rango = document.createRange();
      rango.selectNodeContents(texto);
      const rt = rango.getBoundingClientRect();
      if (rt.left < pista.left + pista.height - 2 || rt.right > pista.right + 1) {
        fallas.push({ tipo: 'texto bajo la manija', control: nombre(texto) });
      }
    }
    return fallas;
  });
}

/** Con la página al fondo, lo último del contenido queda arriba de la barra fija. */
async function revisarPie(page: Page, barra: string): Promise<Falla[]> {
  return page.evaluate(async (selBarra) => {
    // Dos pasadas: al llegar al fondo se despliegan tarjetas salteadas (content-visibility) y el alto cambia.
    for (let i = 0; i < 3; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const b = document.querySelector(selBarra);
    if (!b) return [];
    const tope = b.getBoundingClientRect().top;
    const ultimos = [
      ...document.querySelectorAll('.cli-tarjeta button, .cli-tarjeta input'),
    ].filter((e) => !b.contains(e));
    const ultimo = ultimos.at(-1);
    if (!ultimo) return [];
    return ultimo.getBoundingClientRect().bottom > tope + 1
      ? [
          {
            tipo: 'tapado por la barra',
            control: ultimo.getAttribute('aria-label') ?? '',
          },
        ]
      : [];
  }, barra);
}

/**
 * Espera a que terminen las transiciones en curso (Stepper, Collapse, Drawer, Modal).
 * Solo las que corren: con movimiento reducido algunas quedan en pausa y su
 * `finished` no se resuelve nunca. Tope de 2 s por las dudas.
 */
async function quieto(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              Number.isFinite(a.effect?.getComputedTiming().endTime),
          )
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((r) => setTimeout(r, 2000)),
    ]),
  );
}

/**
 * Toca un control como lo haría el cliente. Si algo lo tapa o queda fuera de la
 * pantalla, lo anota como falla y lo activa igual para seguir el recorrido.
 */
async function tocar(loc: Locator, fallas: Falla[], donde: string) {
  await loc.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
  try {
    await loc.click({ timeout: 5000 });
  } catch (e) {
    const motivo = /intercepts pointer events/.test(String(e))
      ? 'tapado por otro elemento'
      : /outside of the viewport/.test(String(e))
        ? 'fuera de pantalla al tocar'
        : 'no se puede tocar';
    fallas.push({
      tipo: motivo,
      control: `${donde}: ${(await loc.getAttribute('aria-label')) ?? ''}`,
    });
    await loc.dispatchEvent('click');
  }
}

/** Confirma el SlideCommit (equivale a deslizarlo hasta el final). */
async function deslizar(page: Page) {
  // Por teclado (End confirma, SlideCommit.jsx onKeyDown): el arrastre con mouse
  // sintético no es confiable y esta prueba mide diseño, no el gesto.
  const manija = page.locator('.slide-commit__capsule').first();
  await manija.focus();
  await manija.press('End');
}

async function captura(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  await page.screenshot({
    path: `docs/capturas/pedidos/${CAPTURAS}/${nombre}.jpg`,
    type: 'jpeg',
    quality: 60,
  });
}

for (const modo of MODOS) {
  for (const ancho of ANCHOS) {
    test(`botones del portal a ${ancho}px, ${modo.nombre}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: ancho < 768 ? 720 : 900 });
      const escenario = await prepararPortal(page, modo.oscuro, modo.texto);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const fallas: Record<string, Falla[]> = {};
      const sufijo = `${ancho}-${modo.nombre}`;
      const buscador = page.getByPlaceholder('Buscá por nombre o código');
      const uno = (i: number) =>
        page.getByRole('button', { name: `Uno más de ${NOMBRES[i]}` });

      // 1. Armar pedido vacío: lo que ve el cliente antes de agregar nada.
      await expect(uno(0)).toBeVisible({ timeout: 30_000 });
      fallas.inicial = await revisarControles(page);
      await captura(page, `inicial-${sufijo}`);

      // 2. Búsqueda sin resultados, y el botón que la borra.
      await buscador.fill('zzqx');
      await expect(page.getByText(/No encontramos/)).toBeVisible();
      fallas.sinResultados = await revisarControles(page);
      await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
      await expect(page.getByText(/No encontramos/)).toBeHidden();
      await quieto(page);

      // 3. Menú «Más opciones», abierto.
      await page.getByRole('button', { name: 'Más opciones' }).click();
      await expect(page.getByRole('menuitem', { name: 'Ver cómo se usa' })).toBeVisible();
      fallas.menu = await revisarControles(page);
      await captura(page, `menu-${sufijo}`);

      // 4. Tutorial desde el menú: cada paso, hasta «¡Empezar!», que cierra.
      await page.getByRole('menuitem', { name: 'Ver cómo se usa' }).click();
      const tutorial = page
        .getByRole('dialog')
        .filter({ hasText: 'Así se arma tu pedido' });
      await expect(tutorial).toBeVisible();
      await quieto(page);
      fallas.tutorial1 = await revisarControles(page);
      await captura(page, `tutorial1-${sufijo}`);
      for (const paso of [2, 3, 4]) {
        await tutorial.getByRole('button', { name: 'Siguiente', exact: true }).click();
        await quieto(page);
        fallas[`tutorial${paso}`] = await revisarControles(page);
        await captura(page, `tutorial${paso}-${sufijo}`);
      }
      await tutorial.getByRole('button', { name: '¡Empezar!' }).click();
      await expect(tutorial).toBeHidden();
      await quieto(page);

      // 5. Armar pedido con productos, y los filtros «Lo que llevo» y «Uñas».
      fallas.tocar = [];
      await tocar(uno(0), fallas.tocar, 'armar');
      await tocar(uno(1), fallas.tocar, 'armar');
      await tocar(uno(6), fallas.tocar, 'armar');
      fallas.armar = await revisarControles(page);
      fallas.pie = await revisarPie(page, '.cli-barra');
      await page.evaluate(() => window.scrollTo(0, 0));
      await captura(page, `armar-${sufijo}`);
      await page.getByText('Lo que llevo (3)', { exact: true }).click();
      fallas.loQueLlevo = await revisarControles(page);
      await page.getByText('Lo que llevo (3)', { exact: true }).click();
      await page.getByText('Uñas', { exact: true }).click();
      fallas.rubro = await revisarControles(page);
      await page.getByText('Todo', { exact: true }).click();
      await quieto(page);

      // 6. Resumen para enviar: el cajón con el total y el deslizador.
      await page.getByRole('button', { name: /Ver pedido/ }).click();
      const cajon = page.getByRole('dialog');
      await expect(cajon.locator('.slide-commit')).toBeVisible();
      await quieto(page);
      fallas.resumenNuevo = await revisarControles(page);
      await cajon.locator('.slide-commit').scrollIntoViewIfNeeded();
      fallas.resumenNuevoPie = await revisarControles(page);
      await captura(page, `resumen-nuevo-${sufijo}`);
      await page.keyboard.press('Escape');
      await expect(cajon).toBeHidden();
      await quieto(page);

      // 7. Mis pedidos: la lista cerrada, y cada tarjeta abierta según su estado.
      await page.getByRole('radio', { name: /Mis pedidos/ }).click();
      await expect(page.getByRole('button', { name: 'V-DEMO-5' })).toBeVisible();
      await quieto(page);
      fallas.pedidosLista = await revisarControles(page);
      await captura(page, `lista-${sufijo}`);

      await page.getByRole('button', { name: 'V-DEMO-5' }).click();
      await quieto(page);
      fallas.pedidos = await revisarControles(page);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      fallas.confirmar = await revisarControles(page);
      await captura(page, `pedidos-${sufijo}`);

      for (const [numero, clave] of [
        ['V-DEMO-4', 'pedidosEnProduccion'],
        ['V-DEMO-3', 'pedidosEnCamino'],
        ['V-DEMO-2', 'pedidosFinalizado'],
        ['V-DEMO-1', 'pedidosCancelado'],
      ] as const) {
        await page.getByRole('button', { name: numero }).click();
        await quieto(page);
        fallas[clave] = await revisarControles(page);
      }

      // 8. Editar el pendiente: el armado en modo edición y el resumen con los textos más largos.
      await page.getByRole('button', { name: 'V-DEMO-5' }).click();
      await page.getByRole('button', { name: 'Editar', exact: true }).click();
      await expect(page.getByRole('radio', { name: /Editando V-DEMO-5/ })).toBeVisible();
      await quieto(page);
      fallas.editando = await revisarControles(page);
      await page.getByRole('button', { name: /Ver pedido/ }).click();
      await expect(cajon.locator('.slide-commit')).toBeVisible();
      await quieto(page);
      fallas.resumen = await revisarControles(page);
      await cajon.locator('.slide-commit').scrollIntoViewIfNeeded();
      fallas.resumenPie = await revisarControles(page);
      await captura(page, `resumen-${sufijo}`);

      // 9. Guardar la edición: el festejo y el regreso a «Mis pedidos».
      await deslizar(page);
      await expect(
        page.getByRole('heading', { name: '¡Cambios guardados!' }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await quieto(page);
      fallas.festejoEditado = await revisarControles(page);
      await page.getByRole('button', { name: 'Ver mis pedidos' }).click();
      await quieto(page);
      fallas.pedidosTrasEditar = await revisarControles(page);

      // 10. Repetir un pedido anterior y enviarlo: el festejo de «¡Pedido enviado!».
      await page.getByRole('button', { name: 'V-DEMO-4' }).click();
      await page
        .locator('.cli-tarjeta', { hasText: 'V-DEMO-4' })
        .getByRole('button', { name: 'Repetir', exact: true })
        .click();
      await expect(page.getByRole('button', { name: /Ver pedido/ })).toBeVisible();
      await quieto(page);
      fallas.repetir = await revisarControles(page);
      fallas.repetirPie = await revisarPie(page, '.cli-barra');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: /Ver pedido/ }).click();
      await expect(cajon.locator('.slide-commit')).toBeVisible();
      await deslizar(page);
      await expect(page.getByRole('heading', { name: '¡Pedido enviado!' })).toBeVisible({
        timeout: 15_000,
      });
      await quieto(page);
      fallas.festejo = await revisarControles(page);
      await captura(page, `festejo-${sufijo}`);
      await page.getByRole('button', { name: 'Ver mis pedidos' }).click();
      await quieto(page);
      fallas.pedidosTrasEnviar = await revisarControles(page);

      // 11. Cuenta sin vincular: «¡Ya casi!» con los botones de reintentar y salir.
      await page.evaluate(({ clave, valor }) => sessionStorage.setItem(clave, valor), {
        clave: CLAVE_SESION,
        valor: sesion(false),
      });
      escenario.perfilCaido = true;
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '¡Ya casi!' })).toBeVisible();
      fallas.sinVincular = await revisarControles(page);
      await captura(page, `sin-vincular-${sufijo}`);

      // 12. Cuenta vinculada sin pedidos: «Mis pedidos» vacío.
      escenario.perfilCaido = false;
      await page.getByRole('button', { name: 'Ya me avisaron, probar de nuevo' }).click();
      await expect(uno(0)).toBeVisible({ timeout: 30_000 });
      await page.getByRole('radio', { name: /Mis pedidos/ }).click();
      await expect(page.getByText('Todavía no hiciste pedidos')).toBeVisible();
      await quieto(page);
      fallas.sinPedidos = await revisarControles(page);
      await captura(page, `sin-pedidos-${sufijo}`);

      const todas = Object.entries(fallas).flatMap(([donde, f]) =>
        f.map((x) => ({ donde, ...x })),
      );
      expect(
        todas.map(
          (f) => `${f.donde} · ${f.tipo} · ${f.control}${f.otro ? ` ↔ ${f.otro}` : ''}`,
        ),
      ).toEqual([]);
    });
  }
}
