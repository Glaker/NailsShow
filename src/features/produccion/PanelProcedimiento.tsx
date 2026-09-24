import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Text,
  Textarea,
  Timeline,
} from '@mantine/core';
import { IconHistory, IconListNumbers, IconPencil } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { useGuardarProcedimiento, useProcedimientos } from '@/lib/consultas';
import { useNomina } from '@/lib/consultasComercial';
import { fechaHora } from '@/lib/formato';

/**
 * Procedimiento de elaboración de la fórmula (PG.60.8), el que figura en el
 * POE del producto.
 *
 * Se muestra la versión vigente. Editar no pisa: guarda una versión nueva con
 * su motivo, y las anteriores quedan a la vista en el historial, porque un
 * lote se fabricó con el procedimiento que regía ese día.
 *
 * Editan Dirección Técnica y Gerencia de Producción; lo mismo verifica la
 * política de la base.
 */
export function PanelProcedimiento({
  formulaId,
  soloLectura = false,
}: {
  formulaId: string;
  soloLectura?: boolean;
}) {
  const versiones = useProcedimientos(formulaId);
  const nomina = useNomina();
  const puedeEditar = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION') && !soloLectura;
  const [editando, setEditando] = useState(false);
  const [historial, setHistorial] = useState(false);

  if (versiones.isLoading) return <Skeleton h={120} />;
  const lista = versiones.data ?? [];
  const vigente = lista[0];
  const autor = (id: string) => nomina.data?.get(id) ?? '';

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="xs">
            <IconListNumbers size={20} />
            <Text fw={600}>Procedimiento</Text>
            {vigente ? (
              <Badge variant="light" color="violeta" radius="sm">
                Versión {vigente.version}
              </Badge>
            ) : null}
          </Group>
          <Group gap="xs">
            {lista.length > 1 ? (
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconHistory size={16} />}
                onClick={() => setHistorial(true)}
              >
                Versiones anteriores ({lista.length - 1})
              </Button>
            ) : null}
            {puedeEditar ? (
              <Button
                variant="light"
                size="sm"
                leftSection={<IconPencil size={16} />}
                onClick={() => setEditando(true)}
              >
                {vigente ? 'Editar' : 'Cargar procedimiento'}
              </Button>
            ) : null}
          </Group>
        </Group>

        {vigente ? (
          <>
            {/* Texto tal como se escribió: los saltos de línea son los pasos. */}
            <Text size="md" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {vigente.texto}
            </Text>
            <Text size="xs" c="dimmed">
              {fechaHora(vigente.creado_en)}
              {autor(vigente.redactado_por) ? ` · ${autor(vigente.redactado_por)}` : ''}
              {vigente.motivo_cambio ? ` · ${vigente.motivo_cambio}` : ''}
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            Esta fórmula todavía no tiene procedimiento cargado.
            {puedeEditar ? ' Copialo del POE del producto.' : ''}
          </Text>
        )}
      </Stack>

      <Modal
        opened={editando}
        onClose={() => setEditando(false)}
        title={vigente ? `Editar procedimiento (será la versión ${vigente.version + 1})` : 'Cargar procedimiento'}
        size="xl"
        centered
        radius="md"
      >
        {editando ? (
          <EditorProcedimiento
            formulaId={formulaId}
            textoActual={vigente?.texto ?? ''}
            esPrimera={!vigente}
            onListo={() => setEditando(false)}
          />
        ) : null}
      </Modal>

      <Modal
        opened={historial}
        onClose={() => setHistorial(false)}
        title="Versiones del procedimiento"
        size="xl"
        centered
        radius="md"
      >
        <Timeline active={0} bulletSize={22} lineWidth={2}>
          {lista.map((v) => (
            <Timeline.Item
              key={v.id}
              title={`Versión ${v.version}${v.version === vigente?.version ? ' · vigente' : ''}`}
            >
              <Text size="xs" c="dimmed" mb={4}>
                {fechaHora(v.creado_en)}
                {autor(v.redactado_por) ? ` · ${autor(v.redactado_por)}` : ''}
                {v.motivo_cambio ? ` · ${v.motivo_cambio}` : ''}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {v.texto}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </Modal>
    </Paper>
  );
}

function EditorProcedimiento({
  formulaId,
  textoActual,
  esPrimera,
  onListo,
}: {
  formulaId: string;
  textoActual: string;
  esPrimera: boolean;
  onListo: () => void;
}) {
  const guardar = useGuardarProcedimiento();
  const [texto, setTexto] = useState(textoActual);
  const [motivo, setMotivo] = useState('');
  const cambio = texto.trim() !== textoActual.trim();
  const valido = texto.trim().length > 0 && cambio && (esPrimera || motivo.trim().length >= 3);

  return (
    <Stack gap="md">
      <Textarea
        label="Procedimiento"
        description="Un paso por línea, como en el POE. Lo anterior no se pierde: queda como versión previa."
        autosize
        minRows={10}
        maxRows={24}
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
      />
      {!esPrimera ? (
        <Textarea
          label="Qué cambió y por qué"
          withAsterisk
          autosize
          minRows={2}
          placeholder="Por ejemplo: se actualizó según POE rev. 03."
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
        />
      ) : null}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Cancelar
        </Button>
        <Button
          disabled={!valido}
          loading={guardar.isPending}
          onClick={() =>
            guardar.mutate(
              { formulaId, texto: texto.trim(), motivo: esPrimera ? null : motivo.trim() },
              { onSuccess: onListo },
            )
          }
        >
          Guardar versión
        </Button>
      </Group>
    </Stack>
  );
}
