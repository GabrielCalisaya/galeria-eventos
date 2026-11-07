// Cola de subida pensada para la señal de un salón: comprime en el celular,
// empieza a subir apenas la primera foto está lista, sube de a pocas en paralelo,
// corta los pedidos que se cuelgan, reintenta sola y sigue cuando vuelve la conexión.

import { useCallback, useEffect, useRef, useState } from 'react';
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

type Firmada = { id: string; url_original: string; url_miniatura: string; firmadaEn: number };

const TANDA = 4; // cuántas fotos ya comprimidas se firman juntas
const PARALELAS = 3; // fotos subiendo a la vez
const REINTENTOS = 5;
const VIGENCIA_FIRMA_MS = 8 * 60_000; // la firma dura 10 min; se renueva antes
const TIEMPO_FIRMA_MS = 25_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esperarConexion(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

class ErrorDefinitivo extends Error {}
class FirmaVencida extends Error {}

async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    try {
      await esperarConexion();
      return await fn();
    } catch (e) {
      ultimo = e;
      if (e instanceof ErrorDefinitivo || e instanceof FirmaVencida) throw e;
      if (intento < REINTENTOS) await esperar(Math.min(15_000, 1000 * 2 ** intento) + Math.random() * 500);
    }
  }
  throw ultimo;
}

function conTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Tiempo agotado')), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function firmar(eventId: string, procesadas: ImagenProcesada[]): Promise<Firmada[]> {
  const { data, error } = await conTiempo(
    supabase.functions.invoke('sign-upload', {
      body: {
        event_id: eventId,
        archivos: procesadas.map((p) => ({
          bytes: p.foto.size,
          thumb_bytes: p.miniatura.size,
          ancho: p.ancho,
          alto: p.alto,
        })),
      },
    }),
    TIEMPO_FIRMA_MS,
  );
  if (error) {
    const ctx = (error as { context?: Response }).context;
    // "Muy rápido": no es definitivo, conviene esperar y seguir.
    if (ctx && ctx.status === 429) {
      await esperar(20_000);
      throw error;
    }
    // El resto de los 4xx traen un mensaje para mostrar y no tiene sentido reintentar.
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
  const ahora = Date.now();
  return (data as { subidas: Omit<Firmada, 'firmadaEn'>[] }).subidas.map((s) => ({ ...s, firmadaEn: ahora }));
}

async function put(url: string, blob: Blob) {
  // Tiempo máximo según el peso (señal lenta: ~25 KB/s) para que un pedido colgado no frene la cola.
  const limite = 20_000 + (blob.size / 25_000) * 1000;
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), limite);
  try {
    const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' }, signal: control.signal });
    if (r.status === 403) throw new FirmaVencida('Firma vencida');
    if (!r.ok) throw new Error(`Error ${r.status} al subir`);
  } finally {
    clearTimeout(t);
  }
}

export function useSubidas(eventId: string | undefined) {
  const [items, setItems] = useState<ItemSubida[]>([]);
  const archivos = useRef(new Map<string, File>());
  const procesadas = useRef(new Map<string, ImagenProcesada>()); // para no volver a comprimir al reintentar
  const firmas = useRef(new Map<string, Firmada>());
  const sinConfirmar = useRef<string[]>([]);
  const porComprimir = useRef<string[]>([]);
  const listasParaSubir = useRef<string[]>([]);
  const comprimiendo = useRef(false);
  const subiendo = useRef(false);

  const actualizar = useCallback((local: string, cambio: Partial<ItemSubida>) => {
    setItems((prev) => prev.map((i) => (i.local === local ? { ...i, ...cambio } : i)));
  }, []);

  const confirmar = useCallback(async () => {
    if (sinConfirmar.current.length === 0) return;
    const ids = sinConfirmar.current.splice(0);
    try {
      await conReintentos(async () => {
        const { error } = await supabase.rpc('confirmar_media', { p_ids: ids });
        if (error) throw error;
      });
    } catch {
      // Se vuelve a intentar con la próxima foto o cuando vuelva la señal.
      sinConfirmar.current.push(...ids);
    }
  }, []);

  const subirUna = useCallback(
    async (local: string, f: Firmada, img: ImagenProcesada) => {
      actualizar(local, { estado: 'subiendo' });
      try {
        await conReintentos(async () => {
          if (Date.now() - f.firmadaEn > VIGENCIA_FIRMA_MS) throw new FirmaVencida('Firma vieja');
          await put(f.url_miniatura, img.miniatura);
          await put(f.url_original, img.foto);
        });
        sinConfirmar.current.push(f.id);
        actualizar(local, { estado: 'lista' });
        archivos.current.delete(local);
        procesadas.current.delete(local);
        firmas.current.delete(local);
        return 'ok' as const;
      } catch (e) {
        if (e instanceof FirmaVencida) {
          firmas.current.delete(local);
          return 'refirmar' as const;
        }
        actualizar(local, { estado: 'error', error: 'Se cortó la señal. Se reintenta sola cuando vuelva.' });
        return 'error' as const;
      }
    },
    [actualizar],
  );

  const procesarSubidas = useCallback(async () => {
    if (subiendo.current || !eventId) return;
    subiendo.current = true;
    try {
      while (listasParaSubir.current.length > 0) {
        const tanda = listasParaSubir.current.splice(0, TANDA);
        const sinFirma = tanda.filter((l) => !firmas.current.has(l));
        if (sinFirma.length > 0) {
          try {
            const nuevas = await conReintentos(() => firmar(eventId, sinFirma.map((l) => procesadas.current.get(l)!)));
            sinFirma.forEach((l, i) => firmas.current.set(l, nuevas[i]));
          } catch (e) {
            const definitivo = e instanceof ErrorDefinitivo;
            const mensaje = definitivo ? e.message : 'Sin señal. Se reintenta sola cuando vuelva.';
            sinFirma.forEach((l) => actualizar(l, { estado: 'error', error: mensaje }));
            if (definitivo) sinFirma.forEach((l) => archivos.current.delete(l));
            const conFirma = tanda.filter((l) => firmas.current.has(l));
            if (conFirma.length === 0) continue;
            tanda.splice(0, tanda.length, ...conFirma);
          }
        }

        // Subir de a PARALELAS; las que vencieron vuelven a la cola para firmarse de nuevo.
        let indice = 0;
        const trabajador = async () => {
          while (indice < tanda.length) {
            const local = tanda[indice++];
            const r = await subirUna(local, firmas.current.get(local)!, procesadas.current.get(local)!);
            if (r === 'refirmar') listasParaSubir.current.push(local);
          }
        };
        await Promise.all(Array.from({ length: Math.min(PARALELAS, tanda.length) }, trabajador));
        void confirmar();
      }
    } finally {
      subiendo.current = false;
    }
  }, [eventId, actualizar, subirUna, confirmar]);

  const procesarCompresion = useCallback(async () => {
    if (comprimiendo.current) return;
    comprimiendo.current = true;
    try {
      while (porComprimir.current.length > 0) {
        const local = porComprimir.current.shift()!;
        if (!procesadas.current.has(local)) {
          const archivo = archivos.current.get(local);
          if (!archivo) continue;
          actualizar(local, { estado: 'procesando' });
          try {
            procesadas.current.set(local, await procesarImagen(archivo));
          } catch {
            actualizar(local, {
              estado: 'error',
              error: 'Una foto no se pudo abrir en este celular. Probá elegirla de nuevo o sacarla con la cámara.',
            });
            archivos.current.delete(local);
            continue;
          }
        }
        actualizar(local, { estado: 'esperando' });
        // Apenas hay una lista, arranca la subida mientras se siguen comprimiendo las demás.
        listasParaSubir.current.push(local);
        void procesarSubidas();
      }
    } finally {
      comprimiendo.current = false;
    }
  }, [actualizar, procesarSubidas]);

  const agregar = useCallback(
    (lista: FileList | File[]) => {
      const nuevos: ItemSubida[] = [];
      for (const archivo of Array.from(lista)) {
        // Algunos Android mandan fotos sin tipo; se aceptan y se valida al abrirlas.
        if (archivo.type && !archivo.type.startsWith('image/') && !/\.(heic|heif)$/i.test(archivo.name)) continue;
        const local = crypto.randomUUID();
        archivos.current.set(local, archivo);
        porComprimir.current.push(local);
        nuevos.push({ local, nombre: archivo.name, vista: URL.createObjectURL(archivo), estado: 'esperando' });
      }
      if (nuevos.length === 0) return;
      setItems((prev) => [...nuevos, ...prev]);
      void procesarCompresion();
    },
    [procesarCompresion],
  );

  const reintentar = useCallback(() => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.estado === 'error' && archivos.current.has(i.local)) {
          porComprimir.current.push(i.local);
          return { ...i, estado: 'esperando', error: undefined };
        }
        return i;
      }),
    );
    void procesarCompresion();
    void confirmar();
  }, [procesarCompresion, confirmar]);

  // Cuando vuelve la señal (o el invitado vuelve a la pestaña), se reintenta sola lo que falló por conexión.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'hidden') return;
      reintentar();
    };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    const cada = window.setInterval(() => {
      if (navigator.onLine) reintentar();
    }, 45_000);
    return () => {
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      window.clearInterval(cada);
    };
  }, [reintentar]);

  const limpiarListas = useCallback(() => {
    setItems((prev) => {
      prev.filter((i) => i.estado === 'lista').forEach((i) => URL.revokeObjectURL(i.vista));
      return prev.filter((i) => i.estado !== 'lista');
    });
  }, []);

  return { items, agregar, reintentar, limpiarListas };
}
