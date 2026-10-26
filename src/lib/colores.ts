/**
 * Acentos que el anfitrión elige para su evento. Todos tienen contraste suficiente
 * para texto blanco encima y para leerse sobre el fondo crema.
 */
export const COLORES = [
  { nombre: 'Rosa antiguo', valor: '#A8584F' },
  { nombre: 'Ciruela', valor: '#492E3B' },
  { nombre: 'Dorado', valor: '#8A6440' },
  { nombre: 'Salvia', valor: '#56704F' },
  { nombre: 'Azul noche', valor: '#34456B' },
  { nombre: 'Terracota', valor: '#A1502F' },
] as const;

export const COLOR_POR_DEFECTO = COLORES[0].valor;

// Colores de la primera versión (pensados para fondo oscuro) → su equivalente actual.
const EQUIVALENTES: Record<string, string> = {
  '#E7B9C6': '#A8584F',
  '#E9CF9E': '#8A6440',
  '#B9D3B6': '#56704F',
  '#A9CBE8': '#34456B',
  '#C9B8F0': '#492E3B',
  '#F2B19B': '#A1502F',
};

export function colorValido(c: string | undefined): string {
  if (!c || !/^#[0-9a-fA-F]{6}$/.test(c)) return COLOR_POR_DEFECTO;
  const mayus = c.toUpperCase();
  if (COLORES.some((x) => x.valor === mayus)) return mayus;
  return EQUIVALENTES[mayus] ?? COLOR_POR_DEFECTO;
}
