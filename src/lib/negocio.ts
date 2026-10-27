/** Datos públicos del negocio: se muestran en el footer, las páginas legales y los contactos. */
export const NEGOCIO = {
  nombre: 'New Tech',
  producto: 'Galería en vivo',
  titular: 'Gabriel Calisaya',
  cuit: '20-40927991-1',
  email: 'contacto@newtech.net.ar',
  whatsapp: '+54 9 388 518-7080',
  whatsappNumero: '5493885187080',
  ciudad: 'San Salvador de Jujuy, Argentina',
  provincia: 'Jujuy',
  horario: 'Atención todos los días, las 24 horas',
  instagram: 'https://www.instagram.com/newtech.jujuy/',
  instagramUsuario: '@newtech.jujuy',
  facebook: 'https://www.facebook.com/newtech.juy',
  sitio: 'https://newtech.net.ar',
  invitaciones: 'https://invitaciones.newtech.net.ar',
  foto: '/gabriel.webp',
  defensaConsumidor: 'https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario',
} as const;

export function linkWhatsappNegocio(texto = 'Hola, quiero consultar por Galería en vivo.'): string {
  return `https://wa.me/${NEGOCIO.whatsappNumero}?text=${encodeURIComponent(texto)}`;
}
