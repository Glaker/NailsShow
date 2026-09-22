# Pendientes de la carga de saldo de apertura

Generado por `scripts/apertura/generar_migracion.mjs`. No son datos importados: son códigos de
`inventario_apertura.csv` que no están en `gmp.insumos_catalogo` y que por lo tanto no entraron
en la migración generada. Clasificarlos es una decisión de catálogo (RN de qué tipo de insumo son,
si aplica `requiere_protocolo`/`es_inflamable`), no de esta carga. Ver CLAUDE.md §7 y
`docs/DECISIONES_ABIERTAS.md`.

**251 códigos excluidos**, agrupados por familia declarada en la planilla:

- **(sin familia)** (30): 502, 502ET, 503, 504, 505, 506, 507, 507ET, 508, 508ET, 509, 509ET, 514ET, 516ET, 516BOL, 321TEL, 321ETA, 321ETC, 321ETN, 550, 406ET, 406ENV, 407ET
- **ACCESORIOS** (24): 300AC, 301AC, 302AC, 303AC, 304AC, 305AC, 306AC, 307AC, 308AC, 309AC, 310AC, 311AC, 312AC, 313AC, 314AC, 315AC, 316AC, 317AC, 318AC, 319AC, 331AC, 332AC, 333AC, 334AC
- **PINCEL** (19): 105PIN, 105PINCEL, 173, 339, 174, 175, 176, 177, 178, 179, 180, 181, 470, 471, 472, 473, 474, 475, 387PIN
- **FRESAS** (16): 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 356, 357, 358, 359
- **POLVO + MO** (16): 450MO, 451MO, 452MO, 453MO, 454MO, 455MO, 457MO, 458MO, 459MO, 460MO, 461MO, 462MO, 463MO, 464MO, 465MO, 466MO
- **REMERA** (15): 355REM, 356REM, 357REM, 358REM, 359REM, 360REM, 361REM, 362REM, 363REM, 364REM, 365REM, 366REM, 367REM, 368REM, 369REM
- **SUGGAR** (14): 166SUG, 167SUG, 168SUG, 287SUG, 288SUG, 289SUG, 290SUG, 291SUG, 292SUG, 293SUG, 294SUG, 295SUG, 296SUG, 297SUG
- **GEL** (13): 107GEL, 108GEL, 109GEL, 110GEL, 122GEL, 123GEL, 124GEL, 125GEL, 126GEL, 127GEL, 128GEL, 129GEL, 171GEL
- **CREMA** (13): 132CRE, 133CRE, 134CRE, 370CREMA, 371CREMA, 372CREMA, 364CRE, 364CREMA, 365CREMA, 366CREMA, 370CRE, 367CRE, 373CRE
- **GLITTER** (13): 450PPA, MIX01, MIX02, MIX03, MIX04, MIX05, MIX06, MIX07, MIX08, MIX09, MIX10, MIX11, MIX12
- **HERRAMIENTAS** (10): 411, 412, 413, 414, 415, 416, 421, 422, 431, 432
- **DOMES** (9): 122PIN, 123PIN, 124PIN, 125PIN, 126PIN, 127PIN, 128PIN, 129PIN, 171PIN
- **LIMA** (9): 231, 232, 233, 360, 234, 235, 236, 237, 238
- **ETIQUETA** (6): 080ETL, 101ET, 105ET, 399ET
- **TIPS** (5): 510, 511, 513, 516
- **MONOMERO** (3): 101MO, 102MO, 103MO
- **GATILLO** (3): 135GAT
- **LIBRO** (3): 240, 241, 242
- **ENVASE** (3): 131ENV, 387ENV
- **ACEITE** (3): 378AC, 381AC, 249MO
- **CLEANSER** (3): 384MO, 385MO, 386MO
- **BOLSA** (2): 093BOL, 399BOL
- **ESTAMPADO** (2): 107EST, 502EST
- **ALCOHOL + MO** (2): 391MO, 392MO
- **BOMBA** (2): 391BOM
- **VASELINA** (2): 340AC
- **CAJA** (2): 343CAJ, 456CAJA
- **CROP TOP** (2): 370REM, 371REM
- **REMOV + MO** (2): 192MO, 195MO
- **TAPA** (1): 103TAP
- **MONOMEROP** (1): 104MO
- **PRIMER** (1): 105MO
- **BONDER** (1): 106LIQ
- **LAMPARAS** (1): 342
- **CREMERA** (1): 370BOM
- **PRIMER ACIDO** (1): 387MO
- **ARMADO** (1): 456MO
- **MO** (1): 377MO
- **ADHESIVO** (1): 514MO
- **TOALLA** (1): 321TOALLA
- **MITA** (1): 321MO
- **STIGMA** (1): 321ET
- **MUEBLE** (1): 550
- **PORTA CD** (1): 407ENV
- **PINTURA + MO** (1): 201MO
- **4062026** (1): 192ENM
- **v:06/29 P1** (1): 192REM
- **DELANTAL** (1): 198DEL
- **GORRA** (1): 199GOR
- **REMACHE** (1): 199RE

## Caso aparte: código `550`

9 renglones de mobiliario y POP comparten el código `550`, que no es un insumo: es una categoría de
activo fijo. Igual que el resto de esta lista, queda fuera de `gmp.insumos_catalogo` y de esta carga.
