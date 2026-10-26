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
  if (!MP_WEBHOOK_SECRET) return true;
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
