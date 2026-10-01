import { Navigate, Route, Routes } from 'react-router-dom';
import { PaginaTablero } from '@/features/tablero/PaginaTablero';
import { PaginaLotes } from '@/features/trazabilidad/PaginaLotes';
import { PaginaLote } from '@/features/trazabilidad/PaginaLote';
import {
  PaginaStockUnificada,
  RedirigirAStock,
} from '@/features/stock/PaginaStockUnificada';
import {
  PaginaFormulasUnificada,
  RedirigirACalculadora,
} from '@/features/produccion/PaginaFormulasUnificada';
import { PaginaLiberacion } from '@/features/produccion/PaginaLiberacion';
import { PaginaFormula } from '@/features/produccion/PaginaFormula';
import { PaginaPedidos } from '@/features/comercial/PaginaPedidos';
import { PaginaPedido } from '@/features/comercial/PaginaPedido';
import { PaginaComprasPendientes } from '@/features/comercial/PaginaComprasPendientes';
import { PaginaClientes } from '@/features/comercial/PaginaClientes';
import { PaginaFacturas } from '@/features/comercial/PaginaFacturas';
import { PaginaPuntoVenta } from '@/features/comercial/PaginaPuntoVenta';
import { PaginaCatalogos, RedirigirACatalogo } from '@/features/maestros/PaginaCatalogos';
import { PaginaVentas } from '@/features/ventas/PaginaVentas';
import { PaginaArmado } from '@/features/ventas/PaginaArmado';
import { PaginaUsuarios } from '@/features/usuarios/PaginaUsuarios';
import { PaginaAuditoria } from '@/features/auditoria/PaginaAuditoria';
import { PaginaTercerizados } from '@/features/tercerizados/PaginaTercerizados';
import { PaginaTercero } from '@/features/tercerizados/PaginaTercero';
import { PaginaAdministracion } from '@/features/administracion/PaginaAdministracion';
import { PaginaTesoreria } from '@/features/administracion/PaginaTesoreria';
import { PaginaCuentasProveedores } from '@/features/administracion/PaginaCuentasProveedores';
import { PaginaCuentasClientes } from '@/features/administracion/PaginaCuentasClientes';
import { PaginaSolicitudesPago } from '@/features/administracion/PaginaSolicitudesPago';
import { PaginaReportes } from '@/features/administracion/PaginaReportes';
import { PaginaPrecios } from '@/features/comercial/PaginaPrecios';
import { PaginaPlanificacion } from '@/features/produccion/Planificacion';
import { PaginaVisibilidad } from '@/features/usuarios/PaginaVisibilidad';
import { PaginaOrdenes } from '@/features/produccion/PaginaOrdenes';
import { PaginaOrden } from '@/features/produccion/PaginaOrden';
import { BatchRecord } from '@/features/produccion/BatchRecord';
import { PaginaEspecificaciones } from '@/features/produccion/PaginaEspecificaciones';

/**
 * Rutas de la aplicación.
 *
 * Sin guardas por rol: la navegación ya esconde lo que el rol no puede usar, y
 * si alguien llega por URL a una pantalla que no le corresponde, la consulta
 * vuelve vacía porque RLS la niega. Poner acá una guarda daría la impresión de
 * que la autoridad está en el cliente, y no lo está (CLAUDE.md §6).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PaginaTablero />} />
      <Route path="/lotes" element={<PaginaLotes />} />
      <Route path="/lotes/:id" element={<PaginaLote />} />
      <Route path="/stock" element={<PaginaStockUnificada />} />
      {/* Rutas viejas: llevan a su pestaña de Stock. */}
      <Route path="/recepciones" element={<RedirigirAStock vista="recepciones" />} />
      <Route path="/conteo" element={<RedirigirAStock vista="conteo" />} />
      <Route path="/stock-seguridad" element={<RedirigirAStock vista="seguridad" />} />
      <Route path="/producto-terminado" element={<RedirigirAStock vista="fabrica" />} />
      <Route path="/calculadora-lote" element={<RedirigirACalculadora />} />
      <Route path="/liberacion" element={<PaginaLiberacion />} />
      <Route path="/ordenes" element={<PaginaOrdenes />} />
      <Route path="/ordenes/:id" element={<PaginaOrden />} />
      <Route path="/ordenes/:id/batch-record" element={<BatchRecord />} />
      <Route path="/especificaciones" element={<PaginaEspecificaciones />} />
      <Route path="/formulas" element={<PaginaFormulasUnificada />} />
      <Route path="/formulas/:id" element={<PaginaFormula />} />
      <Route path="/pedidos" element={<PaginaPedidos />} />
      <Route path="/planificacion" element={<PaginaPlanificacion />} />
      <Route path="/pedidos/:id" element={<PaginaPedido />} />
      <Route path="/compras" element={<PaginaComprasPendientes />} />
      <Route path="/clientes" element={<PaginaClientes />} />
      <Route path="/precios" element={<PaginaPrecios />} />
      <Route path="/facturas" element={<PaginaFacturas />} />
      <Route path="/administracion" element={<PaginaAdministracion />} />
      <Route path="/tesoreria" element={<PaginaTesoreria />} />
      <Route path="/cuentas-proveedores" element={<PaginaCuentasProveedores />} />
      <Route path="/cuentas-clientes" element={<PaginaCuentasClientes />} />
      <Route path="/solicitudes-pago" element={<PaginaSolicitudesPago />} />
      <Route path="/reportes" element={<PaginaReportes />} />
      <Route path="/tercerizados" element={<PaginaTercerizados />} />
      <Route path="/tercerizados/:id" element={<PaginaTercero />} />
      <Route path="/lista-materiales" element={<RedirigirACalculadora />} />
      <Route path="/ventas" element={<PaginaVentas />} />
      <Route path="/armado" element={<PaginaArmado />} />
      <Route path="/punto-venta" element={<PaginaPuntoVenta />} />
      <Route path="/catalogos" element={<PaginaCatalogos />} />
      {/* Rutas viejas de los catálogos: llevan a su pestaña. */}
      <Route path="/insumos" element={<RedirigirACatalogo vista="insumos" />} />
      <Route path="/productos" element={<RedirigirACatalogo vista="productos" />} />
      <Route path="/proveedores" element={<RedirigirACatalogo vista="proveedores" />} />
      <Route path="/depositos" element={<RedirigirACatalogo vista="depositos" />} />
      <Route path="/usuarios" element={<PaginaUsuarios />} />
      <Route path="/visibilidad" element={<PaginaVisibilidad />} />
      <Route path="/auditoria" element={<PaginaAuditoria />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
