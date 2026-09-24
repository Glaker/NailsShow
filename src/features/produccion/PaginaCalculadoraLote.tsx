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
  Tooltip,
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
import { calcularLote, type Densidad, type Formula } from './calculoLote';

type TipoObjetivo = 'volumen' | 'masa';

/**
 * Densidad de la base a la forma que pide `calcularLote`.
 *
 * Los coeficientes se arman solo si hay `a0`: una fila sin ajuste es una
 * densidad que entró por certificado o medición propia y se evalúa con el
 * modelo lineal. Los nulos del medio se completan con cero, que es lo que vale
 * un término ausente del polinomio.
 */
function densidadParaCalculo(d: DensidadReferenciaRow): Densidad {
  return {
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

function densidadDeComponente(c: FormulaComponenteRow) {
  const d = c.densidad ?? c.insumo?.densidad_defecto ?? null;
  return {
    densidad: d ? densidadParaCalculo(d) : null,
    densidadNombre: d?.nombre ?? null,
    densidadOrigen: c.densidad ? ('formula' as const) : d ? ('insumo' as const) : null,
  };
}

/** Traduce las filas de la base a la forma que pide `calcularLote`. */
function formulaParaCalculo(datos: {
  formula: FormulaFabricacionRow;
  componentes: FormulaComponenteRow[];
}): Formula {
  return {
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
      ...densidadDeComponente(c),
    })),
  };
}

/**
 * Calculadora de lote: vista previa de `calculoLote.ts`.
 *
 * La autoridad sigue siendo `gmp.calcular_lote()` en la base, la que emite la
 * hoja de pesada real. Esta pantalla corre la misma aritmética del lado del
 * cliente para responder mientras el usuario mueve la temperatura o el
 * volumen objetivo, sin ida y vuelta al servidor por cada cambio.
 */
export function PaginaCalculadoraLote() {
  const formulas = useFormulasFabricacion();
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [tipoObjetivo, setTipoObjetivo] = useState<TipoObjetivo>('volumen');
  const [volumenL, setVolumenL] = useState<number | ''>('');
  const [masaKg, setMasaKg] = useState<number | ''>('');
  const [tempC, setTempC] = useState<number | ''>(20);

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

  const resultado = useMemo(() => {
    if (!formulaCompleta.data || !objetivo || typeof tempC !== 'number') return null;
    // Fuera del rango operativo no se calcula. La corrección de densidad es una
    // linealización de primer orden (ver `densidadA`): devolver una tabla con
    // cinco decimales para una temperatura imposible es peor que no devolver
    // nada, porque parece un resultado.
    if (tempC < TEMP_MIN_C || tempC > TEMP_MAX_C) return null;
    try {
      const formula = formulaParaCalculo(formulaCompleta.data);
      return { ok: true as const, valor: calcularLote(formula, objetivo, tempC) };
    } catch (e) {
      return { ok: false as const, mensaje: e instanceof Error ? e.message : String(e) };
    }
  }, [formulaCompleta.data, objetivo, tempC]);

  return (
    <>
      <EncabezadoPagina
        titulo="Calculadora de lote"
        descripcion="Explota una fórmula de fabricación en masa y volumen por componente. Vista previa: la hoja de pesada la emite la base (PG.60.8)."
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
            onChange={setFormulaId}
          />

          {formulas.isLoading ? null : (formulas.data ?? []).length === 0 ? (
            <Text size="sm" c="dimmed">
              Todavía no se cargó ninguna fórmula de fabricación. La calculadora va a
              andar en cuanto Dirección Técnica emita la primera.
            </Text>
          ) : null}

          <Group grow align="flex-end" wrap="wrap">
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
          </Group>

          {/*
            De dónde salió el número. La sugerencia es una estimación —dato de
            una estación que no está en la planta, más un offset que nadie
            calibró—, así que la pantalla lo dice en vez de presentarla como
            una medición. Para fabricar, la temperatura se mide.
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
                  Es una estimación: para emitir una hoja de pesada, la temperatura se
                  mide con el instrumento calibrado.
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
            descripcion="La calculadora explota la fórmula de fabricación vigente o en desarrollo en masa y volumen por componente."
          />
        </Paper>
      ) : formulaCompleta.isLoading ? (
        <Skeleton h={240} />
      ) : !objetivo ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconCalculator}
            titulo="Indicá el objetivo del lote"
            descripcion="Cargá el volumen o la masa que se quiere producir para ver el desglose por componente."
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
          La corrección de densidad es una linealización válida cerca de la temperatura de
          referencia; fuera de ese rango el número dejaría de significar algo.
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
              etiqueta="Masa total"
              valor={`${numero(resultado.valor.masaTotalKg, 3)} kg`}
              icono={IconCalculator}
            />
            {resultado.valor.volumenObjetivoL !== null ? (
              <TarjetaIndicador
                etiqueta="Volumen objetivo"
                valor={`${numero(resultado.valor.volumenObjetivoL, 1)} L`}
                icono={IconFlask}
              />
            ) : null}
            <TarjetaIndicador
              etiqueta="Suma de volúmenes medidos"
              valor={`${numero(resultado.valor.sumaVolumenesL, 3)} L`}
              icono={IconFlask}
              detalle="Informativo: los volúmenes no son aditivos, la masa sí."
            />
          </Group>

          {resultado.valor.avisos.length > 0 ? (
            <Stack gap="xs">
              {resultado.valor.avisos.map((aviso, i) => (
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
            </Stack>
          ) : null}

          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Componente</Table.Th>
                    <Table.Th ta="right">% P/P</Table.Th>
                    <Table.Th ta="right">Masa (kg)</Table.Th>
                    <Table.Th ta="right">Volumen (L)</Table.Th>
                    <Table.Th ta="right">Densidad aplicada (g/mL)</Table.Th>
                    <Table.Th>Se carga</Table.Th>
                    <Table.Th>Etapa</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {resultado.valor.renglones.map((r) => (
                    <Table.Tr key={r.orden}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={600}>
                            {r.componente}
                          </Text>
                          {r.densidadNoVerificada ? (
                            <Tooltip
                              label="Densidad de literatura, no verificada. Para fabricar, reemplazarla por la del certificado o por una medición propia."
                              multiline
                              w={280}
                            >
                              <IconAlertTriangle
                                size={15}
                                color="var(--mantine-color-estadoEnAnalisis-7)"
                              />
                            </Tooltip>
                          ) : null}
                        </Group>
                        {r.codigoInterno ? (
                          <Text size="xs" c="dimmed">
                            {r.codigoInterno}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace">
                          {numero(r.porcentajePP, 4)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" fw={600}>
                          {numero(r.masaKg, 4)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace">
                          {r.volumenL === null ? '—' : numero(r.volumenL, 4)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" ff="monospace" c="dimmed">
                          {r.densidadAplicada === null
                            ? '—'
                            : numero(r.densidadAplicada, 5)}
                        </Text>
                        {r.densidadNombre ? (
                          <Text size="xs" c="dimmed">
                            {r.densidadNombre}
                            {r.densidadOrigen === 'insumo' ? ' · del insumo' : ''}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {r.seMideAVolumen ? 'A volumen' : 'Pesado'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {r.etapa ?? '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
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
