# Estado del proyecto y plan — handoff entre sesiones

Última actualización: 2026-09-04.
Este archivo es el punto de entrada de cada sesión nueva. Las reglas permanentes
están en `CLAUDE.md`; acá va el estado y el plan, que cambian.

---

## Objetivo inmediato

**Demo para el dueño de Nail Show.** No es el sistema completo. El recorte de
alcance es deliberado y está listado más abajo, con lo diferido explícito para
que nadie lo confunda con descartado.

---

## Infraestructura (verificada, andando)

| Pieza    | Valor                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Repo     | `Glaker/NailsShow`, rama `main`                                                                                |
| Supabase | ref `yxpzsxkefqfuhyvslkfw`, sa-east-1, Postgres **17.6.1**                                                     |
| Vercel   | preset Vite, deploy automático desde `main`                                                                    |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` con la publishable key (`sb_publishable_…`), no la legacy `anon` |

### Cómo se accede a la base (importante: no es MCP)

No hay MCP de Supabase para este proyecto. El único MCP configurado
(`supabase-local`) apunta a **otro** proyecto (`/home/gg/equdata`, ref
`badjjdcftdfjzigwnblg`) y no debe usarse acá.

El acceso real es por dos vías, ambas verificadas:

1. **Supabase CLI**, autenticada con un personal access token (`sbp_…`) guardado
   en el keyring del sistema vía `supabase login`. Habilita `db push`,
   `gen types --linked` y `config push`.
2. **`psql` contra el pooler de sesión**, con la contraseña de la base pasada por
   `PGPASSWORD` en cada comando. Habilita DDL, consultas y pgTAP.

   ```
   postgresql://postgres.yxpzsxkefqfuhyvslkfw@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

   La conexión **directa** (`db.<ref>.supabase.co`) no sirve desde esta máquina:
   resuelve a IPv6 y no hay ruta v6. Usar siempre el pooler.

### Qué funciona sin Docker y qué no

| Comando                                          | ¿Anda?                             |
| ------------------------------------------------ | ---------------------------------- |
| `supabase db push`                               | Sí                                 |
| `supabase gen types typescript --linked`         | Sí                                 |
| `supabase config push` (registra el hook de JWT) | Sí                                 |
| `psql` + pgTAP contra el pooler                  | **Sí**                             |
| `supabase db dump` / `db diff` / `db reset`      | No, piden Docker aun contra remoto |
| `supabase test db`                               | No, solo apunta a `127.0.0.1`      |

---

## Estado de la base

Al 2026-09-04 la fase 1 recortada está **aplicada y verificada contra el
proyecto alojado**. Seis migraciones, todas por `supabase db push`:

| Migración                                          | Qué trae                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `20260904140000_esquemas_y_enumeraciones`          | `core`, `gmp`, `comercial` + enums del Anexo A que usa la fase 1         |
| `20260904140100_core_identidad_y_auditoria`        | `core.usuarios`, `core.auditoria`, trigger genérico, hook de JWT, RLS    |
| `20260904140200_gmp_maestros`                      | `depositos` (con los diez de los POE), `proveedores`, `insumos_catalogo` |
| `20260904140300_gmp_recepcion_lotes_rotulos`       | `recepciones`, `lotes_insumo`, `rotulos`, contadores, máquina de estado  |
| `20260904140400_gmp_vistas_tablero`                | vistas de lectura del tablero y del listado de lotes                     |
| `20260904150000_numeracion_por_defecto_y_roles…`   | correlativos opcionales en el INSERT + rol exigido por transición        |
| `20260904160000_correcciones_auditoria_y_rotulado` | `db_role` real, y rotulado solo en los estados que I.20.2 rotula         |

El hook de access token está aplicado al proyecto alojado con
`supabase config push`. Inyecta `rol`, `roles`, `usuario_id`, `sector`, `nombre`
y `es_dt_titular` en el JWT.

`comercial` existe y está vacío: se creó para fijar la dirección de dependencia
desde el principio, no porque esta fase lo pueble.

### Qué está implementado, regla por regla

| Regla                                  | Dónde vive                                                          |
| -------------------------------------- | ------------------------------------------------------------------- |
| RN-01 protocolo de análisis            | `gmp.fn_validar_lote_insumo` + precondición de cuarentena           |
| RN-02 bulto disparejo se cuenta        | `CHECK lotes_insumo_rn02_conteo_obligatorio`                        |
| RN-03 pesada de pigmentos              | `gmp.fn_validar_lote_insumo`                                        |
| RN-04 color por estado                 | `gmp.color_rotulo()` + columna generada `rotulos.color`             |
| RN-05 el rótulo no se modifica         | `gmp.fn_rotulo_inmutable` + índice de un solo vigente por entidad   |
| RN-44 etiquetas por plancha            | columna generada `lotes_insumo.total_etiquetas`                     |
| RN-48 inflamables al depósito exterior | `gmp.fn_validar_lote_insumo`                                        |
| RN-49 el usuario no se borra           | sin política ni GRANT de DELETE + `CHECK usuarios_baja_consistente` |
| RN-50 auditoría de toda escritura      | `core.fn_auditar` adjuntado a las siete tablas de negocio           |
| §5.1 máquina de estado del lote        | `gmp.fn_transicion_lote_insumo`, con el rol exigido por transición  |
| §3.3 matriz de permisos                | políticas RLS por tabla, más triggers donde RLS no alcanza          |

### Verificación hecha contra la base real

Se corrió el circuito completo por PostgREST con una sesión de usuario. Dieron
lo esperado, incluidos los rechazos:

- El hook inyecta rol y roles; un usuario con `roles_adicionales` los recibe en
  el token siguiente, no en el vigente.
- Alta de proveedor como `ADMINISTRADOR_SISTEMA`: **rechazada** por RLS (42501).
  Es correcto, §3.3 no le da esa atribución.
- Lote sin protocolo de un insumo que lo exige: **rechazado**, RN-01.
- Bultos dispares sin conteo: **rechazado**, RN-02.
- Numeración: `00001/2026` y `RI-00001/2026`, sin huecos.
- Rotulado: amarillo en cuarentena, gris en análisis, verde aprobado, uno solo
  vigente y cadena de reemplazos completa.
- `CUARENTENA → APROBADO` salteando el muestreo: **rechazada**, §5.1.
- Modificar un rótulo: **rechazado**, RN-05.
- Borrar un lote: **rechazado**, sin GRANT de DELETE.
- Auditoría: un asiento por escritura, con autor, valores anterior y posterior.

Dos defectos aparecieron en esa verificación y se corrigieron en la migración
`…160000`:

1. **`db_role` guardaba siempre `postgres`.** El trigger de auditoría es
   SECURITY DEFINER, así que `current_user` dentro de él es el dueño de la
   función y no quien pidió la escritura. La columna de detección de CLAUDE.md
   §5 quedaba inservible: todo parecía privilegiado y por lo tanto nada lo
   parecía. Ahora se lee del claim `role` del JWT, que es justamente donde una
   clave de servicio se delata.
2. **Se emitía rótulo para `MUESTREADO`.** I.20.2 rotula cuatro estados y ése no
   es uno. Quedaba un R.20.2.1 con color «SIN_ROTULO» y, peor, el material
   perdía su rótulo amarillo justo mientras seguía en cuarentena.

### Repaso de la fase 1 (2026-09-04)

Se revisó lo construido y aparecieron cuatro defectos, todos corregidos y
verificados:

1. **La serie diaria del tablero multiplicaba.** El `LEFT JOIN` contra lotes
   repetía la fila de la recepción una vez por lote, así que `count(r.id)`
   contaba una recepción de tres lotes como tres. El gráfico exageraba
   justo los días de más trabajo, que son los que uno mira.
2. **La recepción y el lote se podían editar enteros.** Las políticas RLS
   decidían _quién_ podía hacer UPDATE, pero no _sobre qué_. Administración
   podía cambiarle el proveedor a una recepción registrada, y un operario la
   cantidad de bultos de un lote. Ahora la recepción solo admite su carga
   administrativa diferida y el lote solo el avance de su circuito; lo demás lo
   rechaza un trigger, con el mensaje que indica el camino correcto (no
   conformidad PG.60.18 y registro rectificativo).
3. **La vista informaba el color derivado del estado, no el del rótulo puesto.**
   Con el lote en `MUESTREADO` decía «SIN_ROTULO» mientras en el tambor seguía,
   correctamente, el amarillo de cuarentena. La distinción importa: `estado` es
   dónde está el lote en el circuito, `color_rotulo` es qué cartel tiene encima.
4. **La transición a `MUESTREADO` se podía forzar sin muestreo.** §5.1 lo pone
   como precondición y estaba escrito solo en el documento. Ahora lo exige la
   base.

Además se agregó `core.verificar_invariantes()`, que lee el catálogo y contesta
con datos si las invariantes estructurales de §3 se cumplen. Es el sujeto de las
pruebas pgTAP pendientes, y mientras no existan se puede consultar. Al
2026-09-04 las cinco exigibles dan verde.

Esa misma función dejó a la vista un dato que conviene no perder: **el rol
`postgres` tiene `BYPASSRLS`**, igual que `service_role`, `supabase_admin`,
`supabase_etl_admin` y `supabase_read_only_user`. Son cinco roles que saltean
RLS. `CLAUDE.md` §3.5 afirma que «ni siquiera el rol postgres de la aplicación
la puede saltear»: eso es cierto para la aplicación, que corre como
`authenticated` y no saltea nada, pero no para `postgres`. La afirmación del
documento hay que precisarla, y el número —cinco— es el que conviene tener
contestado antes de que lo pregunte un inspector.

---

## Muestreo (I.50.4)

Cierra el hueco que quedaba en `CUARENTENA → MUESTREADO`, que hasta el
2026-09-04 avanzaba el estado sin registrar nada.

`gmp.registrar_muestreo()` hace tres cosas en una sola transacción: registra el
muestreo, emite la etiqueta R.50.4.1 que exige RN-07 y avanza el lote. Van
juntas porque separarlas dejaría, aunque sea un instante, material muestreado
sin identificar.

Las cinco verificaciones previas de RN-10 son bloqueantes de verdad: no alcanza
con registrarlas. Si el contenedor no está íntegro, no está limpio, el rotulado
no corresponde o el lote no coincide con el certificado, la base rechaza el
muestreo y el mensaje indica que lo que corresponde es abrir una no conformidad,
no tomar la muestra igual.

Dos detalles que valen la pena:

- **La etiqueta R.50.4.1 no lleva ninguno de los cuatro colores de I.20.2.** Ese
  POE define esos colores para comunicar el estado de calidad de un material, y
  esto identifica una muestra. Pintarla de amarillo diría algo que el POE no
  dijo.
- **El rótulo amarillo del lote sigue puesto.** Entre el muestreo y el inicio
  del análisis el material avanzó en el circuito pero sigue en cuarentena, y su
  cartel tiene que decir eso.

Queda fuera, y anotado: RN-09 (envases a muestrear por presentación de producto
terminado) y RN-12 (ventana de «inmediatamente» del granel, D-07). Los dos
aplican a circuitos de producto que todavía no existen.

---

## Estado del frontend

Aplicación completa sobre las siete tablas, en producción de datos reales desde
el primer día.

- **Ingreso.** Correo y contraseña, sin verificación de correo. El primer
  registro queda como administrador del sistema; los siguientes entran
  desactivados y con una pantalla que explica qué falta (ver D-12).
- **Tablero.** Indicadores accionables, gráfico de ingreso de lotes de 30 días
  (SVG propio, sin biblioteca de gráficos), lotes por estado, y la lista de lo
  que está en cuarentena esperando muestreo.
- **Recepciones.** Alta con sus lotes en un solo formulario, con las
  verificaciones de I.20.1 y la emisión del rótulo de cuarentena en el mismo
  acto.
- **Lotes.** Búsqueda por número interno o lote del proveedor, filtro por
  estado en la URL, ficha con historial de rótulos y avance de estado con
  confirmación.
- **Muestreo.** Formulario de I.50.4 en el orden del POE: primero las cinco
  verificaciones previas, después la muestra. Mientras alguna no esté conforme
  el botón está deshabilitado y la pantalla dice por qué. El tamaño de muestra
  viene sugerido con el criterio que lo produjo a la vista, y apartarse pide
  justificación.
- **Rótulos.** El R.20.2.1 del lote y la etiqueta R.50.4.1 de la muestra se
  imprimen en A6 apaisado con los campos del registro y un QR que lleva a la
  ficha del lote. La hoja de impresión oculta todo lo demás.
- **Maestros.** Catálogo de insumos, proveedores con dictamen de DT, depósitos.
- **Usuarios.** Rol, roles adicionales, sector y baja lógica.
- **Auditoría.** Últimas 200 escrituras con autor, momento, valores y rol de
  base, con las escrituras privilegiadas marcadas.

Diseño: violeta y ciruela, por identidad del cliente. La condición que cualquier
color de marca tiene que cumplir en este sistema es no competir con los cuatro
colores reservados de I.20.2, y la cumple. Barra lateral en escritorio; en
teléfono, barra inferior con las cuatro pantallas de uso diario y un botón «+»
abajo a la derecha que despliega la navegación completa.

Dependencias nuevas, ambas justificadas: `@tabler/icons-react` (la navegación se
apoya en iconos, se usa con guantes) y `qrcode` (el QR del rótulo). El gráfico
del tablero está escrito a mano justamente para no sumar una tercera.

---

## Cuenta de verificación

La verificación del circuito creó la primera cuenta del sistema, y por lo tanto
es la que quedó como administradora:

```
verificacion@nailshow.com.ar
```

La contraseña se entregó por chat. **Hay que rotarla o desactivar la cuenta**
en cuanto el dueño tenga la suya, por la misma razón que las credenciales de la
sección de deuda: quedó en un transcript.

Los datos que cargó esa verificación (un proveedor, un insumo, una recepción y
dos lotes) **no se pueden borrar**: la invariante 1 se aplica también a los
datos de prueba, y así tiene que ser. Están identificados y son pocos.

---

## Qué sigue

1. **Control de calidad de insumos (I.50.5)** con especificaciones (§4.6) y el
   motor de evaluación de §7.3. Es lo que hoy hace que `EN_ANALISIS → APROBADO`
   sea un botón y no un dictamen: falta la contraparte de lo que se acaba de
   hacer con el muestreo. **Ojo:** choca con D-02, que define quién firma el
   veredicto, y esa la contesta Dirección Técnica.
2. **Suite pgTAP.** `core.verificar_invariantes()` ya contesta las cinco
   invariantes exigibles; falta envolverla en pruebas que fallen el merge. Es
   barato y es evidencia de calificación operacional. Requiere conexión SQL
   directa, y la contraseña de la base es una de las que hay que rotar.
3. **Firma electrónica.** Bloqueada por D-01.
4. **No conformidades (PG.60.18).** El muestreo ya registra signos de no
   conformidad y varios mensajes de error remiten a ese procedimiento, pero el
   módulo no existe. Cada mensaje que dice «corresponde abrir una no
   conformidad» es hoy una instrucción al operario, no un flujo del sistema.

### Diferido, no descartado

- Firma electrónica con hash canónico + script de verificación en Python
- Separación de funciones configurable (§3.4 del alcance)
- Suite pgTAP completa
- Módulo `comercial`

---

## Trampas conocidas

- **Recursión infinita en RLS.** `core.rol()` debe leer el rol del _claim del
  JWT_, no consultar `core.usuarios`. Una política de `core.usuarios` que
  consulta `core.usuarios` recursa sin fin. Ya está en `CLAUDE.md` §7.
- **Cambio de rol y token.** Un cambio de rol no surte efecto hasta la renovación
  del JWT. Por eso una baja de usuario debe además revocar sesiones.
- **El hook de JWT no basta con declararlo en `config.toml`.** Hay que aplicarlo
  al proyecto alojado con `supabase config push`.
- **Columnas generadas:** `date + interval` devuelve `timestamp` y necesita cast
  explícito a `date`.
- **`current_user` dentro de una función SECURITY DEFINER** es el dueño de la
  función, no quien pidió la operación. Costó un defecto real en la columna
  `db_role` de la auditoría. Para saber quién pidió la escritura hay que leer el
  claim `role` del JWT o el GUC `role`, que sí sobreviven al cambio de contexto.
- **El generador de tipos no conoce los triggers.** Una columna `NOT NULL` sin
  `DEFAULT` que llena un `BEFORE INSERT` sale como obligatoria en el tipo del
  cliente. Se resuelve con un `DEFAULT` vacío que el trigger pisa siempre.
- **PostgREST no da transacción entre llamadas.** El alta de recepción con sus
  lotes son varias llamadas: si falla la segunda, la recepción ya quedó escrita
  y no se puede borrar. Cuando el circuito crezca, esa operación pasa a una
  función de base.

---

## Deuda y riesgos abiertos

### 1. Rotar credenciales — pendiente, con prioridad

Durante la sesión del 2026-09-04 se pegaron en el chat, y por lo tanto quedaron
en el transcript:

- el **personal access token** de Supabase (`sbp_…`), que administra toda la cuenta
- la **contraseña de la base** del proyecto

Ambas hay que rotarlas:

- PAT: Dashboard → Account → Access Tokens
- Contraseña: Dashboard → Settings → Database

A eso se suma, desde esta sesión, la contraseña de la cuenta
`verificacion@nailshow.com.ar`, que también viajó por chat y además es hoy la
única cuenta con rol de administrador del sistema. Rotarla o desactivar la
cuenta apenas el dueño tenga la suya.

Esto es más urgente que cortar el acceso de escritura, porque el alcance del PAT
es la cuenta entera, no un proyecto.

### 2. Deriva del historial de migraciones

Se trabaja directo contra el proyecto cloud, sin `db reset`. Si se ejecuta DDL
suelto por `psql`, la base queda en un estado que el repo no describe, y el
control de cambios de GAMP 5 deja de tener respaldo.

**Regla, ahora en `CLAUDE.md` §6:** toda migración se escribe primero como
archivo en `supabase/migrations/` con su encabezado, y recién después se aplica.

### 3. Pasar el acceso a solo lectura cuando entren datos reales

En cuanto el cliente empiece a cargar datos de producción, revocar el acceso de
escritura de las herramientas de desarrollo. Es un cambio de minutos y olvidarlo
es caro.

### 4. Calificación operacional (OQ)

La suite pgTAP completa es la evidencia de OQ bajo GAMP 5. Queda pendiente para
antes de producción, no antes del demo. **No está bloqueada por infraestructura:**
pgTAP corre contra esta base. Es una decisión de alcance, no una limitación.

---

## Decisiones abiertas que van a bloquear más adelante

El detalle completo, con quién decide y qué bloquea cada una, está en
`docs/DECISIONES_ABIERTAS.md`. Resumen:

Ninguna bloquea la fase 1 recortada. Las dos primeras requieren decisión de
Dirección Técnica, no del equipo de desarrollo.

1. **Estándar de firma electrónica** (§9.2 pregunta 8 del alcance): ¿equivalencia
   con firma digital de la Ley 25.506, o firma electrónica avanzada con
   trazabilidad? Cambia la infraestructura de forma sustancial. Bloquea la firma.
2. **Inconsistencia 12** (§10): ¿el veredicto de calidad lo escribe Control de
   Calidad o Dirección Técnica? Define el sujeto de la política RLS sobre
   `controles_calidad.veredicto`.
3. **POE I.40.25 ausente**: regla de formación del número de lote. Bloquea producción.
4. **POE I.20.3 ausente**: criterio de rotación de stock. Bloquea expedición.
5. **PG.60.1 v03**: el organigrama vigente declara 7 personas y la nómina real es
   de 11. La matriz de permisos deriva de él. Bloqueante para producción.

---

## Contexto humano

Hay un contacto dentro de la planta que va a dar feedback iterativo. Vale oro,
pero sus pedidos van a chocar con las invariantes. El clásico:

> «¿No se puede editar este registro que quedó mal cargado?»

La respuesta correcta no es hacerlo ni negarse en seco. Es el camino que los
propios POE ya definen: **registro rectificativo que apunta al original, con no
conformidad abierta según PG.60.18**. El dato erróneo queda visible junto a su
corrección, que es exactamente lo que BPF pide.

Ceder una vez ahí destruye el valor probatorio del sistema entero, y no de forma
gradual: si existe una credencial capaz de alterar un registro firmado, ningún
registro del sistema prueba nada. El razonamiento completo está en §3.5 del
documento de alcance y vale leerlo entero antes de la primera conversación
incómoda.
