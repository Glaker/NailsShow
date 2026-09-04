import { useState } from 'react';
import {
  Alert,
  Badge,
  Code,
  Collapse,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconHistory, IconShieldExclamation } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useAuditoria } from '@/lib/consultas';
import { fechaHora } from '@/lib/formato';

const COLOR_OPERACION: Record<string, string> = {
  INSERT: 'estadoAprobado',
  UPDATE: 'violeta',
  DELETE_INTENTO: 'estadoRechazado',
  FIRMA: 'rosa',
  LOGIN: 'gray',
};

/**
 * Rol de base con el que corre la aplicación. Todo lo que el sistema escribe en
 * su operación normal viene de una sesión de usuario, y una sesión de usuario
 * corre como este rol.
 */
const ROL_DE_LA_APLICACION = 'authenticated';

/**
 * Escritura privilegiada: la que no vino de una sesión de usuario.
 *
 * Se define por exclusión y no enumerando nombres de roles con privilegio. Es
 * la forma correcta de plantear la pregunta —«¿esto lo escribió alguien?»— y
 * además no deja de detectar un rol nuevo que se cree mañana.
 */
function esPrivilegiada(dbRole: string): boolean {
  return dbRole !== ROL_DE_LA_APLICACION;
}

function FilaAuditoria({
  fila,
}: {
  fila: {
    id: number;
    esquema: string;
    tabla: string;
    operacion: string;
    ocurrido_en: string;
    db_role: string;
    datos_antes: unknown;
    datos_despues: unknown;
    usuario?: { nombre_completo: string; rol: string } | null;
  };
}) {
  const [abierto, setAbierto] = useState(false);
  const privilegiado = esPrivilegiada(fila.db_role);

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Text size="sm">{fechaHora(fila.ocurrido_en)}</Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm" ff="monospace">
            {fila.esquema}.{fila.tabla}
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge
            variant="light"
            radius="sm"
            color={COLOR_OPERACION[fila.operacion] ?? 'gray'}
          >
            {fila.operacion.toLowerCase().replace('_', ' ')}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Text size="sm">{fila.usuario?.nombre_completo ?? '—'}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            <Text size="xs" ff="monospace" c={privilegiado ? 'red' : 'dimmed'}>
              {fila.db_role}
            </Text>
            {privilegiado ? (
              <IconShieldExclamation size={15} color="var(--mantine-color-red-6)" />
            ) : null}
          </Group>
        </Table.Td>
        <Table.Td>
          <UnstyledButton onClick={() => setAbierto((v) => !v)} aria-label="Ver valores">
            <Group gap={4}>
              <Text size="xs" c="violeta.7" fw={600}>
                {abierto ? 'Ocultar' : 'Ver valores'}
              </Text>
              <IconChevronDown
                size={14}
                style={{
                  transform: abierto ? 'rotate(180deg)' : undefined,
                  transition: 'transform var(--transicion)',
                }}
              />
            </Group>
          </UnstyledButton>
        </Table.Td>
      </Table.Tr>
      <Table.Tr>
        <Table.Td colSpan={6} p={0} style={{ border: 0 }}>
          <Collapse in={abierto}>
            <ScrollArea.Autosize mah={260} px="md" py="sm">
              <Group align="flex-start" gap="lg" wrap="wrap">
                <div style={{ flex: 1, minWidth: 260 }}>
                  <Text size="xs" c="dimmed" fw={600} mb={4}>
                    ANTES
                  </Text>
                  <Code block>
                    {fila.datos_antes ? JSON.stringify(fila.datos_antes, null, 2) : '—'}
                  </Code>
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <Text size="xs" c="dimmed" fw={600} mb={4}>
                    DESPUÉS
                  </Text>
                  <Code block>
                    {fila.datos_despues
                      ? JSON.stringify(fila.datos_despues, null, 2)
                      : '—'}
                  </Code>
                </div>
              </Group>
            </ScrollArea.Autosize>
          </Collapse>
        </Table.Td>
      </Table.Tr>
    </>
  );
}

/**
 * Auditoría.
 *
 * Es la pantalla que un inspector va a pedir. Muestra las últimas doscientas
 * escrituras con autor, momento, valores anterior y posterior, y el rol de base
 * que las produjo. Esa última columna es la capa de detección de CLAUDE.md §5:
 * una escritura hecha por un rol con privilegio es una anomalía por definición
 * del proyecto, y acá se ve marcada en rojo.
 */
export function PaginaAuditoria() {
  const auditoria = useAuditoria(200);
  const filas = auditoria.data ?? [];
  const anomalias = filas.filter((f) => esPrivilegiada(f.db_role)).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Registro append-only de toda escritura (RN-50). No se modifica ni se borra, por nadie."
      />

      {anomalias > 0 ? (
        <Alert
          color="red"
          variant="light"
          radius="md"
          mb="md"
          icon={<IconShieldExclamation size={20} />}
          title="Escrituras con rol privilegiado"
        >
          Hay {anomalias} escritura{anomalias === 1 ? '' : 's'} hecha
          {anomalias === 1 ? '' : 's'} por un rol de base con privilegio, sin usuario de
          negocio detrás. Cada una hay que justificarla: el sistema no las produce durante
          su operación normal.
        </Alert>
      ) : null}

      <Paper
        withBorder
        style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
      >
        {auditoria.isLoading ? (
          <Skeleton h={280} />
        ) : filas.length === 0 ? (
          <Vacio
            icono={IconHistory}
            titulo="Sin movimientos registrados"
            descripcion="En cuanto se cargue el primer registro, su asiento aparece acá."
          />
        ) : (
          <Table.ScrollContainer minWidth={860}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Momento</Table.Th>
                  <Table.Th>Tabla</Table.Th>
                  <Table.Th>Operación</Table.Th>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Rol de base</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((f) => (
                  <FilaAuditoria
                    key={f.id}
                    fila={f as unknown as Parameters<typeof FilaAuditoria>[0]['fila']}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </>
  );
}
