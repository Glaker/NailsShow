# Decisiones abiertas

Referenciado por `CLAUDE.md` §7: cuando el documento de alcance no cubra algo, se
anota acá y se pregunta. **No se inventa la regla.**

Cada entrada lleva quién decide, qué bloquea, y el valor provisorio si lo hay.
Cuando una se resuelve, se mueve a «Resueltas» con fecha y quién decidió — el
historial importa: el control de cambios de GAMP 5 exige poder reconstruir por
qué el sistema hace lo que hace.

Última actualización: 2026-09-04.

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

---

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
