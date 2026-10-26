// Correos transaccionales con Resend (https://resend.com). Si no está configurado, no se envía nada.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_DESDE = Deno.env.get('EMAIL_DESDE') ?? 'Galería en vivo <onboarding@resend.dev>';
export const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? '';
const WHATSAPP_NUMERO = (Deno.env.get('WHATSAPP_NUMERO') ?? '').replace(/\D/g, '');

export function linkWhatsapp(texto: string): string {
  return WHATSAPP_NUMERO
    ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`
    : 'https://wa.link/cddbf1';
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function enviarCorreo(para: string, asunto: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !para) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_DESDE, to: [para], subject: asunto, html }),
    });
    if (!r.ok) console.error('Resend respondió', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('No se pudo enviar el correo', e);
    return false;
  }
}

/** Plantilla simple con la estética de la galería (los clientes de correo no aceptan CSS moderno). */
export function plantilla(titulo: string, cuerpo: string, boton?: { texto: string; url: string }, boton2?: { texto: string; url: string }) {
  const btn = (b: { texto: string; url: string }, primario: boolean) =>
    `<a href="${b.url}" style="display:inline-block;margin:6px 6px 0 0;padding:14px 24px;border-radius:999px;background:${
      primario ? '#492e3b' : '#ffffff'
    };color:${primario ? '#ffffff' : '#492e3b'};border:1px solid #492e3b;text-decoration:none;font-weight:700;font-family:Arial,sans-serif">${escapar(
      b.texto,
    )}</a>`;
  return `<!doctype html><html><body style="margin:0;background:#f5f0e9;padding:24px 12px;font-family:Arial,sans-serif;color:#30262b">
  <div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #eadfd5;border-radius:24px;padding:32px 28px">
    <p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#91694d">Galería en vivo · by NewTech</p>
    <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#1d1619">${escapar(titulo)}</h1>
    <div style="font-size:15px;line-height:1.6">${cuerpo}</div>
    <div style="margin-top:20px">${boton ? btn(boton, true) : ''}${boton2 ? btn(boton2, false) : ''}</div>
  </div>
  <p style="text-align:center;font-size:12px;color:#73656a;margin-top:16px">NewTech · newtech.net.ar</p>
</body></html>`;
}

export { escapar };
