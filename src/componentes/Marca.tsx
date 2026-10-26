import { Link } from 'react-router-dom';

export const LOGO_NEWTECH = 'https://newtech.net.ar/img/newtech-logo.png';

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

/** Firma discreta al pie. */
export function PieNewTech({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <footer className={oscuro ? 'pie pie-oscuro' : 'pie'}>
      <a href="https://newtech.net.ar" target="_blank" rel="noreferrer">
        <span>Galería en vivo · by</span>
        <img src={LOGO_NEWTECH} alt="NewTech" width="72" height="28" loading="lazy" />
      </a>
    </footer>
  );
}
