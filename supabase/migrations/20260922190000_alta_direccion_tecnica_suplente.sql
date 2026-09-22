-- ---------------------------------------------------------------------------
-- Propósito : Asignar rol, sector y condición de suplente a la cuenta de
--             Eliseo Agustín Coggiola, Dirección Técnica suplente. Queda en el
--             repositorio para que la asignación de permisos tenga historial:
--             quién recibió qué rol y cuándo.
-- Reglas    : §3.3 (matriz de permisos), §4.1 (nómina). RN-49 / invariante 9:
--             el usuario no se borra, se desactiva; acá se hace lo inverso.
-- Fecha     : 2026-09-22
-- ---------------------------------------------------------------------------
--
-- QUIÉN ES Y POR QUÉ ESTE ROL.
-- El alcance (§ nómina, tabla de sectores) ya lo nombra: «Dirección Técnica
-- (cubre Control de Calidad y Garantía de Calidad) — Anabella Gregorini
-- (titular), Eliseo Agustín Coggiola». No es una cuenta nueva inventada para
-- este sistema: es la segunda de las dos personas que el organigrama declara
-- en Dirección Técnica.
--
-- El alcance modela esas dos personas como **titular y suplente**, no como
-- «dirección» y «codirección»: «Ante ANMAT existe un Director Técnico
-- registrado, con responsabilidad legal personal e indelegable sobre la
-- liberación de cada lote. Dos personas en el rol se modelan como titular y
-- suplente, con el campo `es_dt_titular` en `usuarios`.»
--
-- De ahí que acá no se cree ningún rol nuevo. `core.rol_enum` tiene siete
-- valores y no hay un escalón intermedio entre DIRECCION_TECNICA y el resto:
-- la distinción entre las dos personas del sector la lleva `es_dt_titular`,
-- que ya existe desde 20260904140100 y tiene un índice único parcial
-- (`usuarios_dt_titular_unica`) que garantiza que haya una sola titular.
--
--   Anabella Gregorini      -> DIRECCION_TECNICA, es_dt_titular = true
--   Eliseo Agustín Coggiola -> DIRECCION_TECNICA, es_dt_titular = false
--
-- `es_dt_titular = false` se escribe explícito y no se deja al default: es la
-- afirmación deliberada de que esta cuenta no es la titular, no un valor que
-- quedó por omisión. Además es lo que hace que el UPDATE sea correcto si la
-- fila ya existiera con otro valor.
--
-- QUÉ NO DEFINE ESTA MIGRACIÓN.
-- Con qué alcance firma la suplente es una **decisión abierta** (D-25): el
-- alcance dice que ambas personas pueden firmar liberaciones, y la conducción
-- del proyecto informó lo contrario —que el batch record lo firma únicamente
-- Anabella Gregorini—. Hasta que se resuelva, esta migración asigna los
-- permisos que el alcance ya documenta y no agrega ni quita capacidad de
-- firma. El batch record todavía no existe como tabla en el esquema, así que
-- hoy no hay ningún registro sobre el cual la restricción pudiera actuar.
--
-- SOBRE EL DOBLE ROL.
-- El alcance también asigna a esta persona el rol de administrador del
-- sistema, y advierte que conviene que sean «dos credenciales de rol separadas
-- sobre el mismo usuario, y no un rol único que acumule ambos poderes» (§3.5).
-- Esta migración da solo DIRECCION_TECNICA. El acceso de administración va por
-- una credencial aparte cuando se implemente `roles_adicionales`, que hoy
-- sigue siendo el pendiente de §3.4.
--
-- POR QUÉ UN UPDATE POR EMAIL Y NO UN INSERT.
-- La cuenta la crea Supabase Auth cuando la persona se registra, y el trigger
-- `core.fn_alta_usuario_auth` inserta la fila en `core.usuarios` como OPERARIO
-- desactivado. Esta migración la promueve. Se identifica por email y no por
-- uuid porque el uuid lo genera Auth en el proyecto alojado y no existiría en
-- una base reconstruida desde cero.
--
-- CONSECUENCIA: **la cuenta tiene que existir antes de aplicar esto.** Si la
-- fila no está, el UPDATE no afecta ninguna, la migración queda registrada
-- como aplicada y nunca vuelve a correr. Registrarse primero, `db push`
-- después, y verificar con el SELECT del final.

update core.usuarios
   set rol             = 'DIRECCION_TECNICA',
       sector          = 'DIRECCION_TECNICA',
       es_dt_titular   = false,
       nombre_completo = 'Eliseo Agustín Coggiola',
       activo          = true,
       fecha_baja      = null
 where email = 'salta.agustin@gmail.com';

-- Verificación de que la promoción encontró la fila. Si la cuenta no se había
-- registrado todavía, esto corta la migración en vez de dejarla aplicada sin
-- efecto, que es el modo silencioso en que este patrón falla.
do $$
begin
  if not exists (
    select 1 from core.usuarios
     where email = 'salta.agustin@gmail.com'
       and rol = 'DIRECCION_TECNICA'
  ) then
    raise exception
      'No existe la cuenta salta.agustin@gmail.com en core.usuarios. Registrala por la app antes de aplicar esta migración.';
  end if;
end;
$$;

-- La contraseña de esta cuenta se transmitió por chat, igual que las de
-- `naza@nailshow.com` y `verificacion@nailshow.com.ar`. **Hay que rotarla** en
-- el primer ingreso: una credencial que quedó en un transcript no es una
-- credencial.
