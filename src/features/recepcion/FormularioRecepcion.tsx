import { useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  IconAlertTriangle,
  IconFlame,
  IconPlus,
  IconTrash,
  IconFileCheck,
  IconScale,
} from '@tabler/icons-react';
import {
  useCrearRecepcion,
  useInsumos,
  useProveedores,
  type Insumo,
} from '@/lib/consultas';
import { fechaISO } from '@/lib/formato';

/*
 * Esquema derivado de las restricciones reales de la base. La aplicación
 * duplica la validación para dar buenos mensajes, pero la autoridad es la base
 * (CLAUDE.md §6): cada regla de acá tiene su CHECK o su trigger del otro lado.
 */
const esquemaLote = z.object({
  insumo_id: z.string().min(1, 'Elegí el insumo'),
  lote_proveedor: z.string().trim().min(1, 'Falta el lote del proveedor'),
  cantidad_bultos: z.number().int().positive('Al menos un bulto'),
  cantidad_unidades: z.number().nonnegative().nullable(),
  unidad: z.string().trim().min(1, 'Falta la unidad'),
  plazo_validez: z.date().nullable(),
  /* 'si' | 'no' | 'na' — I.20.1 paso 3 admite que no aplique. */
  peso_bultos: z.enum(['si', 'no', 'na']),
  unidades_contadas: z.number().nonnegative().nullable(),
  planchas_etiquetas: z.number().int().nonnegative().nullable(),
  etiquetas_por_plancha: z.number().int().nonnegative().nullable(),
  protocolo_recibido: z.boolean(),
  peso_pigmento_kg: z.number().nonnegative().nullable(),
  contenedores_limpiados: z.boolean(),
});

const esquemaRecepcion = z.object({
  proveedor_id: z.string().min(1, 'Elegí el proveedor'),
  proveedor_nuevo: z.boolean(),
  numero_remito: z.string().trim().min(1, 'Falta el número de remito'),
  coincide_con_pedido: z.boolean(),
  observaciones: z.string(),
  rotularEnCuarentena: z.boolean(),
  lotes: z.array(esquemaLote).min(1, 'Cargá al menos un lote'),
});

type ValoresRecepcion = z.infer<typeof esquemaRecepcion>;

const LOTE_VACIO = {
  insumo_id: '',
  lote_proveedor: '',
  cantidad_bultos: 1,
  cantidad_unidades: null,
  unidad: 'kg',
  plazo_validez: null,
  peso_bultos: 'na' as const,
  unidades_contadas: null,
  planchas_etiquetas: null,
  etiquetas_por_plancha: null,
  protocolo_recibido: false,
  peso_pigmento_kg: null,
  contenedores_limpiados: false,
};

interface Props {
  onListo: () => void;
}

export function FormularioRecepcion({ onListo }: Props) {
  const proveedores = useProveedores();
  const insumos = useInsumos();
  const crear = useCrearRecepcion();

  const form = useForm<ValoresRecepcion>({
    mode: 'controlled',
    initialValues: {
      proveedor_id: '',
      proveedor_nuevo: false,
      numero_remito: '',
      coincide_con_pedido: true,
      observaciones: '',
      rotularEnCuarentena: true,
      lotes: [{ ...LOTE_VACIO }],
    },
    validate: zod4Resolver(esquemaRecepcion),
  });

  const porId = useMemo(() => {
    const mapa = new Map<string, Insumo>();
    for (const i of insumos.data ?? []) mapa.set(i.id, i);
    return mapa;
  }, [insumos.data]);

  const opcionesProveedor = (proveedores.data ?? [])
    .filter((p) => p.activo)
    .map((p) => ({
      value: p.id,
      label:
        p.estado_aprobacion === 'APROBADO'
          ? p.razon_social
          : `${p.razon_social} · ${p.estado_aprobacion.toLowerCase()}`,
    }));

  const opcionesInsumo = (insumos.data ?? [])
    .filter((i) => i.activo)
    .map((i) => ({ value: i.id, label: `${i.codigo_interno} — ${i.nombre}` }));

  const enviar = form.onSubmit(async (valores) => {
    /* Validaciones que dependen de la ficha del insumo y por eso no entran en
       el esquema estático. Todas tienen su trigger equivalente en la base. */
    let hayError = false;
    valores.lotes.forEach((lote, i) => {
      const insumo = porId.get(lote.insumo_id);
      if (!insumo) return;
      if (lote.peso_bultos === 'no' && lote.unidades_contadas === null) {
        form.setFieldError(
          `lotes.${i}.unidades_contadas`,
          'RN-02: si los bultos no pesan parecido, hay que abrirlos y contar las unidades.',
        );
        hayError = true;
      }
      if (insumo.requiere_protocolo && !lote.protocolo_recibido) {
        form.setFieldError(
          `lotes.${i}.protocolo_recibido`,
          'RN-01: sin protocolo de análisis del fabricante no se recepciona.',
        );
        hayError = true;
      }
      if (insumo.requiere_pesada_recepcion && lote.peso_pigmento_kg === null) {
        form.setFieldError(
          `lotes.${i}.peso_pigmento_kg`,
          'RN-03: este insumo se pesa durante la recepción.',
        );
        hayError = true;
      }
      if (valores.rotularEnCuarentena && !lote.contenedores_limpiados) {
        form.setFieldError(
          `lotes.${i}.contenedores_limpiados`,
          'I.20.1: los contenedores se limpian antes de ingresar a cuarentena.',
        );
        hayError = true;
      }
    });
    if (hayError) return;

    await crear.mutateAsync({
      proveedor_id: valores.proveedor_id,
      proveedor_nuevo: valores.proveedor_nuevo,
      numero_remito: valores.numero_remito.trim(),
      coincide_con_pedido: valores.coincide_con_pedido,
      observaciones: valores.observaciones.trim() || null,
      rotularEnCuarentena: valores.rotularEnCuarentena,
      lotes: valores.lotes.map((l) => ({
        insumo_id: l.insumo_id,
        lote_proveedor: l.lote_proveedor.trim(),
        cantidad_bultos: l.cantidad_bultos,
        cantidad_unidades: l.cantidad_unidades,
        unidad: l.unidad.trim(),
        plazo_validez: fechaISO(l.plazo_validez),
        bultos_peso_similar: l.peso_bultos === 'na' ? null : l.peso_bultos === 'si',
        unidades_contadas: l.unidades_contadas,
        planchas_etiquetas: l.planchas_etiquetas,
        etiquetas_por_plancha: l.etiquetas_por_plancha,
        protocolo_recibido: l.protocolo_recibido,
        peso_pigmento_kg: l.peso_pigmento_kg,
        contenedores_limpiados: l.contenedores_limpiados,
      })),
    });

    onListo();
  });

  return (
    <form onSubmit={enviar}>
      <ScrollArea.Autosize mah="65vh" offsetScrollbars>
        <Stack gap="lg" pr="xs">
          <Stack gap="md">
            <Title order={4}>Remito</Title>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, sm: 7 }}>
                <Select
                  label="Proveedor"
                  placeholder="Buscar proveedor"
                  data={opcionesProveedor}
                  searchable
                  nothingFoundMessage="Sin coincidencias. Dalo de alta en Proveedores."
                  {...form.getInputProps('proveedor_id')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 5 }}>
                <TextInput
                  label="N° de remito"
                  placeholder="0001-00012345"
                  {...form.getInputProps('numero_remito')}
                />
              </Grid.Col>
            </Grid>

            <Group gap="xl" wrap="wrap">
              <Switch
                label="Coincide con lo pedido"
                description="I.20.1 paso 2"
                {...form.getInputProps('coincide_con_pedido', { type: 'checkbox' })}
              />
              <Switch
                label="Proveedor nuevo"
                description="Primera compra a este proveedor"
                {...form.getInputProps('proveedor_nuevo', { type: 'checkbox' })}
              />
            </Group>

            {!form.values.coincide_con_pedido ? (
              <Alert
                color="estadoCuarentena"
                variant="light"
                icon={<IconAlertTriangle size={18} />}
                radius="md"
              >
                Si lo recibido no coincide con lo pedido, dejá el detalle en
                observaciones: es el dato que después sostiene el reclamo al proveedor.
              </Alert>
            ) : null}

            <Textarea
              label="Observaciones"
              placeholder="Faltantes, roturas, diferencias con el remito…"
              autosize
              minRows={2}
              {...form.getInputProps('observaciones')}
            />
          </Stack>

          <Divider />

          <Group justify="space-between">
            <Title order={4}>Lotes recibidos</Title>
            <Button
              variant="light"
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => form.insertListItem('lotes', { ...LOTE_VACIO })}
            >
              Agregar lote
            </Button>
          </Group>

          {form.values.lotes.map((lote, i) => {
            const insumo = porId.get(lote.insumo_id);
            const esEtiqueta = insumo?.tipo === 'ETIQUETA';

            return (
              <Paper
                key={i}
                withBorder
                p="md"
                radius="md"
                style={{ borderColor: 'var(--superficie-borde)' }}
                className="entrada"
              >
                <Group justify="space-between" mb="sm">
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      Lote {i + 1}
                    </Text>
                    {insumo?.es_inflamable ? (
                      <Tooltip label="RN-48: va al depósito exterior de inflamables">
                        <IconFlame
                          size={17}
                          color="var(--mantine-color-estadoRechazado-6)"
                        />
                      </Tooltip>
                    ) : null}
                    {insumo?.requiere_protocolo ? (
                      <Tooltip label="RN-01: exige protocolo de análisis">
                        <IconFileCheck size={17} color="var(--mantine-color-violeta-6)" />
                      </Tooltip>
                    ) : null}
                    {insumo?.requiere_pesada_recepcion ? (
                      <Tooltip label="RN-03: se pesa en la recepción">
                        <IconScale size={17} color="var(--mantine-color-violeta-6)" />
                      </Tooltip>
                    ) : null}
                  </Group>
                  {form.values.lotes.length > 1 ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="md"
                      aria-label="Quitar lote"
                      onClick={() => form.removeListItem('lotes', i)}
                    >
                      <IconTrash size={17} />
                    </ActionIcon>
                  ) : null}
                </Group>

                <Grid gutter="sm">
                  <Grid.Col span={{ base: 12, sm: 7 }}>
                    <Select
                      label="Insumo"
                      placeholder="Buscar en el catálogo"
                      data={opcionesInsumo}
                      searchable
                      nothingFoundMessage="Sin coincidencias"
                      {...form.getInputProps(`lotes.${i}.insumo_id`)}
                      onChange={(valor) => {
                        form.setFieldValue(`lotes.${i}.insumo_id`, valor ?? '');
                        const elegido = valor ? porId.get(valor) : undefined;
                        if (elegido) {
                          form.setFieldValue(`lotes.${i}.unidad`, elegido.unidad_medida);
                        }
                      }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 5 }}>
                    <TextInput
                      label="Lote del proveedor"
                      placeholder="Como figura en el envase"
                      {...form.getInputProps(`lotes.${i}.lote_proveedor`)}
                    />
                  </Grid.Col>

                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <NumberInput
                      label="Bultos"
                      min={1}
                      allowDecimal={false}
                      {...form.getInputProps(`lotes.${i}.cantidad_bultos`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <NumberInput
                      label="Cantidad"
                      min={0}
                      decimalScale={3}
                      {...form.getInputProps(`lotes.${i}.cantidad_unidades`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <TextInput
                      label="Unidad"
                      {...form.getInputProps(`lotes.${i}.unidad`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <DateInput
                      label="Plazo de validez"
                      placeholder="dd/mm/aaaa"
                      valueFormat="DD/MM/YYYY"
                      clearable
                      {...form.getInputProps(`lotes.${i}.plazo_validez`)}
                    />
                  </Grid.Col>

                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Text size="sm" fw={500} mb={6}>
                      ¿Los bultos pesan parecido?
                    </Text>
                    <SegmentedControl
                      fullWidth
                      data={[
                        { label: 'Sí', value: 'si' },
                        { label: 'No', value: 'no' },
                        { label: 'No aplica', value: 'na' },
                      ]}
                      {...form.getInputProps(`lotes.${i}.peso_bultos`)}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      I.20.1 paso 3
                    </Text>
                  </Grid.Col>

                  {lote.peso_bultos === 'no' ? (
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <NumberInput
                        label="Unidades contadas"
                        description="RN-02: bulto disparejo se abre y se cuenta"
                        min={0}
                        decimalScale={3}
                        {...form.getInputProps(`lotes.${i}.unidades_contadas`)}
                      />
                    </Grid.Col>
                  ) : null}

                  {esEtiqueta ? (
                    <>
                      <Grid.Col span={{ base: 6, sm: 3 }}>
                        <NumberInput
                          label="Planchas"
                          min={0}
                          allowDecimal={false}
                          {...form.getInputProps(`lotes.${i}.planchas_etiquetas`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 3 }}>
                        <NumberInput
                          label="Etiquetas por plancha"
                          min={0}
                          allowDecimal={false}
                          {...form.getInputProps(`lotes.${i}.etiquetas_por_plancha`)}
                        />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 6 }}>
                        <Text size="sm" fw={500} mb={6}>
                          Total de etiquetas
                        </Text>
                        <Text size="lg" fw={700} c="violeta.7">
                          {(lote.planchas_etiquetas ?? 0) *
                            (lote.etiquetas_por_plancha ?? 0)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          RN-44: lo calcula la base, acá solo se previsualiza
                        </Text>
                      </Grid.Col>
                    </>
                  ) : null}

                  {insumo?.requiere_pesada_recepcion ? (
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <NumberInput
                        label="Peso del pigmento (kg)"
                        description="RN-03: se pesa antes de continuar"
                        min={0}
                        decimalScale={4}
                        {...form.getInputProps(`lotes.${i}.peso_pigmento_kg`)}
                      />
                    </Grid.Col>
                  ) : null}

                  <Grid.Col span={12}>
                    <Stack gap="xs" mt={4}>
                      {insumo?.requiere_protocolo ? (
                        <Checkbox
                          label="Protocolo de análisis del fabricante recibido"
                          description="RN-01, I.20.1 paso 5. Sin esto no se recepciona."
                          {...form.getInputProps(`lotes.${i}.protocolo_recibido`, {
                            type: 'checkbox',
                          })}
                        />
                      ) : null}
                      <Checkbox
                        label="Contenedores limpiados"
                        description="I.20.1: se limpian antes de ingresar a depósito"
                        {...form.getInputProps(`lotes.${i}.contenedores_limpiados`, {
                          type: 'checkbox',
                        })}
                      />
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Paper>
            );
          })}

          {typeof form.errors.lotes === 'string' ? (
            <Text c="red" size="sm">
              {form.errors.lotes}
            </Text>
          ) : null}
        </Stack>
      </ScrollArea.Autosize>

      <Divider my="md" />

      <Stack gap="md">
        <Switch
          label="Emitir rótulo de cuarentena al guardar"
          description="I.20.2: el material entra a cuarentena rotulado en amarillo. Se puede hacer después desde el lote."
          {...form.getInputProps('rotularEnCuarentena', { type: 'checkbox' })}
        />
        <Group justify="flex-end">
          <Button
            variant="subtle"
            color="gray"
            onClick={onListo}
            disabled={crear.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={crear.isPending}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            Registrar recepción
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
