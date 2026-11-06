import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import {
  useFormulasFabricacion,
  useProductos,
  type EstadoDocumento,
} from '@/lib/consultas';
import { deContenido } from '@/lib/consultasCostos';
import { useTieneRol } from '@/features/auth/sesion';
import { BadgeEstadoFormula } from './estadoFormula';
import { FormularioNuevaFormula } from './PaginaFormulas';
import './familias.css';

/* «Sin familia» y «variante única» en la URL. */
const SIN_FAMILIA = '~';
const UNICA = '~';

type Prod = ReturnType<typeof useProductos>['data'] extends (infer T)[] | undefined
  ? T
  : never;
type Formula = {
  id: string;
  producto_id: string;
  estado: EstadoDocumento;
  version: string;
};

/** La fórmula que se muestra: la vigente, o el borrador más nuevo. */
function formulaDe(formulas: Formula[], productoId: string) {
  const del = formulas.filter(
    (f) => f.producto_id === productoId && f.estado !== 'DADO_DE_BAJA',
  );
  return del.find((f) => f.estado === 'VIGENTE') ?? del[0];
}

/** Lo que cabe en cada frasco: 240 ml, 1 L, 14 g. */
function contenido(p: Prod) {
  const c = deContenido(
    p.contenido_neto == null ? null : Number(p.contenido_neto),
    p.unidad_contenido,
  );
  if (c.cantidad !== '')
    return `${c.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${c.unidad}`;
  // Sin el dato en la ficha, el del nombre («1L», «200ml.», «14GRM»).
  const m = /(\d+(?:[.,]\d+)?)\s*(ml|cc|lts?|l|grs?|grm|gmr|g|kg)\b/i.exec(p.nombre);
  if (!m?.[2]) return null;
  const u = m[2].toLowerCase();
  const unidad =
    u === 'ml' || u === 'cc' ? 'ml' : u.startsWith('l') ? 'L' : u === 'kg' ? 'kg' : 'g';
  return `${m[1]} ${unidad}`;
}

/** Ordena presentaciones de menor a mayor contenido (las sin dato al final). */
function porContenido(a: Prod, b: Prod) {
  return (
    (a.contenido_neto == null ? Infinity : Number(a.contenido_neto)) -
      (b.contenido_neto == null ? Infinity : Number(b.contenido_neto)) ||
    a.nombre.localeCompare(b.nombre)
  );
}

/* El color de cada cuadrado: por la fragancia o el color del nombre, si se
   reconoce; si no, uno fijo por nombre para que siempre salga el mismo. */
const TONOS: [RegExp, string][] = [
  [/AMOR|FRUTOS ROJOS/i, 'pink'],
  [/PAZ/i, 'violet'],
  [/AIRE/i, 'cyan'],
  [/EXFOLIANTE/i, 'orange'],
  [/HUMECTANTE/i, 'teal'],
  [/SANITIZANTE/i, 'cyan'],
  [/ACEITE/i, 'yellow'],
  [/ESMALTE/i, 'red'],
  [/STARDUST|V[IÍ]A L[AÁ]CTEA/i, 'violet'],
  [/CLARIFICADOR/i, 'blue'],
  [/REMOVEDOR/i, 'grape'],
  [/MON[OÓ]MERO/i, 'indigo'],
  [/MAGENTA|FUCSIA/i, 'grape'],
  [/ROJO|RED/i, 'red'],
  [/ROSA|PINK|COVER/i, 'pink'],
  [/LILA|VIOLETA/i, 'violet'],
  [/AZUL|BLUE/i, 'blue'],
  [/CELESTE/i, 'cyan'],
  [/VERDE|GREEN/i, 'green'],
  [/NARANJA|NUDE|MANGO|COBRE/i, 'orange'],
  [/AMARILLO|SUN|COCO|VAINILLA|DORAD|ORO/i, 'yellow'],
  [/NEGRO/i, 'dark'],
  [/BLANCO|WHITE|CLEAR|SILVER|PLATA/i, 'gray'],
  [/POLVO|ACR[IÍ]LICO/i, 'pink'],
];
const PALETA = ['indigo', 'teal', 'grape', 'orange', 'cyan', 'pink', 'lime', 'violet'];

function tono(nombre: string) {
  const c =
    TONOS.find(([re]) => re.test(nombre))?.[1] ??
    PALETA[[...nombre].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETA.length];
  return `var(--mantine-color-${c}-6)`;
}

function Cuadrado({
  titulo,
  detalle,
  pie,
  color,
  indice,
  onClick,
}: {
  titulo: string;
  detalle: string;
  pie?: React.ReactNode;
  color: string;
  indice: number;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      className="familia-cuadrado"
      style={{ display: 'block' }}
    >
      <Paper
        withBorder
        p="md"
        radius="md"
        className="familia-tarjeta"
        style={{
          '--tono': color,
          '--i': indice,
          borderColor: 'var(--superficie-borde)',
          aspectRatio: '1 / 1',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Title order={4} style={{ overflowWrap: 'anywhere' }}>
          <span className="familia-punto" />
          {titulo}
        </Title>
        <Stack gap={6}>
          <Text size="sm" c="dimmed">
            {detalle}
          </Text>
          {pie}
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

/**
 * Fórmulas por familia de SKU (D-familias-sku-1): familias en cuadrados, al
 * entrar sus fragancias o colores, y en cada una sus presentaciones. Una
 * fórmula por fragancia: al dejarla vigente en una presentación, la base la
 * deja vigente en las demás.
 */
export function FamiliasFormulas() {
  const productos = useProductos();
  const formulas = useFormulasFabricacion();
  const [params, setParams] = useSearchParams();
  const familia = params.get('familia');
  const variante = params.get('variante');
  const ir = (f: string | null, v: string | null = null) =>
    setParams((p) => {
      p.set('vista', 'familias');
      if (f) p.set('familia', f);
      else p.delete('familia');
      if (v) p.set('variante', v);
      else p.delete('variante');
      return p;
    });

  if (productos.isLoading || formulas.isLoading) return <Skeleton h={300} />;
  const todos = (productos.data ?? []).filter((p) => p.activo && !p.solo_reventa);
  const fs = (formulas.data ?? []) as Formula[];
  const conFormula = (ps: Prod[]) =>
    ps.filter((p) => formulaDe(fs, p.id)?.estado === 'VIGENTE').length;

  const migas = (
    <Breadcrumbs mb="md">
      <Anchor onClick={() => ir(null)}>Familias</Anchor>
      {familia ? (
        <Anchor onClick={() => ir(familia)}>
          {familia === SIN_FAMILIA ? 'Sin familia' : familia}
        </Anchor>
      ) : null}
      {familia && variante ? (
        <Text>{variante === UNICA ? 'Única' : variante}</Text>
      ) : null}
    </Breadcrumbs>
  );

  // 1. Familias
  if (!familia) {
    const familias = [...new Set(todos.map((p) => p.familia).filter(Boolean))].sort(
      (a, b) => a!.localeCompare(b!),
    ) as string[];
    const sinFamilia = todos.filter((p) => !p.familia);
    return (
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
        {familias.map((f, i) => {
          const ps = todos.filter((p) => p.familia === f);
          const vs = new Set(ps.map((p) => p.variante ?? ''));
          return (
            <Cuadrado
              key={f}
              titulo={f}
              color={tono(f)}
              indice={i}
              detalle={`${vs.size} ${vs.size === 1 ? 'variante' : 'fragancias o colores'} · ${ps.length} presentaciones`}
              pie={
                <Text size="xs" c="dimmed">
                  {conFormula(ps)} con fórmula vigente
                </Text>
              }
              onClick={() => ir(f)}
            />
          );
        })}
        <Cuadrado
          titulo="Sin familia"
          color="var(--mantine-color-gray-5)"
          indice={familias.length}
          detalle={`${sinFamilia.length} productos`}
          pie={
            <Text size="xs" c="dimmed">
              Se asigna en Catálogos › Productos
            </Text>
          }
          onClick={() => ir(SIN_FAMILIA)}
        />
      </SimpleGrid>
    );
  }

  const deFamilia = todos.filter((p) =>
    familia === SIN_FAMILIA ? !p.familia : p.familia === familia,
  );

  // Sin familia: lista con búsqueda, sin variantes.
  if (familia === SIN_FAMILIA)
    return (
      <>
        {migas}
        <SinFamilia productos={deFamilia} formulas={fs} />
      </>
    );

  // 2. Fragancias o colores (si hay una sola, directo a sus presentaciones)
  const variantes = [...new Set(deFamilia.map((p) => p.variante ?? UNICA))].sort();
  const elegida = variante ?? (variantes.length === 1 ? variantes[0] : null);
  if (!elegida)
    return (
      <>
        {migas}
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {variantes.map((v, i) => {
            const ps = deFamilia.filter((p) => (p.variante ?? UNICA) === v);
            const n = conFormula(ps);
            return (
              <Cuadrado
                key={v}
                titulo={v === UNICA ? 'Única' : v}
                color={tono(v === UNICA ? familia : v)}
                indice={i}
                detalle={ps.map(contenido).filter(Boolean).join(' · ') || `${ps.length}`}
                pie={
                  <Badge
                    variant="light"
                    radius="sm"
                    color={n > 0 ? 'estadoAprobado' : 'gray'}
                  >
                    {n > 0 ? 'Con fórmula' : 'Sin fórmula'}
                  </Badge>
                }
                onClick={() => ir(familia, v)}
              />
            );
          })}
        </SimpleGrid>
      </>
    );

  // 3. Presentaciones
  const ps = deFamilia
    .filter((p) => (p.variante ?? UNICA) === elegida)
    .sort(porContenido);
  return (
    <>
      {migas}
      <Stack gap="md">
        {ps.length > 1 ? (
          <Alert variant="light" color="azul" radius="md">
            Una sola fórmula para las {ps.length} presentaciones: al dejarla vigente en
            una, pasa vigente a las demás. Solo cambian las cantidades del lote.
          </Alert>
        ) : null}
        <Presentaciones productos={ps} formulas={fs} />
      </Stack>
    </>
  );
}

function SinFamilia({ productos, formulas }: { productos: Prod[]; formulas: Formula[] }) {
  const [busca, setBusca] = useState('');
  const t = busca.trim().toLowerCase();
  const ps = productos
    .filter(
      (p) =>
        !t ||
        p.nombre.toLowerCase().includes(t) ||
        p.codigo_interno.toLowerCase().includes(t),
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <Stack gap="md">
      <TextInput
        placeholder="Buscá por nombre o código"
        leftSection={<IconSearch size={16} />}
        value={busca}
        onChange={(e) => setBusca(e.currentTarget.value)}
        maw={420}
      />
      <Presentaciones productos={ps} formulas={formulas} />
    </Stack>
  );
}

function Presentaciones({
  productos,
  formulas,
}: {
  productos: Prod[];
  formulas: Formula[];
}) {
  const puedeCargar = useTieneRol('DIRECCION_TECNICA', 'GERENCIA_PRODUCCION');
  const navegar = useNavigate();
  const [cargando, setCargando] = useState<Prod | null>(null);
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {productos.map((p, i) => {
          const f = formulaDe(formulas, p.id);
          return (
            <Paper
              key={p.id}
              withBorder
              p="md"
              radius="md"
              className="familia-tarjeta"
              style={{
                '--tono': tono(p.variante ?? p.familia ?? p.nombre),
                '--i': i,
                borderColor: 'var(--superficie-borde)',
              }}
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={700}>{contenido(p) ?? 'Sin contenido cargado'}</Text>
                    <Text size="sm">{p.nombre}</Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {p.codigo_interno}
                    </Text>
                  </div>
                  {f ? <BadgeEstadoFormula estado={f.estado} /> : null}
                </Group>
                {f ? (
                  <Button
                    component={Link}
                    to={`/formulas/${f.id}`}
                    variant="light"
                    size="md"
                  >
                    Ver fórmula v{f.version}
                  </Button>
                ) : p.sin_formula ? (
                  <Text size="sm" c="dimmed">
                    No lleva fórmula.
                  </Text>
                ) : puedeCargar ? (
                  <Button variant="default" size="md" onClick={() => setCargando(p)}>
                    Cargar fórmula
                  </Button>
                ) : (
                  <Text size="sm" c="dimmed">
                    Sin fórmula.
                  </Text>
                )}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      <Modal
        opened={cargando !== null}
        onClose={() => setCargando(null)}
        title={<Text fw={700}>Nueva fórmula de {cargando?.nombre}</Text>}
        size="lg"
      >
        {cargando ? (
          <FormularioNuevaFormula
            productoInicial={cargando.id}
            onListo={(id) => {
              setCargando(null);
              void navegar(`/formulas/${id}`);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
