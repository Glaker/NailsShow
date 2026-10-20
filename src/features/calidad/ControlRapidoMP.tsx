import { useState } from 'react';
import { Alert, Button, Group, NumberInput, Stack, Text, Textarea } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import { useControlRapidoMP } from '@/lib/consultasAnalisis';

export interface LoteAControlar {
  id: string;
  numero: string;
  nombre: string;
  requiereProtocolo: boolean;
  bultos: number;
}

type Respuesta = boolean | null;

/** Una pregunta, dos botones grandes. Arranca sin responder: hay que mirar. */
function Pregunta({
  texto,
  valor,
  onCambiar,
}: {
  texto: string;
  valor: Respuesta;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text fw={500}>{texto}</Text>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="md"
          w={84}
          color="estadoAprobado"
          variant={valor === true ? 'filled' : 'default'}
          onClick={() => onCambiar(true)}
        >
          Sí
        </Button>
        <Button
          size="md"
          w={84}
          color="estadoRechazado"
          variant={valor === false ? 'filled' : 'default'}
          onClick={() => onCambiar(false)}
        >
          No
        </Button>
      </Group>
    </Group>
  );
}

/**
 * Control de materia prima de una vez: muestra, verificación y veredicto
 * (D-recepcion-1). La base arma el muestreo, la etiqueta R.50.4.1, el
 * registro R.50.5.1 y el rótulo verde o rojo; acá solo se mira y se marca.
 */
export function ControlRapidoMP({
  lote,
  onListo,
}: {
  lote: LoteAControlar;
  onListo: () => void;
}) {
  const controlar = useControlRapidoMP();
  const [r, setR] = useState<Record<string, Respuesta>>({
    contenedor: null,
    rotulo: null,
    protocolo: lote.requiereProtocolo ? null : true,
    aspecto: null,
    olor: null,
  });
  const [observacion, setObservacion] = useState('');
  // RN-10: cantidad de contenedores verificada. Arranca en los bultos del
  // remito, pero es lo que se cuenta ahora.
  const [contenedores, setContenedores] = useState<number | string>(lote.bultos);
  const marcar = (k: string) => (v: boolean) => setR((x) => ({ ...x, [k]: v }));

  const respondido =
    Object.values(r).every((v) => v !== null) && typeof contenedores === 'number';
  // RN-10: con el contenedor, el rótulo o el protocolo mal no se muestrea
  // (gmp.registrar_muestreo). No es un rechazo, es una no conformidad de DT.
  const noSeMuestrea =
    r.contenedor === false || r.rotulo === false || r.protocolo === false;
  const puedeAprobar = respondido && !noSeMuestrea && r.protocolo && r.aspecto && r.olor;

  const enviar = (aprobado: boolean) =>
    controlar.mutate(
      {
        loteId: lote.id,
        contenedorOk: r.contenedor!,
        rotuloOk: r.rotulo!,
        coincideProtocolo: r.protocolo!,
        aspectoOk: r.aspecto!,
        olorOk: r.olor!,
        aprobado,
        contenedores: Number(contenedores),
        observacion,
      },
      { onSuccess: onListo },
    );

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {lote.numero} · {lote.nombre}. Tomá un tubo de ensayo de muestra (va a
        contramuestra) y marcá lo que ves.
      </Text>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Text fw={500}>Contenedores contados</Text>
        <NumberInput
          w={176}
          size="md"
          min={0}
          allowDecimal={false}
          value={contenedores}
          onChange={setContenedores}
        />
      </Group>
      <Pregunta
        texto="Contenedor íntegro y limpio"
        valor={r.contenedor ?? null}
        onCambiar={marcar('contenedor')}
      />
      <Pregunta
        texto="Rótulo correcto"
        valor={r.rotulo ?? null}
        onCambiar={marcar('rotulo')}
      />
      {lote.requiereProtocolo ? (
        <Pregunta
          texto="El lote coincide con el protocolo"
          valor={r.protocolo ?? null}
          onCambiar={marcar('protocolo')}
        />
      ) : null}
      <Pregunta
        texto="Aspecto transparente"
        valor={r.aspecto ?? null}
        onCambiar={marcar('aspecto')}
      />
      <Pregunta
        texto="Olor característico"
        valor={r.olor ?? null}
        onCambiar={marcar('olor')}
      />
      <Textarea
        label="Observación (opcional)"
        autosize
        minRows={2}
        value={observacion}
        onChange={(e) => setObservacion(e.currentTarget.value)}
      />
      {noSeMuestrea ? (
        <Alert color="estadoCuarentena" icon={<IconAlertTriangle size={18} />}>
          Con el contenedor, el rótulo o el protocolo mal no se muestrea (RN-10). Dejalo
          en cuarentena y avisá a Dirección Técnica: corresponde una no conformidad.
        </Alert>
      ) : null}
      <Group justify="space-between">
        <Button variant="subtle" color="gray" onClick={onListo}>
          Después
        </Button>
        <Group gap="sm">
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
            disabled={!puedeAprobar}
            loading={controlar.isPending && controlar.variables.aprobado === true}
            onClick={() => enviar(true)}
          >
            Aprobar
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
