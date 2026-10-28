import { useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconDownload, IconPlus, IconPrinter, IconX } from '@tabler/icons-react';
import { useNomina } from '@/lib/consultasComercial';
import {
  EMPRESA,
  nombreArchivoRemito,
  numeroRemito,
  useEmitirRemito,
  useRemitos,
  type RenglonRemito,
  type Remito,
} from '@/lib/consultasRemitos';
import { desdeCalendario, fecha, fechaISO, numero } from '@/lib/formato';
import { imprimirRemito } from './imprimirRemito';

/* Una hoja A4: blanco y negro, líneas finas, todo legible a la distancia de un
   mostrador. La copia es idéntica salvo la marca de agua. */
const CSS = `
.remito { position: relative; box-sizing: border-box; width: 190mm; min-height: 270mm; margin: 0 auto;
  padding: 10mm 11mm; background: #fff; color: #111; font: 10.5pt/1.4 'Helvetica Neue', Arial, sans-serif;
  display: flex; flex-direction: column; overflow: hidden; }
.remito .cab { display: grid; grid-template-columns: 1fr 22mm 1fr; border: 1px solid #111; }
.remito .cab > div { padding: 4mm; }
.remito .marca { display: flex; gap: 3mm; align-items: center; }
.remito .marca img { width: 16mm; height: 16mm; object-fit: contain; }
.remito .empresa { font-size: 15pt; font-weight: 700; letter-spacing: .02em; }
.remito .chico { font-size: 8.5pt; color: #444; }
.remito .letra { border-left: 1px solid #111; border-right: 1px solid #111; text-align: center; display: flex;
  flex-direction: column; align-items: center; justify-content: flex-start; padding: 2mm 1mm !important; }
.remito .letra b { display: block; font-size: 26pt; line-height: 1.1; border: 1.5px solid #111; width: 13mm; }
.remito .letra span { font-size: 6.5pt; line-height: 1.15; margin-top: 1.5mm; text-transform: uppercase; }
.remito .datos { text-align: right; }
.remito .titulo { font-size: 13pt; font-weight: 700; letter-spacing: .12em; }
.remito .nro { font-size: 13pt; font-variant-numeric: tabular-nums; }
.remito .ejemplar { display: inline-block; margin-top: 1.5mm; padding: .5mm 2.5mm; border: 1px solid #111;
  font-size: 8pt; letter-spacing: .15em; }
.remito .bloque { border: 1px solid #111; border-top: 0; padding: 3mm 4mm; display: grid;
  grid-template-columns: 1fr 1fr; gap: 1mm 6mm; }
.remito .bloque .ancho { grid-column: 1 / -1; }
.remito .et { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #555; }
.remito table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
.remito th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; text-align: left;
  border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 1.8mm 2mm; }
.remito td { border-bottom: .5px solid #bbb; padding: 2mm; vertical-align: top; }
.remito .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.remito tfoot td { border-bottom: 1px solid #111; font-weight: 700; }
.remito .obs { margin-top: 4mm; }
.remito .pie { margin-top: auto; padding-top: 10mm; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm;
  align-items: end; }
.remito .firma { border-top: 1px solid #111; padding-top: 1.5mm; text-align: center; font-size: 8.5pt;
  letter-spacing: .06em; }
.remito .agua { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none; font-size: 110pt; font-weight: 700; letter-spacing: .1em; color: rgba(0,0,0,.07);
  transform: rotate(-30deg); }
`;

/** El remito impreso: original o copia (marca de agua «COPIA»). */
export function DocumentoRemito({
  remito: r,
  renglones,
  confecciono,
  copia,
}: {
  remito: Remito;
  renglones: RenglonRemito[];
  confecciono: string;
  copia: boolean;
}) {
  const bultos = renglones.reduce((a, x) => a + (x.bultos ?? 0), 0);
  const cantidad = renglones.reduce((a, x) => a + Number(x.cantidad), 0);
  return (
    <div className="remito" data-remito={copia ? 'copia' : 'original'}>
      {copia ? <div className="agua">COPIA</div> : null}
      <div className="cab">
        <div className="marca">
          <img src="/marca-nailshow.png" alt="" />
          <div>
            <div className="empresa">{EMPRESA.nombre}</div>
            <div className="chico">CUIT {EMPRESA.cuit}</div>
          </div>
        </div>
        <div className="letra">
          <b>{r.letra}</b>
          <span>Documento no válido como factura</span>
        </div>
        <div className="datos">
          <div className="titulo">REMITO</div>
          <div className="nro">N° {numeroRemito(r.punto_venta, r.numero)}</div>
          <div>Fecha: {fecha(r.fecha)}</div>
          <div className="ejemplar">{copia ? 'COPIA' : 'ORIGINAL'}</div>
        </div>
      </div>
      <div className="bloque">
        <div className="ancho">
          <div className="et">Señor(es)</div>
          <div>
            <b>{r.receptor_nombre}</b>
          </div>
        </div>
        <div>
          <div className="et">CUIT</div>
          <div>{r.receptor_cuit ?? '—'}</div>
        </div>
        <div>
          <div className="et">Condición frente al IVA</div>
          <div>{r.receptor_iva ?? '—'}</div>
        </div>
        <div className="ancho">
          <div className="et">Domicilio</div>
          <div>{r.receptor_domicilio ?? '—'}</div>
        </div>
        {r.entrega_domicilio ? (
          <div className="ancho">
            <div className="et">Lugar de entrega</div>
            <div>{r.entrega_domicilio}</div>
          </div>
        ) : null}
        {r.transporte ? (
          <div className="ancho">
            <div className="et">Transporte</div>
            <div>{r.transporte}</div>
          </div>
        ) : null}
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '17%' }}>Código</th>
            <th>Nombre y descripción</th>
            <th className="num" style={{ width: '10%' }}>
              Bultos
            </th>
            <th className="num" style={{ width: '12%' }}>
              Cantidad
            </th>
            <th style={{ width: '25%' }}>Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((x, i) => (
            <tr key={i}>
              <td>{x.codigo ?? ''}</td>
              <td>{x.descripcion}</td>
              <td className="num">{x.bultos ?? ''}</td>
              <td className="num">{numero(Number(x.cantidad))}</td>
              <td>{x.observaciones ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">{bultos || ''}</td>
            <td className="num">{numero(cantidad)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {r.observaciones ? (
        <div className="obs">
          <div className="et">Observaciones</div>
          <div>{r.observaciones}</div>
        </div>
      ) : null}

      <div className="pie">
        <div>
          <div className="et">Confeccionado por</div>
          <div>{confecciono}</div>
          {r.letra === 'R' && r.cai ? (
            <div className="chico" style={{ marginTop: '3mm' }}>
              C.A.I. {r.cai} · Vto. {r.cai_vencimiento ? fecha(r.cai_vencimiento) : ''}
            </div>
          ) : null}
        </div>
        <div>
          <div style={{ height: '16mm' }} />
          <div className="firma">RECIBÍ CONFORME · FIRMA Y SELLO</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Un remito emitido: vista previa, descargar original o copia (cada una con su
 * nombre) e imprimir una, la otra o las dos.
 */
export function VistaRemito({
  remito,
  renglones,
}: {
  remito: Remito;
  renglones: RenglonRemito[];
}) {
  const nomina = useNomina();
  const confecciono = nomina.data?.get(remito.confeccionado_por) ?? '';
  const hojas = useRef<HTMLDivElement>(null);
  const [cuales, setCuales] = useState<'original' | 'copia' | 'ambas'>('ambas');
  const hoja = (cual: 'original' | 'copia') =>
    hojas.current?.querySelector<HTMLElement>(`[data-remito="${cual}"]`) ?? null;
  const salir = (lista: ('original' | 'copia')[], titulo: string) =>
    imprimirRemito(
      lista.map(hoja).filter((h): h is HTMLElement => h !== null),
      titulo,
    );

  return (
    <Stack gap="md">
      <style>{CSS}</style>
      <Group gap="sm" wrap="wrap">
        <Tooltip label="Se abre la impresión: elegí «Guardar como PDF». El archivo ya lleva su nombre.">
          <Button
            variant="default"
            leftSection={<IconDownload size={18} />}
            onClick={() => salir(['original'], nombreArchivoRemito(remito, false))}
          >
            Descargar original
          </Button>
        </Tooltip>
        <Tooltip label="Se abre la impresión: elegí «Guardar como PDF». El archivo ya lleva su nombre.">
          <Button
            variant="default"
            leftSection={<IconDownload size={18} />}
            onClick={() => salir(['copia'], nombreArchivoRemito(remito, true))}
          >
            Descargar copia
          </Button>
        </Tooltip>
      </Group>
      <Group gap="sm" wrap="wrap">
        <SegmentedControl
          value={cuales}
          onChange={(v) => setCuales(v as typeof cuales)}
          data={[
            { value: 'original', label: 'Original' },
            { value: 'copia', label: 'Copia' },
            { value: 'ambas', label: 'Las dos' },
          ]}
        />
        <Button
          leftSection={<IconPrinter size={18} />}
          onClick={() =>
            salir(
              cuales === 'ambas' ? ['original', 'copia'] : [cuales],
              `Remito ${remito.letra} ${numeroRemito(remito.punto_venta, remito.numero)}`,
            )
          }
        >
          Imprimir
        </Button>
      </Group>
      {/* Vista previa achicada; las dos hojas están en el DOM para imprimirlas. */}
      <div
        ref={hojas}
        style={{
          border: '1px solid var(--superficie-borde)',
          overflow: 'auto',
          maxHeight: '60vh',
        }}
      >
        <div style={{ zoom: 0.62 }}>
          <DocumentoRemito
            remito={remito}
            renglones={renglones}
            confecciono={confecciono}
            copia={false}
          />
          <div style={{ height: 16, background: 'var(--superficie-tenue)' }} />
          <DocumentoRemito
            remito={remito}
            renglones={renglones}
            confecciono={confecciono}
            copia
          />
        </div>
      </div>
    </Stack>
  );
}

type Fila = {
  producto_id: string | null;
  codigo: string;
  descripcion: string;
  bultos: number | string;
  cantidad: number | string;
  observaciones: string;
};

/**
 * «Remito»: lo que sale, quién lo recibe y lo demás para completar. Al emitir
 * toma número y ya no se edita (RN-54); si salió mal, se emite otro.
 */
export function ModalRemito({
  abierto,
  onCerrar,
  motivo,
  depositoOrigenId,
  receptorInicial,
  renglonesIniciales,
}: {
  abierto: boolean;
  onCerrar: () => void;
  motivo: Remito['motivo'];
  depositoOrigenId: string | null;
  receptorInicial: string;
  renglonesIniciales: {
    producto_id: string | null;
    codigo: string;
    descripcion: string;
    cantidad: number;
  }[];
}) {
  const emitir = useEmitirRemito();
  const [emitido, setEmitido] = useState<{
    remito: Remito;
    renglones: RenglonRemito[];
  } | null>(null);
  const [dia, setDia] = useState<Date | null>(new Date());
  const [receptor, setReceptor] = useState({
    nombre: receptorInicial,
    cuit: '',
    domicilio: '',
    iva: '',
    entrega: '',
    transporte: '',
  });
  const [obs, setObs] = useState('');
  const [filas, setFilas] = useState<Fila[]>(() =>
    renglonesIniciales.map((r) => ({ ...r, bultos: '', observaciones: '' })),
  );
  const cambiar = (i: number, c: Partial<Fila>) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const renglones: RenglonRemito[] = filas
    .filter((f) => f.descripcion.trim() && Number(f.cantidad) > 0)
    .map((f) => ({
      producto_id: f.producto_id,
      codigo: f.codigo.trim() || null,
      descripcion: f.descripcion.trim(),
      bultos: f.bultos === '' ? null : Number(f.bultos),
      cantidad: Number(f.cantidad),
      observaciones: f.observaciones.trim() || null,
    }));
  const listo = receptor.nombre.trim().length > 0 && renglones.length > 0 && dia !== null;
  const campo = (k: keyof typeof receptor) => ({
    value: receptor[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setReceptor({ ...receptor, [k]: e.currentTarget.value }),
  });

  return (
    <Modal
      opened={abierto}
      onClose={onCerrar}
      title={emitido ? 'Remito emitido' : 'Remito'}
      size={emitido ? 'xl' : 'lg'}
      centered
    >
      {emitido ? (
        <VistaRemito remito={emitido.remito} renglones={emitido.renglones} />
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Recibe (señor/es)" withAsterisk {...campo('nombre')} />
            <TextInput label="CUIT" placeholder="30-12345678-9" {...campo('cuit')} />
            <TextInput label="Domicilio" {...campo('domicilio')} />
            <TextInput label="Condición frente al IVA" {...campo('iva')} />
            <TextInput label="Lugar de entrega" {...campo('entrega')} />
            <TextInput label="Transporte" {...campo('transporte')} />
            <DateInput
              label="Fecha"
              valueFormat="DD/MM/YYYY"
              value={dia}
              onChange={(v) => setDia(desdeCalendario(v))}
            />
          </SimpleGrid>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th>
                <Table.Th>Nombre y descripción</Table.Th>
                <Table.Th w={80}>Bultos</Table.Th>
                <Table.Th w={100}>Cantidad</Table.Th>
                <Table.Th>Observaciones</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <TextInput
                      aria-label="Código"
                      value={f.codigo}
                      onChange={(e) => cambiar(i, { codigo: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      aria-label="Nombre y descripción"
                      value={f.descripcion}
                      onChange={(e) => cambiar(i, { descripcion: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label="Bultos"
                      min={0}
                      allowDecimal={false}
                      hideControls
                      value={f.bultos}
                      onChange={(v) => cambiar(i, { bultos: v })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      aria-label="Cantidad"
                      min={0}
                      hideControls
                      value={f.cantidad}
                      onChange={(v) => cambiar(i, { cantidad: v })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      aria-label="Observaciones"
                      value={f.observaciones}
                      onChange={(e) =>
                        cambiar(i, { observaciones: e.currentTarget.value })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Quitar renglón"
                      onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setFilas((x) => [
                ...x,
                {
                  producto_id: null,
                  codigo: '',
                  descripcion: '',
                  bultos: '',
                  cantidad: '',
                  observaciones: '',
                },
              ])
            }
          >
            Agregar renglón
          </Button>
          <Textarea
            label="Observaciones generales"
            autosize
            minRows={2}
            value={obs}
            onChange={(e) => setObs(e.currentTarget.value)}
          />
          <Text size="sm" c="dimmed">
            Remito interno «X»: lleva «Documento no válido como factura». Al emitirlo toma
            número y ya no se modifica.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!listo}
              loading={emitir.isPending}
              onClick={() =>
                emitir.mutate(
                  {
                    remito: {
                      motivo,
                      deposito_origen_id: depositoOrigenId,
                      ...(dia && fechaISO(dia) ? { fecha: fechaISO(dia)! } : {}),
                      receptor_nombre: receptor.nombre.trim(),
                      receptor_cuit: receptor.cuit.trim() || null,
                      receptor_domicilio: receptor.domicilio.trim() || null,
                      receptor_iva: receptor.iva.trim() || null,
                      entrega_domicilio: receptor.entrega.trim() || null,
                      transporte: receptor.transporte.trim() || null,
                      observaciones: obs.trim() || null,
                    },
                    renglones,
                  },
                  { onSuccess: (r) => setEmitido({ remito: r, renglones }) },
                )
              }
            >
              Emitir remito
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** Los últimos remitos del depósito, para volver a descargar o imprimir. */
export function ModalRemitosEmitidos({
  abierto,
  onCerrar,
  depositoId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  depositoId: string | undefined;
}) {
  const remitos = useRemitos(abierto ? depositoId : undefined);
  const [elegido, setElegido] = useState<string | null>(null);
  const r = (remitos.data ?? []).find((x) => x.id === elegido);
  return (
    <Modal
      opened={abierto}
      onClose={() => {
        setElegido(null);
        onCerrar();
      }}
      title="Remitos emitidos"
      size={r ? 'xl' : 'lg'}
      centered
    >
      {r ? (
        <Stack gap="sm">
          <Button
            variant="subtle"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setElegido(null)}
          >
            Volver a la lista
          </Button>
          <VistaRemito remito={r} renglones={r.renglones} />
        </Stack>
      ) : (remitos.data ?? []).length === 0 ? (
        <Text size="sm" c="dimmed">
          Todavía no se emitieron remitos desde este depósito.
        </Text>
      ) : (
        <Table highlightOnHover>
          <Table.Tbody>
            {(remitos.data ?? []).map((x) => (
              <Table.Tr
                key={x.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setElegido(x.id)}
              >
                <Table.Td ff="monospace">
                  {x.letra} {numeroRemito(x.punto_venta, x.numero)}
                </Table.Td>
                <Table.Td>{fecha(x.fecha)}</Table.Td>
                <Table.Td>{x.receptor_nombre}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Modal>
  );
}
