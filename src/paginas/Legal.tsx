import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CabeceraSitio, PieSitio, WhatsappFlotante } from '../componentes/Sitio';
import { invocar } from '../lib/funciones';
import { linkWhatsappNegocio, NEGOCIO } from '../lib/negocio';

const ACTUALIZADO = '26 de octubre de 2026';

function PaginaLegal({ etiqueta, titulo, children }: { etiqueta: string; titulo: string; children: ReactNode }) {
  return (
    <div className="sitio">
      <CabeceraSitio />
      <main className="legal">
        <p className="etiqueta">{etiqueta}</p>
        <h1>{titulo}</h1>
        <p className="legal-fecha">Última actualización: {ACTUALIZADO}</p>
        <div className="legal-cuerpo">{children}</div>
      </main>
      <PieSitio />
      <WhatsappFlotante />
    </div>
  );
}

const Titular = () => (
  <p>
    El servicio <strong>{NEGOCIO.producto}</strong> lo presta <strong>{NEGOCIO.titular}</strong> (nombre comercial{' '}
    {NEGOCIO.nombre}), CUIT {NEGOCIO.cuit}, con domicilio en {NEGOCIO.ciudad}. Contacto:{' '}
    <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a> · WhatsApp {NEGOCIO.whatsapp}.
  </p>
);

export function Terminos() {
  return (
    <PaginaLegal etiqueta="Legales" titulo="Términos y condiciones">
      <h2>1. Quiénes somos</h2>
      <Titular />

      <h2>2. Qué es el servicio</h2>
      <p>
        {NEGOCIO.producto} es una galería web para eventos: los invitados suben fotos desde su celular escaneando un código
        QR, y el anfitrión las ve, modera y descarga. Según el pack contratado incluye pantalla del salón, trivia, tarjetas de
        mesa e invitación digital.
      </p>

      <h2>3. Contratación y pago</h2>
      <ul>
        <li>Se paga una sola vez por evento, a través de Mercado Pago. No hay suscripciones ni cobros automáticos.</li>
        <li>Los precios están expresados en pesos argentinos e incluyen todo lo detallado en cada pack.</li>
        <li>El evento se activa cuando Mercado Pago confirma el pago.</li>
        <li>
          La invitación digital del pack Completo se coordina por WhatsApp después del pago, con los datos que nos envíes.
        </li>
      </ul>

      <h2>4. Uso de la galería</h2>
      <ul>
        <li>
          El anfitrión es responsable de compartir el QR solo con sus invitados y de moderar el contenido que se publique.
        </li>
        <li>
          No está permitido subir contenido ilegal, ofensivo o que viole derechos de terceros. Podemos retirar ese contenido
          y suspender la galería si se detecta un uso indebido.
        </li>
        <li>Las fotos pertenecen a quienes las sacaron y al anfitrión del evento; no las usamos con otros fines.</li>
      </ul>

      <h2>5. Duración y límites</h2>
      <p>
        Cada pack tiene un límite de fotos y un tiempo de álbum online (6 o 12 meses según el pack). Antes de que venza te
        avisamos para que descargues todo. Vencido el plazo, las fotos se eliminan.
      </p>

      <h2>6. Disponibilidad</h2>
      <p>
        Hacemos lo posible para que el servicio funcione sin interrupciones, pero depende también de la conexión a internet
        de los invitados y del salón. Si tenés un problema durante el evento, escribinos por WhatsApp: atendemos todos los
        días, las 24 horas.
      </p>

      <h2>7. Arrepentimiento y devoluciones</h2>
      <p>
        Podés arrepentirte de la compra dentro de los 10 días corridos, según la Ley 24.240 de Defensa del Consumidor. El
        procedimiento está en <Link to="/devoluciones">Cambios y devoluciones</Link> y en el{' '}
        <Link to="/arrepentimiento">Botón de arrepentimiento</Link>.
      </p>

      <h2>8. Reclamos</h2>
      <p>
        Ante cualquier reclamo, escribinos primero a <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a>. También podés
        acudir a{' '}
        <a href={NEGOCIO.defensaConsumidor} target="_blank" rel="noreferrer">
          Defensa de las y los consumidores
        </a>
        .
      </p>
    </PaginaLegal>
  );
}

export function Privacidad() {
  return (
    <PaginaLegal etiqueta="Legales" titulo="Política de privacidad">
      <Titular />

      <h2>Qué datos usamos</h2>
      <ul>
        <li>
          <strong>Del anfitrión:</strong> nombre, email y los datos del evento (nombres, fecha, estilo). El pago lo procesa
          Mercado Pago: nosotros no vemos ni guardamos los datos de tu tarjeta.
        </li>
        <li>
          <strong>De los invitados:</strong> el nombre que escriben al entrar y las fotos que suben. No pedimos email ni
          teléfono a los invitados.
        </li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>
        Solo para prestar el servicio: mostrar la galería, identificar quién subió cada foto, permitir la descarga y
        comunicarnos con vos por el evento. No vendemos ni compartimos tus datos con fines publicitarios.
      </p>

      <h2>Quién puede ver las fotos</h2>
      <p>
        Solo quien tenga el QR o el link del evento. La galería no se publica en buscadores. El anfitrión puede ocultar o
        borrar cualquier foto en cualquier momento.
      </p>

      <h2>Dónde se guardan</h2>
      <p>
        Los datos se guardan en Supabase y las fotos en Cloudflare R2, proveedores con estándares de seguridad
        internacionales. Las fotos se eliminan al vencer el plazo del álbum o cuando el anfitrión borra el evento.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Según la Ley 25.326 de Protección de Datos Personales, podés pedir acceder, corregir o eliminar tus datos (incluidas
        las fotos que subiste) escribiendo a <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a>. La Agencia de Acceso a
        la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos relacionados con el
        incumplimiento de las normas sobre datos personales.
      </p>
    </PaginaLegal>
  );
}

export function Devoluciones() {
  return (
    <PaginaLegal etiqueta="Legales" titulo="Cambios y devoluciones">
      <h2>Arrepentimiento: 10 días corridos</h2>
      <p>
        Tenés <strong>10 días corridos desde la compra</strong> para arrepentirte, sin costo y sin dar explicaciones, como
        establece la Ley 24.240 de Defensa del Consumidor. Hacelo desde el{' '}
        <Link to="/arrepentimiento">Botón de arrepentimiento</Link>: no hace falta tener cuenta y te damos un código de
        seguimiento en el momento.
      </p>

      <h2>Cómo se devuelve</h2>
      <ul>
        <li>Devolvemos el total por el mismo medio de pago, a través de Mercado Pago.</li>
        <li>Al confirmar la devolución, la galería del evento se desactiva y su QR deja de funcionar.</li>
        <li>Los plazos de acreditación dependen de Mercado Pago y de tu tarjeta o banco.</li>
      </ul>

      <h2>Después de los 10 días</h2>
      <p>
        Si el evento se suspende o cambia de fecha, escribinos: podemos pasar la galería a la fecha nueva sin costo. Si
        necesitás cancelar, lo vemos caso por caso.
      </p>

      <h2>¿Problemas con el servicio?</h2>
      <p>
        Si algo no funcionó como esperabas, escribinos por{' '}
        <a href={linkWhatsappNegocio('Hola, tuve un problema con mi galería.')} target="_blank" rel="noreferrer">
          WhatsApp
        </a>{' '}
        o a <a href={`mailto:${NEGOCIO.email}`}>{NEGOCIO.email}</a> y lo resolvemos.
      </p>
    </PaginaLegal>
  );
}

export function Arrepentimiento() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{ codigo: string; fecha: string } | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const r = await invocar<{ codigo: string; fecha: string }>('arrepentimiento', { nombre, email, telefono, referencia, motivo });
      setResultado(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaLegal etiqueta="Defensa del consumidor" titulo="Botón de arrepentimiento">
      {resultado ? (
        <div className="tarjeta arrepentimiento-ok" role="status">
          <p className="etiqueta">Solicitud recibida</p>
          <p className="arrepentimiento-codigo">{resultado.codigo}</p>
          <p>
            Este es tu <strong>código de seguimiento</strong> ({resultado.fecha}). También te lo mandamos por email. Te vamos a
            contactar para confirmar la devolución.
          </p>
        </div>
      ) : (
        <>
          <p>
            Si compraste un pack en los últimos <strong>10 días corridos</strong>, podés arrepentirte acá. No necesitás tener
            cuenta. Al enviar el formulario te damos un código de seguimiento en el momento.
          </p>
          <form className="formulario tarjeta arrepentimiento-form" onSubmit={enviar}>
            <div className="campos-dobles">
              <label className="campo">
                <span>Nombre y apellido</span>
                <input required maxLength={120} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
              <label className="campo">
                <span>Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>
            <div className="campos-dobles">
              <label className="campo">
                <span>Teléfono (opcional)</span>
                <input type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </label>
              <label className="campo">
                <span>Evento o número de pago (opcional)</span>
                <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej.: Sofía & Martín" />
              </label>
            </div>
            <label className="campo">
              <span>Comentario (opcional)</span>
              <textarea rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="boton boton-primario boton-grande" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar arrepentimiento'}
            </button>
          </form>
        </>
      )}
      <p>
        Más información en <Link to="/devoluciones">Cambios y devoluciones</Link>.
      </p>
    </PaginaLegal>
  );
}
