import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { esAnonima, useSesion } from '../lib/sesion';

/** Solo deja pasar a anfitriones con cuenta (no a sesiones anónimas de invitados). */
export default function RutaAnfitrion() {
  const sesion = useSesion();
  const location = useLocation();
  if (sesion === undefined) return <div className="cargando" aria-busy="true" />;
  if (!sesion || esAnonima(sesion)) {
    const destino = `${location.pathname}${location.search}`;
    return <Navigate to={`/entrar?modo=entrar&next=${encodeURIComponent(destino)}`} replace />;
  }
  return <Outlet />;
}
