import { linkWhatsappNegocio, NEGOCIO } from './negocio';

export const MUESTRAS_INVITACIONES = `${NEGOCIO.invitaciones}/#muestras`;

/** Link de WhatsApp de New Tech con un mensaje ya escrito. */
export function linkWhatsapp(texto: string): string {
  return linkWhatsappNegocio(texto);
}
