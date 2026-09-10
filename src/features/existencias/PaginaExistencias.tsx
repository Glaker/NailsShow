import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Chip,
  Group,
  Paper,
  Skeleton,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconFlame,
  IconInfoCircle,
  IconScale,
  IconSearch,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { InsigniaEstado, TEXTO_ESTADO } from '@/components/InsigniaEstado';
import { Vacio } from '@/components/Vacio';
import {
  useExistencias,
  type EstadoCalidad,
  type ExistenciaVista,
} from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';

const ESTADOS: EstadoCalidad[] = [
  'RECIBIDO',
  'CUARENTENA',
  'MUESTREADO',
  'EN_ANALISIS',
  'APROBADO',
  'RECHAZADO',
];

/**
 * Material recibido, por insumo y estado.
 *
 * Responde «qué hay en planta y en qué punto del circuito está». Es la pantalla
 * del depósito para saber qué está esperando análisis y qué quedó liberado.
 *
 * NO es stock, y la pantalla lo dice en voz alta a propósito: no existe
 * registro de consumo, así que las cantidades solo crecen. Son exactas al
 * recibir y se van degradando a medida que producción usa el material. La
 * existencia real, con movimientos y valorización, va a ser
 * `comercial.movimientos_stock` (§4.12), que todavía no está construido.
 * Mientras tanto, un operario que lea «150 kg» tiene que saber que eso es lo
 * que entró, no lo que queda.
 */
export function PaginaExistencias() {
  const [estado, setEstado] = useState<EstadoCalidad | null>(null);
  const [texto, setTexto] = useDebouncedState('', 250);

  const existencias = useExistencias();

  /* El filtrado es en el cliente: la vista ya viene agregada por insumo y
     estado, así que son decenas de filas, no miles. Ir a la base por cada
     tecla no compraría nada. */
  const filas = useMemo(() => {
    const busqueda = texto.trim().toLowerCase();
    return (existencias.data ?? []).filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (!busqueda) return true;
      return (
        (f.insumo_nombre ?? '').toLowerCase().includes(busqueda) ||
        (f.codigo_interno ?? '').toLowerCase().includes(busqueda)
      );
    });
  }, [existencias.data, estado, texto]);

  /* Un insumo ocupa varias filas, una por estado. La celda del insumo se
     dibuja solo en la primera de su grupo y el resto queda en blanco, con una
     línea que separa los grupos: leerlo en una tablet a un metro de distancia
     exige que el ojo agrupe sin esfuerzo. */
  const primeraDelGrupo = useMemo(() => {
    const marcas: boolean[] = [];
    let anterior: string | null = null;
    for (const f of filas) {
      marcas.push(f.insumo_id !== anterior);
      anterior = f.insumo_id;
    }
    return marcas;
  }, [filas]);

  const incompletas = filas.some((f) => (f.lotes_sin_unidades ?? 0) > 0);
  const totalLotes = filas.reduce((acc, f) => acc + (f.lotes ?? 0), 0);
  const insumosDistintos = new Set(filas.map((f) => f.insumo_id)).size;

  return (
    <>
      <EncabezadoPagina
        titulo="Material en planta"
        descripcion="Lo recibido de cada insumo, agrupado por su estado en el circuito de calidad."
      />

      <Alert
        icon={<IconInfoCircle size={18} />}
        color="violeta"
        variant="light"
        radius="md"
        mb="md"
      >
        <Text size="sm">
          Estas cantidades son <strong>lo que se recibió</strong>, no lo que queda. El
          sistema todavía no registra el consumo de producción, así que los números solo
          crecen. Para decidir un despacho, mirá el lote.
        </Text>
      </Alert>

      <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
        <Group justify="space-between" wrap="wrap" gap="md">
          <TextInput
            placeholder="Insumo o código interno"
            leftSection={<IconSearch size={17} />}
            defaultValue={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            w={{ base: '100%', sm: 340 }}
          />
          <Group gap="xs" wrap="wrap">
            <Chip
              checked={estado === null}
              onChange={() => setEstado(null)}
              variant="light"
              color="violeta"
              radius="sm"
            >
              Todos
            </Chip>
            {ESTADOS.map((e) => (
              <Chip
                key={e}
                checked={estado === e}
                onChange={() => setEstado(e)}
                variant="light"
                color="violeta"
                radius="sm"
              >
                {TEXTO_ESTADO[e]}
              </Chip>
            ))}
          </Group>
        </Group>
      </Paper>

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {existencias.isLoading ? (
          <Skeleton h={280} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconScale}
            titulo="No hay material con ese criterio"
            descripcion="Cuando se registre una recepción, el material aparece acá agrupado por insumo y estado."
          />
        ) : (
          <>
            <Group justify="space-between" px="md" py="sm" wrap="wrap" gap="xs">
              <Text size="sm" c="dimmed">
                {numero(insumosDistintos)} {insumosDistintos === 1 ? 'insumo' : 'insumos'}{' '}
                · {numero(totalLotes)} {totalLotes === 1 ? 'lote' : 'lotes'}
              </Text>
              {incompletas ? (
                <Group gap={6} wrap="nowrap">
                  <IconAlertTriangle
                    size={15}
                    color="var(--mantine-color-estadoEnAnalisis-7)"
                  />
                  <Text size="xs" c="dimmed">
                    Hay lotes sin conteo de unidades: los totales marcados están
                    incompletos.
                  </Text>
                </Group>
              ) : null}
            </Group>
            <Table.ScrollContainer minWidth={900}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Insumo</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th ta="right">Lotes</Table.Th>
                    <Table.Th ta="right">Bultos</Table.Th>
                    <Table.Th ta="right">Unidades</Table.Th>
                    <Table.Th>Vence primero</Table.Th>
                    <Table.Th>Últ. ingreso</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f, i) => (
                    <FilaExistencia
                      key={`${f.insumo_id}-${f.estado}-${f.unidad}`}
                      fila={f}
                      abreGrupo={primeraDelGrupo[i] ?? false}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </Paper>
    </>
  );
}

function FilaExistencia({
  fila,
  abreGrupo,
}: {
  fila: ExistenciaVista;
  abreGrupo: boolean;
}) {
  const sinUnidades = fila.lotes_sin_unidades ?? 0;
  const porVencer = fila.lotes_por_vencer ?? 0;

  return (
    <Table.Tr
      style={abreGrupo ? { borderTop: '2px solid var(--superficie-borde)' } : undefined}
    >
      <Table.Td>
        {abreGrupo ? (
          <>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600}>
                {fila.insumo_nombre}
              </Text>
              {fila.es_inflamable ? (
                <Tooltip label="Inflamable — depósito exterior (I.20.6)">
                  <IconFlame size={15} color="var(--mantine-color-estadoRechazado-6)" />
                </Tooltip>
              ) : null}
            </Group>
            <Text size="xs" c="dimmed">
              {fila.codigo_interno}
            </Text>
          </>
        ) : null}
      </Table.Td>
      <Table.Td>
        {fila.estado ? (
          <InsigniaEstado estado={fila.estado} size="sm" />
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" ff="monospace">
          {numero(fila.lotes)}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" ff="monospace">
          {numero(fila.bultos)}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Group gap={6} wrap="nowrap" justify="flex-end">
          <Text size="sm" ff="monospace" fw={600}>
            {numero(fila.unidades, 3)}
          </Text>
          {fila.unidad ? (
            <Text size="xs" c="dimmed">
              {fila.unidad}
            </Text>
          ) : null}
          {sinUnidades > 0 ? (
            <Tooltip
              label={`${sinUnidades} ${sinUnidades === 1 ? 'lote no tiene' : 'lotes no tienen'} conteo de unidades (RN-02): el total está incompleto.`}
              multiline
              w={260}
            >
              <IconAlertTriangle
                size={15}
                color="var(--mantine-color-estadoEnAnalisis-7)"
              />
            </Tooltip>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{fecha(fila.vence_primero)}</Text>
          {porVencer > 0 ? (
            <Tooltip
              label={`${porVencer} ${porVencer === 1 ? 'lote vence' : 'lotes vencen'} dentro de 90 días`}
            >
              <Badge size="xs" color="estadoEnAnalisis" variant="light" radius="sm">
                {numero(porVencer)}
              </Badge>
            </Tooltip>
          ) : null}
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {fecha(fila.ultimo_ingreso)}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}
