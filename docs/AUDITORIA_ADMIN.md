# Auditoría del módulo de Administración (Fase A)

Fecha: 2026-10-01. Solo lectura: no se tocó código, base ni migraciones.
Fuente funcional: `App/Requerimientos_App_Administracion_Nail_Show.docx` (está en
`App/`, no en `docs/`; D-34 lo cita sin ruta). Reglas: `CLAUDE.md`.
Comparación contra patrones de Holistor. `docs/ref/holistor/` (capturas de referencia)
**no existe**: los patrones se evaluaron de memoria del pedido, no contra capturas.

Alcance revisado: migraciones `20260929100000`, `120000`, `130000`, `170000`,
`20260930150000`, `180000/180100`; `src/features/administracion/`,
`src/lib/consultasAdministracion.ts`, `consultasCompras.ts`, `formato.ts`.
Quedan afuera, por estar en curso (reorganización de roles/menú, `features/ventas/`,
`TableroDT`, migraciones `2026100*` nuevas): se mencionan como "en curso".

## 1. Matriz de cobertura

Estados: **IP** implementado y probado · **IS** implementado sin tests · **P** parcial ·
**R** roto · **A** ausente.

### 1.1 Secciones 2 a 6 del documento

| # | Requerimiento | Estado | Dónde / nota |
| --- | --- | --- | --- |
| 1 | 2.1 RRHH y liquidación de sueldos | A | Espera D-34. Sin tablas ni pantallas. |
| 2 | 2.1 Comisiones | A | Ídem. |
| 3 | 2.2 Estudio contable (pendiente/preparado/enviado/observado) | A | Nada. |
| 4 | 2.2 Proveedores: ficha con facturas, NC, pagos, vencimientos, saldo | IP | `comprobantes_proveedor` (`20260929100000`), `v_cuenta_corriente_proveedores`, `v_saldos_proveedores`; `probar_tesoreria` (30), `probar_comprobantes` (25). `PaginaCuentasProveedores.tsx`. |
| 5 | 2.2 Conciliación contra saldo informado por el proveedor | IP | `conciliaciones_proveedor` + trigger `fn_conciliacion_proveedor_saldo`. |
| 6 | 2.2 Compras productivas (solicitud, factura, pago, ingreso) | IP | `v_compras_trazadas` (situación SIN_RECIBIR / SIN_COMPROBANTE / IMPAGA / CERRADA / SIN_COMPRA); test "traza de compra". |
| 7 | 2.2 Gestión de pagos: solicitudes de todas las áreas | IP | `solicitudes_pago`, `fn_solicitud_pago_transicion`, `pagar_solicitud_con_egreso`; `PaginaSolicitudesPago.tsx` (UI sin test). |
| 8 | 2.2 COMEX y Courier | A | Nada. |
| 9 | 2.3 Cajas y bancos: ingresos, egresos, transferencias | IP | `movimientos_fondos` (append-only), `transferir_fondos`, `anular_movimiento_fondos`. **Bug B1** en anular una pata de transferencia. |
| 10 | 2.3 Cuentas de terceros | IP | `cuentas_fondos.de_tercero` + `titular` obligatorio (CHECK). |
| 11 | 2.3 Conciliación saldo sistema vs. real | IP | `conciliaciones_fondos` (saldo del sistema lo pone el trigger). Es un arqueo manual, no extracto: ver 1.2 #48. |
| 12 | 2.3 Cobros contra facturas; pendientes de cobro / de facturación | IP | `cobros_cliente`, `imputaciones_cobro`, `v_facturas_pendientes_cobro`, `v_saldos_clientes.cobrado_sin_imputar`; `probar_cobros` (10). |
| 13 | 2.4 IVA Compras vs. Ventas (tablero mensual) | P | `v_iva_mensual` anda y está probada. Falta evolución dentro del mes, desglose por alícuota, percepciones y no gravado/exento (todo cae en `importe_otros`). |
| 14 | 2.4 Monotributos | A | Nada (el sistema solo emite como monotributista, no controla topes). |
| 15 | 2.5 Control de carga y estados (Correcto/Pendiente/Con diferencias/Requiere revisión) | P | Hay semáforos sueltos (`situacion` de compras, diferencia de conciliación); no hay estado transversal. |
| 16 | 2.5 Consolidación ventas+compras+gastos+bancos+stock | P | Cada vista por separado; sin stock valorizado (D-36). |
| 17 | 2.5 Integraciones: API / import Excel/CSV / Holistor | A | Sin importadores, sin dependencias de planilla. |
| 18 | 3 Estadísticas: evolución mensual y comparaciones | P | `v_ventas_mensuales`; sin comparación entre períodos ni filtros por área. |
| 19 | 3 Ventas | IP | `v_ventas_mensuales` (resta NC; `probar_cobros`, `probar_notas_credito`). |
| 20 | 3 Balance / información para balance | A | Fuera de alcance contable; sin planilla de insumos para el balance. |
| 21 | 3 Cuenta corriente de proveedores | IP | Ver #4. |
| 22 | 3 Cuenta corriente de clientes y antigüedad | IP | `v_cuenta_corriente_clientes`, `v_saldos_clientes` (0-30/31-60/61-90/+90), NC restan (`20260930150000`). `PaginaCuentasClientes.tsx`. |
| 23 | 3 Stock valorizado | A | Espera D-36 (no hay costos). |
| 24 | 3 Cash flow real | IP | `v_cash_flow_real`, `flujo_caja_diario` (`probar_flujo`, 7). Distorsión B3. |
| 25 | 3 Cash flow proyectado | P | `v_cash_flow_proyectado`: pagos por vencimiento y solicitudes; cobranzas **sin fecha**; sin sueldos ni impuestos. |
| 26 | 3 Estado de resultado mensual | R | `v_resultado_mensual` cuenta egresos manuales anulados (B2). Además sin costo de lo vendido (D-36). |
| 27 | 4 Producción registra compra, Administración la ve | IP | `avisos_compra` → `v_compras_trazadas`. |
| 28 | 4 Factura recibida se asocia y actualiza CC proveedor | IP | `comprobantes_proveedor.recepcion_id`, vista de CC. |
| 29 | 4 Pago baja deuda y afecta caja/banco solo | IP | `fn_pago_proveedor_fondos` (trigger); `registrar_pago_proveedor` transaccional. |
| 30 | 4 Mercadería se relaciona con stock y costos | P | Con stock sí (recepción); con costos no. |
| 31 | 4 Importar/sincronizar desde Holistor | A | Ver #17. |
| 32 | 5 Permisos por rol | IP | RLS por rol en todas las tablas (FORCE); `probar_tesoreria` ("Producción no ve la tesorería"), `probar_ventas`, `probar_visibilidad`. Ver riesgo R7. |
| 33 | 5 Auditoría de cada alta/modificación/estado | IP | `core.adjuntar_auditoria` en las 9 tablas de tesorería/cobros/comprobantes; test "auditoría registrada". |
| 34 | 6 Pantalla de inicio orientada a pendientes | IS | `PaginaAdministracion.tsx`: pagos vencidos, diferencias, saldos, IVA, cobranzas, gráficos. Faltan monotributo y stock valorizado. Sin test de pantalla. |
| 35 | 6 Accesos rápidos | IS | Botones en `PaginaAdministracion.tsx`. |

### 1.2 Patrones Holistor

| # | Patrón | Estado | Nota |
| --- | --- | --- | --- |
| 36 | Grillas densas con búsqueda incremental, filtros y orden | A | Todas las tablas son `Table` fijas, sin buscador ni orden (solo `SegmentedControl` de período). |
| 37 | ABM de maestros (proveedores, clientes, cajas/bancos, conceptos, empleados) | P | Proveedores y clientes sí (catálogos/`PaginaClientes`); cajas solo alta (hay política UPDATE sin pantalla de edición); sin conceptos ni empleados. |
| 38 | Comprobante cabecera+detalle: A/B/C/M/NC/ND, PV, número, alícuotas 21/10,5/27, no gravado, exento, percepciones | P | Enum con A, B, C y NC solamente (sin M ni ND). Neto + IVA + "otros" sin desglose por alícuota. Sin detalle. El total sí cuadra por CHECK en base. |
| 39 | Operación por teclado | P | Modales Mantine con tabulación normal; sin atajos ni grilla navegable. |
| 40 | CC: saldo de arrastre, saldo a fecha | P | `saldoCorrido()` en el front desde el primer movimiento; sin filtro de fecha ni arrastre. |
| 41 | Imputación parcial/total, composición de pendientes | IP | `imputaciones_pago/cobro` + RN-63 en triggers. |
| 42 | Antigüedad 0-30/31-60/61-90/+90 (clientes) | IP | `v_saldos_clientes`. Por fecha de factura, no por vencimiento. |
| 43 | Antigüedad de proveedores | A | Solo "vencido" y "próximo vencimiento". |
| 44 | Drill-down tablero → listado → comprobante → auditoría | P | Tablero → CC → movimientos sí; del comprobante a su auditoría no hay enlace. |
| 45 | Libros IVA Compras/Ventas por período y export LID ARCA | A | Nada. |
| 46 | Export Excel/PDF de grillas | A | Sin librería ni CSV. Solo hay PDF del batch record (otro módulo). |
| 47 | Cierre de período mensual y reapertura auditada | A | `periodos_contables` solo existe en el alcance (RN-61/62), no en migraciones. Hoy se puede cargar y anular con cualquier fecha. |
| 48 | Conciliación bancaria con import CSV/Excel y matching por importe y fecha ± n días | A | Solo arqueo manual (#11). |

### 1.3 Conteo

| Estado | Cantidad |
| --- | --- |
| Implementado y probado | 19 |
| Implementado sin tests | 2 |
| Parcial | 11 |
| Roto | 1 |
| Ausente | 15 |
| **Total** | **48** |

## 2. Bugs reales

### Chequeos corridos (2026-10-01, sobre `c3fe82c` + working tree)

| Chequeo | Resultado |
| --- | --- |
| `npx tsc -b --noEmit` | Limpio. |
| `npm run lint` | 6 errores + 6 warnings. Los 6 errores (`no-unnecessary-type-assertion`) están en `produccion/Planificacion.tsx` (194, 693, 785) y `tablero/TableroDT.tsx` (62, 79, 182): **en curso, no del módulo**. Los warnings `react-refresh` incluyen `administracion/compartidos.tsx:26,34` (cosmético). |
| `npx vitest run` | 9 archivos, 107 pruebas en verde. (Una primera corrida cayó por falta de memoria en el equipo, 2 workers; repetida con más heap, limpia.) |
| PGlite `probar_tesoreria` / `cobros` / `comprobantes` / `notas_credito` / `flujo` | 30 / 10 / 25 / 18 / 7 en verde, 0 en rojo. |

Las suites pasan, pero **no cubren** los casos de los bugs de abajo (ver "por qué no se vio").

| ID | Gravedad | Bug | Reproducción | Por qué no se vio |
| --- | --- | --- | --- | --- |
| B1 | Alta | **Anular una sola pata de una transferencia descuadra las cuentas.** `anular_movimiento_fondos` inserta un solo inverso; no mira `transferencia_grupo`. Y la pantalla muestra "Anular" en las dos patas (`PaginaTesoreria.tsx` ~l.249: `automatico` solo cubre pago/cobro/solicitud). | Tesorería → Transferir 20.000 banco → caja. En el listado, "Anular" sobre la pata del banco. El banco recupera 20.000 y la caja sigue con los 20.000: el total de fondos sube 20.000 sin origen. | `probar_tesoreria` anula un ingreso simple, no una transferencia. |
| B2 | Alta | **El resultado mensual cuenta como gasto un egreso manual anulado.** `v_resultado_mensual.gastos` filtra `anula_a_id is null` e `importe < 0`: deja afuera la fila inversa (positiva) pero no el original. | Cargar egreso manual de 1.000 (`concepto` cualquiera), anularlo. `select otros_egresos from comercial.v_resultado_mensual` sigue mostrando 1.000. (Pasa igual en `20260929130000` y en la copia de `20260930150000`.) | El test del resultado no anula egresos. |
| B3 | Media | **Cash flow real infla ingresos y egresos con las anulaciones.** `v_cash_flow_real` suma toda fila `importe > 0` como ingreso y `< 0` como egreso, incluso los inversos. | Cobro de 5.000 y su anulación en el mismo mes: ingresos 5.000 y egresos 5.000 (neto 0 correcto, bruto falso). Mismo efecto con pagos anulados. | El test mira el neto. |
| B4 | Alta (uso) | **No hay forma de anular desde la pantalla un pago, un cobro ni un comprobante de proveedor.** Existen las RPC `anular_pago_proveedor`, `anular_cobro_cliente`, `anular_comprobante_proveedor`; el hook `useAnularComprobanteProveedor` está definido y **sin ningún llamador**; las otras dos no están en `src/`. | Cargar un pago con importe equivocado en Cuentas proveedores: no hay botón para anularlo. La regla "no se edita, se anula" deja a Diego sin salida. | Sin tests de pantalla. |
| B5 | Media | **Anular una factura de proveedor con pagos o NC imputados no avisa ni lo impide.** `anular_comprobante_proveedor` no revisa `imputaciones_pago` ni NC hijas. El pago queda "a cuenta" y la NC apunta a una factura anulada. | Cargar factura A, pagarla con imputación, anular la factura: el pago desaparece de "pendientes" sin aviso y el saldo del proveedor queda a favor. | No hay prueba. |
| B6 | Media | **Pagar una solicitud no valida importe ni proveedor.** `registrar_pago_proveedor(..., p_solicitud_id)` marca la solicitud PAGADA aunque el pago sea de otro importe o de otro proveedor. | Solicitud APROBADA de 10.000 al proveedor X; registrar pago de 3.000 al proveedor Y con esa `p_solicitud_id`: queda PAGADA. | Solo se probó el caso feliz. |
| B7 | A verificar | **Roles con facturas pero sin cobros ven saldos inflados.** `cobros_cliente`/`imputaciones_cobro` los leen ADMINISTRACION, GERENCIA, VENTAS y ADMINISTRADOR_SISTEMA; GERENCIA_PRODUCCION puede emitir y ver facturas pero no cobros. Las vistas son `security_invoker`, así que para ese rol `v_saldos_clientes` muestra todo como pendiente y "cobrado = 0". | Entrar como GERENCIA_PRODUCCION a Cuentas de clientes (si el menú actual se lo muestra) con un cliente que pagó. | No se probó el rol. El menú está en reorganización: confirmar. |
| B8 | Baja | `FormularioRecepcion.tsx` registra la recepción y luego el comprobante con otra llamada (`useRegistrarComprobanteProveedor`): si falla la segunda, queda recepción sin comprobante, sin transacción. | Cortar la red entre ambas llamadas. A verificar leyendo el flujo completo. | n/a |

## 3. Riesgos de integridad de datos

| # | Regla | Estado | Detalle |
| --- | --- | --- | --- |
| R1 | Dinero `numeric(18,2)` en base | Casi | Todo el módulo usa `numeric(16,2)`: alcanza, pero no es lo pedido. Cambiar solo si Gerencia lo exige. |
| R2 | Sin `number` para dinero en TS | **No se cumple** | Sin `decimal.js` (no está en `package.json`). `aNumero()` (`compartidos.tsx`) y `pesos()` usan `Number`; ~46 usos de `Number(...)`/`number` con importes en `features/administracion/` y `consultasAdministracion.ts` (`reduce` de totales en `PaginaAdministracion.tsx`, `saldoCorrido`, comparación de imputado contra pendiente en `compartidos.tsx` y `PaginaCuentasClientes.tsx`). Los importes viajan a las RPC como `number` dentro de `jsonb`. La base es la autoridad (CHECK, RN-63 en trigger), así que el riesgo es de visualización y de rechazos espurios por centavos flotantes, no de datos corruptos. |
| R3 | Redondeo por línea de IVA explícito | Parcial | Facturas emitidas: sí, por alícuota en `preparar_factura` (`round(base * alicuota / 100, 2)`). Facturas de proveedor: el IVA es un solo importe tipeado, sin alícuotas. |
| R4 | Saldos derivados de movimientos | Cumple | `saldo_fondos`, `v_saldos_*`, `v_cuenta_corriente_*` son sumas. `saldo_sistema` de las conciliaciones lo fija un trigger. Único campo "tipeado": `saldo_real` / `saldo_informado` (correcto, es dato externo). |
| R5 | Cada flujo como función SQL transaccional | Mayormente | Pago, cobro, transferencia, pago de solicitud: sí (SECURITY INVOKER, rigen las políticas). Recepción + comprobante: no (B8). Alta de solicitud y de comprobante: `insert` directo desde el cliente, validado por CHECK/trigger. |
| R6 | Importaciones idempotentes por CUIT+tipo+PV+número | Parcial | No hay importación. Existe el índice único `comprobantes_proveedor_unico_idx (proveedor_id, tipo, punto_venta, numero) where anulado_en is null`, equivalente a la clave pedida (proveedor ↔ CUIT) y bien pensado (la anulada libera el número). Deberá ser la clave de cualquier importador. |
| R7 | RLS por rol (sección 5 del doc) | Parcial | Tesorería y cuentas: solo Administración/Gerencia (+ Administrador del sistema de lectura). **Los comprobantes de proveedor los lee cualquier rol con sesión** (`comprobantes_proveedor_select_authenticated`, citando §3.3): contradice "cada área opera sobre lo suyo" del doc §5. Ver PENDIENTES.md. Ver también B7. |
| R8 | Auditoría en cada escritura | Cumple | `adjuntar_auditoria` en todas las tablas nuevas; RLS `ENABLE` + `FORCE`. `core.verificar_invariantes()` en verde según ESTADO. |
| R9 | Inmutabilidad (CLAUDE.md §3.1, §3.8) | Cumple con matiz | Movimientos y conciliaciones son append-only. Comprobantes, pagos y cobros se "anulan" con `UPDATE` de columnas `anulado_*` (un trigger bloquea cualquier otro cambio) y el original queda en `core.auditoria`; los fondos sí usan contramovimiento. Ver PENDIENTES.md #3. |
| R10 | Sin cierre de período | Riesgo | Se pueden cargar comprobantes, pagos y cobros con fecha de meses ya presentados al estudio; la posición de IVA de un mes presentado puede cambiar sin rastro de que "ya estaba cerrado". |
| R11 | Concurrencia en imputaciones | Bajo | RN-63 bloquea el comprobante (`for update`) pero no la fila del pago/cobro: dos imputaciones simultáneas contra el mismo pago podrían superar su importe. Improbable con un solo operador; se resuelve con `for update` sobre el pago. |
| R12 | Cobranzas sin fecha en el flujo proyectado | Riesgo de lectura | Las facturas no tienen vencimiento: la proyección de entradas no se puede ubicar en el tiempo. |

## 4. Propuesta de Fase B / C (de lo más simple para Diego a lo más pesado)

1. **B4**: botones "Anular" (con motivo) en pagos, cobros y comprobantes. Es lo que hoy lo bloquea; las RPC ya existen.
2. **B1**: la base rechaza anular una pata suelta y ofrece `anular_transferencia(grupo)`; en pantalla, un solo "Anular transferencia". Migración nueva + prueba.
3. **B2 y B3**: corregir `v_resultado_mensual` y `v_cash_flow_real` (excluir original y su inverso). Migración + prueba que anule antes de sumar.
4. **B5 y B6**: validaciones en base (comprobante con imputaciones vivas no se anula sin anular antes el pago; la solicitud exige mismo proveedor e importe). Pruebas.
5. **Grillas con buscador, orden y filtro** en proveedores, comprobantes, movimientos, cobros: un componente único de tabla (`@mantine/core` ya instalado, sin dependencia nueva). Es lo que más se nota frente a Holistor.
6. **Exportar a CSV** (UTF-8 con BOM, abre en Excel) desde ese mismo componente de tabla. Sin dependencias.
7. **Dinero sin `number`**: helper de centavos enteros (una sola función de parseo y suma) en lugar de `decimal.js`; reemplazar `aNumero` y los `reduce`. Test de redondeo.
8. **Pantalla única "Cargar comprobante"** con A/B/C/M/NC/ND, alícuotas 21/10,5/27, no gravado, exento y percepciones IVA/IIBB; el total tiene que cuadrar antes de grabar. Requiere migración (columnas por alícuota) y decisión previa (PENDIENTES #4).
9. **Libro IVA Compras y Ventas por período** (listado + CSV); después el export Libro IVA Digital ARCA, con el formato oficial validado contra la documentación de ARCA.
10. **Cierre de período mensual** (tabla `periodos_cierre`, trigger que bloquea escrituras con fecha cerrada, reapertura solo Administración con motivo auditado). Es la versión mínima de RN-61/62 sin partida doble.
11. **Cuenta corriente con saldo a fecha y arrastre**, y antigüedad de proveedores (misma vista que clientes).
12. **Conciliación bancaria**: importar CSV del extracto, matching por importe y fecha ± n días, marcar conciliado. Clave de idempotencia: cuenta + fecha + importe + referencia.
13. **Vencimiento en facturas de clientes** (plazo por cliente) para que el cash flow proyectado ubique las cobranzas.
14. **Importar comprobantes desde Holistor** (Excel/CSV) con la clave de R6; recién después de 5-6.
15. **Fase C** (esperan D-34/D-36): monotributo, estado "enviado al estudio", stock valorizado, RRHH/comisiones, COMEX.

Antes de cualquier fase: confirmar B7 (roles que ven facturas pero no cobros) y que el menú nuevo (en curso) no exponga pantallas de tesorería a roles sin permiso.
