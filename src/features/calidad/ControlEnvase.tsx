import { useState } from 'react';
import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import { useControlEnvase } from '@/lib/consultasAnalisis';
import { Pregunta, type Respuesta } from './ControlRapidoMP';

/**
 * Control de envase, empaque o etiqueta en la recepción (D-recepcion-2): lo
 * hace quien recibe. Si se aprueba antes de cargar a stock, el lote entra
 * directo a «Envases aprobados».
 */
export function ControlEnvase({
  lote,
  onListo,
}: {
  lote: { id: string; numero: string; nombre: string };
  onListo?: () => void;
}) {
  const controlar = useControlEnvase();
  const [r, setR] = useState<Record<string, Respuesta>>({
    contenedor: null,
    rotulo: null,
    cantidad: null,
    aspecto: null,
  });
  const [observacion, setObservacion] = useState('');
  const marcar = (k: string) => (v: boolean) => setR((x) => ({ ...x, [k]: v }));
  const respondido = Object.values(r).every((v) => v !== null);
  // RN-10: con el embalaje o la identificación mal no se muestrea.
  const noSeMuestrea = r.contenedor === false || r.rotulo === false;

  const enviar = (aprobado: boolean) =>
    controlar.mutate(
      {
        loteId: lote.id,
        contenedorOk: r.contenedor!,
        rotuloOk: r.rotulo!,
        cantidadOk: r.cantidad!,
        aspectoOk: r.aspecto!,
        aprobado,
        observacion,
      },
      { onSuccess: () => onListo?.() },
    );

  return (
    <Stack gap="sm">
      <Text fw={700}>
        {lote.nombre}{' '}
        <Text span size="xs" c="dimmed" ff="monospace">
          {lote.numero}
        </Text>
      </Text>
      <Pregunta texto="Embalaje íntegro y limpio" valor={r.contenedor ?? null} onCambiar={marcar('contenedor')} />
      <Pregunta texto="Bien identificado (rótulo)" valor={r.rotulo ?? null} onCambiar={marcar('rotulo')} />
      <Pregunta texto="La cantidad coincide con el remito" valor={r.cantidad ?? null} onCambiar={marcar('cantidad')} />
      <Pregunta
        texto="Sin roturas ni defectos de impresión"
        valor={r.aspecto ?? null}
        onCambiar={marcar('aspecto')}
      />
      <Textarea
        label="Observación (opcional)"
        autosize
        minRows={1}
        value={observacion}
        onChange={(e) => setObservacion(e.currentTarget.value)}
      />
      {noSeMuestrea ? (
        <Alert color="estadoCuarentena" icon={<IconAlertTriangle size={18} />}>
          Con el embalaje o la identificación mal no se controla (RN-10): queda en cuarentena y
          hay que avisar a Dirección Técnica.
        </Alert>
      ) : null}
      <Group justify="flex-end" gap="sm">
        <Button
          size="md"
          color="estadoRechazado"
          leftSection={<IconX size={18} />}
          disabled={!respondido || noSeMuestrea}
          loading={controlar.isPending && controlar.variables.aprobado === false}
          onClick={() => enviar(false)}
        >
          Rechazar
        </Button>
        <Button
          size="md"
          color="estadoAprobado"
          leftSection={<IconCheck size={18} />}
          disabled={!respondido || noSeMuestrea || !r.aspecto || !r.cantidad}
          loading={controlar.isPending && controlar.variables.aprobado === true}
          onClick={() => enviar(true)}
        >
          Aprobar
        </Button>
      </Group>
    </Stack>
  );
}
