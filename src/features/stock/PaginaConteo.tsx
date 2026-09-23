import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconInfoCircle, IconPrinter } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useTieneRol } from '@/features/auth/sesion';
import { useInsumos, useStockPorArticulo } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import {
  ROLES_CUENTAN,
  useRegistrarConteo,
  useUltimosConteos,
  type UltimoConteoRow,
} from '@/lib/consultasComercial';

type Vista = 'provisorios' | 'sin_contar' | 'contados' | 'todos';

const TIPOS = [
  { value: 'MATERIA_PRIMA', label: 'Materias primas' },
  { value: 'SEMIELABORADO', label: 'Granel' },
  { value: 'MATERIAL_ENVASE', label: 'Envases y cierres' },
  { value: 'MATERIAL_EMPAQUE', label: 'Empaque' },
  { value: 'ETIQUETA', label: 'Etiquetas' },
];

const unidadCorta = (u: string | null) => (u === 'UNIDAD' ? 'u' : (u ?? '—'));

/**
 * Conteo de inventario.
 *
 * Se imprime la planilla, se cuenta en el depósito y se carga lo contado acá.
 * Cada conteo lleva el saldo del insumo a lo que se contó, con un ajuste que
 * queda en el kardex a nombre de quien lo cargó. Lo que ya estaba no se borra.
 *
 * Arranca en «provisorios»: el saldo de apertura de las materias primas se
 * corrigió el 2026-09-23 a «1 envase × contenido» de la planilla, que es una
 * estimación. Esos son los primeros que hay que contar.
 */
export function PaginaConteo() {
  const insumos = useInsumos();
  const stock = useStockPorArticulo();
  const conteos = useUltimosConteos();
  const puedeContar = useTieneRol(...ROLES_CUENTAN);

  const [vista, setVista] = useState<Vista>('provisorios');
  const [tipo, setTipo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const saldoPorInsumo = useMemo(
    () =>
      new Map(
        (stock.data ?? []).map((s) => [
          s.insumo_id as string,
          Number(s.saldo_total ?? 0),
        ]),
      ),
    [stock.data],
  );

  const ultimo = conteos.data ?? new Map<string, UltimoConteoRow>();
  const texto = busqueda.trim().toLowerCase();
  const filas = (insumos.data ?? [])
    .filter((i) => i.activo && i.unidad_medida)
    .filter((i) => !tipo || i.tipo === tipo)
    .filter(
      (i) =>
        !texto ||
        i.nombre.toLowerCase().includes(texto) ||
        i.codigo_interno.toLowerCase().includes(texto),
    )
    .filter((i) => {
      const c = ultimo.get(i.id);
      if (vista === 'provisorios') return c?.provisorio === true;
      if (vista === 'sin_contar') return !c;
      if (vista === 'contados') return c?.provisorio === false;
      return true;
    })
    .sort((a, b) => a.codigo_interno.localeCompare(b.codigo_interno));

  const cuenta = (v: Vista) =>
    (insumos.data ?? []).filter((i) => {
      if (!i.activo || !i.unidad_medida) return false;
      const c = ultimo.get(i.id);
      if (v === 'provisorios') return c?.provisorio === true;
      if (v === 'sin_contar') return !c;
      if (v === 'contados') return c?.provisorio === false;
      return true;
    }).length;

  const cargando = insumos.isLoading || stock.isLoading || conteos.isLoading;

  return (
    <>
      <Box className="no-imprimir">
        <EncabezadoPagina
          titulo="Conteo de inventario"
          descripcion="Se imprime la planilla, se cuenta en el depósito y se carga lo contado. El saldo pasa a lo que se contó."
          acciones={
            <Button
              variant="default"
              leftSection={<IconPrinter size={16} />}
              onClick={() => window.print()}
            >
              Imprimir planilla
            </Button>
          }
        />
      </Box>

      <Stack gap="md" className="no-imprimir">
        <Alert
          color="violeta"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          El saldo de las materias primas es <b>provisorio</b>: se tomó un envase de cada
          una con el contenido de la planilla (el monómero, un tacho de 200 L; el agua, un
          bidón de 10 L). Hasta que se cuenten, los faltantes de los pedidos se calculan
          sobre esa estimación. Las fragancias y algunas materias primas no tienen
          provisorio y hay que contarlas. Se cuenta todo lo que hay del insumo, en
          cualquier depósito.
        </Alert>

        <Group gap="sm" wrap="wrap" align="flex-end">
          <SegmentedControl
            size="md"
            value={vista}
            onChange={(v) => setVista(v as Vista)}
            data={[
              { value: 'provisorios', label: `Provisorios (${cuenta('provisorios')})` },
              { value: 'sin_contar', label: `Sin contar (${cuenta('sin_contar')})` },
              { value: 'contados', label: `Contados (${cuenta('contados')})` },
              { value: 'todos', label: 'Todos' },
            ]}
          />
          <Select
            placeholder="Todos los tipos"
            clearable
            data={TIPOS}
            value={tipo}
            onChange={setTipo}
            w={200}
          />
          <TextInput
            placeholder="Buscar por código o nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
        </Group>

        {cargando ? (
          <Skeleton h={300} />
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={960}>
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Insumo</Table.Th>
                    <Table.Th ta="right">En el sistema</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    {puedeContar ? <Table.Th>Contado</Table.Th> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={4}>
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Nada en esta vista.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filas.map((i) => (
                      <FilaConteo
                        key={i.id}
                        insumoId={i.id}
                        codigo={i.codigo_interno}
                        nombre={i.nombre}
                        unidad={i.unidad_medida}
                        saldo={saldoPorInsumo.get(i.id) ?? 0}
                        ultimo={ultimo.get(i.id)}
                        puedeContar={puedeContar}
                      />
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>

      {/* Planilla para el depósito: lo que está en pantalla, con el renglón en blanco. */}
      <Box className="solo-impresion" style={{ display: 'none' }}>
        <Title order={3}>Conteo de inventario — {fecha(new Date())}</Title>
        <Text size="sm" mb="sm">
          Contó: ______________________ Depósito: ______________
        </Text>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Código', 'Insumo', 'Unidad', 'Cantidad contada', 'Observación'].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #000',
                      padding: 4,
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i.id}>
                <td style={{ borderBottom: '1px solid #999', padding: 6 }}>
                  {i.codigo_interno}
                </td>
                <td style={{ borderBottom: '1px solid #999', padding: 6 }}>{i.nombre}</td>
                <td style={{ borderBottom: '1px solid #999', padding: 6 }}>
                  {unidadCorta(i.unidad_medida)}
                </td>
                <td style={{ borderBottom: '1px solid #999', padding: 6, width: 140 }} />
                <td style={{ borderBottom: '1px solid #999', padding: 6, width: 200 }} />
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </>
  );
}

function FilaConteo({
  insumoId,
  codigo,
  nombre,
  unidad,
  saldo,
  ultimo,
  puedeContar,
}: {
  insumoId: string;
  codigo: string;
  nombre: string;
  unidad: string | null;
  saldo: number;
  ultimo: UltimoConteoRow | undefined;
  puedeContar: boolean;
}) {
  const registrar = useRegistrarConteo();
  const [cantidad, setCantidad] = useState<number | string>('');
  const [observacion, setObservacion] = useState('');
  const u = unidadCorta(unidad);
  const dec = u === 'u' ? 0 : 2;
  const n = typeof cantidad === 'number' ? cantidad : Number.NaN;
  const valido = Number.isFinite(n) && n >= 0;

  return (
    <Table.Tr>
      <Table.Td>
        <Text size="sm" fw={600}>
          {nombre}
        </Text>
        <Text size="xs" c="dimmed">
          {codigo} · {u}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" ff="monospace">
          {numero(saldo, dec)} {u}
        </Text>
      </Table.Td>
      <Table.Td>
        {!ultimo ? (
          <Badge color="gray" variant="light" radius="sm">
            Sin contar
          </Badge>
        ) : ultimo.provisorio ? (
          <Badge color="estadoEnAnalisis" variant="light" radius="sm">
            Provisorio
          </Badge>
        ) : (
          <Stack gap={0}>
            <Badge color="estadoAprobado" variant="light" radius="sm">
              Contado
            </Badge>
            <Text size="xs" c="dimmed">
              {fecha(ultimo.registrado_en)}
              {ultimo.registrado_por_nombre ? ` · ${ultimo.registrado_por_nombre}` : ''}
            </Text>
          </Stack>
        )}
      </Table.Td>
      {puedeContar ? (
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            <NumberInput
              aria-label={`Cantidad contada de ${nombre}`}
              placeholder="Contado"
              min={0}
              decimalScale={dec === 0 ? 0 : 4}
              hideControls
              w={130}
              rightSection={
                <Text size="xs" c="dimmed">
                  {u}
                </Text>
              }
              value={cantidad}
              onChange={setCantidad}
            />
            <TextInput
              aria-label="Observación"
              placeholder="Observación (opcional)"
              value={observacion}
              onChange={(e) => setObservacion(e.currentTarget.value)}
              w={200}
            />
            <Button
              size="sm"
              disabled={!valido}
              loading={registrar.isPending}
              onClick={() =>
                registrar.mutate(
                  { insumoId, cantidad: n, observacion: observacion.trim() || null },
                  {
                    onSuccess: () => {
                      setCantidad('');
                      setObservacion('');
                    },
                  },
                )
              }
            >
              Registrar
            </Button>
          </Group>
          {valido && n !== saldo ? (
            <Text size="xs" c="dimmed" mt={4}>
              {n > saldo ? 'Entra' : 'Sale'} {numero(Math.abs(n - saldo), dec)} {u} por
              ajuste.
            </Text>
          ) : null}
        </Table.Td>
      ) : null}
    </Table.Tr>
  );
}
