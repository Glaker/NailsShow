import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconCheck,
  IconChecklist,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useInsumos, type Insumo } from '@/lib/consultas';
import {
  UNIDADES_COSTO,
  useCargarCostoEstimado,
  useCostosReferencia,
} from '@/lib/consultasCostos';
import { ORIGEN_PRECIO } from '@/features/costos/comun';
import {
  useAsignarMaterial,
  useConsultarFormula,
  useInsumosDeFormula,
  useMarcarReventa,
  useMarcarSinFormula,
  useMaterialesProducto,
  useQuitarMaterial,
  useTareasCarga,
  type MaterialProducto,
  type RolMaterial,
  type TareaCarga,
} from '@/lib/consultasEtiquetado';
import { FormularioInsumo } from '@/features/maestros/PaginaInsumos';
import { FormularioNuevaFormula } from './PaginaFormulas';
import { TiempoEnvasado } from './TiempoEnvasado';
import { etiquetaUnidad, numero } from '@/lib/formato';

type TipoInsumo = Insumo['tipo'];

/**
 * Costo aproximado de un insumo, opcional (D-costo-estimado-1). Si ya tiene
 * costo de Finanzas o de una compra, solo lo muestra: un estimado no lo pisa.
 * Se carga como se compra: «$ 85.000 por 20 l».
 */
export function CostoAprox({
  insumoId,
  unidad,
  sangria = 0,
}: {
  insumoId: string;
  unidad: string | null;
  sangria?: number;
}) {
  const referencias = useCostosReferencia();
  const cargar = useCargarCostoEstimado();
  const [abierto, setAbierto] = useState(false);
  const [importe, setImporte] = useState<number | string>('');
  const [cantidad, setCantidad] = useState<number | string>(1);
  const [unidadCompra, setUnidadCompra] = useState<string>(
    unidad && UNIDADES_COSTO.includes(unidad) ? unidad : 'UNIDAD',
  );
  const ref = (referencias.data ?? []).find((r) => r.insumo_id === insumoId);
  const firme = ref?.costo_unitario_ars != null && ref.origen !== 'ESTIMADO';

  if (firme || (ref?.origen === 'ESTIMADO' && !abierto)) {
    return (
      <Group gap="xs" pl={sangria}>
        <Text size="xs" c="dimmed">
          {firme ? 'Costo' : 'Costo aprox.'}: $ {numero(ref.costo_unitario_ars, 2)} por{' '}
          {etiquetaUnidad(ref.unidad_medida ?? 'UNIDAD')}
          {firme ? ` (${ORIGEN_PRECIO[ref.origen ?? '']?.label ?? ''})` : ''}
        </Text>
        {!firme ? (
          <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
            Cambiar
          </Button>
        ) : null}
      </Group>
    );
  }
  if (!abierto) {
    return (
      <Group pl={sangria}>
        <Button size="compact-xs" variant="subtle" onClick={() => setAbierto(true)}>
          + Costo aproximado (opcional)
        </Button>
      </Group>
    );
  }
  const listo =
    typeof importe === 'number' &&
    importe > 0 &&
    typeof cantidad === 'number' &&
    cantidad > 0;
  return (
    <Group gap="xs" pl={sangria} wrap="wrap" align="flex-end">
      <NumberInput
        label="Sale $"
        w={140}
        min={0}
        thousandSeparator="."
        decimalSeparator=","
        value={importe}
        onChange={setImporte}
      />
      <NumberInput
        label="por"
        w={90}
        min={0}
        decimalSeparator=","
        value={cantidad}
        onChange={setCantidad}
      />
      <Select
        label=" "
        w={120}
        data={UNIDADES_COSTO.map((u) => ({ value: u, label: etiquetaUnidad(u) }))}
        value={unidadCompra}
        onChange={(u) => u && setUnidadCompra(u)}
        allowDeselect={false}
      />
      <Button
        disabled={!listo}
        loading={cargar.isPending}
        onClick={() =>
          cargar.mutate(
            {
              insumo_id: insumoId,
              importe: Number(importe),
              cantidad: Number(cantidad),
              unidad: unidadCompra,
            },
            { onSuccess: () => setAbierto(false) },
          )
        }
      >
        Guardar
      </Button>
      <Button variant="subtle" color="gray" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
      <Text size="xs" c="dimmed" w="100%">
        Si se compra en kg y el insumo se mide en ml (o al revés), hace falta su densidad
        para pasarlo.
      </Text>
    </Group>
  );
}

/** Materias primas de la fórmula, cada una con su costo aproximado a granel. */
function CostosFormula({ productoId }: { productoId: string }) {
  const [ver, setVer] = useState(false);
  const insumos = useInsumosDeFormula(productoId, ver);
  if (!ver)
    return (
      <Button size="compact-sm" variant="subtle" onClick={() => setVer(true)}>
        Costos de la fórmula a granel (opcional)
      </Button>
    );
  if (insumos.isLoading) return <Skeleton h={40} />;
  const filas = insumos.data ?? [];
  if (filas.length === 0)
    return (
      <Text size="xs" c="dimmed">
        La fórmula todavía no tiene materias primas cargadas.
      </Text>
    );
  return (
    <Stack gap={6}>
      {filas.map((c) => (
        <Stack key={c.insumo_id} gap={2}>
          <Text size="sm">
            {c.insumo?.codigo_interno} — {c.insumo?.nombre}
          </Text>
          <CostoAprox insumoId={c.insumo_id} unidad={c.insumo?.unidad_medida ?? null} />
        </Stack>
      ))}
    </Stack>
  );
}

/** Lo que puede ser cada cosa que se agrega, en palabras de planta. */
const QUE_ES: { valor: string; rol: RolMaterial; tipos: TipoInsumo[] }[] = [
  { valor: 'Etiqueta', rol: 'ETIQUETA', tipos: ['ETIQUETA'] },
  { valor: 'Guarnición', rol: 'EXTRA', tipos: ['MATERIAL_ENVASE', 'MATERIAL_EMPAQUE'] },
  { valor: 'Tapa', rol: 'EXTRA', tipos: ['MATERIAL_ENVASE'] },
  { valor: 'Pincel', rol: 'EXTRA', tipos: ['MATERIAL_ENVASE'] },
  { valor: 'Caja', rol: 'EXTRA', tipos: ['MATERIAL_EMPAQUE'] },
  { valor: 'Bolsa', rol: 'EXTRA', tipos: ['MATERIAL_EMPAQUE'] },
];
const TIPOS_EXTRA: TipoInsumo[] = ['MATERIAL_ENVASE', 'MATERIAL_EMPAQUE', 'ETIQUETA'];

/** Un buscador de insumos del tipo pedido, con «Nuevo insumo» si no está. */
function ElegirInsumo({
  tipos,
  onElegir,
  onNuevo,
  placeholder,
}: {
  tipos: TipoInsumo[];
  onElegir: (id: string) => void;
  onNuevo: (nombre: string) => void;
  placeholder: string;
}) {
  const insumos = useInsumos();
  const [buscado, setBuscado] = useState('');
  const opciones = (insumos.data ?? [])
    .filter((i) => i.activo && tipos.includes(i.tipo))
    .map((i) => ({ value: i.id, label: `${i.codigo_interno} — ${i.nombre}` }));
  return (
    <Select
      size="md"
      placeholder={placeholder}
      data={opciones}
      value={null}
      searchable
      onSearchChange={setBuscado}
      onChange={(v) => v && onElegir(v)}
      nothingFoundMessage={
        <Button
          fullWidth
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() => onNuevo(buscado.trim())}
        >
          Nuevo insumo
        </Button>
      }
    />
  );
}

/** Pedido de alta de un insumo que no estaba, con lo que va a ser. */
interface Alta {
  rol: RolMaterial;
  tipo: TipoInsumo;
  nombre: string;
  categoria: string | null;
}

/** Un material que lleva el producto: qué es, cuál, su costo y quitar. */
function FilaMaterial({
  m,
  productoId,
  onClasificar,
}: {
  m: MaterialProducto;
  productoId: string;
  onClasificar: (rol: RolMaterial) => void;
}) {
  const quitar = useQuitarMaterial();
  const etiqueta =
    m.categoria ??
    (m.rol === 'ENVASE'
      ? 'Envase'
      : m.rol === 'ETIQUETA'
        ? 'Etiqueta'
        : m.rol
          ? 'Extra'
          : 'Sin clasificar');
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4}>
          <Group gap="xs">
            <Badge
              variant="light"
              radius="sm"
              color={
                m.rol === 'ENVASE'
                  ? 'azul'
                  : m.rol === 'ETIQUETA'
                    ? 'grape'
                    : m.rol
                      ? 'gray'
                      : 'orange'
              }
            >
              {etiqueta}
            </Badge>
            <Text size="sm" fw={600}>
              {m.insumo?.nombre}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {m.insumo?.codigo_interno}
            </Text>
          </Group>
          {m.rol ? (
            <CostoAprox insumoId={m.insumo_id} unidad={m.insumo?.unidad_medida ?? null} />
          ) : (
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Cargado antes, sin decir qué es:
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => onClasificar('ENVASE')}
              >
                Es el envase
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => onClasificar('ETIQUETA')}
              >
                Es etiqueta
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => onClasificar('EXTRA')}
              >
                Es otra cosa
              </Button>
            </Group>
          )}
        </Stack>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label={`Quitar ${m.insumo?.nombre ?? ''}`}
          onClick={() => quitar.mutate({ productoId, insumoId: m.insumo_id })}
        >
          <IconX size={18} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

/** «+ Agregar»: qué es y cuál. La categoría se elige o se escribe. */
function Agregar({
  texto,
  fijo,
  onElegir,
  onNuevo,
}: {
  texto: string;
  /** Si viene, no se pregunta qué es (p. ej. «+ Agregar etiqueta»). */
  fijo?: { rol: RolMaterial; categoria: string | null; tipos: TipoInsumo[] };
  onElegir: (id: string, rol: RolMaterial, categoria: string | null) => void;
  onNuevo: (a: Alta) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [queEs, setQueEs] = useState('');
  if (!abierto)
    return (
      <Button
        variant="subtle"
        size="sm"
        leftSection={<IconPlus size={16} />}
        onClick={() => setAbierto(true)}
        style={{ alignSelf: 'flex-start' }}
      >
        {texto}
      </Button>
    );
  const conocido = QUE_ES.find(
    (q) => q.valor.toLowerCase() === queEs.trim().toLowerCase(),
  );
  const destino = fijo ?? {
    rol: conocido?.rol ?? 'EXTRA',
    categoria: queEs.trim() || null,
    tipos: conocido?.tipos ?? TIPOS_EXTRA,
  };
  const listo = Boolean(fijo) || queEs.trim().length > 0;
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{ borderColor: 'var(--superficie-borde)' }}
    >
      <Stack gap="xs">
        {fijo ? null : (
          <Autocomplete
            label="¿Qué es?"
            placeholder="Guarnición, tapa, otra etiqueta…"
            data={QUE_ES.map((q) => q.valor)}
            value={queEs}
            onChange={setQueEs}
            size="md"
          />
        )}
        {listo ? (
          <ElegirInsumo
            tipos={destino.tipos}
            placeholder="Buscá el insumo"
            onElegir={(id) => {
              onElegir(id, destino.rol, destino.categoria);
              setAbierto(false);
              setQueEs('');
            }}
            onNuevo={(nombre) => {
              onNuevo({
                rol: destino.rol,
                tipo: destino.rol === 'ETIQUETA' ? 'ETIQUETA' : 'MATERIAL_ENVASE',
                nombre,
                categoria: destino.categoria,
              });
              setAbierto(false);
            }}
          />
        ) : null}
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          onClick={() => setAbierto(false)}
          style={{ alignSelf: 'flex-start' }}
        >
          Cancelar
        </Button>
      </Stack>
    </Paper>
  );
}

/** Una sección de la derecha: título y lo que va adentro. */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {titulo}
      </Text>
      {children}
    </Stack>
  );
}

/**
 * Tarjeta abierta: a la izquierda el producto; a la derecha, uno debajo del
 * otro, lo que lleva (envase, etiquetas, fórmula y lo demás).
 */
function DetalleProducto({
  t,
  completo,
  onTocar,
  onListo,
}: {
  t: TareaCarga;
  completo: boolean;
  onTocar: (cambio: Partial<TareaCarga>) => void;
  onListo: () => void;
}) {
  const materiales = useMaterialesProducto(t.producto_id);
  const asignar = useAsignarMaterial();
  const sinFormula = useMarcarSinFormula();
  const consultar = useConsultarFormula();
  const reventa = useMarcarReventa();
  const navegar = useNavigate();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [formula, setFormula] = useState(false);

  const filas = materiales.data ?? [];
  const envase = filas.filter((m) => m.rol === 'ENVASE');
  const etiquetas = filas.filter((m) => m.rol === 'ETIQUETA');
  const otros = filas.filter((m) => m.rol === 'EXTRA');
  const sinClasificar = filas.filter((m) => !m.rol);

  const agregar = (insumoId: string, rol: RolMaterial, categoria: string | null) => {
    onTocar(
      rol === 'ENVASE'
        ? { envase_id: insumoId }
        : rol === 'ETIQUETA'
          ? { etiqueta_id: insumoId }
          : {},
    );
    asignar.mutate({ productoId: t.producto_id, insumoId, rol, categoria });
  };
  const fila = (m: MaterialProducto) => (
    <FilaMaterial
      key={m.insumo_id}
      m={m}
      productoId={t.producto_id}
      onClasificar={(rol) => agregar(m.insumo_id, rol, null)}
    />
  );

  return (
    <Grid gutter="xl">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="sm">
          <Title order={3}>{t.nombre}</Title>
          <Text size="sm" c="dimmed" ff="monospace">
            {t.codigo_interno}
          </Text>
          {t.pendientes > 0 ? (
            <Badge variant="light" color="azul" radius="sm" size="lg">
              {numero(t.pendientes)} en pedidos
            </Badge>
          ) : null}
          {completo ? (
            <Button
              size="md"
              color="estadoAprobado"
              leftSection={<IconCheck size={18} />}
              onClick={onListo}
            >
              Listo, ya está completo
            </Button>
          ) : null}
          <Paper
            withBorder
            p="sm"
            radius="md"
            style={{ borderColor: 'var(--superficie-borde)' }}
          >
            <Text size="sm" mb={6}>
              ¿Se compra hecho y se revende? Entonces no lleva envase, etiqueta ni
              fórmula.
            </Text>
            <Button
              variant="default"
              loading={reventa.isPending}
              onClick={() => {
                onTocar({ solo_reventa: true });
                reventa.mutate({ productoId: t.producto_id, reventa: true });
              }}
            >
              No corresponde: es de reventa
            </Button>
          </Paper>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 8 }}>
        {materiales.isLoading ? (
          <Skeleton h={160} />
        ) : (
          <Stack gap="lg">
            {sinClasificar.length > 0 ? (
              <Seccion titulo="Cargado antes">{sinClasificar.map(fila)}</Seccion>
            ) : null}

            <Seccion titulo="Envase">
              {envase.map(fila)}
              {envase.length === 0 ? (
                <Agregar
                  texto="Elegir el envase"
                  fijo={{ rol: 'ENVASE', categoria: null, tipos: ['MATERIAL_ENVASE'] }}
                  onElegir={agregar}
                  onNuevo={setAlta}
                />
              ) : null}
            </Seccion>

            <Seccion titulo="Etiquetas">
              {etiquetas.map(fila)}
              <Agregar
                texto={
                  etiquetas.length === 0 ? 'Elegir la etiqueta' : 'Agregar otra etiqueta'
                }
                fijo={{
                  rol: 'ETIQUETA',
                  categoria: etiquetas.length === 0 ? null : 'Otra etiqueta',
                  tipos: ['ETIQUETA'],
                }}
                onElegir={agregar}
                onNuevo={setAlta}
              />
            </Seccion>

            <Seccion titulo="Fórmula">
              <Paper
                withBorder
                p="sm"
                radius="md"
                style={{ borderColor: 'var(--superficie-borde)' }}
              >
                {t.tiene_formula ? (
                  <Stack gap="xs">
                    <Text size="sm">Cargada.</Text>
                    <CostosFormula productoId={t.producto_id} />
                  </Stack>
                ) : t.sin_formula ? (
                  <Group gap="xs">
                    <Text size="sm">No lleva fórmula.</Text>
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      onClick={() =>
                        sinFormula.mutate({
                          productoId: t.producto_id,
                          sinFormula: false,
                        })
                      }
                    >
                      Deshacer
                    </Button>
                  </Group>
                ) : t.formula_consultada ? (
                  <Text size="sm">
                    La carga Dirección Técnica (Fórmulas › Pendientes).
                  </Text>
                ) : (
                  <Group gap="xs">
                    <Button size="md" variant="light" onClick={() => setFormula(true)}>
                      Cargar fórmula
                    </Button>
                    <Button
                      size="md"
                      variant="default"
                      loading={consultar.isPending}
                      onClick={() => {
                        onTocar({ formula_consultada: true });
                        consultar.mutate(t.producto_id);
                      }}
                    >
                      No la sé
                    </Button>
                    <Button
                      size="md"
                      variant="default"
                      loading={sinFormula.isPending}
                      onClick={() => {
                        onTocar({ sin_formula: true });
                        sinFormula.mutate({
                          productoId: t.producto_id,
                          sinFormula: true,
                        });
                      }}
                    >
                      No lleva
                    </Button>
                  </Group>
                )}
              </Paper>
            </Seccion>

            <Seccion titulo="Además lleva">
              {otros.map(fila)}
              <Agregar texto="Agregar" onElegir={agregar} onNuevo={setAlta} />
            </Seccion>

            <Seccion titulo="Tiempo de envasado (opcional)">
              <TiempoEnvasado
                productoId={t.producto_id}
                cantidadSugerida={t.pendientes}
              />
            </Seccion>
          </Stack>
        )}
      </Grid.Col>

      <Modal
        opened={alta !== null}
        onClose={() => setAlta(null)}
        title={<Text fw={700}>Nuevo insumo</Text>}
        size="lg"
      >
        {alta ? (
          <FormularioInsumo
            nombreInicial={alta.nombre}
            tipoInicial={alta.tipo}
            onListo={(creado) => {
              if (creado) agregar(creado.id, alta.rol, alta.categoria);
              setAlta(null);
            }}
          />
        ) : null}
      </Modal>
      <Modal
        opened={formula}
        onClose={() => setFormula(false)}
        title={<Text fw={700}>Nueva fórmula de {t.nombre}</Text>}
        size="lg"
      >
        <FormularioNuevaFormula
          productoInicial={t.producto_id}
          onListo={(id) => {
            setFormula(false);
            void navegar(`/formulas/${id}`);
          }}
        />
      </Modal>
    </Grid>
  );
}

/** Señal de la tarjeta cerrada: tiene o le falta. */
function Senal({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <Badge
      variant={ok ? 'light' : 'outline'}
      color={ok ? 'estadoAprobado' : 'gray'}
      radius="sm"
      leftSection={ok ? <IconCheck size={12} /> : null}
    >
      {texto}
    </Badge>
  );
}

/**
 * Lo que el sistema no sabe de cada producto: qué envase y qué etiquetas
 * lleva (el envase etiquetado), qué fórmula y qué más (D-etiquetado-1 y -2).
 * Tarjetas que se abren; los que están en pedidos, primero.
 */
export function TareasCarga() {
  const tareas = useTareasCarga();
  const [busqueda, setBusqueda] = useState('');
  const [cuantos, setCuantos] = useState(10);
  const [abierta, setAbierta] = useState<string | null>(null);
  /* Lo que tocó en esta sesión: si se completa y sale de la vista, queda a
     mano para cargar costos hasta que toque «Listo». */
  const [tocados, setTocados] = useState<Map<string, TareaCarga>>(new Map());
  const q = busqueda.trim().toLowerCase();
  const pendientes = tareas.data ?? [];
  const ids = new Set(pendientes.map((t) => t.producto_id));
  const completos = [...tocados.values()].filter(
    (t) => !ids.has(t.producto_id) && !t.solo_reventa,
  );
  const filas = [...completos, ...pendientes].filter(
    (t) =>
      !q ||
      t.nombre.toLowerCase().includes(q) ||
      t.codigo_interno.toLowerCase().includes(q),
  );
  const tocar = (t: TareaCarga) => (cambio: Partial<TareaCarga>) =>
    setTocados((m) =>
      new Map(m).set(t.producto_id, { ...m.get(t.producto_id), ...t, ...cambio }),
    );
  const soltar = (id: string) => () => {
    setAbierta(null);
    setTocados((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  };

  return (
    <Paper withBorder p="lg" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconChecklist size={22} />
          <Title order={3}>Tareas pendientes de carga</Title>
          {tareas.isSuccess ? (
            <Badge variant="light" radius="sm" size="lg">
              {numero(tareas.data.length)}
            </Badge>
          ) : null}
        </Group>
        <TextInput
          placeholder="Buscar producto"
          leftSection={<IconSearch size={16} />}
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
        />
      </Group>
      {tareas.isLoading ? (
        <Skeleton h={160} />
      ) : filas.length === 0 ? (
        <Text c="dimmed" size="sm">
          {q ? 'Ningún producto pendiente coincide.' : 'No queda nada por cargar.'}
        </Text>
      ) : (
        <Stack gap="md">
          <Accordion
            variant="separated"
            radius="md"
            value={abierta}
            onChange={setAbierta}
          >
            {filas.slice(0, cuantos).map((t) => {
              const completo = !ids.has(t.producto_id);
              return (
                <Accordion.Item key={t.producto_id} value={t.producto_id}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="wrap" gap="sm" pr="sm">
                      <div>
                        <Text fw={700}>{t.nombre}</Text>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {t.codigo_interno}
                          {t.pendientes > 0
                            ? ` · ${numero(t.pendientes)} en pedidos`
                            : ''}
                        </Text>
                      </div>
                      <Group gap={6}>
                        {completo ? (
                          <Badge color="estadoAprobado" radius="sm">
                            Completo
                          </Badge>
                        ) : (
                          <>
                            <Senal ok={Boolean(t.envase_id)} texto="Envase" />
                            <Senal ok={Boolean(t.etiqueta_id)} texto="Etiqueta" />
                            <Senal
                              ok={
                                t.tiene_formula || t.sin_formula || t.formula_consultada
                              }
                              texto={t.formula_consultada ? 'Fórmula: DT' : 'Fórmula'}
                            />
                          </>
                        )}
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {abierta === t.producto_id ? (
                      <DetalleProducto
                        t={t}
                        completo={completo}
                        onTocar={tocar(t)}
                        onListo={soltar(t.producto_id)}
                      />
                    ) : null}
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
          {filas.length > cuantos ? (
            <Button variant="subtle" onClick={() => setCuantos((n) => n + 10)}>
              Ver más ({numero(filas.length - cuantos)} pendientes)
            </Button>
          ) : null}
        </Stack>
      )}
    </Paper>
  );
}
