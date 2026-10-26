import { Link } from 'react-router-dom';
import { Marca, PieNewTech } from '../componentes/Marca';

const PASOS = [
  { titulo: 'Creás el evento', texto: 'Nombres, fecha y color. En un minuto tenés el QR listo para imprimir.' },
  { titulo: 'Los invitados escanean', texto: 'Suben sus fotos desde el celular, sin descargar ninguna app.' },
  { titulo: 'Las ves en vivo', texto: 'En tu panel y en la pantalla del salón, con trivia de la pareja incluida.' },
  { titulo: 'Te llevás todas', texto: 'Descargás el álbum completo en un clic cuando termina la fiesta.' },
];

export default function Inicio() {
  return (
    <main className="inicio">
      <header className="inicio-barra">
        <Marca />
        <Link className="boton boton-primario" to="/entrar">
          Entrar ↗
        </Link>
      </header>

      <section className="inicio-hero">
        <div className="inicio-texto">
          <p className="etiqueta">Galería compartida para eventos</p>
          <h1 className="inicio-titulo">
            Todas las fotos de tu fiesta, <em>en un solo lugar.</em>
          </h1>
          <p className="inicio-bajada">
            Tus invitados escanean un QR y suben sus fotos al instante. Vos las ves en vivo, las proyectás en el salón y te
            las llevás todas al final.
          </p>
          <div className="acciones">
            <Link className="boton boton-primario boton-grande" to="/entrar">
              Crear mi galería ↘
            </Link>
            <a className="boton boton-grande" href="https://invitaciones.newtech.net.ar" target="_blank" rel="noreferrer">
              Ver invitaciones digitales ↗
            </a>
          </div>
          <p className="inicio-nota">✓ Sin apps · sin registro para los invitados</p>
        </div>

        <div className="inicio-muestra" aria-hidden="true">
          <div className="muestra-tarjeta">
            <span className="portada-anillos" />
            <span className="portada-sello">♡</span>
            <p className="portada-frase">Nuestra boda</p>
            <p className="muestra-nombres">
              Micaela
              <br />
              <span className="portada-y">&amp; Tomás</span>
            </p>
            <div className="muestra-fotos">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="muestra-pie">128 fotos compartidas</p>
          </div>
        </div>
      </section>

      <section className="inicio-pasos">
        <h2>Así de simple</h2>
        <ol>
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="tarjeta">
              <span className="paso-numero">{i + 1}</span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <PieNewTech />
    </main>
  );
}
