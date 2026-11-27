import { useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { avisarError } from '@/lib/consultas';
import {
  useAgregarImagen,
  useImagenesCotizacion,
  useQuitarImagen,
  type Cotizacion,
} from '@/lib/consultasCotizador';

const LADO_MAX = 1200;

/**
 * Achica la foto en el navegador a JPEG de hasta 1200 px por lado: así entra
 * en la base (límite 1,5 MB del data URL en comercial.cotizacion_imagenes).
 */
async function comprimir(archivo: File): Promise<string> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext('2d')!;
  // Fondo blanco: un PNG transparente no queda negro al pasar a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL('image/jpeg', 0.82);
}

/** Imágenes de la cotización: se cargan en borrador y salen en el PDF del cliente. */
export function ImagenesCotizacion({ c }: { c: Cotizacion }) {
  const imagenes = useImagenesCotizacion([c.id]);
  const agregar = useAgregarImagen();
  const quitar = useQuitarImagen();
  const [procesando, setProcesando] = useState(false);
  const borrador = c.estado === 'BORRADOR';
  const lista = imagenes.data ?? [];
  if (!borrador && lista.length === 0) return null;

  const cargar = async (archivos: File[]) => {
    setProcesando(true);
    for (const a of archivos) {
      let datos: string;
      try {
        datos = await comprimir(a);
        if (datos.length > 1_500_000) throw new Error(`«${a.name}» es demasiado grande.`);
      } catch (e) {
        avisarError(e);
        continue;
      }
      // El error de guardado ya lo avisa el hook.
      await agregar
        .mutateAsync({ cotizacion_id: c.id, nombre: a.name, datos })
        .catch(() => undefined);
    }
    setProcesando(false);
  };

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Imágenes para el PDF</Title>
        {borrador ? (
          <FileButton onChange={(f) => void cargar(f)} accept="image/*" multiple>
            {(props) => (
              <Button
                {...props}
                variant="light"
                leftSection={<IconPhotoPlus size={18} />}
                loading={procesando}
              >
                Cargar imágenes
              </Button>
            )}
          </FileButton>
        ) : null}
      </Group>
      {lista.length === 0 ? (
        <Text size="sm" c="dimmed">
          Las imágenes que cargues salen en el PDF para el cliente, debajo de los
          productos.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {lista.map((i) => (
            <Stack key={i.id} gap={4}>
              <Image
                src={i.datos}
                alt={i.nombre ?? 'Imagen'}
                radius="sm"
                h={120}
                fit="contain"
              />
              {borrador ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => quitar.mutate(i.id)}
                  aria-label="Quitar imagen"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              ) : null}
            </Stack>
          ))}
        </SimpleGrid>
      )}
    </Paper>
  );
}
