# P3 · Opciones por caja: diseño del `arquitecto`

Diseño de Fable 5.2 del 2026-11-13. Leyó las migraciones del worktree `p1-botones`, que no traen #111 ni #112.
Cambia solo `comercial`; `gmp` no se toca.

## 1. Decisión

### Modelo: una cabecera por caja y renglones por SKU que salen de ella

Dos tablas nuevas. Las dos con ENABLE y FORCE RLS, `SELECT` cuando `core.rol() is not null`, escritura para VENTAS y ADMINISTRACION, y `core.adjuntar_auditoria`.

**`cajas_aromas(id, nombre, producto_amor_id, producto_paz_id, producto_aire_id, activo)`**
- Guarda los 8 grupos familia + presentación que ya nombra 20261102130000 («las 8 de aromas»). Se cargan por código.
- Ningún SKU representa a la familia: cada grupo son tres SKU explícitos.

**`pedido_cajas(id, pedido_id, caja_id, opcion, cajas int > 0, unidades_caja int, asignado_amor/paz/aire int null, asignado_por, asignado_en, anulado)`**
- Enum `opcion_caja_enum`: SURTIDO, AMOR, PAZ, AIRE, AMOR_PAZ, AMOR_AIRE, PAZ_AIRE, UNA_DE_CADA.
- `unidades_caja` es una foto de `v_descuentos_caja` al cargar la caja.
- Una sola fila vigente por (pedido, caja, opción).
- Controles (`CHECK`):
  - UNA_DE_CADA exige `cajas % 3 = 0`;
  - las mixtas exigen `unidades_caja % 2 = 0`;
  - `asignado_*` solo existe en SURTIDO, y los tres van nulos o suman `cajas`.

**`pedido_renglones` suma `cantidad_opcion numeric not null default 0`**
- `CHECK (cantidad_opcion <= coalesce(cantidad_caja, cantidad))`.
- Sigue habiendo un renglón vigente por SKU (`pedido_renglones_vigente_idx`), con `cantidad = sueltas + cantidad_opcion`. La venta por unidad no cambia.

**Trigger AFTER en `pedido_cajas`, `fn_cajas_materializa()`**
- Actúa solo con el pedido en BORRADOR.
- Lo que cada opción aporta a cada SKU:

  | Opción | Aporte por SKU |
  |---|---|
  | Aroma fijo | `cajas × u` |
  | Mixta | `cajas × u / 2` a cada uno de los dos |
  | Una de cada una | `cajas / 3 × u` a cada uno de los tres |
  | Surtido | `asignado × u` (0 sin asignar) |

- Ajusta `cantidad`, `cantidad_caja` y `cantidad_opcion` por la diferencia, y crea o anula el renglón según haga falta.
- Un surtido sin asignar no tiene renglón: ni SKU ni importe interno.

**Precio: sin fórmula nueva**
- El renglón lleva `cantidad_caja` y el `descuento_caja_pct` vigente, y el importe lo calcula `recalcular_venta` (D-caja-mixta-1).
- Un grupo se ofrece solo si sus tres SKU están en la lista con el mismo `precio_promo`, las mismas `unidades_caja` y el mismo porcentaje. Ese precio es el del surtido.

### Asignación del surtido

Dos funciones: `asignar_surtido(p_pedido_caja_id, p_amor, p_paz, p_aire)` y `surtido_disponible(p_pedido_caja_id)`.
- Las dos son SECURITY INVOKER y chequean `es_rol('VENTAS','ADMINISTRACION')` en la primera línea.
- Exigen el pedido en BORRADOR y toman el lock de `comercial.enviar_venta`.
- El depósito es uno solo: el que da `deposito_de_venta(pedido)`.

Pasos de `asignar_surtido`:
1. Anula la asignación anterior. El trigger baja los renglones y `fn_renglon_recorta_reserva` libera las reservas.
2. Calcula el máximo por aroma, en cajas: `floor(greatest(v_disponible_pt.disponible + reservado del propio pedido − cantidad vigente del renglón, 0) / unidades_caja)`.
3. Rechaza si alguno de los pedidos supera su máximo.
4. Guarda la asignación (el `CHECK` exige que sume `cajas`).
5. Inserta en `reservas_pt` lo asignado.

`v_disponible_pt` ya aplica `greatest(…, 0)` por depósito y excluye los lotes retenidos (RN-51/52), así que el saldo negativo de Berna da 0.

### Visibilidad

El cliente sigue sin leer tablas, porque su JWT trae el rol nulo. Todo le llega por las funciones `cliente_*`.

**`cliente_pedidos()`**
- Devuelve:
  - `renglones` con `cantidad − cantidad_opcion` (solo los mayores que 0);
  - `cajas: [{caja_id, nombre, opcion, cajas}]`.
- Nunca devuelve `asignado_*` ni un estado de asignación, así que la respuesta es idéntica antes y después de asignar.

**`cliente_cajas()`, nueva**
- Pasa por la misma puerta que `cliente_lista`.
- Devuelve `caja_id, nombre, unidades_caja, porcentaje, precio_promo, mixta`.
- No lee ninguna relación de stock.

**`cliente_enviar_pedido`**
- Se recrea (drop + create + grants) con un parámetro nuevo, `p_cajas jsonb`: `[{caja_id, opcion, cajas}]`.
- Compara las unidades sueltas contra `cantidad − cantidad_opcion`.
- Si el cliente cambia las cajas de un surtido ya asignado, la asignación vuelve a pendiente sin aviso.
- Sus mensajes de error no mencionan stock.

**`cliente_lista()`** no cambia, así que no choca con P2.

### Estados

- `fn_pedido_transicion` se copia de 20261019130100 con un control más: si el pedido tiene un SURTIDO sin asignar, desde BORRADOR solo puede pasar a CANCELADO.
- El surtido tiene que estar asignado para pasar a ESPERANDO_FECHA, porque Gerencia de Producción propone la fecha y reserva por SKU.
- Para reasignar después, el pedido vuelve a BORRADOR.
- Cancelar y descartar ya liberan `reservas_pt`, y `fn_pedido_origen` ya impide cambiar de depósito si hay reservas.

### Unidades impares

- La regla es el `CHECK` de las mixtas, más `mixta = false` en `cliente_cajas()`.
- La pantalla deshabilita las tres mixtas con un aviso fijo.
- Hoy afecta al Aceite de cutícula de 8 ml (91 unidades por caja) y al Sanitizante de 1 L (15).

### Pruebas

En `supabase/tests/pglite/probar_opciones_caja.mjs`, con su espejo en pgTAP:
- **a.** Las 8 opciones dan los renglones esperados; el surtido sin asignar da 0.
- **b.** UNA_DE_CADA con 1, 2 o 4 cajas se rechaza; con 3 y 6 pasa, con tres aportes iguales.
- **c.** Una mixta con 91 o 15 unidades por caja se rechaza.
- **d.** Unidades sueltas más una caja del mismo SKU dan un solo renglón, con el precio de `probar_caja_mixta`.
- **e.** Asignación:
  - se rechaza si la suma no da las cajas pedidas, o si se asigna de más;
  - aroma sin stock;
  - Berna en negativo cuenta 0 y no les resta a los otros aromas;
  - las reservas de otros pedidos se descuentan, y un segundo pedido ve menos disponible;
  - reasignar libera y vuelve a reservar.
- **f.** El cliente, Gerencia de Producción y `anon` reciben `insufficient_privilege` en las dos funciones de asignación.
- **g.** Se rechaza pasar a ESPERANDO_FECHA sin asignar, y editar `pedido_cajas` fuera de BORRADOR.
- **h.** `cliente_pedidos()` es igual (comparado como jsonb) antes y después de asignar, con las claves en lista blanca. `cliente_cajas()` es igual con stock 0, positivo y negativo.
- **i.** Con el JWT de un cliente: 0 filas en `movimientos_pt`, `reservas_pt`, `v_disponible_pt`, `v_pendientes_despacho`, `pedido_cajas` y `pedido_renglones`.
- **j.** Barrido del catálogo: ninguna política `using (true)`, ninguna vista sin `security_invoker`, ninguna función `cliente_*` que lea stock.
- **k.** Si el cliente reenvía después de la asignación: no hay error, la asignación vuelve a pendiente y las reservas se liberan.
- **l.** Playwright: ninguna respuesta de red con claves que contengan `stock`, `dispon`, `reserv`, `asign` o `saldo`.

## Decisiones abiertas

En cada una, el diseño ya aplica la opción conservadora.

- **D-opciones-caja-1. Surtido cuando lo libre de los tres aromas no alcanza.**
  - Conservador: no se asigna ni avanza, y no hay forma de «forzarlo».
  - Salidas posibles:
    - esperar producción;
    - cambiar el depósito del pedido;
    - acordarlo con el cliente y pasar la línea a aromas fijos, que sí se mandan a producir.
- **D-opciones-caja-2. Descuento automático en las cajas que elige el cliente.**
  - Hoy el descuento por caja lo marca Ventas.
  - Conservador: se aplica el porcentaje por defecto de D-descuento-caja-1, y Ventas lo puede cambiar antes de aprobar.
- **D-opciones-caja-3. Asignar reserva stock aunque el pedido siga en BORRADOR**, todavía editable por el cliente. A confirmar.

## Alternativas descartadas

- **Renglón de surtido con `producto_id` nulo:** rompe el NOT NULL, el índice único y todo lo que agrupa por producto (reservas, despacho, foto, factura).
- **SKU «Surtido» en `gmp.productos`:** toca `gmp` (regla 7) e inventa un producto sin registro.
- **Solo renglones, con la opción en la pantalla:** el surtido asignado le llegaría al cliente por `cliente_pedidos`, y «una de cada una» se podría editar por partes.
- **Armar los grupos por `familia` + `unidades_caja`:** empareja presentaciones solo porque coincide un número.
- **Validar sin reservar:** dos surtidos asignados seguidos contarían el mismo stock.
- **Sumar los tres depósitos:** el pedido sale de uno solo (D-pedidos-por-deposito-1).
- **Asignación SECURITY DEFINER:** Ventas ya tiene sus políticas; con INVOKER, la RLS queda como segunda barrera.
- **Rol de base propio para los clientes:** sería más fuerte, pero cambia el hook y los grants de todo el portal. Queda fuera de P3.

## Riesgos

- **El permiso EXECUTE no separa al cliente de Ventas:** los dos son `authenticated`. «El cliente no puede ejecutarla» se apoya en el chequeo de rol más la RLS. Lo vigilan las pruebas f, i y j.
- **El total interno queda incompleto hasta asignar**, y la escala por monto puede cambiar de tramo.
  - Falta una prueba que compare el importe del portal con el de `recalcular_venta` después de asignar.
  - La central de Ventas tiene que marcar «pendiente de asignación».
- **Stock inmovilizado:** las reservas de pedidos en BORRADOR que nadie retoma no vencen (`reservas_pt`). Hace falta un listado de reservas de surtido por antigüedad.
- **Señal débil por tiempo:** un surtido trabado deja el pedido más tiempo «editable». No revela cantidades; va a supuestos.
- **Ventas no puede bajar un renglón por debajo de `cantidad_opcion`** (lo impide el `CHECK`): la central interna tiene que mandar a editar la caja.
- **Herencia de datos:** `cantidad_caja` NULL con porcentaje significa «todo en caja». El materializador tiene que hacerlo explícito antes de sumar (se prueba en d).
- **Cambia la firma de `cliente_enviar_pedido`:** el frente y los tipos se ajustan a mano hasta el `db push` (supuesto 14).
