import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconChecklist } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useSesion } from '@/features/auth/sesion';
import { useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import {
  ETAPAS,
  useOrdenesAbiertasConEtapas,
  type EtapaOrden,
  type OrdenProduccion,
} from '@/lib/consultasOrdenes';
import { EditorEtapa } from './PaginaOrden';

/*
 * Lo que hace planta según los POE: pesada (I.40.16), elaboración y
 * fraccionamiento (ME.40.x / R.40.x.1), cada una con sus verificaciones de
 * área, equipos y vestimenta. Muestreos, controles y contramuestra son de
 * Control de Calidad (I.50.4, I.60.12) y no aparecen acá.
 */
const DE_PLANTA: EtapaOrden[] = ['PESADA', 'ELABORACION', 'FRACCIONAMIENTO'];

/** El próximo paso de planta de una orden, en el orden del batch record. */
export const proximaDePlanta = (hechas: EtapaOrden[]) =>
  DE_PLANTA.find((e) => !hechas.includes(e)) ?? null;

const QUE_SE_CARGA: Partial<Record<EtapaOrden, string>> = {
  PESADA:
    'Verificaciones de área, balanza y vestimenta, y lo que pesaste de cada materia prima.',
  ELABORACION: 'Verificaciones de área y vestimenta, y cada paso con su hora y equipo.',
  FRACCIONAMIENTO: 'Verificaciones, envases usados, horarios y el recuento de canastas.',
};

/**
 * «Tareas de producción»: por cada orden abierta que puso Gerencia de
 * Producción, el próximo paso de planta. Se elige uno, se completa lo que pide
 * el POE y se pone el ok («Registrar»); eso es lo que queda en el batch record.
 * Controlar lo hace otra persona desde la orden.
 */
export function TareasProduccion({ titulo = true }: { titulo?: boolean }) {
  const { claims } = useSesion();
  const ordenes = useOrdenesAbiertasConEtapas();
  const productos = useProductos();
  const [haciendo, setHaciendo] = useState<{
    orden: OrdenProduccion;
    etapa: EtapaOrden;
  } | null>(null);
  const nombre = (id: string) =>
    (productos.data ?? []).find((p) => p.id === id)?.nombre ?? '';

  if (ordenes.isLoading) return <Skeleton h={200} radius="lg" />;

  const tareas = (ordenes.data ?? []).flatMap(({ op_etapas, ...orden }) => {
    const proxima = proximaDePlanta((op_etapas ?? []).map((e) => e.etapa));
    return proxima ? [{ orden: orden, etapa: proxima }] : [];
  });

  return (
    <Stack gap="md">
      {titulo ? (
        <div>
          <Title order={2}>
            {claims?.nombre
              ? `Hola, ${claims.nombre.split(' ')[0]}`
              : 'Tareas de producción'}
          </Title>
          <Text c="dimmed" size="lg">
            {tareas.length === 0
              ? 'No hay nada para hacer en planta por ahora.'
              : 'Elegí qué vas a hacer, completá lo que pide el POE y poné el ok.'}
          </Text>
        </div>
      ) : null}

      {tareas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconChecklist}
            titulo="Sin tareas"
            descripcion="Cuando Gerencia de Producción abra una orden, aparece acá."
          />
        </Paper>
      ) : (
        tareas.map(({ orden, etapa }) => (
          <Paper
            key={orden.id}
            withBorder
            p="lg"
            radius="lg"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Group justify="space-between" wrap="wrap" gap="md">
              <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                <Group gap="xs">
                  <Badge size="lg" variant="light">
                    {ETAPAS.find((e) => e.etapa === etapa)?.titulo}
                  </Badge>
                </Group>
                <Text fw={700} size="lg">
                  {nombre(orden.producto_id)}
                </Text>
                <Text size="sm" c="dimmed">
                  Lote {orden.numero_lote} · {numero(Number(orden.cantidad_teorica), 2)}{' '}
                  {orden.unidad} · elaboración {fecha(orden.jornada)}
                </Text>
                <Text size="sm">{QUE_SE_CARGA[etapa]}</Text>
              </Stack>
              <Button size="lg" onClick={() => setHaciendo({ orden, etapa })}>
                Hacer
              </Button>
            </Group>
          </Paper>
        ))
      )}

      <Modal
        opened={haciendo !== null}
        onClose={() => setHaciendo(null)}
        title={
          haciendo ? (
            <Text fw={700}>
              {ETAPAS.find((e) => e.etapa === haciendo.etapa)?.titulo} · lote{' '}
              {haciendo.orden.numero_lote}
            </Text>
          ) : null
        }
        size="xl"
        centered
      >
        {haciendo ? (
          <EditorEtapa
            orden={haciendo.orden}
            etapa={haciendo.etapa}
            registrada={null}
            onListo={() => setHaciendo(null)}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
