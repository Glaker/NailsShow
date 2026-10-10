import { useState } from 'react';
import { Alert, Badge, Button, FileButton, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { IconDownload, IconFileImport, IconInfoCircle } from '@tabler/icons-react';
import { filasDePlantilla, leerPlantilla, type Plantilla, type RenglonLeido } from '@/lib/importacion';
import { descargarXlsx, leerXlsx, sha256 } from '@/lib/xlsx';

/**
 * Importar una planilla con plantilla fija (D-54):
 *  1. «Más información»: estructura esperada y la plantilla para descargar.
 *  2. Al subir, vista previa renglón por renglón: crear / actualizar / error.
 *  3. Recién al confirmar se escribe, en una transacción, con el hash del archivo.
 */
export function ImportarExcel<C>({
  plantilla,
  contexto,
  onConfirmar,
}: {
  plantilla: Plantilla<C>;
  contexto: C;
  onConfirmar: (r: { renglones: RenglonLeido[]; archivo: string; hash: string }) => Promise<unknown>;
}) {
  const [info, setInfo] = useState(false);
  const [lectura, setLectura] = useState<{ archivo: string; hash: string; renglones: RenglonLeido[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const abrir = async (f: File | null) => {
    if (!f) return;
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const r = leerPlantilla(await leerXlsx(buf), plantilla, contexto);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setLectura({ archivo: f.name, hash: await sha256(buf), renglones: r.renglones });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };
  const cuenta = (a: RenglonLeido['accion']) => lectura?.renglones.filter((r) => r.accion === a).length ?? 0;

  return (
    <>
      <Group gap="xs">
        <FileButton onChange={(f) => void abrir(f)} accept=".xlsx">
          {(props) => (
            <Button {...props} variant="light" leftSection={<IconFileImport size={18} />}>
              Importar Excel
            </Button>
          )}
        </FileButton>
        <Button variant="subtle" leftSection={<IconInfoCircle size={18} />} onClick={() => setInfo(true)}>
          Más información
        </Button>
      </Group>
      {error ? (
        <Alert color="red" mt="sm" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <Modal opened={info} onClose={() => setInfo(false)} title={`Plantilla: ${plantilla.titulo}`} size="xl" centered>
        <Stack>
          <Text size="sm">{plantilla.descripcion}</Text>
          <Text size="sm">
            La primera fila lleva exactamente estos encabezados (el orden da igual). Si sobra o falta una columna, la
            planilla se rechaza: no se adivina nada.
          </Text>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Columna</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Obligatoria</Table.Th>
                <Table.Th>Qué va</Table.Th>
                <Table.Th>Ejemplo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {plantilla.columnas.map((c) => (
                <Table.Tr key={c.clave}>
                  <Table.Td ff="monospace">{c.clave}</Table.Td>
                  <Table.Td>{c.tipo === 'numero' ? 'número' : c.tipo === 'fecha' ? 'fecha (dd/mm/aaaa)' : 'texto'}</Table.Td>
                  <Table.Td>{c.requerida ? 'sí' : 'no'}</Table.Td>
                  <Table.Td>
                    {c.descripcion}
                    {c.valores ? ` (${c.valores.join(', ')})` : ''}
                  </Table.Td>
                  <Table.Td ff="monospace">{c.ejemplo === null ? '—' : String(c.ejemplo)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Button
            leftSection={<IconDownload size={18} />}
            onClick={() => descargarXlsx(filasDePlantilla(plantilla), plantilla.archivo, plantilla.titulo)}
          >
            Descargar la plantilla
          </Button>
        </Stack>
      </Modal>

      <Modal opened={lectura !== null} onClose={() => setLectura(null)} title="Vista previa de la importación" size="xl" centered>
        {lectura ? (
          <Stack>
            <Text size="sm">
              {lectura.archivo} · SHA-256 <Text span ff="monospace" size="xs">{lectura.hash.slice(0, 16)}…</Text>
            </Text>
            <Group gap="xs">
              <Badge color="green" variant="light">{cuenta('crear')} a crear</Badge>
              <Badge color="blue" variant="light">{cuenta('actualizar')} a actualizar</Badge>
              <Badge color="red" variant="light">{cuenta('error')} con error</Badge>
            </Group>
            <Table.ScrollContainer minWidth={700} mah={400}>
              <Table verticalSpacing="xs" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fila</Table.Th>
                    <Table.Th>Qué pasa</Table.Th>
                    {plantilla.columnas.slice(0, 5).map((c) => (
                      <Table.Th key={c.clave}>{c.clave}</Table.Th>
                    ))}
                    <Table.Th>Errores</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {lectura.renglones.map((r) => (
                    <Table.Tr key={r.numero}>
                      <Table.Td>{r.numero}</Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={r.accion === 'error' ? 'red' : r.accion === 'crear' ? 'green' : 'blue'}>
                          {r.accion === 'error' ? 'error' : r.accion === 'crear' ? 'crear' : 'actualizar'}
                        </Badge>
                      </Table.Td>
                      {plantilla.columnas.slice(0, 5).map((c) => (
                        <Table.Td key={c.clave} ff="monospace">
                          {r.datos[c.clave] === null ? '' : String(r.datos[c.clave])}
                        </Table.Td>
                      ))}
                      <Table.Td>
                        <Text size="xs" c="red">
                          {r.errores.join('; ')}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {cuenta('error') ? (
              <Alert color="orange">Corregí los renglones con error en la planilla y volvé a subirla: no se importa a medias.</Alert>
            ) : null}
            <Group justify="flex-end">
              <Button variant="subtle" color="gray" onClick={() => setLectura(null)}>
                Cancelar
              </Button>
              <Button
                disabled={cuenta('error') > 0}
                loading={guardando}
                onClick={() => {
                  setGuardando(true);
                  onConfirmar(lectura)
                    .then(() => setLectura(null))
                    .catch(() => {})
                    .finally(() => setGuardando(false));
                }}
              >
                Importar {lectura.renglones.length} renglones
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
