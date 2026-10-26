import { LETRAS, useCuentaRegresiva, type EstadoTrivia } from '../lib/trivia';

export default function TriviaPantalla({ estado, titulo }: { estado: EstadoTrivia; titulo: string }) {
  const restante = useCuentaRegresiva(estado);
  const { fase, pregunta, conteos, correcta, ranking } = estado;
  const totalVotos = (conteos ?? []).reduce((a, b) => a + b, 0);

  if (fase === 'ranking' || fase === 'fin') {
    return (
      <div className="tv-trivia">
        <p className="etiqueta-clara">✦ Trivia de {titulo} ✦</p>
        <h1 className="tv-titulo">{fase === 'fin' ? 'Así terminó la trivia' : 'Así va el ranking'}</h1>
        <ol className="tv-ranking">
          {(ranking ?? []).map((r, i) => (
            <li key={`${r.nombre}-${i}`} className={i === 0 ? 'primero' : ''}>
              <span className="tv-ranking-pos">{i + 1}</span>
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

  return (
    <div className="tv-trivia">
      <div className="tv-cabecera">
        <p className="etiqueta-clara">
          Pregunta {estado.numero} de {estado.total}
        </p>
        {fase === 'pregunta' ? (
          <span className={restante <= 5 ? 'tv-reloj urgente' : 'tv-reloj'} aria-label={`${restante} segundos`}>
            {restante}
          </span>
        ) : (
          <span className="tv-respondieron">{estado.respuestas ?? 0} respuestas</span>
        )}
      </div>
      <h1 className="tv-pregunta">{pregunta.texto}</h1>
      <ul className="tv-opciones">
        {pregunta.opciones.map((op, i) => {
          const votos = conteos?.[i] ?? 0;
          const porcentaje = totalVotos ? Math.round((votos / totalVotos) * 100) : 0;
          const clase = fase === 'resultado' ? (i === correcta ? 'correcta' : 'incorrecta') : '';
          return (
            <li key={i} className={`tv-opcion letra-${i} ${clase}`}>
              {fase === 'resultado' && <span className="tv-barra" style={{ width: `${porcentaje}%` }} aria-hidden="true" />}
              <span className="tv-letra">{LETRAS[i]}</span>
              <span className="tv-texto">{op}</span>
              {fase === 'resultado' && <span className="tv-porcentaje">{porcentaje}%</span>}
            </li>
          );
        })}
      </ul>
      {fase === 'pregunta' && <p className="tv-sub">Respondé desde tu celular, en la galería del evento.</p>}
    </div>
  );
}
