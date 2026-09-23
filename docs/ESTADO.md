# Estado del proyecto y plan — handoff entre sesiones

Última actualización: 2026-09-11.
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

1. **Supabase CLI**, autenticada con un personal access token (`sbp_…`).
   Habilita `db push`, `gen types --linked` y `config push`.

   **El token va en `SUPABASE_ACCESS_TOKEN`, no en el keyring.** Persistido en
   `~/.zshenv` (el shell del Bash tool de Claude es zsh) y como variable
   universal de fish (el shell interactivo). El keyring guardaba un
   PAT de **otra** cuenta —la dueña de `equdata`/`AgroControl`, org
   `pmdgdtezwvyijgrrlovm`—, que no tiene acceso a NailsShow (org
   `oorfhopbocfwlduednqi`) y devolvía 403 sin que se notara que era la cuenta
   equivocada. La variable de entorno precede al keyring y sobrevive entre
   sesiones. Da acceso a toda la cuenta: se revoca en Dashboard → Account →
   Access Tokens.

2. **Management API con el mismo `SUPABASE_ACCESS_TOKEN`**, que corre SQL
   arbitrario sin contraseña de base. Es la vía para verificar una carga o
   consultar el catálogo, y la que conviene usar por defecto:

   ```sh
   curl -s -X POST \
     "https://api.supabase.com/v1/projects/yxpzsxkefqfuhyvslkfw/database/query" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query":"select count(*) from gmp.insumos_catalogo;"}'
   ```

   Corre como superusuario: sirve para **consultar**, no para hacer DDL suelto
   (CLAUDE.md §6, el esquema lo cambian las migraciones).

3. **`psql` contra el pooler de sesión**, con la contraseña de la base pasada por
   `PGPASSWORD` en cada comando. Habilita DDL, consultas y pgTAP. La contraseña
   **no** está persistida en ningún lado: si sólo hace falta consultar, usar la
   vía 2 y no pedirla.

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

## Stock de insumos (fase 10 recortada) — 2026-09-10

Primer poblamiento de `comercial`. Hasta acá el esquema existía vacío, solo
para fijar la dirección de dependencia.

**Aplicado y verificado contra el proyecto alojado.** Las dos migraciones se
pushearon con `supabase db push` (Postgres 17.6). Sobre la base alojada se
confirmó: las tres tablas nuevas con `ENABLE` y `FORCE` RLS (invariante 3),
`core.tablas_sin_auditoria()` en vacío (invariante 6) y `movimientos_stock` sin
`GRANT` de UPDATE ni DELETE (RN-54). Los tipos del cliente se regeneraron con
`npm run db:types` desde la base real. El circuito funcional —inserts y
rechazos— se verificó con 46 pruebas contra un Postgres local; **no** se corrió
contra la base alojada para no ensuciarla con datos de prueba que el trigger de
auditoría no deja borrar (está en cero para el arranque real).

**Recorte deliberado: el stock no está valorizado.** §4.12.2 define
`costo_unitario` NOT NULL sobre cada movimiento, y en el sistema no hay ningún
dato de costo: `gmp.recepciones.monto` es el total del remito, no un precio por
insumo, y la recepción fiscal de la factura (RN-65) es de una fase posterior.
Poner un costo ahora obligaría a inventarlo. Un stock valorizado con números
inventados es peor que uno sin valorizar: el segundo se sabe incompleto, el
primero se cree exacto. Cuando llegue la valorización, agrega columnas; no
reescribe nada.

### Migraciones

| Migración                                    | Qué trae                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `20260910160000_gmp_bloqueos_lote`           | `gmp.bloqueos_lote`, `gmp.lote_despachable()`, `impedimento_despacho()` |
| `20260910170000_comercial_stock_movimientos` | artículos, libro de movimientos, saldos, kardex, operaciones            |

### Reglas implementadas

| Regla                              | Dónde vive                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| RN-51 solo se despacha lo liberado | `gmp.impedimento_despacho()`, invocada desde `comercial`                        |
| RN-52 el lote bloqueado no sale    | `gmp.bloqueos_lote` + la misma función                                          |
| RN-54 el movimiento no se edita    | sin GRANT de UPDATE/DELETE + `trg_movimiento_inmutable` + anulación por inverso |
| §3.3 ajuste de inventario          | políticas RLS sobre `movimientos_stock` (DT, ADM, GP)                           |

`gmp.bloqueos_lote` se escribió **antes** que el módulo de retiro de mercado a
propósito: el consumidor —los movimientos de salida— nace en la misma tanda, y
sin la autoridad en `gmp` el esquema `comercial` habría tenido que evaluar por
su cuenta si un lote está liberado, que es lo que CLAUDE.md §4 prohíbe. Lo que
falta de la fase de retiro es el disparador automático del bloqueo, no el
bloqueo.

### Tres apartamientos del documento de alcance, con su motivo

1. **La clave primaria de `movimientos_stock` es `uuid`, no `bigserial`.** El
   trigger genérico de auditoría hace `(to_jsonb(new) ->> 'id')::uuid` para
   llenar `core.auditoria.registro_id`. Una tabla de negocio con clave entera
   **rompe la auditoría en tiempo de ejecución**, y la invariante 6 no se
   negocia. El orden del kardex, que es lo que `bigserial` daba, lo da la
   columna `orden` como identidad.
2. **El puntero de anulación va en el movimiento que anula, no en el anulado.**
   §4.12.2 pone `anulado_por_id` en el original, lo que obliga a hacerle UPDATE
   cuando se lo anula — y RN-54 dice que un movimiento no se edita nunca. El
   campo se llama `anula_a_movimiento_id`, «está anulado» se deriva, y la regla
   se cumple sin la excepción que la ponía a prueba. De paso respeta CLAUDE.md
   §6, que reserva el sufijo `*_por` para referencias a `core.usuarios`.
3. **La carga a stock es un acto explícito, no un efecto de la recepción.**
   `gmp.recepciones.cargado_a_stock` existía desde la fase 1 sin que nadie lo
   escribiera; éste es su acto. Un trigger sobre `gmp.lotes_insumo` que
   escribiera en `comercial` habría invertido la dirección de dependencia sin
   que ninguna clave foránea lo delatara.

### Un defecto evitado que vale anotar

La primera versión de la política de levantamiento de bloqueo habilitaba solo a
`DIRECCION_TECNICA` en el `USING`. **Un UPDATE que RLS filtra no falla: afecta
cero filas.** Control de Calidad habría apretado «levantar», no habría pasado
nada, y la pantalla habría informado éxito. Ahora la política deja pasar la
fila a los tres roles que pueden bloquear y el trigger reserva el levantamiento
a DT con un mensaje escrito. El mismo cuidado está en el cliente:
`useLevantarBloqueo` trata «cero filas» como error.

La misma trampa obligó a que `comercial.transferir_deposito()` **no** toque
`gmp.lotes_insumo.deposito_actual_id`: `lotes_insumo_update_circuito` no incluye
a `ADMINISTRACION`, que sí mueve stock. Desde ahora `deposito_actual_id` es la
aproximación de fase 1 —un lote, un depósito— y la existencia por depósito la
contesta `comercial.v_existencias`, que admite que un lote esté repartido.

### Frontend

- **Stock** (`/stock`) reemplaza a «Material en planta». Existencia por
  artículo con desglose por lote y depósito, filtros por bajo mínimo y por
  material retenido. Distingue en la misma fila **cuánto hay** de **cuánto se
  puede despachar**: confundirlos es prometer mercadería que no puede salir.
- **Recepciones** gana la acción «Cargar a stock», con confirmación.
- **Ficha del lote** gana dos paneles: existencia por depósito con transferencia,
  ajuste, descarte y muestra; y bloqueos, con su historial completo incluidos
  los levantados.
- `gmp.v_existencias_recibidas` sigue en la base pero ya no tiene pantalla: la
  existencia real la contesta `comercial`.

### Verificación

`supabase/tests/` levanta un PostgreSQL descartable con `initdb`, reproduce las
dieciséis migraciones desde cero y corre **46 pruebas funcionales** con sesiones
de usuario reales: 46 en verde. Aproximadamente la mitad verifica un rechazo.
Esto destraba lo que la deuda 4 daba por bloqueado: `db reset`, `db diff` y
`test db` piden Docker, pero `initdb` no.

**No reemplaza la suite pgTAP**, que sigue siendo la evidencia de calificación
operacional. Cubre el mismo terreno y hoy corre, que es la diferencia entre
tener una verificación y tener una intención.

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

## Carga de materias primas (2026-09-11)

Entraron las **40 materias primas** que faltaban (migración
`20260911140000_carga_materias_primas.sql`). El catálogo pasa de 300 a 340
ítems y por primera vez tiene material real sobre el cual RN-01 y RN-03 se
ejercen: `requiere_protocolo` en las 40, `requiere_pesada_recepcion` en los 29
pigmentos. Esto contesta la mayor parte de D-15.

Verificado contra la base alojada el 2026-09-11: 340 ítems, 41 de tipo
`MATERIA_PRIMA` —los 40 nuevos más `MP-0001` «Nitrocelulosa E 1/2 s», el insumo
de prueba del 2026-09-04 que no se puede borrar por la invariante 1—, con 29
pesadas y 11 sin pesada, todos con protocolo. La auditoría registró los 40
asientos de INSERT con `db_role = 'postgres'`, que es lo correcto para una
migración: no es una escritura privilegiada de las que vigila CLAUDE.md §5.

### Unidad de medida: gramos, y la columna queda nullable

El archivo llegó sin unidad. La migración
`20260911130000_insumos_unidad_medida_pendiente.sql` relajó el `NOT NULL` en vez
de inventar un `kg`, con la misma lógica con la que `gmp.productos` dejó `tipo`
y `forma_cosmetica` en `text`: mejor que la ignorancia se vea a que quede
disfrazada de dato. A cambio, `gmp.fn_validar_lote_insumo` **rechaza la
recepción** de un lote cuyo insumo no tenga unidad confirmada.

La Gerencia confirmó **gramos** para las 40, y
`20260911150000_materias_primas_unidad_gramos.sql` las completó. Verificado: 40
en `g`, **cero ítems sin unidad en todo el catálogo**, y los 40 ya son
recepcionables.

**El `NOT NULL` no se restauró**, aunque la migración `…130000` lo había
anunciado: el catálogo se carga por tandas desde planillas y ya llegó una sin
unidad, así que poder decir «pendiente» sirve de forma permanente; y el
`NOT NULL` nunca fue la protección real —garantizaba que hubiera algo escrito,
no que fuera cierto—, esa es la precondición de recepción, que queda vigente. El
razonamiento completo está en el encabezado de `…150000` y en R-03. La interfaz
que muestra «sin definir» y deshabilita esos insumos en el selector de recepción
queda en su lugar, lista para la próxima tanda incompleta.

D-16 y D-17 quedaron **resueltas** el mismo día (ver R-03 y R-04 en
`docs/DECISIONES_ABIERTAS.md`): gramos, y los ordinales romanos de los pigmentos
se dejan tal cual vinieron por indicación de la Gerencia, anomalías incluidas
—XXIV repetido, y el salto de XXVII a XXXI—, porque son la denominación del
papel y la identidad la lleva `codigo_interno`.

### Lo que sigue abierto: inflamables

`es_inflamable` está en `false` en las 40 por indicación de la Gerencia, «por
ahora». Con fragancias, esencias y monómero en la lista, conviene volver a
preguntarlo y no leer ese `false` como una respuesta. Mientras siga así,
**RN-48 y el depósito exterior `INF` no se ejercen sobre ningún ítem**: la regla
está implementada y sin material al cual aplicarse.

Se dijo que es «editable después», y conviene precisarlo: la base lo permite
—`insumos_catalogo` tiene política de UPDATE para DT, GP y SYS—, pero **no hay
pantalla de edición de insumo**; `/insumos` sólo da de alta. Hoy el cambio va
por migración. Si se espera que lo toquen ellos desde la aplicación, hay que
construir esa edición primero.

---

## Catálogo de productos y cuenta de Nazarena (2026-09-11)

### Los 483 productos están cargados

`20260911170000_carga_productos.sql`. El archivo traía **dos columnas**, código
y nombre, así que `variedad`, `tipo` y `forma_cosmetica` quedaron en NULL: no
hay de dónde sacarlos. `tipo` y `forma_cosmetica` siguen en `text` esperando que
algún archivo fije su vocabulario; éste no lo fijó.

**`origen` pasó a admitir NULL** (`20260911160000`). Estaba
`not null default 'FABRICADO'`, y dejar correr el default habría escrito «esto
se fabrica en planta» en las 483 filas, que es falso —los «Nail Tips» son
importados y los pinceles no se fabrican— y no es cosmético: `origen` decide qué
recorrido de producción le toca al producto. **Cuando se construya el circuito
de producción, la orden tiene que rechazar un producto sin `origen`**, igual que
la recepción rechaza un insumo sin unidad. Esa precondición es parte del alcance
de esa fase; hoy no existe porque no existe el circuito.

**Vida útil 36 meses en los 483**, por indicación de la Gerencia. Escrita en las
filas y no como `DEFAULT` de la columna, para que un producto futuro no nazca
afirmando tres años sin que nadie lo haya dicho de él.

**Cuatro decisiones abiertas salieron de esta carga**, y la primera importa más
que las otras tres juntas:

- **D-18: ~108 de los 483 no son producto cosmético.** Pinceles, fresas, limas,
  tijeras, dappen dishes, nail tips, exhibidores. Están en el catálogo que
  gobierna orden de producción, liberación de lote y retiro de mercado. Hay que
  separarlos, y `tipo` es el lugar (COSMETICO / ACCESORIO).
- **D-19:** los 36 meses son un provisorio; la vida útil sale del estudio de
  estabilidad y es por producto. Y los ítems de D-18 directamente no vencen.
- **D-20:** 36 nombres vienen cortados en 40 caracteres, varios a mitad de
  palabra, y uno con el carácter final dañado (`176`, «DISEí» por «DISEÑO»).
- **D-21:** `136` y `138` traen «no se usa» en el nombre y quedaron activos.

### Nazarena: cuenta creada y nómina cerrada

Cuenta `naza@nailshow.com`, **GERENCIA_PRODUCCION**, sector PRODUCCION, activa.
Creada por el registro público de Auth —que da de alta como OPERARIO
desactivado, porque el rol nunca se lee de los metadatos del alta— y promovida
por `20260911190000_alta_gerencia_produccion.sql`. La promoción va en migración
a propósito: así la asignación de permisos tiene historial en el repositorio.

**Rotar la contraseña.** Se transmitió por chat, igual que la de
`verificacion@nailshow.com.ar`. Una credencial que quedó en un transcript no es
una credencial.

El pedido era «todo menos ver usuarios y auditoría». Auditoría ya estaba cerrada
(`auditoria_select_supervision` es de DT, GERENCIA y SYS). **Usuarios no lo
estaba**: `usuarios_select_authenticated` daba la nómina completa a cualquier rol
con sesión. Esa política tenía un motivo bueno —sin resolver el nombre del autor,
cada registro muestra un uuid— pero pagaba de más: entregaba la ficha entera,
con documento, email, sector y fecha de baja, a quien supiera pedirla por la API.

`20260911180000_nomina_restringida.sql` separa las dos cosas:

- `core.v_nomina` (id, nombre, rol, activo) la lee cualquier usuario con sesión.
  Es lo que la trazabilidad necesita. **Deliberadamente sin `security_invoker`**:
  corre con los privilegios del dueño y no aplica el RLS de la tabla base, que es
  el punto. No es un atajo del tipo que vigila §5 —no hay `service_role`, no
  escribe, y lo que expone es lo que el sistema está obligado a mostrar.
- `core.usuarios` la leen DT, GERENCIA y SYS, más cada uno su propia ficha.
- Las tres vistas que resolvían autor (`gmp.v_muestreos`, `gmp.v_bloqueos_lote`,
  `comercial.v_kardex`) pasaron a unir contra `core.v_nomina`. Se
  reescribieron desde `pg_get_viewdef`, no de memoria, para no perder nada en el
  camino.

Verificado contra la base con `SET LOCAL ROLE authenticated` y sus claims:

| Qué                                      | Resultado                           |
| ---------------------------------------- | ----------------------------------- |
| `core.usuarios`                          | **1 fila** (la suya)                |
| `core.auditoria`                         | **0 filas**                         |
| `core.v_nomina`                          | 2 filas — resuelve nombres de autor |
| `gmp.productos` / `gmp.insumos_catalogo` | 483 / 340                           |
| registrar movimientos de stock           | **sí**                              |
| alta y edición de artículos              | **sí**                              |
| alta de proveedor, maestros técnicos     | **sí**                              |
| leer auditoría, administrar usuarios     | **no**                              |

La navegación ya escondía `/usuarios` y `/auditoria` para su rol, así que el
cambio fue sólo de RLS: la interfaz ya estaba alineada.

---

## Edición de los maestros (2026-09-11)

Faltaba lo más básico y se notaba: el catálogo sólo se podía dar de alta. Los
`es_inflamable` de las 40 materias primas y los `origen` de los 483 productos se
señalaron dos veces como «editables después» sin que hubiera dónde editarlos.

Ahora **al hacer clic en cualquier fila de `/insumos` o `/productos` se abre la
ficha en un modal**, con los mismos campos del alta más un interruptor de
`activo`. Es el mismo componente para alta y edición: separarlos en dos habría
sido duplicar reglas para que después se desincronicen. El `key` del modal
fuerza el remontaje al cambiar de ficha, porque Mantine conserva los valores
iniciales del formulario anterior.

`/insumos` ganó además un buscador por nombre y código. Con 340 ítems, la tabla
sin filtro hacía inservible la edición por fila; `/productos` ya lo tenía.

### El código interno se congela cuando hay existencia

`20260911200000_maestros_identidad_del_codigo.sql`. Es el único campo que la
edición no puede dejar suelto.

`codigo_interno` no es un atributo, es la identidad de negocio. Cuando un insumo
entra a stock por primera vez, `comercial.articulo_de_insumo()` copia ese código
como `sku`. La copia es deliberada —el artículo es de `comercial` y no puede
depender de `gmp` fila por fila— pero significa que cambiar el código después
deja el SKU citando un código que ya no existe, sin que falle nada: simplemente
dejan de coincidir.

Propagar el cambio a `comercial.articulos` desde un trigger de `gmp` invertiría
la dirección de dependencia de la invariante 7, que es exactamente el motivo por
el que `articulo_de_insumo()` vive en `comercial`. Así que el criterio es otro:
el código se corrige mientras el insumo sea sólo una ficha, y se congela en
cuanto tiene lotes o artículo de stock. Un error de tipeo se arregla el día que
se carga; si ya hay material recibido contra ese código, el código es el que
figura en el papel.

El resto de la ficha se edita siempre, y la auditoría guarda el valor anterior
de cada campo (RN-50).

**`gmp.productos` todavía no lleva el resguardo equivalente** porque nada copia
su código: no hay lotes de producto ni artículo de stock de producto terminado.
Cuando se cree cualquiera de los dos, **hay que espejar este trigger ahí**.

### Verificación

Con la sesión de Nazarena (`SET LOCAL ROLE authenticated` y sus claims), en una
transacción revertida al final para no ensuciar la auditoría, que es append-only:

| Caso                                                | Resultado     |
| --------------------------------------------------- | ------------- |
| editar ficha de insumo (nombre, unidad, inflamable) | OK            |
| cambiar código de un insumo sin lotes ni stock      | OK, editable  |
| cambiar código de un insumo con artículo de stock   | **rechazado** |
| editar ficha de producto (origen, tipo, activo)     | OK            |

Confirmado después que no quedó ninguna fila tocada ni asiento de auditoría de
la prueba.

---

## Qué sigue

0. **RETOMAR ACÁ — separar producto cosmético de accesorio (D-18).** Es lo que
   dejó pendiente la carga del catálogo, y bloquea al circuito de producción:
   hoy `gmp.productos` tiene 108 herramientas conviviendo con los cosméticos, y
   una orden de producción sobre un pincel no significa nada. Se resuelve
   poniendo vocabulario en `tipo` (COSMETICO / ACCESORIO) en cuanto la Gerencia
   confirme, y de paso es la ocasión de promover `tipo` a enum, que era el plan
   desde que se creó la tabla. Detrás vienen D-19 (vida útil real), D-20
   (nombres truncados) y D-21 (dos ítems a desactivar).

   Después: el circuito de **producción para stock** —registrar qué se produjo y
   qué insumos consumió (baja por `SALIDA_CONSUMO_PRODUCCION`, hoy bloqueada en
   `comercial.fn_validar_movimiento` a la espera de este circuito)—. Quedó
   pendiente de decidir: consumo solo, o consumo + entrada de producto terminado
   al stock (esto último arrastra presentaciones y numeración de lote, bloqueada
   por I.40.25 / D-04). **Cuando se construya, la orden de producción tiene que
   rechazar un producto sin `origen`**, que hoy está en NULL en los 483.

1. **Circuito de stock contra la base alojada, con datos reales.** El DDL ya
   está aplicado y lo estructural verificado en producción, pero el circuito
   funcional (cargar una recepción a stock, transferir, bloquear, anular) se
   probó contra un Postgres local, no contra la alojada, para no dejarle datos
   de prueba imborrables. Conviene correrlo una vez apenas entre el primer lote
   real, o con datos de prueba si se acepta que quedan.

2. **Control de calidad de insumos (I.50.5)** con especificaciones (§4.6) y el
   motor de evaluación de §7.3. Es lo que hoy hace que `EN_ANALISIS → APROBADO`
   sea un botón y no un dictamen: falta la contraparte de lo que se acaba de
   hacer con el muestreo. **Ojo:** choca con D-02, que define quién firma el
   veredicto, y esa la contesta Dirección Técnica.
3. **Suite pgTAP.** `core.verificar_invariantes()` ya contesta las cinco
   invariantes exigibles; falta envolverla en pruebas que fallen el merge. Es
   barato y es evidencia de calificación operacional. Requiere conexión SQL
   directa, y la contraseña de la base es una de las que hay que rotar.
4. **Firma electrónica.** Bloqueada por D-01.
5. **No conformidades (PG.60.18).** El muestreo ya registra signos de no
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

---

## Saldo inicial de apertura (2026-09-16, sin verificar contra la base)

Implementado a partir de `docs/ESPEC_SALDO_INICIAL.md`. Cinco migraciones
nuevas, en este orden (dos van solas por la restricción de Postgres de no usar
un valor de enum agregado en la misma transacción que lo agrega):

| Migración                                                | Qué trae                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `20260916120000_gmp_estado_saldo_apertura`                | agrega `SALDO_APERTURA` a `gmp.estado_calidad_enum`                     |
| `20260916130000_gmp_migracion_apertura`                   | `gmp.migracion_apertura`, columnas nuevas en `lotes_insumo`, exención del circuito de calidad para ese estado, depósito `APE`, color de rótulo AZUL |
| `20260916140000_comercial_tipo_movimiento_saldo_apertura` | agrega `ENTRADA_SALDO_APERTURA` a `comercial.tipo_movimiento_enum`       |
| `20260916150000_comercial_cargar_apertura_a_stock`        | `comercial.cargar_apertura_a_stock()`, `comercial.deshacer_apertura()`   |
| `20260916160000_carga_saldo_apertura`                     | los datos: 336 de 647 renglones de `inventario_apertura.csv`, generados por `scripts/apertura/generar_migracion.mjs` |

**No se aplicaron todavía** (`supabase db push` pendiente) ni se corrieron
contra el proyecto alojado: esta sesión no tuvo acceso a la base. Antes de
darlas por buenas falta lo de siempre — `db push` y, si hay pgTAP para el
circuito de lotes, correrlo.

**Apartamiento deliberado de §6 del documento de la carga.** El documento pide
que la carga se deshaga con `delete from movimientos where migracion_id = …`.
Eso borra un registro de negocio, y la invariante 1 de CLAUDE.md (más RN-54) lo
prohíben sin excepción para scripts de migración; `comercial.movimientos_stock`
ni siquiera tiene GRANT de DELETE. `comercial.deshacer_apertura()` cumple el
mismo requisito —reversión completa en una sola llamada— anulando cada
movimiento con `comercial.anular_movimiento()` (ya existente, RN-54), no
borrándolo. El razonamiento completo está en la cabecera de `…130000`.

**Cobertura real: 336 de 647 códigos (52%).** Los 294 restantes —herramientas,
mobiliario (código `550`), merchandising, libros, y materias primas/semielaborados
que la planilla trae pero que todavía no están en `gmp.insumos_catalogo`— quedan
fuera a propósito: clasificarlos (`tipo_insumo_enum`, `requiere_protocolo`,
`es_inflamable`) es una decisión de catálogo que le corresponde a la Gerencia, no
algo que se pueda inferir de un nombre de planilla. Lista completa en
`scripts/apertura/pendientes.md` y las tres decisiones abiertas D-22, D-23 y D-24
de `docs/DECISIONES_ABIERTAS.md`. El color de fila del CSV (`color_origen`) se
guardó como metadato crudo sin interpretar: su significado también está abierto
(D-22).

**Reconciliación de conteo.** El CSV adjunto trae 647 renglones parseables; el
documento de la carga declara 650. La diferencia (3) es de la transcripción del
archivo a este repositorio, no de la lógica de importación; si aparece el xlsx
original convendría re-generar `scripts/apertura/inventario_apertura.csv` desde
la fuente y volver a correr el generador.

---

## Front de pedidos para quien carga y quien revisa (2026-09-23, sin verificar contra la base)

Sólo front, sin migraciones: todo corre sobre `20260917120000`. Dos usuarios con
preguntas distintas: quien **carga** pedidos (Administración, «Mati», todavía sin
cuenta) y quien los **recibe** y decide qué comprar (Gerencia de Producción,
Nazarena).

- **`/pedidos`** es una bandeja por estado —para revisar, en producción,
  borradores, cerrados— con la vista en la URL. Arranca en «borradores» para
  Administración y en «para revisar» para GP/DT. Ordena por entrega.
- **Alta en un solo formulario** (`FormularioPedido`), con productos incluidos y
  dos salidas: guardar borrador o enviar a producción. Cabecera primero, todos
  los renglones en un único INSERT, y recién después la confirmación: si algo
  falla queda un borrador, nunca un pedido enviado a medias.
- **Ficha del pedido.** Botones del paso siguiente en vez de un selector libre
  de estado. Renglones editables sólo en borrador. Marca los productos **sin
  lista de materiales**: antes la ficha decía «se puede fabricar» también
  cuando ningún producto tenía lista, que es «no sé», no «hay».
- **Compras pendientes (`/compras`)**, primera pantalla sobre
  `comercial.avisos_compra`. Desde los faltantes se anota uno o todos; la
  lista sigue por comprar → pedido al proveedor → resuelto, o descartado con
  motivo. Avisa cuando el mismo insumo está anotado para dos pedidos, porque
  cada uno se explotó contra el mismo disponible.

### Pendientes de base que este front deja a la vista

1. **Transiciones de estado sin control en la base.** La pantalla sólo ofrece
   el paso siguiente, pero `pedidos_actualiza` deja poner cualquier valor, y
   los renglones se pueden editar con el pedido ya enviado. Falta un trigger.
2. **`avisos_compra.resuelto_por` lo llena el cliente.** No tiene default ni
   trigger; el autor real igual queda en `core.auditoria`.
3. **Numeración de pedido** sugerida por el cliente (`P-0001`), protegida sólo
   por el UNIQUE. No es comprobante fiscal, así que RN-55 no aplica, pero un
   contador en base sería más limpio.
4. **La explosión cubre sólo acondicionamiento.** El granel sigue en cero hasta
   que `gmp.productos` tenga contenido por unidad.
5. **Rol de quien carga pedidos.** Se asumió `ADMINISTRACION`, que es el que la
   matriz §3.3 habilita para «Registrar pedido» y el que PG.60.1 asigna a
   «Recepción de pedidos». Falta confirmarlo y crear la cuenta.

**No se verificó contra la base alojada**: los tipos no conocen estas tablas
(siguen los tipos puente de `consultasComercial.ts`) y esta sesión no tuvo
acceso. Antes de darlo por bueno: confirmar que `20260917120000` está aplicada,
`npm run db:types`, y recorrer el circuito con una cuenta de cada rol.

---

## Recetas de C.V.D., faltantes sumados y «Terminado» (2026-09-23, sin aplicar)

Tres migraciones nuevas, **escritas y reproducidas desde cero sobre PGlite**
(Postgres 18 en WASM, instalado fuera del repo porque esta máquina no tiene
Postgres ni Docker), con 23 pruebas funcionales en verde usando sesiones reales
de Gerencia de Producción y de Administración. **No se aplicaron** al proyecto
alojado (`supabase db push` pendiente) ni se regeneraron los tipos.

| Migración                                              | Qué trae                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `20260923120000_gmp_lote_consumible_en_produccion`     | `gmp.impedimento_consumo()`: qué lote se puede usar en producción (incluye saldo de apertura, R-05) |
| `20260923130000_comercial_consumo_y_faltantes_consolidados` | disponible recalculado, `faltantes_en_curso()`, `pedido_consumos`, `terminar_pedido()`, estados del pedido en la base |
| `20260923140000_carga_lista_materiales_cvd`            | 91 renglones de lista de materiales para 25 productos, generados desde la hoja C.V.D.             |

**Esto cierra los pendientes 1 de la sección anterior**: la base ahora controla
las transiciones del pedido, los productos solo se tocan en borrador, y
`CUMPLIDO` solo se alcanza con «Terminado».

### Circuito

1. Administración carga el pedido. Los productos con receta aparecen primero en
   el selector.
2. Al enviarlo, aparece en la bandeja de Gerencia de Producción. La ficha dice
   qué falta; `/pedidos` muestra **el total sumado de todos los pedidos en
   curso**, con lo que aporta cada pedido debajo de cada insumo. Se suma la
   necesidad antes de comparar con el stock: sumar faltantes por pedido da un
   número falso.
3. «Terminado» abre la receta con cantidades editables. Una diferencia exige
   motivo, y se puede agregar un insumo que no está en la receta. Al confirmar,
   en una sola transacción: registra el consumo teórico y real, baja stock lote
   por lote (vence primero, R-06) y cierra el pedido. Si algo no alcanza, no
   baja nada y dice qué falta.

Un `SALIDA_CONSUMO_PRODUCCION` solo se acepta si apunta a un consumo registrado
del mismo insumo y no excede lo declarado: no hay baja suelta que ningún pedido
explique. El producto terminado **no** entra al stock (sigue D-04).

### Carga de recetas

Cadena reproducible en `scripts/lista_materiales/`: `extraer_cvd.mjs` (xlsx →
`cvd_celeste.csv`, solo celdas celestes), `decisiones.mjs` (qué bloque es qué
producto, en qué unidad está cada cantidad, con qué densidad se convierte, cada
una con su razón), `generar_migracion.mjs` (→ migración + `pendientes.md`). El
xlsx es el mismo de la carga de apertura (mismo sha256). Los líquidos se pasan a
gramos con `gmp.densidad_a(…, 20)` y la columna nueva
`materiales_acondicionamiento.origen` guarda celda, unidad original y densidad.
113 renglones quedaron afuera con su motivo (D-27); las unidades leídas esperan
confirmación (D-28).

### Lo que va a pasar al usarlo hoy, y por qué

**El saldo de apertura no es un conteo (D-26).** La carga del 22/09 guardó la
cantidad del envase de compra: 1 g de alcohol, 1 g de agua. Con eso, casi todo
va a figurar como faltante y «Terminado» va a rechazar. El circuito está bien;
los saldos no. Hace falta un conteo físico cargado como ajuste de inventario.

### Para aplicarlo

1. `supabase db push` (las tres en orden).
2. `npm run db:types`, y borrar los tipos puente de `consultasComercial.ts`.
3. Recorrer el circuito con la cuenta de Nazarena y una de Administración.
4. Crear la cuenta de Mati con rol `ADMINISTRACION` (supuesto, ver la sección
   anterior).

### Pedido del codirector técnico, sin hacer

Cargar fórmulas en %V/V además de %P/P. Hoy `gmp.formula_componentes` tiene
solo `porcentaje_pp` y la pantalla de fórmulas y la calculadora trabajan solo
en masa; «se mide a volumen» cambia cómo se muestra la hoja de pesada, no cómo
se interpreta el porcentaje.

### Segunda tanda del mismo día: insumos faltantes, unidades y saldo provisorio

Por indicación del codirector técnico, dos migraciones más, también **sin
aplicar** y reproducidas desde cero en PGlite (24 pruebas de pedidos + 14 de
conteo, en verde):

| Migración                                                   | Qué trae                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `20260923135000_gmp_alta_insumos_listas_materiales`         | 25 insumos nuevos (cierres, etiquetas, cremas, primer/bonder/removedor a granel); esencia a ml |
| `20260923150000_comercial_conteo_inventario_y_apertura_provisoria` | `conteos_inventario`, `registrar_conteo()`, saldo provisorio de 66 materias primas      |

`20260923140000` (recetas) se regeneró antes de aplicarse: ahora son **142
renglones en 26 productos**. El orden de aplicación es 120000 → 130000 → 135000
→ 140000 → 150000.

**El saldo de apertura sigue siendo una estimación (D-26).** Se corrigió a
«1 envase × contenido» de la planilla (monómero ≈ 182 kg, agua ≈ 10 kg), como
conteo provisorio y a nombre del codirector técnico, con ajuste de inventario:
el 1 original queda en el kardex. La pantalla **Conteo de inventario**
(`/conteo`) imprime la planilla para el depósito y carga lo contado; cada
conteo lleva el saldo a lo contado con un ajuste sobre el lote de apertura, y
nunca toca lotes con recepción.

Criterios propios a confirmar: D-29 (granel líquido en ml,
inflamables, densidad del alcohol del sanitizante, toalla).

### Acceso a la base desde esta máquina (2026-09-23)

**Las cinco migraciones del 2026-09-23 siguen sin aplicar.** En la máquina
Windows del codirector técnico la CLI está logueada con una cuenta que **no**
ve el proyecto de la app:

- Proyecto de la app: `yxpzsxkefqfuhyvslkfw`, en la organización del
  colaborador que lo administra. Es al que apunta `.env`.
- Proyecto que ve la CLI: `ungcuiiuqkmdjcaeyzae`, también llamado
  «NailsShow», de la cuenta del codirector técnico. Se creó por error y está
  **pausado**. `supabase/.temp/linked-project.json` apunta a él: **no hacer
  `db push` con ese vínculo.**

Camino acordado: que el dueño de la organización invite al codirector técnico
(Team → Invite), y recién entonces `supabase login` + `supabase link
--project-ref yxpzsxkefqfuhyvslkfw`. Ojo: `npm run db:types` redirige a
`src/lib/database.types.ts` y, si la CLI falla, deja ese archivo **vacío**. Se
restaura con `git checkout -- src/lib/database.types.ts`.
