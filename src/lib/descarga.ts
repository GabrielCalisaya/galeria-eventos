// Descarga de todas las fotos en archivos .zip, armados en el navegador.
// Se divide en partes para no llenar la memoria del dispositivo con eventos grandes.

import { downloadZip } from 'client-zip';
import { supabase, urlPublica } from './supabase';
import type { Media } from './tipos';

export const FOTOS_POR_PARTE = 150;

export type FotoDescarga = Pick<Media, 'id' | 'key_original' | 'autor_nombre' | 'created_at'>;

/** Todas las fotos visibles del evento, de la más vieja a la más nueva. */
export async function listarFotosParaDescargar(eventId: string): Promise<FotoDescarga[]> {
  const todas: FotoDescarga[] = [];
  const bloque = 1000;
  for (let desde = 0; ; desde += bloque) {
    const { data, error } = await supabase
      .from('media')
      .select('id, key_original, autor_nombre, created_at')
      .eq('event_id', eventId)
      .eq('estado', 'lista')
      .eq('oculta', false)
      .order('created_at', { ascending: true })
      .range(desde, desde + bloque - 1);
    if (error) throw new Error('No se pudo leer la lista de fotos');
    todas.push(...((data ?? []) as FotoDescarga[]));
    if (!data || data.length < bloque) break;
  }
  return todas;
}

function nombreSeguro(texto: string): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return limpio.slice(0, 40) || 'invitado';
}

/** Arma el .zip de una parte y lo descarga. */
export async function descargarParte(
  fotos: FotoDescarga[],
  numeroInicial: number,
  nombreArchivo: string,
  onProgreso: (hechas: number) => void,
): Promise<{ fallidas: number }> {
  let hechas = 0;
  let fallidas = 0;

  async function* archivos() {
    for (const [i, f] of fotos.entries()) {
      try {
        const r = await fetch(urlPublica(f.key_original));
        if (!r.ok) throw new Error(String(r.status));
        const numero = String(numeroInicial + i).padStart(4, '0');
        yield {
          name: `${numero}-${nombreSeguro(f.autor_nombre)}.jpg`,
          lastModified: new Date(f.created_at),
          input: await r.blob(),
        };
      } catch {
        fallidas++;
      }
      hechas++;
      onProgreso(hechas);
    }
  }

  const blob = await downloadZip(archivos()).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { fallidas };
}
