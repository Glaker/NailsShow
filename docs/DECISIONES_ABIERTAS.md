# Decisiones abiertas

Referenciado por `CLAUDE.md` §7: cuando el documento de alcance no cubra algo, se
anota acá y se pregunta. **No se inventa la regla.**

Cada entrada lleva quién decide, qué bloquea, y el valor provisorio si lo hay.
Cuando una se resuelve, se mueve a «Resueltas» con fecha y quién decidió — el
historial importa: el control de cambios de GAMP 5 exige poder reconstruir por
qué el sistema hace lo que hace.

Última actualización: 2026-09-22.

---

## Abiertas — requieren Dirección Técnica

### D-01 · Estándar de firma electrónica

**Pregunta.** ¿Se busca equivalencia con firma digital según la Ley 25.506, o
alcanza con firma electrónica avanzada con trazabilidad?

**Fuente.** §9.2 pregunta 8 del alcance.
**Bloquea.** `core.firmas` y todo el módulo de firma. Cambia los requisitos de
infraestructura de forma sustancial (la firma digital exige certificados de una
autoridad certificante licenciada).
**Estado.** Sin resolver. La fase 1 recortada del demo no la toca.

### D-02 · Quién escribe el veredicto de calidad

**Pregunta.** ¿El veredicto de aprobación o rechazo lo escribe Control de Calidad
o Dirección Técnica?

**Fuente.** Inconsistencia 12 de §10. PG.60.1 asigna la facultad a Control de
Calidad; I.50.6 e I.50.7 la asignan a Dirección Técnica con CC limitado a
informar. Como hoy la misma persona ocupa ambos puestos, en papel la
contradicción es invisible.
**Bloquea.** El sujeto de la política RLS de escritura sobre
`controles_calidad.veredicto`. Hay que elegir uno: la política necesita un rol.
**Estado.** Sin resolver.

### D-03 · Modo de separación de funciones

**Pregunta.** ¿Qué modo aplica a cada tipo de registro: obligatoria, advertencia
registrada, o no aplica?

**Fuente.** §3.4 del alcance.
**Valor provisorio.** `ADVERTENCIA_REGISTRADA` por defecto para toda entidad
nueva, que es lo que el documento recomienda. Bloquear duro un flujo que la
planta no puede cumplir con 11 personas lleva a que el operario busque la vuelta,
que es peor que registrar el desvío.
**Requiere.** Decisión explícita de DT documentada en el control de cambios.
**Estado.** Provisorio en uso, sin confirmar.

### D-25 · Con qué alcance firma la Dirección Técnica suplente

**Pregunta.** ¿La DT suplente (Eliseo Agustín Coggiola) firma las mismas cosas
que la titular (Anabella Gregorini), o hay actos reservados a la titular?

**Conflicto.** Las dos fuentes dicen cosas distintas.

- El **alcance** es explícito: «Dos personas en el rol se modelan como titular y
  suplente… **Ambos pueden firmar liberaciones**, y cada firma queda atribuida a
  la persona concreta que la ejecutó. El sistema no permite firmar en
  representación de otro bajo ninguna circunstancia.»
- La **conducción del proyecto** informó lo contrario el 2026-09-22: el suplente
  ejerce las funciones de Dirección Técnica —aprueba lotes, carga fórmulas— pero
  **no firma el batch record**, que firma únicamente la titular.

No son necesariamente incompatibles: «liberación de lote» y «batch record» son
dos documentos distintos, y es posible que el suplente libere lotes y no cierre
el registro de fabricación. Pero el alcance no distingue, y la diferencia
determina qué puede hacer una credencial.

**Fuente.** § nómina del alcance («Sobre la Dirección Técnica») contra lo
informado por la conducción del proyecto.
**Bloquea.** El batch record —que todavía no existe como tabla— y, antes que
eso, si `gmp.fn_formula_aprobacion` (20260921090000) debe exigir
`es_dt_titular` además de rol `DIRECCION_TECNICA` para pasar una fórmula a
VIGENTE. Hoy no lo exige: cualquiera de las dos personas puede hacer vigente una
fórmula, y queda atribuida a quien lo hizo.
**Valor provisorio.** El del alcance: ambas personas con los mismos permisos,
cada acto atribuido a quien lo ejecutó. Es lo que implementa
`20260922190000_alta_direccion_tecnica_suplente`. No se restringió nada de más
porque restringir sin regla escrita es inventar la regla (CLAUDE.md §7).
**Requiere.** Confirmación de Anabella Gregorini como DT titular, documentada en
el control de cambios. Si hay actos reservados, hay que enumerarlos: en un
sistema BPF «lo firma la titular» tiene que ser una restricción de la base, no
una costumbre.
**Estado.** Sin resolver. Abierta el 2026-09-22.

---

## Abiertas — bloqueadas por documentación faltante

### D-04 · Regla de formación del número de lote

**Falta.** POE I.40.25 «Asignación de lote», listado como vigente pero ausente
del proyecto.
**Bloquea.** Órdenes de producción y batch record.
**Lo que sí tiene respaldo.** La partida (`P1`, `P2`…) identifica la jornada de
fraccionamiento dentro de un mismo lote de granel (R.40.27.1). El lote y
vencimiento del producto terminado coinciden con los del granel.

### D-05 · Criterio de rotación de stock

**Falta.** POE I.20.3 «Expedición de producto terminado».
**Pregunta.** ¿Se despacha por orden de ingreso (PEPS) o por vencimiento más
próximo (FEFO)? El sistema anterior implementó FEFO.
**Bloquea.** Expedición, pedidos y reservas.
**Nota.** Rotación física y criterio de costeo son decisiones independientes. Se
puede despachar por FEFO y costear por promedio ponderado sin contradicción.

### D-06 · Organigrama vigente

**Falta.** PG.60.1 v03. El vigente (v01) declara 7 personas y la nómina real es
de 11, con 3 operarios sin identificar.
**Bloquea.** La matriz de permisos deriva del organigrama, y el organigrama
documentado es exigencia explícita de BPF. **Bloqueante para producción**, no
para el demo.

---

## Abiertas — menores

### D-07 · Ventana de «inmediatamente» en muestreo de granel

**Fuente.** RN-12, I.50.4. El POE dice que el muestreo se toma «inmediatamente
finalizada la elaboración», sin definición numérica.
**Valor provisorio.** Advertencia registrada si pasan más de **60 minutos**,
configurable.
**Requiere.** Confirmación de DT.

### D-08 · Reinicio del correlativo anual

**Fuente.** §9.3. Los registros usan formato `correlativo/año` (`R.60.18.1.1/24`).
**Supuesto adoptado.** El correlativo se reinicia el 1 de enero.
**Estado.** Supuesto, sin confirmar.

### D-09 · Uso real del rótulo gris «en análisis»

**Fuente.** §9.2 pregunta 6. I.20.2 define cuatro estados con cuatro colores, pero
el sistema anterior parece haber usado solo tres.
**Estado.** Los cuatro colores ya están en `src/app/theme.ts`. Confirmar si el
estado se usa en la práctica.

### D-10 · Formato del número de registro interno del lote

**Fuente.** RN — I.20.1 paso 7 manda asignar un número de registro interno al
lote recibido, pero no define cómo se compone.
**Valor provisorio.** Correlativo por año con prefijo: `RI-00001/2026`, generado
por `trg_numerar_lote_insumo` contra `gmp.contadores`.
**Requiere.** Confirmación de DT, o el POE que fije la regla. Si el formato
cambia, cambia solo la función de numeración: los números ya emitidos no se
tocan, porque están en registros firmados.

### D-11 · Codificación de los depósitos sin número en los POE

**Fuente.** §4.1. Los POE numeran cinco depósitos (01 envase/empaque cuarentena,
04 materia prima cuarentena, 05 materia prima aprobada, 19 PT importado
aprobado, 20 PT importado cuarentena) y nombran otros cinco sin numerarlos.
**Valor provisorio.** Código mnemotécnico: `INF` inflamables, `GRA-CUA` graneles
cuarentena, `ENV-APR` envases aprobados, `CTM` contramuestras, `RET` retiro de
mercado.
**Requiere.** Que la planta confirme si esos depósitos tienen número asignado en
la práctica. Es un dato que se contesta caminando el depósito.

### D-12 · Alta de cuentas durante el demo

**Fuente.** Decisión de implementación, no de negocio.
**Situación.** El registro está abierto (`enable_signup = true`) y sin
verificación de correo (`enable_confirmations = false`), a pedido de la
conducción del proyecto para el demo. El primer usuario que se registra queda
como `ADMINISTRADOR_SISTEMA`; los siguientes entran **desactivados** y sin rol,
y un administrador los habilita. El rol nunca se lee de los metadatos del alta:
con registro abierto, eso sería dejar que cada uno elija su propio permiso.
**Antes de producción.** Cerrar el registro y pasar a alta por invitación. En un
sistema BPF, quién puede tener credencial es parte de lo que se audita, y una
cuenta que se crea sola no tiene a nadie que responda por ella.

### D-13 · Movimiento en la interfaz

**Fuente.** Decisión de la conducción del proyecto, 2026-09-04.
**Situación.** La fase 0 prohibía toda animación. Se revisó: ahora hay
transiciones suaves de estado (hover, foco, apertura de panel, entrada de
tarjeta), de 160 a 220 ms, y sigue prohibido todo lo que se mueva solo o
sugiera que algo se guardó o cambió de estado. `prefers-reduced-motion` anula
todo. Documentado en el encabezado de `src/app/theme.ts`.
**Estado.** Resuelto, se deja anotado porque revierte un criterio anterior.

### D-14 · Quién mueve stock, más allá del ajuste de inventario

**Fuente.** §3.3, tabla del bloque comercial. La matriz tiene una sola fila
sobre stock, «Ajustar stock por diferencia de inventario», con DT, ADM y GP. No
tiene fila para la entrada por compra, la transferencia entre depósitos, el
descarte ni la salida de muestra, que son las otras cuatro operaciones que el
libro de movimientos admite hoy.
**Valor provisorio.** El mismo conjunto de la fila que sí existe: DT, ADM y GP.
Es el más restrictivo de los defendibles. Ampliarlo después es cambiar una
política; recortarlo cuando la gente ya trabaja con el permiso, no.
**Tensión conocida.** La transferencia entre depósitos es trabajo de depósito y
hoy el `OPERARIO` no puede hacerla, aunque sí puede recepcionar y avanzar el
circuito de calidad del lote. Es probable que en la práctica corresponda
dárselo.
**Requiere.** Que la planta diga quién mueve físicamente la mercadería entre
depósitos y quién registra un descarte. Se contesta caminando el depósito, como
D-11.

### D-15 · El catálogo cargado no tiene materias primas

**Fuente.** Carga del 2026-09-10 (`insumos_seguros.csv`, 299 ítems).
**Situación.** Los 299 insumos se reparten en 243 etiquetas, 50 materiales de
envase y 6 de empaque. **Ninguno es materia prima.** Para un laboratorio
cosmético eso es llamativo: la materia prima es el material sobre el que pesan
RN-01 (protocolo de análisis del fabricante), RN-03 (pesada de pigmentos en
recepción) y RN-48 (inflamables al depósito exterior), que son tres de las
reglas que la fase 1 implementó y que hoy no se ejercen sobre ningún ítem real.
También quedan sin uso los depósitos 04 y 05, que los POE dedican a materia
prima en cuarentena y aprobada.
**Requiere.** Confirmar con la Gerencia si el archivo era solo el catálogo de
envase y empaque y falta una segunda carga, o si las materias primas se
registran por otra vía. Hasta que se aclare, los tres booleanos de circuito
están en `false` para todo el catálogo y ninguna de esas tres reglas se activa.

**Contestada el 2026-09-11, salvo los inflamables.** Era lo primero: faltaba una
segunda carga. Llegaron 40 materias primas (migración `20260911140000`), con
`requiere_protocolo` en las 40 por RN-01 y `requiere_pesada_recepcion` en los 29
pigmentos por I.20.1 paso 5. D-16 y D-17 quedaron resueltas el mismo día.

**Lo que sigue abierto: `es_inflamable`.** La Gerencia indicó dejar las 40 en
`false` por ahora. Con fragancias, esencias y monómero en la lista es poco
probable que ninguna lo sea, así que conviene volver a preguntarlo y no tratar
el `false` como respuesta. Mientras siga así, **RN-48 y el depósito exterior
(`INF`) no se ejercen sobre ningún ítem del catálogo**: la regla está
implementada y sin material al cual aplicarse.

**Ojo con cómo se corrige.** `gmp.insumos_catalogo` tiene política de UPDATE
para DT, GP y SYS, así que la base lo permite; pero **no hay pantalla de edición
de insumo** —`/insumos` sólo da de alta—, de modo que hoy el cambio va por
migración. Si se espera que lo toquen ellos desde la aplicación, hay que
construir esa edición primero.

---

### D-18 · Un tercio del catálogo de productos no es producto cosmético

**Fuente.** Carga del 2026-09-11 (`productos.csv`, 483 ítems).
**Situación.** Alrededor de **108 de los 483** no son producto cosmético:
pinceles, fresas, limas, tijeras, empujadores de cutícula, dappen dishes, nail
tips y exhibidores. Son herramientas, descartables y material de venta.
`gmp.productos` es el catálogo de producto terminado alcanzado por Buenas
Prácticas: lo que entra ahí queda sujeto a orden de producción, liberación de
lote, contramuestra y retiro de mercado. Una tijera no tiene nada de eso, y
arrastrarla al circuito ensucia justamente los registros que el inspector mira.
**Se cargaron igual**, porque así vino la lista y porque el maestro tiene que
reflejar lo que la planta vende.
**Requiere.** Que la Gerencia confirme la separación. El lugar natural es la
columna `tipo`, que sigue en `text` esperando vocabulario: alcanzaría con
COSMETICO / ACCESORIO para que el circuito de producción filtre por ahí. Es la
decisión más importante que dejó esta carga.

---

### D-19 · Vida útil de 36 meses pareja para los 483 productos

**Fuente.** Indicación de la Gerencia del 2026-09-11, al cargar la lista.
**Situación.** Se escribió `vida_util_meses = 36` en los 483. Es un valor
declarado, no un dato del archivo. Dos reservas que conviene dejar dichas:

1. La vida útil de un cosmético sale de su **estudio de estabilidad** y es por
   producto. Un inspector la va a pedir por producto, con el estudio detrás. 36
   meses parejos sirve para arrancar, no para sostener.
2. Los ~108 ítems de D-18 **no tienen vencimiento**: un pincel con vida útil de
   tres años es una afirmación sin sentido que hoy está escrita en la base.

**No se puso como `DEFAULT` de la columna**, a propósito: así todo producto
futuro no nace afirmando tres años sin que nadie lo haya dicho de él, y el
asiento de auditoría conserva quién puso el 36 y cuándo.
**Requiere.** Vida útil por producto, o al menos por familia, con el estudio de
estabilidad que la respalda. Y decidir qué se hace con los que no vencen.

---

### D-20 · Nombres truncados en la lista de productos

**Fuente.** Carga del 2026-09-11.
**Situación.** 36 de los 483 nombres vienen cortados en exactamente 40
caracteres, varios a mitad de palabra: «… PINCEL REDONDO KOLINSKY N4 PARA DISE»,
«Fresa Gramaje Medio Diamante Cono trunca», «Empuj de cutíc profesional
redondo-punta». Uno además tiene el carácter final dañado: `176` dice «PARA
DISEí» donde iba «PARA DISEÑO». Parece un campo de 40 en el sistema de origen.
**Se cargaron tal cual**, mismo criterio que R-04: el nombre es la denominación
del papel y la identidad la lleva `codigo_interno`, que está sano.
**Requiere.** El nombre completo de esos 36. Se corrigen por migración
rectificativa. No es urgente pero sí visible: son los nombres que el operario
lee en pantalla.

---

### D-21 · Dos productos marcados como discontinuados en el propio nombre

**Fuente.** Carga del 2026-09-11.
**Situación.** `136` «(No se usa mas) NAIL PREP 12ML» y `138` «no se
usaCLARIFICADOR ( CLEANSER ) 250ML» traen la baja escrita en el nombre. Se
cargaron con `activo = true` como todos los demás: bajarlos habría sido
interpretar una cadena de texto, y `activo` es una decisión de la Gerencia.
Nótese que `385` es «CLARIFICADOR ( CLEANSER ) 250ml. (NUEVO)», lo que sugiere
que `138` es su versión vieja.
**Requiere.** Confirmar y desactivarlos. Es un `update` de dos filas.

### D-22 · Significado del color de fila del inventario de apertura

**Pregunta.** `inventario_apertura.csv` (carga de saldo inicial de apertura,
2026-09-16) trae una columna `color_origen` con VERDE, AMARILLO, ROJO, VIOLETA
y CELESTE en casi todas las filas (644 de 650). No correlaciona con tener
cantidad cargada (103 de 289 «verde» están vacíos), así que no significa «hay
stock». Se desconoce qué codifica: ¿depósito físico? ¿categoría de reposición?
¿urgencia de reconteo?
**Fuente.** §4.1 de `docs/ESPEC_SALDO_INICIAL.md`.
**Bloquea.** Nada todavía: se importó como metadato crudo en
`gmp.lotes_insumo.color_origen`, sin interpretar (migración
`20260916160000_carga_saldo_apertura.sql`). Bloquea sí cualquier regla o vista
que quiera usar el color para algo (filtro, alerta, agrupación).
**Estado.** Sin resolver.

### D-23 · Clasificación de los ítems del inventario fuera del catálogo de insumos

**Pregunta.** `inventario_apertura.csv` trae 294 códigos (de 647) que no están
en `gmp.insumos_catalogo`: herramientas (pinceles, limas, fresas, tijeras,
empujadores), mobiliario y POP (código `550`, exhibidores), merchandising
(remeras, gorras, delantales), libros, lámparas y algunas materias
primas/semielaborados todavía no catalogados (geles, cremas, monómeros,
aceites, alcoholes, pigmentos adicionales a los ya cargados, etc. — ver el
detalle completo en `scripts/apertura/pendientes.md`, generado junto con la
migración). Decidir esto implica: (a) si entran al catálogo GMP en absoluto —
las herramientas y el merchandising probablemente no, por el mismo motivo que
`docs/DECISIONES_ABIERTAS.md` ya señala para `gmp.productos` (herramientas
mezcladas con producto cosmético); (b) para lo que sí es insumo real, qué
`tipo_insumo_enum`, `requiere_protocolo`, `requiere_pesada_recepcion` y
`es_inflamable` les corresponde.
**Fuente.** Análisis de la carga de saldo de apertura, 2026-09-16.
**Bloquea.** Que esos 294 códigos tengan saldo inicial cargado. Hasta que se
resuelva, quedan fuera del sistema por completo (ni catálogo ni stock).
**Estado.** Sin resolver. No se inventó una clasificación para no fabricar
`requiere_protocolo`/`es_inflamable` sin que la planta lo confirme (CLAUDE.md
§7).

### D-24 · Códigos duplicados del inventario de apertura, para cuando se catalogen

**Pregunta.** 9 códigos de la planilla de origen aparecen más de una vez bajo
el mismo `codigo_interno` (`101ET`, `105ET`, `131ENV`, `135GAT` ×3, `136PRE`,
`340AC`, `391BOM`, `511`, y `550` con 9 renglones de mobiliario). Ninguno está
hoy en `gmp.insumos_catalogo` (quedan dentro de D-23), así que la migración
`20260916160000` no tuvo que resolverlos todavía, pero el script
(`scripts/apertura/generar_migracion.mjs`) ya los consolidaría sumando
cantidades el día que el código exista en el catálogo. Falta confirmar que sumar
sea lo correcto en cada caso: por ejemplo `136PRE` junta dos materias primas
con nombre distinto (`NAIL PREP` y `ACETATO DE BUTILO`) bajo el mismo código,
que podría ser un error de captura en vez de dos compras del mismo insumo.
**Fuente.** §4.2 de `docs/ESPEC_SALDO_INICIAL.md`.
**Bloquea.** La exactitud del saldo de estos 9 códigos el día que entren al
catálogo (D-23).
**Estado.** Sin resolver.

---

### D-26 · El saldo de apertura no es un conteo de existencias

**Hallazgo (2026-09-23).** La carga `20260922200000` tomó como existencia la
columna CANTIDAD de la hoja INVENTARIO. Para las materias primas vale 1 en todos
los renglones: es «1 envase», la unidad a la que se refiere el costo. Quedaron 1 g
de monómero, 1 g de agua, 1 g de glicerina.
**Resuelto en forma provisoria** (`20260923150000`, indicación del codirector
técnico): 1 envase × CONTENIDO de la planilla, con la unidad confirmada
(líquidos en litros, polvo/pigmentos/acrílicos en kg), pasado a la unidad del
catálogo. Asentado como conteo **provisorio**, con ajuste de inventario: el 1
original sigue en el kardex.
**Queda abierto.** El conteo físico. Se carga en «Conteo de inventario»
(`/conteo`), que arranca mostrando los provisorios. Las fragancias (1000 ml, sin
densidad, llevadas en g) y las materias primas fuera de la lectura confirmada
(top coat, nail prep, adhesivo, aloe, propilenglicol, microperlas, resina) no
tienen provisorio: hay que contarlas.
**Decide.** Gerencia de Producción (el conteo).

### D-27 · Recetas de la hoja C.V.D. que no entraron

**Contexto.** De 204 renglones celestes entran 142 (26 productos). Los insumos
que faltaban se dieron de alta en `20260923135000`. Los 62 restantes están en
`scripts/lista_materiales/pendientes.md`: variantes descartadas o
discontinuadas, bloques sin producto en el catálogo (esmalte 201, removedor 1 L,
sanitizante 1 L), los componentes de los DUO (son productos terminados: un DUO
es un kit de dos productos y una bolsita) y la etiqueta de lote del primer, que
no tiene código en la planilla.
**Pregunta.** ¿Se dan de alta como producto el removedor 1 L y el sanitizante
1 L, y qué código lleva la etiqueta de lote del primer?
**Decide.** Gerencia de Producción.

### D-28 · Unidades leídas de la hoja C.V.D.

**Contexto.** La planilla no dice la unidad de cada cantidad. Se leyó de la
fórmula de costo de la celda de al lado y está escrita, con su razón, en
`scripts/lista_materiales/decisiones.mjs`. Por indicación: esencia siempre en
ml, aceite de cutícula con la densidad de la vaselina líquida liviana
(*Paraffinum liquidum perliquidum*, 0,845 g/ml a 20 °C), crema a granel
(en kg en la planilla, en g en el sistema). Por lectura: monómero en litros;
en el sanitizante el alcohol, el agua y la glicerina en ml y la fragancia, el
pigmento y el aloe en g; alcoholes del cleanser en litros.
**Pregunta.** Confirmar esas lecturas y que 101MONO sea metacrilato de etilo
(EMA), o cargar la densidad del certificado del proveedor.
**Decide.** Dirección Técnica.

### D-29 · Criterios propios en el alta de insumos del 2026-09-23

**Contexto.** Al dar de alta los insumos que faltaban (`20260923135000`) hubo
que elegir cosas que la planilla no dice. Están marcadas para revisar:
- **Primer, bonder y removedor a granel en ml**, como la esencia: se compran
  líquidos y no hay densidad medida.
- **Primer, bonder y removedor marcados inflamables** (RN-48, al depósito
  exterior): son a base de solvente. Es la opción conservadora; confirmar con
  la hoja de seguridad.
- **Alcohol para sanitizante (135SAN) con la densidad del etanol 96 GL** en el
  saldo provisorio.
- **Toalla**: la tela como materia prima sin protocolo y la estampa como
  etiqueta, hasta que se resuelva D-18.
**Decide.** Dirección Técnica.

## Resueltas

### R-01 · Color del rótulo de cuarentena — 2026-09-04

**Conflicto.** I.20.1 paso 8 instruye rojo para cuarentena; I.20.2 fija amarillo
para cuarentena y rojo para rechazado (inconsistencia 1 de §10).

**Resolución.** **Prevalece I.20.2.** Es el POE específico de rotulado, coincide
con los registros R.20.2.1 v01 y con I.20.5 v03. Corresponde corregir I.20.1.

**Dónde está implementado.** `src/app/theme.ts`, colores nombrados
`estadoCuarentena` (amarillo), `estadoEnAnalisis` (gris), `estadoAprobado`
(verde), `estadoRechazado` (rojo), con la cita de la resolución en el archivo.
La regla RN-04 se implementa además en la base como función determinista y
columna generada.

### R-02 · Método de costeo — 2026-09-04, provisorio

**Resolución.** Promedio ponderado móvil (`PPP`) como valor por defecto, con
`metodo_costeo` por artículo para permitir excepciones.
**Pendiente.** Confirmación del estudio contable: es una política contable
declarada, no una decisión técnica.

### R-03 · Unidad de medida de las 40 materias primas — 2026-09-11

**Era D-16.** El archivo de la Gerencia llegó con `unidad_medida` vacía. En vez
de inventar un valor por analogía, la migración `20260911130000` hizo la columna
nullable con el significado «todavía no se sabe», y puso la contrapartida:
`gmp.fn_validar_lote_insumo` rechaza recepcionar un insumo sin unidad.

**Resolución.** La Gerencia confirmó **gramos** para las 40. Migración
`20260911150000_materias_primas_unidad_gramos.sql`, acotada a los 40 códigos
por lista explícita y no a «las que estén en null», para que el efecto no
dependa del estado de la tabla al aplicarla. Los 40 pasan a ser recepcionables.
Verificado contra la base: 40 en `g`, cero ítems sin unidad en todo el catálogo.

**El `NOT NULL` no se restaura**, aunque `20260911130000` lo había anunciado. El
catálogo se carga por tandas desde planillas y ya llegó una sin unidad: poder
decir «pendiente» sirve de forma permanente. Y el `NOT NULL` nunca fue la
protección real —garantizaba que hubiera algo escrito, no que fuera cierto, y
en la práctica empujaba a poner un `kg` de relleno—; la protección es la
precondición de recepción, que queda vigente. El razonamiento está en el
encabezado de la migración.

### R-04 · La numeración romana de los pigmentos — 2026-09-11

**Era D-17.** Los nombres traen dos anomalías: `165PIG` y `247PIG` son ambos
«PIGMENTO XXIV» (verde manzana y blanco mate), y la serie salta de XXVII
(`330PIG`) a XXXI (`252PIG`).

**Resolución.** **Se dejan como están**, por indicación de la Gerencia. El
ordinal romano es parte de la denominación que usa la planta en el papel, no un
identificador del sistema: la identidad la lleva `codigo_interno`, que es único
y no tiene anomalías. Alinear los nombres con una serie «prolija» rompería la
correspondencia con los registros en papel, que es justamente lo que un
inspector cruza. Queda anotado para que nadie lo «arregle» más adelante
creyendo que es un error de carga.

### R-05 · El saldo de apertura se usa en producción — 2026-09-23

**Conflicto.** `docs/ESPEC_SALDO_INICIAL.md` §5.2 dice que un lote en
`SALDO_APERTURA` no se usa en una producción sin que Dirección Técnica lo
reclasifique, dejando registro. Todo el stock real está en ese estado.
**Resolución.** Por indicación de la conducción del proyecto, **el saldo de
apertura cuenta como disponible y se consume al terminar un pedido, sin
reclasificación previa.** Es un desvío deliberado de la especificación.
**Lo que no se afloja.** Vencido o bloqueado (RN-52) no se consume; cuarentena,
análisis y rechazado tampoco. Para despachar (RN-51) sigue valiendo solo lo
aprobado.
**Dónde está.** `gmp.impedimento_consumo()`, en
`20260923120000_gmp_lote_consumible_en_produccion.sql`.

### R-06 · De qué lote sale el consumo de un pedido — 2026-09-23, provisorio

**Era parte de D-05** (falta I.20.3). **Resolución** de la conducción del
proyecto: automático, sin que Gerencia de Producción elija. Sale primero del
lote que vence antes; entre los que no vencen, del más antiguo en el sistema.
Cada baja queda con su lote en el kardex. Se revisa cuando llegue I.20.3.
