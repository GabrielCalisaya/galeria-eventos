import type { CSSProperties } from 'react';
import { LETRAS, useCuentaRegresiva, type EstadoTrivia } from '../lib/trivia';
import ResultadosPregunta from './ResultadosPregunta';

export default function TriviaPantalla({ estado, titulo }: { estado: EstadoTrivia; titulo: string }) {
  const restante = useCuentaRegresiva(estado);
  const { fase, pregunta, ranking } = estado;
  const duracion = estado.duracion ?? 20;
  const progreso = restante !== null ? restante / duracion : 0;

  if (fase === 'ranking' || fase === 'fin') {
    return (
      <div className="tv-trivia">
        <p className="etiqueta-clara">✦ Trivia de {titulo} ✦</p>
        <h1 className="tv-titulo">{fase === 'fin' ? '¡Tenemos ganadores!' : 'Así va el ranking'}</h1>
        <ol className="tv-ranking">
          {(ranking ?? []).slice(0, 5).map((r, i) => (
            <li key={`${r.nombre}-${i}`} className={i === 0 ? 'primero' : ''} style={{ animationDelay: `${(4 - i) * 180}ms` }}>
              <span className="tv-ranking-pos">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span className="tv-ranking-nombre">{r.nombre}</span>
              <span className="tv-ranking-puntos">{r.puntos.toLocaleString('es-AR')}</span>
            </li>
          ))}
        </ol>
        {(ranking ?? []).length === 0 && <p className="tv-sub">Todavía nadie sumó puntos.</p>}
      </div>
    );
  }

  if (!pregunta) return null;

  if (fase === 'resultado') {
    return (
      <div className="tv-trivia">
        <div className="tv-cabecera">
          <p className="etiqueta-clara">
            Resultado · pregunta {estado.numero} de {estado.total}
          </p>
        </div>
        <h1 className="tv-pregunta chica">{pregunta.texto}</h1>
        <ResultadosPregunta estado={estado} variante="pantalla" maxAciertos={8} />
      </div>
    );
  }

  return (
    <div className="tv-trivia">
      <div className="tv-cabecera">
        <p className="etiqueta-clara">
          Pregunta {estado.numero} de {estado.total}
        </p>
        <div className="tv-respuestas-vivo">
          <strong>{estado.respuestas ?? 0}</strong> respuestas
        </div>
        <div
          className={restante !== null && restante <= 5 ? 'reloj-anillo tv urgente' : 'reloj-anillo tv'}
          style={{ '--progreso': progreso } as CSSProperties}
          aria-label={`${restante ?? ''} segundos`}
        >
          <span>{restante ?? ''}</span>
        </div>
      </div>
      <h1 className="tv-pregunta">{pregunta.texto}</h1>
      <ul className="tv-opciones">
        {pregunta.opciones.map((op, i) => (
          <li key={i} className={`tv-opcion letra-${i}`}>
            <span className="tv-letra">{LETRAS[i]}</span>
            <span className="tv-texto">{op}</span>
          </li>
        ))}
      </ul>
      <p className="tv-sub">Respondé desde tu celular, en la galería del evento.</p>
    </div>
  );
}
