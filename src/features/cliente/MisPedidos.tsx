import { useState } from 'react';
import { Badge, Box, Button, Center, Group, Skeleton, Stack, Text } from '@mantine/core';
import {
  IconArrowBackUp,
  IconEye,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconX,
} from '@tabler/icons-react';
import FlipCard from '@/components/reactbits/FlipCard';
import GradualBlur from '@/components/reactbits/GradualBlur';
import { TextoDual } from './TextoDual';

import { fecha, fechaHora, numero } from '@/lib/formato';
import {
  useCancelarPedidoCliente,
  usePedidosCliente,
  etiquetaOpcion,
  textoCajas,
  type EstadoCliente,
  type PedidoCliente,
} from '@/lib/consultasCliente';

/** Los cuatro estados que ve el cliente (pedido del 2026-11-12), en orden. */
const PASOS: { clave: EstadoCliente; texto: string; color: string }[] = [
  { clave: 'PENDIENTE', texto: 'Pendiente', color: 'grape' },
  { clave: 'EN_PRODUCCION', texto: 'En producción', color: 'blue' },
  { clave: 'EN_CAMINO', texto: 'En camino', color: 'orange' },
  { clave: 'FINALIZADO', texto: 'Finalizado', color: 'teal' },
];

function estadoParaCliente(p: PedidoCliente) {
  if (p.estado_cliente === 'CANCELADO')
    return { texto: 'Cancelado', color: 'gray', paso: -1 };
  const paso = PASOS.findIndex((x) => x.clave === p.estado_cliente);
  return { ...PASOS[paso]!, paso };
}

/** Los cuatro pasos como una línea: lo hecho, en color; lo que falta, gris. */
function Recorrido({ paso, color }: { paso: number; color: string }) {
  return (
    <Group gap={4} mt={10} wrap="nowrap" aria-hidden="true">
      {PASOS.map((x, i) => (
        <Box
          key={x.clave}
          h={6}
          style={{
            flex: 1,
            borderRadius: 99,
            background:
              i <= paso
                ? `var(--mantine-color-${color}-6)`
                : 'var(--mantine-color-default-border)',
            transition: 'background .3s',
          }}
        />
      ))}
    </Group>
  );
}

/** Lo que se pidió: cajas con su opción y unidades sueltas (P3: «Surtido» va solo). */
function Detalle({ p }: { p: PedidoCliente }) {
  return (
    <Stack gap={4}>
      {p.cajas.map((c) => (
        <Group key={`${c.caja_id}|${c.opcion}`} justify="space-between" wrap="nowrap">
          <Text size="sm">
            {c.nombre} · {etiquetaOpcion(c.opcion)}
          </Text>
          <Text size="sm" fw={700} style={{ flexShrink: 0 }}>
            {textoCajas(c.opcion, c.cajas)}
          </Text>
        </Group>
      ))}
      {p.renglones.map((r) => (
        <Group key={r.producto_id} justify="space-between" wrap="nowrap">
          <Text size="sm">{r.producto}</Text>
          <Text size="sm" fw={700} style={{ flexShrink: 0 }}>
            {numero(r.cantidad, 0)}
          </Text>
        </Group>
      ))}
      {p.observaciones ? (
        <Text size="xs" c="dimmed" mt={4}>
          «{p.observaciones}»
        </Text>
      ) : null}
    </Stack>
  );
}

export function MisPedidos({
  onEditar,
  onRepetir,
  onNuevo,
  demo,
}: {
  onEditar: (p: PedidoCliente) => void;
  onRepetir: (p: PedidoCliente) => void;
  onNuevo: () => void;
  /** Modo demostración: pedidos de ejemplo en memoria (20261112130000). */
  demo?: { pedidos: PedidoCliente[]; cancelar: (id: string) => void } | undefined;
}) {
  const consulta = usePedidosCliente(!demo);
  const pedidos = demo ? { isLoading: false, data: demo.pedidos } : consulta;
  const cancelar = useCancelarPedidoCliente();
  /** A lo sumo una tarjeta del revés: abrir una cierra la otra (P5). */
  const [girada, setGirada] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (pedidos.isLoading) {
    return (
      <Stack p="md" gap="sm">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} h={90} radius={18} />
        ))}
      </Stack>
    );
  }

  if (!pedidos.data?.length) {
    return (
      <Center py={70} px="md">
        <Stack align="center" gap="md" ta="center">
          <Text size="lg" fw={700}>
            Todavía no hiciste pedidos
          </Text>
          <Text c="dimmed">
            Armá el primero: buscá, sumá cantidades y deslizá para enviar.
          </Text>
          <Button
            size="lg"
            radius="xl"
            color="grape"
            leftSection={<IconPlus />}
            onClick={onNuevo}
          >
            Armar mi pedido
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <>
      <Stack gap={10} p="md" pb={96}>
        {pedidos.data.map((p) => {
          const e = estadoParaCliente(p);
          const unidades = p.renglones.reduce((a, r) => a + r.cantidad, 0);
          const nCajas = p.cajas.reduce((a, c) => a + c.cajas, 0);
          const cabecera = (
            <>
              <Text fw={800}>{p.numero}</Text>
              <Text size="xs" c="dimmed">
                {fechaHora(p.enviado_en)} · {p.renglones.length} productos ·{' '}
                {numero(unidades, 0)} u{nCajas > 0 ? ` · ${numero(nCajas, 0)} cajas` : ''}
              </Text>
              <Group gap={6} mt={8}>
                <Badge color={e.color} variant="light" size="lg" radius="sm">
                  {e.texto}
                </Badge>
                {p.fecha_entrega && !p.cancelado ? (
                  <Badge color="gray" variant="outline" size="lg" radius="sm">
                    Entrega {fecha(p.fecha_entrega)}
                  </Badge>
                ) : null}
              </Group>
            </>
          );
          return (
            <FlipCard
              key={p.id}
              className="cli-flip"
              flipped={girada === p.id}
              flipOnClick={false}
              draggable={false}
              tilt={false}
              glare={false}
              shadow={false}
              width="100%"
              radius={18}
              background="var(--mantine-color-body)"
              color="var(--mantine-color-text)"
              front={
                <Box p="md">
                  {cabecera}
                  {e.paso >= 0 ? <Recorrido paso={e.paso} color={e.color} /> : null}
                  <Box mt="sm">
                    <Detalle p={p} />
                  </Box>
                  <div className="cli-acciones">
                    <Button
                      variant="light"
                      color="grape"
                      radius="xl"
                      size="md"
                      leftSection={
                        p.editable ? <IconPencil size={18} /> : <IconEye size={18} />
                      }
                      onClick={() => setGirada(p.id)}
                    >
                      {p.editable ? 'Editar' : 'Ver detalle'}
                    </Button>
                    <Button
                      variant="default"
                      radius="xl"
                      size="md"
                      leftSection={<IconRepeat size={18} />}
                      onClick={() => onRepetir(p)}
                    >
                      Repetir
                    </Button>
                    {p.editable ? (
                      confirmando === p.id ? (
                        <Button
                          color="red"
                          radius="xl"
                          size="md"
                          loading={cancelar.isPending}
                          onClick={() =>
                            demo
                              ? (demo.cancelar(p.id), setConfirmando(null))
                              : cancelar.mutate(p.id, {
                                  onSettled: () => setConfirmando(null),
                                })
                          }
                        >
                          <TextoDual corto="¿Cancelar?" largo="¿Seguro? Cancelar" />
                        </Button>
                      ) : (
                        <Button
                          variant="subtle"
                          color="red"
                          radius="xl"
                          size="md"
                          leftSection={<IconX size={18} />}
                          onClick={() => setConfirmando(p.id)}
                        >
                          Cancelar
                        </Button>
                      )
                    ) : null}
                  </div>
                </Box>
              }
              back={
                <Box p="md">
                  {cabecera}
                  <Box mt="sm">
                    <Detalle p={p} />
                  </Box>
                  {/* Editar reusa el armado (con «Deslizá para guardar» y las reglas de P3):
                      acá no se duplica ninguna lógica de envío. */}
                  <Text size="sm" c="dimmed" mt="sm">
                    {p.editable
                      ? 'Las cantidades y las cajas se cambian en el armado del pedido.'
                      : 'Este pedido ya no se puede modificar.'}
                  </Text>
                  <div className="cli-acciones">
                    {p.editable ? (
                      <Button
                        color="grape"
                        radius="xl"
                        size="md"
                        leftSection={<IconPencil size={18} />}
                        onClick={() => onEditar(p)}
                      >
                        Editar en el armado
                      </Button>
                    ) : null}
                    <Button
                      variant="default"
                      radius="xl"
                      size="md"
                      leftSection={<IconArrowBackUp size={18} />}
                      onClick={() => setGirada(null)}
                    >
                      Volver
                    </Button>
                  </div>
                </Box>
              }
            />
          );
        })}
      </Stack>
      {/* La página es la que scrollea (no hay scroller propio): el blur va fijo al borde de la
          pantalla, por debajo de la barra y los cajones (z-index 30 o más). */}
      <GradualBlur
        target="page"
        position="bottom"
        strength={0.6}
        layers={5}
        height="3rem"
        exponential
        autoHide
        tint="color-mix(in srgb, var(--mantine-color-body) 50%, transparent)"
        zIndex={10}
      />
    </>
  );
}
