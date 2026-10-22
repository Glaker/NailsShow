# Decisiones abiertas

Referenciado por `CLAUDE.md` §7: cuando el documento de alcance no cubra algo, se
anota acá y se pregunta. **No se inventa la regla.**

Cada entrada lleva quién decide, qué bloquea, y el valor provisorio si lo hay.
Cuando una se resuelve, se mueve a «Resueltas» con fecha y quién decidió — el
historial importa: el control de cambios de GAMP 5 exige poder reconstruir por
qué el sistema hace lo que hace.

Última actualización: 2026-10-15.

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

### D-04 · Regla de formación del número de lote (provisoriamente resuelta: R-08)

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
(_Paraffinum liquidum perliquidum_, 0,845 g/ml a 20 °C), crema a granel
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

### D-30 · Factura a monotributistas: A, no B

**Contexto.** La indicación fue «A a Responsable Inscripto, B a Consumidor
Final o Monotributista». Probado en homologación de ARCA el 2026-09-24: una
**Factura B a un monotributista se rechaza** (código 10243, «Condición IVA
receptor no es válido para la clase de comprobante»), y una Factura A al mismo
receptor se autoriza. La tabla oficial (FEParamGetCondicionIvaReceptor) lista
para Monotributo las clases «A/ALEY/C».
**Implementado.** `comercial.clase_factura()`: A a Responsable Inscripto y a
Monotributo; B a Consumidor Final, Exento y No Alcanzado.
**Pregunta.** Que el contador confirme el criterio antes de producción.
**Decide.** Gerencia, con el estudio contable.

### D-31 · Quién emite facturas

**Contexto.** La matriz §3.3 reserva «Emitir factura y solicitar CAE» a
Administración y Gerencia. Por indicación del codirector técnico (2026-09-24)
las emiten Matias Alonso, Nazarena y Diego (sin cuenta todavía). Matias y
Nazarena tienen rol GERENCIA_PRODUCCION.
**Implementado.** Pueden emitir ADMINISTRACION, GERENCIA y GERENCIA_PRODUCCION.
Dirección Técnica, no.
**Pregunta.** Cuando se emita PG.60.1 v03 (D-06), definir si facturar queda en
Gerencia de Producción o si Matias y Diego pasan a un rol comercial.
**Decide.** Gerencia.

### D-32 · El resultado de ARCA lo registra la sesión del usuario

**Contexto.** La Edge Function corre con el token de quien aprieta «Emitir»
(CLAUDE.md §5), y registra la respuesta de ARCA con esa misma sesión. Un
usuario con permiso de emitir podría, llamando a la API directamente, registrar
una respuesta inventada con un CAE falso. La base valida la forma (CAE de 14
dígitos, vencimiento, número único) y guarda la respuesta completa, pero no
puede saber si ARCA la emitió.
**Mitigación hoy.** Homologación: no hay comprobantes fiscales reales.
**Antes de producción.** Que el registro del resultado lo haga un rol de base
dedicado, sin BYPASSRLS, que solo la Edge Function puede asumir (CLAUDE.md §5),
o una verificación diaria que contraste cada factura AUTORIZADA con
FECompConsultar.
**Decide.** Dirección Técnica y conducción del proyecto.

### D-34 · El módulo de Administración no está en el documento de alcance

**Contexto.** `Requerimientos_App_Administracion_Nail_Show.docx` (2026-09-29)
pide RRHH y sueldos, comisiones, tesorería (cajas, bancos, cuentas de
terceros), COMEX y courier, monotributos y envíos al estudio contable. Nada de
eso está en el alcance v02, que sí cubre stock valorizado, comprobantes,
cuentas corrientes y contabilidad (§4.12).
**Tensión.** El alcance planea contabilidad propia en partida doble (RN-60 a
RN-62); el documento nuevo dice que no hace falta reemplazar al ERP ni al
sistema contable, sino integrarlos (Holistor).
**Pregunta.** ¿Se incorpora el documento como §4.14 del alcance, con reglas
numeradas? ¿Contabilidad propia o importación desde Holistor? ¿Qué conceptos
de liquidación y qué reglas de comisión?
**Implementado mientras tanto.** Solo lo que ya está en el alcance (ítems 24 y
25 de la cola, en lo que cubre §4.12). RRHH, comisiones y COMEX esperan.
**Decide.** Gerencia, con el estudio contable.

### D-35 · Qué stock mira el pedido de Nail Show y qué pasa con lo que no sale

**Contexto.** Pedido del 2026-09-29: el pedido se compara con Calle 5 y lo que
falta se produce; Silveira despacha completo o con faltantes.
**Preguntas.**

- ¿Solo Calle 5, o también lo que está en fábrica (PTF)?
- Lo que no salió en un despacho con faltantes, ¿sigue en el mismo pedido o
  genera uno nuevo por la diferencia?
- El «Sale» suelto de Calle 5, ¿queda para venta de mostrador o se quita?
  **Supuesto adoptado.** Solo Calle 5; el faltante queda pendiente en el mismo
  pedido; el «Sale» suelto queda para mostrador.
  **Decide.** Gerencia.

### D-36 · De dónde sale el costo para el stock valorizado

**Contexto.** El documento de Administración pide stock valorizado y el
alcance (§4.12.2) lo modela con costo por lote y promedio ponderado móvil. El
sistema no tiene costos: `movimientos_stock` no se valoriza (cabecera de 20260910170000) y el comprobante del proveedor (20260929100000) trae el total,
no el precio por renglón.
**Pregunta.** ¿El costo del insumo sale del comprobante del proveedor
(cargando precio por renglón en la recepción) o de una lista de costos? ¿Y el
del producto terminado: materiales según receta, o se suma mano de obra e
indirectos?
**Mientras tanto.** Sin stock valorizado; el resultado mensual es de gestión
y no tiene costo de lo vendido.
**Decide.** Gerencia, con el estudio contable.
**Respondida por R-10 (2026-10-09):** costo del lote cargado en la recepción
(identificación específica); producto terminado = materiales según fórmula +
mano de obra.

### D-37 · Tres emisores de factura sobre un mismo stock

**Contexto.** Indicación del usuario (2026-09-30): las facturas se pueden
emitir a nombre de **Virginia Arleo** (la dueña, persona física), **Athene
del Plata** y **Nail Show SRL**, que son «titulares solidarios del stock». El
sistema tiene hoy un solo emisor vigente (`comercial.configuracion_fiscal`,
índice «una vigente»), y la clase de factura depende solo del receptor
(`clase_factura`: A o B), lo que supone un emisor Responsable Inscripto.
`comercial.facturas` ya guarda CUIT y punto de venta por factura, así que el
cambio de fondo es de configuración, elección y reportes, no de la factura.
**Preguntas.**

1. CUIT y condición frente al IVA de cada uno. Un emisor monotributista emite
   Factura C, no A ni B: la clase pasa a depender de emisor y receptor.
2. Quién elige el emisor de cada factura, y si hay una regla (por cliente,
   por canal, por tope de facturación del monotributo) o es libre.
3. Un certificado por CUIT, o uno solo con el servicio de facturación
   delegado por los otros dos en ARCA.
4. Para el estudio contable: si el stock es de los tres sin distinción, ¿cómo
   se reparte el crédito fiscal de compras (va a quien fue facturado) y cómo
   se registra que un emisor venda mercadería que compró otro? Esto decide si
   el stock, IVA Compras/Ventas y las cuentas corrientes se separan por
   titular o se siguen llevando como uno solo.
   **Implementado sin los datos** (20260930150000, en homologación): varios
   emisores vigentes con su condición frente al IVA, elección al facturar y
   Factura C para el emisor monotributista o exento. **Suposición a confirmar:**
   la C cobra el mismo total que una A o B del mismo pedido (neto + IVA de los
   renglones, sin discriminar IVA), porque el precio de lista es el precio final.
   Certificados: `AFIP_CERT_<CUIT>`/`AFIP_KEY_<CUIT>` por emisor, o
   `AFIP_CERT`/`AFIP_KEY` si los otros delegaron el servicio.
   **Falta:** los CUIT y condiciones reales (una fila por emisor en
   `comercial.configuracion_fiscal`) y la respuesta 4, que puede pedir separar
   IVA y cuentas corrientes por emisor.
   **Decide.** Gerencia, con el estudio contable.

## Rama sesion-15-oct (número definitivo al integrar en main)

### D-sesion-15-oct-1 · Comentarios en solicitudes de pago — adoptada 2026-10-15

Pedido del usuario: Gerencia de Producción ve todas las solicitudes de pago,
sin aprobarlas ni pagarlas, y quien ve una solicitud puede comentarla. Los
comentarios son append-only, a nombre propio y con la hora de la base
(20261015120000, §2.2 del documento de Administración).

### D-sesion-15-oct-2 · El Administrador del sistema no comenta — provisoria

Ve todas las solicitudes (lectura completa, §3.5), y con la regla «comenta
quien ve» habría pasado a escribir. Se lo excluye de comentar
(20261015120100) por ser su acceso de lectura; sí comenta una solicitud que
cargó él mismo, como cualquier solicitante. **A confirmar** por el
usuario: si debe poder comentar, se revierte con una migración nueva.

## Rama ventas-pedidos (número definitivo al integrar en main)

Ventas, pedidos, roles y respaldos (2026-10-15). Número provisorio por rama
(CLAUDE.md §6, Git).

### D-ventas-pedidos-1 · Agustina: producción y ventas

**Contexto.** El modelo ya admite varios roles por usuario
(`core.usuarios.roles_adicionales`, claim `roles`, `core.es_rol`). Agustina
sería VENTAS con ENCARGADA_STOCK adicional («Pedidos a armar», lo que hoy hace
Silveira).
**Resuelto (2026-10-15):** Tercerizados se abre **solo a Agustina**, no a todo
VENTAS. Como el menú y RLS son por rol, hace falta un permiso por usuario o un
rol propio: se define al implementar el bloque 2.
**Resuelto (2026-10-22):** Agustina es VENTAS con ENCARGADA_STOCK adicional y
Silveira conserva ENCARGADA_STOCK (`20261022150000`, `20261022150300`).
**Decide.** Gerencia.

### D-ventas-pedidos-2 · Especificaciones y Gerencia de Producción — resuelta 2026-10-15

Sale del menú de GP y **pierde también la escritura** en
`gmp.especificaciones` (políticas de DT y GP). Va en la migración del bloque 2.

### D-ventas-pedidos-3 · Vendedores nuevos: Johana, María del Rosario, Silvina Alegre

Pendientes, sin reglas inventadas: lista y escala de educadores (Johana);
comisión de mayorista Santa Fe (María del Rosario); integración o carga manual
de Tienda Nube (Silvina). Faltan los correos y los valores del atributo que las
distingue (canal, zona). No bloquea el bloque 3.
**Decide.** Gerencia, en reunión.

### D-ventas-pedidos-4 · Pedido que vuelve a Nazarena — resuelta 2026-10-15

Si Ventas cambia productos o cantidades después de la fecha propuesta, la fecha
queda «a reconfirmar» y vuelve a la bandeja de GP. Si cambia solo precio,
descuento o forma de pago, no vuelve. Mientras esté «a reconfirmar», el pedido
no cuenta en estadísticas.

### D-ventas-pedidos-5 · Tope de descuento efectivo por rol — adoptada 2026-10-15

Los descuentos se encadenan (`1 − Π(1 − dᵢ)`). Superar el tope del rol **no
bloquea**: pide autorización de GERENCIA. Los valores por rol los fija
Finanzas y son configurables.

### D-ventas-pedidos-6 · Pago antes de facturar: anticipo

**Adoptado (modelo):** anticipo imputado al pedido y aplicado a la factura
cuando se emite.
**Abierto (fiscal):** por la Ley de IVA (art. 5), un anticipo que congela
precio puede generar el hecho imponible al cobrarse. No se implementa la
lógica fiscal hasta que confirme el contador.
**Decide.** Contador.

### D-ventas-pedidos-7 · Reproceso de mercadería devuelta desde Calle 5

No existe en el sistema y el POE (RN-25) no está redactado. El bloque 5 queda
diferido hasta que exista el POE; no se diseña el circuito antes.
**Decide.** Dirección Técnica.

### D-ventas-pedidos-8 · Respaldos: destino, PITR y conservación

- **Destino de la copia externa:** almacenamiento a nombre de la empresa, nunca
  una cuenta personal. Cuál, a confirmar. El workflow toma el destino por
  secreto, cifra la copia y la clave queda fuera del repo.
- **PITR:** lo decide la Dirección con `docs/SEGURIDAD_Y_RESPALDOS.md`. La copia
  nocturna externa va igual.
- **Conservación propuesta:** copias diarias por 30 días, mensuales por 10
  años, y nunca borrar datos de la base viva. Fundamento: I.60.12 retiene
  muestras de archivo un año después del vencimiento (vida útil de 36 meses: al
  menos cuatro años desde la fabricación); el Código Civil y Comercial (art. 328) exige conservar la documentación comercial diez años.
  **Decide.** Dirección Técnica y contador.

### D-ventas-pedidos-9 · Exportación completa — adoptada 2026-10-15

Todas las tablas, incluidos costos y auditoría, solo para ADMINISTRADOR_SISTEMA
y GERENCIA. Cada exportación queda registrada con autor y fecha.

### D-ventas-pedidos-10 · Foto del importe pedido y condición de estadísticas — adoptada 2026-10-15

Un pedido cuenta en las estadísticas de ventas solo cuando Nazarena propuso
fecha para el pedido **entero** (no solo para renglones demorados) y Ventas lo
confirmó. En ese momento se congela una foto del importe pedido (cantidades,
precios y descuentos tal como quedaron). Las ediciones posteriores cambian el
importe enviado o facturado, nunca la foto. La foto se implementa antes de
habilitar la edición en APROBADO.

### D-ventas-pedidos-11 · Rama base del trabajo

`main` está 82 commits atrás de `costos-fase-1`, que es lo aplicado en la base
real. `herramientas`, `sesion-15-oct` y `ventas-pedidos` salen de
`costos-fase-1` (desde `main` no compilan: les faltan archivos como
`src/features/costos/`). `ventas-pedidos` va encima de las otras dos. Falta
decidir cuándo se lleva todo a `main` (Vercel publica desde `main`).

### D-ventas-pedidos-12 · Árbol de trabajo ordenado — resuelta 2026-10-15

Los cambios sin commitear eran del usuario, de otras sesiones: quedaron en
`herramientas` (sesión A) y `sesion-15-oct` (sesión B), un commit por tema.
Siguen sin commitear, a decisión del usuario: `react-doctor`, `shadcn`, el
script `doctor` y la clave `intent` de `package.json`; `AGENTS.md`;
`.claude/skills/`; `.impeccable/review/`; `react-doctor.yml`.

### D-ventas-pedidos-13 · «Aprobado» se guarda como CONFIRMADO — a confirmar

El plan aprobado hablaba de un estado nuevo APROBADO. En la base, el pedido de
venta aprobado queda en el **CONFIRMADO** de siempre, porque es el estado que
leen Calle 5, el armado, el despacho, la facturación y los S-xxxx (14
migraciones y unas 15 partes del front). Lo nuevo es cómo se llega: solo desde
FECHA_PROPUESTA y con foto, y eso lo controla la base (20261019130100). La
pantalla lo muestra como «Aprobado» en los pedidos de venta. Renombrarlo
obligaría a reescribir todo el circuito posterior sin cambiar ninguna regla.

### D-ventas-pedidos-14 · Ventas confirmadas antes del circuito nuevo — resuelta 2026-10-19

Los pedidos de venta que ya estaban CONFIRMADOS o CUMPLIDOS antes de
20261019130100 no tienen foto y no aparecen en `comercial.v_ventas_pedidas`.
**Resuelta por el usuario (2026-10-19):** sin foto retroactiva. La
estadística de importe pedido arranca desde la puesta en servicio de 20261019130100.

Nota de numeración: el circuito se escribió como 20261015130000/130100 y se
aplicó como 20261019130000/130100. Los números intermedios los usa la rama
giorgio, cuyas 20261019110000 y 120000 ya están registradas en la base real.

### D-ventas-pedidos-16 · Giorgio en espera de la dirección — abierta

Suspendido hasta que la dirección decida si se paga la API. Mientras tanto: no
se trabaja en la rama `giorgio` ni en su worktree (queda commiteada y sin
integrar); no se crea ninguna clave de API, ningún secreto
`ANTHROPIC_API_KEY`, ninguna Edge Function de Giorgio ni ninguna tabla de su
registro, en ninguna base; nada de Giorgio entra en las ramas en curso.
**Diseño acordado para cuando se retome:**

1. Primero una capa **sin IA**: ayuda por pantalla, tarjetas de «de dónde sale
   este número» armadas por el sistema, buscador con «Llevame a…» y preguntas
   frecuentes por rol.
2. Una capa **con IA, apagada**, que se activa solo si el registro de uso
   muestra que hace falta, con tope mensual configurable.
   Las decisiones D-57 a D-60 de la rama `giorgio` se renumeran con la
   convención por rama (CLAUDE.md §6, Git) cuando se retome.
   **Decide.** Dirección.

### D-ventas-pedidos-15 · Quién propone la fecha — adoptada

Solo Gerencia de Producción (Nazarena). Gerencia no, porque la política de
UPDATE de `comercial.pedidos` no la incluye y el pedido no pasaría a
FECHA_PROPUESTA.
**Abierta:** quién propone fechas cuando Nazarena está ausente.

### D-ventas-pedidos-17 · Gantt por producción de producto, no por pedido — resuelta 2026-10-19

**Resuelta (diseño aprobado por el usuario el 2026-10-19, 20261019140000):** la
unidad sigue siendo el pedido de producción, pero cada S-xxxx nuevo lleva un
solo producto (al aprobar una venta, uno por producto que falta). GP elige el
destino de cada uno (`para_pedido_id`: una venta aprobada que lleve el producto,
o stock) y carga producción nueva con `comercial.crear_produccion`. Consumos,
«Terminado», lote y reserva no cambian. Límites aceptados: una producción va a
un solo destino; reasignarla no avisa a la venta que la pierde.

Planteo original:
Pedido del usuario (2026-10-16), para después del bloque 3: en el Gantt,
Nazarena no carga un pedido entero sino **producción de un producto**, y decide
para qué pedido va o si es para tener en el depósito. Hoy el Gantt planifica
pedidos (`comercial.pedidos.plan_inicio`, `plan_dias`) y lo que falta de una
venta va a Producción como un S-xxxx entero (`para_pedido_id`). **A diseñar**:
la unidad de planificación (producción de un producto con cantidad), cómo se
asigna a uno o varios pedidos o a stock, y cómo convive con la fecha
comprometida del bloque 3.

## Rama stock-pt-orden (número definitivo al integrar en main)

### D-stock-pt-orden-1 · La orden terminada carga el stock — adoptada 2026-10-22

**Decisión del codirector técnico.** Al terminar la orden, Gerencia de
Producción carga lo obtenido en la fábrica (PTF) con el lote, retenido; cuando
la DT libera, queda disponible. Si la orden tiene pedido, la entrada va a
nombre del pedido y su «Terminado» no la repite. El control de calidad y la
liberación siguen siendo de la DT (RN-51). La carga inicial de producto
terminado se hace con «Entró» o «Contar»; la trazabilidad la da el lote.
**Dónde está.** `20261022150100_comercial_orden_terminada_entra_a_stock.sql`.

### D-stock-pt-orden-2 · Depósito Berna y movimiento libre — adoptada 2026-10-22

**Decisión del codirector técnico.** Tercer depósito de producto terminado,
Berna (BER), con Fábrica y Calle 5 en una pestaña «Depósitos». Se transfiere
en cualquier sentido entre los tres; lo que sale de la fábrica toma solo lo
liberado (RN-51). Los pedidos se siguen despachando desde C5 o PTF.
**Pendiente.** Si Berna despacha pedidos de clientes.
**Dónde está.** `20261022150200_comercial_deposito_berna.sql`.

### D-loteo-1 · Hoja de loteo impresa desde el sistema — adoptada 2026-10-22

**Decisión del codirector técnico.** «Lotear» va en el tablero de Gerencia de
Producción, una fila por orden abierta, y en la ficha de cada orden. Imprime
la hoja de la plantilla de la planta («lote 20102026.pptx»): 72 etiquetas de
15 × 8 mm en las mismas posiciones, Calibri 8 pt. No se cambia ninguna
medida. Los dos renglones se editan una vez y valen para las 72.
- Primer renglón por defecto: la fecha de la orden en DDMMAAAA.
- Segundo renglón por defecto: `v:MM/AA` con el vencimiento de la orden, que
  es fecha de elaboración más vida útil. La plantilla dice 10/29 para un lote
  de 10/26, o sea 3 años, aunque el pedido hablaba de 2.

Se imprime en A4 al 100 %: la diapositiva de PowerPoint va centrada en la
hoja, como la imprime PowerPoint sin «ajustar al papel».
**Pendiente.** Confirmar con la primera hoja impresa que las etiquetas coinciden
con las que salían de PowerPoint. Si PowerPoint las escalaba al papel, salían
un poco más grandes.
**Dónde está.** `src/features/produccion/Loteo.tsx`, `posicionesLoteo.ts`, `global.css`.

### D-recepcion-3 · Eliminar una recepción sin motivo — adoptada 2026-10-22

**Decisión del codirector técnico.** Quien registra recepciones (RECEPCION,
GP, DT) elimina con un botón una recepción mal cargada, sin dar razones.
No se borra ni se modifica nada: queda una fila en
`gmp.recepciones_eliminadas` con quién y cuándo, y RLS oculta la recepción y
sus lotes en toda consulta. El administrador del sistema los sigue viendo.
Solo se puede antes de cargarla a stock y con todos los lotes en recepción o
cuarentena. Lo eliminado no vuelve.
**Pendiente.** Una recepción ya cargada se corrige anulando sus movimientos
de stock; eliminarla en ese caso no está implementado.
**Dónde está.** `20261022160200_gmp_eliminar_recepcion.sql`.

### D-recepcion-2 bis · Envases aprobados con una sola confirmación — adoptada 2026-10-22

**Decisión del codirector técnico.** Al cargar a stock ya no se repite el
control de cada envase. Lo que se constató en la recepción (bultos, unidades
contadas, si coincide con lo pedido) alcanza, y un único interruptor,
encendido por defecto, los aprueba a nombre de quien carga. Apagado, entran a
cuarentena. Cada lote conserva su muestreo y su R.50.5.1.

### D-tiempo-envasado-1 · Tiempo de envasado y días recomendados — adoptada 2026-10-22

**Decisión del codirector técnico (pedido del 2026-10-21).** Cada producto
lleva cuántos minutos tarda una persona por unidad, un margen (10 % por
defecto) y cuántas personas lo envasan. Gerencia de Producción lo carga en la
tarjeta de «Tareas pendientes de carga» y ahí ve el cálculo para N unidades.
El Gantt y los modales de planificación muestran «Recomendado: N días» con la
jornada de 8 a 15 y 30 min de descanso (390 min). Es una recomendación, no
bloquea nada.
**Pendiente.** La jornada está fija en la aplicación (`src/lib/envasado.ts`).
Si cambia o hay turnos, pasa a configuración. Los productos que ya salieron
de las tareas de carga no tienen dónde cargar el tiempo todavía.
**Dónde está.** `20261022160000_gmp_tiempo_envasado.sql`.

### D-catalogo-1 · Catálogo de insumos y proveedores editable por todos — adoptada 2026-10-22

**Decisión del codirector técnico.** Todos los roles menos operario dan de
alta y editan fichas de insumo y de proveedor: nombre, tipo, unidad,
depósitos, protocolo, contacto. DT carga una materia prima nueva sin salir de
la fórmula. Siguen en pie:
- aprobar o rechazar un proveedor es solo de DT;
- el código de un insumo con lotes no cambia;
- nada se borra;
- todo queda auditado a nombre de quien lo hizo.

**Riesgo conocido.** Cualquiera puede cambiar el tipo de un insumo o sacarle
«exige protocolo», y eso cambia su circuito de recepción y control. Queda en
la auditoría. Si se quiere cerrar, esos dos campos vuelven a DT/GP con un
trigger.
**Dónde está.** `20261022160100_gmp_catalogo_editable_por_todos.sql`.

### D-rotulos-1 · Planilla de rótulos impresos por adelantado — adoptada 2026-10-22

**Decisión del codirector técnico.** «Imprimir rótulos» arma una hoja A4 con
8 rótulos (dos de ancho), de uno o varios lotes. Cada uno lleva el estado que
se elija aunque el lote todavía no lo tenga, la cantidad de copias y un
renglón «Reservado:» (Nail Show, un tercero, texto libre o vacío para
completar a mano). Se imprimen por adelantado para no volver a imprimir
cuando el lote cambia de estado.
**Riesgo conocido.** Un rótulo de APROBADO impreso antes de tiempo puede
terminar pegado antes de tiempo. Quien lo pega es responsable de hacerlo
solo cuando el sistema muestra ese estado. El QR lleva a la ficha con el
estado real, y el pie dice «Impreso» en lugar de «Emitido». La emisión del
rótulo en el sistema (`gmp.rotulos`) sigue atada al estado: esto es solo
papel.
**Pendiente.** «Reservado» no sale de una reserva del sistema: se elige al
imprimir.
**Dónde está.** `src/features/rotulos/PlanillaRotulos.tsx`.

## Abiertas — 2026-10-21

### D-etiquetado-2 · Varias etiquetas, «No la sé» y reventa

**Pedido** del usuario (2026-10-21), `20261021150000`:

- Un producto lleva **un envase y una o más etiquetas** (frente, trasera); al
  etiquetar se descuentan todas. Cada material lleva una **categoría** libre
  que elige Naza («Guarnición», «Tapa», «Etiqueta trasera»).
- **«No la sé»**: Gerencia de Producción deriva la fórmula a Dirección
  Técnica, que la ve en Fórmulas › Pendientes. Quién y cuándo lo registra la
  base (`gmp.consultar_formula`); un cambio a mano se rechaza.
- **Reventa** (`gmp.productos.solo_reventa`): producto que se compra hecho;
  no lleva envase, etiqueta ni fórmula y sale de las tareas y del etiquetado.

**Pendiente.**

- Un producto de reventa que entra en un pedido igual se registra como
  «producido» al terminar el pedido (`ENTRADA_PRODUCCION`). ¿Cómo entra la
  reventa al stock de producto terminado: por compra, con su remito?
- Una fórmula en BORRADOR ya saca el producto de las tareas y de Pendientes;
  dejarla VIGENTE sigue siendo de DT.

### D-costo-estimado-1 · Costo aproximado de Gerencia de Producción

**Pedido** del usuario (2026-10-21): que Naza, al completar qué lleva cada
producto, pueda cargar opcionalmente un costo aproximado de cada insumo
(envase, etiqueta, extras) y el precio a granel de cada materia prima de la
fórmula («el tacho de 20 L de alcohol sale tanto»). `20261021140000`:
`comercial.costos_estimados`, append-only, el último vale. Entra **último** en
`v_costo_referencia` (Finanzas > último lote > apertura > estimado) y siempre
como provisorio: no compite con D-38 (el precio de referencia lo fija
Finanzas) ni pisa lo pagado.

**Pendiente.**

- Si se compra en kg y el insumo se mide en ml (o al revés), sin densidad
  cargada el estimado no se puede pasar a la unidad del catálogo y queda sin
  costo. La pantalla lo avisa.
- ¿Finanzas quiere ver una lista de insumos que solo tienen costo estimado,
  para confirmarlos? Hoy se ven en Costos con el origen «Estimado (planta)».

### D-etiquetado-1 · Envase etiquetado como paso intermedio de todos los productos

**Decidido** por el codirector técnico (2026-10-20), implementado en
`20261021120000`. Envase + etiqueta = envase etiquetado, para todos los
productos de Nail Show:

- Gerencia de Producción carga cada día cuántos etiquetó por producto; en ese
  momento se descuentan envase y etiqueta de lotes **aprobados**, del que vence
  primero (como al terminar un pedido).
- «Faltan etiquetar» = unidades de pedidos CONFIRMADO o EN_PRODUCCION − envases
  etiquetados sin usar. Va arriba de todo en el Tablero de GP.
- Al terminar un pedido se toman primero los envases etiquetados (del más viejo
  al más nuevo); el envase y la etiqueta sueltos solo se descuentan por lo que
  no cubran. Los faltantes de compra cuentan lo etiquetado como envase y
  etiqueta disponibles.
- Gerencia de Producción carga fórmulas en BORRADOR; dejarlas VIGENTE sigue
  siendo de Dirección Técnica. «No corresponde» marca los productos que no
  llevan fórmula (`gmp.productos.sin_formula`).

- Un etiquetado mal cargado no se borra (RN-54): se anula con su registro
  rectificativo, que devuelve envase y etiqueta, mientras ningún pedido lo
  haya usado. Después, la diferencia va por ajuste de inventario.
- La trazabilidad del lote de producto terminado (`v_trazabilidad_orden`)
  llega a los lotes de envase y etiqueta que vinieron etiquetados, prorrateado.
- Los productos de clientes tercerizados no se etiquetan en este circuito.

**Pendiente.**

- La lista de materiales cargada antes (142 renglones de 26 productos) quedó
  sin rol: hay que marcar en «Tareas pendientes de carga» cuál es el envase y
  cuál la etiqueta de cada uno.

## Abiertas — 2026-10-20

### D-unidad-solo-materia-prima-1 · Capacidad del envase: para qué se usa

**Pedido** del usuario (2026-10-20): que el alta de un material de envase pida
su capacidad «para cálculos posteriores». `20261020120000` agrega
`gmp.insumos_catalogo.capacidad` + `unidad_capacidad` (g o mL), solo en
MATERIAL_ENVASE, optativa (tapas y pinceles no contienen producto). El alcance
no la menciona: es un dato de ficha sin regla de negocio todavía.
**Preguntas.**

- ¿Qué cálculos la usan? (¿controlar que el envase de la orden coincida con el
  contenido neto del producto? ¿estimar envases por lote?)
- La capacidad se puede editar con lotes ya recibidos (queda auditada). Si un
  cálculo firmado llega a depender de ella, ¿se congela como `codigo_interno`?
  **Decide.** Gerencia de Producción con Dirección Técnica.

### D-unidad-solo-materia-prima-2 · Lote del proveedor optativo con remito

**Pedido** del usuario (2026-10-20): que el lote del proveedor sea optativo,
porque el remito ya da la trazabilidad hasta el lote final.
`20261020130000` lo implementa: `gmp.lotes_insumo.lote_proveedor` admite NULL
solo si la recepción tiene número de remito (si no, nada rastrea el material
hacia atrás). **Contradice el alcance:** el esquema lo pedía NOT NULL y el
rótulo R.20.2.1 y la etiqueta de muestreo R.50.4.1 listan «n° lote
proveedor». Hoy el rótulo muestra «—» en ese campo.
**Preguntas para DT.**

- ¿Se acepta el remito como sustituto del lote del proveedor? ¿Para todos
  los tipos, o solo envases y empaques (la materia prima con protocolo trae
  lote en el certificado)?
- ¿El rótulo debería mostrar el remito cuando falta el lote?
  **Decide.** Dirección Técnica.

### D-recepcion-1 · Rol Recepción y control rápido de materia prima

**Decidido** por el codirector técnico (2026-10-20), como excepción a §3.4.
Rol nuevo `RECEPCION` (`20261020140000`, `20261020140100`) para Silveira
(Stefania): registra recepciones, las carga a stock, da de alta insumos (no
edita fichas) y hace el control de materia prima. La misma persona recibe,
muestrea y dictamina: para materia prima alcanza el control organoléptico
(contenedor, rótulo, protocolo, aspecto transparente, olor característico).
El control rápido usa las mismas funciones del circuito completo, así que
quedan el muestreo con su etiqueta R.50.4.1, el R.50.5.1 numerado y el rótulo,
todo a su nombre. Granel y producto terminado siguen con DT/CC, con el
análisis fisicoquímico.

**Pendiente.**

- Incorporar el rol al organigrama PG.60.1 v03 (D-06): a diferencia de
  ENCARGADA_STOCK, este sí toca registros regulados.
- Riesgo conocido: como da de alta insumos y dictamina materia prima, puede
  crear un insumo como «materia prima» y aprobarlo ella. El tipo queda
  auditado. Si se quiere cerrar: que el alta de materia prima la confirme DT/GP
  antes del primer control.
- Preexistente, no lo abre este rol pero lo amplía: la política
  `rotulos_insert_emision` no ata el rótulo al estado del lote, y
  `lotes_insumo_update_circuito` deja cambiar `deposito_actual_id` por UPDATE
  directo. Conviene cerrarlos para todos los roles.
- `comercial.vincular_recepcion_compras` no admite RECEPCION: si recibe algo
  de una compra pendiente, la vinculación la hace GP o Administración.

### D-recepcion-2 · Envases aprobados en la recepción, sin cuarentena física

**Decidido** por el codirector técnico (2026-10-21), como excepción a §3.4.
Quien recibe envases, empaques o etiquetas (RECEPCION o GERENCIA_PRODUCCION;
también CC y DT) los controla al cargar a stock con
`gmp.control_recepcion_envase` (`20261021160000`): embalaje, identificación,
cantidad contra el remito y aspecto. Muestra del 5 % (RN-08) a reutilización
(RN-11). La cuarentena se comprime: el lote pasa por CUARENTENA, MUESTREADO y
EN_ANALISIS en la misma transacción. Si se aprueba antes de cargar, el stock
nace en el depósito de aprobados de la ficha o en «Envases aprobados»
(ENV-APR). Lo que no se controla entra a cuarentena como antes. La materia
prima no cambia (D-recepcion-1).

Con el cambio, RN-10 pasó a la tabla: `muestreos_rn10_verificaciones_previas`
(NOT VALID, solo filas nuevas) impide un muestreo con contenedor, rótulo o
certificado mal también por escritura directa.

**Pendiente.**

- Un envase con `requiere_protocolo` no va por este control, lo dictamina
  Calidad.
- RECEPCION y GP también pueden aprobar envases por el circuito largo. RN-10
  ya está en la tabla, pero el resto de los chequeos de aspecto y cantidad
  solo existen en la función.

## Abiertas — 2026-10-14

### D-55 · Especificaciones cargadas en borrador: qué revisar antes de aprobar

**Contexto.** `20261014140000` cargó en BORRADOR las 18 especificaciones que
existen como documento con requisitos (I-E.50.11 a .17 polvos, .25 líquido
acrílico, .26/.27/.28 cremas y aceite por variedad, .31 gel paint). Ninguna
quedó aprobada: aprobar es un acto de DT.
**Preguntas para DT.**

- Ningún documento fuente está firmado (Emitió/Revisó/Aprobó vacíos).
- Polvos: los archivos dicen I-E.40.x; se cargaron con la numeración I-E.50.11
  a .17 que citan los ME.40.x. ¿Correcto? Solo traen requisitos
  organolépticos y la fórmula como cantidades de una tanda, sin rangos.
- Vida útil: Dark cover pink y Blanco shimmer no la declaran; se cargó 36
  meses (provisorio D-19).
- Densidad de cremas y aceites sin unidad en el documento: se cargó g/ml.
- Gel paint (I-E.50.31): los códigos del fabricante no se vinculan a los
  colores del catálogo.
- Natural, EzFlow, Ferrite, Blanco saturado y French Nail Show no se cargaron:
  sus documentos no tienen requisitos. Faltan los documentos de I-E.50.18 a
  .23, .29, .33 y .34, que citan los ME.
- Ninguna fórmula apunta todavía a su especificación, y la liberación no lo
  exige. ¿Se exige?
  **Decide.** Dirección Técnica.

### D-56 · Costo de producto de la planilla C.T. como punto de partida

**Pedido** del codirector técnico (2026-10-14): usar la hoja C.T. de
`05 INVENTARIO NAIL SHOW FABRICA(4).xlsx` como costo inicial, modificable por
Finanzas.
**Resolución.** `comercial.costos_producto_planilla` (C.V.D. + M.O.D. + C.V.I.
por unidad, append-only: Finanzas lo reemplaza con motivo desde Costos ›
Productos). `v_costo_producto.costo_vigente` = el calculado si está completo;
si no, el de planilla (`fuente_costo`). Se cargaron 301; no entraron 82
renglones sin C.V.D. (solo mano de obra o indirectos), 104 en cero y 10
fuera del catálogo.
**Límite conocido.** El panel de producto, la foto mensual, el resultado y el
cotizador siguen usando el costo calculado; solo la lista de Costos ›
Productos y su desglose muestran el de planilla.
**Revisar** con Finanzas si esos también deben tomar el de planilla mientras
el calculado esté incompleto.

## Abiertas — Giorgio, el asistente de ayuda (2026-10-15)

### D-57 · Declaración de uso previsto de Giorgio — pendiente de aprobación de la Dirección Técnica

**Qué es.** Un asistente de IA (modelo de Anthropic, por defecto Claude Haiku
5.5) que responde preguntas sobre cómo se usa la app, dónde está cada cosa y
de dónde sale cada número. Aparece en toda pantalla con sesión, salvo el
ingreso, y no se imprime.
**Uso previsto.** Herramienta auxiliar de ayuda. **No** crea, modifica ni
borra registros GMP ni de ningún otro tipo; no aprueba, libera, rechaza ni
firma; no reemplaza los POE ni los registros del sistema. Sus respuestas son
generadas por IA, pueden contener errores y se presentan así al usuario («Giorgio
es una IA y puede equivocarse. No es un registro oficial.»).
**Límites, impuestos en código y no solo en el texto:**

- Solo lectura: su única herramienta en la fase 1, `ir_a`, ofrece un botón de
  navegación; no hay herramienta que escriba ni SQL libre.
- Lo que lee lo lee con el token del usuario (RLS) y el contexto que recibe
  se arma solo con las pantallas que ese rol ve.
- Los datos que lee se le entregan marcados como datos, nunca como
  instrucciones.
- Límite diario por usuario y tope global diario de gasto (D-60).
  **Arquitectura.** Edge Function `giorgio`. CLAUDE.md §2 reserva las Edge
  Functions para integración fiscal y tareas programadas; esta es una tercera
  categoría, autorizada por pedido de la conducción del proyecto (2026-10-15), y
  sigue la regla de privilegios de §5: token del usuario, sin `service_role`, la
  clave de Anthropic solo como secreto (`ANTHROPIC_API_KEY`).
  **Estado.** No se afirma que el sistema esté validado. Falta la aprobación de
  esta declaración por la Dirección Técnica y la evaluación de la fase 4.

### D-58 · Registro de consultas: en core, con auditoría y sin retención — 2026-10-15, adoptada

**Pedido.** Registrar cada consulta (usuario, rol, ruta, pregunta, respuesta,
modelo, tokens, herramientas, latencia, error) con retención configurable de
12 meses.
**Conflicto.** Toda tabla de `core` lleva el trigger genérico de auditoría
(invariante 6), que prohíbe el DELETE: la purga es imposible, y además cada
fila se copia en `core.auditoria`, que es append-only.
**Resolución** (conducción del proyecto, 2026-10-15): `core.giorgio_mensajes`
en `core`, con auditoría, **sin retención**: se guarda para siempre. Cada
usuario ve lo suyo; el Administrador del sistema, todo.

### D-59 · Quién escribe el registro de Giorgio — 2026-10-15, adoptada; límite cerrado 2026-10-19

**Resolución.** Solo `core.giorgio_registrar()` (SECURITY DEFINER), que toma
usuario y rol del JWT y estima el costo con los precios de
`core.giorgio_config`. Ningún rol de la aplicación tiene INSERT.
**Límite conocido.** La Edge Function corre con el token del usuario, así que
un usuario podría llamar a la función directo y cargar consultas inventadas a
su nombre. No le da acceso al modelo, pero suma gasto al tope global y podría
apagar Giorgio para todos hasta la medianoche. Está acotado: los tokens se
recortan a lo que puede gastar una consulta real, cada fila cuenta en su
límite diario y queda a su nombre. **Para cerrarlo del todo:** un rol de base
dedicado con JWT firmado por la función (CLAUDE.md §5), como el previsto para
el CAE.
**Actualización 2026-10-19.** Con los topes de D-60 actualizados, una fila
inventada valía cerca de USD 1 y unas 20 apagaban Giorgio hasta fin de mes:
el límite dejó de ser aceptable. Se cerró con una clave compartida:
`core.giorgio_registrar` exige `p_clave`, cuyo SHA-256 debe coincidir con
`core.giorgio_config.clave_registro_sha256`. La clave es el secreto
`GIORGIO_CLAVE_REGISTRO` de la Edge Function; la base guarda solo el hash y
ningún rol de la aplicación puede cambiarlo (se carga desde el editor SQL).
Sin clave cargada, Giorgio responde «todavía no está configurado». Los
recortes de tokens quedan como segunda barrera. El rol dedicado de §5 sigue
siendo la alternativa si se arma para el CAE. Migración `20261019120000`.

### D-60 · Límites de uso de Giorgio — 2026-10-15, adoptada; actualizada 2026-10-19

**Resolución** (conducción del proyecto, 2026-10-15):

- Límite diario por usuario: 50 preguntas para OPERARIO, 150 para el resto
  (con varios roles rige el mayor). Sin límite por minuto.
- Tope global **diario** de gasto, en dólares, configurable (valor inicial
  provisorio: USD 5). Al llegar al 80 % Giorgio se apaga solo hasta la
  medianoche (hora de Argentina), en vez de avisar. Reemplaza al tope mensual
  del pedido original. **Confirmar** el valor del tope.
- Interruptor general que apaga a Giorgio sin afectar la app.
  Los valores viven en `core.giorgio_config` y los cambia el Administrador del
  sistema.
  **Actualización 2026-10-19** (conducción del proyecto): el presupuesto de
  Giorgio es de USD 20 por mes, de los USD 40 mensuales de créditos de API.
- Tope **mensual** de USD 20 (mes calendario, hora de Argentina): al llegar,
  Giorgio se apaga hasta el mes siguiente.
- El tope **diario** baja a USD 1, con el mismo corte al 80 % (USD 0,80 por
  día): un día de mucho uso no se come el mes.
- El costo de cada consulta es una estimación con los precios cargados; la
  factura real es la de la consola de Anthropic.

### D-61 · Haiku primero, Sonnet para las preguntas difíciles — 2026-10-19, adoptada

**Pedido** (conducción del proyecto, 2026-10-19): que Giorgio use Claude
Haiku 5.5 y pase a Claude Sonnet 5.5 en las preguntas más difíciles.
**Resolución.** Haiku responde primero y tiene una herramienta
`consultar_experto` que no se ejecuta: si la llama (sin escribir nada antes),
la Edge Function repite la pregunta desde el principio con Sonnet y el panel
descarta lo escrito. Se escala si la pregunta pide razonar en varios pasos (de
dónde sale un número, datos de varias pantallas, comparar o interpretar) o si
Haiku no está seguro; lo simple lo responde Haiku. Sonnet no puede volver a
escalar. Se eligió así y no un clasificador previo para no sumar una llamada a
cada pregunta.
**Parámetros.** Haiku sin razonamiento y esfuerzo `low`; Sonnet con
`between_tools` y esfuerzo `medium`. Modelos configurables sin desplegar:
`GIORGIO_MODELO` y `GIORGIO_MODELO_EXPERTO` (vacío o «no» apaga el escalado).
**Registro.** Una consulta escalada se registra una vez, con el modelo
experto, y todo su uso al precio del experto (sobreestima un poco).
**Revisar** con la evaluación de la fase 4: cuántas preguntas escala Haiku,
si escala de más o de menos, y el costo por pregunta de cada camino.

## Abiertas — módulo de costos (2026-10-09)

### D-39 · Con qué fórmula se costea el granel

**Contexto.** Al 2026-10-09 la base tiene 1 fórmula `VIGENTE` y 46 en
`BORRADOR`. Exigir la vigente dejaría casi todos los productos sin costo.
**Supuesto adoptado.** `comercial.formula_para_costo`: la vigente; si no hay,
la última no dada de baja (entre variedades, la de vigencia más reciente). La
pantalla dice con qué estado de fórmula se calculó cada producto. Es costeo
de gestión: no libera ni aprueba nada.
**Pregunta.** ¿Alcanza, o el costo de un producto con fórmula en borrador
tiene que figurar como «sin costo»?
**Decide.** Finanzas con Dirección Técnica.

### D-45 · Los importes de compra ya son visibles para todos los roles

**Contexto.** Lo encontró la revisión de la migración de costos (2026-10-09).
`comercial.comprobantes_proveedor` (neto, IVA y total de cada factura de
proveedor) se lee con `core.rol() is not null` desde 20260929100000, a
propósito («consulta para todos los roles»): la lista de recepciones les
muestra a operarios y Calidad si el comprobante está cargado. Con eso
cualquier rol puede deducir el precio de compra, aunque las tablas de costos
nuevas sí estén cerradas. `gmp.recepciones.monto` también es legible por
todos, pero está vacío (0 filas con monto al 2026-10-09) y nada lo usa.
**Por qué no se cambió en la Fase 1.** Cortar las filas haría que la
recepción muestre «sin cargar» a un operario y que se cargue un comprobante
duplicado. Lo correcto es separar: el operario ve tipo y número; los importes,
sólo los roles de costos.
**Propuesta.** Migración aparte: política de SELECT de
`comprobantes_proveedor` restringida a ADMINISTRACION, GERENCIA,
GERENCIA_PRODUCCION, FINANZAS (y el Administrador del sistema), más una vista
`v_comprobantes_recepcion` con sólo tipo y número para los demás.
**Mismo hallazgo que** `PENDIENTES.md` #5 y `docs/AUDITORIA_ADMIN.md` R7: es
uno solo, registrado tres veces; se cierra junto.
**Cuándo.** Propuesto como primer trabajo después de la Fase 6 del módulo de
costos, porque toca pantallas de recepción y de Administración ya en uso.
Mientras no se haga, contradice D-38 en el dato más directo: el precio de
compra.
**Decide.** Gerencia.

### D-51 · Compras y gastos en el «resultado mensual» de Administración

**Contexto.** Desde la Fase 3, `comercial.v_resultado_mensual` (Reportes de
Administración) resta las compras (comprobantes de proveedor) y los gastos de
`comercial.gastos` (D-46). `comprobantes_proveedor` admite comprobantes de
servicios sin recepción: si la luz, el estudio contable o una máquina se
cargan en Cuentas de proveedores **y** además como gasto, en ese reporte
cuentan dos veces (la máquina, entera en compras y además amortizada).
`v_resultado_gestion` (el resultado del módulo de costos) no usa compras y no
tiene este problema.
**Propuesta.** Un `gastos.comprobante_proveedor_id` opcional, y excluir de
«compras» los comprobantes que ya están imputados a un gasto. O decidir que el
reporte de Administración muestre sólo compras de mercadería.
**Mientras tanto.** El comentario de la vista lo advierte; no se inventa la
regla.
**Decide.** Finanzas con Administración.

## Resueltas

### D-42 · Cómo se lee el costo de la planilla de apertura — 2026-10-10, resuelta

**Contexto.** `05 INVENTARIO NAIL SHOW FABRICA.xlsx` (sha256 `6957d867…89ec`)
trae «PESO», «CANTIDAD», «FECHA ACT», «COSTO U$D», «COSTO $» y «Unitario» sin
decir sobre qué unidad ni si llevan IVA. Los supuestos del 2026-10-09 (unitario
por kg o litro, tipo de cambio implícito) quedan **reemplazados** por las
respuestas de Finanzas (Gabriel Lundin):

1. **IVA.** Los importes de la planilla son **netos**. Toda carga de costo
   (recepción, costo de referencia manual, cotizador, plantilla de
   importación) acepta el importe con o sin IVA (`incluye_iva` SI/NO más
   alícuota) y lo normaliza a neto.
2. **«Unitario» de líquidos y polvos = precio de la presentación de compra**,
   no por kg ni por litro. Precio base = unitario / cantidad de la
   presentación. La cantidad y la unidad salen de «PESO» (la unidad está en el
   formato de la celda: «1 kg.», «45 gr.», «0,06 lts.»).
   - Si PESO no trae cantidad y unidad claras, el insumo queda **pendiente:
     falta cantidad de la presentación**. No entra al costeo y sus productos
     muestran «costo incompleto».
   - Los pendientes salen en un Excel con el formato de la plantilla de
     importación, para completarlos y reimportarlos (vista previa, una
     transacción).
   - La cantidad de la presentación es **obligatoria** para líquidos y polvos
     en la recepción y en el cotizador.
   - Insumos en UNIDAD: el «Unitario» ya es por unidad (COSTO $ / CANTIDAD).
3. **Vigencia.** Fecha de corte de la apertura: **2025-01-01**, guardada en
   `comercial.parametros_costo` con vigencia y editable por Finanzas. Un costo
   APERTURA anterior al corte, **o sin fecha**, lleva la etiqueta
   DESACTUALIZADO y sigue sirviendo como valor provisorio. El panel de
   producto muestra qué porcentaje de su costo se apoya en costos
   desactualizados, y la lista de insumos permite filtrarlos. Si Finanzas
   confirma que un costo viejo sigue vigente, lo carga como costo de
   referencia manual.
4. **Renglones en dólares.** Se guarda el monto en USD y su fecha. No se usa
   «COSTO $», porque los tipos de cambio implícitos de la planilla no son
   coherentes. Se convierte con el tipo de cambio activo de la serie y la
   pantalla muestra cuál se aplicó.

Lo demás de la versión anterior sigue igual. Si un código está repetido, rige
el renglón con la fecha de costo más reciente. Los lotes de apertura sin costo
los completa Finanzas desde Costos › Lotes.

**Recuento de la planilla (2026-10-10, antes de cargar).** Hay 650 renglones:

- **Fuera del catálogo** (herramientas, mobiliario, etc.): 237. No se cargan.
- **En el catálogo sin costo:** 13.
- **A cargar:** 400.
  - **Leídos solos:** 386. Son 317 en UNIDAD y 69 líquidos o polvos con PESO
    claro.
    - De esos 69, 37 están en litros o ml pero el catálogo los mide en
      gramos, y el insumo no tiene densidad. Son 27 acrílicos de 60 ml, 7
      fragancias de 1000 ml, MP top coat, adhesivo foil y extracto de aloe.
      Quedan pendientes hasta que se cargue la densidad o se cambie la
      presentación a gramos.
  - **Pendientes por falta de cantidad:** 14. PESO está vacío, o solo dice
    «Plancha» o no tiene unidad: cremas 364 a 372, 378ACE, 387MO, 450RES,
    192ALOE, 192ENM, 192REM, 198ACNS y 198ACE.
  - **Por fecha:** 58 vigentes (2025-01-01 o después), 176 anteriores al
    corte y 166 sin fecha (uno con fecha imposible, 4835). En total, 342 van
    a llevar la etiqueta DESACTUALIZADO.
  - **En dólares:** 184.

**Migraciones.** `20261009120400_carga_costos_apertura` y
`20261009120410_rectifica_costos_apertura` se generaron con los supuestos
viejos. Están commiteadas y una migración escrita no se edita (CLAUDE.md §6),
así que no se borran: las corrige `20261010120100_rectifica_costos_apertura_d42`
con filas que rectifican (`rectifica_a`) y dicen por qué. El esquema nuevo está
en `20261010120000_comercial_costos_d42`.

**Criterios fijados al implementar** (no los cubría la respuesta de Finanzas;
revisar con Gaby):

- **Tipo de cambio activo:** el último mes cargado de la serie A3500; en el
  mismo mes, el de cierre antes que el promedio (`v_tipo_cambio_activo`). Sin
  serie cargada, los costos en dólares quedan pendientes por falta de tipo de
  cambio.
- **Dólares sin CANTIDAD:** el monto en dólares es el de una presentación,
  igual que hace la planilla con el «Unitario» cuando falta CANTIDAD (pasa en
  todos los renglones sin CANTIDAD que traen «Unitario» y COSTO $: son iguales).
- **Dólares a revisar:** si el tipo de cambio implícito contra el «Unitario»
  en pesos cae fuera de 300..3000 $/U$D, el monto en dólares no se carga y el
  insumo queda pendiente con ese motivo. Son 106LIQ (22.125 $/U$D), 137ET
  (5.789), 240, 241, 242 (1 $/U$D: son pesos) y 354 (5.535). De los seis, sólo
  106LIQ y 137ET están en el catálogo. Cargarlos convertidos daría costos de
  millones de pesos por unidad.
- **Sin densidad:** los 37 de litros sobre catálogo en gramos se cargan con su
  presentación tal cual y quedan pendientes solos («sin densidad»). En cuanto
  Dirección Técnica cargue la densidad, costean sin tocar nada más.
- **DESACTUALIZADO** marca sólo costos APERTURA. Un precio manual de Finanzas
  confirma el costo y no lleva la marca, aunque su vigencia sea vieja.
- **Excel de pendientes:** Costos › Insumos, con las columnas de la plantilla
  de importación. Los renglones en dólares salen con el tipo de cambio activo
  ya escrito; al reimportarlos, el precio manual queda con ese tipo de cambio
  fijo.
- **No se rectifica lo que cargó Finanzas a mano:** la corrección sólo toca
  costos cuyo autor y motivo son los de la carga de la planilla, y sólo de
  códigos que la planilla trae.
- Lotes de apertura en el proyecto de práctica, después de la migración:
  206 rectificados, 16 anulados (14 por falta de cantidad y 2 por dólares a
  revisar), 16 pendientes, 37 sin densidad.

### D-54 · Importación y exportación — 2026-10-09, adoptada

- **Sin dependencia nueva.** El `.xlsx` se lee y se escribe con un módulo
  propio (`src/lib/xlsx.ts`): un `.xlsx` es un zip de XML y el navegador ya trae
  la descompresión (`DecompressionStream`). Alcance: la primera hoja y sus
  valores. Si algún día hay que leer planillas arbitrarias (varias hojas,
  fórmulas, zip64), ahí se justifica una biblioteca.
- **Importación estricta.** Plantilla fija por sección, descargable desde «Más
  información» con su estructura. La planilla tiene que traer exactamente esos
  encabezados (el orden da igual); si no, se rechaza con el motivo. Vista
  previa renglón por renglón (crear, actualizar, error). Con un solo error no
  se importa nada: se corrige la planilla y se vuelve a subir.
- **Una transacción y registro.** Al confirmar, la función de la plantilla
  vuelve a validar en la base y escribe todo junto; `comercial.importaciones`
  guarda plantilla, nombre y SHA-256 del archivo, los renglones y quién y
  cuándo. El archivo no se sube: el hash es el que calculó el navegador.
- **Primera plantilla:** costos de materias primas (precio de referencia de
  Finanzas). La importa Finanzas, porque es quien puede fijar ese precio;
  Administración (Diego) exporta. Las demás plantillas se definen cuando
  lleguen los ejemplos.
- **Exportar:** Excel de la tabla de la sección, y PDF con la impresión del
  navegador (los gráficos salen tal cual), en Costos › Insumos, Resultado y
  Eficiencia.

### D-52 · Criterios del cotizador — 2026-10-09, adoptada

- **Quién cotiza:** Finanzas, Gerencia y Gerencia de Producción (el pedido
  nombra a Gaby, Virginia, Jorge y Nazarena). Cada uno ve las suyas; Finanzas
  y Gerencia ven todas, con el desglose. Administración y Ventas no cotizan.
- **Merma:** `cantidad / (1 − merma)`, la definición que la base ya usaba
  (20260917120000) y que usa el panel de producto. El pedido escribía
  `× (1 + merma)`; con 10 % la diferencia es 1,111 contra 1,10. Se eligió la
  de la base para que copiar un producto al cotizador cueste lo mismo que en
  su panel.
- **Neto y mostrado:** la cotización trabaja en neto (costo, margen, precio).
  El PDF muestra el precio «más IVA» (el neto) o «con IVA incluido» (neto ×
  1,21). El redondeo va sobre el número que lee el cliente; con precio fijado
  se escribe el precio mostrado y se le saca el IVA para el margen.
- **IVA de los precios cargados a mano:** se descuenta sólo si es recuperable
  (factura A); un precio de monotributista o sin factura va entero como costo,
  igual que en el resto del módulo (D-43).
- **Costo libre:** importe × cantidad (por defecto 1).
- **Volumen:** se guardan las dos cosas, contenido por unidad (60 g) y
  cantidad cotizada (unidades del pedido); el PDF muestra las que haya.
- **Vigencia:** 7 días por defecto, configurable por Finanzas.
- **Margen mínimo:** advierte y pide justificación, no bloquea.
- **Numeración:** contador propio por año (`comercial.contadores`, RN-55).
- **Insumo nuevo:** vive en la cotización; «Proponer para el catálogo» deja
  una solicitud a Dirección Técnica y no toca `gmp`.

### D-53 · Clientes potenciales — 2026-10-09, adoptada

Tabla propia `comercial.clientes_potenciales` (razón social, CUIT y contacto
opcionales), separada del padrón de facturación (`comercial.clientes`, que
exige documento y condición frente al IVA). Cuando el potencial compra, se lo
da de alta como cliente y se enlaza (`cliente_id`), sin volver a escribirlo.

### D-50 · Pareto y eficiencia: criterios de la Fase 4 — 2026-10-09, adoptada

- **Pareto ABC** sobre la facturación neta por producto (`factura_renglones`,
  D-49) del período elegido. Cortes configurables por Finanzas (80 % y 95 %
  por defecto). Un producto que cruza un corte queda en la clase de abajo del
  corte (el que completa el 80 % es A).
- **Un solo eje** en la curva de Pareto: barras de participación y acumulado,
  ambos en porcentaje. Nunca dos escalas.
- **Margen** del producto = (facturación − costo de lo vendido con la foto del
  mes) / facturación. Sin costo completo no se muestra margen: no se inventa.
- **Rotación y días de stock**: consumo de producción de los últimos 90 días
  (`SALIDA_CONSUMO_PRODUCCION`); días = saldo / consumo diario; rotación anual
  = consumo anualizado / saldo. Capital inmovilizado = saldo × costo del lote.
- **Precios por proveedor**: precio unitario neto de cada compra, sin
  accesorios; promedio y mínimo llevados a pesos de hoy con el IPC.
- **Agregadas** (el pedido invitaba a proponer): alerta de banda de precio por
  debajo del costo y alerta de margen por debajo del mínimo de Finanzas.

### D-48 · Mano de obra sin contarla dos veces — 2026-10-09, adoptada

**Pedido.** Costos fijos sólo con sueldos no productivos, más una línea «mano
de obra no absorbida» = nómina de producción − mano de obra asignada a
productos.
**Resolución.** La nómina de producción se carga como gasto en su categoría
(«Nómina de producción», `es_nomina_produccion`), que no suma como costo fijo.
La mano de obra asignada es la que va en el costo de lo **vendido** del mes
(unidades facturadas × mano de obra unitaria de la foto del mes). No absorbida
= nómina − asignada. Así la nómina entra una sola vez y completa: una parte en
el costo de lo vendido y el resto como estructura. Si un mes se vende más mano
de obra de la que se pagó (se vendió stock de meses anteriores), la no
absorbida sale negativa y se muestra así, sin taparla. Sin nómina cargada, la
línea queda en cero (no se supone).
**Revisar** con Finanzas si prefiere asignar sobre lo **producido** (órdenes
terminadas) en vez de lo vendido.

### D-49 · Renglones de factura — 2026-10-09, adoptada

`comercial.factura_renglones` es la foto por producto de lo facturado, tomada
al emitir con la misma cuenta que `comercial.preparar_factura` (en una venta,
lo despachado; si no, lo pedido; en factura C el total con IVA, porque no hay
débito fiscal). La nota de crédito copia los renglones de su factura (la NC es
siempre por el total). El Pareto y el costo de lo vendido salen de acá, no de
`pedido_renglones`. Lo emitido antes de la migración se completó con la misma
cuenta. El redondeo por renglón puede diferir en centavos del neto de la
factura, que se redondea por alícuota.

### D-47 · Foto mensual del costo sin tarea programada — 2026-10-09, adoptada

**Contexto.** El pedido exige una foto mensual del costo de cada producto
para que la historia no se reescriba cuando cambia un precio. Una tarea
programada (`pg_cron`) correría como `postgres`, y
`core.es_escritura_privilegiada` marca como anomalía toda escritura que no
venga de `authenticated` (CLAUDE.md §5): sería una anomalía por mes, a
propósito, que entrenaría a ignorar la vista de escrituras privilegiadas.
**Resolución.** `comercial.tomar_foto_costos()` (SECURITY INVOKER) toma o
actualiza la foto del mes en curso con la sesión de quien abre el panel de un
producto. Un mes cerrado no se modifica (trigger). Sólo se reescribe lo que
cambió, para no llenar la auditoría. Si en un mes nadie abrió costos, ese mes
queda sin foto y el gráfico lo muestra como hueco: no se inventa.
**Revisar** si Finanzas prefiere una foto garantizada aunque sea con rol
dedicado (§5), aceptando la anomalía mensual documentada.

### R-10 · Costeo por identificación específica — 2026-10-09

**Reemplaza R-02** (promedio ponderado móvil, provisorio) **y responde D-36.**
**Resolución** del usuario (módulo de costos, 2026-10-09): cada lote de
insumo ya está identificado, así que el stock se valoriza por
**identificación específica**: saldo del lote × costo unitario del lote
(`comercial.costos_lote`, lo que efectivamente se pagó, inmutable). El
**costo de referencia** para costear productos es otra cosa y se resuelve por
prioridad: precio manual de Finanzas vigente → último lote recibido →
planilla de apertura (`comercial.v_costo_referencia`). La prioridad de
Finanzas nunca reescribe lo pagado.
**Alcance.** Es un **costeo de gestión**: sirve para conocer el costo real y
fijar precios. La **valuación contable** del inventario (y si coincide o no con
este criterio) la valida el contador; mientras no lo haga, las pantallas de
resultado dicen «resultado de gestión, no fiscal».
**Fuente única del costo de un lote:** `comercial.costos_lote`. No lo son
`gmp.recepciones.monto` ni el comprobante del proveedor, que sólo se concilia
contra los lotes (D-44).

### D-38 · Quién ve y quién carga costos — 2026-10-09, aprobada

**Amplía §3.3 del alcance** («Ver costos, márgenes y rentabilidad»: ADM y GG).

- Rol nuevo **FINANZAS** (Gabriel Lundin): lee todo lo económico; único que
  fija costo de referencia, costo hora, umbral, margen mínimo y series macro.
- **GERENCIA** (Virginia Arleo, Jorge Bakás): lee todo; carga otros gastos y
  usa el cotizador (fases 3 y 5).
- **GERENCIA_PRODUCCION** (Nazarena Bakás): ve costos, carga el costo del
  lote al recibir, minutos por unidad y cotizaciones.
- **ADMINISTRACION** (Diego): ve costos y carga costos de lote (ya lo
  habilitaba §3.3); importación y exportación en la Fase 6.
- **VENTAS** (Matías, Agustina), **OPERARIO**, **CONTROL_CALIDAD** y
  **ENCARGADA_STOCK**: no ven costos.
  **Dónde está.** Políticas de `20261009120300`. Excepción conocida: D-45.

### D-40 · Costos accesorios por recepción — 2026-10-09, aprobada

Flete, seguro, aranceles y despachante se cargan por recepción
(`comercial.costos_accesorios`) y se prorratean **por valor** entre los lotes
con costo de esa recepción: `costo_i = precio_i + accesorios × precio_i /
Σ precio_j`. Cada lote guarda además moneda, importe original y tipo de
cambio a la fecha de la compra.

### D-41 · Aviso de variación del precio de compra — 2026-10-09, aprobada

Cuando un lote recibido difiere del costo de referencia **manual** de
Finanzas más que el umbral (5 % por defecto, editable), se genera un aviso.
La variación es **real**: `(1 + nominal) / (1 + IPC acumulado) − 1`, con el
IPC entre el mes del precio de referencia y el del lote. Sin IPC cargado se
compara la nominal y el aviso lo dice. Ninguno de los dos valores gana en
silencio. Se compara el precio del lote sin accesorios.

### D-43 · Compras y gastos sin comprobante — 2026-10-09, aprobada

Se cargan igual, con comprobante `SIN_COMPROBANTE`: sin crédito fiscal, el
importe entero es costo. Nunca se bloquean ni se desalientan; se muestran con
etiqueta visible y filtro propio, y Finanzas ve el porcentaje del costo del
período que está sin comprobante. Factura B, C o IVA no discriminado: tampoco
hay crédito fiscal, el total es costo. Sólo la factura A discrimina IVA
recuperable (`comercial.importe_neto_ars`). La recepción en `gmp` sigue
exigiendo proveedor identificado y registro de recepción.

### D-44 · Conciliación de lotes contra el comprobante — 2026-10-09, aprobada

`comercial.v_conciliacion_recepcion`: suma de netos de los lotes de una
recepción contra el neto de sus facturas (en B y C, el total), menos las
notas de crédito no anuladas. Aviso si difiere más de $1 o hay lotes sin
costo. No se aplica a compras sin factura.

### D-46 · Fuente única del resultado: comercial.gastos — 2026-10-09, aprobada

El resultado económico sale de `comercial.gastos` (Fase 3); tesorería queda
como caja. **Histórico:** al 2026-10-09 no hay ningún egreso de tesorería sin
pago asociado en la base (consulta del 2026-10-09: 0 filas), así que **no hay
nada que migrar**: la fecha de corte es la puesta en servicio de la Fase 3, y
desde ahí `v_resultado_mensual` deja de contar egresos de tesorería como gasto.

### R-09 · Lote en el producto terminado y RN-51 — 2026-09-30

**Resolución** del usuario, en tres respuestas:

1. Lo que ya existe sin lote (conteo inicial, Calle 5) **sigue saliendo**,
   marcado «sin lote», como el saldo de apertura de insumos (R-05).
2. «Terminado» **no exige orden**: si el pedido tiene la orden de ese
   producto, lo producido entra con su lote y solo se vende liberado por DT;
   si no la tiene, entra sin lote y sale igual. **Es un camino para vender
   sin liberar**, elegido a sabiendas para no frenar la planta.
3. A Calle 5 va **solo lo liberado** o lo sin lote.
   **Dónde está.** `20260930160000`/`160100`: `gmp.impedimento_despacho_orden()`
   (la autoridad, CLAUDE.md §4), `movimientos_pt.orden_id` y el reparto por lote
   en `comercial.fn_movimiento_pt_lote`.
   **No cubre** el bloqueo de un lote de PT por retiro (RN-52): espera el módulo
   de retiro (PG.60.4).

### R-08 · Número de lote según I.40.25 (borrador) — 2026-09-30, provisorio

**Era D-04.** El POE I.40.25 «Asignación de lote» apareció en la carpeta de
POE como VERSION 00 BORRADOR (vigencia 31/07/2025). **Se adopta su regla, en
forma provisoria, para las órdenes de producción (20260930110000):** lote =
`#<presentación> dd/mm/aa` (fecha de elaboración; # distingue las
presentaciones de un mismo granel) y vencimiento = `P<partida> mm/aa` (P
distingue los graneles del mismo día).
**Se revisa** cuando el POE se emita: si cambia la regla, las órdenes nuevas la
siguen y las ya abiertas conservan su número (no se renumera un lote).

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

### R-02 · Método de costeo — 2026-09-04, provisorio — REEMPLAZADA por R-10 (2026-10-09)

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

### R-07 · Densidad del producto: la del modelo, salvo que se mida — 2026-09-24

**Decisión del codirector técnico** (era D-33): la densidad del producto
estimada por el modelo de mezcla es la estándar; si se mide con densitómetro,
se carga en la fórmula y pasa a usarse la medida. Una fórmula vigente admite
cargar o corregir esa medida (y nada más: 20260924170100). La fórmula 377 v1
tenía 1,00000 mal cargado: quedó sin medida y rige la estimada (0,8099 g/mL a
20 °C).

### R-06 · De qué lote sale el consumo de un pedido — 2026-09-23, provisorio

**Era parte de D-05** (falta I.20.3). **Resolución** de la conducción del
proyecto: automático, sin que Gerencia de Producción elija. Sale primero del
lote que vence antes; entre los que no vencen, del más antiguo en el sistema.
Cada baja queda con su lote en el kardex. Se revisa cuando llegue I.20.3.
