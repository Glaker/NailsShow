import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconInfoCircle, IconUserCog, IconUsers } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useActualizarUsuario, useUsuarios, type Usuario } from '@/lib/consultas';
import { etiquetaEnum, fecha, fechaISO } from '@/lib/formato';
import { useSesion, type Rol, type Sector } from '@/features/auth/sesion';

const ROLES: Rol[] = [
  'OPERARIO',
  'CONTROL_CALIDAD',
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
  'ADMINISTRADOR_SISTEMA',
];

const SECTORES: Sector[] = [
  'ADMINISTRACION',
  'RECEPCION_EXPEDICION',
  'DEPOSITO',
  'PRODUCCION',
  'CONTROL_CALIDAD',
  'GARANTIA_CALIDAD',
  'MANTENIMIENTO',
  'DIRECCION_TECNICA',
  'GERENCIA',
];

function ModalUsuario({
  usuario,
  onCerrar,
}: {
  usuario: Usuario | null;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarUsuario();
  const { claims } = useSesion();
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? 'OPERARIO');
  const [adicionales, setAdicionales] = useState<string[]>(
    usuario?.roles_adicionales ?? [],
  );
  const [sector, setSector] = useState<Sector>(usuario?.sector ?? 'DEPOSITO');
  const [activo, setActivo] = useState<boolean>(usuario?.activo ?? true);

  if (!usuario) return null;

  const esUnoMismo = usuario.id === claims?.usuario_id;

  const guardar = async () => {
    await actualizar.mutateAsync({
      id: usuario.id,
      cambios: {
        rol,
        roles_adicionales: adicionales.filter((r) => r !== rol) as Rol[],
        sector,
        activo,
        /* El CHECK `usuarios_baja_consistente` exige que la baja lógica lleve
           fecha: activo y fecha_baja se mueven juntos. */
        fecha_baja: activo ? null : (fechaISO(new Date()) ?? null),
      },
    });
    onCerrar();
  };

  return (
    <Modal
      opened={Boolean(usuario)}
      onClose={onCerrar}
      title={<Text fw={700}>{usuario.nombre_completo}</Text>}
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {usuario.email}
        </Text>

        <Select
          label="Rol principal"
          data={ROLES.map((r) => ({ value: r, label: etiquetaEnum(r) }))}
          value={rol}
          onChange={(v) => setRol((v as Rol) ?? 'OPERARIO')}
          allowDeselect={false}
        />

        <MultiSelect
          label="Roles adicionales"
          description="En esta planta una persona ocupa más de un puesto (§4.1). Los permisos son la unión de todos."
          data={ROLES.filter((r) => r !== rol).map((r) => ({
            value: r,
            label: etiquetaEnum(r),
          }))}
          value={adicionales.filter((r) => r !== rol)}
          onChange={setAdicionales}
          clearable
        />

        <Select
          label="Sector"
          data={SECTORES.map((s) => ({ value: s, label: etiquetaEnum(s) }))}
          value={sector}
          onChange={(v) => setSector((v as Sector) ?? 'DEPOSITO')}
          allowDeselect={false}
        />

        <Switch
          label="Cuenta habilitada"
          description="RN-49: un usuario no se elimina, se desactiva. La ficha y su historial quedan."
          checked={activo}
          onChange={(e) => setActivo(e.currentTarget.checked)}
        />

        <Alert
          color="violeta"
          variant="light"
          radius="md"
          icon={<IconInfoCircle size={18} />}
        >
          El rol viaja en la credencial. El cambio se aplica cuando la persona renueva su
          sesión: puede hacerlo desde su menú, con «Actualizar permisos».
        </Alert>

        {esUnoMismo ? (
          <Alert color="estadoCuarentena" variant="light" radius="md">
            Estás editando tu propia cuenta. Si te quitás el rol de administrador del
            sistema, vas a perder el acceso a esta pantalla.
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            loading={actualizar.isPending}
            onClick={() => void guardar()}
            variant="gradient"
            gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
          >
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Usuarios.
 *
 * Alta, baja y cambio de rol son competencia exclusiva del administrador del
 * sistema (§3.3). La baja es lógica: RN-49 y la ausencia de política de DELETE
 * hacen que un usuario no se pueda borrar ni desde acá ni desde ningún lado.
 */
export function PaginaUsuarios() {
  const usuarios = useUsuarios();
  const [editando, setEditando] = useState<Usuario | null>(null);

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Nómina del sistema. Un usuario nunca se elimina: se desactiva y su historial queda (RN-49)."
      />

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {usuarios.isLoading ? (
          <Skeleton h={240} />
        ) : (usuarios.data ?? []).length === 0 ? (
          <Vacio icono={IconUsers} titulo="Sin usuarios" />
        ) : (
          <Table.ScrollContainer minWidth={780}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Correo</Table.Th>
                  <Table.Th>Rol</Table.Th>
                  <Table.Th>Sector</Table.Th>
                  <Table.Th>Alta</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(usuarios.data ?? []).map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Group gap={6}>
                        <Text size="sm" fw={600}>
                          {u.nombre_completo}
                        </Text>
                        {u.es_dt_titular ? (
                          <Badge size="xs" variant="light" color="rosa" radius="sm">
                            DT titular
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {u.email}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm">{etiquetaEnum(u.rol)}</Text>
                        {u.roles_adicionales.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            + {u.roles_adicionales.map(etiquetaEnum).join(', ')}
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{etiquetaEnum(u.sector)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{fecha(u.fecha_alta)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        radius="sm"
                        color={u.activo ? 'estadoAprobado' : 'gray'}
                      >
                        {u.activo ? 'Habilitado' : 'Desactivado'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconUserCog size={15} />}
                        onClick={() => setEditando(u)}
                      >
                        Editar
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <ModalUsuario
        key={editando?.id ?? 'ninguno'}
        usuario={editando}
        onCerrar={() => setEditando(null)}
      />
    </>
  );
}
