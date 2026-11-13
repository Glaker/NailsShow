/** Portal de clientes con Supabase falso, compartido por las pruebas de e2e/. */
import type { Page } from '@playwright/test';

/** Clave de sessionStorage: si está, la sesión de la prueba cambia de cuenta. */
export const CLAVE_SESION = 'nailshow.prueba.sesion';

export const NOMBRES = [
  'Crema humectante para manos y cuerpo Amor 250 ml',
  'Crema exfoliante con microgránulos Paz 500 ml',
  'Aceite de cutícula con vitamina E Aire 15 ml',
  'Sanitizante para manos y superficies Amor 1 L',
  'Monómero líquido de secado lento 120 ml',
  'Polímero acrílico transparente 42 g',
  'Removedor de esmalte semipermanente sin acetona 500 ml',
  'Cleanser deshidratante 250 ml',
  'Primer sin ácido 15 ml',
  'Top coat brillo extremo 15 ml',
  'Base coat rubber 15 ml',
  'Gel constructor rosa natural 30 g',
  'Esmalte semipermanente rojo pasión 10 ml',
  'Lima 100/180 profesional',
];
const LISTA = NOMBRES.map((producto, i) => ({
  producto_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  codigo: String(360 + i),
  producto,
  rubro: i < 4 ? 'Cosmética' : 'Uñas',
  precio_lista: 12000 + i * 900,
  precio_promo: 9000 + i * 700,
  minimo: i % 3 === 0 ? 6 : null,
}));
const ESCALA = [
  { desde_monto: 0, porcentaje: 0 },
  { desde_monto: 300000, porcentaje: 5 },
  { desde_monto: 900000, porcentaje: 10 },
];
const USUARIO = {
  id: 'u-demo',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@x.test',
};

function jwt(carga: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(carga)}.firma`;
}

/** Sesión falsa de cliente. demo=false: cuenta real, sin pedidos de ejemplo. */
export function sesion(demo: boolean) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return JSON.stringify({
    access_token: jwt({
      sub: 'u-demo',
      exp,
      role: 'authenticated',
      es_cliente: true,
      es_demo: demo,
    }),
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: exp,
    user: USUARIO,
  });
}

/** Lo que la red falsa responde; la prueba lo cambia para provocar el estado sin vincular. */
export interface Escenario {
  perfilCaido: boolean;
}

export async function prepararPortal(
  page: Page,
  oscuro: boolean,
  texto: number,
): Promise<Escenario> {
  const escenario: Escenario = { perfilCaido: false };
  await page.addInitScript(
    ([s, oscuro, texto, clave]) => {
      localStorage.setItem(
        'sb-falso-auth-token',
        sessionStorage.getItem(clave as string) ?? (s as string),
      );
      localStorage.setItem('nailshow.cliente.tutorial-visto', '1');
      localStorage.setItem('mantine-color-scheme-value', oscuro ? 'dark' : 'light');
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = `${texto as number}%`;
      });
    },
    [sesion(true), oscuro, texto, CLAVE_SESION] as const,
  );
  await page.route('http://falso.supabase.test/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/cliente_perfil')) {
      return escenario.perfilCaido
        ? route.fulfill({ status: 500, json: { message: 'Cliente sin vincular' } })
        : route.fulfill({ json: { cliente: 'Comercio de prueba', nombre: null } });
    }
    const cuerpo = url.includes('/rpc/cliente_lista')
      ? LISTA
      : url.includes('/rpc/cliente_escala')
        ? ESCALA
        : url.includes('/auth/v1/user')
          ? USUARIO
          : [];
    return route.fulfill({ json: cuerpo });
  });
  return escenario;
}
