import { Link, useParams } from 'react-router-dom';
import { Anchor, Button, Group, Skeleton, Text } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { useCotizacion } from '@/lib/consultasCotizador';
import { CotizacionPdf } from './CotizacionPdf';

/**
 * Hoja para imprimir o guardar como PDF. Sale de la foto que congeló la base
 * al emitir, así que se regenera idéntica. La envía quien cotizó.
 */
export function PaginaCotizacionPdf() {
  const { id = null } = useParams();
  const cot = useCotizacion(id);
  if (cot.isLoading) return <Skeleton h={600} />;
  const pdf = cot.data?.foto?.pdf;
  if (!cot.data || !pdf) return <Text>La cotización todavía no se emitió: no tiene PDF.</Text>;
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
      <CotizacionPdf datos={pdf} />
    </>
  );
}
