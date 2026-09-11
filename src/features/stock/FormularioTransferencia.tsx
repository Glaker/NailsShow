import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import {
  useDepositos,
  useTransferirDeposito,
  type ExistenciaLote,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';

const esquema = z.object({
  destinoId: z.string().uuid('Elegí el depósito de destino.'),
  cantidad: z
    .number({ message: 'Indicá la cantidad.' })
    .positive('Tiene que ser mayor que cero.'),
  motivo: z.string().trim().min(5, 'Escribí por qué se mueve el material.'),
});

type Valores = z.infer<typeof esquema>;

interface Props {
  posicion: ExistenciaLote;
  onListo: () => void;
}

/**
 * Traslado de material entre depósitos.
 *
 * Las dos patas —la salida del origen y la entrada al destino— las escribe una
 * sola función de base en una sola transacción. Hacerlo con dos llamadas desde
 * acá dejaría, ante un fallo en la segunda, material que salió de un depósito
 * y no llegó a ninguno.
 */
export function FormularioTransferencia({ posicion, onListo }: Props) {
  const depositos = useDepositos();
  const transferir = useTransferirDeposito();
  const saldo = Number(posicion.saldo ?? 0);

  const form = useForm<Valores>({
    initialValues: { destinoId: '', cantidad: 0, motivo: '' },
    validate: zod4Resolver(esquema),
  });

  const destinos = (depositos.data ?? [])
    .filter((d) => d.activo && d.id !== posicion.deposito_id)
    .map((d) => ({ value: d.id, label: `${d.numero} · ${d.nombre}` }));

  const excede = form.values.cantidad > saldo;

  return (
    <form
      onSubmit={form.onSubmit((v) => {
        transferir.mutate(
          {
            loteId: posicion.lote_insumo_id!,
            origenId: posicion.deposito_id!,
            destinoId: v.destinoId,
            cantidad: v.cantidad,
            motivo: v.motivo,
          },
          { onSuccess: onListo },
        );
      })}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Sale de <b>{posicion.deposito_nombre}</b>, donde hay{' '}
          <b>
            {numero(saldo, 3)} {posicion.unidad}
          </b>{' '}
          del lote {posicion.numero_registro_interno}.
        </Text>

        <Select
          label="Depósito de destino"
          withAsterisk
          searchable
          data={destinos}
          {...form.getInputProps('destinoId')}
        />

        <NumberInput
          label={`Cantidad en ${posicion.unidad ?? 'unidades'}`}
          withAsterisk
          min={0}
          max={saldo}
          decimalScale={3}
          hideControls
          {...form.getInputProps('cantidad')}
        />

        <Textarea
          label="Motivo"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Por ejemplo: liberado por Control de Calidad, pasa a depósito de aprobados."
          {...form.getInputProps('motivo')}
        />

        <Alert color="violeta" variant="light" radius="md">
          El lote puede quedar repartido entre dos depósitos, y está bien: la existencia
          se lleva por depósito. Lo que no se puede es mover más de lo que hay en el
          origen.
        </Alert>

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onListo}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
            loading={transferir.isPending}
            disabled={excede}
          >
            Transferir
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
