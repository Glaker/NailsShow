# Avance del paquete Pedidos y Hada

Plan: `docs/PROMPT_PEDIDOS_HADA.md`. Una rama por paquete desde `main`, sin merge ni
`db push` (los aplica Agus).

## Estado

| Paquete | Rama | Estado |
|---|---|---|
| P0 Relevamiento | `pedidos-p0` | Hecho (2026-11-12) |
| P1 Botones | — | Pendiente |
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

## Registro de subagentes

| Paquete | Tarea | Subagente | Modelo | Escaló |
|---|---|---|---|---|
| P0 | Relevamiento | `explorador` | Haiku 5.5 pedido (la variable de entorno lo fuerza a Sonnet) | No |

## Archivos tocados (P0)

- `docs/PROMPT_PEDIDOS_HADA.md` (plan)
- `docs/avance-pedidos.md`
- `.claude/agents/`: `revisor-sql.md` (`model: sonnet`), y nuevos `implementador.md`, `revisor-seguridad.md`, `revisor-gmp.md` y `arquitecto.md`
