// Aviso de Mercado Pago cuando cambia un pago.
// Nunca se confía en el contenido del aviso: se consulta el pago a Mercado Pago con el token
// y recién ahí se activa el evento. Si hay clave secreta configurada, además se verifica la firma.

import { clienteAdmin } from '../_shared/comun.ts';

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
  }

  return ok();
});
