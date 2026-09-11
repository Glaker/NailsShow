import { Navigate, Route, Routes } from 'react-router-dom';
import { PaginaTablero } from '@/features/tablero/PaginaTablero';
import { PaginaRecepciones } from '@/features/recepcion/PaginaRecepciones';
import { PaginaLotes } from '@/features/trazabilidad/PaginaLotes';
import { PaginaLote } from '@/features/trazabilidad/PaginaLote';
import { PaginaStock } from '@/features/stock/PaginaStock';
import { PaginaInsumos } from '@/features/maestros/PaginaInsumos';
import { PaginaProductos } from '@/features/maestros/PaginaProductos';
import { PaginaProveedores } from '@/features/maestros/PaginaProveedores';
import { PaginaDepositos } from '@/features/maestros/PaginaDepositos';
import { PaginaUsuarios } from '@/features/usuarios/PaginaUsuarios';
import { PaginaAuditoria } from '@/features/auditoria/PaginaAuditoria';

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
      <Route path="/recepciones" element={<PaginaRecepciones />} />
      <Route path="/lotes" element={<PaginaLotes />} />
      <Route path="/lotes/:id" element={<PaginaLote />} />
      <Route path="/stock" element={<PaginaStock />} />
      <Route path="/insumos" element={<PaginaInsumos />} />
      <Route path="/productos" element={<PaginaProductos />} />
      <Route path="/proveedores" element={<PaginaProveedores />} />
      <Route path="/depositos" element={<PaginaDepositos />} />
      <Route path="/usuarios" element={<PaginaUsuarios />} />
      <Route path="/auditoria" element={<PaginaAuditoria />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
