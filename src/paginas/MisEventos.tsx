import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NOMBRES_TIPO, type Evento } from '../lib/tipos';
import { formatearFecha } from '../lib/formato';
import EncabezadoPanel from '../componentes/EncabezadoPanel';

export default function MisEventos() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .order('fecha', { ascending: false, nullsFirst: true })
      .then(({ data, error }) => {
        if (error) setError(true);
        setEventos((data ?? []) as Evento[]);
      });
  }, []);

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna">
        <div className="fila-titulo">
          <h1>Mis eventos</h1>
          <Link className="boton boton-primario" to="/panel/nuevo">
            Crear evento
          </Link>
        </div>

        {error && <p className="error" role="alert">No se pudieron cargar tus eventos. Recargá la página.</p>}
        {eventos === null && <div className="cargando" aria-busy="true" />}
        {eventos?.length === 0 && !error && (
          <div className="vacio">
            <p>Todavía no creaste ningún evento.</p>
            <p>Creá el primero: en un minuto tenés el QR listo para probar con tu celular.</p>
          </div>
        )}

        {eventos && eventos.length > 0 && (
          <ul className="lista-eventos">
            {eventos.map((ev) => (
              <li key={ev.id}>
                <Link to={`/panel/${ev.id}`} className="evento-fila">
                  <span className="evento-titulo">{ev.titulo}</span>
                  <span className="evento-meta">
                    {NOMBRES_TIPO[ev.tipo]}
                    {ev.fecha ? `, ${formatearFecha(ev.fecha)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
