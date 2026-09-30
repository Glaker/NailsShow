# Pruebas funcionales sobre PGlite

Reconstruyen la base desde cero con **todas** las migraciones de
`supabase/migrations/` sobre PGlite (Postgres 18 en WASM), sin Docker ni
instancia local, y prueban cada circuito con sesiones reales de cada rol (RLS
incluida). Son evidencia de calificación operacional junto con pgTAP.

```sh
cd supabase/tests/pglite
npm install          # una vez: @electric-sql/pglite, solo para esta carpeta
node probar_calle5.mjs
```

Cada archivo imprime `N en verde, M en rojo` y sale con código ≠ 0 si algo
falla. `lib.mjs` trae el andamio (`banco()`, `prueba`, `rechaza`, `como`,
`usuario`, `invariantes`); `reconstruir.mjs` aplica las migraciones en orden.

**Borradores.** Una migración escrita no se edita (CLAUDE.md §6). Para probar
una antes de escribirla, ponerla en `borradores/` (no versionada): la
reconstrucción la aplica en su lugar por orden de nombre.

| Archivo | Qué prueba |
| --- | --- |
| `probar_comprobantes.mjs` | comprobantes de proveedor (A/B/C/NC/sin factura), inmutabilidad, anulación |
| `probar_calle5.mjs` | reservas de PT, despacho completo o con faltantes, falta producir, destino en «Terminado» |
| `probar_tesoreria.mjs` | cajas y bancos, conciliación, pagos con imputación (RN-63), solicitudes, IVA, traza de compras |
| `probar_cobros.mjs` | cobros e imputación, antigüedad, cash flow, ventas y resultado |
| `probar_ventas.mjs` | permisos del rol VENTAS |
| `probar_precios.mjs` | precios versionados, descuentos por cliente, precio sugerido |
| `probar_plan.mjs` | planificación de la producción |
| `probar_visibilidad.mjs` | visibilidad de pantallas por rol, lectura del administrador |
| `probar_ordenes.mjs` | especificaciones, órdenes de producción, etapas, liberación |
| `probar_traza.mjs` | trazabilidad del lote hacia atrás y hacia adelante |
| `probar_quitar.mjs` | quitar componente de fórmula y material sin DELETE; DELETE revocado |
| `probar_notas_credito.mjs` | nota de crédito total, refacturar, varios emisores, Factura C, restas en cuenta corriente y ventas |
| `probar_lote_pt.mjs` | lote en producto terminado: retenido hasta liberar, sin lote primero, Calle 5 solo liberado (RN-51, R-09) |
| `probar_manual_formulas.mjs` | carga del manual de fórmulas v10: 44 en borrador, % que reproducen los kg, procedimientos por aroma |
| `probar_flujo.mjs` | flujo de caja diario, detalle del día y volúmenes por contraparte para el inicio de Administración |
| `probar_descarte.mjs` | dar de baja todo el stock de un artículo (descarte «Discontinuado» por posición) |

`probar_facturas` (sesiones anteriores) necesita el token de Afip SDK y red, y
no está acá.
