import { Button, Group } from '@mantine/core';
import { IconFileSpreadsheet, IconPrinter } from '@tabler/icons-react';
import { descargarXlsx, type Celda } from '@/lib/xlsx';

/**
 * Exportar una sección (D-54): Excel con las filas que se le pasan, y PDF con
 * la impresión del navegador (los gráficos de la sección salen tal cual; los
 * controles marcados no-imprimir quedan afuera).
 */
export function Exportar({
  archivo,
  encabezados,
  filas,
}: {
  archivo: string;
  encabezados: string[];
  filas: Celda[][];
}) {
  return (
    <Group gap="xs" className="no-imprimir">
      <Button
        variant="default"
        leftSection={<IconFileSpreadsheet size={18} />}
        disabled={filas.length === 0}
        onClick={() => descargarXlsx([encabezados, ...filas], archivo)}
      >
        Excel
      </Button>
      <Button
        variant="default"
        leftSection={<IconPrinter size={18} />}
        onClick={() => window.print()}
      >
        PDF
      </Button>
    </Group>
  );
}
