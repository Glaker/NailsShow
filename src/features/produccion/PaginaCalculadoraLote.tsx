import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Anchor,
  Group,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalculator,
  IconFlask,
  IconTemperature,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import {
  useFormulaCompleta,
  useFormulasFabricacion,
  useModeloMezcla,
  type EstadoDocumento,
  type DensidadReferenciaRow,
  type FormulaComponenteRow,
  type FormulaFabricacionRow,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';
import {
  OFFSET_INTERIOR_C,
  TEMP_MAX_C,
  TEMP_MIN_C,
  UBICACION_PLANTA,
  useClimaPlanta,
} from '@/lib/clima';
import { BadgeEstadoFormula } from './estadoFormula';
import { PanelProcedimiento } from './PanelProcedimiento';
import {
  calcularLote,
  type Densidad,
  type Formula,
  type ParVolumenExceso,
} from './calculoLote';

/** Lo que trae useModeloMezcla(): pares y composición de las mezclas. */
interface ModeloMezcla {
  pares: ParVolumenExceso[];
  composicion: Map<string, { constituyente: DensidadReferenciaRow; fraccion: number }[]>;
}

type TipoObjetivo = 'volumen' | 'masa';

/**
 * Densidad de la base a la forma que pide `calcularLote`.
 *
 * Los coeficientes se arman solo si hay `a0`: una fila sin ajuste es una
 * densidad que entró por certificado o medición propia y se evalúa con el
 * modelo lineal. Los nulos del medio se completan con cero, que es lo que vale
 * un término ausente del polinomio.
 */
function densidadParaCalculo(d: DensidadReferenciaRow, modelo?: ModeloMezcla): Densidad {
  const composicion = modelo?.composicion.get(d.id);
  return {
    id: d.id,
    nombre: d.nombre,
    masaMolar:
      d.masa_molar === null || d.masa_molar === undefined ? null : Number(d.masa_molar),
    composicion: composicion
      ? composicion.map((c) => ({
          constituyente: densidadParaCalculo(c.constituyente),
          fraccion: c.fraccion,
        }))
      : null,
    densidadRef: d.densidad_ref,
    tempRefC: d.temp_ref_c,
    betaK: d.beta_k,
    coeficientes:
      d.a0 === null ? null : [d.a0, d.a1 ?? 0, d.a2 ?? 0, d.a3 ?? 0, d.a4 ?? 0],
    validoDesdeC: d.valido_desde_c,
    validoHastaC: d.valido_hasta_c,
    fuente: d.fuente,
  };
}

function densidadDeComponente(c: FormulaComponenteRow, modelo?: ModeloMezcla) {
  const d = c.densidad ?? c.insumo?.densidad_defecto ?? null;
  return {
    densidad: d ? densidadParaCalculo(d, modelo) : null,
    densidadNombre: d?.nombre ?? null,
    densidadOrigen: c.densidad ? ('formula' as const) : d ? ('insumo' as const) : null,
  };
}

/** Traduce las filas de la base a la forma que pide `calcularLote`. */
function formulaParaCalculo(
  datos: {
    formula: FormulaFabricacionRow;
    componentes: FormulaComponenteRow[];
  },
  modelo?: ModeloMezcla,
): Formula {
  return {
    pares: modelo?.pares ?? [],
    densidadProducto: datos.formula.densidad_producto,
    densidadTempC: datos.formula.densidad_temp_c ?? 20,
    rendimiento: datos.formula.rendimiento,
    componentes: datos.componentes.map((c) => ({
      orden: c.orden,
      componente: c.insumo?.nombre ?? c.nombre_libre ?? '(sin nombre)',
      codigoInterno: c.insumo?.codigo_interno ?? null,
      porcentajePP: c.porcentaje_pp,
      esCsp: c.es_csp,
      seMideAVolumen: c.se_mide_a_volumen,
      etapa: c.etapa,
      // La densidad elegida en la fórmula manda; si no hay, la del insumo
      // (gmp.insumos_catalogo.densidad_referencia_id). Mismo criterio que
      // gmp.calcular_lote().
      ...densidadDeComponente(c, modelo),
    })),
  };
}

/**
 * Calculadora de lote: vista previa de `calculoLote.ts`, la misma aritmética
 * que `gmp.calcular_lote()` en la base.
 */
/**
 * Avisos que no cambian lo que se pesa o se mide: la pantalla es para
 * Producción, que necesita la cantidad de cada cosa y nada más (codirector
 * técnico, 2026-09-25). `calcularLote` los sigue devolviendo para quien los
 * necesite.
 */
const AVISO_NO_OPERATIVO = /no son aditivos|contracción|masa molar|modelo de mezcla/i;

/** Masa o volumen en la unidad que se lee en una balanza o una probeta. */
function cantidadLegible(r: {
  masaKg: number;
  volumenL: number | null;
  seMideAVolumen: boolean;
}) {
  if (r.seMideAVolumen && r.volumenL !== null) {
    return r.volumenL < 1
      ? { verbo: 'Medir', valor: `${numero(r.volumenL * 1000, 0)} mL` }
      : { verbo: 'Medir', valor: `${numero(r.volumenL, 3)} L` };
  }
  return r.masaKg < 1
    ? { verbo: 'Pesar', valor: `${numero(r.masaKg * 1000, 1)} g` }
    : { verbo: 'Pesar', valor: `${numero(r.masaKg, 3)} kg` };
}

export function PaginaCalculadoraLote() {
  const formulas = useFormulasFabricacion();
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [tipoObjetivo, setTipoObjetivo] = useState<TipoObjetivo>('volumen');
  const [volumenL, setVolumenL] = useState<number | ''>('');
  const [masaKg, setMasaKg] = useState<number | ''>('');
  const [tempC, setTempC] = useState<number | ''>(20);
  /** Densidad del granel escrita a mano. Null = la de por defecto. */
  const [densidadEditada, setDensidadEditada] = useState<number | '' | null>(null);

  /**
   * La sugerencia meteorológica se aplica una sola vez, al llegar. Después el
   * valor es del usuario: que el refresco de los 15 minutos le pise la
   * temperatura que acaba de escribir sería peor que no tener la sugerencia.
   */
  const clima = useClimaPlanta();
  const climaAplicado = useRef(false);
  useEffect(() => {
    if (climaAplicado.current || !clima.data) return;
    climaAplicado.current = true;
    setTempC(clima.data.sugeridaC);
  }, [clima.data]);

  const formulaCompleta = useFormulaCompleta(formulaId ?? undefined);
  const modelo = useModeloMezcla();
  const formulaSeleccionada =
    (formulas.data ?? []).find((f) => f.id === formulaId) ?? null;

  const tempFueraDeRango =
    typeof tempC === 'number' && (tempC < TEMP_MIN_C || tempC > TEMP_MAX_C);

  const objetivo = useMemo(() => {
    if (tipoObjetivo === 'volumen') {
      return typeof volumenL === 'number' && volumenL > 0 ? { volumenL } : null;
    }
    return typeof masaKg === 'number' && masaKg > 0 ? { masaKg } : null;
  }, [tipoObjetivo, volumenL, masaKg]);

  const formula = useMemo(
    () =>
      formulaCompleta.data ? formulaParaCalculo(formulaCompleta.data, modelo.data) : null,
    [formulaCompleta.data, modelo.data],
  );

  // Densidad del granel por defecto: la medida si se cargó en la fórmula; si
  // no, la del modelo de mezcla a la temperatura de trabajo (R-07).
  const densidadModelo = useMemo(() => {
    if (!formula || typeof tempC !== 'number' || tempFueraDeRango) return null;
    try {
      return (
        calcularLote({ ...formula, densidadProducto: null }, { masaKg: 1 }, tempC).mezcla
          ?.densidadReal ?? null
      );
    } catch {
      return null;
    }
  }, [formula, tempC, tempFueraDeRango]);
  const densidadMedida = formula?.densidadProducto ?? null;
  const densidadDefecto = densidadMedida ?? densidadModelo;
  const densidadUsada =
    densidadEditada === null
      ? densidadDefecto
      : densidadEditada === ''
        ? null
        : densidadEditada;

  const resultado = useMemo(() => {
    if (!formula || !objetivo || typeof tempC !== 'number') return null;
    // Fuera del rango operativo no se calcula: devolver una tabla con cinco
    // decimales para una temperatura imposible es peor que no devolver nada.
    if (tempC < TEMP_MIN_C || tempC > TEMP_MAX_C) return null;
    try {
      return {
        ok: true as const,
        valor: calcularLote(
          { ...formula, densidadProducto: densidadUsada },
          objetivo,
          tempC,
        ),
      };
    } catch (e) {
      return { ok: false as const, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }, [formula, objetivo, tempC, densidadUsada]);

  return (
    <>
      <EncabezadoPagina
        titulo="Calculadora de lote"
        descripcion="Cuánto pesar o medir de cada componente para el lote."
      />

      <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Stack gap="md">
          <Select
            label="Fórmula"
            withAsterisk
            placeholder={
              formulas.isLoading
                ? 'Cargando fórmulas…'
                : (formulas.data ?? []).length === 0
                  ? 'No hay fórmulas cargadas todavía'
                  : 'Elegí una fórmula'
            }
            disabled={formulas.isLoading || (formulas.data ?? []).length === 0}
            searchable
            nothingFoundMessage="No hay fórmulas con ese nombre"
            data={(formulas.data ?? []).map((f) => ({
              value: f.id,
              label: `${f.producto?.nombre ?? '(producto sin nombre)'}${f.variedad ? ` — ${f.variedad}` : ''} · v${f.version}`,
              estado: f.estado,
            }))}
            renderOption={({ option }) => {
              const estado = (option as { estado?: EstadoDocumento }).estado;
              return (
                <Group justify="space-between" wrap="nowrap" gap="sm" w="100%">
                  <Text size="sm" truncate>
                    {option.label}
                  </Text>
                  {estado ? <BadgeEstadoFormula estado={estado} /> : null}
                </Group>
              );
            }}
            value={formulaId}
            onChange={(v) => {
              setFormulaId(v);
              setDensidadEditada(null);
            }}
          />

          {formulas.isLoading ? null : (formulas.data ?? []).length === 0 ? (
            <Text size="sm" c="dimmed">
              Todavía no se cargó ninguna fórmula de fabricación. La calculadora va a
              andar en cuanto Dirección Técnica emita la primera.
            </Text>
          ) : null}

          <Group grow align="flex-start" wrap="wrap">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Objetivo del lote
              </Text>
              <SegmentedControl
                fullWidth
                value={tipoObjetivo}
                onChange={(v) => setTipoObjetivo(v as TipoObjetivo)}
                data={[
                  { label: 'Por volumen', value: 'volumen' },
                  { label: 'Por masa', value: 'masa' },
                ]}
              />
            </Stack>

            {tipoObjetivo === 'volumen' ? (
              <NumberInput
                label="Volumen objetivo (L)"
                withAsterisk
                min={0}
                decimalScale={2}
                hideControls
                value={volumenL}
                onChange={(v) => setVolumenL(typeof v === 'number' ? v : '')}
              />
            ) : (
              <NumberInput
                label="Masa objetivo (kg)"
                withAsterisk
                min={0}
                decimalScale={3}
                hideControls
                value={masaKg}
                onChange={(v) => setMasaKg(typeof v === 'number' ? v : '')}
              />
            )}

            <NumberInput
              label="Temperatura de trabajo (°C)"
              withAsterisk
              min={TEMP_MIN_C}
              max={TEMP_MAX_C}
              clampBehavior="strict"
              decimalScale={1}
              hideControls
              description={`Entre ${TEMP_MIN_C} y ${TEMP_MAX_C} °C`}
              error={tempFueraDeRango ? `Fuera del rango operativo` : null}
              value={tempC}
              onChange={(v) => setTempC(typeof v === 'number' ? v : '')}
            />

            {tipoObjetivo === 'volumen' && formula ? (
              <NumberInput
                label="Densidad del granel (g/mL)"
                min={0}
                decimalScale={4}
                hideControls
                description={
                  densidadEditada !== null ? (
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      onClick={() => setDensidadEditada(null)}
                    >
                      Volver a la {densidadMedida !== null ? 'medida' : 'del modelo'}
                    </Anchor>
                  ) : densidadMedida !== null ? (
                    'Medida (cargada en la fórmula)'
                  ) : densidadModelo !== null ? (
                    'Del modelo de mezcla'
                  ) : (
                    'Sin estimar: cargala'
                  )
                }
                value={densidadUsada ?? ''}
                onChange={(v) => setDensidadEditada(typeof v === 'number' ? v : '')}
              />
            ) : null}
          </Group>

          {/*
            De dónde salió la temperatura. La sugerencia es una estimación, así
            que la pantalla lo dice en vez de presentarla como una medición.
          */}
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconTemperature
              size={16}
              style={{ marginTop: 2, flexShrink: 0 }}
              color="var(--mantine-color-dimmed)"
            />
            <Text size="xs" c="dimmed">
              {clima.isLoading ? (
                `Consultando la temperatura en ${UBICACION_PLANTA.nombre}…`
              ) : clima.data ? (
                <>
                  Sugerido a partir de {numero(clima.data.exteriorC, 1)} °C en{' '}
                  {UBICACION_PLANTA.nombre} (
                  {clima.data.medidaEn.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  ) más {OFFSET_INTERIOR_C} °C de interior.{' '}
                  {clima.data.acotada ? 'Acotado al rango operativo. ' : ''}
                  Para fabricar, la temperatura se mide.
                </>
              ) : (
                <>
                  No se pudo consultar la temperatura exterior. Cargala a mano.{' '}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => void clima.refetch()}
                  >
                    Reintentar
                  </Anchor>
                </>
              )}
            </Text>
          </Group>
        </Stack>
      </Paper>

      {!formulaId ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconFlask}
            titulo="Elegí una fórmula"
            descripcion="La calculadora dice cuánto pesar o medir de cada componente."
          />
        </Paper>
      ) : formulaCompleta.isLoading ? (
        <Skeleton h={240} />
      ) : !objetivo ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconCalculator}
            titulo="Indicá el objetivo del lote"
            descripcion="Cargá el volumen o la masa que se quiere producir."
          />
        </Paper>
      ) : tempFueraDeRango ? (
        <Alert
          color="estadoRechazado"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
        >
          La temperatura de trabajo tiene que estar entre {TEMP_MIN_C} y {TEMP_MAX_C} °C.
        </Alert>
      ) : resultado && !resultado.ok ? (
        <Alert
          color="estadoRechazado"
          variant="light"
          radius="md"
          icon={<IconAlertTriangle size={18} />}
        >
          {resultado.mensaje}
        </Alert>
      ) : resultado && resultado.ok ? (
        <Stack gap="md">
          <Group grow wrap="wrap">
            <TarjetaIndicador
              etiqueta="Masa total del lote"
              valor={`${numero(resultado.valor.masaTotalKg, 3)} kg`}
              icono={IconCalculator}
            />
            {resultado.valor.volumenObjetivoL !== null ? (
              <TarjetaIndicador
                etiqueta="Volumen del lote"
                valor={`${numero(resultado.valor.volumenObjetivoL, 1)} L`}
                icono={IconFlask}
              />
            ) : null}
          </Group>

          {resultado.valor.avisos
            .filter((a) => !AVISO_NO_OPERATIVO.test(a))
            .map((aviso, i) => (
              <Alert
                key={i}
                color="estadoEnAnalisis"
                variant="light"
                radius="md"
                icon={<IconAlertTriangle size={18} />}
              >
                {aviso}
              </Alert>
            ))}

          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={520}>
              <Table verticalSpacing="md" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Componente</Table.Th>
                    <Table.Th ta="right">% P/P</Table.Th>
                    <Table.Th ta="right">Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resultado.valor.renglones.map((r) => {
                    const c = cantidadLegible(r);
                    return (
                      <Table.Tr key={r.orden}>
                        <Table.Td>
                          <Text size="md" fw={600}>
                            {r.componente}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {[r.codigoInterno, r.etapa].filter(Boolean).join(' · ')}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" ff="monospace" c="dimmed">
                            {numero(r.porcentajePP, 2)} %
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="xs" c="dimmed" fw={600}>
                            {c.verbo}
                          </Text>
                          <Text fz={22} ff="monospace" fw={800} lh={1.1}>
                            {c.valor}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>

          {/* Cómo se hace el lote: el procedimiento vigente de la fórmula. */}
          {formulaId ? <PanelProcedimiento formulaId={formulaId} /> : null}

          {formulaSeleccionada?.estado !== 'VIGENTE' ? (
            <Alert color="estadoEnAnalisis" variant="light" radius="md">
              Esta fórmula está en estado <b>{formulaSeleccionada?.estado}</b>, no
              vigente. Sirve como vista previa; no se pesa un lote real con una fórmula
              que no está vigente.
            </Alert>
          ) : null}
        </Stack>
      ) : null}
    </>
  );
}
