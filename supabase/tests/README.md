# Pruebas de la base

## Lo que tiene que haber acá, eventualmente: pgTAP

Las pruebas pgTAP no son pruebas de desarrollo: son la **evidencia de
calificación operacional (OQ)** del sistema bajo GAMP 5 categoría 5
(CLAUDE.md §2).

Cada regla de negocio implementada en la base necesita al menos dos pruebas:
una que demuestre que la regla se cumple, y una que demuestre que el
incumplimiento se rechaza. La segunda es la que un inspector pide ver.

**Siguen pendientes.** `npm run db:test` no corre: `supabase test db` solo
apunta a `127.0.0.1` y pide Docker.

## Lo que hay hoy y sí corre

Dos scripts que levantan un PostgreSQL descartable, reproducen todas las
migraciones desde cero y ejercen las reglas de negocio con sesiones de usuario
reales.

```bash
bash supabase/tests/reconstruir.sh    # clúster nuevo + todas las migraciones
bash supabase/tests/verificacion.sh   # las pruebas
```

## Por qué existe esto

Este proyecto trabaja directo contra el Supabase alojado y no tiene `db reset`.
`supabase db reset`, `db diff` y `test db` piden Docker, que en la máquina de
desarrollo no hay. Sin esto, la única forma de saber si una migración aplica es
aplicarla en producción, que es exactamente lo que el control de cambios de
GAMP 5 no quiere.

`initdb` sí está disponible, así que el clúster se levanta a mano en un
directorio temporal, con un andamio mínimo que imita lo que Supabase provee
(el esquema `auth`, los roles `authenticated` y compañía). Nada de esto toca el
proyecto alojado.

Esto **no reemplaza a pgTAP**: cubre el mismo terreno con el mismo criterio
—una prueba por regla y otra por su rechazo— pero hoy corre, que es la
diferencia entre tener una verificación y tener una intención.

## Cómo están escritas las pruebas

Cada prueba abre una sesión con el rol que corresponde —`public.sesion()` fija
los claims que inyecta el hook de access token y `set role authenticated` pone
el rol de base— de modo que RLS, triggers y políticas actúan igual que en
producción. Aproximadamente la mitad verifica un **rechazo**: en un sistema
regulado, lo que hay que probar no es que el registro se guarde, sino que el
que no corresponde no se guarde.

Las aserciones usan `public.verdad(<condición>, '<mensaje>')` y no el idiom
`case when <cond> then 1 else 1/0 end`. Ese idiom no funciona: cuando la
condición es una subconsulta, el planificador no la pliega pero sí evalúa el
`1/0` de la rama no tomada, y la prueba falla siempre.

## Trampas que estos scripts ya sortean

- **No se puede limpiar la base entre corridas.** El trigger de auditoría
  prohíbe `DELETE` en toda tabla de negocio, incluso al superusuario. Por eso
  `reconstruir.sh` tira el clúster entero en vez de borrar filas.
- **La carga de proveedores atribuye las filas a una cuenta concreta** del
  proyecto alojado. El script la siembra antes de esa migración.
- **`public.sesion()` declara `record` y no `core.usuarios%rowtype`**, porque
  el andamio se aplica antes que las migraciones y el `%rowtype` se resuelve al
  crear la función.
