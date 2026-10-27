import { useEffect, useState, type CSSProperties } from 'react';
import { PieSitio } from '../componentes/Sitio';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NOMBRES_TIPO, type Evento } from '../lib/tipos';
import { formatearFecha } from '../lib/formato';
import { colorValido } from '../lib/colores';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { invocar } from '../lib/funciones';

type Pedido = { id: string; titulo_evento: string; estado: string; total: number; moneda: string; event_id: string | null; invitation_tier: string | null; created_at: string };

const ESTADO_PEDIDO: Record<string, string> = {
  pendiente_pago: 'Pendiente de pago', transferencia_pendiente: 'Transferencia a confirmar', pagada: 'Pago confirmado',
  preparando: 'Invitación en preparación', entregada: 'Entregada', cancelada: 'Pago no completado', reembolsada: 'Reembolsada',
};
const dinero = (n: number, moneda: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(n));

export default function MisEventos() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [error, setError] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    supabase
      .from('compras')
      .select('id,titulo_evento,estado,total,moneda,event_id,invitation_tier,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setPedidos((data ?? []) as Pedido[]));
    // El acceso a la administración se muestra solo si el servidor confirma que la cuenta es administradora.
    invocar<{ admin?: boolean }>('administrar-transferencias?vista=permiso')
      .then((r) => setEsAdmin(Boolean(r.admin)))
      .catch(() => setEsAdmin(false));
  }, []);

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
          <Link className="boton boton-primario" to="/contratar">
            Crear evento
          </Link>
        </div>
        {esAdmin && <p><Link to="/panel/administracion">Administración de pedidos</Link></p>}

        {error && <p className="error" role="alert">No se pudieron cargar tus eventos. Recargá la página.</p>}
        {eventos === null && <div className="cargando" aria-busy="true" />}
        {eventos?.length === 0 && !error && (
          <div className="vacio">
            <p>Todavía no tenés galerías.</p>
            <p>Tocá «Crear evento» para elegir tu galería, tu invitación o las dos. El QR queda listo apenas se confirma el pago.</p>
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

        {pedidos.length > 0 && (
          <section className="mis-pedidos">
            <h2>Mis pedidos</h2>
            <ul className="lista-pedidos">
              {pedidos.map((p) => (
                <li key={p.id}>
                  <Link to={`/panel/compra/${p.id}`} className="pedido-fila">
                    <span>
                      <strong>{p.titulo_evento}</strong>
                      <small>{ESTADO_PEDIDO[p.estado] ?? p.estado}{p.invitation_tier ? ' · con invitación' : ''}</small>
                    </span>
                    <span className="pedido-total">{dinero(p.total, p.moneda)} ↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <PieSitio compacto />
    </main>
  );
}
