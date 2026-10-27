type SupabaseAdmin = ReturnType<typeof import('./comun.ts').clienteAdmin>;

async function firmar(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function endpointWordPress(): string {
  const configured = Deno.env.get('INVITACIONES_WORDPRESS_URL') ?? 'https://invitaciones.newtech.net.ar';
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.hostname !== 'invitaciones.newtech.net.ar' || url.username || url.password) {
    throw new Error('La dirección del conector de invitaciones no es válida.');
  }
  return new URL('/wp-json/ga/v1/integration/purchase', url.origin).href;
}

/** Sincroniza de forma idempotente una compra pagada con ficha completa. La invitación queda en borrador. */
export async function sincronizarInvitacion(admin: SupabaseAdmin, compraId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: compra, error: lectura } = await admin.from('compras')
    .select('id,estado,titulo_evento,tipo_evento,tipo_invitacion,fecha_evento,invitation_tier,datos_invitacion,datos_completos')
    .eq('id', compraId).maybeSingle();
  if (lectura || !compra) return { ok: false, error: 'No se pudo leer la compra.' };
  if (!compra.invitation_tier) {
    await admin.from('compras').update({ invitacion_sync_estado: 'sin_aplica', invitacion_sync_error: null }).eq('id', compraId);
    return { ok: true };
  }
  if (compra.estado !== 'pagada' && compra.estado !== 'preparando' || !compra.datos_completos || !compra.tipo_invitacion) {
    return { ok: false, error: 'La compra todavía no tiene el pago y la ficha completos.' };
  }

  const secret = Deno.env.get('INVITACIONES_WORDPRESS_SECRET') ?? '';
  if (!secret) {
    const message = 'Falta configurar el secreto de conexión con Invitaciones Digitales.';
    await admin.from('compras').update({ invitacion_sync_estado: 'error', invitacion_sync_error: message }).eq('id', compraId);
    return { ok: false, error: message };
  }

  const datos = compra.datos_invitacion as Record<string, string>;
  const names = (datos.nombres ?? '').split(/\s*(?:&|\by\b)\s*/i);
  const payload = {
    purchase_id: compra.id,
    payment_status: 'paid',
    data_complete: true,
    invitation_type: compra.tipo_invitacion,
    invitation_tier: compra.invitation_tier,
    title: compra.titulo_evento,
    event_date: compra.fecha_evento,
    data: {
      person_one: datos.person_one || names[0] || '',
      person_two: datos.person_two || names[1] || '',
      time: datos.hora ?? '',
      venue_name: datos.lugar ?? '',
      venue_address: datos.direccion ?? '',
      venue_city: datos.ciudad ?? '',
      map_url: datos.mapa ?? '',
      phrase: datos.frase ?? '',
      schedule: datos.cronograma ?? '',
      dress_code: datos.vestimenta ?? '',
      gifts: datos.regalos ?? '',
      gift_alias: datos.alias_regalo ?? '',
      gift_holder: datos.titular_regalo ?? '',
      design_notes: [datos.colores, datos.notas].filter(Boolean).join('\n\n'),
      whatsapp_number: datos.whatsapp ?? '',
      rsvp: datos.rsvp ?? '',
      quiz_heading: datos.quiz_heading ?? '',
      quiz_questions: compra.invitation_tier === 'deluxe' ? JSON.parse(datos.quiz_questions ?? '[]') : [],
    },
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  let response: Response;
  try {
    response = await fetch(endpointWordPress(), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { 'content-type': 'application/json', 'x-ga-timestamp': timestamp, 'x-ga-signature': await firmar(secret, `${timestamp}.${body}`) },
      body,
    });
  } catch {
    const message = 'No se pudo conectar con Invitaciones Digitales. Se puede reintentar desde administración.';
    await admin.from('compras').update({ invitacion_sync_estado: 'error', invitacion_sync_error: message }).eq('id', compraId);
    return { ok: false, error: message };
  }
  const result = await response.json().catch(() => ({})) as { id?: number; slug?: string; url?: string; edit_url?: string; message?: string };
  if (!response.ok || !result.id || !result.url || !result.edit_url) {
    const message = result.message || `WordPress rechazó la preparación (HTTP ${response.status}).`;
    await admin.from('compras').update({ invitacion_sync_estado: 'error', invitacion_sync_error: message }).eq('id', compraId);
    return { ok: false, error: message };
  }
  const { error } = await admin.from('compras').update({
    estado: compra.estado === 'pagada' ? 'preparando' : compra.estado,
    wordpress_event_id: result.id,
    wordpress_slug: result.slug,
    wordpress_url: result.url,
    wordpress_edit_url: result.edit_url,
    invitacion_sync_estado: 'preparando',
    invitacion_sync_error: null,
    invitacion_sync_at: new Date().toISOString(),
  }).eq('id', compraId);
  return error ? { ok: false, error: 'El borrador se creó, pero no pudimos guardar el enlace en el pedido.' } : { ok: true };
}
