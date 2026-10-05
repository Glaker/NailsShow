# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de Nail Show SRL, laboratorio cosmético habilitado por ANMAT que fabrica
productos para uñas. Dos escenas conviven:

- Planta: producción, control de calidad y depósito, en tablet, con guantes y luz
  de galpón. Registran fabricación, muestreo, recepción y movimientos de stock.
- Oficina: administración, ventas, compras y Dirección Técnica, en PC de escritorio.
  Pedidos, facturación, cuentas corrientes, liberación de lotes y auditoría.

## Product Purpose

Sistema electrónico de trazabilidad que reemplaza los registros en papel de
fabricación, control de calidad y liberación de producto, y suma la operación
comercial (stock valorizado, pedidos, facturación, cuentas). Éxito: un inspector
de ANMAT audita la base y el código y cada registro demuestra quién lo escribió,
cuándo, con qué valor anterior, y que nadie pudo alterarlo.

## Positioning

Software a medida bajo GAMP 5 categoría 5 para un fabricante concreto: las reglas
de negocio (RN-01 a RN-70) salen de sus POE y registros reales, y la base es la
autoridad (RLS, triggers, auditoría append-only), no la interfaz.

## Operating Context

- Buenas Prácticas de Fabricación, Disposición ANMAT 6477/12; retiro de mercado
  según Disposición 1402/08.
- Rótulos impresos que se pegan en el recipiente (I.20.2), batch records, órdenes
  de producción, lotes, cuarentena, liberación.
- Sección de clientes tercerizados que debe distinguirse a simple vista de la
  operación propia de Nail Show.
- Modo práctica: base aparte con datos inventados, señalada de forma inconfundible.

## Capabilities and Constraints

- React 18 + Mantine 8 + Vite; Supabase (Postgres, Auth, PostgREST). Mantine 9 no
  se usa porque exige React 19.
- Los cuatro colores de estado de rótulo de I.20.2 están reservados: amarillo
  (cuarentena), gris (en análisis), verde (aprobado), rojo (rechazado). Ningún
  elemento de marca, navegación ni decoración puede usarlos.
- Controles con área de toque mínima de 44 px; interfaz densa en información.
- Ninguna animación puede sugerir que un registro se guardó, firmó o cambió de
  estado; se respeta la reducción de movimiento del sistema.
- La interfaz ofrece modo claro y modo oscuro a elección del usuario.
- Textos en español rioplatense.

## Brand Commitments

- El logo de Nail Show (`public/marca-nailshow.png`, lettering script con aro
  punteado en degradé arcoíris) es el único activo de marca obligatorio.
- Preferencia confirmada por el usuario (2026-10-04): interfaz profesional,
  minimalista, sobria, moderna y limpia, con algo de movimiento, con las apps de
  Apple como referencia. Rechazó explícitamente un diseño «colorinche».

## Evidence on Hand

- Logo: `public/marca-nailshow.png`.
- Documento de alcance: `docs/ALCANCE_SISTEMA_TRAZABILIDAD.md`.
- No hay fotografía de producto ni de planta en el repositorio; no inventarla.

## Product Principles

1. El registro manda: la interfaz nunca afirma algo que la base no confirmó.
2. El color comunica estado de material antes que marca.
3. Legible a distancia de brazo, con guante, bajo mala luz.
4. Densidad sin estrechez: más filas por pantalla, nunca controles más chicos.
5. Lo auditado se ve: quién firma lo que se carga está siempre a la vista.

## Accessibility & Inclusion

Contraste alto para tablets con película protectora y luz de galpón; áreas de
toque de 44 px; respeto de `prefers-reduced-motion` (turnos largos frente a
pantalla).
