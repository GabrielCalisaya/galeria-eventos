import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSesion } from '../lib/sesion';
import { Marca } from '../componentes/Marca';

/** Llega desde el email de "Me olvidé la contraseña": Supabase ya abrió la sesión con el link. */
export default function Restablecer() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: clave });
    setEnviando(false);
    if (error) {
      setError('No se pudo guardar la contraseña. Pedí un email nuevo e intentá otra vez.');
      return;
    }
    navegar('/panel', { replace: true });
  }

  return (
    <main className="panel acceso">
      <div className="acceso-marca">
        <Marca />
      </div>
      <div className="tarjeta acceso-tarjeta">
        <h1>Contraseña nueva</h1>
        {sesion === undefined ? (
          <div className="cargando" aria-busy="true" />
        ) : !sesion ? (
          <p>
            El link venció o ya se usó. <Link to="/entrar">Pedí uno nuevo</Link>.
          </p>
        ) : (
          <form className="formulario" onSubmit={guardar}>
            <label className="campo">
              <span>Elegí una contraseña</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="boton boton-primario boton-grande boton-ancho" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
