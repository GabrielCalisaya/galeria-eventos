import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { esAnonima, useSesion } from '../lib/sesion';

export default function Entrar() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'inicial' | 'enviando' | 'enviado' | 'error'>('inicial');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sesion && !esAnonima(sesion)) navegar('/panel', { replace: true });
  }, [sesion, navegar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEstado('enviando');
    // Si en este navegador había una sesión anónima de invitado, se reemplaza.
    if (esAnonima(sesion)) await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/panel` },
    });
    if (error) {
      setError(
        error.status === 429
          ? 'Pediste varios links seguidos. Esperá un minuto y volvé a intentar.'
          : 'No se pudo enviar el link. Revisá el email e intentá de nuevo.',
      );
      setEstado('error');
      return;
    }
    setEstado('enviado');
  }

  return (
    <main className="panel">
      <div className="panel-columna angosta">
        <h1>Entrar</h1>
        {estado === 'enviado' ? (
          <p>
            Te mandamos un link a <strong>{email}</strong>. Abrilo desde este mismo dispositivo para entrar a tu
            panel.
          </p>
        ) : (
          <form onSubmit={enviar} className="formulario">
            <label className="campo">
              <span>Tu email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
              />
            </label>
            <p className="ayuda">Te enviamos un link para entrar, sin contraseña.</p>
            {estado === 'error' && <p className="error" role="alert">{error}</p>}
            <button className="boton boton-primario" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar link'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
