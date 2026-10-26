import type { ItemSubida } from '../lib/subida';

type Props = {
  items: ItemSubida[];
  onReintentar: () => void;
  onCerrar: () => void;
};

export default function ProgresoSubida({ items, onReintentar, onCerrar }: Props) {
  const listas = items.filter((i) => i.estado === 'lista').length;
  const errores = items.filter((i) => i.estado === 'error');
  const enCurso = items.length - listas - errores.length;

  let resumen: string;
  if (enCurso > 0) resumen = `Subiendo fotos: ${listas} de ${items.length}`;
  else if (errores.length > 0) resumen = `${errores.length} ${errores.length === 1 ? 'foto no se subió' : 'fotos no se subieron'}`;
  else resumen = listas === 1 ? 'Foto subida' : `${listas} fotos subidas`;

  return (
    <section className="progreso" aria-live="polite">
      <div className="progreso-cabecera">
        <span>{resumen}</span>
        {enCurso === 0 && errores.length > 0 && (
          <button type="button" className="boton-texto-noche" onClick={onReintentar}>
            Reintentar
          </button>
        )}
        {enCurso === 0 && errores.length === 0 && (
          <button type="button" className="boton-texto-noche" onClick={onCerrar}>
            Listo
          </button>
        )}
      </div>
      {enCurso > 0 && (
        <div className="progreso-barra" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={listas}>
          <span style={{ width: `${(listas / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="progreso-tira">
        {items.slice(0, 30).map((i) => (
          <li key={i.local} className={`progreso-item ${i.estado}`} title={i.error ?? i.nombre}>
            <img src={i.vista} alt="" />
          </li>
        ))}
      </ul>
      {errores[0]?.error && enCurso === 0 && <p className="error-noche">{errores[0].error}</p>}
    </section>
  );
}
