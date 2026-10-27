import { supabase } from './supabase';

/**
 * Llama a una función de Supabase y devuelve su respuesta, o lanza un Error con el mensaje del servidor.
 * Con `body` hace POST; sin `body` hace GET (los parámetros van en `nombre`, por ejemplo 'funcion?vista=x').
 */
export async function invocar<T>(nombre: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, body ? { body } : { method: 'GET' });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let mensaje = 'No se pudo completar. Revisá la conexión y probá de nuevo.';
    if (ctx) {
      try {
        mensaje = ((await ctx.json()) as { error?: string }).error ?? mensaje;
      } catch {
        /* sin cuerpo */
      }
    }
    throw new Error(mensaje);
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error);
  return data as T;
}

/** Valida que un enlace de pago lleve a Mercado Pago antes de redirigir. */
export function irAMercadoPago(url: unknown): void {
  let destino: URL;
  try {
    destino = new URL(String(url));
  } catch {
    throw new Error('No llegó el enlace seguro de pago. Escribinos para revisar el pedido.');
  }
  const valido = ['mercadopago.com.ar', 'mercadopago.com'].some((d) => destino.hostname === d || destino.hostname.endsWith(`.${d}`));
  if (destino.protocol !== 'https:' || !valido) throw new Error('El enlace de pago no pertenece a Mercado Pago. Escribinos para revisar el pedido.');
  window.location.assign(destino.href);
}
