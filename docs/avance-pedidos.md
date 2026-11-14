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
12. **P3 y las migraciones de #111 (2026-11-12):** la cadena sale de `8abb957` (#110), sin #111 ni #112.
    - Decisión conservadora: P3 sale de la rama de P2 y se le mergea `origin/main` (que ya trae #111 y #112), sin rebase ni `--force`.
    - Así P3 contiene las migraciones de #111 y conserva la cadena P1 → P2 → P3.
    - Se mergea `main` y no solo la rama de #111 porque #112 corrige a #111, y dejar #111 sin su corrección no tiene sentido.
13. **Chequeo «base desde cero» de NS-397 y NS-398:** pendiente, no se arregla en este trabajo (pedido de Agus).
14. **Tipos generados:** `npm run db:types` lee la base alojada, donde las migraciones nuevas todavía no están aplicadas. Mientras tanto, `src/lib/database.types.ts` se ajusta a mano solo en las funciones que cambian, y hay que regenerarlo después del `db push`.
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

- Commit `a16ec00` «P1: encargo 2, prueba de pantallas del portal» (sin push). Agus dio el visto bueno el 2026-11-12 y pidió correr de corrido P1 (encargo 3) a P7.

### Corrida P1-encargo 3 a P7 (desde 2026-11-12, sin confirmación entre pasos)

Reglas que fijó Agus para esta corrida:
- **Ramas encadenadas:** cada paquete sale de la rama del anterior (P2 desde `ux/p1-botones-pedidos`, P3 desde la de P2, etc.). Un commit por paquete, sin push ni merge. La base de cada rama queda anotada en la tabla de abajo, para que Glaker revise los PR en orden.
- Antes de P3 hay que verificar que estén las migraciones de #111. El chequeo «base desde cero» de NS-397 y NS-398 no se arregla acá: queda pendiente.
- Hada sin `ANTHROPIC_API_KEY` se construye y se prueba con el modelo simulado.
- Si no existe el motor de novedades (3 bis), no se construye: los textos de cada novedad quedan redactados acá.

| Paquete | Rama | Sale de | Commit |
|---|---|---|---|
| P1 | `ux/p1-botones-pedidos` | `main` en `8abb957` (#110) | `a16ec00` (encargo 2), encargo 3 pendiente |

Hechos y decisiones al arrancar:
- **#111 no está en la base de la cadena.** Está mergeado en `main` (`774007b`), y después vino #112 (`8aa1ba0`, que anula ajustes de Romero), pero `ux/p1-botones-pedidos` salió de `8abb957`. Decisión para P3, en `Supuestos a confirmar`.
- **Material de Hada:** `assets-originales/hada/` no existía. Se copiaron desde la carpeta `App`:
  - `hada video.mp4` → `hada-video.mp4` (7,7 MB);
  - `WhatsApp Image 2026-11-12 at 11.59.13.jpeg` → `hada-1.jpeg`;
  - `…11.59.132.jpeg` → `hada-2.jpeg`.

  `assets-originales/` se agregó al `.gitignore`, porque no estaba. No hay `ffmpeg` en la máquina.
- **`ANTHROPIC_API_KEY`** no está definida en el entorno local: Hada se prueba con el modelo simulado (regla 4).
- **Causa raíz de P2:** el nombre en `gmp.productos` es «HUMECTANTE AMOR 240ml.» / «EXFOLIANTE AMOR 240ml.» (`20260911170000_carga_productos.sql:307-320`), sin «crema». Además, el portal filtra en memoria sin sacar tildes.

  Corrección: tabla nueva `comercial.productos_nombre_comercial` (nombre comercial + alias). `cliente_lista()` devuelve el nombre comercial y los alias, y el filtro del portal normaliza tildes y mayúsculas. No se usan `unaccent` ni `pg_trgm`, porque la búsqueda es en el navegador. `gmp` no se toca.

### Pausa del 2026-11-12 (pedida por Agus; se retoma al día siguiente)

Se frenaron tres subagentes a mitad de camino. Nada quedó commiteado después de `a16ec00`.
- **Encargo 3 de P1 (`implementador`, Sonnet): a medias, sin probar.** Dejó cambios en:
  - `AppCliente.tsx`, `ArmarPedido.tsx`, `MisPedidos.tsx`, `Tutorial.tsx`, `demo.ts`, `cliente.css` y `e2e/pedidos-botones.spec.ts`;
  - archivos nuevos: `src/features/cliente/TextoDual.tsx`, `e2e/portal-falso.ts` y `e2e/deslizador-arrastre.spec.ts`.

  Estaba pasando la sesión falsa del spec a `portal-falso.ts`. Al retomar: revisar el diff (`git diff`), terminar los puntos 1-8 del encargo y correr la prueba (criterio: 15/15 más el arrastre). No se corrió `tsc` ni `eslint`.
- **Borrador de migración de P2 (`implementador`, Sonnet): hecho.** Está en `supabase/tests/pglite/borradores/20261112170000_comercial_nombre_comercial_y_alias.sql`, con su suite `supabase/tests/pglite/probar_nombre_comercial.mjs` (6/6 en verde). La carpeta `borradores/` y el symlink `supabase/tests/pglite/node_modules` no se versionan. Falta:
  - la revisión de `revisor-sql`, que se cortó sin informe y hay que relanzarla;
  - escribir la migración en `supabase/migrations/`;
  - el frente de P2: filtro sin tildes que use `alias` en `ArmarPedido.tsx`, y los tipos.
- **Diseño de P3 (`arquitecto`, Fable 5.2): cortado sin respuesta.** Hay que relanzarlo con el mismo encargo, siempre antes del 17/11/2026 a las 4:59.
- Los cambios sin commitear de `.gitignore` (`assets-originales/`) y de este archivo son de la sesión principal.

### Reanudación del 2026-11-13

- `CLAUDE_CODE_SUBAGENT_MODEL` vacía y `implementador` cargado: los modelos de la tabla ya se respetan.
- En paralelo:
  - `implementador` (Sonnet) termina el encargo 3 y corre tsc, eslint y Playwright;
  - `revisor-sql` (Sonnet) revisa el borrador de P2;
  - `arquitecto` (Fable 5.2) diseña P3. Fecha del sistema: 13/11, 11:05, antes del corte.

- **P2, borrador corregido (25/25).**
  - `revisor-sql` no encontró bloqueantes; el `implementador` aplicó sus correcciones.
  - Bug encontrado al probar: la política UPDATE exigía `actualizado_por` = sesión, y Ventas no podía editar. Ahora lo sella un trigger.
  - La sesión principal agregó `id uuid unique`, para que `core.auditoria.registro_id` no quede nulo.
  - Falta el frente (filtro sin tildes con alias), que espera a que termine el encargo 3 porque toca `ArmarPedido.tsx`.
- **P3, diseño del `arquitecto`:** `docs/disenos/P3-opciones-caja.md`, con tres decisiones abiertas (D-opciones-caja-1 a 3).

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

### P2 hecho (2026-11-13, rama `pedidos-p2-busqueda`, sale de `ux/p1-botones-pedidos` en `f5d728b`)

- **Migración:** `20261113150000_comercial_nombre_comercial_y_alias.sql`.
  - El número `20261112170000` del borrador ya lo usa una migración de `main` (sanitizantes), por eso cambió.
  - Suite: `probar_nombre_comercial.mjs`, 25/25.
- **Frente:** el filtro de `ArmarPedido.tsx` usa `normalizarNombre`, que ya existía en `consultasVentas.ts`. Saca tildes y pasa a minúsculas, y busca también en los alias.
  - `ProductoCliente.alias` se agregó con `[]` por defecto.
  - `database.types.ts` se tocó a mano solo en `cliente_lista` (supuesto 14): hay que regenerarlo después del `db push`.
- **Pruebas:** `tsc` y `eslint` limpios; Playwright 19/19.
- **P1 también tiene las capturas «antes»** (`f5d728b`): con el código del portal de `8abb957`, fallan 10 de los 15 casos.
- **Pendiente menor:** React Doctor marca `jsx-no-new-function-as-prop` en `ArmarPedido.tsx:231` (`onCambiar={cambiar}`). Es anterior a P1 y no se toca.

### P3 · Revisión final del `arquitecto` (2026-11-13): «sí, con cambios»

- **Cambios obligatorios en curso:**
  - CHECK `not anulado or cantidad_opcion = 0` en `pedido_renglones`;
  - `v_cc` no puede quedar por debajo de `cantidad_opcion`;
  - el frente no manda `p_cajas: []` si `cliente_cajas` no cargó;
  - D-opciones-caja-1 a 3 en `DECISIONES_ABIERTAS.md` (hecho).
- **Bloquea el despliegue, no el commit:** Ventas todavía no tiene pantalla para repartir el surtido.
  - En `src/` nada llama a `asignar_surtido` ni lee `pedido_cajas`.
  - Con P3 en servicio, un pedido con Surtido solo se podría cancelar.
  - Hace falta la acción en la central de Ventas antes de poner P3 en servicio.
- **Orden de despliegue:** primero la migración y después el frente. Al revés, `cliente_enviar_pedido` con `p_cajas` da PGRST202.

**Supuestos a confirmar (riesgos residuales de P3):**
- **Asignado sin reserva:** si Stock, GP, un retiro o el recorte liberan la reserva, el surtido sigue «asignado».
  - Se detecta buscando `pedido_cajas` asignadas sin reserva vigente.
- **El caso l** (red sin claves de stock) corre contra `e2e/portal-falso.ts`: hay que repetirlo contra la base real después del `db push`.
- **`surtido_disponible`, después de asignar,** devuelve lo adicional, no el total: la pantalla de Ventas tiene que sumarle lo ya asignado.
- **Retiros (RN-52):** el bloqueo por retiro no se prueba en `probar_opciones_caja`, porque depende de `gmp.impedimento_despacho_orden`.
- **Flag de asignación:** Ventas con SQL directo podría prender `comercial.asignando`. Por PostgREST no se puede, y queda en `core.auditoria`.
- **Totales:** el total del portal puede diferir en centavos del de `recalcular_venta`, cuando un mismo SKU va suelto y en caja.

### P3 hecho (2026-11-13, rama `pedidos-p3-opciones-caja`, sale de P2 + merge de `origin/main`)

- **Migración:** `20261113210000_comercial_opciones_caja.sql`. El número `20261113160000` quedó tomado en `main` (#119, armado de packs).
- **Suite:** `probar_opciones_caja.mjs`, 71/71. Las suites vecinas (caja mixta, portal, descuento por caja, ventas central, venta por depósito, reservas y nombre comercial) también en verde.
- **Frente:**
  - `CajasAromas.tsx`, con las 8 opciones y los sets de 3;
  - la barra del pie en una sola línea en celular (el aviso de escala pasa al resumen);
  - `p_cajas` va `null` si `cliente_cajas` no cargó.
- **Pruebas:** `tsc` limpio. Playwright 22/22 dos veces seguidas, corridas por la sesión principal.
- **Subagentes:** `arquitecto` (diseño y revisión final), `implementador` ×6, `revisor-sql` ×1. Sin escalar.
- **`reconstruir.mjs`:** omite `20261113130000`, que viene de `main` y mezcla esquema con el arreglo de OP-2026-0008. Ver el comentario en el archivo.

### P4 en curso (2026-11-13, rama `pedidos-p4-fusebutton`, sale de P3 `6c4ab2a`)

- **Licencia de React Bits, verificada el 2026-11-13** en `LICENSE.md` de `DavidHDev/react-bits` (`main`): «MIT + Commons Clause License Condition v1.0».
  - Permite usar, copiar y modificar los componentes «as part of an application, website, or product».
  - Prohíbe vender, sublicenciar o redistribuir los componentes en sí.
  - Copiarlos dentro de la app está permitido.
- **P2 renumerada:** `main` tomó `20261113150000` (#118, tandas), así que la migración de P2 pasa a `20261113200000`.
  - El hook bloquea mover migraciones; lo corre Agus en el worktree `p2-renumera` (autorizado el 2026-11-13).
- **P4 hecho:**
  - `src/components/reactbits/FuseButton.{jsx,css,d.ts}`, con íconos de Tabler, `inert` para React 18 y Escape que no cierra el Drawer;
  - la mecha se cancela al ocultar la pestaña o al desmontar.
  - Reemplaza la papelera de cada SKU y de cada caja en el resumen.
  - **Pruebas:** Playwright 26/26, dos veces; `tsc` y `eslint` limpios. `implementador`, sin escalar (un corte por límite de uso, retomado).

### Pausa del 2026-11-13 (pedida por Agus: se acaban los créditos)

- **Commiteados:**

  | Paquete | Rama | Commit |
  |---|---|---|
  | P1 | `ux/p1-botones-pedidos` | `f5d728b` |
  | P2 | `pedidos-p2-busqueda` | `93bc75f` |
  | P3 | `pedidos-p3-opciones-caja` | `6c4ab2a` |
  | P4 | `pedidos-p4-fusebutton` | `0907985` |

- **P2 sin renumerar:** la migración `20261113150000` choca con #118 de `main`. Agus tiene que correr `git mv` en el worktree `p2-renumera` (pasa a `20261113200000`). Después hay que commitear en P2, mergear P2 en P3, P4 y P5, y actualizar las referencias.
- **P5 (rama `pedidos-p5-flipcard`):** se cortó a medias, sin probar y sin commit.
  - Archivos: `FlipCard.*`, `GradualBlur.*`, `MisPedidos.tsx`, `cliente.css`, `e2e/pedidos-flipcard.spec.ts` y `e2e/pedidos-botones.spec.ts`.
- **P6:**
  - Diseño en `docs/disenos/P6-hada.md`.
  - El servidor se cortó a medias, sin commit:
    - `supabase/functions/hada/`, `_shared/hada.ts`, `_shared/hada.test.ts` y `pglite/probar_hada.mjs`;
    - los borradores en `pglite/borradores/`.
  - Al retomarlo, primero hay que correr `tsc`, `eslint` y las pruebas.
- **El `arquitecto` vence el 17/11 a las 4:59.** Falta su revisión final de P6. Después de esa fecha, la hace la sesión principal.
- **P5 hecho:**
  - `FlipCard` y `GradualBlur` en `src/components/reactbits/`; la tarjeta gira solo con botones, mide su alto y hay una sola girada a la vez.
  - El dorso muestra el detalle y «Editar en el armado», que abre el flujo actual: no duplica la lógica de envío. Si el pedido no es editable, es de solo lectura.
  - El blur va al pie de «Mis pedidos», sin interceptar clics.
  - Playwright 32/32 dos veces; `tsc`, `eslint` y React Doctor sin errores.
  - Queda un `vite preview` viejo en el puerto 5174 (PID 6028) que hay que cerrar a mano. Al agente le denegaron matarlo.

### P6 · Revisión final del `arquitecto` (2026-11-14): «sí, con cambios», aplicados

- **Cambios obligatorios:**
  - el encabezado de `20261113220100` nombra `HADA_ORIGENES` y `HADA_MODEL=claude-haiku-5-5`;
  - el historial de Hada se conserva solo después de una pregunta (antes, dos respuestas cualesquiera trababan a Hada en «no entendí»), con prueba e2e;
  - D-hada-1 a 5 están en `DECISIONES_ABIERTAS.md`.
- **Recomendados que se aplicaron:**
  - `MAX_TOKENS_SALIDA` sube de 700 a 1500, porque 25 renglones no entraban;
  - el frente descarta cantidades de 0 o menos.
- **Base:** subió zod de 4.5.4 a 4.6.7 (aviso GHSA-mrhx-c7xc-m3w5), en `package.json` y en `hada/deno.json`. `npm audit` da 0.

**Supuestos a confirmar (riesgos residuales de P6):**
- **Orden de despliegue:** primero el `db push`, después la función y al final el frente. El frente usa `cliente_enviar_pedido_unico` en todo pedido nuevo, así que si Vercel publica antes del `db push`, ningún cliente puede enviar.
- **BYPASSRLS de `postgres`:** las escrituras de `hada_reservar` y `hada_cerrar` dependen de él bajo FORCE RLS. Hay que verificarlo en el proyecto alojado; si falta, falla cerrado con 403.
- **Nunca corrió contra Haiku real.** En la primera corrida hay que revisar:
  - `strict` con `tool_choice any`;
  - el preflight de CORS con los encabezados de supabase-js;
  - que el zod de `_shared` se resuelva por `deno.json`;
  - que `cache_read_input_tokens` sea mayor que 0.
- **Costo:** los precios son estimados; Agus tiene que fijar el tope en la consola de Anthropic.
- **Tipos:** están editados a mano. Después del push, `npm run db:types` tiene que dar diff vacío.
- **Video de Hada pendiente:** solo está el poster JPG de 10 KB, porque no hay `ffmpeg`. Falta el WebM y el MP4 de hasta 500 KB, más el `IntersectionObserver`.
- **D-hada-5**, a confirmar con Ventas.
- **`probar_hada`:** cerca de la medianoche argentina tarda hasta 200 s más.
