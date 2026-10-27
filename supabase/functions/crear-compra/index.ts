import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';
import { cotizarCompra } from '../_shared/catalogo-compra.ts';
import { ADMIN_EMAIL, enviarCorreo, escapar, linkWhatsapp, plantilla } from '../_shared/correo.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const SITE = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');
const TRANSFER_PHONE = (Deno.env.get('TRANSFER_PHONE') ?? '').replace(/\D/g, '');

const tiposEvento = new Set(['casamiento', 'quince', 'cumpleanos', 'aniversario', 'corporativo', 'otro']);
const fechaValida = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  let body: {
    idempotency_key?: string;
    event_title?: string;
    event_type?: string;
    event_date?: string | null;
    gallery_pack?: string | null;
    invitation_tier?: string | null;
    invitation_type?: 'wedding' | 'birthday' | 'xv' | null;
    payment_method?: 'mercado_pago' | 'transferencia';
  };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido' });
  }

  if (!SITE) return respuesta(503, { error: 'El sitio de retorno todavía no está configurado.' });
  if (body.payment_method === 'mercado_pago' && !MP_ACCESS_TOKEN) return respuesta(503, { error: 'Mercado Pago todavía no está configurado.' });
  if (body.payment_method === 'transferencia' && !TRANSFER_PHONE) return respuesta(503, { error: 'La opción de transferencia todavía no está configurada.' });
  if (!['mercado_pago', 'transferencia'].includes(body.payment_method ?? '')) return respuesta(400, { error: 'Elegí un medio de pago.' });
  if (body.payment_method === 'transferencia' && (TRANSFER_PHONE.length < 8 || TRANSFER_PHONE.length > 15)) {
    return respuesta(503, { error: 'El número para transferencias todavía no está configurado correctamente.' });
  }

  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Entrá con tu cuenta para continuar.' });
  if (typeof body.idempotency_key !== 'string' || body.idempotency_key.length < 16 || body.idempotency_key.length > 80) {
    return respuesta(400, { error: 'Actualizá la página e intentá de nuevo.' });
  }
  const title = typeof body.event_title === 'string' ? body.event_title.trim() : '';
  if (!title || title.length > 120) return respuesta(400, { error: 'Ingresá el nombre del evento (hasta 120 caracteres).' });
  if (!tiposEvento.has(body.event_type ?? '')) return respuesta(400, { error: 'Elegí un tipo de evento válido.' });
  if (body.event_date && !fechaValida(body.event_date)) return respuesta(400, { error: 'Ingresá una fecha válida.' });
  const tipoPlantilla = body.invitation_tier ? body.invitation_type : null;
  if (body.invitation_tier && !['wedding', 'birthday', 'xv'].includes(tipoPlantilla ?? '')) return respuesta(400, { error: 'Elegí si la invitación será para boda, cumpleaños o fiesta de 15.' });
  if (body.invitation_tier && !body.event_date) return respuesta(400, { error: 'Elegí la fecha del evento para preparar la invitación.' });

  const quote = await cotizarCompra(admin, body);
  if (typeof quote === 'string') return respuesta(400, { error: quote });

  // Una repetición del mismo envío retoma la misma compra y evita crear dos eventos/pagos.
  const { data: existente } = await admin
    .from('compras')
    .select('id,event_id,total,moneda,estado,titulo_evento,tipo_evento,tipo_invitacion,fecha_evento,gallery_pack,invitation_tier')
    .eq('user_id', sesion.userId)
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle();
  let compra: { id: string; event_id: string | null; total: number; moneda: string; estado: string } | null = null;
  let eventId: string | null = null;
  if (existente) {
    if (existente.titulo_evento !== title || existente.tipo_evento !== body.event_type || existente.fecha_evento !== (body.event_date || null) ||
      existente.gallery_pack !== quote.gallery_pack || existente.invitation_tier !== quote.invitation_tier || existente.tipo_invitacion !== tipoPlantilla) {
      return respuesta(409, { error: 'Los datos del pedido cambiaron. Actualizá el checkout antes de volver a intentar.' });
    }
    const { data: pagoExistente } = await admin
      .from('compra_pagos')
      .select('metodo,estado,mp_init_point,numero_transferencia')
      .eq('compra_id', existente.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pagoAbierto = pagoExistente && ['pendiente', 'en_proceso'].includes(pagoExistente.estado);
    if (pagoAbierto && pagoExistente.metodo !== body.payment_method) {
      return respuesta(409, { error: 'Este pedido ya tiene un medio de pago pendiente. Continuá con ese medio o escribinos para cambiarlo.' });
    }
    if (pagoAbierto && pagoExistente.metodo === 'mercado_pago' && pagoExistente.mp_init_point) {
      return respuesta(200, { order_id: existente.id, event_id: existente.event_id, total: existente.total, currency: existente.moneda, url: pagoExistente.mp_init_point });
    }
    if (pagoAbierto && pagoExistente.metodo === 'transferencia') {
      return respuesta(200, { order_id: existente.id, event_id: existente.event_id, total: existente.total, currency: existente.moneda, payment_method: 'transferencia', status: existente.estado, transfer_phone: pagoExistente.numero_transferencia ?? TRANSFER_PHONE, whatsapp_url: linkWhatsapp(`Hola, hice la transferencia de la compra ${existente.id}.`) });
    }
    if (existente.estado === 'pagada' || existente.estado === 'preparando' || existente.estado === 'entregada') {
      return respuesta(409, { error: 'Esta compra ya está confirmada. Abrí el detalle del pedido para seguir.' });
    }
    if (pagoAbierto) return respuesta(409, { error: 'Este pedido ya tiene un medio de pago pendiente. Completalo o escribinos antes de iniciar otro.' });
    compra = existente;
    eventId = existente.event_id;
    const { error: errorReabrir } = await admin.from('compras')
      .update({ estado: body.payment_method === 'transferencia' ? 'transferencia_pendiente' : 'pendiente_pago', updated_at: new Date().toISOString() })
      .eq('id', existente.id);
    if (errorReabrir) return respuesta(500, { error: 'No se pudo recuperar el pedido para reintentar el pago.' });
  }

  if (!compra && quote.gallery_pack) {
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const slug = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
      const { data, error } = await admin
        .from('events')
        .insert({
          owner_id: sesion.userId,
          slug,
          titulo: title,
          fecha: body.event_date || null,
          tipo: body.event_type,
          estilo: {},
          pack: 'basico',
          estado: 'borrador',
          limite_fotos: 1500,
        })
        .select('id')
        .single();
      if (data) created = data;
      else if (error?.code !== '23505') return respuesta(500, { error: 'No se pudo preparar el evento. Intentá de nuevo.' });
    }
    if (!created) return respuesta(500, { error: 'No se pudo asignar un enlace único al evento.' });
    eventId = created.id;
  }

  if (!compra) {
    const { data: nuevaCompra, error: errorCompra } = await admin
      .from('compras')
      .insert({
      user_id: sesion.userId,
      event_id: eventId,
      idempotency_key: body.idempotency_key,
      titulo_evento: title,
      tipo_evento: body.event_type,
      fecha_evento: body.event_date || null,
      gallery_pack: quote.gallery_pack,
      invitation_tier: quote.invitation_tier,
      tipo_invitacion: tipoPlantilla,
      productos: quote.productos,
      subtotal: quote.subtotal,
      descuento: quote.descuento,
      total: quote.total,
      moneda: quote.moneda,
      estado: body.payment_method === 'transferencia' ? 'transferencia_pendiente' : 'pendiente_pago',
      })
      .select('id,event_id,total,moneda,estado')
      .single();
    if (errorCompra || !nuevaCompra) {
      if (eventId) await admin.from('events').delete().eq('id', eventId).eq('owner_id', sesion.userId);
      return respuesta(500, { error: 'No se pudo guardar la compra. Intentá de nuevo.' });
    }
    compra = nuevaCompra;
  }

  const { data: pago, error: errorPago } = await admin
    .from('compra_pagos')
    .insert({
      compra_id: compra.id,
      user_id: sesion.userId,
      metodo: body.payment_method,
      numero_transferencia: body.payment_method === 'transferencia' ? TRANSFER_PHONE : null,
      monto: compra.total,
      moneda: compra.moneda,
    })
    .select('id')
    .single();
  if (errorPago || !pago) {
    if (errorPago?.code === '23505') {
      const { data: pagoEnCurso } = await admin.from('compra_pagos')
        .select('metodo,estado,mp_init_point,numero_transferencia')
        .eq('compra_id', compra.id).in('estado', ['pendiente', 'en_proceso'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (pagoEnCurso?.metodo === 'mercado_pago' && pagoEnCurso.mp_init_point) {
        return respuesta(200, { order_id: compra.id, event_id: eventId, total: compra.total, currency: compra.moneda, url: pagoEnCurso.mp_init_point });
      }
      if (pagoEnCurso?.metodo === 'transferencia') {
        return respuesta(200, { order_id: compra.id, event_id: eventId, total: compra.total, currency: compra.moneda, payment_method: 'transferencia', status: compra.estado, transfer_phone: pagoEnCurso.numero_transferencia ?? TRANSFER_PHONE, whatsapp_url: linkWhatsapp(`Hola, hice la transferencia de la compra ${compra.id}.`) });
      }
      return respuesta(409, { error: 'Estamos preparando el medio de pago de tu pedido. Esperá unos segundos y volvé a intentar.' });
    }
    return respuesta(500, { error: 'La compra quedó guardada, pero no se pudo iniciar el pago. Contactanos con la referencia de compra.' });
  }

  if (body.payment_method === 'transferencia') {
    const [{ data: usuario }, { data: evento }] = await Promise.all([
      admin.auth.admin.getUserById(sesion.userId),
      eventId ? admin.from('events').select('titulo,fecha').eq('id', eventId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const email = usuario?.user?.email ?? '';
    const contacto = linkWhatsapp(`Hola, ya hice la transferencia de la compra ${compra.id} para ${title}.`);
    const listaProductos = quote.productos.map((producto) => `<li>${escapar(producto.nombre)}</li>`).join('');
    const listaDatos = [
      quote.invitation_tier ? '<li>Nombres completos y cómo deben escribirse; fecha, horario y lugar.</li><li>Dirección exacta y enlace de Google Maps; cronograma si corresponde.</li><li>Frase de bienvenida, vestimenta, información de regalos y alias/titular si se muestran.</li><li>Cómo confirmar asistencia y número de WhatsApp de contacto.</li><li>Colores, estilo, referencias visuales, fotos, logo/escudo y música si querés incluirlos.</li>' : '',
      quote.gallery_pack ? '<li>Color y mensaje de bienvenida para la galería.</li>' : '',
      quote.gallery_pack === 'experiencia' || quote.gallery_pack === 'completo' ? '<li>Preguntas y respuestas para la trivia y datos que quieras mostrar en pantalla.</li>' : '',
    ].filter(Boolean).join('');
    const cuerpo = `<p>Registramos tu pedido para <strong>${escapar(title)}</strong>. La transferencia queda pendiente hasta que confirmemos la acreditación.</p>
      <p><strong>Total:</strong> ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(compra.total))}<br>
      <strong>Número para transferir:</strong> ${escapar(TRANSFER_PHONE)}<br><strong>Referencia:</strong> ${escapar(compra.id)}</p>
      <p><strong>Incluye:</strong></p><ul>${listaProductos}</ul>
      <p>Cuando transfieras, avisá por WhatsApp con esta referencia. No hace falta enviar alias.</p>
      <p><strong>Para avanzar con tu pedido, completá la ficha y prepará esta información:</strong></p><ul>${listaDatos}</ul>
      <p>También podés adjuntar fotos, música, logo/escudo o referencias desde WhatsApp si el formulario no acepta esos archivos.</p>
      <p>El pedido se activa cuando confirmemos la transferencia. Después podés revisar o completar los datos desde el detalle de compra.</p>`;
    if (email) await enviarCorreo(email, `Transferencia pendiente · ${title}`, plantilla('Tu pedido quedó pendiente de transferencia', cuerpo, { texto: 'Avisar por WhatsApp', url: contacto }, undefined, 'Invitaciones Digitales · by NewTech'));
    if (ADMIN_EMAIL) await enviarCorreo(ADMIN_EMAIL, `Transferencia pendiente · ${title}`, plantilla('Nueva compra pendiente de transferencia',
      `<p><strong>Evento:</strong> ${escapar(title)}${evento?.fecha ? ` · ${escapar(evento.fecha)}` : ''}<br><strong>Cliente:</strong> ${escapar(email)}<br><strong>Total:</strong> ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(compra.total))}<br><strong>Referencia:</strong> ${escapar(compra.id)}<br><strong>Productos:</strong> ${listaProductos}</p>`, undefined, undefined, 'Invitaciones Digitales · by NewTech'));
    return respuesta(200, {
      order_id: compra.id,
      event_id: eventId,
      total: compra.total,
      currency: compra.moneda,
      payment_method: 'transferencia',
      status: 'transferencia_pendiente',
      transfer_phone: TRANSFER_PHONE,
      whatsapp_url: contacto,
    });
  }

  const { data: usuario } = await admin.auth.admin.getUserById(sesion.userId);
  const notificationUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`;
  const preference = {
    items: [{
      id: `compra-${compra.id}`,
      title: `Invitaciones Digitales · ${title}`.slice(0, 250),
      quantity: 1,
      unit_price: Number(compra.total),
      currency_id: compra.moneda,
    }],
    payer: usuario?.user?.email ? { email: usuario.user.email } : undefined,
    external_reference: pago.id,
    metadata: { compra_id: compra.id, compra_pago_id: pago.id, event_id: eventId },
    back_urls: {
      success: `${SITE}/panel/compra/${compra.id}?pago=aprobado`,
      pending: `${SITE}/panel/compra/${compra.id}?pago=pendiente`,
      failure: `${SITE}/panel/compra/${compra.id}?pago=rechazado`,
    },
    auto_return: 'approved',
    notification_url: notificationUrl,
    statement_descriptor: 'INVITACIONES DIGITALES',
  };

  let response: Response;
  try {
    response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': pago.id },
      body: JSON.stringify(preference),
    });
  } catch (error) {
    console.error('No se pudo conectar con Mercado Pago', error);
    await admin.from('compra_pagos').update({ estado: 'cancelado', detalle: 'sin conexión al crear preferencia', updated_at: new Date().toISOString() }).eq('id', pago.id);
    await admin.from('compras').update({ estado: 'cancelada', updated_at: new Date().toISOString() }).eq('id', compra.id);
    return respuesta(502, { error: 'No pudimos conectar con Mercado Pago. Volvé a intentar desde el mismo pedido.' });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.init_point) {
    console.error('Mercado Pago no pudo crear la preferencia de compra', response.status);
    await admin.from('compra_pagos').update({ estado: 'cancelado', detalle: `preferencia ${response.status}`, updated_at: new Date().toISOString() }).eq('id', pago.id);
    await admin.from('compras').update({ estado: 'cancelada', updated_at: new Date().toISOString() }).eq('id', compra.id);
    return respuesta(502, { error: 'Mercado Pago no respondió. Volvé a iniciar la compra.' });
  }
  const { error: errorGuardarPreferencia } = await admin.from('compra_pagos')
    .update({ mp_preference_id: result.id, mp_init_point: result.init_point, updated_at: new Date().toISOString() })
    .eq('id', pago.id);
  if (errorGuardarPreferencia) {
    console.error('No se pudo guardar la preferencia de Mercado Pago', pago.id, errorGuardarPreferencia);
    await admin.from('compra_pagos').update({ estado: 'cancelado', detalle: 'no se pudo guardar preferencia', updated_at: new Date().toISOString() }).eq('id', pago.id);
    await admin.from('compras').update({ estado: 'cancelada', updated_at: new Date().toISOString() }).eq('id', compra.id);
    return respuesta(502, { error: 'No pudimos guardar el enlace seguro. Volvé a intentar desde el mismo pedido.' });
  }
  return respuesta(200, { order_id: compra.id, event_id: eventId, total: compra.total, currency: compra.moneda, url: result.init_point });
});
