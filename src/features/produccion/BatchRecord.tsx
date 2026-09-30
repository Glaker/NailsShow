import { Link, useParams } from 'react-router-dom';
import { Button, Group, Skeleton } from '@mantine/core';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import { useFormulasFabricacion, useProcedimientos, useProductos } from '@/lib/consultas';
import { fecha, numero } from '@/lib/formato';
import { useNomina } from '@/lib/consultasComercial';
import {
  ETAPAS,
  TEXTO_GRUPO,
  textoCriterio,
  useEspecificacionCompleta,
  useOrden,
  type EtapaOrden,
  type EtapaRegistrada,
} from '@/lib/consultasOrdenes';
import { CONFIG_ETAPAS, unidadesRecuento } from './etapasOrden';
import { TrazabilidadOrden } from './TrazabilidadOrden';

/*
 * Estilos del documento: papel, no pantalla. Colores fijos a propósito (se
 * imprime en blanco y negro); al imprimir solo queda visible el documento.
 */
const CSS = `
.br { background: #fff; color: #111; font: 11px/1.35 Arial, Helvetica, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; border: 1px solid #ccc; }
.br h1 { font-size: 15px; margin: 0; text-align: center; }
.br h2 { font-size: 12px; margin: 14px 0 4px; text-transform: uppercase; border-bottom: 1px solid #111; }
.br table { width: 100%; border-collapse: collapse; margin: 4px 0; }
.br th, .br td { border: 1px solid #444; padding: 3px 5px; text-align: left; vertical-align: top; }
.br th { background: #eee; font-weight: 700; }
.br .centro { text-align: center; }
.br .nota { color: #555; font-size: 10px; }
@media print {
  body * { visibility: hidden !important; }
  .br, .br * { visibility: visible !important; }
  .br { position: absolute; left: 0; top: 0; border: 0; max-width: none; width: 100%; padding: 0; }
  @page { size: A4; margin: 14mm; }
}
`;

type Quien = (uid: string | null | undefined) => string;
type Datos = Record<string, unknown>;
type Espec = ReturnType<typeof useEspecificacionCompleta>['data'];

const marca = (v: boolean) => (v ? 'X' : '');

/** Valor de un campo como texto (los datos de etapa son jsonb). */
const texto = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v)
    : typeof v === 'boolean'
      ? v
        ? 'Sí'
        : 'No'
      : '';

const hora = (t: string | null | undefined) =>
  t
    ? new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';

function Firmas({ e, quien }: { e: EtapaRegistrada | undefined; quien: Quien }) {
  return (
    <p>
      <b>Realizó:</b> {quien(e?.realizo_por)} <b>Fecha:</b> {e ? fecha(e.realizo_en) : ''}{' '}
      <b>Hora:</b> {hora(e?.realizo_en)} &nbsp;&nbsp; <b>Controló:</b>{' '}
      {quien(e?.controlo_por)} <b>Fecha:</b> {e?.controlo_en ? fecha(e.controlo_en) : ''}{' '}
      <b>Hora:</b> {hora(e?.controlo_en)}
      {e?.controlo_por && e.controlo_por === e.realizo_por
        ? ' (misma persona, §3.4)'
        : ''}
    </p>
  );
}

function Resultados({ d, espec }: { d: Datos; espec: NonNullable<Espec> }) {
  const res = (d.resultados ?? {}) as Record<
    string,
    { valor?: unknown; cumple?: boolean; justificacion?: string }
  >;
  return (
    <table>
      <thead>
        <tr>
          <th>
            Requisito ({espec.especificacion.codigo_poe} v{espec.especificacion.version})
          </th>
          <th>Especificación</th>
          <th>Resultado</th>
          <th>Cumple</th>
        </tr>
      </thead>
      <tbody>
        {espec.parametros.map((p) => {
          const r = res[p.id] ?? {};
          const valor = texto(r.valor);
          return (
            <tr key={p.id}>
              <td>
                {p.nombre} <span className="nota">({TEXTO_GRUPO[p.grupo]})</span>
              </td>
              <td>{textoCriterio(p)}</td>
              <td>
                {valor} {valor ? (p.unidad ?? '') : ''}
                {r.justificacion ? (
                  <div className="nota">Justificación: {r.justificacion}</div>
                ) : null}
              </td>
              <td>{r.cumple === true ? 'Sí' : r.cumple === false ? 'No' : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Seccion({
  etapa,
  titulo,
  e,
  espec,
  quien,
}: {
  etapa: EtapaOrden;
  titulo: string;
  e: EtapaRegistrada | undefined;
  espec: Espec;
  quien: Quien;
}) {
  const c = CONFIG_ETAPAS[etapa];
  const d = e?.datos ?? {};
  const verif = (d.verificaciones ?? {}) as Record<string, boolean>;

  if (d.no_aplica) {
    return (
      <>
        <h2>{titulo}</h2>
        <p>No aplica: {texto(d.motivo)}</p>
        <Firmas e={e} quien={quien} />
      </>
    );
  }

  return (
    <>
      <h2>
        {titulo}
        {c.area ? `: se realizará en el ${c.area.toUpperCase()}` : ''}
      </h2>
      {c.verificaciones ? (
        <table>
          <thead>
            <tr>
              <th>Verificaciones previas — detalle</th>
              <th className="centro">SÍ</th>
              <th className="centro">NO</th>
            </tr>
          </thead>
          <tbody>
            {c.verificaciones.map((v, i) => (
              <tr key={v}>
                <td>{v}</td>
                <td className="centro">{marca(verif[i] === true)}</td>
                <td className="centro">{marca(verif[i] === false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {(c.tablas ?? []).map((t) => {
        const filas = (d[t.clave] ?? []) as Datos[];
        return (
          <table key={t.clave}>
            <thead>
              <tr>
                <th colSpan={t.columnas.length}>{t.titulo}</th>
              </tr>
              <tr>
                {t.columnas.map((col) => (
                  <th key={col.clave}>{col.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(filas.length ? filas : [{}]).map((f, i) => (
                <tr key={i}>
                  {t.columnas.map((col) => (
                    <td key={col.clave}>{texto(f[col.clave])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
      {c.campos ? (
        <table>
          <tbody>
            <tr>
              {c.campos.map((col) => (
                <th key={col.clave}>{col.titulo}</th>
              ))}
              {etapa === 'FRACCIONAMIENTO' ? <th>N° unidades totales</th> : null}
            </tr>
            <tr>
              {c.campos.map((col) => (
                <td key={col.clave}>{texto(d[col.clave])}</td>
              ))}
              {etapa === 'FRACCIONAMIENTO' ? (
                <td>{numero(unidadesRecuento(d), 0)}</td>
              ) : null}
            </tr>
          </tbody>
        </table>
      ) : null}
      {c.contraEspecificacion && espec ? <Resultados d={d} espec={espec} /> : null}
      {c.dictamen ? (
        <p>
          <b>Adjuntar {c.dictamen.registro}</b> — APROBADO: SÍ [
          {marca(d.aprobado === true)}] NO [{marca(d.aprobado === false)}]
        </p>
      ) : null}
      <p>
        <b>Observaciones:</b> {e?.observaciones ?? ''}
      </p>
      <Firmas e={e} quien={quien} />
    </>
  );
}

/**
 * Batch record del lote (ítem 5 de la cola del 24/09), con la estructura del
 * R.40.x.1 del método de elaboración. No se guarda: se arma al abrirlo con los
 * datos de cada etapa; «Descargar PDF» lo imprime (Guardar como PDF).
 */
export function BatchRecord() {
  const { id } = useParams<{ id: string }>();
  const orden = useOrden(id);
  const productos = useProductos();
  const formulas = useFormulasFabricacion();
  const nomina = useNomina();
  const o = orden.data?.orden;
  const procedimientos = useProcedimientos(o?.formula_id);
  const espec = useEspecificacionCompleta(o?.especificacion_id);

  if (orden.isLoading || !o) return <Skeleton h={500} />;
  const etapas = new Map((orden.data?.etapas ?? []).map((e) => [e.etapa, e]));
  const producto = (productos.data ?? []).find((p) => p.id === o.producto_id);
  const formula = (formulas.data ?? []).find((f) => f.id === o.formula_id);
  const registro = formula?.codigo_me
    ? `R.${formula.codigo_me.replace(/^ME\./, '').replace(/\.$/, '')}.1`
    : 'R.40.x.1';
  const proc = (procedimientos.data ?? []).find(
    (p) => p.version === o.procedimiento_version,
  );
  const quien: Quien = (uid) => (uid ? (nomina.data?.get(uid) ?? '') : '');
  const revision = etapas.get('REVISION');
  const dr = revision?.datos ?? {};

  return (
    <>
      <style>{CSS}</style>
      <Group mb="md" justify="space-between">
        <Button
          component={Link}
          to={`/ordenes/${o.id}`}
          variant="subtle"
          leftSection={<IconArrowLeft size={18} />}
        >
          Volver a la orden
        </Button>
        <Button leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>
          Descargar PDF
        </Button>
      </Group>
      <div className="br">
        <table>
          <tbody>
            <tr>
              <td rowSpan={2} style={{ width: '22%' }}>
                <b>NAIL SHOW SRL</b>
              </td>
              <td className="centro">
                <h1>
                  {registro} {producto?.nombre?.toUpperCase() ?? ''}
                </h1>
              </td>
              <td style={{ width: '22%' }}>Orden {o.numero}</td>
            </tr>
            <tr>
              <td>
                <b>CÓDIGO DEL PRODUCTO:</b> {producto?.codigo_interno ?? ''} &nbsp;{' '}
                <b>LOTE:</b> {o.numero_lote} &nbsp; <b>VENCIMIENTO:</b>{' '}
                {o.vencimiento_texto}
              </td>
              <td>
                Estado: {o.estado.toLowerCase()}
                {o.presentacion_texto ? ` · ${o.presentacion_texto}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="nota">
          Fórmula v{formula?.version ?? ''} {formula?.codigo_me ?? ''} · Cantidad teórica{' '}
          {numero(Number(o.cantidad_teorica), 3)} {o.unidad} · Elaboración{' '}
          {fecha(o.jornada)}
          {o.cantidad_obtenida !== null
            ? ` · Obtenido ${numero(Number(o.cantidad_obtenida), 3)} ${o.unidad} (${o.unidades_obtenidas ?? ''} u)`
            : ''}
        </p>

        {proc ? (
          <>
            <h2>Procedimiento (versión {proc.version})</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{proc.texto}</p>
          </>
        ) : null}

        {ETAPAS.filter((x) => x.etapa !== 'REVISION').map((x) => (
          <Seccion
            key={x.etapa}
            etapa={x.etapa}
            titulo={x.titulo}
            e={etapas.get(x.etapa)}
            espec={espec.data}
            quien={quien}
          />
        ))}

        <h2>Revisión de documentación del lote (batch record)</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>No conformidades observadas</th>
              <th>Rótulos – etiquetas adjunto</th>
              <th>Realizó</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{revision ? fecha(revision.realizo_en) : ''}</td>
              <td>{texto(dr.no_conformidades)}</td>
              <td>{texto(dr.rotulos_adjuntos)}</td>
              <td>{quien(revision?.realizo_por)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          <b>Observaciones:</b> {revision?.observaciones ?? ''}
        </p>
        <Firmas e={revision} quien={quien} />

        <h2>Trazabilidad del lote (anexo)</h2>
        <TrazabilidadOrden ordenId={o.id} impreso />

        <h2>Liberación del producto terminado al mercado</h2>
        <p>
          SÍ [{marca(o.estado === 'LIBERADA')}] NO [{marca(o.estado === 'RECHAZADA')}]
          &nbsp; Marcó: {quien(o.liberada_por)} &nbsp; Fecha:{' '}
          {o.liberada_en ? fecha(o.liberada_en) : ''}
          {o.motivo_cierre ? ` · ${o.motivo_cierre}` : ''}
        </p>
        <p>
          FIRMA DT: ................................................ FECHA:
          ..........................
        </p>
        <p className="nota">
          La liberación queda registrada en el sistema con autor y fecha; la firma de la
          DT en este documento se hace a mano (D-01).
        </p>
        <p>
          ADJUNTAR RÓTULO / ETIQUETA DE PRODUCTO TERMINADO · ADJUNTAR ETIQUETA DE LOTE Y
          VENCIMIENTO
        </p>
        <p className="nota">
          Generado desde el sistema de trazabilidad con los datos registrados en cada
          etapa.
        </p>
      </div>
    </>
  );
}
