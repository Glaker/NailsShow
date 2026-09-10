import { useMemo } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import {
  useRegistrarMuestreo,
  type DestinoMuestra,
  type LoteVista,
} from '@/lib/consultas';

/*
 * Tamaño de muestra sugerido (RN-08) y destino del sobrante (RN-11).
 *
 * Los dos los calcula la base —`gmp.tamano_muestra_sugerido()` y
 * `gmp.destino_sobrante_sugerido()`— y son la autoridad. Acá se repiten para
 * poder mostrar el número antes de enviar nada, que es lo que le permite a
 * quien muestrea comparar lo sugerido con lo que efectivamente va a tomar.
 * Si alguna vez discrepan, manda la base: ella guarda `cantidad_calculada`.
 */
function sugerencia(lote: LoteVista): {
  cantidad: number | null;
  unidad: string;
  criterio: string;
  destino: DestinoMuestra;
} {
  const tipo = lote.insumo_tipo;

  if (tipo === 'MATERIA_PRIMA') {
    return {
      cantidad: 1,
      unidad: 'tubo de ensayo',
      criterio: 'Un tubo de ensayo (I.50.4)',
      destino: 'CONTRAMUESTRA',
    };
  }
  if (tipo === 'SEMIELABORADO') {
    return {
      cantidad: 1,
      unidad: 'tubo de ensayo',
      criterio: 'Un tubo de ensayo (I.50.4)',
      destino: 'CONTRAMUESTRA',
    };
  }
  /* Envase, empaque y etiqueta comparten el criterio del 5 %. */
  const cantidad =
    lote.cantidad_unidades === null
      ? null
      : Math.round(Number(lote.cantidad_unidades) * 0.05 * 1000) / 1000;
  return {
    cantidad,
    unidad: lote.unidad ?? '',
    criterio: '5 % de la cantidad recibida (I.50.4)',
    destino: 'REUTILIZACION_ENVASE',
  };
}

const DESTINOS: { value: DestinoMuestra; label: string }[] = [
  { value: 'CONTRAMUESTRA', label: 'Contramuestra' },
  { value: 'DESCARTE', label: 'Descarte' },
  { value: 'REUTILIZACION_ENVASE', label: 'Reutilización del envase' },
];

const esquema = z.object({
  cantidad_tomada: z.number().positive('La cantidad tomada tiene que ser mayor que cero'),
  unidad: z.string().trim().min(1, 'Falta la unidad'),
  area_muestreo: z.string().trim().min(2, 'Indicá dónde se tomó la muestra'),
  cantidad_contenedores: z.number().int().nonnegative('No puede ser negativo'),
  contenedor_integro: z.boolean(),
  contenedor_limpio: z.boolean(),
  rotulado_correcto: z.boolean(),
  lote_coincide_certificado: z.boolean(),
  destino_sobrante: z.enum(['CONTRAMUESTRA', 'DESCARTE', 'REUTILIZACION_ENVASE']),
  justificacion_cantidad: z.string(),
  circunstancia_inusual: z.string(),
  signos_no_conformidad: z.string(),
});

type Valores = z.infer<typeof esquema>;

interface Props {
  lote: LoteVista;
  onListo: () => void;
}

/**
 * Registro de muestreo (I.50.4).
 *
 * El orden de la pantalla es el orden del POE: primero las cinco
 * verificaciones previas, después la muestra. No es estético. Las cinco son
 * previas y bloqueantes: si el contenedor está roto o el rótulo no corresponde,
 * no se muestrea, y la base rechaza el registro. Ponerlas arriba evita que
 * alguien complete todo y recién al final descubra que no tenía que muestrear.
 */
export function FormularioMuestreo({ lote, onListo }: Props) {
  const registrar = useRegistrarMuestreo();
  const sug = useMemo(() => sugerencia(lote), [lote]);
  const exigeCertificado = Boolean(lote.requiere_protocolo);

  const form = useForm<Valores>({
    mode: 'controlled',
    initialValues: {
      cantidad_tomada: sug.cantidad ?? 0,
      unidad: sug.unidad,
      area_muestreo: '',
      cantidad_contenedores: lote.cantidad_bultos ?? 0,
      contenedor_integro: false,
      contenedor_limpio: false,
      rotulado_correcto: false,
      lote_coincide_certificado: false,
      destino_sobrante: sug.destino,
      justificacion_cantidad: '',
      circunstancia_inusual: '',
      signos_no_conformidad: '',
    },
    validate: zod4Resolver(esquema),
  });

  const desvia =
    sug.cantidad !== null && Number(form.values.cantidad_tomada) !== sug.cantidad;

  const verificacionesOk =
    form.values.contenedor_integro &&
    form.values.contenedor_limpio &&
    form.values.rotulado_correcto &&
    (!exigeCertificado || form.values.lote_coincide_certificado);

  const enviar = form.onSubmit(async (v) => {
    if (desvia && v.justificacion_cantidad.trim() === '') {
      form.setFieldError(
        'justificacion_cantidad',
        'RN-08: si te apartás del tamaño sugerido, hay que decir por qué.',
      );
      return;
    }

    await registrar.mutateAsync({
      loteId: lote.id!,
      cantidadTomada: v.cantidad_tomada,
      unidad: v.unidad.trim(),
      areaMuestreo: v.area_muestreo.trim(),
      contenedorIntegro: v.contenedor_integro,
      contenedorLimpio: v.contenedor_limpio,
      rotuladoCorrecto: v.rotulado_correcto,
      cantidadContenedores: v.cantidad_contenedores,
      destinoSobrante: v.destino_sobrante,
      loteCoincideCertificado: exigeCertificado ? v.lote_coincide_certificado : null,
      justificacionCantidad: v.justificacion_cantidad.trim() || null,
      circunstanciaInusual: v.circunstancia_inusual.trim() || null,
      signosNoConformidad: v.signos_no_conformidad.trim() || null,
    });

    onListo();
  });

  return (
    <form onSubmit={enviar}>
      <ScrollArea.Autosize mah="62vh" offsetScrollbars>
        <Stack gap="lg" pr="xs">
          <Paper
            withBorder
            p="md"
            radius="md"
            bg="violeta.0"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Text size="sm" fw={600}>
              {lote.insumo_nombre}
            </Text>
            <Text size="xs" c="dimmed">
              {lote.numero_registro_interno} · lote {lote.lote_proveedor} ·{' '}
              {lote.proveedor}
            </Text>
          </Paper>

          <Stack gap="sm">
            <div>
              <Title order={4}>Verificaciones previas</Title>
              <Text size="xs" c="dimmed">
                I.50.4, RN-10. Las cinco son obligatorias y bloqueantes: si alguna da mal,
                no se muestrea.
              </Text>
            </div>

            <Checkbox
              label="El contenedor está íntegro"
              {...form.getInputProps('contenedor_integro', { type: 'checkbox' })}
            />
            <Checkbox
              label="El contenedor está limpio"
              {...form.getInputProps('contenedor_limpio', { type: 'checkbox' })}
            />
            <Checkbox
              label="El rotulado es correcto"
              description="El rótulo del material corresponde a lo que dice el registro (I.20.2)"
              {...form.getInputProps('rotulado_correcto', { type: 'checkbox' })}
            />
            {exigeCertificado ? (
              <Checkbox
                label="El lote coincide con el certificado del proveedor"
                description="Este insumo se recibe con protocolo del fabricante, así que hay contra qué comparar"
                {...form.getInputProps('lote_coincide_certificado', { type: 'checkbox' })}
              />
            ) : (
              <Alert
                color="gray"
                variant="light"
                radius="md"
                icon={<IconInfoCircle size={17} />}
              >
                Este insumo no exige protocolo del fabricante, así que no hay certificado
                contra el cual comparar el lote. La cuarta verificación no aplica.
              </Alert>
            )}
            <NumberInput
              label="Cantidad de contenedores verificada"
              description="Quinta verificación de I.50.4"
              min={0}
              allowDecimal={false}
              {...form.getInputProps('cantidad_contenedores')}
            />

            {!verificacionesOk ? (
              <Alert
                color="estadoCuarentena"
                variant="light"
                radius="md"
                icon={<IconAlertTriangle size={18} />}
              >
                Mientras alguna verificación previa no esté conforme, no corresponde
                muestrear. Si el material está en mal estado o mal rotulado, lo que
                corresponde es abrir una no conformidad (PG.60.18), no tomar la muestra
                igual.
              </Alert>
            ) : null}
          </Stack>

          <Divider />

          <Stack gap="sm">
            <div>
              <Title order={4}>Muestra</Title>
              <Text size="xs" c="dimmed">
                Sugerido: {sug.cantidad ?? '—'} {sug.unidad} · {sug.criterio}
              </Text>
            </div>

            <Grid gutter="sm">
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <NumberInput
                  label="Cantidad tomada"
                  min={0}
                  decimalScale={3}
                  {...form.getInputProps('cantidad_tomada')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <TextInput label="Unidad" {...form.getInputProps('unidad')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select
                  label="Destino del sobrante"
                  description="RN-11"
                  data={DESTINOS}
                  allowDeselect={false}
                  {...form.getInputProps('destino_sobrante')}
                />
              </Grid.Col>
            </Grid>

            {desvia ? (
              <Textarea
                label="Justificación del tamaño de muestra"
                description="RN-08: el POE admite apartarse del criterio, pero no en silencio."
                placeholder="Por qué se tomó una cantidad distinta a la sugerida"
                autosize
                minRows={2}
                {...form.getInputProps('justificacion_cantidad')}
              />
            ) : null}

            <TextInput
              label="Área de muestreo"
              placeholder="Esclusa de muestreo, cabina de flujo laminar…"
              {...form.getInputProps('area_muestreo')}
            />

            <Textarea
              label="Circunstancia inusual"
              placeholder="Opcional. Cualquier cosa que se salió de lo habitual."
              autosize
              minRows={2}
              {...form.getInputProps('circunstancia_inusual')}
            />

            <Textarea
              label="Signos de no conformidad observados"
              description="Lo que se anota acá es lo que después sostiene una no conformidad (PG.60.18)."
              placeholder="Opcional."
              autosize
              minRows={2}
              {...form.getInputProps('signos_no_conformidad')}
            />
          </Stack>
        </Stack>
      </ScrollArea.Autosize>

      <Divider my="md" />

      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="xs" c="dimmed" maw={340}>
          Al guardar se emite la etiqueta R.50.4.1 de la muestra (RN-07) y el lote pasa a
          muestreado. El rótulo amarillo del material sigue puesto hasta el análisis.
        </Text>
        <Group gap="sm">
          <Button
            variant="subtle"
            color="gray"
            onClick={onListo}
            disabled={registrar.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={registrar.isPending}
            disabled={!verificacionesOk}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            Registrar muestreo
          </Button>
        </Group>
      </Group>
    </form>
  );
}
