import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconInfoCircle,
  IconPlus,
  IconTrash,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useInsumos } from '@/lib/consultas';
import {
  TEXTO_TIPO_INSUMO,
  useAltaInsumoTercero,
  useIngresarStockTercero,
  type Tercero,
  type TipoInsumo,
} from '@/lib/consultasTercerizados';

interface Renglon {
  insumoId: string | null;
  cantidad: number | string;
  lote: string;
  vence: string | null;
  protocolo: boolean;
  pesoKg: number | string;
}

const vacio = (): Renglon => ({
  insumoId: null,
  cantidad: '',
  lote: '',
  vence: null,
  protocolo: false,
  pesoKg: '',
});

const UNIDADES = [
  { value: 'UNIDAD', label: 'Unidades' },
  { value: 'g', label: 'Gramos (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
];

/**
 * «Agregar stock» del tercerizado. No hay pestaña de recepción: al confirmar,
 * la base hace la recepción con el proveedor genérico del cliente, un lote por
 * renglón en cuarentena con su rótulo, y la entrada a stock. Calidad lo
 * aprueba después como a cualquier lote (comercial.ingresar_stock_tercero).
 */
export function IngresarStockTercero({
  tercero,
  onListo,
}: {
  tercero: Tercero;
  onListo: () => void;
}) {
  const insumos = useInsumos();
  const ingresar = useIngresarStockTercero();
  const [renglones, setRenglones] = useState<Renglon[]>([vacio()]);
  const [remito, setRemito] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [limpios, setLimpios] = useState(false);
  const [altaPara, setAltaPara] = useState<number | null>(null);

  const porId = useMemo(
    () => new Map((insumos.data ?? []).map((i) => [i.id, i])),
    [insumos.data],
  );

  const opciones = useMemo(() => {
    const activos = (insumos.data ?? []).filter((i) => i.activo);
    const op = (i: (typeof activos)[number]) => ({
      value: i.id,
      label: `${i.nombre} · ${i.codigo_interno}`,
    });
    return [
      {
        group: `Insumos de ${tercero.nombre}`,
        items: activos.filter((i) => i.tercero_id === tercero.id).map(op),
      },
      {
        group: 'Catálogo de Nail Show (alcohol, esencias…)',
        items: activos.filter((i) => i.tercero_id === null).map(op),
      },
    ].filter((g) => g.items.length > 0);
  }, [insumos.data, tercero]);

  const cambiar = (i: number, c: Partial<Renglon>) =>
    setRenglones(renglones.map((r, j) => (j === i ? { ...r, ...c } : r)));

  const problemas = renglones.flatMap((r, i) => {
    const ins = r.insumoId ? porId.get(r.insumoId) : undefined;
    const n = typeof r.cantidad === 'number' ? r.cantidad : Number(r.cantidad);
    const p: string[] = [];
    if (!ins) p.push(`Renglón ${i + 1}: elegí el insumo.`);
    if (!(n > 0)) p.push(`Renglón ${i + 1}: la cantidad tiene que ser mayor que cero.`);
    if (ins?.requiere_protocolo && !r.protocolo)
      p.push(`«${ins.nombre}» exige el protocolo de análisis del fabricante (RN-01).`);
    if (ins?.requiere_pesada_recepcion && !(Number(r.pesoKg) >= 0 && r.pesoKg !== ''))
      p.push(`«${ins.nombre}» se pesa al recibirlo: falta el peso (RN-03).`);
    return p;
  });

  function confirmar() {
    ingresar.mutate(
      {
        terceroId: tercero.id,
        remito: remito.trim() || null,
        observaciones: observaciones.trim() || null,
        contenedoresLimpiados: limpios,
        renglones: renglones.map((r) => ({
          insumo_id: r.insumoId!,
          cantidad: Number(r.cantidad),
          lote: r.lote.trim() || null,
          vence: r.vence,
          protocolo: r.protocolo,
          peso_kg: r.pesoKg === '' ? null : Number(r.pesoKg),
        })),
      },
      { onSuccess: onListo },
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm">
        Cargá lo que trajo {tercero.nombre}. Entra en <b>cuarentena</b> con su rótulo
        amarillo y queda para que Calidad lo apruebe; hasta entonces no se puede usar.
      </Text>

      {renglones.map((r, i) => {
        const ins = r.insumoId ? porId.get(r.insumoId) : undefined;
        const unidad = ins?.unidad_medida === 'UNIDAD' ? 'u' : (ins?.unidad_medida ?? '');
        return (
          <Paper
            key={i}
            withBorder
            p="sm"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Stack gap="xs">
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <Select
                  label="Insumo"
                  placeholder={insumos.isLoading ? 'Cargando…' : 'Buscá por nombre'}
                  searchable
                  limit={60}
                  nothingFoundMessage="No está: dalo de alta"
                  data={opciones}
                  value={r.insumoId}
                  onChange={(v) => cambiar(i, { insumoId: v })}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  variant="default"
                  onClick={() => setAltaPara(i)}
                  leftSection={<IconPlus size={16} />}
                >
                  Nuevo
                </Button>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="xl"
                  aria-label="Quitar renglón"
                  disabled={renglones.length === 1}
                  onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Group>
              <Group gap="sm" align="flex-start" wrap="wrap">
                <NumberInput
                  label="Cantidad"
                  min={0}
                  hideControls
                  w={150}
                  decimalScale={unidad === 'u' ? 0 : 3}
                  rightSection={
                    <Text size="xs" c="dimmed">
                      {unidad}
                    </Text>
                  }
                  value={r.cantidad}
                  onChange={(v) => cambiar(i, { cantidad: v })}
                />
                <TextInput
                  label="Lote"
                  placeholder="Si no tiene, queda con el nº de recepción"
                  style={{ flex: 1, minWidth: 200 }}
                  value={r.lote}
                  onChange={(e) => cambiar(i, { lote: e.currentTarget.value })}
                />
                <DateInput
                  label="Vence"
                  valueFormat="DD/MM/YYYY"
                  placeholder="Sin fecha"
                  clearable
                  w={160}
                  value={r.vence}
                  onChange={(v) => cambiar(i, { vence: v })}
                />
              </Group>
              {ins?.requiere_protocolo ? (
                <Checkbox
                  label="Vino con el protocolo de análisis del fabricante"
                  checked={r.protocolo}
                  onChange={(e) => cambiar(i, { protocolo: e.currentTarget.checked })}
                />
              ) : null}
              {ins?.requiere_pesada_recepcion ? (
                <NumberInput
                  label="Peso al recibir (kg)"
                  min={0}
                  hideControls
                  w={180}
                  decimalScale={4}
                  value={r.pesoKg}
                  onChange={(v) => cambiar(i, { pesoKg: v })}
                />
              ) : null}
            </Stack>
          </Paper>
        );
      })}

      <Button
        variant="light"
        color="indigo"
        leftSection={<IconPlus size={16} />}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setRenglones([...renglones, vacio()])}
      >
        Agregar otro insumo
      </Button>

      <Group grow align="flex-start" wrap="wrap">
        <TextInput
          label="Remito"
          placeholder="Si trajo uno"
          value={remito}
          onChange={(e) => setRemito(e.currentTarget.value)}
          style={{ minWidth: 180 }}
        />
        <Textarea
          label="Observaciones"
          autosize
          minRows={1}
          value={observaciones}
          onChange={(e) => setObservaciones(e.currentTarget.value)}
          style={{ minWidth: 220 }}
        />
      </Group>

      <Switch
        size="md"
        label="Los contenedores se limpiaron antes de entrar a cuarentena (I.20.1)"
        checked={limpios}
        onChange={(e) => setLimpios(e.currentTarget.checked)}
      />

      {problemas.length > 0 && renglones.some((r) => r.insumoId) ? (
        <Alert
          color="gray"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          {problemas.map((p) => (
            <Text key={p} size="sm">
              {p}
            </Text>
          ))}
        </Alert>
      ) : null}

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Cancelar
        </Button>
        <Button
          size="md"
          color="indigo"
          leftSection={<IconTruckDelivery size={18} />}
          loading={ingresar.isPending}
          disabled={problemas.length > 0 || !limpios}
          onClick={confirmar}
        >
          Ingresar a stock
        </Button>
      </Group>

      <Modal
        opened={altaPara !== null}
        onClose={() => setAltaPara(null)}
        title={`Nuevo insumo de ${tercero.nombre}`}
        centered
        radius="md"
      >
        {altaPara !== null ? (
          <AltaInsumoGenerico
            tercero={tercero}
            onListo={(id) => {
              if (id) cambiar(altaPara, { insumoId: id });
              setAltaPara(null);
            }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

/** Insumo de nombre genérico, sin proveedor: «envase cristal 100 cc». */
function AltaInsumoGenerico({
  tercero,
  onListo,
}: {
  tercero: Tercero;
  onListo: (id: string | null) => void;
}) {
  const alta = useAltaInsumoTercero();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoInsumo>('MATERIAL_ENVASE');
  const [unidad, setUnidad] = useState('UNIDAD');
  const [inflamable, setInflamable] = useState(false);

  return (
    <Stack gap="md">
      <TextInput
        label="Nombre"
        withAsterisk
        placeholder="Por ejemplo: envase cristal 100 cc"
        value={nombre}
        onChange={(e) => setNombre(e.currentTarget.value)}
      />
      <Group grow>
        <Select
          label="Tipo"
          allowDeselect={false}
          data={(Object.keys(TEXTO_TIPO_INSUMO) as TipoInsumo[]).map((t) => ({
            value: t,
            label: TEXTO_TIPO_INSUMO[t],
          }))}
          value={tipo}
          onChange={(v) => setTipo((v ?? 'MATERIAL_ENVASE') as TipoInsumo)}
        />
        <Select
          label="Se cuenta en"
          allowDeselect={false}
          data={UNIDADES}
          value={unidad}
          onChange={(v) => setUnidad(v ?? 'UNIDAD')}
        />
      </Group>
      <Checkbox
        label="Es inflamable (va al depósito exterior)"
        checked={inflamable}
        onChange={(e) => setInflamable(e.currentTarget.checked)}
      />
      <Text size="xs" c="dimmed">
        Queda solo para {tercero.nombre}, con código T- que pone el sistema. Sin
        proveedor: figura como provisto por el cliente.
      </Text>
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={() => onListo(null)}>
          Cancelar
        </Button>
        <Button
          color="indigo"
          loading={alta.isPending}
          disabled={nombre.trim().length < 3}
          onClick={() =>
            alta.mutate(
              {
                terceroId: tercero.id,
                nombre: nombre.trim(),
                tipo,
                unidad,
                esInflamable: inflamable,
              },
              { onSuccess: (d) => onListo(d.id) },
            )
          }
        >
          Dar de alta
        </Button>
      </Group>
    </Stack>
  );
}
