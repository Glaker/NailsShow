import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconSearch, IconUsersGroup } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import {
  ROLES_CLIENTES,
  TEXTO_CONDICION,
  TEXTO_DOCUMENTO,
  claseFactura,
  formatearCuit,
  useClientes,
  type Cliente,
} from '@/lib/consultasFacturacion';
import { FormularioCliente } from './FormularioCliente';

/**
 * Padrón de clientes. La condición frente al IVA decide si se le emite
 * Factura A o B (RN-57), y eso se muestra en cada fila.
 */
export function PaginaClientes() {
  const clientes = useClientes();
  const puedeEditar = useTieneRol(...ROLES_CLIENTES);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Cliente | 'nuevo' | null>(null);

  const texto = busqueda.trim().toLowerCase();
  const filas = (clientes.data ?? []).filter(
    (c) =>
      !texto ||
      c.razon_social.toLowerCase().includes(texto) ||
      c.numero_documento.includes(texto.replace(/[^0-9]/g, '') || '§'),
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Con su condición frente al IVA: define si se le factura A o B."
        acciones={
          puedeEditar ? (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setEditando('nuevo')}
            >
              Nuevo cliente
            </Button>
          ) : undefined
        }
      />

      <TextInput
        mb="md"
        leftSection={<IconSearch size={16} />}
        placeholder="Buscar por nombre o documento"
        value={busqueda}
        onChange={(e) => setBusqueda(e.currentTarget.value)}
      />

      {clientes.isLoading ? (
        <Skeleton h={240} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconUsersGroup}
            titulo={texto ? 'Sin coincidencias' : 'No hay clientes cargados'}
            descripcion="Los clientes se dan de alta acá o desde el alta de un pedido."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Condición IVA</Table.Th>
                  <Table.Th>Documento</Table.Th>
                  <Table.Th>Factura</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((c) => (
                  <Table.Tr
                    key={c.id}
                    style={{
                      cursor: puedeEditar ? 'pointer' : undefined,
                      opacity: c.activo ? 1 : 0.55,
                    }}
                    onClick={() => puedeEditar && setEditando(c)}
                  >
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {c.razon_social}
                      </Text>
                      {c.domicilio || c.email ? (
                        <Text size="xs" c="dimmed">
                          {[c.domicilio, c.email].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{TEXTO_CONDICION[c.condicion_iva]}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {c.tipo_documento === 'SIN_IDENTIFICAR'
                          ? 'Sin identificar'
                          : `${TEXTO_DOCUMENTO[c.tipo_documento]} ${
                              c.tipo_documento === 'CUIT' || c.tipo_documento === 'CUIL'
                                ? formatearCuit(c.numero_documento)
                                : c.numero_documento
                            }`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <Badge variant="light" color="violeta" radius="sm">
                          {claseFactura(c.condicion_iva)}
                        </Badge>
                        {!c.activo ? (
                          <Badge variant="outline" color="gray" radius="sm">
                            Inactivo
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}
        centered
        radius="md"
      >
        {editando !== null ? (
          <FormularioCliente
            key={editando === 'nuevo' ? 'nuevo' : editando.id}
            cliente={editando === 'nuevo' ? null : editando}
            onListo={() => setEditando(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}
