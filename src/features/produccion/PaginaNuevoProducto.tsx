import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCopy, IconHelpCircle } from '@tabler/icons-react';
import { useTieneRol } from '@/features/auth/sesion';
import { FormularioProducto } from '@/features/maestros/PaginaProductos';
import {
  rige,
  useFormulasFabricacion,
  useGuardarProcedimiento,
  useProcedimientos,
  useProductos,
} from '@/lib/consultas';
import { useConsultarFormula, useMaterialesProducto } from '@/lib/consultasEtiquetado';
import {
  useConsultarDT,
  useConsultasDT,
  useCopiarEspecificacion,
  useCopiarFormula,
  usePendientesDT,
  useProcedimientosVigentes,
  type PendienteDT,
} from '@/lib/consultasNuevoProducto';
import { useEspecificaciones } from '@/lib/consultasOrdenes';
import { tiempoDe } from '@/lib/envasado';
import { fecha } from '@/lib/formato';
import { FormularioNuevaFormula } from './PaginaFormulas';
import { PaginaFormula } from './PaginaFormula';
import { PanelProcedimiento } from './PanelProcedimiento';
import { CabeceraEspecificacion, FichaEspecificacion } from './PaginaEspecificaciones';
import { CostosFormula, MaterialesProducto } from './TareasCarga';
import { TiempoEnvasado } from './TiempoEnvasado';

type Estado = 'listo' | 'falta' | 'opcional' | 'espera' | 'pedido' | 'aprobar';

const BADGE: Record<Estado, { color: string; texto: string }> = {
  listo: { color: 'estadoAprobado', texto: 'Completo' },
  falta: { color: 'orange', texto: 'Falta' },
  opcional: { color: 'gray', texto: 'Opcional' },
  espera: { color: 'gray', texto: 'Primero el producto' },
  pedido: { color: 'grape', texto: 'Se lo pidió a DT' },
  aprobar: { color: 'estadoEnAnalisis', texto: 'Espera aprobación de DT' },
};

const SECCION: Record<PendienteDT['seccion'], string> = {
  FORMULA: 'Fórmula',
  PROCEDIMIENTO: 'Procedimiento',
  ESPECIFICACION: 'Especificación',
};

function Titulo({ n, texto, estado }: { n: number; texto: string; estado: Estado }) {
  return (
    <Group justify="space-between" wrap="nowrap" pr="sm">
      <Text fw={700} size="lg">
        {n}. {texto}
      </Text>
      <Badge variant="light" radius="sm" color={BADGE[estado].color}>
        {BADGE[estado].texto}
      </Badge>
    </Group>
  );
}

/** Copiar de otro producto: elegir el origen y copiar. */
function CopiarDeOtro({
  etiqueta,
  opciones,
  cargando,
  onCopiar,
  extra,
  listo = true,
}: {
  etiqueta: string;
  opciones: { value: string; label: string }[];
  cargando: boolean;
  onCopiar: (origen: string) => void;
  extra?: React.ReactNode;
  listo?: boolean;
}) {
  const [origen, setOrigen] = useState<string | null>(null);
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Stack gap="xs">
        <Select
          label={etiqueta}
          placeholder="Buscá el producto"
          searchable
          nothingFoundMessage="No hay ninguno cargado"
          data={opciones}
          value={origen}
          onChange={setOrigen}
        />
        {extra}
        <Button
          variant="light"
          leftSection={<IconCopy size={16} />}
          disabled={!origen || !listo}
          loading={cargando}
          onClick={() => origen && onCopiar(origen)}
          style={{ alignSelf: 'flex-start' }}
        >
          Copiar como borrador
        </Button>
        <Text size="xs" c="dimmed">
          Queda como borrador de este producto: lo podés cambiar todo antes de que
          Dirección Técnica lo apruebe.
        </Text>
      </Stack>
    </Paper>
  );
}

/** «No la sé»: se lo pasa a Dirección Técnica. */
function NoLaSe({
  pedido,
  cargando,
  onPedir,
}: {
  pedido: boolean;
  cargando: boolean;
  onPedir: () => void;
}) {
  if (pedido)
    return (
      <Alert
        color="grape"
        variant="light"
        radius="md"
        icon={<IconHelpCircle size={18} />}
      >
        Se lo pediste a Dirección Técnica: lo ve en sus pendientes y lo carga acá mismo.
      </Alert>
    );
  return (
    <Button
      variant="default"
      leftSection={<IconHelpCircle size={18} />}
      loading={cargando}
      onClick={onPedir}
      style={{ alignSelf: 'flex-start' }}
    >
      No la sé: que la cargue Dirección Técnica
    </Button>
  );
}

/**
 * Lo que hay que revisar de un pendiente, ahí mismo: la fórmula (la que está
 * en borrador, si hay), su procedimiento o la especificación del producto.
 */
function SeccionPendiente({
  productoId,
  seccion,
}: {
  productoId: string;
  seccion: PendienteDT['seccion'];
}) {
  const formulas = useFormulasFabricacion();
  const especificaciones = useEspecificaciones();
  const delProducto = (formulas.data ?? []).filter(
    (f) => f.producto_id === productoId && f.estado !== 'DADO_DE_BAJA',
  );
  const formula = delProducto.find((f) => f.estado === 'BORRADOR') ?? delProducto[0];
  const espec = (especificaciones.data ?? []).find(
    (e) => e.producto_id === productoId && e.estado !== 'DADO_DE_BAJA',
  );
  if (formulas.isLoading || especificaciones.isLoading)
    return <Text size="sm">Cargando…</Text>;
  if (seccion === 'ESPECIFICACION')
    return espec ? (
      <FichaEspecificacion id={espec.id} onCambiarId={() => {}} />
    ) : (
      <CabeceraEspecificacion productoId={productoId} onListo={() => {}} />
    );
  if (!formula)
    return <FormularioNuevaFormula productoInicial={productoId} onListo={() => {}} />;
  return seccion === 'PROCEDIMIENTO' ? (
    <PanelProcedimiento formulaId={formula.id} />
  ) : (
    <PaginaFormula formulaId={formula.id} />
  );
}

/**
 * Lo que DT tiene que cargar o aprobar. Cada uno se despliega en el lugar,
 * con lo que hay que revisar (pedido del 2026-10-23).
 */
function PendientesDT() {
  const pendientes = usePendientesDT();
  const [abierto, setAbierto] = useState<string | null>(null);
  const filas = pendientes.data ?? [];
  if (filas.length === 0) return null;
  return (
    <Paper
      withBorder
      p="md"
      mb="lg"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Text fw={700} mb="xs">
        Para Dirección Técnica ({filas.length})
      </Text>
      <Accordion value={abierto} onChange={setAbierto} variant="contained" radius="md">
        {filas.map((p) => {
          const clave = `${p.producto_id}|${p.seccion}|${p.motivo}|${p.desde}`;
          return (
            <Accordion.Item key={clave} value={clave}>
              <Accordion.Control>
                <Group justify="space-between" wrap="wrap" gap="xs" pr="sm">
                  <div>
                    <Text size="sm" fw={600}>
                      {p.nombre}
                    </Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {p.codigo_interno}
                    </Text>
                  </div>
                  <Group gap="sm" wrap="nowrap">
                    <Text size="sm">{SECCION[p.seccion]}</Text>
                    <Badge
                      variant="light"
                      radius="sm"
                      color={p.motivo === 'NO_LA_SABE' ? 'grape' : 'estadoEnAnalisis'}
                    >
                      {p.motivo === 'NO_LA_SABE' ? 'No la sabe: cargarla' : 'Aprobar'}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {p.pedido_por ?? ''} · {fecha(p.desde)}
                    </Text>
                  </Group>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                {/* Se monta solo el abierto: cada uno trae su fórmula entera. */}
                {abierto === clave ? (
                  <SeccionPendiente productoId={p.producto_id} seccion={p.seccion} />
                ) : null}
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Paper>
  );
}

/**
 * Nuevo producto (pedidos del codirector técnico del 2026-10-22 y -23): todo
 * lo que hace falta para fabricarlo, en secciones a completar. Lo carga
 * Gerencia de Producción o Dirección Técnica; en cada sección se puede
 * empezar de cero, copiar lo de otro producto o decir «No la sé» y pasárselo
 * a DT. Lo que carga GP queda en borrador hasta que DT lo aprueba
 * (D-nuevo-producto-1). Cada sección es la pantalla de siempre: acá solo se
 * juntan. El producto va en la URL, así que se puede dejar a medias.
 */
export function PaginaNuevoProducto() {
  const [params, setParams] = useSearchParams();
  const productoId = params.get('producto');
  // Conserva la pestaña de Catálogos (?vista=nuevo).
  const elegir = (id: string | null) =>
    setParams((p) => {
      if (id) p.set('producto', id);
      else p.delete('producto');
      return p;
    });
  const esDT = useTieneRol('DIRECCION_TECNICA');
  const [abiertas, setAbiertas] = useState<string[]>(['producto']);

  const productos = useProductos();
  const formulas = useFormulasFabricacion();
  const especificaciones = useEspecificaciones();
  const materiales = useMaterialesProducto(productoId ?? '', Boolean(productoId));
  const consultas = useConsultasDT(productoId);
  const vigentes = useProcedimientosVigentes(Boolean(productoId));
  const consultarFormula = useConsultarFormula();
  const consultarDT = useConsultarDT();
  const copiarFormula = useCopiarFormula();
  const copiarEspec = useCopiarEspecificacion();
  const guardarProc = useGuardarProcedimiento();
  const [codigoPoe, setCodigoPoe] = useState('I-E.50.');

  const nombreDe = new Map((productos.data ?? []).map((p) => [p.id, p.nombre]));
  const producto = (productos.data ?? []).find((p) => p.id === productoId);
  // La más nueva que no esté dada de baja (las vigentes vienen primero).
  // El borrador primero (una versión nueva en curso), si no la vigente.
  const delProducto = (formulas.data ?? []).filter(
    (f) => f.producto_id === productoId && f.estado !== 'DADO_DE_BAJA',
  );
  const formula = delProducto.find((f) => f.estado === 'BORRADOR') ?? delProducto[0];
  const procedimientos = useProcedimientos(formula?.id);
  const versiones = procedimientos.data ?? [];
  const espec = (especificaciones.data ?? []).find(
    (e) => e.producto_id === productoId && e.estado !== 'DADO_DE_BAJA',
  );
  const mats = materiales.data ?? [];
  const pedidas = consultas.data ?? new Set<string>();

  const formulasDeOtros = (formulas.data ?? [])
    .filter((f) => f.producto_id !== productoId && f.estado !== 'DADO_DE_BAJA')
    .map((f) => ({
      value: f.id,
      label: `${f.producto?.nombre ?? nombreDe.get(f.producto_id) ?? '¿?'}${f.variedad ? ` — ${f.variedad}` : ''} · v${f.version}${f.estado === 'VIGENTE' ? '' : ' (borrador)'}`,
    }));
  const productoDeFormula = new Map((formulas.data ?? []).map((f) => [f.id, f]));
  const procedimientosDeOtros = (vigentes.data ?? [])
    .filter((v) => productoDeFormula.get(v.formula_id)?.producto_id !== productoId)
    .map((v) => {
      const f = productoDeFormula.get(v.formula_id);
      return {
        value: v.formula_id,
        label: `${f?.producto?.nombre ?? '¿?'}${f?.variedad ? ` — ${f.variedad}` : ''} · v${v.version}`,
      };
    });
  const especDeOtros = (especificaciones.data ?? [])
    .filter((e) => e.producto_id !== productoId && e.estado !== 'DADO_DE_BAJA')
    .map((e) => ({
      value: e.id,
      label: `${e.denominacion} · ${e.codigo_poe} v${e.version}${e.estado === 'VIGENTE' ? '' : ' (borrador)'}`,
    }));

  const hay = Boolean(productoId);
  const estado = (
    ok: boolean,
    opts: { opcional?: boolean; pedido?: boolean; aprobar?: boolean } = {},
  ): Estado =>
    !hay
      ? 'espera'
      : opts.aprobar
        ? 'aprobar'
        : ok
          ? 'listo'
          : opts.pedido
            ? 'pedido'
            : opts.opcional
              ? 'opcional'
              : 'falta';

  const procPendiente = versiones[0] !== undefined && !rige(versiones[0]);

  return (
    <>
      {esDT ? <PendientesDT /> : null}

      <Accordion
        multiple
        value={abiertas}
        onChange={setAbiertas}
        variant="separated"
        radius="md"
      >
        <Accordion.Item value="producto">
          <Accordion.Control>
            <Titulo n={1} texto="Producto" estado={hay ? 'listo' : 'falta'} />
          </Accordion.Control>
          <Accordion.Panel>
            {producto ? (
              <Stack gap="sm">
                <Text>
                  <b>{producto.nombre}</b>
                  {producto.variedad ? ` — ${producto.variedad}` : ''} (
                  {producto.codigo_interno})
                </Text>
                <Anchor size="sm" onClick={() => elegir(null)}>
                  Empezar otro producto
                </Anchor>
              </Stack>
            ) : (
              <Stack gap="md">
                <FormularioProducto onListo={(id) => id && elegir(id)} />
                <Paper
                  withBorder
                  p="sm"
                  style={{ borderColor: 'var(--superficie-borde)' }}
                >
                  <Select
                    label="O seguí con uno ya dado de alta"
                    placeholder="Buscá el producto"
                    searchable
                    data={(productos.data ?? []).map((p) => ({
                      value: p.id,
                      label: `${p.nombre}${p.variedad ? ` — ${p.variedad}` : ''} (${p.codigo_interno})`,
                    }))}
                    onChange={elegir}
                  />
                </Paper>
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        {productoId ? (
          <>
            <Accordion.Item value="formula">
              <Accordion.Control>
                <Titulo
                  n={2}
                  texto="Fórmula"
                  estado={estado(formula?.estado === 'VIGENTE', {
                    aprobar: formula?.estado === 'BORRADOR',
                    pedido: Boolean(producto?.formula_consultada_en),
                  })}
                />
              </Accordion.Control>
              <Accordion.Panel>
                {formula ? (
                  <PaginaFormula formulaId={formula.id} />
                ) : (
                  <Stack gap="md">
                    <NoLaSe
                      pedido={Boolean(producto?.formula_consultada_en)}
                      cargando={consultarFormula.isPending}
                      onPedir={() => consultarFormula.mutate(productoId)}
                    />
                    <CopiarDeOtro
                      etiqueta="Usar la fórmula de otro producto"
                      opciones={formulasDeOtros}
                      cargando={copiarFormula.isPending}
                      onCopiar={(origen) => copiarFormula.mutate({ origen, productoId })}
                    />
                    <Divider label="o desde cero" labelPosition="left" />
                    <FormularioNuevaFormula
                      productoInicial={productoId}
                      onListo={() => {}}
                    />
                  </Stack>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="insumos">
              <Accordion.Control>
                <Titulo
                  n={3}
                  texto="Insumos: envases, etiquetas y lo demás"
                  estado={estado(
                    mats.some((m) => m.rol === 'ENVASE') &&
                      mats.some((m) => m.rol === 'ETIQUETA'),
                  )}
                />
              </Accordion.Control>
              <Accordion.Panel>
                <MaterialesProducto productoId={productoId} />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="procedimiento">
              <Accordion.Control>
                <Titulo
                  n={4}
                  texto="Procedimiento"
                  estado={estado(versiones.some(rige), {
                    aprobar: procPendiente,
                    pedido: pedidas.has('PROCEDIMIENTO'),
                  })}
                />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {formula ? <PanelProcedimiento formulaId={formula.id} /> : null}
                  {versiones.length === 0 ? (
                    <>
                      <NoLaSe
                        pedido={pedidas.has('PROCEDIMIENTO')}
                        cargando={consultarDT.isPending}
                        onPedir={() =>
                          consultarDT.mutate({ productoId, seccion: 'PROCEDIMIENTO' })
                        }
                      />
                      {formula ? (
                        <CopiarDeOtro
                          etiqueta="Usar el procedimiento de otro producto"
                          opciones={procedimientosDeOtros}
                          cargando={guardarProc.isPending}
                          onCopiar={(origen) => {
                            const v = (vigentes.data ?? []).find(
                              (x) => x.formula_id === origen,
                            );
                            if (v)
                              guardarProc.mutate({
                                formulaId: formula.id,
                                texto: v.texto,
                                motivo: null,
                              });
                          }}
                        />
                      ) : (
                        <Text size="sm" c="dimmed">
                          Para cargarlo o copiarlo, primero la fórmula (sección 2): el
                          procedimiento va con ella.
                        </Text>
                      )}
                    </>
                  ) : null}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="especificacion">
              <Accordion.Control>
                <Titulo
                  n={5}
                  texto="Especificación"
                  estado={estado(espec?.estado === 'VIGENTE', {
                    aprobar: espec?.estado === 'BORRADOR',
                    pedido: pedidas.has('ESPECIFICACION'),
                  })}
                />
              </Accordion.Control>
              <Accordion.Panel>
                {espec ? (
                  <FichaEspecificacion id={espec.id} onCambiarId={() => {}} />
                ) : (
                  <Stack gap="md">
                    <NoLaSe
                      pedido={pedidas.has('ESPECIFICACION')}
                      cargando={consultarDT.isPending}
                      onPedir={() =>
                        consultarDT.mutate({ productoId, seccion: 'ESPECIFICACION' })
                      }
                    />
                    <CopiarDeOtro
                      etiqueta="Usar la especificación de otro producto"
                      opciones={especDeOtros}
                      cargando={copiarEspec.isPending}
                      listo={codigoPoe.trim().length > 'I-E.50.'.length}
                      extra={
                        <TextInput
                          label="Código de la nueva"
                          description="El del documento de este producto, p. ej. I-E.50.12"
                          value={codigoPoe}
                          onChange={(e) => setCodigoPoe(e.currentTarget.value)}
                        />
                      }
                      onCopiar={(origen) =>
                        copiarEspec.mutate({
                          origen,
                          productoId,
                          codigoPoe: codigoPoe.trim(),
                        })
                      }
                    />
                    <Divider label="o desde cero" labelPosition="left" />
                    <CabeceraEspecificacion productoId={productoId} onListo={() => {}} />
                  </Stack>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="costos">
              <Accordion.Control>
                <Titulo n={6} texto="Costos" estado="opcional" />
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    El costo de cada envase y etiqueta se carga en la sección 3; acá, el
                    de las materias primas de la fórmula.
                  </Text>
                  <CostosFormula productoId={productoId} />
                  <Anchor
                    component={Link}
                    to={`/costos/producto/${productoId}`}
                    size="sm"
                  >
                    Ver el costo completo del producto
                  </Anchor>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="tiempos">
              <Accordion.Control>
                <Titulo
                  n={7}
                  texto="Tiempos de envasado y etiquetado"
                  estado={tiempoDe(producto) ? 'listo' : 'opcional'}
                />
              </Accordion.Control>
              <Accordion.Panel>
                <TiempoEnvasado productoId={productoId} cantidadSugerida={0} />
              </Accordion.Panel>
            </Accordion.Item>
          </>
        ) : null}
      </Accordion>
    </>
  );
}
