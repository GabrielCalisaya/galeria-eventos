import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { useFotos } from '../lib/fotos';
import { formatearFecha, linkInvitados } from '../lib/formato';
import { NOMBRES_TIPO, type Evento, type Media } from '../lib/tipos';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import Galeria from '../componentes/Galeria';

export default function PanelEvento() {
  const { id } = useParams();
  const [evento, setEvento] = useState<Evento | null | undefined>(undefined);
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const { fotos, cargando, hayMas, verMas, reemplazar } = useFotos(id, true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setEvento((data as Evento | null) ?? null));
  }, [id]);

  useEffect(() => {
    if (!evento) return;
    QRCode.toDataURL(linkInvitados(evento.slug), { width: 720, margin: 2, errorCorrectionLevel: 'M' }).then(setQr);
  }, [evento]);

  async function copiarLink() {
    if (!evento) return;
    await navigator.clipboard.writeText(linkInvitados(evento.slug));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function alternarOculta(foto: Media) {
    const nueva = { ...foto, oculta: !foto.oculta };
    reemplazar(nueva);
    const { error } = await supabase.from('media').update({ oculta: nueva.oculta }).eq('id', foto.id);
    if (error) reemplazar(foto);
  }

  if (evento === undefined) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="cargando" aria-busy="true" />
      </main>
    );
  }

  if (evento === null) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="panel-columna">
          <h1>No encontramos este evento</h1>
          <p>
            Puede que lo hayan borrado o que no tengas acceso. <Link to="/panel">Volver a mis eventos</Link>
          </p>
        </div>
      </main>
    );
  }

  const visibles = fotos.filter((f) => !f.oculta).length;

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna">
        <Link to="/panel" className="volver">
          Mis eventos
        </Link>
        <h1>{evento.titulo}</h1>
        <p className="evento-meta">
          {NOMBRES_TIPO[evento.tipo]}
          {evento.fecha ? `, ${formatearFecha(evento.fecha)}` : ''}
        </p>

        <section className="bloque-qr">
          {qr ? <img src={qr} alt="Código QR para los invitados" className="qr" /> : <div className="qr" />}
          <div className="bloque-qr-texto">
            <h2>QR para los invitados</h2>
            <p>Lo escanean con la cámara del celular y entran directo a subir fotos, sin descargar nada.</p>
            <div className="acciones">
              <a className="boton boton-primario" href={qr} download={`qr-${evento.slug}.png`}>
                Descargar QR
              </a>
              <button type="button" className="boton" onClick={copiarLink}>
                {copiado ? 'Link copiado' : 'Copiar link'}
              </button>
              <a className="boton" href={linkInvitados(evento.slug)} target="_blank" rel="noreferrer">
                Abrir como invitado
              </a>
            </div>
          </div>
        </section>

        <section>
          <div className="fila-titulo">
            <h2>Fotos</h2>
            <span className="contador">
              {visibles} {visibles === 1 ? 'visible' : 'visibles'}
              {fotos.length > visibles ? `, ${fotos.length - visibles} ocultas` : ''}
            </span>
          </div>
          {cargando && <div className="cargando" aria-busy="true" />}
          {!cargando && fotos.length === 0 && (
            <div className="vacio">
              <p>Todavía no hay fotos.</p>
              <p>Escaneá el QR con tu celular y subí una para probar: aparece acá al instante.</p>
            </div>
          )}
        </section>
      </div>

      {fotos.length > 0 && (
        <div className="panel-galeria">
          <Galeria
            fotos={fotos}
            acciones={(f) => (
              <button type="button" className="boton-ocultar" onClick={() => alternarOculta(f)}>
                {f.oculta ? 'Mostrar' : 'Ocultar'}
              </button>
            )}
          />
          {hayMas && (
            <button type="button" className="boton ver-mas" onClick={verMas}>
              Ver más fotos
            </button>
          )}
        </div>
      )}
    </main>
  );
}
