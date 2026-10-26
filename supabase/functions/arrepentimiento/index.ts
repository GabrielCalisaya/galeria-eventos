// Botón de arrepentimiento: registra la solicitud sin pedir cuenta, devuelve el código
// de seguimiento al instante y avisa por correo a quien lo pidió y a New Tech.

import { clienteAdmin, cors, respuesta } from '../_shared/comun.ts';
import { ADMIN_EMAIL, enviarCorreo, escapar, plantilla } from '../_shared/correo.ts';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'ARR-' + Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  let body: { nombre?: string; email?: string; telefono?: string; referencia?: string; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido' });
  }
  const nombre = (body.nombre ?? '').trim().slice(0, 120);
  const email = (body.email ?? '').trim().toLowerCase().slice(0, 200);
  const telefono = (body.telefono ?? '').trim().slice(0, 40) || null;
  const referencia = (body.referencia ?? '').trim().slice(0, 200) || null;
  const motivo = (body.motivo ?? '').trim().slice(0, 1000) || null;
  if (!nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return respuesta(400, { error: 'Completá tu nombre y un email válido' });
  }

  const admin = clienteAdmin();

  // Freno simple contra abusos: hasta 5 solicitudes por email por hora.
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from('arrepentimientos')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', haceUnaHora);
  if ((count ?? 0) >= 5) return respuesta(429, { error: 'Ya recibimos varias solicitudes. Escribinos por WhatsApp.' });

  let codigo = '';
  for (let intento = 0; intento < 3 && !codigo; intento++) {
    const candidato = generarCodigo();
    const { error } = await admin.from('arrepentimientos').insert({ codigo: candidato, nombre, email, telefono, referencia, motivo });
    if (!error) codigo = candidato;
    else if (error.code !== '23505') {
      console.error(error);
      return respuesta(500, { error: 'No se pudo registrar la solicitud. Escribinos por WhatsApp.' });
    }
  }
  if (!codigo) return respuesta(500, { error: 'No se pudo registrar la solicitud. Probá de nuevo.' });

  const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Jujuy' });

  await enviarCorreo(
    email,
    `Recibimos tu arrepentimiento · Código ${codigo}`,
    plantilla(
      'Recibimos tu solicitud',
      `<p>Hola ${escapar(nombre)}, registramos tu pedido de arrepentimiento el ${escapar(fecha)}.</p>
       <p style="font-size:20px"><strong>Código de seguimiento: ${codigo}</strong></p>
       <p>Te vamos a contactar para confirmar la devolución por el mismo medio de pago. Si tenés dudas, respondé este correo o escribinos por WhatsApp.</p>`,
    ),
  );

  await enviarCorreo(
    ADMIN_EMAIL,
    `⚠ Botón de arrepentimiento · ${codigo}`,
    plantilla(
      'Nueva solicitud de arrepentimiento',
      `<p><strong>Código:</strong> ${codigo}<br>
       <strong>Fecha:</strong> ${escapar(fecha)}<br>
       <strong>Nombre:</strong> ${escapar(nombre)}<br>
       <strong>Email:</strong> ${escapar(email)}<br>
       <strong>Teléfono:</strong> ${escapar(telefono ?? '-')}<br>
       <strong>Evento o pago:</strong> ${escapar(referencia ?? '-')}<br>
       <strong>Motivo:</strong> ${escapar(motivo ?? '-')}</p>
       <p>Hay que responderle y gestionar la devolución desde Mercado Pago.</p>`,
    ),
  );

  return respuesta(200, { codigo, fecha });
});
