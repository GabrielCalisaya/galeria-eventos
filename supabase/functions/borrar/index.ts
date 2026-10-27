// Borrado definitivo de fotos y eventos: elimina los archivos de R2 y las filas de la base.
//
// { accion: 'fotos', event_id, ids: [...] }  → miembros del evento (anfitrión o coanfitrión)
// { accion: 'evento', event_id }             → solo el dueño del evento
//
// El borrado de un evento grande puede no entrar en una sola llamada: si la respuesta
// trae { pendiente: true }, la app vuelve a llamar hasta que termina.

import { borrarDeR2, clienteAdmin, cors, listarR2, respuesta, usuarioDelPedido } from '../_shared/comun.ts';

const MAX_FOTOS_POR_LLAMADA = 500;
const TIEMPO_MAX_MS = 90_000; // margen antes del límite de ejecución de la función

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });

  const admin = clienteAdmin();
  const sesion = await usuarioDelPedido(req, admin);
  if (sesion instanceof Response) return sesion;
  if (sesion.esAnonimo) return respuesta(403, { error: 'Solo los anfitriones pueden borrar' });
  const { userId } = sesion;

  let body: { accion?: string; event_id?: string; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Pedido inválido' });
  }
  const eventId = body.event_id;
  if (!eventId) return respuesta(400, { error: 'Falta el evento' });

  const { data: evento } = await admin.from('events').select('id, owner_id').eq('id', eventId).maybeSingle();
  if (!evento) return respuesta(404, { error: 'El evento no existe' });

  // ── Borrar fotos seleccionadas ──
  if (body.accion === 'fotos') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
    if (ids.length === 0) return respuesta(400, { error: 'No hay fotos para borrar' });
    if (ids.length > MAX_FOTOS_POR_LLAMADA) {
      return respuesta(400, { error: `Se pueden borrar hasta ${MAX_FOTOS_POR_LLAMADA} fotos por vez` });
    }

    const { data: miembro } = await admin
      .from('event_members')
      .select('user_id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!miembro) return respuesta(403, { error: 'No podés borrar fotos de este evento' });

    const { data: fotos, error } = await admin
      .from('media')
      .select('id, key_original, key_thumb')
      .eq('event_id', eventId)
      .in('id', ids);
    if (error) return respuesta(500, { error: 'No se pudieron leer las fotos' });
    if (!fotos || fotos.length === 0) return respuesta(200, { borradas: 0 });

    const fallidos = await borrarDeR2(fotos.flatMap((f) => [f.key_original, f.key_thumb]));
    if (fallidos > 0) {
      return respuesta(502, { error: 'Algunas fotos no se pudieron borrar. Probá de nuevo.' });
    }

    const { error: errorBorrado } = await admin
      .from('media')
      .delete()
      .eq('event_id', eventId)
      .in('id', fotos.map((f) => f.id));
    if (errorBorrado) return respuesta(500, { error: 'No se pudieron borrar las fotos' });

    return respuesta(200, { borradas: fotos.length });
  }

  // ── Borrar el evento entero ──
  if (body.accion === 'evento') {
    if (evento.owner_id !== userId) {
      return respuesta(403, { error: 'Solo quien creó el evento puede borrarlo' });
    }

    // Una galería con un pedido sin resolver no se borra: el pago podría acreditarse después.
    const { data: pedidoAbierto } = await admin
      .from('compras')
      .select('id')
      .eq('event_id', eventId)
      .in('estado', ['pendiente_pago', 'transferencia_pendiente'])
      .limit(1)
      .maybeSingle();
    if (pedidoAbierto) {
      return respuesta(409, { error: 'Esta galería tiene un pedido pendiente de pago. Escribinos para cancelarlo antes de borrarla.' });
    }

    // Primero los archivos: si se corta a mitad de camino, el evento sigue existiendo
    // y se puede volver a intentar.
    const inicio = Date.now();
    const prefijo = `eventos/${eventId}/`;
    while (Date.now() - inicio < TIEMPO_MAX_MS) {
      let lista;
      try {
        lista = await listarR2(prefijo);
      } catch (e) {
        console.error(e);
        return respuesta(502, { error: 'No se pudieron listar las fotos. Probá de nuevo.' });
      }
      if (lista.keys.length === 0) {
        // Sin archivos: se borra el evento (y en cascada invitados, fotos, trivia…).
        const { error } = await admin.from('events').delete().eq('id', eventId);
        if (error) return respuesta(500, { error: 'No se pudo borrar el evento' });
        return respuesta(200, { borrado: true });
      }
      const fallidos = await borrarDeR2(lista.keys);
      if (fallidos > 0) {
        return respuesta(502, { error: 'Algunos archivos no se pudieron borrar. Probá de nuevo.' });
      }
    }
    return respuesta(200, { pendiente: true });
  }

  return respuesta(400, { error: 'Acción desconocida' });
});
