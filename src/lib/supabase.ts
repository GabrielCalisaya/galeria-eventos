import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configFaltante = !url || !anonKey;

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'falta-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Cliente aparte para la pantalla del salón: no usa la sesión de nadie (entra con el token del link).
// Así no se traba si en el mismo celular o compu hay otras pestañas de la galería con la sesión abierta.
export const supabasePantalla = createClient(url ?? 'http://localhost', anonKey ?? 'falta-configurar', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-pantalla-salon',
    lock: async (_nombre, _espera, fn) => fn(),
  },
});

const r2Base = ((import.meta.env.VITE_R2_PUBLIC_URL as string | undefined) ?? '').replace(/\/$/, '');

export function urlPublica(key: string): string {
  return `${r2Base}/${key}`;
}
