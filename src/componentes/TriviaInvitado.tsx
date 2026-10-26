import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LETRAS, useCuentaRegresiva, type EstadoTrivia } from '../lib/trivia';

type Props = {
  eventId: string;
  estado: EstadoTrivia;
  onRefrescar: () => void;
  onMinimizar: () => void;
};

export default function TriviaInvitado({ eventId, estado, onRefrescar, onMinimizar }: Props) {
  const restante = useCuentaRegresiva(estado);
  const [elegida, setElegida] = useState<number | null>(null);
  const [error, setError] = useState('');
  const preguntaId = estado.pregunta?.id;

  // Al cambiar de pregunta, se limpia la elección local.
  useEffect(() => {
    setElegida(null);
    setError('');
  }, [preguntaId]);

  const miOpcion = estado.mi_respuesta?.opcion ?? elegida;
  const respondida = miOpcion !== null && miOpcion !== undefined;

  async function responder(i: number) {
    if (respondida || estado.fase !== 'pregunta' || restante === 0) return;
    setElegida(i);
    const { error } = await supabase.rpc('trivia_responder', { p_event: eventId, p_opcion: i });
    if (error) {
      setError(error.message.includes('tiempo') ? 'Se terminó el tiempo para esta pregunta.' : 'No se pudo enviar tu respuesta.');
      setElegida(null);
    }
    onRefrescar();
  }

  const { fase, pregunta } = estado;

  return (
    <div className="trivia-capa" role="dialog" aria-modal="true" aria-label="Trivia en vivo">
      <div className="trivia-tarjeta">
        <div className="trivia-cabecera">
          <span className="etiqueta">♡ Trivia en vivo</span>
          <button type="button" className="boton-texto" onClick={onMinimizar}>
            Ver galería
          </button>
        </div>

        {(fase === 'pregunta' || fase === 'resultado') && pregunta && (
          <>
            <div className="trivia-progreso">
              <span>
                Pregunta {estado.numero} de {estado.total}
              </span>
              {fase === 'pregunta' && (
                <span className={restante <= 5 ? 'trivia-reloj urgente' : 'trivia-reloj'} aria-label={`${restante} segundos`}>
                  {restante}
                </span>
              )}
            </div>
            <h2 className="trivia-pregunta">{pregunta.texto}</h2>
            <ul className="trivia-opciones">
              {pregunta.opciones.map((op, i) => {
                const esCorrecta = fase === 'resultado' && estado.correcta === i;
                const esMiaIncorrecta = fase === 'resultado' && miOpcion === i && estado.correcta !== i;
                const clases = [
                  'trivia-opcion',
                  `letra-${i}`,
                  miOpcion === i && 'elegida',
                  esCorrecta && 'correcta',
                  esMiaIncorrecta && 'incorrecta',
                  respondida && miOpcion !== i && 'apagada',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className={clases}
                      disabled={respondida || fase !== 'pregunta' || restante === 0}
                      onClick={() => responder(i)}
                    >
                      <span className="trivia-letra">{LETRAS[i]}</span>
                      <span>{op}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="trivia-estado" aria-live="polite">
              {fase === 'pregunta' && !respondida && restante > 0 && 'Elegí tu respuesta'}
              {fase === 'pregunta' && respondida && 'Respuesta enviada. Mirá la pantalla del salón.'}
              {fase === 'pregunta' && !respondida && restante === 0 && 'Se terminó el tiempo'}
              {fase === 'resultado' &&
                (estado.mi_respuesta
                  ? estado.mi_respuesta.puntos
                    ? `¡Correcto! Sumaste ${estado.mi_respuesta.puntos} puntos`
                    : 'Esta vez no. ¡Vamos con la próxima!'
                  : 'No llegaste a responder esta.')}
            </p>
            {error && <p className="error">{error}</p>}
          </>
        )}

        {(fase === 'ranking' || fase === 'fin') && (
          <div className="trivia-final">
            <h2 className="trivia-pregunta">{fase === 'fin' ? '¡Terminó la trivia!' : 'Así va el ranking'}</h2>
            {estado.yo ? (
              <p className="trivia-mi-puesto">
                Quedaste en el puesto <strong>{estado.yo.posicion}</strong> con{' '}
                <strong>{estado.yo.puntos.toLocaleString('es-AR')}</strong> puntos
              </p>
            ) : (
              <p className="trivia-mi-puesto">Esta vez no jugaste.</p>
            )}
            <ol className="trivia-ranking">
              {(estado.ranking ?? []).map((r, i) => (
                <li key={`${r.nombre}-${i}`}>
                  <span>{i + 1}.</span> <span>{r.nombre}</span> <strong>{r.puntos.toLocaleString('es-AR')}</strong>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
