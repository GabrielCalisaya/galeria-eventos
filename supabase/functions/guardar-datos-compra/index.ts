// Guarda la ficha del evento que completa el cliente después de comprar.
// Con `completar: true` exige los datos principales y le avisa a NewTech por correo con toda la ficha.

import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';
import { ADMIN_EMAIL, enviarCorreo, escapar, plantilla } from '../_shared/correo.ts';
import { sincronizarInvitacion } from '../_shared/invitaciones-wordpress.ts';

const SITIO = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');

const ETIQUETAS: Record<string, string> = {
  nombres: 'Nombres', hora: 'Horario', lugar: 'Lugar', direccion: 'Dirección', mapa: 'Mapa', frase: 'Frase',
  cronograma: 'Cronograma', vestimenta: 'Vestimenta', regalos: 'Regalos', alias_regalo: 'Alias para regalos',
  titular_regalo: 'Titular', rsvp: 'Confirmación de asistencia', whatsapp: 'WhatsApp', colores: 'Colores o estilo',
  galeria_bienvenida: 'Bienvenida de la galería', notas: 'Notas', preguntas_trivia: 'Preguntas de trivia',
};

const limites: Record<string, number> = {
  nombres: 160,
  person_one: 80,
  person_two: 80,
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
  quiz_heading: 100,
  quiz_questions: 3000,
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
    .select('id,user_id,estado,gallery_pack,invitation_tier,tipo_invitacion,titulo_evento')
    .eq('id', body.compra_id)
    .maybeSingle();
  if (!compra || compra.user_id !== sesion.userId) return respuesta(404, { error: 'No encontramos esa compra.' });
  if (compra.estado === 'preparando' || compra.estado === 'entregada') {
    return respuesta(409, { error: 'Ya estamos trabajando con tu ficha. Para cambiar algún dato escribinos por WhatsApp.' });
  }
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
  if (compra.invitation_tier !== 'deluxe') { delete datos.quiz_heading; delete datos.quiz_questions; }
  if (body.completar && compra.invitation_tier) {
    const nombres = datos.nombres?.split(/\s*(?:&|\by\b)\s*/i) ?? [];
    const primero = datos.person_one || nombres[0];
    const segundo = datos.person_two || nombres[1];
    if (!primero || (compra.tipo_invitacion === 'wedding' && !segundo) || !datos.hora || !datos.lugar || !datos.direccion) return respuesta(400, { error: 'Completá los nombres, el horario, el lugar y la dirección. Para una boda necesitamos ambos nombres.' });
    if (datos.rsvp === 'whatsapp' && !datos.whatsapp) return respuesta(400, { error: 'Agregá el WhatsApp con código de país para recibir confirmaciones.' });
  }
  if (body.completar && compra.invitation_tier === 'deluxe') {
    let preguntas: unknown;
    try { preguntas = JSON.parse(datos.quiz_questions ?? ''); } catch { return respuesta(400, { error: 'Completá las tres preguntas del quiz Deluxe.' }); }
    if (!Array.isArray(preguntas) || preguntas.length !== 3) return respuesta(400, { error: 'El quiz Deluxe necesita tres preguntas.' });
    const validas = preguntas.every((item) => item && typeof item === 'object' && typeof item.question === 'string' && item.question.trim().length > 0 && item.question.length <= 160 && Array.isArray(item.answers) && item.answers.length === 3 && item.answers.every((answer: unknown) => typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 80) && Number.isInteger(item.correct) && item.correct >= 0 && item.correct <= 2);
    if (!validas) return respuesta(400, { error: 'Cada pregunta necesita un enunciado, tres respuestas y una respuesta correcta.' });
    datos.quiz_questions = JSON.stringify(preguntas.map((item) => ({ question: item.question.trim(), answers: item.answers.map((answer: string) => answer.trim()), correct: item.correct })));
    datos.quiz_heading = datos.quiz_heading?.trim() || '¿Cuánto conocés esta celebración?';
  }
  if (datos.whatsapp && !/^[0-9+ ()-]{8,20}$/.test(datos.whatsapp)) return respuesta(400, { error: 'Ingresá un número de WhatsApp válido.' });

  const { error } = await admin.from('compras').update({
    datos_invitacion: datos,
    datos_completos: Boolean(body.completar),
    updated_at: new Date().toISOString(),
  }).eq('id', compra.id).eq('user_id', sesion.userId);
  if (error) return respuesta(500, { error: 'No se pudieron guardar los datos. Intentá de nuevo.' });

  if (body.completar && compra.invitation_tier && ADMIN_EMAIL) {
    const { data: usuario } = await admin.auth.admin.getUserById(sesion.userId);
    const filas = Object.entries(datos)
      .map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;vertical-align:top;color:#73656a">${escapar(ETIQUETAS[k] ?? k)}</td><td style="padding:4px 0;white-space:pre-wrap">${escapar(v)}</td></tr>`)
      .join('');
    const enviado = await enviarCorreo(ADMIN_EMAIL, `Ficha de invitación · ${compra.titulo_evento}`, plantilla(
      'Ficha de invitación recibida',
      `<p><strong>Evento:</strong> ${escapar(compra.titulo_evento)}<br><strong>Nivel:</strong> ${escapar(compra.invitation_tier)}<br>
       <strong>Cliente:</strong> ${escapar(usuario?.user?.email ?? '-')}<br><strong>Estado del pago:</strong> ${escapar(compra.estado)}<br>
       <strong>Referencia:</strong> ${escapar(compra.id)}</p><table style="border-collapse:collapse;font-size:14px">${filas}</table>`,
      { texto: 'Ver pedidos', url: `${SITIO}/panel/administracion` },
      undefined,
      'Invitaciones Digitales · by NewTech',
    ));
    if (!enviado) console.error('No se pudo avisar la ficha completa', compra.id);
  }
  const sincronizacion = compra.estado === 'pagada' && compra.invitation_tier && body.completar
    ? await sincronizarInvitacion(admin, compra.id)
    : null;
  return respuesta(200, { guardado: true, completo: Boolean(body.completar), aviso_preparacion: sincronizacion && !sincronizacion.ok ? sincronizacion.error : undefined });
});
