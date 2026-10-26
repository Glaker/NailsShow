-- ---------------------------------------------------------------------------
-- Propósito : Condición frente al IVA «No categorizado» para clientes. Se
--             pidió «IVA responsable no inscripto», que no existe desde la
--             Ley 24.977 (1998) y ARCA no acepta como condición del receptor
--             (RG 5616); «No categorizado» (código 7) es la vigente para ese
--             caso y lleva Factura B.
-- Reglas    : RN-57. D-clientes-iva-1 (codirector técnico, 2026-10-26).
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------
--
-- Solo el valor nuevo: Postgres no deja usarlo en la misma transacción en que
-- se agrega. El mapeo a ARCA va en 20261026160100.

alter type comercial.condicion_iva_enum add value if not exists 'NO_CATEGORIZADO';
