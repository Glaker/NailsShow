import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconFileText,
  IconPlus,
  IconShieldCheck,
  IconTrash,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useSesion, useTieneRol } from '@/features/auth/sesion';
import { useProductos } from '@/lib/consultas';
import { fecha, fechaHora, numero } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  ETAPAS,
  cumpleNumerico,
  esNumerico,
  textoCriterio,
  useAnularOrden,
  useControlarEtapa,
  useEquipos,
  useEspecificacionCompleta,
  useFaltantesLiberacion,
  useGuardarEtapa,
  useLiberarOrden,
  useOrden,
  usePesadaTeorica,
  useTerminarOrden,
  type DatosEtapa,
  type EtapaOrden,
  type EtapaRegistrada,
  type OrdenProduccion,
} from '@/lib/consultasOrdenes';
import { TrazabilidadOrden } from './TrazabilidadOrden';
import {
  COLOR_ESTADO_ORDEN,
  CONFIG_ETAPAS,
  unidadesRecuento,
  type Columna,
} from './etapasOrden';

type Fila = Record<string, string | number | null>;

const ROLES_REGISTRAN = [
  'GERENCIA_PRODUCCION',
  'DIRECCION_TECNICA',
  'OPERARIO',
  'CONTROL_CALIDAD',
] as const;

/**
 * Ficha de la orden de producción: las nueve etapas del R.40.x.1. Registrar es
 * «Realizó»; «Controlar» la cierra y desde ahí no cambia. Con todo controlado
 * y la orden terminada, la DT libera (o rechaza) el lote.
 */
export function PaginaOrden() {
  const { id } = useParams<{ id: string }>();
  const orden = useOrden(id);
  const productos = useProductos();
  const nomina = useNomina();
  const { claims } = useSesion();
  const puedeRegistrar = useTieneRol(...ROLES_REGISTRAN);
  const esCalidad = useTieneRol('CONTROL_CALIDAD', 'DIRECCION_TECNICA');
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const esProduccion = useTieneRol('GERENCIA_PRODUCCION', 'DIRECCION_TECNICA');
  const controlar = useControlarEtapa();
  const [editando, setEditando] = useState<EtapaOrden | null>(null);
  const [cierre, setCierre] = useState<'terminar' | 'liberar' | 'anular' | null>(null);

  if (orden.isLoading) return <Skeleton h={400} />;
  if (!orden.data) {
    return (
      <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
        <Vacio icono={IconFileText} titulo="No se encontró la orden" />
      </Paper>
    );
  }
  const o = orden.data.orden;
  const porEtapa = new Map(orden.data.etapas.map((e) => [e.etapa, e]));
  const producto = (productos.data ?? []).find((p) => p.id === o.producto_id);
  const quien = (uid: string | null) => (uid ? (nomina.data?.get(uid) ?? '—') : '—');
  const abierta = o.estado === 'ABIERTA';

  return (
    <>
      <EncabezadoPagina
        titulo={`Orden ${o.numero}`}
        descripcion={`${producto?.nombre ?? ''} · lote ${o.numero_lote} · vence ${o.vencimiento_texto}`}
        acciones={
          <Group gap="sm">
            <Badge size="lg" color={COLOR_ESTADO_ORDEN[o.estado]} variant="light">
              {o.estado.toLowerCase()}
            </Badge>
            <Button
              component={Link}
              to={`/ordenes/${o.id}/batch-record`}
              variant="default"
              leftSection={<IconFileText size={18} />}
            >
              Batch record
            </Button>
            {esProduccion && abierta ? (
              <Button color="estadoAprobado" onClick={() => setCierre('terminar')}>
                Terminar
              </Button>
            ) : null}
            {esDT && o.estado === 'TERMINADA' ? (
              <Button
                leftSection={<IconShieldCheck size={18} />}
                onClick={() => setCierre('liberar')}
              >
                Liberar o rechazar
              </Button>
            ) : null}
            {esProduccion && abierta ? (
              <Button variant="subtle" color="red" onClick={() => setCierre('anular')}>
                Anular
              </Button>
            ) : null}
          </Group>
        }
      />
      <Stack gap="md">
        <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Dato t="Elaboración">{fecha(o.jornada)}</Dato>
            <Dato t="Cantidad teórica">
              {numero(Number(o.cantidad_teorica), 2)} {o.unidad}
            </Dato>
            <Dato t="Obtenido">
              {o.cantidad_obtenida !== null
                ? `${numero(Number(o.cantidad_obtenida), 2)} ${o.unidad} · ${o.unidades_obtenidas ?? '—'} u`
                : '—'}
            </Dato>
            <Dato t="Liberación">
              {o.liberada_en
                ? `${quien(o.liberada_por)} · ${fechaHora(o.liberada_en)}`
                : '—'}
            </Dato>
          </SimpleGrid>
          {o.motivo_cierre ? (
            <Text size="sm" mt="sm">
              Motivo: {o.motivo_cierre}
            </Text>
          ) : null}
        </Paper>

        {ETAPAS.map(({ etapa, titulo, calidad }) => {
          const r = porEtapa.get(etapa);
          const controlada = Boolean(r?.controlo_por);
          const mismaPersona = r?.controlo_por && r.controlo_por === r.realizo_por;
          const habilitada =
            etapa === 'REVISION' ? abierta || o.estado === 'TERMINADA' : abierta;
          const puedeEsta = calidad ? esCalidad : puedeRegistrar;
          return (
            <Paper
              key={etapa}
              withBorder
              p="md"
              style={{ borderColor: 'var(--superficie-borde)' }}
            >
              <Group justify="space-between" wrap="wrap">
                <div>
                  <Text fw={600}>{titulo}</Text>
                  <Text size="xs" c="dimmed">
                    {r
                      ? `Realizó ${quien(r.realizo_por)} · ${fechaHora(r.realizo_en)}${
                          controlada
                            ? ` — Controló ${quien(r.controlo_por)} · ${fechaHora(r.controlo_en)}`
                            : ''
                        }`
                      : 'Sin registrar'}
                    {(r?.datos as { no_aplica?: boolean } | undefined)?.no_aplica
                      ? ' · no aplica'
                      : ''}
                  </Text>
                </div>
                <Group gap="xs">
                  {controlada ? (
                    <Badge
                      color="estadoAprobado"
                      variant="light"
                      leftSection={<IconCheck size={12} />}
                    >
                      controlada
                    </Badge>
                  ) : r ? (
                    <Badge color="estadoEnAnalisis" variant="light">
                      falta controlar
                    </Badge>
                  ) : null}
                  {mismaPersona ? (
                    <Badge
                      color="estadoCuarentena"
                      variant="light"
                      leftSection={<IconAlertTriangle size={12} />}
                    >
                      misma persona
                    </Badge>
                  ) : null}
                  {habilitada && puedeEsta && !controlada ? (
                    <Button
                      size="compact-md"
                      variant="light"
                      onClick={() => setEditando(etapa)}
                    >
                      {r ? 'Corregir' : 'Registrar'}
                    </Button>
                  ) : null}
                  {habilitada && puedeEsta && r && !controlada && claims?.usuario_id ? (
                    <Button
                      size="compact-md"
                      loading={controlar.isPending && controlar.variables?.id === r.id}
                      onClick={() =>
                        controlar.mutate({
                          id: r.id,
                          ordenId: o.id,
                          usuarioId: claims.usuario_id!,
                        })
                      }
                    >
                      Controlar
                    </Button>
                  ) : null}
                </Group>
              </Group>
            </Paper>
          );
        })}

        <TrazabilidadOrden ordenId={o.id} />
      </Stack>

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={ETAPAS.find((e) => e.etapa === editando)?.titulo}
        size="xl"
        centered
      >
        {editando ? (
          <EditorEtapa
            orden={o}
            etapa={editando}
            registrada={porEtapa.get(editando) ?? null}
            onListo={() => setEditando(null)}
          />
        ) : null}
      </Modal>
      <ModalCierre
        orden={o}
        tipo={cierre}
        recuento={unidadesRecuento(porEtapa.get('FRACCIONAMIENTO')?.datos ?? {})}
        onCerrar={() => setCierre(null)}
      />
    </>
  );
}

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {t}
      </Text>
      <Text size="sm">{children}</Text>
    </Stack>
  );
}

/* ----------------------------- Editor de etapa ---------------------------- */

function EditorEtapa({
  orden,
  etapa,
  registrada,
  onListo,
}: {
  orden: OrdenProduccion;
  etapa: EtapaOrden;
  registrada: EtapaRegistrada | null;
  onListo: () => void;
}) {
  const config = CONFIG_ETAPAS[etapa];
  const guardar = useGuardarEtapa();
  const equipos = useEquipos();
  const pesada = usePesadaTeorica(
    etapa === 'PESADA' && !registrada ? orden.formula_id : undefined,
    Number(orden.cantidad_teorica),
  );
  const espec = useEspecificacionCompleta(
    config.contraEspecificacion ? orden.especificacion_id : null,
  );
  const [datos, setDatos] = useState<DatosEtapa | null>(registrada?.datos ?? null);
  const [obs, setObs] = useState(registrada?.observaciones ?? '');

  // Prellenado: la pesada con la fórmula; el resto vacío.
  const inicial: DatosEtapa =
    datos ??
    (etapa === 'PESADA'
      ? {
          pesadas: (pesada.data ?? []).map((r) => ({
            componente: r.componente,
            lote: r.codigo_interno ?? '',
            cantidad: Math.round(Number(r.masa_kg) * 1000) / 1000,
            balanza: null,
            registro: null,
            realizo: '',
          })),
        }
      : {});
  const d = inicial;
  const set = (clave: string, valor: unknown) => setDatos({ ...d, [clave]: valor });
  const verif = (d.verificaciones as Record<string, boolean | null> | undefined) ?? {};
  const algunNo = Object.values(verif).some((v) => v === false);
  const noAplica = Boolean(d.no_aplica);
  const motivoNoAplica = typeof d.motivo === 'string' ? d.motivo : '';
  const faltanVerif = (config.verificaciones ?? []).some(
    (_, i) => verif[i] === undefined || verif[i] === null,
  );
  const resultados =
    (d.resultados as
      | Record<
          string,
          { valor?: number | string; cumple?: boolean | null; justificacion?: string }
        >
      | undefined) ?? {};
  const parametros = espec.data?.parametros ?? [];
  const faltanResultados =
    config.contraEspecificacion &&
    parametros.some((p) => {
      const r = resultados[p.id];
      if (!p.obligatorio) return false;
      if (esNumerico(p.tipo_criterio)) return r?.valor === undefined || r.valor === '';
      return r?.cumple === undefined || r.cumple === null;
    });
  const sinJustificar =
    config.contraEspecificacion &&
    parametros.some((p) => {
      const r = resultados[p.id];
      if (!esNumerico(p.tipo_criterio) || r?.valor === undefined || r.valor === '')
        return false;
      const auto = cumpleNumerico(p, Number(r.valor));
      return (
        r.cumple !== undefined &&
        r.cumple !== null &&
        r.cumple !== auto &&
        !(r.justificacion ?? '').trim()
      );
    });

  if (pesada.isLoading || espec.isLoading) return <Skeleton h={200} />;

  const invalido =
    (!noAplica &&
      (faltanVerif ||
        (algunNo && !obs.trim()) ||
        (config.dictamen && d.aprobado === undefined) ||
        faltanResultados ||
        sinJustificar)) ||
    (noAplica && !motivoNoAplica.trim());

  return (
    <Stack gap="md">
      <Checkbox
        label="No aplica en este lote"
        description="Por ejemplo, granel tercerizado (R.40.27.1): la etapa igual se controla."
        checked={noAplica}
        onChange={(e) => set('no_aplica', e.currentTarget.checked)}
      />
      {noAplica ? (
        <TextInput
          label="Por qué no aplica"
          value={motivoNoAplica}
          onChange={(e) => set('motivo', e.currentTarget.value)}
        />
      ) : (
        <>
          {config.area ? (
            <Text size="sm" c="dimmed">
              Se realiza en: {config.area}
            </Text>
          ) : null}
          {config.verificaciones ? (
            <Stack gap={6}>
              <Text fw={600} size="sm">
                Verificaciones previas
              </Text>
              {config.verificaciones.map((v, i) => (
                <Group key={v} justify="space-between" wrap="nowrap">
                  <Text size="sm">{v}</Text>
                  <SegmentedControl
                    size="sm"
                    value={verif[i] === true ? 'si' : verif[i] === false ? 'no' : ''}
                    onChange={(x) => set('verificaciones', { ...verif, [i]: x === 'si' })}
                    data={[
                      { value: 'si', label: 'Sí' },
                      { value: 'no', label: 'No' },
                    ]}
                  />
                </Group>
              ))}
              {algunNo ? (
                <Alert
                  color="estadoCuarentena"
                  variant="light"
                  icon={<IconAlertTriangle size={18} />}
                >
                  Una verificación en «No» es un desvío: explicalo en observaciones.
                </Alert>
              ) : null}
            </Stack>
          ) : null}

          {(config.tablas ?? []).map((t) => (
            <EditorTabla
              key={t.clave}
              titulo={t.titulo}
              columnas={t.columnas}
              filas={(d[t.clave] as Fila[] | undefined) ?? []}
              equipos={(equipos.data ?? []).map((e) => ({
                value: e.codigo,
                label: `${e.codigo} · ${e.nombre}`,
              }))}
              onCambiar={(f) => set(t.clave, f)}
            />
          ))}

          {config.campos ? (
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {config.campos.map((c) => (
                <Campo
                  key={c.clave}
                  columna={c}
                  valor={d[c.clave] as string | number | null}
                  onCambiar={(v) => set(c.clave, v)}
                />
              ))}
            </SimpleGrid>
          ) : null}
          {etapa === 'FRACCIONAMIENTO' ? (
            <Text size="sm">
              Unidades totales: <b>{numero(unidadesRecuento(d), 0)}</b>
            </Text>
          ) : null}

          {config.contraEspecificacion ? (
            orden.especificacion_id ? (
              <Stack gap={6}>
                <Text fw={600} size="sm">
                  Resultados contra la especificación
                </Text>
                {parametros.map((p) => {
                  const r = resultados[p.id] ?? {};
                  const auto =
                    esNumerico(p.tipo_criterio) && r.valor !== undefined && r.valor !== ''
                      ? cumpleNumerico(p, Number(r.valor))
                      : null;
                  const cumple = r.cumple ?? auto;
                  const setR = (x: object) =>
                    set('resultados', { ...resultados, [p.id]: { ...r, ...x } });
                  return (
                    <Paper
                      key={p.id}
                      withBorder
                      p="xs"
                      style={{ borderColor: 'var(--superficie-borde)' }}
                    >
                      <Group justify="space-between" wrap="wrap">
                        <div>
                          <Text size="sm" fw={600}>
                            {p.nombre}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {textoCriterio(p)}
                          </Text>
                        </div>
                        <Group gap="xs">
                          {esNumerico(p.tipo_criterio) ? (
                            <NumberInput
                              aria-label={`Resultado de ${p.nombre}`}
                              w={130}
                              decimalScale={6}
                              value={r.valor ?? ''}
                              onChange={(v) => setR({ valor: v })}
                              rightSection={<Text size="xs">{p.unidad}</Text>}
                            />
                          ) : null}
                          <SegmentedControl
                            size="xs"
                            value={cumple === true ? 'si' : cumple === false ? 'no' : ''}
                            onChange={(x) => setR({ cumple: x === 'si' })}
                            data={[
                              { value: 'si', label: 'Cumple' },
                              { value: 'no', label: 'No cumple' },
                            ]}
                          />
                        </Group>
                      </Group>
                      {auto !== null &&
                      r.cumple !== undefined &&
                      r.cumple !== null &&
                      r.cumple !== auto ? (
                        <TextInput
                          mt={6}
                          size="xs"
                          label="El dictamen difiere del cálculo: justificá (§7.3)"
                          value={r.justificacion ?? ''}
                          onChange={(e) => setR({ justificacion: e.currentTarget.value })}
                        />
                      ) : null}
                    </Paper>
                  );
                })}
              </Stack>
            ) : (
              <Alert color="gray" variant="light">
                La orden no tiene especificación: el control se registra solo con el
                dictamen.
              </Alert>
            )
          ) : null}

          {config.dictamen ? (
            <Group>
              <Text size="sm" fw={600}>
                Adjuntar {config.dictamen.registro} · APROBADO:
              </Text>
              <SegmentedControl
                value={d.aprobado === true ? 'si' : d.aprobado === false ? 'no' : ''}
                onChange={(x) => set('aprobado', x === 'si')}
                data={[
                  { value: 'si', label: 'Sí' },
                  { value: 'no', label: 'No' },
                ]}
              />
            </Group>
          ) : null}
        </>
      )}

      <Textarea
        label="Observaciones"
        autosize
        minRows={2}
        value={obs}
        onChange={(e) => setObs(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Volver
        </Button>
        <Button
          loading={guardar.isPending}
          disabled={Boolean(invalido)}
          onClick={() =>
            guardar.mutate(
              {
                ordenId: orden.id,
                etapa,
                ...(registrada ? { id: registrada.id } : {}),
                datos: d,
                observaciones: obs.trim() || null,
              },
              { onSuccess: onListo },
            )
          }
        >
          {registrada ? 'Guardar corrección' : 'Registrar (realizó)'}
        </Button>
      </Group>
    </Stack>
  );
}

function Campo({
  columna,
  valor,
  onCambiar,
  compacto,
  equipos = [],
}: {
  columna: Columna;
  valor: string | number | null;
  onCambiar: (v: string | number | boolean | null) => void;
  compacto?: boolean;
  equipos?: { value: string; label: string }[];
}) {
  const etiqueta = compacto ? undefined : columna.titulo;
  const aria = columna.titulo;
  switch (columna.tipo) {
    case 'numero':
      return (
        <NumberInput
          label={etiqueta}
          aria-label={aria}
          decimalScale={3}
          hideControls
          value={valor ?? ''}
          onChange={(v) => onCambiar(v === '' ? null : v)}
        />
      );
    case 'hora':
      return (
        <TextInput
          label={etiqueta}
          aria-label={aria}
          type="time"
          value={String(valor ?? '')}
          onChange={(e) => onCambiar(e.currentTarget.value)}
        />
      );
    case 'fecha':
      return (
        <TextInput
          label={etiqueta}
          aria-label={aria}
          type="date"
          value={String(valor ?? '')}
          onChange={(e) => onCambiar(e.currentTarget.value)}
        />
      );
    case 'si_no':
      return (
        <Stack gap={4}>
          {etiqueta ? (
            <Text size="sm" fw={500}>
              {etiqueta}
            </Text>
          ) : null}
          <SegmentedControl
            value={
              (valor as unknown) === true
                ? 'si'
                : (valor as unknown) === false
                  ? 'no'
                  : ''
            }
            onChange={(x) => onCambiar(x === 'si')}
            data={[
              { value: 'si', label: 'Sí' },
              { value: 'no', label: 'No' },
            ]}
          />
        </Stack>
      );
    case 'equipo':
      return (
        <Select
          label={etiqueta}
          aria-label={aria}
          data={equipos}
          searchable
          clearable
          value={valor === null ? null : String(valor)}
          onChange={onCambiar}
          nothingFoundMessage="Dalo de alta en Equipos"
        />
      );
    default:
      return (
        <TextInput
          label={etiqueta}
          aria-label={aria}
          value={String(valor ?? '')}
          onChange={(e) => onCambiar(e.currentTarget.value)}
        />
      );
  }
}

function EditorTabla({
  titulo,
  columnas,
  filas,
  equipos,
  onCambiar,
}: {
  titulo: string;
  columnas: Columna[];
  filas: Fila[];
  equipos: { value: string; label: string }[];
  onCambiar: (f: Fila[]) => void;
}) {
  const vacia = Object.fromEntries(columnas.map((c) => [c.clave, null])) as Fila;
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {titulo}
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => onCambiar([...filas, vacia])}
        >
          Agregar renglón
        </Button>
      </Group>
      {filas.length === 0 ? (
        <Text size="xs" c="dimmed">
          Sin renglones.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={columnas.length * 130}>
          <Table verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                {columnas.map((c) => (
                  <Table.Th key={c.clave}>
                    <Text size="xs">{c.titulo}</Text>
                  </Table.Th>
                ))}
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f, i) => (
                <Table.Tr key={i}>
                  {columnas.map((c) => (
                    <Table.Td key={c.clave}>
                      <Campo
                        compacto
                        columna={c}
                        valor={f[c.clave] ?? null}
                        equipos={equipos}
                        onCambiar={(v) =>
                          onCambiar(
                            filas.map((x, j) =>
                              j === i
                                ? { ...x, [c.clave]: v as string | number | null }
                                : x,
                            ),
                          )
                        }
                      />
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Quitar renglón"
                      onClick={() => onCambiar(filas.filter((_, j) => j !== i))}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

/* --------------------------- Terminar / liberar --------------------------- */

function ModalCierre({
  orden,
  tipo,
  recuento,
  onCerrar,
}: {
  orden: OrdenProduccion;
  tipo: 'terminar' | 'liberar' | 'anular' | null;
  recuento: number;
  onCerrar: () => void;
}) {
  const terminar = useTerminarOrden();
  const liberar = useLiberarOrden();
  const anular = useAnularOrden();
  const faltantes = useFaltantesLiberacion(orden.id, tipo === 'liberar');
  const [cantidad, setCantidad] = useState<number | string>('');
  const [unidades, setUnidades] = useState<number | string>('');
  const [motivo, setMotivo] = useState('');
  const n = (v: number | string) => (typeof v === 'number' ? v : Number(v || 0));
  const faltan = faltantes.data ?? [];
  const titulo = {
    terminar: 'Terminar la orden',
    liberar: 'Liberación del producto terminado',
    anular: 'Anular la orden',
  };

  return (
    <Modal
      opened={tipo !== null}
      onClose={onCerrar}
      title={tipo ? titulo[tipo] : ''}
      centered
    >
      {tipo === 'terminar' ? (
        <Stack gap="md">
          <NumberInput
            label={`Cantidad obtenida (${orden.unidad})`}
            decimalScale={3}
            min={0}
            value={cantidad}
            onChange={setCantidad}
          />
          <NumberInput
            label="Unidades obtenidas"
            description={
              recuento ? `El recuento del fraccionamiento da ${recuento}` : undefined
            }
            allowDecimal={false}
            min={0}
            value={unidades === '' && recuento ? recuento : unidades}
            onChange={setUnidades}
          />
          <Group justify="flex-end">
            <Button
              loading={terminar.isPending}
              disabled={cantidad === ''}
              onClick={() =>
                terminar.mutate(
                  {
                    id: orden.id,
                    cantidad: n(cantidad),
                    unidades: unidades === '' ? recuento : n(unidades),
                  },
                  { onSuccess: onCerrar },
                )
              }
            >
              Terminar
            </Button>
          </Group>
        </Stack>
      ) : null}
      {tipo === 'liberar' ? (
        <Stack gap="md">
          {faltan.length > 0 ? (
            <Alert
              color="estadoCuarentena"
              variant="light"
              title="Todavía no se puede liberar"
            >
              {faltan
                .map(
                  (f) => `${ETAPAS.find((e) => e.etapa === f.etapa)?.titulo}: ${f.falta}`,
                )
                .join(' · ')}
            </Alert>
          ) : (
            <Text size="sm">
              Todas las etapas están controladas. «Liberar» habilita la venta del lote; la
              firma física del batch record sigue aparte.
            </Text>
          )}
          <TextInput
            label="Motivo (obligatorio para rechazar)"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="space-between">
            <Button
              color="red"
              variant="light"
              loading={liberar.isPending && liberar.variables?.aprobado === false}
              disabled={motivo.trim().length < 3}
              onClick={() =>
                liberar.mutate(
                  { id: orden.id, aprobado: false, motivo: motivo.trim() },
                  { onSuccess: onCerrar },
                )
              }
            >
              Rechazar el lote
            </Button>
            <Button
              loading={liberar.isPending && liberar.variables?.aprobado === true}
              disabled={faltan.length > 0}
              onClick={() =>
                liberar.mutate(
                  { id: orden.id, aprobado: true, motivo: motivo.trim() || null },
                  { onSuccess: onCerrar },
                )
              }
            >
              Liberar al mercado
            </Button>
          </Group>
        </Stack>
      ) : null}
      {tipo === 'anular' ? (
        <Stack gap="md">
          <Text size="sm">
            La orden queda anulada con su motivo; su número no se reutiliza.
          </Text>
          <TextInput
            label="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              color="red"
              loading={anular.isPending}
              disabled={motivo.trim().length < 3}
              onClick={() =>
                anular.mutate(
                  { id: orden.id, motivo: motivo.trim() },
                  { onSuccess: onCerrar },
                )
              }
            >
              Anular
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
