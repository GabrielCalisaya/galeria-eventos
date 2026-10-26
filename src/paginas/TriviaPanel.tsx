import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { linkPantalla } from '../lib/formato';
import {
  LETRAS,
  PREGUNTAS_SUGERIDAS,
  useCuentaRegresiva,
  useTrivia,
  type PreguntaTrivia,
} from '../lib/trivia';
import type { Evento } from '../lib/tipos';
import EncabezadoPanel from '../componentes/EncabezadoPanel';

type Borrador = { id?: string; texto: string; opciones: string[]; correcta: number };
const VACIA: Borrador = { texto: '', opciones: ['', ''], correcta: 0 };

export default function TriviaPanel() {
  const { id } = useParams();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [preguntas, setPreguntas] = useState<PreguntaTrivia[]>([]);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('trivia_preguntas')
      .select('*')
      .eq('event_id', id)
      .order('orden')
      .order('created_at');
    setPreguntas((data ?? []) as PreguntaTrivia[]);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    supabase.from('events').select('*').eq('id', id).maybeSingle().then(({ data }) => setEvento(data as Evento | null));
    void cargar();
  }, [id, cargar]);

  async function guardar(b: Borrador) {
    if (!id) return;
    setError('');
    const opciones = b.opciones.map((o) => o.trim()).filter(Boolean);
    const correcta = Math.min(b.correcta, opciones.length - 1);
    const fila = { texto: b.texto.trim(), opciones, correcta };
    const { error } = b.id
      ? await supabase.from('trivia_preguntas').update(fila).eq('id', b.id)
      : await supabase.from('trivia_preguntas').insert({ ...fila, event_id: id, orden: (preguntas.at(-1)?.orden ?? 0) + 1 });
    if (error) {
      setError('No se pudo guardar la pregunta. Revisá que tenga al menos 2 opciones.');
      return;
    }
    setEditando(null);
    await cargar();
  }

  async function borrar(p: PreguntaTrivia) {
    if (!window.confirm(`¿Borrar la pregunta “${p.texto}”?`)) return;
    await supabase.from('trivia_preguntas').delete().eq('id', p.id);
    await cargar();
  }

  async function mover(i: number, dir: -1 | 1) {
    const otra = preguntas[i + dir];
    const esta = preguntas[i];
    if (!otra || !esta) return;
    // Se reasignan órdenes consecutivos para que el intercambio sea estable.
    const nuevas = [...preguntas];
    nuevas[i] = otra;
    nuevas[i + dir] = esta;
    setPreguntas(nuevas);
    await Promise.all(nuevas.map((p, n) => supabase.from('trivia_preguntas').update({ orden: n + 1 }).eq('id', p.id)));
  }

  async function agregarSugeridas() {
    if (!id) return;
    const base = (preguntas.at(-1)?.orden ?? 0) + 1;
    const existentes = new Set(preguntas.map((p) => p.texto));
    const filas = PREGUNTAS_SUGERIDAS.filter((s) => !existentes.has(s.texto)).map((s, i) => ({
      event_id: id,
      orden: base + i,
      texto: s.texto,
      opciones: s.opciones,
      correcta: 0,
    }));
    if (filas.length === 0) return;
    await supabase.from('trivia_preguntas').insert(filas);
    await cargar();
  }

  if (!evento) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="cargando" aria-busy="true" />
      </main>
    );
  }

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna">
        <Link to={`/panel/${evento.id}`} className="volver">
          {evento.titulo}
        </Link>
        <p className="etiqueta">♡ Trivia de la pareja</p>
        <h1>Preparar y jugar</h1>
        <p className="intro">
          Los invitados responden desde el celular, en la misma galería. La pregunta, la cuenta regresiva y el ranking se
          ven en la <a href={linkPantalla(evento.pantalla_token)} target="_blank" rel="noreferrer">pantalla del salón</a>.
        </p>

        <ControlEnVivo eventId={evento.id} cantidad={preguntas.length} />

        <section className="seccion-preguntas">
          <div className="fila-titulo">
            <div>
              <h2>Preguntas</h2>
              <span className="contador">
                {preguntas.length} {preguntas.length === 1 ? 'pregunta' : 'preguntas'} · ideal entre 5 y 10
              </span>
            </div>
            <button type="button" className="boton boton-primario" onClick={() => setEditando({ ...VACIA, opciones: ['', ''] })}>
              Agregar pregunta
            </button>
          </div>

          {preguntas.length === 0 && !editando && (
            <div className="vacio tarjeta">
              <p>Todavía no hay preguntas.</p>
              <p>Empezá con las sugeridas y editalas con los datos reales de la pareja.</p>
              <button type="button" className="boton" onClick={agregarSugeridas}>
                Agregar preguntas sugeridas
              </button>
            </div>
          )}

          {editando && !editando.id && (
            <EditorPregunta inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} error={error} />
          )}

          <ol className="lista-preguntas">
            {preguntas.map((p, i) =>
              editando?.id === p.id ? (
                <li key={p.id}>
                  <EditorPregunta inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} error={error} />
                </li>
              ) : (
                <li key={p.id} className="tarjeta pregunta-item">
                  <span className="pregunta-numero">{i + 1}</span>
                  <div className="pregunta-cuerpo">
                    <p className="pregunta-texto">{p.texto}</p>
                    <ul className="pregunta-opciones">
                      {p.opciones.map((o, j) => (
                        <li key={j} className={j === p.correcta ? 'correcta' : ''}>
                          <span className="letra">{LETRAS[j]}</span> {o}
                          {j === p.correcta && <span className="sr-only"> (correcta)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pregunta-acciones">
                    <button type="button" className="boton-icono" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                      ↑
                    </button>
                    <button
                      type="button"
                      className="boton-icono"
                      onClick={() => mover(i, 1)}
                      disabled={i === preguntas.length - 1}
                      aria-label="Bajar"
                    >
                      ↓
                    </button>
                    <button type="button" className="boton-texto" onClick={() => setEditando({ ...p })}>
                      Editar
                    </button>
                    <button type="button" className="boton-texto peligro" onClick={() => borrar(p)}>
                      Borrar
                    </button>
                  </div>
                </li>
              ),
            )}
          </ol>
          {preguntas.length > 0 && (
            <button type="button" className="boton-texto" onClick={agregarSugeridas}>
              Sumar las preguntas sugeridas que falten
            </button>
          )}
        </section>
      </div>
    </main>
  );
}

function EditorPregunta({
  inicial,
  onGuardar,
  onCancelar,
  error,
}: {
  inicial: Borrador;
  onGuardar: (b: Borrador) => void;
  onCancelar: () => void;
  error: string;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const valida = b.texto.trim() && b.opciones.filter((o) => o.trim()).length >= 2 && b.opciones[b.correcta]?.trim();

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (valida) onGuardar(b);
  }

  return (
    <form className="tarjeta editor-pregunta formulario" onSubmit={enviar}>
      <label className="campo">
        <span>Pregunta</span>
        <input
          autoFocus
          required
          maxLength={200}
          value={b.texto}
          onChange={(e) => setB({ ...b, texto: e.target.value })}
          placeholder="¿Dónde fue la primera cita?"
        />
      </label>
      <fieldset className="campo">
        <legend>Opciones · marcá la correcta</legend>
        {b.opciones.map((o, i) => (
          <div className="opcion-fila" key={i}>
            <label className="opcion-correcta" title="Respuesta correcta">
              <input type="radio" name="correcta" checked={b.correcta === i} onChange={() => setB({ ...b, correcta: i })} />
              <span className="letra">{LETRAS[i]}</span>
            </label>
            <input
              value={o}
              maxLength={60}
              onChange={(e) => setB({ ...b, opciones: b.opciones.map((x, j) => (j === i ? e.target.value : x)) })}
              placeholder={`Opción ${LETRAS[i]}`}
              aria-label={`Opción ${LETRAS[i]}`}
            />
            {b.opciones.length > 2 && (
              <button
                type="button"
                className="boton-icono"
                aria-label={`Quitar opción ${LETRAS[i]}`}
                onClick={() =>
                  setB({
                    ...b,
                    opciones: b.opciones.filter((_, j) => j !== i),
                    correcta: b.correcta === i ? 0 : b.correcta > i ? b.correcta - 1 : b.correcta,
                  })
                }
              >
                ×
              </button>
            )}
          </div>
        ))}
        {b.opciones.length < 4 && (
          <button type="button" className="boton-texto" onClick={() => setB({ ...b, opciones: [...b.opciones, ''] })}>
            Agregar opción
          </button>
        )}
      </fieldset>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="boton boton-primario" disabled={!valida}>
          Guardar pregunta
        </button>
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ControlEnVivo({ eventId, cantidad }: { eventId: string; cantidad: number }) {
  const { estado, refrescar } = useTrivia(eventId);
  const restante = useCuentaRegresiva(estado);
  const [duracion, setDuracion] = useState(20);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const cerradoAuto = useRef<string | null>(null);

  const accion = useCallback(
    async (a: string) => {
      setEnviando(true);
      setError('');
      const { error } = await supabase.rpc('trivia_control', { p_event: eventId, p_accion: a, p_duracion: duracion });
      if (error) setError(error.message || 'No se pudo completar. Probá de nuevo.');
      await refrescar();
      setEnviando(false);
    },
    [eventId, duracion, refrescar],
  );

  // Cuando se termina el tiempo, se cierran las respuestas solas (una vez por pregunta).
  useEffect(() => {
    const clave = `${estado?.pregunta?.id}-${estado?.inicio}`;
    if (estado?.fase === 'pregunta' && restante === 0 && estado.inicio && cerradoAuto.current !== clave) {
      const transcurrido = Date.now() - Date.parse(estado.inicio);
      if (transcurrido > 1000) {
        cerradoAuto.current = clave;
        void accion('cerrar');
      }
    }
  }, [estado, restante, accion]);

  const fase = estado?.fase ?? 'espera';
  const ultima = estado?.numero === estado?.total;

  return (
    <section className="tarjeta control-vivo" aria-live="polite">
      <div className="control-estado">
        <span className={`punto-estado ${fase}`} aria-hidden="true" />
        <span>
          {fase === 'espera' && 'Lista para empezar'}
          {fase === 'pregunta' && `Pregunta ${estado?.numero} de ${estado?.total} · quedan ${restante} s · ${estado?.respuestas ?? 0} respuestas`}
          {fase === 'resultado' && `Pregunta ${estado?.numero} de ${estado?.total} · respuestas cerradas`}
          {fase === 'ranking' && 'Mostrando el ranking'}
          {fase === 'fin' && 'Trivia terminada'}
        </span>
      </div>

      {fase === 'pregunta' && estado?.pregunta && <p className="control-pregunta">{estado.pregunta.texto}</p>}

      <div className="acciones">
        {fase === 'espera' && (
          <>
            <label className="campo campo-inline">
              <span>Tiempo por pregunta</span>
              <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                <option value={15}>15 segundos</option>
                <option value={20}>20 segundos</option>
                <option value={30}>30 segundos</option>
              </select>
            </label>
            <button type="button" className="boton boton-primario" disabled={enviando || cantidad === 0} onClick={() => accion('iniciar')}>
              Empezar trivia
            </button>
          </>
        )}
        {fase === 'pregunta' && (
          <button type="button" className="boton boton-primario" disabled={enviando} onClick={() => accion('cerrar')}>
            Cerrar respuestas
          </button>
        )}
        {fase === 'resultado' && (
          <>
            <button type="button" className="boton boton-primario" disabled={enviando} onClick={() => accion('siguiente')}>
              {ultima ? 'Ver resultado final' : 'Siguiente pregunta'}
            </button>
            <button type="button" className="boton" disabled={enviando} onClick={() => accion('ranking')}>
              Mostrar ranking
            </button>
          </>
        )}
        {fase === 'ranking' && (
          <button type="button" className="boton boton-primario" disabled={enviando} onClick={() => accion('siguiente')}>
            {ultima ? 'Ver resultado final' : 'Siguiente pregunta'}
          </button>
        )}
        {fase !== 'espera' && (
          <button
            type="button"
            className="boton-texto"
            disabled={enviando}
            onClick={() => (fase === 'fin' || window.confirm('¿Terminar la trivia ahora? Los puntajes se borran al empezar de nuevo.')) && accion('terminar')}
          >
            {fase === 'fin' ? 'Volver a la galería' : 'Terminar trivia'}
          </button>
        )}
      </div>
      {cantidad === 0 && fase === 'espera' && <p className="ayuda">Agregá al menos una pregunta para empezar.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
