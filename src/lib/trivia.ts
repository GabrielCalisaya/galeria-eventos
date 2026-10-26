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

export type Sugerida = { texto: string; opciones: string[] };

/** Ideas para la pareja (casamientos y aniversarios). El anfitrión elige la correcta al usarlas. */
const SUGERIDAS_PAREJA: Sugerida[] = [
  { texto: '¿Dónde se conocieron?', opciones: ['En la facultad', 'En el trabajo', 'Por amigos', 'En una app'] },
  { texto: '¿Cómo fue la primera cita?', opciones: ['Un café', 'Una cena', 'El cine', 'Una fiesta'] },
  { texto: '¿Cuánto tardó el primer beso?', opciones: ['Esa misma noche', 'Una semana', 'Un mes', 'Más de un mes'] },
  { texto: '¿Quién dijo "te amo" primero?', opciones: ['Ella', 'Él'] },
  { texto: '¿Dónde fue la propuesta?', opciones: ['En casa', 'En un viaje', 'En un restaurante', 'Con amigos y sorpresa'] },
  { texto: '¿Cuántos años llevan juntos?', opciones: ['Menos de 3', 'De 3 a 5', 'De 6 a 9', '10 o más'] },
  { texto: '¿Cuál fue su primer viaje juntos?', opciones: ['A la playa', 'A la montaña', 'Al exterior', 'Una escapada cerca'] },
  { texto: '¿Qué piden siempre de delivery?', opciones: ['Pizza', 'Sushi', 'Hamburguesas', 'Empanadas'] },
  { texto: '¿Cuál es su plan ideal de domingo?', opciones: ['Mate y sillón', 'Salir a pasear', 'Asado con amigos', 'Dormir hasta tarde'] },
  { texto: '¿Quién cocina en casa?', opciones: ['Ella', 'Él', 'Los dos', 'El delivery'] },
  { texto: '¿Quién tarda más en arreglarse?', opciones: ['Ella', 'Él', 'Empate'] },
  { texto: '¿Quién se duerme primero viendo una película?', opciones: ['Ella', 'Él', 'Los dos a la vez'] },
  { texto: '¿Quién elige la música en el auto?', opciones: ['Ella', 'Él', 'Se pelean por eso'] },
  { texto: '¿Quién pide perdón primero después de una discusión?', opciones: ['Ella', 'Él', 'Ninguno, se ríen y listo'] },
  { texto: '¿Cuántas mascotas tienen?', opciones: ['Ninguna', 'Una', 'Dos', 'Más de dos'] },
  { texto: '¿Qué les gusta hacer juntos?', opciones: ['Viajar', 'Cocinar', 'Ver series', 'Hacer deporte'] },
  { texto: '¿Cuál es el destino soñado de luna de miel?', opciones: ['El Caribe', 'Europa', 'Brasil', 'Recorrer Argentina'] },
  { texto: '¿Qué es lo primero que se notaron el uno del otro?', opciones: ['La sonrisa', 'Los ojos', 'El humor', 'La forma de bailar'] },
];

/** Ideas para cumpleaños de 15 y cumpleaños (sobre quien cumple). */
const SUGERIDAS_CUMPLE: Sugerida[] = [
  { texto: '¿Cuál es su comida favorita?', opciones: ['Pizza', 'Milanesa con papas', 'Sushi', 'Pastas'] },
  { texto: '¿Qué le gusta hacer en su tiempo libre?', opciones: ['Bailar', 'Hacer deporte', 'Dibujar', 'Jugar videojuegos'] },
  { texto: '¿Cuál es su color favorito?', opciones: ['Rosa', 'Negro', 'Azul', 'Lila'] },
  { texto: '¿Qué quiere ser cuando sea grande?', opciones: ['Médica', 'Abogada', 'Artista', 'Todavía no sabe'] },
  { texto: '¿Cuál es su materia favorita?', opciones: ['Arte', 'Educación física', 'Matemática', 'Ninguna'] },
  { texto: '¿Qué música escucha más?', opciones: ['Pop', 'Reggaetón', 'Cuarteto', 'Rock'] },
  { texto: '¿Cuál es su destino soñado?', opciones: ['Disney', 'París', 'El Caribe', 'Japón'] },
  { texto: '¿Tiene mascota?', opciones: ['Un perro', 'Un gato', 'Otra mascota', 'Ninguna, todavía'] },
  { texto: '¿Qué no puede faltar en su mochila?', opciones: ['El celular', 'Los auriculares', 'Un maquillaje', 'Snacks'] },
  { texto: '¿Cuál es su serie o película favorita?', opciones: ['Una de Disney', 'Una de terror', 'Una comedia', 'Un anime'] },
  { texto: '¿A qué hora se levanta los fines de semana?', opciones: ['Antes de las 9', 'A media mañana', 'Al mediodía', 'A la tarde'] },
  { texto: '¿Con quién comparte más secretos?', opciones: ['Con su mamá', 'Con su mejor amiga', 'Con su hermana o hermano', 'Con su diario'] },
];

export function preguntasSugeridas(tipo: string): Sugerida[] {
  return tipo === 'quince' || tipo === 'cumpleanos' ? SUGERIDAS_CUMPLE : SUGERIDAS_PAREJA;
}
