---
name: Trazabilidad Nail Show
description: Sistema de trazabilidad BPF con la sobriedad de las apps de Apple, donde el color es del estado del material.
colors:
  azul: "#0071e3"
  azul-oscuro: "#0a84ff"
  azul-tenue: "#eaf3fe"
  fondo: "#f5f5f7"
  fondo-oscuro: "#000000"
  tarjeta: "#ffffff"
  tarjeta-oscuro: "#1c1c1e"
  tinta: "#1d1d1f"
  tinta-oscuro: "#f5f5f7"
  atenuado: "#6e6e73"
  atenuado-oscuro: "#a1a1a6"
  marcador: "#86868b"
  borde-campo: "#d2d2d7"
  borde-campo-oscuro: "#3a3a3c"
  borde-superficie: "#e5e5ea"
  borde-superficie-oscuro: "#2c2c2e"
  superficie-tenue: "#fafafc"
  barra: "#fbfbfd"
  barra-oscuro: "#121214"
  barra-texto: "#3a3a3c"
  barra-icono: "#6e6e73"
  estado-cuarentena: "#fab005"
  estado-en-analisis: "#868e96"
  estado-aprobado: "#40c057"
  estado-rechazado: "#fa5252"
  tercerizados-fondo: "#e3e6ed"
  tercerizados-cabecera: "#1f2533"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.022em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.022em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.006em"
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.006em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.006em"
  cifra:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Inter, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "36px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\""
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "16px"
  xl: "22px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.azul}"
    textColor: "{colors.tarjeta}"
    rounded: "{rounded.xl}"
    padding: "0 22px"
    height: "44px"
  button-primary-oscuro:
    backgroundColor: "{colors.azul-oscuro}"
    textColor: "{colors.tarjeta}"
    rounded: "{rounded.xl}"
    padding: "0 22px"
    height: "44px"
  input:
    backgroundColor: "{colors.tarjeta}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    height: "44px"
  card:
    backgroundColor: "{colors.tarjeta}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-oscuro:
    backgroundColor: "{colors.tarjeta-oscuro}"
    rounded: "{rounded.lg}"
    padding: "20px"
  nav-item:
    textColor: "{colors.barra-texto}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  badge:
    backgroundColor: "{colors.azul-tenue}"
    textColor: "{colors.azul}"
    rounded: "{rounded.xl}"
  table-header:
    textColor: "{colors.atenuado}"
    typography: "{typography.label}"
---

# Design System: Trazabilidad Nail Show

## Overview

**Creative North Star: "La herramienta de Apple en la planta"**

Un sistema de trabajo con la sobriedad de las apps de Apple, elegida por el usuario como referencia: neutro, preciso y tranquilo. Casi toda la interfaz es gris frío, blanco y casi negro; hay un único color de interfaz, el azul de acción, y el resto del color lo ponen los cuatro estados de rótulo de I.20.2. El usuario ve primero los datos, encuentra la acción en azul y lee el estado del material por su color reservado, sin ruido alrededor.

La densidad es alta pero nunca estrecha: los espaciados son compactos para que entren más filas, y todo control mide al menos 44 px porque se usa con guantes, en tablet, bajo luz de galpón. Hay modo claro y oscuro a elección, cada uno con su propia escala de grises de Apple. El movimiento existe pero es corto, con curva de salida, y nunca afirma algo que la base no confirmó.

El logo de Nail Show (lettering con aro arcoíris) es el único lugar donde vive el arcoíris. Se rechazó explícitamente la dirección colorida anterior: panel con degradés, muestras decorativas, acentos de marca en la interfaz.

**Key Characteristics:**
- Neutro de punta a punta; un solo azul de acción.
- Cuatro colores reservados para el estado del material, y para nada más.
- Letra del sistema (SF Pro) en Apple, Inter autoalojada en el resto.
- Esquinas amplias: campos de 10 px, tarjetas de 16 px, botones píldora.
- Sombras suaves y cortas que separan la tarjeta del fondo.
- Áreas de toque de 44 px como piso, densidad ganada en el espaciado.
- Modo claro y oscuro, con fundido de 260 ms al alternar.

## Colors

Una paleta de grises fríos de Apple con un único azul de acción; el color con significado pertenece al material, no a la marca.

### Primary
- **Azul de acción** (`azul`, shade 7 en claro): botón primario, enlaces, selección de texto, anillo de foco, cursor de texto, ícono del ítem activo de la barra y del ítem activo de la barra inferior. Con texto blanco da 4,7:1.
- **Azul de acción nocturno** (`azul-oscuro`, shade 6 en oscuro): el mismo papel en modo oscuro.
- **Azul velado** (`azul-tenue`, shade 0): fondo de insignias livianas, avatar, hover de filas de resumen y de celdas de calendario (vía `--mantine-color-azul-light`).

### Neutral
- **Gris papel Apple** (`fondo`) / **Negro puro** (`fondo-oscuro`): fondo de la aplicación y de la pantalla de ingreso; también la `theme-color` del navegador.
- **Blanco tarjeta** (`tarjeta`) / **Carbón tarjeta** (`tarjeta-oscuro`): cuerpo de Mantine; toda tarjeta, campo y menú.
- **Tinta** (`tinta`) / **Tinta nocturna** (`tinta-oscuro`): texto principal.
- **Gris secundario** (`atenuado`) / (`atenuado-oscuro`): texto atenuado, cabeceras de tabla, etiquetas de indicador. Oscurecido respecto del gris de fábrica de Mantine para pasar 4,5:1 en tablet con película.
- **Gris marcador** (`marcador`): texto de ejemplo en campos.
- **Borde de campo** (`borde-campo` / `borde-campo-oscuro`): borde por defecto de Mantine (campos, divisores).
- **Borde de superficie** (`borde-superficie` / `borde-superficie-oscuro`): borde de tarjeta, tabla, barra lateral y filas de resumen.
- **Superficie tenue** (`superficie-tenue`, oscuro `#161618`): días de fin de semana en el calendario.
- **Barra lateral** (`barra` / `barra-oscuro`), con texto `barra-texto` e íconos `barra-icono`. Hover del ítem `rgba(0,0,0,0.04)`, activo `rgba(0,0,0,0.07)` (en oscuro, blanco al 5 % y al 10 %).

### Estados de rótulo (I.20.2, reservados)
- **Cuarentena** (`estado-cuarentena`, amarillo), **En análisis** (`estado-en-analisis`, gris), **Aprobado** (`estado-aprobado`, verde), **Rechazado** (`estado-rechazado`, rojo). Son las tuplas `estadoCuarentena`, `estadoEnAnalisis`, `estadoAprobado`, `estadoRechazado` del tema; se consumen por nombre (`COLORES_ESTADO_ROTULO`), nunca como hexadecimal suelto. Los estados internos sin rótulo (recibido, muestreado) van en índigo; el saldo de apertura, en el azul de Mantine.

### Entorno Tercerizados
- **Pizarra tercerizados** (`tercerizados-fondo`, cabecera `tercerizados-cabecera`; en oscuro `#141820` y `#232a3a`): solo dentro de la sección de clientes tercerizados, pedida para distinguirla a simple vista. Las tarjetas internas siguen claras (`#f5f6f9`) para que los estados se lean igual.

### Named Rules
**The Único Azul Rule.** El azul es el único color de interfaz. Botones, enlaces, foco y selección son azules; lo demás es gris. Si una pantalla necesita un segundo acento, no lo necesita.

**The Cuatro Reservados Rule.** Amarillo, gris de análisis, verde y rojo de I.20.2 comunican el estado del material y nada más. Ningún botón, ícono de navegación, gráfico decorativo ni aviso de marca los usa: un verde cualquiera degrada la señal del rótulo pegado al envase.

## Typography

**Display Font:** SF Pro (letra del sistema en Mac, iPhone y iPad), con Inter variable 400–800 autoalojada (`/fonts/inter-latin.woff2`, precargada) en Windows y Android, y Segoe UI / Roboto de respaldo.
**Body Font:** la misma pila.
**Label/Mono Font:** `ui-monospace` / SF Mono / Menlo / Consolas, para códigos.

**Character:** Una sola familia de sistema, sin fuente de exhibición: la jerarquía sale del peso y del interletrado apretado de los titulares de Apple, no de un contraste de familias.

### Hierarchy
- **Display** (700, 30px, 1.12, -0.022em): título de pantalla (`EncabezadoPagina`, ingreso). `text-wrap: balance`.
- **Headline** (700, 22px, 1.2): título de tarjeta principal o de formulario.
- **Title** (700, 18px, 1.3; h4 15.5px, 1.35): títulos de sección dentro de una pantalla.
- **Body** (400, 15px, 1.45, -0.006em): texto general y descripción bajo el título. Cuerpo generoso: se lee a distancia de brazo.
- **Body chico** (13.5px, 1.4): etiquetas de indicador, ayudas, ítems de barra (14.5px, 500; 600 el activo).
- **Label** (600, 12.5px): cabeceras de tabla en minúscula de oración, atenuadas.
- **Cifra** (650, 36px en indicadores, 1.05, -0.03em, tabular): el número grande del tablero.

### Named Rules
**The Cifra Tabular Rule.** Tablas, campos y toda cifra usan `tabular-nums`, para que las columnas de números se alineen. La cifra destacada lleva 650 y -0.03em.

**The Minúscula de Oración Rule.** Cabeceras de tabla e insignias van en minúscula de oración, peso 600, sin interletrado agregado, como en macOS. Nada de rótulos en mayúscula sostenida.

## Layout

Cascarón de aplicación con barra lateral fija de 250 px en escritorio y tablet apaisada; por debajo de 62em (teléfono y tablet vertical) la barra se oculta y aparece una barra inferior con las cuatro secciones diarias (56 px de alto, ícono 21 px y etiqueta 11px/600) más un botón circular de 56 px abajo a la derecha que abre la navegación completa en un panel lateral de 280 px. Contenido con padding `xl` (28px) en escritorio y `md` (14px) en teléfono, sobre el fondo gris.

Espaciado compacto (6 / 10 / 14 / 20 / 28 px). Tablas con espaciado horizontal `md` y vertical `sm`, hover de fila activado. El encabezado de pantalla separa título y acciones con `space-between`, alineados abajo, y deja 28px antes del contenido. La acción primaria va arriba a la derecha.

**The 44 Píxeles Rule.** Todo control interactivo (botón, ícono de acción, campo, select, pestaña, ítem de navegación, celda de tabla) mide al menos 44 px. La densidad se gana en el espacio entre elementos, nunca achicando el área de toque.

## Elevation & Depth

Híbrido: superficies blancas sobre fondo gris, con borde de 1 px (`borde-superficie`) y sombras suaves y cortas que solo separan. En oscuro, la profundidad la da el escalón de grises (negro, `#1c1c1e`, `#2c2c2e`). La elevación crece con la interacción: una tarjeta que es enlace o un botón se levantan apenas al pasar.

### Shadow Vocabulary
- **xs** (`0 1px 2px rgba(0,0,0,0.04)`): separación mínima.
- **sm** (`0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`): tarjeta en reposo (ingreso).
- **md** (`0 4px 14px rgba(0,0,0,0.07)`): menús, barra inferior.
- **lg** (`0 8px 28px rgba(0,0,0,0.09)`) / **xl** (`0 16px 48px rgba(0,0,0,0.12)`): modales y paneles.
- **Hover de tarjeta-enlace** (`0 6px 18px rgba(0,0,0,0.1)`, con `translateY(-2px)`).
- **Hover de botón** (`0 4px 12px rgba(0,0,0,0.12)`, con `translateY(-1px)`; al apretar `scale(0.98)` sin sombra).

### Named Rules
**The Sombra que Separa Rule.** La sombra es negra, difusa y de baja opacidad (≤ 0,12). Separa la tarjeta del fondo; no la hace flotar ni la tiñe. Sin desenfoque de fondo en las capas superpuestas (overlay al 50 %, `blur: 0`).

## Shapes

Esquinas amplias, como en las superficies de Apple: 6 / 8 / 10 / 16 / 22 px. Los campos y los ítems de barra usan 10 px (el radio por defecto), las tarjetas y modales 16 px, los botones e insignias 22 px, que con 44 px de alto los vuelve píldora. Avatares y puntos de estado son círculos. Bordes de 1 px, siempre grises.

## Components

### Buttons
Tranquilos y firmes: píldora azul que se levanta un píxel.
- **Shape:** píldora (22px de radio, 44px de alto mínimo).
- **Primary:** relleno azul de acción, texto blanco, padding horizontal de 22px, tamaño `md`.
- **Hover / Focus:** `translateY(-1px)` y sombra de hover en 140 ms con curva de salida; al apretar `scale(0.98)`. Foco con contorno azul (`:focus-visible`).
- **Secundarios:** variantes `light`, `default` y `subtle` de Mantine sobre el mismo azul o en gris; nunca en un color reservado.

### Chips / Insignias
- **Style:** cápsula de 22px, peso 600, minúscula de oración, sin interletrado. La insignia de interfaz va en `light` azul.
- **Estado de material:** la insignia de estado (`InsigniaEstado`) usa el color reservado de I.20.2 correspondiente.

### Cards / Containers
- **Corner Style:** 16px (`Paper` por defecto `lg`).
- **Background:** blanco en claro, `#1c1c1e` en oscuro.
- **Shadow Strategy:** borde de superficie de 1 px; `sm` cuando la tarjeta está sola sobre el fondo.
- **Internal Padding:** 20px (`lg`) en indicadores, 28px (`xl`) en formularios destacados.

### Inputs / Fields
- **Style:** tamaño `md`, 44px de alto mínimo, 10px de radio, borde `borde-campo`, fondo de tarjeta. Coma decimal en campos numéricos (se acepta también el punto).
- **Focus:** borde y anillo azul; cursor de texto azul.
- **Error:** mensaje de Mantine bajo el campo; los avisos de error usan `Alert` liviano.

### Navigation
- **Barra lateral estilo macOS:** fondo `barra`, borde derecho de 1 px. Encabezado con el logo (44px) y «Trazabilidad» en 16px/650. Ítems de 44px con ícono gris de 20px (trazo 1.6) y nombre en 14.5px/500, separación de 12px, radio 10px. Hover en gris al 4 %; el activo queda sobre una pastilla gris al 7 %, texto en 600 y el ícono en azul. Transición de 180 ms.
- **Pie:** tarjeta de usuario (avatar azul liviano, nombre 650, rol atenuado) con borde y radio de 12px; abre el menú con catálogos, modo claro/oscuro y cerrar sesión.
- **Teléfono:** barra inferior blanca con borde superior; el activo se pinta en azul y engrosa el trazo del ícono a 2.

### Tarjeta indicador (firma)
Etiqueta atenuada con ícono de 16px, cifra grande (36px, 650, tabular) y una línea de contexto atenuada. Un punto de 10px con el color de su estado aparece **solo** si el indicador es de material (I.20.2); cualquier otro indicador no lleva color. Si es enlace, toda la tarjeta navega y se levanta 2px al pasar.

### Encabezado de pantalla
Título display, una línea de descripción atenuada en 15px y las acciones a la derecha, alineadas a la base.

### Estado vacío
Ícono atenuado de 34px con trazo 1.3, título en 600, descripción atenuada centrada (máx. 420px) y, si corresponde, la acción para cargar lo que falta.

### Movimiento
Transiciones de 160–180 ms con curva de salida `cubic-bezier(0.22, 0.61, 0.36, 1)`; la pantalla nueva entra con 6–10px de desplazamiento y opacidad (340 ms); modales y menús con «pop». El cambio de modo claro/oscuro es un fundido de 260 ms (View Transitions). Con reducción de movimiento no se ve nada de esto.

**The Movimiento que No Afirma Rule.** Se anima lo que el usuario tocó o lo que acaba de entrar, una sola vez. Nada se mueve solo después de entrar, nada parpadea, y ninguna animación sugiere que un registro se guardó, se firmó o cambió de estado: eso lo dice el texto.

## Do's and Don'ts

### Do:
- **Do** usar el azul de acción (`#0071e3` claro, `#0a84ff` oscuro) para la acción primaria, enlaces, foco y selección, y nada más.
- **Do** consumir los colores de estado por nombre (`estadoCuarentena`, `estadoEnAnalisis`, `estadoAprobado`, `estadoRechazado`) a través de `COLORES_ESTADO_ROTULO`.
- **Do** dar 44px a todo control y ganar densidad en el espaciado (6 / 10 / 14 / 20 / 28 px).
- **Do** apoyar las tarjetas blancas (16px de radio, borde `#e5e5ea`) sobre el fondo `#f5f5f7`; en oscuro, `#1c1c1e` sobre negro.
- **Do** usar cifras tabulares en tablas, campos e indicadores.
- **Do** escribir cabeceras e insignias en minúscula de oración, peso 600.
- **Do** respetar `prefers-reduced-motion` en toda animación nueva.

### Don't:
- **Don't** usar amarillo, verde, rojo ni el gris de análisis de I.20.2 en botones, navegación, gráficos decorativos o avisos que no sean estado de material.
- **Don't** agregar un segundo color de acento, degradés ni muestras decorativas: el arcoíris vive solo en el logo.
- **Don't** poner rótulos chicos en mayúscula sostenida sobre títulos o cifras.
- **Don't** usar sombras teñidas, duras o de opacidad mayor a 0,12, ni desenfoque detrás de modales.
- **Don't** animar nada que se mueva solo, rebote o sugiera que algo se guardó o firmó.
- **Don't** achicar un control por debajo de 44px para que entre más información.
