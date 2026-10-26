import { useEffect, useState } from 'react';
import { formatearPrecio, INCLUYE, irAPagar, usePrecios } from '../lib/pagos';
import type { Evento } from '../lib/tipos';
import { useDialogos } from './Dialogos';

type Props = {
  evento: Evento;
  /** 'activar' para un evento en borrador; 'mejorar' para pasar a un pack superior. */
  modo: 'activar' | 'mejorar';
  estadoRetorno?: string | null;
};

export default function ElegirPack({ evento, modo, estadoRetorno }: Props) {
  const precios = usePrecios();
  const { avisar } = useDialogos();
  const [elegido, setElegido] = useState<Evento['pack']>(modo === 'mejorar' ? 'experiencia' : 'experiencia');
  const [yendo, setYendo] = useState(false);

  const actual = precios?.find((p) => p.pack === evento.pack);
  const opciones = (precios ?? []).filter((p) => (modo === 'mejorar' ? actual && p.orden > actual.orden : true));

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
  const montoFinal = modo === 'mejorar' && actual ? Math.max(1, seleccion.precio - actual.precio) : seleccion.precio;

  return (
    <section className={modo === 'activar' ? 'tarjeta activar' : 'tarjeta activar mejorar'}>
      {modo === 'activar' ? (
        <>
          <p className="etiqueta">Último paso</p>
          <h2>Elegí tu pack y activá la galería</h2>
          <p className="ayuda">
            El QR empieza a funcionar apenas se confirma el pago. Pagás con tarjeta, en cuotas o con dinero en Mercado Pago.
          </p>
        </>
      ) : (
        <>
          <p className="etiqueta">Mejorá tu pack</p>
          <h2>Sumá la pantalla del salón y la trivia</h2>
          <p className="ayuda">Pagás solo la diferencia con tu pack actual.</p>
        </>
      )}

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
          const monto = modo === 'mejorar' && actual ? Math.max(1, p.precio - actual.precio) : p.precio;
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
                {modo === 'mejorar' && <small> de diferencia</small>}
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

      <div className="acciones">
        <button type="button" className="boton boton-primario boton-grande" disabled={yendo} onClick={pagar}>
          {yendo ? 'Abriendo Mercado Pago…' : `Pagar ${formatearPrecio(montoFinal, seleccion.moneda)} con Mercado Pago`}
        </button>
      </div>
      <p className="ayuda">Te lleva a Mercado Pago para pagar de forma segura y después volvés acá.</p>
    </section>
  );
}
