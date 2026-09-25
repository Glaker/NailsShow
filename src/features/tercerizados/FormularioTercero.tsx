import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  Button,
  CheckIcon,
  ColorSwatch,
  Group,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  COLORES_TERCERO,
  useGuardarTercero,
  type Tercero,
} from '@/lib/consultasTercerizados';

/*
 * Derivado de gmp.terceros (20260924150100): nombre no vacío y único sin
 * distinguir mayúsculas (lo controla el índice; acá solo se exige que haya
 * nombre), color de la paleta.
 */
const esquema = z.object({
  nombre: z.string().trim().min(1, 'Poné el nombre del cliente.'),
  color: z.enum(COLORES_TERCERO),
  observaciones: z.string(),
  activo: z.boolean(),
});

type Valores = z.infer<typeof esquema>;

/** Alta y edición de un cliente tercerizado: nombre y color de su cuadrito. */
export function FormularioTercero({
  tercero,
  onListo,
}: {
  tercero: Tercero | null;
  onListo: (t: Tercero) => void;
}) {
  const guardar = useGuardarTercero();
  const colorInicial = (COLORES_TERCERO as readonly string[]).includes(
    tercero?.color ?? '',
  )
    ? (tercero!.color as Valores['color'])
    : COLORES_TERCERO[0];
  const form = useForm<Valores>({
    initialValues: {
      nombre: tercero?.nombre ?? '',
      color: colorInicial,
      observaciones: tercero?.observaciones ?? '',
      activo: tercero?.activo ?? true,
    },
    validate: zod4Resolver(esquema),
  });

  return (
    <form
      onSubmit={form.onSubmit((v) =>
        guardar.mutate(
          {
            id: tercero?.id ?? null,
            datos: {
              nombre: v.nombre.trim(),
              color: v.color,
              observaciones: v.observaciones.trim() || null,
              ...(tercero ? { activo: v.activo } : {}),
            },
          },
          { onSuccess: onListo },
        ),
      )}
    >
      <Stack gap="md">
        <TextInput
          label="Nombre"
          withAsterisk
          placeholder="Por ejemplo: Navi"
          {...form.getInputProps('nombre')}
        />
        <div>
          <Text size="sm" fw={500} mb={6}>
            Color del cuadrito
          </Text>
          <Group gap="sm">
            {COLORES_TERCERO.map((c) => (
              <ColorSwatch
                key={c}
                component="button"
                type="button"
                size={40}
                color={`var(--mantine-color-${c}-6)`}
                aria-label={c}
                onClick={() => form.setFieldValue('color', c)}
                style={{ cursor: 'pointer', color: '#fff' }}
              >
                {form.values.color === c ? <CheckIcon style={{ width: 16 }} /> : null}
              </ColorSwatch>
            ))}
          </Group>
        </div>
        <Textarea
          label="Observaciones"
          autosize
          minRows={2}
          placeholder="Contacto, condiciones, lo que Producción tenga que saber."
          {...form.getInputProps('observaciones')}
        />
        {tercero ? (
          <Switch
            label="Activo"
            {...form.getInputProps('activo', { type: 'checkbox' })}
          />
        ) : null}
        <Group justify="flex-end">
          <Button type="submit" loading={guardar.isPending}>
            {tercero ? 'Guardar' : 'Dar de alta'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
