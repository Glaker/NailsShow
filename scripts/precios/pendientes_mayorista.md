# Lista mayorista 46.14: filas que no se cargaron

Generado por `scripts/precios/generar_lista_mayorista.mjs` desde
`46.14 NAIL SHOW JUNIO 2026 MAYORISTAS.xlsx` (sha256 `8a157a5be6af7980…`).

Se cargaron 178 productos. Estas 114 filas quedaron afuera.
**No se dio de alta ninguno** (pedido del 2026-10-01): la clasificación es para
revisarla con Dirección Técnica. Los packs y cajas van a modelarse como
**composición** de SKUs existentes, sin stock propio.

## (a) Producto simple que falta en el catálogo — 31

| Fila | Código | Producto (planilla) | Precio con promo |
| --- | --- | --- | ---: |
| 80 | 201 | Base para Esmalte tradicional | 2800 |
| 81 | 202 | Top coat para Esmalte tradicional | 2800 |
| 82 | 203 | Esmalte tradicional Blanco French | 2800 |
| 83 | 204 | Esmalte tradicional Negro | 2800 |
| 84 | 205 | Esmalte tradicional Via lactea rosado | 2800 |
| 85 | 206 | Esmalte tradicional Via lactea | 2800 |
| 86 | 207 | Esmalte tradicional Destellos rosas | 2800 |
| 87 | 208 | Esmalte tradicional Azul Marino | 2800 |
| 88 | 209 | Esmalte tradicional Rojo | 2800 |
| 89 | 210 | Esmalte tradicional Rojo fuego | 2800 |
| 90 | 211 | Esmalte tradicional Nude natural | 2800 |
| 91 | 212 | Esmalte tradicional Lila | 2800 |
| 92 | 213 | Esmalte tradicional Fucsia | 2800 |
| 93 | 214 | Esmalte tradicional Rosa | 2800 |
| 145 | 195 | REMOVEDOR NAIL SHOW 1 Lt. | 15000 |
| 192 | 289PACK | SUGGAR XLV Tornasol efecto Violeta X-Fino. PACK x 6unid. | 2000 |
| 250 | 231PACK | Lima 100/100 PACK x 20 unid. | 31350 |
| 251 | 232PACK | Lima 150/150 PACK x 20 unid. | 31350 |
| 252 | 233PACK | Lima 180/180 PACK x 20 unid. | 31350 |
| 253 | 360PACK | Lima 220/220 PACK x 20 unid. | 31350 |
| 254 | 234PACK | Lima/Buffer 180/180 PACK x 10 unid. | 25080 |
| 255 | 235PACK | Lima/Buffer 100/180 x 10 unid. | 25080 |
| 256 | 236PACK | Buffer 100/180 x 10 unid. | 26125 |
| 257 | 237PACK | Buffer 220/280 x 10 unid. | 26125 |
| 258 | 238PACK | Lima Shinner de brillo x 10 unid. | 26125 |
| 315 | 466 | POLVO ACRILICO PARA TIPS 14gr. | 6800 |
| 325 | 801 | COLOR BLENDER Blanco Matte | 4900 |
| 326 | 802 | COLOR BLENDER Negro Matte | 4900 |
| 327 | 803 | COLOR BLENDER Nude Soft Cover | 4900 |
| 328 | 804 | COLOR BLENDER Nude Dark Cover | 4900 |
| 330 | 650 | STENCIL PAQUETE x3 "Esta es la hinchada" - EDICIÓN LIMITADA ARG. MUNDIAL 2026 | 1700 |

## (b) Pack o caja compuesta por SKUs — 80

La composición sale del código (`142PACK` = pack de `142`) y de las unidades
de la planilla. Donde el componente no está en el catálogo, se marca.

| Fila | Código | Producto (planilla) | Precio con promo | Composición / nota |
| --- | --- | --- | ---: | --- |
| 8 | 78PACK | VÍA LÁCTEA 14gr. *LANZAMIENTO* | 3200 | 12 × `78` (no está en el catálogo) |
| 22 | 79PACK | VÍA LÁCTEA 45gr. *LANZAMIENTO* | 9500 | 12 × `79` (no está en el catálogo) |
| 46 | CAJA101 | MONOMERO 100ml 5% OFF | 791350 | 98 × `101` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 47 | CAJA102 | MONOMERO 250ML 5% OFF | 1236900 | 70 × `102` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 48 | CAJA103 | MONOMERO 500ML 5% OFF | 484880 | 16 × `103` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 55 | CAJA105 | PRIMER (Baja Acidez) bandeja cerrada x 91u 5% descuento adicional | 319865 | 91 × `105` |
| 56 | CAJA387 | PRIMER ACIDO bandeja cerrada x 91u 5% de descuento adicional | 328510 | 91 × `387` |
| 57 | CAJA377 | NAIL PREP bandeja cerrada x 91u 5% de descuento adicional | 157339 | 91 × `377` |
| 140 | CAJA384 | CLARIFICADOR ( CLEANSER NUEVO ) 100ml. 5% OFF | 307230 | 98 × `384` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 141 | CAJA385 | CLARIFICADOR ( CLEANSER NUEVO ) 250ml. 5% OFF | 345800 | 70 × `385` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 142 | CAJA386 | CLARIFICADOR ( CLEANSER NUEVO ) 1L. 5% OFF | 270750 | 15 × `386` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 146 | CAJA192 | REMOVEDOR NAIL SHOW 120ml. 5% OFF | 287280 | 112 × `192` (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 147 | CAJA195 | REMOVEDOR NAIL SHOW 1 Lt. 5% OFF | 213750 | 15 × `195` (no está en el catálogo) (unidades deducidas del precio con 5 % de descuento: a confirmar) |
| 152 | 631PACK | PACK x 102 Unid. 34 PIGMENTOS (3 de c/u) 15% OFF | 173400 | 3 × cada uno de los 34 pigmentos (102 unidades); la planilla no dice cuáles 34: a confirmar |
| 153 | 142PACK | PIGMENTO I negro. PACK x 6unid. | 2000 | 6 × `142` |
| 154 | 143PACK | PIGMENTO II blanco. PACK x 6 unid. | 2000 | 6 × `143` |
| 155 | 144PACK | PIGMENTO III rosa. PACK x 6unid. | 2000 | 6 × `144` |
| 156 | 145PACK | PIGMENTO IV celeste . PACK x 6unid. | 2000 | 6 × `145` |
| 157 | 146PACK | PIGMENTO V cobre. PACK x 6unid. | 2000 | 6 × `146` |
| 158 | 147PACK | PIGMENTO VI turquesa. PACK x 6unid. | 2000 | 6 × `147` |
| 159 | 148PACK | PIGMENTO VII rosa oscuro. PACK x 6unid. | 2000 | 6 × `148` |
| 160 | 149PACK | PIGMENTO VIII azul. PACK x 6unid. | 2000 | 6 × `149` |
| 161 | 150PACK | PIGMENTO IX bronce oscuro. PACK x 6unid. | 2000 | 6 × `150` |
| 162 | 151PACK | PIGMENTO X rosa neon . PACK x 6unid. | 2000 | 6 × `151` |
| 163 | 152PACK | PIGMENTO XI verde neon . PACK x 6unid. | 2000 | 6 × `152` |
| 164 | 153PACK | PIGMENTO XII naranja neon . PACK x 6unid. | 2000 | 6 × `153` |
| 165 | 154PACK | PIGMENTO XIII magenta neon . PACK x 6unid. | 2000 | 6 × `154` |
| 166 | 155PACK | PIGMENTO XIV amarillo neon . PACK x 6unid. | 2000 | 6 × `155` |
| 167 | 156PACK | PIGMENTO XV azul oscuro. PACK x 6unid. | 2000 | 6 × `156` |
| 168 | 157PACK | PIGMENTO XVI verde oscuro. PACK x 6unid. | 2000 | 6 × `157` |
| 169 | 158PACK | PIGMENTO XVII violeta . PACK x 6unid. | 2000 | 6 × `158` |
| 170 | 159PACK | PIGMENTO XVIII naranja . PACK x 6unid. | 2000 | 6 × `159` |
| 171 | 161PACK | PIGMENTO XIX dorado . PACK x 6unid. | 2000 | 6 × `161` |
| 172 | 162PACK | PIGMENTO XXI plata . PACK x 6unid. | 2000 | 6 × `162` |
| 173 | 163PACK | PIGMENTO XXII violeta oscuro . PACK x 6unid. | 2000 | 6 × `163` |
| 174 | 164PACK | PIGMENTO XXIII salmón neon . PACK x 6unid. | 2000 | 6 × `164` |
| 175 | 165PACK | PIGMENTO XXIV verde manzana . PACK x 6unid. | 2000 | 6 × `165` |
| 176 | 328PACK | PIGMENTO XXV camaleón lila. PACK x 6unid. | 2000 | 6 × `328` |
| 177 | 329PACK | PIGMENTO XXVI cobre anaranjado. PACK x 6unid. | 2000 | 6 × `329` |
| 178 | 330PACK | PIGMENTO XXVII cobre rojizo. PACK x 6unid. | 2000 | 6 × `330` |
| 179 | 245PACK | PIGMENTO XXVIII violeta neon. PACK x 6unid. | 2000 | 6 × `245` |
| 180 | 246PACK | PIGMENTO XXIX celeste neon. PACK x 6unid. | 2000 | 6 × `246` |
| 181 | 160PACK | PIGMENTO IX oro . PACK x 6unid. *NUEVA PRESENTACIÓN - 8ml* | 2000 | 6 × `160` |
| 189 | 167PACK | SUGGAR XLI Tornasol efecto verde/rosa . PACK x 6unid. | 2000 | 6 × `167` |
| 190 | 168PACK | SUGGAR XLII Transparente . PACK x 6unid. | 2000 | 6 × `168` |
| 191 | 288PACK | SUGGAR XLIV Tornasol efecto Verde/Rosa X-Fino. PACK x 6unid. | 2000 | 6 × `288` |
| 193 | 290PACK | SUGGAR XLVI Turquesa . PACK x 6unid. | 2000 | 6 × `290` |
| 194 | 291PACK | SUGGAR XLVII Verde Neon. PACK x 6unid. | 2000 | 6 × `291` |
| 195 | 292PACK | SUGGAR XLVIII Amarillo Neon . PACK x 6unid. | 2000 | 6 × `292` |
| 196 | 293PACK | SUGGAR XLIX Naranja Neon. PACK x 6unid. | 2000 | 6 × `293` |
| 197 | 294PACK | SUGGAR L Fucsia Neon. PACK x 6unid. | 2000 | 6 × `294` |
| 198 | 295PACK | SUGGAR LI Rosa Neon. PACK x 6unid. | 2000 | 6 × `295` |
| 199 | 296PACK | SUGGAR LII Violeta. PACK x 6unid. | 2000 | 6 × `296` |
| 200 | 297PACK | SUGGAR LIII Negro. PACK x 6 unid. | 2000 | 6 × `297` |
| 201 | 298PACK | SUGGAR Plata. PACK x 6 unid. | 2000 | 12 × `298` (no está en el catálogo) |
| 205 | 300PACK | ACCESORIOS XLVIII Plata Fino. PACK x 6unid. | 2000 | 6 × `300` |
| 206 | 301PACK | ACCESORIOS XLVII Plata. PACK x 6unid. | 2000 | 6 × `301` |
| 207 | 302PACK | ACCESORIOS XLVI Oro. PACK x 6unid. | 2000 | 6 × `302` |
| 208 | 303PACK | ACCESORIOS XLV Plata octogonal . PACK x 6unid. | 2000 | 6 × `303` |
| 209 | 304PACK | ACCESORIOS XLIV Oro tornasol. PACK x 6unid. | 2000 | 6 × `304` |
| 210 | 305PACK | ACCESORIOS XLIII Plata tornasol. PACK x 6unid. | 2000 | 6 × `305` |
| 211 | 306PACK | ACCESORIOS XLII Negro octogonal tornasol. PACK x 6unid. | 2000 | 6 × `306` |
| 212 | 307PACK | ACCESORIOS XLI Plata octogonal tornasol. PACK x 6unid. | 2000 | 6 × `307` |
| 213 | 308PACK | ACCESORIOS XL Champagne octogonal . PACK x 6unid. | 2000 | 6 × `308` |
| 214 | 309PACK | ACCESORIOS XXXIX Fucsia octogonal . PACK x 6unid. | 2000 | 6 × `309` |
| 215 | 310PACK | ACCESORIOS XXXVIII Azul octogonal . PACK x 6unid. | 2000 | 6 × `310` |
| 216 | 311PACK | ACCESORIOS XXXVII Glitter turquesa tornasol. PACK x 6unid. | 2000 | 6 × `311` |
| 217 | 312PACK | ACCESORIOS LASSER XXXVI Glitter fucsia . PACK x 6unid. | 2000 | 6 × `312` |
| 218 | 313PACK | ACCESORIOS LASSER XXXV Violeta . PACK x 6unid. | 2000 | 6 × `313` |
| 219 | 314PACK | ACCESORIOS LASSER XXXIV Azul . PACK x 6unid. | 2000 | 6 × `314` |
| 220 | 315PACK | ACCESORIOS LASSER XXXIII Turquesa . PACK x 6unid. | 2000 | 6 × `315` |
| 221 | 316PACK | ACCESORIOS LASSER XXXII Rosa. PACK x 6unid. | 2000 | 6 × `316` |
| 222 | 317PACK | ACCESORIOS LASSER XXXI Magenta . PACK x 6unid. | 2000 | 6 × `317` |
| 223 | 318PACK | ACCESORIOS LASSER XXX Plata. PACK x 6unid. | 2000 | 6 × `318` |
| 224 | 319PACK | ACCESORIOS LASSER XXIX Negro . PACK x 6unid. | 2000 | 6 × `319` |
| 225 | 331PACK | ACCESORIOS LASSER XXVIII Cobre. PACK x 6unid. | 2000 | 6 × `331` |
| 226 | 332PACK | ACCESORIOS LASSER XXVII Verde. PACK x 6unid. | 2000 | 6 × `332` |
| 227 | 333PACK | ACCESORIOS LASSER XXVI Oro. PACK x 6unid. | 2000 | 6 × `333` |
| 228 | 334PACK | ACCESORIOS LASSER XXV Celeste Oscuro. PACK x 6unid. | 2000 | 6 × `334` |
| 329 | 800PACK | COLOR BLENDER COMBO x 60 unid. (x 24 unid. Blanco Matte, x 12 unid. de los otros) +5% OFF | 279300 | 24 × `801` (no está) + 12 × `802` (no está) + 12 × `803` (no está) + 12 × `804` (no está) |

## (c) No identificado o no es un producto — 3

| Fila | Código | Producto (planilla) | Precio con promo | Composición / nota |
| --- | --- | --- | ---: | --- |
| 75 | PROMO | 2x1 COMPRANDO 20 O MAS TE DUPLICAMOS EL PEDIDO SIN CARGO. | 8485 | Es una promoción de la planilla, no un producto: va como regla de precio. |
| 291 | 419 | corta cuticulas mini mini | 11500 | El código `419` aparece dos veces con precios distintos: 11500/1 · 9200/1 |
| 292 | 419 | PROMO! Llevando 36 mini mini, el exhibidor va de regalo!!! | 9200 | Es una promoción de la planilla, no un producto: va como regla de precio. |
