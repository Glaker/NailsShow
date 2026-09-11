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
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  TEXTO_TIPO_MOVIMIENTO,
  TIPOS_MOVIMIENTO_MANUAL,
  useRegistrarMovimiento,
  type ExistenciaLote,
} from '@/lib/consultas';
import { numero } from '@/lib/formato';

/**
 * Movimiento manual sobre una posición de stock.
 *
 * Cubre las cuatro operaciones que hoy tienen circuito: ajuste de más, ajuste
 * de menos, descarte y salida de muestra. Las entradas por compra no se cargan
 * acá —vienen de la recepción— y el consumo de producción todavía no existe.
 *
 * La cantidad se pide siempre en positivo. El signo lo pone el tipo, igual que
 * en la base: pedirle a alguien que escriba «-5» en una pantalla de depósito
 * es pedirle que se equivoque.
 */
const esquema = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO_MANUAL),
  cantidad: z
    .number({ message: 'Indicá la cantidad.' })
    .positive('La cantidad tiene que ser mayor que cero.'),
  motivo: z
    .string()
    .trim()
    .min(10, 'Escribí el motivo: un movimiento sin explicación no se puede auditar.'),
});

type Valores = z.infer<typeof esquema>;

interface Props {
  posicion: ExistenciaLote;
  onListo: () => void;
}

export function FormularioMovimiento({ posicion, onListo }: Props) {
  const registrar = useRegistrarMovimiento();
  const form = useForm<Valores>({
    initialValues: { tipo: 'SALIDA_AJUSTE', cantidad: 0, motivo: '' },
    validate: zod4Resolver(esquema),
  });

  const saldo = Number(posicion.saldo ?? 0);
  const sale = form.values.tipo.startsWith('SALIDA');
  const excede = sale && form.values.cantidad > saldo;
  const impedimento = posicion.impedimento_despacho;
  /* RN-51 y RN-52: la salida de muestra dispone de material bueno, así que la
     base la exige despachable. El descarte y los ajustes no, porque son
     justamente las vías para sacar del medio lo que está mal. */
  const muestraBloqueada = form.values.tipo === 'SALIDA_MUESTRA' && Boolean(impedimento);

  return (
    <form
      onSubmit={form.onSubmit((v) => {
        registrar.mutate(
          {
            articuloId: posicion.articulo_id!,
            loteId: posicion.lote_insumo_id!,
            depositoId: posicion.deposito_id!,
            tipo: v.tipo,
            cantidad: v.cantidad,
            motivo: v.motivo,
          },
          { onSuccess: onListo },
        );
      })}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {posicion.insumo_nombre} · lote {posicion.numero_registro_interno} · depósito{' '}
          {posicion.deposito_numero}. Saldo actual{' '}
          <b>
            {numero(saldo, 3)} {posicion.unidad}
          </b>
          .
        </Text>

        <Select
          label="Tipo de movimiento"
          withAsterisk
          allowDeselect={false}
          data={TIPOS_MOVIMIENTO_MANUAL.map((t) => ({
            value: t,
            label: TEXTO_TIPO_MOVIMIENTO[t],
          }))}
          {...form.getInputProps('tipo')}
        />

        <NumberInput
          label={`Cantidad en ${posicion.unidad ?? 'unidades'}`}
          withAsterisk
          min={0}
          decimalScale={3}
          hideControls
          description="Siempre en positivo. El signo lo determina el tipo."
          {...form.getInputProps('cantidad')}
        />

        <Textarea
          label="Motivo"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Qué pasó y por qué corresponde este movimiento."
          {...form.getInputProps('motivo')}
        />

        {excede ? (
          <Alert
            color="estadoRechazado"
            variant="light"
            radius="md"
            icon={<IconAlertTriangle size={18} />}
          >
            En esta posición hay {numero(saldo, 3)} {posicion.unidad}. La base va a
            rechazar el movimiento: un saldo negativo no es un stock, es la prueba de que
            falta registrar algo. Si lo que hay no coincide con lo registrado, el camino
            es un ajuste de más.
          </Alert>
        ) : null}

        {muestraBloqueada ? (
          <Alert
            color="estadoRechazado"
            variant="light"
            radius="md"
            icon={<IconAlertTriangle size={18} />}
          >
            {impedimento}
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onListo}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
            loading={registrar.isPending}
            disabled={excede || muestraBloqueada}
          >
            Registrar movimiento
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
