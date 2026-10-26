// Cola de subida pensada para la señal de un salón: comprime en el celular,
// sube de a pocas fotos, reintenta sola y espera a que vuelva la conexión.

import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabase';
import { procesarImagen, type ImagenProcesada } from './imagen';

export type EstadoItem = 'esperando' | 'procesando' | 'subiendo' | 'lista' | 'error';

export type ItemSubida = {
  local: string;
  nombre: string;
  vista: string; // object URL para la miniatura en pantalla
  estado: EstadoItem;
  error?: string;
};

type Firmada = { id: string; url_original: string; url_miniatura: string };

const TANDA = 5;
const PARALELAS = 3;
const REINTENTOS = 3;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esperarConexion(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    try {
      await esperarConexion();
      return await fn();
    } catch (e) {
      ultimo = e;
      if (e instanceof ErrorDefinitivo) throw e;
      await esperar(1000 * 2 ** intento);
    }
  }
  throw ultimo;
}

class ErrorDefinitivo extends Error {}

async function firmar(eventId: string, procesadas: ImagenProcesada[]): Promise<Firmada[]> {
  const { data, error } = await supabase.functions.invoke('sign-upload', {
    body: {
      event_id: eventId,
      archivos: procesadas.map((p) => ({
        bytes: p.foto.size,
        thumb_bytes: p.miniatura.size,
        ancho: p.ancho,
        alto: p.alto,
      })),
    },
  });
  if (error) {
    // Los errores 4xx traen un mensaje para mostrar y no tiene sentido reintentar.
    const ctx = (error as { context?: Response }).context;
    if (ctx && ctx.status >= 400 && ctx.status < 500) {
      let mensaje = 'No se pudo subir';
      try {
        mensaje = ((await ctx.json()) as { error?: string }).error ?? mensaje;
      } catch {
        /* sin cuerpo */
      }
      throw new ErrorDefinitivo(mensaje);
    }
    throw error;
  }
  return (data as { subidas: Firmada[] }).subidas;
}

async function put(url: string, blob: Blob) {
  const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
  if (!r.ok) throw new Error(`Error ${r.status} al subir`);
}

export function useSubidas(eventId: string | undefined) {
  const [items, setItems] = useState<ItemSubida[]>([]);
  const archivos = useRef(new Map<string, File>());
  const corriendo = useRef(false);
  const pendientes = useRef<string[]>([]);

  const actualizar = useCallback((local: string, cambio: Partial<ItemSubida>) => {
    setItems((prev) => prev.map((i) => (i.local === local ? { ...i, ...cambio } : i)));
  }, []);

  const procesarCola = useCallback(async () => {
    if (corriendo.current || !eventId) return;
    corriendo.current = true;
    try {
      while (pendientes.current.length > 0) {
        const tanda = pendientes.current.splice(0, TANDA);

        // 1. Comprimir en el celular, de a una para no saturar la memoria.
        const listas: { local: string; img: ImagenProcesada }[] = [];
        for (const local of tanda) {
          const archivo = archivos.current.get(local);
          if (!archivo) continue;
          actualizar(local, { estado: 'procesando' });
          try {
            listas.push({ local, img: await procesarImagen(archivo) });
          } catch {
            actualizar(local, { estado: 'error', error: 'Este formato no se puede leer' });
          }
        }
        if (listas.length === 0) continue;

        // 2. Pedir las URLs firmadas para toda la tanda.
        let firmadas: Firmada[];
        try {
          firmadas = await conReintentos(() => firmar(eventId, listas.map((l) => l.img)));
        } catch (e) {
          const mensaje = e instanceof ErrorDefinitivo ? e.message : 'Sin conexión. Probá de nuevo.';
          listas.forEach((l) => actualizar(l.local, { estado: 'error', error: mensaje }));
          continue;
        }

        // 3. Subir directo a R2, de a pocas en paralelo.
        const confirmadas: string[] = [];
        const trabajos = listas.map((l, i) => async () => {
          const f = firmadas[i];
          actualizar(l.local, { estado: 'subiendo' });
          try {
            await conReintentos(async () => {
              await put(f.url_miniatura, l.img.miniatura);
              await put(f.url_original, l.img.foto);
            });
            confirmadas.push(f.id);
            actualizar(l.local, { estado: 'lista' });
            archivos.current.delete(l.local);
          } catch {
            actualizar(l.local, { estado: 'error', error: 'Se cortó la subida. Probá de nuevo.' });
          }
        });
        for (let i = 0; i < trabajos.length; i += PARALELAS) {
          await Promise.all(trabajos.slice(i, i + PARALELAS).map((t) => t()));
        }

        // 4. Avisar que quedaron listas para que aparezcan en la galería.
        if (confirmadas.length > 0) {
          await conReintentos(async () => {
            const { error } = await supabase.rpc('confirmar_media', { p_ids: confirmadas });
            if (error) throw error;
          }).catch(() => undefined);
        }
      }
    } finally {
      corriendo.current = false;
    }
  }, [eventId, actualizar]);

  const agregar = useCallback(
    (lista: FileList | File[]) => {
      const nuevos: ItemSubida[] = [];
      for (const archivo of Array.from(lista)) {
        if (!archivo.type.startsWith('image/') && !/\.(heic|heif)$/i.test(archivo.name)) continue;
        const local = crypto.randomUUID();
        archivos.current.set(local, archivo);
        pendientes.current.push(local);
        nuevos.push({ local, nombre: archivo.name, vista: URL.createObjectURL(archivo), estado: 'esperando' });
      }
      if (nuevos.length === 0) return;
      setItems((prev) => [...nuevos, ...prev]);
      void procesarCola();
    },
    [procesarCola],
  );

  const reintentar = useCallback(() => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.estado === 'error' && archivos.current.has(i.local)) {
          pendientes.current.push(i.local);
          return { ...i, estado: 'esperando', error: undefined };
        }
        return i;
      }),
    );
    void procesarCola();
  }, [procesarCola]);

  const limpiarListas = useCallback(() => {
    setItems((prev) => {
      prev.filter((i) => i.estado === 'lista').forEach((i) => URL.revokeObjectURL(i.vista));
      return prev.filter((i) => i.estado !== 'lista');
    });
  }, []);

  return { items, agregar, reintentar, limpiarListas };
}
