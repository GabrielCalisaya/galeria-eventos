import { useEffect, useState, type CSSProperties } from 'react';
import { PieSitio } from '../componentes/Sitio';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NOMBRES_TIPO, type Evento } from '../lib/tipos';
import { formatearFecha } from '../lib/formato';
import { colorValido } from '../lib/colores';
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
          <div>
            <p className="etiqueta">Panel del anfitrión</p>
            <h1>Mis eventos</h1>
          </div>
          <Link className="boton boton-primario" to="/panel/nuevo">
            Crear evento
          </Link>
        </div>
        <p><Link to="/panel/administracion/transferencias">Administrar transferencias pendientes</Link> · <Link to="/panel/administracion/invitaciones">Administrar invitaciones compradas</Link></p>

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
                <Link to={`/panel/${ev.id}`} className="evento-tarjeta" style={{ '--acento': colorValido(ev.estilo?.color) } as CSSProperties}>
                  <span className="evento-franja" aria-hidden="true">
                    ♡
                  </span>
                  <span className="evento-cuerpo">
                    <span className="etiqueta">{NOMBRES_TIPO[ev.tipo]}</span>
                    <span className="evento-titulo">{ev.titulo}</span>
                    <span className="evento-meta">{ev.fecha ? formatearFecha(ev.fecha) : 'Sin fecha'}</span>
                    {ev.estado === 'borrador' && <span className="insignia-borrador">Falta activar</span>}
                  </span>
                  <span className="evento-flecha" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PieSitio compacto />
    </main>
  );
}
