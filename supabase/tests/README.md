# Pruebas pgTAP

Estas pruebas no son pruebas de desarrollo: son la **evidencia de calificación
operacional (OQ)** del sistema bajo GAMP 5 categoría 5 (CLAUDE.md §2).

Cada regla de negocio implementada en la base necesita al menos dos pruebas:
una que demuestre que la regla se cumple, y una que demuestre que el
incumplimiento se rechaza. La segunda es la que un inspector pide ver.

Se corren con `npm run db:test`. Vacío por ahora: el andamiaje de pruebas se
arma en el prompt 0.2 y las primeras pruebas de dominio llegan con la fase 1.
