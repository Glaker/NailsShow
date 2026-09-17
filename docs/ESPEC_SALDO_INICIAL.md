# Especificación: carga de saldo inicial de apertura

Documento para pasarle a Claude Code. Describe QUÉ hay que construir y POR QUÉ,
no el código exacto (eso lo resuelve Claude Code contra el schema real del repo).

---

## 1. Objetivo

Cargar el inventario histórico de Nail Show (planilla `05 INVENTARIO NAIL SHOW FABRICA`,
650 renglones) como **saldo inicial de apertura**, de forma que:

- Sea usable operativamente (la app muestra stock, se puede descontar).
- Quede **permanentemente distinguible** de los datos con trazabilidad completa.
- No genere registros de aprobación de calidad falsos.

## 2. Restricción regulatoria que define el diseño

Bajo ANMAT Disp. 6477/12 y BPF Mercosur, la aprobación de calidad es una propiedad
de un **lote identificado**, no de un ítem de catálogo. La planilla de origen no tiene
número de lote, fecha de vencimiento ni constancia de control.

Por lo tanto estos renglones **NO deben** recibir estado `APROBADO` ni generar filas
en la tabla `firmas`. Reciben un estado propio y terminal para migración.

## 3. Modelo de datos propuesto

### 3.1 Estado nuevo

Agregar al enum de estado de stock (o equivalente en el schema):

```
SALDO_APERTURA
```

Semántica: existencia física declarada al momento del corte, sin lote identificado
ni control de calidad asociado en el sistema. No es `APROBADO`, no es `CUARENTENA`.

### 3.2 Tabla de origen de migración

```sql
create table gmp.migracion_apertura (
  id                 uuid primary key default gen_random_uuid(),
  fecha_corte        date not null,              -- 2026-09-16
  archivo_origen     text not null,              -- nombre y hash del xlsx
  hash_archivo       text not null,              -- sha256, evidencia de integridad
  ejecutada_por      uuid not null references gmp.usuarios(id),
  ejecutada_en       timestamptz not null default now(),
  observaciones      text
);
```

Cada renglón de stock cargado referencia este registro. Así, una sola fila explica
el origen de los 650 movimientos, y queda el hash del archivo como evidencia de
cuál fue exactamente la planilla usada.

### 3.3 Movimientos, no contadores

El stock se modela como **libro de movimientos**, no como un número que se pisa.
Cada renglón de la planilla genera un movimiento de tipo `APERTURA`.

Motivo: el bug de stock negativo de HOLISSTOR viene de usar
`UPDATE stock SET cantidad = cantidad - n`, que en concurrencia produce race condition.
Con movimientos acumulativos + `SELECT ... FOR UPDATE` en la transacción de egreso,
el problema desaparece por construcción.

Además: agregar un `CHECK` a nivel de base que impida que el balance quede negativo.
La validación vive en Postgres, no en el código JS, por el mismo criterio ya adoptado
para las firmas (regla en el motor, no en la aplicación).

## 4. Datos de origen: hallazgos del análisis

Archivo CSV adjunto: `inventario_apertura.csv` (650 filas).

| Hallazgo | Cantidad | Implicancia |
|---|---|---|
| Renglones totales | 650 | |
| Sin cantidad declarada | 228 (35%) | Importar como 0 y marcar `cantidad_no_declarada = true` |
| Códigos duplicados | 9 códigos | `codigo` NO es clave única. Requiere resolución manual |
| Familia ETIQUETA | 249 | Material de acondicionamiento, categoría distinta a granel/PT |
| Con color de fila | 644 | Ver 4.1 |

### 4.1 Códigos de color (columna `color_origen` del CSV)

| Color | Filas | Con cantidad | Significado |
|---|---|---|---|
| VERDE | 289 | 186 | **A DEFINIR por el usuario** |
| AMARILLO | 273 | 168 | **A DEFINIR** |
| ROJO | 78 | 64 | **A DEFINIR** |
| VIOLETA | 3 | 3 | **A DEFINIR** |
| CELESTE | 1 | 0 | **A DEFINIR** |

El color NO correlaciona con tener cantidad (103 de 289 verdes están vacíos),
así que no significa "hay stock". Hasta que se defina, se importa como metadato
crudo en un campo `color_origen`, sin interpretarlo.

### 4.2 Códigos duplicados a resolver antes de importar

```
101ET   MONOMERO DE 100ml.  /  ETIQUETA MONOMERO DE 100ml.
105ET   PRIMER 10ml.  /  PRIMER 10ml. YA NO SE COMPRA
136PRE  MP NAIL PREP (ACETATO DE BUTILO)  /  ACETATO DE BUTILO
135GAT  GATILLOS VAPORIZADORES  (x3 filas)
391BOM  BOMBA SPRAY ROSA 24/410  (x2 idénticas)
131ENV  ENVASE TIPO GOTERO 30ml.  (x2 idénticas)
340AC   Aceite para torno (VASELINA)  (x2 idénticas)
511     nail tips clear natural coffin  (x2 idénticas)
550     9 filas distintas (mobiliario/POP) bajo un mismo código
```

Los duplicados idénticos probablemente sean error de carga y se consolidan sumando.
`550` no es un insumo, es una categoría de mobiliario: evaluar si entra al sistema GMP.

## 5. Reglas de visualización en la interfaz

1. Todo renglón en `SALDO_APERTURA` se muestra con un distintivo visual claro
   (badge, color de fila) y la leyenda: *"Saldo de apertura, sin lote identificado"*.
2. No puede ser seleccionado como insumo de una producción nueva sin una acción
   explícita del DT que lo reclasifique, dejando registro de esa decisión.
3. Un reporte de trazabilidad que toque un renglón de apertura debe advertirlo,
   nunca presentarlo como cadena completa.

## 6. Reversibilidad

La carga debe poder deshacerse en una sola operación:
`delete from movimientos where migracion_id = <id>`. Por eso todos los movimientos
llevan la FK a `migracion_apertura`. Si aparece el inventario real por lote, se borra
la apertura y se carga el bueno, sin arqueología.

## 7. Fuera de alcance de esta tarea

- No tocar la tabla `firmas`.
- No crear registros de control de calidad.
- No marcar nada como `APROBADO`.
