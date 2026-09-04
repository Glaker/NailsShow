# Edge Functions

Reservado para las Edge Functions (Deno). Según CLAUDE.md §2, se usan sólo para
integración fiscal y tareas programadas.

Regla de privilegios (CLAUDE.md §5): cada función reenvía el `Authorization` del
usuario y crea su cliente con ese token, de modo que corre como `authenticated`
y respeta RLS. Para lo que necesita privilegio sin usuario detrás (cierre
automático de reclamos por RN-37, solicitud de CAE) se usan roles de base
dedicados **sin BYPASSRLS**, con `GRANT EXECUTE` acotado a la función que
necesitan.

Vacío por ahora.
