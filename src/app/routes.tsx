import { Navigate, Route, Routes } from 'react-router-dom';
import { Stack, Text, Title } from '@mantine/core';
import { EstadoConexion } from '@/components/EstadoConexion';

function Inicio() {
  return (
    <Stack gap="sm">
      <Title order={2}>Sistema de trazabilidad</Title>
      <Text>
        Andamiaje de la fase 0. Los módulos de dominio se incorporan en las fases
        siguientes según{' '}
        <Text span fw={700}>
          docs/PLAN_FASES.md
        </Text>
        .
      </Text>
      <EstadoConexion />
    </Stack>
  );
}

/**
 * Rutas de la aplicación.
 *
 * Una ruta por dominio a medida que las fases las habiliten. El acceso por rol
 * se resuelve en la fase 2: la interfaz oculta lo que el rol no puede hacer,
 * pero la autoridad sigue siendo RLS (CLAUDE.md §6).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
