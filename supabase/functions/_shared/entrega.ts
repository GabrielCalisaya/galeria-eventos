// Correo "tu invitación está lista", compartido por la administración y el puente con WordPress.
// Se envía una sola vez por URL: la URL avisada queda en compras.invitacion_notificada_url.

import { clienteAdmin } from './comun.ts';
import { enviarCorreo, escapar, plantilla } from './correo.ts';

type Admin = ReturnType<typeof clienteAdmin>;

const SITIO = (Deno.env.get('ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');

/** Avisa al cliente que su invitación está publicada. Devuelve true si el correo salió en esta llamada. */
export async function avisarInvitacionLista(admin: Admin, compraId: string, url: string): Promise<boolean> {
  const { data: compra } = await admin.from('compras')
    .select('id,user_id,titulo_evento,invitacion_notificada_url')
    .eq('id', compraId).maybeSingle();
  if (!compra || compra.invitacion_notificada_url === url) return false;

  // Se marca antes de enviar (con la URL anterior como condición) para que dos llamadas simultáneas no manden dos correos.
  const anterior = compra.invitacion_notificada_url as string | null;
  const marca = admin.from('compras').update({ invitacion_notificada_url: url }).eq('id', compra.id);
  const { data: marcada } = await (anterior === null ? marca.is('invitacion_notificada_url', null) : marca.eq('invitacion_notificada_url', anterior))
    .select('id').maybeSingle();
  if (!marcada) return false;

  const { data: usuario } = await admin.auth.admin.getUserById(compra.user_id);
  const nombre = (usuario?.user?.user_metadata?.nombre as string | undefined) ?? '';
  const enviado = await enviarCorreo(
    usuario?.user?.email ?? '',
    `Tu invitación está lista · ${compra.titulo_evento}`,
    plantilla(
      '¡Tu invitación está lista!',
      `<p>${nombre ? `Hola ${escapar(nombre)}, ` : ''}ya publicamos la invitación de <strong>${escapar(compra.titulo_evento)}</strong>.
       Compartí este enlace con tus invitados:</p><p><a href="${escapar(url)}">${escapar(url)}</a></p>
       <p>Si querés corregir algún dato, respondé este correo o escribinos por WhatsApp.</p>`,
      { texto: 'Abrir mi invitación', url },
      { texto: 'Ver mi pedido', url: `${SITIO}/panel/compra/${compra.id}` },
      'Invitaciones Digitales · by NewTech',
    ),
  );
  if (!enviado) {
    // Se libera la marca para poder reintentar el aviso.
    await admin.from('compras').update({ invitacion_notificada_url: anterior }).eq('id', compra.id).eq('invitacion_notificada_url', url);
  }
  return enviado;
}
