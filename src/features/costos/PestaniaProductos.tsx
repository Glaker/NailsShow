import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconSearch, IconPackage } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { numero } from '@/lib/formato';
import {
  ROLES_COSTO_PLANILLA,
  ROLES_CONTENIDO_NETO,
  ROLES_MINUTOS,
  useCargarContenidoNeto,
  useCargarCostoPlanilla,
  useCargarMinutos,
  useCostosProducto,
  useDesgloseProducto,
  useMinutosProducto,
  type ComponenteCosto,
  type CostoProducto,
} from '@/lib/consultasCostos';
import { numOrNull, pesos, pesosUnitario } from './comun';
import { BadgeOrigen } from './BadgeOrigen';

const TIPO: Record<ComponenteCosto['tipo'], string> = {
  GRANEL: 'Granel',
  ACONDICIONAMIENTO: 'Acondicionamiento',
  MANO_DE_OBRA: 'Mano de obra',
};

type Filtro = 'todos' | 'completos' | 'faltantes';

export function PestaniaProductos() {
  const productos = useCostosProducto();
  const minutos = useMinutosProducto();
  const [texto, setTexto] = useDebouncedState('', 250);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<CostoProducto | null>(null);

  if (productos.isLoading || minutos.isLoading) return <Skeleton h={300} />;

  const filas = productos.data ?? [];
  const busqueda = texto.trim().toLowerCase();
  const visibles = filas
    .filter(
      (p) =>
        filtro === 'todos' ||
        (filtro === 'completos' && p.faltantes === 0) ||
        (filtro === 'faltantes' && p.faltantes > 0),
    )
    .filter(
      (p) =>
        !busqueda ||
        p.nombre.toLowerCase().includes(busqueda) ||
        p.codigo_interno.toLowerCase().includes(busqueda),
    );
  const alternar = (f: Filtro) => setFiltro(filtro === f ? 'todos' : f);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <TextInput
          placeholder="Producto o código"
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 340 }}
        />
        <Group gap="xs">
          <Button
            size="md"
            variant={filtro === 'completos' ? 'filled' : 'default'}
            onClick={() => alternar('completos')}
          >
            Sólo completos
          </Button>
          <Button
            size="md"
            variant={filtro === 'faltantes' ? 'filled' : 'default'}
            onClick={() => alternar('faltantes')}
          >
            Sólo con faltantes
          </Button>
        </Group>
      </Group>

      {filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconPackage}
            titulo="Sin productos para costear"
            descripcion="Aparecen cuando hay productos cargados con su fórmula."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconSearch}
            titulo="Ningún producto coincide"
            descripcion="Probá con otro texto o quitá el filtro."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={1000}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Contenido</Table.Th>
                  <Table.Th>Fórmula</Table.Th>
                  <Table.Th ta="right">Granel</Table.Th>
                  <Table.Th ta="right">Acondicionamiento</Table.Th>
                  <Table.Th ta="right">Mano de obra</Table.Th>
                  <Table.Th ta="right">Costo unitario</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.slice(0, 300).map((p) => (
                  <Table.Tr
                    key={p.producto_id}
                    onClick={() => setAbierto(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {p.nombre}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {p.codigo_interno}
                      </Text>
                      {p.faltantes > 0 ? (
                        <Badge color="orange" variant="light" mt={4}>
                          incompleto ({p.faltantes})
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {p.contenido_neto !== null && p.unidad_contenido ? (
                        <Text size="sm">
                          {numero(p.contenido_neto, 2)} {p.unidad_contenido}
                        </Text>
                      ) : (
                        <Badge color="gray" variant="light">
                          sin contenido
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <EstadoFormula estado={p.formula_estado} />
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" c="dimmed">
                      {p.granel !== null ? pesos(p.granel) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" c="dimmed">
                      {p.acondicionamiento !== null ? pesos(p.acondicionamiento) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" c="dimmed">
                      {p.mano_de_obra !== null ? pesos(p.mano_de_obra) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {p.costo_vigente !== null ? pesos(p.costo_vigente) : '—'}
                      {p.fuente_costo === 'PLANILLA' ? (
                        <Text size="xs" c="dimmed" ff="inherit" fw={400}>
                          de planilla
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {visibles.length > 300 ? (
            <Text size="xs" c="dimmed" p="sm">
              Se muestran 300 de {visibles.length}: buscá para acotar.
            </Text>
          ) : null}
        </Paper>
      )}

      <Modal
        opened={abierto !== null}
        onClose={() => setAbierto(null)}
        title={abierto ? abierto.nombre : ''}
        centered
        size="xl"
      >
        {abierto ? (
          <Button
            component={Link}
            to={`/costos/producto/${abierto.producto_id}`}
            variant="light"
            mb="md"
          >
            Ver panel del producto (gráficos, precios y stock)
          </Button>
        ) : null}
        {abierto ? (
          <DesgloseProducto
            producto={abierto}
            minutosActuales={minutos.data?.get(abierto.producto_id) ?? null}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

function EstadoFormula({ estado }: { estado: string | null }) {
  if (estado === null)
    return (
      <Badge color="gray" variant="light">
        sin fórmula
      </Badge>
    );
  if (estado === 'VIGENTE') return null;
  return (
    <Badge color="yellow" variant="light">
      fórmula en {estado.toLowerCase().replace(/_/g, ' ')}
    </Badge>
  );
}

function DesgloseProducto({
  producto,
  minutosActuales,
}: {
  producto: CostoProducto;
  minutosActuales: number | null;
}) {
  const desglose = useDesgloseProducto(producto.producto_id);
  const puedeContenido = useTieneRol(...ROLES_CONTENIDO_NETO);
  const puedeMinutos = useTieneRol(...ROLES_MINUTOS);

  if (desglose.isLoading) return <Skeleton h={200} />;
  const filas = desglose.data ?? [];
  const total = filas.reduce((a, c) => a + (c.subtotal ?? 0), 0);

  return (
    <Stack gap="lg">
      {filas.length === 0 ? (
        <Vacio
          icono={IconPackage}
          titulo="Sin componentes"
          descripcion="El producto no tiene una fórmula con componentes costeables."
        />
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={960}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Componente</Table.Th>
                  <Table.Th ta="right">Cantidad</Table.Th>
                  <Table.Th ta="right">Merma</Table.Th>
                  <Table.Th ta="right">Costo unitario</Table.Th>
                  <Table.Th>Origen del precio</Table.Th>
                  <Table.Th ta="right">Subtotal</Table.Th>
                  <Table.Th ta="right">% del total</Table.Th>
                  <Table.Th>Falta</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((c) => (
                  <Table.Tr key={`${c.orden}-${c.componente}`}>
                    <Table.Td>
                      <Text size="sm">{TIPO[c.tipo]}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {c.componente}
                      </Text>
                      {c.codigo_interno ? (
                        <Text size="xs" c="dimmed">
                          {c.codigo_interno}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {c.cantidad !== null
                        ? `${numero(c.cantidad, 4)} ${c.unidad ?? ''}`
                        : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {c.merma !== null ? `${numero(c.merma * 100, 2)} %` : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {c.costo_unitario !== null ? pesosUnitario(c.costo_unitario) : '—'}
                    </Table.Td>
                    <Table.Td>
                      <BadgeOrigen origen={c.origen_costo} />
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace" fw={700}>
                      {c.subtotal !== null ? pesos(c.subtotal) : '—'}
                    </Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {c.subtotal !== null && total > 0
                        ? `${numero((c.subtotal / total) * 100, 1)} %`
                        : '—'}
                    </Table.Td>
                    <Table.Td>
                      {c.falta !== null ? (
                        <Text size="sm" c="orange" fw={600}>
                          {c.falta}
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <Text fw={700}>
        Costo calculado:{' '}
        {producto.costo_unitario !== null
          ? pesos(producto.costo_unitario)
          : 'sin calcular'}
        {producto.faltantes > 0 ? ' (incompleto)' : ''}
      </Text>

      <CostoPlanilla producto={producto} />

      {puedeContenido ? <FormularioContenido producto={producto} /> : null}
      {puedeMinutos ? (
        <FormularioMinutos productoId={producto.producto_id} actuales={minutosActuales} />
      ) : null}
    </Stack>
  );
}

type ValoresContenido = {
  contenido_neto: number | null;
  unidad_contenido: 'g' | 'mL';
};

const esquemaContenido = z.object({
  contenido_neto: z
    .number({ error: 'Falta el contenido' })
    .positive('El contenido tiene que ser mayor que cero'),
  unidad_contenido: z.enum(['g', 'mL'], { error: 'Elegí la unidad' }),
});

/** Dato de rótulo, en gmp.productos. Lo cambia Dirección Técnica o Producción. */
function FormularioContenido({ producto }: { producto: CostoProducto }) {
  const guardar = useCargarContenidoNeto();
  const form = useForm<ValoresContenido>({
    mode: 'controlled',
    initialValues: {
      contenido_neto: producto.contenido_neto,
      unidad_contenido: producto.unidad_contenido ?? 'g',
    },
    validate: zod4Resolver(esquemaContenido),
  });
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((v) =>
          guardar.mutate({
            producto_id: producto.producto_id,
            contenido_neto: v.contenido_neto,
            unidad_contenido: v.unidad_contenido,
          }),
        )}
      >
        <Stack gap="sm">
          <Text fw={600}>Contenido neto del rótulo</Text>
          <Group align="flex-end" wrap="wrap">
            <NumberInput
              label="Contenido"
              min={0}
              decimalScale={2}
              decimalSeparator=","
              value={form.values.contenido_neto ?? ''}
              onChange={(x) => form.setFieldValue('contenido_neto', numOrNull(x))}
              error={form.errors.contenido_neto}
              w={180}
            />
            <div>
              <Text size="sm" fw={500} mb={6}>
                Unidad
              </Text>
              <SegmentedControl
                data={[
                  { label: 'g', value: 'g' },
                  { label: 'mL', value: 'mL' },
                ]}
                value={form.values.unidad_contenido}
                onChange={(x) => form.setFieldValue('unidad_contenido', x as 'g' | 'mL')}
              />
            </div>
            <Button type="submit" size="md" loading={guardar.isPending}>
              Guardar contenido
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

type ValoresMinutos = {
  minutos: number | null;
  motivo: string;
};

const esquemaMinutos = z.object({
  minutos: z.number({ error: 'Falta el tiempo' }).min(0, 'No puede ser negativo'),
  motivo: z.string(),
});

function FormularioMinutos({
  productoId,
  actuales,
}: {
  productoId: string;
  actuales: number | null;
}) {
  const guardar = useCargarMinutos();
  const form = useForm<ValoresMinutos>({
    mode: 'controlled',
    initialValues: { minutos: actuales, motivo: '' },
    validate: zod4Resolver(esquemaMinutos),
  });
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <form
        onSubmit={form.onSubmit((v) =>
          guardar.mutate({
            producto_id: productoId,
            minutos_por_unidad: v.minutos ?? 0,
            motivo: v.motivo.trim() || null,
          }),
        )}
      >
        <Stack gap="sm">
          <Text fw={600}>Minutos de mano de obra por unidad</Text>
          <Group align="flex-end" wrap="wrap">
            <NumberInput
              label="Minutos por unidad"
              min={0}
              decimalScale={2}
              decimalSeparator=","
              value={form.values.minutos ?? ''}
              onChange={(x) => form.setFieldValue('minutos', numOrNull(x))}
              error={form.errors.minutos}
              w={180}
            />
            <TextInput
              label="Motivo"
              placeholder="Cambio de proceso, medición en planta…"
              style={{ flex: 1, minWidth: 220 }}
              {...form.getInputProps('motivo')}
            />
            <Button type="submit" size="md" loading={guardar.isPending}>
              Guardar minutos
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

/**
 * Costo de planilla (D-56): el de la hoja C.T. o el que fijó Finanzas. Rige
 * mientras el calculado esté incompleto. Finanzas lo reemplaza con motivo; el
 * anterior queda en el historial.
 */
function CostoPlanilla({ producto }: { producto: CostoProducto }) {
  const puede = useTieneRol(...ROLES_COSTO_PLANILLA);
  const cargar = useCargarCostoPlanilla();
  const [cvd, setCvd] = useState<number | null>(producto.planilla_cvd);
  const [mod, setMod] = useState<number | null>(producto.planilla_mod);
  const [cvi, setCvi] = useState<number | null>(producto.planilla_cvi);
  const [motivo, setMotivo] = useState('');
  const total = (cvd ?? 0) + (mod ?? 0) + (cvi ?? 0);
  const reemplaza = producto.planilla_id !== null;
  const valido = total > 0 && (!reemplaza || motivo.trim().length >= 3);
  const n = (v: string | number) => (v === '' ? null : Number(v));

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700}>
            Costo de planilla:{' '}
            {producto.costo_planilla !== null
              ? pesos(producto.costo_planilla)
              : 'sin cargar'}
          </Text>
          {producto.fuente_costo === 'PLANILLA' ? (
            <Badge variant="light">es el que se usa ahora</Badge>
          ) : null}
        </Group>
        <Text size="xs" c="dimmed">
          {producto.planilla_fuente ?? 'Sin costo de planilla.'} Se usa mientras el costo
          calculado esté incompleto. Lo cambia Finanzas.
        </Text>
        {puede ? (
          <>
            <Group grow>
              <NumberInput
                label="Materiales (C.V.D.)"
                min={0}
                decimalScale={2}
                value={cvd ?? ''}
                onChange={(v) => setCvd(n(v))}
              />
              <NumberInput
                label="Mano de obra (M.O.D.)"
                min={0}
                decimalScale={2}
                value={mod ?? ''}
                onChange={(v) => setMod(n(v))}
              />
              <NumberInput
                label="Indirectos (C.V.I.)"
                min={0}
                decimalScale={2}
                value={cvi ?? ''}
                onChange={(v) => setCvi(n(v))}
              />
            </Group>
            {reemplaza ? (
              <TextInput
                label="Motivo del cambio"
                placeholder="Precio actualizado, error en la planilla…"
                value={motivo}
                onChange={(e) => setMotivo(e.currentTarget.value)}
              />
            ) : null}
            <Group justify="space-between">
              <Text size="sm">Total {pesos(total)}</Text>
              <Button
                disabled={!valido}
                loading={cargar.isPending}
                onClick={() =>
                  cargar.mutate({
                    producto_id: producto.producto_id,
                    cvd,
                    mod,
                    cvi,
                    reemplaza_a: producto.planilla_id,
                    motivo: motivo.trim() || null,
                  })
                }
              >
                Guardar costo
              </Button>
            </Group>
          </>
        ) : producto.costo_planilla !== null ? (
          <Text size="sm">
            Materiales {pesos(producto.planilla_cvd ?? 0)} · mano de obra{' '}
            {pesos(producto.planilla_mod ?? 0)} · indirectos{' '}
            {pesos(producto.planilla_cvi ?? 0)}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
