-- ---------------------------------------------------------------------------
-- Propósito : Poder sacar un producto de la lista mayorista. Lo usa
--             20261110150100 para que los «código PACK» pasen a venderse por
--             unidad con su código numérico.
-- Reglas    : §4.12.1 (lista mayorista append-only).
-- Fecha     : 2026-11-10
-- ---------------------------------------------------------------------------
--
-- La lista no tenía forma de sacar un producto: rige la última fila de cada
-- uno. Se agrega «retirado»: una fila nueva con retirado = true lo saca de la
-- lista vigente sin borrar ni editar la historia.

alter table comercial.lista_mayorista
  add column retirado boolean not null default false;

comment on column comercial.lista_mayorista.retirado is
  'La fila saca al producto de la lista vigente (2026-11-10). Append-only: volver a listarlo es otra fila.';

create or replace view comercial.v_lista_mayorista
with (security_invoker = true) as
select producto_id, codigo_interno, producto, numero_lista, rubro, orden_lista,
       precio_lista, precio_promo, unidades_pack, minimo, es_regalo, alicuota_iva,
       precio_base, vigente_desde
  from (
    select distinct on (l.producto_id)
           l.producto_id, pr.codigo_interno, pr.nombre as producto, l.numero_lista, l.rubro, l.orden_lista,
           l.precio_lista, l.precio_promo, l.unidades_pack, l.minimo, l.es_regalo, l.alicuota_iva,
           l.unidades_pack * l.precio_promo as precio_base,
           l.cargado_en as vigente_desde, l.retirado
      from comercial.lista_mayorista l
      join gmp.productos pr on pr.id = l.producto_id
     order by l.producto_id, l.orden desc
  ) v
 where not v.retirado;

comment on view comercial.v_lista_mayorista is
  'Precio mayorista vigente por producto, sin los retirados. precio_base = unidades del pack × precio con promoción: '
  'lo que vale una unidad del código (un pack si es un pack).';
