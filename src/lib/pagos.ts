import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { invocar, irAMercadoPago } from './funciones';
import type { Evento } from './tipos';

export type PrecioPack = {
  pack: Evento['pack'];
  nombre: string;
  descripcion: string;
  precio: number;
  moneda: string;
  limite_fotos: number;
  meses_album: number;
  orden: number;
};

export function usePrecios() {
  const [precios, setPrecios] = useState<PrecioPack[] | null>(null);
  useEffect(() => {
    supabase
      .from('precios_pack')
      .select('*')
      .order('orden')
      .then(({ data }) => setPrecios(((data ?? []) as PrecioPack[]).map((p) => ({ ...p, precio: Number(p.precio) }))));
  }, []);
  return precios;
}

export function formatearPrecio(monto: number, moneda = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(monto);
}

/** Crea el pago de la mejora de pack y lleva al cliente a Mercado Pago. */
export async function irAPagar(eventId: string, pack: string) {
  const { url } = await invocar<{ url: string }>('crear-pago', { event_id: eventId, pack });
  irAMercadoPago(url);
}

/** Lo que trae cada pack, para mostrar en las tarjetas. */
export const INCLUYE: Record<Evento['pack'], string[]> = {
  basico: ['Galería con QR para los invitados', 'Fotos en tiempo real y moderación', 'Descarga de todas las fotos en .zip'],
  experiencia: ['Todo lo del Básico', 'Pantalla del salón en vivo', 'Trivia con ranking', 'Tarjetas de mesa para imprimir'],
  completo: ['Todo lo de Experiencia', 'Invitación digital Estándar incluida', 'Álbum online por 12 meses'],
};

export function incluyeExtras(pack: Evento['pack']): boolean {
  return pack === 'experiencia' || pack === 'completo';
}
