import { useState } from 'react';
import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useSesion } from './sesion';

/**
 * Reingreso sobre la pantalla abierta (bloque 1.2).
 *
 * Cuando la sesión se pierde sin que el usuario toque «Salir», la aplicación
 * no se desmonta: lo que había escrito en un formulario sigue en memoria. Esta
 * ventana pide la contraseña de la misma cuenta y, al volver, el usuario sigue
 * donde estaba. Sin localStorage (CLAUDE.md §6).
 */
export function ModalReingreso() {
  const { vencida, ingresar, salir } = useSesion();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!vencida) return null;

  const enviar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await ingresar(vencida.email, password);
      setPassword('');
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      setError(
        /invalid login credentials/i.test(texto) ? 'Contraseña incorrecta.' : texto,
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      opened
      onClose={() => undefined}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      title="La sesión se cerró"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <Stack>
          <Text>
            Lo que estabas cargando sigue en pantalla. Ingresá de nuevo la contraseña de{' '}
            <b>{vencida.email}</b> para seguir donde estabas.
          </Text>
          {error && (
            <Alert color="red" icon={<IconAlertTriangle />}>
              {error}
            </Alert>
          )}
          <PasswordInput
            label="Contraseña"
            size="lg"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Group justify="space-between">
            <Button variant="subtle" color="gray" size="lg" onClick={() => void salir()}>
              Salir y descartar
            </Button>
            <Button type="submit" size="lg" loading={enviando} disabled={!password}>
              Volver a ingresar
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
