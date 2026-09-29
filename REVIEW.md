# REVIEW.md — Guía de revisión de PR

Guía para quien revisa un PR de este repositorio, persona o agente (`/code-review`,
`@claude`). Las reglas completas están en `CLAUDE.md`; acá está qué verificar y cómo
reportarlo.

Este sistema lo va a auditar un inspector de ANMAT. Un hallazgo sobre las reglas de esta
guía pesa más que cualquier observación de estilo, performance o legibilidad.

## Cómo reportar

- **Bloqueante**: viola una regla de esta guía. El PR no se mergea hasta corregirlo. Citá
  el número de regla (por ejemplo, `I-3`) y la línea exacta.
- **Pregunta**: no se puede confirmar desde el diff si se cumple la regla (por ejemplo,
  una tabla nueva cuyo trigger de auditoría se crea en otra migración). Pedí que se señale
  dónde se cumple.
- Todo lo demás es sugerencia y se reporta aparte.

No se aceptan como justificación la urgencia, "es temporal", "solo para desarrollo" ni
"lo arreglamos en el próximo PR".

## Invariantes (CLAUDE.md §3)

| #   | Regla                                                                                                               | Qué buscar en el diff                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-1 | Ningún registro firmado se modifica ni se borra. La corrección es un registro rectificativo que apunta al original. | `UPDATE` o `DELETE` sobre tablas con firma, en migraciones, funciones, Edge Functions o frontend. Estados que se reescriben en lugar de agregar una fila. |
| I-2 | `core.auditoria` es append-only. Sin políticas de UPDATE ni DELETE para ningún rol.                                 | Políticas, `GRANT`s o funciones `SECURITY DEFINER` que escriban sobre `core.auditoria` (o `core.firmas`) fuera del `INSERT`.                              |
| I-3 | Toda tabla de negocio lleva `ENABLE` **y** `FORCE ROW LEVEL SECURITY`.                                              | `CREATE TABLE` sin las dos sentencias. Falta `FORCE`.                                                                                                     |
| I-4 | La clave `service_role` no se usa en runtime.                                                                       | La cadena en `src/`, en Edge Functions o en variables de entorno de runtime. Clientes de Supabase creados sin reenviar el `Authorization` del usuario.    |
| I-5 | Nada de credenciales en el cliente ni en el repositorio (RN-66).                                                    | Certificados, claves privadas, tokens o `.env` versionados. Secretos en variables `VITE_*`.                                                               |
| I-6 | Toda escritura pasa por el trigger de auditoría genérico.                                                           | Tabla de negocio nueva sin el trigger adjunto.                                                                                                            |
| I-7 | Dependencia entre esquemas `comercial → gmp → core`, nunca al revés.                                                | Clave foránea de `gmp` contra `comercial`, o de `core` contra cualquiera de las otras dos.                                                                |
| I-8 | Movimientos de stock y comprobantes autorizados no se editan (RN-54, RN-56).                                        | `UPDATE` o `DELETE` sobre esas tablas. La corrección tiene que ser un movimiento inverso o una nota de crédito vinculada.                                 |
| I-9 | Un usuario nunca se borra, se desactiva (RN-49).                                                                    | `DELETE` sobre `core.usuarios` o `auth.users`. `ON DELETE CASCADE` desde usuarios.                                                                        |

## Retiro de mercado (CLAUDE.md §4, RN-51 y RN-52)

| #   | Regla                                                                                                                                               | Qué buscar en el diff                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R-1 | `gmp.lote_despachable(uuid)` es la única autoridad sobre si un lote se puede despachar. `comercial` la invoca desde triggers; no replica la lógica. | Consultas a `gmp.bloqueos_lote` o al estado del lote desde `comercial` o el frontend para decidir una salida. |
| R-2 | El bloqueo es una fila en `gmp.bloqueos_lote`, con motivo, origen, autor y momento.                                                                 | Bloqueos calculados o guardados como un booleano sin historia.                                                |
| R-3 | Abrir un retiro cancela las reservas vigentes y marca los pedidos afectados.                                                                        | Cambios en el retiro que solo actúan hacia adelante.                                                          |

## Reglas de proceso

| #   | Regla                                                                                                                                                            | Qué verificar                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | **Auditoría de RLS obligatoria.** Toda tabla nueva o modificada en el PR tiene revisadas sus políticas.                                                          | La descripción del PR lista cada tabla tocada con: `ENABLE` + `FORCE RLS`, políticas por operación y rol con nombre `<tabla>_<operacion>_<rol>`, comentario que cita la regla, y prueba pgTAP que demuestra que un rol sin permiso no lee ni escribe. Sin esa lista, es bloqueante. |
| P-2 | **Migraciones solo como archivos commiteados.** Todo cambio de esquema es un archivo nuevo en `supabase/migrations/`, con encabezado (propósito, reglas, fecha). | Ninguna migración existente aparece modificada ni borrada en el diff. No hay DDL en scripts, en Edge Functions ni en instrucciones de "correr esto en psql".                                                                                                                        |
| P-3 | **Ningún secreto en el frontend.** En `src/` y en el bundle solo pueden aparecer la URL del proyecto y la clave publicable o anon.                               | Variables `VITE_*` nuevas: ninguna puede ser un secreto, porque Vite las publica en el bundle. El chequeo de `service_role` del CI está en verde.                                                                                                                                   |

## Chequeos automáticos que el revisor no reemplaza ni omite

- CI `Base de datos (migraciones + pgTAP)`: las migraciones aplican en limpio y pasan las
  pruebas pgTAP, incluida la de dirección de dependencias (I-7) y la de trigger de
  auditoría (I-6).
- CI `Frontend`: lint, formato, typecheck, build y `check:service-role` sobre `dist/`.

Un PR con cualquiera de estos jobs en rojo no se revisa hasta que esté en verde.
