// Firma URLs de subida directa a Cloudflare R2.
// El celular manda cuántas fotos va a subir (con sus tamaños), esta función
// valida que pueda hacerlo, crea las filas en "media" como pendientes y
// devuelve una URL PUT firmada por cada archivo (original y miniatura).
// Los archivos nunca pasan por acá: van directo del celular a R2.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1';

const MAX_ARCHIVOS_POR_TANDA = 20;
const MAX_BYTES_FOTO = 6 * 1024 * 1024; // la app comprime a ~0,5 MB; esto es un tope de seguridad
const MAX_BYTES_MINIATURA = 400 * 1024;
const MAX_FOTOS_POR_MINUTO = 60; // por celular, para frenar abusos
const VENCE_FIRMA_SEG = 600;

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!;
const R2_BUCKET = Deno.env.get('R2_BUCKET')!;
const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
  service: 's3',
  region: 'auto',
});

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ArchivoPedido = { bytes: number; thumb_bytes: number; ancho?: number; alto?: number };

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function firmarPut(key: string, contentType: string): Promise<string> {
  const url = new URL(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(VENCE_FIRMA_SEG));
  const firmado = await r2.sign(
    new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }),
    { aws: { signQuery: true } },
  );
  return firmado.url;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return respuesta(401, { error: 'Falta la sesión' });

  const url = Deno.env.get('SUPABASE_URL')!;
  // Cliente con la sesión del usuario: para saber quién es.
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  // Cliente con permisos de servicio: para crear las filas.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await comoUsuario.auth.getUser();
  if (userError || !userData.user) return respuesta(401, { error: 'Sesión inválida' });
  const userId = userData.user.id;

  let body: { event_id?: string; archivos?: ArchivoPedido[] };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido' });
  }
  const eventId = body.event_id;
  const archivos = Array.isArray(body.archivos) ? body.archivos : [];
  if (!eventId || archivos.length === 0) return respuesta(400, { error: 'Faltan datos' });
  if (archivos.length > MAX_ARCHIVOS_POR_TANDA) {
    return respuesta(400, { error: `Se pueden subir hasta ${MAX_ARCHIVOS_POR_TANDA} fotos por vez` });
  }
  for (const a of archivos) {
    if (!(a.bytes > 0 && a.bytes <= MAX_BYTES_FOTO && a.thumb_bytes > 0 && a.thumb_bytes <= MAX_BYTES_MINIATURA)) {
      return respuesta(400, { error: 'Alguna foto es demasiado pesada' });
    }
  }

  // El evento tiene que estar activo.
  const { data: evento } = await admin
    .from('events')
    .select('id, estado, limite_fotos')
    .eq('id', eventId)
    .maybeSingle();
  if (!evento || evento.estado !== 'activo') {
    return respuesta(403, { error: 'El evento no está recibiendo fotos' });
  }

  // Quien sube tiene que ser invitado o miembro del evento.
  const [{ data: invitado }, { data: miembro }] = await Promise.all([
    admin.from('guests').select('id, nombre').eq('event_id', eventId).eq('user_id', userId).maybeSingle(),
    admin.from('event_members').select('user_id').eq('event_id', eventId).eq('user_id', userId).maybeSingle(),
  ]);
  if (!invitado && !miembro) return respuesta(403, { error: 'No formás parte de este evento' });

  // Límite de fotos del pack.
  const { count: totalEvento } = await admin
    .from('media')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);
  if ((totalEvento ?? 0) + archivos.length > evento.limite_fotos) {
    return respuesta(403, { error: 'El evento llegó al límite de fotos de su pack' });
  }

  // Límite por celular por minuto.
  const haceUnMinuto = new Date(Date.now() - 60_000).toISOString();
  const { count: recientes } = await admin
    .from('media')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', haceUnMinuto);
  if ((recientes ?? 0) + archivos.length > MAX_FOTOS_POR_MINUTO) {
    return respuesta(429, { error: 'Estás subiendo muy rápido. Esperá un minuto y seguí.' });
  }

  const filas = archivos.map((a) => {
    const id = crypto.randomUUID();
    return {
      id,
      event_id: eventId,
      guest_id: invitado?.id ?? null,
      user_id: userId,
      autor_nombre: invitado?.nombre ?? 'Anfitrión',
      tipo: 'foto',
      key_original: `eventos/${eventId}/${id}.jpg`,
      key_thumb: `eventos/${eventId}/miniaturas/${id}.jpg`,
      ancho: Number.isFinite(a.ancho) ? Math.round(a.ancho!) : null,
      alto: Number.isFinite(a.alto) ? Math.round(a.alto!) : null,
      bytes: Math.round(a.bytes),
      estado: 'pendiente',
    };
  });

  const { error: insertError } = await admin.from('media').insert(filas);
  if (insertError) {
    console.error(insertError);
    return respuesta(500, { error: 'No se pudo preparar la subida' });
  }

  const subidas = await Promise.all(
    filas.map(async (f) => ({
      id: f.id,
      url_original: await firmarPut(f.key_original, 'image/jpeg'),
      url_miniatura: await firmarPut(f.key_thumb, 'image/jpeg'),
    })),
  );

  return respuesta(200, { subidas });
});
