import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { esAnonima, useSesion } from '../lib/sesion';
import { Marca, PieNewTech } from '../componentes/Marca';

type Modo = 'crear' | 'entrar' | 'link' | 'olvide';

const TITULOS: Record<Modo, string> = {
  crear: 'Creá tu cuenta',
  entrar: 'Entrar',
  link: 'Entrar con un link',
  olvide: 'Recuperar contraseña',
};

function mensajeDeError(msg: string, status?: number): string {
  const m = msg.toLowerCase();
  if (status === 429 || m.includes('rate')) return 'Hiciste varios intentos seguidos. Esperá un minuto y volvé a probar.';
  if (m.includes('invalid login')) return 'El email o la contraseña no coinciden.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Ya hay una cuenta con ese email. Entrá con tu contraseña.';
  if (m.includes('password') && (m.includes('6') || m.includes('short'))) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (m.includes('email not confirmed')) return 'Falta confirmar tu email: revisá tu bandeja de entrada.';
  return 'No se pudo completar. Revisá los datos y volvé a intentar.';
}

export default function Entrar() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [modo, setModo] = useState<Modo>(params.get('modo') === 'entrar' ? 'entrar' : 'crear');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (sesion && !esAnonima(sesion)) navegar('/panel', { replace: true });
  }, [sesion, navegar]);

  function cambiar(m: Modo) {
    setModo(m);
    setError('');
    setAviso('');
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    setAviso('');
    // Si en este navegador había una sesión anónima de invitado, se reemplaza.
    if (esAnonima(sesion)) await supabase.auth.signOut();
    const correo = email.trim();

    if (modo === 'crear') {
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: clave,
        options: { data: { nombre: nombre.trim() }, emailRedirectTo: `${window.location.origin}/panel` },
      });
      setEnviando(false);
      if (error) return setError(mensajeDeError(error.message, error.status));
      if (data.session) return navegar('/panel', { replace: true });
      // Si el proyecto pide confirmar el email, la cuenta queda creada pero sin sesión.
      return setAviso(`Te mandamos un email a ${correo} para confirmar la cuenta. Abrilo y ya entrás.`);
    }

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
      setEnviando(false);
      if (error) return setError(mensajeDeError(error.message, error.status));
      return navegar('/panel', { replace: true });
    }

    if (modo === 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        email: correo,
        options: { emailRedirectTo: `${window.location.origin}/panel` },
      });
      setEnviando(false);
      if (error) return setError(mensajeDeError(error.message, error.status));
      return setAviso(`Te mandamos un link a ${correo}. Abrilo desde este mismo dispositivo.`);
    }

    const { error } = await supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setEnviando(false);
    if (error) return setError(mensajeDeError(error.message, error.status));
    setAviso(`Si hay una cuenta con ${correo}, te llega un email para elegir una contraseña nueva.`);
  }

  const conClave = modo === 'crear' || modo === 'entrar';

  return (
    <main className="panel acceso">
      <div className="acceso-marca">
        <Marca />
      </div>
      <div className="tarjeta acceso-tarjeta">
        {(modo === 'crear' || modo === 'entrar') && (
          <div className="pestanas" role="tablist">
            <button type="button" role="tab" aria-selected={modo === 'crear'} onClick={() => cambiar('crear')}>
              Crear cuenta
            </button>
            <button type="button" role="tab" aria-selected={modo === 'entrar'} onClick={() => cambiar('entrar')}>
              Ya tengo cuenta
            </button>
          </div>
        )}

        <h1>{TITULOS[modo]}</h1>
        {modo === 'crear' && <p className="ayuda">En un minuto creás tu evento y tenés el QR listo.</p>}

        {aviso ? (
          <div className="aviso-enviado" role="status">
            <span aria-hidden="true">✉</span>
            <p>{aviso}</p>
            <button type="button" className="boton-texto" onClick={() => cambiar('entrar')}>
              Volver a entrar
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="formulario">
            {modo === 'crear' && (
              <label className="campo">
                <span>Tu nombre</span>
                <input required autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
              </label>
            )}
            <label className="campo">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
              />
            </label>
            {conClave && (
              <label className="campo">
                <span>Contraseña</span>
                <div className="campo-clave">
                  <input
                    type={verClave ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    placeholder={modo === 'crear' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                  />
                  <button type="button" className="boton-texto" onClick={() => setVerClave((v) => !v)}>
                    {verClave ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </label>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="boton boton-primario boton-grande boton-ancho" disabled={enviando}>
              {enviando
                ? 'Un momento…'
                : modo === 'crear'
                  ? 'Crear cuenta y entrar'
                  : modo === 'entrar'
                    ? 'Entrar'
                    : modo === 'link'
                      ? 'Enviarme el link'
                      : 'Enviarme el email'}
            </button>
          </form>
        )}

        <div className="acceso-alternativas">
          {modo === 'entrar' && (
            <button type="button" className="boton-texto" onClick={() => cambiar('olvide')}>
              Me olvidé la contraseña
            </button>
          )}
          {conClave ? (
            <button type="button" className="boton-texto" onClick={() => cambiar('link')}>
              Prefiero entrar con un link por email
            </button>
          ) : (
            <button type="button" className="boton-texto" onClick={() => cambiar('entrar')}>
              Volver a entrar con contraseña
            </button>
          )}
        </div>
      </div>
      <PieNewTech />
    </main>
  );
}
