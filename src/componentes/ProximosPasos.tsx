import { Link } from 'react-router-dom';
import { linkWhatsapp, MUESTRAS_INVITACIONES } from '../lib/contacto';
import { incluyeExtras } from '../lib/pagos';
import type { Evento } from '../lib/tipos';

/**
 * Después de pagar: qué hacer ahora. En el pack Completo queda siempre visible
 * el contacto para armar la invitación digital.
 */
export default function ProximosPasos({ evento, recienPagado }: { evento: Evento; recienPagado: boolean }) {
  const esCompleto = evento.pack === 'completo';
  if (!recienPagado && !esCompleto) return null;

  const whatsapp = linkWhatsapp(
    `Hola, tengo el pack Completo de Galería en vivo para "${evento.titulo}". Te paso los datos para la invitación digital.`,
  );

  return (
    <section className={recienPagado ? 'tarjeta proximos recien' : 'tarjeta proximos'}>
      {recienPagado && (
        <>
          <p className="proximos-ok">
            <span aria-hidden="true">🎉</span> ¡Pago confirmado! Te mandamos el detalle por email.
          </p>
          <h2>Próximos pasos</h2>
          <ol className="proximos-lista">
            <li>
              <strong>Imprimí las tarjetas de mesa</strong> o descargá el QR, acá abajo.
            </li>
            {incluyeExtras(evento.pack) && (
              <>
                <li>
                  <strong>Pasale el link de la pantalla</strong> al DJ o a quien maneje el proyector.
                </li>
                <li>
                  <strong>Cargá la trivia</strong> con preguntas sobre ustedes.{' '}
                  <Link to={`/panel/${evento.id}/trivia`}>Preparar trivia</Link>
                </li>
              </>
            )}
            {esCompleto && (
              <li>
                <strong>Escribinos por WhatsApp</strong> para armar tu invitación digital.
              </li>
            )}
          </ol>
        </>
      )}

      {esCompleto && (
        <div className="proximos-invitacion">
          <div>
            <p className="etiqueta">Invitación digital incluida</p>
            <p className="proximos-texto">
              Tu pack incluye una invitación digital Estándar. Mandanos por WhatsApp los nombres, la fecha, el lugar y el estilo
              que más te guste, y te la armamos.
            </p>
          </div>
          <div className="acciones">
            <a className="boton boton-primario" href={whatsapp} target="_blank" rel="noreferrer">
              Coordinar por WhatsApp
            </a>
            <a className="boton" href={MUESTRAS_INVITACIONES} target="_blank" rel="noreferrer">
              Ver muestras ↗
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
