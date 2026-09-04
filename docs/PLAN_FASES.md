# Plan de implementación por fases

Cada fase es una rama y un conjunto de prompts para Claude Code. Los prompts están
escritos para pegarse tal cual, uno por vez, esperando a que termine el anterior.

---

## Mapa de fases

| #   | Fase                                                                           | Depende de | Bloqueada por documentación faltante |
| --- | ------------------------------------------------------------------------------ | ---------- | ------------------------------------ |
| 0   | Andamiaje: repo, Vite, Supabase local, CI, tipos                               | —          | no                                   |
| 1   | Núcleo de cumplimiento: esquemas, usuarios, RLS, auditoría, firma              | 0          | no                                   |
| 2   | Maestros: depósitos, proveedores, insumos, productos, presentaciones, equipos  | 1          | no                                   |
| 3   | Recepción, rótulos, estados del lote de insumo, muestreo                       | 2          | no                                   |
| 4   | Especificaciones y motor de evaluación, CC de insumos                          | 3          | I.50.5                               |
| 5   | Procedimientos configurables, órdenes de producción, batch record, doble firma | 4          | I.40.25, decisión §3.4               |
| 6   | CC de granel y terminado, contramuestras, liberación                           | 5          | I.50.10                              |
| 7   | Trazabilidad bidireccional y legajo de lote en PDF                             | 6          | no                                   |
| 8   | No conformidad y CAPA, reclamos, devoluciones, retiro de mercado               | 6          | PG.60.9                              |
| 9   | Circuito de producto terminado importado                                       | 6          | no                                   |
| 10  | Stock valorizado, costeo por lote, kardex                                      | 3          | método de costeo                     |
| 11  | Clientes, listas de precios, pedidos, expedición, remitos                      | 10         | I.20.3                               |
| 12  | Facturación electrónica ARCA                                                   | 11         | certificado, puntos de venta         |
| 13  | Cuentas corrientes, imputaciones, cobranzas                                    | 12         | no                                   |
| 14  | Plan de cuentas, asientos automáticos, libros IVA, cierre de período           | 13         | plan del estudio contable            |
| S   | **Spike paralelo:** conteo asistido por imagen                                 | ninguna    | definición de captura                |

Las fases 0 a 3 se pueden hacer hoy sin ninguna definición pendiente. El bloque
comercial (10 a 14) es independiente hasta la fase 11, así que admite desarrollo en
paralelo si hay una segunda persona.

**Nota sobre el spike S.** Arrancalo ahora, no en el mes ocho. Es la pieza de mayor
incertidumbre técnica: si la iluminación o la disposición real de la planta rompen la
detección por grilla, querés saberlo antes de haber comprometido el flujo de expedición
a esa función.

---

## Fase 0 — Andamiaje

### Prompt 0.1

```
Vamos a arrancar un proyecto nuevo en este repositorio. Es un sistema de trazabilidad
para un laboratorio cosmético habilitado por ANMAT, sujeto a Buenas Prácticas de
Fabricación. Leé primero docs/ALCANCE_SISTEMA_TRAZABILIDAD.md completo y CLAUDE.md.

Tarea de esta sesión: armar el andamiaje. Nada de lógica de negocio todavía.

1. Inicializá un proyecto React 18 + TypeScript con Vite en la raíz. Modo estricto de
   TypeScript activado, sin `any` implícito.
2. Instalá y configurá: TanStack Query, react-hook-form, zod, @hookform/resolvers,
   react-router-dom, Tailwind, @supabase/supabase-js.
3. Inicializá Supabase local con la CLI (`supabase init`). En supabase/config.toml
   exponé los esquemas `core`, `gmp` y `comercial` en la clave db.schemas de PostgREST,
   además de `public`.
4. Configurá ESLint y Prettier. Regla de ESLint que prohíba importar la clave
   service_role en cualquier archivo bajo src/.
5. Estructura de carpetas:
   src/
     app/          rutas y layout
     features/     una carpeta por dominio (recepcion, muestreo, calidad, ...)
     lib/          cliente supabase, helpers, tipos generados
     components/   componentes compartidos de UI
   supabase/
     migrations/
     tests/        pruebas pgTAP
     functions/    Edge Functions
   docs/
6. Script npm `db:types` que corra `supabase gen types typescript --local` y escriba
   en src/lib/database.types.ts.
7. GitHub Actions con dos jobs: uno que levante Supabase local, aplique migraciones y
   corra pgTAP; otro que corra lint, typecheck y build del front.
8. .env.example con las variables necesarias y .gitignore que excluya .env y cualquier
   archivo .p12, .pem, .key o .crt.

Al terminar, mostrame el árbol de archivos y confirmame que `supabase start` y
`npm run build` funcionan.
```

### Prompt 0.2

```
Instalá pgTAP en el entorno local de Supabase mediante una migración que cree la
extensión, y armá el andamiaje de pruebas:

1. Migración 000_extensions.sql que habilite pgtap y pgcrypto.
2. Un archivo supabase/tests/00_smoke.test.sql que verifique que los tres esquemas
   core, gmp y comercial existen, usando plan() y finish() de pgTAP.
3. Script npm `db:test` que corra `supabase test db`.
4. Documentá en docs/TESTING.md por qué las pruebas pgTAP son la evidencia de
   calificación operacional (OQ) del sistema y no meras pruebas de desarrollo: cada
   regla de negocio implementada en la base necesita al menos una prueba que demuestre
   que se cumple y una que demuestre que el incumplimiento se rechaza.
```

---

## Fase 1 — Núcleo de cumplimiento

Es la fase más importante del proyecto. Todo lo demás se apoya acá. No la apures.

### Prompt 1.1 — Esquemas e identidad

```
Fase 1, parte 1: esquemas e identidad.

Creá una migración que:

1. Cree los esquemas core, gmp y comercial, con COMMENT ON SCHEMA explicando el rol de
   cada uno y la regla de dependencia comercial -> gmp -> core.

2. Cree en core los tipos rol_enum y sector_enum del Anexo A del documento de alcance.

3. Cree core.usuarios según §4.1 del documento, con estas correcciones respecto del
   documento:
   - la tabla vive en core, no en gmp
   - agregá `roles_adicionales rol_enum[] NOT NULL DEFAULT '{}'` (ya está en el doc)
   - agregá CHECK que impida que rol y roles_adicionales se solapen

4. Cree funciones de sesión en core, todas STABLE y SECURITY DEFINER donde corresponda:
   - core.auth_uid() -> uuid, envuelve auth.uid()
   - core.usuario_id() -> uuid, resuelve el id de core.usuarios del usuario de sesión
   - core.rol() -> rol_enum, lee el rol desde el claim del JWT
   - core.tiene_rol(rol_enum) -> boolean, contempla rol principal y adicionales
   - core.es_dt_titular() -> boolean

   IMPORTANTE: core.rol() debe leer el claim del JWT, no consultar core.usuarios. Si
   consulta la tabla desde una política de esa misma tabla, se produce recursión
   infinita. Explicame en un comentario en el archivo por qué.

5. Implementá el custom access token hook de Supabase Auth como función
   core.custom_access_token(event jsonb) returns jsonb, que agregue al JWT los claims
   `rol`, `roles_adicionales`, `usuario_id` y `es_dt_titular`. Registralo en
   supabase/config.toml. Documentá en un comentario que un cambio de rol no surte
   efecto hasta la renovación del token, y que por eso una baja de usuario debe además
   revocar sesiones.

6. RLS sobre core.usuarios: ENABLE y FORCE. Políticas:
   - SELECT: cualquier usuario autenticado (la trazabilidad exige poder resolver quién
     firmó qué)
   - INSERT y UPDATE: solo ADMINISTRADOR_SISTEMA
   - DELETE: ninguna política, para nadie (RN-49)

7. Pruebas pgTAP: que el DELETE sobre core.usuarios falle para todos los roles, que un
   OPERARIO no pueda insertar un usuario, que core.tiene_rol resuelva bien los roles
   adicionales.
```

### Prompt 1.2 — Auditoría

```
Fase 1, parte 2: auditoría append-only. Esta es la pieza que sostiene el valor
probatorio de todo el sistema.

1. Creá core.auditoria según §4.11 del documento, en el esquema core.

2. Creá una función de trigger genérica core.fn_auditar() que registre INSERT, UPDATE y
   DELETE de cualquier tabla usando to_jsonb(OLD) y to_jsonb(NEW), capturando además
   usuario_id, auth_uid, ip y user_agent desde los headers de la petición
   (current_setting('request.headers', true)). Debe funcionar sin configuración por
   tabla.

3. Creá un procedimiento core.adjuntar_auditoria(schema text, tabla text) que instale el
   trigger, y una función core.tablas_sin_auditoria() que devuelva las tablas de negocio
   de gmp y comercial que no lo tienen. Esa función es la base de una prueba pgTAP que
   debe fallar si alguien agrega una tabla y olvida el trigger.

4. Blindaje de core.auditoria:
   - ENABLE y FORCE ROW LEVEL SECURITY
   - política de SELECT solo para ADMINISTRADOR_SISTEMA y DIRECCION_TECNICA
   - ninguna política de INSERT, UPDATE ni DELETE
   - REVOKE UPDATE, DELETE, TRUNCATE ON core.auditoria FROM PUBLIC, anon, authenticated
   - la escritura entra por la función de trigger, que es SECURITY DEFINER

5. Documentá en docs/ADR/001-auditoria-inalterable.md el razonamiento del §3.5 del
   documento de alcance: si existe una credencial capaz de alterar la auditoría, ningún
   registro del sistema prueba nada. Incluí la advertencia de que la clave service_role
   de Supabase tiene BYPASSRLS y por lo tanto su uso queda restringido a migraciones,
   con la lista de mitigaciones adoptadas.

6. Pruebas pgTAP: que UPDATE y DELETE sobre core.auditoria fallen incluso para
   ADMINISTRADOR_SISTEMA; que un INSERT en una tabla con trigger genere exactamente una
   fila de auditoría con datos_despues no nulo; que core.tablas_sin_auditoria() devuelva
   conjunto vacío.
```

### Prompt 1.3 — Firma electrónica

```
Fase 1, parte 3: firma electrónica según §8.2 del documento de alcance.

1. Creá core.firmas con: id, tabla, registro_id, tipo_firma (enum REALIZO, CONTROLO,
   APROBO, LIBERO, REVISO), firmante_id, momento, hash, version_algoritmo_hash,
   y motivo opcional.

2. Creá core.hash_firma(p_tabla text, p_registro_id uuid, p_campos jsonb,
   p_firmante uuid, p_tipo tipo_firma_enum, p_momento timestamptz) returns text.

   Requisito clave: la serialización debe ser reproducible fuera de Postgres. Un
   inspector tiene que poder recalcular el hash con un script de Python a partir de los
   datos exportados. No dependas de la representación textual de jsonb: construí el
   string canónico explícitamente, con claves ordenadas alfabéticamente, separadores
   fijos, números en notación decimal sin ceros a la derecha superfluos, timestamps en
   ISO 8601 UTC, y nulos como cadena vacía. Documentá el formato exacto en
   docs/FORMATO_HASH.md y versionalo: el campo version_algoritmo_hash guarda 'v1'.

3. Creá core.fn_bloquear_registro_firmado(), función de trigger BEFORE UPDATE OR DELETE
   reutilizable que levante excepción si el registro tiene firma asociada. (RN-23)

4. Escribí también un script scripts/verificar_hash.py que reproduzca el cálculo, y una
   prueba que compare el resultado de Postgres con el de Python sobre el mismo dato.
   Esa equivalencia es la evidencia de que la firma es verificable de forma independiente.

5. Pruebas pgTAP: que el hash sea estable ante reordenamiento de claves del jsonb de
   entrada; que un UPDATE sobre un registro firmado falle; que dos firmas del mismo
   registro por distinta persona con distinto tipo_firma convivan.
```

### Prompt 1.4 — Separación de funciones configurable

```
Fase 1, parte 4: implementá el mecanismo de separación de funciones descrito en §3.4
del documento de alcance.

Contexto: los POE exigen doble firma (realizó / controló) en cada etapa productiva, pero
la dotación de la planta no alcanza para cumplirla en todos los flujos. La decisión
tomada es hacerla configurable por tipo de registro con tres modos.

1. Creá core.config_separacion_funciones con: entidad (text), modo (enum OBLIGATORIA,
   ADVERTENCIA_REGISTRADA, NO_APLICA), vigencia_desde, definido_por, motivo.
   Solo DIRECCION_TECNICA puede escribir en esta tabla.

2. Creá core.validar_separacion(p_entidad text, p_realizo uuid, p_controlo uuid)
   returns text, que devuelva 'OK', 'ADVERTENCIA' o levante excepción según el modo
   vigente. Cuando devuelva 'ADVERTENCIA' debe escribir en core.auditoria una entrada de
   operacion = 'DESVIO_SEPARACION_FUNCIONES' con el detalle de las dos personas.

3. Valor por defecto para toda entidad nueva: ADVERTENCIA_REGISTRADA.

4. Documentá en docs/ADR/002-separacion-funciones.md el razonamiento: bloquear duro un
   flujo que la planta no puede cumplir lleva a que el operario busque la vuelta, que es
   peor que registrar el desvío. El sistema conoce la regla, la aplica donde puede y deja
   huella donde no.

5. Pruebas pgTAP de los tres modos.
```

### Prompt 1.5 — Test de arquitectura

```
Fase 1, parte 5: escribí una prueba pgTAP que consulte pg_constraint y pg_class para
verificar que ninguna tabla del esquema gmp tiene clave foránea contra una tabla del
esquema comercial, y que ninguna tabla de core tiene clave foránea contra gmp o
comercial. La dirección de dependencia permitida es comercial -> gmp -> core.

Esta prueba debe correr en CI y bloquear el merge si falla. Es la garantía mecánica de
que el alcance de validación del dominio regulado no se contamina con el comercial.
```

---

## Fase 2 — Maestros

### Prompt 2.1

```
Fase 2: tablas maestras del dominio regulado, en el esquema gmp.

Implementá según §4.1, §4.2 y §4.7 del documento de alcance:
gmp.depositos, gmp.proveedores, gmp.insumos_catalogo, gmp.productos,
gmp.presentaciones, gmp.procedimientos, gmp.equipos.

Requisitos transversales para todas:
- ENABLE y FORCE ROW LEVEL SECURITY
- trigger de auditoría adjunto vía core.adjuntar_auditoria
- políticas RLS derivadas de la matriz de permisos de §3.3
- COMMENT ON TABLE y COMMENT ON COLUMN citando el POE de origen de cada campo

Detalles que no están en el documento y hay que resolver:
- gmp.depositos debe precargarse con los diez depósitos identificados en §4.1 mediante
  una migración de datos semilla separada de la de estructura.
- gmp.insumos_catalogo.deposito_cuarentena_id debe forzarse al depósito exterior cuando
  es_inflamable es true (RN-48). Implementalo como trigger, no como CHECK, porque
  requiere consultar depositos.
- gmp.equipos: agregá un CHECK que impida marcar requiere_calibracion sin
  proxima_calibracion. Y una función gmp.equipo_calibracion_vigente(uuid) returns
  boolean, que la fase 4 va a usar para la advertencia de §7.4.

Pruebas pgTAP para RN-48 y para las políticas RLS de cada tabla: verificá que un
OPERARIO no pueda dar de alta un proveedor y que solo DIRECCION_TECNICA pueda aprobarlo.
```

### Prompt 2.2

```
Fase 2, parte 2: capa de acceso del frontend y primeras pantallas.

1. Cliente Supabase tipado en src/lib/supabase.ts, con los tipos generados.
2. Hook useUsuarioActual que exponga el usuario, su rol y sus roles adicionales leídos
   del JWT, más un helper tieneRol(rol) y puede(operacion) basado en la matriz de §3.3.
   La matriz vive en un solo archivo, src/lib/permisos.ts, derivada de la tabla del
   documento. La interfaz oculta lo que el usuario no puede hacer, pero la autoridad
   sigue siendo RLS: nunca confíes en el chequeo del cliente.
3. Layout con navegación lateral que muestre solo los módulos accesibles al rol.
4. ABM completo de gmp.proveedores y gmp.insumos_catalogo, con formularios
   react-hook-form + zod y tablas con TanStack Query.
5. Pantalla de administración de usuarios, accesible solo a ADMINISTRADOR_SISTEMA, con
   baja lógica (nunca DELETE).

Seguí la guía de estilo visual: interfaz densa en información, pensada para uso en
planta con guantes y en tablet. Áreas de toque grandes, contraste alto, nada de
animaciones decorativas.
```

---

## Fase 3 — Recepción, rótulos, muestreo

### Prompt 3.1

```
Fase 3, parte 1: recepción de insumos y máquina de estados del lote.

Implementá gmp.recepciones y gmp.lotes_insumo según §4.3, y la máquina de estados de
§5.1 con sus cinco transiciones y precondiciones.

Reglas de negocio a implementar con su cita en comentario:
RN-01 protocolo de análisis obligatorio para materia prima
RN-02 bulto disparejo obliga a contar unidades
RN-03 pesada de pigmentos en recepción
RN-44 conteo de etiquetas por planchas (columna generada)
RN-47 checklist de traslado de inflamables

Implementá la máquina de estados como función gmp.transicionar_lote_insumo(
p_lote uuid, p_nuevo_estado estado_calidad_enum) que valide la precondición
correspondiente y levante excepción con mensaje claro si no se cumple. Prohibí el UPDATE
directo de la columna estado mediante trigger: el único camino es la función.

Nota de diseño de §2.4 que debe respetarse desde ahora: la recepción física y la
recepción fiscal son eventos distintos. Los campos numero_ap_factura, metodo_pago y
monto quedan en gmp.recepciones por compatibilidad con el formulario actual, pero
marcalos con COMMENT como extensión de negocio sin efecto regulatorio, y dejá previsto
que la fase 10 los va a migrar a un registro separado en comercial.

Pruebas pgTAP de cada transición: la válida y al menos un intento inválido por cada una.
```

### Prompt 3.2

```
Fase 3, parte 2: rótulos.

Implementá gmp.rotulos según §4.4, con el jsonb de contenido por formato de rótulo.

RN-04: el color se deriva del estado de forma determinista. Cuarentena amarillo, en
análisis gris, aprobado verde, rechazado rojo. Implementalo como función inmutable y
columna generada, no como valor cargado por el usuario.

RN-05: un rótulo nunca se modifica. Trigger BEFORE UPDATE que rechaza, y ausencia de
política de UPDATE. El cambio de estado emite un rótulo nuevo y marca el anterior
vigente = false, todo en la misma transacción.

Atención a la inconsistencia 1 de §10 del documento: I.20.1 dice rojo para cuarentena y
I.20.2 dice amarillo. Prevalece I.20.2. Dejá un comentario en el código citando esa
resolución, porque alguien va a preguntar.

Componente de impresión de rótulos en React: una plantilla por tipo de registro
(R.20.2.1, R.20.2.2, R.50.4.1, R.40.16.1, R.60.12.1, R.60.4.2), con los campos exactos
listados en §4.4, salida a impresora de etiquetas vía CSS @page con tamaño configurable.
Incluí un código QR con el id del rótulo para escanear desde el depósito.
```

### Prompt 3.3

```
Fase 3, parte 3: muestreo.

Implementá gmp.muestreos según §4.5 y las reglas RN-07 a RN-12.

RN-08 y RN-09: el cálculo del tamaño de muestra depende de la categoría. 5% para
material de envase y empaque, un tubo de ensayo para materia prima y granel, 30 gr para
producto terminado, y la cantidad de envases según presentación (6 para 5gr, 2 para
14gr, 1 para 45gr). Implementalo como función gmp.calcular_tamano_muestra() que precarga
el valor, editable con justificación obligatoria si el usuario lo cambia.

RN-10: las cinco verificaciones previas son NOT NULL. La interfaz las presenta como
bloqueo: no se habilita el botón de registrar hasta que las cinco estén respondidas.

RN-12: el muestreo de granel se toma inmediatamente finalizada la elaboración. Como
"inmediatamente" no tiene definición numérica en el POE, implementá una advertencia
registrada si pasan más de N minutos, con N configurable y valor inicial 60, y dejá
anotado en docs/DECISIONES_ABIERTAS.md que ese número necesita confirmación de la
Dirección Técnica.

RN-07: la etiqueta R.50.4.1 se emite automáticamente en la misma transacción del
muestreo. Si falla la emisión del rótulo, falla el muestreo entero.
```

---

## Cómo seguir

Cuando termines la fase 3 y tengas las respuestas a las decisiones abiertas de §9.2,
pedime los prompts de la fase siguiente. Los de las fases 4 a 6 dependen de dos
definiciones que hoy no están: la regla de formación del número de lote (POE I.40.25,
ausente) y la resolución de la inconsistencia 12, que define si el veredicto de calidad
lo escribe Control de Calidad o Dirección Técnica.

Mientras tanto, tres trámites que no dependen del código y tienen plazo propio:

1. Emitir PG.60.1 v03 con el organigrama real de 11 personas. Es bloqueante para la
   puesta en producción, porque la matriz de permisos deriva de él.
2. Localizar los POE faltantes de §9.1, en especial I.40.25 y I.20.3.
3. Iniciar el trámite del certificado fiscal y el alta de puntos de venta ante ARCA. El
   documento recomienda arrancarlo en la fase 10, no en la 12.
