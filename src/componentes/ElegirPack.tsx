import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatearPrecio, INCLUYE, usePrecios } from '../lib/pagos';
import { invocar, irAMercadoPago } from '../lib/funciones';
import type { Evento } from '../lib/tipos';
import { useDialogos } from './Dialogos';
import { MUESTRAS_INVITACIONES } from '../lib/contacto';
import { linkWhatsappNegocio } from '../lib/negocio';
import '../paginas/compra-evento.css';

type Metodo = 'mercado_pago' | 'transferencia';

/**
 * Mejora de pack de una galería activa: se paga la diferencia con Mercado Pago o transferencia.
 * Se registra como un pedido (crear-compra con `mejora`), igual que las compras nuevas.
 */
export default function ElegirPack({ evento }: { evento: Evento }) {
  const precios = usePrecios();
  const { avisar } = useDialogos();
  const navegar = useNavigate();
  const [elegido, setElegido] = useState<Evento['pack']>('experiencia');
  const [metodo, setMetodo] = useState<Metodo>('mercado_pago');
  const [yendo, setYendo] = useState(false);

  const actual = precios?.find((p) => p.pack === evento.pack);
  const opciones = (precios ?? []).filter((p) => actual && p.orden > actual.orden);

  useEffect(() => {
    if (opciones.length && !opciones.some((p) => p.pack === elegido)) setElegido(opciones[0].pack);
  }, [opciones, elegido]);

  async function pagar() {
    setYendo(true);
    // La misma mejora repetida (doble clic, recarga) retoma el mismo pedido en el servidor.
    const clave = `mejora:${evento.id}:${elegido}:${metodo}`;
    let idempotencyKey = '';
    try { idempotencyKey = sessionStorage.getItem(clave) ?? ''; } catch { /* almacenamiento opcional */ }
    if (!idempotencyKey) idempotencyKey = crypto.randomUUID();
    try { sessionStorage.setItem(clave, idempotencyKey); } catch { /* el servidor igual evita duplicados */ }
    try {
      const data = await invocar<{ order_id: string; payment_method?: string; url?: string }>('crear-compra', {
        mejora: true,
        event_id: evento.id,
        gallery_pack: elegido,
        payment_method: metodo,
        idempotency_key: idempotencyKey,
      });
      try { sessionStorage.removeItem(clave); } catch { /* almacenamiento opcional */ }
      if (data.payment_method === 'transferencia') return navegar(`/panel/compra/${data.order_id}?pago=transferencia`);
      irAMercadoPago(data.url);
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
          con los datos del evento, ubicación y confirmación de asistencia. Después del pago completás la ficha con los datos.{' '}
          <a href={MUESTRAS_INVITACIONES} target="_blank" rel="noreferrer">
            Ver muestras de invitaciones ↗
          </a>
        </p>
      )}

      <div className="compra-metodos" role="radiogroup" aria-label="Medio de pago">
        <label className={metodo === 'mercado_pago' ? 'seleccionada' : ''}>
          <input type="radio" name={`pago-${evento.id}`} checked={metodo === 'mercado_pago'} onChange={() => setMetodo('mercado_pago')} />
          <span><strong>Mercado Pago</strong><small>Pago online seguro</small></span>
        </label>
        <label className={metodo === 'transferencia' ? 'seleccionada' : ''}>
          <input type="radio" name={`pago-${evento.id}`} checked={metodo === 'transferencia'} onChange={() => setMetodo('transferencia')} />
          <span><strong>Transferencia</strong><small>Te indicamos el alias para transferir</small></span>
        </label>
      </div>

      <div className="acciones">
        <button type="button" className="boton boton-primario boton-grande" disabled={yendo} onClick={pagar}>
          {yendo
            ? metodo === 'transferencia' ? 'Preparando el pedido…' : 'Abriendo Mercado Pago…'
            : metodo === 'transferencia'
              ? `Pagar ${formatearPrecio(montoFinal, seleccion.moneda)} por transferencia`
              : `Pagar ${formatearPrecio(montoFinal, seleccion.moneda)} con Mercado Pago`}
        </button>
      </div>
      <p className="ayuda">
        {metodo === 'transferencia'
          ? 'El pack nuevo se activa cuando confirmamos la acreditación de la transferencia.'
          : 'Te lleva a Mercado Pago para pagar de forma segura y después volvés a tu pedido.'}
      </p>
      <ul className="confianza-pago">
        <li>🔒 Mercado Pago o transferencia</li>
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
