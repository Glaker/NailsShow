import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useCrearDensidadPropia, useDensidadesReferencia } from '@/lib/consultas';
import { numero } from '@/lib/formato';
import { useSesion } from '@/features/auth/sesion';

type Parte = { densidadId: string | null; pct: number | string };

/**
 * Alta de una densidad desde el componente de la fórmula: un valor que define
 * DT, o una mezcla de densidades ya cargadas por % en masa (pedido del
 * 2026-11-04). Devuelve el id para dejarla elegida.
 */
export function DensidadPropia({ onListo }: { onListo: (id: string) => void }) {
  const densidades = useDensidadesReferencia();
  const crear = useCrearDensidadPropia();
  const { claims } = useSesion();
  const [tipo, setTipo] = useState<'VALOR' | 'MEZCLA'>('VALOR');
  const [nombre, setNombre] = useState('');
  const [densidad, setDensidad] = useState<number | string>('');
  const [tempC, setTempC] = useState<number | string>(20);
  const [fuente, setFuente] = useState<'MEDICION_PROPIA' | 'CERTIFICADO_PROVEEDOR' | 'LITERATURA'>(
    'MEDICION_PROPIA',
  );
  const [documento, setDocumento] = useState('');
  const [partes, setPartes] = useState<Parte[]>([
    { densidadId: null, pct: '' },
    { densidadId: null, pct: '' },
  ]);

  const opciones = (densidades.data ?? []).map((d) => ({
    value: d.id,
    label: `${d.nombre} — ${numero(d.densidad_ref, 5)} g/mL`,
  }));
  const nombreDe = (id: string) => densidades.data?.find((d) => d.id === id)?.nombre ?? '';
  const suma = partes.reduce((a, p) => a + (Number(p.pct) || 0), 0);
  const ids = partes.map((p) => p.densidadId).filter(Boolean);

  const error =
    !nombre.trim()
      ? 'Poné un nombre.'
      : tipo === 'VALOR'
        ? !(Number(densidad) > 0)
          ? 'La densidad tiene que ser mayor que cero.'
          : fuente === 'CERTIFICADO_PROVEEDOR' && !documento.trim()
            ? 'Con certificado, indicá cuál.'
            : null
        : ids.length !== partes.length || partes.some((p) => !(Number(p.pct) > 0))
          ? 'Cada parte lleva su densidad y un % mayor que cero.'
          : new Set(ids).size !== ids.length
            ? 'Hay una densidad repetida.'
            : Math.abs(suma - 100) > 1e-6
              ? `Los % suman ${numero(suma, 4)}: tienen que sumar 100.`
              : null;

  const guardar = () =>
    crear.mutate(
      tipo === 'VALOR'
        ? { tipo, nombre, densidad: Number(densidad), tempC: Number(tempC), fuente, documento, usuarioId: claims?.usuario_id ?? null }
        : {
            tipo,
            nombre,
            partes: partes.map((p) => ({
              densidadId: p.densidadId!,
              nombre: nombreDe(p.densidadId!),
              pct: Number(p.pct),
            })),
          },
      { onSuccess: onListo },
    );

  return (
    <Stack>
      <SegmentedControl
        fullWidth
        value={tipo}
        onChange={(v) => setTipo(v as 'VALOR' | 'MEZCLA')}
        data={[
          { value: 'VALOR', label: 'Un valor' },
          { value: 'MEZCLA', label: 'Mezcla de densidades' },
        ]}
      />
      <TextInput
        label="Nombre"
        placeholder={tipo === 'MEZCLA' ? 'Ej.: Removedor (acetona + agua)' : 'Ej.: Removedor medido'}
        value={nombre}
        onChange={(e) => setNombre(e.currentTarget.value)}
      />

      {tipo === 'VALOR' ? (
        <>
          <Group grow>
            <NumberInput
              label="Densidad (g/mL)"
              decimalScale={5}
              min={0}
              hideControls
              value={densidad}
              onChange={setDensidad}
            />
            <NumberInput label="A (°C)" decimalScale={2} hideControls value={tempC} onChange={setTempC} />
          </Group>
          <Select
            label="De dónde sale"
            allowDeselect={false}
            value={fuente}
            onChange={(v) => v && setFuente(v as typeof fuente)}
            data={[
              { value: 'MEDICION_PROPIA', label: 'Medición propia (queda a tu nombre, con fecha de hoy)' },
              { value: 'CERTIFICADO_PROVEEDOR', label: 'Certificado del proveedor' },
              { value: 'LITERATURA', label: 'Literatura' },
            ]}
          />
          {fuente !== 'MEDICION_PROPIA' ? (
            <TextInput
              label="Documento o referencia"
              withAsterisk={fuente === 'CERTIFICADO_PROVEEDOR'}
              value={documento}
              onChange={(e) => setDocumento(e.currentTarget.value)}
            />
          ) : null}
          <Text size="sm" c="dimmed">
            Sin coeficiente de dilatación: la calculadora usa este valor a cualquier temperatura.
          </Text>
        </>
      ) : (
        <>
          {partes.map((p, i) => (
            <Group key={i} align="flex-end" wrap="nowrap">
              <Select
                style={{ flex: 1 }}
                label={i === 0 ? 'Densidad' : undefined}
                searchable
                data={opciones}
                value={p.densidadId}
                onChange={(v) => setPartes(partes.map((x, j) => (j === i ? { ...x, densidadId: v } : x)))}
              />
              <NumberInput
                w={110}
                label={i === 0 ? '% en masa' : undefined}
                decimalScale={4}
                min={0}
                max={100}
                hideControls
                value={p.pct}
                onChange={(v) => setPartes(partes.map((x, j) => (j === i ? { ...x, pct: v } : x)))}
              />
              <ActionIcon
                size="input-sm"
                variant="subtle"
                color="red"
                aria-label="Quitar"
                disabled={partes.length <= 2}
                onClick={() => setPartes(partes.filter((_, j) => j !== i))}
              >
                <IconTrash size={18} />
              </ActionIcon>
            </Group>
          ))}
          <Group justify="space-between">
            <Button
              variant="subtle"
              leftSection={<IconPlus size={16} />}
              onClick={() => setPartes([...partes, { densidadId: null, pct: '' }])}
            >
              Otra densidad
            </Button>
            <Text size="sm" c={Math.abs(suma - 100) > 1e-6 ? 'red' : 'dimmed'}>
              Suma: {numero(suma, 4)} %
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            Se calcula como la calculadora calcula una mezcla (con volumen de exceso donde hay datos), a
            20 °C, y la variación entre 20 y 30 °C queda como dilatación.
          </Text>
        </>
      )}

      {error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : null}
      <Group justify="flex-end">
        <Button onClick={guardar} disabled={Boolean(error)} loading={crear.isPending}>
          Guardar y elegir
        </Button>
      </Group>
    </Stack>
  );
}
