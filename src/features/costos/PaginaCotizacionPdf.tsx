import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Anchor, Button, Group, Skeleton, Text } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import {
  useCotizacion,
  useImagenesCotizacion,
  useProductosCotizacion,
} from '@/lib/consultasCotizador';
import { CotizacionPdf } from './CotizacionPdf';
import { DetalleCostosPdf } from './DetalleCostosPdf';

/**
 * Hoja para imprimir o guardar como PDF. Sale de la foto que congeló la base
 * al emitir, así que se regenera idéntica. La envía quien cotizó.
 * Con `?interno=1`, la hoja de uso interno: la misma con la marca «USO
 * INTERNO» y el detalle de costos abajo (pedido del 2026-10-29).
 */
export function PaginaCotizacionPdf() {
  const { id = null } = useParams();
  const cot = useCotizacion(id);
  const productos = useProductosCotizacion(id);
  // Las de la principal y las de sus productos, en ese orden.
  const imagenes = useImagenesCotizacion(
    id ? [id, ...(productos.data ?? []).map((p) => p.id)] : [],
  );
  const interno = useSearchParams()[0].get('interno') === '1';
  if (cot.isLoading) return <Skeleton h={600} />;
  const pdf = cot.data?.foto?.pdf;
  if (!cot.data || !pdf)
    return <Text>La cotización todavía no se emitió: no tiene PDF.</Text>;
  return (
    <>
      <Group justify="space-between" mb="md" className="no-imprimir">
        <Anchor component={Link} to={`/cotizaciones/${cot.data.id}`} size="sm">
          Volver a la cotización
        </Anchor>
        <Button leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>
          Imprimir o guardar como PDF
        </Button>
      </Group>
      {cot.data.estado === 'ANULADA' ? (
        <Text c="red" fw={700} mb="sm">
          Cotización ANULADA: {cot.data.motivo_anulacion}
        </Text>
      ) : null}
      <CotizacionPdf
        datos={pdf}
        interna={interno}
        imagenes={[...(imagenes.data ?? [])]
          .sort((a, b) => Number(b.cotizacion_id === id) - Number(a.cotizacion_id === id))
          .map((i) => i.datos)}
      />
      {interno ? <DetalleCostosPdf foto={cot.data.foto!} /> : null}
      {interno
        ? (productos.data ?? []).map((p) =>
            p.foto ? <DetalleCostosPdf key={p.id} foto={p.foto} /> : null,
          )
        : null}
    </>
  );
}
