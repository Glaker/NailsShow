import { useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedState } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconFileText, IconPlus, IconSearch } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useClientes } from '@/lib/consultasFacturacion';
import {
  useCostosProducto,
  useParametrosCosto,
  type CostoProducto,
} from '@/lib/consultasCostos';
import {
  ROLES_COTIZAN,
  useClientesPotenciales,
  useCotizaciones,
  useCrearCotizacion,
  type Cotizacion,
  type DestinoCotizacion,
  type EstadoCotizacion,
} from '@/lib/consultasCotizador';
import { fecha, fechaISO, numero, desdeCalendario } from '@/lib/formato';

const ESTADO: Record<EstadoCotizacion, { texto: string; color: string }> = {
  BORRADOR: { texto: 'Borrador', color: 'gray' },
  EMITIDA: { texto: 'Emitida', color: 'green' },
  ANULADA: { texto: 'Anulada', color: 'red' },
};

const ESTILO_BORDE = { borderColor: 'var(--superficie-borde)' };

type Seccion = 'clientes' | 'interno';

const esquemaNueva = z
  .object({
    titulo: z.string().trim().min(1, 'Ponele un título al producto'),
    partir: z.enum(['blanco', 'copiar']),
    producto_id: z.string().nullable(),
  })
  .refine((v) => v.partir === 'blanco' || v.producto_id !== null, {
    message: 'Elegí el producto que querés copiar',
    path: ['producto_id'],
  });

type ValoresNueva = {
  titulo: string;
  partir: 'blanco' | 'copiar';
  producto_id: string | null;
};

function NuevaCotizacion({
  abierta,
  onCerrar,
  productos,
  vigenciaDias,
}: {
  abierta: boolean;
  onCerrar: () => void;
  productos: CostoProducto[];
  vigenciaDias: number;
}) {
  const crear = useCrearCotizacion();
  const navigate = useNavigate();
  const form = useForm<ValoresNueva>({
    mode: 'controlled',
    initialValues: { titulo: '', partir: 'blanco', producto_id: null },
    validate: zod4Resolver(esquemaNueva),
  });

  const cerrar = () => {
    form.reset();
    onCerrar();
  };

  const enviar = form.onSubmit((v) =>
    crear.mutate(
      {
        titulo: v.titulo.trim(),
        vigencia_dias: vigenciaDias,
        producto_base_id: v.partir === 'copiar' ? v.producto_id : null,
      },
      {
        onSuccess: (id) => {
          form.reset();
          onCerrar();
          void navigate(`/cotizaciones/${id}`);
        },
      },
    ),
  );

  return (
    <Modal opened={abierta} onClose={cerrar} title="Nueva cotización" size="lg" centered>
      <form onSubmit={enviar}>
        <Stack gap="md">
          <TextInput
            label="Título del producto"
            placeholder="Protector solar para manos 60 g"
            size="md"
            withAsterisk
            {...form.getInputProps('titulo')}
          />
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Partir de
            </Text>
            <SegmentedControl
              fullWidth
              size="md"
              value={form.values.partir}
              onChange={(v) => form.setFieldValue('partir', v as ValoresNueva['partir'])}
              data={[
                { label: 'Hoja en blanco', value: 'blanco' },
                { label: 'Copiar un producto', value: 'copiar' },
              ]}
            />
          </Stack>
          {form.values.partir === 'copiar' ? (
            <Select
              label="Producto a copiar"
              placeholder="Buscá por código o nombre"
              size="md"
              searchable
              nothingFoundMessage="Ningún producto"
              data={productos.map((p) => ({
                value: p.producto_id,
                label: `${p.codigo_interno} — ${p.nombre}${p.faltantes > 0 ? ' · costo incompleto' : ''}`,
              }))}
              {...form.getInputProps('producto_id')}
            />
          ) : null}
          <Text size="sm" c="dimmed">
            Copiar un producto no lo cambia.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" size="md" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" size="md" loading={crear.isPending}>
              Crear cotización
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function PaginaCotizaciones() {
  const cotizaciones = useCotizaciones();
  const clientes = useClientes();
  const potenciales = useClientesPotenciales();
  const productos = useCostosProducto();
  const parametros = useParametrosCosto();
  const puedeCotizar = useTieneRol(...ROLES_COTIZAN);
  const [seccion, setSeccion] = useState<Seccion>('clientes');
  const [estado, setEstado] = useState<EstadoCotizacion | 'TODAS'>('TODAS');
  const [destino, setDestino] = useState<DestinoCotizacion | 'TODOS'>('TODOS');
  const [texto, setTexto] = useDebouncedState('', 250);
  const [desde, setDesde] = useState<Date | null>(null);
  const [hasta, setHasta] = useState<Date | null>(null);
  const [abierta, setAbierta] = useState(false);

  if (cotizaciones.isLoading || clientes.isLoading || potenciales.isLoading) {
    return <Skeleton h={300} />;
  }

  const lista = cotizaciones.data ?? [];
  const nombres = new Map(
    (clientes.data ?? []).map((c) => [c.id, c.razon_social] as const),
  );
  const potencialesPorId = new Map(
    (potenciales.data ?? []).map((p) => [p.id, p.razon_social] as const),
  );
  const nombreDe = (c: Cotizacion): string | null => {
    if (c.destino === 'CLIENTE' && c.cliente_id) return nombres.get(c.cliente_id) ?? null;
    if (c.destino === 'POTENCIAL' && c.cliente_potencial_id)
      return potencialesPorId.get(c.cliente_potencial_id) ?? null;
    return null;
  };

  const inicio = desde
    ? new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
    : null;
  // Fin exclusivo: el «hasta» incluye todo el día elegido.
  const fin = hasta
    ? new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + 1)
    : null;
  const busqueda = texto.trim().toLowerCase();
  const hoy = fechaISO(new Date()) ?? '';

  const visibles = lista.filter((c) => {
    if ((seccion === 'interno') !== (c.destino === 'INTERNO')) return false;
    if (estado !== 'TODAS' && c.estado !== estado) return false;
    if (destino !== 'TODOS' && c.destino !== destino) return false;
    const creado = new Date(c.creado_en);
    if (inicio && creado < inicio) return false;
    if (fin && creado >= fin) return false;
    if (busqueda) {
      const enTitulo = c.titulo.toLowerCase().includes(busqueda);
      const enCliente = (nombreDe(c) ?? '').toLowerCase().includes(busqueda);
      if (!enTitulo && !enCliente) return false;
    }
    return true;
  });

  return (
    <Stack gap="lg">
      <EncabezadoPagina
        titulo="Cotizaciones"
        descripcion="Armá el costo de un producto (exista o no), fijá precio o margen y emití el PDF para el cliente. Una cotización emitida no se edita: se duplica."
        {...(puedeCotizar
          ? {
              acciones: (
                <Button
                  size="lg"
                  leftSection={<IconPlus size={18} />}
                  onClick={() => setAbierta(true)}
                >
                  Nueva cotización
                </Button>
              ),
            }
          : {})}
      />

      <SegmentedControl
        size="md"
        value={seccion}
        onChange={(v) => setSeccion(v as Seccion)}
        data={[
          { label: 'Para clientes', value: 'clientes' },
          { label: 'Uso interno', value: 'interno' },
        ]}
      />

      <Group align="flex-end" wrap="wrap" gap="sm">
        <SegmentedControl
          size="md"
          value={estado}
          onChange={(v) => setEstado(v as EstadoCotizacion | 'TODAS')}
          data={[
            { label: 'Todas', value: 'TODAS' },
            { label: 'Borradores', value: 'BORRADOR' },
            { label: 'Emitidas', value: 'EMITIDA' },
            { label: 'Anuladas', value: 'ANULADA' },
          ]}
        />
        {seccion === 'clientes' ? (
          <Select
            size="md"
            w={190}
            allowDeselect={false}
            value={destino}
            onChange={(v) => setDestino((v ?? 'TODOS') as DestinoCotizacion | 'TODOS')}
            data={[
              { value: 'TODOS', label: 'Todos los destinos' },
              { value: 'CLIENTE', label: 'Clientes' },
              { value: 'POTENCIAL', label: 'Potenciales' },
            ]}
          />
        ) : null}
        <TextInput
          size="md"
          placeholder="Título o cliente"
          leftSection={<IconSearch size={17} />}
          defaultValue={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          w={{ base: '100%', sm: 260 }}
        />
        <DateInput
          size="md"
          label="Desde"
          valueFormat="DD/MM/YYYY"
          clearable
          w={150}
          value={desde}
          onChange={(v) => setDesde(desdeCalendario(v))}
        />
        <DateInput
          size="md"
          label="Hasta"
          valueFormat="DD/MM/YYYY"
          clearable
          w={150}
          value={hasta}
          onChange={(v) => setHasta(desdeCalendario(v))}
        />
      </Group>

      {lista.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconFileText}
            titulo="Todavía no hay cotizaciones."
            descripcion="Empezá con «Nueva cotización»: podés partir de un producto existente o de una hoja en blanco."
          />
        </Paper>
      ) : visibles.length === 0 ? (
        <Paper withBorder style={ESTILO_BORDE}>
          <Vacio
            icono={IconSearch}
            titulo="Ninguna cotización coincide"
            descripcion="Probá con otro filtro o con otro texto."
          />
        </Paper>
      ) : (
        <Paper withBorder style={{ ...ESTILO_BORDE, overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={1100}>
            <Table verticalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N.º</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Para</Table.Th>
                  <Table.Th ta="right">Precio unitario</Table.Th>
                  <Table.Th ta="right">Margen</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Vence</Table.Th>
                  <Table.Th>Emitió</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.map((c) => {
                  const precio = c.foto?.pdf.precio_unitario ?? c.precio_unitario;
                  const vencida =
                    c.estado === 'EMITIDA' && c.vence_el !== null && c.vence_el < hoy;
                  const nombre = nombreDe(c);
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td ff="monospace">
                        {c.numero !== null && c.anio !== null
                          ? `${c.numero}/${c.anio}`
                          : 'borrador'}
                      </Table.Td>
                      <Table.Td>{fecha(c.emitida_en ?? c.creado_en)}</Table.Td>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={`/cotizaciones/${c.id}`}
                          fw={600}
                          size="md"
                        >
                          {c.titulo}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        {c.destino === 'INTERNO' ? (
                          <Badge color="gray" variant="light">
                            uso interno
                          </Badge>
                        ) : (
                          <Group gap={6} wrap="nowrap">
                            <Text span size="sm">
                              {nombre ?? '—'}
                            </Text>
                            {c.destino === 'POTENCIAL' ? (
                              <Badge color="violet" variant="light" size="sm">
                                potencial
                              </Badge>
                            ) : null}
                          </Group>
                        )}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {precio === null ? '—' : `$ ${numero(precio, 2)}`}
                      </Table.Td>
                      <Table.Td ta="right" ff="monospace">
                        {c.foto
                          ? `${numero(c.foto.margen_sobre_precio * 100, 1)} %`
                          : '—'}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ESTADO[c.estado].color} variant="light">
                          {ESTADO[c.estado].texto}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text span size="sm">
                            {c.vence_el ? fecha(new Date(`${c.vence_el}T00:00:00`)) : '—'}
                          </Text>
                          {vencida ? (
                            <Badge color="orange" variant="filled" size="sm">
                              vencida
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>{c.foto?.pdf.emitida_por ?? '—'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {puedeCotizar ? (
        <NuevaCotizacion
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          productos={productos.data ?? []}
          vigenciaDias={parametros.data?.vigencia_cotizacion_dias ?? 7}
        />
      ) : null}
    </Stack>
  );
}
