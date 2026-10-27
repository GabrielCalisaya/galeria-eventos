import { useEffect, useState } from 'react';
import { formatearPrecio, INCLUYE, irAPagar, usePrecios } from '../lib/pagos';
import type { Evento } from '../lib/tipos';
import { useDialogos } from './Dialogos';
import { Link } from 'react-router-dom';
import { MUESTRAS_INVITACIONES } from '../lib/contacto';
import { linkWhatsappNegocio } from '../lib/negocio';

type Props = {
  evento: Evento;
  estadoRetorno?: string | null;
};

/** Mejora de pack de una galería activa: se paga la diferencia con Mercado Pago. Las galerías nuevas usan el checkout. */
export default function ElegirPack({ evento, estadoRetorno }: Props) {
  const precios = usePrecios();
  const { avisar } = useDialogos();
  const [elegido, setElegido] = useState<Evento['pack']>('experiencia');
  const [yendo, setYendo] = useState(false);

  const actual = precios?.find((p) => p.pack === evento.pack);
  const opciones = (precios ?? []).filter((p) => actual && p.orden > actual.orden);

  useEffect(() => {
    if (opciones.length && !opciones.some((p) => p.pack === elegido)) setElegido(opciones[0].pack);
  }, [opciones, elegido]);

  async function pagar() {
    setYendo(true);
    try {
      await irAPagar(evento.id, elegido);
    } catch (e) {
      avisar((e as Error).message, 'error');
      setYendo(false);
    }
  }

  if (!precios) return <div className="cargando" aria-busy="true" />;
  if (opciones.length === 0) return null;

  const seleccion = opciones.find((p) => p.pack === elegido) ?? opciones[0];
  const montoFinal = actual ? Math.max(1, seleccion.precio - actual.precio) : seleccion.precio;

  return (
    <section className="tarjeta activar mejorar">
      <p className="etiqueta">Mejorá tu pack</p>
      <h2>Sumá la pantalla del salón y la trivia</h2>
      <p className="ayuda">Pagás solo la diferencia con tu pack actual.</p>

      {estadoRetorno === 'rechazado' && (
        <p className="aviso-falta">El pago no se completó. Podés intentarlo de nuevo con otro medio de pago.</p>
      )}
      {estadoRetorno === 'pendiente' && (
        <p className="aviso-falta">
          Mercado Pago está procesando el pago (por ejemplo, si elegiste pagar en efectivo). La galería se activa sola cuando
          se acredite.
        </p>
      )}

      <div className="packs" role="radiogroup" aria-label="Packs">
        {opciones.map((p) => {
          const monto = actual ? Math.max(1, p.precio - actual.precio) : p.precio;
          return (
            <button
              key={p.pack}
              type="button"
              role="radio"
              aria-checked={elegido === p.pack}
              className={elegido === p.pack ? 'pack elegido' : 'pack'}
              onClick={() => setElegido(p.pack)}
            >
              {p.pack === 'experiencia' && <span className="pack-insignia">El más elegido</span>}
              <span className="pack-nombre">{p.nombre}</span>
              <span className="pack-precio">
                {formatearPrecio(monto, p.moneda)}
                <small> de diferencia</small>
              </span>
              <ul className="pack-incluye">
                {INCLUYE[p.pack].map((x) => (
                  <li key={x}>{x}</li>
                ))}
                <li>
                  Hasta {p.limite_fotos.toLocaleString('es-AR')} fotos · álbum {p.meses_album} meses
                </li>
              </ul>
            </button>
          );
        })}
      </div>

      {opciones.some((p) => p.pack === 'completo') && (
        <p className="nota-invitacion">
          <span aria-hidden="true">♡</span> El pack Completo incluye una <strong>invitación digital Estándar</strong>: una web
          con los datos del evento, ubicación y confirmación de asistencia. Después del pago coordinamos los datos por WhatsApp.{' '}
          <a href={MUESTRAS_INVITACIONES} target="_blank" rel="noreferrer">
            Ver muestras de invitaciones ↗
          </a>
        </p>
      )}

      <div className="acciones">
        <button type="button" className="boton boton-primario boton-grande" disabled={yendo} onClick={pagar}>
          {yendo ? 'Abriendo Mercado Pago…' : `Pagar ${formatearPrecio(montoFinal, seleccion.moneda)} con Mercado Pago`}
        </button>
      </div>
      <p className="ayuda">Te lleva a Mercado Pago para pagar de forma segura y después volvés acá.</p>
      <ul className="confianza-pago">
        <li>🔒 Pago protegido por Mercado Pago</li>
        <li>
          <a href={linkWhatsappNegocio('Hola, tengo una consulta antes de pagar mi galería.')} target="_blank" rel="noreferrer">
            Soporte por WhatsApp 24/7
          </a>
        </li>
        <li>
          <Link to="/devoluciones">10 días para arrepentirte</Link>
        </li>
      </ul>
    </section>
  );
}
