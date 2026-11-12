# Avance del paquete Pedidos y Hada

Plan: `docs/PROMPT_PEDIDOS_HADA.md`. Una rama por paquete desde `main`, sin merge ni
`db push` (los aplica Agus).

## Estado

| Paquete | Rama | Estado |
|---|---|---|
| P0 Relevamiento | `pedidos-p0` | Hecho (2026-11-12) |
| P1 Botones | `ux/p1-botones-pedidos` | Encargos escritos, esperando confirmación de Agus |
| P2 Búsqueda «crema» | — | Pendiente |
| P3 Opciones por caja | — | Pendiente |
| P4 FuseButton | — | Pendiente |
| P5 FlipCard y GradualBlur | — | Pendiente |
| P6 Hada | — | Pendiente |
| P7 Cierre | — | Pendiente |

## Hallazgos (P0)

**Entorno**
- React 18.3.1: `inert` va como `inert={cond ? '' : undefined}` (P4, P5).
- Íconos: `@tabler/icons-react` (el de toda la app) y también `@hugeicons/react` + `@hugeicons/core-free-icons` instalados.
- `motion` 14.6.0 instalado. Vitest 5, Testing Library y jsdom instalados (`npm test`). CLAUDE.md §2 dice lo contrario: está desactualizado.
- **No hay Playwright** ni `ffmpeg`.
- `docs/reactbits-fuentes.md` existe pero está **vacío** (0 bytes, sin trackear). React Bits vive hoy en `src/vendor/reactbits/`; `src/components/reactbits/` no existe.
- No existen `docs/PLAN_SIMPLIFICACION_WANDEL.md`, `src/novedades/` ni `assets-originales/hada/`.
- `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` está definida y pisa el modelo de todos los subagentes.

**Pedido de venta**
- `comercial.pedidos` y `comercial.pedido_renglones` (20260917120000).
- Desde #106 (2026-11-12) el pedido es **por unidad**: `cantidad` en unidades, `unidades_pack` = 1 y el pack queda como `minimo` en la lista.
- Las cajas existen solo como descuento:
  - `comercial.descuentos_caja` (20261102130000) tiene `unidades_caja` por producto;
  - el renglón lleva `descuento_caja_pct` y `cantidad_caja` (unidades en caja cerrada, 20261103120000).
- Estados (`comercial.estado_pedido_enum`): BORRADOR, ESPERANDO_FECHA, FECHA_PROPUESTA, CONFIRMADO, EN_PRODUCCION, CUMPLIDO, CANCELADO.
- Transiciones: `comercial.fn_pedido_transicion` (20261019130100:444-543), que no chequea roles. Los roles los controlan las funciones:
  - Ventas y Administración: `enviar_venta`, `aprobar_venta_reservada`, `finalizar_pedido_venta`;
  - Gerencia de Producción: propone la fecha (política de `propuestas_fecha`);
  - el cliente edita o cancela solo en BORRADOR (`cliente_enviar_pedido`, `cliente_cancelar_pedido`).
- Para el cliente, el pedido es editable solo en BORRADOR (antes de que Ventas pida fecha o apruebe).

**Aromas (gmp.productos.familia / variante, 20261105170000)**
- Hay un SKU por aroma y presentación. Códigos por familia (AMOR / AIRE / PAZ):

  | Familia | AMOR | AIRE | PAZ |
  |---|---|---|---|
  | Humectante | 370, 373 | 371, 374 | 372, 375 |
  | Exfoliante | 364, 367 | 365, 368 | 366, 369 |
  | Aceite de cutícula | 378, 381 | 379, 382 | 380, 383 |
  | Sanitizante | 391, 392, NS-397 | 393, 394, NS-398 | 395, 396, NS-399 |

- No existe ninguna asignación de variedades en pedidos.
- «Mati» es Matías Alonso, con rol **VENTAS** (20261001150000).

**Búsqueda del portal**
- `src/features/cliente/ArmarPedido.tsx:109-119` filtra en memoria por `producto`, `codigo` y `rubro`. Usa `toLowerCase`, pero no saca tildes.
- El nombre viene de `gmp.productos.nombre` vía `comercial.v_lista_mayorista` (el nombre de producción, no uno comercial).
- No hay `unaccent` ni `pg_trgm`.

**Textos y componentes (todos del portal de clientes)**
- «Mantené apretado para borrar todo / descartar los cambios»: `ArmarPedido.tsx:588-603` (`HoldButton`).
- «Deslizá para enviar / guardar»: `ArmarPedido.tsx:558-562` (`SlideCommit`).
- «Repetir» y «Cancelar»: `MisPedidos.tsx:201-227`.
- La papelera por línea está en `ArmarPedido.tsx`, en `ResumenPedido`.
- Bases: `src/vendor/reactbits/HoldButton.{jsx,css}` y `SlideCommit.{jsx,css}`.

**Sesión, Giorgio y Edge Functions**
- Los clientes **inician sesión**: rol CLIENTE, JWT sin rol interno con `es_cliente`, y `es_demo` para la cuenta de prueba.
- `App.tsx:36` monta `AppCliente` fuera del `Layout`.
- Giorgio vive en `src/app/giorgio/` y en `supabase/functions/giorgio`. Solo aparece en el `Layout` interno (`layout.tsx:538`), así que el cliente nunca lo ve y Hada no se superpone con él.
- Edge Functions: `emitir-factura`, `giorgio`, `series-oficiales`, más `_shared/`.
- Giorgio ya usa `ANTHROPIC_API_KEY` y el modelo por variable (`GIORGIO_MODELO`, por defecto `claude-haiku-5-5`). Hada puede copiar ese patrón.
- No hay sistema de novedades. El único tutorial es el del portal (`src/features/cliente/Tutorial.tsx`).

## Supuestos a confirmar

1. **P1 necesita Playwright**, que no está instalado. Es una dependencia de desarrollo nueva, que se justificará en el PR.
2. **P3 asume venta por caja**, pero hoy se vende por unidad: la caja es solo un descuento, con `unidades_caja` por producto. Conservador: la opción por caja se suma como una forma de cargar cajas de un producto con aromas, con las unidades de caja de `descuentos_caja`, sin cambiar la venta por unidad del resto. La decide el `arquitecto` en P3.
3. **Familias de P3 (confirmado por Agus, 2026-11-12):** las opciones por aroma aplican a las cuatro familias con AMOR/AIRE/PAZ: Humectante, Exfoliante (las cremas), Aceite de cutícula y Sanitizante. Reemplaza el supuesto 1 del plan, que nombraba solo las cremas. Sanitizante tiene tres presentaciones por aroma (391/392/NS-397 y siguientes).
4. **Una caja de Humectante «Amor y Paz»** son dos SKU distintos (370 y 372). La caja mixta se arma como dos renglones con la mitad de unidades cada uno.
5. **El rol que asigna el surtido es VENTAS** (Matías Alonso), también Administración.
6. **FuseButton (P4):** se usan íconos de `@tabler/icons-react`, que es la librería de toda la app, aunque `@hugeicons/react` también esté instalado.
7. **Ubicación de React Bits:** los componentes nuevos van a `src/components/reactbits/`, como dice el plan, aunque los anteriores estén en `src/vendor/reactbits/`.
8. **Mensajes de novedades (3 bis):** la especificación está en `docs/PLAN_SIMPLIFICACION_WANDEL.md`, que no existe. En P7 se arma un registro mínimo en `src/novedades/registro.ts`.
9. **Material de Hada:** no hay video ni fotos (`assets-originales/hada/` no existe), así que P6 arranca con un avatar en SVG/CSS y el video se suma cuando llegue. `ffmpeg` no está; se usaría `ffmpeg-static` como dependencia de desarrollo.
10. **Hada necesita `ANTHROPIC_API_KEY`** en los secretos de Supabase (ya existe para Giorgio) y un tope de gasto en la consola de Anthropic. Lo revisa Agus.
11. **Subagentes nuevos:** `implementador`, `revisor-seguridad`, `revisor-gmp` y `arquitecto` se crearon en esta rama. Puede hacer falta reabrir la sesión para que Claude Code los cargue.

## P1 · Encargos (rama `ux/p1-botones-pedidos`, desde `main`)

Diagnóstico previo, hecho por la sesión principal en una rama equivocada
(`pedidos-p1`, desde `pedidos-p0`; queda sin commitear en el worktree
`coma-decimal` como referencia, no se mezcla). Causas raíz encontradas al
reproducir con Playwright, a 320 px:

- Mantine `Button`: altura fija en px, y etiqueta con `white-space: nowrap` + `overflow: hidden`. Por eso se cortan «Repetir», «Cancelar», «¿Seguro? Cancelar», «+ Pack» y «Ver pedido».
- `Group grow` en `MisPedidos.tsx` limita cada botón a 1/3 del ancho.
- `HoldButton`: altura fija y `nowrap`, así que «Mantené apretado para descartar los cambios» se sale del botón.
- `SlideCommit`: el texto se centra en toda la pista y la manija, en reposo, queda encima de «Deslizá…».
- Con el texto al 200 %:
  - `ActionIcon` y `NumberInput` miden en rem y la fila de cantidad no entra;
  - el «+» de la tarjeta y el «Sacar» del resumen salen de pantalla;
  - las `Badge` se recortan;
  - el `pb={190}` fijo de la lista no alcanza y la barra tapa la última tarjeta.

Encargos, en este orden (1 y 2 en paralelo; 3 depende de 1; 4 al final):

| # | Encargo | Subagente | Modelo |
|---|---|---|---|
| 1 | **Tokens y componentes base.** En `src/features/cliente/cliente.css`, reglas acotadas al portal (`.cli-fondo` y `.cli-portal` para lo que Mantine monta en portales): `Button` y `Badge` con altura mínima en vez de fija, etiqueta que parte renglón (`white-space: normal`, `text-wrap: balance`), `flex-wrap` en `.mantine-Button-inner` y relleno lateral menor por debajo de 420 px. Clases `cli-hold` (HoldButton: `min-height`, texto que parte renglón) y `cli-slide` (SlideCommit: texto a la derecha de la manija, `left: calc(var(--sc-radius) * 2)`). Los archivos de `src/vendor/reactbits/` no se editan. | `implementador` | Sonnet 5.5 |
| 2 | **Prueba de anchos.** Instalar `@playwright/test` con versión fija como dependencia de desarrollo, más Chromium. Crear `playwright.config.ts` (`vite build` + `vite preview` en el puerto 5174, con un Supabase falso por variables de entorno) y `e2e/pedidos-botones.spec.ts`. Recorre armar pedido, «Mis pedidos» (con «¿Seguro? Cancelar») y el resumen en modo edición, en 320, 360, 390, 768 y 1280 px, en claro, oscuro y con el texto al 200 %. Falla si `scrollWidth > clientWidth` (ignorando lo que mide 2 px o menos, que es texto solo para lectores de pantalla), si un control se superpone con otro de la misma capa, si el texto de «Deslizá…» queda bajo la manija, o si la barra fija tapa la última tarjeta. Capturas en `docs/capturas/pedidos/{antes,despues}/` con `CAPTURAS=antes\|despues`. `dist-e2e/` y `test-results/` van a `.gitignore`. Corre primero la versión «antes», sin los cambios de 1 y 3. | `corredor-de-pruebas` | Haiku 5.5 |
| 3 | **Correcciones de los botones** (`ArmarPedido.tsx`, `MisPedidos.tsx`), aplicando las clases de 1. Cuatro cambios:<br>• `className="cli-hold"` al `HoldButton`, `className="cli-slide"` al `SlideCommit` y `className="cli-portal"` al `Drawer`.<br>• `preventGrowOverflow={false}` en el `Group grow` de Mis pedidos.<br>• La fila de cantidad de la tarjeta y la del resumen parten renglón (`ml="auto"` en el grupo de botones), y `ActionIcon` y `NumberInput` pasan a px fijos (`'--ai-size'`).<br>• El `pb` de la lista sale de medir la barra con `useElementSize`, y el resumen lleva `env(safe-area-inset-bottom)` al pie. | `armador-de-pantallas` | Haiku 5.5 |
| 4 | **Cierre de P1.** Corre la prueba «después» (los 15 casos en verde), más `tsc`, `eslint` y `npm test`. | `corredor-de-pruebas` | Haiku 5.5 |

Avisos antes de delegar:

- `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` sigue definida, así que los encargos «Haiku» correrán en Sonnet.
- El subagente `implementador` no figura entre los disponibles en esta sesión: Claude Code lo carga recién al reabrir la sesión. Si no aparece, el encargo 1 lo toma `armador-de-pantallas`, y lo anoto como escalado inverso.
- El encargo 2 tiene que escribir archivos, y `corredor-de-pruebas` solo tiene Bash, Read y Grep. Puede crearlos con Bash, aunque su definición dice que no edita. Si se prefiere, los archivos de la prueba los escribe `armador-de-pantallas` y `corredor-de-pruebas` solo los corre.
- Criterio de cierre: los 15 casos en verde y las capturas «antes» y «después» en `docs/capturas/pedidos/`.

### Corrección del entorno antes de delegar P1 (2026-11-12)

- **Archivo:** `.claude/settings.local.json` en la raíz del repo, bloque `env`. Es un archivo local: lo ignora `.git/info/exclude:9` y no se versiona.
- **Valor anterior:** `"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"`. Se quitó esa clave y `env` quedó como `{"ENABLE_STOP_REVIEW": "0"}`. El JSON sigue bien formado (validado con `node`).
- **Motivo:** la variable pisaba el campo `model` de todos los subagentes, así que lo pensado para Haiku corría en Sonnet (§1 del plan). Agus pidió quitarla el 2026-11-12.
- **Pendiente:** Claude Code lee la variable al arrancar, así que hay que cerrar y reabrir la sesión. Al reabrir, verificar que la variable esté vacía y que `implementador` figure entre los subagentes. Recién entonces arranca el encargo 1.

### Encargo 1 hecho (2026-11-12)

- Se agregaron reglas en `src/features/cliente/cliente.css`; las escribió `implementador` y Agus pidió tres ajustes:
  - **Etiqueta del botón:** se sacó `flex-wrap: wrap` de `.mantine-Button-inner` y se agregó `min-width: 0` a `.mantine-Button-label`. Así la etiqueta parte renglón al lado del ícono, sin saltar debajo de él.
  - **`cli-hold`:** HoldButton no expone ninguna variable CSS para su altura. La fija la clase `.hold-button--{sm,md,lg}`, y `--hb-h` la mide el JS, así que no sirve para configurarla. Queda `min-height: 44px`, la altura de `md`.
  - **Badge:** se sacaron las reglas de `.mantine-Badge-*`. En el diagnóstico de `pedidos-p1` (worktree `coma-decimal`), el selector de `e2e/pedidos-botones.spec.ts` no incluye badges, y los dos casos fallidos de `test-results/` (1280 claro y 320 texto200) no muestran ningún badge cortado.
- **Build:** `vite build` falla porque `@hugeicons/react` no está instalado en el `node_modules` del worktree. El CSS compila bien. Antes del encargo 2 hay que correr `npm install`.
- **Pendiente:** el encargo 2 (prueba de anchos con Playwright) no arrancó. La sesión sigue en la carpeta `NailsShow`.

### Encargo 2 (2026-11-12)

- `npm ci` en el worktree; el lock no cambió. Después, `@playwright/test` 1.56.1 con versión fija (único cambio en `package.json` y en el lock).
- `armador-de-pantallas` escribió `playwright.config.ts` y `e2e/pedidos-botones.spec.ts` sobre la base de `coma-decimal`. El recorrido cubre todo el portal: inicial, búsqueda vacía, menú, tutorial (4 pasos), armado con filtros, resumen nuevo y en edición, cada estado de «Mis pedidos», festejos, cuenta sin vincular y cuenta sin pedidos. `corredor-de-pruebas` la corrió.
- Arreglos de la prueba tras las primeras corridas: `quieto()` espera solo las animaciones en curso, con tope de 2 s (las pausadas no terminan nunca). Un control tapado o fuera de pantalla se anota como falla en vez de cortar la prueba. El SlideCommit se confirma con `End`. Se usan 2 workers con 180 s por caso.
- **Caso de 1280 px en claro, que fallaba:** no es de ancho ni de superposición. Solo pasa entero, en 16 s. Fallaba por saturación: con 4 navegadores en paralelo la página no terminaba de cargar la lista dentro del tiempo. Por eso se bajó a 2 workers.

### Para el encargo 3

- Agregar `overflow-wrap: break-word` y `hyphens: auto` a las etiquetas de los botones.
- `<html>` ya tiene `lang="es-AR"` (`index.html:2`), así que `hyphens: auto` corta con reglas del español. Verificarlo igual en la build.

## Registro de subagentes

| Paquete | Tarea | Subagente | Modelo | Escaló |
|---|---|---|---|---|
| P0 | Relevamiento | `explorador` | Haiku 5.5 pedido (la variable de entorno lo fuerza a Sonnet) | No |

## Archivos tocados (P0)

- `docs/PROMPT_PEDIDOS_HADA.md` (plan)
- `docs/avance-pedidos.md`
- `.claude/agents/`: `revisor-sql.md` (`model: sonnet`), y nuevos `implementador.md`, `revisor-seguridad.md`, `revisor-gmp.md` y `arquitecto.md`
