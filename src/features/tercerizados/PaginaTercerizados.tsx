import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconBuildingFactory2, IconPlus } from '@tabler/icons-react';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { useProductos } from '@/lib/consultas';
import { usePedidos } from '@/lib/consultasComercial';
import {
  ROLES_ALTA_TERCERO,
  colorTercero,
  useStockTercero,
  useTerceros,
  type Tercero,
} from '@/lib/consultasTercerizados';
import { EntornoTercerizados } from './EntornoTercerizados';
import { FormularioTercero } from './FormularioTercero';

/**
 * Clientes tercerizados en cuadritos. Cada uno dice, sin abrirlo, cuántos
 * pedidos tiene en curso, cuántos insumos tiene en stock y cuántos productos.
 */
export function PaginaTercerizados() {
  const terceros = useTerceros();
  const pedidos = usePedidos();
  const stock = useStockTercero();
  const productos = useProductos();
  const puedeAlta = useTieneRol(...ROLES_ALTA_TERCERO);
  const [alta, setAlta] = useState(false);
  const navigate = useNavigate();

  const lista = [...(terceros.data ?? [])].sort(
    (a, b) =>
      Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'),
  );

  const resumen = (t: Tercero) => {
    const suyos = (pedidos.data ?? []).filter((p) => p.tercero_id === t.id);
    return {
      enCurso: suyos.filter(
        (p) => p.estado === 'CONFIRMADO' || p.estado === 'EN_PRODUCCION',
      ).length,
      enProduccion: suyos.filter((p) => p.estado === 'EN_PRODUCCION').length,
      insumos: (stock.data ?? []).filter(
        (s) => s.tercero_id === t.id && Number(s.saldo_total) > 0,
      ).length,
      enCuarentena: (stock.data ?? []).filter(
        (s) => s.tercero_id === t.id && Number(s.saldo_no_disponible) > 0,
      ).length,
      productos: (productos.data ?? []).filter((p) => p.tercero_id === t.id && p.activo)
        .length,
    };
  };

  return (
    <EntornoTercerizados
      titulo="Clientes tercerizados"
      descripcion="Lo que Nail Show fabrica para otros: su stock, sus productos y sus pedidos, aparte del de Nail Show."
      acciones={
        puedeAlta ? (
          <Button
            size="md"
            color="indigo"
            leftSection={<IconPlus size={18} />}
            onClick={() => setAlta(true)}
          >
            Nuevo cliente
          </Button>
        ) : undefined
      }
    >
      {terceros.isLoading ? (
        <Skeleton h={200} />
      ) : lista.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconBuildingFactory2}
            titulo="Todavía no hay clientes tercerizados"
            descripcion="Se dan de alta acá o al cargar un pedido tercerizado."
            accion={
              puedeAlta ? (
                <Button onClick={() => setAlta(true)}>Nuevo cliente</Button>
              ) : undefined
            }
          />
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="md">
          {lista.map((t) => {
            const r = resumen(t);
            const color = colorTercero(t);
            return (
              <UnstyledButton
                key={t.id}
                onClick={() => void navigate(`/tercerizados/${t.id}`)}
                aria-label={`Abrir ${t.nombre}`}
              >
                <Paper
                  withBorder
                  radius="lg"
                  className="cuadrito-tercero"
                  style={{
                    borderColor: 'var(--superficie-borde)',
                    overflow: 'hidden',
                    opacity: t.activo ? 1 : 0.55,
                  }}
                >
                  <Box h={10} bg={`${color}.6`} />
                  <Stack gap="sm" p="md">
                    <Group justify="space-between" wrap="nowrap">
                      <Text fz={22} fw={800} truncate>
                        {t.nombre}
                      </Text>
                      {!t.activo ? (
                        <Badge variant="outline" color="gray" radius="sm">
                          Inactivo
                        </Badge>
                      ) : null}
                    </Group>
                    <SimpleGrid cols={3} spacing="xs">
                      <Numero
                        valor={r.enCurso}
                        etiqueta="pedidos en curso"
                        color={color}
                      />
                      <Numero
                        valor={r.insumos}
                        etiqueta="insumos en stock"
                        color={color}
                      />
                      <Numero valor={r.productos} etiqueta="productos" color={color} />
                    </SimpleGrid>
                    <Group gap={6}>
                      {r.enProduccion > 0 ? (
                        <Badge color={color} variant="light" radius="sm">
                          {r.enProduccion} en producción
                        </Badge>
                      ) : null}
                      {r.enCuarentena > 0 ? (
                        <Badge color="estadoCuarentena" variant="light" radius="sm">
                          {r.enCuarentena} por aprobar
                        </Badge>
                      ) : null}
                    </Group>
                  </Stack>
                </Paper>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      )}

      <Modal
        opened={alta}
        onClose={() => setAlta(false)}
        title="Nuevo cliente tercerizado"
        centered
        radius="md"
      >
        {alta ? (
          <FormularioTercero
            tercero={null}
            onListo={(t) => {
              setAlta(false);
              void navigate(`/tercerizados/${t.id}`);
            }}
          />
        ) : null}
      </Modal>
    </EntornoTercerizados>
  );
}

function Numero({
  valor,
  etiqueta,
  color,
}: {
  valor: number;
  etiqueta: string;
  color: string;
}) {
  return (
    <Stack gap={0} align="flex-start">
      <Text fz={26} fw={800} lh={1} c={valor > 0 ? `${color}.8` : 'dimmed'}>
        {valor}
      </Text>
      <Text size="xs" c="dimmed" lh={1.2}>
        {etiqueta}
      </Text>
    </Stack>
  );
}
