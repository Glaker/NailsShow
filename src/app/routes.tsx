import { Navigate, Route, Routes } from 'react-router-dom';
import { PaginaTablero } from '@/features/tablero/PaginaTablero';
import { PaginaLotes } from '@/features/trazabilidad/PaginaLotes';
import { PaginaLote } from '@/features/trazabilidad/PaginaLote';
import {
  PaginaStockUnificada,
  RedirigirAStock,
} from '@/features/stock/PaginaStockUnificada';
import { PaginaCalculadoraLote } from '@/features/produccion/PaginaCalculadoraLote';
import { PaginaFormulas } from '@/features/produccion/PaginaFormulas';
import { PaginaFormula } from '@/features/produccion/PaginaFormula';
import { PaginaPedidos } from '@/features/comercial/PaginaPedidos';
import { PaginaPedido } from '@/features/comercial/PaginaPedido';
import { PaginaComprasPendientes } from '@/features/comercial/PaginaComprasPendientes';
import { PaginaClientes } from '@/features/comercial/PaginaClientes';
import { PaginaFacturas } from '@/features/comercial/PaginaFacturas';
import { PaginaListaMateriales } from '@/features/comercial/PaginaListaMateriales';
import { PaginaPuntoVenta } from '@/features/comercial/PaginaPuntoVenta';
import { PaginaInsumos } from '@/features/maestros/PaginaInsumos';
import { PaginaProductos } from '@/features/maestros/PaginaProductos';
import { PaginaProveedores } from '@/features/maestros/PaginaProveedores';
import { PaginaDepositos } from '@/features/maestros/PaginaDepositos';
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
      <Route path="/calculadora-lote" element={<PaginaCalculadoraLote />} />
      <Route path="/formulas" element={<PaginaFormulas />} />
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
      <Route path="/lista-materiales" element={<PaginaListaMateriales />} />
      <Route path="/punto-venta" element={<PaginaPuntoVenta />} />
      <Route path="/insumos" element={<PaginaInsumos />} />
      <Route path="/productos" element={<PaginaProductos />} />
      <Route path="/proveedores" element={<PaginaProveedores />} />
      <Route path="/depositos" element={<PaginaDepositos />} />
      <Route path="/usuarios" element={<PaginaUsuarios />} />
      <Route path="/visibilidad" element={<PaginaVisibilidad />} />
      <Route path="/auditoria" element={<PaginaAuditoria />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
