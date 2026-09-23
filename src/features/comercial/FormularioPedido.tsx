import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconInfoCircle, IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useProductos } from '@/lib/consultas';
import {
  useProductosConListaCargada,
  useRegistrarPedido,
  type PedidoRow,
} from '@/lib/consultasComercial';

/*
 * Derivado de las restricciones de la base (CLAUDE.md §6):
 * - `pedidos.numero` NOT NULL UNIQUE; `cliente` con CHECK de no vacío.
 * - `pedido_renglones.cantidad` CHECK > 0 y UNIQUE (pedido_id, producto_id):
 *   el mismo producto dos veces se rechaza, así que se avisa antes.
 */
const esquema = z.object({
  numero: z.string().trim().min(1, 'Poné el número del pedido.'),
  cliente: z.string().trim().min(1, 'Poné el cliente.'),
  fechaEntrega: z.string().nullable(),
  observaciones: z.string(),
  renglones: z
    .array(
      z.object({
        productoId: z.string().uuid('Elegí el producto.'),
        cantidad: z
          .number({ message: 'Indicá la cantidad.' })
          .positive('Tiene que ser mayor que cero.'),
      }),
    )
    .min(1, 'Agregá al menos un producto.')
    .superRefine((renglones, ctx) => {
      const vistos = new Set<string>();
      renglones.forEach((r, i) => {
        if (!r.productoId) return;
        if (vistos.has(r.productoId)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'productoId'],
            message:
              'Este producto ya está en el pedido: sumá la cantidad en una sola fila.',
          });
        }
        vistos.add(r.productoId);
      });
    }),
});

type Valores = z.infer<typeof esquema>;

interface Props {
  /** Pedidos existentes: sugieren el número siguiente y los clientes ya cargados. */
  pedidos: PedidoRow[];
  onCerrar: () => void;
}

/**
 * Siguiente número con el formato `P-0001`. Es una sugerencia editable: si dos
 * personas cargan a la vez y eligen el mismo, lo rechaza el UNIQUE de la base.
 */
function numeroSiguiente(pedidos: PedidoRow[]): string {
  const max = pedidos.reduce((m, p) => {
    const coincide = /^P-(\d+)$/.exec(p.numero.trim());
    return coincide ? Math.max(m, Number(coincide[1])) : m;
  }, 0);
  return `P-${String(max + 1).padStart(4, '0')}`;
}

/**
 * Carga de un pedido con todos sus productos en un solo formulario.
 *
 * Dos salidas: guardarlo en borrador —queda solo para quien lo carga, para
 * completarlo después— o enviarlo a producción, que es cuando Gerencia de
 * Producción lo ve en su bandeja como «para revisar».
 */
export function FormularioPedido({ pedidos, onCerrar }: Props) {
  const navigate = useNavigate();
  const productos = useProductos();
  const registrar = useRegistrarPedido();
  const conLista = useProductosConListaCargada();

  const form = useForm<Valores>({
    initialValues: {
      numero: numeroSiguiente(pedidos),
      cliente: '',
      fechaEntrega: null,
      observaciones: '',
      renglones: [{ productoId: '', cantidad: 0 }],
    },
    validate: zod4Resolver(esquema),
  });

  const clientes = useMemo(
    () =>
      [...new Set(pedidos.map((p) => p.cliente.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [pedidos],
  );

  // Primero los productos con lista de materiales: son los que el sistema puede
  // chequear contra el stock. Los demás se pueden pedir igual, pero Producción
  // no va a ver qué les falta.
  const opcionesProducto = useMemo(() => {
    const activos = (productos.data ?? []).filter((p) => p.activo);
    const opcion = (p: (typeof activos)[number]) => ({
      value: p.id,
      label: `${p.codigo_interno} · ${p.nombre}`,
    });
    const con = activos.filter((p) => conLista.data?.has(p.id)).map(opcion);
    const sin = activos.filter((p) => !conLista.data?.has(p.id)).map(opcion);
    return [
      { group: 'Con receta cargada', items: con },
      { group: 'Sin receta: no se puede chequear el stock', items: sin },
    ].filter((g) => g.items.length > 0);
  }, [productos.data, conLista.data]);

  const errorLista = form.errors.renglones;

  function enviar(v: Valores, confirmar: boolean) {
    registrar.mutate(
      {
        numero: v.numero.trim(),
        cliente: v.cliente.trim(),
        fechaEntrega: v.fechaEntrega,
        observaciones: v.observaciones.trim() || null,
        renglones: v.renglones,
        confirmar,
      },
      {
        onSuccess: ({ pedido }) => {
          onCerrar();
          void navigate(`/pedidos/${pedido.id}`);
        },
      },
    );
  }

  return (
    <form onSubmit={form.onSubmit((v) => enviar(v, false))}>
      <Stack gap="md">
        <Group grow align="flex-start" wrap="wrap">
          <TextInput
            label="Número"
            withAsterisk
            style={{ minWidth: 140 }}
            {...form.getInputProps('numero')}
          />
          <Autocomplete
            label="Cliente"
            withAsterisk
            placeholder="Nombre del cliente"
            data={clientes}
            style={{ minWidth: 220 }}
            {...form.getInputProps('cliente')}
          />
        </Group>

        <DateInput
          label="Entrega comprometida"
          description="Sirve para ordenar la bandeja de Producción y como fecha límite de las compras."
          valueFormat="DD/MM/YYYY"
          placeholder="Sin fecha"
          clearable
          minDate={new Date()}
          {...form.getInputProps('fechaEntrega')}
        />

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Productos
          </Text>
          {form.values.renglones.map((_, i) => (
            <Paper
              key={i}
              withBorder
              p="sm"
              style={{ borderColor: 'var(--superficie-borde)' }}
            >
              <Group align="flex-start" wrap="nowrap" gap="sm">
                <Select
                  aria-label={`Producto ${i + 1}`}
                  placeholder={
                    productos.isLoading
                      ? 'Cargando productos…'
                      : 'Buscá por código o nombre'
                  }
                  searchable
                  limit={50}
                  nothingFoundMessage="Sin coincidencias"
                  data={opcionesProducto}
                  style={{ flex: 1, minWidth: 0 }}
                  {...form.getInputProps(`renglones.${i}.productoId`)}
                />
                <NumberInput
                  aria-label={`Cantidad ${i + 1}`}
                  placeholder="Unid."
                  min={1}
                  allowDecimal={false}
                  hideControls
                  w={100}
                  {...form.getInputProps(`renglones.${i}.cantidad`)}
                />
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="xl"
                  aria-label="Quitar producto"
                  disabled={form.values.renglones.length === 1}
                  onClick={() => form.removeListItem('renglones', i)}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
          {typeof errorLista === 'string' ? (
            <Text size="sm" c="red">
              {errorLista}
            </Text>
          ) : null}
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              form.insertListItem('renglones', { productoId: '', cantidad: 0 })
            }
            style={{ alignSelf: 'flex-start' }}
          >
            Agregar otro producto
          </Button>
        </Stack>

        <Textarea
          label="Observaciones"
          autosize
          minRows={2}
          placeholder="Condiciones, forma de entrega, lo que Producción tenga que saber."
          {...form.getInputProps('observaciones')}
        />

        <Alert
          color="violeta"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          «Guardar borrador» lo deja solo para vos, para completarlo después. «Enviar a
          producción» lo pone en la bandeja de Gerencia de Producción para que revise si
          hay que comprar algo.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="default"
            loading={registrar.isPending && registrar.variables?.confirmar === false}
            disabled={registrar.isPending}
          >
            Guardar borrador
          </Button>
          <Button
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
            leftSection={<IconSend size={16} />}
            loading={registrar.isPending && registrar.variables?.confirmar === true}
            disabled={registrar.isPending}
            onClick={() => form.onSubmit((v) => enviar(v, true))()}
          >
            Enviar a producción
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
