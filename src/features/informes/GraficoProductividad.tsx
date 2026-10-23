import { Box, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useTrabajoOperarias } from '@/lib/consultasTareasProduccion';
import { fechaISO, numero } from '@/lib/formato';
import { colorDe } from '@/features/tareas/colores';
import { productividad } from './informes';

/**
 * Productividad por operaria, en barras (D-tareas-1): unidades por hora de lo
 * que le tocó en cada grupo. Por defecto, el mes en curso. Lo ven Naza (en su
 * tablero), Gabriel y quien entra a «Informes y estadísticas».
 */
export function GraficoProductividad({ desde, hasta }: { desde?: string; hasta?: string }) {
  const hoy = new Date();
  const d = desde ?? fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1))!;
  const h = hasta ?? fechaISO(hoy)!;
  const trabajo = useTrabajoOperarias(d, h);
  const datos = productividad(trabajo.data ?? []);
  const max = Math.max(1, ...datos.map((x) => x.porHora));

  return (
    <Paper withBorder p="lg" radius="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Title order={3} mb={4}>
        Productividad por operaria
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Unidades por hora, del {d.split('-').reverse().join('/')} al {h.split('-').reverse().join('/')}.
        Si trabajaron de a varias, a cada una le toca su parte según el tiempo que estuvo.
      </Text>
      {trabajo.isLoading ? (
        <Skeleton h={160} />
      ) : datos.length === 0 ? (
        <Text c="dimmed">Todavía no hay tareas terminadas en este período.</Text>
      ) : (
        <Stack gap="xs">
          {datos.map((p) => (
            <Box key={p.usuario_id}>
              <Group justify="space-between" mb={2}>
                <Text size="sm" fw={600}>
                  {p.operaria}
                </Text>
                <Text size="sm" ff="monospace">
                  {numero(p.porHora, 1)} u/h · {numero(p.unidades)} u en {numero(p.horas, 1)} h
                </Text>
              </Group>
              <Box
                h={18}
                style={{
                  width: `${(p.porHora / max) * 100}%`,
                  minWidth: 4,
                  background: colorDe(p.operaria),
                  borderRadius: 4,
                }}
              />
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
