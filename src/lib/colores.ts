/** Acentos que el anfitrión puede elegir; todos contrastan bien sobre el fondo de noche. */
export const COLORES = [
  { nombre: 'Rosa empolvado', valor: '#E7B9C6' },
  { nombre: 'Champaña', valor: '#E9CF9E' },
  { nombre: 'Salvia', valor: '#B9D3B6' },
  { nombre: 'Celeste', valor: '#A9CBE8' },
  { nombre: 'Lavanda', valor: '#C9B8F0' },
  { nombre: 'Coral', valor: '#F2B19B' },
] as const;

export const COLOR_POR_DEFECTO = COLORES[0].valor;

export function colorValido(c: string | undefined): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : COLOR_POR_DEFECTO;
}
