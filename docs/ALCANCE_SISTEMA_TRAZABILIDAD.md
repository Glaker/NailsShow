# Sistema de Trazabilidad Nail Show SRL

## Documento de alcance y requisitos de usuario (URS)

**Versión del documento:** 02
**Fecha:** 02/09/2026
**Cambios respecto de la v01:** se incorporan al alcance la gestión de stock valorizado, la facturación electrónica y la contabilidad (§2.4, §4.12, §6 RN-51 a RN-66). Se incorpora el conteo asistido por imagen en expedición (§4.13, RN-67 a RN-70). Se actualiza la nómina y la matriz de permisos (§3).
**Destino:** migración a stack React + Supabase + Vercel
**Fuente:** derivado de los POE vigentes de Nail Show SRL y del Anexo I PG.60.13 (listado maestro de POE)

> **Nota de trazabilidad documental.** Cada regla, campo y estado de este documento lleva la cita del POE del que se deriva. Lo que se marca como _supuesto_ o _decisión abierta_ no tiene respaldo documental y requiere confirmación antes de implementarse.

---

## 1. Objetivo y encuadre

### 1.1 Objetivo del sistema

Reemplazar el registro en papel de las operaciones de fabricación, control y liberación de productos cosméticos por un sistema electrónico que garantice la trazabilidad completa de cada lote, desde la recepción del insumo hasta la liberación del producto terminado al mercado, y desde el producto en el mercado de vuelta al insumo que lo originó.

### 1.2 Marco regulatorio aplicable

| Norma                                           | Alcance en el sistema                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposición ANMAT 6477/12                       | Reglamento Técnico Mercosur de BPF para productos de higiene personal, cosméticos y perfumes. Marco general de todo el sistema. Citada explícitamente en I.20.6, I.60.12, PG.60.4, I.20.5, I-E.50.25, I-E.50.26, ME.40.34. |
| Disposición ANMAT 1402/08                       | Retiro de productos del mercado. Clasificación, niveles de auditoría, plazos (PG.60.4 v01).                                                                                                                                |
| Disposición ANMAT 7809/22 (Res. Mercosur 48/21) | Rotulado de productos cosméticos. Aplica a sobrerrotulado de importados (I.20.5 v03).                                                                                                                                      |
| Disposición ANMAT 1108/99 Anexo II              | Límites microbiológicos. Referenciada como criterio de aceptación en I-E.50.26 (Tipo II).                                                                                                                                  |
| Disposición ANMAT 1107/99 Anexo II punto 4      | Cuestionario de referencia para auditoría de verificación de retiro (PG.60.4 v01).                                                                                                                                         |
| GAMP 5, categoría 5                             | Software a medida. Determina el paquete de validación exigible (URS, FS, DS, IQ, OQ, PQ, control de cambios).                                                                                                              |

### 1.3 Qué queda dentro del alcance

**Dominio regulado (BPF).** Recepción de insumos, rotulado y control de estado, muestreo, control de calidad de insumos, producción (pesada, elaboración de granel, fraccionamiento, acondicionamiento, etiquetado), control de calidad de semielaborado, granel y producto terminado, contramuestras de archivo, liberación por Dirección Técnica, expedición, y los procesos transversales de no conformidad con plan CAPA, reclamos, devoluciones y retiro de mercado. Incluye el circuito de producto terminado importado, que tiene su propio recorrido.

**Dominio comercial y contable.** Gestión de stock valorizado con costeo por lote, emisión de comprobantes electrónicos con CAE ante ARCA, cuentas corrientes de clientes y proveedores, registro de compras y ventas, y libro IVA digital. Este bloque reemplaza al sistema externo HOLISSTOR.

### 1.4 Qué queda fuera del alcance

Capacitación del personal (PG.60.2), control de plagas (PG.60.11), gestión de residuos (PG.60.15), mantenimiento (I.70.2) y sistema de agua (I.70.1), que son procesos registrados pero ajenos a la trazabilidad del lote. Cosmetovigilancia (PG.60.19), que está en revisión y todavía no tiene procedimiento cerrado. Liquidación de sueldos y cargas sociales. Balance y estados contables de presentación, que quedan a cargo del estudio contable a partir de los libros que el sistema exporta.

### 1.5 Sobre la convivencia de los dos dominios

Incorporar facturación y contabilidad al mismo sistema que sostiene el registro BPF tiene una consecuencia que conviene tener presente desde el principio: **el alcance de validación no debe extenderse al bloque comercial**. Un cambio en una alícuota de IVA no puede obligar a revalidar el módulo de liberación de lote.

La forma de evitarlo es la separación por esquema dentro de la misma base: `gmp` para todo lo regulado y `comercial` para lo fiscal y contable, con una única superficie de contacto explícita y auditada (el movimiento de stock que genera un remito sobre un lote liberado). Cada esquema tiene su propio control de cambios y su propio nivel de validación. Comparten la base de datos, la identidad de usuarios y la auditoría, y nada más.

El riesgo real que se evita con esto no es técnico. Es que la urgencia de un tema fiscal, que siempre tiene fecha de vencimiento, arrastre a producción cambios sin validar sobre el módulo que un inspector va a mirar.

---

## 2. Procesos cubiertos

### 2.1 Circuito principal: insumo nacional a producto terminado

```
RECEPCIÓN (I.20.1)
  ↓ rotulado cuarentena R.20.2.1 (I.20.2)
  ↓ traslado a depósito de cuarentena (N°01 envase/empaque, N°04 materia prima)
  ↓ caso especial: materia prima inflamable → depósito exterior (I.20.6)
MUESTREO (I.50.4) → etiqueta R.50.4.1
  ↓
CONTROL DE CALIDAD DE INSUMOS (I.50.5) → registro R.50.5.1
  ↓ aprobado: rerotulado verde, traslado a depósito aprobado (N°05 materia prima)
  ↓ rechazado: rerotulado rojo
PESADA (I.40.16) → rótulo R.40.16.1 por insumo pesado
  ↓
ELABORACIÓN DE GRANEL (ME.40.xx) → batch record R.40.xx.1
  ↓ rotulado R.20.2.2 cuarentena
MUESTREO DE GRANEL (I.50.4, inmediatamente finalizada la elaboración)
  ↓
CC DE GRANEL (I.50.10) → registro R.50.10.1
  ↓ aprobado
FRACCIONAMIENTO (ME.40.xx, sección de fraccionamiento)
  ↓ loteado con etiquetadora, envasado, tapado, recuento por canasta
  ↓ rotulado de canasta R.20.2.2 cuarentena
MUESTREO DE PRODUCTO TERMINADO (I.50.4)
  ↓
CC DE PRODUCTO TERMINADO (I.50.7) → registro R.50.7.1
  ↓
ARCHIVO DE CONTRAMUESTRA (I.60.12) → rótulo R.60.12.1, registro R.60.12.2
  ↓
REVISIÓN DE DOCUMENTACIÓN DEL LOTE (batch record completo)
  ↓
LIBERACIÓN AL MERCADO: firma de Dirección Técnica
  ↓
EXPEDICIÓN (I.20.3)
```

### 2.2 Circuito paralelo: producto terminado importado (I.20.5 v03)

El orden de pasos cambió en la versión 03 y conviene respetarlo tal cual:

1. Recepción en área de Recepción/Expedición, control contra documentación del fabricante.
2. Rotulado R.20.2.2 estatus cuarentena, color amarillo.
3. Traslado al Depósito N°20 de producto terminado importado cuarentena.
4. Registro de entrada en la planilla R.20.1.1.
5. Pesada de todos los bultos y verificación de similitud. Bulto disparejo obliga a abrirlo y contar unidades.
6. Ingreso al sistema de stock externo.
7. Sobrerrotulado en el sector de Acondicionamiento, cuando corresponda.
8. Muestreo del lote y envío a Control de Calidad (registro R.50.30.1).
9. Si cumple especificación, separar 2 envases para contramuestra de archivo.
10. Rerotulado a aprobado, estatus verde.
11. Registro de salida en R.20.1.1.
12. Traslado al Depósito N°19 de producto terminado importado aprobado.
13. Producto habilitado para comercialización según I.20.3.

Regla adicional de I.60.12: en importados, cada operación de acondicionamiento que abra el material secundario genera su propia contramuestra, por el riesgo de contaminación cruzada durante el estuchado.

### 2.3 Procesos transversales

| Proceso                    | POE         | Registro                  | Disparador                                                                                   |
| -------------------------- | ----------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| No conformidad y plan CAPA | PG.60.18    | R.60.18.1                 | Reclamo de cliente, detección interna, falla de proveedor, inspección de autoridad sanitaria |
| Reclamos                   | PG.60.3     | R.60.3.1                  | Comunicación del cliente por teléfono, correo o presencial                                   |
| Devoluciones               | PG.60.9     | R.60.9.1                  | Recepción física de producto devuelto                                                        |
| Retiro de mercado          | PG.60.4 v01 | R.60.4.1, rótulo R.60.4.2 | Decisión voluntaria de la empresa u orden de ANMAT                                           |
| Muestras de archivo        | I.60.12 v02 | R.60.12.1, R.60.12.2      | Aprobación de cada lote de producto terminado                                                |
| Etiquetado de envases      | I.40.23     | R.40.23.1                 | Preparación de envase primario antes del fraccionamiento                                     |

### 2.4 Circuito comercial y contable

```
PEDIDO DEL CLIENTE (Administración)
  ↓ reserva de stock sobre lotes LIBERADOS
PREPARACIÓN Y CONTROL DE EXPEDICIÓN (I.20.3)
  ↓ conteo de unidades por SKU, asistido por imagen (§4.13)
REMITO
  ↓ movimiento de stock de salida, valorizado al costo del lote
FACTURA ELECTRÓNICA
  ↓ solicitud de CAE a ARCA, comprobante A, B o C según condición del cliente
  ↓ imputación a cuenta corriente del cliente
COBRANZA
  ↓ recibo, imputación contra comprobantes pendientes
ASIENTO CONTABLE
  ↓ registro en libro IVA ventas
```

El circuito de compras es el espejo: la recepción de insumos (I.20.1) genera el movimiento de entrada valorizado, la factura del proveedor se imputa a su cuenta corriente y alimenta el libro IVA compras.

Punto de diseño que conviene fijar ahora: **la recepción física y la recepción fiscal son eventos distintos**. Hoy conviven en el mismo formulario, con los campos de monto, método de pago y número de AP o factura que la Gerencia de Producción carga después. El sistema los separa en dos registros vinculados, porque tienen momentos, responsables y consecuencias diferentes. El insumo puede estar en cuarentena mientras la factura ya está contabilizada, y a la inversa.

---

## 3. Actores y matriz de permisos

### 3.1 Nómina vigente

| Sector                                                                 | Personas                                              | Cantidad        |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | --------------- |
| Gerencia General                                                       | Jorge Bakas, Virginia Arleo                           | 2               |
| Dirección Técnica (cubre Control de Calidad **y** Garantía de Calidad) | Anabella Gregorini (titular), Eliseo Agustín Coggiola | 2               |
| Gerencia de Producción (cubre además Recepción/Expedición y Depósitos) | Nazarena Bakas                                        | 1               |
| Producción (operarios)                                                 | Emilse, Brisa, y 3 personas pendientes de identificar | 5               |
| Administración y Contabilidad                                          | Diego                                                 | 1               |
| Administrador del sistema                                              | Eliseo Agustín Coggiola                               | (rol adicional) |

**Total: 11 personas.**

> **Desvío documental abierto.** PG.60.1 v01 declara 7 personas y un organigrama que ya no coincide con la realidad: nombra a Flavio Baez en Administración, ubica a Virginia Arleo en Gerencia Administrativa de Producción, y no contempla a los operarios actuales. El organigrama documentado es una exigencia explícita de BPF. Corresponde emitir PG.60.1 v03 antes de que el sistema entre en producción, porque la matriz de permisos deriva de él. Ver inconsistencia 16 en §10.

**Sobre la Dirección Técnica.** Ante ANMAT existe un Director Técnico registrado, con responsabilidad legal personal e indelegable sobre la liberación de cada lote. Dos personas en el rol se modelan como **titular** y **suplente**, con el campo `es_dt_titular` en `usuarios`. Ambos pueden firmar liberaciones, y cada firma queda atribuida a la persona concreta que la ejecutó. El sistema no permite firmar en representación de otro bajo ninguna circunstancia.

**Sobre el rol de administrador del sistema.** Eliseo Agustín Coggiola ocupa dos roles simultáneos: Dirección Técnica y administrador del sistema. Conviene que sean dos credenciales de rol separadas sobre el mismo usuario, y no un rol único que acumule ambos poderes, por la razón que se desarrolla en §3.5.

### 3.2 Responsabilidades por sector (PG.60.1 v01, punto 2)

**Dirección Técnica.** Supervisar elaboración e importación. Asegurar cumplimiento normativo. Confeccionar y supervisar documentación técnica. Supervisar el archivo documental. Revisar y evaluar incidentes y reclamos. Ser interlocutor ante autoridades sanitarias.

**Control de Calidad.** Aprobar instrucciones y procedimientos de calidad. Monitorear ambiente del área de producción. Calibrar balanzas. Definir especificaciones. Aprobar o rechazar materias primas, materiales de envase y empaque, semielaborados, graneles y terminados.

**Garantía de Calidad.** Autorizar procedimientos y sus actualizaciones. Monitorear cumplimiento de BPF. Capacitar. Realizar auditorías internas. Aprobar proveedores. Investigar no conformidades y reclamos. Archivar documentos.

**Recepción/Expedición.** Recibir al proveedor. Verificar e inspeccionar insumos. Ingresar al sistema de stock. Preparar pedidos. Completar registros del sector.

**Producción.** Elaborar según procedimientos. Aprobar e implementar instrucciones de producción incluyendo controles de proceso. Asegurar que los registros de producción sean evaluados y firmados por personal designado **antes** de pasar a Control de Calidad. Archivar documentos del sector.

**Depósitos.** Almacenar en condiciones y depósitos correspondientes.

**Administración.** Atención al cliente. Recepción de pedidos. Gestión de redes.

### 3.3 Matriz de permisos propuesta

Roles del sistema, con la correspondencia al sector del POE:

| Rol del sistema         | Sector POE                                 | Personas hoy                                  |
| ----------------------- | ------------------------------------------ | --------------------------------------------- |
| `OPERARIO`              | Producción, Recepción/Expedición, Depósito | Emilse, Brisa y 3 a identificar               |
| `CONTROL_CALIDAD`       | Control de Calidad                         | Anabella Gregorini, Eliseo Coggiola           |
| `DIRECCION_TECNICA`     | Dirección Técnica y Garantía de Calidad    | Anabella Gregorini (titular), Eliseo Coggiola |
| `ADMINISTRACION`        | Administración y Contabilidad              | Diego                                         |
| `GERENCIA_PRODUCCION`   | Gerencia de Producción                     | Nazarena Bakas                                |
| `GERENCIA`              | Gerencia General                           | Jorge Bakas, Virginia Arleo                   |
| `ADMINISTRADOR_SISTEMA` | Sin equivalente en el POE                  | Eliseo Coggiola                               |

Referencias: OP = operario, CC = control de calidad, DT = dirección técnica, ADM = administración y contabilidad, GP = gerencia de producción, GG = gerencia general, SYS = administrador del sistema.

**Dominio regulado**

| Operación                            | OP      | CC      | DT      | ADM     | GP      | GG      | SYS     |
| ------------------------------------ | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| Registrar recepción física de insumo | ✔       | ✔       | ✔       |         | ✔       |         |         |
| Alta de proveedor                    |         |         | ✔       | ✔       | ✔       |         |         |
| Aprobar proveedor                    |         |         | ✔       |         |         |         |         |
| Emitir rótulo de estado              | ✔       | ✔       | ✔       |         | ✔       |         |         |
| Registrar muestreo                   |         | ✔       | ✔       |         |         |         |         |
| Cargar resultado de CC               |         | ✔       | ✔       |         |         |         |         |
| Decidir aprobado o rechazado         |         | ✔       | ✔       |         |         |         |         |
| Registrar pesada                     | ✔       |         |         |         | ✔       |         |         |
| Ejecutar etapa de producción         | ✔       |         |         |         | ✔       |         |         |
| Firmar «Controló» de una etapa       |         | ✔       | ✔       |         | ✔       |         |         |
| Cargar contramuestra                 |         | ✔       | ✔       |         |         |         |         |
| Firmar liberación al mercado         |         |         | ✔       |         |         |         |         |
| Abrir no conformidad                 | ✔       | ✔       | ✔       | ✔       | ✔       | ✔       |         |
| Cerrar no conformidad                |         |         | ✔       |         |         |         |         |
| Registrar reclamo                    |         |         | ✔       | ✔       |         |         |         |
| Responder y cerrar reclamo           |         |         | ✔       |         |         |         |         |
| Iniciar retiro de mercado            |         |         | ✔       |         |         |         |         |
| Definir o modificar especificación   |         | ✔       | ✔       |         |         |         |         |
| Definir o modificar procedimiento    |         |         | ✔       |         |         |         |         |
| Consultar registros y trazabilidad   | ✔       | ✔       | ✔       | ✔       | ✔       | ✔       | ✔       |
| Editar o borrar un registro firmado  | ninguno | ninguno | ninguno | ninguno | ninguno | ninguno | ninguno |

**Dominio comercial y contable**

| Operación                                  | OP  | CC  | DT  | ADM | GP  | GG  | SYS |
| ------------------------------------------ | --- | --- | --- | --- | --- | --- | --- |
| Alta y edición de cliente                  |     |     |     | ✔   | ✔   | ✔   |     |
| Definir lista de precios                   |     |     |     | ✔   |     | ✔   |     |
| Registrar pedido                           |     |     |     | ✔   | ✔   |     |     |
| Preparar y controlar expedición            | ✔   |     |     |     | ✔   |     |     |
| Confirmar conteo asistido por imagen       | ✔   |     |     |     | ✔   |     |     |
| Emitir remito                              |     |     |     | ✔   | ✔   |     |     |
| Emitir factura y solicitar CAE             |     |     |     | ✔   |     | ✔   |     |
| Anular comprobante con nota de crédito     |     |     |     | ✔   |     | ✔   |     |
| Registrar factura de proveedor             |     |     |     | ✔   |     |     |     |
| Registrar cobranza o pago                  |     |     |     | ✔   |     | ✔   |     |
| Ajustar stock por diferencia de inventario |     |     | ✔   | ✔   | ✔   |     |     |
| Cerrar período contable                    |     |     |     | ✔   |     | ✔   |     |
| Ver costos, márgenes y rentabilidad        |     |     |     | ✔   |     | ✔   |     |
| Exportar libros IVA y subdiarios           |     |     |     | ✔   |     | ✔   |     |

**Administración del sistema**

| Operación                                                | SYS     | otros            |
| -------------------------------------------------------- | ------- | ---------------- |
| Alta, baja y cambio de rol de usuarios                   | ✔       | ninguno          |
| Configurar maestros técnicos (depósitos, equipos, enums) | ✔       | DT sobre equipos |
| Configurar parámetros fiscales y puntos de venta         | ✔       | ADM              |
| Gestionar certificados y credenciales de integración     | ✔       | ninguno          |
| Ver la traza de auditoría completa                       | ✔       | DT               |
| Restaurar respaldo                                       | ✔       | ninguno          |
| Modificar o borrar asientos de auditoría                 | ninguno | ninguno          |
| Firmar en nombre de otro usuario                         | ninguno | ninguno          |
| Modificar un registro firmado                            | ninguno | ninguno          |

### 3.4 El problema de la separación de funciones

Esta es la tensión de diseño más importante del sistema y no se resuelve programando.

Los POE exigen doble firma en cada etapa productiva: el batch record R.40.26.1 y R.40.27.1 cierran cada bloque con `Realizó: … Fecha: … Hora: …    Controló: … Fecha: … Hora: …`. Con 7 personas, de las cuales solo 2 pueden operar producción y una sola persona ocupa simultáneamente Dirección Técnica, Control de Calidad y Garantía de Calidad, la separación estricta hace que buena parte de los flujos no tenga a quién asignar la segunda firma.

Hay una segunda tensión, más fina. PG.60.1 dice que **Control de Calidad** aprueba o rechaza insumos y productos. I.50.6 e I.50.7 dicen que Control de Calidad ejecuta el análisis e **informa a Dirección Técnica** para que decida. Como la misma persona ocupa ambos puestos, en papel la contradicción es invisible. En el sistema hay que elegir uno de los dos modelos, porque determina quién es el sujeto de la política de escritura sobre el veredicto.

**Recomendación:** implementar la separación como configurable por tipo de registro, con tres modos (obligatoria, advertencia registrada, no aplica), y arrancar en modo advertencia para las etapas donde hoy no hay dotación. Cada advertencia queda en auditoría como desvío justificado. Esto es defendible ante un inspector: el sistema conoce la regla, la aplica donde puede, y deja huella donde no. Bloquear duro un flujo que la planta no puede cumplir lleva a que el operario busque la vuelta, que es peor que registrar el desvío.

### 3.5 Sobre el rol de administrador del sistema

Pediste superpermiso de administrador. Corresponde dártelo, y también explicar dónde conviene ponerle un techo, porque un administrador verdaderamente omnipotente destruye el valor probatorio de todo el sistema.

El razonamiento es corto. Si existe una credencial capaz de alterar un registro firmado o borrar un asiento de auditoría, entonces **ningún registro del sistema prueba nada**, porque cualquiera de ellos pudo haber sido escrito o modificado por esa credencial. Un inspector que descubra esa capacidad no cuestiona el registro que está mirando: cuestiona la validez del sistema entero. El poder de modificar todo y el poder de probar algo son mutuamente excluyentes.

Por eso la propuesta es la siguiente. El rol `ADMINISTRADOR_SISTEMA` tiene control total sobre configuración, usuarios, roles, integraciones, respaldos y lectura de absolutamente todo, incluida la traza de auditoría completa. Lo que no tiene es capacidad de escritura sobre registros firmados ni sobre la auditoría, y esa restricción vive en Postgres como ausencia de política, no como una condición en el código de la aplicación. Ni siquiera el rol `postgres` de la aplicación la puede saltear, porque la conexión corre bajo un rol sin `BYPASSRLS`.

Para las situaciones excepcionales que igual van a existir (un dato mal cargado en un registro ya firmado, un lote asignado al producto equivocado), la salida no es editar. Es el mecanismo que los propios POE ya definen: apertura de no conformidad según PG.60.18, corrección documentada, y registro rectificativo que apunta al original sin borrarlo. El dato erróneo queda visible junto a su corrección, que es exactamente lo que BPF pide.

Si aun así hace falta una capacidad de emergencia sobre la base, la forma correcta es un acceso administrativo directo a Postgres, fuera de la aplicación, con credencial distinta, motivo escrito y notificación automática a la Dirección Técnica titular. Se usa una vez cada varios años y queda registrado que se usó.

Hay además una razón práctica, independiente de lo regulatorio: vos también tenés rol de Dirección Técnica. Si las dos capacidades viven en la misma credencial, cada vez que firmes una liberación un auditor puede preguntar si esa firma la puso vos o la puso el administrador. Dos credenciales separadas sobre el mismo usuario eliminan la pregunta.

---

## 4. Modelo de datos

Nomenclatura: `snake_case`, tablas en plural, claves primarias `uuid` salvo donde el POE define un identificador de negocio. Todo campo `*_por` es una referencia a `usuarios(id)`.

### 4.1 Identidad y organización

```sql
usuarios (
  id                 uuid PK,
  auth_user_id       uuid UNIQUE,          -- referencia a auth.users de Supabase
  nombre_completo    text NOT NULL,
  documento          text,
  email              text UNIQUE,
  rol                rol_enum NOT NULL,
  roles_adicionales  rol_enum[] NOT NULL DEFAULT '{}',
  es_dt_titular      boolean NOT NULL DEFAULT false,
  sector             sector_enum NOT NULL,
  activo             boolean NOT NULL DEFAULT true,
  fecha_alta         date NOT NULL,
  fecha_baja         date,
  CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta)
)
```

Regla de PG.60.1: un usuario nunca se borra, se pasa a `activo = false`. Borrarlo rompe la trazabilidad de registros históricos.

```sql
depositos (
  id            uuid PK,
  numero        text UNIQUE,               -- '01', '04', '05', '19', '20'
  nombre        text NOT NULL,
  tipo_contenido tipo_contenido_enum,      -- MATERIA_PRIMA | ENVASE_EMPAQUE | GRANEL |
                                           -- PT_NACIONAL | PT_IMPORTADO | CONTRAMUESTRA |
                                           -- RETIRO_MERCADO | INFLAMABLES
  estado_admitido estado_calidad_enum,     -- CUARENTENA | APROBADO | RECHAZADO | NULL (cualquiera)
  es_exterior   boolean DEFAULT false,
  activo        boolean DEFAULT true
)
```

Depósitos identificados en los POE: N°01 materiales de envase y empaque cuarentena (I.20.1), N°04 materia prima cuarentena (I.20.1), N°05 materia prima aprobada (I.40.16), N°19 producto terminado importado aprobado (I.20.5), N°20 producto terminado importado cuarentena (I.20.5), Depósito de Materias Primas Inflamables certificado, ubicado en el exterior (I.20.6), Depósito de Graneles Cuarentena (R.40.27.1), Depósito de Envases Aprobados (I.40.23), Depósito de Contramuestras cosméticas (I.60.12), Depósito de Retiro de Mercado (PG.60.4).

### 4.2 Proveedores e insumos

```sql
proveedores (
  id                  uuid PK,
  razon_social        text NOT NULL,
  cuit                text,
  contacto_nombre     text,
  contacto_telefono   text,
  contacto_email      text,
  domicilio           text,
  estado_aprobacion   aprobacion_proveedor_enum NOT NULL DEFAULT 'PENDIENTE',
                                           -- PENDIENTE | APROBADO | RECHAZADO
  aprobado_por        uuid REFERENCES usuarios(id),
  aprobado_en         timestamptz,
  observaciones       text,
  activo              boolean DEFAULT true
)

insumos_catalogo (
  id                     uuid PK,
  codigo_interno         text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  tipo                   tipo_insumo_enum NOT NULL,  -- MATERIA_PRIMA | MATERIAL_ENVASE |
                                                     -- MATERIAL_EMPAQUE | ETIQUETA | SEMIELABORADO
  unidad_medida          text NOT NULL,
  es_inflamable          boolean NOT NULL DEFAULT false,
  requiere_protocolo     boolean NOT NULL DEFAULT false,
  requiere_pesada_recepcion boolean NOT NULL DEFAULT false,  -- pigmentos, I.20.1 paso 5
  deposito_cuarentena_id uuid REFERENCES depositos(id),
  deposito_aprobado_id   uuid REFERENCES depositos(id),
  activo                 boolean DEFAULT true
)
```

`requiere_protocolo` se deriva de I.20.1 paso 5: las materias primas deben recibirse con protocolo de análisis del fabricante. `es_inflamable` dispara el circuito de I.20.6. `requiere_pesada_recepcion` cubre la regla de los pigmentos, que se pesan antes de continuar el proceso.

### 4.3 Recepción

```sql
recepciones (
  id                    uuid PK,
  numero                text UNIQUE NOT NULL,        -- correlativo/año
  fecha_hora            timestamptz NOT NULL DEFAULT now(),
  proveedor_id          uuid NOT NULL REFERENCES proveedores(id),
  proveedor_nuevo       boolean NOT NULL DEFAULT false,
  numero_remito         text NOT NULL,
  coincide_con_pedido   boolean NOT NULL,
  observaciones         text,
  -- carga administrativa diferida
  numero_ap_factura     text,
  metodo_pago           text,
  monto                 numeric(14,2),
  moneda                text DEFAULT 'ARS',
  cargado_a_stock       boolean NOT NULL DEFAULT false,
  cargado_por           uuid REFERENCES usuarios(id),
  cargado_en            timestamptz,
  registrado_por        uuid NOT NULL REFERENCES usuarios(id),
  creado_en             timestamptz NOT NULL DEFAULT now()
)
```

> **Campos sin respaldo en POE.** `metodo_pago`, `monto`, `numero_ap_factura`, `cargado_a_stock` y `proveedor_nuevo` no aparecen en I.20.1. Provienen del formulario de Google que usaba la Gerencia de Producción y son necesidades administrativas legítimas. Se mantienen, marcados como extensión de negocio, sin efecto sobre la lógica regulatoria.

```sql
lotes_insumo (
  id                    uuid PK,
  recepcion_id          uuid NOT NULL REFERENCES recepciones(id),
  insumo_id             uuid NOT NULL REFERENCES insumos_catalogo(id),
  numero_registro_interno text UNIQUE NOT NULL,   -- I.20.1 paso 7
  lote_proveedor        text NOT NULL,
  plazo_validez         date,
  cantidad_bultos       integer NOT NULL,
  cantidad_unidades     numeric(14,3),
  unidad                text NOT NULL,
  -- verificaciones de recepción
  bultos_peso_similar   boolean,                   -- NULL si no aplica
  unidades_contadas     numeric(14,3),             -- obligatorio si bultos_peso_similar = false
  planchas_etiquetas    integer,
  etiquetas_por_plancha integer,
  total_etiquetas       integer GENERATED ALWAYS AS (planchas_etiquetas * etiquetas_por_plancha) STORED,
  protocolo_recibido    boolean,
  protocolo_archivo_url text,
  peso_pigmento_kg      numeric(10,4),
  contenedores_limpiados boolean NOT NULL DEFAULT false,
  estado                estado_calidad_enum NOT NULL DEFAULT 'RECIBIDO',
  deposito_actual_id    uuid REFERENCES depositos(id),
  creado_en             timestamptz NOT NULL DEFAULT now()
)
```

### 4.4 Rótulos

```sql
rotulos (
  id                uuid PK,
  tipo_registro     text NOT NULL,        -- 'R.20.2.1' | 'R.20.2.2' | 'R.50.4.1' |
                                          -- 'R.40.16.1' | 'R.60.12.1' | 'R.60.4.2' | 'R.60.9.2'
  version_formato   text NOT NULL,        -- '00' | '01' | '02'
  entidad_tipo      text NOT NULL,        -- 'lote_insumo' | 'lote_producto' | 'muestreo' | …
  entidad_id        uuid NOT NULL,
  estado            estado_calidad_enum NOT NULL,
  color             text NOT NULL,        -- derivado del estado, ver §6 regla RN-04
  contenido         jsonb NOT NULL,       -- campos del rótulo según formato
  emitido_por       uuid NOT NULL REFERENCES usuarios(id),
  emitido_en        timestamptz NOT NULL DEFAULT now(),
  vigente           boolean NOT NULL DEFAULT true,
  reemplazado_por   uuid REFERENCES rotulos(id)
)
```

Campos de `contenido` según el formato, tomados literalmente de los registros:

- **R.20.2.1 v01 (insumos):** nombre, n°lote proveedor, nombre proveedor, n°interno/código, plazo de validez, estatus.
- **R.20.2.2 v01 (productos):** código, nombre, tipo de producto, n°lote, plazo de validez, estatus.
- **R.50.4.1 (muestreo):** material muestreado, n°interno/código, n°lote proveedor, responsable toma de muestra, fecha toma de muestra.
- **R.40.16.1 (pesada):** nombre, n°lote, cantidad pesada/medida, fecha, firma.
- **R.60.12.1 v02 (contramuestra):** nombre del producto terminado, n°lote, fecha de vencimiento.
- **R.60.4.2 (retiro):** nombre, n°lote, n° de formulario R.60.4.1.

> El rótulo nunca se edita. Un cambio de estado emite un rótulo nuevo y marca el anterior `vigente = false`. Esto reproduce la instrucción de I.20.2: «ante el cambio de estado del insumo, se deberá rotular nuevamente».

### 4.5 Muestreo

```sql
muestreos (
  id                     uuid PK,
  numero                 text UNIQUE NOT NULL,
  entidad_tipo           text NOT NULL,     -- 'lote_insumo' | 'lote_producto'
  entidad_id             uuid NOT NULL,
  categoria              categoria_muestreo_enum NOT NULL,
                         -- MATERIAL_ENVASE_EMPAQUE | MATERIA_PRIMA |
                         -- SEMIELABORADO_GRANEL | PRODUCTO_TERMINADO
  cantidad_calculada     numeric(10,3),
  cantidad_tomada        numeric(10,3) NOT NULL,
  unidad                 text NOT NULL,
  tamano_envase_gr       numeric(8,2),      -- solo PT
  envases_muestreados    integer,           -- solo PT
  -- verificaciones previas obligatorias (I.50.4)
  contenedor_integro     boolean NOT NULL,
  contenedor_limpio      boolean NOT NULL,
  rotulado_correcto      boolean NOT NULL,
  lote_coincide_certificado boolean,
  cantidad_contenedores_verificada integer,
  circunstancia_inusual  text,
  signos_no_conformidad  text,
  destino_sobrante       destino_muestra_enum,  -- CONTRAMUESTRA | DESCARTE | REUTILIZACION_ENVASE
  area_muestreo          text NOT NULL,
  realizado_por          uuid NOT NULL REFERENCES usuarios(id),
  fecha_hora             timestamptz NOT NULL DEFAULT now()
)
```

### 4.6 Especificaciones

Esta es la parte del modelo que hay que diseñar con más cuidado, porque los parámetros del POE no son homogéneos.

```sql
especificaciones (
  id                     uuid PK,
  codigo_poe             text NOT NULL,     -- 'I-E.50.25'
  version                text NOT NULL,     -- '00'
  producto_id            uuid NOT NULL REFERENCES productos(id),
  variedad               text,              -- 'AIRE' | 'AMOR' | 'PAZ' | NULL
  tipo_producto          tipo_producto_enum NOT NULL,  -- SEMIELABORADO | GRANEL | TERMINADO
  denominacion           text NOT NULL,
  composicion_inci       text,
  forma_cosmetica        forma_cosmetica_enum,  -- SOLIDA_POLVO | LIQUIDA | SEMISOLIDA | HIDROALCOHOLICA
  condiciones_almacenamiento text,
  instrucciones_muestreo text,
  periodo_reanalisis_meses integer,          -- NULL = «no corresponde»
  vida_util_meses        integer NOT NULL,
  estado                 estado_documento_enum NOT NULL,  -- BORRADOR | VIGENTE | DADO_DE_BAJA
  vigencia_desde         date,
  vigencia_hasta         date,
  emitida_por            uuid REFERENCES usuarios(id),
  aprobada_por           uuid REFERENCES usuarios(id),
  UNIQUE (codigo_poe, version, variedad)
)

espec_formula (
  id                uuid PK,
  especificacion_id uuid NOT NULL REFERENCES especificaciones(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  componente        text NOT NULL,          -- nombre INCI o comercial
  porcentaje_min    numeric(8,4),
  porcentaje_max    numeric(8,4),
  es_csp            boolean DEFAULT false,  -- «csp 100 %» del I-E.50.26
  cantidad_absoluta numeric(12,4),          -- formatos viejos usan gramos, no porcentaje
  unidad_absoluta   text
)

espec_parametros (
  id                uuid PK,
  especificacion_id uuid NOT NULL REFERENCES especificaciones(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  nombre            text NOT NULL,          -- 'DENSIDAD', 'PH', 'ASPECTO', 'TIEMPO DE CURADO'
  grupo             grupo_parametro_enum NOT NULL,
                    -- FISICOQUIMICO | FUNCIONAL | ORGANOLEPTICO | MICROBIOLOGICO
  tipo_criterio     tipo_criterio_enum NOT NULL,
                    -- RANGO | MINIMO | MAXIMO | VALOR_TEXTO |
                    -- CONTRA_PATRON | REFERENCIA_EXTERNA | BINARIO
  valor_min         numeric(14,6),
  valor_max         numeric(14,6),
  valor_texto       text,
  unidad            text,
  metodo_ensayo     text,                   -- 'I.50.25 densitómetro de vidrio', 'pHmetro ADWA AD12'
  condicion_ensayo  text,                   -- '24-25 °C'
  referencia_norma  text,                   -- 'DISP. ANMAT 1108/99 ANEXO II TIPO II'
  obligatorio       boolean NOT NULL DEFAULT true,
  CHECK (
    (tipo_criterio = 'RANGO'    AND valor_min IS NOT NULL AND valor_max IS NOT NULL) OR
    (tipo_criterio = 'MINIMO'   AND valor_min IS NOT NULL) OR
    (tipo_criterio = 'MAXIMO'   AND valor_max IS NOT NULL) OR
    (tipo_criterio IN ('VALOR_TEXTO','CONTRA_PATRON') AND valor_texto IS NOT NULL) OR
    (tipo_criterio = 'REFERENCIA_EXTERNA' AND referencia_norma IS NOT NULL) OR
    (tipo_criterio = 'BINARIO')
  )
)
```

**Los seis tipos de criterio salen directamente de los POE:**

| Tipo                         | Ejemplo textual                                                | Fuente    | Evaluable automáticamente                       |
| ---------------------------- | -------------------------------------------------------------- | --------- | ----------------------------------------------- |
| `RANGO`                      | Densidad 0.9100 – 0.9200 g/ml                                  | I-E.50.25 | Sí                                              |
| `MINIMO`                     | Volátiles ≥ 95 %                                               | I-E.50.25 | Sí                                              |
| `RANGO` con unidad de tiempo | Curado 6 min – 9 min a 24-25 °C                                | I-E.50.25 | Sí, guardando segundos                          |
| `VALOR_TEXTO`                | Aspecto: líquido translúcido, sin turbidez ni agentes externos | I-E.50.25 | No, requiere juicio del analista                |
| `CONTRA_PATRON`              | Olor característico según patrón                               | I-E.50.26 | No, requiere patrón olfativo físico             |
| `REFERENCIA_EXTERNA`         | Control microbiológico: Disp. 1108/99 Anexo II Tipo II         | I-E.50.26 | No, requiere certificado de laboratorio externo |

Esta heterogeneidad tiene una consecuencia de diseño ineludible: **el motor de evaluación automática solo puede dictaminar sobre los parámetros numéricos**. Para los cualitativos, el sistema presenta el criterio y registra el veredicto humano. Un veredicto global «cumple» exige que todos los parámetros numéricos estén dentro de límite y que todos los cualitativos tengan veredicto humano cargado.

### 4.7 Productos, órdenes y lotes de producción

```sql
productos (
  id                uuid PK,
  codigo_interno    text UNIQUE NOT NULL,
  nombre            text NOT NULL,
  variedad          text,
  tipo              tipo_producto_enum NOT NULL,
  forma_cosmetica   forma_cosmetica_enum,
  origen            origen_producto_enum NOT NULL,   -- FABRICADO | FRACCIONADO | IMPORTADO
  vida_util_meses   integer NOT NULL,
  activo            boolean DEFAULT true
)

presentaciones (
  id                uuid PK,
  producto_id       uuid NOT NULL REFERENCES productos(id),
  descripcion       text NOT NULL,          -- 'Frasco plástico transparente 14 gr, tapa a rosca'
  contenido_valor   numeric(10,3) NOT NULL, -- 14
  contenido_unidad  text NOT NULL,          -- 'gr' | 'ml'
  envase_insumo_id  uuid REFERENCES insumos_catalogo(id),
  tapa_insumo_id    uuid REFERENCES insumos_catalogo(id),
  muestras_cc       integer                 -- 6 para 5gr, 2 para 14gr, 1 para 45gr (I.50.4)
)

procedimientos (
  id                uuid PK,
  codigo_poe        text NOT NULL,          -- 'ME.40.26'
  version           text NOT NULL,
  nombre            text NOT NULL,
  registro_asociado text NOT NULL,          -- 'R.40.26.1'
  producto_id       uuid REFERENCES productos(id),
  estado            estado_documento_enum NOT NULL,
  vigencia_desde    date,
  UNIQUE (codigo_poe, version)
)

proc_etapas (
  id                uuid PK,
  procedimiento_id  uuid NOT NULL REFERENCES procedimientos(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  codigo            text NOT NULL,          -- 'PESADA', 'ELABORACION_GRANEL', …
  nombre            text NOT NULL,
  requiere_doble_firma boolean NOT NULL DEFAULT true,
  bloquea_si_incumple  boolean NOT NULL DEFAULT true,
  UNIQUE (procedimiento_id, orden)
)

proc_items (
  id                uuid PK,
  etapa_id          uuid NOT NULL REFERENCES proc_etapas(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  tipo              tipo_item_enum NOT NULL,
       -- VERIFICACION_SI_NO | CAMPO_TEXTO | CAMPO_NUMERICO | CAMPO_HORA |
       -- SELECCION_LOTE_INSUMO | SELECCION_EQUIPO | TABLA_FILAS | INSTRUCCION
  etiqueta          text NOT NULL,
  obligatorio       boolean NOT NULL DEFAULT true,
  valor_esperado    text,                   -- 'SI' para verificaciones bloqueantes
  unidad            text,
  valor_min         numeric(14,4),
  valor_max         numeric(14,4),
  config            jsonb                   -- columnas de TABLA_FILAS, opciones, etc.
)
```

**Las etapas del batch record salen de R.40.26.1 y R.40.27.1**, que comparten estructura:

1. Pesada de materias primas (verificaciones previas + tabla de pesada)
2. Elaboración del producto a granel (verificaciones previas + tabla de proceso)
3. Muestreo de producto a granel
4. Control de calidad de producto a granel
5. Fraccionamiento (insumos a utilizar + verificaciones previas + tabla de proceso + recuento de unidades)
6. Muestreo de producto terminado
7. Control de calidad de producto terminado
8. Archivo de contramuestra
9. Revisión de documentación del lote y liberación con firma de DT

En el caso de fraccionamiento de granel tercerizado (R.40.27.1) la etapa 1 y 2 se sustituyen por «recepción del producto a granel», y el control de calidad del granel lo aporta un laboratorio externo (Biomic SRL) mediante certificado enviado por correo a la DT.

```sql
ordenes_produccion (
  id                uuid PK,
  numero            text UNIQUE NOT NULL,   -- 'OP-2026-0001'
  procedimiento_id  uuid NOT NULL REFERENCES procedimientos(id),
  producto_id       uuid NOT NULL REFERENCES productos(id),
  presentacion_id   uuid REFERENCES presentaciones(id),
  jornada           date NOT NULL,
  numero_lote       text NOT NULL,
  partida           text,                   -- 'P1', 'P2' … ver §5.3
  vencimiento       date NOT NULL,
  cantidad_teorica  numeric(14,3),
  cantidad_obtenida numeric(14,3),
  estado            estado_op_enum NOT NULL DEFAULT 'ABIERTA',
  abierta_por       uuid NOT NULL REFERENCES usuarios(id),
  abierta_en        timestamptz NOT NULL DEFAULT now(),
  liberada_por      uuid REFERENCES usuarios(id),
  liberada_en       timestamptz,
  liberacion_hash   text
)

op_etapas (
  id                uuid PK,
  orden_id          uuid NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
  etapa_id          uuid NOT NULL REFERENCES proc_etapas(id),
  estado            estado_etapa_enum NOT NULL DEFAULT 'PENDIENTE',
  realizo_por       uuid REFERENCES usuarios(id),
  realizo_en        timestamptz,
  controlo_por      uuid REFERENCES usuarios(id),
  controlo_en       timestamptz,
  observaciones     text,
  firmada           boolean NOT NULL DEFAULT false,
  hash_datos        text,
  UNIQUE (orden_id, etapa_id)
)

op_registros (
  id                uuid PK,
  op_etapa_id       uuid NOT NULL REFERENCES op_etapas(id) ON DELETE CASCADE,
  item_id           uuid NOT NULL REFERENCES proc_items(id),
  fila              integer NOT NULL DEFAULT 0,   -- para items TABLA_FILAS
  valor_texto       text,
  valor_numerico    numeric(18,6),
  valor_booleano    boolean,
  valor_hora        timestamptz,
  lote_insumo_id    uuid REFERENCES lotes_insumo(id),
  equipo_id         uuid REFERENCES equipos(id),
  UNIQUE (op_etapa_id, item_id, fila)
)

equipos (
  id                uuid PK,
  codigo            text UNIQUE NOT NULL,   -- código de balanza, varilla, máquina fraccionadora
  nombre            text NOT NULL,
  tipo              text NOT NULL,          -- BALANZA | BALANZA_PORTATIL | VARILLA |
                                            -- MAQUINA_FRACCIONADORA | ETIQUETADORA | PHMETRO |
                                            -- DENSITOMETRO | MICROSCOPIO_DIGITAL
  requiere_calibracion boolean DEFAULT false,
  ultima_calibracion date,
  proxima_calibracion date,
  activo            boolean DEFAULT true
)
```

`equipos` sale de los campos «CÓDIGO BALANZA», «CÓDIGO VARILLA», «CÓDIGO MAQUINA FRACCIONADORA», «CÓDIGO BALANZA PORTATIL» de los batch records, más I.50.8 (calibración de balanzas) e I.50.24 (pHmetro ADWA AD12).

### 4.8 Control de calidad, entidad única con discriminador

```sql
controles_calidad (
  id                uuid PK,
  numero            text UNIQUE NOT NULL,        -- correlativo/año, formato '____/__'
  tipo_registro     tipo_cc_enum NOT NULL,
       -- R_50_5_1  (insumos)          → I.50.5
       -- R_50_6_1  (semielaborado)    → I.50.6
       -- R_50_10_1 (granel)           → I.50.10
       -- R_50_7_1  (producto terminado) → I.50.7
       -- R_50_30_1 (PT importado)     → I.50.30
  entidad_tipo      text NOT NULL,
  entidad_id        uuid NOT NULL,
  muestreo_id       uuid REFERENCES muestreos(id),
  especificacion_id uuid REFERENCES especificaciones(id),
  fecha             date NOT NULL,
  operario_id       uuid NOT NULL REFERENCES usuarios(id),
  tamano_muestra    text NOT NULL,
  descripcion_muestra text NOT NULL,
  observaciones     text,
  veredicto         veredicto_enum,             -- CUMPLE | NO_CUMPLE
  controlo_por      uuid REFERENCES usuarios(id),
  decidido_por      uuid REFERENCES usuarios(id),
  decidido_en       timestamptz,
  aprobado          boolean,
  firmado           boolean NOT NULL DEFAULT false,
  hash_datos        text,
  creado_en         timestamptz NOT NULL DEFAULT now()
)

cc_resultados (
  id                uuid PK,
  control_id        uuid NOT NULL REFERENCES controles_calidad(id) ON DELETE CASCADE,
  parametro_id      uuid NOT NULL REFERENCES espec_parametros(id),
  valor_numerico    numeric(18,6),
  valor_texto       text,
  temperatura_ensayo numeric(6,2),
  equipo_id         uuid REFERENCES equipos(id),
  cumple            boolean,
  cumple_automatico boolean,                    -- true si lo dictaminó el motor
  justificacion     text,                       -- obligatoria si difiere del automático
  UNIQUE (control_id, parametro_id)
)
```

La justificación de esta forma está en los registros mismos: R.50.6.1, R.50.7.1, R.50.10.1 y R.50.30.1 tienen exactamente los mismos campos (fecha, operario, número correlativo, producto, n°lote, vencimiento, tamaño de la muestra, descripción de la muestra, observaciones/conclusiones, controló, aprobado SI/NO). Lo único que cambia es el encabezado. Cinco tablas separadas serían cinco copias del mismo esquema.

### 4.9 Contramuestras

```sql
contramuestras (
  id                    uuid PK,
  lote_producto_id      uuid NOT NULL REFERENCES lotes_producto(id),
  cantidad_envases      integer NOT NULL,
  es_fraccionada        boolean NOT NULL DEFAULT false,
  autorizacion_dt_id    uuid REFERENCES usuarios(id),   -- obligatorio si es_fraccionada
  observaciones         text,
  operacion_acondicionamiento text,                     -- importados, I.60.12
  fecha_ingreso         date NOT NULL,
  fecha_vencimiento     date NOT NULL,
  fecha_descarte_prevista date GENERATED ALWAYS AS (fecha_vencimiento + interval '1 year') STORED,
  deposito_id           uuid NOT NULL REFERENCES depositos(id),
  registrado_por        uuid NOT NULL REFERENCES usuarios(id),
  firmado_dt_por        uuid REFERENCES usuarios(id)
)
```

### 4.10 Procesos transversales

```sql
no_conformidades (
  id                    uuid PK,
  numero                text UNIQUE NOT NULL,     -- 'R.60.18.1.1/24' correlativo/año
  fecha                 date NOT NULL,
  origen                origen_nc_enum NOT NULL,
       -- RECLAMO_CLIENTE | DETECCION_INTERNA | FALLA_PROVEEDOR | INSPECCION_AUTORIDAD
  producto_id           uuid REFERENCES productos(id),
  lote                  text,
  proceso_involucrado   text NOT NULL,
  descripcion           text NOT NULL,
  requiere_correccion_inmediata boolean NOT NULL,
  correccion_inmediata  text,                     -- obligatorio si el anterior es true
  analisis_causas       text,
  plazo_implementacion  text,
  seguimiento           text,
  seguimiento_fecha     date,
  seguimiento_por       uuid REFERENCES usuarios(id),
  eficacia_verificada   boolean,
  cerrada               boolean NOT NULL DEFAULT false,
  cerrada_por           uuid REFERENCES usuarios(id),
  cerrada_en            timestamptz,
  abierta_por           uuid NOT NULL REFERENCES usuarios(id),
  reclamo_id            uuid REFERENCES reclamos(id),
  devolucion_id         uuid REFERENCES devoluciones(id),
  retiro_id             uuid REFERENCES retiros(id)
)

capa_acciones (
  id                uuid PK,
  nc_id             uuid NOT NULL REFERENCES no_conformidades(id) ON DELETE CASCADE,
  tipo              tipo_capa_enum NOT NULL,      -- CORRECTIVA | PREVENTIVA
  descripcion       text NOT NULL,
  fecha_compromiso  date,
  responsable_id    uuid REFERENCES usuarios(id),
  sector            sector_enum,
  completada        boolean NOT NULL DEFAULT false,
  completada_en     timestamptz
)

reclamos (
  id                    uuid PK,
  numero                text UNIQUE NOT NULL,     -- 'R.60.3.1…'
  canal                 canal_reclamo_enum NOT NULL,  -- TELEFONO | EMAIL | PRESENCIAL
  fecha_recepcion       date NOT NULL,
  reclamante_nombre     text NOT NULL,
  reclamante_telefono   text,
  reclamante_domicilio  text,
  reclamante_email      text,
  producto_id           uuid REFERENCES productos(id),
  producto_descripcion  text NOT NULL,
  lote                  text NOT NULL,
  vencimiento           date,
  motivo                text NOT NULL,
  momento_deteccion     text,
  se_recibe_producto    boolean NOT NULL,
  investigacion         text,
  acciones_adoptadas    text,
  lotes_vecinos_revisados text,
  observaciones         text,
  fecha_respuesta       date,
  fecha_limite_conformidad date,   -- fecha_respuesta + 30 días, PG.60.3
  cerrado               boolean NOT NULL DEFAULT false,
  firmado_dt_por        uuid REFERENCES usuarios(id)
)

devoluciones (
  id                    uuid PK,
  numero                text UNIQUE NOT NULL,     -- 'R.60.9.1…'
  origen_nombre         text NOT NULL,
  origen_telefono       text,
  origen_domicilio      text,
  origen_email          text,
  motivo                text NOT NULL,
  resultado_inspeccion  text,
  acciones_adoptadas    text,
  observaciones         text,
  firmado_dt_por        uuid REFERENCES usuarios(id),
  fecha                 date NOT NULL
)

devolucion_items (
  id                uuid PK,
  devolucion_id     uuid NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  producto_id       uuid REFERENCES productos(id),
  producto_nombre   text NOT NULL,
  lote              text NOT NULL,
  cantidad          numeric(12,3)
)

retiros (
  id                        uuid PK,
  numero                    text UNIQUE NOT NULL,   -- 'R.60.4.1…'
  fecha                     date NOT NULL,
  producto_id               uuid REFERENCES productos(id),
  producto_descripcion      text NOT NULL,
  forma_cosmetica           text,
  presentacion              text,
  fecha_elaboracion         date,
  fecha_vencimiento         date,
  elaborado_por_lugar       text,
  motivo                    text NOT NULL,
  fecha_deteccion           date NOT NULL,
  proviene_de_reclamo       boolean NOT NULL,
  reclamo_id                uuid REFERENCES reclamos(id),
  clase                     clase_retiro_enum NOT NULL,   -- I | II | III
  tipo                      tipo_retiro_enum NOT NULL,    -- VOLUNTARIO | ORDENADO_AUTORIDAD
  alcance                   alcance_retiro_enum NOT NULL, -- DISTRIBUIDORA | CONSUMIDOR | OTRO
  profundidad               profundidad_retiro_enum,      -- MAYORISTA | MINORISTA | CONSUMIDOR
  nivel_auditoria           nivel_auditoria_enum,         -- A | B | C | D | E
  porcentaje_auditoria      numeric(5,2),
  alerta_consumidores       boolean NOT NULL DEFAULT false,
  metodologia_verificacion  text,
  disposicion_final         text,
  cantidad_afectada_por_lote text,
  merma                     text,
  detalles_distribucion     text,
  notificacion_autoridad    text,
  notificacion_fecha        date,
  estrategia_comunicada_fecha date,
  destino_final             text,
  autorizacion_destruccion  text,
  finalizado                boolean NOT NULL DEFAULT false,
  firmado_dt_por            uuid REFERENCES usuarios(id)
)

retiro_lotes (
  id            uuid PK,
  retiro_id     uuid NOT NULL REFERENCES retiros(id) ON DELETE CASCADE,
  lote          text NOT NULL,
  cantidad_afectada numeric(12,3),
  cantidad_recuperada numeric(12,3)
)
```

### 4.11 Auditoría

```sql
auditoria (
  id            bigserial PK,
  tabla         text NOT NULL,
  registro_id   uuid NOT NULL,
  operacion     text NOT NULL,          -- INSERT | UPDATE | DELETE_INTENTO | FIRMA | LOGIN
  datos_antes   jsonb,
  datos_despues jsonb,
  usuario_id    uuid REFERENCES usuarios(id),
  auth_uid      uuid,
  ip            inet,
  user_agent    text,
  motivo        text,
  ocurrido_en   timestamptz NOT NULL DEFAULT now()
)
```

Append-only estricto. Sin política de UPDATE ni de DELETE para ningún rol, incluido el administrador.

### 4.12 Módulo comercial y contable (esquema `comercial`)

#### 4.12.1 Clientes y precios

```sql
clientes (
  id                    uuid PK,
  codigo                text UNIQUE NOT NULL,
  razon_social          text NOT NULL,
  nombre_fantasia       text,
  cuit                  text,
  tipo_documento        tipo_doc_enum NOT NULL,      -- CUIT | CUIL | DNI | CONSUMIDOR_FINAL
  numero_documento      text NOT NULL,
  condicion_iva         condicion_iva_enum NOT NULL,
       -- RESPONSABLE_INSCRIPTO | MONOTRIBUTO | EXENTO | CONSUMIDOR_FINAL | NO_ALCANZADO
  domicilio             text,
  localidad             text,
  provincia             text,
  codigo_postal         text,
  email                 text,
  telefono              text,
  lista_precios_id      uuid REFERENCES listas_precios(id),
  limite_credito        numeric(14,2),
  dias_plazo_pago       integer NOT NULL DEFAULT 0,
  percepcion_iibb       boolean NOT NULL DEFAULT false,
  alicuota_percepcion   numeric(6,3),
  activo                boolean NOT NULL DEFAULT true
)

listas_precios (
  id            uuid PK,
  nombre        text NOT NULL,               -- 'Mayorista', 'Minorista', 'Distribuidor'
  moneda        text NOT NULL DEFAULT 'ARS',
  incluye_iva   boolean NOT NULL DEFAULT false,
  vigencia_desde date NOT NULL,
  vigencia_hasta date,
  activa        boolean NOT NULL DEFAULT true
)

precios (
  id                uuid PK,
  lista_id          uuid NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
  presentacion_id   uuid NOT NULL REFERENCES gmp.presentaciones(id),
  precio_unitario   numeric(14,4) NOT NULL,
  alicuota_iva      numeric(5,2) NOT NULL DEFAULT 21.00,
  vigencia_desde    date NOT NULL,
  vigencia_hasta    date,
  UNIQUE (lista_id, presentacion_id, vigencia_desde)
)
```

Los precios se versionan por fecha en lugar de sobrescribirse, porque una factura emitida hace ocho meses debe poder reconstruirse con el precio que efectivamente tenía ese día. Sobrescribir el precio rompe la reproducibilidad del comprobante.

#### 4.12.2 Stock valorizado

```sql
articulos (
  id                    uuid PK,
  presentacion_id       uuid UNIQUE REFERENCES gmp.presentaciones(id),
  insumo_id             uuid UNIQUE REFERENCES gmp.insumos_catalogo(id),
  sku                   text UNIQUE NOT NULL,
  descripcion           text NOT NULL,
  metodo_costeo         metodo_costeo_enum NOT NULL DEFAULT 'PPP',  -- PEPS | PPP | ESTANDAR
  cuenta_inventario     text,                -- imputación contable
  cuenta_costo_ventas   text,
  stock_minimo          numeric(14,3),
  activo                boolean NOT NULL DEFAULT true,
  CHECK (num_nonnulls(presentacion_id, insumo_id) = 1)
)

movimientos_stock (
  id                    bigserial PK,
  articulo_id           uuid NOT NULL REFERENCES articulos(id),
  lote_insumo_id        uuid REFERENCES gmp.lotes_insumo(id),
  lote_producto_id      uuid REFERENCES gmp.lotes_producto(id),
  deposito_id           uuid NOT NULL REFERENCES gmp.depositos(id),
  tipo                  tipo_movimiento_enum NOT NULL,
       -- ENTRADA_COMPRA | ENTRADA_PRODUCCION | ENTRADA_DEVOLUCION | ENTRADA_AJUSTE
       -- SALIDA_VENTA | SALIDA_CONSUMO_PRODUCCION | SALIDA_MUESTRA | SALIDA_DESCARTE
       -- SALIDA_AJUSTE | SALIDA_RETIRO_MERCADO | TRANSFERENCIA_ENTRE_DEPOSITOS
  cantidad              numeric(16,4) NOT NULL,   -- con signo: positivo entra, negativo sale
  costo_unitario        numeric(16,6) NOT NULL,
  costo_total           numeric(16,4) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
  moneda                text NOT NULL DEFAULT 'ARS',
  tipo_cambio           numeric(14,6) NOT NULL DEFAULT 1,
  documento_tipo        text,                     -- 'REMITO' | 'FACTURA_PROVEEDOR' | 'OP' | 'AJUSTE'
  documento_id          uuid,
  periodo               date NOT NULL,            -- primer día del mes, para cierre
  registrado_por        uuid NOT NULL REFERENCES gmp.usuarios(id),
  ocurrido_en           timestamptz NOT NULL DEFAULT now(),
  anulado_por_id        bigint REFERENCES movimientos_stock(id),
  CHECK (cantidad <> 0)
)

costos_lote (
  id                uuid PK,
  articulo_id       uuid NOT NULL REFERENCES articulos(id),
  lote_insumo_id    uuid REFERENCES gmp.lotes_insumo(id),
  lote_producto_id  uuid REFERENCES gmp.lotes_producto(id),
  costo_materiales  numeric(16,6) NOT NULL DEFAULT 0,
  costo_mano_obra   numeric(16,6) NOT NULL DEFAULT 0,
  costo_indirecto   numeric(16,6) NOT NULL DEFAULT 0,
  costo_unitario    numeric(16,6) GENERATED ALWAYS AS
                    (costo_materiales + costo_mano_obra + costo_indirecto) STORED,
  unidades_obtenidas numeric(16,4) NOT NULL,
  calculado_en      timestamptz NOT NULL DEFAULT now()
)
```

**El movimiento de stock nunca se edita ni se borra.** Una corrección genera un movimiento inverso que apunta al original mediante `anulado_por_id`. Es la misma lógica de inmutabilidad del dominio regulado, aplicada al dominio contable, donde además es exigencia fiscal.

**Sobre el método de costeo.** Conviene no confundir dos cosas que llevan la misma sigla. El criterio de **rotación física** determina qué lote sale primero del depósito, y en cosmética debe ser por vencimiento más próximo (FEFO), porque un producto vencido no se puede vender aunque haya entrado antes. El criterio de **costeo** determina qué valor lleva esa salida al estado de resultados, y ahí las opciones son PEPS, promedio ponderado móvil, o costo estándar con análisis de desvíos. Son decisiones independientes. Se puede despachar por FEFO y costear por promedio ponderado sin ninguna contradicción, y de hecho es lo habitual.

La recomendación es promedio ponderado móvil como valor por defecto, por dos motivos. Primero, es el método que mejor absorbe la volatilidad de precios sin generar saltos artificiales de margen entre lotes comprados con semanas de diferencia. Segundo, es el que el estudio contable va a esperar, salvo indicación en contrario. El campo `metodo_costeo` queda por artículo para permitir excepciones.

_Dato de color, ya que estamos definiendo criterios de valuación:_ el promedio ponderado móvil como técnica contable se estandarizó junto con la contabilidad de costos industrial de fines del siglo XIX, en los ferrocarriles y las acerías estadounidenses, que fueron las primeras organizaciones con inventarios lo bastante grandes y rotativos como para que identificar el costo de cada unidad individual dejara de ser practicable. El problema que resolvía era exactamente el tuyo: cuando el mismo insumo entra cien veces a precios distintos, seguir cada partícula es imposible, así que hay que elegir una convención y sostenerla.

#### 4.12.3 Comprobantes y facturación electrónica

```sql
puntos_venta (
  id                uuid PK,
  numero            integer UNIQUE NOT NULL,       -- 0001, 0002
  descripcion       text NOT NULL,
  modo_emision      text NOT NULL DEFAULT 'WSFE',
  activo            boolean NOT NULL DEFAULT true
)

comprobantes (
  id                    uuid PK,
  tipo                  tipo_comprobante_enum NOT NULL,
       -- FACTURA_A | FACTURA_B | FACTURA_C | NOTA_CREDITO_A | NOTA_CREDITO_B | NOTA_CREDITO_C
       -- NOTA_DEBITO_A | NOTA_DEBITO_B | NOTA_DEBITO_C | REMITO | RECIBO | PRESUPUESTO
  codigo_afip           integer,                   -- 1, 6, 11, 3, 8, 13, 2, 7, 12
  punto_venta_id        uuid REFERENCES puntos_venta(id),
  numero                integer,
  numero_completo       text UNIQUE,               -- '0001-00000123'
  cliente_id            uuid REFERENCES clientes(id),
  proveedor_id          uuid REFERENCES gmp.proveedores(id),
  sentido               sentido_comprobante_enum NOT NULL,   -- EMITIDO | RECIBIDO
  fecha_emision         date NOT NULL,
  fecha_vencimiento_pago date,
  concepto              concepto_enum NOT NULL DEFAULT 'PRODUCTOS',
  moneda                text NOT NULL DEFAULT 'ARS',
  tipo_cambio           numeric(14,6) NOT NULL DEFAULT 1,
  neto_gravado          numeric(16,4) NOT NULL DEFAULT 0,
  neto_no_gravado       numeric(16,4) NOT NULL DEFAULT 0,
  exento                numeric(16,4) NOT NULL DEFAULT 0,
  iva_total             numeric(16,4) NOT NULL DEFAULT 0,
  percepciones          numeric(16,4) NOT NULL DEFAULT 0,
  total                 numeric(16,4) NOT NULL,
  -- respuesta del organismo fiscal
  cae                   text,
  cae_vencimiento       date,
  estado_fiscal         estado_fiscal_enum NOT NULL DEFAULT 'BORRADOR',
       -- BORRADOR | PENDIENTE_CAE | AUTORIZADO | RECHAZADO | ANULADO
  observaciones_fiscales jsonb,
  request_payload       jsonb,
  response_payload      jsonb,
  -- vínculos
  comprobante_asociado_id uuid REFERENCES comprobantes(id),
  pedido_id             uuid REFERENCES pedidos(id),
  emitido_por           uuid NOT NULL REFERENCES gmp.usuarios(id),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(cliente_id, proveedor_id) = 1)
)

comprobante_items (
  id                uuid PK,
  comprobante_id    uuid NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  articulo_id       uuid REFERENCES articulos(id),
  lote_producto_id  uuid REFERENCES gmp.lotes_producto(id),
  descripcion       text NOT NULL,
  cantidad          numeric(16,4) NOT NULL,
  precio_unitario   numeric(16,6) NOT NULL,
  descuento_pct     numeric(6,3) NOT NULL DEFAULT 0,
  alicuota_iva      numeric(5,2) NOT NULL,
  neto              numeric(16,4) NOT NULL,
  iva               numeric(16,4) NOT NULL
)
```

**Sobre la integración con el organismo fiscal.** La emisión de comprobantes electrónicos en Argentina se hace contra los servicios web de ARCA (ex AFIP, renombrada a fines de 2024). El circuito tiene dos pasos: primero se obtiene un ticket de acceso del servicio de autenticación, firmando una solicitud con un certificado X.509 asociado al CUIT y con un alias de servicio autorizado; ese ticket dura 12 horas. Después se solicita la autorización del comprobante, que devuelve un CAE y su fecha de vencimiento, o un rechazo con código de observación.

Tres advertencias que conviene tener presentes antes de escribir una línea de este módulo:

1. **El certificado y la clave privada nunca van en el repositorio ni en el cliente.** Viven en el almacén de secretos de Supabase y la llamada sale desde una Edge Function, jamás desde el navegador.
2. **La numeración de comprobantes debe ser correlativa y sin huecos por punto de venta.** Un `sequence` de Postgres no sirve, porque las secuencias no son transaccionales y dejan huecos ante un rollback. Hace falta una tabla de contadores con bloqueo pesimista (`SELECT … FOR UPDATE`) dentro de la misma transacción que inserta el comprobante.
3. **La especificación técnica cambia con cierta frecuencia.** Los códigos de comprobante, las alícuotas y los campos obligatorios de este documento son de referencia y deben verificarse contra la documentación vigente de ARCA al momento de implementar, no darse por buenos porque están escritos acá.

Conviene además evaluar si conviene integrar directo o a través de un intermediario (por ejemplo un proveedor de facturación como servicio). El costo del intermediario se paga solo si evita mantener la integración cada vez que cambia la especificación, que es el gasto real y recurrente.

#### 4.12.4 Cuentas corrientes y contabilidad

```sql
cuenta_corriente (
  id                uuid PK,
  cliente_id        uuid REFERENCES clientes(id),
  proveedor_id      uuid REFERENCES gmp.proveedores(id),
  comprobante_id    uuid REFERENCES comprobantes(id),
  fecha             date NOT NULL,
  debe              numeric(16,4) NOT NULL DEFAULT 0,
  haber             numeric(16,4) NOT NULL DEFAULT 0,
  moneda            text NOT NULL DEFAULT 'ARS',
  concepto          text NOT NULL,
  CHECK (num_nonnulls(cliente_id, proveedor_id) = 1),
  CHECK (debe = 0 OR haber = 0)
)

imputaciones (
  id                    uuid PK,
  comprobante_pago_id   uuid NOT NULL REFERENCES comprobantes(id),
  comprobante_deuda_id  uuid NOT NULL REFERENCES comprobantes(id),
  monto                 numeric(16,4) NOT NULL CHECK (monto > 0)
)

plan_cuentas (
  id            uuid PK,
  codigo        text UNIQUE NOT NULL,
  nombre        text NOT NULL,
  tipo          tipo_cuenta_enum NOT NULL,   -- ACTIVO | PASIVO | PATRIMONIO | INGRESO | EGRESO
  imputable     boolean NOT NULL DEFAULT true,
  padre_id      uuid REFERENCES plan_cuentas(id)
)

asientos (
  id                uuid PK,
  numero            integer UNIQUE NOT NULL,
  fecha             date NOT NULL,
  periodo           date NOT NULL,
  descripcion       text NOT NULL,
  origen_tipo       text,                    -- 'COMPROBANTE' | 'MOVIMIENTO_STOCK' | 'MANUAL'
  origen_id         uuid,
  registrado_por    uuid NOT NULL REFERENCES gmp.usuarios(id),
  creado_en         timestamptz NOT NULL DEFAULT now()
)

asiento_lineas (
  id            uuid PK,
  asiento_id    uuid NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
  cuenta_id     uuid NOT NULL REFERENCES plan_cuentas(id),
  debe          numeric(16,4) NOT NULL DEFAULT 0,
  haber         numeric(16,4) NOT NULL DEFAULT 0,
  CHECK (debe = 0 OR haber = 0)
)

periodos_contables (
  periodo       date PRIMARY KEY,
  cerrado       boolean NOT NULL DEFAULT false,
  cerrado_por   uuid REFERENCES gmp.usuarios(id),
  cerrado_en    timestamptz
)
```

La partida doble se garantiza con un `CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED` que valida al final de la transacción que la suma del debe iguale la del haber para cada asiento. Verificarlo fila por fila no funciona, porque el asiento está desbalanceado hasta que se inserta la última línea.

El cierre de período bloquea toda escritura sobre asientos y movimientos de stock con `periodo` anterior o igual al cerrado, mediante un trigger que consulta `periodos_contables`.

### 4.13 Conteo asistido por imagen en expedición

#### 4.13.1 Qué resuelve y qué no

La operación es el recuento de unidades por SKU antes de emitir el remito. Hoy se hace a mano y aparece en los batch records como «Recuento de unidades: N° de canastas, N° de unidades por canasto, N° unidades totales». Es una tarea repetitiva, propensa a error, y el error se propaga al remito, a la factura y al stock.

Las condiciones que describiste son las más favorables posibles para resolverlo con visión por computadora: **toma cenital, unidades idénticas entre sí, y disposición ordenada**. La regularidad geométrica es la que hace que el problema sea tratable sin aprendizaje automático.

Lo que el sistema **no** va a hacer es reemplazar el conteo humano como valor oficial. La cifra que va al remito es la que la persona confirma. Ver §4.13.4.

#### 4.13.2 Enfoque técnico recomendado

Procesamiento clásico, sin modelo entrenado, ejecutado en el dispositivo:

1. **Corrección de perspectiva.** Detección de los bordes del contenedor o de un marcador fiducial (un ArUco impreso pegado a la canasta) y cálculo de la homografía que lleva la imagen a vista cenital ideal. Sin esto, las unidades del borde aparecen más chicas y el detector las pierde.
2. **Normalización de iluminación.** Ecualización adaptativa por regiones (CLAHE) para que una sombra en una esquina no cambie el umbral de detección.
3. **Detección de candidatos.** Dos caminos según la forma del SKU. Si la tapa es circular, transformada de Hough para círculos, que es directa y robusta. Si no lo es, correlación cruzada normalizada contra una plantilla recortada por el usuario la primera vez que carga ese SKU, seguida de supresión de no máximos.
4. **Validación por periodicidad.** Acá está el aprovechamiento real del orden. Sobre el mapa de respuesta se calcula la autocorrelación bidimensional, cuyos picos revelan el paso de la grilla en ambos ejes. Con el paso conocido, el sistema ajusta una grilla al conjunto de detecciones, y entonces puede **completar huecos** (una unidad que el detector perdió por reflejo, pero cuya posición la grilla predice) y **descartar espurios** (una detección fuera de la grilla, que suele ser un reflejo o una etiqueta).
5. **Conteo y confianza.** El resultado es el número de posiciones de grilla ocupadas, más un índice de confianza derivado de cuántas detecciones cayeron dentro de la grilla ajustada y cuán uniforme fue la respuesta.

Este último paso es lo que separa un contador que sirve de uno que no. Un detector puro sobre 200 frascos va a fallar en tres o cuatro. La grilla convierte «detecté 197 manchas» en «hay una grilla de 14 por 15 con 13 posiciones vacías en la última fila, total 197», que es una afirmación verificable de un vistazo.

El enfoque por aprendizaje automático (mapas de densidad tipo CSRNet, o detección con YOLO) resuelve casos desordenados y con oclusión, pero necesita un conjunto de imágenes etiquetadas que hoy no existe. La recomendación es empezar por el método clásico y **usar el propio sistema para construir el conjunto de datos**: cada conteo confirmado por una persona, junto con su foto, es una muestra etiquetada. En unos meses hay material para entrenar, si es que hace falta.

#### 4.13.3 Modelo de datos

```sql
conteos_imagen (
  id                    uuid PK,
  entidad_tipo          text NOT NULL,     -- 'preparacion_pedido' | 'op_etapa' | 'inventario'
  entidad_id            uuid NOT NULL,
  articulo_id           uuid NOT NULL REFERENCES articulos(id),
  lote_producto_id      uuid REFERENCES gmp.lotes_producto(id),
  imagen_url            text NOT NULL,     -- Supabase Storage, bucket privado
  imagen_hash           text NOT NULL,     -- sha256 del archivo original
  conteo_estimado       integer NOT NULL,
  confianza             numeric(5,4) NOT NULL,
  grilla_filas          integer,
  grilla_columnas       integer,
  posiciones_vacias     integer,
  metodo                text NOT NULL,     -- 'HOUGH_GRILLA' | 'NCC_GRILLA' | 'ML_DENSIDAD'
  version_algoritmo     text NOT NULL,
  parametros            jsonb,
  detecciones           jsonb,             -- coordenadas, para poder auditar el resultado
  tiempo_proceso_ms     integer,
  conteo_confirmado     integer,
  confirmado_por        uuid REFERENCES gmp.usuarios(id),
  confirmado_en         timestamptz,
  discrepancia          integer GENERATED ALWAYS AS (conteo_confirmado - conteo_estimado) STORED,
  motivo_discrepancia   text,
  creado_en             timestamptz NOT NULL DEFAULT now()
)

sku_plantillas (
  id                uuid PK,
  articulo_id       uuid NOT NULL REFERENCES articulos(id),
  plantilla_url     text NOT NULL,
  diametro_px_ref   numeric(8,2),
  altura_captura_cm numeric(8,2),
  notas             text,
  creada_por        uuid NOT NULL REFERENCES gmp.usuarios(id),
  activa            boolean NOT NULL DEFAULT true
)
```

#### 4.13.4 Encuadre regulatorio

Un conteo automático que alimenta un registro BPF es, técnicamente, una función computarizada con impacto en la calidad del dato, así que entra en el alcance de validación. Las condiciones que lo hacen defendible:

- **El valor oficial es el confirmado por la persona.** El algoritmo propone, el operario dispone. `conteo_confirmado` es el campo que se usa aguas abajo, y es obligatorio.
- **La discrepancia se registra siempre.** Si la persona corrige la cifra, queda la diferencia y el motivo. Ese campo es además la métrica de desempeño del algoritmo a lo largo del tiempo.
- **La evidencia se conserva.** La foto original, su hash, la versión del algoritmo y las coordenadas de las detecciones quedan guardadas y adjuntas al legajo de lote. Un inspector puede reejecutar el conteo sobre la misma imagen y verificar.
- **La versión del algoritmo se registra en cada conteo.** Sin eso, un resultado histórico no es reproducible, porque no se sabe con qué código se produjo.
- **El desempeño se califica antes de usarlo en producción.** Corrida de calificación operacional sobre un conjunto de fotos con conteo manual conocido, con criterio de aceptación documentado (por ejemplo, exactitud dentro del 1 % en el 95 % de los casos, sobre un mínimo de 50 imágenes por SKU).

Sobre la privacidad y el costo: el procesamiento corre en el navegador con OpenCV compilado a WebAssembly, así que la foto no sale del dispositivo salvo para archivarse. Eso evita el costo por llamada de un servicio de visión en la nube y el tiempo de subida, que en una planta con conexión irregular es la diferencia entre que la función se use y que no.

---

## 5. Máquinas de estado

### 5.1 Lote de insumo

```
RECIBIDO ──→ CUARENTENA ──→ MUESTREADO ──→ EN_ANALISIS ──┬──→ APROBADO
                                                          └──→ RECHAZADO
```

`APROBADO` y `RECHAZADO` son terminales. La corrección de un estado terminal exige apertura de no conformidad (PG.60.18) y queda registrada como tal, sin revertir el estado original.

Los estados intermedios `RECIBIDO` y `MUESTREADO` no aparecen nombrados en el POE. `EN ANÁLISIS` sí: I.20.2 define cuatro estados de rótulo (EN CUARENTENA, EN ANÁLISIS, APROBADO, RECHAZADO) con cuatro colores. El estado `EN_ANALISIS` con rótulo gris es una obligación documental que conviene no perder.

Condiciones de transición:

| Transición                 | Precondición                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECIBIDO → CUARENTENA`    | Rótulo R.20.2.1 emitido con estatus cuarentena. Contenedores limpiados. Protocolo del fabricante adjunto si el insumo lo requiere.           |
| `CUARENTENA → MUESTREADO`  | Muestreo registrado con las cinco verificaciones previas de I.50.4 completas. Etiqueta R.50.4.1 emitida.                                     |
| `MUESTREADO → EN_ANALISIS` | Control de calidad abierto. Rótulo gris emitido.                                                                                             |
| `EN_ANALISIS → APROBADO`   | Todos los parámetros obligatorios de la especificación con resultado cargado y `cumple = true`. Firma de quien decide. Rótulo verde emitido. |
| `EN_ANALISIS → RECHAZADO`  | Al menos un parámetro con `cumple = false`, o decisión explícita. Rótulo rojo emitido. Abre no conformidad automáticamente.                  |

### 5.2 Orden de producción

```
ABIERTA ──→ EN_PROCESO ──→ ETAPAS_COMPLETAS ──→ EN_REVISION_DOCUMENTAL ──┬──→ LIBERADA
                                                                          └──→ RECHAZADA
```

Una etapa solo se habilita cuando la anterior está firmada. La etapa de fraccionamiento exige adicionalmente que el control de calidad del granel esté aprobado, verificación que aparece literalmente en la lista de verificaciones previas: «Producto a granel recepcionado correctamente. APROBADO. El número de lote coincide con el indicado en el registro».

### 5.3 Numeración de lote

Este es el punto donde falta documentación. El POE I.40.25 «Asignación de lote» está listado como emitido el 17/07/25 con vigencia 31/07/25, y lo referencian ME.40.33, ME.40.34 y ME.40.29, pero **el documento no está entre los archivos del proyecto**.

Lo que sí se puede afirmar con respaldo:

- La **partida** se deriva de R.40.27.1: «En caso que un mismo lote de granel se fraccione en días distintos, se le agregará P1 (día 1), P2 (día 2) y así correlativamente hasta el fraccionamiento de todo el lote». Es decir, la partida identifica la jornada de fraccionamiento dentro de un mismo lote de granel, no el origen del granel.
- El **lote y vencimiento del producto terminado coinciden con los del granel** (R.40.27.1), lo que preserva la trazabilidad hacia atrás.
- La **jornada** como agrupador diario no tiene respaldo documental encontrado y debe tratarse como decisión de diseño del sistema anterior.

Recomendación: `numero_lote` es texto libre validado contra un patrón configurable por producto, y el sistema mantiene su propio identificador interno `numero` de la orden (`OP-AAAA-NNNN`) como clave real. La unicidad de negocio se declara sobre `(numero_lote, producto_id, partida)`.

### 5.4 No conformidad

```
ABIERTA ──→ CON_CORRECCION_INMEDIATA (opcional) ──→ EN_ANALISIS_CAUSAS
   ──→ CON_PLAN_CAPA ──→ EN_VERIFICACION_EFICACIA ──┬──→ CERRADA
                                                     └──→ vuelve a EN_ANALISIS_CAUSAS
```

El bucle de retorno está explícito en PG.60.18: si la no conformidad reaparece, significa que la causa raíz no fue identificada y hay que volver a analizarla. El sistema debe permitir ese retorno sin perder el historial del ciclo anterior.

### 5.5 Reclamo

```
RECIBIDO ──→ EN_INVESTIGACION ──→ RESPONDIDO ──┬──→ CERRADO_POR_CONFORMIDAD
                                                ├──→ CERRADO_POR_VENCIMIENTO_PLAZO (30 días)
                                                └──→ REABIERTO (disconformidad del reclamante)
```

El cierre por vencimiento de plazo es automático a los 30 días de la respuesta, según PG.60.3. Conviene implementarlo como tarea programada que deja asiento en auditoría, para que el cierre tenga autor identificable aunque sea el sistema.

### 5.6 Retiro de mercado

```
INICIADO ──→ NOTIFICADO_AUTORIDAD ──→ ESTRATEGIA_COMUNICADA (3 días hábiles)
   ──→ EN_EJECUCION ──→ EN_AUDITORIA_VERIFICACION ──→ EN_ESPERA_DESTINO_FINAL
   ──→ FINALIZADO
```

El estado `EN_ESPERA_DESTINO_FINAL` es obligatorio y no se puede saltear: PG.60.4 establece que no se puede destruir unidades recuperadas sin autorización escrita previa de la autoridad sanitaria.

### 5.7 Pedido y comprobante

```
PEDIDO:
BORRADOR ──→ CONFIRMADO ──→ RESERVADO ──→ EN_PREPARACION ──→ PREPARADO
   ──→ DESPACHADO ──→ FACTURADO ──┬──→ COBRADO
                                   └──→ CON_DEVOLUCION

COMPROBANTE:
BORRADOR ──→ PENDIENTE_CAE ──┬──→ AUTORIZADO ──→ ANULADO (solo vía nota de crédito)
                              └──→ RECHAZADO ──→ BORRADOR (corrección y reintento)
```

Un comprobante autorizado nunca se borra ni se edita. La anulación se instrumenta con una nota de crédito que lo referencia, que es como lo exige el régimen fiscal y como además conviene por integridad del registro.

La reserva de stock en el estado `RESERVADO` solo puede tomar lotes en estado `LIBERADO`. Un lote en cuarentena, rechazado, o liberado pero afectado por un retiro de mercado, queda fuera del universo reservable.

### 5.8 Período contable

```
ABIERTO ──→ CERRADO
```

Transición unidireccional. La reapertura de un período cerrado exige rol de administración con motivo escrito, y queda asentada en auditoría. Un período cerrado bloquea escrituras sobre asientos y sobre movimientos de stock de ese período o anteriores.

---

## 6. Reglas de negocio

Cada regla lleva su fuente y el punto de aplicación recomendado en el stack destino.

| ID    | Regla                                                                                                                                                                                   | Fuente                              | Aplicación                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| RN-01 | Una materia prima no se recepciona sin protocolo de análisis del fabricante o proveedor                                                                                                 | I.20.1 paso 5                       | `CHECK` condicional + validación en formulario                            |
| RN-02 | Si un bulto presenta peso disparejo, es obligatorio abrirlo y contar las unidades                                                                                                       | I.20.1 paso 3                       | `CHECK (bultos_peso_similar = true OR unidades_contadas IS NOT NULL)`     |
| RN-03 | Los pigmentos se pesan antes de continuar el proceso de recepción                                                                                                                       | I.20.1 paso 5                       | Validación condicional sobre `insumos_catalogo.requiere_pesada_recepcion` |
| RN-04 | Color del rótulo según estado: cuarentena amarillo, en análisis gris, aprobado verde, rechazado rojo                                                                                    | I.20.2                              | Función determinista, columna generada                                    |
| RN-05 | Un rótulo nunca se modifica. El cambio de estado emite un rótulo nuevo y marca el anterior no vigente                                                                                   | I.20.2                              | Trigger `BEFORE UPDATE` que rechaza, y política sin UPDATE                |
| RN-06 | El rótulo se adhiere al cuerpo del recipiente, nunca a la tapa                                                                                                                          | I.20.2                              | Instrucción en pantalla, sin aplicación técnica posible                   |
| RN-07 | Todo material muestreado lleva etiqueta R.50.4.1 emitida en el momento del muestreo                                                                                                     | I.50.4                              | Emisión automática en la misma transacción                                |
| RN-08 | Tamaño de muestra: 5 % para material de envase y empaque, un tubo de ensayo para materia prima y granel, 30 gr para producto terminado                                                  | I.50.4                              | Cálculo asistido, editable con justificación                              |
| RN-09 | Envases a muestrear en producto terminado según presentación: 6 para 5 gr, 2 para 14 gr, 1 para 45 gr                                                                                   | I.50.4                              | Precarga desde `presentaciones.muestras_cc`                               |
| RN-10 | Antes del muestreo hay cinco verificaciones obligatorias: integridad del contenedor, limpieza, rotulado correcto, correspondencia del lote con el certificado, cantidad de contenedores | I.50.4                              | Campos `NOT NULL`                                                         |
| RN-11 | El sobrante de muestra de materia prima y semielaborado va a contramuestra; el de producto terminado va a descarte; el de envases puede reutilizarse en fraccionamiento                 | I.50.4                              | Enum `destino_muestra_enum` con default por categoría                     |
| RN-12 | El muestreo de semielaborado y granel se toma inmediatamente finalizada la elaboración                                                                                                  | I.50.4                              | Validación de ventana temporal con advertencia                            |
| RN-13 | La pesada de materia prima solo puede usar lotes con rótulo aprobado vigente                                                                                                            | I.40.16                             | Política RLS + `CHECK` sobre el estado del lote referenciado              |
| RN-14 | La balanza debe estar conectada 30 minutos antes de la pesada                                                                                                                           | I.40.16                             | Verificación previa tipo SI/NO, bloqueante                                |
| RN-15 | Toda la pesada se hace con puerta cerrada y sistema de extracción encendido                                                                                                             | I.40.16, ME.40.34                   | Verificación previa tipo SI/NO, bloqueante                                |
| RN-16 | Se pesa una materia prima por vez, cerrando cada envase antes de continuar                                                                                                              | I.40.16                             | Instrucción secuencial en pantalla                                        |
| RN-17 | Cada insumo pesado genera su propio rótulo R.40.16.1                                                                                                                                    | I.40.16                             | Emisión automática por fila de la tabla de pesada                         |
| RN-18 | No se puede fraccionar sin control de calidad de granel aprobado                                                                                                                        | R.40.26.1, R.40.27.1                | Precondición de etapa, verificada en trigger                              |
| RN-19 | El lote y vencimiento del producto terminado coinciden con los del granel de origen                                                                                                     | R.40.27.1                           | Herencia automática, campo de solo lectura                                |
| RN-20 | Si un lote de granel se fracciona en días distintos, cada jornada recibe sufijo P1, P2 y siguientes                                                                                     | R.40.27.1                           | Generación automática de `partida`                                        |
| RN-21 | En fraccionamiento con máquina, los primeros 5 envases se controlan por peso antes de envasar el lote completo                                                                          | R.40.27.1                           | Etapa obligatoria con registro de los 5 pesos                             |
| RN-22 | Cada etapa productiva requiere firma de quien realizó y de quien controló, con fecha y hora                                                                                             | R.40.26.1, R.40.27.1, ME.40.34      | Doble firma, ver §3.4 sobre el modo configurable                          |
| RN-23 | Un registro firmado no admite modificación                                                                                                                                              | PG.60.8, práctica BPF               | Trigger `BEFORE UPDATE` que levanta excepción si `firmada = true`         |
| RN-24 | Un lote no se libera al mercado sin firma de Dirección Técnica                                                                                                                          | R.40.26.1, R.40.27.1, I.50.7        | Política RLS por rol sobre la columna de liberación                       |
| RN-25 | Un producto que no cumple especificación se rechaza; el reproceso exige autorización previa según POE específico                                                                        | I.50.6, I.50.7                      | Bloqueo de liberación + apertura obligatoria de no conformidad            |
| RN-26 | Se archivan 2 unidades de contramuestra por lote, cualquiera sea la forma cosmética                                                                                                     | I.60.12 tabla 1                     | Valor por defecto, editable con justificación                             |
| RN-27 | La contramuestra se retiene 1 año después del vencimiento del producto                                                                                                                  | I.60.12                             | Columna generada `fecha_descarte_prevista`                                |
| RN-28 | El fraccionamiento de contramuestra requiere autorización de Dirección Técnica documentada en observaciones del R.60.12.2                                                               | I.60.12                             | `CHECK (es_fraccionada = false OR autorizacion_dt_id IS NOT NULL)`        |
| RN-29 | En importados, cada operación de acondicionamiento que abra el material secundario genera su propia contramuestra                                                                       | I.60.12                             | Validación por operación de acondicionamiento                             |
| RN-30 | El producto importado se sobrerrotula antes del muestreo y del análisis                                                                                                                 | I.20.5 v03                          | Orden de etapas del flujo de importado                                    |
| RN-31 | Se separan 2 envases de contramuestra solo si el producto importado cumple especificación                                                                                               | I.20.5 v03                          | Precondición de etapa                                                     |
| RN-32 | Toda no conformidad exige análisis de causa raíz antes del plan CAPA                                                                                                                    | PG.60.18                            | Campo obligatorio para avanzar de estado                                  |
| RN-33 | Una no conformidad no se cierra sin verificación de eficacia                                                                                                                            | PG.60.18                            | `CHECK (cerrada = false OR eficacia_verificada = true)`                   |
| RN-34 | Si la no conformidad reaparece, el ciclo vuelve al análisis de causas                                                                                                                   | PG.60.18                            | Transición de estado permitida, con historial                             |
| RN-35 | El plan CAPA debe tener al menos una acción correctiva y una preventiva, cada una con fecha y responsable                                                                               | PG.60.18                            | Validación de conteo por tipo                                             |
| RN-36 | Todo reclamo recibe número al ingresar y ese número se informa al reclamante en el acto                                                                                                 | PG.60.3                             | Generación de correlativo en la transacción de alta                       |
| RN-37 | El reclamante tiene 30 días desde la respuesta para manifestar conformidad; vencido el plazo, el reclamo se cierra                                                                      | PG.60.3                             | Tarea programada con asiento en auditoría                                 |
| RN-38 | Ante un reclamo, la verificación puede extenderse a lotes vecinos                                                                                                                       | PG.60.3                             | Campo de registro más consulta asistida de lotes contiguos                |
| RN-39 | La apertura y seguimiento de reclamos es responsabilidad exclusiva de Dirección Técnica                                                                                                 | PG.60.3                             | Política RLS por rol                                                      |
| RN-40 | Los retiros clase I y clase II se aplican con alcance máximo, hasta el consumidor                                                                                                       | PG.60.4                             | Validación condicional sobre `alcance`                                    |
| RN-41 | La estrategia de retiro se comunica por escrito dentro de los 3 días hábiles                                                                                                            | PG.60.4                             | Alerta y cálculo de vencimiento con calendario de hábiles                 |
| RN-42 | El nivel de auditoría de verificación determina el porcentaje de contactos: A 100 %, B entre 10 y 100 %, C 10 %, D 2 %, E ninguna                                                       | PG.60.4                             | `CHECK` sobre `porcentaje_auditoria` según `nivel_auditoria`              |
| RN-43 | No se destruyen unidades recuperadas sin autorización escrita de la autoridad sanitaria                                                                                                 | PG.60.4                             | Estado obligatorio previo al cierre                                       |
| RN-44 | Las etiquetas se cuentan por planchas, calculando unidades por plancha y total                                                                                                          | I.20.1 paso 4                       | Columna generada                                                          |
| RN-45 | Cada caja de envases etiquetados lleva el código interno del producto junto al rótulo                                                                                                   | I.40.23                             | Campo obligatorio en el registro R.40.23.1                                |
| RN-46 | El R.40.23.1 completo se entrega a Dirección Técnica para revisión, firma y archivo                                                                                                     | I.40.23                             | Transición de estado con destinatario fijo                                |
| RN-47 | Las materias primas inflamables se trasladan en contenedor cerrado, vertical, sobre carro firme, sin exposición a fuentes de ignición                                                   | I.20.6                              | Checklist obligatorio al recepcionar insumo inflamable                    |
| RN-48 | Las materias primas inflamables se segregan con conos y cadenas como cuarentena en depósito exterior                                                                                    | I.20.6                              | Depósito destino forzado por `es_inflamable`                              |
| RN-49 | Un usuario nunca se elimina; se desactiva                                                                                                                                               | PG.60.1, integridad de trazabilidad | Sin política de DELETE sobre `usuarios`                                   |
| RN-50 | Toda operación queda registrada en auditoría con autor, momento y valores anterior y posterior                                                                                          | Disp. 6477/12, GAMP 5               | Trigger genérico sobre todas las tablas de negocio                        |

### 6.1 Reglas del dominio comercial y contable

| ID    | Regla                                                                                                            | Fuente                             | Aplicación                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| RN-51 | Solo se puede reservar, remitir o facturar stock de lotes en estado liberado                                     | I.50.7, práctica BPF               | Política RLS sobre `movimientos_stock` de salida por venta        |
| RN-52 | Un lote alcanzado por un retiro de mercado queda bloqueado para venta de forma inmediata                         | PG.60.4                            | Trigger sobre `retiro_lotes` que marca el lote no despachable     |
| RN-53 | El despacho sigue orden de vencimiento más próximo (FEFO). Saltearlo exige justificación escrita                 | I.20.3 (pendiente de confirmación) | Sugerencia de lote con validación blanda y motivo obligatorio     |
| RN-54 | Un movimiento de stock nunca se edita ni se borra. La corrección genera un movimiento inverso vinculado          | Exigencia fiscal y de integridad   | Sin políticas de UPDATE ni DELETE                                 |
| RN-55 | La numeración de comprobantes es correlativa y sin huecos por punto de venta y tipo                              | Régimen de facturación             | Tabla de contadores con bloqueo pesimista en la misma transacción |
| RN-56 | Un comprobante autorizado no se edita ni se borra. Se anula con nota de crédito que lo referencia                | Régimen de facturación             | Trigger sobre estado fiscal                                       |
| RN-57 | El tipo de comprobante se determina por la condición frente al IVA del cliente                                   | Régimen de facturación             | Función determinista, campo calculado                             |
| RN-58 | Todo comprobante emitido debe tener CAE y fecha de vencimiento de CAE antes de entregarse al cliente             | Régimen de facturación             | Estado `AUTORIZADO` como precondición de impresión                |
| RN-59 | El precio aplicado es el vigente a la fecha de emisión, no el actual                                             | Reproducibilidad del comprobante   | Consulta por rango de vigencia                                    |
| RN-60 | Todo asiento debe balancear: suma del debe igual a suma del haber                                                | Partida doble                      | `CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED`                |
| RN-61 | Un período contable cerrado bloquea escrituras sobre asientos y movimientos de stock de ese período o anteriores | Práctica contable                  | Trigger que consulta `periodos_contables`                         |
| RN-62 | La reapertura de un período cerrado exige motivo escrito y queda asentada en auditoría                           | Práctica contable                  | Política por rol + campo obligatorio                              |
| RN-63 | La imputación de un pago no puede superar el saldo pendiente del comprobante imputado                            | Integridad de cuenta corriente     | `CHECK` + trigger de suma acumulada                               |
| RN-64 | Un pedido no puede superar el límite de crédito del cliente sin autorización de gerencia                         | Política comercial, a confirmar    | Validación blanda con autorización registrada                     |
| RN-65 | La recepción física del insumo y la recepción fiscal de la factura son registros separados y vinculados          | Diseño, §2.4                       | Dos tablas con relación opcional                                  |
| RN-66 | Las credenciales y certificados de integración fiscal nunca residen en el cliente ni en el repositorio           | Seguridad                          | Almacén de secretos + Edge Function                               |

### 6.2 Reglas del conteo asistido por imagen

| ID    | Regla                                                                                                    | Fuente                      | Aplicación                                                         |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| RN-67 | La cifra oficial de un conteo es la confirmada por una persona, nunca la estimada por el algoritmo       | GAMP 5, integridad de datos | `conteo_confirmado` obligatorio antes de usar el valor aguas abajo |
| RN-68 | Toda discrepancia entre estimado y confirmado se registra con su motivo                                  | Integridad de datos         | Campo generado + motivo obligatorio si difiere                     |
| RN-69 | Se conservan la imagen original, su hash, la versión del algoritmo y las coordenadas de detección        | Reproducibilidad, auditoría | Almacenamiento privado + campos en `conteos_imagen`                |
| RN-70 | El algoritmo debe superar una calificación operacional documentada por SKU antes de usarse en producción | GAMP 5                      | Protocolo OQ con criterio de aceptación                            |

---

## 7. Especificaciones y control de calidad

### 7.1 Estructura del documento de especificación

Los documentos I-E.50.xx en formato vigente contienen siempre las mismas secciones, y esto define la interfaz de carga:

1. Denominación del producto
2. Composición, en nomenclatura INCI
3. Fórmula cuali-cuantitativa porcentual, con rangos por componente
4. Requisitos, divididos en fisicoquímicos, funcionales, organolépticos y microbiológicos
5. Condiciones de almacenamiento y precauciones
6. Instrucciones para el muestreo y el ensayo
7. Período máximo de almacenamiento antes de repetir el análisis
8. Período de vida útil

Existe además un **formato viejo** (I-E.50.2, I-E.50.3, y los archivos sueltos «ESPECIFICACION_COLOR_…») con encabezado distinto, numeración de sección diferente (`I-E.40.8`, `I-E.30.2`) y campos incompletos, con signos de interrogación en lugar de valores. Esos documentos están en desarrollo y no deben migrarse como especificaciones vigentes.

### 7.2 Especificaciones que se pueden cargar hoy

| Código    | Producto                                     | Estado           | Parámetros numéricos                                                                    |
| --------- | -------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| I-E.50.25 | Líquido acrílico                             | Vigente 20/10/25 | Volátiles ≥ 95 %, densidad 0.9100–0.9200 g/ml, gelificado 1:20–2:00 min, curado 6–9 min |
| I-E.50.26 | Crema humectante, variedades Aire, Amor, Paz | Vigente 20/10/25 | pH 6.00–7.00, densidad 0.95–1.00                                                        |
| I-E.50.27 | Crema exfoliante                             | Borrador         | pendiente de verificación                                                               |
| I-E.50.28 | Aceite para cutículas y uñas                 | Vigente 19/11/25 | documento ausente del proyecto                                                          |
| I-E.50.31 | Esmalte en gel / gel paint                   | Vigente 11/05/26 | documento ausente del proyecto                                                          |
| I-E.50.34 | Perfume                                      | Borrador         | generada previamente, no está entre los archivos                                        |

### 7.3 Motor de evaluación

Pseudocódigo del dictamen:

```
para cada parámetro obligatorio de la especificación:
    si tipo_criterio ∈ {RANGO, MINIMO, MAXIMO}:
        cumple_automatico := evaluar(valor_numerico, límites)
        cumple := cumple_automatico
    si tipo_criterio ∈ {VALOR_TEXTO, CONTRA_PATRON, REFERENCIA_EXTERNA, BINARIO}:
        cumple_automatico := NULL
        cumple := veredicto cargado por el analista (obligatorio)

veredicto_global := CUMPLE si todos los cumple = true, si no NO_CUMPLE

si el analista fija cumple ≠ cumple_automatico:
    exigir justificación no vacía
    registrar el desvío en auditoría
```

La regla de justificación obligatoria ante discrepancia es la que hace defendible el sistema: permite el juicio experto sin que el juicio quede invisible.

### 7.4 Ensayos y equipos asociados

| Parámetro                               | Método                                  | POE del método           | Equipo                    |
| --------------------------------------- | --------------------------------------- | ------------------------ | ------------------------- |
| Densidad                                | Densitómetro de vidrio                  | I.50.25 (borrador)       | Densitómetro              |
| pH                                      | pHmetro                                 | I.50.24 vigente 01/10/25 | ADWA AD12                 |
| Aspecto, color, presencia de partículas | Inspección visual y microscopio digital | I.50.6, I.50.7           | Microscopio digital       |
| Olor                                    | Evaluación olfativa contra patrón       | I.50.6, I.50.7           | Patrón físico             |
| Peso                                    | Balanza calibrada                       | I.50.8                   | Balanza, balanza portátil |
| Control microbiológico                  | Laboratorio externo                     | referencia Disp. 1108/99 | tercerizado               |
| Hermeticidad                            | I.50.32, pendiente                      | —                        | —                         |

La dependencia de calibración vigente es una regla que conviene agregar aunque el POE no la enuncie de forma explícita: un ensayo cargado con un equipo cuya calibración venció debería generar advertencia registrada.

---

## 8. Trazabilidad y registros

### 8.1 Mapa de registro por etapa

| Etapa                             | Registro  | Versión vigente | Firma                         |
| --------------------------------- | --------- | --------------- | ----------------------------- |
| Movimiento de insumos y productos | R.20.1.1  | 00              | Recepción/Expedición          |
| Rótulo de insumos                 | R.20.2.1  | 01              | Recepción/Expedición          |
| Rótulo de productos               | R.20.2.2  | 01              | Producción                    |
| Etiqueta de muestreo              | R.50.4.1  | 00              | Control de Calidad            |
| CC de insumos                     | R.50.5.1  | 00              | Control de Calidad, decide DT |
| CC de semielaborado               | R.50.6.1  | 00              | Control de Calidad, decide DT |
| CC de granel                      | R.50.10.1 | 00              | Control de Calidad, decide DT |
| CC de producto terminado          | R.50.7.1  | 00              | Control de Calidad, decide DT |
| CC de PT importado                | R.50.30.1 | 00              | Control de Calidad, decide DT |
| Rótulo de pesada                  | R.40.16.1 | 01              | Producción                    |
| Etiquetado de envases             | R.40.23.1 | 00              | Producción, revisa DT         |
| Batch record por producto         | R.40.xx.1 | según ME        | Producción, libera DT         |
| Rótulo de contramuestra           | R.60.12.1 | 02              | Control de Calidad            |
| Registro de contramuestras        | R.60.12.2 | 02              | firma DT                      |
| No conformidad y CAPA             | R.60.18.1 | 00              | DT                            |
| Reclamos                          | R.60.3.1  | 00              | DT                            |
| Devoluciones                      | R.60.9.1  | 00              | DT                            |
| Rótulo de devolución              | R.60.9.2  | 00              | Recepción/Expedición          |
| Retiro de mercado                 | R.60.4.1  | 00              | DT                            |
| Rótulo de retiro                  | R.60.4.2  | 01              | Recepción/Expedición          |

### 8.2 Firma electrónica

Cada firma produce un registro inmutable que contiene: identidad del firmante verificada por sesión, momento exacto, significado de la firma (realizó, controló, aprobó, liberó), y una huella SHA-256 calculada **sobre los datos serializados de forma canónica**, no sobre la representación visual. La huella sobre HTML renderizado es frágil: cualquier cambio de plantilla la invalida y deja de servir como prueba.

```
hash = sha256(
  json_canonico({
    tabla, registro_id, campos_de_negocio_ordenados,
    firmante_id, tipo_firma, momento
  })
)
```

### 8.3 Legajo de lote

Documento PDF que reúne, para un lote dado: la orden de producción completa con todas sus etapas y firmas, los lotes de insumo consumidos con sus respectivos controles de calidad, los rótulos emitidos, los muestreos, los controles de calidad de granel y de producto terminado con sus resultados contra especificación, la contramuestra archivada, las no conformidades asociadas, y la firma de liberación. Cada firma se muestra con su huella, y el documento incluye su propia huella de generación.

### 8.4 Trazabilidad bidireccional

Hacia adelante, desde un lote de insumo hasta los lotes de producto terminado y los clientes que los recibieron. Hacia atrás, desde un lote comercializado hasta cada insumo, cada operario y cada equipo intervinientes. Ambas direcciones son consultas recursivas sobre el grafo `lotes_insumo → op_registros → ordenes_produccion → lotes_producto`, resolubles con `WITH RECURSIVE` en una sola consulta.

Esta capacidad es la que se ejercita ante un retiro de mercado y es, en la práctica, lo primero que un inspector pide probar en vivo.

---

## 9. Supuestos y decisiones abiertas

### 9.1 Documentos ausentes del proyecto

Estos POE están listados como vigentes en el Anexo I PG.60.13, pero sus archivos no están cargados. Cada uno bloquea una parte del modelo.

| POE                                             | Qué bloquea                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| I.20.3 Expedición de producto terminado         | Todo el módulo de pedidos, clientes y salida. Es el que define el criterio de rotación de stock (PEPS o FEFO). |
| I.50.5 Control de calidad de insumos            | Los parámetros y criterios del R.50.5.1, que es el primer control del circuito.                                |
| I.50.10 Control de calidad de producto a granel | Cuerpo del procedimiento. El registro R.50.10.1 sí está disponible.                                            |
| I.40.25 Asignación de lote                      | La regla de formación del número de lote. Es la pieza más crítica de las faltantes.                            |
| I.60.17 Evaluación de proveedores               | Criterio y periodicidad de la aprobación de proveedores.                                                       |
| PG.60.9 Devoluciones                            | Cuerpo del procedimiento. El registro R.60.9.1 sí está disponible.                                             |
| I.40.14 Flujo de insumos y productos            | Restricciones de circulación entre áreas.                                                                      |
| I.50.30 CC de producto terminado importado      | Cuerpo. El registro R.50.30.1 sí está.                                                                         |
| I.50.32 Ensayo de hermeticidad                  | Pendiente de emisión según el listado maestro.                                                                 |
| I-E.50.28, I-E.50.31                            | Especificaciones vigentes de aceite de cutículas y gel paint.                                                  |

### 9.2 Preguntas de negocio que los POE no responden

1. **Rotación de stock.** ¿La planta despacha por orden de ingreso o por vencimiento más próximo? El sistema anterior implementó FEFO. Sin I.20.3 no se puede confirmar.
2. **Integración con HOLISSTOR.** I.20.1 e I.20.5 obligan a cargar todo insumo y producto en el sistema de stock externo. ¿Se integra por API, se exporta un archivo, o se mantiene la doble carga manual? La doble carga es el punto donde el sistema pierde adopción.
3. **Alcance del maestro de clientes.** ¿Los pedidos se cargan en el sistema o llegan desde otra herramienta? Administración recibe pedidos según PG.60.1, sin registro asociado documentado.
4. **Modo de la separación de funciones.** Ver §3.4. Requiere una decisión explícita de Dirección Técnica, documentada en el control de cambios.
5. **Período en paralelo al papel.** ¿Ya comenzó sobre la implementación anterior? Si comenzó, migrar lo reinicia y hay que recalcular el cronograma de validación.
6. **Rótulo gris de estado «en análisis».** El sistema anterior parece haber usado solo tres colores. I.20.2 define cuatro. Confirmar si el estado se usa en la práctica.
7. **Numeración correlativa.** Los registros usan formato `correlativo/año` (por ejemplo `R.60.18.1.1/24`). ¿La numeración se reinicia cada año calendario? Se asume que sí.
8. **Firma electrónica y validez legal.** ¿Se busca equivalencia con firma digital según la Ley 25.506 argentina, o alcanza con firma electrónica avanzada con trazabilidad? Cambia los requisitos de infraestructura de manera sustancial.
9. **Migración de datos de HOLISSTOR.** ¿Se migran saldos históricos de stock y cuentas corrientes, o se arranca con un inventario inicial valuado y saldos de apertura a una fecha de corte? La segunda opción es mucho más barata y suele ser suficiente.
10. **Método de costeo.** Promedio ponderado móvil como valor por defecto, según §4.12.2. Requiere confirmación del estudio contable, porque es una política contable declarada.
11. **Integración fiscal directa o vía intermediario.** Ver §4.12.3. Es una decisión de costo total de propiedad, no técnica.
12. **Puntos de venta habilitados.** ¿Cuántos hay dados de alta y con qué numeración vienen? Determina el estado inicial de la tabla de contadores.
13. **Percepciones y retenciones.** ¿Nail Show actúa como agente de percepción de IIBB en alguna jurisdicción? Cambia el cálculo de todo comprobante emitido.
14. **Cantidad y disposición típica del conteo por imagen.** ¿Cuántas unidades entran en una foto, en qué disposición y sobre qué fondo? Determina la resolución mínima de captura y si conviene el marcador fiducial.

### 9.3 Supuestos adoptados en este documento

- Los estados `RECIBIDO` y `MUESTREADO` del lote de insumo son internos del sistema y no tienen rótulo asociado.
- El correlativo anual se reinicia el 1 de enero.
- Un lote de insumo puede consumirse en varias órdenes de producción, y una orden puede consumir varios lotes del mismo insumo.
- La especificación aplicable a un control de calidad es la vigente a la fecha de elaboración del lote, no la vigente a la fecha del análisis.
- Las verificaciones previas tipo SI/NO son bloqueantes cuando el valor esperado es SI, salvo que la etapa esté marcada como no bloqueante.

---

## 10. Inconsistencias documentales detectadas

Estas contradicciones existen hoy en los POE. Implementarlos al pie de la letra reproduciría el error, así que cada una necesita resolución antes de escribir el código correspondiente.

| #   | Inconsistencia                                                                                                                                                                                                                                                                                | Documentos                                    | Resolución propuesta                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | I.20.1 instruye colorear el estatus de cuarentena en **rojo**. I.20.2 fija **amarillo** para cuarentena y rojo para rechazado                                                                                                                                                                 | I.20.1 v00 paso 8 contra I.20.2 v00           | Prevalece I.20.2, que es el POE específico de rotulado y coincide con los rótulos R.20.2.1 v01 y con I.20.5 v03, que dice amarillo. Corregir I.20.1.          |
| 2   | El batch record R.40.26.1 instruye adjuntar el **R.50.9.1** para el control de calidad de granel. Ese registro no existe; el correcto es **R.50.10.1**                                                                                                                                        | R.40.26.1 contra I.50.10 y el listado maestro | Corregir el batch record. El error se propaga a ME.40.29.                                                                                                     |
| 3   | I.40.16 instruye completar el rótulo **R.40.16.2**, pero el registro adjunto al propio POE se identifica como **R.40.16.1**                                                                                                                                                                   | I.40.16 v01, cuerpo contra anexo              | Corregir el cuerpo del POE a R.40.16.1.                                                                                                                       |
| 4   | I.50.6 e I.50.7 citan el POE de muestreo como **I.50.40**. El código correcto es **I.50.4**                                                                                                                                                                                                   | I.50.6 v00, I.50.7 v00                        | Error tipográfico. Corregir ambos.                                                                                                                            |
| 5   | I.40.16 cita **I.20.13** para limpieza y desinfección. El código correcto es **I.40.13**                                                                                                                                                                                                      | I.40.16 v01                                   | Corregir.                                                                                                                                                     |
| 6   | I.60.12 se encabeza como **PG.60.12** en el cuerpo del documento, aunque figura como I.60.12 en el listado maestro                                                                                                                                                                            | I.60.12 v02 contra Anexo I PG.60.13           | Unificar a I.60.12.                                                                                                                                           |
| 7   | El listado maestro registra **PG.60.1 versión 02** emitida el 11/07/25. El archivo disponible es la **versión 01** vigente desde 17/02/25                                                                                                                                                     | Anexo I PG.60.13 contra el archivo            | Localizar la versión 02. El organigrama y la dotación pueden haber cambiado, lo que afecta directamente la matriz de permisos.                                |
| 8   | El listado maestro registra **I.40.16 versión 00** emitida 12/11/24 con vigencia 26/11/24. El archivo disponible es la **versión 01** en borrador con vigencia declarada 06/01/2025                                                                                                           | Anexo I PG.60.13 contra el archivo            | Definir cuál rige. El archivo tiene además un comentario abierto de la DT: «esto es lo que se tendría que modificar».                                         |
| 9   | El listado maestro registra **I.40.13 versión 02** emitida 15/07/25. El archivo disponible es la **versión 00** vigente 31/07/24                                                                                                                                                              | Anexo I PG.60.13 contra el archivo            | Localizar la versión 02.                                                                                                                                      |
| 10  | **PG.60.4 versión 01** figura como vigente desde 31/07/25 en el listado maestro, y el archivo está rotulado **BORRADOR**                                                                                                                                                                      | Anexo I PG.60.13 contra el archivo            | Confirmar el estado real antes de implementar el módulo de retiro.                                                                                            |
| 11  | El sistema de stock externo aparece como **HOLISSTOR** en I.20.1 y como **HOLISTOR** en I.20.5                                                                                                                                                                                                | I.20.1 contra I.20.5 v03                      | Unificar la grafía.                                                                                                                                           |
| 12  | PG.60.1 asigna a **Control de Calidad** la facultad de aprobar o rechazar insumos y productos. I.50.6 e I.50.7 asignan la decisión a **Dirección Técnica**, con Control de Calidad limitado a informar                                                                                        | PG.60.1 v01 contra I.50.6 y I.50.7            | Decisión de la DT. Determina el sujeto de la política de escritura sobre el veredicto. Ver §3.4.                                                              |
| 13  | I.20.2 versión 00 define el rótulo R.20.2.2 sin campo **CÓDIGO**. El rótulo R.20.2.2 versión 01 sí lo tiene                                                                                                                                                                                   | I.20.2 v00 contra R.20.2.2 v01                | El POE quedó desactualizado respecto del registro que gobierna. Actualizar I.20.2.                                                                            |
| 14  | I.60.12 se refiere a «muestra de producto **a granel** en embalaje equivalente al envase primario» en el historial de cambios, cuando el alcance del POE es producto terminado                                                                                                                | I.60.12 v02, historial versión 01             | Aclaración de redacción.                                                                                                                                      |
| 15  | ME.40.26 aparece emitida el 06/10/2025 mientras que su registro asociado R.40.26.1 sigue en **borrador versión 00**                                                                                                                                                                           | Anexo I PG.60.13 contra el archivo            | Un método vigente cuyo registro está en borrador es un hallazgo de auditoría. Resolver.                                                                       |
| 16  | El organigrama de PG.60.1 v01 declara 7 personas y no coincide con la nómina real de 11 (§3.1): nombra a Flavio Baez en Administración, ubica a Virginia Arleo en Gerencia Administrativa de Producción y no contempla a los operarios actuales ni al segundo integrante de Dirección Técnica | PG.60.1 v01 contra la nómina informada        | Emitir PG.60.1 v03. El organigrama documentado es exigencia de BPF y la matriz de permisos del sistema deriva de él. Bloqueante para la puesta en producción. |

---

## 11. Recomendación de secuencia de implementación

| Fase | Contenido                                                                                                          | Bloqueado por                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1    | Plataforma, Supabase Auth, `usuarios`, roles, RLS base, tabla de auditoría con trigger genérico, firma electrónica | nada                                          |
| 2    | Maestros: `depositos`, `proveedores`, `insumos_catalogo`, `productos`, `presentaciones`, `equipos`                 | nada                                          |
| 3    | Recepción, rótulos, máquina de estados del lote de insumo, muestreo                                                | nada                                          |
| 4    | Especificaciones y motor de evaluación, control de calidad de insumos                                              | I.50.5                                        |
| 5    | Procedimientos configurables, órdenes de producción, batch record, doble firma                                     | I.40.25, decisión de §3.4                     |
| 6    | Control de calidad de granel y terminado, contramuestras, liberación                                               | I.50.10                                       |
| 7    | Legajo de lote en PDF, trazabilidad bidireccional                                                                  | fases 1 a 6                                   |
| 8    | No conformidad y CAPA, reclamos, devoluciones, retiro                                                              | PG.60.9                                       |
| 9    | Expedición, clientes, pedidos                                                                                      | I.20.3                                        |
| 10   | Producto importado                                                                                                 | nada, ya está documentado                     |
| 11   | Stock valorizado, costeo por lote, movimientos y kardex                                                            | fase 3, decisión de método de costeo          |
| 12   | Clientes, listas de precios, pedidos, remitos                                                                      | I.20.3                                        |
| 13   | Conteo asistido por imagen                                                                                         | fase 12, definición de captura                |
| 14   | Facturación electrónica y comprobantes                                                                             | fase 12, certificado y puntos de venta        |
| 15   | Cuentas corrientes, imputaciones, cobranzas                                                                        | fase 14                                       |
| 16   | Plan de cuentas, asientos automáticos, libros IVA y cierre de período                                              | fase 15, plan de cuentas del estudio contable |

Las fases 1 a 3 se pueden empezar hoy sin ninguna definición pendiente. Cubren aproximadamente la mitad del esfuerzo de infraestructura del dominio regulado y toda la base sobre la que se apoya el resto.

El bloque comercial (fases 11 a 16) es independiente del regulado hasta la fase 12, así que puede desarrollarse en paralelo por otra persona si hay dotación. El único punto de acoplamiento fuerte es la regla RN-51, que exige que el stock vendible provenga de lotes liberados.

Una advertencia de secuencia: la fase 14 tiene una dependencia externa con plazo propio (obtención del certificado fiscal y habilitación de los puntos de venta) que no depende del equipo de desarrollo. Conviene iniciar ese trámite cuando arranque la fase 11, no cuando termine la 13.

---

## Anexo A. Enumeraciones

```sql
CREATE TYPE rol_enum AS ENUM (
  'OPERARIO','CONTROL_CALIDAD','DIRECCION_TECNICA','ADMINISTRACION',
  'GERENCIA_PRODUCCION','GERENCIA','ADMINISTRADOR_SISTEMA');

CREATE TYPE sector_enum AS ENUM (
  'ADMINISTRACION','RECEPCION_EXPEDICION','DEPOSITO','PRODUCCION',
  'CONTROL_CALIDAD','GARANTIA_CALIDAD','MANTENIMIENTO','DIRECCION_TECNICA','GERENCIA');

CREATE TYPE estado_calidad_enum AS ENUM (
  'RECIBIDO','CUARENTENA','MUESTREADO','EN_ANALISIS','APROBADO','RECHAZADO');

CREATE TYPE tipo_insumo_enum AS ENUM (
  'MATERIA_PRIMA','MATERIAL_ENVASE','MATERIAL_EMPAQUE','ETIQUETA','SEMIELABORADO');

CREATE TYPE tipo_producto_enum AS ENUM ('SEMIELABORADO','GRANEL','TERMINADO');

CREATE TYPE origen_producto_enum AS ENUM ('FABRICADO','FRACCIONADO','IMPORTADO');

CREATE TYPE forma_cosmetica_enum AS ENUM (
  'SOLIDA_POLVO','LIQUIDA','SEMISOLIDA','HIDROALCOHOLICA');

CREATE TYPE categoria_muestreo_enum AS ENUM (
  'MATERIAL_ENVASE_EMPAQUE','MATERIA_PRIMA','SEMIELABORADO_GRANEL','PRODUCTO_TERMINADO');

CREATE TYPE destino_muestra_enum AS ENUM (
  'CONTRAMUESTRA','DESCARTE','REUTILIZACION_ENVASE');

CREATE TYPE grupo_parametro_enum AS ENUM (
  'FISICOQUIMICO','FUNCIONAL','ORGANOLEPTICO','MICROBIOLOGICO');

CREATE TYPE tipo_criterio_enum AS ENUM (
  'RANGO','MINIMO','MAXIMO','VALOR_TEXTO','CONTRA_PATRON','REFERENCIA_EXTERNA','BINARIO');

CREATE TYPE tipo_cc_enum AS ENUM (
  'R_50_5_1','R_50_6_1','R_50_10_1','R_50_7_1','R_50_30_1');

CREATE TYPE estado_documento_enum AS ENUM (
  'EN_DESARROLLO','BORRADOR','LISTO_PARA_EMITIR','VIGENTE','EN_REVISION','DADO_DE_BAJA');

CREATE TYPE origen_nc_enum AS ENUM (
  'RECLAMO_CLIENTE','DETECCION_INTERNA','FALLA_PROVEEDOR','INSPECCION_AUTORIDAD');

CREATE TYPE clase_retiro_enum AS ENUM ('I','II','III');
CREATE TYPE tipo_retiro_enum AS ENUM ('VOLUNTARIO','ORDENADO_AUTORIDAD');
CREATE TYPE alcance_retiro_enum AS ENUM ('DISTRIBUIDORA','CONSUMIDOR','OTRO');
CREATE TYPE profundidad_retiro_enum AS ENUM ('MAYORISTA','MINORISTA','CONSUMIDOR');
CREATE TYPE nivel_auditoria_enum AS ENUM ('A','B','C','D','E');
CREATE TYPE canal_reclamo_enum AS ENUM ('TELEFONO','EMAIL','PRESENCIAL');
CREATE TYPE tipo_capa_enum AS ENUM ('CORRECTIVA','PREVENTIVA');
CREATE TYPE veredicto_enum AS ENUM ('CUMPLE','NO_CUMPLE');
```

### Enumeraciones del esquema `comercial`

```sql
CREATE TYPE tipo_doc_enum AS ENUM ('CUIT','CUIL','DNI','CONSUMIDOR_FINAL');

CREATE TYPE condicion_iva_enum AS ENUM (
  'RESPONSABLE_INSCRIPTO','MONOTRIBUTO','EXENTO','CONSUMIDOR_FINAL','NO_ALCANZADO');

CREATE TYPE metodo_costeo_enum AS ENUM ('PEPS','PPP','ESTANDAR');

CREATE TYPE tipo_movimiento_enum AS ENUM (
  'ENTRADA_COMPRA','ENTRADA_PRODUCCION','ENTRADA_DEVOLUCION','ENTRADA_AJUSTE',
  'SALIDA_VENTA','SALIDA_CONSUMO_PRODUCCION','SALIDA_MUESTRA','SALIDA_DESCARTE',
  'SALIDA_AJUSTE','SALIDA_RETIRO_MERCADO','TRANSFERENCIA_ENTRE_DEPOSITOS');

CREATE TYPE tipo_comprobante_enum AS ENUM (
  'FACTURA_A','FACTURA_B','FACTURA_C',
  'NOTA_CREDITO_A','NOTA_CREDITO_B','NOTA_CREDITO_C',
  'NOTA_DEBITO_A','NOTA_DEBITO_B','NOTA_DEBITO_C',
  'REMITO','RECIBO','PRESUPUESTO','ORDEN_COMPRA');

CREATE TYPE sentido_comprobante_enum AS ENUM ('EMITIDO','RECIBIDO');

CREATE TYPE concepto_enum AS ENUM ('PRODUCTOS','SERVICIOS','PRODUCTOS_Y_SERVICIOS');

CREATE TYPE estado_fiscal_enum AS ENUM (
  'BORRADOR','PENDIENTE_CAE','AUTORIZADO','RECHAZADO','ANULADO');

CREATE TYPE tipo_cuenta_enum AS ENUM ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','EGRESO');

CREATE TYPE estado_pedido_enum AS ENUM (
  'BORRADOR','CONFIRMADO','RESERVADO','EN_PREPARACION','PREPARADO',
  'DESPACHADO','FACTURADO','COBRADO','CON_DEVOLUCION','ANULADO');
```

## Anexo B. Inventario de POE analizados

Se analizaron 101 archivos. Los POE con contenido normativo aprovechado en este documento:

**Recepción y expedición (20):** I.20.1 v00, I.20.2 v00, I.20.5 v02 y v03, I.20.6 v01.

**Producción (40):** I.40.13 v00, I.40.16 v01, I.40.23 v00, ME.40.31, ME.40.32, ME.40.33, ME.40.34, ME.40.29, R.40.16.1, R.40.26.1, R.40.27.1.

**Control de calidad (50):** I.50.4 v00, I.50.6 v00, I.50.7 v00, I.50.8 v00, I.50.25 borrador, I-E.50.2, I-E.50.3, I-E.50.25, I-E.50.26, I-E.50.27, R.50.4.1, R.50.7.1, R.50.10.1, R.50.30.1.

**Garantía de calidad (60):** PG.60.1 v00 y v01, PG.60.2, PG.60.3 v00, PG.60.4 v00 y v01, PG.60.7, PG.60.8 v00, PG.60.11, PG.60.13 v00, PG.60.14, PG.60.16, PG.60.18 v00, PG.60.19, I.60.12 v02, E.60.20, V.60.21, R.60.3.1, R.60.4.1, R.60.4.2, R.60.9.1, R.60.9.2, R.60.12.1, R.60.12.2, R.60.13.1, R.60.15.1, R.60.15.2.

**Mantenimiento (70):** I.70.1 v00, I.70.2 v00.

**Maestro:** Anexo I PG.60.13, listado completo de POE con estado, versión, vigencia y capacitación.
