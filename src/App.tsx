import { Navigate, Route, Routes } from 'react-router-dom';
import { configFaltante } from './lib/supabase';
import Inicio from './paginas/Inicio';
import Entrar from './paginas/Entrar';
import Restablecer from './paginas/Restablecer';
import MisEventos from './paginas/MisEventos';
import NuevoEvento from './paginas/NuevoEvento';
import PanelEvento from './paginas/PanelEvento';
import TriviaPanel from './paginas/TriviaPanel';
import Tarjetas from './paginas/Tarjetas';
import EventoInvitado from './paginas/EventoInvitado';
import Pantalla from './paginas/Pantalla';
import RutaAnfitrion from './componentes/RutaAnfitrion';

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
      <Route element={<RutaAnfitrion />}>
        <Route path="/panel" element={<MisEventos />} />
        <Route path="/panel/nuevo" element={<NuevoEvento />} />
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
