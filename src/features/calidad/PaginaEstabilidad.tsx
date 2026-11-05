import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { modals } from '@mantine/modals';
import { z } from 'zod';
import { IconArrowLeft, IconPlus, IconPrinter } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { useNomina } from '@/lib/consultasComercial';
import {
  TIEMPOS,
  useAgregarParametro,
  useCrearEstudio,
  useEditarEstudio,
  useEditarParametro,
  useEstudio,
  useEstudios,
  type Parametro,
} from '@/lib/consultasEstabilidad';
import { fecha, fechaHora } from '@/lib/formato';

/** Fecha prevista de cada medición: inicio + N días. */
function prevista(inicio: string, dias: number) {
  const d = new Date(`${inicio}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fecha(d);
}

const esquemaNuevo = z.object({
  producto: z.string().trim().min(1, 'Falta el producto'),
  lote: z.string().trim(),
  condicion: z.string().trim().min(1, 'Falta la condición'),
  fecha_inicio: z.string().min(1, 'Falta la fecha de inicio'),
});

/** Lista de estudios y alta (D-estabilidad-1). */
export function PaginaEstabilidad() {
  const estudios = useEstudios();
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const crear = useCrearEstudio();
  const navegar = useNavigate();
  const form = useForm({
    initialValues: {
      producto: '',
      lote: '',
      condicion: '40 °C ± 2 °C',
      fecha_inicio: new Date().toISOString().slice(0, 10),
    },
    validate: zod4Resolver(esquemaNuevo),
  });

  return (
    <Stack>
      <Title order={2}>Estabilidad acelerada</Title>
      {esDT ? (
        <Paper withBorder p="md">
          <form
            onSubmit={form.onSubmit((v) =>
              crear.mutate(
                { ...v, lote: v.lote || null },
                { onSuccess: (id) => void navegar(`/estabilidad/${id}`) },
              ),
            )}
          >
            <Group align="flex-end" wrap="wrap">
              <TextInput
                label="Producto"
                size="md"
                w={260}
                {...form.getInputProps('producto')}
              />
              <TextInput label="Lote" size="md" w={140} {...form.getInputProps('lote')} />
              <TextInput
                label="Condición"
                size="md"
                w={160}
                {...form.getInputProps('condicion')}
              />
              <TextInput
                type="date"
                label="Inicio"
                size="md"
                {...form.getInputProps('fecha_inicio')}
              />
              <Button
                type="submit"
                size="md"
                leftSection={<IconPlus size={18} />}
                loading={crear.isPending}
              >
                Nuevo estudio
              </Button>
            </Group>
          </form>
        </Paper>
      ) : null}
      {estudios.isLoading ? (
        <Skeleton h={200} />
      ) : !estudios.data?.length ? (
        <Text c="dimmed">Todavía no hay estudios.</Text>
      ) : (
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th>Lote</Table.Th>
              <Table.Th>Condición</Table.Th>
              <Table.Th>Inicio</Table.Th>
              <Table.Th>90 días</Table.Th>
              <Table.Th>Estado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {estudios.data.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/estabilidad/${e.id}`}>
                    {e.producto}
                  </Anchor>
                </Table.Td>
                <Table.Td>{e.lote ?? '—'}</Table.Td>
                <Table.Td>{e.condicion}</Table.Td>
                <Table.Td>{fecha(e.fecha_inicio)}</Table.Td>
                <Table.Td>{prevista(e.fecha_inicio, 90)}</Table.Td>
                <Table.Td>
                  {e.cerrado_en ? (
                    <Badge color="gray">Cerrado</Badge>
                  ) : (
                    <Badge>En curso</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

/** Celda que guarda al salir, solo si cambió. */
function Celda({
  valor,
  guardar,
  editable,
  ...resto
}: {
  valor: string | null;
  guardar: (v: string | null) => void;
  editable: boolean;
  'aria-label': string;
}) {
  const [texto, setTexto] = useState(valor ?? '');
  if (!editable) return <>{valor ?? ''}</>;
  return (
    <>
      <TextInput
        className="no-imprimir"
        size="md"
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        onBlur={() => {
          const v = texto.trim() || null;
          if (v !== valor) guardar(v);
        }}
        {...resto}
      />
      <span className="solo-impresion" style={{ display: 'none' }}>
        {valor ?? ''}
      </span>
    </>
  );
}

/** Hoja del estudio: se edita en pantalla y se imprime como PDF. */
export function PaginaEstudioEstabilidad() {
  const { id = '' } = useParams();
  const q = useEstudio(id);
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const nomina = useNomina();
  const editarEstudio = useEditarEstudio(id);
  const editarParam = useEditarParametro(id);
  const agregar = useAgregarParametro(id);
  const [nuevo, setNuevo] = useState('');
  const [conclusion, setConclusion] = useState<string | null>(null);

  if (q.isLoading) return <Skeleton h={500} />;
  if (!q.data) return <Text>No se encontró el estudio.</Text>;
  const { estudio: e, parametros } = q.data;
  const abierto = !e.cerrado_en;
  const editable = esDT && abierto;
  const textoConclusion = conclusion ?? e.conclusion ?? '';
  const guardarCampo = (p: Parametro, col: keyof Parametro) => (v: string | null) =>
    editarParam.mutate({ id: p.id, [col]: v });

  const cerrar = () =>
    modals.openConfirmModal({
      title: 'Cerrar el estudio',
      children: (
        <Text>
          Queda firmado a tu nombre con la conclusión. Después no se puede modificar nada.
        </Text>
      ),
      labels: { confirm: 'Cerrar y firmar', cancel: 'Volver' },
      onConfirm: () =>
        editarEstudio.mutate({
          conclusion: textoConclusion.trim(),
          cerrado_en: new Date().toISOString(),
        }),
    });

  return (
    <Stack>
      <Group justify="space-between" className="no-imprimir">
        <Anchor component={Link} to="/estabilidad">
          <Group gap={4}>
            <IconArrowLeft size={16} /> Estudios
          </Group>
        </Anchor>
        <Button
          size="md"
          leftSection={<IconPrinter size={18} />}
          onClick={() => window.print()}
        >
          Descargar PDF
        </Button>
      </Group>

      <div>
        <Title order={2}>Estudio de estabilidad acelerada</Title>
        <Text size="lg" fw={600}>
          {e.producto}
          {e.lote ? ` · Lote ${e.lote}` : ''}
        </Text>
        <Text>
          Condición: {e.condicion} · Inicio: {fecha(e.fecha_inicio)}
        </Text>
      </div>

      <Table withTableBorder withColumnBorders verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Parámetro</Table.Th>
            <Table.Th>Especificación</Table.Th>
            {TIEMPOS.map((t) => (
              <Table.Th key={t.col}>
                {t.etiqueta}
                <Text size="xs" c="dimmed">
                  {prevista(e.fecha_inicio, t.dias)}
                </Text>
              </Table.Th>
            ))}
            {editable ? <Table.Th className="no-imprimir" /> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {parametros.map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td fw={600}>
                <Celda
                  aria-label="Parámetro"
                  valor={p.parametro}
                  editable={editable}
                  guardar={(v) => v && editarParam.mutate({ id: p.id, parametro: v })}
                />
              </Table.Td>
              <Table.Td>
                <Celda
                  aria-label={`Especificación de ${p.parametro}`}
                  valor={p.especificacion}
                  editable={editable}
                  guardar={guardarCampo(p, 'especificacion')}
                />
              </Table.Td>
              {TIEMPOS.map((t) => (
                <Table.Td key={t.col}>
                  <Celda
                    aria-label={`${p.parametro} a ${t.etiqueta}`}
                    valor={p[t.col]}
                    editable={editable}
                    guardar={guardarCampo(p, t.col)}
                  />
                </Table.Td>
              ))}
              {editable ? (
                <Table.Td className="no-imprimir">
                  <Button
                    variant="subtle"
                    color="red"
                    size="md"
                    onClick={() => editarParam.mutate({ id: p.id, quitado: true })}
                  >
                    Quitar
                  </Button>
                </Table.Td>
              ) : null}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {editable ? (
        <Group className="no-imprimir">
          <TextInput
            size="md"
            placeholder="Otro parámetro (viscosidad, densidad…)"
            value={nuevo}
            onChange={(ev) => setNuevo(ev.currentTarget.value)}
            w={320}
          />
          <Button
            size="md"
            variant="light"
            leftSection={<IconPlus size={18} />}
            disabled={!nuevo.trim()}
            loading={agregar.isPending}
            onClick={() =>
              agregar.mutate(
                { parametro: nuevo.trim(), orden: parametros.length },
                { onSuccess: () => setNuevo('') },
              )
            }
          >
            Agregar parámetro
          </Button>
        </Group>
      ) : null}

      <div>
        <Title order={4}>Conclusión</Title>
        {editable ? (
          <Stack className="no-imprimir">
            <Textarea
              size="md"
              autosize
              minRows={3}
              value={textoConclusion}
              onChange={(ev) => setConclusion(ev.currentTarget.value)}
              onBlur={() => {
                const v = textoConclusion.trim() || null;
                if (v !== e.conclusion) editarEstudio.mutate({ conclusion: v });
              }}
            />
            <Group>
              <Button size="md" disabled={!textoConclusion.trim()} onClick={cerrar}>
                Cerrar estudio
              </Button>
            </Group>
          </Stack>
        ) : null}
        <Text
          className={editable ? 'solo-impresion' : ''}
          style={{ whiteSpace: 'pre-wrap', display: editable ? 'none' : undefined }}
        >
          {e.conclusion || '—'}
        </Text>
      </div>

      {e.cerrado_en ? (
        <Text>
          Cerrado por {nomina.data?.get(e.cerrado_por!) ?? '—'} el{' '}
          {fechaHora(e.cerrado_en)}
        </Text>
      ) : (
        <Text c="dimmed">Estudio en curso: sin cerrar.</Text>
      )}
    </Stack>
  );
}
