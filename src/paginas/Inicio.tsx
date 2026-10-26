import { Link } from 'react-router-dom';

export default function Inicio() {
  return (
    <main className="panel">
      <div className="panel-columna inicio">
        <h1 className="inicio-titulo">Todas las fotos de tu fiesta, en un solo lugar</h1>
        <p className="inicio-texto">
          Tus invitados escanean un QR y suben sus fotos desde el celular, sin descargar nada. Vos las ves al
          instante y te las llevás todas al final.
        </p>
        <Link className="boton boton-primario" to="/entrar">
          Entrar como anfitrión
        </Link>
      </div>
    </main>
  );
}
