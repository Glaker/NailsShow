import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { fecha } from '@/lib/formato';
import type { DatosAnalisis, RegistroAnalisis } from '@/lib/consultasAnalisis';

/**
 * Formulario de R.50.5.1 / R.50.6.1 / R.50.10.1: los tres tienen los mismos
 * campos (I.50.5, I.50.6, I.50.10). Fecha, número y quién controló los pone
 * la base al guardar.
 */
export function FormularioAnalisis({
  registro,
  objeto,
  aprobadoInicial = null,
  rectifica = false,
  cargando,
  onGuardar,
  onCancelar,
}: {
  registro: string;
  /** Qué se analiza, como lo pide el formulario: insumo y lote, o granel y lote. */
  objeto: string;
  aprobadoInicial?: boolean | null;
  /** Corrige un registro anterior: pide motivo. */
  rectifica?: boolean;
  cargando: boolean;
  onGuardar: (d: DatosAnalisis & { motivo: string }) => void;
  onCancelar: () => void;
}) {
  const [tamano, setTamano] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [conclusiones, setConclusiones] = useState('');
  const [aprobado, setAprobado] = useState<boolean | null>(aprobadoInicial);
  const [motivo, setMotivo] = useState('');
  const valido =
    tamano.trim() &&
    descripcion.trim() &&
    conclusiones.trim() &&
    aprobado !== null &&
    (!rectifica || motivo.trim().length >= 3);

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {registro} · {objeto}
      </Text>
      <TextInput
        label="Tamaño de la muestra"
        placeholder="Por ejemplo: 100 g, 3 unidades"
        value={tamano}
        onChange={(e) => setTamano(e.currentTarget.value)}
      />
      <Textarea
        label="Descripción de la muestra"
        description="Color, olor, aspecto, partículas extrañas, lo que se observó (I.50.5)."
        autosize
        minRows={3}
        value={descripcion}
        onChange={(e) => setDescripcion(e.currentTarget.value)}
      />
      <Textarea
        label="Observaciones y conclusiones finales"
        autosize
        minRows={2}
        value={conclusiones}
        onChange={(e) => setConclusiones(e.currentTarget.value)}
      />
      <Group>
        <Text fw={600}>APROBADO:</Text>
        <SegmentedControl
          value={aprobado === true ? 'si' : aprobado === false ? 'no' : ''}
          onChange={(v) => setAprobado(v === 'si')}
          data={[
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' },
          ]}
        />
      </Group>
      {aprobado === false ? (
        <Alert
          color="estadoRechazado"
          variant="light"
          icon={<IconAlertTriangle size={18} />}
        >
          No aprobado: corresponde abrir no conformidad (PG.60.18).
        </Alert>
      ) : null}
      {rectifica ? (
        <TextInput
          label="Motivo de la corrección"
          description="El registro anterior queda, marcado como rectificado."
          value={motivo}
          onChange={(e) => setMotivo(e.currentTarget.value)}
        />
      ) : null}
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          disabled={!valido}
          loading={cargando}
          {...(aprobado === false ? { color: 'estadoRechazado' } : {})}
          onClick={() =>
            onGuardar({ tamano, descripcion, conclusiones, aprobado: aprobado!, motivo })
          }
        >
          Registrar análisis y dictamen
        </Button>
      </Group>
    </Stack>
  );
}

/** Ficha de un registro de análisis, como se lee en el papel. */
export function FichaAnalisis({ r }: { r: RegistroAnalisis }) {
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="xs">
        <Text fw={700}>
          {r.registro} N° {r.numero}
        </Text>
        <Group gap="xs">
          {r.vigente ? null : (
            <Badge color="gray" variant="light">
              rectificado
            </Badge>
          )}
          <Badge
            color={r.aprobado ? 'estadoAprobado' : 'estadoRechazado'}
            variant="light"
          >
            {r.aprobado ? 'aprobado' : 'no aprobado'}
          </Badge>
        </Group>
      </Group>
      <Stack gap={4}>
        <Text size="sm">
          <b>Fecha:</b> {fecha(r.fecha)} · <b>Controló:</b> {r.controlo_nombre ?? '—'}
        </Text>
        <Text size="sm">
          <b>Tamaño de la muestra:</b> {r.tamano_muestra}
        </Text>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          <b>Descripción:</b> {r.descripcion}
        </Text>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          <b>Conclusiones:</b> {r.conclusiones}
        </Text>
        {r.motivo ? (
          <Text size="sm" c="dimmed">
            Corrige un registro anterior: {r.motivo}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
