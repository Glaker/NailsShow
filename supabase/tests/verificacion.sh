#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verificación funcional del circuito de stock contra el clúster descartable
# que levanta `reconstruir.sh`.
#
# No reemplaza a la suite pgTAP que exige la calificación operacional bajo
# GAMP 5, pero cubre lo mismo que aquélla va a cubrir y hoy corre: cada prueba
# ejerce una regla de negocio con una sesión de usuario real, RLS incluida, y
# la mitad de ellas verifica un *rechazo*, que es la parte que importa.
#
#   bash supabase/tests/reconstruir.sh && bash supabase/tests/verificacion.sh
# ---------------------------------------------------------------------------
set -uo pipefail

PUERTO="${NAILSHOW_TEST_PORT:-55432}"
export PGPORT="$PUERTO" PGHOST=127.0.0.1 PGUSER="${USER:-postgres}" PGDATABASE=nailshow

PASA=0; FALLA=0
V=$'\033[32m'; R=$'\033[31m'; T=$'\033[2m'; N=$'\033[0m'; B=$'\033[1m'

# t <nombre> <ok|err:subcadena> <sql>
t() {
  local nombre="$1" espera="$2" sql="$3" salida rc
  salida=$(psql -v ON_ERROR_STOP=1 -t -A 2>&1 <<<"$sql"); rc=$?
  if [[ "$espera" == ok ]]; then
    if [[ $rc -eq 0 ]]; then printf "  %sok%s   %s\n" "$V" "$N" "$nombre"; PASA=$((PASA+1))
    else printf "  %sFALLA%s %s\n       %s\n" "$R" "$N" "$nombre" "$(grep -i error <<<"$salida"|head -1)"; FALLA=$((FALLA+1)); fi
  else
    local sub="${espera#err:}"
    if [[ $rc -ne 0 && "$salida" == *"$sub"* ]]; then printf "  %sok%s   %s %s(rechazado)%s\n" "$V" "$N" "$nombre" "$T" "$N"; PASA=$((PASA+1))
    elif [[ $rc -eq 0 ]]; then printf "  %sFALLA%s %s — se esperaba rechazo y pasó\n" "$R" "$N" "$nombre"; FALLA=$((FALLA+1))
    else printf "  %sFALLA%s %s — rechazo con otro motivo:\n       %s\n" "$R" "$N" "$nombre" "$(grep -i error <<<"$salida"|head -1)"; FALLA=$((FALLA+1)); fi
  fi
}

# ---------------------------------------------------------------------------
# Fixture: nómina, proveedor aprobado, una recepción con dos lotes en cuarentena
# ---------------------------------------------------------------------------
psql -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into core.usuarios (id, nombre_completo, email, rol, sector) values
 ('11111111-1111-1111-1111-111111111111','Gerencia Producción','gp@t.ar','GERENCIA_PRODUCCION','PRODUCCION'),
 ('22222222-2222-2222-2222-222222222222','Dirección Técnica','dt@t.ar','DIRECCION_TECNICA','DIRECCION_TECNICA'),
 ('33333333-3333-3333-3333-333333333333','Administración','adm@t.ar','ADMINISTRACION','ADMINISTRACION'),
 ('44444444-4444-4444-4444-444444444444','Operario','op@t.ar','OPERARIO','DEPOSITO'),
 ('55555555-5555-5555-5555-555555555555','Control Calidad','cc@t.ar','CONTROL_CALIDAD','CONTROL_CALIDAD');

create table public.fx (k text primary key, v uuid);
grant all on public.fx to authenticated;

select public.sesion('22222222-2222-2222-2222-222222222222');
set role authenticated;
update gmp.proveedores set estado_aprobacion='APROBADO' where razon_social='ACRILAB';
update gmp.insumos_catalogo
   set deposito_cuarentena_id = (select id from gmp.depositos where numero='01'),
       deposito_aprobado_id   = (select id from gmp.depositos where numero='ENV-APR')
 where tipo in ('MATERIAL_ENVASE','MATERIAL_EMPAQUE','ETIQUETA');
reset role;

select public.sesion('11111111-1111-1111-1111-111111111111');
set role authenticated;
insert into gmp.recepciones (proveedor_id, numero_remito, coincide_con_pedido)
select id, 'R-0001', true from gmp.proveedores where razon_social='ACRILAB';

insert into gmp.lotes_insumo
  (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades,
   unidad, contenedores_limpiados, deposito_actual_id, plazo_validez)
select r.id, i.id, 'LP-A', 4, 200, i.unidad_medida, true,
       (select id from gmp.depositos where numero='01'), current_date + 365
  from gmp.recepciones r,
       (select * from gmp.insumos_catalogo where tipo='MATERIAL_ENVASE' order by codigo_interno limit 1) i;

insert into gmp.lotes_insumo
  (recepcion_id, insumo_id, lote_proveedor, cantidad_bultos, cantidad_unidades,
   unidad, contenedores_limpiados, deposito_actual_id)
select r.id, i.id, 'LP-B', 2, 50, i.unidad_medida, true,
       (select id from gmp.depositos where numero='01')
  from gmp.recepciones r,
       (select * from gmp.insumos_catalogo where tipo='MATERIAL_ENVASE' order by codigo_interno offset 1 limit 1) i;
reset role;

insert into public.fx
select 'recepcion', id from gmp.recepciones
union all select 'lote_a', id from gmp.lotes_insumo where lote_proveedor='LP-A'
union all select 'lote_b', id from gmp.lotes_insumo where lote_proveedor='LP-B'
union all select 'depCua', id from gmp.depositos where numero='01'
union all select 'depApr', id from gmp.depositos where numero='ENV-APR';

select public.sesion('11111111-1111-1111-1111-111111111111');
set role authenticated;
select gmp.emitir_rotulo_lote_insumo((select v from public.fx where k='lote_a'), 'CUARENTENA');
select gmp.emitir_rotulo_lote_insumo((select v from public.fx where k='lote_b'), 'CUARENTENA');
reset role;
SQL
[[ $? -ne 0 ]] && { echo "El fixture falló. ¿Corriste reconstruir.sh?"; exit 1; }

S="select public.sesion"
GP="$S('11111111-1111-1111-1111-111111111111'); set role authenticated;"
DT="$S('22222222-2222-2222-2222-222222222222'); set role authenticated;"
ADM="$S('33333333-3333-3333-3333-333333333333'); set role authenticated;"
OP="$S('44444444-4444-4444-4444-444444444444'); set role authenticated;"
CC="$S('55555555-5555-5555-5555-555555555555'); set role authenticated;"
L_A="(select v from public.fx where k='lote_a')"
L_B="(select v from public.fx where k='lote_b')"
DC="(select v from public.fx where k='depCua')"
DA="(select v from public.fx where k='depApr')"
REC="(select v from public.fx where k='recepcion')"
ART_A="(select comercial.articulo_de_insumo(insumo_id) from gmp.lotes_insumo where id=$L_A)"

echo
echo "── Carga de recepción a stock ───────────────────────────────────"
t "un operario no carga stock (§3.3)" "err:" \
  "$OP select comercial.cargar_recepcion_a_stock($REC);"
t "Administración carga la recepción" ok \
  "$ADM select count(*) from comercial.cargar_recepcion_a_stock($REC);"
t "la recepción queda marcada con autor" ok \
  "$ADM select public.verdad((select cargado_a_stock and cargado_por is not null and cargado_en is not null
                              from gmp.recepciones where id=$REC), 'carga sin autor');"
t "no se carga dos veces" "err:ya fue cargada a stock" \
  "$ADM select comercial.cargar_recepcion_a_stock($REC);"
t "el saldo es lo recibido (200 + 50)" ok \
  "$ADM select public.verdad((select sum(saldo) from comercial.v_existencias)=250, 'saldo distinto de 250');"

echo
echo "── Inmutabilidad del movimiento (RN-54) ─────────────────────────"
t "no se edita un movimiento (sin GRANT)" "err:permiso denegado" \
  "$ADM update comercial.movimientos_stock set cantidad=1;"
t "no se borra un movimiento" "err:" \
  "$ADM delete from comercial.movimientos_stock;"
t "no hay GRANT de UPDATE ni DELETE" ok \
  "select public.verdad(not exists (select 1 from information_schema.role_table_grants
     where table_schema='comercial' and table_name='movimientos_stock'
       and privilege_type in ('UPDATE','DELETE') and grantee='authenticated'),
   'hay privilegio de escritura sobre un libro inmutable');"

echo
echo "── El saldo no queda negativo ───────────────────────────────────"
t "no se saca más de lo que hay" "err:dejaría el saldo en" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad,motivo)
        values ($ART_A,$L_A,$DC,'SALIDA_DESCARTE',-500,'prueba');"
t "sí se saca lo que hay" ok \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad,motivo)
        values ($ART_A,$L_A,$DC,'SALIDA_DESCARTE',-10,'rotura en depósito');"

echo
echo "── Signo según tipo y coherencia de referencias ─────────────────"
t "una entrada no lleva cantidad negativa" "err:signo_segun_tipo" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'ENTRADA_AJUSTE',-5);"
t "una salida no lleva cantidad positiva" "err:signo_segun_tipo" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'SALIDA_AJUSTE',5);"
t "el lote tiene que ser del artículo" "err:es de otro insumo" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_B,$DC,'ENTRADA_AJUSTE',5);"

echo
echo "── Tipos sin circuito todavía ───────────────────────────────────"
t "consumo de producción se rechaza" "err:órdenes de producción" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'SALIDA_CONSUMO_PRODUCCION',-5);"
t "venta se rechaza" "err:clientes y pedidos" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'SALIDA_VENTA',-5);"
t "retiro de mercado se rechaza" "err:retiro de mercado" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'SALIDA_RETIRO_MERCADO',-5);"

echo
echo "── RN-51 y RN-52: qué puede salir ───────────────────────────────"
t "muestra de un lote en cuarentena: no" "err:RN-51" \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad)
        values ($ART_A,$L_A,$DC,'SALIDA_MUESTRA',-1);"
t "descarte de un lote en cuarentena: sí" ok \
  "$ADM insert into comercial.movimientos_stock (articulo_id,lote_insumo_id,deposito_id,tipo,cantidad,motivo)
        values ($ART_A,$L_A,$DC,'SALIDA_DESCARTE',-1,'muestra rota');"
t "el impedimento nombra el estado" ok \
  "select public.verdad(gmp.impedimento_despacho($L_A) like '%RN-51%CUARENTENA%',
                        'el impedimento no explica por qué');"

echo
echo "── Bloqueo de lote ──────────────────────────────────────────────"
t "un operario no bloquea" "err:" \
  "$OP insert into gmp.bloqueos_lote (lote_insumo_id,motivo,detalle)
       values ($L_A,'INVESTIGACION','sin fundamento');"
t "Control de Calidad bloquea" ok \
  "$CC insert into gmp.bloqueos_lote (lote_insumo_id,motivo,detalle)
       values ($L_A,'INVESTIGACION','desvío de color detectado en planta');"
t "el mismo motivo no se repite" "err:un_vigente_por_motivo" \
  "$CC insert into gmp.bloqueos_lote (lote_insumo_id,motivo,detalle)
       values ($L_A,'INVESTIGACION','otra vez');"
t "otro motivo sí convive" ok \
  "$DT insert into gmp.bloqueos_lote (lote_insumo_id,motivo,detalle)
       values ($L_A,'RETIRO_MERCADO','retiro preventivo del lote del proveedor');"
t "un bloqueo no se edita" "err:no se edita" \
  "$DT update gmp.bloqueos_lote set detalle='otro' where motivo='INVESTIGACION';"
t "CC no levanta: recibe el motivo" "err:Solo Dirección Técnica levanta" \
  "$CC update gmp.bloqueos_lote set levantado=true, levantado_motivo='listo'
       where motivo='INVESTIGACION';"
t "ADM no levanta: la fila no cambia" ok \
  "$ADM update gmp.bloqueos_lote set levantado=true, levantado_motivo='listo'
        where motivo='INVESTIGACION';
   reset role;
   select public.verdad((select not levantado from gmp.bloqueos_lote where motivo='INVESTIGACION'),
                        'ADMINISTRACION levantó un bloqueo que no le corresponde');"
t "Dirección Técnica sí levanta" ok \
  "$DT update gmp.bloqueos_lote set levantado=true, levantado_motivo='investigación cerrada sin desvío'
       where motivo='INVESTIGACION';"
t "el levantamiento se atribuye solo" ok \
  "select public.verdad((select levantado_por='22222222-2222-2222-2222-222222222222' and levantado_en is not null
                          from gmp.bloqueos_lote where motivo='INVESTIGACION'), 'sin atribución');"
t "un bloqueo levantado no revive" "err:no se vuelve a activar" \
  "$DT update gmp.bloqueos_lote set levantado=false where motivo='INVESTIGACION';"

echo
echo "── Transferencia entre depósitos ────────────────────────────────"
t "la transferencia mueve las dos patas" ok \
  "$GP select count(*) from comercial.transferir_deposito($L_B,$DC,$DA,20,'pase a aprobados');"
t "los saldos quedan 30 y 20" ok \
  "select public.verdad(
     (select saldo from comercial.v_existencias where lote_insumo_id=$L_B and deposito_id=$DC)=30
     and (select saldo from comercial.v_existencias where lote_insumo_id=$L_B and deposito_id=$DA)=20,
     'la transferencia no repartió 30/20');"
t "las dos patas comparten grupo" ok \
  "select public.verdad((select count(distinct transferencia_id) from comercial.movimientos_stock
                          where tipo='TRANSFERENCIA_ENTRE_DEPOSITOS')=1, 'las patas no se agrupan');"
t "no se transfiere al mismo depósito" "err:son el mismo" \
  "$GP select comercial.transferir_deposito($L_B,$DC,$DC,5,'x');"
t "no se transfiere más de lo que hay" "err:dejaría el saldo en" \
  "$GP select comercial.transferir_deposito($L_B,$DC,$DA,999,'x');"

echo
echo "── Anulación (RN-54) ────────────────────────────────────────────"
t "anular exige motivo escrito" "err:exige motivo escrito" \
  "$ADM select comercial.anular_movimiento(
        (select id from comercial.movimientos_stock where tipo='SALIDA_DESCARTE' and cantidad=-10),'');"
t "anular crea el inverso" ok \
  "$ADM select comercial.anular_movimiento(
        (select id from comercial.movimientos_stock where tipo='SALIDA_DESCARTE' and cantidad=-10),
        'se cargó sobre el lote equivocado');"
t "el saldo vuelve" ok \
  "select public.verdad((select saldo from comercial.v_existencias where lote_insumo_id=$L_A)=199,
                        'el inverso no devolvió el saldo');"
t "el original queda marcado anulado" ok \
  "select public.verdad((select anulado from comercial.v_kardex where cantidad=-10),
                        'el original no figura anulado');"
t "no se anula dos veces" "err:ya fue anulado" \
  "$ADM select comercial.anular_movimiento(
        (select id from comercial.movimientos_stock where tipo='SALIDA_DESCARTE' and cantidad=-10),'de nuevo');"
t "no se anula una anulación" "err:No se anula una anulación" \
  "$ADM select comercial.anular_movimiento(
        (select id from comercial.movimientos_stock where anula_a_movimiento_id is not null),'x');"

echo
echo "── Vistas ───────────────────────────────────────────────────────"
t "el kardex lleva saldo corrido coherente" ok \
  "select public.verdad((select saldo_posterior from comercial.v_kardex
                          where lote_insumo_id=$L_A order by orden desc limit 1)=199,
                        'el saldo corrido no cierra');"
t "saldo_despachable descuenta lo bloqueado" ok \
  "select public.verdad((select saldo_despachable from comercial.v_stock_por_articulo
                          where articulo_id=$ART_A)=0, 'promete material que no puede salir');"
t "hay un artículo por insumo del catálogo" ok \
  "select public.verdad((select count(*) from comercial.articulos)
                        =(select count(*) from gmp.insumos_catalogo where activo),
                        'faltan artículos de stock');"
t "un artículo no cambia de insumo" "err:no cambia de insumo" \
  "$ADM update comercial.articulos set insumo_id=(select insumo_id from gmp.lotes_insumo where id=$L_B)
        where id=$ART_A;"

echo
echo "── Invariantes de CLAUDE.md §3 ──────────────────────────────────"
psql -t -A -F' │ ' <<<"$DT select invariante, cumple, detalle from core.verificar_invariantes();" | sed 's/^/  /'
t "ninguna invariante en falso" ok \
  "$DT select public.verdad(not exists (select 1 from core.verificar_invariantes() where not cumple),
                            'una invariante estructural no se cumple');"
t "la auditoría registró los movimientos" ok \
  "$DT select public.verdad((select count(*) from core.auditoria
                              where esquema='comercial' and tabla='movimientos_stock')>0,
                            'el libro de stock no está auditado');"

echo
printf "  %s%d pasaron, %d fallaron%s\n\n" "$B" "$PASA" "$FALLA" "$N"
[[ $FALLA -eq 0 ]]
