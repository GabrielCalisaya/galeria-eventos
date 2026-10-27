import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { NEGOCIO, linkWhatsappNegocio } from '../lib/negocio';
import { Marca } from './Marca';
import { esAnonima, useSesion } from '../lib/sesion';

/** Barra superior de las páginas públicas. */
export function CabeceraSitio() {
  const [abierto, setAbierto] = useState(false);
  const sesion = useSesion();
  // Los invitados entran con sesión anónima: para la barra cuentan como sin sesión.
  const conCuenta = Boolean(sesion) && !esAnonima(sesion);
  const enlaces = [
    { a: '/#como-funciona', texto: 'Cómo funciona' },
    { a: '/demo', texto: 'Ver demo' },
    { a: '/#precios', texto: 'Precios' },
    { a: '/#preguntas', texto: 'Preguntas' },
    { a: '/#contacto', texto: 'Contacto' },
  ];
  return (
    <header className="cabecera-sitio">
      <div className="cabecera-interior">
        <Marca />
        <nav className={abierto ? 'nav-sitio abierta' : 'nav-sitio'} aria-label="Principal">
          {enlaces.map((e) =>
            e.a.startsWith('/#') ? (
              <a key={e.a} href={e.a} onClick={() => setAbierto(false)}>
                {e.texto}
              </a>
            ) : (
              <NavLink key={e.a} to={e.a} onClick={() => setAbierto(false)}>
                {e.texto}
              </NavLink>
            ),
          )}
          {sesion !== undefined &&
            (conCuenta ? (
              <Link className="boton nav-cta" to="/panel" onClick={() => setAbierto(false)}>
                Mis eventos
              </Link>
            ) : (
              <Link to="/entrar?modo=entrar" onClick={() => setAbierto(false)}>
                Entrar
              </Link>
            ))}
          <Link className="boton boton-primario nav-cta" to="/contratar" onClick={() => setAbierto(false)}>
            Crear mi galería
          </Link>
        </nav>
        <button
          type="button"
          className="nav-boton"
          aria-expanded={abierto}
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setAbierto((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}

/** Pie completo con datos del negocio, contacto, redes y links legales. */
export function PieSitio({ compacto = false, oscuro = false }: { compacto?: boolean; oscuro?: boolean }) {
  const anio = new Date().getFullYear();
  if (compacto) {
    return (
      <footer className={oscuro ? 'pie-sitio compacto oscuro' : 'pie-sitio compacto'}>
        <div className="pie-interior">
          <a href={NEGOCIO.sitio} target="_blank" rel="noreferrer" className="pie-logo">
            <img src="/logo-newtech.png" alt="New Tech" width="96" height="43" />
          </a>
          <p>
            ¿Necesitás ayuda? <a href={linkWhatsappNegocio('Hola, necesito ayuda con mi galería.')} target="_blank" rel="noreferrer">WhatsApp {NEGOCIO.whatsapp}</a> ·{' '}
            <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a>
          </p>
          <nav className="pie-legales" aria-label="Legales">
            <Link to="/terminos">Términos</Link>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/devoluciones">Devoluciones</Link>
            <Link to="/arrepentimiento" className="pie-arrepentimiento">
              Botón de arrepentimiento
            </Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="pie-sitio" id="contacto">
      <div className="pie-interior">
        <div className="pie-columnas">
          <div className="pie-marca">
            <img src="/logo-newtech-claro.png" alt="New Tech" width="140" height="63" />
            <p>
              {NEGOCIO.producto} es un servicio de {NEGOCIO.nombre}, de {NEGOCIO.provincia}. También hacemos{' '}
              <a href={NEGOCIO.invitaciones} target="_blank" rel="noreferrer">
                invitaciones digitales
              </a>{' '}
              y sistemas para negocios.
            </p>
            <div className="pie-redes">
              <a href={NEGOCIO.instagram} target="_blank" rel="noreferrer" aria-label="Instagram de New Tech">
                <IconoInstagram /> Instagram
              </a>
              <a href={NEGOCIO.facebook} target="_blank" rel="noreferrer" aria-label="Facebook de New Tech">
                <IconoFacebook /> Facebook
              </a>
            </div>
          </div>

          <div>
            <h3>Contacto</h3>
            <ul className="pie-lista">
              <li>
                <a href={linkWhatsappNegocio()} target="_blank" rel="noreferrer">
                  WhatsApp {NEGOCIO.whatsapp}
                </a>
              </li>
              <li>
                <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a>
              </li>
              <li>{NEGOCIO.ciudad}</li>
              <li>{NEGOCIO.horario}</li>
            </ul>
          </div>

          <div>
            <h3>Galería en vivo</h3>
            <ul className="pie-lista">
              <li>
                <a href="/#como-funciona">Cómo funciona</a>
              </li>
              <li>
                <Link to="/demo">Ver demo</Link>
              </li>
              <li>
                <a href="/#precios">Precios</a>
              </li>
              <li>
                <a href="/#preguntas">Preguntas frecuentes</a>
              </li>
              <li>
                <Link to="/entrar">Entrar al panel</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3>Legales</h3>
            <ul className="pie-lista">
              <li>
                <Link to="/terminos">Términos y condiciones</Link>
              </li>
              <li>
                <Link to="/privacidad">Política de privacidad</Link>
              </li>
              <li>
                <Link to="/devoluciones">Cambios y devoluciones</Link>
              </li>
              <li>
                <a href={NEGOCIO.defensaConsumidor} target="_blank" rel="noreferrer">
                  Defensa de las y los consumidores. Para reclamos ingresá aquí
                </a>
              </li>
            </ul>
            <Link to="/arrepentimiento" className="boton boton-arrepentimiento">
              Botón de arrepentimiento
            </Link>
          </div>
        </div>

        <div className="pie-base">
          <p>
            © {anio} {NEGOCIO.nombre} · {NEGOCIO.titular} · CUIT {NEGOCIO.cuit}
          </p>
          <p className="pie-pagos">
            <span aria-hidden="true">🔒</span> Pagás con Mercado Pago o por transferencia bancaria
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Botón flotante para escribir por WhatsApp. */
export function WhatsappFlotante({ texto }: { texto?: string }) {
  return (
    <a className="whatsapp-flotante" href={linkWhatsappNegocio(texto)} target="_blank" rel="noreferrer" aria-label="Escribinos por WhatsApp">
      <IconoWhatsapp />
      <span>Consultanos</span>
    </a>
  );
}

function IconoWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

function IconoInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconoFacebook() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.4 1.5-1.4h1.5V4.5a20 20 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v2.3H8.1v3h2.5V21h2.9Z" />
    </svg>
  );
}
