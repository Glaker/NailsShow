import { useMemo, useState } from 'react';
import {
  Alert,
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
import { IconAlertTriangle, IconCalculator, IconFlask } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { TarjetaIndicador } from '@/components/TarjetaIndicador';
import { Vacio } from '@/components/Vacio';
import {
  useFormulaCompleta,
  useFormulasFabricacion,
  type EstadoDocumento,
  type FormulaComponenteRow,
  type FormulaFabricacionRow,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';
import { BadgeEstadoFormula } from './estadoFormula';
import { calcularLote, type Formula } from './calculoLote';

type TipoObjetivo = 'volumen' | 'masa';

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
      densidad: c.densidad
        ? {
            densidadRef: c.densidad.densidad_ref,
            tempRefC: c.densidad.temp_ref_c,
            betaK: c.densidad.beta_k,
            fuente: c.densidad.fuente,
          }
        : null,
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

  const formulaCompleta = useFormulaCompleta(formulaId ?? undefined);
  const formulaSeleccionada = (formulas.data ?? []).find((f) => f.id === formulaId) ?? null;

  const objetivo = useMemo(() => {
    if (tipoObjetivo === 'volumen') {
      return typeof volumenL === 'number' && volumenL > 0 ? { volumenL } : null;
    }
    return typeof masaKg === 'number' && masaKg > 0 ? { masaKg } : null;
  }, [tipoObjetivo, volumenL, masaKg]);

  const resultado = useMemo(() => {
    if (!formulaCompleta.data || !objetivo || typeof tempC !== 'number') return null;
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
              Todavía no se cargó ninguna fórmula de fabricación. La calculadora va a andar en
              cuanto Dirección Técnica emita la primera.
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
              decimalScale={1}
              hideControls
              value={tempC}
              onChange={(v) => setTempC(typeof v === 'number' ? v : '')}
            />
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
                    <Table.Th ta="right">Densidad aplicada</Table.Th>
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
                          {r.densidadAplicada === null ? '—' : numero(r.densidadAplicada, 5)}
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

          {formulaSeleccionada?.estado !== 'VIGENTE' ? (
            <Alert color="estadoEnAnalisis" variant="light" radius="md">
              Esta fórmula está en estado <b>{formulaSeleccionada?.estado}</b>, no vigente. Sirve
              como vista previa; no se pesa un lote real con una fórmula que no está vigente.
            </Alert>
          ) : null}
        </Stack>
      ) : null}
    </>
  );
}
