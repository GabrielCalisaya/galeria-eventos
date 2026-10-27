import type { SupabaseClient } from '@supabase/supabase-js';

export type SeleccionCompra = {
  gallery_pack?: string | null;
  invitation_tier?: string | null;
};

export type ProductoCotizado = {
  gallery_pack: 'basico' | 'experiencia' | 'completo' | null;
  invitation_tier: 'standard' | 'premium' | 'deluxe' | null;
  subtotal: number;
  descuento: number;
  total: number;
  moneda: string;
  productos: Array<{ tipo: string; codigo: string; nombre: string; precio: number }>;
};

export async function cotizarCompra(admin: SupabaseClient, seleccion: SeleccionCompra): Promise<ProductoCotizado | string> {
  const packSolicitado = seleccion.gallery_pack || null;
  let nivel = seleccion.invitation_tier || null;
  const packsValidos = new Set(['basico', 'experiencia', 'completo']);
  const nivelesValidos = new Set(['standard', 'premium', 'deluxe']);
  if (packSolicitado && !packsValidos.has(packSolicitado)) return 'Elegí un paquete de galería válido.';
  if (nivel && !nivelesValidos.has(nivel)) return 'Elegí un nivel de invitación válido.';
  if (!packSolicitado && !nivel) return 'Elegí una invitación, una galería o ambas.';

  const [{ data: packs, error: errorPacks }, { data: invitaciones, error: errorInvitaciones }] = await Promise.all([
    admin.from('precios_pack').select('pack,nombre,precio,moneda,activo').eq('activo', true),
    admin.from('precios_invitacion').select('nivel,nombre,precio,moneda,activo').eq('activo', true),
  ]);
  if (errorPacks || errorInvitaciones) return 'No se pudo consultar el catálogo. Intentá de nuevo.';

  const pack = (nombre: string) => packs?.find((p) => p.pack === nombre && p.activo);
  const invitacion = (nombre: string) => invitaciones?.find((p) => p.nivel === nombre && p.activo);
  const moneda = 'ARS';
  const productos: ProductoCotizado['productos'] = [];
  let subtotal = 0;
  let descuento = 0;
  let galleryPack = packSolicitado as ProductoCotizado['gallery_pack'];

  // Experiencia + invitación y Completo comparten el precio de bundle confirmado:
  // Estándar $65.000, Premium $70.000, Deluxe $75.000. Las mejoras se calculan
  // como diferencia entre niveles de invitación sobre el pack Completo.
  if (packSolicitado === 'completo' || (packSolicitado === 'experiencia' && nivel)) {
    const completo = pack('completo');
    const standard = invitacion('standard');
    const elegida = invitacion(nivel || 'standard');
    if (!completo || !standard || !elegida) return 'El paquete Completo o el nivel elegido no está disponible.';
    nivel = nivel || 'standard';
    galleryPack = 'completo';
    const mejora = Math.max(0, Number(elegida.precio) - Number(standard.precio));
    subtotal = Number(completo.precio) + mejora;
    productos.push({ tipo: 'galeria', codigo: 'completo', nombre: 'Completo', precio: Number(completo.precio) });
    productos.push({ tipo: 'invitacion', codigo: nivel, nombre: elegida.nombre, precio: mejora });
  } else {
    if (packSolicitado) {
      const galeria = pack(packSolicitado);
      if (!galeria) return 'Ese paquete de galería no está disponible.';
      productos.push({ tipo: 'galeria', codigo: packSolicitado, nombre: galeria.nombre, precio: Number(galeria.precio) });
      subtotal += Number(galeria.precio);
    }
    if (nivel) {
      const elegida = invitacion(nivel);
      if (!elegida) return 'Ese nivel de invitación no está disponible.';
      productos.push({ tipo: 'invitacion', codigo: nivel, nombre: elegida.nombre, precio: Number(elegida.precio) });
      subtotal += Number(elegida.precio);
    }
    if (packSolicitado === 'basico' && nivel === 'standard') descuento = Math.min(5000, subtotal);
  }

  if (!productos.length || subtotal <= 0) return 'No se pudo calcular el importe de esta selección.';
  return {
    gallery_pack: galleryPack,
    invitation_tier: nivel as ProductoCotizado['invitation_tier'],
    subtotal,
    descuento,
    total: subtotal - descuento,
    moneda,
    productos,
  };
}
