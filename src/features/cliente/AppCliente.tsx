import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconFlask,
  IconHelpCircle,
  IconListDetails,
  IconLogout,
  IconShoppingBag,
} from '@tabler/icons-react';
import RubberSegment from '@/vendor/reactbits/RubberSegment';
import { Marca } from '@/components/Marca';
import { useSesion } from '@/features/auth/sesion';
import {
  useListaCliente,
  usePerfilCliente,
  type EnvioPedido,
  type PedidoCliente,
} from '@/lib/consultasCliente';
import { aplicarEnvioDemo, pedidosDeEjemplo } from './demo';
import { ArmarPedido, type Carrito } from './ArmarPedido';
import { MisPedidos } from './MisPedidos';
import { Tutorial, tutorialVisto } from './Tutorial';
import './cliente.css';

/**
 * Portal de clientes (D-portal-clientes-1): el cliente mayorista arma su
 * pedido desde el celular, ve el descuento que va logrando y lo envía. Ventas
 * lo aprueba o pide fecha a Producción. Mientras Ventas no lo tomó, el
 * cliente lo corrige o lo cancela.
 *
 * El carrito vive en memoria: es lo que el cliente está armando, no un dato
 * de negocio hasta que lo envía (CLAUDE.md: nada de localStorage para eso).
 */
export function AppCliente() {
  const { salir, claims } = useSesion();
  /* Cuenta de demostración (20261112130000): lista real, pedidos de ejemplo
     en memoria; no escribe nada ni le llega a Ventas. */
  const demo = claims?.es_demo === true;
  const consultaPerfil = usePerfilCliente(!demo);
  const perfil = demo
    ? {
        isLoading: false,
        isError: false,
        refetch: consultaPerfil.refetch,
        data: { cliente: 'Comercio de prueba', nombre: claims?.nombre ?? null },
      }
    : consultaPerfil;
  const lista = useListaCliente();
  const [pedidosDemo, setPedidosDemo] = useState<PedidoCliente[] | null>(null);
  const ejemplos = pedidosDemo ?? pedidosDeEjemplo(lista.data ?? []);
  const enviarDemo = async (e: EnvioPedido) => {
    await new Promise((r) => setTimeout(r, 600));
    setPedidosDemo(aplicarEnvioDemo(ejemplos, e, lista.data ?? []));
  };
  const [vista, setVista] = useState<'armar' | 'pedidos'>('armar');
  const [carrito, setCarrito] = useState<Carrito>(new Map());
  const [observaciones, setObservaciones] = useState('');
  /** Pedido enviado que se está corrigiendo, o null si es uno nuevo. */
  const [editando, setEditando] = useState<{ id: string; numero: string } | null>(null);
  const [tutorial, setTutorial] = useState(() => !tutorialVisto());

  if (perfil.isLoading) {
    return (
      <Center h="100dvh">
        <Loader color="grape" />
      </Center>
    );
  }
  if (perfil.isError) {
    return (
      <Center h="100dvh" p="lg" className="cli-fondo">
        <Stack align="center" gap="md" maw={360} ta="center">
          <Marca size={72} />
          <Title order={2}>¡Ya casi!</Title>
          <Text>
            Tu cuenta todavía no está vinculada a tu comercio. Avisanos y en un rato la
            habilitamos.
          </Text>
          <Button variant="default" size="lg" onClick={() => void perfil.refetch()}>
            Ya me avisaron, probar de nuevo
          </Button>
          <Button variant="subtle" color="gray" onClick={() => void salir()}>
            Salir
          </Button>
        </Stack>
      </Center>
    );
  }

  const cargarPedido = (p: PedidoCliente, comoNuevo: boolean) => {
    setCarrito(new Map(p.renglones.map((r) => [r.producto_id, r.cantidad])));
    setObservaciones(comoNuevo ? '' : (p.observaciones ?? ''));
    setEditando(comoNuevo ? null : { id: p.id, numero: p.numero });
    setVista('armar');
  };

  const vaciar = () => {
    setCarrito(new Map());
    setObservaciones('');
    setEditando(null);
  };

  return (
    <Box className="cli-fondo">
      <Group
        className="cli-cabecera"
        h={64}
        px="md"
        justify="space-between"
        wrap="nowrap"
      >
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Marca size={40} />
          <div style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed" lh={1.1}>
              Hola{perfil.data?.nombre ? `, ${perfil.data.nombre.split(' ')[0]}` : ''}
            </Text>
            <Text fw={800} lh={1.2} truncate>
              {perfil.data?.cliente}
            </Text>
          </div>
        </Group>
        <Menu position="bottom-end" shadow="md" width={220}>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size={44} aria-label="Más opciones">
              <IconDotsVertical size={24} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconHelpCircle size={18} />}
              onClick={() => setTutorial(true)}
            >
              Ver cómo se usa
            </Menu.Item>
            <Menu.Item
              leftSection={<IconLogout size={18} />}
              color="red"
              onClick={() => void salir()}
            >
              Salir
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {demo ? (
        <Alert
          mx="md"
          mt="sm"
          radius="lg"
          color="orange"
          variant="light"
          icon={<IconFlask size={20} />}
          title="Modo demostración"
        >
          Precios reales, pedidos de ejemplo. Lo que envíes acá no se guarda ni le llega a
          Ventas.
        </Alert>
      ) : null}

      <Box px="md" pt="sm">
        <RubberSegment
          aria-label="Sección"
          size="lg"
          equalSlots
          value={vista}
          onChange={(v) => setVista(v as 'armar' | 'pedidos')}
          thumbColor="#be4bdb"
          activeTextColor="#ffffff"
          items={[
            {
              value: 'armar',
              label: editando ? `Editando ${editando.numero}` : 'Armar pedido',
              icon: <IconShoppingBag size={18} />,
            },
            {
              value: 'pedidos',
              label: 'Mis pedidos',
              icon: <IconListDetails size={18} />,
            },
          ]}
        />
      </Box>

      {vista === 'armar' ? (
        <ArmarPedido
          carrito={carrito}
          setCarrito={setCarrito}
          observaciones={observaciones}
          setObservaciones={setObservaciones}
          editando={editando}
          onVaciar={vaciar}
          enviarDemo={demo ? enviarDemo : undefined}
          onEnviado={() => {
            vaciar();
            setVista('pedidos');
          }}
        />
      ) : (
        <MisPedidos
          onEditar={(p) => cargarPedido(p, false)}
          onRepetir={(p) => cargarPedido(p, true)}
          onNuevo={() => setVista('armar')}
          demo={
            demo
              ? {
                  pedidos: ejemplos,
                  cancelar: (id) =>
                    setPedidosDemo(
                      ejemplos.map((p) =>
                        p.id === id
                          ? {
                              ...p,
                              estado: 'CANCELADO',
                              estado_cliente: 'CANCELADO',
                              cancelado: true,
                              editable: false,
                            }
                          : p,
                      ),
                    ),
                }
              : undefined
          }
        />
      )}

      <Tutorial abierto={tutorial} onCerrar={() => setTutorial(false)} />
    </Box>
  );
}
