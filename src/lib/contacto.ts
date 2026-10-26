const NUMERO = ((import.meta.env.VITE_WHATSAPP_NUMERO as string | undefined) ?? '').replace(/\D/g, '');

export const MUESTRAS_INVITACIONES = 'https://invitaciones.newtech.net.ar/#muestras';

/** Link de WhatsApp de NewTech, con un mensaje ya escrito si hay número configurado. */
export function linkWhatsapp(texto: string): string {
  return NUMERO ? `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}` : 'https://wa.link/cddbf1';
}
