import { supabase } from './supabase';

/** Llama a una función de Supabase y devuelve su respuesta, o lanza un Error con un mensaje para mostrar. */
export async function invocar<T>(nombre: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body });
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
  return data as T;
}
