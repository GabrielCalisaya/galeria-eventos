import { Link } from 'react-router-dom';
import { linkWhatsapp, MUESTRAS_INVITACIONES } from '../lib/contacto';
import { incluyeExtras } from '../lib/pagos';
import type { Evento } from '../lib/tipos';

type Pedido = { id: string; invitation_tier: string | null; datos_completos: boolean; estado: string };

/**
 * Después de pagar: qué hacer ahora. Si la galería viene de un pedido con invitación, lleva a su ficha;
 * si es un pack Completo del flujo anterior (sin pedido), la invitación se coordina por WhatsApp.
 */
export default function ProximosPasos({ evento, recienPagado, pedido }: { evento: Evento; recienPagado: boolean; pedido?: Pedido | null }) {
  const conFicha = Boolean(pedido?.invitation_tier);
  const fichaPendiente = conFicha && !pedido?.datos_completos && ['pagada', 'transferencia_pendiente'].includes(pedido?.estado ?? '');
  const esCompleto = evento.pack === 'completo' && !conFicha;
  if (!recienPagado && !esCompleto && !fichaPendiente) return null;

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
            {fichaPendiente && pedido && (
              <li>
                <strong>Completá la ficha de tu invitación</strong>.{' '}
                <Link to={`/panel/compra/${pedido.id}`}>Completar la ficha</Link>
              </li>
            )}
          </ol>
        </>
      )}

      {fichaPendiente && pedido && !recienPagado && (
        <div className="proximos-invitacion">
          <div>
            <p className="etiqueta">Invitación digital</p>
            <p className="proximos-texto">Falta que completes la ficha con los datos de tu invitación para que podamos prepararla.</p>
          </div>
          <div className="acciones">
            <Link className="boton boton-primario" to={`/panel/compra/${pedido.id}`}>
              Completar la ficha
            </Link>
          </div>
        </div>
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
