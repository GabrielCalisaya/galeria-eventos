/** "2026-12-05" → "5 de diciembre de 2026" (sin corrimientos por zona horaria). */
export function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Identificador largo y no adivinable para el link del QR. */
export function generarSlug(largo = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(largo));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

export function linkInvitados(slug: string): string {
  return `${window.location.origin}/e/${slug}`;
}

export function linkPantalla(token: string): string {
  return `${window.location.origin}/pantalla/${token}`;
}

/** Separa "Sofi y Martín" / "Sofi & Martín" en dos nombres para la portada. */
export function separarNombres(titulo: string): [string, string] | null {
  const m = titulo.match(/^(.+?)\s+(?:y|&|e)\s+(.+)$/i);
  return m ? [m[1].trim(), m[2].trim()] : null;
}
