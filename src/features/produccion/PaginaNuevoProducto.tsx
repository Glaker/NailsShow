import { useSearchParams, Link } from 'react-router-dom';
import {
  Accordion,
  Anchor,
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { EncabezadoPagina } from '@/components/EncabezadoPagina';
import { FormularioProducto } from '@/features/maestros/PaginaProductos';
import { useFormulasFabricacion, useProcedimientos, useProductos } from '@/lib/consultas';
import { useMaterialesProducto } from '@/lib/consultasEtiquetado';
import { useEspecificaciones } from '@/lib/consultasOrdenes';
import { tiempoDe, type ProductoConTiempo } from '@/lib/envasado';
import { FormularioNuevaFormula } from './PaginaFormulas';
import { PaginaFormula } from './PaginaFormula';
import { PanelProcedimiento } from './PanelProcedimiento';
import { CabeceraEspecificacion, FichaEspecificacion } from './PaginaEspecificaciones';
import { CostosFormula, MaterialesProducto } from './TareasCarga';
import { TiempoEnvasado } from './TiempoEnvasado';

type Estado = 'listo' | 'falta' | 'opcional' | 'espera';

const BADGE: Record<Estado, { color: string; texto: string }> = {
  listo: { color: 'estadoAprobado', texto: 'Completo' },
  falta: { color: 'orange', texto: 'Falta' },
  opcional: { color: 'gray', texto: 'Opcional' },
  espera: { color: 'gray', texto: 'Primero el producto' },
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

/**
 * Nuevo producto (pedido del codirector técnico del 2026-10-22): todo lo que
 * hace falta para fabricarlo, en secciones a completar. Cada sección es la
 * pantalla de siempre (fórmula, materiales, procedimiento, especificación,
 * costos y tiempos): acá solo se juntan, atadas al mismo producto. El
 * producto va en la URL, así que se puede dejar a medias y seguir después.
 */
export function PaginaNuevoProducto() {
  const [params, setParams] = useSearchParams();
  const productoId = params.get('producto');
  const elegir = (id: string | null) => setParams(id ? { producto: id } : {});

  const productos = useProductos();
  const formulas = useFormulasFabricacion();
  const especificaciones = useEspecificaciones();
  const materiales = useMaterialesProducto(productoId ?? '', Boolean(productoId));

  const producto = (productos.data ?? []).find((p) => p.id === productoId);
  // La más nueva que no esté dada de baja (las vigentes vienen primero).
  const formula = (formulas.data ?? []).find(
    (f) => f.producto_id === productoId && f.estado !== 'DADO_DE_BAJA',
  );
  const procedimientos = useProcedimientos(formula?.id);
  const espec = (especificaciones.data ?? []).find((e) => e.producto_id === productoId);
  const mats = materiales.data ?? [];

  const hay = Boolean(productoId);
  const estado = (ok: boolean, opcional = false): Estado =>
    !hay ? 'espera' : ok ? 'listo' : opcional ? 'opcional' : 'falta';

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo producto"
        descripcion="Fórmula, insumos, procedimiento y especificación de un producto nuevo; costos y tiempos si ya los sabés. Cada sección se guarda sola."
      />

      <Accordion multiple defaultValue={['producto']} variant="separated" radius="md">
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
                <Titulo n={2} texto="Fórmula" estado={estado(Boolean(formula))} />
              </Accordion.Control>
              <Accordion.Panel>
                {formula ? (
                  <PaginaFormula formulaId={formula.id} />
                ) : (
                  <FormularioNuevaFormula
                    productoInicial={productoId}
                    onListo={() => {}}
                  />
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
                  estado={estado((procedimientos.data ?? []).length > 0)}
                />
              </Accordion.Control>
              <Accordion.Panel>
                {formula ? (
                  <PanelProcedimiento formulaId={formula.id} />
                ) : (
                  <Text size="sm" c="dimmed">
                    El procedimiento va con la fórmula: creala primero (sección 2).
                  </Text>
                )}
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="especificacion">
              <Accordion.Control>
                <Titulo n={5} texto="Especificación" estado={estado(Boolean(espec))} />
              </Accordion.Control>
              <Accordion.Panel>
                {espec ? (
                  <FichaEspecificacion id={espec.id} onCambiarId={() => {}} />
                ) : (
                  <CabeceraEspecificacion productoId={productoId} onListo={() => {}} />
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
                  estado={
                    tiempoDe(producto as ProductoConTiempo | undefined)
                      ? 'listo'
                      : 'opcional'
                  }
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
