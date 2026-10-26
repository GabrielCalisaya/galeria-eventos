import { useState } from 'react';
import { descargarParte, FOTOS_POR_PARTE, listarFotosParaDescargar, type FotoDescarga } from '../lib/descarga';

type Props = { eventId: string; slug: string };

type Estado =
  | { tipo: 'inicial' }
  | { tipo: 'cargando' }
  | { tipo: 'listo'; fotos: FotoDescarga[] }
  | { tipo: 'error'; mensaje: string };

export default function DescargaZip({ eventId, slug }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicial' });
  const [parteActiva, setParteActiva] = useState<number | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [hechas, setHechas] = useState<Set<number>>(new Set());
  const [aviso, setAviso] = useState('');

  async function preparar() {
    setEstado({ tipo: 'cargando' });
    try {
      const fotos = await listarFotosParaDescargar(eventId);
      setEstado({ tipo: 'listo', fotos });
      if (fotos.length > 0 && fotos.length <= FOTOS_POR_PARTE) void bajar(fotos, 0);
    } catch (e) {
      setEstado({ tipo: 'error', mensaje: (e as Error).message });
    }
  }

  async function bajar(fotos: FotoDescarga[], parte: number) {
    const desde = parte * FOTOS_POR_PARTE;
    const tramo = fotos.slice(desde, desde + FOTOS_POR_PARTE);
    const totalPartes = Math.ceil(fotos.length / FOTOS_POR_PARTE);
    const nombre =
      totalPartes === 1 ? `fotos-${slug}.zip` : `fotos-${slug}-parte-${parte + 1}-de-${totalPartes}.zip`;
    setParteActiva(parte);
    setProgreso(0);
    setAviso('');
    try {
      const { fallidas } = await descargarParte(tramo, desde + 1, nombre, setProgreso);
      setHechas((prev) => new Set(prev).add(parte));
      if (fallidas > 0) {
        setAviso(`${fallidas} ${fallidas === 1 ? 'foto no se pudo bajar' : 'fotos no se pudieron bajar'} en esta parte. Volvé a descargarla para reintentar.`);
      }
    } catch {
      setAviso('Se cortó la descarga. Probá de nuevo con esa parte.');
    } finally {
      setParteActiva(null);
    }
  }

  if (estado.tipo === 'inicial' || estado.tipo === 'error') {
    return (
      <div className="descarga">
        <button type="button" className="boton" onClick={preparar}>
          Descargar todas las fotos
        </button>
        {estado.tipo === 'error' && <p className="error" role="alert">{estado.mensaje}</p>}
      </div>
    );
  }

  if (estado.tipo === 'cargando') {
    return (
      <div className="descarga">
        <button type="button" className="boton" disabled>
          Preparando la descarga…
        </button>
      </div>
    );
  }

  const { fotos } = estado;
  if (fotos.length === 0) {
    return (
      <div className="descarga">
        <p className="ayuda">No hay fotos visibles para descargar.</p>
      </div>
    );
  }

  const totalPartes = Math.ceil(fotos.length / FOTOS_POR_PARTE);

  return (
    <div className="descarga">
      {totalPartes > 1 && (
        <p className="ayuda">
          Son {fotos.length} fotos. Para que el navegador no se trabe, se bajan en {totalPartes} archivos .zip de hasta{' '}
          {FOTOS_POR_PARTE} fotos cada uno.
        </p>
      )}
      <ul className="descarga-partes">
        {Array.from({ length: totalPartes }, (_, parte) => {
          const desde = parte * FOTOS_POR_PARTE;
          const cantidad = Math.min(FOTOS_POR_PARTE, fotos.length - desde);
          const activa = parteActiva === parte;
          return (
            <li key={parte}>
              <button
                type="button"
                className={hechas.has(parte) ? 'boton' : 'boton boton-primario'}
                disabled={parteActiva !== null}
                onClick={() => bajar(fotos, parte)}
              >
                {activa
                  ? `Bajando ${progreso} de ${cantidad}…`
                  : totalPartes === 1
                    ? hechas.has(parte)
                      ? 'Descargar de nuevo'
                      : `Descargar ${cantidad} fotos`
                    : `${hechas.has(parte) ? 'Descargada: ' : ''}Parte ${parte + 1} (${cantidad} fotos)`}
              </button>
            </li>
          );
        })}
      </ul>
      {aviso && <p className="error" role="alert">{aviso}</p>}
      <p className="ayuda">Se descargan las fotos visibles; las ocultas no se incluyen.</p>
    </div>
  );
}
