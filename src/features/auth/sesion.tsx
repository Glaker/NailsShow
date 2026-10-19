import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

export type Rol = Database['core']['Enums']['rol_enum'];

// Puente: FINANZAS entra con 20261009120000. Al correr `npm run db:types` con
// esa migración aplicada, el cast sobra y se reemplaza por el literal.
export const FINANZAS = 'FINANZAS' as Rol;
export type Sector = Database['core']['Enums']['sector_enum'];

/**
 * Claims que el hook `core.custom_access_token_hook` inyecta en el JWT.
 *
 * Se leen del token y no de una consulta a `core.usuarios` por la misma razón
 * por la que las políticas RLS los leen de ahí: la ficha del usuario y sus
 * permisos tienen que viajar en la credencial, no resolverse con una consulta
 * que a su vez necesita permisos (CLAUDE.md §7).
 */
export interface ClaimsSesion {
  usuario_id: string | null;
  rol: Rol | null;
  roles: Rol[];
  sector: Sector | null;
  nombre: string | null;
  es_dt_titular: boolean;
}

interface ValorSesion {
  session: Session | null;
  claims: ClaimsSesion | null;
  cargando: boolean;
  /** Autenticado en Supabase pero sin rol: usuario desactivado o recién creado. */
  sinHabilitar: boolean;
  /**
   * La sesión se cerró sin que el usuario tocara «Salir» (refresco fallido,
   * sesión revocada). La pantalla sigue montada, con lo que había escrito, y se
   * pide reingresar encima. `claims` conserva los de la sesión perdida para que
   * el menú y las rutas no se desarmen mientras tanto.
   */
  vencida: { email: string } | null;
  ingresar: (email: string, password: string) => Promise<void>;
  registrar: (email: string, password: string, nombreCompleto: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Refresca el token para tomar un cambio de rol sin cerrar sesión. */
  refrescar: () => Promise<void>;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

function leerClaims(session: Session | null): ClaimsSesion | null {
  if (!session?.access_token) return null;
  try {
    const cargaUtil = session.access_token.split('.')[1];
    if (!cargaUtil) return null;
    const json = JSON.parse(
      decodeURIComponent(
        atob(cargaUtil.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join(''),
      ),
    ) as Record<string, unknown>;

    return {
      usuario_id: (json.usuario_id as string) ?? null,
      rol: (json.rol as Rol) ?? null,
      roles: Array.isArray(json.roles) ? (json.roles as Rol[]) : [],
      sector: (json.sector as Sector) ?? null,
      nombre: (json.nombre as string) ?? null,
      es_dt_titular: json.es_dt_titular === true,
    };
  } catch {
    return null;
  }
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vencida, setVencida] = useState<{
    email: string;
    claims: ClaimsSesion | null;
  } | null>(null);
  const salidaVoluntaria = useRef(false);
  const ultima = useRef<Session | null>(null);

  useEffect(() => {
    let vigente = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!vigente) return;
      ultima.current = data.session;
      setSession(data.session);
      setCargando(false);
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, nueva) => {
      // Diagnóstico del cierre inesperado (bloque 1.2): queda en la consola
      // qué evento llegó, cuándo y cuándo vencía el token.
      console.info(
        '[sesion]',
        evento,
        new Date().toISOString(),
        nueva?.expires_at
          ? `vence ${new Date(nueva.expires_at * 1000).toISOString()}`
          : '',
      );
      if (
        evento === 'SIGNED_OUT' &&
        !salidaVoluntaria.current &&
        ultima.current?.user.email
      ) {
        console.warn('[sesion] cierre no pedido por el usuario');
        setVencida({
          email: ultima.current.user.email,
          claims: leerClaims(ultima.current),
        });
      }
      if (nueva) {
        setVencida(null);
        salidaVoluntaria.current = false;
      }
      ultima.current = nueva;
      setSession(nueva);
      setCargando(false);
    });

    return () => {
      vigente = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  const claims = useMemo(
    () => leerClaims(session) ?? vencida?.claims ?? null,
    [session, vencida],
  );

  const ingresar = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const registrar = useCallback(
    async (email: string, password: string, nombreCompleto: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre_completo: nombreCompleto } },
      });
      if (error) throw error;
    },
    [],
  );

  const salir = useCallback(async () => {
    salidaVoluntaria.current = true;
    setVencida(null);
    await supabase.auth.signOut();
  }, []);

  const refrescar = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(data.session);
  }, []);

  const valor = useMemo<ValorSesion>(
    () => ({
      session,
      claims,
      cargando,
      sinHabilitar: Boolean(session) && !claims?.rol,
      vencida: vencida && { email: vencida.email },
      ingresar,
      registrar,
      salir,
      refrescar,
    }),
    [session, claims, cargando, vencida, ingresar, registrar, salir, refrescar],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) {
    throw new Error('useSesion se usa dentro de <ProveedorSesion>');
  }
  return valor;
}

/**
 * ¿La sesión tiene alguno de estos roles?
 *
 * Espejo exacto de `core.es_rol()` en la base. La interfaz oculta lo que el rol
 * no puede hacer, pero **la autoridad sigue siendo RLS**: esto evita mostrar un
 * botón que va a fallar, no reemplaza al control (CLAUDE.md §6).
 */
export function useTieneRol(...roles: Rol[]): boolean {
  const { claims } = useSesion();
  if (!claims?.rol) return false;
  return claims.roles.some((r) => roles.includes(r));
}
