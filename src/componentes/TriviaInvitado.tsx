import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import { LETRAS, useCuentaRegresiva, type EstadoTrivia } from '../lib/trivia';
import ResultadosPregunta from './ResultadosPregunta';

type Props = {
  eventId: string;
  estado: EstadoTrivia;
  onRefrescar: () => void;
  onMinimizar: () => void;
};

export default function TriviaInvitado({ eventId, estado, onRefrescar, onMinimizar }: Props) {
  const restante = useCuentaRegresiva(estado);
  const [elegida, setElegida] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const preguntaId = estado.pregunta?.id;

  // Al cambiar de pregunta, se limpia la elección local.
  useEffect(() => {
    setElegida(null);
    setError('');
  }, [preguntaId]);

  const miOpcion = estado.mi_respuesta?.opcion ?? elegida;
  const respondida = miOpcion !== null && miOpcion !== undefined;
  const sinTiempo = restante === 0;
  const puedeResponder = estado.fase === 'pregunta' && !respondida && !sinTiempo && !enviando;

  async function responder(i: number) {
    if (!puedeResponder) return;
    setElegida(i);
    setEnviando(true);
    if ('vibrate' in navigator) navigator.vibrate?.(30);
    const { error } = await supabase.rpc('trivia_responder', { p_event: eventId, p_opcion: i });
    setEnviando(false);
    if (error) {
      setError(error.message.includes('tiempo') ? 'Se terminó el tiempo para esta pregunta.' : 'No se pudo enviar tu respuesta. Probá de nuevo.');
      setElegida(null);
    }
    onRefrescar();
  }

  const { fase, pregunta } = estado;
  const duracion = estado.duracion ?? 20;
  const progreso = restante !== null ? restante / duracion : 0;
  const acerto = fase === 'resultado' && estado.mi_respuesta && estado.mi_respuesta.opcion === estado.correcta;

  return (
    <div className="trivia-capa" role="dialog" aria-modal="true" aria-label="Trivia en vivo">
      <div className="trivia-tarjeta">
        <div className="trivia-cabecera">
          <span className="trivia-marca">♡ Trivia en vivo</span>
          <button type="button" className="boton-texto" onClick={onMinimizar}>
            Ver galería
          </button>
        </div>

        {fase === 'pregunta' && pregunta && (
          <>
            <div className="trivia-progreso">
              <span>
                Pregunta {estado.numero} de {estado.total}
              </span>
              <div
                className={restante !== null && restante <= 5 ? 'reloj-anillo chico urgente' : 'reloj-anillo chico'}
                style={{ '--progreso': progreso } as CSSProperties}
                aria-label={`${restante ?? ''} segundos`}
              >
                <span>{restante ?? ''}</span>
              </div>
            </div>
            <h2 className="trivia-pregunta">{pregunta.texto}</h2>
            <ul className={pregunta.opciones.length > 2 ? 'trivia-opciones cuadricula' : 'trivia-opciones'}>
              {pregunta.opciones.map((op, i) => {
                const clases = [
                  'trivia-opcion',
                  `letra-${i}`,
                  miOpcion === i && 'elegida',
                  respondida && miOpcion !== i && 'apagada',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={i}>
                    <button type="button" className={clases} disabled={!puedeResponder} onClick={() => responder(i)}>
                      <span className="trivia-letra">{LETRAS[i]}</span>
                      <span className="trivia-op-texto">{op}</span>
                      {miOpcion === i && <span className="trivia-check">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="trivia-estado" aria-live="polite">
              {!respondida && !sinTiempo && 'Tocá tu respuesta. ¡Cuanto más rápido, más puntos!'}
              {respondida && '¡Respuesta enviada! Esperá el resultado.'}
              {!respondida && sinTiempo && 'Se terminó el tiempo.'}
            </p>
            {error && <p className="error">{error}</p>}
          </>
        )}

        {fase === 'resultado' && pregunta && (
          <>
            <div className={acerto ? 'trivia-veredicto bien' : estado.mi_respuesta ? 'trivia-veredicto mal' : 'trivia-veredicto nada'}>
              <span className="veredicto-icono" aria-hidden="true">
                {acerto ? '🎉' : estado.mi_respuesta ? '😅' : '⏱'}
              </span>
              <div>
                <strong>{acerto ? '¡Correcto!' : estado.mi_respuesta ? 'Esta vez no' : 'No llegaste a responder'}</strong>
                <span>
                  {acerto
                    ? `Sumaste ${estado.mi_respuesta?.puntos ?? 0} puntos`
                    : estado.yo
                      ? `Vas en el puesto ${estado.yo.posicion} con ${estado.yo.puntos.toLocaleString('es-AR')} puntos`
                      : '¡Vamos con la próxima!'}
                </span>
              </div>
            </div>
            <p className="trivia-pregunta chica">{pregunta.texto}</p>
            <ResultadosPregunta estado={estado} miOpcion={estado.mi_respuesta?.opcion ?? null} maxAciertos={8} />
          </>
        )}

        {(fase === 'ranking' || fase === 'fin') && (
          <div className="trivia-final">
            <p className="veredicto-icono grande" aria-hidden="true">
              {fase === 'fin' ? '🏆' : '📊'}
            </p>
            <h2 className="trivia-pregunta">{fase === 'fin' ? '¡Terminó la trivia!' : 'Así va el ranking'}</h2>
            {estado.yo ? (
              <p className="trivia-mi-puesto">
                Estás en el puesto <strong>{estado.yo.posicion}</strong> con{' '}
                <strong>{estado.yo.puntos.toLocaleString('es-AR')}</strong> puntos
              </p>
            ) : (
              <p className="trivia-mi-puesto">Esta vez no jugaste.</p>
            )}
            <ol className="ranking-panel">
              {(estado.ranking ?? []).map((r, i) => (
                <li key={`${r.nombre}-${i}`} className={i < 3 ? `podio podio-${i + 1}` : ''}>
                  <span className="ranking-pos">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <span className="ranking-nombre">{r.nombre}</span>
                  <span className="ranking-puntos">{r.puntos.toLocaleString('es-AR')}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
