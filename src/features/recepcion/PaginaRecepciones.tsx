import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconFlask,
  IconPackageImport,
  IconPlus,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { FormularioRecepcion } from './FormularioRecepcion';
import { ControlRapidoMP } from '@/features/calidad/ControlRapidoMP';
import {
  useCargarRecepcionAStock,
  useDepositoPorDefecto,
  useDepositos,
  useRecepciones,
} from '@/lib/consultas';
import { fechaHora, numero } from '@/lib/formato';
import { useTieneRol } from '@/features/auth/sesion';
import {
  ETIQUETA_COMPROBANTE,
  numeroComprobante,
  useComprobantesProveedor,
} from '@/lib/consultasCompras';

/**
 * Recepciones (I.20.1).
 *
 * El listado es el índice del registro: número correlativo, remito, proveedor y
 * cuántos lotes entraron. El detalle de cada lote vive en la pantalla de lotes,
 * porque es ahí donde el material sigue su circuito.
 */
export function PaginaRecepciones() {
  const recepciones = useRecepciones();
  const cargar = useCargarRecepcionAStock();
  const comprobantes = useComprobantesProveedor();
  /* Comprobantes vigentes por recepción (RN-65: registro aparte, vinculado). */
  const comprobantesDe = new Map<string, NonNullable<typeof comprobantes.data>>();
  for (const c of comprobantes.data ?? []) {
    if (!c.recepcion_id || c.anulado_en) continue;
    comprobantesDe.set(c.recepcion_id, [
      ...(comprobantesDe.get(c.recepcion_id) ?? []),
      c,
    ]);
  }
  const [abierto, modal] = useDisclosure(false);
  /* §3.3 no tiene fila para la entrada por compra. Toma el conjunto de
     «Ajustar stock por diferencia de inventario», que es el mismo que ya puede
     completar la carga administrativa de la recepción (decisión abierta D-14). */
  const puedeCargarStock = useTieneRol(
    'DIRECCION_TECNICA',
    'ADMINISTRACION',
    'GERENCIA_PRODUCCION',
    'RECEPCION',
  );
  const puedeRegistrar = useTieneRol(
    'OPERARIO',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
    'GERENCIA_PRODUCCION',
    'RECEPCION',
  );
  /* gmp.control_rapido_materia_prima (D-recepcion-1). */
  const haceControlRapido = useTieneRol(
    'RECEPCION',
    'CONTROL_CALIDAD',
    'DIRECCION_TECNICA',
  );
  const [aControlar, setAControlar] = useState<LoteDeRecepcion[]>([]);

  const filas = recepciones.data ?? [];
  const [aCargar, setACargar] = useState<Recepcion | null>(null);

  return (
    <>
      <EncabezadoPagina
        titulo="Recepciones"
        descripcion="Ingreso de mercadería según I.20.1. Cada recepción agrupa los lotes que llegaron con un remito."
        acciones={
          puedeRegistrar ? (
            <Button leftSection={<IconPlus size={18} />} onClick={modal.open}>
              Nueva recepción
            </Button>
          ) : null
        }
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {recepciones.isLoading ? (
          <Skeleton h={260} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconTruckDelivery}
            titulo="Todavía no hay recepciones"
            descripcion="Registrá el primer ingreso de mercadería. Se numera solo y queda auditado con tu firma."
            accion={
              puedeRegistrar ? (
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={modal.open}
                >
                  Nueva recepción
                </Button>
              ) : null
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>N°</Table.Th>
                  <Table.Th>Fecha y hora</Table.Th>
                  <Table.Th>Proveedor</Table.Th>
                  <Table.Th>Remito</Table.Th>
                  <Table.Th>Comprobante</Table.Th>
                  <Table.Th>Lotes</Table.Th>
                  <Table.Th>Estado administrativo</Table.Th>
                  {puedeCargarStock || haceControlRapido ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((r) => {
                  const proveedor = r.proveedor as { razon_social: string } | null;
                  const lotes = (r.lotes as { id: string }[] | null) ?? [];
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text ff="monospace" fw={600} size="sm">
                          {r.numero}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{fechaHora(r.fecha_hora)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{proveedor?.razon_social ?? '—'}</Text>
                          {r.proveedor_nuevo ? (
                            <Badge size="xs" variant="light" color="indigo" radius="sm">
                              nuevo
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{r.numero_remito ?? 'Sin remito'}</Text>
                          {!r.coincide_con_pedido ? (
                            <Tooltip label="No coincide con lo pedido (I.20.1 paso 2)">
                              <IconAlertTriangle
                                size={15}
                                color="var(--mantine-color-estadoCuarentena-7)"
                              />
                            </Tooltip>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {(comprobantesDe.get(r.id) ?? []).map((c) => (
                          <Group key={c.id} gap={6} wrap="nowrap">
                            <Badge
                              size="sm"
                              variant="light"
                              radius="sm"
                              color={
                                c.tipo === 'SIN_FACTURA' ? 'estadoCuarentena' : 'azul'
                              }
                            >
                              {ETIQUETA_COMPROBANTE[c.tipo]}
                            </Badge>
                            {c.tipo === 'SIN_FACTURA' ? null : (
                              <Text size="xs" ff="monospace">
                                {numeroComprobante(c)}
                              </Text>
                            )}
                          </Group>
                        ))}
                        {comprobantesDe.has(r.id) ? null : (
                          <Text size="xs" c="dimmed">
                            sin cargar
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{numero(lotes.length)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          radius="sm"
                          color={r.cargado_a_stock ? 'azul' : 'gray'}
                        >
                          {r.cargado_a_stock ? 'Cargada a stock' : 'Pendiente'}
                        </Badge>
                        {r.cargado_a_stock ? (
                          <Text size="xs" c="dimmed" mt={2}>
                            {fechaHora(r.cargado_en)}
                          </Text>
                        ) : null}
                      </Table.Td>
                      {puedeCargarStock || haceControlRapido ? (
                        <Table.Td>
                          {puedeCargarStock && !r.cargado_a_stock ? (
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="azul"
                              leftSection={<IconPackageImport size={15} />}
                              loading={
                                cargar.isPending && cargar.variables.recepcionId === r.id
                              }
                              onClick={() => setACargar(r)}
                            >
                              Cargar a stock
                            </Button>
                          ) : null}
                          {haceControlRapido && pendientesMP(r).length > 0 ? (
                            <Button
                              size="compact-sm"
                              variant="light"
                              color="estadoEnAnalisis"
                              leftSection={<IconFlask size={15} />}
                              mt={4}
                              onClick={() => setAControlar(pendientesMP(r))}
                            >
                              Control de calidad ({pendientesMP(r).length})
                            </Button>
                          ) : null}
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={modal.close}
        title={<Text fw={700}>Nueva recepción</Text>}
        size="xl"
      >
        <FormularioRecepcion onListo={modal.close} />
      </Modal>

      <Modal
        opened={aCargar !== null}
        onClose={() => setACargar(null)}
        title={<Text fw={700}>Cargar a stock la recepción {aCargar?.numero}</Text>}
        size="lg"
      >
        {aCargar ? (
          <CargarAStock
            recepcion={aCargar}
            enCurso={cargar.isPending}
            onCancelar={() => setACargar(null)}
            onConfirmar={(depositos) => {
              const recepcion = aCargar;
              cargar.mutate(
                { recepcionId: recepcion.id, depositos },
                // Lo pidió la planta: al cargar a stock salta el control de
                // la materia prima, de a un lote (D-recepcion-1).
                {
                  onSuccess: () => {
                    if (haceControlRapido) setAControlar(pendientesMP(recepcion));
                  },
                },
              );
              setACargar(null);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={aControlar.length > 0}
        onClose={() => setAControlar([])}
        title={
          <Text fw={700}>
            Control de materia prima
            {aControlar.length > 1 ? ` · quedan ${aControlar.length}` : ''}
          </Text>
        }
        size="lg"
      >
        {aControlar[0] ? (
          <ControlRapidoMP
            key={aControlar[0].id}
            lote={{
              id: aControlar[0].id,
              numero: aControlar[0].numero_registro_interno,
              nombre: aControlar[0].insumo?.nombre ?? '',
              requiereProtocolo: aControlar[0].insumo?.requiere_protocolo ?? false,
              bultos: aControlar[0].cantidad_bultos,
            }}
            onListo={() => setAControlar((l) => l.slice(1))}
          />
        ) : null}
      </Modal>
    </>
  );
}

type Recepcion = NonNullable<ReturnType<typeof useRecepciones>['data']>[number];
type LoteDeRecepcion = Recepcion['lotes'][number];

/** Materia prima de la recepción que todavía no tiene veredicto. */
const pendientesMP = (r: Recepcion): LoteDeRecepcion[] =>
  r.lotes.filter(
    (l) =>
      l.insumo?.tipo === 'MATERIA_PRIMA' &&
      (l.estado === 'RECIBIDO' || l.estado === 'CUARENTENA'),
  );

/**
 * La carga a stock es un acto administrativo deliberado y posterior a la
 * recepción física, no un efecto automático de ella: Depósito recibe y
 * Administración concilia. Se confirma porque no tiene vuelta atrás por la
 * vía fácil —deshacerla exige anular movimiento por movimiento (RN-54)—.
 *
 * Un lote sin depósito (recibido antes de 20261020130000, o de un insumo sin
 * cuarentena en la ficha) se resuelve acá mismo: se propone el de su tipo y
 * se puede cambiar.
 */
function CargarAStock({
  recepcion,
  enCurso,
  onCancelar,
  onConfirmar,
}: {
  recepcion: Recepcion;
  enCurso: boolean;
  onCancelar: () => void;
  onConfirmar: (depositos: Record<string, string>) => void;
}) {
  const lotes = recepcion.lotes;
  const sinDeposito = lotes.filter((l) => !l.deposito_actual_id);
  const depositos = useDepositos();
  const sugeridos = useDepositoPorDefecto([
    ...new Set(sinDeposito.map((l) => l.insumo_id)),
  ]);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const elegido = (l: (typeof lotes)[number]) =>
    elegidos[l.id] ?? sugeridos.data?.get(l.insumo_id) ?? null;
  const faltan = sinDeposito.some((l) => !elegido(l));

  const opciones = (depositos.data ?? [])
    // Los mismos que acepta gmp.asignar_deposito_lote: cuarentena o inflamables.
    .filter(
      (d) =>
        d.activo &&
        (d.estado_admitido === 'CUARENTENA' || d.tipo_contenido === 'INFLAMABLES'),
    )
    .map((d) => ({ value: d.id, label: `${d.numero} — ${d.nombre}` }));

  return (
    <Stack gap="md">
      <Text size="sm">
        Se registra una entrada por cada uno de los {numero(lotes.length)}{' '}
        {lotes.length === 1 ? 'lote' : 'lotes'} de la recepción, en el depósito de cada
        uno. Queda a tu nombre y no se deshace: un movimiento de stock no se borra, se
        anula con su inverso.
      </Text>
      {sinDeposito.length > 0 ? (
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            {sinDeposito.length === 1
              ? 'Este lote no tiene depósito. Te propongo el de su tipo:'
              : 'Estos lotes no tienen depósito. Te propongo el de su tipo:'}
          </Text>
          {sinDeposito.map((l) => (
            <Select
              key={l.id}
              label={`${l.numero_registro_interno} · ${l.insumo?.nombre ?? ''}`}
              data={opciones}
              value={elegido(l)}
              onChange={(v) => v && setElegidos((e) => ({ ...e, [l.id]: v }))}
              allowDeselect={false}
              searchable
              disabled={sugeridos.isLoading}
            />
          ))}
        </Stack>
      ) : null}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          color="azul"
          loading={enCurso || sugeridos.isLoading}
          disabled={faltan}
          onClick={() =>
            onConfirmar(Object.fromEntries(sinDeposito.map((l) => [l.id, elegido(l)!])))
          }
        >
          Cargar a stock
        </Button>
      </Group>
    </Stack>
  );
}
