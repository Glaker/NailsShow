import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useFormulasFabricacion, useProductos } from '@/lib/consultas';
import { fecha, fechaISO, numero } from '@/lib/formato';
import {
  useAbrirOrden,
  useCrearEquipo,
  useEquipos,
  useEspecificaciones,
  useOrdenes,
} from '@/lib/consultasOrdenes';
import { COLOR_ESTADO_ORDEN } from './etapasOrden';

/**
 * Órdenes de producción (ítem 5 de la cola del 24/09): cada lote con su
 * registro de etapas, del que sale el batch record.
 */
export function PaginaOrdenes() {
  const ordenes = useOrdenes();
  const productos = useProductos();
  const puede = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const [abriendo, setAbriendo] = useState(false);
  const [equipos, setEquipos] = useState(false);
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';
  const filas = ordenes.data ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes de producción"
        descripcion="Cada lote con su registro, de la pesada a la liberación. El batch record sale de acá."
        acciones={
          puede ? (
            <Group gap="sm">
              <Button variant="default" onClick={() => setEquipos(true)}>
                Equipos
              </Button>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => setAbriendo(true)}
              >
                Abrir orden
              </Button>
            </Group>
          ) : null
        }
      />
      {ordenes.isLoading ? (
        <Skeleton h={240} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconClipboardList}
            titulo="Todavía no hay órdenes de producción"
            descripcion="Abrí una por lote: toma la fórmula, arma el número de lote según I.40.25 y guía cada etapa."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Orden</Table.Th>
                  <Table.Th>Producto</Table.Th>
                  <Table.Th>Lote</Table.Th>
                  <Table.Th>Vencimiento</Table.Th>
                  <Table.Th ta="right">Cantidad</Table.Th>
                  <Table.Th>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/ordenes/${o.id}`} fw={600}>
                        {o.numero}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {fecha(o.jornada)}
                      </Text>
                    </Table.Td>
                    <Table.Td>{nombre(o.producto_id)}</Table.Td>
                    <Table.Td ff="monospace">{o.numero_lote}</Table.Td>
                    <Table.Td ff="monospace">{o.vencimiento_texto}</Table.Td>
                    <Table.Td ta="right" ff="monospace">
                      {numero(Number(o.cantidad_teorica), 2)} {o.unidad}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={COLOR_ESTADO_ORDEN[o.estado]} variant="light">
                        {o.estado.toLowerCase()}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <ModalAbrirOrden
        abierto={abriendo}
        onCerrar={() => setAbriendo(false)}
        pedidoId={null}
      />
      <ModalEquipos abierto={equipos} onCerrar={() => setEquipos(false)} />
    </>
  );
}

/** Abrir una orden: fórmula, presentación, jornada y partida (I.40.25). */
export function ModalAbrirOrden({
  abierto,
  onCerrar,
  pedidoId,
  productoInicial,
}: {
  abierto: boolean;
  onCerrar: () => void;
  pedidoId: string | null;
  productoInicial?: string;
}) {
  const formulas = useFormulasFabricacion();
  const productos = useProductos();
  const especificaciones = useEspecificaciones();
  const abrir = useAbrirOrden();
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [productoId, setProductoId] = useState<string | null>(productoInicial ?? null);
  const [especId, setEspecId] = useState<string | null>(null);
  const [jornada, setJornada] = useState<Date | null>(new Date());
  const [partida, setPartida] = useState<number | string>(1);
  const [presentacion, setPresentacion] = useState<number | string>(1);
  const [presentacionTexto, setPresentacionTexto] = useState('');
  const [cantidad, setCantidad] = useState<number | string>('');
  const [vencimiento, setVencimiento] = useState<Date | null>(null);
  const formula = (formulas.data ?? []).find((f) => f.id === formulaId);
  const producto = productoId ?? formula?.producto_id ?? null;
  const n = (v: number | string) => (typeof v === 'number' ? v : Number(v || 0));
  const dd = jornada
    ? `${String(jornada.getDate()).padStart(2, '0')}/${String(jornada.getMonth() + 1).padStart(2, '0')}/${String(jornada.getFullYear()).slice(2)}`
    : '';

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title="Abrir orden de producción"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Select
          label="Fórmula"
          withAsterisk
          searchable
          data={(formulas.data ?? []).map((f) => ({
            value: f.id,
            label: `${f.producto?.nombre ?? ''}${f.variedad ? ` — ${f.variedad}` : ''} · v${f.version}${f.codigo_me ? ` · ${f.codigo_me}` : ''}`,
          }))}
          value={formulaId}
          onChange={setFormulaId}
        />
        <Select
          label="Producto (presentación que se fracciona)"
          description="Por defecto, el de la fórmula"
          searchable
          clearable
          limit={60}
          data={(productos.data ?? [])
            .filter((p) => p.activo)
            .map((p) => ({ value: p.id, label: `${p.codigo_interno} · ${p.nombre}` }))}
          value={producto}
          onChange={setProductoId}
        />
        <Select
          label="Especificación"
          description="Contra la que se controla el producto terminado"
          clearable
          data={(especificaciones.data ?? [])
            .filter((e) => e.estado === 'VIGENTE')
            .map((e) => ({
              value: e.id,
              label: `${e.codigo_poe} v${e.version} · ${e.denominacion}`,
            }))}
          value={especId}
          onChange={setEspecId}
        />
        <Group grow>
          <DateInput
            label="Fecha de elaboración"
            valueFormat="DD/MM/YYYY"
            value={jornada}
            onChange={(v) => setJornada(v ? new Date(v) : null)}
          />
          <NumberInput
            label="Cantidad teórica (kg)"
            min={0}
            decimalScale={3}
            value={cantidad}
            onChange={setCantidad}
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Partida del granel (P)"
            description="1 si es el primer granel del día"
            min={1}
            max={99}
            allowDecimal={false}
            value={partida}
            onChange={setPartida}
          />
          <NumberInput
            label="Presentación (#)"
            description="1, 2… si un granel va a varias"
            min={1}
            max={99}
            allowDecimal={false}
            value={presentacion}
            onChange={setPresentacion}
          />
        </Group>
        <Group grow>
          <TextInput
            label="Presentación"
            placeholder="14 g, 45 g…"
            value={presentacionTexto}
            onChange={(e) => setPresentacionTexto(e.currentTarget.value)}
          />
          <DateInput
            label="Vencimiento"
            description="Vacío: fecha de elaboración + vida útil"
            valueFormat="DD/MM/YYYY"
            clearable
            value={vencimiento}
            onChange={(v) => setVencimiento(v ? new Date(v) : null)}
          />
        </Group>
        <Text size="sm">
          Lote:{' '}
          <b>
            #{n(presentacion)} {dd}
          </b>{' '}
          · vencimiento <b>P{n(partida)} …</b> (I.40.25, borrador: R-08)
        </Text>
        <Group justify="flex-end">
          <Button
            loading={abrir.isPending}
            disabled={!formula || !producto || !jornada || n(cantidad) <= 0}
            onClick={() =>
              formula &&
              producto &&
              jornada &&
              abrir.mutate(
                {
                  formula_id: formula.id,
                  producto_id: producto,
                  jornada: fechaISO(jornada)!,
                  partida: n(partida),
                  presentacion: n(presentacion),
                  presentacion_texto: presentacionTexto.trim() || null,
                  cantidad_teorica: n(cantidad),
                  unidad: 'kg',
                  vencimiento: fechaISO(vencimiento),
                  especificacion_id: especId,
                  pedidoId,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            Abrir orden
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

const TIPOS_EQUIPO: { value: string; label: string }[] = [
  { value: 'BALANZA', label: 'Balanza' },
  { value: 'BALANZA_PORTATIL', label: 'Balanza portátil' },
  { value: 'VARILLA', label: 'Varilla batidora' },
  { value: 'MAQUINA_FRACCIONADORA', label: 'Máquina fraccionadora' },
  { value: 'ETIQUETADORA', label: 'Etiquetadora' },
  { value: 'PHMETRO', label: 'pHmetro' },
  { value: 'DENSITOMETRO', label: 'Densitómetro' },
  { value: 'MICROSCOPIO_DIGITAL', label: 'Microscopio digital' },
  { value: 'OTRO', label: 'Otro' },
];

/** Equipos que se eligen en las etapas (código de balanza, varilla…). */
export function ModalEquipos({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const equipos = useEquipos();
  const crear = useCrearEquipo();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<string | null>('BALANZA');
  return (
    <Modal opened={abierto} onClose={onCerrar} title="Equipos" centered>
      <Stack gap="md">
        {(equipos.data ?? []).map((e) => (
          <Text key={e.id} size="sm">
            <b>{e.codigo}</b> · {e.nombre} ·{' '}
            {TIPOS_EQUIPO.find((t) => t.value === e.tipo)?.label}
          </Text>
        ))}
        <Group grow align="flex-end">
          <TextInput
            label="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.currentTarget.value)}
          />
          <Select label="Tipo" data={TIPOS_EQUIPO} value={tipo} onChange={setTipo} />
        </Group>
        <TextInput
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            loading={crear.isPending}
            disabled={!codigo.trim() || !nombre.trim() || !tipo}
            onClick={() =>
              tipo &&
              crear.mutate(
                { codigo: codigo.trim(), nombre: nombre.trim(), tipo },
                {
                  onSuccess: () => {
                    setCodigo('');
                    setNombre('');
                  },
                },
              )
            }
          >
            Dar de alta
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
