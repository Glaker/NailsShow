import { useState } from 'react';
import { Button, Group, NumberInput, Paper, Stack, Text } from '@mantine/core';
import { useProductos } from '@/lib/consultas';
import { useGuardarTiempoEnvasado } from '@/lib/consultasEtiquetado';
import {
  diasRecomendados,
  horasMinutos,
  minutosReloj,
  minutosTrabajo,
  type ProductoConTiempo,
} from '@/lib/envasado';
import { numero } from '@/lib/formato';

const aNumero = (v: number | string) => (typeof v === 'number' ? v : Number(v || 0));

/**
 * Tiempo de envasado de un producto (D-tiempo-envasado-1): Naza carga cuánto
 * tarda una persona por unidad, el margen y cuántas personas trabajan, y ve
 * cuánto lleva una tanda en jornadas de 8 a 15 con media hora de descanso.
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
  const [minutos, setMinutos] = useState<number | string>(
    p?.minutos_envasado_unidad ? Number(p.minutos_envasado_unidad) : '',
  );
  const [margen, setMargen] = useState<number | string>(
    Number(p?.margen_envasado_pct ?? 10),
  );
  const [personas, setPersonas] = useState<number | string>(p?.personas_envasado ?? 1);
  const [cantidad, setCantidad] = useState<number | string>(cantidadSugerida || 1000);

  const t = {
    minutosUnidad: aNumero(minutos),
    margenPct: aNumero(margen),
    personas: Math.max(1, aNumero(personas)),
  };
  const cant = aNumero(cantidad);
  const reloj = minutosReloj(cant, t);
  const cambio =
    t.minutosUnidad !== Number(p?.minutos_envasado_unidad ?? 0) ||
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
          <NumberInput
            label="Minutos por unidad"
            description="Lo que tarda una persona"
            min={0}
            decimalScale={2}
            value={minutos}
            onChange={setMinutos}
          />
          <NumberInput
            label="Personas"
            min={1}
            max={50}
            allowDecimal={false}
            value={personas}
            onChange={setPersonas}
          />
          <NumberInput
            label="Margen"
            suffix=" %"
            min={0}
            max={100}
            value={margen}
            onChange={setMargen}
          />
        </Group>
        <NumberInput
          label="Calcular para"
          suffix=" unidades"
          min={1}
          allowDecimal={false}
          thousandSeparator="."
          decimalSeparator=","
          value={cantidad}
          onChange={setCantidad}
        />
        {t.minutosUnidad > 0 && cant > 0 ? (
          <Text size="sm">
            {numero(cant)} unidades: <b>{horasMinutos(minutosTrabajo(cant, t))}</b> de
            trabajo
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
        ) : (
          <Text size="sm" c="dimmed">
            Cargá los minutos por unidad para ver cuánto lleva una tanda.
          </Text>
        )}
        {cambio ? (
          <Group justify="flex-end">
            <Button
              variant="light"
              loading={guardar.isPending}
              disabled={aNumero(minutos) < 0 || t.margenPct < 0 || t.margenPct > 100}
              onClick={() =>
                guardar.mutate({
                  productoId,
                  minutosUnidad: t.minutosUnidad > 0 ? t.minutosUnidad : null,
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
