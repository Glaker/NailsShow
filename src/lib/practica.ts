/**
 * Modo práctica (pedido del 2026-10-02): la misma app apuntada a una base
 * aparte, con datos inventados, para que Administración aprenda a usarla y la
 * compare con Holistor. Se enciende con VITE_MODO_PRACTICA=1 en el despliegue
 * de práctica. En ese modo no se emiten facturas (la base de práctica tampoco
 * tiene la función ni los certificados de ARCA).
 */
export const MODO_PRACTICA = import.meta.env.VITE_MODO_PRACTICA === '1';
