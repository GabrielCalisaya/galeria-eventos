import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { colorValido } from '../lib/colores';
import { formatearFecha, linkInvitados, separarNombres } from '../lib/formato';
import type { Evento } from '../lib/tipos';

const POR_HOJA = 4;

/** Tarjetas de mesa con el QR, listas para imprimir o guardar como PDF (4 por hoja A4). */
export default function Tarjetas() {
  const { id } = useParams();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [qr, setQr] = useState('');
  const [hojas, setHojas] = useState(1);
  const [texto, setTexto] = useState('Escaneá el código y compartí tus fotos de la noche');

  useEffect(() => {
    if (!id) return;
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const ev = data as Evento | null;
        setEvento(ev);
        if (ev) {
          QRCode.toDataURL(linkInvitados(ev.slug), {
            width: 600,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#30262B', light: '#FFFFFF' },
          }).then(setQr);
        }
      });
  }, [id]);

  if (!evento) return <main className="panel"><div className="cargando" aria-busy="true" /></main>;

  const tema = { '--acento': colorValido(evento.estilo?.color) } as CSSProperties;
  const nombres = separarNombres(evento.titulo);
  const tarjetas = Array.from({ length: hojas * POR_HOJA });

  return (
    <main className="tarjetas-pagina" style={tema}>
      <div className="tarjetas-controles no-imprimir">
        <Link to={`/panel/${evento.id}`} className="volver">
          {evento.titulo}
        </Link>
        <h1>Tarjetas de mesa</h1>
        <p>
          Cada hoja A4 trae 4 tarjetas para recortar. Al imprimir, elegí <strong>Guardar como PDF</strong> si las vas a
          mandar a una imprenta.
        </p>
        <div className="formulario tarjetas-form">
          <label className="campo">
            <span>Texto de la tarjeta</span>
            <input value={texto} maxLength={70} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <label className="campo campo-corto">
            <span>Hojas</span>
            <select value={hojas} onChange={(e) => setHojas(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} ({n * POR_HOJA} tarjetas)
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="boton boton-primario" onClick={() => window.print()} disabled={!qr}>
          Imprimir o guardar PDF
        </button>
      </div>

      <div className="hojas">
        {Array.from({ length: hojas }, (_, h) => (
          <div className="hoja" key={h}>
            {tarjetas.slice(h * POR_HOJA, (h + 1) * POR_HOJA).map((_, i) => (
              <article className="tarjeta-mesa" key={i}>
                <div className="tarjeta-mesa-marco">
                  <p className="tarjeta-mesa-ornamento" aria-hidden="true">♡</p>
                  <h2 className="tarjeta-mesa-nombres">
                    {nombres ? (
                      <>
                        {nombres[0]} <em>&amp;</em> {nombres[1]}
                      </>
                    ) : (
                      evento.titulo
                    )}
                  </h2>
                  {evento.fecha && <p className="tarjeta-mesa-fecha">{formatearFecha(evento.fecha)}</p>}
                  {qr && <img className="tarjeta-mesa-qr" src={qr} alt="" />}
                  <p className="tarjeta-mesa-texto">{texto}</p>
                  <p className="tarjeta-mesa-pie">Sin descargar nada · solo la cámara</p>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
