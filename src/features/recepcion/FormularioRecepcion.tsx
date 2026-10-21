import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Modal,
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
import { desdeCalendario, etiquetaUnidad, fechaISO, numero } from '@/lib/formato';
import {
  useAvisosCompra,
  useVincularCompras,
  type AvisoCompraRow,
} from '@/lib/consultasComercial';
import { discriminaIva, useRegistrarComprobanteProveedor } from '@/lib/consultasCompras';
import { useTieneRol } from '@/features/auth/sesion';
import {
  ROLES_CARGAN_COSTO_LOTE,
  UNIDADES_COSTO,
  comprobanteDeRecepcion,
  useCargarCostosLote,
  useCostosReferencia,
} from '@/lib/consultasCostos';
import {
  CamposCosto,
  COSTO_VACIO,
  costoCompleto,
  type ValorCosto,
} from '@/features/costos/CamposCosto';
import { FormularioInsumo } from '@/features/maestros/PaginaInsumos';

/*
 * Esquema derivado de las restricciones reales de la base. La aplicación
 * duplica la validación para dar buenos mensajes, pero la autoridad es la base
 * (CLAUDE.md §6): cada regla de acá tiene su CHECK o su trigger del otro lado.
 */
const esquemaLote = z.object({
  insumo_id: z.string().min(1, 'Elegí el insumo'),
  /* Optativo si la recepción tiene remito (superRefine de abajo y
     gmp.fn_validar_lote_insumo, D-unidad-solo-materia-prima-2). */
  lote_proveedor: z.string(),
  cantidad_bultos: z.number().int().positive('Al menos un bulto'),
  /* Sin cantidad, comercial.cargar_recepcion_a_stock rechaza el lote: se pide
     acá y no recién al cargar a stock. */
  cantidad_unidades: z
    .number()
    .positive('La cantidad tiene que ser mayor que cero')
    .nullable()
    // Sin predicado de tipo: el formulario arranca en null y tiene que admitirlo.
    .refine((n): boolean => n !== null, 'Falta la cantidad'),
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
  /* Costo del lote (comercial.costos_lote). Opcional: si queda vacío se carga
     después desde Costos › Lotes. Lo valida la base, no este esquema. */
  costo: z.custom<ValorCosto>(),
});

/* Comprobante del proveedor (RN-65, 20260929100000). Mismas reglas que los
   CHECK de comercial.comprobantes_proveedor. */
const esquemaComprobante = z.object({
  tipo: z.enum(['FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'SIN_FACTURA']),
  punto_venta: z.number().int().min(1).max(99999).nullable(),
  numero: z.number().int().min(1).max(99999999).nullable(),
  fecha: z.date().nullable(),
  neto: z.number().nonnegative().nullable(),
  iva: z.number().nonnegative().nullable(),
  otros: z.number().nonnegative().nullable(),
  total: z.number().nonnegative().nullable(),
});

const esquemaRecepcion = z
  .object({
    proveedor_id: z.string().min(1, 'Elegí el proveedor'),
    /* El comprobante es opcional en la recepción (20261014130000): si no se
       carga, le queda pendiente a Administración. */
    con_comprobante: z.boolean(),
    comprobante: esquemaComprobante,
    proveedor_nuevo: z.boolean(),
    /* Opcional: hay proveedores que entregan sin remito. */
    numero_remito: z.string(),
    coincide_con_pedido: z.boolean(),
    observaciones: z.string(),
    rotularEnCuarentena: z.boolean(),
    lotes: z.array(esquemaLote).min(1, 'Cargá al menos un lote'),
  })
  .superRefine((v, ctx) => {
    if (!v.numero_remito.trim()) {
      v.lotes.forEach((l, i) => {
        if (!l.lote_proveedor.trim())
          ctx.addIssue({
            code: 'custom',
            path: ['lotes', i, 'lote_proveedor'],
            message: 'Sin remito, el lote del proveedor es lo único que lo rastrea',
          });
      });
    }
    const c = v.comprobante;
    if (!v.con_comprobante || c.tipo === 'SIN_FACTURA') return;
    const falta = (campo: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: ['comprobante', campo], message });
    if (c.punto_venta === null) falta('punto_venta', 'Falta el punto de venta');
    if (c.numero === null) falta('numero', 'Falta el número');
    if (c.tipo === 'FACTURA_A') {
      if (c.neto === null) falta('neto', 'Falta el neto gravado');
      if (c.iva === null) falta('iva', 'Falta el IVA');
    } else if (!c.total) {
      falta('total', 'Falta el total');
    }
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
  costo: { ...COSTO_VACIO, cantidad: null },
};

interface Props {
  onListo: () => void;
  /**
   * «Ya llegó» desde Compras pendientes: la recepción arranca con el
   * proveedor, el insumo y la cantidad de la compra, y la compra ya elegida
   * para vincularse al lote.
   */
  desdeCompra?: AvisoCompraRow;
}

export function FormularioRecepcion({ onListo, desdeCompra }: Props) {
  const proveedores = useProveedores();
  const insumos = useInsumos();
  const crear = useCrearRecepcion();
  const avisos = useAvisosCompra();
  const vincular = useVincularCompras();
  const registrarComprobante = useRegistrarComprobanteProveedor();
  /* El costo lo cargan Gerencia de Producción, Administración y Finanzas
     (D-38). Un operario que recibe no lo ve: se completa después. */
  const cargaCosto = useTieneRol(...ROLES_CARGAN_COSTO_LOTE);
  /* Dirección Técnica recibe material pero no ve la parte fiscal: el
     comprobante lo carga Administración (pedido del 2026-10-14). */
  /* Recepción tampoco: recibe y carga a stock, la factura es de Administración. */
  const veComprobante = !useTieneRol('DIRECCION_TECNICA', 'RECEPCION');
  /* Alta de insumo sin salir de la recepción. Mismos roles que la política
     insumos_catalogo_insert_tecnicos. Guarda el índice del lote que lo pidió. */
  const creaInsumo = useTieneRol(
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'ADMINISTRADOR_SISTEMA',
    'RECEPCION',
  );
  const [altaParaLote, setAltaParaLote] = useState<number | null>(null);
  /** Lo último tipeado en el buscador de insumos: pasa como nombre al alta. */
  const [buscado, setBuscado] = useState('');
  const referencias = useCostosReferencia();
  const cargarCostos = useCargarCostosLote();
  /** Compras pendientes que llegaron con esta recepción: id → llegó completa. */
  const [compras, setCompras] = useState<Record<string, boolean>>(
    desdeCompra ? { [desdeCompra.id]: true } : {},
  );
  const insumoCompra = desdeCompra
    ? insumos.data?.find((i) => i.id === desdeCompra.insumo_id)
    : undefined;
  const unidadCompra = insumoCompra?.unidad_medida ?? desdeCompra?.unidad ?? 'kg';

  const form = useForm<ValoresRecepcion>({
    mode: 'controlled',
    initialValues: {
      proveedor_id: desdeCompra?.proveedor_id ?? '',
      proveedor_nuevo: false,
      con_comprobante: false,
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
      lotes: [
        desdeCompra
          ? {
              ...LOTE_VACIO,
              insumo_id: desdeCompra.insumo_id,
              cantidad_unidades: Number(desdeCompra.cantidad),
              unidad: unidadCompra,
              costo: {
                ...LOTE_VACIO.costo,
                ...(UNIDADES_COSTO.includes(unidadCompra)
                  ? { unidad: unidadCompra }
                  : {}),
              },
            }
          : { ...LOTE_VACIO },
      ],
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

  /** Elegido en la lista o recién dado de alta: el lote toma su unidad. */
  const elegirInsumo = (i: number, insumo: Insumo) => {
    form.setFieldValue(`lotes.${i}.insumo_id`, insumo.id);
    const u = insumo.unidad_medida ?? '';
    form.setFieldValue(`lotes.${i}.unidad`, u);
    if (UNIDADES_COSTO.includes(u)) form.setFieldValue(`lotes.${i}.costo.unidad`, u);
  };

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
      numero_remito: valores.numero_remito.trim() || null,
      coincide_con_pedido: valores.coincide_con_pedido,
      observaciones: valores.observaciones.trim() || null,
      rotularEnCuarentena: valores.rotularEnCuarentena,
      lotes: valores.lotes.map((l) => ({
        insumo_id: l.insumo_id,
        lote_proveedor: l.lote_proveedor.trim() || null,
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
    // (RN-65). Si no se carga o falla, le queda a Administración en
    // «Facturas por cargar».
    const c = valores.comprobante;
    const conComprobante = veComprobante && valores.con_comprobante;
    const sinFactura = c.tipo === 'SIN_FACTURA';
    const conIva = discriminaIva(c.tipo);
    const fechaFactura = conComprobante && !sinFactura ? fechaISO(c.fecha) : null;
    if (conComprobante) {
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
    }

    // El costo de cada lote va a comercial (fuente única del costo, R-10). El
    // comprobante sale del de la recepción. Los lotes vuelven en el orden en
    // que se insertaron. Si falla, se avisa y se carga desde Costos › Lotes.
    if (cargaCosto) {
      const costos = valores.lotes.flatMap((l, i) => {
        const lote = lotes[i];
        if (!lote || !costoCompleto(l.costo)) return [];
        return [
          {
            lote_insumo_id: lote.id,
            tipo_comprobante: conComprobante
              ? comprobanteDeRecepcion(c.tipo)
              : l.costo.tipo_comprobante,
            importe: l.costo.importe!,
            incluye_iva: l.costo.incluye_iva,
            alicuota_iva: l.costo.alicuota_iva,
            moneda: l.costo.moneda,
            tipo_cambio: l.costo.tipo_cambio ?? 1,
            cantidad: l.costo.cantidad!,
            unidad: l.costo.unidad,
            fecha_costo: fechaFactura,
          },
        ];
      });
      await cargarCostos.mutateAsync(costos).catch(() => {});
    }

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
                  label="N° de remito (opcional)"
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

          {veComprobante ? (
            <>
              <ComprobanteDelProveedor form={form} />
              <Divider />
            </>
          ) : null}

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
                      onSearchChange={setBuscado}
                      nothingFoundMessage={
                        creaInsumo ? (
                          <Button
                            fullWidth
                            size="md"
                            variant="light"
                            leftSection={<IconPlus size={18} />}
                            onClick={() => setAltaParaLote(i)}
                          >
                            Nuevo insumo
                          </Button>
                        ) : (
                          'No está en el catálogo. El alta la hace Dirección Técnica o Gerencia de Producción.'
                        )
                      }
                      {...form.getInputProps(`lotes.${i}.insumo_id`)}
                      onChange={(valor) => {
                        form.setFieldValue(`lotes.${i}.insumo_id`, valor ?? '');
                        const elegido = valor ? porId.get(valor) : undefined;
                        if (elegido) elegirInsumo(i, elegido);
                      }}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 5 }}>
                    <TextInput
                      label={
                        form.values.numero_remito.trim()
                          ? 'Lote del proveedor (opcional)'
                          : 'Lote del proveedor'
                      }
                      placeholder="Como figura en el envase"
                      description={
                        form.values.numero_remito.trim()
                          ? 'Si no viene, el remito sostiene la trazabilidad.'
                          : 'Sin remito es obligatorio.'
                      }
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
                      label={
                        lote.unidad
                          ? `Cantidad (${etiquetaUnidad(lote.unidad)})`
                          : 'Cantidad'
                      }
                      min={0}
                      decimalScale={3}
                      {...form.getInputProps(`lotes.${i}.cantidad_unidades`)}
                      onChange={(n) =>
                        form.setFieldValue(
                          `lotes.${i}.cantidad_unidades`,
                          typeof n === 'number' ? n : null,
                        )
                      }
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    {/* La del catálogo, no se tipea: el stock y los consumos
                        comparan la unidad del lote con la de la ficha, y «Kg»
                        no es «kg». Si llegó en otra, se convierte la cantidad. */}
                    <TextInput
                      label="Unidad"
                      value={lote.unidad ? etiquetaUnidad(lote.unidad) : ''}
                      placeholder="Elegí el insumo"
                      description="La de la ficha del insumo"
                      readOnly
                      error={form.errors[`lotes.${i}.unidad`]}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <DateInput
                      label="Plazo de validez"
                      placeholder="dd/mm/aaaa"
                      valueFormat="DD/MM/YYYY"
                      clearable
                      {...form.getInputProps(`lotes.${i}.plazo_validez`)}
                      onChange={(v) =>
                        form.setFieldValue(`lotes.${i}.plazo_validez`, desdeCalendario(v))
                      }
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
                  {cargaCosto ? (
                    <Grid.Col span={12}>
                      <Divider
                        my="xs"
                        label="Costo (opcional: si no lo sabés ahora, se carga después en Costos)"
                        labelPosition="left"
                      />
                      <CamposCosto
                        valor={
                          form.values.con_comprobante
                            ? {
                                ...lote.costo,
                                tipo_comprobante: comprobanteDeRecepcion(
                                  form.values.comprobante.tipo,
                                ),
                              }
                            : lote.costo
                        }
                        onChange={(v) => form.setFieldValue(`lotes.${i}.costo`, v)}
                        unidadCatalogo={insumo?.unidad_medida ?? null}
                        referencia={
                          (referencias.data ?? []).find(
                            (r) => r.insumo_id === lote.insumo_id,
                          ) ?? null
                        }
                        comprobanteFijo={form.values.con_comprobante}
                      />
                    </Grid.Col>
                  ) : null}
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

      <Modal
        opened={altaParaLote !== null}
        onClose={() => setAltaParaLote(null)}
        title={<Text fw={700}>Nuevo insumo</Text>}
        size="lg"
      >
        <FormularioInsumo
          nombreInicial={buscado.trim()}
          onListo={(creado) => {
            if (creado && altaParaLote !== null) elegirInsumo(altaParaLote, creado);
            setAltaParaLote(null);
          }}
        />
      </Modal>
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
  return (
    <Stack gap="md">
      <Title order={4}>Comprobante del proveedor</Title>
      <Switch
        label="Cargar la factura ahora"
        description="Opcional. Si no la cargás, a Administración le queda pendiente en «Facturas por cargar»."
        {...form.getInputProps('con_comprobante', { type: 'checkbox' })}
      />
      {form.values.con_comprobante ? <DatosComprobante form={form} /> : null}
    </Stack>
  );
}

function DatosComprobante({ form }: { form: UseFormReturnType<ValoresRecepcion> }) {
  const c = form.values.comprobante;
  const conIva = discriminaIva(c.tipo);
  return (
    <>
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
              onChange={(v) =>
                form.setFieldValue('comprobante.fecha', desdeCalendario(v) ?? new Date())
              }
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
    </>
  );
}
