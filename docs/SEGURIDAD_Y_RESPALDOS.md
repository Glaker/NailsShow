# Seguridad y respaldos de la información de Nail Show

Informe para la Dirección. Borrador del 2026-10-15: lo marcado como
**[pendiente]** espera una decisión o un dato que todavía no tenemos.

---

## 1. Qué información tenemos y dónde está

| Qué | Dónde vive | ¿Lo cubre el respaldo de Supabase? |
| --- | --- | --- |
| Registros de fabricación, control de calidad, liberación, stock, pedidos, clientes, facturas, cuentas corrientes, costos, tareas, auditoría | Base de datos en Supabase (servidor en San Pablo, Brasil) | Sí, según el plan contratado (ver 2) |
| Usuarios y contraseñas (cifradas) | Misma base de datos, sección de autenticación | Sí |
| Archivos (PDF, fotos, comprobantes escaneados) | Hoy **no hay archivos guardados** en el sistema. Dos registros admiten un enlace a un archivo externo (protocolo del lote de insumo y comprobante de gasto), y **ninguno tiene enlaces cargados** (revisado en la base real el 2026-10-15, en toda columna de texto: ningún `http`, Drive, Dropbox ni OneDrive) | No. Un archivo enlazado vive fuera de la app y ningún respaldo lo cubre: antes de que se empiecen a usar esos enlaces conviene decidir guardar los archivos dentro del sistema, donde sí se respaldan |
| Programa (el código de la aplicación) | GitHub (cuenta personal) | No es un dato: se puede volver a publicar desde GitHub |
| Funciones de facturación electrónica | Supabase (código en GitHub) | El código, por GitHub; los certificados no |
| Certificados de ARCA, clave de Afip SDK | Almacén de secretos de Supabase | **No.** Deben estar también en el gestor de contraseñas de la empresa |
| Aplicación publicada | Vercel | No guarda datos |

## 2. Cómo se respalda hoy

Supabase hace una copia diaria de la base **solo si el proyecto está en un plan pago**:

| Plan | Copia automática | Cuántos días se guarda |
| --- | --- | --- |
| Gratuito | No | — |
| Pro (USD 25/mes) | Diaria | 7 días |
| Team | Diaria | 14 días |

**[pendiente]** Confirmar en qué plan está el proyecto (Panel de Supabase →
Organización → Facturación). Si es el gratuito, **hoy no hay ninguna copia
automática** y esto es lo primero a resolver.

Fuera de eso, **hoy no existe ninguna copia propia de la empresa**: todo está en
un único proveedor, una única región y bajo una cuenta personal.

## 3. Cuántos datos podríamos perder y cuánto tardaríamos en volver

Dos medidas:

- **Pérdida máxima (en inglés, RPO):** cuánto trabajo cargado se podría perder
  si hubiera que volver atrás. Con una copia por día, hasta **24 horas** de
  carga: un día entero de registros de planta, pedidos y facturas.
- **Tiempo sin sistema (RTO):** cuánto tiempo la aplicación queda sin poder
  usarse mientras se recupera. Restaurar una copia de Supabase deja el sistema
  fuera de servicio durante la restauración. Con el tamaño actual de la base,
  estimamos menos de una hora, más el tiempo de verificar que todo quedó bien.

Para registros de Buenas Prácticas y de facturación, perder un día es grave: un
lote fabricado y liberado ese día tendría que volver a cargarse desde papel.

**Propuesta:** contratar la **recuperación a un punto en el tiempo** (PITR). Con
ella la pérdida máxima baja a **unos 2 minutos**. Costo aproximado, según la
lista vigente de Supabase:

| Concepto | Costo mensual aprox. |
| --- | --- |
| Plan Pro (si no se tiene) | USD 25 |
| Servidor «Small» (lo exige la recuperación a un punto) | unos USD 15 por encima de lo incluido en Pro |
| Recuperación a un punto, 7 días | USD 100 |
| **Total** | **unos USD 140 por mes** |

## 4. Copia propia, fuera de Supabase (regla 3-2-1)

La regla: **tres copias, en dos lugares distintos, una fuera del proveedor
principal**. Así, aunque se pierda el acceso a Supabase, la empresa conserva
sus datos.

Propuesta:

- Todas las noches, una tarea automática saca una copia completa de la base
  (usuarios, estructura y datos) y de los archivos, si los hubiera.
- La copia se **cifra antes de salir**, porque contiene datos personales de
  clientes y empleados. La clave para abrirla queda en el gestor de contraseñas
  de la empresa, en manos de dos personas.
- La copia se guarda en un almacenamiento **a nombre de la empresa**, nunca en
  una cuenta personal, fuera de Supabase. **[pendiente]** Cuál.
- Conservación propuesta, **[pendiente]** de confirmación de la Dirección
  Técnica y del contador:
  - copias diarias por 30 días;
  - una copia mensual por 10 años;
  - los datos de la base en uso nunca se borran.

  Por qué esos plazos: el procedimiento de muestras de archivo (I.60.12)
  conserva muestras hasta un año después del vencimiento, y con una vida útil
  de 36 meses eso da al menos cuatro años desde la fabricación. El Código Civil
  y Comercial (art. 328) exige conservar la documentación comercial diez años.
- Si una copia falla, llega un aviso por correo al administrador del sistema.
- Nunca se guardan copias en el repositorio de código ni en el sistema de
  práctica.

## 5. Copia legible por cualquiera

Además de la copia técnica, el administrador del sistema y la Gerencia van a
tener un botón para **descargar todos los datos en Excel**, una hoja por tabla,
con un índice. Incluye costos y auditoría, así que cada descarga queda
registrada con quién la hizo y cuándo.
Así la empresa puede leer su información sin depender de Supabase ni de quien
programó el sistema.

## 6. Prueba de que la copia sirve

Una copia que nunca se restauró no está probada. Una vez por mes:

1. Se restaura la última copia en un proyecto aparte y temporal, que se borra
   al terminar.
2. Se comparan la cantidad de registros por tabla, los saldos de cuentas
   corrientes y los últimos números de comprobante.
3. Se anota la fecha, quién la hizo y qué diferencias aparecieron.

La primera prueba se hace antes de aplicar los cambios grandes de pedidos,
precios y la migración desde HOLISSTOR.

## 7. Quién tiene acceso a qué

| Servicio | Situación hoy | Propuesta |
| --- | --- | --- |
| Supabase (base de datos) | Cuenta personal | Organización «Nail Show» con al menos dos dueños: un directivo y el responsable técnico |
| GitHub (código) | Cuenta personal | Organización «Nail Show» con dos dueños |
| Vercel (publicación) | **[pendiente]** confirmar titular | Equipo de la empresa |
| Afip SDK | **[pendiente]** confirmar titular | A nombre de la empresa |
| Consola de Anthropic | **[pendiente]** confirmar titular | A nombre de la empresa |

Para todas estas cuentas, y para los correos asociados:

- **Segundo factor obligatorio** (un código del celular además de la
  contraseña).
- **Mínimo privilegio:** cada persona tiene el acceso que necesita, nada más.
- **Al irse alguien de la empresa:** se le desactiva el usuario del sistema
  (nunca se borra, para conservar quién firmó qué), y se le quitan los accesos
  a Supabase, GitHub, Vercel, Afip SDK y Anthropic, y las claves que conocía se
  cambian.

## 8. Controles que ya funcionan

- Cada usuario ve y modifica solo lo que su rol permite, y eso lo controla la
  base de datos, no la pantalla.
- Nada se borra: los registros firmados no se modifican, y toda modificación
  queda en un registro de auditoría con quién, cuándo y qué valor tenía antes.
- En cada cambio de código se revisa automáticamente que no se haya dejado
  ninguna clave a la vista.
- Las bibliotecas que usa la aplicación publicada no tienen vulnerabilidades
  conocidas (revisión del 2026-10-15). Las herramientas de desarrollo tienen
  ocho avisos que no llegan a la aplicación publicada; se actualizan en la
  próxima tanda.
- Conexión siempre cifrada (HTTPS) y cabeceras de seguridad en el sitio
  publicado (agregadas el 2026-10-15).

## 9. Pendientes, con su costo

| # | Pendiente | Costo | Urgencia |
| --- | --- | --- | --- |
| 1 | Confirmar el plan de Supabase y, si es el gratuito, pasar a Pro | USD 25/mes | Alta |
| 2 | Recuperación a un punto en el tiempo (pérdida máxima de unos 2 minutos) | unos USD 115/mes más | Alta para registros BPF y facturación |
| 3 | Copia nocturna cifrada fuera de Supabase | unos pocos USD/mes de almacenamiento | Alta |
| 4 | Pasar Supabase y GitHub a cuentas de la empresa, con dos dueños | sin costo | Alta |
| 5 | Segundo factor en todas las cuentas | sin costo | Alta |
| 6 | Cambiar las claves que quedaron expuestas en sesiones de trabajo: token de Afip SDK, token de administración y contraseña de la base de Supabase, contraseña de la cuenta de verificación | sin costo | **Inmediata** |
| 7 | Contraseñas de al menos 12 caracteres (se sube en el panel el 2026-10-15) y cierre del alta libre de cuentas | sin costo | Media |
| 7b | Política de contenido del sitio: publicada en modo informe; tras una semana sin avisos, pasar a modo bloqueo | sin costo | Media |
| 8 | Prueba mensual de restauración | unas horas por mes | Media |
| 9 | Consultar al asesor legal sobre la **Ley 25.326 de Protección de Datos Personales**: la base guarda datos de clientes y empleados, y la ley puede exigir, entre otras cosas, inscribirla en el registro de la Agencia de Acceso a la Información Pública | honorarios del asesor | Media |
