import { Navigate, Route, Routes } from 'react-router-dom';
import { configFaltante } from './lib/supabase';
import Inicio from './paginas/Inicio';
import Entrar from './paginas/Entrar';
import Restablecer from './paginas/Restablecer';
import MisEventos from './paginas/MisEventos';
import PanelEvento from './paginas/PanelEvento';
import TriviaPanel from './paginas/TriviaPanel';
import Tarjetas from './paginas/Tarjetas';
import EventoInvitado from './paginas/EventoInvitado';
import Pantalla from './paginas/Pantalla';
import Demo, { DemoPantalla } from './paginas/Demo';
import { Arrepentimiento, Devoluciones, Privacidad, Terminos } from './paginas/Legal';
import RutaAnfitrion from './componentes/RutaAnfitrion';
import Contratar from './paginas/Contratar';
import CompraEvento from './paginas/CompraEvento';
import Administracion from './paginas/Administracion';
import AdministrarInvitaciones from './paginas/AdministrarInvitaciones';

export default function App() {
  if (configFaltante) {
    return (
      <main className="panel">
        <div className="panel-columna">
          <h1>Falta configurar la conexión</h1>
          <p>
            Definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Los pasos están en el
            README del proyecto.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/restablecer" element={<Restablecer />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/demo/pantalla" element={<DemoPantalla />} />
      <Route path="/terminos" element={<Terminos />} />
      <Route path="/privacidad" element={<Privacidad />} />
      <Route path="/devoluciones" element={<Devoluciones />} />
      <Route path="/arrepentimiento" element={<Arrepentimiento />} />
      <Route path="/contratar" element={<Contratar />} />
      <Route element={<RutaAnfitrion />}>
        <Route path="/panel" element={<MisEventos />} />
        <Route path="/panel/administracion" element={<Administracion />} />
        <Route path="/panel/administracion/transferencias" element={<Navigate to="/panel/administracion" replace />} />
        <Route path="/panel/administracion/invitaciones" element={<AdministrarInvitaciones />} />
        <Route path="/panel/compra/:id" element={<CompraEvento />} />
        {/* Las galerías nuevas se crean desde el checkout; se mantiene la ruta vieja por enlaces guardados. */}
        <Route path="/panel/nuevo" element={<Navigate to="/contratar" replace />} />
        <Route path="/panel/:id" element={<PanelEvento />} />
        <Route path="/panel/:id/trivia" element={<TriviaPanel />} />
        <Route path="/panel/:id/tarjetas" element={<Tarjetas />} />
      </Route>
      <Route path="/e/:slug" element={<EventoInvitado />} />
      <Route path="/pantalla/:token" element={<Pantalla />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
