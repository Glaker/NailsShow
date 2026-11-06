import {
  Anchor,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useItemsVisibles } from '@/app/navegacion';
import { useLotes, useProductos } from '@/lib/consultas';
import { useOrdenes } from '@/lib/consultasOrdenes';
import { useEstudios } from '@/lib/consultasEstabilidad';
import { useCotizaciones } from '@/lib/consultasCotizador';
import { fecha } from '@/lib/formato';
import Folder from '@/vendor/reactbits/Folder';

interface Hoja {
  titulo: string;
  detalle: string;
  ruta: string;
}

interface Carpeta {
  nombre: string;
  /** Qué se descarga, en una línea. */
  que: string;
  color: string;
  todo: string;
  hojas: Hoja[];
  cargando: boolean;
}

/**
 * Todo lo que se descarga o imprime, en un solo lugar (pedido del codirector
 * técnico, 2026-11-06). Cada tipo de documento es una carpeta (Folder de
 * React Bits): se abre con un toque y muestra los últimos; tocar uno lleva a
 * su ficha, donde está el «Descargar PDF» o «Imprimir» de siempre. Cada rol
 * ve solo las carpetas de las pantallas que ya puede abrir; la base sigue
 * decidiendo qué datos trae (RLS).
 */
export function PaginaDescargas() {
  // Una carpeta aparece solo si el rol ya ve la pantalla de donde se descarga
  // (con las excepciones de «Quién ve qué»): nadie baja algo que hoy no puede.
  const visibles = new Set(useItemsVisibles().map((i) => i.ruta));
  const navegar = useNavigate();
  const esquema = useComputedColorScheme('light');

  const ordenes = useOrdenes();
  const productos = useProductos();
  const estudios = useEstudios();
  const cotizaciones = useCotizaciones();
  const lotes = useLotes();
  const nombre = new Map((productos.data ?? []).map((p) => [p.id, p.nombre]));

  const carpetas: Carpeta[] = [
    {
      nombre: 'Batch records',
      que: 'Registro de lote de cada orden liberada, en PDF.',
      color: '#7950f2',
      todo: '/liberacion',
      cargando: ordenes.isLoading,
      hojas: (ordenes.data ?? [])
        .filter((o) => o.estado === 'LIBERADA')
        .slice(0, 6)
        .map((o) => ({
          titulo: `Lote ${o.numero_lote}`,
          detalle: nombre.get(o.producto_id) ?? o.numero,
          ruta: `/ordenes/${o.id}/batch-record`,
        })),
    },
    {
      nombre: 'Estabilidad',
      que: 'Estudios de estabilidad acelerada, en PDF.',
      color: '#e64980',
      todo: '/estabilidad',
      cargando: estudios.isLoading,
      hojas: (estudios.data ?? []).slice(0, 6).map((e) => ({
        titulo: e.producto,
        detalle: `${e.lote ? `Lote ${e.lote} · ` : ''}desde ${fecha(e.fecha_inicio)}`,
        ruta: `/estabilidad/${e.id}`,
      })),
    },
    {
      nombre: 'Rótulos',
      que: 'Rótulos y etiquetas de muestreo de los lotes de insumo.',
      color: '#15aabf',
      todo: '/lotes',
      cargando: lotes.isLoading,
      hojas: (lotes.data ?? []).slice(0, 6).map((l) => ({
        titulo: l.numero_registro_interno ?? 'Lote',
        detalle: l.insumo_nombre ?? '',
        ruta: `/lotes/${l.id}`,
      })),
    },
    {
      nombre: 'Cotizaciones',
      que: 'Cotizaciones para clientes, en PDF.',
      color: '#fd7e14',
      todo: '/cotizaciones',
      cargando: cotizaciones.isLoading,
      hojas: (cotizaciones.data ?? []).slice(0, 6).map((c) => ({
        titulo: c.numero ? `N.º ${c.numero}${c.anio ? `/${c.anio}` : ''}` : 'Borrador',
        detalle: c.titulo,
        ruta: `/cotizaciones/${c.id}/pdf`,
      })),
    },
    {
      nombre: 'Informes',
      que: 'Informes y estadísticas en Excel.',
      color: '#12b886',
      todo: '/informes',
      cargando: false,
      hojas: [
        {
          titulo: 'Informes y estadísticas',
          detalle: 'Elegí el informe y bajalo',
          ruta: '/informes',
        },
      ],
    },
  ].filter((c) => visibles.has(c.todo));

  return (
    <>
      <EncabezadoPagina
        titulo="Descargas"
        descripcion="Todo lo que se descarga o se imprime, en carpetas. Tocá una carpeta para abrirla y una hoja para ir a su documento."
      />
      {carpetas.length === 0 ? (
        <Text c="dimmed">Tu rol no tiene documentos para descargar.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl" verticalSpacing={48}>
          {carpetas.map((c) => (
            <Stack key={c.nombre} align="center" gap="xs">
              {c.cargando ? (
                <Skeleton h={230} w={230} radius="lg" />
              ) : c.hojas.length === 0 ? (
                <Stack h={230} justify="center" align="center">
                  <Text c="dimmed" size="sm">
                    Todavía no hay documentos.
                  </Text>
                </Stack>
              ) : (
                <div style={{ height: 250, display: 'grid', placeItems: 'center' }}>
                  <Folder
                    label={c.nombre}
                    color={c.color}
                    items={c.hojas.map((h) => ({
                      title: h.titulo,
                      description: h.detalle,
                    }))}
                    layout="spread"
                    size={0.95}
                    draggable={false}
                    zoomOnClick={false}
                    theme={esquema === 'dark' ? 'dark' : 'light'}
                    onItemClick={(_, i) => {
                      const h = c.hojas[i];
                      if (h) void navegar(h.ruta);
                    }}
                  />
                </div>
              )}
              <Text fw={700}>{c.nombre}</Text>
              <Text size="sm" c="dimmed" ta="center" maw={280}>
                {c.que}
              </Text>
              <Group gap="xs">
                <Anchor component={Link} to={c.todo} size="sm">
                  Ver todos
                </Anchor>
              </Group>
            </Stack>
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
