import { invocar } from './funciones';

const POR_LLAMADA = 200;

/** Borra para siempre las fotos indicadas (archivos y registros). */
export async function borrarFotos(eventId: string, ids: string[], onProgreso?: (hechas: number) => void) {
  let hechas = 0;
  for (let i = 0; i < ids.length; i += POR_LLAMADA) {
    const tanda = ids.slice(i, i + POR_LLAMADA);
    await invocar<{ borradas: number }>('borrar', { accion: 'fotos', event_id: eventId, ids: tanda });
    hechas += tanda.length;
    onProgreso?.(hechas);
  }
}

/** Borra para siempre el evento con todas sus fotos. Repite hasta que el servidor termina. */
export async function borrarEvento(eventId: string) {
  for (let intento = 0; intento < 20; intento++) {
    const r = await invocar<{ borrado?: boolean; pendiente?: boolean }>('borrar', {
      accion: 'evento',
      event_id: eventId,
    });
    if (r.borrado) return;
  }
  throw new Error('El borrado está tardando más de lo normal. Volvé a intentarlo en unos minutos.');
}
