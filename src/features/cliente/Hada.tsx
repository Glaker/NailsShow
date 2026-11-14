import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  MAX_MENSAJE_HADA,
  preguntarHada,
  TEXTO_HADA_NO_DISPONIBLE,
  type BorradorHada,
  type RespuestaHada,
  type TurnoHada,
} from '@/lib/consultasHada';
import {
  etiquetaOpcion,
  textoCajas,
  type CajaCliente,
  type ProductoCliente,
} from '@/lib/consultasCliente';
import './hada.css';

/**
 * Hada, la asistente que arma BORRADORES de pedido (P6, docs/disenos/P6-hada.md
 * §1.8). Todo lo que dice el servidor se muestra como texto plano; lo único que
 * pasa de ahí al pedido es el borrador, y recién cuando el cliente toca «Pasar
 * al pedido» (D-hada-4: suma al carrito, no lo reemplaza). El envío sigue
 * siendo el SlideCommit de siempre.
 */

/** Lugares de la app a los que Hada puede mandar: tabla cerrada, el resto se ignora. */
const DESTINOS = {
  ARMAR_PEDIDO: 'Ir a armar el pedido',
  MIS_PEDIDOS: 'Ir a «Mis pedidos»',
  RESUMEN: 'Abrir el resumen del pedido',
  CAJAS_AROMAS: 'Ver las cajas de aromas',
  TUTORIAL: 'Ver cómo se usa',
} as const;
type Destino = keyof typeof DESTINOS;
const claveDestino = (d: string | undefined): Destino | null =>
  (Object.keys(DESTINOS) as Destino[]).find((k) => k === d) ?? null;

type Estado =
  'entrada' | 'reposo' | 'escuchando' | 'pensando' | 'hablando' | 'borrador' | 'error';
const TEXTO_ESTADO: Partial<Record<Estado, string>> = {
  escuchando: 'Te escucho…',
  pensando: 'Armando tu pedido…',
};

/** La entrada se anima solo la primera vez que se abre el panel en la sesión. */
let yaSaludo = false;

/** Estrellita de CSS: el destello de todos los estados. */
const Chispa = ({ style }: { style?: React.CSSProperties }) => (
  <span className="hada-chispa" aria-hidden="true" style={style} />
);

function Avatar({ estado }: { estado: Estado }) {
  return (
    <div className="hada-av" data-estado={estado} aria-hidden="true">
      <div className="hada-aura" />
      <div className="hada-cuerpo">
        <div className="hada-foto" />
      </div>
      {estado === 'pensando'
        ? [0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="hada-orbita"
              style={{ '--i': i } as React.CSSProperties}
            >
              <Chispa />
            </span>
          ))
        : null}
      {estado === 'reposo' ? (
        <Chispa style={{ position: 'absolute', top: 6, right: 14 }} />
      ) : null}
    </div>
  );
}

function Detalle({
  borrador,
  productos,
  catalogo,
}: {
  borrador: BorradorHada;
  productos: ProductoCliente[];
  catalogo: CajaCliente[];
}) {
  const porId = new Map(productos.map((p) => [p.producto_id, p.producto]));
  const porCaja = new Map(catalogo.map((c) => [c.caja_id, c.nombre]));
  return (
    <Stack gap={4}>
      {borrador.cajas.map((c) => (
        <Text key={`${c.caja_id}|${c.opcion}`} size="sm" lh={1.3}>
          <b>{textoCajas(c.opcion, c.cajas)}</b> de {porCaja.get(c.caja_id)} ·{' '}
          {etiquetaOpcion(c.opcion)}
        </Text>
      ))}
      {borrador.renglones.map((r) => (
        <Text key={r.producto_id} size="sm" lh={1.3}>
          <b>{r.cantidad}</b> × {porId.get(r.producto_id)}
        </Text>
      ))}
    </Stack>
  );
}

export function Hada({
  productos,
  catalogo,
  onPasar,
  irA,
}: {
  productos: ProductoCliente[];
  catalogo: CajaCliente[];
  /** Suma el borrador al carrito (no lo reemplaza). */
  onPasar: (b: BorradorHada) => void;
  irA: Record<Destino, () => void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<TurnoHada[]>([]);
  const [ultima, setUltima] = useState<{ mensaje: string; r: RespuestaHada } | null>(
    null,
  );
  const [reaccion, setReaccion] = useState<'hablando' | 'borrador' | 'error' | null>(
    null,
  );
  const [entrando, setEntrando] = useState(false);
  const [oculta, setOculta] = useState(false);
  const tiempo = useRef<ReturnType<typeof setTimeout>>();

  // Con la pestaña oculta las animaciones se pausan (hada.css, [data-pausa]).
  useEffect(() => {
    const a = () => setOculta(document.hidden);
    document.addEventListener('visibilitychange', a);
    return () => document.removeEventListener('visibilitychange', a);
  }, []);
  useEffect(() => () => clearTimeout(tiempo.current), []);

  const reaccionar = (r: NonNullable<typeof reaccion>, ms: number) => {
    clearTimeout(tiempo.current);
    setReaccion(r);
    tiempo.current = setTimeout(() => setReaccion(null), ms);
  };

  const consulta = useMutation({
    mutationFn: ({ mensaje, h }: { mensaje: string; h: TurnoHada[] }) =>
      preguntarHada(mensaje, h),
    onSuccess: (r, { mensaje }) => {
      setUltima({ mensaje, r });
      // Solo una pregunta de Hada abre conversación: el servidor corta con 2 turnos
      // suyos, así que un aviso, una ubicación o un borrador empiezan de cero.
      setHistorial((h) =>
        r.tipo === 'pregunta'
          ? [
              ...h,
              { rol: 'cliente' as const, texto: mensaje },
              { rol: 'hada' as const, texto: r.textos.join(' ').slice(0, 500) },
            ].slice(-6)
          : [],
      );
      if (r.tipo === 'borrador' && r.borrador) reaccionar('borrador', 1000);
      else if (r.tipo === 'aviso' || r.rechazados?.length) reaccionar('error', 900);
      else reaccionar('hablando', 700);
    },
    onError: (_e, { mensaje }) => {
      setUltima({ mensaje, r: { tipo: 'aviso', textos: [TEXTO_HADA_NO_DISPONIBLE] } });
      reaccionar('error', 900);
    },
  });

  const abrir = () => {
    if (!yaSaludo) {
      yaSaludo = true;
      setEntrando(true);
      setTimeout(() => setEntrando(false), 700);
    }
    setAbierto(true);
  };
  const cerrar = () => {
    clearTimeout(tiempo.current);
    setReaccion(null);
    setAbierto(false);
  };

  const estado: Estado = consulta.isPending
    ? 'pensando'
    : (reaccion ?? (entrando ? 'entrada' : texto ? 'escuchando' : 'reposo'));

  const enviar = () => {
    const mensaje = texto.trim();
    if (!mensaje || consulta.isPending) return;
    setTexto('');
    consulta.mutate({ mensaje, h: historial });
  };

  // Solo se ofrece lo que se puede nombrar con la lista ya cargada: nada se pasa a ciegas.
  const borrador = useMemo<BorradorHada | null>(() => {
    const b = ultima?.r.borrador;
    if (!b) return null;
    const ids = new Set(productos.map((p) => p.producto_id));
    const cajas = new Set(catalogo.map((c) => c.caja_id));
    const v = {
      renglones: b.renglones.filter((r) => ids.has(r.producto_id)),
      cajas: b.cajas.filter((c) => cajas.has(c.caja_id)),
    };
    return v.renglones.length + v.cajas.length > 0 ? v : null;
  }, [ultima, productos, catalogo]);

  const destino = claveDestino(ultima?.r.destino);

  return (
    <>
      <UnstyledButton className="hada-entrada" onClick={abrir}>
        <span className="hada-mini" aria-hidden="true" />
        <Text fw={700} lh={1.25}>
          Hacele tu pedido a la Hada de Nail Show
        </Text>
      </UnstyledButton>

      <Drawer
        opened={abierto}
        onClose={cerrar}
        position="bottom"
        size="90%"
        radius="xl"
        className="cli-portal"
        title={
          <Text fw={800} size="lg">
            Hada de Nail Show
          </Text>
        }
      >
        <Stack
          gap="md"
          pb="xl"
          className="hada-panel"
          data-pausa={oculta ? '' : undefined}
        >
          <Avatar estado={estado} />
          <Text size="sm" c="dimmed" ta="center" role="status" mih={20}>
            {TEXTO_ESTADO[estado] ?? ''}
          </Text>

          {ultima ? (
            <Stack gap={8}>
              <Text size="sm" c="dimmed" ta="right" style={{ overflowWrap: 'anywhere' }}>
                {ultima.mensaje}
              </Text>
              <div className="hada-burbuja" key={historial.length}>
                {ultima.r.textos.map((t, i) => (
                  <Text key={i} style={{ overflowWrap: 'anywhere' }}>
                    {t}
                  </Text>
                ))}
              </div>
              {ultima.r.rechazados?.map((x, i) => (
                <Text key={i} size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {x.texto}
                </Text>
              ))}
              {destino ? (
                <Button
                  variant="light"
                  color="grape"
                  radius="xl"
                  onClick={() => {
                    cerrar();
                    irA[destino]();
                  }}
                >
                  {DESTINOS[destino]}
                </Button>
              ) : null}
              {borrador ? (
                <Box className="hada-borrador" p="md">
                  <Text fw={800} mb={6}>
                    Revisá tu pedido antes de confirmar
                  </Text>
                  <Detalle
                    borrador={borrador}
                    productos={productos}
                    catalogo={catalogo}
                  />
                  <Button
                    fullWidth
                    mt="md"
                    size="lg"
                    radius="xl"
                    color="grape"
                    onClick={() => {
                      onPasar(borrador);
                      setUltima(null);
                      setHistorial([]);
                      cerrar();
                    }}
                  >
                    Pasar al pedido
                  </Button>
                  {reaccion === 'borrador'
                    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                        <span
                          key={i}
                          className="hada-lluvia"
                          aria-hidden="true"
                          style={{ '--i': i } as React.CSSProperties}
                        />
                      ))
                    : null}
                </Box>
              ) : null}
            </Stack>
          ) : (
            <Text ta="center" c="dimmed" size="sm">
              Contame qué querés pedir, por ejemplo «5 cajas de crema humectante».
            </Text>
          )}

          <Textarea
            aria-label="Contale a Hada qué querés pedir"
            placeholder="Escribí qué querés pedir"
            autosize
            minRows={2}
            maxRows={5}
            maxLength={MAX_MENSAJE_HADA}
            size="md"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            description={`${texto.length}/${MAX_MENSAJE_HADA}`}
            styles={{ description: { textAlign: 'right' } }}
          />
          <Button
            size="lg"
            radius="xl"
            color="grape"
            leftSection={<IconSend size={20} />}
            disabled={!texto.trim()}
            loading={consulta.isPending}
            onClick={enviar}
          >
            Enviar
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
