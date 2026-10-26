// Piezas compartidas por las funciones: claves, cliente de Supabase, Cloudflare R2,
// respuestas con CORS y validación de la sesión.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';

// Supabase está reemplazando la clave service_role por las "secret keys".
// Se usa la nueva si existe y, si no, la anterior, así funciona en proyectos nuevos y viejos.
function claveDelEntorno(nueva: string, anterior: string): string {
  const json = Deno.env.get(nueva);
  if (json) {
    try {
      const claves = JSON.parse(json) as Record<string, string>;
      const valor = claves.default ?? Object.values(claves)[0];
      if (valor) return valor;
    } catch {
      /* formato inesperado: se usa la anterior */
    }
  }
  const valor = Deno.env.get(anterior);
  if (!valor) throw new Error(`Falta ${nueva} o ${anterior}`);
  return valor;
}

const CLAVE_SECRETA = claveDelEntorno('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');

/** Cliente con permisos de servicio (no sujeto a RLS). Solo para usar del lado del servidor. */
export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, CLAVE_SECRETA, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ───────── Cloudflare R2 ─────────

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_BUCKET = Deno.env.get('R2_BUCKET')!;

export const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  service: 's3',
  region: 'auto',
});

export function urlR2(key = ''): URL {
  return new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
}

/** Borra archivos de R2 con varias conexiones en paralelo. Devuelve cuántos fallaron. */
export async function borrarDeR2(keys: string[], paralelas = 20): Promise<number> {
  let fallidos = 0;
  for (let i = 0; i < keys.length; i += paralelas) {
    const tanda = keys.slice(i, i + paralelas);
    const resultados = await Promise.all(
      tanda.map(async (k) => {
        try {
          const r = await r2.fetch(urlR2(k).toString(), { method: 'DELETE' });
          await r.body?.cancel();
          // 204 = borrado; 404 = ya no estaba. Los dos están bien.
          return r.ok || r.status === 404;
        } catch {
          return false;
        }
      }),
    );
    fallidos += resultados.filter((ok) => !ok).length;
  }
  return fallidos;
}

/** Lista hasta 1000 archivos de R2 bajo un prefijo. */
export async function listarR2(prefijo: string): Promise<{ keys: string[]; hayMas: boolean }> {
  const url = urlR2();
  url.searchParams.set('list-type', '2');
  url.searchParams.set('prefix', prefijo);
  url.searchParams.set('max-keys', '1000');
  const r = await r2.fetch(url.toString(), { method: 'GET' });
  const xml = await r.text();
  if (!r.ok) throw new Error(`R2 respondió ${r.status} al listar`);
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  const hayMas = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  return { keys, hayMas };
}

// ───────── Respuestas y sesión ─────────

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Devuelve el id del usuario de la sesión, o una respuesta de error lista para devolver. */
export async function usuarioDelPedido(
  req: Request,
  admin: SupabaseClient,
): Promise<{ userId: string; esAnonimo: boolean } | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return respuesta(401, { error: 'Falta la sesión' });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return respuesta(401, { error: 'Sesión inválida' });
  return { userId: data.user.id, esAnonimo: Boolean(data.user.is_anonymous) };
}
