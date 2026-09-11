import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Timeline,
  Title,
} from '@mantine/core';
import { IconBan, IconLockOpen, IconShieldCheck } from '@tabler/icons-react';
import {
  TEXTO_MOTIVO_BLOQUEO,
  useBloqueosDeLote,
  useBloquearLote,
  useLevantarBloqueo,
  type MotivoBloqueo,
} from '@/lib/consultas';
import { fechaHora } from '@/lib/formato';
import { useSesion } from '@/features/auth/sesion';

/* §3.3: detener material es del orden del veredicto de calidad y del retiro de
   mercado. Levantarlo es exclusivo de Dirección Técnica, y eso lo verifica el
   trigger de la base aunque la interfaz se equivoque. */
const ROLES_BLOQUEAR = ['DIRECCION_TECNICA', 'CONTROL_CALIDAD', 'GERENCIA'];

const MOTIVOS: MotivoBloqueo[] = [
  'RETIRO_MERCADO',
  'NO_CONFORMIDAD',
  'INVESTIGACION',
  'VENCIMIENTO',
  'DECISION_DIRECCION_TECNICA',
];

/**
 * Bloqueos del lote (RN-51, RN-52).
 *
 * El bloqueo es una fila, no un cálculo: lo que se audita no es si el lote
 * está detenido hoy, sino cuándo se detuvo, quién lo decidió y con qué
 * fundamento. Por eso los bloqueos levantados siguen en la lista.
 */
export function PanelBloqueos({ loteId }: { loteId: string }) {
  const bloqueos = useBloqueosDeLote(loteId);
  const bloquear = useBloquearLote();
  const levantar = useLevantarBloqueo();
  const { claims } = useSesion();
  const roles = claims?.roles ?? [];

  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBloqueo>('INVESTIGACION');
  const [detalle, setDetalle] = useState('');
  const [levantando, setLevantando] = useState<string | null>(null);
  const [motivoLevantar, setMotivoLevantar] = useState('');

  const lista = bloqueos.data ?? [];
  const vigentes = lista.filter((b) => !b.levantado);
  const puedeBloquear = roles.some((r) => ROLES_BLOQUEAR.includes(r));
  const puedeLevantar = roles.includes('DIRECCION_TECNICA');
  const yaUsados = new Set(vigentes.map((b) => b.motivo));

  if (lista.length === 0 && !puedeBloquear) return null;

  return (
    <>
      <Paper
        withBorder
        p="lg"
        style={{
          borderColor: vigentes.length
            ? 'var(--mantine-color-estadoRechazado-3)'
            : 'var(--superficie-borde)',
        }}
        className="no-imprimir"
      >
        <Group justify="space-between" align="baseline" mb="md" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Title order={3}>Bloqueos</Title>
            {vigentes.length > 0 ? (
              <Badge color="estadoRechazado" variant="filled" radius="sm">
                {vigentes.length} vigente{vigentes.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </Group>
          {puedeBloquear ? (
            <Button
              size="compact-sm"
              variant="light"
              color="estadoRechazado"
              leftSection={<IconBan size={15} />}
              onClick={() => {
                setDetalle('');
                setAbierto(true);
              }}
            >
              Bloquear lote
            </Button>
          ) : null}
        </Group>

        {lista.length === 0 ? (
          <Group gap="xs">
            <IconShieldCheck size={17} color="var(--mantine-color-estadoAprobado-7)" />
            <Text size="sm" c="dimmed">
              Sin bloqueos. El despacho depende solo del estado de calidad del lote.
            </Text>
          </Group>
        ) : (
          <Timeline
            bulletSize={20}
            lineWidth={2}
            active={lista.length}
            color="estadoRechazado"
          >
            {lista.map((b) => (
              <Timeline.Item
                key={b.id}
                bullet={b.levantado ? <IconLockOpen size={11} /> : <IconBan size={11} />}
                color={b.levantado ? 'gray' : 'estadoRechazado'}
                title={
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      {b.motivo ? TEXTO_MOTIVO_BLOQUEO[b.motivo] : '—'}
                    </Text>
                    {b.levantado ? (
                      <Badge size="xs" color="gray" variant="light" radius="sm">
                        levantado
                      </Badge>
                    ) : null}
                  </Group>
                }
              >
                <Text size="sm">{b.detalle}</Text>
                <Text size="xs" c="dimmed" mt={2}>
                  {b.bloqueado_por_nombre} · {fechaHora(b.bloqueado_en)}
                </Text>
                {b.levantado ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    Levantado por {b.levantado_por_nombre} el {fechaHora(b.levantado_en)}:{' '}
                    {b.levantado_motivo}
                  </Text>
                ) : puedeLevantar ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    mt={6}
                    onClick={() => {
                      setMotivoLevantar('');
                      setLevantando(b.id);
                    }}
                  >
                    Levantar
                  </Button>
                ) : null}
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Paper>

      <Modal
        opened={abierto}
        onClose={() => setAbierto(false)}
        title={<Text fw={700}>Bloquear lote para despacho</Text>}
      >
        <Stack gap="md">
          <Alert color="estadoRechazado" variant="light" radius="md">
            El bloqueo surte efecto de inmediato: desde que se registra, el lote deja de
            poder despacharse. Es la regla que hace efectivo un retiro de mercado (RN-52,
            Disp. ANMAT 1402/08).
          </Alert>
          <Select
            label="Motivo"
            withAsterisk
            allowDeselect={false}
            value={motivo}
            onChange={(v) => setMotivo((v as MotivoBloqueo) ?? 'INVESTIGACION')}
            data={MOTIVOS.map((m) => ({
              value: m,
              label: TEXTO_MOTIVO_BLOQUEO[m],
              disabled: yaUsados.has(m),
            }))}
            description="Un motivo ya vigente no se puede repetir; varios motivos distintos sí conviven."
          />
          <Textarea
            label="Fundamento"
            withAsterisk
            autosize
            minRows={2}
            placeholder="Qué se detectó y por qué corresponde detener el material."
            value={detalle}
            onChange={(e) => setDetalle(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="estadoRechazado"
              loading={bloquear.isPending}
              disabled={detalle.trim().length < 10}
              onClick={() =>
                bloquear.mutate(
                  { loteId, motivo, detalle: detalle.trim() },
                  { onSuccess: () => setAbierto(false) },
                )
              }
            >
              Bloquear
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={levantando !== null}
        onClose={() => setLevantando(null)}
        title={<Text fw={700}>Levantar bloqueo</Text>}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            El bloqueo no se borra: queda registrado con su fecha de alta y de
            levantamiento. El período en que el material estuvo detenido es parte del
            legajo del lote.
          </Text>
          <Textarea
            label="Motivo del levantamiento"
            withAsterisk
            autosize
            minRows={2}
            placeholder="Qué resolvió la causa que motivó el bloqueo."
            value={motivoLevantar}
            onChange={(e) => setMotivoLevantar(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setLevantando(null)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              gradient={{ from: 'violeta.7', to: 'rosa.6', deg: 135 }}
              loading={levantar.isPending}
              disabled={motivoLevantar.trim().length < 10}
              onClick={() =>
                levantar.mutate(
                  { id: levantando!, motivo: motivoLevantar.trim() },
                  { onSuccess: () => setLevantando(null) },
                )
              }
            >
              Levantar bloqueo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
