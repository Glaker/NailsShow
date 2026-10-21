import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
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
  useAsignarMaterial,
  useExtrasDeProducto,
  useMarcarSinFormula,
  useQuitarExtra,
  useTareasCarga,
  type RolMaterial,
  type TareaCarga,
} from '@/lib/consultasEtiquetado';
import { FormularioInsumo } from '@/features/maestros/PaginaInsumos';
import { FormularioNuevaFormula } from './PaginaFormulas';
import { numero } from '@/lib/formato';

type TipoInsumo = Insumo['tipo'];

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
        <Group key={x.insumo_id} gap="xs" pl={88}>
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
function Tarea({ t }: { t: TareaCarga }) {
  const asignar = useAsignarMaterial();
  const sinFormula = useMarcarSinFormula();
  const navegar = useNavigate();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [formula, setFormula] = useState(false);
  const elegir = (rol: RolMaterial) => (id: string) =>
    asignar.mutate({ productoId: t.producto_id, insumoId: id, rol });

  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--superficie-borde)' }}>
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={700}>{t.nombre}</Text>
          <Text size="xs" c="dimmed" ff="monospace">
            {t.codigo_interno}
          </Text>
        </div>
        {t.pendientes > 0 ? (
          <Badge variant="light" color="azul" radius="sm">
            {numero(t.pendientes)} en pedidos
          </Badge>
        ) : null}
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
                onClick={() =>
                  sinFormula.mutate({ productoId: t.producto_id, sinFormula: true })
                }
              >
                No corresponde
              </Button>
            </Group>
          )}
        </Group>
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
  const q = busqueda.trim().toLowerCase();
  const filas = (tareas.data ?? []).filter(
    (t) =>
      !q ||
      t.nombre.toLowerCase().includes(q) ||
      t.codigo_interno.toLowerCase().includes(q),
  );

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
            <Tarea key={t.producto_id} t={t} />
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
