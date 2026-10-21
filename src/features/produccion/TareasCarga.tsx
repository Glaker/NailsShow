import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
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
import { IconChecklist, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { useInsumos, type Insumo } from '@/lib/consultas';
import {
  UNIDADES_COSTO,
  useCargarCostoEstimado,
  useCostosReferencia,
} from '@/lib/consultasCostos';
import { ORIGEN_PRECIO } from '@/features/costos/comun';
import {
  useAsignarMaterial,
  useExtrasDeProducto,
  useInsumosDeFormula,
  useMarcarSinFormula,
  useQuitarExtra,
  useTareasCarga,
  type RolMaterial,
  type TareaCarga,
} from '@/lib/consultasEtiquetado';
import { FormularioInsumo } from '@/features/maestros/PaginaInsumos';
import { FormularioNuevaFormula } from './PaginaFormulas';
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
  sangria = 88,
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
        <Button size="compact-sm" variant="subtle" onClick={() => setAbierto(true)}>
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
      <Group pl={88}>
        <Button size="compact-sm" variant="subtle" onClick={() => setVer(true)}>
          Costos de la fórmula a granel (opcional)
        </Button>
      </Group>
    );
  if (insumos.isLoading) return <Skeleton h={40} ml={88} />;
  const filas = insumos.data ?? [];
  if (filas.length === 0)
    return (
      <Text size="xs" c="dimmed" pl={88}>
        La fórmula todavía no tiene materias primas cargadas.
      </Text>
    );
  return (
    <Stack gap={6}>
      {filas.map((c) => (
        <Stack key={c.insumo_id} gap={2}>
          <Text size="sm" pl={88}>
            {c.insumo?.codigo_interno} — {c.insumo?.nombre}
          </Text>
          <CostoAprox insumoId={c.insumo_id} unidad={c.insumo?.unidad_medida ?? null} />
        </Stack>
      ))}
    </Stack>
  );
}

/** Alta de insumo abierta desde un buscador que no lo encontró. */
interface Alta {
  rol: RolMaterial;
  tipo: TipoInsumo;
  nombre: string;
}

/** Un buscador de insumos del tipo pedido, con «Nuevo» si no está. */
function ElegirInsumo({
  etiqueta,
  tipos,
  valor,
  onElegir,
  onNuevo,
  placeholder,
}: {
  etiqueta: string;
  tipos: TipoInsumo[];
  valor: string | null;
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
    <Group wrap="nowrap" gap="sm" align="center">
      <Text fw={600} w={80}>
        {etiqueta}
      </Text>
      <Select
        flex={1}
        size="md"
        placeholder={placeholder}
        data={opciones}
        value={valor}
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
    </Group>
  );
}

function Extras({
  productoId,
  onNuevo,
}: {
  productoId: string;
  onNuevo: (n: string) => void;
}) {
  const extras = useExtrasDeProducto(productoId);
  const asignar = useAsignarMaterial();
  const quitar = useQuitarExtra();
  return (
    <Stack gap={6}>
      {(extras.data ?? []).map((x) => (
        <Stack key={x.insumo_id} gap={2}>
          <Group gap="xs" pl={88}>
            <Text size="sm">
              {x.insumo?.codigo_interno} — {x.insumo?.nombre}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Quitar extra"
              onClick={() => quitar.mutate({ productoId, insumoId: x.insumo_id })}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
          <CostoAprox insumoId={x.insumo_id} unidad="UNIDAD" />
        </Stack>
      ))}
      <ElegirInsumo
        etiqueta="+ Extra"
        tipos={['MATERIAL_ENVASE', 'MATERIAL_EMPAQUE']}
        valor={null}
        placeholder="Tapa, pincel, caja… (opcional)"
        onElegir={(id) => asignar.mutate({ productoId, insumoId: id, rol: 'EXTRA' })}
        onNuevo={onNuevo}
      />
    </Stack>
  );
}

/** Producto = etiqueta + envase + fórmula + extra, uno debajo del otro. */
function Tarea({
  t,
  completo,
  onTocar,
  onListo,
}: {
  t: TareaCarga;
  /** Ya no le falta nada: queda a la vista para cargar costos hasta «Listo». */
  completo: boolean;
  /** Lo que acaba de cambiar, para que la tarjeta retenida no quede vieja. */
  onTocar: (cambio: Partial<TareaCarga>) => void;
  onListo: () => void;
}) {
  const asignar = useAsignarMaterial();
  const sinFormula = useMarcarSinFormula();
  const navegar = useNavigate();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [formula, setFormula] = useState(false);
  const elegir = (rol: RolMaterial) => (id: string) => {
    onTocar(
      rol === 'ENVASE'
        ? { envase_id: id }
        : rol === 'ETIQUETA'
          ? { etiqueta_id: id }
          : {},
    );
    asignar.mutate({ productoId: t.producto_id, insumoId: id, rol });
  };

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={700}>{t.nombre}</Text>
          <Text size="xs" c="dimmed" ff="monospace">
            {t.codigo_interno}
          </Text>
        </div>
        <Group gap="xs">
          {t.pendientes > 0 ? (
            <Badge variant="light" color="azul" radius="sm">
              {numero(t.pendientes)} en pedidos
            </Badge>
          ) : null}
          {completo ? (
            <>
              <Badge variant="light" color="estadoAprobado" radius="sm">
                Completo
              </Badge>
              <Button size="compact-sm" onClick={onListo}>
                Listo
              </Button>
            </>
          ) : null}
        </Group>
      </Group>
      <Stack gap="sm">
        <ElegirInsumo
          etiqueta="Etiqueta"
          tipos={['ETIQUETA']}
          valor={t.etiqueta_id}
          placeholder="Elegí la etiqueta"
          onElegir={elegir('ETIQUETA')}
          onNuevo={(nombre) => setAlta({ rol: 'ETIQUETA', tipo: 'ETIQUETA', nombre })}
        />
        {t.etiqueta_id ? <CostoAprox insumoId={t.etiqueta_id} unidad="UNIDAD" /> : null}
        <ElegirInsumo
          etiqueta="+ Envase"
          tipos={['MATERIAL_ENVASE']}
          valor={t.envase_id}
          placeholder="Elegí el envase"
          onElegir={elegir('ENVASE')}
          onNuevo={(nombre) =>
            setAlta({ rol: 'ENVASE', tipo: 'MATERIAL_ENVASE', nombre })
          }
        />
        {t.envase_id ? <CostoAprox insumoId={t.envase_id} unidad="UNIDAD" /> : null}
        <Group wrap="nowrap" gap="sm">
          <Text fw={600} w={80}>
            + Fórmula
          </Text>
          {t.tiene_formula ? (
            <Text size="sm" c="dimmed">
              Cargada
            </Text>
          ) : t.sin_formula ? (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                No corresponde
              </Text>
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() =>
                  sinFormula.mutate({ productoId: t.producto_id, sinFormula: false })
                }
              >
                Deshacer
              </Button>
            </Group>
          ) : (
            <Group gap="xs">
              <Button size="md" variant="light" onClick={() => setFormula(true)}>
                Cargar fórmula
              </Button>
              <Button
                size="md"
                variant="default"
                loading={sinFormula.isPending}
                onClick={() => {
                  onTocar({ sin_formula: true });
                  sinFormula.mutate({ productoId: t.producto_id, sinFormula: true });
                }}
              >
                No corresponde
              </Button>
            </Group>
          )}
        </Group>
        {t.tiene_formula ? <CostosFormula productoId={t.producto_id} /> : null}
        <Extras
          productoId={t.producto_id}
          onNuevo={(nombre) => setAlta({ rol: 'EXTRA', tipo: 'MATERIAL_ENVASE', nombre })}
        />
      </Stack>

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
              if (creado)
                asignar.mutate({
                  productoId: t.producto_id,
                  insumoId: creado.id,
                  rol: alta.rol,
                });
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
    </Paper>
  );
}

/**
 * Lo que el sistema no sabe de cada producto: qué etiqueta y qué envase lleva
 * (el envase etiquetado), qué fórmula, o que no lleva (D-etiquetado-1). Los
 * que están en pedidos primero.
 */
export function TareasCarga() {
  const tareas = useTareasCarga();
  const [busqueda, setBusqueda] = useState('');
  const [cuantos, setCuantos] = useState(8);
  /* Lo que tocó en esta sesión: si se completa y sale de la vista, queda a
     mano para cargar costos hasta que toque «Listo». */
  const [tocados, setTocados] = useState<Map<string, TareaCarga>>(new Map());
  const q = busqueda.trim().toLowerCase();
  const pendientes = tareas.data ?? [];
  const ids = new Set(pendientes.map((t) => t.producto_id));
  const completos = [...tocados.values()].filter((t) => !ids.has(t.producto_id));
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
  const soltar = (id: string) => () =>
    setTocados((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });

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
          {filas.slice(0, cuantos).map((t) => (
            <Tarea
              key={t.producto_id}
              t={t}
              completo={!ids.has(t.producto_id)}
              onTocar={tocar(t)}
              onListo={soltar(t.producto_id)}
            />
          ))}
          {filas.length > cuantos ? (
            <Button variant="subtle" onClick={() => setCuantos((n) => n + 8)}>
              Ver más ({numero(filas.length - cuantos)} pendientes)
            </Button>
          ) : null}
        </Stack>
      )}
    </Paper>
  );
}
