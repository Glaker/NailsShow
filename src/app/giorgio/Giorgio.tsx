import { useRef, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { SUBRUTAS } from './catalogo';
import { preguntar, type Evento, type Turno } from './cliente';

interface Mensaje extends Turno {
  botones: { ruta: string; etiqueta: string }[];
  aviso?: string;
}

/** El id de la página de detalle abierta, si hay: contexto para Giorgio. */
function idsDe(pathname: string): Record<string, string> {
  for (const s of SUBRUTAS) {
    const m = matchPath(s.patron, pathname);
    if (m?.params.id) return { id: m.params.id };
  }
  return {};
}

/**
 * Giorgio, versión mínima de la fase 1 (D-57): para probar la función de
 * punta a punta. El elemento flotante definitivo es la fase 2.
 * El historial vive solo en memoria: se pierde al recargar.
 */
export function Giorgio() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  const esMovil = useMediaQuery('(max-width: 62em)');
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(false);
  const corte = useRef<AbortController | null>(null);

  const enviar = async () => {
    const pregunta = texto.trim();
    if (!pregunta || cargando) return;
    const historial: Turno[] = [
      ...mensajes.filter((m) => m.texto).map(({ rol, texto: t }) => ({ rol, texto: t })),
      { rol: 'usuario', texto: pregunta },
    ];
    setTexto('');
    setMensajes((ms) => [
      ...ms,
      { rol: 'usuario', texto: pregunta, botones: [] },
      { rol: 'giorgio', texto: '', botones: [] },
    ]);
    setCargando(true);
    corte.current = new AbortController();
    // Cada evento modifica la última burbuja, la de Giorgio.
    const alEvento = (e: Evento) =>
      setMensajes((ms) => {
        const u = { ...ms[ms.length - 1]! };
        if (e.t === 'texto') u.texto += e.v;
        else if (e.t === 'boton') u.botones = [...u.botones, e];
        else if (e.t === 'aviso') u.aviso = e.v;
        return [...ms.slice(0, -1), u];
      });
    await preguntar(
      historial,
      pathname + search,
      idsDe(pathname),
      alEvento,
      corte.current.signal,
    );
    setCargando(false);
  };

  return (
    <Popover
      opened={abierto}
      onChange={setAbierto}
      position="top-end"
      width={360}
      shadow="md"
      trapFocus
    >
      <Popover.Target>
        <ActionIcon
          size={48}
          radius="xl"
          variant="filled"
          aria-label="Abrir a Giorgio, el asistente de ayuda"
          onClick={() => setAbierto((a) => !a)}
          className="no-imprimir"
          style={{
            position: 'fixed',
            right: 16,
            // En el teléfono, arriba del botón del menú (56 px a 14 px del borde).
            bottom: esMovil ? 'calc(82px + env(safe-area-inset-bottom))' : 16,
            zIndex: 200,
          }}
        >
          <Text fw={700} fz={20} c="white">
            G
          </Text>
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className="no-imprimir">
        <Stack gap="xs">
          <ScrollArea.Autosize mah="45vh">
            <Stack gap="xs">
              {mensajes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Preguntame cómo se usa algo, de dónde sale un número o a dónde ir.
                </Text>
              ) : null}
              {mensajes.map((m, i) => (
                <Box
                  key={i}
                  style={{ alignSelf: m.rol === 'usuario' ? 'flex-end' : 'flex-start' }}
                >
                  {m.texto ? (
                    <Text
                      size="sm"
                      style={{ whiteSpace: 'pre-wrap' }}
                      fw={m.rol === 'usuario' ? 600 : 400}
                    >
                      {m.texto}
                    </Text>
                  ) : null}
                  {m.botones.map((b) => (
                    <Button
                      key={b.ruta}
                      size="sm"
                      variant="light"
                      mt={4}
                      onClick={() => {
                        setAbierto(false);
                        void navegar(b.ruta);
                      }}
                    >
                      Llevame a {b.etiqueta}
                    </Button>
                  ))}
                  {m.aviso ? (
                    <Text size="sm" c="red.8">
                      {m.aviso}
                    </Text>
                  ) : null}
                </Box>
              ))}
              {cargando ? (
                <Loader size="xs" aria-label="Giorgio está escribiendo" />
              ) : null}
            </Stack>
          </ScrollArea.Autosize>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder="Escribí tu pregunta"
            aria-label="Pregunta para Giorgio"
            autosize
            minRows={1}
            maxRows={4}
            maxLength={4000}
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setMensajes([])}
              disabled={cargando}
            >
              Empezar de cero
            </Button>
            {cargando ? (
              <Button size="sm" variant="default" onClick={() => corte.current?.abort()}>
                Detener
              </Button>
            ) : (
              <Button size="sm" onClick={() => void enviar()} disabled={!texto.trim()}>
                Preguntar
              </Button>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Giorgio es una IA y puede equivocarse. No es un registro oficial.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
