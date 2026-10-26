import type { Media } from './tipos';

// Fotos ilustrativas con licencia libre de Unsplash (unsplash.com/license). No son de clientes reales.
const FOTOS = [
  ['photo-1519741497674-611481863552', 'Sofía'],
  ['photo-1482575832494-771f74bf6857', 'Martín'],
  ['photo-1524777313293-86d2ab467344', 'Lucía'],
  ['photo-1550155891-1ab2d265d9c3', 'Tomás'],
  ['photo-1508407576665-2d9a5d638a7e', 'Abuela Rosa'],
  ['photo-1568673818056-c70e27d25691', 'Caro'],
  ['photo-1550155864-3033f844da36', 'Nico'],
  ['photo-1494850643436-d92fdab36326', 'Juli'],
  ['photo-1550155888-430386a434b4', 'Pablo'],
] as const;

const url = (id: string, w: number) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const FOTOS_DEMO: Media[] = [...FOTOS, ...FOTOS.slice(0, 3)].map(([id, autor], i) => ({
  id: `demo-${i}`,
  event_id: 'demo',
  guest_id: null,
  user_id: 'demo',
  autor_nombre: autor,
  tipo: 'foto',
  key_original: url(id, 1600),
  key_thumb: url(id, 480),
  ancho: null,
  alto: null,
  bytes: null,
  estado: 'lista',
  oculta: false,
  created_at: new Date(Date.now() - i * 60_000).toISOString(),
}));

export const urlDemo = (key: string) => key;
