import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { FOTOS_DEMO, urlDemo } from '../lib/demo';
import type { EstadoTrivia } from '../lib/trivia';
import Galeria from '../componentes/Galeria';
import ResultadosPregunta from '../componentes/ResultadosPregunta';
import { useDialogos } from '../componentes/Dialogos';
import { PieSitio, WhatsappFlotante } from '../componentes/Sitio';
import type { MomentoEvento } from '../lib/tipos';

const TRIVIA_DEMO: EstadoTrivia = {
  fase: 'resultado',
  numero: 3,
  total: 8,
  ahora: new Date().toISOString(),
  pregunta: { id: 'demo', texto: '¿Dónde se conocieron Sofía y Martín?', opciones: ['En la facultad', 'En el trabajo', 'Por amigos', 'En una app'] },
  correcta: 2,
  conteos: [9, 4, 23, 6],
  aciertos: [
    { nombre: 'Abuela Rosa', ms: 2100, puntos: 948 },
    { nombre: 'Caro', ms: 3400, puntos: 915 },
    { nombre: 'Nico', ms: 4800, puntos: 880 },
    { nombre: 'Juli', ms: 6200, puntos: 845 },
  ],
};

/** Galería de ejemplo, como la ve un invitado. No usa datos reales. */
export default function Demo() {
  const { avisar } = useDialogos();
  const [momento, setMomento] = useState<MomentoEvento>('noche');
  const tema = { '--acento': '#A8584F' } as CSSProperties;

  return (
    <>
      <div className="demo-barra">
        <p>
          <strong>Demo</strong> · Así ve la galería un invitado. Las fotos son ilustrativas.
        </p>
        <div className="demo-barra-acciones">
          <div className="demo-momento" role="group" aria-label="Momento del evento">
            <button type="button" aria-pressed={momento === 'tarde'} onClick={() => setMomento('tarde')}>
              ☀ Tarde
            </button>
            <button type="button" aria-pressed={momento === 'noche'} onClick={() => setMomento('noche')}>
              ☾ Noche
            </button>
          </div>
          <Link to="/demo/pantalla" className="boton">
            Ver la pantalla del salón
          </Link>
          <Link to="/entrar" className="boton boton-primario">
            Crear mi galería
          </Link>
        </div>
      </div>

      <main className={`invitado ${momento} demo`} style={tema}>
        <header className="portada compacta">
          <div className="portada-tarjeta">
            <span className="portada-anillos" aria-hidden="true" />
            <p className="portada-frase">Nuestra boda</p>
            <h1 className="portada-nombres">
              <span>Sofía</span>
              <span className="portada-y">&amp; Martín</span>
            </h1>
            <p className="portada-fecha">14 de diciembre de 2026</p>
          </div>
        </header>

        <section className="demo-trivia" aria-label="Ejemplo de trivia">
          <div className="trivia-tarjeta">
            <div className="trivia-cabecera">
              <span className="trivia-marca">♡ Trivia en vivo · ejemplo</span>
            </div>
            <div className="trivia-veredicto bien">
              <span className="veredicto-icono" aria-hidden="true">
                🎉
              </span>
              <div>
                <strong>¡Correcto!</strong>
                <span>Sumaste 915 puntos · vas 2.º</span>
              </div>
            </div>
            <p className="trivia-pregunta chica">{TRIVIA_DEMO.pregunta?.texto}</p>
            <ResultadosPregunta estado={TRIVIA_DEMO} miOpcion={2} maxAciertos={4} />
          </div>
        </section>

        <section className="galeria-invitado" aria-label="Galería">
          <p className="galeria-cuenta">{FOTOS_DEMO.length} fotos compartidas</p>
          <Galeria fotos={FOTOS_DEMO} urlDe={urlDemo} />
        </section>

        <div className="barra-inferior">
          <button type="button" className="boton-principal" onClick={() => avisar('En la demo no se suben fotos. ¡Creá tu galería para probarlo!')}>
            <span aria-hidden="true">＋</span> Subir fotos
          </button>
        </div>
      </main>
      <PieSitio />
      <WhatsappFlotante />
    </>
  );
}

/** Pantalla del salón de ejemplo: carrusel de fotos ilustrativas con el QR. */
export function DemoPantalla() {
  const [i, setI] = useState(0);
  const [qr, setQr] = useState('');
  const foto = FOTOS_DEMO[i % FOTOS_DEMO.length];

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/demo`, { width: 480, margin: 1, color: { dark: '#30262B', light: '#FFFFFF' } }).then(setQr);
    const t = setInterval(() => setI((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    new Image().src = FOTOS_DEMO[(i + 1) % FOTOS_DEMO.length].key_original;
  }, [i]);

  return (
    <main className="pantalla noche" style={{ '--acento': '#A8584F' } as CSSProperties}>
      <div className="pantalla-escena" key={foto.id}>
        <div className="pantalla-fondo" style={{ backgroundImage: `url(${foto.key_thumb})` }} aria-hidden="true" />
        <img className="pantalla-foto" src={foto.key_original} alt={`Foto de ${foto.autor_nombre}`} />
        <p className="pantalla-autor">
          <span>Foto de</span> {foto.autor_nombre}
        </p>
      </div>
      <aside className="pantalla-qr">
        {qr && <img src={qr} alt="" />}
        <div>
          <strong>Compartí tus fotos</strong>
          <span>Escaneá con la cámara del celular</span>
          <span className="pantalla-contador">{FOTOS_DEMO.length} fotos compartidas</span>
        </div>
      </aside>
      <div className="demo-etiqueta-pantalla">
        <span>Demo · fotos ilustrativas</span>
        <Link to="/demo">Volver a la demo</Link>
      </div>
    </main>
  );
}
