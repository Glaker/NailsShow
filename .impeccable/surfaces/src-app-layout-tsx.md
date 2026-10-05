---
version: 1
slug: 'src-app-layout-tsx'
primary_target: 'src/app/layout.tsx'
related_targets: ['src/app/theme.ts', 'src/app/global.css']
---

# Superficie: la aplicación completa (cascarón, tema y pantallas)

Modo: Operate. Alcance: sistema visual completo (tipografía, paleta, superficies,
botones, barra lateral, ingreso, tablero, tarjetas, tablas), con modo claro y
oscuro a elección. Pantallas, flujos y contenido no cambian. Solo el logo sobrevive
de la identidad anterior.

Historia: la dirección «Carta de colores» (2026-10-03) se construyó y el usuario la
rechazó por «muy colorinche». Pidió profesional, minimalista, sobrio, moderno y
limpio, con algo de movimiento, y tomó a Apple como referencia (2026-10-04). Es el
camino canónico, elegido por el usuario: se ejecuta con la calidad de su referencia.

## Direction contract

THESIS: Un sistema de trabajo con la sobriedad de las apps de Apple: neutro, preciso
y tranquilo, donde el único color de interfaz es el azul de acción y el resto del
color lo ponen los estados de I.20.2. Rechaza el panel colorido con degradés y las
muestras decorativas.

OWN-WORLD: Gris #f5f5f7 de fondo y tarjetas blancas en claro; negro #000 con
tarjetas #1c1c1e en oscuro. Texto #1d1d1f / #f5f5f7, secundario #6e6e73 / #a1a1a6.
Azul de acción #0071e3 / #0a84ff. SF Pro en Apple, Inter en el resto. Tarjetas de
16 px de radio con sombra suave, campos de 10 px, botones píldora.

STORY: El usuario ve primero los datos, encuentra la acción en azul y lee los
estados de material por su color reservado, sin ruido alrededor.

FIRST VIEWPORT: Barra lateral clara estilo macOS con íconos grises; el activo sobre
una pastilla gris con el ícono en azul. Título grande con interletrado apretado,
indicadores en tarjetas blancas con cifra grande y un punto de color solo si es
estado de material. Acción primaria píldora azul arriba a la derecha.

FORM: Estándar de la categoría con referencia Apple, elegido por el usuario
(standing exit); seed 2316255c.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
