import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { COLORES, colorValido } from '../lib/colores';
import {
  momentoDe,
  segundosDe,
  SEGUNDOS_PANTALLA,
  type Evento,
  type EstiloEvento,
  type MomentoEvento,
} from '../lib/tipos';

type Props = { evento: Evento; onGuardado: (ev: Evento) => void };

/** Cómo se ven la galería y la pantalla del salón: momento del día, color, velocidad y bienvenida. */
export default function AjustesEvento({ evento, onGuardado }: Props) {
  const [momento, setMomento] = useState<MomentoEvento>(momentoDe(evento.estilo));
  const [color, setColor] = useState(colorValido(evento.estilo?.color));
  const [segundos, setSegundos] = useState(segundosDe(evento.estilo));
  const [bienvenida, setBienvenida] = useState(evento.estilo?.bienvenida ?? '');
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | 'error'>('');

  const cambio =
    momento !== momentoDe(evento.estilo) ||
    color !== colorValido(evento.estilo?.color) ||
    segundos !== segundosDe(evento.estilo) ||
    bienvenida.trim() !== (evento.estilo?.bienvenida ?? '');

  async function guardar() {
    setEstado('guardando');
    const estilo: EstiloEvento = {
      ...evento.estilo,
      momento,
      color,
      segundos,
      bienvenida: bienvenida.trim() || undefined,
    };
    const { data, error } = await supabase.from('events').update({ estilo }).eq('id', evento.id).select('*').single();
    if (error || !data) {
      setEstado('error');
      return;
    }
    onGuardado(data as Evento);
    setEstado('guardado');
    setTimeout(() => setEstado(''), 2500);
  }

  return (
    <section className="tarjeta ajustes">
      <h2>Cómo se ve la galería</h2>
      <p className="ayuda">Se aplica a la galería de los invitados y a la pantalla del salón en menos de un minuto, sin que tengan que recargar.</p>

      <fieldset className="campo">
        <legend>Momento del evento</legend>
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
      </fieldset>

      <fieldset className="campo">
        <legend>Color</legend>
        <div className="muestras">
          {COLORES.map((c) => (
            <label key={c.valor} className="muestra" title={c.nombre}>
              <input type="radio" name="color-ajuste" checked={color === c.valor} onChange={() => setColor(c.valor)} />
              <span style={{ background: c.valor }} aria-hidden="true" />
              <span className="sr-only">{c.nombre}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campos-dobles">
        <label className="campo">
          <span>Tiempo de cada foto en la pantalla</span>
          <select value={segundos} onChange={(e) => setSegundos(Number(e.target.value))}>
            {SEGUNDOS_PANTALLA.map((s) => (
              <option key={s} value={s}>
                {s} segundos{s === 3 ? ' (recomendado)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Mensaje de bienvenida</span>
          <input
            maxLength={160}
            value={bienvenida}
            onChange={(e) => setBienvenida(e.target.value)}
            placeholder="Gracias por acompañarnos"
          />
        </label>
      </div>

      <div className="acciones">
        <button type="button" className="boton boton-primario" disabled={!cambio || estado === 'guardando'} onClick={guardar}>
          {estado === 'guardando' ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {estado === 'guardado' && <span className="aviso-ok">Cambios guardados</span>}
        {estado === 'error' && <span className="error">No se pudieron guardar. Probá de nuevo.</span>}
      </div>
    </section>
  );
}
