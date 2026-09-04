# CLAUDE.md — Sistema de Trazabilidad Nail Show SRL

Reglas permanentes del repositorio. Leelo completo antes de cualquier tarea. Si una
instrucción contradice una invariante de la sección 3, **detenete y preguntá**; no la
implementes.

---

## 1. Qué es este sistema

Sistema electrónico de trazabilidad para un laboratorio cosmético habilitado por ANMAT
(Argentina). Reemplaza registros en papel de fabricación, control de calidad y liberación
de producto. Sujeto a Buenas Prácticas de Fabricación (Disposición ANMAT 6477/12) y
validable como software a medida bajo GAMP 5 categoría 5.

Consecuencia práctica: **un inspector va a auditar este código y esta base de datos.**
Todo registro debe poder demostrar quién lo escribió, cuándo, con qué valor anterior, y
que nadie pudo alterarlo después. Eso pesa más que la elegancia, la performance o la
comodidad de desarrollo.

El documento fuente de requisitos es `docs/ALCANCE_SISTEMA_TRAZABILIDAD.md`. Las reglas
de negocio están numeradas RN-01 a RN-70. Cuando implementes una, citá su identificador
en un comentario SQL o TSDoc.

## 2. Stack

| Capa            | Tecnología                        | Nota                                                             |
| --------------- | --------------------------------- | ---------------------------------------------------------------- |
| Base de datos   | PostgreSQL vía Supabase           | migraciones versionadas con Supabase CLI                         |
| Autenticación   | Supabase Auth                     | rol inyectado en el JWT por custom access token hook             |
| Backend         | PostgREST + Edge Functions (Deno) | Edge Functions solo para integración fiscal y tareas programadas |
| Frontend        | React 18 + TypeScript + Vite      |                                                                  |
| Estado servidor | TanStack Query                    |                                                                  |
| Formularios     | @mantine/form + zod (resolver)    |                                                                  |
| Estilos         | Mantine UI                        | tema propio en `src/app/theme.ts`                                |
| Hosting front   | Vercel                            |                                                                  |
| Tests de base   | pgTAP                             | son la evidencia de calificación operacional, no un lujo         |
| Tests front     | Vitest + Testing Library          |                                                                  |

## 3. Invariantes innegociables

No se negocian por conveniencia, urgencia ni pedido del usuario.

1. **Ningún registro firmado se modifica ni se borra.** Ni por la aplicación, ni por un
   administrador, ni por un script de migración de datos. La corrección se hace con un
   registro rectificativo que apunta al original.
2. **`core.auditoria` es append-only.** Sin políticas de UPDATE ni DELETE para ningún
   rol. Sin excepciones.
3. **Toda tabla de negocio lleva `ENABLE` y `FORCE ROW LEVEL SECURITY`.** El segundo es
   obligatorio: sin él, el dueño de la tabla ignora las políticas.
4. **La clave `service_role` no se usa en runtime.** Ver sección 5.
5. **Nada de credenciales en el cliente ni en el repositorio.** Certificados fiscales,
   claves privadas y secretos viven en el almacén de Supabase y se usan desde Edge
   Functions. (RN-66)
6. **Toda escritura pasa por el trigger de auditoría genérico.** Si creás una tabla de
   negocio y no le adjuntás el trigger, la tarea está incompleta. Hay un test que lo
   verifica.
7. **Dirección de dependencia entre esquemas: `comercial → gmp → core`.** Nunca al revés.
   Ninguna tabla de `gmp` puede tener clave foránea contra `comercial`, ninguna de `core`
   contra las otras dos. Hay un test sobre el catálogo que lo verifica y bloquea el merge.
8. **Los movimientos de stock y los comprobantes autorizados no se editan.** La
   corrección genera un movimiento inverso o una nota de crédito vinculada. (RN-54, RN-56)
9. **Un usuario nunca se borra, se desactiva.** (RN-49)

## 4. Reparto de responsabilidades entre esquemas

- `core`: identidad, auditoría, firma electrónica, funciones de sesión, configuración de
  separación de funciones. No depende de nadie.
- `gmp`: todo lo regulado por Buenas Prácticas. Depende solo de `core`.
- `comercial`: stock valorizado, facturación, cuentas corrientes, contabilidad. Puede
  depender de `gmp` y de `core`.

**Excepción importante.** Las reglas RN-51 (solo se vende stock de lotes liberados) y
RN-52 (un lote alcanzado por un retiro queda bloqueado de inmediato) parecen comerciales
pero son reguladas: constituyen la efectividad del retiro de mercado que exige la
Disposición ANMAT 1402/08. Por lo tanto:

- `gmp.bloqueos_lote` materializa el bloqueo, con motivo, origen, autor y momento. El
  bloqueo es una fila, no un cálculo: el inspector pregunta cuándo se bloqueó y quién lo
  hizo, no si está bloqueado ahora.
- `gmp.lote_despachable(uuid)` es la única autoridad sobre la pregunta. Es
  `SECURITY DEFINER` y propiedad de un rol que las migraciones de `comercial` no alteran.
- `comercial` consume esa función desde triggers sobre movimientos de salida y sobre
  reservas de pedido. No replica la lógica ni la evalúa por su cuenta.
- El trigger que abre un retiro debe además cancelar reservas vigentes y marcar pedidos
  afectados. Un bloqueo que solo actúa hacia adelante deja mercadería lista para salir.

## 5. Modelo de privilegios y el problema de `service_role`

La clave `service_role` de Supabase tiene `BYPASSRLS` y no se puede eliminar del proyecto.
El enfoque es de tres capas: prevenir donde se pueda, detectar lo demás.

**Prevención.**

- Las Edge Functions reenvían el `Authorization` del usuario y crean el cliente con ese
  token. Corren como `authenticated` y respetan RLS.
- Para lo que necesita privilegio sin usuario detrás (cierre automático de reclamos a los
  30 días por RN-37, solicitud de CAE), se crean roles de base dedicados sin `BYPASSRLS`,
  con `GRANT EXECUTE` solo sobre la función que necesitan y ningún `GRANT` sobre tablas.
  La Edge Function firma un JWT con `role: '<rol_dedicado>'` y PostgREST hace `SET ROLE`.
- `FORCE ROW LEVEL SECURITY` en todas las tablas, para cerrar el paso del dueño.
- La clave de servicio existe solo en migraciones y CI, nunca en variables de entorno de
  runtime.

**Detección.** `core.auditoria` incluye `db_role` (default `current_user`) y `db_session`
(default `session_user`). Toda escritura queda etiquetada con el rol de base que la
produjo. Una fila con `db_role = 'service_role'` es una anomalía por definición del
proyecto: la vista `core.escrituras_privilegiadas` las expone y una tarea diaria notifica
a la Dirección Técnica titular.

## 6. Convenciones

### Base de datos

- `snake_case`, tablas en plural, claves primarias `uuid` con `gen_random_uuid()` salvo
  donde el POE define un identificador de negocio.
- Todo campo `*_por` es `uuid REFERENCES core.usuarios(id)`.
- Toda migración es un archivo nuevo en `supabase/migrations/`. **Jamás edites una
  migración ya aplicada**: el control de cambios de GAMP 5 exige el historial completo.
- Encabezado obligatorio en cada migración: propósito, reglas de negocio que implementa,
  fecha.
- Políticas RLS nombradas `<tabla>_<operacion>_<rol>`, con comentario citando la regla.
- Preferí `CHECK` y triggers sobre validación en la aplicación. La aplicación puede
  duplicar la validación para dar buenos mensajes, pero la base es la autoridad.
- Columnas generadas: verificá el tipo de retorno de la expresión. `date + interval`
  devuelve `timestamp` y necesita cast explícito a `date`.

### Frontend

- Tipos generados con `supabase gen types typescript`. No escribas tipos de tablas a mano.
- Un esquema zod por formulario, derivado de las restricciones reales de la base.
- Los formularios usan `@mantine/form` con resolver de zod (`mantine-form-zod-resolver`),
  no `react-hook-form`.
- Nada de `localStorage` para datos de negocio.
- La interfaz oculta lo que el rol no puede hacer, pero la autoridad sigue siendo RLS.
  Nunca confíes en el chequeo del cliente.
- Textos en español rioplatense. Interfaz densa en información, pensada para uso en planta
  con guantes y en tablet: áreas de toque grandes, contraste alto, nada de animaciones
  decorativas.

### Git

- Una rama por fase, un PR por entregable. El mensaje de commit cita las reglas tocadas.

## 7. Qué no hacer

- No uses `sequence` de Postgres para numeración de comprobantes fiscales: las secuencias
  no son transaccionales y dejan huecos ante un rollback. Tabla de contadores con
  `SELECT ... FOR UPDATE` en la misma transacción. (RN-55)
- No consultes `core.usuarios` dentro de una política RLS de `core.usuarios`: recursión
  infinita. Leé el rol del JWT.
- No calcules el hash de firma sobre HTML renderizado ni sobre JSON serializado por
  JavaScript. Usá la función canónica de la base, que tiene equivalente en Python
  verificable de forma independiente.
- No repliques en `comercial` una regla que pertenece a `gmp`. Invocá la función.
- No agregues dependencias sin justificarlas en el PR. Cada dependencia es superficie de
  validación.
- No inventes reglas de negocio. Si el documento de alcance no lo cubre, marcalo como
  decisión abierta en `docs/DECISIONES_ABIERTAS.md` y preguntá.
