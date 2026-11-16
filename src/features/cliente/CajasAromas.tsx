import { useState, type CSSProperties } from 'react';
import { ActionIcon, Box, Chip, Group, Text } from '@mantine/core';
import { IconBox, IconMinus, IconPlus } from '@tabler/icons-react';
import { numero } from '@/lib/formato';
import { precioFinalUnidad } from '@/lib/consultasVentas';
import {
  OPCIONES_CAJA,
  OPCIONES_MIXTAS,
  claveCaja,
  etiquetaOpcion,
  partirClaveCaja,
  pasoOpcion,
  textoCajas,
  type CajaCliente,
  type CarritoCajas,
  type OpcionCaja,
} from '@/lib/consultasCliente';

const pesos = (n: number) => `$${numero(n, 0)}`;
const PX44 = { '--ai-size': '44px' } as CSSProperties;

/**
 * Una caja de aromas: el cliente elige cómo la quiere (8 opciones, todas siempre
 * visibles) y cuántas. Nada acá depende del stock: no hay dato de stock que usar.
 */
export function TarjetaCaja({
  caja,
  descuento,
  cantidades,
  onCambiar,
}: {
  caja: CajaCliente;
  descuento: number;
  cantidades: CarritoCajas;
  onCambiar: (clave: string, cajas: number) => void;
}) {
  // Al editar, arranca en la opción que ya tiene cajas.
  const [opcion, setOpcion] = useState<OpcionCaja>(() => {
    const k = [...cantidades].find(([k, c]) => c > 0 && k.startsWith(`${caja.caja_id}|`));
    return k ? partirClaveCaja(k[0]).opcion : 'SURTIDO';
  });
  const clave = claveCaja(caja.caja_id, opcion);
  const cajas = cantidades.get(clave) ?? 0;
  const paso = pasoOpcion(opcion);
  const total = [...cantidades].reduce(
    (a, [k, c]) => (k.startsWith(`${caja.caja_id}|`) ? a + c : a),
    0,
  );
  const precioCaja =
    precioFinalUnidad(caja.precio_promo, descuento, caja.porcentaje) * caja.unidades_caja;
  const que = `${paso === 3 ? 'set' : 'caja'} de ${caja.nombre}, ${etiquetaOpcion(opcion)}`;
  return (
    <Box className="cli-tarjeta" data-elegido={total > 0} p="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={700} lh={1.25}>
            {caja.nombre}
          </Text>
          <Group gap={6} mt={2} wrap="nowrap">
            <IconBox size={14} />
            <Text size="xs" c="dimmed">
              Caja de {numero(caja.unidades_caja, 0)} u
            </Text>
          </Group>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Text fw={800} size="lg" lh={1.1}>
            {pesos(precioCaja)}
          </Text>
          <Text size="xs" c="dimmed">
            por caja
          </Text>
        </div>
      </Group>

      <Chip.Group
        multiple={false}
        value={opcion}
        onChange={(v) => setOpcion(v as OpcionCaja)}
      >
        <div className="cli-opciones">
          {OPCIONES_CAJA.map((o) => (
            <Chip
              key={o.valor}
              value={o.valor}
              size="md"
              color="grape"
              variant="light"
              disabled={!caja.mixta && OPCIONES_MIXTAS.includes(o.valor)}
            >
              {o.etiqueta}
            </Chip>
          ))}
        </div>
      </Chip.Group>
      {!caja.mixta ? (
        <Text size="xs" c="dimmed" mt={6}>
          Esta caja no se arma mitad y mitad
        </Text>
      ) : null}

      <Group mt="sm" justify="space-between" gap={8} wrap="wrap">
        <Text fw={700} size="sm">
          {cajas > 0 ? textoCajas(opcion, cajas) : 'Sin agregar'}
        </Text>
        <Group gap={6} wrap="nowrap" ml="auto">
          <ActionIcon
            style={PX44}
            radius="xl"
            variant="light"
            color="gray"
            disabled={cajas === 0}
            onClick={() => onCambiar(clave, cajas - paso)}
            aria-label={`Menos: ${que}`}
          >
            <IconMinus size={22} />
          </ActionIcon>
          <ActionIcon
            style={PX44}
            radius="xl"
            color="grape"
            onClick={() => onCambiar(clave, cajas + paso)}
            aria-label={`Más: ${que}`}
          >
            <IconPlus size={22} />
          </ActionIcon>
        </Group>
      </Group>
    </Box>
  );
}
