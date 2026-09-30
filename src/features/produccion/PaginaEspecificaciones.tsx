import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconClipboardCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { Vacio } from '@/components/Vacio';
import { useTieneRol } from '@/features/auth/sesion';
import { fecha } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  TEXTO_GRUPO,
  textoCriterio,
  useAprobarEspecificacion,
  useEspecificacionCompleta,
  useEspecificaciones,
  useGuardarEspecificacion,
  useGuardarRenglonEspec,
  useNuevaVersionEspecificacion,
  type EspecParametro,
  type Especificacion,
  type GrupoParametro,
  type TipoCriterio,
} from '@/lib/consultasOrdenes';

const COLOR: Record<string, string> = {
  BORRADOR: 'gray',
  VIGENTE: 'estadoAprobado',
  DADO_DE_BAJA: 'dark',
};

const CRITERIOS: { value: TipoCriterio; label: string }[] = [
  { value: 'RANGO', label: 'Rango (mín – máx)' },
  { value: 'MINIMO', label: 'Mínimo (≥)' },
  { value: 'MAXIMO', label: 'Máximo (≤)' },
  { value: 'VALOR_TEXTO', label: 'Texto (lo juzga el analista)' },
  { value: 'CONTRA_PATRON', label: 'Contra patrón' },
  { value: 'REFERENCIA_EXTERNA', label: 'Referencia externa (norma, laboratorio)' },
  { value: 'BINARIO', label: 'Cumple / no cumple' },
];

/**
 * Especificaciones de producto (ítem 6 de la cola del 24/09). La redactan
 * Nazarena y la DT; la aprueba la DT y desde ahí no se edita: se emite la
 * versión siguiente. Es contra lo que se controla el producto terminado del
 * batch record.
 */
export function PaginaEspecificaciones() {
  const lista = useEspecificaciones();
  const puede = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const filas = lista.data ?? [];
  return (
    <>
      <EncabezadoPagina
        titulo="Especificaciones"
        descripcion="Requisitos de cada producto (I-E.50.xx). La vigente no se edita: se emite otra versión."
        acciones={
          puede ? (
            <Button leftSection={<IconPlus size={18} />} onClick={() => setNueva(true)}>
              Nueva especificación
            </Button>
          ) : null
        }
      />
      {lista.isLoading ? (
        <Skeleton h={200} />
      ) : filas.length === 0 ? (
        <Paper withBorder style={{ borderColor: 'var(--superficie-borde)' }}>
          <Vacio
            icono={IconClipboardCheck}
            titulo="Todavía no hay especificaciones cargadas"
            descripcion="Cargá la primera desde su documento I-E.50.xx: denominación, fórmula con rangos y requisitos."
          />
        </Paper>
      ) : (
        <Paper
          withBorder
          style={{ borderColor: 'var(--superficie-borde)', overflow: 'hidden' }}
        >
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th>
                <Table.Th>Denominación</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Vigente desde</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((e) => (
                <Table.Tr
                  key={e.id}
                  onClick={() => setAbierta(e.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td ff="monospace">
                    {e.codigo_poe} v{e.version}
                    {e.variedad ? ` · ${e.variedad}` : ''}
                  </Table.Td>
                  <Table.Td fw={600}>{e.denominacion}</Table.Td>
                  <Table.Td>
                    <Badge color={COLOR[e.estado] ?? 'gray'} variant="light">
                      {e.estado.toLowerCase().replace(/_/g, ' ')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{fecha(e.vigencia_desde)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <Modal
        opened={abierta !== null}
        onClose={() => setAbierta(null)}
        size="xl"
        title="Especificación"
        centered
      >
        {abierta ? <FichaEspecificacion id={abierta} onCambiarId={setAbierta} /> : null}
      </Modal>
      <Modal
        opened={nueva}
        onClose={() => setNueva(false)}
        title="Nueva especificación"
        centered
      >
        <Cabecera
          onListo={(id) => {
            setNueva(false);
            setAbierta(id);
          }}
        />
      </Modal>
    </>
  );
}

/** Datos generales (§7.1: denominación, composición, almacenamiento, muestreo, reanálisis, vida útil). */
function Cabecera({
  actual,
  onListo,
}: {
  actual?: Especificacion;
  onListo: (id: string) => void;
}) {
  const guardar = useGuardarEspecificacion();
  const [v, setV] = useState({
    codigo_poe: actual?.codigo_poe ?? 'I-E.50.',
    variedad: actual?.variedad ?? '',
    denominacion: actual?.denominacion ?? '',
    composicion_inci: actual?.composicion_inci ?? '',
    condiciones_almacenamiento: actual?.condiciones_almacenamiento ?? '',
    instrucciones_muestreo: actual?.instrucciones_muestreo ?? '',
    periodo_reanalisis_meses: actual?.periodo_reanalisis_meses ?? '',
    vida_util_meses: actual?.vida_util_meses ?? '',
  });
  const c = (k: keyof typeof v) => (e: { currentTarget: { value: string } }) =>
    setV({ ...v, [k]: e.currentTarget.value });
  return (
    <Stack gap="sm">
      <Group grow>
        <TextInput
          label="Código"
          disabled={Boolean(actual)}
          value={v.codigo_poe}
          onChange={c('codigo_poe')}
        />
        <TextInput
          label="Variedad"
          disabled={Boolean(actual)}
          value={v.variedad}
          onChange={c('variedad')}
        />
      </Group>
      <TextInput
        label="Denominación del producto"
        withAsterisk
        value={v.denominacion}
        onChange={c('denominacion')}
      />
      <Textarea
        label="Composición (INCI)"
        autosize
        minRows={2}
        value={v.composicion_inci}
        onChange={c('composicion_inci')}
      />
      <Textarea
        label="Condiciones de almacenamiento / precauciones"
        autosize
        value={v.condiciones_almacenamiento}
        onChange={c('condiciones_almacenamiento')}
      />
      <Textarea
        label="Instrucciones para el muestreo / ensayo"
        autosize
        value={v.instrucciones_muestreo}
        onChange={c('instrucciones_muestreo')}
      />
      <Group grow>
        <NumberInput
          label="Reanálisis (meses)"
          description="Vacío = no corresponde"
          min={1}
          allowDecimal={false}
          value={v.periodo_reanalisis_meses}
          onChange={(x) => setV({ ...v, periodo_reanalisis_meses: x })}
        />
        <NumberInput
          label="Vida útil (meses)"
          withAsterisk
          min={1}
          allowDecimal={false}
          value={v.vida_util_meses}
          onChange={(x) => setV({ ...v, vida_util_meses: x })}
        />
      </Group>
      <Group justify="flex-end">
        <Button
          loading={guardar.isPending}
          disabled={
            !v.codigo_poe.trim() || !v.denominacion.trim() || !Number(v.vida_util_meses)
          }
          onClick={() =>
            guardar.mutate(
              {
                ...(actual
                  ? { id: actual.id }
                  : {
                      codigo_poe: v.codigo_poe.trim(),
                      version: '00',
                      variedad: v.variedad.trim() || null,
                    }),
                denominacion: v.denominacion.trim(),
                composicion_inci: v.composicion_inci.trim() || null,
                condiciones_almacenamiento: v.condiciones_almacenamiento.trim() || null,
                instrucciones_muestreo: v.instrucciones_muestreo.trim() || null,
                periodo_reanalisis_meses:
                  v.periodo_reanalisis_meses === ''
                    ? null
                    : Number(v.periodo_reanalisis_meses),
                vida_util_meses: Number(v.vida_util_meses),
              },
              { onSuccess: onListo },
            )
          }
        >
          Guardar
        </Button>
      </Group>
    </Stack>
  );
}

function FichaEspecificacion({
  id,
  onCambiarId,
}: {
  id: string;
  onCambiarId: (id: string) => void;
}) {
  const e = useEspecificacionCompleta(id);
  const nomina = useNomina();
  const puede = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const aprobar = useAprobarEspecificacion();
  const nuevaVersion = useNuevaVersionEspecificacion();
  const renglon = useGuardarRenglonEspec();
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [comp, setComp] = useState({
    componente: '',
    min: '' as number | string,
    max: '' as number | string,
  });
  const [param, setParam] = useState<Partial<EspecParametro> | null>(null);

  if (e.isLoading || !e.data) return <Skeleton h={300} />;
  const { especificacion: s, formula, parametros } = e.data;
  const borrador = s.estado === 'BORRADOR' && puede;
  const grupos = Object.keys(TEXTO_GRUPO) as GrupoParametro[];

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={700}>
            {s.codigo_poe} v{s.version} · {s.denominacion}
          </Text>
          <Text size="xs" c="dimmed">
            {s.estado.toLowerCase().replace(/_/g, ' ')}
            {s.aprobada_por
              ? ` · aprobó ${nomina.data?.get(s.aprobada_por) ?? ''} el ${fecha(s.aprobada_en)}`
              : ''}
            {s.motivo_cambio ? ` · cambio: ${s.motivo_cambio}` : ''}
          </Text>
        </div>
        <Group gap="xs">
          {borrador ? (
            <Button variant="default" onClick={() => setEditando(!editando)}>
              {editando ? 'Cerrar datos generales' : 'Datos generales'}
            </Button>
          ) : null}
          {esDT && s.estado === 'BORRADOR' ? (
            <Button loading={aprobar.isPending} onClick={() => aprobar.mutate(s.id)}>
              Aprobar (DT)
            </Button>
          ) : null}
        </Group>
      </Group>

      {editando ? (
        <Cabecera actual={s} onListo={() => setEditando(false)} />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Text size="sm">
            <b>Composición:</b> {s.composicion_inci ?? '—'}
          </Text>
          <Text size="sm">
            <b>Almacenamiento:</b> {s.condiciones_almacenamiento ?? '—'}
          </Text>
          <Text size="sm">
            <b>Muestreo / ensayo:</b> {s.instrucciones_muestreo ?? '—'}
          </Text>
          <Text size="sm">
            <b>Reanálisis:</b>{' '}
            {s.periodo_reanalisis_meses
              ? `${s.periodo_reanalisis_meses} meses`
              : 'no corresponde'}{' '}
            · <b>Vida útil:</b> {s.vida_util_meses} meses
          </Text>
        </SimpleGrid>
      )}

      <Stack gap={4}>
        <Text fw={600}>Fórmula cuali-cuantitativa porcentual</Text>
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {formula.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>{f.componente}</Table.Td>
                <Table.Td ta="right">
                  {f.es_csp
                    ? 'csp 100 %'
                    : `${f.porcentaje_min ?? ''} – ${f.porcentaje_max ?? ''} %`}
                </Table.Td>
                {borrador ? (
                  <Table.Td w={40}>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        renglon.mutate({
                          tabla: 'espec_formula',
                          id: f.id,
                          fila: { quitado: true },
                        })
                      }
                    >
                      <IconTrash size={14} />
                    </Button>
                  </Table.Td>
                ) : null}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {borrador ? (
          <Group align="flex-end" gap="xs">
            <TextInput
              label="Componente"
              style={{ flex: 1 }}
              value={comp.componente}
              onChange={(x) => setComp({ ...comp, componente: x.currentTarget.value })}
            />
            <NumberInput
              label="% mín"
              w={90}
              decimalScale={4}
              value={comp.min}
              onChange={(x) => setComp({ ...comp, min: x })}
            />
            <NumberInput
              label="% máx"
              w={90}
              decimalScale={4}
              value={comp.max}
              onChange={(x) => setComp({ ...comp, max: x })}
            />
            <Button
              variant="light"
              disabled={!comp.componente.trim()}
              onClick={() =>
                renglon.mutate(
                  {
                    tabla: 'espec_formula',
                    fila: {
                      especificacion_id: s.id,
                      orden: (formula.at(-1)?.orden ?? 0) + 1,
                      componente: comp.componente.trim(),
                      porcentaje_min: comp.min === '' ? null : Number(comp.min),
                      porcentaje_max: comp.max === '' ? null : Number(comp.max),
                    },
                  },
                  { onSuccess: () => setComp({ componente: '', min: '', max: '' }) },
                )
              }
            >
              Agregar
            </Button>
          </Group>
        ) : null}
      </Stack>

      <Stack gap={4}>
        <Group justify="space-between">
          <Text fw={600}>Requisitos</Text>
          {borrador ? (
            <Button
              size="compact-md"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setParam({ grupo: 'FISICOQUIMICO', tipo_criterio: 'RANGO' })}
            >
              Agregar requisito
            </Button>
          ) : null}
        </Group>
        {grupos.map((g) => {
          const deGrupo = parametros.filter((p) => p.grupo === g);
          if (deGrupo.length === 0) return null;
          return (
            <Stack key={g} gap={2}>
              <Text size="sm" c="dimmed">
                Especificaciones {TEXTO_GRUPO[g].toLowerCase()}
              </Text>
              {deGrupo.map((p) => (
                <Group key={p.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">
                    <b>{p.nombre}:</b> {textoCriterio(p)}
                    {p.condicion_ensayo ? ` (${p.condicion_ensayo})` : ''}
                    {p.metodo_ensayo ? ` · ${p.metodo_ensayo}` : ''}
                  </Text>
                  {borrador ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        renglon.mutate({
                          tabla: 'espec_parametros',
                          id: p.id,
                          fila: { quitado: true },
                        })
                      }
                    >
                      <IconTrash size={14} />
                    </Button>
                  ) : null}
                </Group>
              ))}
            </Stack>
          );
        })}
      </Stack>

      {s.estado !== 'BORRADOR' && puede ? (
        <Group align="flex-end">
          <TextInput
            label="Motivo de la nueva versión"
            style={{ flex: 1 }}
            value={motivo}
            onChange={(x) => setMotivo(x.currentTarget.value)}
          />
          <Button
            variant="default"
            loading={nuevaVersion.isPending}
            disabled={motivo.trim().length < 3}
            onClick={() =>
              nuevaVersion.mutate(
                { id: s.id, motivo: motivo.trim() },
                { onSuccess: (nid) => onCambiarId(nid) },
              )
            }
          >
            Nueva versión
          </Button>
        </Group>
      ) : null}

      <Modal
        opened={param !== null}
        onClose={() => setParam(null)}
        title="Requisito"
        centered
      >
        {param ? (
          <EditorParametro
            valor={param}
            onCambiar={setParam}
            cargando={renglon.isPending}
            onGuardar={() =>
              renglon.mutate(
                {
                  tabla: 'espec_parametros',
                  fila: {
                    ...param,
                    especificacion_id: s.id,
                    orden: (parametros.at(-1)?.orden ?? 0) + 1,
                  },
                },
                { onSuccess: () => setParam(null) },
              )
            }
          />
        ) : null}
      </Modal>
    </Stack>
  );
}

function EditorParametro({
  valor: p,
  onCambiar,
  onGuardar,
  cargando,
}: {
  valor: Partial<EspecParametro>;
  onCambiar: (p: Partial<EspecParametro>) => void;
  onGuardar: () => void;
  cargando: boolean;
}) {
  const t = p.tipo_criterio ?? 'RANGO';
  const num = (v: number | string) => (v === '' ? null : Number(v));
  const valido =
    Boolean(p.nombre?.trim()) &&
    ((t === 'RANGO' && p.valor_min != null && p.valor_max != null) ||
      (t === 'MINIMO' && p.valor_min != null) ||
      (t === 'MAXIMO' && p.valor_max != null) ||
      ((t === 'VALOR_TEXTO' || t === 'CONTRA_PATRON') &&
        Boolean(p.valor_texto?.trim())) ||
      (t === 'REFERENCIA_EXTERNA' && Boolean(p.referencia_norma?.trim())) ||
      t === 'BINARIO');
  return (
    <Stack gap="sm">
      <TextInput
        label="Requisito"
        placeholder="Densidad, pH, aspecto…"
        value={p.nombre ?? ''}
        onChange={(e) => onCambiar({ ...p, nombre: e.currentTarget.value })}
      />
      <Group grow>
        <Select
          label="Grupo"
          data={(Object.keys(TEXTO_GRUPO) as GrupoParametro[]).map((g) => ({
            value: g,
            label: TEXTO_GRUPO[g],
          }))}
          value={p.grupo ?? 'FISICOQUIMICO'}
          onChange={(v) => v && onCambiar({ ...p, grupo: v as GrupoParametro })}
        />
        <Select
          label="Criterio"
          data={CRITERIOS}
          value={t}
          onChange={(v) => v && onCambiar({ ...p, tipo_criterio: v as TipoCriterio })}
        />
      </Group>
      {t === 'RANGO' || t === 'MINIMO' || t === 'MAXIMO' ? (
        <Group grow>
          {t !== 'MAXIMO' ? (
            <NumberInput
              label="Mínimo"
              decimalScale={6}
              value={p.valor_min ?? ''}
              onChange={(v) => onCambiar({ ...p, valor_min: num(v) })}
            />
          ) : null}
          {t !== 'MINIMO' ? (
            <NumberInput
              label="Máximo"
              decimalScale={6}
              value={p.valor_max ?? ''}
              onChange={(v) => onCambiar({ ...p, valor_max: num(v) })}
            />
          ) : null}
          <TextInput
            label="Unidad"
            value={p.unidad ?? ''}
            onChange={(e) => onCambiar({ ...p, unidad: e.currentTarget.value || null })}
          />
        </Group>
      ) : null}
      {t === 'VALOR_TEXTO' || t === 'CONTRA_PATRON' ? (
        <TextInput
          label="Lo que tiene que cumplir"
          value={p.valor_texto ?? ''}
          onChange={(e) => onCambiar({ ...p, valor_texto: e.currentTarget.value })}
        />
      ) : null}
      {t === 'REFERENCIA_EXTERNA' ? (
        <TextInput
          label="Norma o referencia"
          placeholder="Disp. ANMAT 1108/99 Anexo II Tipo II"
          value={p.referencia_norma ?? ''}
          onChange={(e) => onCambiar({ ...p, referencia_norma: e.currentTarget.value })}
        />
      ) : null}
      <Group grow>
        <TextInput
          label="Condición de ensayo"
          placeholder="24-25 °C"
          value={p.condicion_ensayo ?? ''}
          onChange={(e) =>
            onCambiar({ ...p, condicion_ensayo: e.currentTarget.value || null })
          }
        />
        <TextInput
          label="Método"
          placeholder="I.50.25 densitómetro"
          value={p.metodo_ensayo ?? ''}
          onChange={(e) =>
            onCambiar({ ...p, metodo_ensayo: e.currentTarget.value || null })
          }
        />
      </Group>
      <Group justify="flex-end">
        <Button loading={cargando} disabled={!valido} onClick={onGuardar}>
          Agregar
        </Button>
      </Group>
    </Stack>
  );
}
