import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconFileTypePdf } from '@tabler/icons-react';
import { fecha, fechaHora, numero } from '@/lib/formato';
import {
  facturadoPorCodigo,
  huellaPdf,
  leerPdfFacturaX,
  type FacturaX,
} from '@/lib/facturaX';
import {
  useCargarConteo,
  useCargarFacturaVenta,
  useCargarFacturaX,
  useFacturaYaCargada,
  useProductosPorCodigo,
  useRenglonesPedido,
  type Canal,
  type ResultadoFacturaX,
} from '@/lib/consultasDespacho';
import type { FilaVenta } from '@/lib/consultasVentas';

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

/**
 * Cargar una factura de venta (D-factura-x-1, D-factura-x-2): se lee el PDF
 * en el navegador (no se guarda). Mayorista: factura X de un pedido, se compara
 * con el pedido. Educadores (J) y Minorista (C, B, X de mostrador): sin pedido,
 * baja el stock de Berna. Si un SKU queda en negativo, se cuenta acá.
 */
export function CargarFacturaX({
  abierto,
  cerrar,
  pedidos,
  pedidoInicial,
}: {
  abierto: boolean;
  cerrar: () => void;
  /** Pedidos de venta aprobados (abiertos o ya despachados). */
  pedidos: FilaVenta[];
  pedidoInicial: string | null;
}) {
  const [factura, setFactura] = useState<FacturaX | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [pedidoElegido, setPedidoElegido] = useState<string | null>(null);
  const [canalElegido, setCanalElegido] = useState<Canal | null>(null);
  const [resultado, setResultado] = useState<ResultadoFacturaX | null>(null);
  const [conteo, setConteo] = useState<Record<string, number | string>>({});
  const cargar = useCargarFacturaX();
  const vender = useCargarFacturaVenta();
  const contar = useCargarConteo();
  const yaCargada = useFacturaYaCargada(resultado ? null : factura);
  const repetida = yaCargada.data ?? null;

  // El pedido sugerido: el elegido a mano, el que vino de la fila, o el abierto del mismo cliente.
  const sugerido = useMemo(() => {
    if (pedidoInicial) return pedidoInicial;
    if (!factura?.cliente) return null;
    const delCliente = pedidos.filter((p) => norm(p.cliente) === norm(factura.cliente));
    return (delCliente.find((p) => !p.entregado_en) ?? delCliente[0])?.id ?? null;
  }, [pedidoInicial, factura, pedidos]);
  // Canal sugerido: J es de Educadores; una X con pedido del cliente, Mayorista; el resto, Minorista.
  const canal: Canal =
    canalElegido ??
    (pedidoInicial
      ? 'MAYORISTA'
      : factura?.tipo === 'J'
        ? 'EDUCADORES'
        : factura?.tipo === 'X' && sugerido
          ? 'MAYORISTA'
          : 'MINORISTA');
  const mayorista = canal === 'MAYORISTA';
  const pedidoId = mayorista ? (pedidoElegido ?? sugerido) : null;
  const renglones = useRenglonesPedido(pedidoId);
  const codigos = useMemo(
    () => (factura ? [...new Set(factura.renglones.map((r) => r.codigo))] : []),
    [factura],
  );
  const catalogo = useProductosPorCodigo(codigos);

  const comparacion = useMemo(() => {
    if (!factura) return [];
    const fact = facturadoPorCodigo(factura);
    const filas = new Map<
      string,
      {
        codigo: string;
        producto: string;
        pedido: number;
        factura: number;
        enCatalogo: boolean;
      }
    >();
    for (const r of renglones.data ?? [])
      filas.set(norm(r.codigo), {
        codigo: r.codigo,
        producto: r.producto,
        pedido: r.cantidad,
        factura: 0,
        enCatalogo: true,
      });
    for (const [cod, cant] of fact) {
      const f = filas.get(cod);
      const p = catalogo.data?.get(cod);
      if (f) f.factura = cant;
      else
        filas.set(cod, {
          codigo: cod,
          producto:
            p?.nombre ??
            factura.renglones.find((r) => norm(r.codigo) === cod)?.descripcion ??
            '',
          pedido: 0,
          factura: cant,
          enCatalogo: catalogo.isLoading || !!p,
        });
    }
    return [...filas.values()];
  }, [factura, renglones.data, catalogo.data, catalogo.isLoading]);

  const salir = () => {
    setFactura(null);
    setErrorPdf(null);
    setPedidoElegido(null);
    setCanalElegido(null);
    setResultado(null);
    setConteo({});
    cerrar();
  };

  const leer = async (archivo: File | null) => {
    setFactura(null);
    setErrorPdf(null);
    setPedidoElegido(null);
    setCanalElegido(null);
    if (!archivo) return;
    setLeyendo(true);
    try {
      const [f, pdf_sha256] = await Promise.all([
        leerPdfFacturaX(archivo),
        huellaPdf(archivo),
      ]);
      if (!f.numero || f.renglones.length === 0)
        setErrorPdf(
          'No se encontró el número ni los renglones: ¿es una factura del sistema?',
        );
      else setFactura({ ...f, pdf_sha256 });
    } catch {
      setErrorPdf('No se pudo leer el PDF.');
    } finally {
      setLeyendo(false);
    }
  };

  const pedido = pedidos.find((p) => p.id === pedidoId);
  const negativos = resultado?.negativos ?? [];

  return (
    <Modal opened={abierto} onClose={salir} title="Cargar factura" size="xl" centered>
      {resultado ? (
        <Stack gap="md">
          <Alert color="estadoAprobado" variant="light" title="Factura cargada">
            {mayorista
              ? `El stock bajó por lo facturado y lo reservado que no salió volvió a quedar libre. El pedido ${pedido?.numero ?? ''} quedó despachado.`
              : 'El stock de Berna bajó por lo facturado.'}
          </Alert>
          {resultado.sin_catalogo ? (
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={20} />}>
              Estos códigos no están en el catálogo y no movieron stock:{' '}
              {resultado.sin_catalogo}. Avisale a Administración.
            </Alert>
          ) : null}
          {negativos.length ? (
            <>
              <Alert
                color="red"
                variant="light"
                icon={<IconAlertTriangle size={20} />}
                title="Estos SKU quedaron en negativo: contalos"
              >
                La factura dice que salieron más de los que tenía el sistema. Contá
                cuántos hay de verdad en el depósito y cargalo: el stock queda como lo
                contaste.
              </Alert>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">En el sistema</Table.Th>
                    <Table.Th>Contados</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {negativos.map((n) => (
                    <Table.Tr key={n.producto_id}>
                      <Table.Td>{n.codigo}</Table.Td>
                      <Table.Td>{n.producto}</Table.Td>
                      <Table.Td ta="right" c="red.8" fw={600}>
                        {numero(n.saldo)}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="md"
                          min={0}
                          allowDecimal={false}
                          value={conteo[n.producto_id] ?? ''}
                          onChange={(v) =>
                            setConteo((c) => ({ ...c, [n.producto_id]: v }))
                          }
                          aria-label={`Contados de ${n.codigo}`}
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Group justify="flex-end">
                <Button variant="default" size="md" onClick={salir}>
                  Contar después
                </Button>
                <Button
                  size="md"
                  loading={contar.isPending}
                  disabled={negativos.some(
                    (n) =>
                      conteo[n.producto_id] === undefined || conteo[n.producto_id] === '',
                  )}
                  onClick={() =>
                    contar.mutate(
                      {
                        depositoId: resultado.deposito_id,
                        conteos: negativos.map((n) => ({
                          producto_id: n.producto_id,
                          cantidad: Number(conteo[n.producto_id]),
                        })),
                      },
                      { onSuccess: salir },
                    )
                  }
                >
                  Cargar conteo
                </Button>
              </Group>
            </>
          ) : (
            <Group justify="flex-end">
              <Button size="md" onClick={salir}>
                Listo
              </Button>
            </Group>
          )}
        </Stack>
      ) : (
        <Stack gap="md">
          <FileInput
            size="md"
            label="PDF de la factura (X, J, C o B)"
            description="Se lee en este dispositivo: el PDF no se guarda."
            placeholder="Elegí el archivo"
            accept="application/pdf"
            leftSection={<IconFileTypePdf size={20} />}
            onChange={(f) => void leer(f)}
            disabled={leyendo}
            clearable
          />
          {leyendo ? <Text size="sm">Leyendo la factura…</Text> : null}
          {errorPdf ? (
            <Alert color="red" variant="light">
              {errorPdf}
            </Alert>
          ) : null}
          {factura ? (
            <>
              <Text size="sm">
                Factura {factura.tipo} <b>{factura.numero}</b>
                {factura.fecha ? ` del ${fecha(factura.fecha)}` : ''} ·{' '}
                {factura.cliente ?? ''}
                {factura.total !== null ? ` · total $${numero(factura.total, 0)}` : ''}
              </Text>
              {repetida ? (
                <Alert
                  color="red"
                  variant="light"
                  icon={<IconAlertTriangle size={20} />}
                  title="Esta factura ya está cargada"
                >
                  {repetida.pdf_igual ? 'Este mismo PDF' : 'Este comprobante'} ya lo cargó{' '}
                  {repetida.cargada_por ?? 'otra persona'} el{' '}
                  {fechaHora(repetida.cargada_en)} (factura {repetida.tipo}{' '}
                  {repetida.numero}). No se puede cargar de nuevo: el stock ya bajó.
                </Alert>
              ) : null}
              <SegmentedControl
                size="md"
                fullWidth
                value={canal}
                onChange={(v) => setCanalElegido(v as Canal)}
                data={[
                  { value: 'MAYORISTA', label: 'Mayorista (pedido)' },
                  { value: 'EDUCADORES', label: 'Educadores' },
                  { value: 'MINORISTA', label: 'Minorista' },
                ]}
              />
              {!mayorista ? (
                <Text size="sm" c="dimmed">
                  Sin pedido: lo facturado baja del stock de Berna.
                </Text>
              ) : null}
              {mayorista ? (
                <Select
                  size="md"
                  label="Pedido"
                  searchable
                  placeholder="Elegí el pedido de esta factura"
                  data={pedidos.map((p) => ({
                    value: p.id,
                    label: `${p.numero} · ${p.cliente}${p.entregado_en ? ' (ya despachado)' : ''}`,
                  }))}
                  value={pedidoId}
                  onChange={setPedidoElegido}
                />
              ) : null}
              {pedido?.entregado_en ? (
                <Text size="sm" c="dimmed">
                  Este pedido ya figura despachado: la factura corrige contra lo que salió
                  (lo de más baja, lo de menos vuelve al stock).
                </Text>
              ) : null}
              {pedidoId || !mayorista ? (
                <Table verticalSpacing="xs" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Código</Table.Th>
                      <Table.Th>Producto</Table.Th>
                      {mayorista ? <Table.Th ta="right">Pedido</Table.Th> : null}
                      <Table.Th ta="right">Factura</Table.Th>
                      <Table.Th>Qué pasa</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {comparacion.map((c) => (
                      <Table.Tr key={c.codigo}>
                        <Table.Td>{c.codigo}</Table.Td>
                        <Table.Td>{c.producto}</Table.Td>
                        {mayorista ? (
                          <Table.Td ta="right">{numero(c.pedido)}</Table.Td>
                        ) : null}
                        <Table.Td ta="right" fw={600}>
                          {numero(c.factura)}
                        </Table.Td>
                        <Table.Td>
                          {!c.enCatalogo ? (
                            <Badge color="red" variant="light">
                              no está en el catálogo
                            </Badge>
                          ) : !mayorista ? (
                            <Badge color="azul" variant="light">
                              baja de Berna
                            </Badge>
                          ) : c.pedido === 0 ? (
                            <Badge color="orange" variant="light">
                              no estaba en el pedido
                            </Badge>
                          ) : c.factura === c.pedido ? (
                            <Badge color="estadoAprobado" variant="light">
                              igual
                            </Badge>
                          ) : c.factura < c.pedido ? (
                            <Badge color="azul" variant="light">
                              no salen {numero(c.pedido - c.factura)}: vuelven al stock
                            </Badge>
                          ) : (
                            <Badge color="orange" variant="light">
                              {numero(c.factura - c.pedido)} de más
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : null}
              <Group justify="flex-end">
                <Button variant="default" size="md" onClick={salir}>
                  Cancelar
                </Button>
                <Button
                  size="md"
                  disabled={
                    !!repetida ||
                    yaCargada.isLoading ||
                    (mayorista && (!pedidoId || renglones.isLoading))
                  }
                  loading={cargar.isPending || vender.isPending}
                  onClick={() =>
                    mayorista
                      ? cargar.mutate(
                          { pedidoId: pedidoId!, factura },
                          { onSuccess: (r) => setResultado(r) },
                        )
                      : vender.mutate(
                          { canal, factura },
                          { onSuccess: (r) => setResultado(r) },
                        )
                  }
                >
                  Cargar factura y descontar stock
                </Button>
              </Group>
            </>
          ) : null}
        </Stack>
      )}
    </Modal>
  );
}
