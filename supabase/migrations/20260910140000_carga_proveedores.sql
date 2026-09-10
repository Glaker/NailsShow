-- ---------------------------------------------------------------------------
-- Propósito : Carga inicial del padrón de proveedores (56 razones sociales),
--             sin datos de contacto ni CUIT. Provisto por la Gerencia el
--             2026-09-10.
-- Reglas    : Ninguna nueva. Todos entran en 'PENDIENTE': la aprobación es
--             competencia exclusiva de Dirección Técnica (§3.3), y el trigger
--             gmp.fn_proveedor_aprobacion la sigue exigiendo.
-- Fecha     : 2026-09-10
-- ---------------------------------------------------------------------------
--
-- `creado_por` se fija explícitamente porque core.usuario_actual() devuelve
-- null fuera de una sesión de usuario y la columna es NOT NULL. Se atribuye a
-- la única cuenta existente. Cuando haya nómina real, esta carga va a figurar
-- a nombre de esa cuenta: es la verdad de lo que pasó, no un placeholder.
--
-- La tabla no tiene unicidad sobre razon_social (un mismo nombre comercial
-- puede repetirse con CUIT distinto), así que el insert se guarda con NOT
-- EXISTS para que reaplicarlo no duplique.

insert into gmp.proveedores (razon_social, creado_por)
select v.razon_social, 'a5898868-e25d-4123-bcd9-fbe217f6ca19'::uuid
from (values
  ('ACRILAB'),
  ('ADECO LAB'),
  ('AMOPLAST'),
  ('AMP SPRAY'),
  ('AROMATICA'),
  ('BIRDLAB'),
  ('CALVANO'),
  ('CAPKELITOS'),
  ('CARELLI'),
  ('CENTER GRAPH'),
  ('CENTURION'),
  ('CHIBI'),
  ('COSTA HNOS S.A.C.I.F.'),
  ('CREAPACK'),
  ('CRISTALMAN'),
  ('DANO'),
  ('DARACT'),
  ('DI FRANCO PABLO ERNESTO'),
  ('DIBU'),
  ('DILENE'),
  ('DISTRIBUIDORA V.R. SRL (VAN ROSSUM)'),
  ('DONGGUAN'),
  ('ELGART'),
  ('ENTAPLAST'),
  ('ESCOS'),
  ('EUMA'),
  ('EVIDENS'),
  ('FOSHAN'),
  ('GLAS CAR'),
  ('HEAD'),
  ('IQ DENT'),
  ('KEYSTONE'),
  ('LADCO LAB'),
  ('MALLOL HNOS'),
  ('MAZA LOSA'),
  ('NGM'),
  ('O''MACRI'),
  ('PALACIO GRAFICA'),
  ('PAPELERA LEGASA'),
  ('PIGNATA ALEJANDRO EZEQUIEL'),
  ('PIROPLAST'),
  ('PLASMARE'),
  ('PLASTICOS VG'),
  ('QUILMES'),
  ('QUIMICA COLOR'),
  ('R. WAGNER'),
  ('ROMANO DANIEL GUILLERMO'),
  ('RUMAR'),
  ('SAN JOSE'),
  ('SAPORITI (MAHO)'),
  ('SERVIFIBRAS'),
  ('SUMMIT'),
  ('TAMPOMAX'),
  ('VABARLIN'),
  ('VASEPLUS'),
  ('VIP LABEL')
) as v(razon_social)
where not exists (
  select 1 from gmp.proveedores p where p.razon_social = v.razon_social
);
