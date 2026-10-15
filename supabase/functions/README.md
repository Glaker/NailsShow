# Edge Functions

Reservado para las Edge Functions (Deno). Según CLAUDE.md §2, se usan sólo para
integración fiscal y tareas programadas.

Regla de privilegios (CLAUDE.md §5): cada función reenvía el `Authorization` del
usuario y crea su cliente con ese token, de modo que corre como `authenticated`
y respeta RLS. Para lo que necesita privilegio sin usuario detrás (cierre
automático de reclamos por RN-37, solicitud de CAE) se usan roles de base
dedicados **sin BYPASSRLS**, con `GRANT EXECUTE` acotado a la función que
necesitan.

| Función | Qué hace | Secretos |
| --- | --- | --- |
| `emitir-factura` | factura y nota de crédito electrónica ARCA | `AFIP_SDK_ACCESS_TOKEN`, `AFIP_CERT*`, `AFIP_KEY*` |
| `series-oficiales` | trae A3500 (BCRA) e IPC (INDEC) | — |
| `giorgio` | asistente de ayuda (D-57), responde en streaming | `ANTHROPIC_API_KEY`; opcional `GIORGIO_MODELO` (por defecto `claude-haiku-5-5`) |

La lógica pura de cada una vive en `_shared/` y se prueba con Vitest
(`npm test`), sin Deno ni red.

`giorgio/catalogo.json` es generado: lo reescribe `src/app/giorgio/catalogo.test.ts`
cuando cambia el menú o la ayuda. Si la prueba falla con «estaba
desactualizado», revisar el diff y commitearlo.
