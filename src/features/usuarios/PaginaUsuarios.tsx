import { useMemo, useState } from 'react';
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
import { useClientes } from '@/lib/consultasFacturacion';
import { useVincularCliente, useVinculosClientes } from '@/lib/consultasClientesUsuarios';
import { etiquetaEnum, fecha, fechaISO } from '@/lib/formato';
import { useSesion, type Rol, type Sector } from '@/features/auth/sesion';

/* CLIENTE (migración 20261110160000) todavía no está en database.types.ts: al
   regenerar los tipos con `npm run db:types` se puede quitar este tipo y usar Rol. */
type RolAsignable = Rol | 'CLIENTE';

const ROLES: RolAsignable[] = [
  // Reemplaza a OPERARIO (D-tareas-1).
  'PRODUCCION',
  'CONTROL_CALIDAD',
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
  'ADMINISTRADOR_SISTEMA',
  'ENCARGADA_STOCK',
  'VENTAS',
  'RECEPCION',
  // Portal de clientes (D-portal-clientes-1): va vinculada a un cliente.
  'CLIENTE',
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

const etiquetaRol = (r: string) =>
  r === 'CLIENTE' ? 'Cliente (portal de pedidos)' : etiquetaEnum(r);

function ModalUsuario({
  usuario,
  onCerrar,
}: {
  usuario: Usuario | null;
  onCerrar: () => void;
}) {
  const actualizar = useActualizarUsuario();
  const vincular = useVincularCliente();
  const vinculos = useVinculosClientes();
  const clientes = useClientes();
  const { claims } = useSesion();
  const [rol, setRol] = useState<RolAsignable>(usuario?.rol ?? 'PRODUCCION');
  const [adicionales, setAdicionales] = useState<string[]>(
    usuario?.roles_adicionales ?? [],
  );
  const [sector, setSector] = useState<Sector>(usuario?.sector ?? 'DEPOSITO');
  const [activo, setActivo] = useState<boolean>(usuario?.activo ?? true);
  /* Sin tocar (undefined) se muestra el vínculo actual, que puede llegar después
     de abrir el modal. */
  const [clienteElegido, setClienteElegido] = useState<string | null | undefined>(
    undefined,
  );

  if (!usuario) return null;

  const esUnoMismo = usuario.id === claims?.usuario_id;
  const esCliente = rol === 'CLIENTE';
  const clienteActual = vinculos.data?.get(usuario.id) ?? null;
  const cliente = clienteElegido === undefined ? clienteActual : clienteElegido;
  const sinCliente = esCliente && !cliente;

  const guardar = async () => {
    try {
      await actualizar.mutateAsync({
        id: usuario.id,
        cambios: {
          /* Ver RolAsignable: el CHECK de la base acepta CLIENTE aunque los tipos
             generados todavía no. */
          rol: rol as Rol,
          /* Un cliente no tiene roles adicionales: el JWT lo emite sin rol. */
          roles_adicionales: (esCliente
            ? []
            : adicionales.filter((r) => r !== rol)) as Rol[],
          sector,
          activo,
          /* El CHECK `usuarios_baja_consistente` exige que la baja lógica lleve
             fecha: activo y fecha_baja se mueven juntos. */
          fecha_baja: activo ? null : (fechaISO(new Date()) ?? null),
        },
      });
      /* El rol va primero: la base exige que la cuenta sea CLIENTE para vincularla. */
      if (esCliente && cliente)
        await vincular.mutateAsync({ usuarioId: usuario.id, clienteId: cliente });
      onCerrar();
    } catch {
      // avisarError ya mostró el motivo; el modal queda abierto para corregir.
    }
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
          data={ROLES.map((r) => ({ value: r, label: etiquetaRol(r) }))}
          value={rol}
          onChange={(v) => setRol((v as RolAsignable) ?? 'PRODUCCION')}
          allowDeselect={false}
        />

        {esCliente ? (
          <Select
            label="¿Qué cliente es?"
            description="La cuenta ve la lista mayorista y solo los pedidos de este cliente."
            placeholder="Buscá el cliente"
            searchable
            nothingFoundMessage="Ningún cliente con ese nombre"
            data={(clientes.data ?? [])
              .filter((c) => c.activo || c.id === clienteActual)
              .map((c) => ({ value: c.id, label: c.razon_social }))}
            value={cliente}
            onChange={(v) => setClienteElegido(v)}
          />
        ) : (
          <MultiSelect
            label="Roles adicionales"
            description="En esta planta una persona ocupa más de un puesto (§4.1). Los permisos son la unión de todos."
            data={ROLES.filter((r) => r !== rol && r !== 'CLIENTE').map((r) => ({
              value: r,
              label: etiquetaRol(r),
            }))}
            value={adicionales.filter((r) => r !== rol)}
            onChange={setAdicionales}
            clearable
          />
        )}

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
          color="azul"
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

        {sinCliente ? (
          <Text size="sm" c="orange.8" fw={600}>
            Una cuenta Cliente tiene que estar vinculada a su cliente para guardarla.
            Elegilo arriba.
          </Text>
        ) : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            loading={actualizar.isPending || vincular.isPending}
            disabled={sinCliente}
            onClick={() => void guardar()}
          >
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Cliente vinculado a una cuenta del portal; en naranja si todavía no tiene. */
function ClienteVinculado({
  clienteId,
  nombrePorId,
}: {
  clienteId: string | null;
  nombrePorId: Map<string, string>;
}) {
  if (!clienteId)
    return (
      <Text size="xs" c="orange.8">
        Sin cliente vinculado
      </Text>
    );
  return (
    <Text size="xs" c="dimmed">
      → {nombrePorId.get(clienteId) ?? 'Cliente sin nombre'}
    </Text>
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
  const vinculos = useVinculosClientes();
  const clientes = useClientes();
  const [editando, setEditando] = useState<Usuario | null>(null);
  const nombrePorId = useMemo(
    () =>
      new Map<string, string>((clientes.data ?? []).map((c) => [c.id, c.razon_social])),
    [clientes.data],
  );

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
                          <Badge size="xs" variant="light" color="indigo" radius="sm">
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
                        <Text size="sm">{etiquetaRol(u.rol)}</Text>
                        {(u.rol as RolAsignable) === 'CLIENTE' ? (
                          <ClienteVinculado
                            clienteId={vinculos.data?.get(u.id) ?? null}
                            nombrePorId={nombrePorId}
                          />
                        ) : null}
                        {u.roles_adicionales.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            + {u.roles_adicionales.map(etiquetaRol).join(', ')}
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
