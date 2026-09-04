import { useState } from 'react';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { IconAlertTriangle, IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { Marca } from '@/components/Marca';
import { useSesion } from './sesion';

/*
 * Los esquemas derivan de las restricciones reales: la longitud mínima de
 * contraseña la fija `[auth] minimum_password_length` en supabase/config.toml,
 * y `nombre_completo` tiene CHECK de no vacío en core.usuarios.
 */
const esquemaIngreso = z.object({
  email: z.string().trim().min(1, 'Ingresá tu correo').email('Correo inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

const esquemaRegistro = esquemaIngreso.extend({
  nombreCompleto: z.string().trim().min(3, 'Ingresá tu nombre y apellido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type Modo = 'ingreso' | 'registro';

function mensajeDeError(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(texto)) {
    return 'Correo o contraseña incorrectos.';
  }
  if (/user already registered/i.test(texto)) {
    return 'Ya existe una cuenta con ese correo. Probá ingresando.';
  }
  if (/password/i.test(texto) && /short|length/i.test(texto)) {
    return 'La contraseña es demasiado corta.';
  }
  return texto;
}

/**
 * Pantalla de ingreso.
 *
 * El alta de cuenta está abierta durante el demo y no exige verificación de
 * correo. Antes de producción hay que cerrarla y pasar a alta por invitación:
 * en un sistema BPF, quién puede tener credencial es parte de lo que se audita.
 * Anotado en docs/DECISIONES_ABIERTAS.md.
 */
export function PantallaIngreso() {
  const { ingresar, registrar } = useSesion();
  const [modo, setModo] = useState<Modo>('ingreso');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '', nombreCompleto: '' },
    validate: zod4Resolver(modo === 'ingreso' ? esquemaIngreso : esquemaRegistro),
  });

  const enviar = form.onSubmit(async (valores) => {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      if (modo === 'ingreso') {
        await ingresar(valores.email.trim(), valores.password);
      } else {
        await registrar(
          valores.email.trim(),
          valores.password,
          valores.nombreCompleto.trim(),
        );
        setAviso('Cuenta creada. Ya podés ingresar.');
        setModo('ingreso');
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Box
      style={{
        minHeight: '100dvh',
        background:
          'radial-gradient(1100px 600px at 15% -10%, #3a2447 0%, #1a0e22 55%, #14091b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Stack gap="lg" w="100%" maw={420} className="entrada">
        <Center>
          <Group gap="sm">
            <Marca size={44} />
            <div>
              <Text c="#fff" fw={800} fz={24} lh={1.1} style={{ letterSpacing: 0.5 }}>
                NAIL SHOW
              </Text>
              <Text c="#c9b3d1" fz={10} fw={600} style={{ letterSpacing: 1.6 }}>
                SISTEMA DE TRAZABILIDAD · BPF
              </Text>
            </div>
          </Group>
        </Center>

        <Paper p="xl" radius="lg" shadow="xl">
          <Stack gap="xs" mb="lg">
            <Title order={2}>{modo === 'ingreso' ? 'Ingresar' : 'Crear cuenta'}</Title>
            <Text size="sm" c="dimmed">
              {modo === 'ingreso'
                ? 'Usá el correo con el que te dieron de alta.'
                : 'La cuenta queda pendiente de habilitación por el administrador.'}
            </Text>
          </Stack>

          <form onSubmit={enviar}>
            <Stack gap="md">
              {modo === 'registro' ? (
                <TextInput
                  label="Nombre y apellido"
                  placeholder="Como firma en los registros"
                  leftSection={<IconUser size={17} />}
                  key={form.key('nombreCompleto')}
                  {...form.getInputProps('nombreCompleto')}
                />
              ) : null}

              <TextInput
                label="Correo"
                placeholder="nombre@nailshow.com.ar"
                type="email"
                autoComplete="email"
                leftSection={<IconMail size={17} />}
                key={form.key('email')}
                {...form.getInputProps('email')}
              />

              <PasswordInput
                label="Contraseña"
                placeholder="••••••••"
                autoComplete={modo === 'ingreso' ? 'current-password' : 'new-password'}
                leftSection={<IconLock size={17} />}
                key={form.key('password')}
                {...form.getInputProps('password')}
              />

              {error ? (
                <Alert
                  color="red"
                  variant="light"
                  radius="md"
                  icon={<IconAlertTriangle size={18} />}
                >
                  {error}
                </Alert>
              ) : null}

              {aviso ? (
                <Alert color="violeta" variant="light" radius="md">
                  {aviso}
                </Alert>
              ) : null}

              <Button
                type="submit"
                loading={enviando}
                fullWidth
                variant="gradient"
                gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              >
                {modo === 'ingreso' ? 'Ingresar' : 'Crear cuenta'}
              </Button>
            </Stack>
          </form>

          <Text size="sm" c="dimmed" ta="center" mt="lg">
            {modo === 'ingreso' ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
            <Anchor
              component="button"
              type="button"
              size="sm"
              onClick={() => {
                setModo(modo === 'ingreso' ? 'registro' : 'ingreso');
                setError(null);
                setAviso(null);
              }}
            >
              {modo === 'ingreso' ? 'Crear una' : 'Ingresar'}
            </Anchor>
          </Text>
        </Paper>

        <Text size="xs" c="#8b679d" ta="center">
          Todo lo que se registre acá queda auditado con autor, momento y valor anterior.
        </Text>
      </Stack>
    </Box>
  );
}
