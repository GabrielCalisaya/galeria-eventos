import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSesion } from '../lib/sesion';

export default function EncabezadoPanel() {
  const sesion = useSesion();
  const navegar = useNavigate();

  async function salir() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  return (
    <header className="encabezado">
      <Link to="/panel" className="marca">
        Galería del evento
      </Link>
      <div className="encabezado-derecha">
        <span className="encabezado-email">{sesion?.user.email}</span>
        <button type="button" className="boton-texto" onClick={salir}>
          Salir
        </button>
      </div>
    </header>
  );
}
