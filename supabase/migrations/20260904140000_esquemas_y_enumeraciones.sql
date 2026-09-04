-- ---------------------------------------------------------------------------
-- Propósito : Crear los tres esquemas del sistema y las enumeraciones del
--             Anexo A del documento de alcance que consume la fase 1 recortada
--             (identidad, maestros, recepción y rotulado).
-- Reglas    : No implementa reglas de negocio. Sostiene la invariante 7 de
--             CLAUDE.md (dirección de dependencia comercial → gmp → core)
--             ubicando cada tipo en el esquema que lo posee.
-- Fecha     : 2026-09-04
-- ---------------------------------------------------------------------------
--
-- Reparto (CLAUDE.md §4):
--   core      : identidad, auditoría, sesión. No depende de nadie.
--   gmp       : todo lo regulado por Buenas Prácticas. Depende solo de core.
--   comercial : stock valorizado, facturación. Puede depender de gmp y core.
--
-- `comercial` se crea vacío: existe para fijar el orden de dependencias desde
-- el principio, no porque esta migración lo pueble.
-- ---------------------------------------------------------------------------

create schema if not exists core;
create schema if not exists gmp;
create schema if not exists comercial;

comment on schema core is
  'Identidad, auditoría, firma electrónica y funciones de sesión. No depende de gmp ni de comercial.';
comment on schema gmp is
  'Dominio regulado por Buenas Prácticas de Fabricación (Disp. ANMAT 6477/12). Depende solo de core.';
comment on schema comercial is
  'Stock valorizado, facturación y contabilidad. Puede depender de gmp y de core.';

-- El cliente del navegador entra como `authenticated`. `anon` no ve nada:
-- ningún registro de este sistema es público.
grant usage on schema core to authenticated;
grant usage on schema gmp to authenticated;
grant usage on schema comercial to authenticated;

-- ---------------------------------------------------------------------------
-- Enumeraciones de core (Anexo A del documento de alcance)
-- ---------------------------------------------------------------------------

-- Roles de PG.60.1. `ADMINISTRADOR_SISTEMA` administra cuentas y parámetros;
-- §3.5 del alcance le prohíbe expresamente alterar registros de calidad.
create type core.rol_enum as enum (
  'OPERARIO',
  'CONTROL_CALIDAD',
  'DIRECCION_TECNICA',
  'ADMINISTRACION',
  'GERENCIA_PRODUCCION',
  'GERENCIA',
  'ADMINISTRADOR_SISTEMA'
);

create type core.sector_enum as enum (
  'ADMINISTRACION',
  'RECEPCION_EXPEDICION',
  'DEPOSITO',
  'PRODUCCION',
  'CONTROL_CALIDAD',
  'GARANTIA_CALIDAD',
  'MANTENIMIENTO',
  'DIRECCION_TECNICA',
  'GERENCIA'
);

-- ---------------------------------------------------------------------------
-- Enumeraciones de gmp
-- ---------------------------------------------------------------------------

-- Estados de I.20.2. El orden del enum es el del circuito de I.20.1:
-- se recibe, se pone en cuarentena, se muestrea, se analiza y se dictamina.
create type gmp.estado_calidad_enum as enum (
  'RECIBIDO',
  'CUARENTENA',
  'MUESTREADO',
  'EN_ANALISIS',
  'APROBADO',
  'RECHAZADO'
);

create type gmp.tipo_insumo_enum as enum (
  'MATERIA_PRIMA',
  'MATERIAL_ENVASE',
  'MATERIAL_EMPAQUE',
  'ETIQUETA',
  'SEMIELABORADO'
);

-- Qué guarda cada depósito. Se usa para forzar el destino de un lote:
-- RN-48 manda las materias primas inflamables al depósito exterior.
create type gmp.tipo_contenido_enum as enum (
  'MATERIA_PRIMA',
  'ENVASE_EMPAQUE',
  'GRANEL',
  'PT_NACIONAL',
  'PT_IMPORTADO',
  'CONTRAMUESTRA',
  'RETIRO_MERCADO',
  'INFLAMABLES'
);

create type gmp.aprobacion_proveedor_enum as enum (
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO'
);
