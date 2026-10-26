-- ---------------------------------------------------------------------------
-- Propósito : Ventas (Mati; también Agustina, que tiene el rol) ve y modifica
--             la cuenta corriente de clientes: registra y anula cobros y los
--             imputa a facturas, como Administración. Para elegir dónde entró
--             la plata ve la lista de cajas y bancos (no sus saldos ni sus
--             movimientos).
-- Reglas    : RN-63 (imputación, en su trigger, sin cambios). D-clientes-cc-1
--             (codirector técnico, 2026-10-26). Invariante 3: las políticas
--             se amplían, no se quitan.
-- Fecha     : 2026-10-26
-- ---------------------------------------------------------------------------
--
-- El movimiento de fondos del cobro lo escribe comercial.fn_cobro_cliente_fondos
-- (trigger): pasa a SECURITY DEFINER para que Ventas no necesite permiso de
-- escritura sobre comercial.movimientos_fondos, que sigue siendo de
-- Administración. Funciona porque el dueño (postgres) tiene BYPASSRLS, como
-- en 20261009140000; solo asienta el reflejo exacto del cobro o su anulación.

alter policy cobros_cliente_insert_administracion on comercial.cobros_cliente
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS') and registrado_por = core.usuario_actual());
comment on policy cobros_cliente_insert_administracion on comercial.cobros_cliente is
  '§2.3 del documento: cobros. Administración, Gerencia y Ventas (D-clientes-cc-1).';

alter policy cobros_cliente_update_administracion on comercial.cobros_cliente
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS'))
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS'));
comment on policy cobros_cliente_update_administracion on comercial.cobros_cliente is
  'Solo la anulación (trigger). Administración, Gerencia y Ventas (D-clientes-cc-1).';

alter policy imputaciones_cobro_insert_administracion on comercial.imputaciones_cobro
  with check (core.es_rol('ADMINISTRACION', 'GERENCIA', 'VENTAS') and registrado_por = core.usuario_actual());
comment on policy imputaciones_cobro_insert_administracion on comercial.imputaciones_cobro is
  'RN-63 en el trigger. Append-only. Administración, Gerencia y Ventas (D-clientes-cc-1).';

alter policy cuentas_fondos_select_administracion on comercial.cuentas_fondos
  using (core.es_rol('ADMINISTRACION', 'GERENCIA', 'ADMINISTRADOR_SISTEMA', 'VENTAS'));
comment on policy cuentas_fondos_select_administracion on comercial.cuentas_fondos is
  'Las cajas y bancos: Administración y Gerencia; Ventas para elegir dónde entra un cobro (D-clientes-cc-1).';

alter function comercial.fn_cobro_cliente_fondos() security definer;
comment on function comercial.fn_cobro_cliente_fondos() is
  'Asienta en movimientos_fondos el cobro o su anulación. SECURITY DEFINER desde 20261026160200: quien cobra no '
  'escribe fondos directo (D-clientes-cc-1).';
