// Aviso de Mercado Pago cuando cambia un pago.
// Nunca se confía en el contenido del aviso: se consulta el pago a Mercado Pago con el token
// y recién ahí se activa el evento. Si hay clave secreta configurada, además se verifica la firma.

import { clienteAdmin } from '../_shared/comun.ts';
import { ADMIN_EMAIL, enviarCorreo, escapar, linkWhatsapp, plantilla } from '../_shared/correo.ts';

const SITIO = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');
const NOMBRES_PACK: Record<string, string> = { basico: 'Básico', experiencia: 'Experiencia', completo: 'Completo' };
const pesos = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') ?? '';

const ESTADOS: Record<string, string> = {
  approved: 'aprobado',
  authorized: 'en_proceso',
  in_process: 'en_proceso',
  in_mediation: 'en_proceso',
  pending: 'pendiente',
  rejected: 'rechazado',
  cancelled: 'cancelado',
  refunded: 'devuelto',
  charged_back: 'devuelto',
};

const ok = () => new Response('ok', { status: 200 });

async function hmacHex(clave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const firma = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Firma x-signature de Mercado Pago: "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" */
async function firmaValida(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;
  const cabecera = req.headers.get('x-signature') ?? '';
  const requestId = req.headers.get('x-request-id') ?? '';
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  if (!partes.ts || !partes.v1) return false;
  const plantilla = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  return (await hmacHex(MP_WEBHOOK_SECRET, plantilla)) === partes.v1;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  if (!MP_ACCESS_TOKEN) return new Response('sin configurar', { status: 503 });
  if (!MP_WEBHOOK_SECRET) return new Response('webhook sin clave', { status: 503 });

  const url = new URL(req.url);
  let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    body = await req.json();
  } catch {
    /* algunos avisos llegan solo por query string */
  }
  const tipo = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const paymentId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  if (tipo !== 'payment' || !paymentId) return ok();

  if (!(await firmaValida(req, paymentId))) {
    console.warn('Firma inválida en aviso de Mercado Pago');
    return new Response('firma inválida', { status: 401 });
  }

  // Fuente de verdad: el pago consultado directamente a Mercado Pago.
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) {
    console.error('No se pudo consultar el pago', paymentId, r.status);
    return new Response('reintentar', { status: 500 });
  }
  const pagoMp = await r.json();
  const pagoId = String(pagoMp.external_reference ?? '');
  if (!pagoId) return ok();

  const admin = clienteAdmin();
  const { data: compraPago } = await admin
    .from('compra_pagos')
    .select('id,compra_id,user_id,monto,moneda,estado')
    .eq('id', pagoId)
    .maybeSingle();

  if (compraPago) {
    const estadoCompraPago = ESTADOS[pagoMp.status] ?? 'pendiente';
    const montoCompraOk = Math.abs(Number(pagoMp.transaction_amount) - Number(compraPago.monto)) < 0.01
      && pagoMp.currency_id === compraPago.moneda;
    const estadoVerificado = estadoCompraPago === 'aprobado' && !montoCompraOk ? 'en_proceso' : estadoCompraPago;

    await admin.from('compra_pagos').update({
      mp_payment_id: String(pagoMp.id),
      estado: estadoVerificado,
      detalle: montoCompraOk ? (pagoMp.status_detail ?? null) : 'monto o moneda no coincide',
      updated_at: new Date().toISOString(),
    }).eq('id', compraPago.id);

    if (estadoCompraPago === 'aprobado' && montoCompraOk) {
      const { data: compra } = await admin.from('compras')
        .select('id,user_id,event_id,titulo_evento,tipo_evento,fecha_evento,gallery_pack,invitation_tier,productos,total,moneda')
        .eq('id', compraPago.compra_id)
        .maybeSingle();
      if (!compra) return new Response('compra no encontrada', { status: 500 });

      // Solo avanza desde estados pendientes: un aviso repetido no devuelve a "pagada" una compra en preparación o entregada.
      await admin.from('compras').update({ estado: 'pagada', updated_at: new Date().toISOString() })
        .eq('id', compra.id).in('estado', ['pendiente_pago', 'transferencia_pendiente']);
      if (compra.event_id && compra.gallery_pack) {
        const { data: precio } = await admin.from('precios_pack').select('limite_fotos,meses_album').eq('pack', compra.gallery_pack).maybeSingle();
        const vence = new Date();
        vence.setMonth(vence.getMonth() + (precio?.meses_album ?? 6));
        const { error: errorActivar } = await admin.from('events').update({
          estado: 'activo',
          pack: compra.gallery_pack,
          limite_fotos: precio?.limite_fotos ?? 1500,
          vence_album: vence.toISOString().slice(0, 10),
        }).eq('id', compra.event_id).in('estado', ['borrador', 'activo']);
        if (errorActivar) return new Response('no se pudo activar la galería', { status: 500 });
      }

      // La marca evita correos duplicados cuando Mercado Pago reintenta el webhook.
      const { data: marcado } = await admin.from('compras').update({ email_notificado_at: new Date().toISOString() })
        .eq('id', compra.id).is('email_notificado_at', null).select('id').maybeSingle();
      if (marcado && !(await avisarCompra(admin, compra, pagoMp))) {
        await admin.from('compras').update({ email_notificado_at: null }).eq('id', compra.id);
        return new Response('no se pudo enviar el correo de compra', { status: 500 });
      }
    } else if (estadoCompraPago === 'devuelto') {
      await admin.from('compras').update({ estado: 'reembolsada', updated_at: new Date().toISOString() }).eq('id', compraPago.compra_id);
    }
    return ok();
  }

  const { data: pago } = await admin.from('pagos').select('id, event_id, pack, monto, moneda, estado').eq('id', pagoId).maybeSingle();
  if (!pago) return ok();

  const estado = ESTADOS[pagoMp.status] ?? 'pendiente';
  const montoOk = Number(pagoMp.transaction_amount) >= Number(pago.monto) && pagoMp.currency_id === pago.moneda;

  await admin
    .from('pagos')
    .update({
      mp_payment_id: String(pagoMp.id),
      estado: estado === 'aprobado' && !montoOk ? 'en_proceso' : estado,
      detalle: montoOk ? (pagoMp.status_detail ?? null) : 'monto no coincide',
      updated_at: new Date().toISOString(),
    })
    .eq('id', pago.id);

  if (estado === 'aprobado' && montoOk) {
    const { data: precio } = await admin.from('precios_pack').select('limite_fotos, meses_album').eq('pack', pago.pack).maybeSingle();
    const vence = new Date();
    vence.setMonth(vence.getMonth() + (precio?.meses_album ?? 6));
    await admin
      .from('events')
      .update({
        estado: 'activo',
        pack: pago.pack,
        limite_fotos: precio?.limite_fotos ?? 1500,
        vence_album: vence.toISOString().slice(0, 10),
      })
      .eq('id', pago.event_id)
      .in('estado', ['borrador', 'activo']);

    // Avisos por correo, una sola vez por pago aunque Mercado Pago repita el aviso.
    const { data: marcado } = await admin
      .from('pagos')
      .update({ notificado_at: new Date().toISOString() })
      .eq('id', pago.id)
      .is('notificado_at', null)
      .select('id, user_id')
      .maybeSingle();
    if (marcado) await avisarPago(admin, pago, marcado.user_id, pagoMp);
  }

  return ok();
});

type Admin = ReturnType<typeof clienteAdmin>;

async function avisarCompra(
  admin: Admin,
  compra: {
    id: string; user_id: string; event_id: string | null; titulo_evento: string; tipo_evento: string;
    fecha_evento: string | null; gallery_pack: string | null; invitation_tier: string | null;
    productos: Array<{ tipo: string; nombre: string }>; total: number; moneda: string;
  },
  pagoMp: { id: number; transaction_amount: number },
): Promise<boolean> {
  const { data: usuario } = await admin.auth.admin.getUserById(compra.user_id);
  const email = usuario?.user?.email ?? '';
  const nombre = (usuario?.user?.user_metadata?.nombre as string | undefined) ?? '';
  const ordenUrl = `${SITIO}/panel/compra/${compra.id}`;
  const lista = (compra.productos ?? []).map((p) => `<li>${escapar(p.nombre)}</li>`).join('');
  const incluyeInvitacion = Boolean(compra.invitation_tier);
  const incluyeGaleria = Boolean(compra.gallery_pack);
  const datos = [
    incluyeInvitacion ? 'Nombres tal como deben aparecer y texto/frase de la invitación.' : '',
    incluyeInvitacion ? 'Lugar, dirección, enlace de mapa, horarios y cronograma.' : '',
    incluyeInvitacion ? 'Vestimenta, regalos/alias, modalidad RSVP y número de WhatsApp de contacto.' : '',
    incluyeInvitacion ? 'Fotos, video, música y colores o estilo deseado.' : '',
    incluyeGaleria ? 'Color, bienvenida y detalles del evento para personalizar la galería.' : '',
    compra.gallery_pack === 'experiencia' || compra.gallery_pack === 'completo' ? 'Preguntas y respuestas de la trivia y datos para la pantalla del salón.' : '',
  ].filter(Boolean).map((item) => `<li>${escapar(item)}</li>`).join('');
  const cuerpo = `<p>${nombre ? `Hola ${escapar(nombre)}, ` : ''}confirmamos el pago de tu compra para <strong>${escapar(compra.titulo_evento)}</strong>.</p>
    <p><strong>Productos incluidos</strong></p><ul>${lista}</ul>
    <p><strong>Total pagado:</strong> ${pesos(Number(pagoMp.transaction_amount))}<br><strong>Referencia:</strong> ${escapar(compra.id)}</p>
    <p>Para que podamos preparar todo sin pedirte los datos por mensaje, completá la ficha de tu evento. Te va a pedir:</p>
    <ul>${datos}</ul>
    <p>La galería, si la compraste, se activa automáticamente. La invitación se prepara con los datos que cargues en la ficha.</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f0e9;padding:24px 12px;font-family:Arial,sans-serif;color:#30262b">
    <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfd5;border-radius:24px;padding:32px 28px">
    <p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#91694d">Invitaciones Digitales · by NewTech</p>
    <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#1d1619">¡Compra confirmada!</h1>
    <div style="font-size:15px;line-height:1.6">${cuerpo}</div>
    <p style="margin-top:24px"><a href="${ordenUrl}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#492e3b;color:#fff;text-decoration:none;font-weight:700">Completar datos del evento</a></p>
    </div><p style="text-align:center;font-size:12px;color:#73656a;margin-top:16px">NewTech · Jujuy</p></body></html>`;
  const enviado = await enviarCorreo(email, `Compra confirmada · ${compra.titulo_evento}`, html);
  if (ADMIN_EMAIL) {
    await enviarCorreo(ADMIN_EMAIL, `Nueva compra · ${compra.titulo_evento}`, plantilla(
      'Nueva compra confirmada',
      `<p><strong>Evento:</strong> ${escapar(compra.titulo_evento)}${compra.fecha_evento ? ` · ${escapar(compra.fecha_evento)}` : ''}<br>
      <strong>Cliente:</strong> ${escapar(nombre || 'Anfitrión')} · ${escapar(email)}<br>
      <strong>Referencia:</strong> ${escapar(compra.id)}<br><strong>Importe:</strong> ${pesos(Number(pagoMp.transaction_amount))}<br>
      <strong>Productos:</strong> ${lista}</p>`,
      { texto: 'Ver pedidos', url: `${SITIO}/panel/administracion` },
      undefined,
      'Invitaciones Digitales · by NewTech',
    ));
  }
  return enviado;
}

async function avisarPago(
  admin: Admin,
  pago: { event_id: string; pack: string; monto: number; moneda: string },
  userId: string,
  pagoMp: { id: number; transaction_amount: number; payer?: { email?: string } },
) {
  const [{ data: evento }, { data: usuario }] = await Promise.all([
    admin.from('events').select('titulo, fecha, slug').eq('id', pago.event_id).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const titulo = evento?.titulo ?? 'tu evento';
  const pack = NOMBRES_PACK[pago.pack] ?? pago.pack;
  const emailCliente = usuario?.user?.email ?? '';
  const nombreCliente = (usuario?.user?.user_metadata?.nombre as string | undefined) ?? '';
  const panel = `${SITIO}/panel/${pago.event_id}`;
  const esCompleto = pago.pack === 'completo';
  const whatsapp = linkWhatsapp(
    `Hola, pagué el pack ${pack} de Galería en vivo para "${titulo}". Te paso los datos para la invitación digital.`,
  );

  // Al cliente
  const pasos = [
    'Imprimí las tarjetas de mesa con el QR o descargalo desde tu panel.',
    pago.pack !== 'basico' ? 'Pasale el link de la pantalla del salón al DJ o a quien maneje el proyector.' : '',
    pago.pack !== 'basico' ? 'Cargá las preguntas de la trivia antes del evento.' : '',
    esCompleto ? '<strong>Escribinos por WhatsApp</strong> para empezar tu invitación digital: nombres, fecha, lugar y el estilo que te guste.' : '',
  ].filter(Boolean);
  await enviarCorreo(
    emailCliente,
    `¡Tu galería está activa! · ${titulo}`,
    plantilla(
      '¡Tu galería está activa!',
      `<p>${nombreCliente ? `Hola ${escapar(nombreCliente)}, ` : ''}recibimos tu pago del pack <strong>${escapar(pack)}</strong> para <strong>${escapar(
        titulo,
      )}</strong>. El QR ya funciona.</p>
       <p style="margin:18px 0 6px;font-weight:700">Próximos pasos</p>
       <ol style="padding-left:20px;margin:0">${pasos.map((p) => `<li style="margin-bottom:6px">${p}</li>`).join('')}</ol>`,
      { texto: 'Ir a mi panel', url: panel },
      esCompleto ? { texto: 'Coordinar invitación por WhatsApp', url: whatsapp } : undefined,
    ),
  );

  // A NewTech
  if (ADMIN_EMAIL) {
    await enviarCorreo(
      ADMIN_EMAIL,
      `${esCompleto ? '⚠ Coordinar invitación · ' : ''}Nuevo pago ${pack} · ${titulo}`,
      plantilla(
        `Nuevo pago: pack ${pack}`,
        `<p><strong>Evento:</strong> ${escapar(titulo)}${evento?.fecha ? ` (${evento.fecha})` : ''}<br>
         <strong>Cliente:</strong> ${escapar(nombreCliente || '-')} · ${escapar(emailCliente || pagoMp.payer?.email || '-')}<br>
         <strong>Monto:</strong> ${pesos(Number(pagoMp.transaction_amount))}<br>
         <strong>Pago de Mercado Pago:</strong> ${pagoMp.id}</p>
         ${esCompleto ? '<p style="padding:12px 14px;border-radius:12px;background:#fff4e5;color:#8a5a12"><strong>Incluye invitación digital Estándar:</strong> el cliente recibió el botón de WhatsApp para pasarte los datos.</p>' : ''}`,
        { texto: 'Ver el evento', url: panel },
      ),
    );
  }
}
