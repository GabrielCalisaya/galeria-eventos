import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';
import { sincronizarInvitacion } from '../_shared/invitaciones-wordpress.ts';

const administradores = new Set((Deno.env.get('TRANSFER_ADMIN_EMAILS') ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST'].includes(req.method)) return respuesta(405, { error: 'Método no permitido' });
  if (!administradores.size) return respuesta(503, { error: 'La administración de invitaciones no está configurada.' });
  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Acceso reservado a administración.' });
  const { data: usuario } = await admin.auth.admin.getUserById(sesion.userId);
  const email = usuario?.user?.email?.trim().toLowerCase() ?? '';
  if (!administradores.has(email)) return respuesta(403, { error: 'Acceso reservado a administración.' });

  if (req.method === 'GET') {
    const { data, error } = await admin.from('compras').select('id,titulo_evento,tipo_evento,tipo_invitacion,fecha_evento,invitation_tier,estado,datos_invitacion,datos_completos,url_invitacion,wordpress_event_id,wordpress_slug,wordpress_url,wordpress_edit_url,invitacion_sync_estado,invitacion_sync_error,invitacion_sync_at,created_at')
      .not('invitation_tier', 'is', null).in('estado', ['pagada', 'preparando', 'entregada']).order('created_at', { ascending: false }).limit(100);
    if (error) return respuesta(500, { error: 'No se pudieron cargar las invitaciones.' });
    return respuesta(200, { compras: data ?? [] });
  }

  let body: { compra_id?: string; accion?: string; url_invitacion?: string };
  try { body = await req.json(); } catch { return respuesta(400, { error: 'Pedido inválido.' }); }
  if (typeof body.compra_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.compra_id)) return respuesta(400, { error: 'La referencia de compra no es válida.' });
  if (body.accion === 'reintentar') {
    const result = await sincronizarInvitacion(admin, body.compra_id);
    return result.ok ? respuesta(200, { sincronizada: true }) : respuesta(409, { error: result.error });
  }
  if (body.accion === 'entregar') {
    let url: URL;
    try { url = new URL(body.url_invitacion ?? ''); } catch { return respuesta(400, { error: 'Pegá el enlace público de la invitación.' }); }
    const origin = new URL(Deno.env.get('INVITACIONES_WORDPRESS_URL') ?? 'https://invitaciones.newtech.net.ar');
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password || url.hash) return respuesta(400, { error: 'El enlace debe pertenecer al sitio oficial de Invitaciones Digitales.' });
    const { data, error } = await admin.from('compras').update({ estado: 'entregada', url_invitacion: url.href, updated_at: new Date().toISOString() })
      .eq('id', body.compra_id).in('estado', ['pagada', 'preparando']).eq('datos_completos', true).not('wordpress_event_id', 'is', null).select('id').maybeSingle();
    if (error || !data) return respuesta(409, { error: 'Solo se puede entregar una invitación pagada, preparada y vinculada a su borrador.' });
    return respuesta(200, { entregada: true });
  }
  return respuesta(400, { error: 'Elegí reintentar la preparación o registrar la entrega.' });
});
