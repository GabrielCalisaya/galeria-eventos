import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';

const limites: Record<string, number> = {
  nombres: 160,
  hora: 80,
  lugar: 160,
  direccion: 500,
  mapa: 500,
  frase: 600,
  cronograma: 1000,
  vestimenta: 160,
  regalos: 600,
  alias_regalo: 100,
  titular_regalo: 160,
  rsvp: 40,
  whatsapp: 20,
  colores: 160,
  galeria_bienvenida: 160,
  notas: 1500,
  preguntas_trivia: 3000,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });
  let body: { compra_id?: string; datos?: Record<string, unknown>; completar?: boolean };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Revisá los datos del formulario.' });
  }
  if (typeof body.compra_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.compra_id) || !body.datos || typeof body.datos !== 'object') {
    return respuesta(400, { error: 'La referencia o los datos del evento no son válidos.' });
  }
  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Entrá con tu cuenta para completar los datos.' });

  const { data: compra } = await admin.from('compras')
    .select('id,user_id,estado,gallery_pack,invitation_tier,titulo_evento')
    .eq('id', body.compra_id)
    .maybeSingle();
  if (!compra || compra.user_id !== sesion.userId) return respuesta(404, { error: 'No encontramos esa compra.' });
  if (!['pagada', 'transferencia_pendiente'].includes(compra.estado)) {
    return respuesta(409, { error: 'Completá esta ficha cuando el pago esté confirmado o la transferencia quede pendiente.' });
  }

  const datos: Record<string, string> = {};
  for (const [key, max] of Object.entries(limites)) {
    const value = body.datos[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || value.length > max) return respuesta(400, { error: `Revisá el campo ${key}; supera el largo permitido.` });
    datos[key] = value.trim();
  }
  if (datos.mapa) {
    try {
      const url = new URL(datos.mapa);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('url');
    } catch {
      return respuesta(400, { error: 'El enlace del mapa debe ser una URL válida.' });
    }
  }
  if (datos.rsvp && !['whatsapp', 'formulario', 'sin_confirmacion'].includes(datos.rsvp)) {
    return respuesta(400, { error: 'Elegí una modalidad de confirmación válida.' });
  }
  if (body.completar && compra.invitation_tier) {
    for (const field of ['nombres', 'hora', 'lugar', 'direccion']) {
      if (!datos[field]) return respuesta(400, { error: 'Para enviar la ficha de invitación completá nombres, hora, lugar y dirección.' });
    }
  }
  if (datos.whatsapp && !/^[0-9+ ()-]{8,20}$/.test(datos.whatsapp)) return respuesta(400, { error: 'Ingresá un número de WhatsApp válido.' });

  const { error } = await admin.from('compras').update({
    datos_invitacion: datos,
    datos_completos: Boolean(body.completar),
    updated_at: new Date().toISOString(),
  }).eq('id', compra.id).eq('user_id', sesion.userId);
  if (error) return respuesta(500, { error: 'No se pudieron guardar los datos. Intentá de nuevo.' });
  return respuesta(200, { guardado: true, completo: Boolean(body.completar) });
});
