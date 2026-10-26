import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSesion } from '../lib/sesion';
import { Marca } from './Marca';

export default function EncabezadoPanel() {
  const sesion = useSesion();
  const navegar = useNavigate();

  async function salir() {
    await supabase.auth.signOut();
    navegar('/', { replace: true });
  }

  return (
    <header className="encabezado">
      <Marca a="/panel" />
      <div className="encabezado-derecha">
        <span className="encabezado-email">{sesion?.user.email}</span>
        <button type="button" className="boton-texto" onClick={salir}>
          Salir
        </button>
      </div>
    </header>
  );
}
