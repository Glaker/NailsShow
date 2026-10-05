import {
  Alert,
  Badge,
  Checkbox,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { useTieneRol, type Rol } from '@/features/auth/sesion';
import { etiquetaEnum } from '@/lib/formato';
import { useFijarVisibilidad, useVisibilidad } from '@/lib/consultasVisibilidad';
import {
  NAVEGACION,
  PESTANIAS,
  ROLES_CONFIGURABLES,
  veRol,
  visiblePorDefecto,
} from '@/app/navegacion';

/** Quién lo usa hoy, para que la matriz se lea con nombres. */
const QUIEN: Partial<Record<Rol, string>> = {
  GERENCIA_PRODUCCION: 'Nazarena',
  VENTAS: 'Mati',
  ENCARGADA_STOCK: 'Silveira',
  ADMINISTRACION: 'Diego',
  DIRECCION_TECNICA: 'DT',
};

/**
 * «Quién ve qué»: cada pantalla y pestaña contra cada rol. Tildado = la ve.
 * El borde azul marca lo que se cambió respecto del valor del código. El
 * Administrador del sistema ve todo.
 *
 * Es visibilidad del menú, no permiso: una pantalla que se le muestra a un rol
 * que la base no autoriza aparece vacía o da error (CLAUDE.md §6).
 */
export function PaginaVisibilidad() {
  const excepciones = useVisibilidad();
  const fijar = useFijarVisibilidad();
  const esAdmin = useTieneRol('ADMINISTRADOR_SISTEMA');
  const filas = [
    ...NAVEGACION.map((n) => ({
      ruta: n.ruta,
      etiqueta: n.etiqueta,
      roles: n.roles,
      pestania: false,
    })),
    ...PESTANIAS.map((p) => ({
      ruta: p.ruta,
      etiqueta: p.etiqueta,
      roles: p.roles,
      pestania: true,
    })),
  ];
  const lista = excepciones.data ?? [];

  return (
    <>
      <EncabezadoPagina
        titulo="Quién ve qué"
        descripcion="Cada pantalla contra cada rol. Tildá o destildá para mostrarla u ocultarla en el menú de ese rol."
      />
      <Stack gap="md">
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
          Esto decide qué aparece en el menú. Lo que cada rol puede leer o cargar lo sigue
          decidiendo la base: si le mostrás una pantalla a un rol sin permiso, la va a ver
          vacía. El borde azul marca lo que cambiaste respecto del valor original.
        </Alert>
        {excepciones.isLoading ? (
          <Skeleton h={400} />
        ) : (
          <Paper
            withBorder
            style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
          >
            <Table.ScrollContainer minWidth={980}>
              <Table verticalSpacing={6} highlightOnHover stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pantalla</Table.Th>
                    {ROLES_CONFIGURABLES.map((r) => (
                      <Table.Th key={r} ta="center">
                        <Text size="xs" fw={700}>
                          {etiquetaEnum(r)}
                        </Text>
                        {QUIEN[r] ? (
                          <Text size="xs" c="dimmed">
                            {QUIEN[r]}
                          </Text>
                        ) : null}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr key={f.ruta}>
                      <Table.Td>
                        <Text
                          size="sm"
                          fw={f.pestania ? 400 : 600}
                          pl={f.pestania ? 'md' : 0}
                        >
                          {f.etiqueta}
                        </Text>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {f.ruta}
                        </Text>
                      </Table.Td>
                      {ROLES_CONFIGURABLES.map((r) => {
                        const visto = veRol(f.ruta, f.roles, r, lista);
                        const cambiado = visto !== visiblePorDefecto(f.roles, r);
                        return (
                          <Table.Td key={r} ta="center">
                            <Tooltip
                              label={
                                cambiado
                                  ? 'Cambiado respecto del valor original'
                                  : 'Valor original'
                              }
                              openDelay={400}
                            >
                              <Checkbox
                                size="md"
                                aria-label={`${f.etiqueta} para ${etiquetaEnum(r)}`}
                                checked={visto}
                                disabled={!esAdmin || fijar.isPending}
                                color={cambiado ? 'azul' : 'gray'}
                                styles={
                                  cambiado
                                    ? {
                                        input: {
                                          borderColor: 'var(--mantine-color-azul-6)',
                                          borderWidth: 2,
                                        },
                                      }
                                    : {}
                                }
                                onChange={(e) =>
                                  fijar.mutate({
                                    pantalla: f.ruta,
                                    rol: r,
                                    visible: e.currentTarget.checked,
                                  })
                                }
                                style={{ display: 'inline-block' }}
                              />
                            </Tooltip>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
        <Text size="xs" c="dimmed">
          Administrador del sistema: <Badge size="xs">ve todo</Badge> y lee todos los
          datos, pero no carga ni firma como otros roles (§3.5 del alcance).
        </Text>
      </Stack>
    </>
  );
}
