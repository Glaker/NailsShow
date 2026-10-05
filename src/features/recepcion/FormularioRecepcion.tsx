import { useMemo, useState } from 'react';
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
import { useForm, type UseFormReturnType } from '@mantine/form';
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
import { fechaISO, numero } from '@/lib/formato';
import { useAvisosCompra, useVincularCompras } from '@/lib/consultasComercial';
import { discriminaIva, useRegistrarComprobanteProveedor } from '@/lib/consultasCompras';

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

/* Comprobante del proveedor (RN-65, 20260929100000). Mismas reglas que los
   CHECK de comercial.comprobantes_proveedor. */
const esquemaComprobante = z
  .object({
    tipo: z.enum(['FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'SIN_FACTURA']),
    punto_venta: z.number().int().min(1).max(99999).nullable(),
    numero: z.number().int().min(1).max(99999999).nullable(),
    fecha: z.date().nullable(),
    neto: z.number().nonnegative().nullable(),
    iva: z.number().nonnegative().nullable(),
    otros: z.number().nonnegative().nullable(),
    total: z.number().nonnegative().nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === 'SIN_FACTURA') return;
    if (c.punto_venta === null)
      ctx.addIssue({
        code: 'custom',
        path: ['punto_venta'],
        message: 'Falta el punto de venta',
      });
    if (c.numero === null)
      ctx.addIssue({ code: 'custom', path: ['numero'], message: 'Falta el número' });
    if (c.tipo === 'FACTURA_A') {
      if (c.neto === null)
        ctx.addIssue({
          code: 'custom',
          path: ['neto'],
          message: 'Falta el neto gravado',
        });
      if (c.iva === null)
        ctx.addIssue({ code: 'custom', path: ['iva'], message: 'Falta el IVA' });
    } else if (!c.total) {
      ctx.addIssue({ code: 'custom', path: ['total'], message: 'Falta el total' });
    }
  });

const esquemaRecepcion = z.object({
  proveedor_id: z.string().min(1, 'Elegí el proveedor'),
  comprobante: esquemaComprobante,
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
  const avisos = useAvisosCompra();
  const vincular = useVincularCompras();
  const registrarComprobante = useRegistrarComprobanteProveedor();
  /** Compras pendientes que llegaron con esta recepción: id → llegó completa. */
  const [compras, setCompras] = useState<Record<string, boolean>>({});

  const form = useForm<ValoresRecepcion>({
    mode: 'controlled',
    initialValues: {
      proveedor_id: '',
      proveedor_nuevo: false,
      comprobante: {
        tipo: 'FACTURA_A',
        punto_venta: null,
        numero: null,
        fecha: new Date(),
        neto: null,
        iva: null,
        otros: null,
        total: null,
      },
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

  /* El insumo sin unidad de medida confirmada aparece en la lista pero no se
     puede elegir: la base rechaza el lote (gmp.fn_validar_lote_insumo), y es
     preferible que el operario lo vea deshabilitado con el motivo a que lo
     busque, no lo encuentre y piense que falta en el catálogo. */
  const opcionesInsumo = (insumos.data ?? [])
    .filter((i) => i.activo)
    .map((i) => ({
      value: i.id,
      label: i.unidad_medida
        ? `${i.codigo_interno} — ${i.nombre}`
        : `${i.codigo_interno} — ${i.nombre} · sin unidad de medida definida`,
      disabled: !i.unidad_medida,
    }));

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

    const { recepcion, lotes } = await crear.mutateAsync({
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

    // La recepción física ya quedó; el comprobante es un registro aparte
    // (RN-65). Si falla, se avisa y se puede cargar después.
    const c = valores.comprobante;
    const sinFactura = c.tipo === 'SIN_FACTURA';
    const conIva = discriminaIva(c.tipo);
    const fechaFactura = sinFactura ? null : fechaISO(c.fecha);
    await registrarComprobante
      .mutateAsync({
        proveedor_id: valores.proveedor_id,
        recepcion_id: recepcion.id,
        tipo: c.tipo,
        punto_venta: sinFactura ? null : c.punto_venta,
        numero: sinFactura ? null : c.numero,
        ...(fechaFactura ? { fecha: fechaFactura } : {}),
        importe_neto: conIva ? c.neto : null,
        importe_iva: conIva ? c.iva : null,
        importe_otros: conIva ? c.otros : null,
        importe_total: conIva ? (c.neto ?? 0) + (c.iva ?? 0) + (c.otros ?? 0) : c.total,
      })
      .catch(() => {});

    // Cada compra elegida se vincula con el primer lote de su insumo.
    const vinculos = Object.entries(compras).flatMap(([avisoId, completa]) => {
      const aviso = (avisos.data ?? []).find((a) => a.id === avisoId);
      const lote = aviso ? lotes.find((l) => l.insumo_id === aviso.insumo_id) : undefined;
      return lote ? [{ aviso_id: avisoId, lote_insumo_id: lote.id, completa }] : [];
    });
    if (vinculos.length > 0) {
      await vincular.mutateAsync({ recepcionId: recepcion.id, vinculos }).catch(() => {});
    }

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

          <ComprobanteDelProveedor form={form} />

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
                        <IconFileCheck size={17} color="var(--mantine-color-azul-6)" />
                      </Tooltip>
                    ) : null}
                    {insumo?.requiere_pesada_recepcion ? (
                      <Tooltip label="RN-03: se pesa en la recepción">
                        <IconScale size={17} color="var(--mantine-color-azul-6)" />
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
                          form.setFieldValue(
                            `lotes.${i}.unidad`,
                            elegido.unidad_medida ?? '',
                          );
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
                        <Text size="lg" fw={700} c="azul">
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

      <ComprasDeLaRecepcion
        avisos={(avisos.data ?? []).filter(
          (a) =>
            (a.estado === 'PENDIENTE' || a.estado === 'EN_COMPRA') &&
            form.values.lotes.some((l) => l.insumo_id === a.insumo_id),
        )}
        proveedorId={form.values.proveedor_id}
        nombreInsumo={(id) => porId.get(id)?.nombre ?? '(insumo)'}
        elegidas={compras}
        onCambiar={setCompras}
      />

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
            loading={
              crear.isPending || vincular.isPending || registrarComprobante.isPending
            }
          >
            Registrar recepción
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * «¿Es de alguna compra pendiente?»: las compras anotadas en «Compras
 * pendientes» de los insumos que se están recibiendo. Elegir una la vincula
 * con el lote al guardar; si llegó todo, queda resuelta.
 */
function ComprasDeLaRecepcion({
  avisos,
  proveedorId,
  nombreInsumo,
  elegidas,
  onCambiar,
}: {
  avisos: NonNullable<ReturnType<typeof useAvisosCompra>['data']>;
  proveedorId: string;
  nombreInsumo: (id: string) => string;
  elegidas: Record<string, boolean>;
  onCambiar: (v: Record<string, boolean>) => void;
}) {
  if (avisos.length === 0) return null;
  return (
    <Paper withBorder p="md" mb="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Text fw={600} mb={4}>
        ¿Es de alguna compra pendiente?
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Estas compras se anotaron para los insumos que estás recibiendo. Marcá las que
        llegaron con este remito: quedan vinculadas al lote.
      </Text>
      <Stack gap="xs">
        {avisos.map((a) => {
          const elegida = a.id in elegidas;
          return (
            <Group key={a.id} justify="space-between" wrap="nowrap" gap="sm">
              <Checkbox
                checked={elegida}
                onChange={(e) => {
                  const nuevo = { ...elegidas };
                  if (e.currentTarget.checked) nuevo[a.id] = true;
                  else delete nuevo[a.id];
                  onCambiar(nuevo);
                }}
                label={
                  <span>
                    <b>{nombreInsumo(a.insumo_id)}</b> · {numero(Number(a.cantidad), 2)}{' '}
                    {a.unidad === 'UNIDAD' ? 'u' : a.unidad}
                    {a.pedido
                      ? ` · para el pedido ${a.pedido.numero} (${a.pedido.cliente})`
                      : ''}
                    {a.proveedor_id && a.proveedor_id === proveedorId
                      ? ' · mismo proveedor'
                      : ''}
                  </span>
                }
              />
              {elegida ? (
                <Switch
                  size="sm"
                  label="Llegó todo"
                  checked={elegidas[a.id]}
                  onChange={(e) =>
                    onCambiar({ ...elegidas, [a.id]: e.currentTarget.checked })
                  }
                />
              ) : null}
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
}

const MONEDA = { min: 0, decimalScale: 2, thousandSeparator: '.', decimalSeparator: ',' };

/**
 * «¿Vino con factura?»: el comprobante que trajo el proveedor. Sin factura se
 * registra como tal —queda visible y no computa crédito fiscal—; no es un
 * circuito aparte (cabecera de 20260929100000).
 */
function ComprobanteDelProveedor({
  form,
}: {
  form: UseFormReturnType<ValoresRecepcion>;
}) {
  const c = form.values.comprobante;
  const conIva = discriminaIva(c.tipo);
  return (
    <Stack gap="md">
      <Title order={4}>Comprobante del proveedor</Title>
      <SegmentedControl
        fullWidth
        data={[
          { label: 'Factura A', value: 'FACTURA_A' },
          { label: 'Factura B', value: 'FACTURA_B' },
          { label: 'Factura C', value: 'FACTURA_C' },
          { label: 'Factura X / en negro', value: 'SIN_FACTURA' },
        ]}
        {...form.getInputProps('comprobante.tipo')}
      />
      {c.tipo === 'SIN_FACTURA' ? (
        <Grid gutter="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Importe (opcional)"
              description="Lo acordado con el proveedor, si se sabe"
              {...MONEDA}
              {...form.getInputProps('comprobante.total')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Text size="sm" c="dimmed">
              Llegó solo con remito. Queda registrado así, visible para Administración, y
              no suma crédito fiscal. Si la factura llega después, se carga aparte.
            </Text>
          </Grid.Col>
        </Grid>
      ) : (
        <Grid gutter="sm">
          <Grid.Col span={{ base: 4, sm: 2 }}>
            <NumberInput
              label="Punto de venta"
              min={1}
              max={99999}
              allowDecimal={false}
              {...form.getInputProps('comprobante.punto_venta')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 8, sm: 4 }}>
            <NumberInput
              label="Número"
              min={1}
              max={99999999}
              allowDecimal={false}
              {...form.getInputProps('comprobante.numero')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <DateInput
              label="Fecha de la factura"
              valueFormat="DD/MM/YYYY"
              {...form.getInputProps('comprobante.fecha')}
            />
          </Grid.Col>
          {conIva ? (
            <>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <NumberInput
                  label="Neto gravado"
                  {...MONEDA}
                  {...form.getInputProps('comprobante.neto')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <NumberInput
                  label="IVA"
                  {...MONEDA}
                  {...form.getInputProps('comprobante.iva')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <NumberInput
                  label="Otros"
                  description="No gravado, percepciones"
                  {...MONEDA}
                  {...form.getInputProps('comprobante.otros')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Text size="sm" fw={500} mb={6}>
                  Total
                </Text>
                <Text size="lg" fw={700} ff="monospace">
                  $ {numero((c.neto ?? 0) + (c.iva ?? 0) + (c.otros ?? 0), 2)}
                </Text>
              </Grid.Col>
            </>
          ) : (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <NumberInput
                label="Total"
                description="B y C no discriminan IVA"
                {...MONEDA}
                {...form.getInputProps('comprobante.total')}
              />
            </Grid.Col>
          )}
        </Grid>
      )}
    </Stack>
  );
}
