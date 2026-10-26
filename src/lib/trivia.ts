import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type FaseTrivia = 'espera' | 'pregunta' | 'resultado' | 'ranking' | 'fin';

export type EstadoTrivia = {
  fase: FaseTrivia;
  numero?: number;
  total?: number;
  duracion?: number;
  inicio?: string | null;
  ahora: string;
  pregunta?: { id: string; texto: string; opciones: string[] } | null;
  correcta?: number | null;
  conteos?: number[] | null;
  respuestas?: number;
  ranking?: { nombre: string; puntos: number }[] | null;
  mi_respuesta?: { opcion: number; puntos: number | null } | null;
  yo?: { puntos: number; posicion: number } | null;
};

export type PreguntaTrivia = {
  id: string;
  event_id: string;
  orden: number;
  texto: string;
  opciones: string[];
  correcta: number;
};

export const LETRAS = ['A', 'B', 'C', 'D'];

/** Segundos que quedan de la pregunta, corrigiendo la diferencia de reloj con el servidor. */
export function useCuentaRegresiva(estado: EstadoTrivia | null): number {
  const desfase = useRef(0);
  const [restante, setRestante] = useState(0);

  useEffect(() => {
    if (estado?.ahora) desfase.current = Date.parse(estado.ahora) - Date.now();
  }, [estado?.ahora]);

  useEffect(() => {
    if (!estado || estado.fase !== 'pregunta' || !estado.inicio || !estado.duracion) {
      setRestante(0);
      return;
    }
    const fin = Date.parse(estado.inicio) + estado.duracion * 1000;
    const calcular = () => setRestante(Math.max(0, Math.ceil((fin - (Date.now() + desfase.current)) / 1000)));
    calcular();
    const t = setInterval(calcular, 250);
    return () => clearInterval(t);
  }, [estado?.fase, estado?.inicio, estado?.duracion, estado]);

  return restante;
}

/**
 * Estado de la trivia para quien está en el evento (invitado o anfitrión).
 * Escucha los cambios en tiempo real y, por las dudas, vuelve a consultar cada pocos segundos.
 */
export function useTrivia(eventId: string | undefined) {
  const [estado, setEstado] = useState<EstadoTrivia | null>(null);

  const refrescar = useCallback(async () => {
    if (!eventId) return;
    const { data, error } = await supabase.rpc('trivia_actual', { p_event: eventId });
    if (!error && data) setEstado(data as EstadoTrivia);
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    void refrescar();
    const canal = supabase
      .channel(`trivia-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trivia_estado', filter: `event_id=eq.${eventId}` },
        () => void refrescar(),
      )
      .subscribe();
    const respaldo = setInterval(() => void refrescar(), 6000);
    return () => {
      clearInterval(respaldo);
      void supabase.removeChannel(canal);
    };
  }, [eventId, refrescar]);

  return { estado, refrescar };
}

/** Estado de la trivia para la pantalla del salón (consulta por su link secreto). */
export function useTriviaPantalla(token: string | undefined) {
  const [estado, setEstado] = useState<EstadoTrivia | null>(null);
  useEffect(() => {
    if (!token) return;
    let activo = true;
    const consultar = async () => {
      const { data, error } = await supabase.rpc('trivia_pantalla', { p_token: token });
      if (activo && !error) setEstado((data as EstadoTrivia | null) ?? null);
    };
    void consultar();
    const t = setInterval(consultar, 1500);
    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [token]);
  return estado;
}

export const PREGUNTAS_SUGERIDAS: { texto: string; opciones: string[] }[] = [
  { texto: '¿Quién dijo "te amo" primero?', opciones: ['Ella', 'Él'] },
  { texto: '¿Quién tarda más en arreglarse?', opciones: ['Ella', 'Él'] },
  { texto: '¿Quién cocina en casa?', opciones: ['Ella', 'Él', 'Los dos', 'Delivery'] },
  { texto: '¿Quién se duerme primero viendo una película?', opciones: ['Ella', 'Él'] },
  { texto: '¿Dónde se conocieron?', opciones: ['En la facultad', 'En el trabajo', 'Por amigos', 'En una app'] },
  { texto: '¿Cuántos años llevan juntos?', opciones: ['Menos de 3', 'De 3 a 5', 'De 6 a 9', '10 o más'] },
  { texto: '¿Quién pidió casamiento?', opciones: ['Ella', 'Él'] },
  { texto: '¿Quién es más ordenado?', opciones: ['Ella', 'Él'] },
];
