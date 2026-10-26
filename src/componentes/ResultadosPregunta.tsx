import { LETRAS, type EstadoTrivia } from '../lib/trivia';

/** Porcentaje por opción y lista de quiénes acertaron, una vez cerrada la pregunta. */
export default function ResultadosPregunta({
  estado,
  miOpcion,
  variante = 'claro',
  maxAciertos = 10,
}: {
  estado: EstadoTrivia;
  miOpcion?: number | null;
  variante?: 'claro' | 'pantalla';
  maxAciertos?: number;
}) {
  const opciones = estado.pregunta?.opciones ?? [];
  const conteos = estado.conteos ?? [];
  const total = conteos.reduce((a, b) => a + b, 0);
  const aciertos = estado.aciertos ?? [];
  const porcentajeAcierto = total ? Math.round((aciertos.length / total) * 100) : 0;

  return (
    <div className={`resultados resultados-${variante}`}>
      <ul className="resultados-barras">
        {opciones.map((op, i) => {
          const votos = conteos[i] ?? 0;
          const pct = total ? Math.round((votos / total) * 100) : 0;
          const correcta = estado.correcta === i;
          const clases = ['resultado-fila', `letra-${i}`, correcta && 'correcta', miOpcion === i && !correcta && 'mia-incorrecta']
            .filter(Boolean)
            .join(' ');
          return (
            <li key={i} className={clases}>
              <span className="resultado-relleno" style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="resultado-letra">{correcta ? '✓' : LETRAS[i]}</span>
              <span className="resultado-texto">
                {op}
                {miOpcion === i && <small> · tu respuesta</small>}
              </span>
              <span className="resultado-pct">
                {pct}% <small>({votos})</small>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="resultados-aciertos">
        <p className="resultados-resumen">
          {total === 0
            ? 'Nadie respondió esta pregunta.'
            : aciertos.length === 0
              ? `Nadie acertó · ${total} ${total === 1 ? 'respuesta' : 'respuestas'}`
              : `Acertó el ${porcentajeAcierto}% · ${aciertos.length} de ${total}`}
        </p>
        {aciertos.length > 0 && (
          <ol className="aciertos-lista">
            {aciertos.slice(0, maxAciertos).map((a, i) => (
              <li key={`${a.nombre}-${i}`} className={i === 0 ? 'mas-rapido' : ''}>
                <span className="acierto-pos">{i === 0 ? '⚡' : i + 1}</span>
                <span className="acierto-nombre">{a.nombre}</span>
                <span className="acierto-tiempo">{(a.ms / 1000).toFixed(1)} s</span>
              </li>
            ))}
          </ol>
        )}
        {aciertos.length > maxAciertos && <p className="aciertos-mas">y {aciertos.length - maxAciertos} más</p>}
      </div>
    </div>
  );
}
