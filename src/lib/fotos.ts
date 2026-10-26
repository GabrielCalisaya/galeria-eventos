import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Media } from './tipos';

const POR_PAGINA = 120;

/**
 * Fotos listas de un evento, con altas y cambios en tiempo real.
 * `conOcultas` muestra también las ocultas (para la moderación del anfitrión).
 */
export function useFotos(eventId: string | undefined, conOcultas = false) {
  const [fotos, setFotos] = useState<Media[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);

  const visible = useCallback((m: Media) => m.estado === 'lista' && (conOcultas || !m.oculta), [conOcultas]);

  const traer = useCallback(
    async (antesDe?: string) => {
      if (!eventId) return [];
      let q = supabase
        .from('media')
        .select('*')
        .eq('event_id', eventId)
        .eq('estado', 'lista')
        .order('created_at', { ascending: false })
        .limit(POR_PAGINA);
      if (!conOcultas) q = q.eq('oculta', false);
      if (antesDe) q = q.lt('created_at', antesDe);
      const { data, error } = await q;
      if (error) throw error;
      setHayMas((data?.length ?? 0) === POR_PAGINA);
      return (data ?? []) as Media[];
    },
    [eventId, conOcultas],
  );

  useEffect(() => {
    if (!eventId) return;
    let activo = true;
    setCargando(true);
    traer()
      .then((d) => activo && setFotos(d))
      .catch(() => activo && setFotos([]))
      .finally(() => activo && setCargando(false));

    const canal = supabase
      .channel(`media-${eventId}-${conOcultas ? 'mod' : 'pub'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media', filter: `event_id=eq.${eventId}` },
        (cambio) => {
          const nueva = cambio.new as Media | undefined;
          const vieja = cambio.old as Partial<Media> | undefined;
          setFotos((prev) => {
            const id = nueva?.id ?? vieja?.id;
            const sin = prev.filter((f) => f.id !== id);
            if (cambio.eventType === 'DELETE' || !nueva || !visible(nueva)) return sin;
            const existia = prev.some((f) => f.id === nueva.id);
            if (existia) return prev.map((f) => (f.id === nueva.id ? nueva : f));
            // Una foto que vuelve a mostrarse se ubica en su lugar por fecha.
            return [...sin, nueva].sort((a, b) => b.created_at.localeCompare(a.created_at));
          });
        },
      )
      // Fotos ocultadas o borradas: el aviso llega aunque ya no se tenga permiso para ver la foto.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'media_bajas', filter: `event_id=eq.${eventId}` },
        (cambio) => {
          const baja = cambio.new as { media_id?: string; motivo?: string } | undefined;
          if (!baja?.media_id) return;
          // En la moderación las ocultas se siguen mostrando (en gris).
          if (conOcultas && baja.motivo === 'oculta') return;
          setFotos((prev) => prev.filter((f) => f.id !== baja.media_id));
        },
      )
      .subscribe();

    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, [eventId, conOcultas, traer, visible]);

  const verMas = useCallback(async () => {
    const ultima = fotos.at(-1);
    if (!ultima) return;
    const mas = await traer(ultima.created_at);
    setFotos((prev) => [...prev, ...mas.filter((m) => !prev.some((p) => p.id === m.id))]);
  }, [fotos, traer]);

  const reemplazar = useCallback((m: Media) => {
    setFotos((prev) => prev.map((f) => (f.id === m.id ? m : f)));
  }, []);

  return { fotos, cargando, hayMas, verMas, reemplazar };
}
