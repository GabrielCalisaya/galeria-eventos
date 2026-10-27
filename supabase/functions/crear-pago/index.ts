// Crea un pago en Mercado Pago (Checkout Pro) para mejorar el pack de una galería ya activa (se paga la diferencia).
// Las galerías nuevas o en borrador se activan con el checkout unificado (crear-compra).
// El precio sale de la tabla precios_pack: el navegador solo elige el pack.

import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const SITIO = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });
  if (!MP_ACCESS_TOKEN) return respuesta(503, { error: 'El cobro todavía no está configurado' });

  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Entrá con tu cuenta para pagar' });

  let body: { event_id?: string; pack?: string };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido' });
  }
  const { event_id: eventId, pack } = body;
  if (!eventId || !pack) return respuesta(400, { error: 'Faltan datos' });

  const { data: evento } = await admin
    .from('events')
    .select('id, owner_id, titulo, estado, pack')
    .eq('id', eventId)
    .maybeSingle();
  if (!evento) return respuesta(404, { error: 'El evento no existe' });
  if (evento.owner_id !== sesion.userId) return respuesta(403, { error: 'Solo quien creó el evento puede pagarlo' });
  const { data: precios } = await admin.from('precios_pack').select('pack, nombre, precio, moneda, orden, activo');
  const precio = precios?.find((p) => p.pack === pack && p.activo);
  if (!precio) return respuesta(400, { error: 'Ese pack no está disponible' });

  // Solo mejoras de una galería activa: se paga la diferencia con el pack actual.
  if (evento.estado === 'borrador') {
    return respuesta(409, { error: 'Activá esta galería desde «Elegir pack y pagar» en el panel del evento.' });
  }
  if (evento.estado !== 'activo') return respuesta(409, { error: 'Este evento ya no se puede pagar' });
  const actual = precios?.find((p) => p.pack === evento.pack);
  if (!actual || precio.orden <= actual.orden) {
    return respuesta(409, { error: 'El evento ya tiene ese pack o uno mejor' });
  }
  const monto = Math.max(1, Number(precio.precio) - Number(actual.precio));

  const { data: usuario } = await admin.auth.admin.getUserById(sesion.userId);

  // Registro del pago antes de ir a Mercado Pago: su id viaja como referencia.
  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({
      event_id: eventId,
      user_id: sesion.userId,
      pack: precio.pack,
      monto,
      moneda: precio.moneda,
    })
    .select('id')
    .single();
  if (errorPago || !pago) return respuesta(500, { error: 'No se pudo iniciar el pago' });

  const volver = `${SITIO}/panel/${eventId}`;
  const preferencia = {
    items: [
      {
        id: `pack-${precio.pack}`,
        title: `Galería en vivo · Mejora a pack ${precio.nombre} · ${evento.titulo}`.slice(0, 250),
        quantity: 1,
        unit_price: monto,
        currency_id: precio.moneda,
      },
    ],
    payer: usuario?.user?.email ? { email: usuario.user.email } : undefined,
    external_reference: pago.id,
    metadata: { event_id: eventId, pago_id: pago.id, pack: precio.pack },
    back_urls: {
      success: `${volver}?pago=aprobado`,
      pending: `${volver}?pago=pendiente`,
      failure: `${volver}?pago=rechazado`,
    },
    auto_return: 'approved',
    notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
    statement_descriptor: 'GALERIA EN VIVO',
  };

  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': pago.id,
    },
    body: JSON.stringify(preferencia),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok || !datos.init_point) {
    console.error('Mercado Pago respondió', r.status, JSON.stringify(datos));
    await admin.from('pagos').update({ estado: 'cancelado', detalle: `preferencia ${r.status}` }).eq('id', pago.id);
    return respuesta(502, { error: 'Mercado Pago no respondió. Probá de nuevo en unos minutos.' });
  }

  await admin.from('pagos').update({ mp_preference_id: datos.id, updated_at: new Date().toISOString() }).eq('id', pago.id);

  return respuesta(200, { url: datos.init_point as string });
});
