import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configFaltante = !url || !anonKey;

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'falta-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const r2Base = ((import.meta.env.VITE_R2_PUBLIC_URL as string | undefined) ?? '').replace(/\/$/, '');

export function urlPublica(key: string): string {
  return `${r2Base}/${key}`;
}
