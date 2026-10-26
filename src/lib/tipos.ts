export type TipoEvento = 'casamiento' | 'quince' | 'cumpleanos' | 'aniversario' | 'corporativo' | 'otro';

export type EstiloEvento = {
  color?: string;
  bienvenida?: string;
};

export type Evento = {
  id: string;
  owner_id: string;
  slug: string;
  titulo: string;
  fecha: string | null;
  tipo: TipoEvento;
  estilo: EstiloEvento;
  pack: 'basico' | 'experiencia' | 'completo';
  estado: 'borrador' | 'activo' | 'finalizado' | 'vencido';
  limite_fotos: number;
  vence_album: string | null;
  pantalla_token: string;
  created_at: string;
};

export type EventoPublico = {
  id: string;
  titulo: string;
  fecha: string | null;
  tipo: TipoEvento;
  estilo: EstiloEvento;
  estado: Evento['estado'];
  invitado_id: string | null;
  invitado_nombre: string | null;
};

export type Media = {
  id: string;
  event_id: string;
  guest_id: string | null;
  user_id: string;
  autor_nombre: string;
  tipo: 'foto' | 'video';
  key_original: string;
  key_thumb: string;
  ancho: number | null;
  alto: number | null;
  bytes: number | null;
  estado: 'pendiente' | 'lista';
  oculta: boolean;
  created_at: string;
};

export const NOMBRES_TIPO: Record<TipoEvento, string> = {
  casamiento: 'Casamiento',
  quince: 'Cumpleaños de 15',
  cumpleanos: 'Cumpleaños',
  aniversario: 'Aniversario',
  corporativo: 'Evento corporativo',
  otro: 'Otro',
};

/** Frase corta sobre los nombres en la portada, según el tipo de evento. */
export const FRASE_TIPO: Record<TipoEvento, string> = {
  casamiento: 'Nuestra boda',
  quince: 'Mis quince',
  cumpleanos: 'Mi cumple',
  aniversario: 'Nuestro aniversario',
  corporativo: 'Nuestro evento',
  otro: 'Celebramos',
};
