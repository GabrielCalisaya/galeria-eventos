import { clienteAdmin, cors, respuesta, usuarioDelPedido } from '../_shared/comun.ts';
import { sincronizarInvitacion } from '../_shared/invitaciones-wordpress.ts';
import { enviarCorreo, escapar, plantilla } from '../_shared/correo.ts';

const SITE = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');

const administradores = new Set(
  (Deno.env.get('TRANSFER_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST'].includes(req.method)) return respuesta(405, { error: 'Método no permitido' });
  if (!administradores.size) return respuesta(503, { error: 'La administración de transferencias no está configurada.' });

  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Acceso reservado a administradores.' });
  const { data: usuario, error: errorUsuario } = await admin.auth.admin.getUserById(sesion.userId);
  const email = usuario?.user?.email?.trim().toLowerCase();
  if (errorUsuario || !email || !administradores.has(email)) {
    return respuesta(403, { error: 'Acceso reservado a administradores.' });
  }

  if (req.method === 'GET') {
    const { data: compras, error } = await admin
      .from('compras')
      .select('id,user_id,event_id,titulo_evento,tipo_evento,fecha_evento,gallery_pack,invitation_tier,productos,total,moneda,created_at')
      .eq('estado', 'transferencia_pendiente')
      .order('created_at', { ascending: true });
    if (error) return respuesta(500, { error: 'No se pudieron cargar las transferencias pendientes.' });
    const pendientes = await Promise.all((compras ?? []).map(async (compra) => {
      const { data: pago } = await admin.from('compra_pagos')
        .select('id,metodo,estado,numero_transferencia,monto,moneda,created_at')
        .eq('compra_id', compra.id).eq('metodo', 'transferencia').eq('estado', 'pendiente')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      return pago ? { ...compra, compra_pagos: [pago] } : null;
    }));
    return respuesta(200, { compras: pendientes.filter(Boolean) });
  }

  let body: { compra_id?: string };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido.' });
  }
  if (typeof body.compra_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.compra_id)) {
    return respuesta(400, { error: 'La referencia de compra no es válida.' });
  }

  const { data: compra, error: errorCompra } = await admin
    .from('compras')
    .select('id,event_id,gallery_pack,invitation_tier,datos_completos,estado,total,moneda')
    .eq('id', body.compra_id)
    .maybeSingle();
  if (errorCompra || !compra) return respuesta(404, { error: 'No encontramos esa compra.' });
  if (compra.estado !== 'transferencia_pendiente') return respuesta(409, { error: 'La compra ya no está pendiente de confirmación.' });

  const { data: pago, error: errorPago } = await admin
    .from('compra_pagos')
    .select('id,estado,metodo,monto,moneda')
    .eq('compra_id', compra.id)
    .eq('metodo', 'transferencia')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorPago || !pago) return respuesta(409, { error: 'No encontramos una transferencia pendiente para esta compra.' });
  if (Number(pago.monto) !== Number(compra.total) || pago.moneda !== compra.moneda) {
    return respuesta(409, { error: 'El importe del pago no coincide con la compra. Revisala antes de confirmar.' });
  }

  const ahora = new Date().toISOString();
  const { data: pagoActualizado, error: errorActualizarPago } = await admin
    .from('compra_pagos')
    .update({ estado: 'aprobado', detalle: `Transferencia confirmada por ${email}`, updated_at: ahora })
    .eq('id', pago.id)
    .eq('estado', 'pendiente')
    .select('id')
    .maybeSingle();
  if (errorActualizarPago || !pagoActualizado) return respuesta(409, { error: 'La transferencia cambió mientras se confirmaba. Actualizá la lista.' });

  const { data: compraActualizada, error: errorActualizarCompra } = await admin
    .from('compras')
    .update({ estado: 'pagada', updated_at: ahora })
    .eq('id', compra.id)
    .eq('estado', 'transferencia_pendiente')
    .select('id')
    .maybeSingle();
  if (errorActualizarCompra || !compraActualizada) {
    await admin.from('compra_pagos').update({ estado: 'pendiente', detalle: 'confirmación revertida por error de actualización', updated_at: new Date().toISOString() }).eq('id', pago.id).eq('estado', 'aprobado');
    return respuesta(409, { error: 'No se pudo actualizar la compra. Volvé a cargar la lista.' });
  }

  if (compra.event_id && compra.gallery_pack) {
    const { data: precio, error: errorPrecio } = await admin
      .from('precios_pack')
      .select('limite_fotos,meses_album')
      .eq('pack', compra.gallery_pack)
      .maybeSingle();
    if (errorPrecio || !precio) {
      await admin.from('compras').update({ estado: 'transferencia_pendiente', updated_at: new Date().toISOString() }).eq('id', compra.id).eq('estado', 'pagada');
      await admin.from('compra_pagos').update({ estado: 'pendiente', detalle: 'confirmación revertida: paquete sin configuración', updated_at: new Date().toISOString() }).eq('id', pago.id).eq('estado', 'aprobado');
      return respuesta(500, { error: 'No se pudo encontrar la configuración del paquete para activar la galería.' });
    }
    const vence = new Date();
    vence.setMonth(vence.getMonth() + (precio.meses_album ?? 6));
    const { error: errorActivar } = await admin.from('events').update({
      estado: 'activo',
      pack: compra.gallery_pack,
      limite_fotos: precio.limite_fotos,
      vence_album: vence.toISOString().slice(0, 10),
    }).eq('id', compra.event_id).eq('estado', 'borrador');
    if (errorActivar) {
      await admin.from('compras').update({ estado: 'transferencia_pendiente', updated_at: new Date().toISOString() }).eq('id', compra.id).eq('estado', 'pagada');
      await admin.from('compra_pagos').update({ estado: 'pendiente', detalle: 'confirmación revertida por error al activar la galería', updated_at: new Date().toISOString() }).eq('id', pago.id).eq('estado', 'aprobado');
      return respuesta(500, { error: 'No se pudo activar la galería. La transferencia quedó pendiente para reintentar.' });
    }
  }

  if (compra.invitation_tier && compra.datos_completos) await sincronizarInvitacion(admin, compra.id);

  const { data: avisoTomado } = await admin.from('compras').update({ email_notificado_at: ahora })
    .eq('id', compra.id).is('email_notificado_at', null).select('id').maybeSingle();
  let emailEnviado = true;
  if (avisoTomado) {
    emailEnviado = await enviarAvisoTransferencia(admin, compra.id);
    if (!emailEnviado) {
      await admin.from('compras').update({ email_notificado_at: null }).eq('id', compra.id).eq('email_notificado_at', ahora);
      console.error('No se pudo enviar el correo de compra confirmada', compra.id);
    }
  }

  return respuesta(200, { confirmado: true, compra_id: compra.id, event_id: compra.event_id, email_enviado: emailEnviado });
});

async function enviarAvisoTransferencia(admin: ReturnType<typeof clienteAdmin>, compraId: string): Promise<boolean> {
  const { data: compra } = await admin.from('compras').select('id,user_id,titulo_evento,productos,total,moneda,invitation_tier,datos_completos').eq('id', compraId).maybeSingle();
  if (!compra) return false;
  const { data: usuario } = await admin.auth.admin.getUserById(compra.user_id);
  const email = usuario?.user?.email ?? '';
  if (!email || !SITE) return false;
  const nombre = (usuario?.user?.user_metadata?.nombre as string | undefined) ?? '';
  const resumen = ((compra.productos as Array<{ nombre: string }> | null) ?? []).map((item) => `<li>${escapar(item.nombre)}</li>`).join('');
  const siguiente = compra.invitation_tier
    ? compra.datos_completos ? 'Ya recibimos la ficha de tu invitación. Estamos preparando el borrador para revisar los detalles antes de publicarlo.' : 'Completá la ficha del evento desde el detalle de tu pedido para que podamos preparar la invitación.'
    : 'Tu galería está activa. Podés administrarla desde el panel de eventos.';
  const cuerpo = `<p>${nombre ? `Hola ${escapar(nombre)}, ` : ''}confirmamos la acreditación de tu transferencia para <strong>${escapar(compra.titulo_evento)}</strong>.</p><p><strong>Incluye:</strong></p><ul>${resumen}</ul><p><strong>Total:</strong> ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: compra.moneda, maximumFractionDigits: 0 }).format(Number(compra.total))}<br><strong>Referencia:</strong> ${escapar(compra.id)}</p><p>${siguiente}</p>`;
  const url = `${SITE}/panel/compra/${compra.id}`;
  const sent = await enviarCorreo(email, `Pago confirmado · ${compra.titulo_evento}`, plantilla('¡Pago confirmado!', cuerpo, { texto: compra.invitation_tier ? 'Ver mi pedido' : 'Ir a mi panel', url }, undefined, 'Invitaciones Digitales · by NewTech'));
  return sent;
}
