import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSesion } from '../lib/sesion';
import { generarSlug } from '../lib/formato';
import { COLORES, COLOR_POR_DEFECTO } from '../lib/colores';
import { NOMBRES_TIPO, SEGUNDOS_POR_DEFECTO, type MomentoEvento, type TipoEvento } from '../lib/tipos';
import EncabezadoPanel from '../componentes/EncabezadoPanel';

export default function NuevoEvento() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('casamiento');
  const [fecha, setFecha] = useState('');
  const [color, setColor] = useState<string>(COLOR_POR_DEFECTO);
  const [bienvenida, setBienvenida] = useState('');
  const [momento, setMomento] = useState<MomentoEvento>('noche');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!sesion) return;
    setGuardando(true);
    setError('');
    // Reintenta si justo se repite el identificador del link (muy improbable).
    for (let intento = 0; intento < 3; intento++) {
      const { data, error } = await supabase
        .from('events')
        .insert({
          owner_id: sesion.user.id,
          slug: generarSlug(),
          titulo: titulo.trim(),
          tipo,
          fecha: fecha || null,
          estilo: { color, momento, segundos: SEGUNDOS_POR_DEFECTO, bienvenida: bienvenida.trim() || undefined },
        })
        .select('id')
        .single();
      if (!error && data) {
        navegar(`/panel/${data.id}`, { replace: true });
        return;
      }
      if (error?.code !== '23505') break;
    }
    setError('No se pudo crear el evento. Intentá de nuevo en unos segundos.');
    setGuardando(false);
  }

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna angosta">
        <Link to="/panel" className="volver">
          Mis eventos
        </Link>
        <h1>Crear evento</h1>
        <form onSubmit={crear} className="formulario">
          <label className="campo">
            <span>Nombre del evento</span>
            <input
              required
              maxLength={120}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Sofi y Martín"
            />
          </label>
          <p className="ayuda">Es lo que ven los invitados en grande al escanear el QR.</p>

          <div className="campos-dobles">
            <label className="campo">
              <span>Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
                {Object.entries(NOMBRES_TIPO).map(([valor, nombre]) => (
                  <option key={valor} value={valor}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
          </div>

          <fieldset className="campo">
            <legend>¿Es de tarde o de noche?</legend>
            <div className="momentos">
              <label className={momento === 'tarde' ? 'momento elegido' : 'momento'}>
                <input type="radio" name="momento" checked={momento === 'tarde'} onChange={() => setMomento('tarde')} />
                <span className="momento-muestra tarde" aria-hidden="true">☀</span>
                <span>
                  <strong>De tarde</strong>
                  <small>Fondo claro, crema</small>
                </span>
              </label>
              <label className={momento === 'noche' ? 'momento elegido' : 'momento'}>
                <input type="radio" name="momento" checked={momento === 'noche'} onChange={() => setMomento('noche')} />
                <span className="momento-muestra noche" aria-hidden="true">☾</span>
                <span>
                  <strong>De noche</strong>
                  <small>Fondo oscuro, no encandila</small>
                </span>
              </label>
            </div>
            <p className="ayuda">Cambia cómo se ven la galería y la pantalla del salón. Lo podés cambiar después.</p>
          </fieldset>

          <fieldset className="campo">
            <legend>Color de la galería</legend>
            <div className="muestras">
              {COLORES.map((c) => (
                <label key={c.valor} className="muestra" title={c.nombre}>
                  <input
                    type="radio"
                    name="color"
                    value={c.valor}
                    checked={color === c.valor}
                    onChange={() => setColor(c.valor)}
                  />
                  <span style={{ background: c.valor }} aria-hidden="true" />
                  <span className="sr-only">{c.nombre}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="campo">
            <span>Mensaje de bienvenida (opcional)</span>
            <textarea
              rows={2}
              maxLength={160}
              value={bienvenida}
              onChange={(e) => setBienvenida(e.target.value)}
              placeholder="Gracias por acompañarnos. Compartí tus fotos de la noche."
            />
          </label>

          {error && <p className="error" role="alert">{error}</p>}
          <button className="boton boton-primario" disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear evento'}
          </button>
        </form>
      </div>
    </main>
  );
}
