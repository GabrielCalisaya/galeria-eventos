import { Link } from 'react-router-dom';
import { CabeceraSitio, PieSitio, WhatsappFlotante } from '../componentes/Sitio';
import { FOTOS_DEMO } from '../lib/demo';
import { formatearPrecio, INCLUYE, usePrecios, type PrecioPack } from '../lib/pagos';
import { linkWhatsappNegocio, NEGOCIO } from '../lib/negocio';
import { MUESTRAS_INVITACIONES } from '../lib/contacto';

const PRECIOS_RESPALDO: PrecioPack[] = [
  { pack: 'basico', nombre: 'Básico', descripcion: '', precio: 25000, moneda: 'ARS', limite_fotos: 1500, meses_album: 6, orden: 1 },
  { pack: 'experiencia', nombre: 'Experiencia', descripcion: '', precio: 45000, moneda: 'ARS', limite_fotos: 5000, meses_album: 12, orden: 2 },
  { pack: 'completo', nombre: 'Completo', descripcion: '', precio: 65000, moneda: 'ARS', limite_fotos: 5000, meses_album: 12, orden: 3 },
];

const PASOS = [
  { titulo: 'Creás tu evento', texto: 'Ponés los nombres, la fecha y elegís el estilo. Pagás con Mercado Pago y el QR queda listo.' },
  { titulo: 'Ponés el QR en las mesas', texto: 'Imprimís las tarjetas de mesa o compartís el link. No hay que instalar nada.' },
  { titulo: 'Los invitados suben sus fotos', texto: 'Escanean con la cámara, escriben su nombre y suben. Las ves al instante.' },
  { titulo: 'Te llevás todas', texto: 'Cuando termina la fiesta, descargás el álbum completo en un .zip.' },
];

const FUNCIONES = [
  { icono: '▦', titulo: 'Galería en tiempo real', texto: 'Cada foto aparece en el celular de todos apenas se sube. Vos moderás: ocultás o borrás lo que no querés.' },
  { icono: '✦', titulo: 'Pantalla del salón', texto: 'Un link para el proyector o el televisor: muestra las fotos nuevas a medida que llegan, con el QR para sumar más.' },
  { icono: '♡', titulo: 'Trivia en vivo', texto: 'Preguntas sobre ustedes que se responden desde el celular, con porcentajes, quiénes acertaron y ranking final.' },
  { icono: '☾', titulo: 'De tarde o de noche', texto: 'La galería se adapta al momento: clara de día o en oscuro para no encandilar en el salón.' },
  { icono: '⤓', titulo: 'Descarga completa', texto: 'Todas las fotos en buena calidad, con el nombre de quien las sacó, en un clic.' },
  { icono: '✉', titulo: 'Tarjetas de mesa', texto: 'Diseño listo para imprimir o mandar a la imprenta en PDF, con tu QR y tus colores.' },
];

const PREGUNTAS = [
  {
    p: '¿Los invitados tienen que descargar una aplicación?',
    r: 'No. Escanean el QR con la cámara del celular, escriben su nombre y ya pueden subir fotos. Funciona en cualquier celular con navegador.',
  },
  {
    p: '¿Quién puede ver las fotos?',
    r: 'Solo quienes tienen el QR o el link del evento. La galería no aparece en buscadores. Desde tu panel podés ocultar o borrar cualquier foto en el momento.',
  },
  {
    p: '¿Cuánto tiempo quedan guardadas?',
    r: 'El álbum queda online 6 meses en el pack Básico y 12 meses en Experiencia y Completo. Podés descargar todas las fotos cuando quieras.',
  },
  {
    p: '¿Qué pasa si en el salón hay mala señal?',
    r: 'Las fotos se comprimen en el celular antes de subirlas y, si se corta la conexión, se reintentan solas. Si el salón tiene wifi, conviene ponerlo en la tarjeta de mesa.',
  },
  {
    p: '¿Cómo pago?',
    r: 'Con Mercado Pago: tarjeta de crédito o débito, cuotas o dinero en cuenta. Los datos de tu tarjeta nunca pasan por nuestro sitio.',
  },
  {
    p: '¿Me puedo arrepentir de la compra?',
    r: 'Sí. Tenés 10 días corridos desde la compra para arrepentirte con el Botón de arrepentimiento, sin costo. Los detalles están en Cambios y devoluciones.',
  },
  {
    p: '¿Qué incluye la invitación digital del pack Completo?',
    r: 'Una invitación digital Estándar: una página web con los datos del evento, la ubicación y la confirmación de asistencia, en el estilo que elijas de nuestras muestras.',
  },
  {
    p: '¿Sirve para cumpleaños de 15, aniversarios o eventos de empresa?',
    r: 'Sí. Al crear el evento elegís el tipo y la portada se adapta. La trivia trae ideas de preguntas para cada caso.',
  },
  {
    p: '¿Y si tengo un problema el día del evento?',
    r: `Escribinos por WhatsApp al ${NEGOCIO.whatsapp}: atendemos todos los días, las 24 horas.`,
  },
];

export default function Inicio() {
  const precios = usePrecios();
  const lista = precios && precios.length ? precios : PRECIOS_RESPALDO;
  const muestra = FOTOS_DEMO.slice(0, 9);

  return (
    <div className="sitio">
      <CabeceraSitio />

      <main>
        {/* Portada */}
        <section className="hero">
          <div className="hero-texto">
            <p className="etiqueta">Casamientos · 15 años · Eventos · {NEGOCIO.provincia}</p>
            <h1 className="hero-titulo">
              Todas las fotos de tu fiesta, <em>en un solo lugar.</em>
            </h1>
            <p className="hero-bajada">
              Tus invitados escanean un QR y suben sus fotos desde el celular, sin descargar nada. Vos las ves en vivo, las
              proyectás en el salón y te las llevás todas al final.
            </p>
            <div className="acciones">
              <Link className="boton boton-primario boton-grande" to="/contratar">
                Crear mi galería
              </Link>
              <Link className="boton boton-grande" to="/demo">
                Ver la demo
              </Link>
            </div>
            <ul className="hero-garantias">
              <li>✓ Sin apps ni registro para los invitados</li>
              <li>✓ Pago seguro con Mercado Pago</li>
              <li>✓ Soporte por WhatsApp las 24 horas</li>
            </ul>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="telefono">
              <div className="telefono-pantalla">
                <div className="tel-portada">
                  <span className="tel-frase">Nuestra boda</span>
                  <span className="tel-nombres">
                    Sofía
                    <br />& Martín
                  </span>
                </div>
                <div className="tel-grilla">
                  {muestra.map((f) => (
                    <img key={f.id} src={f.key_thumb} alt="" loading="eager" />
                  ))}
                </div>
                <span className="tel-boton">＋ Subir fotos</span>
              </div>
            </div>
            <div className="hero-burbuja burbuja-1">
              <strong>+128</strong> fotos compartidas
            </div>
            <div className="hero-burbuja burbuja-2">
              <span>⚡</span> Abuela Rosa acertó en 2,1 s
            </div>
          </div>
        </section>

        {/* Confianza */}
        <section className="franja-confianza" aria-label="Por qué elegirnos">
          <div>
            <strong>Hecho en {NEGOCIO.provincia}</strong>
            <span>Por New Tech, con atención directa</span>
          </div>
          <div>
            <strong>Pago protegido</strong>
            <span>Cobramos con Mercado Pago</span>
          </div>
          <div>
            <strong>Fotos privadas</strong>
            <span>Solo entra quien tiene tu QR</span>
          </div>
          <div>
            <strong>Soporte 24/7</strong>
            <span>Te ayudamos el día del evento</span>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="seccion" id="como-funciona">
          <p className="etiqueta">Cómo funciona</p>
          <h2 className="seccion-titulo">Listo en minutos, sin complicaciones</h2>
          <ol className="pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="tarjeta">
                <span className="paso-numero">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Funciones */}
        <section className="seccion seccion-suave">
          <p className="etiqueta">Todo lo que incluye</p>
          <h2 className="seccion-titulo">Más que una carpeta de fotos</h2>
          <ul className="funciones">
            {FUNCIONES.map((f) => (
              <li key={f.titulo}>
                <span className="funcion-icono" aria-hidden="true">
                  {f.icono}
                </span>
                <h3>{f.titulo}</h3>
                <p>{f.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Demo */}
        <section className="seccion">
          <div className="banda-demo">
            <div className="banda-demo-fotos" aria-hidden="true">
              {FOTOS_DEMO.slice(3, 7).map((f) => (
                <img key={f.id} src={f.key_thumb} alt="" />
              ))}
            </div>
            <div className="banda-demo-texto">
              <p className="etiqueta">Probalo antes de pagar</p>
              <h2 className="seccion-titulo">Mirá cómo se ve una galería real</h2>
              <p>Abrí la demo en tu celular y en la compu: la galería de los invitados, la trivia y la pantalla del salón.</p>
              <div className="acciones">
                <Link className="boton boton-primario" to="/demo">
                  Ver la galería de ejemplo
                </Link>
                <Link className="boton" to="/demo/pantalla">
                  Ver la pantalla del salón
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Precios */}
        <section className="seccion" id="precios">
          <p className="etiqueta">Precios</p>
          <h2 className="seccion-titulo">Un solo pago por evento</h2>
          <p className="seccion-bajada">Sin suscripciones ni costos ocultos. Pagás una vez y la galería queda activa para tu evento.</p>
          <div className="precios">
            {lista.map((p) => (
              <article key={p.pack} className={p.pack === 'experiencia' ? 'tarjeta precio destacado' : 'tarjeta precio'}>
                {p.pack === 'experiencia' && <span className="pack-insignia">El más elegido</span>}
                <h3>{p.nombre}</h3>
                <p className="precio-monto">{formatearPrecio(p.precio, p.moneda)}</p>
                <p className="precio-nota">pago único por evento</p>
                <ul className="pack-incluye">
                  {INCLUYE[p.pack].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  <li>
                    Hasta {p.limite_fotos.toLocaleString('es-AR')} fotos
                  </li>
                </ul>
                {p.pack === 'completo' && (
                  <a className="precio-link" href={MUESTRAS_INVITACIONES} target="_blank" rel="noreferrer">
                    Ver muestras de invitaciones ↗
                  </a>
                )}
                <Link className={p.pack === 'experiencia' ? 'boton boton-primario' : 'boton'} to={`/contratar?pack=${p.pack}`}>
                  Elegir {p.nombre}
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* Quién está detrás */}
        <section className="seccion seccion-suave">
          <div className="quien">
            <img className="quien-foto" src={NEGOCIO.foto} alt={`${NEGOCIO.titular}, de New Tech`} width="220" height="260" loading="lazy" />
            <div>
              <p className="etiqueta">Quién está detrás</p>
              <h2 className="seccion-titulo">Hola, soy {NEGOCIO.titular.split(' ')[0]}</h2>
              <p>
                Soy {NEGOCIO.titular}, de <strong>New Tech</strong>, en {NEGOCIO.provincia}. Hago invitaciones digitales y
                herramientas para eventos y negocios. Cada galería la acompaño yo: si algo no funciona como esperás, me
                escribís y lo resolvemos.
              </p>
              <ul className="quien-datos">
                <li>CUIT {NEGOCIO.cuit}</li>
                <li>{NEGOCIO.ciudad}</li>
                <li>{NEGOCIO.horario}</li>
              </ul>
              <div className="acciones">
                <a className="boton boton-primario" href={linkWhatsappNegocio()} target="_blank" rel="noreferrer">
                  Escribime por WhatsApp
                </a>
                <a className="boton" href={NEGOCIO.instagram} target="_blank" rel="noreferrer">
                  Instagram {NEGOCIO.instagramUsuario}
                </a>
                <a className="boton" href={NEGOCIO.sitio} target="_blank" rel="noreferrer">
                  newtech.net.ar ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Preguntas */}
        <section className="seccion" id="preguntas">
          <p className="etiqueta">Preguntas frecuentes</p>
          <h2 className="seccion-titulo">Lo que más nos preguntan</h2>
          <div className="preguntas">
            {PREGUNTAS.map((q) => (
              <details key={q.p} className="pregunta">
                <summary>{q.p}</summary>
                <p>{q.r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Cierre */}
        <section className="seccion">
          <div className="cierre">
            <h2>¿Tenés fecha? Dejá todo listo hoy.</h2>
            <p>Creá tu galería en minutos o escribinos y te ayudamos a armarla.</p>
            <div className="acciones centradas">
              <Link className="boton boton-primario boton-grande" to="/contratar">
                Crear mi galería
              </Link>
              <a className="boton boton-grande boton-claro" href={linkWhatsappNegocio()} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <PieSitio />
      <WhatsappFlotante />
    </div>
  );
}
