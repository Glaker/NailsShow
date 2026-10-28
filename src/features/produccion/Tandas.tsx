import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useProductos } from '@/lib/consultas';
import { hermanosDe, repartoDe, type ConFamilia } from '@/lib/consultasHermanos';
import {
  totalesTandas,
  useRegistrarTanda,
  useTandasOrden,
  type OrdenProduccion,
  type TandaFila,
} from '@/lib/consultasOrdenes';
import { desdeCalendario, fecha, fechaISO, numero } from '@/lib/formato';
import { CamposReparto } from './Hermanos';

/** Tabla de tandas: día, producto y unidades (pantalla y batch record). */
export function TablaTandas({
  tandas,
  nombre,
}: {
  tandas: TandaFila[];
  nombre: (productoId: string) => string;
}) {
  return (
    <Table withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Tanda</Table.Th>
          <Table.Th>Fecha</Table.Th>
          <Table.Th>Producto</Table.Th>
          <Table.Th ta="right">Unidades</Table.Th>
          <Table.Th>Observaciones</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {tandas.map((t) => (
          <Table.Tr key={`${t.numero}-${t.producto_id}`}>
            <Table.Td>{t.numero}</Table.Td>
            <Table.Td>{fecha(t.fecha)}</Table.Td>
            <Table.Td>{nombre(t.producto_id)}</Table.Td>
            <Table.Td ta="right">{numero(Number(t.unidades))}</Table.Td>
            <Table.Td>{t.observaciones ?? ''}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/**
 * Cargar lo que salió en el día (D-tandas-1): con el granel aprobado, Naza
 * carga las unidades de cada hermano; entran a la fábrica con el lote de la
 * orden y se descuentan los insumos del día. «Con esto termina» la cierra.
 */
export function ModalEnvasado({
  orden,
  granelAprobado,
  abierto,
  onCerrar,
}: {
  orden: OrdenProduccion;
  granelAprobado: boolean;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const productos = (useProductos().data ?? []) as ConFamilia[];
  const tandas = useTandasOrden(orden.id);
  const registrar = useRegistrarTanda();
  const familia = [
    ...productos.filter((p) => p.id === orden.producto_id),
    ...hermanosDe(productos, orden.producto_id),
  ];
  const [dia, setDia] = useState<Date | null>(new Date());
  const [valores, setValores] = useState<Record<string, number | string>>({});
  const [obs, setObs] = useState('');
  const [finaliza, setFinaliza] = useState(false);
  const [obtenida, setObtenida] = useState<number | string>('');

  const previstas =
    (orden as { unidades_previstas?: number | null }).unidades_previstas ?? null;
  const lista = tandas.data ?? [];
  const { hechas, pendientes } = totalesTandas(lista, previstas);
  const reparto = repartoDe(valores);
  const hoy = reparto.reduce((a, r) => a + r.unidades, 0);
  const nombre = (id: string) => familia.find((p) => p.id === id)?.nombre ?? 'Producto';
  const listo =
    granelAprobado &&
    dia !== null &&
    (hoy > 0 || finaliza) &&
    (!finaliza || (obtenida !== '' && Number(obtenida) >= 0));

  return (
    <Modal opened={abierto} onClose={onCerrar} title="Lo que salió" size="lg" centered>
      <Stack gap="md">
        {!granelAprobado ? (
          <Alert color="estadoCuarentena" variant="light">
            Todavía no se puede cargar: primero Calidad aprueba el granel (R.50.10.1).
          </Alert>
        ) : null}
        <Group gap="xl">
          <Text size="sm">
            Envasadas: <b>{numero(hechas)}</b>
            {previstas !== null ? ` de ${numero(previstas)}` : ''}
          </Text>
          {pendientes !== null ? (
            <Text size="sm">
              Pendientes: <b>{numero(pendientes)}</b>
            </Text>
          ) : null}
        </Group>
        {lista.length > 0 ? <TablaTandas tandas={lista} nombre={nombre} /> : null}

        <DateInput
          label="Día del envasado"
          valueFormat="DD/MM/YYYY"
          maxDate={new Date()}
          value={dia}
          onChange={(v) => setDia(desdeCalendario(v))}
        />
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Unidades que salieron ese día
          </Text>
          <CamposReparto productos={familia} valores={valores} onCambio={setValores} />
        </Stack>
        <TextInput
          label="Observaciones (opcional)"
          value={obs}
          onChange={(e) => setObs(e.currentTarget.value)}
        />
        <Checkbox
          size="md"
          label="Con esto termina la orden"
          description="Si no, queda abierta para cargar los días siguientes."
          checked={finaliza}
          onChange={(e) => setFinaliza(e.currentTarget.checked)}
        />
        {finaliza ? (
          <NumberInput
            label={`Granel obtenido (${orden.unidad})`}
            decimalScale={3}
            min={0}
            value={obtenida}
            onChange={setObtenida}
          />
        ) : null}
        <Group justify="flex-end">
          <Button
            disabled={!listo}
            loading={registrar.isPending}
            onClick={() =>
              registrar.mutate(
                {
                  ordenId: orden.id,
                  fecha: dia ? (fechaISO(dia) ?? '') : '',
                  reparto,
                  observaciones: obs.trim() || null,
                  finaliza,
                  cantidadObtenida: finaliza ? Number(obtenida) : null,
                },
                {
                  onSuccess: () => {
                    setValores({});
                    setObs('');
                    if (finaliza) onCerrar();
                  },
                },
              )
            }
          >
            {finaliza ? 'Cargar y terminar la orden' : 'Cargar'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
