import { Link } from 'react-router-dom';

/** Logotipo de la galería, en la línea de "Invitaciones Digitales by NewTech". */
export function Marca({ a = '/' }: { a?: string }) {
  return (
    <Link to={a} className="marca" aria-label="Galería en vivo, by NewTech">
      <span className="marca-nombre">Galería</span>
      <span className="marca-cursiva">en vivo</span>
      <span className="marca-by">by NewTech</span>
    </Link>
  );
}
