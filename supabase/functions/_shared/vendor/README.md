# Bibliotecas de terceros copiadas en el repositorio

Se copian acá, sin modificar, las bibliotecas que una Edge Function necesita y
que el empaquetador de Supabase no puede importar desde su origen. Cada una
lleva versión fija y hash para verificar que es la publicada.

| Archivo | Origen | Versión | SHA-256 | Licencia | La usa |
| --- | --- | --- | --- | --- | --- |
| `xlsx-0.20.3.mjs` | https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs | 0.20.3 | `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db` | Apache-2.0 | `series-oficiales` (lee la planilla `.xls` del BCRA) |

Por qué no npm: el paquete `xlsx` de npm quedó en 0.18.5, con
vulnerabilidades conocidas; SheetJS publica las versiones nuevas solo en su
CDN. Por qué no el CDN directo: el despliegue falla con «Cannot import from
cdn.sheetjs.com».

Para actualizar: bajar la versión nueva del CDN de SheetJS, reemplazar el
archivo, actualizar esta tabla con el hash (`sha256sum`) y cambiar el import en
`series-oficiales/index.ts`.
