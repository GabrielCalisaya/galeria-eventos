import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DialogosProvider } from './componentes/Dialogos';
import './estilos.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DialogosProvider>
        <App />
      </DialogosProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
