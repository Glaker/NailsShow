import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { ActionIcon, Button, Group, Loader, Popover, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowUp,
  IconPlayerStopFilled,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { sugerenciasDe } from '@/app/ayuda/sugerencias';
import { SUBRUTAS } from './catalogo';
import { preguntar, type Evento, type Turno } from './cliente';

interface Mensaje extends Turno {
  id: number;
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
 * Giorgio, el asistente de ayuda (D-57). Un círculo con una «G» abajo a la
 * derecha: al pasar el mouse, tocarlo o llegar con Tab se agranda y despliega
 * el campo; al escribir o tocar el campo se abre la conversación arriba. Esc
 * cierra la conversación y, con el campo vacío, el campo. El historial vive
 * solo en memoria: se pierde al recargar. No se imprime (`no-imprimir`).
 */
export function Giorgio() {
  const { pathname, search } = useLocation();
  const navegar = useNavigate();
  const esMovil = useMediaQuery('(max-width: 62em)');
  const [panel, setPanel] = useState(false);
  const [encima, setEncima] = useState(false);
  const [foco, setFoco] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(false);
  const corte = useRef<AbortController | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const proximo = useRef(0);
  const idPanel = useId();

  const expandido = encima || foco || panel || texto !== '';
  const sugerencias = sugerenciasDe(pathname, search);

  // La conversación se mantiene a la vista del último renglón mientras llega.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);

  const enviar = async (pregunta: string) => {
    pregunta = pregunta.trim();
    if (!pregunta || cargando) return;
    const historial: Turno[] = [
      ...mensajes.filter((m) => m.texto).map(({ rol, texto: t }) => ({ rol, texto: t })),
      { rol: 'usuario', texto: pregunta },
    ];
    setTexto('');
    setPanel(true);
    setMensajes((ms) => [
      ...ms,
      { id: proximo.current++, rol: 'usuario', texto: pregunta, botones: [] },
      { id: proximo.current++, rol: 'giorgio', texto: '', botones: [] },
    ]);
    setCargando(true);
    corte.current = new AbortController();
    // Cada evento completa la última burbuja, la de Giorgio.
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

  const escape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (panel) {
      setPanel(false);
      campo.current?.focus();
    } else {
      campo.current?.blur();
    }
  };

  const salirDelFoco = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFoco(false);
  };

  return (
    <Popover
      opened={panel}
      onChange={setPanel}
      position="top-end"
      offset={10}
      width={380}
      shadow="md"
      radius="lg"
      closeOnEscape={false}
      trapFocus={false}
      returnFocus={false}
      zIndex={201}
    >
      <Popover.Target>
        <div
          className="giorgio no-imprimir"
          data-abierto={expandido}
          onMouseEnter={() => setEncima(true)}
          onMouseLeave={() => setEncima(false)}
          onFocus={() => setFoco(true)}
          onBlur={salirDelFoco}
          style={{
            // En el teléfono, arriba del botón del menú (56 px a 14 px del borde).
            bottom: esMovil ? 'calc(82px + env(safe-area-inset-bottom))' : 16,
          }}
        >
          <button
            type="button"
            className="giorgio-marca"
            aria-label="Giorgio, asistente de ayuda"
            aria-expanded={panel}
            aria-controls={idPanel}
            onClick={() => {
              if (panel) setPanel(false);
              else campo.current?.focus();
            }}
          >
            G
          </button>
          <input
            ref={campo}
            className="giorgio-campo"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onFocus={() => setPanel(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enviar(texto);
              escape(e);
            }}
            placeholder="Preguntame cómo usar algo o a dónde ir"
            aria-label="Pregunta para Giorgio"
            tabIndex={expandido ? 0 : -1}
            maxLength={4000}
            enterKeyHint="send"
          />
          {cargando ? (
            <ActionIcon
              className="giorgio-accion"
              size={40}
              radius="xl"
              variant="default"
              aria-label="Detener la respuesta"
              onClick={() => corte.current?.abort()}
            >
              <IconPlayerStopFilled size={18} />
            </ActionIcon>
          ) : texto.trim() ? (
            <ActionIcon
              className="giorgio-accion"
              size={40}
              radius="xl"
              aria-label="Preguntar"
              onClick={() => void enviar(texto)}
            >
              <IconArrowUp size={20} />
            </ActionIcon>
          ) : null}
        </div>
      </Popover.Target>

      <Popover.Dropdown
        id={idPanel}
        className="no-imprimir"
        onKeyDown={escape}
        p={0}
        style={{ maxWidth: 'calc(100vw - 32px)' }}
      >
        <Group justify="space-between" px="md" pt="sm" pb={6} wrap="nowrap">
          <Text fw={650}>Giorgio</Text>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              size={40}
              aria-label="Empezar de cero"
              title="Empezar de cero"
              disabled={cargando || mensajes.length === 0}
              onClick={() => setMensajes([])}
            >
              <IconRefresh size={20} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              size={40}
              aria-label="Cerrar la conversación"
              onClick={() => setPanel(false)}
            >
              <IconX size={20} />
            </ActionIcon>
          </Group>
        </Group>

        <div
          ref={lista}
          role="log"
          aria-live="polite"
          aria-label="Conversación con Giorgio"
          style={{
            maxHeight: 'calc(60vh - 110px)',
            overflowY: 'auto',
            padding: '4px 16px 8px',
          }}
        >
          {mensajes.length === 0 ? (
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                Preguntame cómo se usa algo, de dónde sale un número o a dónde ir.
              </Text>
              {sugerencias.map((s) => (
                <Button
                  key={s}
                  variant="light"
                  size="sm"
                  justify="flex-start"
                  styles={{ label: { whiteSpace: 'normal', textAlign: 'left' } }}
                  h="auto"
                  py={8}
                  onClick={() => void enviar(s)}
                >
                  {s}
                </Button>
              ))}
            </Stack>
          ) : (
            <Stack gap="sm">
              {mensajes.map((m) =>
                m.rol === 'usuario' ? (
                  <Text key={m.id} size="sm" fw={600} className="giorgio-pregunta">
                    {m.texto}
                  </Text>
                ) : (
                  <Stack key={m.id} gap={6}>
                    {m.texto ? (
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {m.texto}
                      </Text>
                    ) : cargando && !m.aviso ? (
                      <Group gap={8} c="dimmed">
                        <Loader size="xs" type="dots" />
                        <Text size="sm" c="dimmed">
                          Giorgio está escribiendo…
                        </Text>
                      </Group>
                    ) : null}
                    {m.botones.map((b) => (
                      <Button
                        key={b.ruta}
                        size="sm"
                        variant="light"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => {
                          setPanel(false);
                          void navegar(b.ruta);
                        }}
                      >
                        Llevame a {b.etiqueta}
                      </Button>
                    ))}
                    {m.aviso ? (
                      <Text size="sm" c="orange.8">
                        {m.aviso}
                      </Text>
                    ) : null}
                  </Stack>
                ),
              )}
            </Stack>
          )}
        </div>

        <Text size="xs" c="dimmed" px="md" pb="sm" pt={4}>
          Giorgio es una IA y puede equivocarse. No es un registro oficial.
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}
