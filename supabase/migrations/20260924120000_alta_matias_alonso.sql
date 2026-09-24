-- ---------------------------------------------------------------------------
-- Propósito : Asignar rol a la cuenta de Matias Alonso, que carga los pedidos.
-- Reglas    : §3.3 (matriz de permisos), RN-49 (el usuario no se borra: se
--             activa o desactiva).
-- Fecha     : 2026-09-24
-- ---------------------------------------------------------------------------
--
-- La cuenta se crea por el registro público de la app, que da de alta como
-- OPERARIO desactivado: el rol nunca se toma de lo que la persona declara al
-- registrarse. La asignación va en migración, como la de Nazarena
-- (20260911190000) y la de la DT suplente (20260922190000), para que el
-- permiso tenga historial en el repositorio.
--
-- ROL: GERENCIA_PRODUCCION, los mismos permisos que Nazarena, por indicación
-- del codirector técnico (2026-09-24), «de momento». Reemplaza el supuesto
-- anterior (ADMINISTRACION, que es el rol que la matriz §3.3 habilita para
-- «Registrar pedido»). Con GERENCIA_PRODUCCION además puede terminar pedidos,
-- descontar stock, contar inventario y editar maestros: es más de lo que su
-- tarea pide, y queda anotado para revisarlo con el organigrama v03 (D-06).
--
-- SECTOR: ADMINISTRACION, donde trabaja. El sector no interviene en ninguna
-- política: los permisos son idénticos a los de Nazarena.

update core.usuarios
   set rol             = 'GERENCIA_PRODUCCION',
       sector          = 'ADMINISTRACION',
       nombre_completo = 'Matias Alonso',
       activo          = true,
       fecha_baja      = null
 where email = 'corporativo.nailshow@gmail.com';

do $$
begin
  if not exists (
    select 1 from core.usuarios
     where email = 'corporativo.nailshow@gmail.com'
       and rol = 'GERENCIA_PRODUCCION'
       and activo
  ) then
    raise exception
      'No existe la cuenta corporativo.nailshow@gmail.com en core.usuarios. Tiene que registrarse en la app antes de aplicar esta migración.';
  end if;
end;
$$;
