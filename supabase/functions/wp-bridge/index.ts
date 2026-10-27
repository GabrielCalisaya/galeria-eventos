// Puente servidor a servidor con Invitaciones Digitales (WordPress, complemento GA Checkout Bridge).
// WordPress nunca recibe la clave de Supabase: firma cada pedido con el secreto compartido
// (el mismo `ga_checkout_secret` del plugin, cargado acá como INVITACIONES_WORDPRESS_SECRET).
//
// Base: https://<proyecto>.supabase.co/functions/v1/wp-bridge
//   POST /v1/orders/list                 → pedidos pagados con ficha completa y sin vínculo con WordPress
//   POST /v1/orders/{uuid}/preparing     → vincula el borrador de WordPress y pasa a "preparando"
//   POST /v1/orders/{uuid}/delivered     → guarda la URL publicada, pasa a "entregada" y avisa al cliente (una vez)
//
// Firma: X-GA-Timestamp (epoch de 10 dígitos, ±300 s) y X-GA-Signature = HMAC-SHA256 hex de `timestamp + "." + cuerpo crudo`.
// Errores: { code, message } con el estado HTTP correspondiente.

import { clienteAdmin, respuesta } from '../_shared/comun.ts';
import { avisarInvitacionLista } from '../_shared/entrega.ts';

const SECRETO = Deno.env.get('INVITACIONES_WORDPRESS_SECRET') ?? '';
const HOST_INVITACIONES = (() => {
  try {
    return new URL(Deno.env.get('INVITACIONES_WORDPRESS_URL') ?? 'https://invitaciones.newtech.net.ar').hostname;
  } catch {
    return 'invitaciones.newtech.net.ar';
  }
})();
const TOLERANCIA_S = 300;
const MAX_CUERPO = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof clienteAdmin>;

const error = (status: number, code: string, message: string) => respuesta(status, { code, message });

async function hmacHex(clave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación en tiempo constante (las dos cadenas son hex de 64 caracteres). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

async function firmaValida(req: Request, cuerpo: string): Promise<boolean> {
  const ts = req.headers.get('x-ga-timestamp') ?? '';
  const firma = (req.headers.get('x-ga-signature') ?? '').toLowerCase();
  if (!/^\d{10}$/.test(ts) || !/^[0-9a-f]{64}$/.test(firma)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > TOLERANCIA_S) return false;
  return iguales(await hmacHex(SECRETO, `${ts}.${cuerpo}`), firma);
}

/** URL pública de una invitación: HTTPS, en el sitio de invitaciones y fuera de las rutas internas de WordPress. */
function urlPublica(valor: unknown): string | null {
  try {
    const u = new URL(String(valor ?? ''));
    if (u.protocol !== 'https:' || u.hostname !== HOST_INVITACIONES || u.username || u.password || u.hash) return null;
    if (/^\/(wp-admin|wp-json|wp-login\.php|wp-content|wp-includes)(\/|$)/i.test(u.pathname)) return null;
    if (u.pathname === '/' && !u.search) return null;
    return u.href;
  } catch {
    return null;
  }
}

function idEvento(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : null;
}

// ───────── Cursor de la lista: base64url de { u: updated_at, i: id } ─────────

function codificarCursor(u: string, i: string): string {
  return btoa(JSON.stringify({ u, i })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function leerCursor(cursor: string): { u: string; i: string } | null {
  try {
    const json = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json?.u !== 'string' || !/^[0-9T:.+\- ]{10,40}$/.test(json.u) || typeof json?.i !== 'string' || !UUID.test(json.i)) return null;
    return { u: json.u, i: json.i };
  } catch {
    return null;
  }
}

// ───────── Rutas ─────────

async function listar(admin: Admin, body: Record<string, unknown>): Promise<Response> {
  const permitidos = ['pagada', 'preparando'];
  const estados = body.estados === undefined ? permitidos : body.estados;
  if (!Array.isArray(estados) || estados.length === 0 || !estados.every((e) => typeof e === 'string' && permitidos.includes(e))) {
    return error(400, 'invalid_request', 'estados admite solo "pagada" y "preparando".');
  }
  const limite = body.limit === undefined ? 50 : body.limit;
  if (typeof limite !== 'number' || !Number.isInteger(limite) || limite < 1) return error(400, 'invalid_request', 'limit debe ser un entero positivo.');
  const tope = Math.min(limite, 100);
  let cursor: { u: string; i: string } | null = null;
  if (body.cursor !== undefined && body.cursor !== null) {
    if (typeof body.cursor !== 'string' || !(cursor = leerCursor(body.cursor))) return error(400, 'invalid_request', 'El cursor no es válido.');
  }

  let consulta = admin.from('compras')
    .select('id,titulo_evento,tipo_evento,tipo_invitacion,fecha_evento,invitation_tier,estado,datos_completos,datos_invitacion,updated_at')
    .in('estado', estados as string[])
    .eq('datos_completos', true)
    .not('invitation_tier', 'is', null)
    .is('wordpress_event_id', null);
  if (cursor) consulta = consulta.or(`updated_at.gt."${cursor.u}",and(updated_at.eq."${cursor.u}",id.gt.${cursor.i})`);
  const { data, error: errorLista } = await consulta.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(tope + 1);
  if (errorLista) {
    console.error('wp-bridge: no se pudo listar', errorLista.message);
    return error(503, 'temporarily_unavailable', 'No se pudieron leer los pedidos. Reintentá más tarde.');
  }

  const filas = (data ?? []).filter((f) => f.datos_invitacion && typeof f.datos_invitacion === 'object' && !Array.isArray(f.datos_invitacion));
  const hayMas = (data ?? []).length > tope;
  const pagina = filas.slice(0, tope);
  const ultima = (data ?? [])[Math.min(tope, (data ?? []).length) - 1];
  return respuesta(200, {
    orders: pagina.map((f) => ({
      id: f.id,
      titulo_evento: f.titulo_evento,
      tipo_evento: f.tipo_evento,
      tipo_invitacion: f.tipo_invitacion,
      fecha_evento: f.fecha_evento,
      invitation_tier: f.invitation_tier,
      estado: f.estado,
      datos_completos: f.datos_completos,
      datos_invitacion: f.datos_invitacion,
    })),
    next_cursor: hayMas && ultima ? codificarCursor(ultima.updated_at, ultima.id) : null,
  });
}

type Pedido = {
  id: string; estado: string; invitation_tier: string | null; datos_completos: boolean;
  wordpress_event_id: number | null; wordpress_url: string | null; url_invitacion: string | null;
};

async function leerPedido(admin: Admin, id: string): Promise<Pedido | null> {
  const { data } = await admin.from('compras')
    .select('id,estado,invitation_tier,datos_completos,wordpress_event_id,wordpress_url,url_invitacion')
    .eq('id', id).maybeSingle();
  return (data as Pedido | null) ?? null;
}

async function preparar(admin: Admin, id: string, body: Record<string, unknown>): Promise<Response> {
  const eventoWp = idEvento(body.wordpress_event_id);
  if (!eventoWp) return error(400, 'invalid_request', 'wordpress_event_id debe ser un entero positivo.');
  const urlWp = urlPublica(body.wordpress_url);
  if (!urlWp) return error(422, 'invalid_url', `wordpress_url debe ser una URL https de ${HOST_INVITACIONES}.`);

  const pedido = await leerPedido(admin, id);
  if (!pedido) return error(404, 'order_not_found', 'No existe ese pedido.');
  if (!pedido.invitation_tier) return error(422, 'invitation_not_included', 'El pedido no incluye invitación.');
  if (!pedido.datos_completos) return error(422, 'incomplete_order', 'El cliente todavía no envió la ficha completa.');
  const ok = (p: Pedido) => respuesta(200, { id: p.id, estado: p.estado, wordpress_event_id: p.wordpress_event_id, wordpress_url: p.wordpress_url });

  if (pedido.wordpress_event_id !== null) {
    if (Number(pedido.wordpress_event_id) !== eventoWp) return error(409, 'already_linked', 'El pedido ya está vinculado a otro evento de WordPress.');
    if (pedido.estado === 'pagada') {
      await admin.from('compras').update({ estado: 'preparando', updated_at: new Date().toISOString() }).eq('id', id).eq('estado', 'pagada');
      const actual = await leerPedido(admin, id);
      return ok(actual ?? pedido);
    }
    if (['preparando', 'entregada'].includes(pedido.estado)) return ok(pedido);
    return error(409, 'invalid_state', `El pedido está en estado "${pedido.estado}".`);
  }
  if (!['pagada', 'preparando'].includes(pedido.estado)) return error(409, 'invalid_state', `El pedido está en estado "${pedido.estado}".`);

  const ahora = new Date().toISOString();
  const { data: actualizado } = await admin.from('compras')
    .update({
      estado: 'preparando',
      wordpress_event_id: eventoWp,
      wordpress_url: urlWp,
      invitacion_sync_estado: 'preparando',
      invitacion_sync_error: null,
      invitacion_sync_at: ahora,
      updated_at: ahora,
    })
    .eq('id', id).is('wordpress_event_id', null).in('estado', ['pagada', 'preparando'])
    .select('id,estado,wordpress_event_id,wordpress_url').maybeSingle();
  if (actualizado) return respuesta(200, actualizado);

  // Otra llamada cambió el pedido en el medio: se responde según cómo quedó.
  const final = await leerPedido(admin, id);
  if (final && Number(final.wordpress_event_id) === eventoWp) return ok(final);
  return error(409, final?.wordpress_event_id ? 'already_linked' : 'invalid_state', 'El pedido cambió mientras se vinculaba. Volvé a consultarlo.');
}

async function entregar(admin: Admin, id: string, body: Record<string, unknown>): Promise<Response> {
  const url = urlPublica(body.url_invitacion);
  if (!url) return error(422, 'invalid_url', `url_invitacion debe ser la URL pública https de la invitación en ${HOST_INVITACIONES}.`);
  const eventoWp = idEvento(body.wordpress_event_id);
  if (!eventoWp) return error(400, 'invalid_request', 'wordpress_event_id debe ser un entero positivo.');

  const pedido = await leerPedido(admin, id);
  if (!pedido) return error(404, 'order_not_found', 'No existe ese pedido.');
  if (!pedido.invitation_tier) return error(422, 'invitation_not_included', 'El pedido no incluye invitación.');
  if (pedido.wordpress_event_id !== null && Number(pedido.wordpress_event_id) !== eventoWp) {
    return error(409, 'already_linked', 'El pedido está vinculado a otro evento de WordPress.');
  }
  const ok = async () => respuesta(200, { id, estado: 'entregada', url_invitacion: url, email_enviado: await avisarInvitacionLista(admin, id, url) });

  if (pedido.estado === 'entregada') {
    // Repetición idéntica: éxito sin reenviar (el aviso solo sale si antes había fallado).
    if (pedido.url_invitacion === url) return await ok();
    return error(409, 'url_conflict', 'El pedido ya se entregó con otra URL. Se corrige desde la administración de la galería.');
  }
  if (pedido.url_invitacion && pedido.url_invitacion !== url) return error(409, 'url_conflict', 'El pedido ya tiene otra URL registrada.');
  if (!['preparando', 'pagada'].includes(pedido.estado)) return error(409, 'invalid_state', `El pedido está en estado "${pedido.estado}".`);
  if (pedido.estado === 'pagada') console.warn('wp-bridge: entrega por reconciliación (pagada → entregada)', id, eventoWp);

  const { data: actualizado } = await admin.from('compras')
    .update({
      estado: 'entregada',
      url_invitacion: url,
      wordpress_event_id: pedido.wordpress_event_id ?? eventoWp,
      wordpress_url: pedido.wordpress_url ?? url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).eq('estado', pedido.estado)
    .select('id').maybeSingle();
  if (!actualizado) return error(409, 'invalid_state', 'El pedido cambió mientras se entregaba. Volvé a consultarlo.');
  return await ok();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return error(405, 'invalid_request', 'Usá POST.');
  if (!SECRETO) return error(503, 'temporarily_unavailable', 'El puente con WordPress no está configurado.');

  const cuerpo = await req.text();
  if (cuerpo.length > MAX_CUERPO) return error(400, 'invalid_request', 'El cuerpo es demasiado grande.');
  if (!(await firmaValida(req, cuerpo))) return error(401, 'invalid_signature', 'Firma ausente, inválida o vencida.');

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cuerpo || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('objeto');
    body = parsed as Record<string, unknown>;
  } catch {
    return error(400, 'invalid_request', 'El cuerpo debe ser un objeto JSON.');
  }

  // Supabase entrega la ruta completa (/wp-bridge/v1/...); se mira solo lo que sigue a /v1/.
  const ruta = new URL(req.url).pathname.match(/\/v1\/orders\/(?:(list)|([0-9a-f-]{36})\/(preparing|delivered))\/?$/i);
  if (!ruta) return error(404, 'invalid_request', 'Ruta desconocida.');

  const admin = clienteAdmin();
  try {
    if (ruta[1]) return await listar(admin, body);
    const id = ruta[2];
    if (!UUID.test(id)) return error(400, 'invalid_request', 'El identificador del pedido no es válido.');
    return ruta[3].toLowerCase() === 'preparing' ? await preparar(admin, id, body) : await entregar(admin, id, body);
  } catch (e) {
    console.error('wp-bridge: error inesperado', e instanceof Error ? e.message : e);
    return error(500, 'internal_error', 'Error interno. Reintentá más tarde.');
  }
});
