import { clienteAdmin, cors, respuesta } from '../_shared/comun.ts';
import { cotizarCompra } from '../_shared/catalogo-compra.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respuesta(405, { error: 'Método no permitido' });
  let body;
  try {
    body = await req.json();
  } catch {
    return respuesta(400, { error: 'Selección inválida' });
  }
  const cotizacion = await cotizarCompra(clienteAdmin(), body);
  return typeof cotizacion === 'string' ? respuesta(400, { error: cotizacion }) : respuesta(200, cotizacion);
});
