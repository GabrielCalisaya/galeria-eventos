import { Navigate, Route, Routes } from 'react-router-dom';
import { configFaltante } from './lib/supabase';
import Inicio from './paginas/Inicio';
import Entrar from './paginas/Entrar';
import MisEventos from './paginas/MisEventos';
import NuevoEvento from './paginas/NuevoEvento';
import PanelEvento from './paginas/PanelEvento';
import EventoInvitado from './paginas/EventoInvitado';
import RutaAnfitrion from './componentes/RutaAnfitrion';

export default function App() {
  if (configFaltante) {
    return (
      <main className="panel">
        <div className="panel-columna">
          <h1>Falta configurar la conexión</h1>
          <p>
            Definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Los pasos están en el
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
      <Route element={<RutaAnfitrion />}>
        <Route path="/panel" element={<MisEventos />} />
        <Route path="/panel/nuevo" element={<NuevoEvento />} />
        <Route path="/panel/:id" element={<PanelEvento />} />
      </Route>
      <Route path="/e/:slug" element={<EventoInvitado />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
