#!/usr/bin/env python3
"""
Genera la migración que carga la tabla de densidades ρ(T) desde
`Densidades_liquidos_0-45C.xlsx`.

POR QUÉ UN POLINOMIO Y NO EL beta QUE YA HABÍA.
`gmp.densidades_referencia` modelaba la densidad como
`rho_ref * (1 - beta * (T - T_ref))`: una recta. La planilla de origen trae, para
cada compuesto, un ajuste de grado 4 válido de 0 a 45 °C junto con el residuo
máximo del ajuste, la incertidumbre estimada y la fuente citada. Guardar eso
como una pendiente sería tirar el dato y quedarse con la aproximación.

El beta se conserva: hay densidades que van a seguir entrando por certificado de
proveedor o medición propia, con un solo punto y a lo sumo un coeficiente de
expansión. La tabla soporta las dos formas y la función de evaluación elige.

Uso:
    python scripts/densidades/generar_migracion.py "<ruta al .xlsx>"
"""

import hashlib
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("Falta openpyxl. Instalalo con: pip install openpyxl")

AQUI = Path(__file__).resolve().parent
MIGRACIONES = AQUI.parent.parent / "supabase" / "migrations"
TIMESTAMP = "20260922210000"
SALIDA = MIGRACIONES / f"{TIMESTAMP}_gmp_densidades_polinomicas.sql"

HOJA = "Coeficientes"
# Índices de columna en la hoja Coeficientes.
CATEGORIA, COMPUESTO, CAS, FORMULA, MM, T_FUSION, METODO = 0, 1, 2, 3, 4, 5, 6
A0, A1, A2, A3, A4 = 7, 8, 9, 10, 11
RESIDUO, RHO15, RHO20, RHO25, ALFA20 = 12, 13, 14, 15, 16
RANGO, INCERT, FUENTE, NOTAS = 17, 18, 19, 20


# Separador de los renglones del VALUES. Va como variable y no inline en la
# f-string: una barra invertida dentro de una f-string no se interpreta como
# escape, así que `",\n"` escrito ahí adentro genera dos caracteres literales y
# deja el SQL en una sola línea inválida.
SEPARADOR = ",\n"


def lit(v) -> str:
    """Literal SQL. None -> null; el resto va entre comillas simples escapadas."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return "null"
    return "'" + str(v).strip().replace("'", "''") + "'"


def num(v) -> str:
    if v is None or not isinstance(v, (int, float)):
        return "null"
    return repr(float(v))


def calidad_de(metodo: str | None) -> str:
    """Primer token de «A+ · EOS de referencia» -> 'A+'."""
    if not metodo:
        return "null"
    return lit(str(metodo).split("·")[0].strip())


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(f"Uso: python {Path(__file__).name} \"<ruta al .xlsx>\"")
    ruta = Path(sys.argv[1])
    if not ruta.is_file():
        sys.exit(f"No existe el archivo: {ruta}")

    sha = hashlib.sha256(ruta.read_bytes()).hexdigest()
    wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    filas = [r for r in wb[HOJA].iter_rows(min_row=2, values_only=True) if r[COMPUESTO]]

    valores = []
    for r in filas:
        valores.append(
            "  ("
            + ", ".join(
                [
                    lit(r[COMPUESTO]),
                    lit(r[CATEGORIA]),
                    lit(r[CAS]),
                    lit(r[FORMULA]),
                    num(r[MM]),
                    num(r[T_FUSION]),
                    num(r[A0]),
                    num(r[A1]),
                    num(r[A2]),
                    num(r[A3]),
                    num(r[A4]),
                    num(r[RESIDUO]),
                    num(r[RHO20]),
                    calidad_de(r[METODO]),
                    lit(r[METODO]),
                    lit(r[INCERT]),
                    lit(r[FUENTE]),
                    lit(r[RANGO]),
                    lit(r[NOTAS]),
                ]
            )
            + ")"
        )

    sql = f"""-- ---------------------------------------------------------------------------
-- Propósito : Reemplazar el modelo lineal de densidad por el ajuste polinómico
--             de grado 4 válido de 0 a 45 °C, y cargar los {len(filas)} compuestos de
--             la tabla de referencia. Agrega gmp.densidad_a(), que es de ahora
--             en más la única autoridad sobre «cuánto pesa un litro de esto a
--             esta temperatura».
-- Reglas    : PG.60.8 (fórmula maestra y hoja de pesada). RN-01: el dato de
--             literatura no sirve para fabricar, y por eso los {len(filas)} entran con
--             fuente LITERATURA.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- QUÉ CAMBIA Y POR QUÉ.
-- La tabla modelaba la densidad como `densidad_ref * (1 - beta_k * (T - T_ref))`:
-- una recta trazada desde un punto. Sirve cerca de la referencia y se desvía
-- lejos. La tabla de origen trae para cada compuesto un ajuste
--
--     rho(T) = a0 + a1·T + a2·T² + a3·T³ + a4·T⁴        (T en °C, rho en g/cm³)
--
-- con el residuo máximo del ajuste, la incertidumbre estimada y la fuente
-- citada. Guardar eso como una pendiente sería tirar el dato.
--
-- EL beta NO SE BORRA. Una densidad que entra por certificado de lote o por
-- medición propia va a seguir teniendo un punto y, con suerte, un coeficiente
-- de expansión. `gmp.densidad_a()` usa el polinomio cuando está y cae al
-- modelo lineal cuando no, así que las dos formas conviven sin que quien
-- calcula tenga que saber cuál le tocó.
--
-- POR QUÉ LOS {len(filas)} ENTRAN COMO `LITERATURA`.
-- Son correlaciones publicadas y ajustes a datos de literatura, no mediciones
-- de los lotes que se van a usar. La calculadora ya marca con una advertencia
-- todo componente cuya densidad sea de literatura, y la hoja de pesada exige
-- reemplazarla por la del certificado o por una medición propia. Cargarlos como
-- FARMACOPEA o MEDICION_PROPIA silenciaría esa advertencia, que es justamente
-- el control que hace falta.
--
-- Archivo de origen: {ruta.name}
-- sha256: {sha}

-- ---------------------------------------------------------------------------
-- 1. Columnas del ajuste polinómico
-- ---------------------------------------------------------------------------

alter table gmp.densidades_referencia
  add column if not exists cas             text,
  add column if not exists formula_quimica text,
  add column if not exists masa_molar      numeric(9,3),
  add column if not exists temp_fusion_c   numeric(6,2),
  add column if not exists categoria       text,
  -- Coeficientes del polinomio. `double precision` y no `numeric`: a4 anda en
  -- el orden de 1e-10 y lo que importa es el rango del exponente, no los
  -- decimales exactos de cada coeficiente.
  add column if not exists a0 double precision,
  add column if not exists a1 double precision,
  add column if not exists a2 double precision,
  add column if not exists a3 double precision,
  add column if not exists a4 double precision,
  add column if not exists residuo_max     double precision,
  add column if not exists valido_desde_c  numeric(5,2) not null default 0,
  add column if not exists valido_hasta_c  numeric(5,2) not null default 45,
  add column if not exists calidad         text,
  add column if not exists metodo          text,
  add column if not exists incertidumbre   text,
  add column if not exists referencia      text,
  add column if not exists rango_datos     text,
  add column if not exists notas           text;

-- densidad_ref pasa a ser opcional: un compuesto descripto por el polinomio no
-- necesita un punto de referencia suelto. Se exige que haya una cosa o la otra.
alter table gmp.densidades_referencia
  alter column densidad_ref drop not null;

alter table gmp.densidades_referencia
  drop constraint if exists densidad_tiene_modelo;
alter table gmp.densidades_referencia
  add constraint densidad_tiene_modelo check (
    densidad_ref is not null or a0 is not null
  );

alter table gmp.densidades_referencia
  drop constraint if exists densidad_rango_valido;
alter table gmp.densidades_referencia
  add constraint densidad_rango_valido check (valido_desde_c < valido_hasta_c);

comment on column gmp.densidades_referencia.a0 is
  'Coeficiente independiente de rho(T) = a0 + a1*T + a2*T^2 + a3*T^3 + a4*T^4, T en grados Celsius, rho en g/cm3.';
comment on column gmp.densidades_referencia.calidad is
  'Grado del dato de origen: A+ (ecuacion de estado de referencia), A (correlacion publicada), B (ajuste a datos experimentales), C (punto de referencia mas pendiente estimada).';
comment on constraint densidad_tiene_modelo on gmp.densidades_referencia is
  'Una densidad sirve si se puede evaluar: o trae polinomio, o trae un punto de referencia. Sin ninguno de los dos no es un dato.';

-- ---------------------------------------------------------------------------
-- 2. La autoridad sobre rho(T)
-- ---------------------------------------------------------------------------
--
-- Fuera del rango de validez NO extrapola: un polinomio de grado 4 ajustado
-- entre 0 y 45 °C se dispara apenas se sale, y devolver un número que parece
-- una densidad es peor que no devolver nada. El que llama decide qué hacer con
-- el error; la funcion no inventa.

create or replace function gmp.densidad_a(p_densidad_id uuid, p_temp_c numeric)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  d gmp.densidades_referencia%rowtype;
  t double precision := p_temp_c::double precision;
begin
  select * into d from gmp.densidades_referencia where id = p_densidad_id;
  if not found then
    raise exception 'No existe la densidad de referencia %.', p_densidad_id
      using errcode = 'no_data_found';
  end if;

  if p_temp_c < d.valido_desde_c or p_temp_c > d.valido_hasta_c then
    raise exception
      'La densidad de «%» esta definida entre % y % grados C; se pidio a %.',
      d.nombre, d.valido_desde_c, d.valido_hasta_c, p_temp_c
      using errcode = 'check_violation';
  end if;

  if d.a0 is not null then
    return (
      d.a0
      + coalesce(d.a1, 0) * t
      + coalesce(d.a2, 0) * t * t
      + coalesce(d.a3, 0) * t * t * t
      + coalesce(d.a4, 0) * t * t * t * t
    )::numeric;
  end if;

  -- Sin polinomio: el modelo lineal de siempre, para las densidades que entran
  -- por certificado de lote o medicion propia.
  return (
    d.densidad_ref * (1 - coalesce(d.beta_k, 0) * (p_temp_c - d.temp_ref_c))
  )::numeric;
end;
$$;

comment on function gmp.densidad_a is
  'Densidad en g/cm3 de una referencia a una temperatura. Usa el polinomio si esta cargado y el modelo lineal si no. No extrapola fuera del rango de validez.';

-- ---------------------------------------------------------------------------
-- 3. Carga de los {len(filas)} compuestos
-- ---------------------------------------------------------------------------
--
-- `nombre` no era unico: la tabla solo tenia un indice unico sobre insumo_id.
-- Se agrega, porque el nombre del compuesto es de hecho su identidad en esta
-- tabla y porque el upsert de abajo lo necesita: asi, corregir un coeficiente
-- manana es volver a pasar por aca y no crear una segunda fila que compita con
-- la primera.

create unique index if not exists densidades_nombre_idx
  on gmp.densidades_referencia (nombre);

-- SOBRE LAS 10 DENSIDADES QUE YA ESTABAN (seed de 20260917110000).
-- Cinco coinciden exactamente de nombre con las nuevas —Acetona, Glicerina,
-- Propilenglicol, Acetato de etilo y Metacrilato de etilo (EMA)— y el upsert
-- las completa con el polinomio, sin tocarles la densidad_ref que ya tenian.
--
-- Las otras cinco quedan como estaban, con modelo lineal, y conviven con una
-- entrada nueva parecida:
--
--   'Agua desionizada'   junto a  'Agua'
--   'Etanol absoluto'    junto a  'Etanol'
--   'Isopropanol'        junto a  '2-Propanol (IPA)'
--   'Acetato de butilo'  junto a  'Acetato de n-butilo'
--   'Etanol 96 GL'       — esta NO tiene equivalente: es una mezcla al 96 %,
--                          no etanol puro, y su densidad no es la del etanol.
--
-- No se desactiva ninguna. Cual de las dos entradas corresponde usar en cada
-- formula es una decision de quien escribe la formula, no de esta migracion, y
-- desactivar una densidad a la que una formula ya apunta la dejaria sin dato.
-- Queda para consolidar cuando Direccion Tecnica revise el listado.

insert into gmp.densidades_referencia
  (nombre, categoria, cas, formula_quimica, masa_molar, temp_fusion_c,
   a0, a1, a2, a3, a4, residuo_max, densidad_ref, calidad, metodo,
   incertidumbre, referencia, rango_datos, notas,
   temp_ref_c, fuente, valido_desde_c, valido_hasta_c, activo)
select
  v.nombre, v.categoria, v.cas, v.formula_quimica, v.masa_molar, v.temp_fusion_c,
  v.a0, v.a1, v.a2, v.a3, v.a4, v.residuo_max, v.rho20, v.calidad, v.metodo,
  v.incertidumbre, v.referencia, v.rango_datos, v.notas,
  20, 'LITERATURA', 0, 45, true
from (values
{SEPARADOR.join(valores)}
) as v(nombre, categoria, cas, formula_quimica, masa_molar, temp_fusion_c,
       a0, a1, a2, a3, a4, residuo_max, rho20, calidad, metodo,
       incertidumbre, referencia, rango_datos, notas)
on conflict (nombre) do update set
  categoria       = excluded.categoria,
  cas             = excluded.cas,
  formula_quimica = excluded.formula_quimica,
  masa_molar      = excluded.masa_molar,
  temp_fusion_c   = excluded.temp_fusion_c,
  a0              = excluded.a0,
  a1              = excluded.a1,
  a2              = excluded.a2,
  a3              = excluded.a3,
  a4              = excluded.a4,
  residuo_max     = excluded.residuo_max,
  calidad         = excluded.calidad,
  metodo          = excluded.metodo,
  incertidumbre   = excluded.incertidumbre,
  referencia      = excluded.referencia,
  rango_datos     = excluded.rango_datos,
  notas           = excluded.notas;

-- ---------------------------------------------------------------------------
-- 4. Verificacion
-- ---------------------------------------------------------------------------
--
-- Dos puntos conocidos contra la tabla de origen. Si un coeficiente se cargo
-- mal, esto lo detecta ahora y no el dia que alguien pese un lote.

do $$
declare
  v_agua   numeric;
  v_etanol numeric;
  v_faltan integer;
begin
  select count(*) into v_faltan
    from gmp.densidades_referencia
   where a0 is not null and (a1 is null or valido_hasta_c <> 45);
  if v_faltan > 0 then
    raise exception 'Quedaron % densidades polinomicas mal formadas.', v_faltan
      using errcode = 'check_violation';
  end if;

  select gmp.densidad_a(id, 20) into v_agua
    from gmp.densidades_referencia where nombre = 'Agua';
  if abs(v_agua - 0.998207710028212) > 1e-9 then
    raise exception 'Agua a 20 C dio % y deberia dar 0.998207710028212.', v_agua
      using errcode = 'check_violation';
  end if;

  select gmp.densidad_a(id, 20) into v_etanol
    from gmp.densidades_referencia where nombre = 'Etanol';
  if abs(v_etanol - 0.789421841747386) > 1e-9 then
    raise exception 'Etanol a 20 C dio % y deberia dar 0.789421841747386.', v_etanol
      using errcode = 'check_violation';
  end if;
end;
$$;
"""

    SALIDA.write_text(sql, encoding="utf-8")
    print(f"  origen    : {ruta.name}")
    print(f"  sha256    : {sha}")
    print(f"  compuestos: {len(filas)}")
    print(f"  escrito   : supabase/migrations/{SALIDA.name}")


if __name__ == "__main__":
    main()
