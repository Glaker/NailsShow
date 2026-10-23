import { useState } from 'react';
import { Button, Group, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useProductos } from '@/lib/consultas';
import { useGuardarTiempoEnvasado } from '@/lib/consultasEtiquetado';
import {
  aMmss,
  deMmss,
  diasRecomendados,
  horasMinutos,
  minutosReloj,
  minutosTrabajo,
  type ProductoConTiempo,
} from '@/lib/envasado';
import { numero } from '@/lib/formato';

const aNumero = (v: number | string) => (typeof v === 'number' ? v : Number(v || 0));

/** Un tiempo por unidad en MM:SS (D-ajustes-2). */
export function CampoMmss({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const invalido = Number.isNaN(deMmss(value));
  return (
    <TextInput
      label={label}
      description="MM:SS, por ejemplo 0:45 o 1:30"
      placeholder="0:00"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      error={invalido ? 'Escribilo como minutos:segundos, p. ej. 1:30' : undefined}
    />
  );
}

/**
 * Tiempo de envasado y etiquetado de un producto (D-tiempo-envasado-1,
 * D-ajustes-2): Naza carga cuánto tarda una persona por unidad en cada uno,
 * en MM:SS, el margen y cuántas personas trabajan, y ve cuánto lleva una
 * tanda en jornadas de 8 a 15 con media hora de descanso. El tiempo por
 * unidad es la suma de los dos.
 */
export function TiempoEnvasado({
  productoId,
  cantidadSugerida,
}: {
  productoId: string;
  cantidadSugerida: number;
}) {
  const productos = useProductos();
  const guardar = useGuardarTiempoEnvasado();
  const p = (productos.data ?? []).find((x) => x.id === productoId) as
    ProductoConTiempo | undefined;
  const [envasado, setEnvasado] = useState(aMmss(p?.minutos_envasado_unidad));
  const [etiquetado, setEtiquetado] = useState(aMmss(p?.minutos_etiquetado_unidad));
  const [margen, setMargen] = useState<number | string>(
    Number(p?.margen_envasado_pct ?? 10),
  );
  const [personas, setPersonas] = useState<number | string>(p?.personas_envasado ?? 1);

  const minEnv = deMmss(envasado);
  const minEtq = deMmss(etiquetado);
  const invalido = Number.isNaN(minEnv) || Number.isNaN(minEtq);
  const t = {
    minutosUnidad: invalido ? 0 : (minEnv ?? 0) + (minEtq ?? 0),
    margenPct: aNumero(margen),
    personas: Math.max(1, aNumero(personas)),
  };
  const cant = cantidadSugerida;
  const reloj = minutosReloj(cant, t);
  const cambio =
    envasado !== aMmss(p?.minutos_envasado_unidad) ||
    etiquetado !== aMmss(p?.minutos_etiquetado_unidad) ||
    t.margenPct !== Number(p?.margen_envasado_pct ?? 10) ||
    t.personas !== (p?.personas_envasado ?? 1);

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Stack gap="sm">
        <Group grow align="flex-start">
          <CampoMmss
            label="Envasado por unidad"
            value={envasado}
            onChange={setEnvasado}
          />
          <CampoMmss
            label="Etiquetado por unidad"
            value={etiquetado}
            onChange={setEtiquetado}
          />
        </Group>
        <Group grow align="flex-start">
          <NumberInput
            label="Personas"
            min={1}
            max={50}
            allowDecimal={false}
            value={personas}
            onChange={setPersonas}
          />
          <NumberInput
            label="Margen de seguridad"
            suffix=" %"
            min={0}
            max={100}
            value={margen}
            onChange={setMargen}
          />
        </Group>
        {t.minutosUnidad > 0 && cant > 0 ? (
          <Text size="sm">
            Por unidad <b>{aMmss(t.minutosUnidad)}</b>. En pedidos: {numero(cant)}{' '}
            unidades: <b>{horasMinutos(minutosTrabajo(cant, t))}</b> de trabajo
            {t.personas > 1 ? (
              <>
                {' '}
                · con {t.personas} personas, <b>{horasMinutos(reloj)}</b> cada una
              </>
            ) : null}{' '}
            →{' '}
            <b>
              recomendado: {diasRecomendados(reloj)}{' '}
              {diasRecomendados(reloj) === 1 ? 'día' : 'días'}
            </b>{' '}
            <Text span size="xs" c="dimmed">
              (jornada de 8 a 15 con 30 min de descanso)
            </Text>
          </Text>
        ) : t.minutosUnidad > 0 ? (
          <Text size="sm">
            Por unidad: <b>{aMmss(t.minutosUnidad)}</b> (envasado + etiquetado), más{' '}
            {numero(t.margenPct)} % de margen de seguridad.
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Cargá el envasado y el etiquetado por unidad para ver cuánto lleva una tanda.
          </Text>
        )}
        {cambio ? (
          <Group justify="flex-end">
            <Button
              variant="light"
              loading={guardar.isPending}
              disabled={invalido || t.margenPct < 0 || t.margenPct > 100}
              onClick={() =>
                guardar.mutate({
                  productoId,
                  minutosUnidad: minEnv || null,
                  minutosEtiquetado: minEtq || null,
                  margenPct: t.margenPct,
                  personas: t.personas,
                })
              }
            >
              Guardar tiempo
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
}
