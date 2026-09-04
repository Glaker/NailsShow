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

Al 2026-09-04, **virgen**:

```
Esquemas:               auth  extensions  graphql  graphql_public  public  realtime  storage  vault
core / gmp / comercial: 0 de 3 (no existen)
Tablas en public:       0
Migraciones:            ninguna, ni local ni remota
```

Verificado disponible para la fase 1:

- `pgcrypto` 1.3 **instalada** — `gen_random_uuid()` funciona
- `uuid-ossp` 1.1 instalada
- **`pgtap` 1.3.3 disponible**, no instalada — se habilita por migración
- `auth.users` existe (35 columnas), lista para el FK de `core.usuarios`
- `ENABLE` + `FORCE ROW LEVEL SECURITY` probados contra esta base

---

## Qué se hizo

Solo la **fase 0**: andamiaje. Verificado con `lint`, `format:check`,
`typecheck`, `build`, `dev` y `check:service-role`, todos en verde.

Incluye estructura de carpetas, tema Mantine con los cuatro colores de estado de
rótulo de I.20.2 como colores nombrados, CI en dos jobs, y `.gitignore` que
excluye `.env` y `*.p12`/`*.pem`/`*.key`/`*.crt`.

**Cero base de datos.** Sin esquemas, tablas, RLS, funciones ni migraciones.

---

## Qué sigue: fase 1 recortada para el demo

1. Esquemas `core`, `gmp`, `comercial` + enums del Anexo A del documento de alcance
2. `core.usuarios` + custom access token hook que inyecta el rol en el JWT
3. Trigger genérico de auditoría: `core.fn_auditar` + `core.adjuntar_auditoria`
4. RLS sobre `core.usuarios`

Después: maestros (`depositos` con los diez de semilla, `proveedores`,
`insumos_catalogo`) y el vertical slice del demo:
**recepción → lote → rótulo de cuarentena amarillo con QR**.
Toca RN-01, RN-02, RN-04, RN-05, RN-44.

### Diferido, no descartado

- Firma electrónica con hash canónico + script de verificación en Python
- Separación de funciones configurable (§3.4 del alcance)
- Suite pgTAP completa

**Excepción a lo diferido.** La invariante 6 de `CLAUDE.md` afirma que existe un
test que verifica que ninguna tabla de negocio quedó sin trigger de auditoría.
Como pgTAP **sí** corre contra esta base, conviene no diferir ese test puntual:
`core.tablas_sin_auditoria()` más una prueba que exija conjunto vacío. Es una
prueba, y es la que sostiene una invariante que de otro modo queda escrita pero
sin verificar.

Lo mismo vale para la invariante 7: afirma que hay un test sobre el catálogo que
verifica la dirección `comercial → gmp → core` y bloquea el merge. Ese test
tampoco existe todavía. Son las dos invariantes que se declaran verificadas y no
lo están.

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
