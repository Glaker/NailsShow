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
