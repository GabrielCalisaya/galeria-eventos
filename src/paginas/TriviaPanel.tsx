import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { linkPantalla } from '../lib/formato';
import { LETRAS, preguntasSugeridas, useCuentaRegresiva, useTrivia, type PreguntaTrivia } from '../lib/trivia';
import type { Evento } from '../lib/tipos';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import ResultadosPregunta from '../componentes/ResultadosPregunta';
import { Modal, useDialogos } from '../componentes/Dialogos';

type Borrador = { id?: string; texto: string; opciones: string[]; correcta: number };
// correcta = -1 hasta que el anfitrión marque cuál es.
const VACIA: Borrador = { texto: '', opciones: ['', ''], correcta: -1 };

export default function TriviaPanel() {
  const { id } = useParams();
  const { confirmar, avisar } = useDialogos();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [preguntas, setPreguntas] = useState<PreguntaTrivia[] | null>(null);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [verIdeas, setVerIdeas] = useState(false);
  const [borrandoTodas, setBorrandoTodas] = useState(false);

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

  const lista = preguntas ?? [];

  async function guardar(b: Borrador): Promise<string | null> {
    if (!id) return 'Falta el evento';
    const opciones = b.opciones.map((o) => o.trim()).filter(Boolean);
    const correcta = Math.min(Math.max(b.correcta, 0), opciones.length - 1);
    const fila = { texto: b.texto.trim(), opciones, correcta };
    const { error } = b.id
      ? await supabase.from('trivia_preguntas').update(fila).eq('id', b.id)
      : await supabase.from('trivia_preguntas').insert({ ...fila, event_id: id, orden: (lista.at(-1)?.orden ?? 0) + 1 });
    if (error) return 'No se pudo guardar la pregunta. Revisá que tenga al menos 2 opciones.';
    setEditando(null);
    avisar(b.id ? 'Pregunta actualizada' : 'Pregunta agregada');
    await cargar();
    return null;
  }

  async function borrar(p: PreguntaTrivia) {
    const ok = await confirmar({
      titulo: 'Borrar pregunta',
      mensaje: <p>“{p.texto}” se va a quitar de la trivia.</p>,
      aceptar: 'Borrar',
      peligro: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('trivia_preguntas').delete().eq('id', p.id);
    if (error) {
      avisar('No se pudo borrar la pregunta', 'error');
      return;
    }
    setPreguntas((prev) => (prev ?? []).filter((x) => x.id !== p.id));
    avisar('Pregunta borrada');
  }

  async function borrarTodas() {
    if (!id || lista.length === 0) return;
    const ok = await confirmar({
      titulo: 'Borrar todas las preguntas',
      mensaje: (
        <p>
          Se van a borrar las <strong>{lista.length} preguntas</strong> de esta trivia, con sus respuestas. No se puede deshacer.
        </p>
      ),
      aceptar: `Borrar ${lista.length}`,
      peligro: true,
    });
    if (!ok) return;
    setBorrandoTodas(true);
    const { error } = await supabase.from('trivia_preguntas').delete().eq('event_id', id);
    setBorrandoTodas(false);
    if (error) {
      avisar('No se pudieron borrar las preguntas', 'error');
      return;
    }
    setPreguntas([]);
    avisar('Se borraron todas las preguntas');
  }

  async function mover(i: number, dir: -1 | 1) {
    const otra = lista[i + dir];
    const esta = lista[i];
    if (!otra || !esta) return;
    const nuevas = [...lista];
    nuevas[i] = otra;
    nuevas[i + dir] = esta;
    setPreguntas(nuevas);
    await Promise.all(nuevas.map((p, n) => supabase.from('trivia_preguntas').update({ orden: n + 1 }).eq('id', p.id)));
  }

  if (!evento) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="cargando" aria-busy="true" />
      </main>
    );
  }

  const ideasDisponibles = preguntasSugeridas(evento.tipo).filter((s) => !lista.some((p) => p.texto === s.texto));

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna">
        <Link to={`/panel/${evento.id}`} className="volver">
          {evento.titulo}
        </Link>
        <p className="etiqueta">♡ Trivia en vivo</p>
        <h1>Preparar y jugar</h1>
        <p className="intro">
          Los invitados responden desde el celular, en la misma galería. La pregunta, el tiempo y quiénes acertaron se ven
          también en la{' '}
          <a href={linkPantalla(evento.pantalla_token)} target="_blank" rel="noreferrer">
            pantalla del salón
          </a>
          .
        </p>

        <ControlEnVivo eventId={evento.id} cantidad={lista.length} />

        <section className="seccion-preguntas">
          <div className="fila-titulo">
            <div>
              <h2>Preguntas</h2>
              <span className="contador">
                {lista.length} {lista.length === 1 ? 'pregunta' : 'preguntas'} · lo ideal son entre 5 y 10
              </span>
            </div>
            <div className="acciones acciones-compactas">
              {ideasDisponibles.length > 0 && (
                <button type="button" className="boton" onClick={() => setVerIdeas(true)}>
                  ✦ Ideas
                </button>
              )}
              <button type="button" className="boton boton-primario" onClick={() => setEditando({ ...VACIA, opciones: ['', ''] })}>
                Agregar pregunta
              </button>
            </div>
          </div>

          {preguntas === null && <div className="cargando" aria-busy="true" />}

          {preguntas !== null && lista.length === 0 && (
            <div className="vacio tarjeta">
              <p>Todavía no hay preguntas.</p>
              <p>Escribí la tuya o elegí una idea y marcá cuál es la respuesta correcta.</p>
              <div className="acciones centradas">
                <button type="button" className="boton boton-primario" onClick={() => setVerIdeas(true)}>
                  Ver ideas de preguntas
                </button>
              </div>
            </div>
          )}

          <ol className="lista-preguntas">
            {lista.map((p, i) => (
              <li key={p.id} className="tarjeta pregunta-item">
                <span className="pregunta-numero">{i + 1}</span>
                <div className="pregunta-cuerpo">
                  <p className="pregunta-texto">{p.texto}</p>
                  <ul className="pregunta-opciones">
                    {p.opciones.map((o, j) => (
                      <li key={j} className={j === p.correcta ? 'correcta' : ''}>
                        <span className="letra">{j === p.correcta ? '✓' : LETRAS[j]}</span> {o}
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
                    disabled={i === lista.length - 1}
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
            ))}
          </ol>

          {lista.length > 0 && (
            <button type="button" className="boton boton-peligro-borde" disabled={borrandoTodas} onClick={borrarTodas}>
              {borrandoTodas ? 'Borrando…' : `Borrar todas las preguntas (${lista.length})`}
            </button>
          )}
        </section>
      </div>

      {editando && (
        <Modal titulo={editando.id ? 'Editar pregunta' : 'Nueva pregunta'} onCerrar={() => setEditando(null)}>
          <EditorPregunta inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} />
        </Modal>
      )}

      {verIdeas && (
        <Modal titulo="Ideas de preguntas" ancho="grande" onCerrar={() => setVerIdeas(false)}>
          <p className="ayuda">Elegí una, ajustá las opciones si hace falta y marcá la correcta.</p>
          {ideasDisponibles.length === 0 ? (
            <p>Ya usaste todas las ideas. ¡Escribí las tuyas!</p>
          ) : (
            <ul className="ideas-lista">
              {ideasDisponibles.map((s) => (
                <li key={s.texto}>
                  <button
                    type="button"
                    className="idea"
                    onClick={() => {
                      setVerIdeas(false);
                      setEditando({ texto: s.texto, opciones: [...s.opciones], correcta: -1 });
                    }}
                  >
                    <span className="idea-texto">{s.texto}</span>
                    <span className="idea-opciones">{s.opciones.join(' · ')}</span>
                    <span className="idea-usar" aria-hidden="true">
                      Usar →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </main>
  );
}

function EditorPregunta({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: Borrador;
  onGuardar: (b: Borrador) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const llenas = b.opciones.filter((o) => o.trim()).length;
  const correctaValida = b.correcta >= 0 && Boolean(b.opciones[b.correcta]?.trim());
  const valida = Boolean(b.texto.trim()) && llenas >= 2 && correctaValida;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valida || guardando) return;
    setGuardando(true);
    setError('');
    const problema = await onGuardar(b);
    if (problema) {
      setError(problema);
      setGuardando(false);
    }
  }

  return (
    <form className="formulario editor-pregunta" onSubmit={enviar}>
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
        <legend>Opciones</legend>
        <p className="ayuda sin-margen">Tocá la letra de la respuesta correcta: se pone en verde.</p>
        {b.opciones.map((o, i) => (
          <div className={b.correcta === i ? 'opcion-fila es-correcta' : 'opcion-fila'} key={i}>
            <button
              type="button"
              className="opcion-correcta"
              aria-pressed={b.correcta === i}
              aria-label={`Marcar la opción ${LETRAS[i]} como correcta`}
              onClick={() => setB({ ...b, correcta: i })}
            >
              {b.correcta === i ? '✓' : LETRAS[i]}
            </button>
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
                    correcta: b.correcta === i ? -1 : b.correcta > i ? b.correcta - 1 : b.correcta,
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
            + Agregar opción
          </button>
        )}
      </fieldset>
      {!correctaValida && llenas >= 2 && <p className="aviso-falta">Falta marcar cuál es la respuesta correcta.</p>}
      {error && <p className="error">{error}</p>}
      <div className="modal-acciones">
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="boton boton-primario" disabled={!valida || guardando}>
          {guardando ? 'Guardando…' : 'Guardar pregunta'}
        </button>
      </div>
    </form>
  );
}

function ControlEnVivo({ eventId, cantidad }: { eventId: string; cantidad: number }) {
  const { estado, refrescar } = useTrivia(eventId);
  const { confirmar, avisar } = useDialogos();
  const restante = useCuentaRegresiva(estado);
  const [duracion, setDuracion] = useState(20);
  const [enviando, setEnviando] = useState(false);
  const cerradoAuto = useRef<string | null>(null);
  const vioTiempo = useRef<string | null>(null);

  const accion = useCallback(
    async (a: string) => {
      setEnviando(true);
      const { error } = await supabase.rpc('trivia_control', { p_event: eventId, p_accion: a, p_duracion: duracion });
      if (error) avisar(error.message || 'No se pudo completar. Probá de nuevo.', 'error');
      await refrescar();
      setEnviando(false);
    },
    [eventId, duracion, refrescar, avisar],
  );

  // Se cierra sola cuando se termina el tiempo, solo si antes se vio el reloj corriendo para esta pregunta.
  const clave = `${estado?.pregunta?.id}-${estado?.inicio}`;
  useEffect(() => {
    if (estado?.fase !== 'pregunta' || restante === null) return;
    if (restante > 0) vioTiempo.current = clave;
    if (restante === 0 && vioTiempo.current === clave && cerradoAuto.current !== clave) {
      cerradoAuto.current = clave;
      void accion('cerrar');
    }
  }, [estado?.fase, restante, clave, accion]);

  async function terminar() {
    if (estado?.fase !== 'fin') {
      const ok = await confirmar({
        titulo: 'Terminar la trivia',
        mensaje: <p>Los invitados vuelven a la galería. Si la empezás de nuevo, los puntajes arrancan de cero.</p>,
        aceptar: 'Terminar',
      });
      if (!ok) return;
    }
    await accion('terminar');
  }

  const fase = estado?.fase ?? 'espera';
  const ultima = estado?.numero === estado?.total;
  const duracionActual = estado?.duracion ?? duracion;
  const progreso = restante !== null && duracionActual ? restante / duracionActual : 0;

  return (
    <section className={`tarjeta control-vivo fase-${fase}`} aria-live="polite">
      <div className="control-cabecera">
        <div className="control-estado">
          <span className={`punto-estado ${fase}`} aria-hidden="true" />
          <span>
            {fase === 'espera' && 'Lista para empezar'}
            {fase === 'pregunta' && `En juego · pregunta ${estado?.numero} de ${estado?.total}`}
            {fase === 'resultado' && `Resultado · pregunta ${estado?.numero} de ${estado?.total}`}
            {fase === 'ranking' && 'Mostrando el ranking'}
            {fase === 'fin' && 'Trivia terminada'}
          </span>
        </div>
        {fase !== 'espera' && (
          <button type="button" className="boton-texto" disabled={enviando} onClick={terminar}>
            {fase === 'fin' ? 'Volver a la galería' : 'Terminar trivia'}
          </button>
        )}
      </div>

      {fase === 'espera' && (
        <div className="control-inicio">
          <p>
            {cantidad === 0
              ? 'Agregá al menos una pregunta para empezar.'
              : `${cantidad} ${cantidad === 1 ? 'pregunta lista' : 'preguntas listas'}. Cuando arranques, a los invitados se les abre la trivia en el celular.`}
          </p>
          <div className="acciones">
            <label className="campo campo-inline">
              <span>Tiempo por pregunta</span>
              <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                <option value={15}>15 segundos</option>
                <option value={20}>20 segundos</option>
                <option value={30}>30 segundos</option>
              </select>
            </label>
            <button
              type="button"
              className="boton boton-primario boton-grande"
              disabled={enviando || cantidad === 0}
              onClick={() => accion('iniciar')}
            >
              ▶ Empezar trivia
            </button>
          </div>
        </div>
      )}

      {fase === 'pregunta' && estado?.pregunta && (
        <div className="control-pregunta-vivo">
          <div
            className={restante !== null && restante <= 5 ? 'reloj-anillo urgente' : 'reloj-anillo'}
            style={{ '--progreso': progreso } as CSSProperties}
            aria-label={`${restante ?? ''} segundos`}
          >
            <span>{restante ?? ''}</span>
          </div>
          <div>
            <p className="control-pregunta">{estado.pregunta.texto}</p>
            <p className="control-respuestas">
              <strong>{estado.respuestas ?? 0}</strong> {estado.respuestas === 1 ? 'respuesta' : 'respuestas'} hasta ahora
            </p>
          </div>
          <div className="acciones">
            <button type="button" className="boton boton-primario" disabled={enviando} onClick={() => accion('cerrar')}>
              Cerrar y ver resultado
            </button>
          </div>
        </div>
      )}

      {fase === 'resultado' && estado?.pregunta && (
        <>
          <p className="control-pregunta">{estado.pregunta.texto}</p>
          <ResultadosPregunta estado={estado} />
          <div className="acciones">
            <button type="button" className="boton boton-primario boton-grande" disabled={enviando} onClick={() => accion('siguiente')}>
              {ultima ? 'Ver resultado final' : 'Siguiente pregunta →'}
            </button>
            <button type="button" className="boton" disabled={enviando} onClick={() => accion('ranking')}>
              Mostrar ranking
            </button>
          </div>
        </>
      )}

      {(fase === 'ranking' || fase === 'fin') && (
        <>
          <RankingCorto estado={estado} />
          {fase === 'ranking' && (
            <div className="acciones">
              <button type="button" className="boton boton-primario boton-grande" disabled={enviando} onClick={() => accion('siguiente')}>
                {ultima ? 'Ver resultado final' : 'Siguiente pregunta →'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RankingCorto({ estado }: { estado: ReturnType<typeof useTrivia>['estado'] }) {
  const ranking = estado?.ranking ?? [];
  if (ranking.length === 0) return <p className="ayuda">Todavía nadie sumó puntos.</p>;
  return (
    <ol className="ranking-panel">
      {ranking.map((r, i) => (
        <li key={`${r.nombre}-${i}`} className={i < 3 ? `podio podio-${i + 1}` : ''}>
          <span className="ranking-pos">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
          <span className="ranking-nombre">{r.nombre}</span>
          <span className="ranking-puntos">{r.puntos.toLocaleString('es-AR')} pts</span>
        </li>
      ))}
    </ol>
  );
}
